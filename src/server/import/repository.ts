import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

import {
  IMPORT_CONTRACT_VERSION,
  IMPORT_EXTRACTOR_VERSION,
  ImportPipelineError,
  canonicalJson,
  sha256,
  type ImportResult,
} from "@/domain/import/types";
import type { HouseholdActor } from "@/server/auth/policy";
import type { PipelineOutcome } from "@/server/import/pipeline";

export interface PersistedImport {
  id: string;
  householdId: string;
  createdBy: string;
  idempotencyKey: string;
  normalizedRequestUrl: string;
  stage: string;
  status: "succeeded" | "failed";
  attemptCount: number;
  recipeId: string | null;
  recipeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  result: ImportResult;
}

interface ImportJobRow {
  id: string;
  household_id: string;
  created_by: string;
  idempotency_key: string;
  normalized_request_url: string;
  stage: string;
  status: "succeeded" | "failed";
  attempt_count: number;
  recipe_id: string | null;
  recipe_version_id: string | null;
  created_at: string;
  updated_at: string;
  result_json: string;
}

function hydrate(row: ImportJobRow): PersistedImport {
  return {
    id: row.id,
    householdId: row.household_id,
    createdBy: row.created_by,
    idempotencyKey: row.idempotency_key,
    normalizedRequestUrl: row.normalized_request_url,
    stage: row.stage,
    status: row.status,
    attemptCount: row.attempt_count,
    recipeId: row.recipe_id,
    recipeVersionId: row.recipe_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    result: JSON.parse(row.result_json) as ImportResult,
  };
}

function attemptIdentity(result: ImportResult): string | null {
  if (!result.source.contentSha256) return null;
  const components = [
    IMPORT_CONTRACT_VERSION,
    IMPORT_EXTRACTOR_VERSION,
    result.source.finalUrl,
    result.source.contentSha256,
  ];
  return sha256(components.map((part) => `${Buffer.byteLength(part, "utf8")}:${part}`).join(""));
}

export class ImportRepository {
  constructor(private readonly client: Database.Database) {}

  findByIdempotency(actor: HouseholdActor, key: string): PersistedImport | null {
    const row = this.client
      .prepare(
        `SELECT * FROM import_jobs
         WHERE household_id = ? AND created_by = ? AND idempotency_key = ?`,
      )
      .get(actor.householdId, actor.userId, key) as ImportJobRow | undefined;
    return row ? hydrate(row) : null;
  }

  findVisibleById(householdId: string, id: string): PersistedImport | null {
    const row = this.client
      .prepare("SELECT * FROM import_jobs WHERE household_id = ? AND id = ?")
      .get(householdId, id) as ImportJobRow | undefined;
    return row ? hydrate(row) : null;
  }

