import { promises as dns } from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { ImportPipelineError, sha256 } from "@/domain/import/types";
import {
  approveImportUrl,
  validateImportUrl,
  type ApprovedUrl,
  type DnsResolver,
} from "@/server/import/url-policy";

export const FETCH_LIMITS = {
  redirects: 5,
  connectTimeoutMs: 5_000,
  inactivityTimeoutMs: 5_000,
  totalTimeoutMs: 15_000,
  headerBytes: 64 * 1024,
  wireBytes: 2 * 1024 * 1024,
  decodedBytes: 5 * 1024 * 1024,
} as const;

export interface TransportRequest {
  approved: ApprovedUrl;
  address: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  headerBytes: number;
  body: AsyncIterable<Uint8Array>;
  abort(): void;
}

export interface HttpTransport {
  request(request: TransportRequest): Promise<TransportResponse>;
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  redirectCount: number;
  responseMediaType: "text/html" | "application/xhtml+xml";
  fetchedAt: string;
  contentSha256: string;
  html: string;
  charsetReplacement: boolean;
  attemptCount: number;
}

export class SystemDnsResolver implements DnsResolver {
  async resolve(hostname: string): Promise<string[]> {
    const [ipv4, ipv6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);
    const addresses = [
      ...(ipv4.status === "fulfilled" ? ipv4.value : []),
      ...(ipv6.status === "fulfilled" ? ipv6.value : []),
    ];
    if (addresses.length === 0) throw new Error("No DNS answers.");
    return addresses;
  }
}

function rawHeaderBytes(rawHeaders: string[]): number {
  let total = 2;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    total += Buffer.byteLength(rawHeaders[index] ?? "", "latin1");
    total += Buffer.byteLength(rawHeaders[index + 1] ?? "", "latin1") + 4;
  }
  return total;
}

export class PinnedNodeTransport implements HttpTransport {
  request(input: TransportRequest): Promise<TransportResponse> {
    return new Promise((resolve, reject) => {
      const client = input.approved.url.protocol === "https:" ? https : http;
      const family = isIP(input.address);
      const request = client.request(input.approved.url, {
        method: "GET",
        headers: input.headers,
        signal: input.signal,
        agent: false,
        maxHeaderSize: FETCH_LIMITS.headerBytes,
        servername: input.approved.hostname,
        lookup: (_hostname, options, callback) => {
          returnPinnedAddress(input.address, family, options, callback);
        },
      });

      const connectTimer = setTimeout(() => {
        request.destroy(Object.assign(new Error("Connect timeout"), { code: "IMPORT_TIMEOUT" }));
      }, FETCH_LIMITS.connectTimeoutMs);
      request.once("socket", (socket) => {
        const connected = () => clearTimeout(connectTimer);
        socket.once(input.approved.url.protocol === "https:" ? "secureConnect" : "connect", connected);
      });
      request.setTimeout(FETCH_LIMITS.inactivityTimeoutMs, () => {
        request.destroy(Object.assign(new Error("Inactivity timeout"), { code: "IMPORT_TIMEOUT" }));
      });
      request.once("error", (error) => {
        clearTimeout(connectTimer);
        reject(error);
      });
      request.once("response", (response) => {
        clearTimeout(connectTimer);
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
        }
        resolve({
          status: response.statusCode ?? 0,
          headers,
          headerBytes: rawHeaderBytes(response.rawHeaders),
          body: response,
          abort: () => response.destroy(),
        });
      });
      request.end();
    });
  }
}

export function returnPinnedAddress(
  address: string,
  family: number,
  options: LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    result: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  if (options.all) {
    callback(null, [{ address, family }]);
    return;
  }
  callback(null, address, family);
}

function parseMediaType(contentType: string | undefined): {
  mediaType: FetchedPage["responseMediaType"];
  charset: string | null;
} {
  if (!contentType) {
    throw new ImportPipelineError("CONTENT_TYPE_UNSUPPORTED", "decode", false);
  }
  const [rawMediaType, ...parameters] = contentType.split(";");
  const mediaType = rawMediaType?.trim().toLowerCase();
  if (mediaType !== "text/html" && mediaType !== "application/xhtml+xml") {
    throw new ImportPipelineError("CONTENT_TYPE_UNSUPPORTED", "decode", false);
  }
  let charset: string | null = null;
  for (const parameter of parameters) {
    const match = /^\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))\s*$/i.exec(parameter);
    if (match) charset = (match[1] ?? match[2] ?? match[3] ?? "").toLowerCase();
  }
  return { mediaType, charset };
}

const charsetAliases: Record<string, string> = {
  "utf-8": "utf-8",
  utf8: "utf-8",
  "utf-16": "utf-16le",
  "utf-16le": "utf-16le",
  "utf-16be": "utf-16be",
  "windows-1252": "windows-1252",
  cp1252: "windows-1252",
  "iso-8859-1": "windows-1252",
  latin1: "windows-1252",
};

