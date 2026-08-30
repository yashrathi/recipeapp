"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { interpretImportApiPayload, type ImportedRecipeResult } from "@/features/homeowner/contracts";
import styles from "@/app/homeowner/homeowner.module.css";

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function persistResult(jobId: string | null, result: ImportedRecipeResult): Promise<string> {
  const response = await fetch("/api/homeowner/drafts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, result }),
  });
  const payload = await readPayload(response) as { versionId?: unknown; error?: unknown } | null;
  if (!response.ok || typeof payload?.versionId !== "string") {
    throw new Error(typeof payload?.error === "string" ? payload.error : "The draft could not be opened.");
  }
  return payload.versionId;
}

export function ImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const url = String(formData.get("url") ?? "").trim();
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ url }),
      });
      const interpretation = interpretImportApiPayload(await readPayload(response), response.ok);
      if (interpretation.kind === "failure") {
        setError(interpretation.message);
        return;
      }
      if (interpretation.kind === "draft") {
        router.push(`/homeowner/recipes/${interpretation.versionId}/review`);
        return;
      }
      if (interpretation.kind === "result") {
        const versionId = await persistResult(interpretation.jobId, interpretation.result);
        router.push(`/homeowner/recipes/${versionId}/review`);
        return;
      }
      router.push(`/homeowner/imports/${interpretation.jobId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import service is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.formCard} action={submit}>
      <div className={styles.fieldGroup}>
        <label htmlFor="recipe-url">Public recipe webpage or YouTube URL</label>
        <input
          id="recipe-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com/recipe or youtube.com/watch?v=…"
          required
        />
        <p className={styles.fieldHint}>
          Paste one public recipe page or a public YouTube watch, share, or Shorts link. AI-assisted drafts are evidence-checked and always require your review.
        </p>
      </div>
      {error ? (
        <div className={styles.errorPanel} role="alert">
          <strong>We could not prepare that recipe.</strong>
          <p>{error}</p>
          <div className={styles.inlineActions}>
            <button className={styles.secondaryButton} type="submit" disabled={busy}>Try again</button>
            <Link className={styles.textLink} href="/homeowner/recipes/manual">Enter manually</Link>
          </div>
        </div>
      ) : null}
      <button className={styles.primaryButton} type="submit" disabled={busy}>
        {busy ? "Checking the source…" : "Import recipe"}
      </button>
      <p className={styles.safeNote}>You will review every ingredient and step before publishing.</p>
    </form>
  );
}

export { persistResult, readPayload };
