import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FIRECRAWL_LIMITS,
  FirecrawlPageFetcher,
} from "@/server/import/firecrawl";
import type { DnsResolver } from "@/server/import/url-policy";

const publicResolver: DnsResolver = {
  async resolve() {
    return ["93.184.216.34"];
  },
};

const fixtureHtml = readFileSync(
  join(process.cwd(), "test/fixtures/recipe-import/success-basic.html"),
  "utf8",
);

function firecrawlResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, { status });
}

describe("Firecrawl scrape adapter", () => {
  it("requests raw HTML and markdown without provider retention or caching", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = new FirecrawlPageFetcher({
      apiKey: "fixture-key",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: publicResolver,
      transport: async (url, init) => {
        requestUrl = String(url);
        requestInit = init;
        return firecrawlResponse({
          success: true,
          data: {
            rawHtml: fixtureHtml,
            markdown: "# Green Pan Supper",
            metadata: {
              sourceURL: "https://pinchofyum.com/fixture-recipe",
              title: "Green Pan Supper",
              language: "en",
            },
          },
        });
      },
      now: () => Date.parse("2026-08-30T10:00:00.000Z"),
    });

    const result = await fetcher.fetch("https://pinchofyum.com/fixture-recipe");

    expect(requestUrl).toBe("https://api.firecrawl.test/v2/scrape");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer fixture-key",
      "Content-Type": "application/json",
    });
    expect(requestInit?.cache).toBe("no-store");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      url: "https://pinchofyum.com/fixture-recipe",
      formats: ["rawHtml", "markdown"],
      onlyMainContent: true,
      zeroDataRetention: true,
      storeInCache: false,
    });
    expect(result).toMatchObject({
      finalUrl: "https://pinchofyum.com/fixture-recipe",
      html: fixtureHtml,
      markdown: "# Green Pan Supper",
      metadata: {
        sourceUrl: "https://pinchofyum.com/fixture-recipe",
        title: "Green Pan Supper",
        language: "en",
      },
    });
  });

  it("fails safely when the provider is not configured", async () => {
    const fetcher = new FirecrawlPageFetcher({
      apiKey: "",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: publicResolver,
      transport: async () => {
        throw new Error("transport must not be called");
      },
    });

    await expect(fetcher.fetch("https://pinchofyum.com/fixture-recipe")).rejects.toMatchObject({
      failure: {
        code: "FIRECRAWL_NOT_CONFIGURED",
        retryable: false,
      },
    });
  });

  it.each([
    [401, "FIRECRAWL_AUTH_FAILED", false],
    [429, "FIRECRAWL_RATE_LIMITED", true],
    [503, "FIRECRAWL_UNAVAILABLE", true],
  ] as const)("maps provider status %s to %s", async (status, code, retryable) => {
    const fetcher = new FirecrawlPageFetcher({
      apiKey: "fixture-key",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: publicResolver,
      transport: async () => firecrawlResponse({ success: false, error: "private upstream detail" }, status),
    });

    await expect(fetcher.fetch("https://pinchofyum.com/fixture-recipe")).rejects.toMatchObject({
      failure: { code, retryable },
    });
  });

  it("maps an Allrecipes-like unsupported response to manual-entry recovery", async () => {
    const fetcher = new FirecrawlPageFetcher({
      apiKey: "fixture-key",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: publicResolver,
      transport: async () => firecrawlResponse({
        success: false,
        error: "Scraping this website is not supported",
      }, 400),
    });

    await expect(fetcher.fetch("https://www.allrecipes.com/fixture-recipe")).rejects.toMatchObject({
      failure: {
        code: "FIRECRAWL_UNSUPPORTED_SOURCE",
        retryable: false,
        message: "This source does not permit automatic import. Enter the recipe manually.",
      },
    });
  });

  it("rejects an unsafe provider-reported final URL", async () => {
    const fetcher = new FirecrawlPageFetcher({
      apiKey: "fixture-key",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: publicResolver,
      transport: async () => firecrawlResponse({
        success: true,
        data: {
          rawHtml: fixtureHtml,
          markdown: "# Fixture",
          metadata: { sourceURL: "http://127.0.0.1/private" },
        },
      }),
    });

    await expect(fetcher.fetch("https://pinchofyum.com/fixture-recipe")).rejects.toMatchObject({
      failure: { code: "FIRECRAWL_RESPONSE_INVALID", retryable: false },
    });
  });

  it("rejects an oversized provider response before reading its body", async () => {
    const fetcher = new FirecrawlPageFetcher({
      apiKey: "fixture-key",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: publicResolver,
      transport: async () => new Response("oversized by declared length", {
        headers: { "content-length": String(FIRECRAWL_LIMITS.responseBytes + 1) },
      }),
    });

    await expect(fetcher.fetch("https://pinchofyum.com/fixture-recipe")).rejects.toMatchObject({
      failure: { code: "FIRECRAWL_CONTENT_TOO_LARGE", retryable: false },
    });
  });
});
