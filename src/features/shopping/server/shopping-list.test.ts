import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ShoppingListService } from "@/features/shopping/server/shopping-list";
import type { HouseholdActor } from "@/server/auth/policy";
import { createDatabaseHandle } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { DEMO_IDS, seedDemoData } from "@/server/db/seed";

const homeowner: HouseholdActor = {
  userId: DEMO_IDS.homeowner,
  householdId: DEMO_IDS.household,
  membershipId: DEMO_IDS.homeownerMembership,
  role: "homeowner",
};

const househelp: HouseholdActor = {
  userId: DEMO_IDS.househelp,
  householdId: DEMO_IDS.household,
  membershipId: DEMO_IDS.househelpMembership,
  role: "househelp",
};

describe("household shopping list", () => {
  let client: Database.Database;

  beforeEach(() => {
    client = createDatabaseHandle(":memory:").client;
    runMigrations(client);
    seedDemoData(client);
  });

  afterEach(() => client.close());

  it("persists an item added by the homeowner", () => {
    const service = new ShoppingListService(client);

    service.add(homeowner, { name: "Tomatoes", quantityNote: "1 kg" });

    expect(new ShoppingListService(client).get(homeowner).items).toMatchObject([
      { name: "Tomatoes", quantityNote: "1 kg", priceStatus: "unchecked" },
    ]);
  });

  it("lets househelp read the household list without changing it", () => {
    const service = new ShoppingListService(client);
    service.add(homeowner, { name: "Spinach" });

    expect(service.get(househelp).items).toMatchObject([{ name: "Spinach" }]);
    expect(() => service.add(househelp, { name: "Cooking oil" })).toThrow(
      "cannot perform that action",
    );
  });

  it("lets the homeowner remove an item from the household list", () => {
    const service = new ShoppingListService(client);
    const added = service.add(homeowner, { name: "Coriander", quantityNote: "1 bunch" });

    service.remove(homeowner, added.items[0]!.id);

    expect(service.get(homeowner).items).toEqual([]);
  });

  it("saves the top available Instamart match as a price snapshot", async () => {
    const priceLookup = {
      search: async () => ({
        checkedAt: "2026-08-30T10:00:00.000Z",
        nextOffset: "",
        similarProducts: [],
        products: [{
          displayName: "Fresh Tomatoes",
          brand: "Fresh",
          inStock: true,
          isAvail: true,
          productId: "product-1",
          parentProductId: "parent-1",
          variations: [
            {
              spinId: "spin-sold-out",
              skuId: "sku-sold-out",
              quantityDescription: "250 g",
              displayName: "Tomatoes 250 g",
              brandName: "Fresh",
              price: { mrp: 25, offerPrice: 20 },
              isInStockAndAvailable: false,
            },
            {
              spinId: "spin-available",
              skuId: "sku-available",
              quantityDescription: "500 g",
              displayName: "Tomatoes 500 g",
              brandName: "Fresh",
              price: { mrp: 45, offerPrice: 39 },
              isInStockAndAvailable: true,
            },
          ],
        }],
      }),
    };
    const service = new ShoppingListService(client, priceLookup);
    service.add(homeowner, { name: "Tomatoes", quantityNote: "1 kg" });

    const refreshed = await service.refreshPrices(homeowner, { addressId: "address-1" });

    expect(refreshed.items[0]).toMatchObject({
      priceStatus: "matched",
      price: {
        productName: "Tomatoes 500 g",
        packSize: "500 g",
        mrp: 45,
        offerPrice: 39,
        available: true,
        checkedAt: "2026-08-30T10:00:00.000Z",
      },
    });
  });

  it("rejects a duplicate ingredient name case-insensitively", () => {
    const service = new ShoppingListService(client);
    service.add(homeowner, { name: "Tomatoes" });

    expect(() => service.add(homeowner, { name: "  TOMATOES  " })).toThrow(
      "already on the shopping list",
    );
  });

  it("keeps the last saved price when one later lookup fails", async () => {
    let failTomatoes = false;
    const priceLookup = {
      search: async (_actor: HouseholdActor, input: { query: string }) => {
        if (failTomatoes && input.query === "Tomatoes") throw new Error("provider unavailable");
        return {
          checkedAt: failTomatoes ? "2026-08-30T11:00:00.000Z" : "2026-08-30T10:00:00.000Z",
          nextOffset: "",
          similarProducts: [],
          products: [{
            displayName: input.query,
            brand: "Fresh",
            inStock: true,
            isAvail: true,
            productId: `product-${input.query}`,
            parentProductId: `parent-${input.query}`,
            variations: [{
              spinId: `spin-${input.query}`,
              skuId: `sku-${input.query}`,
              quantityDescription: "500 g",
              displayName: `${input.query} 500 g`,
              brandName: "Fresh",
              price: { mrp: 45, offerPrice: input.query === "Tomatoes" ? 39 : 29 },
              isInStockAndAvailable: true,
            }],
          }],
        };
      },
    };
    const service = new ShoppingListService(client, priceLookup);
    service.add(homeowner, { name: "Tomatoes" });
    service.add(homeowner, { name: "Spinach" });
    await service.refreshPrices(homeowner, { addressId: "address-1" });

    failTomatoes = true;
    const refreshed = await service.refreshPrices(homeowner, { addressId: "address-1" });
    const tomatoes = refreshed.items.find((item) => item.name === "Tomatoes");
    const spinach = refreshed.items.find((item) => item.name === "Spinach");

    expect(tomatoes).toMatchObject({
      priceStatus: "error",
      price: { offerPrice: 39, checkedAt: "2026-08-30T10:00:00.000Z" },
    });
    expect(spinach).toMatchObject({ priceStatus: "matched", price: { offerPrice: 29 } });
  });

  it("clears a stale snapshot when a later lookup has no available match", async () => {
    let hasMatch = true;
    const priceLookup = {
      search: async () => ({
        checkedAt: hasMatch ? "2026-08-30T10:00:00.000Z" : "2026-08-30T11:00:00.000Z",
        nextOffset: "",
        similarProducts: [],
        products: hasMatch ? [{
          displayName: "Fresh Spinach",
          brand: "Fresh",
          inStock: true,
          isAvail: true,
          productId: "product-spinach",
          parentProductId: "parent-spinach",
          variations: [{
            spinId: "spin-spinach",
            skuId: "sku-spinach",
            quantityDescription: "250 g",
            displayName: "Fresh Spinach 250 g",
            brandName: "Fresh",
            price: { mrp: 35, offerPrice: 29 },
            isInStockAndAvailable: true,
          }],
        }] : [],
      }),
    };
    const service = new ShoppingListService(client, priceLookup);
    service.add(homeowner, { name: "Spinach" });
    await service.refreshPrices(homeowner, { addressId: "address-1" });

    hasMatch = false;
    const refreshed = await service.refreshPrices(homeowner, { addressId: "address-1" });

    expect(refreshed.items[0]).toMatchObject({ priceStatus: "not_found", price: null });
  });
});
