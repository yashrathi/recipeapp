import {
  ImportPipelineError,
  createWarning,
  importFailureResult,
  type ImportResult,
} from "@/domain/import/types";
import { extractRecipePage } from "@/server/import/extract";
import { FirecrawlPageFetcher } from "@/server/import/firecrawl";
import { SafePageFetcher, type FetchedPage } from "@/server/import/fetch";

export interface PipelineOutcome {
  result: ImportResult;
  attemptCount: number;
  fetch: {
    provider: "direct" | "firecrawl";
    redirectCount: number;
    responseMediaType: string;
    fetchedAt: string;
  } | null;
}

export interface RecipePageFetcher {
  fetch(requestedUrl: string, cancellation?: AbortSignal): Promise<FetchedPage>;
}

const firecrawlEligibleFailures = new Set([
  "FETCH_TIMEOUT",
  "FETCH_RATE_LIMITED",
  "FETCH_UPSTREAM_ERROR",
  "FETCH_CLIENT_ERROR",
  "HEADERS_TOO_LARGE",
  "BODY_TOO_LARGE",
  "CONTENT_TYPE_UNSUPPORTED",
  "CONTENT_ENCODING_UNSUPPORTED",
  "CHARSET_UNSUPPORTED",
]);

function canUseFirecrawl(error: ImportPipelineError): boolean {
  return firecrawlEligibleFailures.has(error.failure.code);
}

export class WebRecipeImportPipeline {
  constructor(
    private readonly fetcher: RecipePageFetcher = new SafePageFetcher(),
    private readonly firecrawl: RecipePageFetcher | null = new FirecrawlPageFetcher(),
  ) {}

  async run(requestedUrl: string, cancellation?: AbortSignal): Promise<PipelineOutcome> {
    try {
      const page = await this.fetcher.fetch(requestedUrl, cancellation);
      const initialWarnings = [];
      if (new URL(requestedUrl).protocol === "http:") {
        initialWarnings.push(createWarning("SOURCE_USES_HTTP", "/source/requestedUrl"));
      }
      if (page.charsetReplacement) {
        initialWarnings.push(createWarning("CHARSET_REPLACEMENT", "/source"));
      }
      const directResult = extractRecipePage({
        requestedUrl,
        finalUrl: page.finalUrl,
        contentSha256: page.contentSha256,
        html: page.html,
        retrievalProvider: "direct",
        initialWarnings,
      });
      if (directResult.status !== "failure" || !this.firecrawl) {
        return {
          attemptCount: page.attemptCount,
          result: directResult,
          fetch: {
            provider: "direct",
            redirectCount: page.redirectCount,
            responseMediaType: page.responseMediaType,
            fetchedAt: page.fetchedAt,
          },
        };
      }
      return await this.runFirecrawl(requestedUrl, page.attemptCount, cancellation);
    } catch (error) {
      if (cancellation?.aborted) throw cancellation.reason;
      if (error instanceof ImportPipelineError && this.firecrawl && canUseFirecrawl(error)) {
        return this.runFirecrawl(requestedUrl, error.attemptCount, cancellation);
      }
      if (error instanceof ImportPipelineError) {
        return {
          result: importFailureResult(requestedUrl, error.failure),
          fetch: null,
          attemptCount: error.attemptCount,
        };
      }
      return this.internalFailure(requestedUrl, 1);
    }
  }

  private async runFirecrawl(
    requestedUrl: string,
    directAttempts: number,
    cancellation?: AbortSignal,
  ): Promise<PipelineOutcome> {
    try {
      const page = await this.firecrawl!.fetch(requestedUrl, cancellation);
      const extracted = extractRecipePage({
        requestedUrl,
        finalUrl: page.finalUrl,
        contentSha256: page.contentSha256,
        html: page.html,
        retrievalProvider: "firecrawl",
      });
      const result = extracted.status === "failure"
        ? importFailureResult(
            requestedUrl,
            new ImportPipelineError("FIRECRAWL_RESPONSE_INVALID", "extract", false).failure,
            extracted.source,
            extracted.warnings,
          )
        : extracted;
      return {
        attemptCount: directAttempts + page.attemptCount,
        result,
        fetch: {
          provider: "firecrawl",
          redirectCount: page.redirectCount,
          responseMediaType: page.responseMediaType,
          fetchedAt: page.fetchedAt,
        },
      };
    } catch (error) {
      if (cancellation?.aborted) throw cancellation.reason;
      if (error instanceof ImportPipelineError) {
        return {
          attemptCount: directAttempts + error.attemptCount,
          result: importFailureResult(requestedUrl, error.failure, {
            retrievalProvider: "firecrawl",
          }),
          fetch: null,
        };
      }
      return this.internalFailure(requestedUrl, directAttempts + 1);
    }
  }

  private internalFailure(requestedUrl: string, attemptCount: number): PipelineOutcome {
    return {
      attemptCount,
      result: importFailureResult(requestedUrl, {
        code: "IMPORT_INTERNAL_ERROR",
        stage: "any",
        retryable: true,
        message: "The recipe could not be imported because of an internal error.",
      }),
      fetch: null,
    };
  }
}
