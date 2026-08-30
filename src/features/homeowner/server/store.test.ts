import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { HouseholdActor } from "@/server/auth/policy";
import { AuthorizationError } from "@/server/auth/policy";
import { createDatabaseHandle } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { DEMO_IDS, seedDemoData } from "@/server/db/seed";
import { HomeownerStore } from "@/features/homeowner/server/store";
import { HousehelpRepository } from "@/features/househelp/server/repository";
import type { HindiTranslator } from "@/server/translation/hindi";

const HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const homeowner: HouseholdActor = {
  userId: DEMO_IDS.homeowner,
  householdId: DEMO_IDS.household,
  membershipId: DEMO_IDS.homeownerMembership,
  role: "homeowner",
};
const househelp: HouseholdActor = {
  userId: DEMO_IDS.househelp,
  householdId: DEMO_IDS.household,
  membershipId: DEMO_IDS.househelpMembership,
  role: "househelp",
};

const hindiByEnglish = new Map([
  ["Confirmed rice", "पक्का चावल"],
  ["1 cup rice", "एक कप चावल"],
  ["Cook the rice", "चावल पकाएँ।"],
  ["Use less chilli", "मिर्च कम डालें"],
]);
const hindiTranslator: HindiTranslator = {
  async translate(items) {
    return items.map((item) => ({
      key: item.key,
      hindi: hindiByEnglish.get(item.english) ?? `हिन्दी: ${item.english}`,
    }));
  },
};

const partialImport = {
  contractVersion: "web-recipe-import/v1" as const,
  extractorVersion: "fixture-v1",
  status: "partial_success" as const,
  reviewState: "needs_review" as const,
  source: {
    requestedUrl: "https://recipes.example.test/palak",
    finalUrl: "https://recipes.example.test/palak",
    canonicalUrl: "https://recipes.example.test/palak",
    title: null,
    author: null,
    publisher: null,
    method: "json_ld" as const,
  },
  recipe: {
    title: {
      originalText: "Palak",
      displayText: "Palak",
      confidence: 0.95,
      evidence: [{ method: "json_ld" as const, locator: "script[0]#/name", sourceText: "Palak", sourceTextSha256: HASH }],
    },
    servings: 2,
    ingredients: [{
      order: 1,
      originalText: "1 cup spinach",
      displayText: "1 cup spinach",
      quantity: { kind: "exact" as const, decimal: "1", sourceText: "1", confidence: 0.9 },
      unit: { canonical: "cup" as const, sourceText: "cup", confidence: 0.9 },
      ingredientText: "spinach",
      preparationNote: null,
      confidence: 0.95,
      evidence: [{ method: "json_ld" as const, locator: "script[0]#/recipeIngredient/0", sourceText: "1 cup spinach", sourceTextSha256: HASH }],
    }],
    steps: [],
  },
  warnings: [{
    code: "CORE_FIELD_MISSING" as const,
    severity: "error" as const,
    fieldPath: "/recipe/steps",
    message: "The draft is missing ingredients or cooking steps.",
    evidence: [],
  }],
};

