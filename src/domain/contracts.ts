import { z } from "zod";

export const IdentifierSchema = z.string().trim().min(1).max(128);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const LocaleSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);
export const MilestoneOneSpokenLocaleSchema = z.enum(["en-IN", "hi-IN"]);
export const ConfidenceSchema = z.number().min(0).max(1);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const HouseholdRoleSchema = z.enum(["homeowner", "househelp"]);
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;

export const RecipeSourceSchema = z.object({
  id: IdentifierSchema,
  householdId: IdentifierSchema,
  type: z.enum(["web", "youtube", "manual"]),
  canonicalUrl: z.url().nullable(),
  title: z.string().trim().min(1).nullable(),
  author: z.string().trim().max(200).nullable(),
  attribution: z.string().trim().min(1).max(500),
  fetchedAt: IsoDateTimeSchema.nullable(),
});
export type RecipeSource = z.infer<typeof RecipeSourceSchema>;

export const ExtractionEvidenceSchema = z.object({
  method: z.enum(["json_ld", "microdata", "openai"]),
  locator: z.string().trim().min(1).max(500),
  sourceText: z.string().max(240),
  sourceTextSha256: Sha256Schema,
  startSeconds: z.number().int().nonnegative().optional(),
});
export type ExtractionEvidence = z.infer<typeof ExtractionEvidenceSchema>;

export const ExtractionWarningCodeSchema = z.enum([
  "SOURCE_USES_HTTP",
  "CHARSET_REPLACEMENT",
  "STRUCTURED_DATA_LIMIT_EXCEEDED",
  "JSON_LD_MALFORMED",
  "MULTIPLE_RECIPE_CANDIDATES",
  "INGREDIENT_ENTRY_UNSUPPORTED",
  "DURATION_UNPARSED",
  "TEXT_LIMIT_EXCEEDED",
  "QUANTITY_MISSING",
  "UNIT_UNRECOGNIZED",
  "CORE_FIELD_MISSING",
  "CANONICAL_URL_IGNORED",
  "AI_ASSISTED_EXTRACTION",
  "EVIDENCE_MISMATCH",
  "TRANSCRIPT_LANGUAGE_UNKNOWN",
]);

const WarningSeverityByCode = {
  SOURCE_USES_HTTP: "warning",
  CHARSET_REPLACEMENT: "warning",
  STRUCTURED_DATA_LIMIT_EXCEEDED: "warning",
  JSON_LD_MALFORMED: "warning",
  MULTIPLE_RECIPE_CANDIDATES: "warning",
  INGREDIENT_ENTRY_UNSUPPORTED: "warning",
  DURATION_UNPARSED: "warning",
  TEXT_LIMIT_EXCEEDED: "error",
  QUANTITY_MISSING: "warning",
  UNIT_UNRECOGNIZED: "warning",
  CORE_FIELD_MISSING: "error",
  CANONICAL_URL_IGNORED: "info",
  AI_ASSISTED_EXTRACTION: "info",
  EVIDENCE_MISMATCH: "warning",
  TRANSCRIPT_LANGUAGE_UNKNOWN: "warning",
} as const;

export const ExtractionWarningSchema = z
  .object({
    code: ExtractionWarningCodeSchema,
    severity: z.enum(["info", "warning", "error"]),
    fieldPath: z.string().startsWith("/").max(500),
    message: z.string().trim().min(1).max(500),
    evidence: z.array(ExtractionEvidenceSchema),
  })
  .superRefine((warning, context) => {
    if (warning.severity !== WarningSeverityByCode[warning.code]) {
      context.addIssue({
        code: "custom",
        path: ["severity"],
        message: `${warning.code} must use ${WarningSeverityByCode[warning.code]} severity.`,
      });
    }
  });

