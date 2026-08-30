import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import {
  ShoppingListItemInputSchema,
  ShoppingPriceRefreshInputSchema,
  type HouseholdShoppingList,
  type ShoppingListItem,
  type ShoppingPriceSnapshot,
} from "@/features/shopping/contracts";
import type { InstamartSearch } from "@/features/instamart/contracts";
import { InstamartPriceService } from "@/features/instamart/server/service";
import { ShoppingListError } from "@/features/shopping/server/errors";
import type { HouseholdActor } from "@/server/auth/policy";
import { authorize } from "@/server/auth/policy";

interface ListRow {
  id: string;
  household_id: string;
}

interface ItemRow {
  id: string;
  name: string;
  quantity_note: string | null;
  price_status: ShoppingListItem["priceStatus"];
  provider_product_id: string | null;
  provider_spin_id: string | null;
  product_name: string | null;
  brand_name: string | null;
  pack_size: string | null;
  mrp: number | null;
  offer_price: number | null;
  available: number | null;
  price_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShoppingPriceLookup {
  search(
    actor: HouseholdActor,
    input: { addressId: string; query: string },
  ): Promise<InstamartSearch & { checkedAt: string }>;
}

function normalizeName(name: string): string {
  return name.toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}

export class ShoppingListService {
  constructor(
    private readonly client: Database.Database,
    private readonly priceLookup: ShoppingPriceLookup = new InstamartPriceService(),
  ) {}

  get(actor: HouseholdActor): HouseholdShoppingList {
    authorize(actor, "shopping:view", { householdId: actor.householdId });
    const list = this.findList(actor.householdId);
    return {
      id: list?.id ?? `shopping-list-${actor.householdId}`,
      householdId: actor.householdId,
      items: list ? this.listItems(list.id) : [],
    };
  }

  add(actor: HouseholdActor, input: unknown): HouseholdShoppingList {
    authorize(actor, "shopping:manage", { householdId: actor.householdId });
    const parsed = ShoppingListItemInputSchema.parse(input);
    const timestamp = new Date().toISOString();

    try {
      this.client.transaction(() => {
        const listId = this.ensureList(actor, timestamp);
        this.client.prepare(
          `INSERT INTO shopping_list_items
             (id, shopping_list_id, name, normalized_name, quantity_note, price_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'unchecked', ?, ?)`,
        ).run(
          randomUUID(),
          listId,
          parsed.name,
          normalizeName(parsed.name),
          parsed.quantityNote || null,
          timestamp,
          timestamp,
        );
        this.client.prepare("UPDATE shopping_lists SET updated_at = ? WHERE id = ?").run(timestamp, listId);
      })();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        throw new ShoppingListError(
          "DUPLICATE_ITEM",
          `${parsed.name} is already on the shopping list.`,
          409,
        );
      }
      throw error;
    }

    return this.get(actor);
  }

  remove(actor: HouseholdActor, itemId: string): HouseholdShoppingList {
    authorize(actor, "shopping:manage", { householdId: actor.householdId });
    this.client.prepare(
      `DELETE FROM shopping_list_items
       WHERE id = ? AND shopping_list_id IN (
         SELECT id FROM shopping_lists WHERE household_id = ?
       )`,
    ).run(itemId, actor.householdId);
    return this.get(actor);
  }

  async refreshPrices(actor: HouseholdActor, input: unknown): Promise<HouseholdShoppingList> {
    authorize(actor, "shopping:manage", { householdId: actor.householdId });
    const parsed = ShoppingPriceRefreshInputSchema.parse(input);
    const list = this.findList(actor.householdId);
    if (!list) return this.get(actor);

    for (const item of this.listItems(list.id)) {
      try {
        const result = await this.priceLookup.search(actor, {
          addressId: parsed.addressId,
          query: item.name,
        });
        const match = topAvailableMatch(result);
        if (match) this.saveMatch(list.id, item.id, match);
        else this.saveNoMatch(list.id, item.id, result.checkedAt);
      } catch {
        this.saveRefreshError(list.id, item.id, new Date().toISOString());
      }
    }
    return this.get(actor);
  }

