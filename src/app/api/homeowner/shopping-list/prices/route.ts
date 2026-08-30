import { requireHomeownerActor } from "@/features/homeowner/server/auth";
import { noStoreShoppingJson, shoppingListErrorResponse } from "@/features/shopping/server/http";
import { ShoppingListService } from "@/features/shopping/server/shopping-list";
import { isDemoAuthEnabled } from "@/server/config/env";
import { getDatabaseHandle } from "@/server/db/client";

export async function POST(request: Request) {
  if (!isDemoAuthEnabled()) {
    return noStoreShoppingJson({ error: "Instamart price checks are disabled." }, { status: 404 });
  }
  try {
    const actor = await requireHomeownerActor();
    const list = await new ShoppingListService(getDatabaseHandle().client)
      .refreshPrices(actor, await request.json());
    return noStoreShoppingJson(list);
  } catch (error) {
    return shoppingListErrorResponse(error);
  }
}