function sniffHtmlCharset(bytes: Uint8Array): string {
  const prefix = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  const direct = /<meta\s+[^>]*charset\s*=\s*["']?\s*([^\s"'/>]+)/i.exec(prefix)?.[1];
  const pragma = /<meta\s+[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';>]+)/i.exec(prefix)?.[1];
  return (direct ?? pragma ?? "utf-8").toLowerCase();
}

function decodeBody(bytes: Uint8Array, declaredCharset: string | null): {
  html: string;
  replacement: boolean;
} {
  const requested = declaredCharset ?? sniffHtmlCharset(bytes);
  const charset = charsetAliases[requested];
  if (!charset) throw new ImportPipelineError("CHARSET_UNSUPPORTED", "decode", false);
  let html: string;
  try {
    html = new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    throw new ImportPipelineError("CHARSET_UNSUPPORTED", "decode", false);
  }
  return { html, replacement: html.includes("\ufffd") };
}

async function collectWireBody(response: TransportResponse): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > FETCH_LIMITS.wireBytes) {
        response.abort();
        throw new ImportPipelineError("BODY_TOO_LARGE", "fetch", false);
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof ImportPipelineError) throw error;
    if ((error as NodeJS.ErrnoException).code === "IMPORT_TIMEOUT") {
      throw new ImportPipelineError("FETCH_TIMEOUT", "fetch", true);
    }
    throw new ImportPipelineError("FETCH_UPSTREAM_ERROR", "fetch", true);
  }
  return Buffer.concat(chunks, size);
}

function decompress(wireBody: Buffer, encodingHeader: string | undefined): Buffer {
  const encoding = (encodingHeader ?? "identity").trim().toLowerCase();
  if (!new Set(["identity", "gzip", "br"]).has(encoding)) {
    throw new ImportPipelineError("CONTENT_ENCODING_UNSUPPORTED", "decode", false);
  }
  try {
    const decoded =
      encoding === "gzip"
        ? gunzipSync(wireBody, { maxOutputLength: FETCH_LIMITS.decodedBytes })
        : encoding === "br"
          ? brotliDecompressSync(wireBody, { maxOutputLength: FETCH_LIMITS.decodedBytes })
          : wireBody;
    if (decoded.byteLength > FETCH_LIMITS.decodedBytes) {
      throw new ImportPipelineError("BODY_TOO_LARGE", "fetch", false);
    }
    return decoded;
  } catch (error) {
    if (error instanceof ImportPipelineError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
      throw new ImportPipelineError("BODY_TOO_LARGE", "fetch", false);
    }
    throw new ImportPipelineError("CONTENT_ENCODING_UNSUPPORTED", "decode", false);
  }
}

class RetryableStatusError extends ImportPipelineError {
  constructor(
    code: "FETCH_RATE_LIMITED" | "FETCH_UPSTREAM_ERROR",
    readonly retryAfterMs: number | null,
  ) {
    super(code, "fetch", true);
  }
}

function retryAfterMilliseconds(value: string | undefined, now: number): number | null {
  if (!value) return null;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) * 1_000 : null;
  const parsed = seconds ?? Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const delay = seconds ?? Math.max(0, parsed - now);
  return Math.min(60_000, delay);
}

function retryableStatusError(
  status: number,
  retryAfter: string | undefined,
  now: number,
): ImportPipelineError | null {
  const delay = retryAfterMilliseconds(retryAfter, now);
  if (status === 429) return new RetryableStatusError("FETCH_RATE_LIMITED", delay);
  if (status === 408 || status === 425 || status >= 500) {
    return new RetryableStatusError("FETCH_UPSTREAM_ERROR", delay);
  }
  if (status >= 400 && status < 500) {
    return new ImportPipelineError("FETCH_CLIENT_ERROR", "fetch", false);
  }
  return null;
}

function redirectTarget(current: URL, location: string): URL {
  let resolved: URL;
  try {
    resolved = new URL(location, current);
  } catch {
    throw new ImportPipelineError("URL_INVALID", "redirect", false);
  }
  const validated = validateImportUrl(resolved.href);
  if (current.protocol === "https:" && validated.protocol === "http:") {
    throw new ImportPipelineError("INSECURE_REDIRECT", "redirect", false);
  }
  return validated;
}

