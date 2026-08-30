import Link from "next/link";
import { notFound } from "next/navigation";

import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { HomeownerStore } from "@/features/homeowner/server/store";
import styles from "../../homeowner.module.css";

export default async function RecipeDetailPage({ params }: { params: Promise<{ versionId: string }> }) {
  const actor = await requireHomeownerPage();
  const { versionId } = await params;
  const recipe = await new HomeownerStore().getRecipe(actor, versionId);
  if (recipe.reviewStatus !== "published") notFound();

  return (
    <>
      <Link className={styles.breadcrumb} href="/homeowner/recipes">← Recipes</Link>
      <header className={styles.recipeHero}>
        <div>
          <p className={styles.eyebrow}>Published · immutable version</p>
          <h1>{recipe.title}</h1>
          <p>{recipe.servings ? `${recipe.servings} servings · ` : ""}Source: {recipe.source.attribution}</p>
          {recipe.source.canonicalUrl ? <a className={styles.textLink} href={recipe.source.canonicalUrl} target="_blank" rel="noreferrer">Open original source ↗</a> : null}
        </div>
        <Link className={styles.primaryLink} href={`/homeowner/recipes/${versionId}/assign`}>Assign to cook</Link>
      </header>
      <div className={styles.recipeDetailGrid}>
        <section className={styles.panel} aria-labelledby="published-ingredients-heading">
          <p className={styles.eyebrow}>{recipe.ingredients.length} items</p>
          <h2 id="published-ingredients-heading">Ingredients</h2>
          <ol className={styles.readList}>{recipe.ingredients.map((ingredient) => <li key={ingredient.id}>{ingredient.displayLine}</li>)}</ol>
        </section>
        <section className={styles.panel} aria-labelledby="published-steps-heading">
          <p className={styles.eyebrow}>{recipe.steps.length} ordered actions</p>
          <h2 id="published-steps-heading">Cooking steps</h2>
          <ol className={styles.stepList}>{recipe.steps.map((step) => <li key={step.id}><strong>{step.shortText}</strong><span>{step.detailedText}</span><small>English speech: “{step.spokenEnglish}”</small>{step.spokenHindi ? <small lang="hi">Hindi speech: “{step.spokenHindi}”</small> : <small>Hindi speech will be generated when published</small>}</li>)}</ol>
        </section>
      </div>
    </>
  );
}
