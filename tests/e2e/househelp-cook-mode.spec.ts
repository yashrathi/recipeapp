import { expect, test } from "@playwright/test";

test("househelp completes the audio-first cook flow on a narrow phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The no-reading acceptance path is exercised at the narrow-phone target.");

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
});
