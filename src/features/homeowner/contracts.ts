import { z } from "zod";

import {
  ExtractionEvidenceSchema,
  ExtractionWarningSchema,
  MilestoneOneSpokenLocaleSchema,
  NormalizedQuantitySchema,
  NormalizedUnitSchema,
} from "@/domain/contracts";

const nullableNumberFromInput = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number().positive().nullable(),
);

export const ManualRecipeInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a recipe title."),
  servings: nullableNumberFromInput,
  ingredients: z.array(z.string().trim().min(1)).min(1, "Add at least one ingredient."),
  steps: z.array(z.string().trim().min(1)).min(1, "Add at least one cooking step."),
});
export type ManualRecipeInput = z.infer<typeof ManualRecipeInputSchema>;

export const IngredientEditSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  originalText: z.string().optional(),
  displayLine: z.string().trim().min(1),
  ingredientText: z.string().trim().min(1),
  quantityText: z.string().trim().max(100).nullable(),
  unit: z.enum([
    "teaspoon",
    "tablespoon",
    "cup",
    "milliliter",
    "liter",
    "gram",
    "kilogram",
    "ounce",
    "pound",
    "piece",
    "clove",
    "can",
    "pinch",
    "bunch",
  ]).nullable(),
  spokenEnglish: z.string().trim().min(1),
  spokenHindi: z.string().trim(),
});
export type IngredientEdit = z.infer<typeof IngredientEditSchema>;

export const StepEditSchema = z.object({
  id: z.string().trim().min(1).max(128).optional(),
  originalText: z.string().optional(),
  shortText: z.string().trim().min(1),
  detailedText: z.string().trim().min(1),
  spokenEnglish: z.string().trim().min(1),
  spokenHindi: z.string().trim(),
});
export type StepEdit = z.infer<typeof StepEditSchema>;

export const DraftEditInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a recipe title."),
  servings: nullableNumberFromInput,
  spokenDishEnglish: z.string().trim().min(1),
  spokenDishHindi: z.string().trim(),
  ingredients: z.array(IngredientEditSchema).max(500),
  steps: z.array(StepEditSchema).max(500),
  reviewConfirmed: z.boolean(),
});
export type DraftEditInput = z.infer<typeof DraftEditInputSchema>;

export const AssignmentInputSchema = z.object({
  recipeVersionId: z.string().trim().min(1).max(128),
  assigneeId: z.string().trim().min(1).max(128),
  scheduledDate: z.iso.date(),
  mealSlot: z.enum(["breakfast", "lunch", "snack", "dinner"]),
  targetTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).nullable(),
  targetServings: z.number().positive(),
  selectedLocale: MilestoneOneSpokenLocaleSchema,
  notesEnglish: z.string().trim().nullable(),
  notesHindi: z.string().trim().nullable(),
  noteReviewConfirmed: z.boolean(),
});
export type AssignmentInput = z.infer<typeof AssignmentInputSchema>;

