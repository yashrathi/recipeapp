import {
  IMPORT_CONTRACT_VERSION, IMPORT_EXTRACTOR_VERSION, ImportPipelineError, createWarning,
  importFailureResult, type ImportResult,
} from "@/domain/import/types";
import { extractRecipePage } from "@/server/import/extract";
import { FirecrawlPageFetcher, type FirecrawlScrapeResult } from "@/server/import/firecrawl";
import { SafePageFetcher, type FetchedPage } from "@/server/import/fetch";
import { OpenAIRecipeExtractor, type AiExtraction } from "@/server/import/openai";
import { parsePublicImportSource, type PublicImportSource } from "@/server/import/source";
import { isolateTranscript, type SourceLine } from "@/server/import/transcript";

export interface PipelineOutcome {
  result: ImportResult;
  attemptCount: number;
  fetch: { provider: "direct" | "firecrawl"; redirectCount: number; responseMediaType: string; fetchedAt: string } | null;
}
export interface RecipePageFetcher {
  fetch(requestedUrl: string, cancellation?: AbortSignal): Promise<FetchedPage>;
  scrape?(requestedUrl: string, cancellation?: AbortSignal): Promise<FirecrawlScrapeResult>;
}
export interface RecipeAiExtractor {
  extract(lines: SourceLine[], cancellation?: AbortSignal): Promise<AiExtraction>;
}

const firecrawlEligibleFailures = new Set([
  "FETCH_TIMEOUT", "FETCH_RATE_LIMITED", "FETCH_UPSTREAM_ERROR", "FETCH_CLIENT_ERROR", "HEADERS_TOO_LARGE",
  "BODY_TOO_LARGE", "CONTENT_TYPE_UNSUPPORTED", "CONTENT_ENCODING_UNSUPPORTED", "CHARSET_UNSUPPORTED",
]);
const canUseFirecrawl = (error: ImportPipelineError) => firecrawlEligibleFailures.has(error.failure.code);

function markdownLines(markdown: string, title: string | null): SourceLine[] {
  const lines: SourceLine[] = [];
  if (title?.trim()) lines.push({ locator: "metadata:title", text: title.trim() });
  markdown.replace(/\r\n?/g, "\n").split("\n").forEach((raw, index) => {
    const text = raw.trim();
    if (text) lines.push({ locator: `markdown:line:${index + 1}`, text });
  });
  return lines;
}

export class WebRecipeImportPipeline {
  constructor(
    private readonly fetcher: RecipePageFetcher = new SafePageFetcher(),
    private readonly firecrawl: RecipePageFetcher | null = new FirecrawlPageFetcher(),
    private readonly ai: RecipeAiExtractor | null = new OpenAIRecipeExtractor(),
  ) {}

  async run(requestedUrl: string, cancellation?: AbortSignal): Promise<PipelineOutcome> {
    let source: PublicImportSource;
    try { source = parsePublicImportSource(requestedUrl); }
    catch (error) {
      return error instanceof ImportPipelineError ? this.failure(requestedUrl, error, 0) : this.internalFailure(requestedUrl, 1);
    }
    return source.type === "youtube" ? this.runYoutube(source, requestedUrl, cancellation) : this.runWeb(source.normalizedUrl, cancellation);
  }

  private async runWeb(requestedUrl: string, cancellation?: AbortSignal): Promise<PipelineOutcome> {
    try {
      const page = await this.fetcher.fetch(requestedUrl, cancellation);
      const initialWarnings = [];
      if (new URL(requestedUrl).protocol === "http:") initialWarnings.push(createWarning("SOURCE_USES_HTTP", "/source/requestedUrl"));
      if (page.charsetReplacement) initialWarnings.push(createWarning("CHARSET_REPLACEMENT", "/source"));
      const result = extractRecipePage({ requestedUrl, finalUrl: page.finalUrl, contentSha256: page.contentSha256,
        html: page.html, retrievalProvider: "direct", initialWarnings });
      if (result.status !== "failure" || !this.firecrawl) {
        return { attemptCount: page.attemptCount, result, fetch: this.fetchMetadata("direct", page) };
      }
      return this.runFirecrawlWeb(requestedUrl, page.attemptCount, cancellation);
    } catch (error) {
      if (cancellation?.aborted) throw cancellation.reason;
      if (error instanceof ImportPipelineError && this.firecrawl && canUseFirecrawl(error)) {
        return this.runFirecrawlWeb(requestedUrl, error.attemptCount, cancellation);
      }
      return error instanceof ImportPipelineError ? this.failure(requestedUrl, error, error.attemptCount) : this.internalFailure(requestedUrl, 1);
    }
  }

  private async scrape(requestedUrl: string, cancellation?: AbortSignal): Promise<FirecrawlScrapeResult> {
    if (!this.firecrawl) throw new ImportPipelineError("FIRECRAWL_NOT_CONFIGURED", "fetch", false);
    if (this.firecrawl.scrape) return this.firecrawl.scrape(requestedUrl, cancellation);
    const page = await this.firecrawl.fetch(requestedUrl, cancellation);
    return { requestedUrl, finalUrl: page.finalUrl, redirectCount: page.redirectCount, fetchedAt: page.fetchedAt,
      contentSha256: page.contentSha256, attemptCount: page.attemptCount, rawHtml: page.html, markdown: null,
      metadata: { sourceUrl: page.finalUrl, title: null, language: null } };
  }

