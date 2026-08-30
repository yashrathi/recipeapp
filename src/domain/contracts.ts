import { z } from "zod";

export const IdentifierSchema = z.string().trim().min(1).max(128);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const LocaleSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);
export const ConfidenceSchema = z.number().min(0).max(1);

export const HouseholdRoleSchema = z.enum(["homeowner", "househelp"]);
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;

export const RecipeSourceSchema = z.object({
  id: IdentifierSchema,
  householdId: IdentifierSchema,
  type: z.enum(["web", "youtube", "manual"]),
  canonicalUrl: z.url().nullable(),
  title: z.string().trim().min(1).max(300).nullable(),
  author: z.string().trim().max(200).nullable(),
  attribution: z.string().trim().min(1).max(500),
  fetchedAt: IsoDateTimeSchema.nullable(),
});
export type RecipeSource = z.infer<typeof RecipeSourceSchema>;

export const ExtractionWarningSchema = z.object({
  fieldPath: z.string().trim().min(1),
  category: z.enum([
    "missing",
    "ambiguous",
    "unsupported",
    "source_conflict",
  ]),
  severity: z.enum(["info", "warning", "blocking"]),
  message: z.string().trim().min(1).max(500),
  resolved: z.boolean(),
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
  extractorVersion: z.string().trim().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ImportJob = z.infer<typeof ImportJobSchema>;

export const RecipeIngredientSchema = z.object({
  id: IdentifierSchema,
  displayLine: z.string().trim().min(1).max(500),
  canonicalName: z.string().trim().min(1).max(200).nullable(),
  quantity: z.number().positive().nullable(),
  unit: z.string().trim().min(1).max(50).nullable(),
  preparationNote: z.string().trim().max(200).nullable(),
  optional: z.boolean(),
  order: z.number().int().nonnegative(),
  confidence: ConfidenceSchema,
  evidence: z.string().trim().max(1000).nullable(),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeStepSchema = z.object({
  id: IdentifierSchema,
  order: z.number().int().nonnegative(),
  shortText: z.string().trim().min(1).max(280),
  detailedText: z.string().trim().min(1).max(2000),
  action: z.string().trim().min(1).max(80).nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  temperatureCelsius: z.number().int().min(0).max(500).nullable(),
  ingredientIds: z.array(IdentifierSchema),
  confidence: ConfidenceSchema,
  evidence: z.string().trim().max(1000).nullable(),
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

export const RecipeVersionSchema = z
  .object({
    id: IdentifierSchema,
    recipeId: IdentifierSchema,
    sourceId: IdentifierSchema,
    householdId: IdentifierSchema,
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(300),
    servings: z.number().positive().nullable(),
    prepMinutes: z.number().int().nonnegative().nullable(),
    cookMinutes: z.number().int().nonnegative().nullable(),
    language: LocaleSchema,
    reviewStatus: z.enum(["draft", "needs_review", "reviewed", "published"]),
    reviewedBy: IdentifierSchema.nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    ingredients: z.array(RecipeIngredientSchema).min(1),
    steps: z.array(RecipeStepSchema).min(1),
  })
  .superRefine((recipe, context) => {
    const ingredientIds = new Set(recipe.ingredients.map(({ id }) => id));
    const duplicateOrder = (orders: number[]) => new Set(orders).size !== orders.length;

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
    if (recipe.reviewStatus === "published" && (!recipe.reviewedBy || !recipe.publishedAt)) {
      context.addIssue({
        code: "custom",
        path: ["reviewStatus"],
        message: "Published recipes require reviewer and publication metadata.",
      });
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
  notes: z.string().trim().max(1000).nullable(),
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
  stepId: IdentifierSchema.nullable(),
  interfaceKey: z.string().trim().min(1).max(100).nullable(),
  locale: LocaleSchema,
  speakableText: z.string().trim().min(1).max(2000),
  voiceVersion: z.string().trim().min(1),
  generationStatus: z.enum(["pending", "ready", "failed"]),
  cacheKey: z.string().trim().min(1).max(500).nullable(),
  reviewed: z.boolean(),
});
export type SpokenGuidance = z.infer<typeof SpokenGuidanceSchema>;

export const VisualAssetSchema = z.object({
  id: IdentifierSchema,
  type: z.enum(["photo", "icon", "illustration", "video", "embed"]),
  sourceUrl: z.url().nullable(),
  owner: z.string().trim().min(1).max(200),
  attribution: z.string().trim().min(1).max(500),
  rightsStatus: z.enum(["verified", "pending", "rejected"]),
  altText: z.string().trim().min(1).max(500),
  spokenDescription: z.string().trim().min(1).max(500),
  verificationStatus: z.enum(["verified", "pending", "rejected"]),
  reviewedBy: IdentifierSchema.nullable(),
});
export type VisualAsset = z.infer<typeof VisualAssetSchema>;

export const DomainContractSchemas = {
  assignment: CookingAssignmentSchema,
  guidance: SpokenGuidanceSchema,
  importJob: ImportJobSchema,
  recipeSource: RecipeSourceSchema,
  recipeVersion: RecipeVersionSchema,
  visualAsset: VisualAssetSchema,
} as const;
