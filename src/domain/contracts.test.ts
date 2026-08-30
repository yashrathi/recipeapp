import { describe, expect, it } from "vitest";

import { RecipeVersionSchema, SpokenGuidanceSchema, VisualAssetSchema } from "./contracts";

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
      displayLine: "1 cup spinach",
      canonicalName: "spinach",
      quantity: 1,
      unit: "cup",
      preparationNote: null,
      optional: false,
      order: 0,
      confidence: 0.99,
      evidence: "Recipe structured data",
    },
  ],
  steps: [
    {
      id: "add-spinach",
      order: 0,
      shortText: "Add spinach.",
      detailedText: "Add one cup of spinach to the pan.",
      action: "add",
      durationSeconds: null,
      temperatureCelsius: null,
      ingredientIds: ["spinach"],
      confidence: 0.95,
      evidence: "Recipe instruction 1",
    },
  ],
} as const;

describe("domain contracts", () => {
  it("accepts a source-aware reviewed recipe version", () => {
    expect(RecipeVersionSchema.parse(publishedRecipe).title).toBe("Palak");
  });

  it("rejects published content without review metadata", () => {
    const result = RecipeVersionSchema.safeParse({
      ...publishedRecipe,
      reviewedBy: null,
      publishedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a step that refers to an unknown ingredient", () => {
    const result = RecipeVersionSchema.safeParse({
      ...publishedRecipe,
      steps: [{ ...publishedRecipe.steps[0], ingredientIds: ["not-in-recipe"] }],
    });
    expect(result.success).toBe(false);
  });

  it("keeps speech and visual review state explicit", () => {
    expect(
      SpokenGuidanceSchema.parse({
        id: "speech-1",
        recipeVersionId: "version-1",
        stepId: "add-spinach",
        interfaceKey: null,
        locale: "hi-IN",
        speakableText: "अब एक कप पालक डालें।",
        voiceVersion: "fixture-v1",
        generationStatus: "ready",
        cacheKey: "hi-IN/add-spinach",
        reviewed: true,
      }).reviewed,
    ).toBe(true);

    expect(
      VisualAssetSchema.parse({
        id: "visual-1",
        type: "photo",
        sourceUrl: "https://example.com/licensed-spinach.jpg",
        owner: "Example library",
        attribution: "Licensed fixture",
        rightsStatus: "verified",
        altText: "Fresh spinach leaves",
        spokenDescription: "Spinach leaves",
        verificationStatus: "verified",
        reviewedBy: "homeowner-1",
      }).rightsStatus,
    ).toBe("verified");
  });
});