  private async runFirecrawlWeb(requestedUrl: string, directAttempts: number, cancellation?: AbortSignal): Promise<PipelineOutcome> {
    try {
      const page = await this.scrape(requestedUrl, cancellation);
      if (page.rawHtml) {
        const result = extractRecipePage({ requestedUrl, finalUrl: page.finalUrl, contentSha256: page.contentSha256,
          html: page.rawHtml, retrievalProvider: "firecrawl" });
        if (result.status !== "failure") return this.scrapeOutcome(result, directAttempts, page, "text/html");
      }
      if (page.markdown && this.ai) {
        const extracted = await this.ai.extract(markdownLines(page.markdown, page.metadata.title), cancellation);
        return this.scrapeOutcome(this.aiResult(requestedUrl, page, extracted, "web", null, null), directAttempts, page, "text/markdown");
      }
      return this.failure(requestedUrl, new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "extract", false), directAttempts + page.attemptCount, { retrievalProvider: "firecrawl" });
    } catch (error) {
      if (cancellation?.aborted) throw cancellation.reason;
      return error instanceof ImportPipelineError
        ? this.failure(requestedUrl, error, directAttempts + error.attemptCount, { retrievalProvider: "firecrawl" })
        : this.internalFailure(requestedUrl, directAttempts + 1);
    }
  }

  private async runYoutube(source: Extract<PublicImportSource, { type: "youtube" }>, requestedUrl: string, cancellation?: AbortSignal): Promise<PipelineOutcome> {
    try {
      const page = await this.scrape(source.normalizedUrl, cancellation);
      const transcript = page.markdown ? isolateTranscript(page.markdown) : null;
      if (!transcript) return this.failure(requestedUrl, new ImportPipelineError("TRANSCRIPT_UNAVAILABLE", "extract", false), page.attemptCount, {
        sourceType: "youtube", retrievalProvider: "firecrawl", finalUrl: page.finalUrl, canonicalUrl: source.normalizedUrl,
        contentSha256: page.contentSha256, videoId: source.videoId, transcriptLanguage: page.metadata.language,
      });
      if (!this.ai) throw new ImportPipelineError("OPENAI_NOT_CONFIGURED", "extract", false);
      const lines: SourceLine[] = [...(page.metadata.title ? [{ locator: "metadata:title", text: page.metadata.title }] : []), ...transcript.lines];
      const extracted = await this.ai.extract(lines, cancellation);
      const result = this.aiResult(requestedUrl, page, extracted, "youtube", source.videoId, transcript.hasTimestamps, source.normalizedUrl);
      if (!page.metadata.language) result.warnings.push(createWarning("TRANSCRIPT_LANGUAGE_UNKNOWN", "/source/transcriptLanguage"));
      return this.scrapeOutcome(result, 0, page, "text/markdown");
    } catch (error) {
      if (cancellation?.aborted) throw cancellation.reason;
      return error instanceof ImportPipelineError ? this.failure(requestedUrl, error, error.attemptCount, {
        sourceType: "youtube", retrievalProvider: "firecrawl", canonicalUrl: source.normalizedUrl, videoId: source.videoId,
      }) : this.internalFailure(requestedUrl, 1);
    }
  }

  private aiResult(requestedUrl: string, page: FirecrawlScrapeResult, extracted: AiExtraction,
    sourceType: "web" | "youtube", videoId: string | null, transcriptHasTimestamps: boolean | null,
    canonicalUrl: string = page.finalUrl): ImportResult {
    const partial = extracted.warnings.some((warning) => warning.code === "EVIDENCE_MISMATCH" || warning.severity === "error");
    return { contractVersion: IMPORT_CONTRACT_VERSION, extractorVersion: IMPORT_EXTRACTOR_VERSION,
      status: partial ? "partial_success" : "success",
      reviewState: "needs_review", source: { sourceType, requestedUrl, finalUrl: page.finalUrl,
        canonicalUrl, title: extracted.recipe.title,
        author: null, publisher: null, imageUrl: null, method: "openai", retrievalProvider: "firecrawl",
        extractionProvider: "openai", contentSha256: page.contentSha256, videoId,
        transcriptLanguage: sourceType === "youtube" ? page.metadata.language : null, transcriptHasTimestamps },
      recipe: extracted.recipe, confidence: extracted.confidence, warnings: extracted.warnings, failure: null };
  }

  private scrapeOutcome(result: ImportResult, directAttempts: number, page: FirecrawlScrapeResult, responseMediaType: string): PipelineOutcome {
    return { result, attemptCount: directAttempts + page.attemptCount, fetch: { provider: "firecrawl",
      redirectCount: page.redirectCount, responseMediaType, fetchedAt: page.fetchedAt } };
  }
  private fetchMetadata(provider: "direct" | "firecrawl", page: FetchedPage): NonNullable<PipelineOutcome["fetch"]> {
    return { provider, redirectCount: page.redirectCount, responseMediaType: page.responseMediaType, fetchedAt: page.fetchedAt };
  }
  private failure(requestedUrl: string, error: ImportPipelineError, attemptCount: number, source = {}): PipelineOutcome {
    return { result: importFailureResult(requestedUrl, error.failure, source), fetch: null, attemptCount };
  }
  private internalFailure(requestedUrl: string, attemptCount: number): PipelineOutcome {
    return this.failure(requestedUrl, new ImportPipelineError("IMPORT_INTERNAL_ERROR", "any", true), attemptCount);
  }
}
