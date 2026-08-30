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
      { key: "recipe.dish", english: "Palak paneer", maxLength: 1_000 },
      { key: "cook.step.1", english: "Wash the spinach.", maxLength: 2_000 },
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
      { key: "recipe.dish", english: "Palak paneer", maxLength: 1_000 },
      { key: "cook.step.1", english: "Wash the spinach.", maxLength: 2_000 },
    ])).rejects.toBeInstanceOf(HindiTranslationError);
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
      { key: "recipe.dish", english: "Rice", maxLength: 1_000 },
    ])).rejects.toThrow(/too large/i);
  });

  it("fails clearly when translation is not configured", async () => {
    const translator = new OpenAIHindiTranslator({ apiKey: "", model: "" });
    await expect(translator.translate([
      { key: "recipe.dish", english: "Rice", maxLength: 1_000 },
    ])).rejects.toThrow(/not configured/i);
  });
});
