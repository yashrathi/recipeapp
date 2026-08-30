import { describe, expect, it } from "vitest";

import {
  AudioReadinessSchema,
  CookingAssignmentSchema,
  ExtractionWarningSchema,
  RecipeVersionSchema,
  SpokenGuidanceSchema,
  VisualAssetSchema,
  isVisualAssetEligible,
} from "./contracts";

const CONTENT_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const publishedRecipe = {
  id: "version-1",
  recipeId: "recipe-1",
  sourceId: "source-1",
  householdId: "household-1",
  version: 1,
  title: "Palak",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 15,
  language: "en-IN",
  reviewStatus: "published",
  reviewedBy: "homeowner-1",
  publishedAt: "2026-08-30T10:00:00.000+05:30",
  ingredients: [
    {
      id: "spinach",
      originalText: "1 cup spinach",
      displayText: "1 cup spinach",
      displayLine: "1 cup spinach",
      ingredientText: "spinach",
      canonicalName: "spinach",
      quantity: { kind: "exact", decimal: "1", sourceText: "1", confidence: 0.9 },
      unit: { canonical: "cup", sourceText: "cup", confidence: 0.9 },
      preparationNote: null,
      optional: false,
      order: 1,
      confidence: 0.99,
      evidence: [],
    },
  ],
  steps: [
    {
      id: "add-spinach",
      order: 1,
      section: null,
      originalText: "Add one cup of spinach to the pan.",
      displayText: "Add one cup of spinach to the pan.",
      shortText: "Add spinach.",
      detailedText: "Add one cup of spinach to the pan.",
      action: "add",
      durationSeconds: null,
      temperatureCelsius: null,
      ingredientIds: ["spinach"],
      confidence: 0.95,
      evidence: [],
    },
  ],
} as const;

describe("domain contracts", () => {
  it("accepts a source-aware reviewed recipe version", () => {
    expect(RecipeVersionSchema.parse(publishedRecipe).title).toBe("Palak");
  });

  it("accepts nonblank persisted recipe, spoken, and assignment text without per-field character caps", () => {
    const longText = `Detailed homeowner guidance. ${"Continue with the reviewed instruction. ".repeat(180)}`.trim();
    const recipe = RecipeVersionSchema.parse({
      ...publishedRecipe,
      title: longText,
      ingredients: [{
        ...publishedRecipe.ingredients[0],
        originalText: longText,
        displayText: longText,
        displayLine: longText,
        ingredientText: longText,
        preparationNote: longText,
      }],
      steps: [{
        ...publishedRecipe.steps[0],
        section: longText,
        originalText: longText,
        displayText: longText,
        shortText: longText,
        detailedText: longText,
      }],
    });
    expect(recipe.steps[0]?.shortText).toBe(longText);

    expect(SpokenGuidanceSchema.parse({
      id: "speech-long",
      recipeVersionId: "version-1",
      guidanceKey: "cook.step.long",
      stepId: "add-spinach",
      locale: "en-IN",
      speakableText: longText,
      contentHash: CONTENT_HASH,
      voiceVersion: "fixture-v1",
      reviewStatus: "reviewed",
      audioAssetId: null,
      cacheStatus: "not_cached",
    }).speakableText).toBe(longText);

    expect(CookingAssignmentSchema.parse({
      id: "assignment-long",
      householdId: "household-1",
      recipeVersionId: "version-1",
      assigneeId: "househelp-1",
      createdBy: "homeowner-1",
      scheduledDate: "2026-09-01",
      mealSlot: "dinner",
      targetTime: null,
      targetServings: 2,
      selectedLocale: "en-IN",
      notes: longText,
      status: "scheduled",
      createdAt: "2026-08-30T10:00:00.000+05:30",
      updatedAt: "2026-08-30T10:00:00.000+05:30",
    }).notes).toBe(longText);
  });

  it("rejects published content without review metadata", () => {
    const result = RecipeVersionSchema.safeParse({
      ...publishedRecipe,
      reviewedBy: null,
      publishedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a partial needs-review draft with exactly one core list", () => {
    const result = RecipeVersionSchema.safeParse({
      ...publishedRecipe,
      reviewStatus: "needs_review",
      reviewedBy: null,
      publishedAt: null,
      steps: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a published version missing either core list", () => {
    expect(RecipeVersionSchema.safeParse({ ...publishedRecipe, steps: [] }).success).toBe(false);
    expect(RecipeVersionSchema.safeParse({ ...publishedRecipe, ingredients: [] }).success).toBe(
      false,
    );
  });

  it("rejects a step that refers to an unknown ingredient", () => {
    const result = RecipeVersionSchema.safeParse({
      ...publishedRecipe,
      steps: [{ ...publishedRecipe.steps[0], ingredientIds: ["not-in-recipe"] }],
    });
    expect(result.success).toBe(false);
  });

  it("uses the closed v1 warning code, severity, field path and evidence shape", () => {
    const warning = {
      code: "CORE_FIELD_MISSING",
      severity: "error",
      fieldPath: "/recipe/steps",
      message: "The draft is missing ingredients or cooking steps.",
      evidence: [],
    };
    expect(ExtractionWarningSchema.parse(warning).code).toBe("CORE_FIELD_MISSING");
    expect(
      ExtractionWarningSchema.safeParse({ ...warning, code: "UNKNOWN_WARNING" }).success,
    ).toBe(false);
    expect(ExtractionWarningSchema.safeParse({ ...warning, severity: "warning" }).success).toBe(
      false,
    );
  });

  it("keeps approved speech and visual content identity explicit", () => {
    expect(
      SpokenGuidanceSchema.parse({
        id: "speech-1",
        recipeVersionId: "version-1",
        guidanceKey: "cook.step_add",
        stepId: "add-spinach",
        locale: "hi-IN",
        speakableText: "अब एक कप पालक डालें।",
        contentHash: CONTENT_HASH,
        voiceVersion: "fixture-v1",
        reviewStatus: "reviewed",
        audioAssetId: "audio-hi-add-spinach",
        cacheStatus: "cached",
      }).contentHash,
    ).toBe(CONTENT_HASH);

    const visual = VisualAssetSchema.parse({
        id: "visual-1",
        kind: "ingredient_photo",
        purpose: "identify_ingredient",
        sourceUrl: "https://example.com/licensed-spinach.jpg",
        owner: "Example library",
        attribution: "Licensed fixture",
        verification: "approved",
        rights: "licensed",
        contentHash: CONTENT_HASH,
        assetVersion: "fixture-v1",
        accessibleNameMessageId: "visual.spinach.name",
        spokenDescriptionMessageId: "visual.spinach.description",
        reviewedBy: "homeowner-1",
      });
    expect(visual.rights).toBe("licensed");
    expect(isVisualAssetEligible(visual)).toBe(true);
    expect(isVisualAssetEligible({ ...visual, rights: "prohibited" })).toBe(false);

    expect(
      AudioReadinessSchema.parse({
        id: "readiness-1",
        assignmentId: "assignment-1",
        recipeVersionId: "version-1",
        locale: "hi-IN",
        snapshotContentHash: CONTENT_HASH,
        status: "ready_cached_audio",
        requiredGuidanceCount: 1,
        cachedAudioCount: 1,
        compatibleDeviceVoice: false,
        reviewedTextStored: true,
        recipeSnapshotStored: true,
        visualMetadataStored: true,
        checkedAt: "2026-08-30T10:00:00.000+05:30",
        failureReason: null,
      }).status,
    ).toBe("ready_cached_audio");
  });
});
