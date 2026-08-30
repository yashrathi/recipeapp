import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";

import type { ExtractionEvidence } from "@/domain/contracts";
import { ExtractionWarningSchema } from "@/domain/contracts";
import { buildAssignmentSnapshot } from "@/features/househelp/server/snapshot";
import {
  AssignmentInputSchema,
  DraftEditInputSchema,
  ImportedDraftPayloadSchema,
  ManualRecipeInputSchema,
  quantityToEditableText,
  type AssignmentInput,
  type DraftEditInput,
  type ImportedRecipeResult,
  type ManualRecipeInput,
} from "@/features/homeowner/contracts";
import { assertHomeowner } from "@/features/homeowner/server/authorization";
import { authorize, type HouseholdActor } from "@/server/auth/policy";
import { getDatabaseHandle } from "@/server/db/client";

type DatabaseHandle = ReturnType<typeof getDatabaseHandle>;
type ExtractionWarning = z.infer<typeof ExtractionWarningSchema>;

type RecipeStatus = "draft" | "needs_review" | "reviewed" | "published";

export interface HomeownerDashboard {
  householdName: string;
  homeownerName: string;
  househelp: Array<{ id: string; name: string; spokenLocale: string; status: string }>;
  assignments: Array<{
    id: string;
    versionId: string;
    title: string;
    assigneeName: string;
    scheduledDate: string;
    mealSlot: string;
    targetTime: string | null;
    targetServings: number;
    status: string;
    selectedLocale: string;
  }>;
  imports: Array<{
    id: string;
    stage: string;
    status: string;
    sourceTitle: string;
    errorCode: string | null;
    warningCount: number;
    versionId: string | null;
    reviewStatus: RecipeStatus | null;
  }>;
  issues: Array<{ id: string; title: string; detail: string; href: string | null }>;
}

export interface HomeownerRecipeView {
  versionId: string;
  recipeId: string;
  title: string;
  spokenDishEnglish: string;
  spokenDishHindi: string;
  servings: number | null;
  reviewStatus: RecipeStatus;
  source: {
    type: "web" | "youtube" | "manual";
    canonicalUrl: string | null;
    attribution: string;
    author: string | null;
  };
  warnings: ExtractionWarning[];
  ingredients: Array<{
    id: string;
    originalText: string;
    displayLine: string;
    ingredientText: string;
    quantityText: string;
    unit: string | null;
    confidence: number;
    evidence: ExtractionEvidence[];
    spokenEnglish: string;
    spokenHindi: string;
  }>;
  steps: Array<{
    id: string;
    originalText: string;
    shortText: string;
    detailedText: string;
    confidence: number;
    evidence: ExtractionEvidence[];
    spokenEnglish: string;
    spokenHindi: string;
    visual: {
      kind: string;
      purpose: string;
      verification: string;
      rights: string;
      attribution: string;
      fallback: boolean;
    };
  }>;
}

export class HomeownerValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "INVALID_HOMEOWNER_OPERATION", status = 400) {
    super(message);
    this.name = "HomeownerValidationError";
    this.code = code;
    this.status = status;
  }
}

