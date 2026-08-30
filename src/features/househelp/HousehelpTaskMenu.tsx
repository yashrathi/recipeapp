"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/househelp/househelp.module.css";

import { formatMessage, label, localeBundles } from "./locales";
import { BrowserSpeechAdapter, SerializedSpeechQueue } from "./speech";
import type { HousehelpAssignmentSummary } from "./server/repository";
import type { HousehelpLocale, SpeechToken } from "./types";

type MenuView = "audio_gate" | "language" | "menu" | "empty" | "audio_error";

const STORAGE_PREFIX = "recipe-app:househelp:v1:";

function locallyCompleted(assignmentId: string): boolean {
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${assignmentId}`);
    if (!value) return false;
    return (JSON.parse(value) as { state?: { completed?: unknown } }).state?.completed === true;
  } catch {
    return false;
  }
}

function speechToken(locale: HousehelpLocale, generation: number): SpeechToken {
  return {
    assignmentId: null,
    recipeVersionId: null,
    locale,
    screenInstanceId: 0,
    generation,
  };
}

function scheduledDate(locale: HousehelpLocale, value: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function HousehelpTaskMenu({
  initialTasks,
}: {
  initialTasks: HousehelpAssignmentSummary[];
}) {
  const router = useRouter();
  const adapter = useMemo(() => new BrowserSpeechAdapter(), []);
  const queue = useMemo(() => new SerializedSpeechQueue(adapter), [adapter]);
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<MenuView>(initialTasks.length ? "audio_gate" : "empty");
  const [locale, setLocale] = useState<HousehelpLocale>(initialTasks[0]?.selectedLocale ?? "en-IN");
  const [taskIndex, setTaskIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const generationRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const visibleTasks = initialTasks.filter(({ id }) => !locallyCompleted(id));
    setTasks(visibleTasks);
    if (!visibleTasks.length) setView("empty");
  }, [initialTasks]);

  useEffect(() => () => queue.cancel(), [queue]);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [view, taskIndex]);

  const play = useCallback(async (requests: Array<{ locale: HousehelpLocale; text: string }>) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSpeaking(true);
    const activeLocale = requests.at(-1)?.locale ?? locale;
    const outcome = await queue.play(
      requests,
      speechToken(activeLocale, generation),
      (token) => token.generation === generationRef.current,
    );
    if (generation === generationRef.current) setSpeaking(false);
    return outcome;
  }, [locale, queue]);

  const task = tasks[taskIndex];
  const taskPrompt = useCallback((candidate: HousehelpAssignmentSummary, index: number) => {
    const translated = candidate.translations[locale];
    const action = label(locale, candidate.status === "scheduled" ? "start" : "resume");
    return formatMessage(locale, "menu.task", {
      current: index + 1,
      total: tasks.length,
      dish: translated.dish,
      date: scheduledDate(locale, candidate.scheduledDate),
      meal: translated.meal,
      targetTime: translated.targetTimeSpeech,
      action,
    });
  }, [locale, tasks.length]);

  async function activateAudio() {
    if (!await adapter.probe(locale)) {
      setView("audio_error");
      return;
    }
    if (!tasks.length) {
      await play([
        { locale, text: formatMessage(locale, "control.activate_audio") },
        { locale, text: formatMessage(locale, "menu.empty") },
      ]);
      return;
    }
    setView("language");
    await play([{ locale, text: formatMessage(locale, "app.sound_on_choose_language") }]);
  }

  async function selectLanguage(nextLocale: HousehelpLocale) {
    setLocale(nextLocale);
    await play([
      { locale: nextLocale, text: formatMessage(nextLocale, "language.name") },
      { locale: nextLocale, text: formatMessage(nextLocale, "language.selected_continue") },
    ]);
  }

  async function continueToMenu() {
    setView("menu");
    if (task) await play([
      { locale, text: formatMessage(locale, "control.continue") },
      { locale, text: taskPrompt(task, taskIndex) },
    ]);
  }

  async function showNextTask() {
    if (!tasks.length) return;
    const nextIndex = (taskIndex + 1) % tasks.length;
    setTaskIndex(nextIndex);
    await play([
      { locale, text: formatMessage(locale, "control.next") },
      { locale, text: taskPrompt(tasks[nextIndex]!, nextIndex) },
    ]);
  }

  async function openTask() {
    if (!task) return;
    const actionId = task.status === "scheduled" ? "start" : "resume";
    const action = label(locale, actionId);
    const outcome = await play([
      { locale, text: formatMessage(locale, `control.${actionId}`) },
      { locale, text: formatMessage(locale, "menu.open_task", {
        action,
        dish: task.translations[locale].dish,
      }) },
    ]);
    if (outcome === "completed") router.push(`/househelp/${encodeURIComponent(task.id)}`);
  }

  function stopSpeech() {
    generationRef.current += 1;
    queue.cancel();
    setSpeaking(false);
  }

  async function repeatTask() {
    if (!task) return;
    await play([
      { locale, text: formatMessage(locale, "control.repeat") },
      { locale, text: taskPrompt(task, taskIndex) },
    ]);
  }

  async function openLanguage() {
    setView("language");
    await play([
      { locale, text: formatMessage(locale, "control.change_language") },
      { locale, text: formatMessage(locale, "language.choose") },
    ]);
  }

  const topBar = ["menu", "language"].includes(view) ? (
    <header className={styles.topBar}>
      {view === "menu" ? (
        <button className={styles.utilityButton} type="button" onClick={() => void openLanguage()}>
          <span aria-hidden="true">文</span>
          {label(locale, "change_language")}
        </button>
      ) : <span />}
      {speaking || view === "menu" ? (
        <button
          className={styles.utilityButton}
          type="button"
          onClick={() => speaking ? stopSpeech() : void repeatTask()}
        >
          <span aria-hidden="true">{speaking ? "■" : "◖"}</span>
          {label(locale, speaking ? "stop" : "repeat")}
        </button>
      ) : <span />}
    </header>
  ) : null;

  let content;
  if (view === "audio_gate") {
    content = (
      <section className={styles.audioGate} aria-labelledby="menu-audio-title">
        <h1 className={styles.srOnly} id="menu-audio-title" ref={headingRef} tabIndex={-1}>
          {formatMessage("en-IN", "menu.heading")}
        </h1>
        <button className={styles.audioGateButton} type="button" onClick={() => void activateAudio()}>
          <Image src="/househelp/state-sound.svg" alt="" width={180} height={180} priority />
          <span>{label(locale, "activate_audio")}</span>
          <span className={styles.gateHint}>हिन्दी · English</span>
        </button>
      </section>
    );
  } else if (view === "language") {
    content = (
      <section className={styles.dialogScreen} role="dialog" aria-modal="true" aria-labelledby="menu-language-title">
        <h1 id="menu-language-title" ref={headingRef} tabIndex={-1}>{formatMessage(locale, "language.choose")}</h1>
        <div className={styles.languageChoices}>
          {(["hi-IN", "en-IN"] as const).map((candidate) => (
            <button
              key={candidate}
              className={`${styles.languageButton} ${locale === candidate ? styles.selected : ""}`}
              type="button"
              onClick={() => void selectLanguage(candidate)}
              aria-label={localeBundles[candidate].languageName}
              aria-pressed={locale === candidate}
              lang={candidate}
            >
              <span aria-hidden="true">◖</span>
              {localeBundles[candidate].languageName}
            </button>
          ))}
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => void continueToMenu()}>
          {label(locale, "continue")} <span aria-hidden="true">→</span>
        </button>
      </section>
    );
  } else if (view === "menu" && task) {
    const translated = task.translations[locale];
    const actionId = task.status === "scheduled" ? "start" : "resume";
    content = (
      <section className={styles.screen} aria-labelledby="menu-task-title">
        <p className={styles.kicker}>{formatMessage(locale, "menu.heading")}</p>
        <p className={styles.counter}>{taskIndex + 1} / {tasks.length}</p>
        <h1 id="menu-task-title" ref={headingRef} tabIndex={-1}>{translated.dish}</h1>
        <div className={styles.heroVisual}>
          <Image src="/househelp/state-dish.svg" alt="" width={280} height={220} priority />
        </div>
        <p className={styles.bigMeta}>{translated.meal} · {translated.targetTimeSpeech}</p>
        <p className={styles.menuDate}>{scheduledDate(locale, task.scheduledDate)} · {translated.servingsSpeech}</p>
        <div className={styles.actionStack}>
          <button className={styles.primaryButton} type="button" onClick={() => void openTask()}>
            <span aria-hidden="true">▶</span> {label(locale, actionId)}
          </button>
          {tasks.length > 1 ? (
            <button className={styles.secondaryButton} type="button" onClick={() => void showNextTask()}>
              {label(locale, "next")} <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>
      </section>
    );
  } else if (view === "audio_error") {
    content = (
      <section className={styles.audioError} aria-labelledby="menu-audio-error-title">
        <Image src="/househelp/state-audio-error.svg" alt="" width={220} height={220} />
        <h1 id="menu-audio-error-title" ref={headingRef} tabIndex={-1}>{formatMessage(locale, "audio.error")}</h1>
        <button className={styles.primaryButton} type="button" onClick={() => void activateAudio()}>
          {label(locale, "retry_audio")}
        </button>
      </section>
    );
  } else {
    content = (
      <section className={styles.completion} aria-labelledby="menu-empty-title">
        <Image src="/househelp/state-done.svg" alt="" width={220} height={220} priority />
        <h1 id="menu-empty-title" ref={headingRef} tabIndex={-1}>{formatMessage(locale, "menu.empty_heading")}</h1>
        <p className={styles.bigMeta}>{formatMessage(locale, "menu.empty")}</p>
        <button className={styles.secondaryButton} type="button" onClick={() => void activateAudio()}>
          {label(locale, "activate_audio")}
        </button>
      </section>
    );
  }

  return (
    <main className={styles.shell} lang={locale} data-view={view}>
      {topBar}
      <div className={styles.liveStatus} aria-live="polite" />
      {content}
    </main>
  );
}
