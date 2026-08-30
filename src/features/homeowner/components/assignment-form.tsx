"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "@/app/homeowner/homeowner.module.css";

export function AssignmentForm({
  versionId,
  title,
  servings,
  defaultDate,
  househelp,
}: {
  versionId: string;
  title: string;
  servings: number | null;
  defaultDate: string;
  househelp: Array<{ id: string; name: string; spokenLocale: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; guidanceReady: boolean } | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/homeowner/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeVersionId: versionId,
          assigneeId: formData.get("assigneeId"),
          scheduledDate: formData.get("scheduledDate"),
          mealSlot: formData.get("mealSlot"),
          targetTime: formData.get("targetTime") || null,
          targetServings: Number(formData.get("targetServings")),
          selectedLocale: formData.get("selectedLocale"),
          notesEnglish: formData.get("notesEnglish") || null,
          notesHindi: formData.get("notesHindi") || null,
          noteReviewConfirmed: formData.get("noteReviewConfirmed") === "on",
        }),
      });
      const payload = await response.json() as { id?: unknown; guidanceReady?: unknown; error?: unknown };
      if (!response.ok || typeof payload.id !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "The assignment could not be created.");
      }
      setResult({ id: payload.id, guidanceReady: payload.guidanceReady === true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assignment could not be created.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section className={styles.successPanel} aria-labelledby="assignment-created-heading">
        <p className={styles.eyebrow}>Assignment created</p>
        <h2 id="assignment-created-heading">{title} is on the household plan</h2>
        <p>{result.guidanceReady
          ? "The selected spoken guidance is complete and ready for the househelp flow."
          : "The assignment is saved, but its selected-language audio readiness still needs attention before cooking."}</p>
        <Link className={styles.primaryLink} href="/homeowner">Return to Today</Link>
      </section>
    );
  }

  return (
    <form className={styles.formCard} action={submit}>
      <div className={styles.formGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-date">Date</label>
          <input id="assignment-date" name="scheduledDate" type="date" defaultValue={defaultDate} required />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-meal">Meal</label>
          <select id="assignment-meal" name="mealSlot" defaultValue="dinner">
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="snack">Snack</option>
            <option value="dinner">Dinner</option>
          </select>
        </div>
      </div>
      <div className={styles.formGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-time">Optional target time</label>
          <input id="assignment-time" name="targetTime" type="time" />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-servings">Servings</label>
          <input id="assignment-servings" name="targetServings" type="number" min="0.5" step="0.5" defaultValue={servings ?? 2} required />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label htmlFor="assignment-person">Cook</label>
        <select id="assignment-person" name="assigneeId" required defaultValue={househelp[0]?.id ?? ""}>
          {househelp.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
        </select>
      </div>
      <fieldset className={styles.localeFieldset}>
        <legend>Spoken language for this assignment</legend>
        <label><input type="radio" name="selectedLocale" value="en-IN" defaultChecked /> English</label>
        <label><input type="radio" name="selectedLocale" value="hi-IN" /> हिन्दी</label>
        <p>The househelp confirms the language by hearing a sample on their device.</p>
      </fieldset>
      <div className={styles.spokenGrid}>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-note-english">Exact English homeowner note</label>
          <textarea id="assignment-note-english" name="notesEnglish" rows={3} placeholder="For example: use less chilli" />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="assignment-note-hindi">Hindi homeowner note (optional override)</label>
          <textarea id="assignment-note-hindi" name="notesHindi" lang="hi" rows={3} placeholder="Generated automatically from the English note" />
        </div>
        <p className={styles.fieldHint}>Write the note in English. The app generates Hindi automatically unless you add an optional Hindi override.</p>
      </div>
      <label className={styles.checkRow}>
        <input type="checkbox" name="noteReviewConfirmed" />
        <span>If I added a note, I reviewed its English wording and any Hindi override.</span>
      </label>
      {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
      <button className={styles.primaryButton} type="submit" disabled={busy || househelp.length === 0}>
        {busy ? "Assigning…" : "Assign recipe"}
      </button>
    </form>
  );
}
