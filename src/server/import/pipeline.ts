import {
  ImportPipelineError,
  createWarning,
  importFailureResult,
  type ImportResult,
} from "@/domain/import/types";
import { extractRecipePage } from "@/server/import/extract";
import { SafePageFetcher } from "@/server/import/fetch";

export interface PipelineOutcome {
  result: ImportResult;
  attemptCount: number;
  fetch: {
    redirectCount: number;
    responseMediaType: string;
    fetchedAt: string;
  } | null;
}

export class WebRecipeImportPipeline {
  constructor(private readonly fetcher = new SafePageFetcher()) {}

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
      return {
        attemptCount: page.attemptCount,
        result: extractRecipePage({
          requestedUrl,
          finalUrl: page.finalUrl,
          contentSha256: page.contentSha256,
          html: page.html,
          initialWarnings,
        }),
        fetch: {
          redirectCount: page.redirectCount,
          responseMediaType: page.responseMediaType,
          fetchedAt: page.fetchedAt,
        },
      };
    } catch (error) {
      if (cancellation?.aborted) throw cancellation.reason;
      if (error instanceof ImportPipelineError) {
        return {
          result: importFailureResult(requestedUrl, error.failure),
          fetch: null,
          attemptCount: error.attemptCount,
        };
      }
      return {
        attemptCount: 1,
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
}
