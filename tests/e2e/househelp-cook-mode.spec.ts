import { expect, test, type Page } from "@playwright/test";

async function installSpeechMock(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const storageKey = "househelp-e2e-speech";
    if (!window.sessionStorage.getItem(storageKey)) {
      window.sessionStorage.setItem(storageKey, "[]");
    }
    window.__HOUSEHELP_SPEECH_MOCK__ = {
      cancel() {},
      probe() { return true; },
      speak(text, locale) {
        const entries = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]") as Array<{
          text: string;
          locale: string;
        }>;
        entries.push({ text, locale });
        window.sessionStorage.setItem(storageKey, JSON.stringify(entries));
        const testWindow = window as Window & {
          __HOUSEHELP_FAIL_SPEECH__?: boolean;
          __HOUSEHELP_STALL_DONE_SPEECH__?: boolean;
        };
        if (testWindow.__HOUSEHELP_FAIL_SPEECH__) {
          return Promise.reject(new Error("speech_failed"));
        }
        if (testWindow.__HOUSEHELP_STALL_DONE_SPEECH__) {
          return new Promise<void>(() => undefined);
        }
        return Promise.resolve();
      },
      alarm() {
        return Promise.resolve();
      },
    };
  });
}

async function openFirstTaskFromMenu(page: Page) {
  await expect(page.getByRole("heading", { name: "Cooking menu" })).toBeVisible();
  await page.getByRole("button", { name: /Turn on sound|आवाज़ चालू करें/ }).click();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "आगे बढ़ें" }).click();
  await expect(page.getByRole("heading", { name: "पालक पनीर" })).toBeVisible();
  await page.getByRole("button", { name: "शुरू करें" }).click();
  await expect(page).toHaveURL(/\/househelp\/demo-assignment$/);
  await page.waitForLoadState("networkidle");
}

