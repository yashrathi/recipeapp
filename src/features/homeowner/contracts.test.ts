import { describe, expect, it } from "vitest";

import { interpretImportApiPayload } from "@/features/homeowner/contracts";

const importerResult = {
  contractVersion: "web-recipe-import/v1",
  extractorVersion: "fixture-v1",
  status: "success",
  reviewState: "needs_review",
  source: {
    requestedUrl: "https://recipes.example.test/palak-paneer",
    finalUrl: "https://recipes.example.test/palak-paneer",
    canonicalUrl: "https://recipes.example.test/palak-paneer",
    method: "json_ld",
  },
  recipe: {
    title: {
      originalText: "Palak paneer",
      displayText: "Palak paneer",
      confidence: 0.98,
      evidence: [],
    },
    servings: 4,
    ingredients: [
      {
        order: 1,
        originalText: "500 g spinach",
        displayText: "500 g spinach",
        quantity: null,
        unit: { canonical: "gram", sourceText: "g", confidence: 0.96 },
        ingredientText: "spinach",
        preparationNote: null,
        confidence: 0.96,
        evidence: [],
      },
    ],
    steps: [
      {
        order: 1,
        section: null,
        originalText: "Blanch the spinach.",
        displayText: "Blanch the spinach.",
        duration: null,
        confidence: 0.95,
        evidence: [],
      },
    ],
  },
  warnings: [],
};

describe("homeowner import API adapter", () => {
  it("turns an unavailable import API into a recoverable manual-entry state", () => {
    expect(
      interpretImportApiPayload(
        { error: "The import service is temporarily unavailable." },
        false,
      ),
    ).toEqual({
      kind: "failure",
      message: "The import service is temporarily unavailable.",
      retryable: false,
    });
  });

  it("accepts an import-owned persisted draft without duplicating it", () => {
    expect(
      interpretImportApiPayload({
        data: {
          id: "job-1",
          stage: "persist",
          status: "succeeded",
          recipeVersionId: "version-1",
          result: importerResult,
        },
        reused: false,
      }),
    ).toEqual({ kind: "draft", versionId: "version-1" });
  });

  it("reads an importer result nested inside the persisted data envelope", () => {
    expect(
      interpretImportApiPayload({
        data: {
          id: "job-2",
          stage: "extract",
          status: "succeeded",
          recipeVersionId: null,
          result: importerResult,
        },
      }),
    ).toEqual({ kind: "result", jobId: "job-2", result: importerResult });
  });

  it("keeps a persisted import on its nested job stage", () => {
    expect(
      interpretImportApiPayload({
        data: {
          id: "job-3",
          stage: "extracting",
          status: "running",
          recipeVersionId: null,
          result: null,
        },
      }),
    ).toEqual({ kind: "pending", jobId: "job-3", stage: "extracting" });
  });

  it("surfaces the importer error message and retry metadata", () => {
    expect(
      interpretImportApiPayload({
        error: {
          code: "FETCH_TIMEOUT",
          message: "The recipe website took too long to respond.",
          stage: "fetch",
          retryable: true,
        },
      }, false),
    ).toEqual({
      kind: "failure",
      message: "The recipe website took too long to respond.",
      retryable: true,
    });
  });
});
