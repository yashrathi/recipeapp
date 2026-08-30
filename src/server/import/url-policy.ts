import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { ImportPipelineError } from "@/domain/import/types";

export interface DnsResolver {
  resolve(hostname: string): Promise<string[]>;
}

export interface ApprovedUrl {
  url: URL;
  normalizedUrl: string;
  hostname: string;
  addresses: string[];
}

function ipv4Number(address: string): bigint | null {
  const pieces = address.split(".");
  if (pieces.length !== 4) return null;
  let value = 0n;
  for (const piece of pieces) {
    if (!/^\d{1,3}$/.test(piece)) return null;
    const octet = Number(piece);
    if (octet > 255) return null;
    value = value * 256n + BigInt(octet);
  }
  return value;
}

function ipv6Number(address: string): bigint | null {
  let input = address.toLowerCase();
  if (input.startsWith("[") && input.endsWith("]")) input = input.slice(1, -1);
  if (input.includes("%")) return null;

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const pieces = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (pieces.length !== 8 || pieces.some((piece) => !/^[a-f0-9]{1,4}$/.test(piece))) return null;
  return pieces.reduce((value, piece) => value * 65536n + BigInt(`0x${piece}`), 0n);
}

function inCidr(value: bigint, base: bigint, bits: number, width: number): boolean {
  const shift = BigInt(width - bits);
  return value >> shift === base >> shift;
}

const blockedIpv4Cidrs = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) return false;
  if (blockedIpv4Cidrs.some(([base, bits]) => inCidr(value, ipv4Number(base)!, bits, 32))) {
    return false;
  }

  return true;
}

const blockedIpv6Cidrs = [
  ["::", 96],
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["100:0:0:1::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const;

function isPublicIpv6(address: string): boolean {
  const value = ipv6Number(address);
  if (value === null) return false;
  if (value >> 32n === 0xffffn) {
    const embedded = value & 0xffff_ffffn;
    const dotted = [24n, 16n, 8n, 0n]
      .map((shift) => Number((embedded >> shift) & 255n))
      .join(".");
    return isPublicIpv4(dotted);
  }
  return !blockedIpv6Cidrs.some(([base, bits]) =>
    inCidr(value, ipv6Number(base)!, bits, 128),
  );
}

export function isGloballyRoutableAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, ""));
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function validateImportUrl(input: string): URL {
  const hasControlCharacter = Array.from(input).some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 31 || code === 127;
  });
  if (!input || input !== input.trim() || hasControlCharacter) {
    throw new ImportPipelineError("URL_INVALID", "validate_url", false);
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ImportPipelineError("URL_INVALID", "validate_url", false);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImportPipelineError("SCHEME_UNSUPPORTED", "validate_url", false);
  }
  if (/^https?:\/\/\//i.test(input)) {
    throw new ImportPipelineError("URL_INVALID", "validate_url", false);
  }
  if (url.username || url.password) {
    throw new ImportPipelineError("URL_CREDENTIALS_FORBIDDEN", "validate_url", false);
  }
  if (!url.hostname) throw new ImportPipelineError("URL_INVALID", "validate_url", false);
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) {
    throw new ImportPipelineError("PORT_FORBIDDEN", "validate_url", false);
  }

  const bracketless = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(bracketless);
  if (family === 0) {
    const asciiHost = domainToASCII(url.hostname);
    if (!asciiHost) throw new ImportPipelineError("HOST_FORBIDDEN", "validate_url", false);
    url.hostname = asciiHost.toLowerCase();
    const host = url.hostname;
    if (
      !host.includes(".") ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      [".local", ".internal", ".home", ".lan", ".onion"].some((suffix) =>
        host.endsWith(suffix),
      )
    ) {
      throw new ImportPipelineError("HOST_FORBIDDEN", "validate_url", false);
    }
  }

  url.hash = "";
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  return url;
}

export async function approveImportUrl(input: string, resolver: DnsResolver): Promise<ApprovedUrl> {
  const url = validateImportUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = [...new Set(await resolver.resolve(hostname))];
    } catch {
      throw new ImportPipelineError("DNS_FAILED", "resolve", true);
    }
  }
  if (addresses.length === 0 || addresses.some((address) => isIP(address) === 0)) {
    throw new ImportPipelineError("DNS_FAILED", "resolve", true);
  }
  const decisions = addresses.map(isGloballyRoutableAddress);
  if (decisions.every(Boolean)) {
    return { url, normalizedUrl: url.href, hostname, addresses };
  }
  if (decisions.some(Boolean)) {
    throw new ImportPipelineError("DNS_MIXED_ADDRESS_SPACE", "resolve", false);
  }
  throw new ImportPipelineError("ADDRESS_FORBIDDEN", "resolve", false);
}
