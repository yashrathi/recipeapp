import Link from "next/link";
import { notFound } from "next/navigation";

import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { PriceChecker } from "@/features/instamart/components/price-checker";
import { instamartRegistry } from "@/features/instamart/server/registry";
import { isDemoAuthEnabled } from "@/server/config/env";
import styles from "./instamart.module.css";

export const dynamic = "force-dynamic";

export default async function InstamartPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ connection?: string }>;
}) {
  if (!isDemoAuthEnabled()) notFound();
  const actor = await requireHomeownerPage();
  const connection = (await searchParams).connection;
  const connected = Boolean(instamartRegistry.getActiveToken(actor));

  return (
    <div className={styles.page}>
      <Link className={styles.breadcrumb} href="/homeowner">← Homeowner Today</Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Instamart · read-only spike</p>
        <h1>Check local ingredient prices</h1>
        <p>Compare live product variations for one saved Swiggy address. This page has no cart, payment, or ordering capability.</p>
      </header>
      {connection === "connected" ? <p className={styles.successBanner} role="status">Swiggy connected. Choose an address to begin.</p> : null}
      {connection === "failed" ? <p className={styles.errorPanel} role="alert">Swiggy did not complete the connection. Try again, or request developer access if the callback is rejected.</p> : null}
      <PriceChecker initiallyConnected={connected} />
    </div>
  );
}
