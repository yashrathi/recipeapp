import { expect, test } from "@playwright/test";

test("loads the foundation and enters a role-bound demo workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Household Recipe Assistant" })).toBeVisible();

  await page.getByRole("button", { name: "Enter househelp shell" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Househelp workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Role boundary active" })).toBeVisible();
});
