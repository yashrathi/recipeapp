import { getAuthenticatedActor, requireHomeownerActor } from "@/features/homeowner/server/auth";
import { noStoreShoppingJson, shoppingListErrorResponse } from "@/features/shopping/server/http";
import { ShoppingListService } from "@/features/shopping/server/shopping-list";
import { getDatabaseHandle } from "@/server/db/client";

export async function GET() {
  try {
    const actor = await getAuthenticatedActor();
    return noStoreShoppingJson(new ShoppingListService(getDatabaseHandle().client).get(actor));
  } catch (error) {
    return shoppingListErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireHomeownerActor();
    const list = new ShoppingListService(getDatabaseHandle().client).add(actor, await request.json());
    return noStoreShoppingJson(list, { status: 201 });
  } catch (error) {
    return shoppingListErrorResponse(error);
  }
}