export const ImportJobSchema = z.object({
  id: IdentifierSchema,
  householdId: IdentifierSchema,
  createdBy: IdentifierSchema,
  sourceId: IdentifierSchema,
  stage: z.enum(["queued", "fetching", "extracting", "needs_review", "ready"]),
  status: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  attemptCount: z.number().int().min(0),
  errorCode: z.string().trim().min(1).max(100).nullable(),
  warnings: z.array(ExtractionWarningSchema),
  contractVersion: z.literal("web-recipe-import/v1"),
  extractorVersion: z.string().trim().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ImportJob = z.infer<typeof ImportJobSchema>;

const CanonicalDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .refine((value) => !/^0(?:\.0+)?$/.test(value), "Quantity must be greater than zero.");

const DecimalQuantityValueSchema = z.object({ decimal: CanonicalDecimalSchema });
const FractionQuantityValueSchema = z.object({
  numerator: z.number().int().safe().positive(),
  denominator: z.number().int().safe().positive(),
});
export const ExactQuantityValueSchema = z.union([
  DecimalQuantityValueSchema,
  FractionQuantityValueSchema,
]);

export const NormalizedQuantitySchema = z.union([
  z.object({
    kind: z.literal("exact"),
    decimal: CanonicalDecimalSchema,
    sourceText: z.string().trim().min(1).max(100),
    confidence: ConfidenceSchema,
  }),
  z.object({
    kind: z.literal("exact"),
    numerator: z.number().int().safe().positive(),
    denominator: z.number().int().safe().positive(),
    sourceText: z.string().trim().min(1).max(100),
    confidence: ConfidenceSchema,
  }),
  z.object({
    kind: z.literal("range"),
    min: ExactQuantityValueSchema,
    max: ExactQuantityValueSchema,
    sourceText: z.string().trim().min(1).max(100),
    confidence: ConfidenceSchema,
  }),
]);
export type NormalizedQuantity = z.infer<typeof NormalizedQuantitySchema>;

export const NormalizedUnitSchema = z.object({
  canonical: z.enum([
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
  ]),
  sourceText: z.string().trim().min(1).max(100),
  confidence: ConfidenceSchema,
});

export const RecipeIngredientSchema = z.object({
  id: IdentifierSchema,
  originalText: z.string().min(1),
  displayText: z.string().trim().min(1),
  displayLine: z.string().trim().min(1),
  ingredientText: z.string().trim().min(1),
  canonicalName: z.string().trim().min(1).max(200).nullable(),
  quantity: NormalizedQuantitySchema.nullable(),
  unit: NormalizedUnitSchema.nullable(),
  preparationNote: z.string().trim().nullable(),
  optional: z.boolean(),
  order: z.number().int().positive(),
  confidence: ConfidenceSchema,
  evidence: z.array(ExtractionEvidenceSchema),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeStepSchema = z.object({
  id: IdentifierSchema,
  order: z.number().int().positive(),
  section: z.string().trim().min(1).nullable(),
  originalText: z.string().min(1),
  displayText: z.string().trim().min(1),
  shortText: z.string().trim().min(1),
  detailedText: z.string().trim().min(1),
  action: z.string().trim().min(1).max(80).nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  temperatureCelsius: z.number().int().min(0).max(500).nullable(),
  ingredientIds: z.array(IdentifierSchema),
  confidence: ConfidenceSchema,
  evidence: z.array(ExtractionEvidenceSchema),
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

export const RecipeVersionSchema = z
  .object({
    id: IdentifierSchema,
    recipeId: IdentifierSchema,
    sourceId: IdentifierSchema,
    householdId: IdentifierSchema,
    version: z.number().int().positive(),
    title: z.string().trim().min(1),
    servings: z.number().positive().nullable(),
    prepMinutes: z.number().int().nonnegative().nullable(),
    cookMinutes: z.number().int().nonnegative().nullable(),
    language: LocaleSchema,
    reviewStatus: z.enum(["draft", "needs_review", "reviewed", "published"]),
    reviewedBy: IdentifierSchema.nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    ingredients: z.array(RecipeIngredientSchema),
    steps: z.array(RecipeStepSchema),
  })
  .superRefine((recipe, context) => {
    const ingredientIds = new Set(recipe.ingredients.map(({ id }) => id));
    const duplicateOrder = (orders: number[]) => new Set(orders).size !== orders.length;

    if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["ingredients"],
        message: "A recipe draft requires ingredients or cooking steps.",
      });
    }

    if (duplicateOrder(recipe.ingredients.map(({ order }) => order))) {
      context.addIssue({
        code: "custom",
        path: ["ingredients"],
        message: "Ingredient order values must be unique.",
      });
    }
    if (duplicateOrder(recipe.steps.map(({ order }) => order))) {
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Step order values must be unique.",
      });
    }
    recipe.steps.forEach((step, stepIndex) => {
      step.ingredientIds.forEach((ingredientId) => {
        if (!ingredientIds.has(ingredientId)) {
          context.addIssue({
            code: "custom",
            path: ["steps", stepIndex, "ingredientIds"],
            message: `Unknown ingredient reference: ${ingredientId}`,
          });
        }
      });
    });
    if (recipe.reviewStatus === "published") {
      if (recipe.ingredients.length === 0 || recipe.steps.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["reviewStatus"],
          message: "Published recipes require both ingredients and cooking steps.",
        });
      }
      if (!recipe.reviewedBy || !recipe.publishedAt) {
        context.addIssue({
          code: "custom",
          path: ["reviewStatus"],
          message: "Published recipes require reviewer and publication metadata.",
        });
      }
    }
  });
export type RecipeVersion = z.infer<typeof RecipeVersionSchema>;

export const MealSlotSchema = z.enum(["breakfast", "lunch", "snack", "dinner"]);

