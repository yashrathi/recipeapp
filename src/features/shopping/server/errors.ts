export class ShoppingListError extends Error {
  constructor(
    readonly code: "DUPLICATE_ITEM",
    message: string,
    readonly status: 409,
  ) {
    super(message);
    this.name = "ShoppingListError";
  }
}
