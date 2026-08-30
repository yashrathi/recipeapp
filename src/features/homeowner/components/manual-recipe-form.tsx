"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "@/app/homeowner/homeowner.module.css";

export function ManualRecipeForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const ingredients = String(formData.get("ingredients") ?? "")
        .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const steps = String(formData.get("steps") ?? "")
        .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const servingsText = String(formData.get("servings") ?? "").trim();
      const response = await fetch("/api/homeowner/drafts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          servings: servingsText ? Number(servingsText) : null,
          ingredients,
          steps,
        }),
      });
      const payload = await response.json() as { versionId?: unknown; error?: unknown };
      if (!response.ok || typeof payload.versionId !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "The manual draft could not be saved.");
      }
      router.push(`/homeowner/recipes/${payload.versionId}/review`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The manual draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.formCard} action={submit}>
      <div className={styles.formGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor="manual-title">Recipe title</label>
          <input id="manual-title" name="title" required />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="manual-servings">Servings</label>
          <input id="manual-servings" name="servings" type="number" min="0.5" step="0.5" />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="manual-ingredients">Ingredients · one per line</label>
        <textarea id="manual-ingredients" name="ingredients" rows={7} required />
        <p className={styles.fieldHint}>Keep quantities in the line, for example: 2 cups spinach, washed.</p>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="manual-steps">Cooking steps · one per line</label>
        <textarea id="manual-steps" name="steps" rows={8} required />
      </div>
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
      <button className={styles.primaryButton} type="submit" disabled={busy}>
        {busy ? "Creating draft…" : "Create review draft"}
      </button>
    </form>
  );
}
