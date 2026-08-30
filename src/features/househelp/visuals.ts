import type { AssignmentSnapshot, HousehelpLocale } from "./types";

const ELIGIBLE_RIGHTS = new Set([
  "bundled",
  "licensed",
  "user_owned_confirmed",
  "source_embed_allowed",
]);

export interface VisualPresentation {
  assetId: string;
  kind: "ingredient_photo" | "step_image" | "action_icon" | "state_icon";
  purpose: "identify_ingredient" | "show_result" | "show_action" | "show_state";
  description: string;
  attribution: string;
  bundledPath: string | null;
}

function eligible(snapshot: AssignmentSnapshot, assetId: string | null) {
  const asset = snapshot.visualAssets.find((candidate) => candidate.id === assetId);
  return asset?.verification === "approved" && ELIGIBLE_RIGHTS.has(asset.rights)
    ? asset
    : null;
}

function bundledPath(assetId: string): string | null {
  const paths: Record<string, string> = {
    "state-ingredient-bundled": "/househelp/state-ingredient.svg",
    "icon-wash-bundled": "/househelp/action-wash.svg",
    "icon-stir-bundled": "/househelp/action-stir.svg",
    "icon-serve-bundled": "/househelp/action-serve.svg",
  };
  return paths[assetId] ?? null;
}

export function resolveIngredientVisual(
  snapshot: AssignmentSnapshot,
  ingredientIndex: number,
  locale: HousehelpLocale,
): VisualPresentation {
  const ingredient = snapshot.recipe.ingredients[ingredientIndex]!;
  const exact = eligible(snapshot, ingredient.visualAssetId);
  const asset = exact ?? eligible(snapshot, snapshot.fallbackIcons.ingredient);
  if (!asset) throw new Error("The bundled ingredient fallback must be approved.");
  const description = snapshot.translations[locale].ingredients[ingredient.id]!.visualDescription;

  return {
    assetId: asset.id,
    kind: asset.kind,
    purpose: asset.purpose,
    description,
    attribution: asset.attribution,
    bundledPath: bundledPath(asset.id) ?? "/househelp/state-ingredient.svg",
  };
}

export function resolveStepVisual(
  snapshot: AssignmentSnapshot,
  stepIndex: number,
  locale: HousehelpLocale,
): VisualPresentation {
  const step = snapshot.recipe.steps[stepIndex]!;
  const exact = eligible(snapshot, step.visualAssetId);
  const asset = exact ?? eligible(snapshot, snapshot.fallbackIcons.actions[step.action] ?? null);
  if (!asset) throw new Error(`No approved fallback for ${step.action}.`);

  return {
    assetId: asset.id,
    kind: asset.kind,
    purpose: asset.purpose,
    description: snapshot.translations[locale].steps[step.id]!.visualDescription,
    attribution: asset.attribution,
    bundledPath: bundledPath(asset.id) ?? `/househelp/action-${step.action}.svg`,
  };
}
