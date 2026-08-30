import Link from "next/link";

import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { instamartRegistry } from "@/features/instamart/server/registry";
import { HomeownerShoppingList } from "@/features/shopping/components/homeowner-shopping-list";
import { ShoppingListService } from "@/features/shopping/server/shopping-list";
import { getDatabaseHandle } from "@/server/db/client";

import styles from "./shopping.module.css";

export const dynamic = "force-dynamic";

export default async function HomeownerShoppingPage() {
  const actor = await requireHomeownerPage();
  const list = new ShoppingListService(getDatabaseHandle().client).get(actor);
  const connected = Boolean(instamartRegistry.getActiveToken(actor));

  return (
    <div className={styles.page}>
      <Link className={styles.breadcrumb} href="/homeowner">← Homeowner Today</Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Shopping</p>
        <h1>Household shopping list</h1>
        <p>Save what the household needs, share it with househelp, and attach current Instamart price snapshots.</p>
      </header>
      <HomeownerShoppingList initialList={list} initiallyConnected={connected} />
    </div>
  );
}
