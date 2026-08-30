import type Database from "better-sqlite3";

import type { AssignmentSnapshot, HousehelpLocale } from "../types";

export type CookingMeal = "breakfast" | "lunch" | "snack" | "dinner" | "anytime";

const localeMeal: Record<HousehelpLocale, Record<CookingMeal, string>> = {
  "en-IN": {
    breakfast: "breakfast",
    lunch: "lunch",
    snack: "snack",
    dinner: "dinner",
    anytime: "in-person request",
  },
  "hi-IN": {
    breakfast: "नाश्ता",
    lunch: "दोपहर का खाना",
    snack: "नाश्ता",
    dinner: "रात का खाना",
    anytime: "मौखिक अनुरोध",
  },
};

export function servingsSpeech(servings: number, locale: HousehelpLocale): string {
  const number = new Intl.NumberFormat(locale).format(servings);
  return locale === "hi-IN" ? `${number} लोगों के लिए` : `for ${number} people`;
}

function targetTimeSpeech(targetTime: string | null, locale: HousehelpLocale): string {
  if (!targetTime) return locale === "hi-IN" ? "कोई तय समय नहीं" : "no target time";
  const [hour, minute] = targetTime.split(":").map(Number);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
  return locale === "hi-IN" ? `${time} बजे` : `at ${time}`;
}

export function buildAssignmentSnapshot(
  client: Database.Database,
  input: {
    assignmentId: string;
    assigneeId: string;
    recipeVersionId: string;
    mealSlot: CookingMeal;
    targetTime: string | null;
    targetServings: number;
    selectedLocale: HousehelpLocale;
    notes: Record<HousehelpLocale, string>;
  },
): AssignmentSnapshot {
  const recipe = client.prepare(
    `SELECT v.recipe_id AS recipeId, s.attribution
     FROM recipe_versions v
     JOIN recipe_sources s ON s.id = v.source_id
     WHERE v.id = ?`,
  ).get(input.recipeVersionId) as { recipeId: string; attribution: string };
  const ingredients = client.prepare(
    `SELECT id, ingredient_text AS ingredientText, display_line AS displayLine,
            quantity_json AS quantityJson, preparation_note AS preparation
     FROM recipe_ingredients WHERE recipe_version_id = ? ORDER BY sort_order`,
  ).all(input.recipeVersionId) as Array<{
    id: string;
    ingredientText: string;
    displayLine: string;
    quantityJson: string | null;
    preparation: string | null;
  }>;
  const steps = client.prepare(
    `SELECT id, duration_seconds AS durationSeconds
     FROM recipe_steps WHERE recipe_version_id = ? ORDER BY sort_order`,
  ).all(input.recipeVersionId) as Array<{ id: string; durationSeconds: number | null }>;
  const guidanceRows = client.prepare(
    `SELECT guidance_key AS guidanceKey, locale, speakable_text AS speakableText
     FROM spoken_guidance
     WHERE recipe_version_id = ? AND review_status = 'reviewed'`,
  ).all(input.recipeVersionId) as Array<{
    guidanceKey: string;
    locale: HousehelpLocale;
    speakableText: string;
  }>;
  const guidance = new Map(
    guidanceRows.map((row) => [`${row.guidanceKey}:${row.locale}`, row.speakableText]),
  );
  const exact = (key: string, locale: HousehelpLocale) => {
    const text = guidance.get(`${key}:${locale}`);
    if (!text) throw new Error("Complete reviewed English and Hindi guidance is required.");
    return text;
  };
  const translations = (locale: HousehelpLocale): AssignmentSnapshot["translations"][HousehelpLocale] => ({
    dish: exact("recipe.dish", locale),
    meal: localeMeal[locale][input.mealSlot],
    servingsSpeech: servingsSpeech(input.targetServings, locale),
    targetTimeSpeech: targetTimeSpeech(input.targetTime, locale),
    note: input.notes[locale],
    ingredients: Object.fromEntries(ingredients.map((ingredient) => {
      const speech = exact(`ingredient.${ingredient.id}`, locale);
      return [ingredient.id, {
        singular: ingredient.ingredientText,
        plural: ingredient.ingredientText,
        quantitySpeech: speech,
        preparation: ingredient.preparation ?? "",
        visualDescription: speech,
      }];
    })),
    steps: Object.fromEntries(steps.map((step) => {
      const instruction = exact(`cook.step.${step.id}`, locale);
      return [step.id, {
        instruction,
        visualDescription: instruction,
        ...(step.durationSeconds
          ? {
              durationSpeech: locale === "hi-IN"
                ? `${new Intl.NumberFormat(locale).format(step.durationSeconds)} सेकंड`
                : `${new Intl.NumberFormat(locale).format(step.durationSeconds)} seconds`,
            }
          : {}),
      }];
    })),
  });

  return {
    schemaVersion: 1,
    assignment: {
      id: input.assignmentId,
      assigneeId: input.assigneeId,
      recipeVersionId: input.recipeVersionId,
      status: "scheduled",
      meal: input.mealSlot,
      targetTime: input.targetTime ?? "",
      servings: input.targetServings,
      selectedLocale: input.selectedLocale,
      translationStatus: { "en-IN": "reviewed", "hi-IN": "reviewed" },
    },
    recipe: {
      id: recipe.recipeId,
      versionId: input.recipeVersionId,
      sourceAttribution: recipe.attribution,
      ingredients: ingredients.map((ingredient) => ({
        id: ingredient.id,
        quantity: ingredient.quantityJson
          ? JSON.parse(ingredient.quantityJson) as Record<string, string | number>
          : { text: ingredient.displayLine },
        visualAssetId: null,
      })),
      steps: steps.map((step) => ({
        id: step.id,
        action: "state",
        timer: step.durationSeconds
          ? { durationSeconds: step.durationSeconds, startMode: "explicit" as const }
          : null,
        visualAssetId: null,
        mediaAssetId: null,
      })),
    },
    translations: { "en-IN": translations("en-IN"), "hi-IN": translations("hi-IN") },
    visualAssets: [
      {
        id: "state-ingredient-bundled",
        kind: "state_icon",
        purpose: "show_state",
        verification: "approved",
        rights: "bundled",
        attribution: "Application icon set",
        spokenDescriptionPath: null,
      },
      {
        id: "state-dish-bundled",
        kind: "state_icon",
        purpose: "show_state",
        verification: "approved",
        rights: "bundled",
        attribution: "Application icon set",
        spokenDescriptionPath: null,
      },
    ],
    fallbackIcons: {
      ingredient: "state-ingredient-bundled",
      actions: { state: "state-dish-bundled" },
    },
    mediaAssets: [],
  };
}