export interface SafeFetchOptions {
  resolver?: DnsResolver;
  transport?: HttpTransport;
  now?: () => number;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export class SafePageFetcher {
  private readonly resolver: DnsResolver;
  private readonly transport: HttpTransport;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  private readonly random: () => number;

  constructor(options: SafeFetchOptions = {}) {
    this.resolver = options.resolver ?? new SystemDnsResolver();
    this.transport = options.transport ?? new PinnedNodeTransport();
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  async fetch(requestedUrl: string, cancellation?: AbortSignal): Promise<FetchedPage> {
    const startedAt = this.now();
    let lastError: ImportPipelineError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let retryAfterMs: number | null;
      const remaining = FETCH_LIMITS.totalTimeoutMs - (this.now() - startedAt);
      if (remaining <= 0) throw new ImportPipelineError("FETCH_TIMEOUT", "fetch", true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("Total timeout")), remaining);
      const cancel = () => controller.abort(cancellation?.reason);
      cancellation?.addEventListener("abort", cancel, { once: true });
      try {
        const page = await this.fetchAttempt(requestedUrl, controller.signal);
        return { ...page, attemptCount: attempt + 1 };
      } catch (error) {
        if (cancellation?.aborted) throw cancellation.reason;
        lastError =
          error instanceof ImportPipelineError
            ? error
            : new ImportPipelineError("FETCH_UPSTREAM_ERROR", "fetch", true);
        retryAfterMs = error instanceof RetryableStatusError ? error.retryAfterMs : null;
        lastError.attemptCount = attempt + 1;
        if (!lastError.failure.retryable || attempt === 2) throw lastError;
      } finally {
        clearTimeout(timeout);
        cancellation?.removeEventListener("abort", cancel);
      }
      const backoff = retryAfterMs ?? Math.min(2_000, 200 * 2 ** attempt + Math.floor(this.random() * 100));
      const remainingAfterAttempt = FETCH_LIMITS.totalTimeoutMs - (this.now() - startedAt);
      if (remainingAfterAttempt <= 0) throw new ImportPipelineError("FETCH_TIMEOUT", "fetch", true);
      await this.sleep(
        Math.min(backoff, remainingAfterAttempt),
        cancellation ?? new AbortController().signal,
      );
    }
    throw lastError ?? new ImportPipelineError("IMPORT_INTERNAL_ERROR", "any", true);
  }

  private async fetchAttempt(
    requestedUrl: string,
    signal: AbortSignal,
  ): Promise<Omit<FetchedPage, "attemptCount">> {
    let approved = await approveImportUrl(requestedUrl, this.resolver);
    let redirectCount = 0;
    for (;;) {
      let response: TransportResponse;
      try {
        response = await this.transport.request({
          approved,
          address: approved.addresses[0]!,
          headers: {
            Accept: "text/html, application/xhtml+xml",
            "User-Agent": "RecipeAppImporter/1.0 (+public recipe review)",
          },
          signal,
        });
      } catch (error) {
        if (signal.aborted || (error as NodeJS.ErrnoException).code === "IMPORT_TIMEOUT") {
          throw new ImportPipelineError("FETCH_TIMEOUT", "fetch", true);
        }
        if ((error as NodeJS.ErrnoException).code === "HPE_HEADER_OVERFLOW") {
          throw new ImportPipelineError("HEADERS_TOO_LARGE", "fetch", false);
        }
        throw new ImportPipelineError("FETCH_UPSTREAM_ERROR", "fetch", true);
      }
      if (response.headerBytes > FETCH_LIMITS.headerBytes) {
        response.abort();
        throw new ImportPipelineError("HEADERS_TOO_LARGE", "fetch", false);
      }

      if (response.status >= 300 && response.status < 400) {
        response.abort();
        const location = response.headers.location;
        if (!location) throw new ImportPipelineError("FETCH_CLIENT_ERROR", "fetch", false);
        if (redirectCount >= FETCH_LIMITS.redirects) {
          throw new ImportPipelineError("REDIRECT_LIMIT", "redirect", false);
        }
        const target = redirectTarget(approved.url, location);
        try {
          approved = await approveImportUrl(target.href, this.resolver);
        } catch (error) {
          if (
            error instanceof ImportPipelineError &&
            (error.failure.code === "ADDRESS_FORBIDDEN" ||
              error.failure.code === "DNS_MIXED_ADDRESS_SPACE")
          ) {
            throw new ImportPipelineError("SSRF_BLOCKED_REDIRECT", "redirect", false);
          }
          throw error;
        }
        redirectCount += 1;
        continue;
      }

      const statusFailure = retryableStatusError(
        response.status,
        response.headers["retry-after"],
        this.now(),
      );
      if (statusFailure) {
        response.abort();
        throw statusFailure;
      }
      if (response.status < 200 || response.status >= 300) {
        response.abort();
        throw new ImportPipelineError("FETCH_CLIENT_ERROR", "fetch", false);
      }

      const { mediaType, charset } = parseMediaType(response.headers["content-type"]);
      const wireBody = await collectWireBody(response);
      const decodedBytes = decompress(wireBody, response.headers["content-encoding"]);
      const decoded = decodeBody(decodedBytes, charset);
      return {
        requestedUrl,
        finalUrl: approved.normalizedUrl,
        redirectCount,
        responseMediaType: mediaType,
        fetchedAt: new Date(this.now()).toISOString(),
        contentSha256: sha256(decodedBytes),
        html: decoded.html,
        charsetReplacement: decoded.replacement,
      };
    }
  }
}
