"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/househelp/househelp.module.css";

import { label, localeBundles, resolvePrompt } from "./locales";
import {
  createInitialHousehelpState,
  isSpeechTokenCurrent,
  promptForView,
  speechToken,
  transitionHousehelp,
  type HousehelpEvent,
  type HousehelpPersistenceEffect,
} from "./machine";
import { resolveReadiness } from "./readiness";
import { BrowserSpeechAdapter, SerializedSpeechQueue } from "./speech";
import type {
  HousehelpState,
  PersistedHousehelpProgress,
} from "./types";
import { resolveIngredientVisual, resolveStepVisual } from "./visuals";

interface InitialData {
  snapshot: Parameters<typeof createInitialHousehelpState>[0];
  progress: PersistedHousehelpProgress | null;
}

interface PendingMutation {
  url: string;
  body: Record<string, unknown>;
}

interface LocalEnvelope {
  version: 1;
  assignmentId: string;
  recipeVersionId: string;
  snapshot: InitialData["snapshot"];
  state: HousehelpState;
  pending: PendingMutation[];
}

declare global {
  interface Window {
    __HOUSEHELP_PERSISTENCE_TIMEOUT_MS__?: number;
  }
}

const STORAGE_PREFIX = "recipe-app:househelp:v1:";
const DEFAULT_PERSISTENCE_TIMEOUT_MS = 5_000;

function storageKey(assignmentId: string) {
  return `${STORAGE_PREFIX}${assignmentId}`;
}

function stateWithProgress(initialData: InitialData): HousehelpState {
  const state = createInitialHousehelpState(initialData.snapshot);
  const progress = initialData.progress;
  if (!progress || progress.recipeVersionId !== state.recipeVersionId) return state;
  return {
    ...state,
    locale: progress.locale,
    sessionId: progress.sessionId,
    ingredientIndex: progress.ingredientIndex,
    stepIndex: progress.stepIndex,
    ingredientStates: progress.ingredientStates,
    timer: progress.timer,
    lastPersistedRevision: progress.revision,
    ingredientsComplete: ["cooking", "done"].includes(progress.status) ||
      Object.values(progress.ingredientStates).every((value) => value !== "unchecked"),
    completed: progress.completed,
  };
}

function readLocalEnvelope(initialData: InitialData): LocalEnvelope | null {
  try {
    const value = window.localStorage.getItem(storageKey(initialData.snapshot.assignment.id));
    if (!value) return null;
    const envelope = JSON.parse(value) as LocalEnvelope;
    if (
      envelope.version !== 1 ||
      envelope.assignmentId !== initialData.snapshot.assignment.id ||
      envelope.recipeVersionId !== initialData.snapshot.assignment.recipeVersionId
    ) return null;
    return envelope;
  } catch {
    return null;
  }
}

function saveLocalEnvelope(
  snapshot: InitialData["snapshot"],
  state: HousehelpState,
  pending: PendingMutation[],
) {
  try {
    const envelope: LocalEnvelope = {
      version: 1,
      assignmentId: snapshot.assignment.id,
      recipeVersionId: snapshot.assignment.recipeVersionId,
      snapshot,
      state,
      pending,
    };
    window.localStorage.setItem(storageKey(snapshot.assignment.id), JSON.stringify(envelope));
  } catch {
    // The server remains authoritative when local storage is unavailable.
  }
}

function advancesRevision(effect: HousehelpPersistenceEffect) {
  return ["ingredient", "start_cooking", "step", "done"].includes(effect.type);
}

