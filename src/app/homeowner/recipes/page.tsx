import Link from "next/link";

import { requireHomeownerPage } from "@/features/homeowner/server/auth";
import { HomeownerStore } from "@/features/homeowner/server/store";
import styles from "../homeowner.module.css";

export default async function RecipesPage() {
  const actor = await requireHomeownerPage();
  const recipes = await new HomeownerStore().listRecipes(actor);
  return (
    <>
      <header className={styles.listHeader}>
        <div><p className={styles.eyebrow}>Household library</p><h1>Recipes</h1><p>Published versions stay immutable; drafts keep their review evidence.</p></div>
        <Link className={styles.primaryLink} href="/homeowner/recipes/new">Add recipe</Link>
      </header>
      <section className={styles.recipeGrid} aria-label="Household recipes">
        {recipes.map((recipe) => (
          <article className={styles.recipeCard} key={recipe.versionId}>
            <div className={styles.sectionTitleRow}>
              <span className={styles.sourceBadge}>{recipe.sourceType}</span>
              <span className={styles.statusBadge}>{recipe.reviewStatus.replaceAll("_", " ")}</span>
            </div>
            <h2>{recipe.title}</h2>
            <p>{recipe.servings ? `${recipe.servings} servings · ` : ""}{recipe.attribution}</p>
            <Link className={styles.textLink} href={recipe.reviewStatus === "published" ? `/homeowner/recipes/${recipe.versionId}` : `/homeowner/recipes/${recipe.versionId}/review`}>
              {recipe.reviewStatus === "published" ? "View recipe" : "Continue review"}
            </Link>
          </article>
        ))}
        {!recipes.length ? <p className={styles.emptyState}>The recipe library is empty.</p> : null}
      </section>
    </>
  );
}
