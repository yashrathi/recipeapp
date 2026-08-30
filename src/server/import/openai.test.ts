import { describe, expect, it } from "vitest";

import { OPENAI_LIMITS, OpenAIRecipeExtractor } from "@/server/import/openai";
import type { SourceLine } from "@/server/import/transcript";

const lines: SourceLine[] = [
  { locator: "metadata:title", text: "Tomato Toast" },
  { locator: "source:line:1", text: "Ingredients: 2 tomatoes and 1 slice bread" },
  { locator: "source:line:2", text: "Toast the bread until crisp." },
];

function draft(overrides: Record<string, unknown> = {}) {
  return {
    title: { value: "Tomato Toast", evidence: { locator: "metadata:title", excerpt: "Tomato Toast" } },
    servings: null,
    ingredients: [{ value: "2 tomatoes", evidence: { locator: "source:line:1", excerpt: "2 tomatoes" } }],
    steps: [{ value: "Toast the bread", evidence: { locator: "source:line:2", excerpt: "Toast the bread until crisp." } }],
    ...overrides,
  };
}

function response(output: unknown, status = 200): Response {
  return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }, { status });
}

describe("OpenAI recipe adapter", () => {
  it("allows the measured synchronous extraction window by default", () => {
    expect(OPENAI_LIMITS.timeoutMs).toBe(60_000);
  });

  it("uses one non-stored structured Responses request and verifies exact evidence", async () => {
    let body: Record<string, unknown> | null = null;
    let calls = 0;
    const extractor = new OpenAIRecipeExtractor({ apiKey: "test-key", model: "test-model",
      transport: async (_url, init) => { calls += 1; body = JSON.parse(String(init?.body)); return response(draft()); } });
    const result = await extractor.extract(lines);
    expect(calls).toBe(1);
    expect(body).toMatchObject({ model: "test-model", store: false,
      text: { format: { type: "json_schema", name: "recipe_evidence", strict: true } } });
    expect(result.recipe.title.displayText).toBe("Tomato Toast");
    expect(result.recipe.ingredients[0]?.quantity).toBeNull();
    expect(result.recipe.prepTime).toBeNull();
    expect(result.recipe.ingredients[0]?.evidence[0]).toMatchObject({ method: "openai", locator: "source:line:1", sourceText: "2 tomatoes" });
  });

  it("omits mismatched optional evidence and flags the draft", async () => {
    const extractor = new OpenAIRecipeExtractor({ apiKey: "test-key", model: "test-model", transport: async () => response(draft({
      servings: { value: "4", evidence: { locator: "source:line:1", excerpt: "2 tomatoes" } },
    })) });
    const result = await extractor.extract(lines);
    expect(result.recipe.servings).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toContain("EVIDENCE_MISMATCH");
  });

  it("rejects a draft when required fields have mismatched evidence", async () => {
    const extractor = new OpenAIRecipeExtractor({ apiKey: "test-key", model: "test-model", transport: async () => response(draft({
      ingredients: [{ value: "invented cheese", evidence: { locator: "source:line:1", excerpt: "2 tomatoes" } }],
    })) });
    await expect(extractor.extract(lines)).rejects.toMatchObject({ failure: { code: "OPENAI_RESPONSE_INVALID" } });
  });

  it("fails clearly when configuration is missing", async () => {
    const extractor = new OpenAIRecipeExtractor({ apiKey: "", model: "", transport: async () => { throw new Error("unused"); } });
    await expect(extractor.extract(lines)).rejects.toMatchObject({ failure: { code: "OPENAI_NOT_CONFIGURED" } });
  });

  it.each([[401, "OPENAI_AUTH_FAILED"], [429, "OPENAI_RATE_LIMITED"], [503, "OPENAI_UNAVAILABLE"]] as const)(
    "maps status %s to %s without exposing provider bodies", async (status, code) => {
      const extractor = new OpenAIRecipeExtractor({ apiKey: "test-key", model: "test-model",
        transport: async () => new Response("private provider detail", { status }) });
      await expect(extractor.extract(lines)).rejects.toMatchObject({ failure: { code } });
    },
  );

  it("maps invalid structured output", async () => {
    const extractor = new OpenAIRecipeExtractor({ apiKey: "test-key", model: "test-model",
      transport: async () => Response.json({ output: [] }) });
    await expect(extractor.extract(lines)).rejects.toMatchObject({ failure: { code: "OPENAI_RESPONSE_INVALID" } });
  });

  it("maps a timeout while reading the body", async () => {
    const extractor = new OpenAIRecipeExtractor({ apiKey: "test-key", model: "test-model", timeoutMs: 2,
      transport: async (_url, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
        },
      })) });
    await expect(extractor.extract(lines)).rejects.toMatchObject({ failure: { code: "OPENAI_TIMEOUT" } });
  });
});
