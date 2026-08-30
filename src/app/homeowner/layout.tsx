import Link from "next/link";
import type { ReactNode } from "react";

import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { isDemoAuthEnabled } from "@/server/config/env";
import styles from "./homeowner.module.css";

export const dynamic = "force-dynamic";

export default async function HomeownerLayout({ children }: { children: ReactNode }) {
  await requireHomeownerPage();
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/homeowner" aria-label="Ghormai homeowner Today">
          <span className={styles.brandMark} aria-hidden="true">G</span>
          <span>Ghormai</span>
        </Link>
        <nav className={styles.nav} aria-label="Homeowner">
          <Link href="/homeowner">Today</Link>
          <Link href="/homeowner/recipes">Recipes</Link>
          <Link href="/homeowner/recipes/new">Add recipe</Link>
          {isDemoAuthEnabled() ? <Link href="/homeowner/shopping">Shopping</Link> : null}
        </nav>
        <form action="/api/session/logout" method="post">
          <button className={styles.logoutButton} type="submit">Exit demo</button>
        </form>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
