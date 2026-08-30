import {
  ImportPipelineError,
  importFailureResult,
} from "@/domain/import/types";
import type { HouseholdActor } from "@/server/auth/policy";
import type { PipelineOutcome } from "@/server/import/pipeline";
import type { ImportRepository, PersistedImport } from "@/server/import/repository";
import { validateImportUrl } from "@/server/import/url-policy";

export interface StartImportInput {
  url: string;
  idempotencyKey: string;
}

export interface StartImportOutput {
  record: PersistedImport;
  reused: boolean;
}

export interface ImportPipeline {
  run(requestedUrl: string, cancellation?: AbortSignal): Promise<PipelineOutcome>;
}

export class ImportService {
  constructor(
    private readonly repository: ImportRepository,
    private readonly pipeline: ImportPipeline,
  ) {}

  async start(
    actor: HouseholdActor,
    input: StartImportInput,
    cancellation?: AbortSignal,
  ): Promise<StartImportOutput> {
    let normalizedRequestUrl: string;
    let validationFailure: PipelineOutcome | null = null;
    try {
      normalizedRequestUrl = validateImportUrl(input.url).href;
    } catch (error) {
      normalizedRequestUrl = input.url;
      const failure =
        error instanceof ImportPipelineError
          ? error.failure
          : new ImportPipelineError("URL_INVALID", "validate_url", false).failure;
      validationFailure = {
        result: importFailureResult(input.url, failure),
        fetch: null,
        attemptCount: 0,
      };
    }

    const existing = this.repository.findByIdempotency(actor, input.idempotencyKey);
    if (existing) {
      if (existing.normalizedRequestUrl !== normalizedRequestUrl) {
        throw new ImportPipelineError("IDEMPOTENCY_CONFLICT", "persist", false);
      }
      return { record: existing, reused: true };
    }

    const outcome = validationFailure ?? (await this.pipeline.run(normalizedRequestUrl, cancellation));
    return this.repository.persist(
      actor,
      input.idempotencyKey,
      input.url,
      normalizedRequestUrl,
      outcome,
    );
  }

  get(actor: HouseholdActor, id: string): PersistedImport | null {
    return this.repository.findVisibleById(actor.householdId, id);
  }
}
