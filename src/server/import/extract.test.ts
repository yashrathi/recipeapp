import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalJson, sha256, type ImportResult } from "@/domain/import/types";
import { extractRecipePage } from "@/server/import/extract";

const fixtureDirectory = join(process.cwd(), "test", "fixtures", "recipe-import");
const manifest = JSON.parse(readFileSync(join(fixtureDirectory, "manifest.json"), "utf8")) as {
  parserCases: { id: string; sourceUrl: string; input: string; expected: string }[];
};

function fixtureProjection(result: ImportResult): Record<string, unknown> {
  const projection = structuredClone(result) as ImportResult & {
    warningCodes: string[];
  };
  projection.warningCodes = projection.warnings.map(({ code }) => code);
  if (projection.recipe) {
    projection.recipe.ingredients = projection.recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      evidenceLocator: ingredient.evidence[0]?.locator,
    })) as typeof projection.recipe.ingredients;
    projection.recipe.steps = projection.recipe.steps.map((step) => ({
      ...step,
      evidenceLocator: step.evidence[0]?.locator,
    })) as typeof projection.recipe.steps;
  }
  return projection as unknown as Record<string, unknown>;
}

describe("frozen webpage recipe parser fixtures", () => {
  for (const fixture of manifest.parserCases) {
    it(`matches ${fixture.id}`, () => {
      const bytes = readFileSync(join(fixtureDirectory, fixture.input));
      const expected = JSON.parse(
        readFileSync(join(fixtureDirectory, fixture.expected), "utf8"),
      ) as { match: Record<string, unknown> };
      const result = extractRecipePage({
        requestedUrl: fixture.sourceUrl,
        finalUrl: fixture.sourceUrl,
        contentSha256: sha256(bytes),
        html: bytes.toString("utf8"),
      });

      expect(fixtureProjection(result)).toMatchObject(expected.match);
      expect(result.source.contentSha256).toBe(sha256(bytes));
    });
  }

  it("is canonically byte-identical for repeated extraction", () => {
    const fixture = manifest.parserCases[0]!;
    const bytes = readFileSync(join(fixtureDirectory, fixture.input));
    const input = {
      requestedUrl: fixture.sourceUrl,
      finalUrl: fixture.sourceUrl,
      contentSha256: sha256(bytes),
      html: bytes.toString("utf8"),
    };
    expect(canonicalJson(extractRecipePage(input))).toBe(canonicalJson(extractRecipePage(input)));
  });

  it("preserves mixed fractions, vulgar fractions and exact ranges without floats", () => {
    const sourceUrl = "https://recipes.example.test/quantities";
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Quantity fixture",
      recipeIngredient: ["1 1/2 cups rice", "2½ tbsp oil", "1/3 to 2/3 cup water"],
      recipeInstructions: ["Mix."],
    })}</script>`;
    const result = extractRecipePage({
      requestedUrl: sourceUrl,
      finalUrl: sourceUrl,
      contentSha256: sha256(html),
      html,
    });
    expect(result.recipe?.ingredients.map(({ quantity }) => quantity)).toMatchObject([
      { kind: "exact", numerator: 3, denominator: 2, sourceText: "1 1/2" },
      { kind: "exact", numerator: 5, denominator: 2, sourceText: "2½" },
      {
        kind: "range",
        min: { numerator: 1, denominator: 3 },
        max: { numerator: 2, denominator: 3 },
        sourceText: "1/3 to 2/3",
      },
    ]);
    expect(result.recipe?.ingredients.map(({ quantity }) => quantity?.confidence)).toEqual([
      0.9,
      0.9,
      0.9,
    ]);
  });
});
