import { expect, test } from "@playwright/test";

test("loads the foundation and enters the server-authorized homeowner workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ghormai" })).toBeVisible();

  await page.getByRole("button", { name: "Enter homeowner shell" }).click();
  await expect(page).toHaveURL(/\/homeowner$/);
  await expect(page.getByRole("link", { name: "Ghormai homeowner Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Good day, Asha/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current assignments" })).toBeVisible();
});