describe("homeowner recipe service", () => {
  let client: Database.Database;
  let store: HomeownerStore;

  beforeEach(() => {
    const handle = createDatabaseHandle(":memory:");
    client = handle.client;
    runMigrations(client);
    seedDemoData(client);
    store = new HomeownerStore(handle, hindiTranslator);
  });

  afterEach(() => client.close());

  it("denies househelp access to homeowner reads and mutations", async () => {
    await expect(store.getDashboard(househelp)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(store.createManualDraft(househelp, {
      title: "Denied recipe",
      servings: 2,
      ingredients: ["1 cup spinach"],
      steps: ["Wash spinach"],
    })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("creates a usable manual fallback without claiming extracted evidence", async () => {
    const versionId = await store.createManualDraft(homeowner, {
      title: "Family dal",
      servings: 4,
      ingredients: ["1 cup lentils", "3 cups water"],
      steps: ["Wash the lentils", "Simmer until soft"],
    });
    const draft = await store.getRecipe(homeowner, versionId);
    expect(draft.source.type).toBe("manual");
    expect(draft.ingredients.map((item) => item.originalText)).toEqual(["1 cup lentils", "3 cups water"]);
    expect(draft.ingredients[0]?.evidence).toEqual([]);
    expect(draft.steps[0]?.spokenEnglish).toBe("Wash the lentils");
  });

  it("preserves a partial import for review and blocks publication without both core lists", async () => {
    const versionId = await store.createImportedDraft(homeowner, { result: partialImport });
    const draft = await store.getRecipe(homeowner, versionId);
    expect(draft.ingredients[0]).toMatchObject({ originalText: "1 cup spinach", quantityText: "1", unit: "cup" });
    expect(draft.steps).toEqual([]);
    expect(draft.warnings[0]?.code).toBe("CORE_FIELD_MISSING");
    await expect(store.publishDraft(homeowner, versionId, true)).rejects.toMatchObject({ code: "CORE_LISTS_REQUIRED" });
  });

  it("requires explicit review confirmation before publication", async () => {
    const versionId = await store.createManualDraft(homeowner, {
      title: "Confirmed rice",
      servings: 2,
      ingredients: ["1 cup rice"],
      steps: ["Cook the rice"],
    });
    await expect(store.publishDraft(homeowner, versionId, false)).rejects.toMatchObject({ code: "REVIEW_CONFIRMATION_REQUIRED" });
  });

  it("publishes from English-only input by generating every missing Hindi field", async () => {
    const versionId = await store.createManualDraft(homeowner, {
      title: "Confirmed rice",
      servings: 2,
      ingredients: ["1 cup rice"],
      steps: ["Cook the rice"],
    });
    const draft = await store.getRecipe(homeowner, versionId);
    await store.updateDraft(homeowner, versionId, {
      title: draft.title,
      servings: draft.servings,
      spokenDishEnglish: draft.title,
      spokenDishHindi: "",
      reviewConfirmed: true,
      ingredients: draft.ingredients.map((ingredient) => ({
        ...ingredient,
        unit: ingredient.unit as "cup" | null,
      })),
      steps: draft.steps,
    });
    await store.publishDraft(homeowner, versionId, true);
    await expect(store.getRecipe(homeowner, versionId)).resolves.toMatchObject({
      reviewStatus: "published",
      spokenDishHindi: "पक्का चावल",
      ingredients: [{ spokenHindi: "एक कप चावल" }],
      steps: [{ spokenHindi: "चावल पकाएँ।" }],
    });
  });

  it("publishes a corrected partial draft and assigns the immutable version", async () => {
    const versionId = await store.createImportedDraft(homeowner, { result: partialImport });
    const draft = await store.getRecipe(homeowner, versionId);
    await store.updateDraft(homeowner, versionId, {
      title: draft.title,
      servings: draft.servings,
      spokenDishEnglish: "spinach",
      spokenDishHindi: "पालक",
      reviewConfirmed: true,
      ingredients: draft.ingredients.map((ingredient) => ({
        id: ingredient.id,
        originalText: ingredient.originalText,
        displayLine: ingredient.displayLine,
        ingredientText: ingredient.ingredientText,
        quantityText: ingredient.quantityText,
        unit: ingredient.unit as "cup",
        spokenEnglish: "one cup of spinach",
        spokenHindi: "एक कप पालक",
      })),
      steps: [{
        id: "homeowner-step-1",
        originalText: "",
        shortText: "Add spinach",
        detailedText: "Add the spinach and cook for two minutes.",
        spokenEnglish: "Add the spinach and cook for two minutes.",
        spokenHindi: "पालक डालें और दो मिनट पकाएँ।",
      }],
    });
    await store.publishDraft(homeowner, versionId, true);
    await expect(store.getRecipe(homeowner, versionId)).resolves.toMatchObject({ reviewStatus: "published" });

    const assignment = await store.createAssignment(homeowner, {
      recipeVersionId: versionId,
      assigneeId: DEMO_IDS.househelp,
      scheduledDate: "2026-09-01",
      mealSlot: "dinner",
      targetTime: "19:30",
      targetServings: 3,
      selectedLocale: "hi-IN",
      notesEnglish: "Use less chilli",
      notesHindi: null,
      noteReviewConfirmed: true,
    });
    expect(assignment.guidanceReady).toBe(true);
    expect(client.prepare("SELECT selected_locale, target_servings FROM cooking_assignments WHERE id = ?").get(assignment.id)).toMatchObject({ selected_locale: "hi-IN", target_servings: 3 });
    expect(client.prepare(
      "SELECT COUNT(*) AS count FROM househelp_assignment_snapshots WHERE assignment_id = ?",
    ).get(assignment.id)).toEqual({ count: 2 });
    const househelpView = new HousehelpRepository(client).getVisible(househelp, assignment.id);
    expect(househelpView?.snapshot).toMatchObject({
      assignment: {
        id: assignment.id,
        recipeVersionId: versionId,
        translationStatus: { "hi-IN": "auto_translated" },
      },
      translations: {
        "en-IN": { dish: "spinach", note: "Use less chilli" },
        "hi-IN": { dish: "पालक", note: "मिर्च कम डालें" },
      },
    });
    expect(househelpView?.snapshot.translations["hi-IN"].ingredients[draft.ingredients[0]!.id]
      ?.quantitySpeech).toBe("एक कप पालक");
  });
});
