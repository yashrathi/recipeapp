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
        return Promise.resolve();
      },
      alarm() {
        return Promise.resolve();
      },
    };
  });
}

async function completeCookFlow({ page, isMobile }: { page: Page; isMobile: boolean }) {
  test.skip(!isMobile, "The no-reading acceptance path is exercised at the narrow-phone target.");

  await installSpeechMock(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await page.goto("/househelp");
  await expect(page.locator("main")).toHaveAttribute("data-view", "audio_gate");

  await page.getByRole("button", { name: "Turn on sound" }).click();
  await expect(page.getByRole("dialog", { name: /Choose your language/ })).toBeVisible();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "आगे बढ़ें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "today");

  await page.getByRole("button", { name: "शुरू करें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "briefing");
  await page.getByRole("button", { name: "सामग्री जाँचें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "ingredient");

  await page.getByRole("button", { name: "यह है" }).click();
  await expect(page.getByRole("heading", { name: "दो टमाटर" })).toBeVisible();
  await page.getByRole("button", { name: "यह नहीं है" }).click();
  await expect(page.getByRole("heading", { name: "दो सौ पचास ग्राम पनीर" })).toBeVisible();
  await page.getByRole("button", { name: "यह है" }).click();
  await expect(page.getByRole("heading", { name: "आधा छोटा चम्मच लाल मिर्च पाउडर" })).toBeVisible();
  await page.getByRole("button", { name: "यह है" }).click();
  await expect(page.getByRole("button", { name: "खाना बनाना शुरू करें" })).toBeEnabled();
  await page.getByRole("button", { name: "खाना बनाना शुरू करें" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "cook");

  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.getByRole("heading", { name: "अब एक कप पालक डालें।" })).toBeVisible();

  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("data-view", "audio_gate");
  await page.getByRole("button", { name: "आवाज़ चालू करें" }).click();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "आगे बढ़ें" }).click();
  await page.getByRole("button", { name: "फिर से शुरू करें" }).click();
  await expect(page.getByRole("heading", { name: "अब एक कप पालक डालें।" })).toBeVisible();

  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.getByRole("heading", { name: "मध्यम आँच पर दो मिनट चलाएँ।" })).toBeVisible();
  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.getByRole("heading", { name: "आँच बंद करें और परोसें।" })).toBeVisible();
  await page.getByRole("button", { name: "अगला" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view", "completion");
  await page.getByRole("button", { name: "पूरा हुआ" }).click();
  await expect(page.getByText("पूरा हुआ। घर के मालिक को बता दिया गया है।")).toBeVisible();

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
  await page.getByRole("button", { name: "Turn on sound" }).click();
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "आगे बढ़ें" }).click();
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

test("househelp completes the audio-first cook flow on a narrow phone", completeCookFlow);