export const CookingAssignmentSchema = z.object({
  id: IdentifierSchema,
  householdId: IdentifierSchema,
  recipeVersionId: IdentifierSchema,
  assigneeId: IdentifierSchema,
  createdBy: IdentifierSchema,
  scheduledDate: z.iso.date(),
  mealSlot: MealSlotSchema,
  targetTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  targetServings: z.number().positive(),
  selectedLocale: MilestoneOneSpokenLocaleSchema,
  notes: z.string().trim().nullable(),
  status: z.enum([
    "scheduled",
    "acknowledged",
    "preparing",
    "cooking",
    "done",
    "blocked",
    "cancelled",
    "reassigned",
  ]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CookingAssignment = z.infer<typeof CookingAssignmentSchema>;

export const SpokenGuidanceSchema = z.object({
  id: IdentifierSchema,
  recipeVersionId: IdentifierSchema,
  guidanceKey: z.string().trim().min(1).max(200),
  stepId: IdentifierSchema.nullable(),
  locale: MilestoneOneSpokenLocaleSchema,
  speakableText: z.string().trim().min(1),
  contentHash: Sha256Schema,
  voiceVersion: z.string().trim().min(1),
  reviewStatus: z.enum(["unreviewed", "reviewed"]),
  audioAssetId: IdentifierSchema.nullable(),
  cacheStatus: z.enum(["not_cached", "cached", "failed"]),
});
export type SpokenGuidance = z.infer<typeof SpokenGuidanceSchema>;

export const VisualAssetSchema = z.object({
  id: IdentifierSchema,
  kind: z.enum(["ingredient_photo", "step_image", "action_icon", "state_icon"]),
  purpose: z.enum(["identify_ingredient", "show_result", "show_action", "show_state"]),
  sourceUrl: z.url().nullable(),
  owner: z.string().trim().min(1).max(200),
  attribution: z.string().trim().min(1).max(500),
  verification: z.enum(["approved", "unreviewed", "expired", "rejected"]),
  rights: z.enum([
    "bundled",
    "licensed",
    "user_owned_confirmed",
    "source_embed_allowed",
    "unknown",
    "prohibited",
    "expired",
  ]),
  contentHash: Sha256Schema,
  assetVersion: z.string().trim().min(1).max(100),
  accessibleNameMessageId: z.string().trim().min(1).max(200).nullable(),
  spokenDescriptionMessageId: z.string().trim().min(1).max(200).nullable(),
  reviewedBy: IdentifierSchema.nullable(),
});
export type VisualAsset = z.infer<typeof VisualAssetSchema>;

const EligibleVisualRights = new Set<VisualAsset["rights"]>([
  "bundled",
  "licensed",
  "user_owned_confirmed",
  "source_embed_allowed",
]);

export function isVisualAssetEligible(asset: VisualAsset): boolean {
  return asset.verification === "approved" && EligibleVisualRights.has(asset.rights);
}

export const AudioReadinessSchema = z
  .object({
    id: IdentifierSchema,
    assignmentId: IdentifierSchema,
    recipeVersionId: IdentifierSchema,
    locale: MilestoneOneSpokenLocaleSchema,
    snapshotContentHash: Sha256Schema,
    status: z.enum([
      "checking",
      "ready_cached_audio",
      "ready_device_tts",
      "not_ready",
    ]),
    requiredGuidanceCount: z.number().int().nonnegative(),
    cachedAudioCount: z.number().int().nonnegative(),
    compatibleDeviceVoice: z.boolean(),
    reviewedTextStored: z.boolean(),
    recipeSnapshotStored: z.boolean(),
    visualMetadataStored: z.boolean(),
    checkedAt: IsoDateTimeSchema,
    failureReason: z.string().trim().min(1).max(500).nullable(),
  })
  .superRefine((readiness, context) => {
    if (readiness.cachedAudioCount > readiness.requiredGuidanceCount) {
      context.addIssue({
        code: "custom",
        path: ["cachedAudioCount"],
        message: "Cached audio count cannot exceed required guidance count.",
      });
    }

    const snapshotReady =
      readiness.reviewedTextStored &&
      readiness.recipeSnapshotStored &&
      readiness.visualMetadataStored;
    if (
      readiness.status === "ready_cached_audio" &&
      (!snapshotReady || readiness.cachedAudioCount !== readiness.requiredGuidanceCount)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Cached-audio readiness requires the complete reviewed local snapshot.",
      });
    }
    if (
      readiness.status === "ready_device_tts" &&
      (!snapshotReady || !readiness.compatibleDeviceVoice)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Device-TTS readiness requires reviewed local text and a compatible voice.",
      });
    }
  });
export type AudioReadiness = z.infer<typeof AudioReadinessSchema>;

export const DomainContractSchemas = {
  assignment: CookingAssignmentSchema,
  audioReadiness: AudioReadinessSchema,
  guidance: SpokenGuidanceSchema,
  importJob: ImportJobSchema,
  recipeSource: RecipeSourceSchema,
  recipeVersion: RecipeVersionSchema,
  visualAsset: VisualAssetSchema,
} as const;