  persist(
    actor: HouseholdActor,
    key: string,
    requestedUrl: string,
    normalizedRequestUrl: string,
    outcome: PipelineOutcome,
  ): { record: PersistedImport; reused: boolean } {
    return this.client.transaction(() => {
      const existing = this.findByIdempotency(actor, key);
      if (existing) {
        if (existing.normalizedRequestUrl !== normalizedRequestUrl) {
          throw new ImportPipelineError("IDEMPOTENCY_CONFLICT", "persist", false);
        }
        return { record: existing, reused: true };
      }

      const now = new Date().toISOString();
      const result = outcome.result;
      const sourceId = randomUUID();
      const jobId = randomUUID();
      const recipeId = result.recipe ? randomUUID() : null;
      const recipeVersionId = result.recipe ? randomUUID() : null;
      const canonicalResult = canonicalJson(result);
      const identity = attemptIdentity(result);
      const sourceHost = (() => {
        try {
          return new URL(result.source.finalUrl).hostname;
        } catch {
          return "submitted webpage";
        }
      })();

      this.client
        .prepare(
          `INSERT INTO recipe_sources
            (id, household_id, type, canonical_url, title, author, attribution, fetched_at)
           VALUES (?, ?, 'web', ?, ?, ?, ?, ?)`,
        )
        .run(
          sourceId,
          actor.householdId,
          result.source.contentSha256 ? result.source.canonicalUrl : null,
          result.source.title?.displayText ?? null,
          result.source.author?.displayText ?? result.source.publisher?.displayText ?? null,
          `Public recipe webpage: ${sourceHost}`,
          outcome.fetch?.fetchedAt ?? null,
        );

      if (result.recipe && recipeId && recipeVersionId) {
        this.client
          .prepare(
            `INSERT INTO recipes
              (id, household_id, source_id, current_version_id, status, created_by, created_at)
             VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
          )
          .run(recipeId, actor.householdId, sourceId, recipeVersionId, actor.userId, now);
        this.client
          .prepare(
            `INSERT INTO recipe_versions
              (id, recipe_id, source_id, household_id, version, title, servings, prep_minutes,
               cook_minutes, language, review_status, reviewed_by, published_at, created_at)
             VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 'en-IN', 'needs_review', NULL, NULL, ?)`,
          )
          .run(
            recipeVersionId,
            recipeId,
            sourceId,
            actor.householdId,
            result.recipe.title.displayText,
            result.recipe.servings,
            result.recipe.prepTime ? Math.ceil(result.recipe.prepTime.seconds / 60) : null,
            result.recipe.cookTime ? Math.ceil(result.recipe.cookTime.seconds / 60) : null,
            now,
          );

        const ingredientStatement = this.client.prepare(
          `INSERT INTO recipe_ingredients
            (id, recipe_version_id, display_line, original_text, display_text, ingredient_text,
             canonical_name, quantity_json, unit_json, quantity, unit, preparation_note, optional,
             sort_order, confidence, evidence_json, evidence)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, 0, ?, ?, ?, NULL)`,
        );
        result.recipe.ingredients.forEach((ingredient) => {
          ingredientStatement.run(
            randomUUID(),
            recipeVersionId,
            ingredient.displayText,
            ingredient.originalText,
            ingredient.displayText,
            ingredient.ingredientText,
            ingredient.quantity ? canonicalJson(ingredient.quantity) : null,
            ingredient.unit ? canonicalJson(ingredient.unit) : null,
            ingredient.preparationNote,
            ingredient.order,
            ingredient.confidence,
            canonicalJson(ingredient.evidence),
          );
        });

        const stepStatement = this.client.prepare(
          `INSERT INTO recipe_steps
            (id, recipe_version_id, sort_order, section, original_text, display_text, short_text,
             detailed_text, action, duration_seconds, temperature_celsius, ingredient_ids_json,
             confidence, evidence_json, evidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, '[]', ?, ?, NULL)`,
        );
        result.recipe.steps.forEach((step) => {
          stepStatement.run(
            randomUUID(),
            recipeVersionId,
            step.order,
            step.section,
            step.originalText,
            step.displayText,
            step.displayText,
            step.displayText,
            step.duration?.seconds ?? null,
            step.confidence,
            canonicalJson(step.evidence),
          );
        });
      }

      if (identity && result.source.contentSha256) {
        this.client
          .prepare(
            `INSERT OR IGNORE INTO import_attempt_results
              (attempt_identity, contract_version, extractor_version, normalized_final_url,
               content_sha256, result_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            identity,
            IMPORT_CONTRACT_VERSION,
            IMPORT_EXTRACTOR_VERSION,
            result.source.finalUrl,
            result.source.contentSha256,
            canonicalResult,
            now,
          );
      }

      const stage = result.failure?.stage ?? "needs_review";
      const status = result.status === "failure" ? "failed" : "succeeded";
      this.client
        .prepare(
          `INSERT INTO import_jobs
            (id, household_id, created_by, source_id, stage, status, attempt_count, error_code,
             warnings_json, contract_version, extractor_version, created_at, updated_at,
             idempotency_key, requested_url, normalized_request_url, final_url, redirect_count,
             response_media_type, fetched_at, content_sha256, attempt_identity, result_json,
             recipe_id, recipe_version_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          jobId,
          actor.householdId,
          actor.userId,
          sourceId,
          stage,
          status,
          outcome.attemptCount,
          result.failure?.code ?? null,
          canonicalJson(result.warnings),
          IMPORT_CONTRACT_VERSION,
          IMPORT_EXTRACTOR_VERSION,
          now,
          now,
          key,
          requestedUrl,
          normalizedRequestUrl,
          result.source.finalUrl,
          outcome.fetch?.redirectCount ?? null,
          outcome.fetch?.responseMediaType ?? null,
          outcome.fetch?.fetchedAt ?? null,
          result.source.contentSha256,
          identity,
          canonicalResult,
          recipeId,
          recipeVersionId,
        );

      return { record: this.findVisibleById(actor.householdId, jobId)!, reused: false };
    })();
  }
}
