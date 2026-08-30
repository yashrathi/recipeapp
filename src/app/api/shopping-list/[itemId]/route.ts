import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { noStoreShoppingJson, shoppingListErrorResponse } from "@/features/shopping/server/http";
import { ShoppingListService } from "@/features/shopping/server/shopping-list";
import { getDatabaseHandle } from "@/server/db/client";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const actor = await requireHomeownerActor();
    const { itemId } = await context.params;
    const list = new ShoppingListService(getDatabaseHandle().client).remove(actor, itemId);
    return noStoreShoppingJson(list);
  } catch (error) {
    return shoppingListErrorResponse(error);
  }
}