  private findList(householdId: string): ListRow | null {
    return (this.client.prepare(
      "SELECT id, household_id FROM shopping_lists WHERE household_id = ?",
    ).get(householdId) as ListRow | undefined) ?? null;
  }

  private ensureList(actor: HouseholdActor, timestamp: string): string {
    const existing = this.findList(actor.householdId);
    if (existing) return existing.id;
    const id = `shopping-list-${actor.householdId}`;
    this.client.prepare(
      `INSERT INTO shopping_lists (id, household_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, actor.householdId, actor.userId, timestamp, timestamp);
    return id;
  }

  private listItems(listId: string): ShoppingListItem[] {
    return (this.client.prepare(
      `SELECT id, name, quantity_note, price_status, provider_product_id, provider_spin_id,
              product_name, brand_name, pack_size, mrp, offer_price, available,
              price_checked_at, created_at, updated_at
       FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY created_at, id`,
    ).all(listId) as ItemRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      quantityNote: row.quantity_note,
      priceStatus: row.price_status,
      price: priceFromRow(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private saveMatch(listId: string, itemId: string, match: ShoppingPriceSnapshot): void {
    this.client.prepare(
      `UPDATE shopping_list_items SET
         price_status = 'matched', provider_product_id = ?, provider_spin_id = ?,
         product_name = ?, brand_name = ?, pack_size = ?, mrp = ?, offer_price = ?,
         available = ?, price_checked_at = ?, updated_at = ?
       WHERE id = ? AND shopping_list_id = ?`,
    ).run(
      match.providerProductId,
      match.providerSpinId,
      match.productName,
      match.brandName,
      match.packSize,
      match.mrp,
      match.offerPrice,
      match.available ? 1 : 0,
      match.checkedAt,
      match.checkedAt,
      itemId,
      listId,
    );
  }

  private saveNoMatch(listId: string, itemId: string, checkedAt: string): void {
    this.client.prepare(
      `UPDATE shopping_list_items
       SET price_status = 'not_found', provider_product_id = NULL, provider_spin_id = NULL,
           product_name = NULL, brand_name = NULL, pack_size = NULL, mrp = NULL,
           offer_price = NULL, available = NULL, price_checked_at = ?, updated_at = ?
       WHERE id = ? AND shopping_list_id = ?`,
    ).run(checkedAt, checkedAt, itemId, listId);
  }

  private saveRefreshError(listId: string, itemId: string, attemptedAt: string): void {
    this.client.prepare(
      `UPDATE shopping_list_items SET price_status = 'error', updated_at = ?
       WHERE id = ? AND shopping_list_id = ?`,
    ).run(attemptedAt, itemId, listId);
  }
}

function topAvailableMatch(result: InstamartSearch & { checkedAt: string }): ShoppingPriceSnapshot | null {
  for (const product of result.products) {
    const variation = product.variations.find((candidate) => candidate.isInStockAndAvailable);
    if (!variation) continue;
    return {
      providerProductId: product.productId,
      providerSpinId: variation.spinId,
      productName: variation.displayName || product.displayName,
      brandName: variation.brandName || product.brand,
      packSize: variation.quantityDescription,
      mrp: variation.price.mrp,
      offerPrice: variation.price.offerPrice,
      available: variation.isInStockAndAvailable,
      checkedAt: result.checkedAt,
    };
  }
  return null;
}

function priceFromRow(row: ItemRow): ShoppingPriceSnapshot | null {
  if (
    !row.provider_product_id ||
    !row.provider_spin_id ||
    !row.product_name ||
    row.brand_name === null ||
    !row.pack_size ||
    row.mrp === null ||
    row.offer_price === null ||
    row.available === null ||
    !row.price_checked_at
  ) return null;
  return {
    providerProductId: row.provider_product_id,
    providerSpinId: row.provider_spin_id,
    productName: row.product_name,
    brandName: row.brand_name,
    packSize: row.pack_size,
    mrp: row.mrp,
    offerPrice: row.offer_price,
    available: Boolean(row.available),
    checkedAt: row.price_checked_at,
  };
}
