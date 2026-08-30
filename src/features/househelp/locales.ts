import controlsFixture from "../../../docs/technical/fixtures/audio-visual/controls.json";
import englishFixture from "../../../docs/technical/fixtures/audio-visual/en-IN.json";
import hindiFixture from "../../../docs/technical/fixtures/audio-visual/hi-IN.json";

import type { HousehelpLocale, PromptDescriptor } from "./types";

export interface LocaleBundle {
  locale: HousehelpLocale;
  languageName: string;
  messages: Record<string, string>;
  labels: Record<string, string>;
  quantityTerms: Record<string, string>;
  units: Record<string, string>;
}

export const localeBundles: Record<HousehelpLocale, LocaleBundle> = {
  "en-IN": englishFixture as LocaleBundle,
  "hi-IN": hindiFixture as LocaleBundle,
};

export const househelpControls = controlsFixture.controls;

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export function formatMessage(
  locale: HousehelpLocale,
  messageId: string,
  values: Record<string, string | number> = {},
): string {
  const template = localeBundles[locale].messages[messageId];
  if (!template) throw new Error(`Missing ${locale} message: ${messageId}`);

  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing placeholder ${name} for ${messageId}`);
    return String(value);
  });
}

export function resolvePrompt(locale: HousehelpLocale, prompt: PromptDescriptor): string {
  return formatMessage(locale, prompt.messageId, prompt.values);
}

export function label(locale: HousehelpLocale, controlId: string): string {
  const value = localeBundles[locale].labels[controlId];
  if (!value) throw new Error(`Missing ${locale} control label: ${controlId}`);
  return value;
}

export function messagePlaceholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]!).sort();
}