function safeWarnings(value: string): ExtractionWarning[] {
  try {
    const parsed = ExtractionWarningSchema.array().safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function safeEvidence(value: string): ExtractionEvidence[] {
  try {
    const parsed = JSON.parse(value) as ExtractionEvidence[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function textFieldDisplay(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const displayText = (value as { displayText?: unknown }).displayText;
  return typeof displayText === "string" && displayText.trim() ? displayText : null;
}

function createExactQuantity(text: string | null, existingJson?: string | null): string | null {
  const value = text?.trim();
  if (!value) return null;

  if (existingJson) {
    try {
      const existing = JSON.parse(existingJson) as { sourceText?: unknown };
      if (existing.sourceText === value) return existingJson;
    } catch {
      // Continue with conservative homeowner-entered parsing.
    }
  }

  if (/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number(value) > 0) {
    return JSON.stringify({ kind: "exact", decimal: value, sourceText: value, confidence: 1 });
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(value);
  if (fraction && Number(fraction[1]) > 0 && Number(fraction[2]) > 0) {
    return JSON.stringify({
      kind: "exact",
      numerator: Number(fraction[1]),
      denominator: Number(fraction[2]),
      sourceText: value,
      confidence: 1,
    });
  }
  throw new HomeownerValidationError(
    `Quantity “${value}” must be a positive number or simple fraction such as 1/2.`,
    "QUANTITY_INVALID",
  );
}

function sourceAttribution(result: ImportedRecipeResult): string {
  const author = textFieldDisplay(result.source.author);
  const publisher = textFieldDisplay(result.source.publisher);
  if (author) return author;
  if (publisher) return publisher;
  if (result.source.sourceType === "youtube") return `YouTube video: ${result.recipe.title.displayText}`;
  return `Imported from ${new URL(result.source.canonicalUrl).hostname}`;
}

export class HomeownerStore {
  private readonly client: DatabaseHandle["client"];

  constructor(handle: DatabaseHandle = getDatabaseHandle()) {
    this.client = handle.client;
  }

  private requireHomeowner(actor: HouseholdActor): void {
    assertHomeowner(actor);
  }

  async getDashboard(actor: HouseholdActor): Promise<HomeownerDashboard> {
    this.requireHomeowner(actor);
    authorize(actor, "assignment:view", { householdId: actor.householdId });

    const household = this.client.prepare(
      "SELECT name FROM households WHERE id = ?",
    ).get(actor.householdId) as { name: string } | undefined;
    const homeowner = this.client.prepare("SELECT name FROM users WHERE id = ?").get(actor.userId) as
      | { name: string }
      | undefined;
    if (!household || !homeowner) {
      throw new HomeownerValidationError("The household is no longer available.", "HOUSEHOLD_NOT_FOUND", 404);
    }

    const househelp = this.client.prepare(
      `SELECT u.id, u.name, u.spoken_locale AS spokenLocale, m.status
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ? AND m.role = 'househelp'
       ORDER BY u.name`,
    ).all(actor.householdId) as HomeownerDashboard["househelp"];

    const assignments = this.client.prepare(
      `SELECT a.id, a.recipe_version_id AS versionId, v.title, u.name AS assigneeName,
              a.scheduled_date AS scheduledDate, a.meal_slot AS mealSlot,
              a.target_time AS targetTime, a.target_servings AS targetServings,
              a.status, a.selected_locale AS selectedLocale
       FROM cooking_assignments a
       JOIN recipe_versions v ON v.id = a.recipe_version_id
       JOIN users u ON u.id = a.assignee_id
       WHERE a.household_id = ?
       ORDER BY a.scheduled_date, COALESCE(a.target_time, '23:59')`,
    ).all(actor.householdId) as HomeownerDashboard["assignments"];

    const importRows = this.client.prepare(
      `SELECT j.id, j.stage, j.status, COALESCE(s.title, s.canonical_url, 'Recipe webpage') AS sourceTitle,
              j.error_code AS errorCode, j.warnings_json AS warningsJson,
              (SELECT v.id FROM recipe_versions v
               WHERE v.source_id = j.source_id AND v.household_id = j.household_id
               ORDER BY v.version DESC LIMIT 1) AS versionId,
              (SELECT v.review_status FROM recipe_versions v
               WHERE v.source_id = j.source_id AND v.household_id = j.household_id
               ORDER BY v.version DESC LIMIT 1) AS reviewStatus
       FROM import_jobs j
       JOIN recipe_sources s ON s.id = j.source_id
       WHERE j.household_id = ?
       ORDER BY j.updated_at DESC
       LIMIT 8`,
    ).all(actor.householdId) as Array<{
      id: string;
      stage: string;
      status: string;
      sourceTitle: string;
      errorCode: string | null;
      warningsJson: string;
      versionId: string | null;
      reviewStatus: RecipeStatus | null;
    }>;
    const imports = importRows.map(({ warningsJson, ...row }) => ({
      ...row,
      warningCount: safeWarnings(warningsJson).length,
    }));

    const issues: HomeownerDashboard["issues"] = [];
    for (const assignment of assignments) {
      if (assignment.status === "blocked") {
        issues.push({
          id: `assignment-${assignment.id}`,
          title: `${assignment.assigneeName} needs help with ${assignment.title}`,
          detail: "This cooking assignment is blocked.",
          href: `/homeowner/recipes/${assignment.versionId}`,
        });
      }
    }
    for (const item of imports) {
      if (item.status === "failed") {
        issues.push({
          id: `import-${item.id}`,
          title: `Import failed: ${item.sourceTitle}`,
          detail: item.errorCode ?? "The source could not be imported.",
          href: `/homeowner/imports/${item.id}`,
        });
      } else if (item.warningCount > 0 && item.versionId && item.reviewStatus !== "published") {
        issues.push({
          id: `warning-${item.id}`,
          title: `${item.warningCount} review ${item.warningCount === 1 ? "warning" : "warnings"}`,
          detail: item.sourceTitle,
          href: `/homeowner/recipes/${item.versionId}/review`,
        });
      }
    }

    return { householdName: household.name, homeownerName: homeowner.name, househelp, assignments, imports, issues };
  }

  async listRecipes(actor: HouseholdActor): Promise<Array<{
    versionId: string;
    title: string;
    servings: number | null;
    reviewStatus: RecipeStatus;
    sourceType: string;
    attribution: string;
  }>> {
    this.requireHomeowner(actor);
    authorize(actor, "recipe:review", { householdId: actor.householdId });
    return this.client.prepare(
      `SELECT v.id AS versionId, v.title, v.servings, v.review_status AS reviewStatus,
              s.type AS sourceType, s.attribution
       FROM recipe_versions v
       JOIN recipe_sources s ON s.id = v.source_id
       WHERE v.household_id = ?
       ORDER BY v.created_at DESC, v.version DESC`,
    ).all(actor.householdId) as Array<{
      versionId: string;
      title: string;
      servings: number | null;
      reviewStatus: RecipeStatus;
      sourceType: string;
      attribution: string;
    }>;
  }

  async createManualDraft(actor: HouseholdActor, input: ManualRecipeInput): Promise<string> {
    this.requireHomeowner(actor);
    authorize(actor, "recipe:review", { householdId: actor.householdId });
    const parsed = ManualRecipeInputSchema.parse(input);
    const sourceId = randomUUID();
    const recipeId = randomUUID();
    const versionId = randomUUID();
    const now = new Date().toISOString();

    this.client.transaction(() => {
      this.client.prepare(
        `INSERT INTO recipe_sources
           (id, household_id, type, canonical_url, title, author, attribution, fetched_at)
         VALUES (?, ?, 'manual', NULL, ?, NULL, 'Entered manually by the homeowner', NULL)`,
      ).run(sourceId, actor.householdId, parsed.title);
      this.insertRecipeShell(actor, recipeId, versionId, sourceId, parsed.title, parsed.servings, now);
      this.replaceDraftContent(
        versionId,
        { spokenEnglish: parsed.title, spokenHindi: "" },
        parsed.ingredients.map((line) => ({
          displayLine: line,
          ingredientText: line,
          quantityText: null,
          unit: null,
          spokenEnglish: line,
          spokenHindi: "",
        })),
        parsed.steps.map((text) => ({
          shortText: text.slice(0, 280),
          detailedText: text,
          spokenEnglish: text,
          spokenHindi: "",
        })),
        false,
      );
    })();
    return versionId;
  }

  async createImportedDraft(actor: HouseholdActor, payload: unknown): Promise<string> {
    this.requireHomeowner(actor);
    authorize(actor, "recipe:import", { householdId: actor.householdId });
    const { result, jobId } = ImportedDraftPayloadSchema.parse(payload);
    const now = new Date().toISOString();
    const recipeId = randomUUID();
    const versionId = randomUUID();

    this.client.transaction(() => {
      let sourceId: string | null = null;
      if (jobId) {
        const job = this.client.prepare(
          "SELECT source_id AS sourceId, household_id AS householdId FROM import_jobs WHERE id = ?",
        ).get(jobId) as { sourceId: string; householdId: string } | undefined;
        if (job && job.householdId !== actor.householdId) {
          throw new HomeownerValidationError("That import belongs to another household.", "IMPORT_NOT_FOUND", 404);
        }
        sourceId = job?.sourceId ?? null;
      }

      if (!sourceId) {
        sourceId = randomUUID();
        this.client.prepare(
          `INSERT INTO recipe_sources
             (id, household_id, type, canonical_url, title, author, attribution, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          sourceId,
          actor.householdId,
          result.source.sourceType ?? "web",
          result.source.canonicalUrl,
          result.recipe.title.displayText,
          textFieldDisplay(result.source.author),
          sourceAttribution(result),
          now,
        );
        const syntheticJobId = jobId ?? randomUUID();
        this.client.prepare(
          `INSERT INTO import_jobs
             (id, household_id, created_by, source_id, stage, status, attempt_count, error_code,
              warnings_json, contract_version, extractor_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'needs_review', 'succeeded', 1, NULL, ?, ?, ?, ?, ?)`,
        ).run(
          syntheticJobId,
          actor.householdId,
          actor.userId,
          sourceId,
          JSON.stringify(result.warnings),
          result.contractVersion,
          result.extractorVersion,
          now,
          now,
        );
      }

      this.insertRecipeShell(
        actor,
        recipeId,
        versionId,
        sourceId,
        result.recipe.title.displayText,
        result.recipe.servings ?? null,
        now,
      );

      const ingredientIds = new Map<number, string>();
      result.recipe.ingredients.forEach((ingredient) => ingredientIds.set(ingredient.order, randomUUID()));
      this.replaceDraftContent(
        versionId,
        { spokenEnglish: result.recipe.title.displayText, spokenHindi: "" },
        result.recipe.ingredients.map((ingredient) => ({
          id: ingredientIds.get(ingredient.order),
          originalText: ingredient.originalText,
          displayLine: ingredient.displayText,
          ingredientText: ingredient.ingredientText,
          quantityText: quantityToEditableText(ingredient.quantity) || null,
          unit: ingredient.unit?.canonical ?? null,
          confidence: ingredient.confidence,
          evidence: ingredient.evidence,
          quantityJson: ingredient.quantity ? JSON.stringify(ingredient.quantity) : null,
          unitJson: ingredient.unit ? JSON.stringify(ingredient.unit) : null,
          preparationNote: ingredient.preparationNote,
          spokenEnglish: ingredient.displayText,
          spokenHindi: "",
        })),
        result.recipe.steps.map((step) => ({
          originalText: step.originalText,
          shortText: step.displayText.slice(0, 280),
          detailedText: step.displayText,
          spokenEnglish: step.displayText,
          spokenHindi: "",
          confidence: step.confidence,
          evidence: step.evidence,
          section: step.section,
          durationSeconds: step.duration?.seconds ?? null,
        })),
        false,
      );
    })();

    return versionId;
  }

  private insertRecipeShell(
    actor: HouseholdActor,
    recipeId: string,
    versionId: string,
    sourceId: string,
    title: string,
    servings: number | null,
    now: string,
  ): void {
    this.client.prepare(
      `INSERT INTO recipes
         (id, household_id, source_id, current_version_id, status, created_by, created_at)
       VALUES (?, ?, ?, NULL, 'draft', ?, ?)`,
    ).run(recipeId, actor.householdId, sourceId, actor.userId, now);
    this.client.prepare(
      `INSERT INTO recipe_versions
         (id, recipe_id, source_id, household_id, version, title, servings, prep_minutes,
          cook_minutes, language, review_status, reviewed_by, published_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, NULL, NULL, 'en-IN', 'needs_review', NULL, NULL, ?)`,
    ).run(versionId, recipeId, sourceId, actor.householdId, title, servings, now);
  }

  private replaceDraftContent(
    versionId: string,
    dish: { spokenEnglish: string; spokenHindi: string },
    ingredients: Array<{
      id?: string;
      originalText?: string;
      displayLine: string;
      ingredientText: string;
      quantityText: string | null;
      unit: string | null;
      confidence?: number;
      evidence?: ExtractionEvidence[];
      quantityJson?: string | null;
      unitJson?: string | null;
      preparationNote?: string | null;
      spokenEnglish: string;
      spokenHindi: string;
    }>,
    steps: Array<{
      id?: string;
      originalText?: string;
      shortText: string;
      detailedText: string;
      spokenEnglish: string;
      spokenHindi: string;
      confidence?: number;
      evidence?: ExtractionEvidence[];
      section?: string | null;
      durationSeconds?: number | null;
    }>,
    reviewed: boolean,
  ): void {
    const existingIngredients = this.client.prepare(
      "SELECT id, original_text AS originalText, evidence_json AS evidenceJson, quantity_json AS quantityJson FROM recipe_ingredients WHERE recipe_version_id = ?",
    ).all(versionId) as Array<{ id: string; originalText: string; evidenceJson: string; quantityJson: string | null }>;
    const existingSteps = this.client.prepare(
      "SELECT id, original_text AS originalText, evidence_json AS evidenceJson FROM recipe_steps WHERE recipe_version_id = ?",
    ).all(versionId) as Array<{ id: string; originalText: string; evidenceJson: string }>;
    const ingredientSource = new Map(existingIngredients.map((row) => [row.id, row]));
    const stepSource = new Map(existingSteps.map((row) => [row.id, row]));

    this.client.prepare("DELETE FROM recipe_visuals WHERE recipe_version_id = ?").run(versionId);
    this.client.prepare("DELETE FROM spoken_guidance WHERE recipe_version_id = ?").run(versionId);
    this.client.prepare("DELETE FROM recipe_steps WHERE recipe_version_id = ?").run(versionId);
    this.client.prepare("DELETE FROM recipe_ingredients WHERE recipe_version_id = ?").run(versionId);

    this.insertGuidance(versionId, "recipe.dish", null, "en-IN", dish.spokenEnglish, reviewed);
    if (dish.spokenHindi.trim()) {
      this.insertGuidance(versionId, "recipe.dish", null, "hi-IN", dish.spokenHindi, reviewed);
    }

    const insertIngredient = this.client.prepare(
      `INSERT INTO recipe_ingredients
         (id, recipe_version_id, display_line, original_text, display_text, ingredient_text,
          canonical_name, quantity_json, unit_json, quantity, unit, preparation_note,
          optional, sort_order, confidence, evidence_json, evidence)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, 0, ?, ?, ?, NULL)`,
    );
    ingredients.forEach((ingredient, index) => {
      const existing = ingredient.id ? ingredientSource.get(ingredient.id) : undefined;
      const id = existing ? existing.id : randomUUID();
      const quantityJson = ingredient.quantityJson ?? createExactQuantity(
        ingredient.quantityText,
        existing?.quantityJson,
      );
      const unitJson = ingredient.unitJson ?? (ingredient.unit
        ? JSON.stringify({ canonical: ingredient.unit, sourceText: ingredient.unit, confidence: 1 })
        : null);
      insertIngredient.run(
        id,
        versionId,
        ingredient.displayLine,
        existing?.originalText ?? ingredient.originalText ?? ingredient.displayLine,
        ingredient.displayLine,
        ingredient.ingredientText,
        quantityJson,
        unitJson,
        ingredient.preparationNote ?? null,
        index + 1,
        existing ? 1 : (ingredient.confidence ?? 1),
        existing?.evidenceJson ?? JSON.stringify(ingredient.evidence ?? []),
      );
      this.insertGuidance(versionId, `ingredient.${id}`, null, "en-IN", ingredient.spokenEnglish, reviewed);
      if (ingredient.spokenHindi.trim()) {
        this.insertGuidance(versionId, `ingredient.${id}`, null, "hi-IN", ingredient.spokenHindi, reviewed);
      }
    });

    const insertStep = this.client.prepare(
      `INSERT INTO recipe_steps
         (id, recipe_version_id, sort_order, section, original_text, display_text, short_text,
          detailed_text, action, duration_seconds, temperature_celsius, ingredient_ids_json,
          confidence, evidence_json, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, '[]', ?, ?, NULL)`,
    );
    steps.forEach((step, index) => {
      const existing = step.id ? stepSource.get(step.id) : undefined;
      const id = existing ? existing.id : randomUUID();
      insertStep.run(
        id,
        versionId,
        index + 1,
        step.section ?? null,
        existing?.originalText ?? step.originalText ?? step.detailedText,
        step.detailedText,
        step.shortText,
        step.detailedText,
        step.durationSeconds ?? null,
        existing ? 1 : (step.confidence ?? 1),
        existing?.evidenceJson ?? JSON.stringify(step.evidence ?? []),
      );
      this.insertGuidance(versionId, `cook.step.${id}`, id, "en-IN", step.spokenEnglish, reviewed);
      if (step.spokenHindi.trim()) {
        this.insertGuidance(versionId, `cook.step.${id}`, id, "hi-IN", step.spokenHindi, reviewed);
      }
    });
  }

  private insertGuidance(
    versionId: string,
    guidanceKey: string,
    stepId: string | null,
    locale: "en-IN" | "hi-IN",
    speakableText: string,
    reviewed: boolean,
  ): void {
    const contentHash = createHash("sha256").update(speakableText, "utf8").digest("hex");
    this.client.prepare(
      `INSERT INTO spoken_guidance
         (id, recipe_version_id, guidance_key, step_id, interface_key, locale, speakable_text,
          content_hash, voice_version, review_status, audio_asset_id, cache_status,
          generation_status, cache_key, reviewed)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'homeowner-preview-v1', ?, NULL,
               'not_cached', 'ready', NULL, ?)`,
    ).run(
      randomUUID(),
      versionId,
      guidanceKey,
      stepId,
      locale,
      speakableText,
      contentHash,
      reviewed ? "reviewed" : "unreviewed",
      reviewed ? 1 : 0,
    );
  }

  async getRecipe(actor: HouseholdActor, versionId: string): Promise<HomeownerRecipeView> {
    this.requireHomeowner(actor);
    authorize(actor, "recipe:review", { householdId: actor.householdId });
    const version = this.client.prepare(
      `SELECT v.id AS versionId, v.recipe_id AS recipeId, v.title, v.servings,
              v.review_status AS reviewStatus, v.source_id AS sourceId,
              s.type AS sourceType, s.canonical_url AS canonicalUrl,
              s.attribution, s.author
       FROM recipe_versions v
       JOIN recipe_sources s ON s.id = v.source_id
       WHERE v.id = ? AND v.household_id = ?`,
    ).get(versionId, actor.householdId) as {
      versionId: string;
      recipeId: string;
      title: string;
      servings: number | null;
      reviewStatus: RecipeStatus;
      sourceId: string;
      sourceType: "web" | "youtube" | "manual";
      canonicalUrl: string | null;
      attribution: string;
      author: string | null;
    } | undefined;
    if (!version) throw new HomeownerValidationError("Recipe not found.", "RECIPE_NOT_FOUND", 404);

    const ingredients = this.client.prepare(
      `SELECT id, original_text AS originalText, display_line AS displayLine,
              ingredient_text AS ingredientText, quantity_json AS quantityJson,
              unit_json AS unitJson, confidence, evidence_json AS evidenceJson
       FROM recipe_ingredients WHERE recipe_version_id = ? ORDER BY sort_order`,
    ).all(versionId) as Array<{
      id: string;
      originalText: string;
      displayLine: string;
      ingredientText: string;
      quantityJson: string | null;
      unitJson: string | null;
      confidence: number;
      evidenceJson: string;
    }>;
    const steps = this.client.prepare(
      `SELECT id, original_text AS originalText, short_text AS shortText,
              detailed_text AS detailedText, confidence, evidence_json AS evidenceJson
       FROM recipe_steps WHERE recipe_version_id = ? ORDER BY sort_order`,
    ).all(versionId) as Array<{
      id: string;
      originalText: string;
      shortText: string;
      detailedText: string;
      confidence: number;
      evidenceJson: string;
    }>;
    const guidance = this.client.prepare(
      `SELECT guidance_key AS guidanceKey, locale, speakable_text AS speakableText
       FROM spoken_guidance WHERE recipe_version_id = ?`,
    ).all(versionId) as Array<{ guidanceKey: string; locale: string; speakableText: string }>;
    const guidanceMap = new Map(guidance.map((row) => [`${row.guidanceKey}:${row.locale}`, row.speakableText]));
    const visuals = this.client.prepare(
      `SELECT rv.step_id AS stepId, va.kind, va.purpose, va.verification, va.rights, va.attribution
       FROM recipe_visuals rv
       JOIN visual_assets va ON va.id = rv.visual_asset_id
       WHERE rv.recipe_version_id = ? AND rv.approved = 1
         AND va.verification = 'approved'
         AND va.rights IN ('bundled', 'licensed', 'user_owned_confirmed', 'source_embed_allowed')`,
    ).all(versionId) as Array<{
      stepId: string | null;
      kind: string;
      purpose: string;
      verification: string;
      rights: string;
      attribution: string;
    }>;
    const visualMap = new Map(visuals.filter((row) => row.stepId).map((row) => [row.stepId!, row]));
    const warningRow = this.client.prepare(
      "SELECT warnings_json AS warningsJson FROM import_jobs WHERE source_id = ? ORDER BY updated_at DESC LIMIT 1",
    ).get(version.sourceId) as { warningsJson: string } | undefined;

    return {
      versionId: version.versionId,
      recipeId: version.recipeId,
      title: version.title,
      spokenDishEnglish: guidanceMap.get("recipe.dish:en-IN") ?? version.title,
      spokenDishHindi: guidanceMap.get("recipe.dish:hi-IN") ?? "",
      servings: version.servings,
      reviewStatus: version.reviewStatus,
      source: {
        type: version.sourceType,
        canonicalUrl: version.canonicalUrl,
        attribution: version.attribution,
        author: version.author,
      },
      warnings: warningRow ? safeWarnings(warningRow.warningsJson) : [],
      ingredients: ingredients.map((ingredient) => {
        const quantity = ingredient.quantityJson
          ? JSON.parse(ingredient.quantityJson) as Parameters<typeof quantityToEditableText>[0]
          : null;
        const unit = ingredient.unitJson
          ? (JSON.parse(ingredient.unitJson) as { canonical?: string }).canonical ?? null
          : null;
        return {
          id: ingredient.id,
          originalText: ingredient.originalText,
          displayLine: ingredient.displayLine,
          ingredientText: ingredient.ingredientText,
          quantityText: quantityToEditableText(quantity),
          unit,
          confidence: ingredient.confidence,
          evidence: safeEvidence(ingredient.evidenceJson),
          spokenEnglish: guidanceMap.get(`ingredient.${ingredient.id}:en-IN`) ?? ingredient.displayLine,
          spokenHindi: guidanceMap.get(`ingredient.${ingredient.id}:hi-IN`) ?? "",
        };
      }),
      steps: steps.map((step) => {
        const visual = visualMap.get(step.id);
        return {
          id: step.id,
          originalText: step.originalText,
          shortText: step.shortText,
          detailedText: step.detailedText,
          confidence: step.confidence,
          evidence: safeEvidence(step.evidenceJson),
          spokenEnglish: guidanceMap.get(`cook.step.${step.id}:en-IN`) ?? step.detailedText,
          spokenHindi: guidanceMap.get(`cook.step.${step.id}:hi-IN`) ?? "",
          visual: visual
            ? { ...visual, fallback: false }
            : {
                kind: "action_icon",
                purpose: "show_action",
                verification: "approved",
                rights: "bundled",
                attribution: "Recipe App verified action-icon fallback",
                fallback: true,
              },
        };
      }),
    };
  }

  async updateDraft(actor: HouseholdActor, versionId: string, input: DraftEditInput): Promise<void> {
    this.requireHomeowner(actor);
    authorize(actor, "recipe:review", { householdId: actor.householdId });
    const parsed = DraftEditInputSchema.parse(input);
    const current = this.client.prepare(
      "SELECT review_status AS reviewStatus FROM recipe_versions WHERE id = ? AND household_id = ?",
    ).get(versionId, actor.householdId) as { reviewStatus: RecipeStatus } | undefined;
    if (!current) throw new HomeownerValidationError("Recipe not found.", "RECIPE_NOT_FOUND", 404);
    if (current.reviewStatus === "published") {
      throw new HomeownerValidationError("Published versions cannot be changed.", "RECIPE_VERSION_LOCKED", 409);
    }

    this.client.transaction(() => {
      this.client.prepare(
        "UPDATE recipe_versions SET title = ?, servings = ?, review_status = 'needs_review' WHERE id = ?",
      ).run(parsed.title, parsed.servings, versionId);
      this.client.prepare(
        `UPDATE recipe_sources SET title = ?
         WHERE id = (SELECT source_id FROM recipe_versions WHERE id = ?)`,
      ).run(parsed.title, versionId);
      this.replaceDraftContent(
        versionId,
        { spokenEnglish: parsed.spokenDishEnglish, spokenHindi: parsed.spokenDishHindi },
        parsed.ingredients,
        parsed.steps,
        parsed.reviewConfirmed,
      );
    })();
  }

  async publishDraft(actor: HouseholdActor, versionId: string, confirmed: boolean): Promise<void> {
    this.requireHomeowner(actor);
    authorize(actor, "recipe:publish", { householdId: actor.householdId });
    const row = this.client.prepare(
      `SELECT v.recipe_id AS recipeId, v.source_id AS sourceId, v.review_status AS reviewStatus,
              (SELECT COUNT(*) FROM recipe_ingredients i WHERE i.recipe_version_id = v.id) AS ingredientCount,
              (SELECT COUNT(*) FROM recipe_steps s WHERE s.recipe_version_id = v.id) AS stepCount
       FROM recipe_versions v WHERE v.id = ? AND v.household_id = ?`,
    ).get(versionId, actor.householdId) as {
      recipeId: string;
      sourceId: string;
      reviewStatus: RecipeStatus;
      ingredientCount: number;
      stepCount: number;
    } | undefined;
    if (!row) throw new HomeownerValidationError("Recipe not found.", "RECIPE_NOT_FOUND", 404);
    if (row.reviewStatus === "published") return;
    if (!confirmed) {
      throw new HomeownerValidationError(
        "Confirm that you reviewed the ingredients, steps, spoken guidance, and visual fallbacks.",
        "REVIEW_CONFIRMATION_REQUIRED",
      );
    }
    if (row.ingredientCount === 0 || row.stepCount === 0) {
      throw new HomeownerValidationError(
        "Add at least one ingredient and one cooking step before publishing.",
        "CORE_LISTS_REQUIRED",
      );
    }
    const requiredGuidanceCount = 1 + row.ingredientCount + row.stepCount;
    const guidanceByLocale = this.client.prepare(
      `SELECT locale, COUNT(DISTINCT guidance_key) AS guidanceCount
       FROM spoken_guidance
       WHERE recipe_version_id = ? AND review_status = 'reviewed'
       GROUP BY locale`,
    ).all(versionId) as Array<{ locale: string; guidanceCount: number }>;
    const guidanceCounts = new Map(guidanceByLocale.map((item) => [item.locale, item.guidanceCount]));
    if (
      guidanceCounts.get("en-IN") !== requiredGuidanceCount
      || guidanceCounts.get("hi-IN") !== requiredGuidanceCount
    ) {
      throw new HomeownerValidationError(
        "Review exact English and Hindi speech for the dish, every ingredient, and every cooking step before publishing.",
        "BILINGUAL_GUIDANCE_REQUIRED",
      );
    }
    const now = new Date().toISOString();
    this.client.transaction(() => {
      this.client.prepare(
        `UPDATE recipe_versions
         SET review_status = 'published', reviewed_by = ?, published_at = ?
         WHERE id = ?`,
      ).run(actor.userId, now, versionId);
      this.client.prepare(
        "UPDATE recipes SET status = 'published', current_version_id = ? WHERE id = ?",
      ).run(versionId, row.recipeId);
      this.client.prepare(
        "UPDATE spoken_guidance SET review_status = 'reviewed', reviewed = 1 WHERE recipe_version_id = ?",
      ).run(versionId);
      this.client.prepare(
        "UPDATE import_jobs SET stage = 'ready', updated_at = ? WHERE source_id = ? AND status = 'succeeded'",
      ).run(now, row.sourceId);
    })();
  }

  async listHousehelp(actor: HouseholdActor): Promise<Array<{ id: string; name: string; spokenLocale: string }>> {
    this.requireHomeowner(actor);
    authorize(actor, "household:manage", { householdId: actor.householdId });
    return this.client.prepare(
      `SELECT u.id, u.name, u.spoken_locale AS spokenLocale
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ? AND m.role = 'househelp' AND m.status = 'active'
       ORDER BY u.name`,
    ).all(actor.householdId) as Array<{ id: string; name: string; spokenLocale: string }>;
  }

  async createAssignment(actor: HouseholdActor, input: AssignmentInput): Promise<{ id: string; guidanceReady: boolean }> {
    this.requireHomeowner(actor);
    authorize(actor, "assignment:manage", { householdId: actor.householdId });
    const parsed = AssignmentInputSchema.parse(input);
    if ((parsed.notesEnglish || parsed.notesHindi) && !parsed.noteReviewConfirmed) {
      throw new HomeownerValidationError(
        "Confirm that the homeowner note was reviewed in both spoken languages, or leave both notes blank.",
        "NOTE_REVIEW_REQUIRED",
      );
    }
    if (Boolean(parsed.notesEnglish) !== Boolean(parsed.notesHindi)) {
      throw new HomeownerValidationError(
        "Add reviewed English and Hindi wording for the homeowner note, or leave both blank.",
        "BILINGUAL_NOTE_REQUIRED",
      );
    }
    const version = this.client.prepare(
      "SELECT review_status AS reviewStatus FROM recipe_versions WHERE id = ? AND household_id = ?",
    ).get(parsed.recipeVersionId, actor.householdId) as { reviewStatus: RecipeStatus } | undefined;
    if (!version || version.reviewStatus !== "published") {
      throw new HomeownerValidationError(
        "Publish this reviewed recipe before assigning it.",
        "PUBLISHED_VERSION_REQUIRED",
      );
    }
    const assignee = this.client.prepare(
      `SELECT 1 FROM memberships
       WHERE user_id = ? AND household_id = ? AND role = 'househelp' AND status = 'active'`,
    ).get(parsed.assigneeId, actor.householdId);
    if (!assignee) {
      throw new HomeownerValidationError("Choose an active househelp member.", "ASSIGNEE_NOT_FOUND", 404);
    }

    const guidanceCounts = this.client.prepare(
      `SELECT
         (SELECT 1 + COUNT(*) FROM recipe_ingredients WHERE recipe_version_id = ?)
           + (SELECT COUNT(*) FROM recipe_steps WHERE recipe_version_id = ?) AS requiredCount,
         (SELECT COUNT(DISTINCT guidance_key) FROM spoken_guidance
          WHERE recipe_version_id = ? AND locale = 'en-IN' AND review_status = 'reviewed') AS englishCount,
         (SELECT COUNT(DISTINCT guidance_key) FROM spoken_guidance
          WHERE recipe_version_id = ? AND locale = 'hi-IN' AND review_status = 'reviewed') AS hindiCount`,
    ).get(parsed.recipeVersionId, parsed.recipeVersionId, parsed.recipeVersionId, parsed.recipeVersionId) as {
      requiredCount: number;
      englishCount: number;
      hindiCount: number;
    };
    const guidanceReady = guidanceCounts.requiredCount > 2
      && guidanceCounts.englishCount === guidanceCounts.requiredCount
      && guidanceCounts.hindiCount === guidanceCounts.requiredCount;
    if (!guidanceReady) {
      throw new HomeownerValidationError(
        "Review complete English and Hindi speech before assigning this recipe.",
        "BILINGUAL_GUIDANCE_REQUIRED",
      );
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    this.client.transaction(() => {
      this.client.prepare(
        `INSERT INTO cooking_assignments
           (id, household_id, recipe_version_id, assignee_id, created_by, scheduled_date,
            meal_slot, target_time, target_servings, selected_locale, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      ).run(
        id,
        actor.householdId,
        parsed.recipeVersionId,
        parsed.assigneeId,
        actor.userId,
        parsed.scheduledDate,
        parsed.mealSlot,
        parsed.targetTime || null,
        parsed.targetServings,
        parsed.selectedLocale,
        parsed.selectedLocale === "hi-IN" ? parsed.notesHindi : parsed.notesEnglish,
        now,
        now,
      );
      const insertSnapshot = this.client.prepare(
        `INSERT INTO househelp_assignment_snapshots
           (assignment_id, recipe_version_id, locale, snapshot_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const locale of ["en-IN", "hi-IN"] as const) {
        const snapshot = buildAssignmentSnapshot(this.client, {
          assignmentId: id,
          assigneeId: parsed.assigneeId,
          recipeVersionId: parsed.recipeVersionId,
          mealSlot: parsed.mealSlot,
          targetTime: parsed.targetTime || null,
          targetServings: parsed.targetServings,
          selectedLocale: locale,
          notes: { "en-IN": parsed.notesEnglish ?? "", "hi-IN": parsed.notesHindi ?? "" },
        });
        insertSnapshot.run(id, parsed.recipeVersionId, locale, JSON.stringify(snapshot), now, now);
      }
    })();
    return { id, guidanceReady };
  }
}
