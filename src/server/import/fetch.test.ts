import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FETCH_LIMITS,
  SafePageFetcher,
  returnPinnedAddress,
  type HttpTransport,
  type TransportResponse,
} from "@/server/import/fetch";
import {
  approveImportUrl,
  isGloballyRoutableAddress,
  validateImportUrl,
  type DnsResolver,
} from "@/server/import/url-policy";

interface PolicyCase {
  id: string;
  input: string;
  resolver?:
    | { A: string[]; AAAA: string[] }
    | Record<string, { A: string[]; AAAA: string[] }>;
  transport?: { status: number; location: string };
  expect: {
    decision: "reject" | "allow_fetch";
    stage?: string;
    code?: string;
    normalizedHost?: string;
    normalizedUrl?: string;
    connectOnlyToResolverAnswers?: boolean;
  };
}

const cases = (JSON.parse(
  readFileSync(join(process.cwd(), "test/fixtures/recipe-import/url-policy-cases.json"), "utf8"),
) as { cases: PolicyCase[] }).cases;

function resolverFor(fixture: PolicyCase): DnsResolver {
  return {
    async resolve(hostname) {
      const fixtureResolver = fixture.resolver;
      if (!fixtureResolver) throw new Error("Unexpected DNS lookup");
      const direct = fixtureResolver as { A?: unknown; AAAA?: unknown };
      if (Array.isArray(direct.A) && Array.isArray(direct.AAAA)) {
        return [...direct.A, ...direct.AAAA] as string[];
      }
      const answer = (fixtureResolver as Record<string, { A: string[]; AAAA: string[] }>)[hostname];
      if (!answer) throw new Error("No fixture answer");
      return [...answer.A, ...answer.AAAA];
    },
  };
}

function response(
  status: number,
  body = Buffer.alloc(0),
  headers: Record<string, string> = {},
): TransportResponse {
  return {
    status,
    headers,
    headerBytes: 128,
    body: (async function* () {
      yield body;
    })(),
    abort() {},
  };
}

describe("frozen URL policy cases", () => {
  for (const fixture of cases) {
    it(fixture.id, async () => {
      const resolver = resolverFor(fixture);
      if (fixture.expect.decision === "allow_fetch") {
        const approved = await approveImportUrl(fixture.input, resolver);
        expect(approved.normalizedUrl).toBe(fixture.expect.normalizedUrl);
        expect(approved.addresses).toEqual([
          "93.184.216.34",
          "2606:2800:220:1:248:1893:25c8:1946",
        ]);
        return;
      }

      let action: Promise<unknown>;
      if (fixture.transport) {
        const transport: HttpTransport = {
          async request() {
            return response(fixture.transport!.status, Buffer.alloc(0), {
              location: fixture.transport!.location,
            });
          },
        };
        action = new SafePageFetcher({ resolver, transport, sleep: async () => {} }).fetch(
          fixture.input,
        );
      } else {
        action = approveImportUrl(fixture.input, resolver);
      }
      await expect(action).rejects.toMatchObject({
        failure: { code: fixture.expect.code, stage: fixture.expect.stage },
      });
      if (fixture.expect.normalizedHost) {
        expect(validateImportUrl(fixture.input).hostname).toBe(fixture.expect.normalizedHost);
      }
    });
  }
});

