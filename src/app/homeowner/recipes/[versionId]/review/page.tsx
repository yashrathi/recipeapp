import Link from "next/link";
import { redirect } from "next/navigation";

import { ReviewForm } from "@/features/homeowner/components/review-form";
import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { HomeownerStore } from "@/features/homeowner/server/store";
import styles from "../../../homeowner.module.css";

export default async function ReviewRecipePage({ params }: { params: Promise<{ versionId: string }> }) {
  const actor = await requireHomeownerPage();
  const { versionId } = await params;
  const recipe = await new HomeownerStore().getRecipe(actor, versionId);
  if (recipe.reviewStatus === "published") redirect(`/homeowner/recipes/${versionId}`);

  return (
    <>
      <Link className={styles.breadcrumb} href="/homeowner/recipes">← Recipes</Link>
      <header className={styles.reviewHeader}>
        <div>
          <p className={styles.eyebrow}>Human review workspace</p>
          <h1>Make the draft trustworthy</h1>
          <p>Keep the source wording visible while correcting the version your household will use.</p>
        </div>
        <aside className={styles.sourcePanel} aria-label="Recipe source">
          <span>Source attribution</span>
          <strong>{recipe.source.attribution}</strong>
          {recipe.source.author ? <p>{recipe.source.author}</p> : null}
          {recipe.source.canonicalUrl ? <a href={recipe.source.canonicalUrl} target="_blank" rel="noreferrer">Open original source ↗</a> : <p>Homeowner-entered recipe</p>}
        </aside>
      </header>

      {recipe.warnings.length ? (
        <section className={styles.warningPanel} aria-labelledby="warning-heading">
          <p className={styles.eyebrow}>Extraction review</p>
          <h2 id="warning-heading">{recipe.warnings.length} {recipe.warnings.length === 1 ? "warning" : "warnings"} need attention</h2>
          <ul>
            {recipe.warnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.fieldPath}-${index}`}>
                <strong>{warning.code.replaceAll("_", " ")}</strong>
                <span>{warning.message}</span>
                <code>{warning.fieldPath}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ReviewForm recipe={recipe} />
    </>
  );
}
