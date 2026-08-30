import Link from "next/link";

import { ImportForm } from "@/features/homeowner/components/import-form";
import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import styles from "../../homeowner.module.css";

export default async function AddRecipePage() {
  await requireHomeownerPage();
  return (
    <div className={styles.narrowPage}>
      <Link className={styles.breadcrumb} href="/homeowner">← Today</Link>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>New source</p>
        <h1>Add a recipe</h1>
        <p>Paste one public recipe webpage or YouTube video link. The source and evidence stay attached to the draft, and nothing is publishable until you review it.</p>
      </header>
      <ImportForm />
      <section className={styles.manualCallout}>
        <div><p className={styles.eyebrow}>Reliable fallback</p><h2>Already know the recipe?</h2><p>Enter the ingredients and steps manually when a page is unsupported or a video has no usable transcript.</p></div>
        <Link className={styles.secondaryLink} href="/homeowner/recipes/manual">Enter manually</Link>
      </section>
    </div>
  );
}
