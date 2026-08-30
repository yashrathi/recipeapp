import { afterEach, describe, expect, it } from "vitest";

import { resetEnvironmentForTests } from "@/server/config/env";
import { HindiTranslationError, OpenAIHindiTranslator } from "@/server/translation/hindi";

function providerResponse(translations: Array<{ key: string; hindi: string }>): Response {
  return Response.json({
    output_text: JSON.stringify({ translations }),
  });
}

describe("OpenAI Hindi translator", () => {
  afterEach(() => resetEnvironmentForTests());

  it("returns a complete key-matched translation batch without storing the provider response", async () => {
    let request: RequestInit | undefined;
    const translator = new OpenAIHindiTranslator({
      apiKey: "test-key",
      model: "test-model",
      transport: async (_input, init) => {
        request = init;
        return providerResponse([
          { key: "recipe.dish", hindi: "पालक पनीर" },
          { key: "cook.step.1", hindi: "पालक धोएँ।" },
        ]);
      },
    });

    await expect(translator.translate([
      { key: "recipe.dish", english: "Palak paneer" },
      { key: "cook.step.1", english: "Wash the spinach." },
    ])).resolves.toEqual([
      { key: "recipe.dish", hindi: "पालक पनीर" },
      { key: "cook.step.1", hindi: "पालक धोएँ।" },
    ]);
    expect(JSON.parse(String(request?.body))).toMatchObject({ store: false, model: "test-model" });
  });

  it("rejects incomplete provider output", async () => {
    const translator = new OpenAIHindiTranslator({
      apiKey: "test-key",
      model: "test-model",
      transport: async () => providerResponse([{ key: "recipe.dish", hindi: "पालक पनीर" }]),
    });

    await expect(translator.translate([
      { key: "recipe.dish", english: "Palak paneer" },
      { key: "cook.step.1", english: "Wash the spinach." },
    ])).rejects.toBeInstanceOf(HindiTranslationError);
  });

  it("accepts a complete translation longer than the former spoken-text cap", async () => {
    const longHindi = `धीरे-धीरे चलाते रहें। ${"निर्देश पूरा होने तक इसे दोहराएँ। ".repeat(100)}`.trim();
    const translator = new OpenAIHindiTranslator({
      apiKey: "test-key",
      model: "test-model",
      transport: async () => providerResponse([{ key: "cook.step.1", hindi: longHindi }]),
    });

    await expect(translator.translate([
      { key: "cook.step.1", english: "Keep stirring until the instruction is complete." },
    ])).resolves.toEqual([{ key: "cook.step.1", hindi: longHindi }]);
  });

  it("rejects an oversized provider response before reading it", async () => {
    const translator = new OpenAIHindiTranslator({
      apiKey: "test-key",
      model: "test-model",
      transport: async () => new Response("{}", {
        headers: { "content-length": String(512 * 1024 + 1) },
      }),
    });

    await expect(translator.translate([
      { key: "recipe.dish", english: "Rice" },
    ])).rejects.toThrow(/too large/i);
  });

  it("fails clearly when translation is not configured", async () => {
    const translator = new OpenAIHindiTranslator({ apiKey: "", model: "" });
    await expect(translator.translate([
      { key: "recipe.dish", english: "Rice" },
    ])).rejects.toThrow(/not configured/i);
  });
});
