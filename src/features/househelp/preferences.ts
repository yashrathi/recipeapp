import type { HousehelpLocale } from "./types";

const PREFERENCE_KEY = "recipe-app:househelp:preferences:v1";

interface HousehelpPreferences {
  version: 1;
  languageConfirmed: true;
  locale: HousehelpLocale;
}

export function readHousehelpPreferences(): HousehelpPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(PREFERENCE_KEY);
    if (!value) return null;
    const preferences = JSON.parse(value) as Partial<HousehelpPreferences>;
    if (
      preferences.version !== 1 ||
      preferences.languageConfirmed !== true ||
      !["en-IN", "hi-IN"].includes(preferences.locale ?? "")
    ) return null;
    return preferences as HousehelpPreferences;
  } catch {
    return null;
  }
}

export function rememberHousehelpLocale(locale: HousehelpLocale) {
  if (typeof window === "undefined") return;
  try {
    const preferences: HousehelpPreferences = {
      version: 1,
      languageConfirmed: true,
      locale,
    };
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
  } catch {
    // The selected assignment locale remains the fallback when storage is unavailable.
  }
}
