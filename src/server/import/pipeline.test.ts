import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ImportPipelineError, sha256 } from "@/domain/import/types";
import { FirecrawlPageFetcher } from "@/server/import/firecrawl";
import { SafePageFetcher } from "@/server/import/fetch";
import {
  WebRecipeImportPipeline,
  type RecipePageFetcher,
} from "@/server/import/pipeline";

const fixtureDirectory = join(process.cwd(), "test/fixtures/recipe-import");
const successHtml = readFileSync(join(fixtureDirectory, "success-basic.html"), "utf8");
const partialHtml = readFileSync(
  join(fixtureDirectory, "partial-missing-steps.html"),
  "utf8",
);
const sourceUrl = "https://pinchofyum.com/fixture-recipe";

function pageFetcher(html: string, finalUrl = sourceUrl): RecipePageFetcher {
  return {
    async fetch(requestedUrl) {
      return {
        requestedUrl,
        finalUrl,
        redirectCount: 0,
        responseMediaType: "text/html",
        fetchedAt: "2026-08-30T10:00:00.000Z",
        contentSha256: sha256(html),
        html,
        charsetReplacement: false,
        attemptCount: 1,
      };
    },
  };
}

function failingFetcher(code: "FETCH_CLIENT_ERROR" | "FETCH_UPSTREAM_ERROR"): RecipePageFetcher {
  return {
    async fetch() {
      throw new ImportPipelineError(code, "fetch", code === "FETCH_UPSTREAM_ERROR");
    },
  };
}

describe("web recipe provider fallback", () => {
  it("keeps deterministic direct extraction first", async () => {
    let fallbackCalls = 0;
    const fallback: RecipePageFetcher = {
      async fetch() {
        fallbackCalls += 1;
        return pageFetcher(successHtml).fetch(sourceUrl);
      },
    };

    const outcome = await new WebRecipeImportPipeline(
      pageFetcher(successHtml),
      fallback,
    ).run(sourceUrl);

    expect(outcome.result.status).toBe("success");
    expect(outcome.result.source.retrievalProvider).toBe("direct");
    expect(outcome.fetch?.provider).toBe("direct");
    expect(fallbackCalls).toBe(0);
  });

  it("extracts a Pinch-of-Yum-shaped Firecrawl raw HTML response", async () => {
    const firecrawl = new FirecrawlPageFetcher({
      apiKey: "fixture-key",
      endpoint: "https://api.firecrawl.test/v2/scrape",
      resolver: { resolve: async () => ["93.184.216.34"] },
      transport: async () => Response.json({
        success: true,
        data: {
          rawHtml: successHtml,
          markdown: "# Green Pan Supper",
          metadata: { sourceURL: sourceUrl, title: "Green Pan Supper", language: "en" },
        },
      }),
    });

    const outcome = await new WebRecipeImportPipeline(
      failingFetcher("FETCH_CLIENT_ERROR"),
      firecrawl,
    ).run(sourceUrl);

    expect(outcome.result).toMatchObject({
      status: "success",
      source: { finalUrl: sourceUrl, retrievalProvider: "firecrawl" },
      recipe: { title: { displayText: "Green Pan Supper" } },
    });
    expect(outcome.fetch?.provider).toBe("firecrawl");
    expect(outcome.attemptCount).toBe(2);
  });

  it("preserves a partial fallback extraction for homeowner review", async () => {
    const outcome = await new WebRecipeImportPipeline(
      failingFetcher("FETCH_UPSTREAM_ERROR"),
      pageFetcher(partialHtml),
    ).run(sourceUrl);

    expect(outcome.result).toMatchObject({
      status: "partial_success",
      reviewState: "needs_review",
      source: { retrievalProvider: "firecrawl" },
      warnings: [{ code: "CORE_FIELD_MISSING" }],
    });
  });

  it("turns unusable fallback HTML into a stable manual-entry failure", async () => {
    const outcome = await new WebRecipeImportPipeline(
      failingFetcher("FETCH_CLIENT_ERROR"),
      pageFetcher("<html><body>No structured recipe</body></html>"),
    ).run(sourceUrl);

    expect(outcome.result).toMatchObject({
      status: "failure",
      reviewState: "not_created",
      source: { retrievalProvider: "firecrawl" },
      failure: {
        code: "FIRECRAWL_RESPONSE_INVALID",
        retryable: false,
        message: "Automatic fallback returned no usable recipe page. Enter the recipe manually.",
      },
    });
  });

  it("never invokes fallback for an explicitly rejected unsafe URL", async () => {
    let fallbackCalls = 0;
    const fallback: RecipePageFetcher = {
      async fetch() {
        fallbackCalls += 1;
        return pageFetcher(successHtml).fetch(sourceUrl);
      },
    };
    const direct = new SafePageFetcher({
      resolver: { resolve: async () => ["127.0.0.1"] },
      sleep: async () => {},
    });

    const outcome = await new WebRecipeImportPipeline(direct, fallback).run(
      "https://private.example.test/recipe",
    );

    expect(outcome.result).toMatchObject({
      status: "failure",
      failure: { code: "ADDRESS_FORBIDDEN", retryable: false },
    });
    expect(fallbackCalls).toBe(0);
  });
});
