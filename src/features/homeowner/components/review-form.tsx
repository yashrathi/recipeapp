"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { HomeownerRecipeView } from "@/features/homeowner/server/store";
import styles from "@/app/homeowner/homeowner.module.css";

const unitOptions = [
  "teaspoon", "tablespoon", "cup", "milliliter", "liter", "gram", "kilogram",
  "ounce", "pound", "piece", "clove", "can", "pinch", "bunch",
] as const;

type IngredientState = HomeownerRecipeView["ingredients"][number];
type StepState = HomeownerRecipeView["steps"][number];

function speakPreview(text: string, locale: "en-IN" | "hi-IN") {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  window.speechSynthesis.speak(utterance);
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : "The recipe could not be saved.";
  } catch {
    return "The recipe could not be saved.";
  }
}

export function ReviewForm({ recipe }: { recipe: HomeownerRecipeView }) {
  const router = useRouter();
  const [title, setTitle] = useState(recipe.title);
  const [spokenDishEnglish, setSpokenDishEnglish] = useState(recipe.spokenDishEnglish);
  const [spokenDishHindi, setSpokenDishHindi] = useState(recipe.spokenDishHindi);
  const [servings, setServings] = useState(recipe.servings?.toString() ?? "");
  const [ingredients, setIngredients] = useState<IngredientState[]>(recipe.ingredients);
  const [steps, setSteps] = useState<StepState[]>(recipe.steps);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeIngredient(index: number, patch: Partial<IngredientState>) {
    setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function changeStep(index: number, patch: Partial<StepState>) {
    setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function payload() {
    return {
      title,
      servings: servings ? Number(servings) : null,
      spokenDishEnglish,
      spokenDishHindi,
      reviewConfirmed: confirmed,
      ingredients: ingredients.map((ingredient) => ({
        id: ingredient.id,
        originalText: ingredient.originalText,
        displayLine: ingredient.displayLine,
        ingredientText: ingredient.ingredientText,
        quantityText: ingredient.quantityText || null,
        unit: ingredient.unit || null,
        spokenEnglish: ingredient.spokenEnglish,
        spokenHindi: ingredient.spokenHindi,
      })),
      steps: steps.map((step) => ({
        id: step.id,
        originalText: step.originalText,
        shortText: step.shortText,
        detailedText: step.detailedText,
        spokenEnglish: step.spokenEnglish,
        spokenHindi: step.spokenHindi,
      })),
    };
  }

  async function save(publish: boolean) {
    setBusy(publish ? "publish" : "save");
    setError(null);
    setMessage(null);
    try {
      const saveResponse = await fetch(`/api/homeowner/drafts/${encodeURIComponent(recipe.versionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!saveResponse.ok) throw new Error(await responseMessage(saveResponse));
      if (!publish) {
        setMessage("Draft saved. It still needs review before assignment.");
        router.refresh();
        return;
      }
      const publishResponse = await fetch(
        `/api/homeowner/drafts/${encodeURIComponent(recipe.versionId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed }),
        },
      );
      if (!publishResponse.ok) throw new Error(await responseMessage(publishResponse));
      router.push(`/homeowner/recipes/${recipe.versionId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recipe could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  const hasCoreLists = ingredients.length > 0 && steps.length > 0;
  const hasEnglishGuidance = Boolean(
    spokenDishEnglish.trim()
    && ingredients.every((ingredient) => ingredient.spokenEnglish.trim())
    && steps.every((step) => step.spokenEnglish.trim()),
  );

  return (
    <form className={styles.reviewForm} onSubmit={submit}>
      <section className={styles.reviewSection} aria-labelledby="recipe-basics-heading">
        <div className={styles.sectionTitleRow}>
          <div>
            <p className={styles.eyebrow}>Recipe</p>
            <h2 id="recipe-basics-heading">Name and yield</h2>
          </div>
          <span className={styles.statusBadge}>Draft · needs review</span>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.fieldGroup}>
            <label htmlFor="review-title">Recipe title</label>
            <input id="review-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="review-servings">Servings</label>
            <input id="review-servings" value={servings} onChange={(event) => setServings(event.target.value)} type="number" min="0.5" step="0.5" />
          </div>
        </div>
        <div className={styles.spokenGrid}>
          <div className={styles.spokenCard}>
            <div className={styles.spokenHeader}>
              <label htmlFor="dish-english">Exact English dish speech</label>
              <button className={styles.previewButton} type="button" onClick={() => speakPreview(spokenDishEnglish, "en-IN")} disabled={!spokenDishEnglish.trim()}>Hear English</button>
            </div>
            <input id="dish-english" value={spokenDishEnglish} onChange={(event) => setSpokenDishEnglish(event.target.value)} required />
          </div>
          <div className={styles.spokenCard}>
            <div className={styles.spokenHeader}>
              <label htmlFor="dish-hindi">Hindi dish speech (optional override)</label>
              <button className={styles.previewButton} type="button" onClick={() => speakPreview(spokenDishHindi, "hi-IN")} disabled={!spokenDishHindi.trim()}>Hear Hindi</button>
            </div>
            <input id="dish-hindi" lang="hi" value={spokenDishHindi} onChange={(event) => setSpokenDishHindi(event.target.value)} placeholder="Generated automatically from English when published" />
          </div>
        </div>
      </section>

      <section className={styles.reviewSection} aria-labelledby="ingredients-heading">
        <div className={styles.sectionTitleRow}>
          <div>
            <p className={styles.eyebrow}>Core list · {ingredients.length}</p>
            <h2 id="ingredients-heading">Ingredients</h2>
          </div>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => setIngredients((current) => [...current, {
              id: `new-${crypto.randomUUID()}`,
              originalText: "",
              displayLine: "",
              ingredientText: "",
              quantityText: "",
              unit: null,
              confidence: 1,
              evidence: [],
              spokenEnglish: "",
              spokenHindi: "",
            }])}
          >
            Add ingredient
          </button>
        </div>
        {ingredients.length === 0 ? <p className={styles.gateMessage}>Add an ingredient to unlock publishing.</p> : null}
        <div className={styles.editorStack}>
          {ingredients.map((ingredient, index) => (
            <fieldset className={styles.editorCard} key={ingredient.id}>
              <legend>Ingredient {index + 1}</legend>
              {ingredient.originalText ? (
                <div className={styles.sourceQuote}>
                  <span>Original source line</span>
                  <q>{ingredient.originalText}</q>
                </div>
              ) : null}
              <div className={styles.fieldGroup}>
                <label htmlFor={`ingredient-line-${index}`}>Display line</label>
                <input id={`ingredient-line-${index}`} value={ingredient.displayLine} onChange={(event) => changeIngredient(index, { displayLine: event.target.value })} required />
              </div>
              <div className={styles.threeColumnGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor={`ingredient-name-${index}`}>Ingredient name</label>
                  <input id={`ingredient-name-${index}`} value={ingredient.ingredientText} onChange={(event) => changeIngredient(index, { ingredientText: event.target.value })} required />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor={`ingredient-quantity-${index}`}>Normalized quantity</label>
                  <input id={`ingredient-quantity-${index}`} value={ingredient.quantityText} onChange={(event) => changeIngredient(index, { quantityText: event.target.value })} placeholder="1 or 1/2" />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor={`ingredient-unit-${index}`}>Normalized unit</label>
                  <select id={`ingredient-unit-${index}`} value={ingredient.unit ?? ""} onChange={(event) => changeIngredient(index, { unit: event.target.value || null })}>
                    <option value="">No unit</option>
                    {unitOptions.map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.spokenGrid}>
                <div className={styles.spokenCard}>
                  <div className={styles.spokenHeader}>
                    <label htmlFor={`ingredient-english-${index}`}>Exact English speech</label>
                    <button className={styles.previewButton} type="button" onClick={() => speakPreview(ingredient.spokenEnglish, "en-IN")} disabled={!ingredient.spokenEnglish.trim()}>Hear English</button>
                  </div>
                  <textarea id={`ingredient-english-${index}`} value={ingredient.spokenEnglish} onChange={(event) => changeIngredient(index, { spokenEnglish: event.target.value })} rows={2} required />
                </div>
                <div className={styles.spokenCard}>
                  <div className={styles.spokenHeader}>
                    <label htmlFor={`ingredient-hindi-${index}`}>Hindi speech (optional override)</label>
                    <button className={styles.previewButton} type="button" onClick={() => speakPreview(ingredient.spokenHindi, "hi-IN")} disabled={!ingredient.spokenHindi.trim()}>Hear Hindi</button>
                  </div>
                  <textarea id={`ingredient-hindi-${index}`} lang="hi" value={ingredient.spokenHindi} onChange={(event) => changeIngredient(index, { spokenHindi: event.target.value })} rows={2} placeholder="Generated automatically from English when published" />
                </div>
              </div>
              <div className={styles.editorMeta}>
                <span>{Math.round(ingredient.confidence * 100)}% extraction confidence</span>
                {ingredient.evidence[0] ? <code>{ingredient.evidence[0].locator}</code> : <span>Homeowner entry</span>}
                <button className={styles.dangerLink} type="button" onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ingredient ${index + 1}`}>Remove</button>
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className={styles.reviewSection} aria-labelledby="steps-heading">
        <div className={styles.sectionTitleRow}>
          <div>
            <p className={styles.eyebrow}>Core list · {steps.length}</p>
            <h2 id="steps-heading">Steps and spoken guidance</h2>
          </div>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => setSteps((current) => [...current, {
              id: `new-${crypto.randomUUID()}`,
              originalText: "",
              shortText: "New step",
              detailedText: "",
              confidence: 1,
              evidence: [],
              spokenEnglish: "",
              spokenHindi: "",
              visual: {
                kind: "action_icon", purpose: "show_action", verification: "approved",
                rights: "bundled", attribution: "Recipe App verified action-icon fallback", fallback: true,
              },
            }])}
          >
            Add step
          </button>
        </div>
        {steps.length === 0 ? <p className={styles.gateMessage}>Add a cooking step to unlock publishing.</p> : null}
        <div className={styles.editorStack}>
          {steps.map((step, index) => (
            <fieldset className={styles.editorCard} key={step.id}>
              <legend>Step {index + 1}</legend>
              {step.originalText ? (
                <div className={styles.sourceQuote}>
                  <span>Original source instruction</span>
                  <q>{step.originalText}</q>
                </div>
              ) : null}
              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor={`step-short-${index}`}>Short action</label>
                  <input id={`step-short-${index}`} value={step.shortText} onChange={(event) => changeStep(index, { shortText: event.target.value })} maxLength={280} required />
                </div>
                <div className={styles.visualMeta}>
                  <span aria-hidden="true">◇</span>
                  <div>
                    <strong>{step.visual.fallback ? "Verified fallback" : "Approved recipe visual"}</strong>
                    <p>{step.visual.kind.replaceAll("_", " ")} · {step.visual.rights} · {step.visual.verification}</p>
                    <small>{step.visual.attribution}</small>
                  </div>
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor={`step-detail-${index}`}>Full cooking instruction</label>
                <textarea id={`step-detail-${index}`} value={step.detailedText} onChange={(event) => changeStep(index, { detailedText: event.target.value })} rows={3} required />
              </div>
              <div className={styles.spokenGrid}>
                <div className={styles.spokenCard}>
                  <div className={styles.spokenHeader}>
                    <label htmlFor={`step-english-${index}`}>Exact English speech</label>
                    <button className={styles.previewButton} type="button" onClick={() => speakPreview(step.spokenEnglish, "en-IN")} disabled={!step.spokenEnglish.trim()}>Hear English</button>
                  </div>
                  <textarea id={`step-english-${index}`} value={step.spokenEnglish} onChange={(event) => changeStep(index, { spokenEnglish: event.target.value })} rows={3} required />
                  <p className={styles.exactPreview}>Will say: “{step.spokenEnglish || "Add reviewed English guidance"}”</p>
                </div>
                <div className={styles.spokenCard}>
                  <div className={styles.spokenHeader}>
                    <label htmlFor={`step-hindi-${index}`}>Hindi speech (optional override)</label>
                    <button className={styles.previewButton} type="button" onClick={() => speakPreview(step.spokenHindi, "hi-IN")} disabled={!step.spokenHindi.trim()}>Hear Hindi</button>
                  </div>
                  <textarea id={`step-hindi-${index}`} lang="hi" value={step.spokenHindi} onChange={(event) => changeStep(index, { spokenHindi: event.target.value })} rows={3} placeholder="Generated automatically from English when published" />
                  <p className={styles.exactPreview}>{step.spokenHindi ? `Will say: “${step.spokenHindi}”` : "The app will generate this Hindi speech from the English guidance."}</p>
                </div>
              </div>
              <div className={styles.editorMeta}>
                <span>{Math.round(step.confidence * 100)}% extraction confidence</span>
                {step.evidence[0] ? <code>{step.evidence[0].locator}</code> : <span>Homeowner entry</span>}
                <button className={styles.dangerLink} type="button" onClick={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove step ${index + 1}`}>Remove</button>
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className={styles.publishPanel} aria-labelledby="publish-heading">
        <div>
          <p className={styles.eyebrow}>Human review gate</p>
          <h2 id="publish-heading">Publish one immutable version</h2>
          <p>Publishing locks this version for assignment. Later edits must become a new version.</p>
        </div>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I reviewed the ingredients, steps, English spoken guidance, any Hindi overrides, source evidence, and visual fallbacks.</span>
        </label>
        {!hasCoreLists ? <p className={styles.gateMessage}>Publishing is blocked until both core lists contain at least one item.</p> : null}
        {hasCoreLists && !hasEnglishGuidance ? <p className={styles.gateMessage}>Publishing is blocked until English speech is reviewed for the dish, every ingredient, and every step. Blank Hindi fields are generated automatically.</p> : null}
        {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
        {message ? <p className={styles.successText} role="status">{message}</p> : null}
        <div className={styles.inlineActions}>
          <button className={styles.secondaryButton} type="submit" disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button className={styles.primaryButton} type="button" onClick={() => void save(true)} disabled={busy !== null || !hasCoreLists || !hasEnglishGuidance || !confirmed}>{busy === "publish" ? "Translating and publishing…" : "Publish reviewed recipe"}</button>
        </div>
      </section>
    </form>
  );
}
