import type { AssignmentSnapshot, AudioReadiness, HousehelpLocale } from "./types";

export interface ReadinessInput {
  snapshot: AssignmentSnapshot;
  locale: HousehelpLocale;
  compatibleDeviceVoice: boolean;
  allEssentialAudioCached: boolean;
}

export function resolveReadiness({
  snapshot,
  locale,
  compatibleDeviceVoice,
  allEssentialAudioCached,
}: ReadinessInput): AudioReadiness {
  const translation = snapshot.translations[locale];
  const translationStatus = snapshot.assignment.translationStatus[locale];
  const allEligibleTextStored =
    (translationStatus === "reviewed" || translationStatus === "auto_translated") &&
    Boolean(translation?.dish && translation.meal && translation.servingsSpeech) &&
    snapshot.recipe.ingredients.every(
      (ingredient) => Boolean(translation?.ingredients[ingredient.id]?.quantitySpeech),
    ) &&
    snapshot.recipe.steps.every((step) => Boolean(translation?.steps[step.id]?.instruction));

  if (!allEligibleTextStored) return "not_ready";
  if (allEssentialAudioCached) return "ready_cached_audio";
  if (compatibleDeviceVoice) return "ready_device_tts";
  return "not_ready";
}
