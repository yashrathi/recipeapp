import Link from "next/link";

import { ManualRecipeForm } from "@/features/homeowner/components/manual-recipe-form";
import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import styles from "../../homeowner.module.css";

export default async function ManualRecipePage() {
  await requireHomeownerPage();
  return (
    <div className={styles.narrowPage}>
      <Link className={styles.breadcrumb} href="/homeowner/recipes/new">← Add recipe</Link>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Manual fallback</p>
        <h1>Start with what you trust</h1>
        <p>Create a review draft from your own ingredient lines and ordered steps. Spoken Hindi can be added during review.</p>
      </header>
      <ManualRecipeForm />
    </div>
  );
}
