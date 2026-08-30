import { redirect } from "next/navigation";

import { getHousehelpActor } from "@/features/househelp/server/auth";
import { HousehelpAccessError } from "@/features/househelp/server/repository";
import type { HousehelpLocale } from "@/features/househelp/types";
import { HousehelpShoppingList } from "@/features/shopping/components/househelp-shopping-list";
import { ShoppingListService } from "@/features/shopping/server/shopping-list";
import { getDatabaseHandle } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function HousehelpShoppingPage() {
  try {
    const actor = await getHousehelpActor();
    const database = getDatabaseHandle();
    const list = new ShoppingListService(database.client).get(actor);
    const user = database.client.prepare("SELECT spoken_locale FROM users WHERE id = ?")
      .get(actor.userId) as { spoken_locale: HousehelpLocale } | undefined;
    return <HousehelpShoppingList list={list} locale={user?.spoken_locale ?? "hi-IN"} />;
  } catch (error) {
    if (error instanceof HousehelpAccessError && error.status === 401) redirect("/");
    redirect("/workspace");
  }
}
