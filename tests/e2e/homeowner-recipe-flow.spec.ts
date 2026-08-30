import { expect, test } from "@playwright/test";

const HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const importedRecipe = {
  contractVersion: "web-recipe-import/v1",
  extractorVersion: "playwright-fixture-v1",
  status: "success",
  reviewState: "needs_review",
  source: {
    requestedUrl: "https://recipes.example.test/palak-paneer",
    finalUrl: "https://recipes.example.test/palak-paneer",
    canonicalUrl: "https://recipes.example.test/palak-paneer",
    title: null,
    author: {
      originalText: "Fixture Kitchen",
      displayText: "Fixture Kitchen",
      confidence: 0.95,
      evidence: [{ method: "json_ld", locator: "script[0]#/author", sourceText: "Fixture Kitchen", sourceTextSha256: HASH }],
    },
    publisher: null,
    method: "json_ld",
  },
  recipe: {
    title: {
      originalText: "Palak paneer",
      displayText: "Palak paneer",
      confidence: 0.95,
      evidence: [{ method: "json_ld", locator: "script[0]#/name", sourceText: "Palak paneer", sourceTextSha256: HASH }],
    },
    servings: 4,
    ingredients: [
      {
        order: 1,
        originalText: "500 g paneer",
        displayText: "500 g paneer",
        quantity: { kind: "exact", decimal: "500", sourceText: "500", confidence: 0.9 },
        unit: { canonical: "gram", sourceText: "g", confidence: 0.9 },
        ingredientText: "paneer",
        preparationNote: null,
        confidence: 0.95,
        evidence: [{ method: "json_ld", locator: "script[0]#/recipeIngredient/0", sourceText: "500 g paneer", sourceTextSha256: HASH }],
      },
      {
        order: 2,
        originalText: "2 cups spinach",
        displayText: "2 cups spinach",
        quantity: { kind: "exact", decimal: "2", sourceText: "2", confidence: 0.9 },
        unit: { canonical: "cup", sourceText: "cups", confidence: 0.9 },
        ingredientText: "spinach",
        preparationNote: null,
        confidence: 0.95,
        evidence: [{ method: "json_ld", locator: "script[0]#/recipeIngredient/1", sourceText: "2 cups spinach", sourceTextSha256: HASH }],
      },
    ],
    steps: [
      {
        order: 1,
        section: null,
        originalText: "Wash the spinach.",
        displayText: "Wash the spinach.",
        duration: null,
        confidence: 0.95,
        evidence: [{ method: "json_ld", locator: "script[0]#/recipeInstructions/0", sourceText: "Wash the spinach.", sourceTextSha256: HASH }],
      },
      {
        order: 2,
        section: null,
        originalText: "Add paneer and cook for five minutes.",
        displayText: "Add paneer and cook for five minutes.",
        duration: null,
        confidence: 0.95,
        evidence: [{ method: "json_ld", locator: "script[0]#/recipeInstructions/1", sourceText: "Add paneer and cook for five minutes.", sourceTextSha256: HASH }],
      },
    ],
  },
  warnings: [],
};

async function enterHomeowner(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter homeowner shell" }).click();
  await expect(page).toHaveURL(/\/homeowner$/);
}

test("homeowner imports, reviews, publishes and assigns a recipe", async ({ page }) => {
  await page.route("**/api/imports", async (route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(importedRecipe) });
  });
  await enterHomeowner(page);

  await page.getByRole("link", { name: "Add a recipe" }).first().click();
  await page.getByLabel("Public recipe webpage URL").fill("https://recipes.example.test/palak-paneer");
  await page.getByRole("button", { name: "Import recipe" }).click();

  await expect(page).toHaveURL(/\/homeowner\/recipes\/[^/]+\/review$/);
  await expect(page.getByRole("heading", { name: "Make the draft trustworthy" })).toBeVisible();
  await expect(page.getByText("Original source line").first()).toBeVisible();
  await expect(page.getByText("500 g paneer", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Exact Hindi dish speech").fill("पालक पनीर");
  await page.getByLabel("Exact Hindi speech").nth(0).fill("पाँच सौ ग्राम पनीर");
  await page.getByLabel("Exact Hindi speech").nth(1).fill("दो कप पालक");
  await page.getByLabel("Exact Hindi speech").nth(2).fill("पालक धोएँ।");
  await page.getByLabel("Exact Hindi speech").nth(3).fill("पनीर डालें और पाँच मिनट पकाएँ।");
  await page.getByLabel(/I reviewed the ingredients/).check();
  await page.getByRole("button", { name: "Publish reviewed recipe" }).click();

  await expect(page).toHaveURL(/\/homeowner\/recipes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Palak paneer" })).toBeVisible();
  await page.getByRole("link", { name: "Assign to cook" }).click();
  await page.getByLabel("Date").fill("2026-09-02");
  await page.getByLabel("Meal").selectOption("dinner");
  await page.getByLabel("Optional target time").fill("19:30");
  await page.getByLabel("Servings").fill("3");
  await page.getByLabel("हिन्दी").check();
  await page.getByLabel("Exact English homeowner note").fill("Use less chilli");
  await page.getByLabel("Exact Hindi homeowner note").fill("मिर्च कम डालें");
  await page.getByLabel(/If I added a note/).check();
  const assignmentResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/homeowner/assignments") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Assign recipe" }).click();
  const assignmentPayload = await (await assignmentResponse).json() as { id: string };

  await expect(page.getByRole("heading", { name: "Palak paneer is on the household plan" })).toBeVisible();
  await expect(page.getByText("selected spoken guidance is reviewed and ready")).toBeVisible();

  await page.getByRole("link", { name: "Return to Today" }).click();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  const handoff = await page.request.get(`/api/househelp/assignments/${assignmentPayload.id}`);
  expect(handoff.ok()).toBeTruthy();
  await expect(handoff.json()).resolves.toMatchObject({
    snapshot: {
      assignment: { id: assignmentPayload.id, recipeVersionId: expect.any(String) },
      translations: {
        "en-IN": { dish: "Palak paneer", note: "Use less chilli" },
        "hi-IN": { dish: "पालक पनीर", note: "मिर्च कम डालें" },
      },
    },
  });
});

test("import API failure keeps manual entry available", async ({ page }) => {
  await page.route("**/api/imports", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "The recipe source is temporarily unavailable." }),
    });
  });
  await enterHomeowner(page);
  await page.goto("/homeowner/recipes/new");
  await page.getByLabel("Public recipe webpage URL").fill("https://recipes.example.test/unavailable");
  await page.getByRole("button", { name: "Import recipe" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter manually" }).first()).toBeVisible();
});

test("househelp session cannot open homeowner routes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await page.goto("/homeowner");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Household Recipe Assistant" })).toBeVisible();
});
