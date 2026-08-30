"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { interpretImportApiPayload } from "@/features/homeowner/contracts";
import { persistResult, readPayload } from "@/features/homeowner/components/import-form";
import styles from "@/app/homeowner/homeowner.module.css";

const stageLabels: Record<string, string> = {
  queued: "Waiting to start",
  validate_url: "Checking the link",
  resolving: "Checking the public source",
  fetching: "Reading the webpage",
  extracting: "Finding ingredients and steps",
  needs_review: "Ready for your review",
  ready: "Ready for your review",
  pending: "Waiting to start",
  running: "Preparing the recipe",
};

export function ImportProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState("queued");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const response = await fetch(`/api/imports/${encodeURIComponent(jobId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const interpretation = interpretImportApiPayload(await readPayload(response), response.ok);
        if (cancelled) return;
        if (interpretation.kind === "failure") {
          setError(interpretation.message);
          return;
        }
        if (interpretation.kind === "draft") {
          router.replace(`/homeowner/recipes/${interpretation.versionId}/review`);
          return;
        }
        if (interpretation.kind === "result") {
          const versionId = await persistResult(interpretation.jobId ?? jobId, interpretation.result);
          if (!cancelled) router.replace(`/homeowner/recipes/${versionId}/review`);
          return;
        }
        setStage(interpretation.stage);
        timer = setTimeout(poll, 900);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "The import status is unavailable.");
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  if (error) {
    return (
      <section className={styles.errorPanel} aria-labelledby="import-error-heading">
        <p className={styles.eyebrow}>Import stopped safely</p>
        <h2 id="import-error-heading">We could not create a trustworthy draft</h2>
        <p>{error}</p>
        <div className={styles.inlineActions}>
          <Link className={styles.primaryLink} href="/homeowner/recipes/new">Try another link</Link>
          <Link className={styles.secondaryLink} href="/homeowner/recipes/manual">Enter manually</Link>
        </div>
      </section>
    );
  }

  const stages = ["Checking the link", "Reading the webpage", "Finding ingredients and steps", "Ready for your review"];
  const currentLabel = stageLabels[stage] ?? "Preparing the recipe";
  return (
    <section className={styles.progressCard} aria-labelledby="progress-heading" aria-live="polite">
      <div className={styles.pulseMark} aria-hidden="true" />
      <p className={styles.eyebrow}>Import in progress</p>
      <h2 id="progress-heading">{currentLabel}</h2>
      <ol className={styles.stageList}>
        {stages.map((label) => (
          <li key={label} aria-current={label === currentLabel ? "step" : undefined}>{label}</li>
        ))}
      </ol>
      <p>You can leave this screen. The dashboard keeps the recoverable import record.</p>
      <Link className={styles.textLink} href="/homeowner">Go to Today</Link>
    </section>
  );
}
