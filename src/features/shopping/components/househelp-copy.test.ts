import { describe, expect, it } from "vitest";

import { househelpPriceText, spokenShoppingList } from "@/features/shopping/components/househelp-copy";
import type { HouseholdShoppingList } from "@/features/shopping/contracts";

const baseList: HouseholdShoppingList = {
  id: "list-1",
  householdId: "household-1",
  items: [{
    id: "item-1",
    name: "Spinach",
    quantityNote: "500 g",
    priceStatus: "not_found",
    price: null,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  }],
};

describe("househelp shopping-list copy", () => {
  it("distinguishes an Instamart no-match result from a pending price", () => {
    expect(househelpPriceText(baseList.items[0]!, "en-IN")).toBe("No Instamart match");
    expect(househelpPriceText(baseList.items[0]!, "hi-IN")).toBe("इंस्टामार्ट पर नहीं मिला");
  });

  it("speaks the no-match result", () => {
    expect(spokenShoppingList(baseList, "en-IN")).toContain("price not found");
    expect(spokenShoppingList(baseList, "en-IN")).not.toContain("price not checked");
  });
});
