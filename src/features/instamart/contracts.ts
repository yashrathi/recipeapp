import { z } from "zod";

const AddressSchema = z.object({
  id: z.string().min(1),
  addressLine: z.string().min(1),
  addressCategory: z.string().optional(),
  addressTag: z.string().optional(),
});

const PaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const InstamartAddressesSchema = z.object({
  addresses: z.array(AddressSchema),
  pagination: PaginationSchema,
});

const PriceSchema = z.object({
  mrp: z.number().nonnegative(),
  offerPrice: z.number().nonnegative(),
  unitLevelPrice: z.string().optional(),
});

const VariationSchema = z.object({
  spinId: z.string().min(1),
  skuId: z.string().min(1),
  quantityDescription: z.string().min(1),
  displayName: z.string().min(1),
  brandName: z.string(),
  price: PriceSchema,
  isInStockAndAvailable: z.boolean(),
  maxQuantity: z.number().int().nonnegative().optional(),
  maxQuantityMessage: z.string().optional(),
});

const ProductSchema = z.object({
  displayName: z.string().min(1),
  brand: z.string(),
  inStock: z.boolean(),
  isAvail: z.boolean(),
  productId: z.string().min(1),
  parentProductId: z.string().min(1),
  variations: z.array(VariationSchema),
});

export const InstamartSearchSchema = z.object({
  nextOffset: z.union([z.string(), z.number()]).optional(),
  products: z.array(ProductSchema),
  similarProducts: z.array(ProductSchema).optional(),
});

export const InstamartSearchInputSchema = z.object({
  addressId: z.string().trim().min(1).max(256),
  query: z.string().trim().min(2, "Enter at least two characters.").max(100),
});

export type InstamartAddresses = z.infer<typeof InstamartAddressesSchema>;
export type InstamartSearch = z.infer<typeof InstamartSearchSchema>;
export type InstamartSearchInput = z.infer<typeof InstamartSearchInputSchema>;

