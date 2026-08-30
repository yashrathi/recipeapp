import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/features/homeowner/components/assignment-form";
import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { HomeownerStore } from "@/features/homeowner/server/store";
import styles from "../../../homeowner.module.css";

function tomorrowDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default async function AssignRecipePage({ params }: { params: Promise<{ versionId: string }> }) {
  const actor = await requireHomeownerPage();
  const { versionId } = await params;
  const store = new HomeownerStore();
  const [recipe, househelp] = await Promise.all([
    store.getRecipe(actor, versionId),
    store.listHousehelp(actor),
  ]);
  if (recipe.reviewStatus !== "published") notFound();

  return (
    <div className={styles.narrowPage}>
      <Link className={styles.breadcrumb} href={`/homeowner/recipes/${versionId}`}>← {recipe.title}</Link>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Meal assignment</p>
        <h1>Plan {recipe.title}</h1>
        <p>Pin this published version to a date, meal, househelp member, and spoken locale.</p>
      </header>
      {househelp.length ? <AssignmentForm versionId={versionId} title={recipe.title} servings={recipe.servings} defaultDate={tomorrowDate()} househelp={househelp} /> : <section className={styles.errorPanel}><h2>No active househelp member</h2><p>Use the seeded household invite before assigning a recipe.</p></section>}
    </div>
  );
}