describe("bounded safe fetch", () => {
  const publicResolver: DnsResolver = {
    async resolve() {
      return ["93.184.216.34"];
    },
  };

  it("stops a compressed body at the wire limit", async () => {
    const transport: HttpTransport = {
      async request() {
        return response(
          200,
          Buffer.alloc(FETCH_LIMITS.wireBytes + 1),
          { "content-type": "text/html" },
        );
      },
    };
    await expect(
      new SafePageFetcher({ resolver: publicResolver, transport }).fetch(
        "https://public.example.test/recipe",
      ),
    ).rejects.toMatchObject({ failure: { code: "BODY_TOO_LARGE", retryable: false } });
  });

  it("rejects oversized response headers before reading the body", async () => {
    let iterated = false;
    const transport: HttpTransport = {
      async request() {
        return {
          ...response(200, Buffer.from("<html></html>"), { "content-type": "text/html" }),
          headerBytes: FETCH_LIMITS.headerBytes + 1,
          body: (async function* () {
            iterated = true;
            yield Buffer.from("<html></html>");
          })(),
        };
      },
    };
    await expect(
      new SafePageFetcher({ resolver: publicResolver, transport }).fetch(
        "https://public.example.test/recipe",
      ),
    ).rejects.toMatchObject({ failure: { code: "HEADERS_TOO_LARGE", retryable: false } });
    expect(iterated).toBe(false);
  });

  it("stops a decompression bomb at the decoded limit", async () => {
    const compressed = gzipSync(Buffer.alloc(FETCH_LIMITS.decodedBytes + 1, 65));
    expect(compressed.byteLength).toBeLessThan(FETCH_LIMITS.wireBytes);
    const transport: HttpTransport = {
      async request() {
        return response(200, compressed, {
          "content-type": "text/html; charset=utf-8",
          "content-encoding": "gzip",
        });
      },
    };
    await expect(
      new SafePageFetcher({ resolver: publicResolver, transport }).fetch(
        "https://public.example.test/recipe",
      ),
    ).rejects.toMatchObject({ failure: { code: "BODY_TOO_LARGE", retryable: false } });
  });

  it("re-resolves and retries retryable upstream failures exactly three times", async () => {
    let requests = 0;
    let resolutions = 0;
    const resolver: DnsResolver = {
      async resolve() {
        resolutions += 1;
        return ["93.184.216.34"];
      },
    };
    const transport: HttpTransport = {
      async request() {
        requests += 1;
        return response(503);
      },
    };
    const action = new SafePageFetcher({ resolver, transport, sleep: async () => {}, random: () => 0 }).fetch(
      "https://public.example.test/recipe",
    );
    await expect(action).rejects.toMatchObject({
      attemptCount: 3,
      failure: { code: "FETCH_UPSTREAM_ERROR", stage: "fetch", retryable: true },
    });
    expect(requests).toBe(3);
    expect(resolutions).toBe(3);
  });

  it("honors Retry-After up to the bounded retry window", async () => {
    let requests = 0;
    const sleeps: number[] = [];
    const transport: HttpTransport = {
      async request() {
        requests += 1;
        return requests === 1
          ? response(429, Buffer.alloc(0), { "retry-after": "2" })
          : response(200, Buffer.from("<html></html>"), { "content-type": "text/html" });
      },
    };
    await new SafePageFetcher({
      resolver: publicResolver,
      transport,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    }).fetch("https://public.example.test/recipe");
    expect(sleeps).toEqual([2_000]);
  });

  it("classifies transport timeouts as retryable and stops after three attempts", async () => {
    let requests = 0;
    const transport: HttpTransport = {
      async request() {
        requests += 1;
        throw Object.assign(new Error("fixture timeout"), { code: "IMPORT_TIMEOUT" });
      },
    };
    await expect(
      new SafePageFetcher({
        resolver: publicResolver,
        transport,
        sleep: async () => {},
      }).fetch("https://public.example.test/recipe"),
    ).rejects.toMatchObject({
      attemptCount: 3,
      failure: { code: "FETCH_TIMEOUT", stage: "fetch", retryable: true },
    });
    expect(requests).toBe(3);
  });

  it("uses only an approved resolver address while retaining the source hostname", async () => {
    const seen: { address: string; hostname: string }[] = [];
    const transport: HttpTransport = {
      async request(request) {
        seen.push({ address: request.address, hostname: request.approved.hostname });
        return response(200, Buffer.from("<html></html>"), { "content-type": "text/html" });
      },
    };
    await new SafePageFetcher({ resolver: publicResolver, transport }).fetch(
      "https://public.example.test/recipe",
    );
    expect(seen).toEqual([{ address: "93.184.216.34", hostname: "public.example.test" }]);
  });

  it("enforces declared charset support and reports replacement decoding", async () => {
    const unsupported: HttpTransport = {
      async request() {
        return response(200, Buffer.from("<html></html>"), {
          "content-type": "text/html; charset=shift_jis",
        });
      },
    };
    await expect(
      new SafePageFetcher({ resolver: publicResolver, transport: unsupported }).fetch(
        "https://public.example.test/recipe",
      ),
    ).rejects.toMatchObject({ failure: { code: "CHARSET_UNSUPPORTED", stage: "decode" } });

    const replacement: HttpTransport = {
      async request() {
        return response(200, Buffer.from([0xc3, 0x28]), {
          "content-type": "text/html; charset=utf-8",
        });
      },
    };
    await expect(
      new SafePageFetcher({ resolver: publicResolver, transport: replacement }).fetch(
        "https://public.example.test/recipe",
      ),
    ).resolves.toMatchObject({ charsetReplacement: true });
  });

  it("classifies unsupported content types without reading the body", async () => {
    let iterated = false;
    const transport: HttpTransport = {
      async request() {
        return {
          ...response(200, Buffer.from("not html"), { "content-type": "application/json" }),
          body: (async function* () {
            iterated = true;
            yield Buffer.from("not html");
          })(),
        };
      },
    };
    const action = new SafePageFetcher({ resolver: publicResolver, transport }).fetch(
      "https://public.example.test/recipe",
    );
    await expect(action).rejects.toMatchObject({ failure: { code: "CONTENT_TYPE_UNSUPPORTED" } });
    expect(iterated).toBe(false);
  });
});

describe("pinned Node lookup", () => {
  it("returns an address array when Node 24 requests lookup with all=true", () => {
    let result: string | { address: string; family: number }[] | undefined;
    let resultFamily: number | undefined;

    returnPinnedAddress(
      "93.184.216.34",
      4,
      { all: true },
      (error, address, family) => {
        expect(error).toBeNull();
        result = address;
        resultFamily = family;
      },
    );

    expect(result).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(resultFamily).toBeUndefined();
  });
});

describe("current special-purpose address registries", () => {
  it.each([
    "192.0.0.9",
    "192.31.196.1",
    "192.52.193.1",
    "192.175.48.1",
    "64:ff9b::1",
    "100:0:0:1::1",
    "2001:1::1",
    "2620:4f:8000::1",
    "5f00::1",
    "::7f00:1",
    "fec0::1",
  ])("blocks special-purpose address %s", (address) => {
    expect(isGloballyRoutableAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows ordinary global address %s",
    (address) => {
      expect(isGloballyRoutableAddress(address)).toBe(true);
    },
  );
});