const ImportedTextFieldSchema = z.object({
  originalText: z.string().max(5000),
  displayText: z.string().trim().min(1).max(5000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(ExtractionEvidenceSchema),
});

const ImportedIngredientSchema = z.object({
  order: z.number().int().positive(),
  originalText: z.string().min(1).max(1000),
  displayText: z.string().trim().min(1).max(1000),
  quantity: NormalizedQuantitySchema.nullable(),
  unit: NormalizedUnitSchema.nullable(),
  ingredientText: z.string().trim().min(1).max(1000),
  preparationNote: z.string().trim().max(1000).nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(ExtractionEvidenceSchema),
});

const ImportedStepSchema = z.object({
  order: z.number().int().positive(),
  section: z.string().trim().min(1).max(300).nullable(),
  originalText: z.string().min(1).max(5000),
  displayText: z.string().trim().min(1).max(5000),
  duration: z.object({ seconds: z.number().int().nonnegative().nullable() }).passthrough().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(ExtractionEvidenceSchema),
});

export const ImportedRecipeResultSchema = z.object({
  contractVersion: z.literal("web-recipe-import/v1"),
  extractorVersion: z.string().trim().min(1).max(200),
  status: z.enum(["success", "partial_success"]),
  reviewState: z.literal("needs_review"),
  source: z.object({
    requestedUrl: z.url(),
    finalUrl: z.url(),
    canonicalUrl: z.url(),
    title: ImportedTextFieldSchema.nullable().optional(),
    author: ImportedTextFieldSchema.nullable().optional(),
    publisher: ImportedTextFieldSchema.nullable().optional(),
    method: z.enum(["json_ld", "microdata", "openai"]),
    retrievalProvider: z.enum(["direct", "firecrawl"]).optional(),
    extractionProvider: z.enum(["deterministic", "openai"]).nullable().optional(),
    sourceType: z.enum(["web", "youtube"]).optional(),
    videoId: z.string().nullable().optional(),
    transcriptLanguage: z.string().nullable().optional(),
    transcriptHasTimestamps: z.boolean().nullable().optional(),
  }).passthrough(),
  recipe: z.object({
    title: ImportedTextFieldSchema,
    servings: z.number().positive().nullable().optional(),
    ingredients: z.array(ImportedIngredientSchema).max(500),
    steps: z.array(ImportedStepSchema).max(500),
  }).passthrough(),
  warnings: z.array(ExtractionWarningSchema),
}).passthrough();
export type ImportedRecipeResult = z.infer<typeof ImportedRecipeResultSchema>;

export const ImportedDraftPayloadSchema = z.object({
  jobId: z.string().trim().min(1).max(128).nullable().optional(),
  result: ImportedRecipeResultSchema,
});

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export type ImportApiInterpretation =
  | { kind: "pending"; jobId: string; stage: string }
  | { kind: "draft"; versionId: string }
  | { kind: "result"; jobId: string | null; result: ImportedRecipeResult }
  | { kind: "failure"; message: string; retryable: boolean };

export function interpretImportApiPayload(
  payload: unknown,
  responseOk = true,
): ImportApiInterpretation {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const job = asRecord(root?.job);
  const draft = asRecord(root?.draft);
  const nestedResult = data?.result ?? root?.result ?? job?.result;
  const resultCandidate = asRecord(nestedResult) ?? data ?? root;
  const apiError = asRecord(root?.error);
  const failure = asRecord(resultCandidate?.failure)
    ?? asRecord(data?.failure)
    ?? asRecord(root?.failure)
    ?? apiError;
  const message = firstString(
    failure?.message,
    apiError?.message,
    root?.message,
    root?.error,
    data?.message,
    job?.message,
  );

  if (
    !responseOk
    || data?.status === "failed"
    || resultCandidate?.status === "failure"
    || failure
  ) {
    return {
      kind: "failure",
      message: message ?? "The recipe could not be imported. You can retry or enter it manually.",
      retryable: failure?.retryable === true,
    };
  }

  const versionId = firstString(
    data?.recipeVersionId,
    root?.recipeVersionId,
    root?.draftVersionId,
    job?.recipeVersionId,
    draft?.versionId,
    draft?.id,
  );
  if (versionId) return { kind: "draft", versionId };

  const parsedResult = ImportedRecipeResultSchema.safeParse(resultCandidate);
  const jobId = firstString(data?.id, root?.jobId, root?.id, job?.id);
  if (parsedResult.success) {
    return { kind: "result", jobId, result: parsedResult.data };
  }

  if (jobId) {
    return {
      kind: "pending",
      jobId,
      stage: firstString(
        data?.stage,
        job?.stage,
        root?.stage,
        data?.status,
        job?.status,
        root?.status,
      ) ?? "queued",
    };
  }

  return {
    kind: "failure",
    message: message ?? "The import service returned an unreadable response. Try again or enter the recipe manually.",
    retryable: true,
  };
}

export function quantityToEditableText(quantity: z.infer<typeof NormalizedQuantitySchema> | null): string {
  if (!quantity) return "";
  if (quantity.kind === "range") return quantity.sourceText;
  if ("decimal" in quantity) return quantity.decimal;
  return `${quantity.numerator}/${quantity.denominator}`;
}
