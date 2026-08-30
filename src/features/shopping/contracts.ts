import { z } from "zod";

export const ShoppingListItemInputSchema = z.object({
  name: z.string().trim().min(2, "Enter at least two characters.").max(100),
  quantityNote: z.string().trim().max(40).optional().default(""),
});

export const ShoppingPriceRefreshInputSchema = z.object({
  addressId: z.string().trim().min(1).max(256),
});

export interface ShoppingPriceSnapshot {
  providerProductId: string;
  providerSpinId: string;
  productName: string;
  brandName: string;
  packSize: string;
  mrp: number;
  offerPrice: number;
  available: boolean;
  checkedAt: string;
}

export interface ShoppingListItem {
  id: string;
  name: string;
  quantityNote: string | null;
  priceStatus: "unchecked" | "matched" | "not_found" | "error";
  price: ShoppingPriceSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdShoppingList {
  id: string;
  householdId: string;
  items: ShoppingListItem[];
}