async function postProgressMutation(mutation: PendingMutation): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    window.__HOUSEHELP_PERSISTENCE_TIMEOUT_MS__ ?? DEFAULT_PERSISTENCE_TIMEOUT_MS,
  );
  try {
    return await fetch(mutation.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutation.body),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function mutationBody(
  effect: HousehelpPersistenceEffect,
  expectedRevision: number,
  state: HousehelpState,
): Record<string, unknown> {
  if (effect.type === "locale") return effect;
  if (effect.type === "timer") {
    return { ...effect, expectedRevision };
  }
  if (effect.type === "start") return { ...effect, expectedRevision };
  if (effect.type === "ingredient") return { ...effect, expectedRevision };
  if (effect.type === "start_cooking") return { ...effect, expectedRevision };
  if (effect.type === "step") return { ...effect, expectedRevision };
  if (effect.type === "issue") return { ...effect, expectedRevision };
  return { ...effect, expectedRevision: state.lastPersistedRevision - 1 };
}

export function HousehelpCookMode({ initialData }: { initialData: InitialData }) {
  const { snapshot } = initialData;
  const adapter = useMemo(() => new BrowserSpeechAdapter(), []);
  const queue = useMemo(() => new SerializedSpeechQueue(adapter), [adapter]);
  const [state, setRenderedState] = useState(() => stateWithProgress(initialData));
  const [statusMessage, setStatusMessage] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [mediaPlaybackActive, setMediaPlaybackActive] = useState(false);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const stateRef = useRef(state);
  const pendingRef = useRef<PendingMutation[]>([]);
  const persistenceBusyRef = useRef(false);
  const eventRunnerRef = useRef<(event: HousehelpEvent) => Promise<void>>(async () => undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mediaFrameRef = useRef<HTMLIFrameElement>(null);

  const setState = useCallback((next: HousehelpState) => {
    stateRef.current = next;
    setRenderedState(next);
  }, []);

  useEffect(() => {
    const local = readLocalEnvelope(initialData);
    if (!local) return;
    pendingRef.current = local.pending;
    if (local.state.lastPersistedRevision >= stateRef.current.lastPersistedRevision) {
      setState({ ...local.state, view: "audio_gate", audioGate: "locked", speechStatus: "idle" });
    }
  }, [initialData, setState]);

  useEffect(() => {
    saveLocalEnvelope(snapshot, state, pendingRef.current);
  }, [snapshot, state]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [state.view]);

  const flushPending = useCallback(async () => {
    const remaining: PendingMutation[] = [];
    for (const mutation of pendingRef.current) {
      try {
        const response = await fetch(mutation.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation.body),
        });
        if (!response.ok && response.status !== 409) remaining.push(mutation);
      } catch {
        remaining.push(mutation);
      }
    }
    pendingRef.current = remaining;
    saveLocalEnvelope(snapshot, stateRef.current, remaining);
  }, [snapshot]);

  useEffect(() => {
    const onOffline = () => void eventRunnerRef.current({ type: "NETWORK_OFFLINE" });
    const onOnline = () => {
      void eventRunnerRef.current({ type: "NETWORK_ONLINE" });
      void flushPending();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) onOffline();
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [flushPending]);

  useEffect(() => {
    const timer = state.timer;
    if (!timer?.endsAt || timer.status !== "running") {
      setRemainingSeconds(null);
      return;
    }
    const update = () => {
      const seconds = Math.max(0, Math.ceil((new Date(timer.endsAt!).getTime() - Date.now()) / 1_000));
      setRemainingSeconds(seconds);
      if (seconds === 0) void eventRunnerRef.current({ type: "TIMER_ELAPSED", timerId: timer.timerId });
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [state.timer]);

  useEffect(() => () => queue.cancel(), [queue]);

  const persistEffects = useCallback(async (
    effects: HousehelpPersistenceEffect[],
    previousRevision: number,
    nextState: HousehelpState,
  ): Promise<"ok" | "revoked"> => {
    let expectedRevision = previousRevision;
    for (const effect of effects) {
      const pending: PendingMutation = {
        url: `/api/househelp/assignments/${encodeURIComponent(snapshot.assignment.id)}/progress`,
        body: mutationBody(effect, expectedRevision, nextState),
      };
      if (!nextState.online) {
        pendingRef.current.push(pending);
      } else {
        try {
          const response = await postProgressMutation(pending);
          if (response.status === 404 || response.status === 410) return "revoked";
          if (!response.ok) {
            pendingRef.current.push(pending);
            setStatusMessage(response.status === 409
              ? "Progress is safe on this phone and needs to sync."
              : "Progress will sync when the connection recovers.");
          }
        } catch {
          pendingRef.current.push(pending);
          setStatusMessage("Progress is safe on this phone and will sync later.");
        }
      }
      if (advancesRevision(effect)) expectedRevision += 1;
    }
    saveLocalEnvelope(snapshot, nextState, pendingRef.current);
    return "ok";
  }, [snapshot]);

  const runEvent = useCallback(async (event: HousehelpEvent) => {
    const current = stateRef.current;
    const mutatesProgress = [
      "HAVE",
      "MISSING",
      "START_COOKING",
      "NEXT",
      "START_TIMER",
      "DONE",
    ].includes(event.type);
    if (mutatesProgress && persistenceBusyRef.current) return;
    queue.cancel();

    if (event.type === "PAUSE") {
      mediaFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        "https://www.youtube-nocookie.com",
      );
      setMediaPlaybackActive(false);
    }

    let compatibleDeviceVoice: boolean | undefined;
    let speechSourceAvailable: boolean | undefined;
    if (event.type === "ACTIVATE_AUDIO" || event.type === "RETRY_AUDIO") {
      compatibleDeviceVoice = await adapter.probe(
        event.type === "ACTIVATE_AUDIO" ? current.locale : current.locale,
      );
      const readiness = resolveReadiness({
        snapshot,
        locale: current.locale,
        compatibleDeviceVoice,
        allEssentialAudioCached: false,
      });
      speechSourceAvailable = readiness !== "not_ready";
      if (!speechSourceAvailable && event.type === "RETRY_AUDIO") {
        event = { type: "AUDIO_ERROR", reason: "no_compatible_voice" };
      }
    }

    const transition = transitionHousehelp(current, event, {
      snapshot,
      compatibleDeviceVoice,
      speechSourceAvailable,
      taskExists: true,
    });
    if (!transition.accepted) return;

    let next = transition.state;
    saveLocalEnvelope(snapshot, next, pendingRef.current);
    setState(next);
    if (transition.persistence.length > 0) {
      persistenceBusyRef.current = true;
      setPersistenceBusy(true);
    }
    const persistenceResult = await persistEffects(
      transition.persistence,
      current.lastPersistedRevision,
      next,
    ).finally(() => {
      persistenceBusyRef.current = false;
      setPersistenceBusy(false);
    });
    if (persistenceResult === "revoked") {
      const revoked = transitionHousehelp(next, { type: "ASSIGNMENT_REVOKED" }, { snapshot });
      next = revoked.state;
      setState(next);
      await queue.play(revoked.speech, speechToken(next), (token) =>
        isSpeechTokenCurrent(token, stateRef.current));
      return;
    }

    if (transition.speech.length === 0 && !transition.playAlarmCue) {
      if (next.view === "audio_error" && "vibrate" in navigator) navigator.vibrate([120, 80, 120]);
      return;
    }

    const speakingState = { ...next, speechStatus: "speaking" as const };
    setState(speakingState);
    const token = speechToken(speakingState);
    let outcome = await queue.play(
      transition.speech,
      token,
      (candidate) => isSpeechTokenCurrent(candidate, stateRef.current),
      transition.playAlarmCue,
    );
    if (outcome === "failed" && isSpeechTokenCurrent(token, stateRef.current)) {
      const recovered = await adapter.probe(speakingState.locale);
      if (recovered) {
        outcome = await queue.play(
          transition.speech,
          token,
          (candidate) => isSpeechTokenCurrent(candidate, stateRef.current),
          transition.playAlarmCue,
        );
      }
      if (outcome === "failed") {
        const failed = transitionHousehelp(stateRef.current, {
          type: "AUDIO_ERROR",
          reason: "synthesis_failure",
        }, { snapshot, speechSourceAvailable: false });
        setState(failed.state);
        navigator.vibrate?.([120, 80, 120]);
        return;
      }
    }
    if (outcome !== "completed" || !isSpeechTokenCurrent(token, stateRef.current)) return;

    setState({ ...stateRef.current, speechStatus: "idle" });
    if (event.type === "PLAY" || event.type === "REPLAY_MEDIA") {
      setMediaPlaybackActive(true);
      window.setTimeout(() => {
        mediaFrameRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: event.type === "PLAY" ? "playVideo" : "seekTo", args: event.type === "PLAY" ? [] : [194, true] }),
          "https://www.youtube-nocookie.com",
        );
      }, 0);
    }
    if (transition.deferredTimerStart && stateRef.current.timer) {
      const timer = stateRef.current.timer;
      const endsAt = new Date(Date.now() + timer.durationSeconds * 1_000).toISOString();
      await eventRunnerRef.current({ type: "TIMER_STARTED", endsAt });
    }
  }, [adapter, persistEffects, queue, setState, snapshot]);

  eventRunnerRef.current = runEvent;

  const localized = snapshot.translations[state.locale];
  const currentPrompt = state.currentPrompt ?? promptForView(state, { snapshot });
  const promptText = currentPrompt ? resolvePrompt(state.locale, currentPrompt) : "";
  const isSpeaking = state.speechStatus === "speaking";
  const audioControl = isSpeaking ? "stop" : "repeat";
  const step = snapshot.recipe.steps[state.stepIndex];
  const ingredient = snapshot.recipe.ingredients[state.ingredientIndex];
  const timerMinutes = remainingSeconds === null
    ? null
    : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  const topBar = state.view !== "audio_gate" ? (
    <header className={styles.topBar}>
      {!["language", "audio_error"].includes(state.view) ? (
        <button
          className={styles.utilityButton}
          type="button"
          onClick={() => void runEvent({ type: "OPEN_LANGUAGE" })}
          aria-label={label(state.locale, "change_language")}
        >
          <span aria-hidden="true">文</span>
          {label(state.locale, "change_language")}
        </button>
      ) : <span />}
      {!["audio_error"].includes(state.view) && (isSpeaking || !["language", "help", "media"].includes(state.view)) ? (
        <button
          className={styles.utilityButton}
          type="button"
          aria-pressed={isSpeaking}
          aria-busy={isSpeaking}
          onClick={() => void runEvent({ type: isSpeaking ? "STOP" : "REPEAT" })}
          aria-label={label(state.locale, audioControl)}
        >
          <span aria-hidden="true">{isSpeaking ? "■" : "◖"}</span>
          {label(state.locale, audioControl)}
        </button>
      ) : <span />}
    </header>
  ) : null;

  let content;
  if (state.view === "audio_gate") {
    content = (
      <section className={styles.audioGate} aria-labelledby="audio-gate-title">
        <h1 className={styles.srOnly} id="audio-gate-title" ref={headingRef} tabIndex={-1}>
          {label(state.locale, "activate_audio")}
        </h1>
        <button
          className={styles.audioGateButton}
          type="button"
          onClick={() => void runEvent({ type: "ACTIVATE_AUDIO" })}
          aria-label={label(state.locale, "activate_audio")}
        >
          <Image src="/househelp/state-sound.svg" alt="" width={180} height={180} priority />
          <span>{label(state.locale, "activate_audio")}</span>
          <span className={styles.gateHint}>हिन्दी · English</span>
        </button>
      </section>
    );
  } else if (state.view === "language") {
    content = (
      <section className={styles.dialogScreen} role="dialog" aria-modal="true" aria-labelledby="language-title">
        <h1 id="language-title" ref={headingRef} tabIndex={-1}>{promptText}</h1>
        <div className={styles.languageChoices}>
          {(["hi-IN", "en-IN"] as const).map((locale) => (
            <button
              key={locale}
              className={`${styles.languageButton} ${state.locale === locale ? styles.selected : ""}`}
              type="button"
              onClick={() => void runEvent({ type: "SELECT_LANGUAGE", locale })}
              aria-label={localeBundles[locale].languageName}
              aria-pressed={state.locale === locale}
              lang={locale}
            >
              <span aria-hidden="true">◖</span>
              {localeBundles[locale].languageName}
            </button>
          ))}
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void runEvent({ type: "CONTINUE" })}>
          {label(state.locale, "continue")}
          <span aria-hidden="true">→</span>
        </button>
        {state.returnView ? (
          <button className={styles.textButton} type="button" onClick={() => void runEvent({ type: "BACK" })}>
            {label(state.locale, "back")}
          </button>
        ) : null}
      </section>
    );
  } else if (state.view === "today") {
    content = (
      <section className={styles.screen} aria-labelledby="today-title">
        <p className={styles.kicker}>{localized.meal} · {snapshot.assignment.targetTime}</p>
        <h1 id="today-title" ref={headingRef} tabIndex={-1}>{localized.dish}</h1>
        <button className={styles.heroVisual} type="button" aria-label={localized.dish} onClick={() => void runEvent({ type: "REPEAT" })}>
          <Image src="/househelp/state-dish.svg" alt="" width={280} height={220} priority />
        </button>
        <p className={styles.bigMeta}>{localized.servingsSpeech}</p>
        <button className={styles.primaryButton} type="button" onClick={() => void runEvent({ type: "START_OR_RESUME" })}>
          <span aria-hidden="true">▶</span>
          {label(state.locale, state.sessionId ? "resume" : "start")}
        </button>
        <HelpButton locale={state.locale} onClick={() => void runEvent({ type: "HELP" })} />
      </section>
    );
  } else if (state.view === "briefing") {
    content = (
      <section className={styles.screen} aria-labelledby="briefing-title">
        <h1 id="briefing-title" ref={headingRef} tabIndex={-1}>{localized.dish}</h1>
        <Image className={styles.briefingVisual} src="/househelp/state-dish.svg" alt="" width={240} height={190} />
        <div className={styles.briefingFacts}>
          <strong>{localized.servingsSpeech}</strong>
          <strong>{localized.targetTimeSpeech}</strong>
        </div>
        {localized.note ? <p className={styles.note}>{localized.note}</p> : null}
        <button className={styles.primaryButton} type="button" onClick={() => void runEvent({ type: "CHECK_INGREDIENTS" })}>
          {label(state.locale, "check_ingredients")}
          <span aria-hidden="true">→</span>
        </button>
        <HelpButton locale={state.locale} onClick={() => void runEvent({ type: "HELP" })} />
      </section>
    );
  } else if (state.view === "ingredient" && ingredient) {
    const visual = resolveIngredientVisual(snapshot, state.ingredientIndex, state.locale);
    const ingredientText = localized.ingredients[ingredient.id]!;
    content = (
      <section className={styles.screen} aria-labelledby="ingredient-title">
        <progress className={styles.progress} max={snapshot.recipe.ingredients.length} value={state.ingredientIndex + 1} />
        <p className={styles.counter}>{state.ingredientIndex + 1} / {snapshot.recipe.ingredients.length}</p>
        <h1 id="ingredient-title" ref={headingRef} tabIndex={-1}>{ingredientText.quantitySpeech}</h1>
        <button className={styles.focalVisual} type="button" aria-label={visual.description} onClick={() => void runEvent({ type: "ACTIVATE_FOCAL_VISUAL" })}>
          <Image src={visual.bundledPath!} alt="" width={260} height={220} />
        </button>
        {!state.ingredientsComplete ? (
          <div className={styles.actionStack}>
            <button className={styles.primaryButton} type="button" disabled={persistenceBusy} aria-busy={persistenceBusy} onClick={() => void runEvent({
              type: "HAVE",
              idempotencyKey: `${state.sessionId}:have_it:${ingredient.id}:${state.lastPersistedRevision + 1}`,
            })}>
              <span aria-hidden="true">✓</span>{label(state.locale, "have_it")}
            </button>
            <button className={styles.warningButton} type="button" disabled={persistenceBusy} aria-busy={persistenceBusy} onClick={() => void runEvent({
              type: "MISSING",
              idempotencyKey: `${state.sessionId}:missing:${ingredient.id}:${state.lastPersistedRevision + 1}`,
            })}>
              <span aria-hidden="true">!</span>{label(state.locale, "missing")}
            </button>
          </div>
        ) : (
          <button className={styles.primaryButton} type="button" disabled={persistenceBusy} aria-busy={persistenceBusy} onClick={() => void runEvent({
            type: "START_COOKING",
            idempotencyKey: `${state.sessionId}:start_cooking:${state.recipeVersionId}:${state.lastPersistedRevision + 1}`,
          })}>
            {label(state.locale, "start_cooking")}<span aria-hidden="true">→</span>
          </button>
        )}
        <HelpButton locale={state.locale} onClick={() => void runEvent({ type: "HELP" })} />
      </section>
    );
  } else if (state.view === "cook" && step) {
    const visual = resolveStepVisual(snapshot, state.stepIndex, state.locale);
    const stepText = localized.steps[step.id]!;
    const media = snapshot.mediaAssets.find((candidate) => candidate.id === step.mediaAssetId);
    content = (
      <section className={styles.screen} aria-labelledby="cook-title">
        <progress className={styles.progress} max={snapshot.recipe.steps.length} value={state.stepIndex + 1} />
        <p className={styles.counter}>{state.stepIndex + 1} / {snapshot.recipe.steps.length}</p>
        <h1 id="cook-title" ref={headingRef} tabIndex={-1}>{stepText.instruction}</h1>
        <button className={styles.focalVisual} type="button" aria-label={visual.description} onClick={() => void runEvent({ type: "ACTIVATE_FOCAL_VISUAL" })}>
          <Image src={visual.bundledPath!} alt="" width={260} height={220} />
        </button>
        {timerMinutes !== null ? <output className={styles.timer} aria-label={`Timer ${timerMinutes}`}>{timerMinutes}</output> : null}
        {step.timer && state.timer?.status !== "running" && state.timer?.status !== "elapsed" ? (
          <button className={styles.secondaryButton} type="button" disabled={persistenceBusy} aria-busy={persistenceBusy} onClick={() => void runEvent({
            type: "START_TIMER",
            idempotencyKey: `${state.sessionId}:start_timer:${step.id}:${state.lastPersistedRevision}`,
          })}>{label(state.locale, "start_timer")}</button>
        ) : null}
        {media ? (
          <button className={styles.secondaryButton} type="button" onClick={() => void runEvent({ type: "SHOW_HOW" })}>
            {label(state.locale, "show_how")}
          </button>
        ) : null}
        <button className={styles.primaryButton} type="button" disabled={persistenceBusy} aria-busy={persistenceBusy} onClick={() => void runEvent({
          type: "NEXT",
          idempotencyKey: `${state.sessionId}:next:${step.id}:${state.lastPersistedRevision + 1}`,
        })}>
          {label(state.locale, "next")}<span aria-hidden="true">→</span>
        </button>
        <HelpButton locale={state.locale} onClick={() => void runEvent({ type: "HELP" })} />
      </section>
    );
  } else if (state.view === "help") {
    content = (
      <section className={styles.dialogScreen} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <h1 id="help-title" ref={headingRef} tabIndex={-1}>{localeBundles[state.locale].messages["control.help"]}</h1>
        <div className={styles.actionStack}>
          <button className={styles.secondaryButton} type="button" onClick={() => void runEvent({ type: "REPEAT_CONTEXT" })}>{label(state.locale, "repeat")}</button>
          <button className={styles.warningButton} type="button" onClick={() => void runEvent({
            type: "INGREDIENT_MISSING",
            idempotencyKey: `${state.sessionId}:ingredient_missing:${state.stepIndex}:${state.lastPersistedRevision}`,
          })}>{label(state.locale, "ingredient_missing")}</button>
          <button className={styles.secondaryButton} type="button" onClick={() => void runEvent({
            type: "INSTRUCTION_UNCLEAR",
            idempotencyKey: `${state.sessionId}:instruction_unclear:${state.stepIndex}:${state.lastPersistedRevision}`,
          })}>{label(state.locale, "instruction_unclear")}</button>
          <button className={styles.secondaryButton} type="button" onClick={() => void runEvent({
            type: "TELL_HOMEOWNER",
            idempotencyKey: `${state.sessionId}:tell_homeowner:${state.stepIndex}:${state.lastPersistedRevision}`,
          })}>{label(state.locale, "tell_homeowner")}</button>
          <button className={styles.textButton} type="button" onClick={() => void runEvent({ type: "BACK" })}>{label(state.locale, "back")}</button>
        </div>
      </section>
    );
  } else if (state.view === "media" && step) {
    const media = snapshot.mediaAssets.find((candidate) => candidate.id === step.mediaAssetId)!;
    const description = localized.steps[step.id]!.visualDescription;
    content = (
      <section className={styles.dialogScreen} role="dialog" aria-modal="true" aria-labelledby="media-title">
        <h1 id="media-title" ref={headingRef} tabIndex={-1}>{description}</h1>
        <div className={styles.mediaFrame}>
          {mediaPlaybackActive ? (
            <iframe
              ref={mediaFrameRef}
              title={description}
              src={`https://www.youtube-nocookie.com/embed/${media.sourceVideoId}?start=${media.sourceTimestampSeconds ?? 0}&enablejsapi=1&autoplay=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : <Image src="/househelp/action-stir.svg" alt="" width={220} height={180} />}
        </div>
        <div className={styles.mediaControls}>
          <button className={styles.primaryButton} type="button" onClick={() => void runEvent({ type: mediaPlaybackActive ? "PAUSE" : "PLAY" })}>
            {label(state.locale, mediaPlaybackActive ? "pause" : "play")}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => void runEvent({ type: "REPLAY_MEDIA" })}>{label(state.locale, "replay")}</button>
          <button className={styles.textButton} type="button" onClick={() => { setMediaPlaybackActive(false); void runEvent({ type: "BACK" }); }}>{label(state.locale, "back")}</button>
        </div>
      </section>
    );
  } else if (state.view === "completion") {
    content = (
      <section className={styles.completion} aria-labelledby="completion-title">
        <Image src="/househelp/state-done.svg" alt="" width={220} height={220} />
        <h1 id="completion-title" ref={headingRef} tabIndex={-1}>{promptText}</h1>
        <button className={styles.primaryButton} type="button" disabled={state.completed || persistenceBusy} aria-busy={persistenceBusy} onClick={() => void runEvent({
          type: "DONE",
          idempotencyKey: `${state.sessionId}:done:${state.assignmentId}:${state.lastPersistedRevision + 1}`,
        })}>{label(state.locale, "done")}</button>
        {state.completed ? <p className={styles.confirmation}>{localeBundles[state.locale].messages["completion.done"]}</p> : null}
        <HelpButton locale={state.locale} onClick={() => void runEvent({ type: "HELP" })} />
      </section>
    );
  } else {
    content = (
      <section className={styles.audioError} aria-labelledby="audio-error-title">
        <Image src="/househelp/state-audio-error.svg" alt="" width={220} height={220} />
        <h1 id="audio-error-title" ref={headingRef} tabIndex={-1}>{localeBundles[state.locale].messages["audio.error"]}</h1>
        <button className={styles.primaryButton} type="button" onClick={() => void runEvent({ type: "RETRY_AUDIO" })}>{label(state.locale, "retry_audio")}</button>
        <button className={styles.warningButton} type="button" onClick={() => void runEvent({
          type: "TELL_HOMEOWNER",
          idempotencyKey: `${state.assignmentId}:audio_failure:${state.lastPersistedRevision}`,
        })}>{label(state.locale, "tell_homeowner")}</button>
      </section>
    );
  }

  return (
    <main className={styles.shell} lang={state.locale} data-view={state.view}>
      {topBar}
      {!state.online ? (
        <button className={styles.networkStatus} type="button" onClick={() => {
          const prompt = localeBundles[state.locale].messages["offline.continue"];
          const direct = { ...stateRef.current, speechGeneration: stateRef.current.speechGeneration + 1 };
          setState(direct);
          void queue.play([{ locale: state.locale, text: prompt }], speechToken(direct), (token) =>
            isSpeechTokenCurrent(token, stateRef.current));
        }}>{localeBundles[state.locale].messages["offline.continue"]}</button>
      ) : null}
      <div className={styles.liveStatus} aria-live="polite">{statusMessage}</div>
      {content}
      <p className={styles.attribution}>{snapshot.recipe.sourceAttribution}</p>
    </main>
  );
}

function HelpButton({ locale, onClick }: { locale: HousehelpState["locale"]; onClick: () => void }) {
  return (
    <button className={styles.helpButton} type="button" onClick={onClick}>
      <span aria-hidden="true">?</span>{label(locale, "help")}
    </button>
  );
}