async function completeCookFlow({ page, isMobile }: { page: Page; isMobile: boolean }) {
  test.skip(!isMobile, "The no-reading acceptance path is exercised at the narrow-phone target.");
  test.setTimeout(60_000);

  await installSpeechMock(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await page.goto("/househelp");
  await openFirstTaskFromMenu(page);
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");

  await page.getByRole("button", { name: "शुरू करें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "briefing");
  await page.getByRole("button", { name: "सामग्री जाँचें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "ingredient");

  await page.getByRole("button", { name: "यह है" }).click();
  await expect(page.getByRole("heading", { name: "दो टमाटर" })).toBeVisible();
  const missingTomatoes = page.getByRole("button", { name: "यह नहीं है" });
  await expect(missingTomatoes).toBeEnabled();
  await missingTomatoes.click();
  await expect(page.getByRole("heading", { name: "दो सौ पचास ग्राम पनीर" })).toBeVisible();
  const havePaneer = page.getByRole("button", { name: "यह है" });
  await expect(havePaneer).toBeEnabled();
  await havePaneer.click();
  await expect(page.getByRole("heading", { name: "आधा छोटा चम्मच लाल मिर्च पाउडर" })).toBeVisible();
  const haveChilli = page.getByRole("button", { name: "यह है" });
  await expect(haveChilli).toBeEnabled();
  await haveChilli.click();
  await expect(page.getByRole("button", { name: "खाना बनाना शुरू करें" })).toBeEnabled();
  await page.getByRole("button", { name: "खाना बनाना शुरू करें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "cook");

  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.getByRole("heading", { name: "अब एक कप पालक डालें।" })).toBeVisible();

  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");
  await page.getByRole("button", { name: "फिर से शुरू करें" }).click();
  await expect(page.getByRole("heading", { name: "अब एक कप पालक डालें।" })).toBeVisible();

  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.getByRole("heading", { name: "मध्यम आँच पर दो मिनट चलाएँ।" })).toBeVisible();
  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.getByRole("heading", { name: "आँच बंद करें और परोसें।" })).toBeVisible();
  await expect(page.getByRole("button", { name: "खाना बनाने की सूची" })).toBeVisible();
  const previousStep = page.getByRole("button", { name: "पीछे जाएँ" });
  await expect(previousStep).toBeEnabled();
  await previousStep.click();
  await expect(page.getByRole("heading", { name: "मध्यम आँच पर दो मिनट चलाएँ।" })).toBeVisible();
  const reviewNext = page.getByRole("button", { name: "अगला" });
  await expect(reviewNext).toBeEnabled();
  await reviewNext.click();
  await expect(page.getByRole("heading", { name: "आँच बंद करें और परोसें।" })).toBeVisible();
  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "completion");
  await page.evaluate(() => {
    (window as Window & { __HOUSEHELP_STALL_DONE_SPEECH__?: boolean })
      .__HOUSEHELP_STALL_DONE_SPEECH__ = true;
  });
  await page.getByRole("button", { name: "पूरा हुआ" }).click();
  await expect(page.getByText("पूरा हुआ। घर के मालिक को बता दिया गया है।")).toBeVisible();
  await expect(page.getByRole("button", { name: "खाना बनाने की सूची" })).toBeEnabled();
  await expect(page).toHaveURL(/\/househelp$/, { timeout: 10_000 });
  await expect(page.locator("main")).toHaveAttribute("data-view", "menu");
  await expect(page.getByRole("dialog", { name: /अपनी भाषा चुनें|Choose your language/ })).toHaveCount(0);

  const menuResponse = await page.request.get("/api/househelp/assignments");
  expect(menuResponse.ok()).toBeTruthy();
  const menuPayload = await menuResponse.json() as { assignments: Array<{ id: string }> };
  expect(menuPayload.assignments.map(({ id }) => id)).not.toContain("demo-assignment");

  const response = await page.request.get("/api/househelp/assignments/demo-assignment");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    progress: { completed: true, status: "done", stepIndex: 3 },
  });

  const spoken = await page.evaluate(() => JSON.parse(
    window.sessionStorage.getItem("househelp-e2e-speech") ?? "[]",
  ) as Array<{ text: string; locale: string }>);
  expect(spoken).toEqual(expect.arrayContaining([
    { locale: "hi-IN", text: "यह नहीं है। घर के मालिक को बता दिया गया है। अगली सामग्री। दो सौ पचास ग्राम पनीर।" },
    { locale: "hi-IN", text: "अगला। कुल 4 में से चरण 2। अब एक कप पालक डालें।" },
    { locale: "hi-IN", text: "आप वापस आ गए हैं। कुल 4 में से चरण 2। अब एक कप पालक डालें।" },
    { locale: "hi-IN", text: "खाना बन गया है। पालक पनीर तैयार है। घर के मालिक को बताने के लिए पूरा हुआ बटन दबाएँ।" },
  ]));
}

test("409 and stalled progress responses cannot leave ingredient controls locked", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The persistence-lock regression is exercised at the narrow-phone target.");

  await installSpeechMock(page);
  await page.addInitScript(() => {
    const testWindow = window as Window & { __HOUSEHELP_PERSISTENCE_TIMEOUT_MS__?: number };
    testWindow.__HOUSEHELP_PERSISTENCE_TIMEOUT_MS__ = 100;
    const nativeFetch = window.fetch.bind(window);
    let ingredientRequestCount = 0;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/househelp/assignments/") || !url.endsWith("/progress")) {
        return nativeFetch(input, init);
      }
      const payload = JSON.parse(String(init?.body ?? "{}")) as { type?: string };
      if (payload.type !== "ingredient") {
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      ingredientRequestCount += 1;
      if (ingredientRequestCount === 1) {
        return new Response("{}", { status: 409, headers: { "content-type": "application/json" } });
      }
      return new Promise<Response>((resolve, reject) => {
        const delayedConflict = window.setTimeout(() => {
          resolve(new Response("{}", { status: 409, headers: { "content-type": "application/json" } }));
        }, 1_500);
        init?.signal?.addEventListener("abort", () => {
          window.clearTimeout(delayedConflict);
          reject(new DOMException("The progress request timed out.", "AbortError"));
        }, { once: true });
      });
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await page.goto("/househelp");
  await openFirstTaskFromMenu(page);
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");
  await page.getByRole("button", { name: "शुरू करें" }).click();
  await page.getByRole("button", { name: "सामग्री जाँचें" }).click();

  await page.getByRole("button", { name: "यह है" }).click();
  await expect(page.getByRole("heading", { name: "दो टमाटर" })).toBeVisible();
  const missingButton = page.getByRole("button", { name: "यह नहीं है" });
  await expect(missingButton).toBeEnabled({ timeout: 500 });
  await expect(missingButton).toHaveAttribute("aria-busy", "false");
  await missingButton.click();
  await expect(page.getByRole("heading", { name: "दो सौ पचास ग्राम पनीर" })).toBeVisible();
  const haveButton = page.getByRole("button", { name: "यह है" });
  await expect(haveButton).toBeEnabled({ timeout: 500 });
  await expect(haveButton).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((candidate) =>
      candidate.startsWith("recipe-app:househelp:v1:"),
    );
    if (!key) return 0;
    return (JSON.parse(window.localStorage.getItem(key) ?? "{}") as { pending?: unknown[] })
      .pending?.length ?? 0;
  })).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(3_300);
  await expect.poll(() => page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((candidate) =>
      candidate.startsWith("recipe-app:househelp:v1:"),
    );
    if (!key) return 0;
    return (JSON.parse(window.localStorage.getItem(key) ?? "{}") as { pending?: unknown[] })
      .pending?.length ?? 0;
  })).toBe(2);
});

