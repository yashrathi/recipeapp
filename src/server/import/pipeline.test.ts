import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ImportPipelineError, sha256, type NormalizedRecipe } from "@/domain/import/types";
import { FirecrawlPageFetcher } from "@/server/import/firecrawl";
import { SafePageFetcher } from "@/server/import/fetch";
import {
  WebRecipeImportPipeline,
  type RecipeAiExtractor,
  type RecipePageFetcher,
} from "@/server/import/pipeline";

const fixtureDirectory = join(process.cwd(), "test/fixtures/recipe-import");
const successHtml = readFileSync(join(fixtureDirectory, "success-basic.html"), "utf8");
const partialHtml = readFileSync(
  join(fixtureDirectory, "partial-missing-steps.html"),
  "utf8",
);
const sourceUrl = "https://pinchofyum.com/fixture-recipe";

function aiRecipe(): NormalizedRecipe {
  const evidence = { method: "openai" as const, locator: "metadata:title", sourceText: "Video Dal", sourceTextSha256: sha256("Video Dal") };
  return {
    title: { originalText: "Video Dal", displayText: "Video Dal", confidence: 0.7, evidence: [evidence] },
    yield: null, servings: null, prepTime: null, cookTime: null, totalTime: null,
    ingredients: [{ order: 1, originalText: "1 cup dal", displayText: "1 cup dal", quantity: null, unit: null,
      ingredientText: "1 cup dal", preparationNote: null, confidence: 0.65, evidence: [evidence] }],
    steps: [{ order: 1, section: null, originalText: "Boil dal", displayText: "Boil dal", duration: null,
      confidence: 0.65, evidence: [evidence] }],
  };
}

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
  it("uses AI only after unstructured Firecrawl webpage content remains unusable", async () => {
    const firecrawl: RecipePageFetcher = { async fetch() { throw new Error("unused"); }, async scrape(requestedUrl) {
      return { requestedUrl, finalUrl: requestedUrl, redirectCount: 0, fetchedAt: "2026-08-30T10:00:00.000Z",
        contentSha256: sha256("markdown"), attemptCount: 1, rawHtml: "<main>No schema</main>",
        markdown: "# Video Dal\n1 cup dal\nBoil dal", metadata: { sourceUrl: requestedUrl, title: "Video Dal", language: "en" } };
    } };
    const ai: RecipeAiExtractor = { async extract(lines) {
      expect(lines.some((line) => line.locator === "metadata:title" && line.text === "Video Dal")).toBe(true);
      return { recipe: aiRecipe(), warnings: [{ code: "AI_ASSISTED_EXTRACTION", severity: "info", fieldPath: "/recipe",
        message: "This draft was prepared with AI and must be checked against the source evidence.", evidence: [] }], confidence: 0.7 };
    } };
    const outcome = await new WebRecipeImportPipeline(failingFetcher("FETCH_CLIENT_ERROR"), firecrawl, ai).run(sourceUrl);
    expect(outcome.result).toMatchObject({ status: "success", source: { sourceType: "web", method: "openai",
      retrievalProvider: "firecrawl", extractionProvider: "openai" } });
  });

  it("marks a usable AI draft partial when evidence mismatches were omitted", async () => {
    const firecrawl: RecipePageFetcher = { async fetch() { throw new Error("unused"); }, async scrape(requestedUrl) {
      return { requestedUrl, finalUrl: requestedUrl, redirectCount: 0, fetchedAt: "2026-08-30T10:00:00.000Z",
        contentSha256: sha256("markdown"), attemptCount: 1, rawHtml: null, markdown: "# Recipe",
        metadata: { sourceUrl: requestedUrl, title: "Video Dal", language: "en" } };
    } };
    const ai: RecipeAiExtractor = { async extract() { return { recipe: aiRecipe(), warnings: [
      { code: "EVIDENCE_MISMATCH", severity: "warning", fieldPath: "/recipe",
        message: "An AI-suggested field was omitted because its source evidence did not match.", evidence: [] },
    ], confidence: 0.55 }; } };
    const outcome = await new WebRecipeImportPipeline(failingFetcher("FETCH_CLIENT_ERROR"), firecrawl, ai).run(sourceUrl);
    expect(outcome.result).toMatchObject({ status: "partial_success", reviewState: "needs_review",
      warnings: [{ code: "EVIDENCE_MISMATCH" }] });
  });

  it("routes captioned YouTube transcript evidence through AI without retaining raw transcript", async () => {
    let receivedLines: { locator: string; text: string; startSeconds?: number }[] = [];
    const firecrawl: RecipePageFetcher = {
      async fetch() { throw new Error("fetch path unused"); },
      async scrape(requestedUrl) {
        return { requestedUrl, finalUrl: requestedUrl, redirectCount: 0, fetchedAt: "2026-08-30T10:00:00.000Z",
          contentSha256: sha256("transcript"), attemptCount: 1, rawHtml: null,
          markdown: "# Video\n## Transcript\n[00:12] 1 cup dal\nBoil dal\n## Links\nprivate notes",
          metadata: { sourceUrl: requestedUrl, title: "Video Dal", language: "hi" } };
      },
    };
    const ai: RecipeAiExtractor = { async extract(lines) { receivedLines = lines; return {
      recipe: aiRecipe(), warnings: [{ code: "AI_ASSISTED_EXTRACTION", severity: "info", fieldPath: "/recipe",
        message: "This draft was prepared with AI and must be checked against the source evidence.", evidence: [] }], confidence: 0.7,
    }; } };
    const input = "https://youtu.be/dQw4w9WgXcQ?t=12";
    const outcome = await new WebRecipeImportPipeline(pageFetcher(successHtml), firecrawl, ai).run(input);
    expect(receivedLines).toEqual([
      { locator: "metadata:title", text: "Video Dal" },
      { locator: "transcript:line:1", text: "1 cup dal", startSeconds: 12 },
      { locator: "transcript:line:2", text: "Boil dal" },
    ]);
    expect(outcome.result.source).toMatchObject({ sourceType: "youtube", requestedUrl: input,
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ",
      transcriptLanguage: "hi", transcriptHasTimestamps: true, extractionProvider: "openai" });
    expect(JSON.stringify(outcome.result)).not.toContain("private notes");
    expect(JSON.stringify(outcome.result)).not.toContain("## Transcript");
  });

  it("fails to manual entry when a YouTube transcript is missing", async () => {
    const firecrawl: RecipePageFetcher = { async fetch() { throw new Error("unused"); }, async scrape(requestedUrl) {
      return { requestedUrl, finalUrl: requestedUrl, redirectCount: 0, fetchedAt: "2026-08-30T10:00:00.000Z",
        contentSha256: sha256("no transcript"), attemptCount: 1, rawHtml: null, markdown: "# Video\nNo captions",
        metadata: { sourceUrl: requestedUrl, title: "Video", language: null } };
    } };
    const outcome = await new WebRecipeImportPipeline(pageFetcher(successHtml), firecrawl, null)
      .run("https://youtube.com/shorts/dQw4w9WgXcQ");
    expect(outcome.result).toMatchObject({ status: "failure", source: { sourceType: "youtube", videoId: "dQw4w9WgXcQ" },
      failure: { code: "TRANSCRIPT_UNAVAILABLE", retryable: false } });
  });

  it("keeps an untimed unknown-language transcript usable without synthesizing timestamps", async () => {
    let captured: Parameters<RecipeAiExtractor["extract"]>[0] = [];
    const firecrawl: RecipePageFetcher = { async fetch() { throw new Error("unused"); }, async scrape(requestedUrl) {
      return { requestedUrl, finalUrl: requestedUrl, redirectCount: 0, fetchedAt: "2026-08-30T10:00:00.000Z",
        contentSha256: sha256("untimed"), attemptCount: 1, rawHtml: null, markdown: "## Transcript\n1 cup dal\nBoil dal",
        metadata: { sourceUrl: requestedUrl, title: "Video Dal", language: null } };
    } };
    const ai: RecipeAiExtractor = { async extract(lines) { captured = lines; return { recipe: aiRecipe(), warnings: [], confidence: 0.65 }; } };
    const outcome = await new WebRecipeImportPipeline(pageFetcher(successHtml), firecrawl, ai)
      .run("https://youtube.com/watch?v=dQw4w9WgXcQ");
    expect(captured.every((line) => line.startSeconds === undefined)).toBe(true);
    expect(outcome.result).toMatchObject({ source: { transcriptLanguage: null, transcriptHasTimestamps: false },
      warnings: [{ code: "TRANSCRIPT_LANGUAGE_UNKNOWN" }] });
  });

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