test("homeowner session cannot start a househelp ad-hoc cooking run", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter homeowner shell" }).click();
  const response = await page.request.post("/api/househelp/recipes/demo-recipe-v1/start", {
    data: { locale: "en-IN" },
  });
  expect(response.status()).toBe(403);
});

test("cooking menu remains an explicit escape from an active task", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The menu escape is exercised at the narrow-phone target.");

  await installSpeechMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await page.goto("/househelp");
  await openFirstTaskFromMenu(page);
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");

  const menuButton = page.getByRole("button", { name: "खाना बनाने की सूची" });
  await expect(menuButton).toBeEnabled();
  const dimensions = await menuButton.boundingBox();
  expect(dimensions?.height).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await menuButton.click();
  await expect(page).toHaveURL(/\/househelp$/);
});

test("task action opens when activation speech fails", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The task-action regression is exercised at the narrow-phone target.");

  await installSpeechMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await page.goto("/househelp");
  await page.getByRole("button", { name: /Turn on sound|आवाज़ चालू करें/ }).click();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "आगे बढ़ें" }).click();
  await expect(page.getByRole("heading", { name: "पालक पनीर" })).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { __HOUSEHELP_FAIL_SPEECH__?: boolean })
      .__HOUSEHELP_FAIL_SPEECH__ = true;
  });
  await page.getByRole("button", { name: "शुरू करें" }).click();

  await expect(page).toHaveURL(/\/househelp\/demo-assignment$/);
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");
});

test("househelp completes the audio-first cook flow on a narrow phone", completeCookFlow);

test("househelp can start a published household recipe without an assignment", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The ad-hoc cooking path is exercised at the narrow-phone target.");

  await installSpeechMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  const initialMenuResponse = await page.request.get("/api/househelp/assignments");
  const initialMenu = await initialMenuResponse.json() as {
    assignments: Array<{ id: string }>;
    recipes: Array<{ recipeVersionId: string }>;
  };
  const demoRecipeIndex = initialMenu.recipes.findIndex(
    ({ recipeVersionId }) => recipeVersionId === "demo-recipe-v1",
  );
  expect(demoRecipeIndex).toBeGreaterThanOrEqual(0);
  await page.evaluate((assignmentIds) => {
    for (const assignmentId of assignmentIds) {
      window.localStorage.setItem(`recipe-app:househelp:v1:${assignmentId}`, JSON.stringify({
        state: { completed: true },
      }));
    }
  }, initialMenu.assignments.map(({ id }) => id));
  await page.goto("/househelp");
  await page.getByRole("button", { name: /Turn on sound|आवाज़ चालू करें/ }).click();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "आगे बढ़ें" }).click();
  for (let index = 0; index < demoRecipeIndex; index += 1) {
    await page.getByRole("button", { name: "अगला" }).click();
  }

  await expect(page.getByRole("heading", { name: "सादा पालक" })).toBeVisible();
  await expect(page.getByText("घर की रेसिपी")).toBeVisible();
  const menuResponse = await page.request.get("/api/househelp/assignments");
  const menuPayload = await menuResponse.json() as { recipes: Array<{ recipeVersionId: string }> };
  expect(menuPayload.recipes.map(({ recipeVersionId }) => recipeVersionId))
    .toContain("demo-recipe-v1");
  await page.getByRole("button", { name: "अभी बनाएँ" }).click();
  await expect(page).toHaveURL(/\/househelp\/(?!demo-assignment)[^/]+$/);
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");
  await page.getByRole("button", { name: "शुरू करें" }).click();
  await page.getByRole("button", { name: "सामग्री जाँचें" }).click();
  await expect(page.getByRole("heading", { name: "आधा कप धुला हुआ पालक" })).toBeVisible();
});
