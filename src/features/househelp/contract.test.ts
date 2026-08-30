import { describe, expect, it } from "vitest";

import controlsFixture from "../../../docs/technical/fixtures/audio-visual/controls.json";
import englishFixture from "../../../docs/technical/fixtures/audio-visual/en-IN.json";
import hindiFixture from "../../../docs/technical/fixtures/audio-visual/hi-IN.json";
import interactionFixture from "../../../docs/technical/fixtures/audio-visual/interaction-cases.json";
import sampleFixture from "../../../docs/technical/fixtures/audio-visual/sample-assignment.json";

import { localeBundles, messagePlaceholders } from "./locales";
import {
  createInitialHousehelpState,
  promptForView,
  speechToken,
  transitionHousehelp,
  type HousehelpEvent,
} from "./machine";
import { resolveReadiness } from "./readiness";
import { SerializedSpeechQueue, type SpeechAdapter } from "./speech";
import type {
  AssignmentSnapshot,
  HousehelpLocale,
  HousehelpState,
  HousehelpView,
  SpeechToken,
} from "./types";
import { resolveIngredientVisual, resolveStepVisual } from "./visuals";

const snapshot = sampleFixture as AssignmentSnapshot;
const cases = interactionFixture.cases as Array<{
  id: string;
  given: Record<string, unknown>;
  event?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  expected: Record<string, unknown> & {
    speechByLocale?: Partial<Record<HousehelpLocale, string[]>>;
    speech?: Array<string | { locale: HousehelpLocale; text: string }>;
  };
}>;

function stateFromGiven(given: Record<string, unknown>, locale?: HousehelpLocale): HousehelpState {
  const state = createInitialHousehelpState(snapshot, locale ?? (given.locale as HousehelpLocale) ?? "en-IN");
  state.view = (given.view as HousehelpView) ?? state.view;
  state.audioGate = (given.audioGate as HousehelpState["audioGate"]) ?? state.audioGate;
  state.screenInstanceId = (given.screenInstanceId as number) ?? state.screenInstanceId;
  state.speechGeneration = (given.generation as number) ?? state.speechGeneration;
  state.ingredientIndex = (given.ingredientIndex as number) ?? state.ingredientIndex;
  state.stepIndex =
    (given.stepIndex as number) ?? (given.persistedStepIndex as number) ?? state.stepIndex;
  state.furthestStepIndex =
    (given.furthestStepIndex as number) ?? state.stepIndex;
  state.lastPersistedRevision = (given.revision as number) ?? state.lastPersistedRevision;
  state.sessionId = Object.hasOwn(given, "sessionId")
    ? (given.sessionId as string | null)
    : ["ingredient", "cook", "help", "media", "completion", "audio_error"].includes(state.view)
      ? "session-001"
      : null;
  state.returnView = (given.returnView as HousehelpView | null | undefined) ?? null;
  state.online = (given.online as boolean | undefined) ?? true;
  state.ingredientsComplete = (given.ingredientsComplete as boolean | undefined) ?? state.stepIndex > 0;
  state.acceptedIdempotencyKeys = (given.acceptedIdempotencyKeys as string[] | undefined) ?? [];
  state.speechStatus = (given.speechStatus as HousehelpState["speechStatus"] | undefined) ?? "idle";
  if (given.timerStatus) {
    state.timer = {
      timerId: "timer-step-stir",
      stepId: "step-stir",
      status: given.timerStatus as "pending" | "running" | "elapsed" | "dismissed",
      durationSeconds: 120,
      endsAt: (given.timerEndsAt as string | undefined) ?? null,
    };
  }
  if (given.timerEndsAt && !state.timer) {
    state.timer = {
      timerId: "timer-step-stir",
      stepId: "step-stir",
      status: "running",
      durationSeconds: 120,
      endsAt: given.timerEndsAt as string,
    };
  }
  if (given.deferredEffect === "start-timer-step-stir" && !state.timer) {
    state.timer = {
      timerId: "timer-step-stir",
      stepId: "step-stir",
      status: "pending",
      durationSeconds: 120,
      endsAt: null,
    };
  }
  state.currentPrompt = promptForView(state, { snapshot });
  if (state.returnView) {
    const returnState = { ...state, view: state.returnView };
    state.returnPrompt = promptForView(returnState, { snapshot });
  }
  return state;
}

function eventFromFixture(raw: Record<string, unknown>): HousehelpEvent {
  const type = raw.type as HousehelpEvent["type"];
  switch (type) {
    case "ACTIVATE_AUDIO":
    case "CONTINUE":
    case "OPEN_LANGUAGE":
    case "START_OR_RESUME":
    case "CHECK_INGREDIENTS":
    case "REPEAT":
    case "STOP":
    case "HELP":
    case "BACK":
    case "ACTIVATE_FOCAL_VISUAL":
    case "SHOW_HOW":
    case "PLAY":
    case "PAUSE":
    case "REPLAY_MEDIA":
    case "NETWORK_OFFLINE":
    case "NETWORK_ONLINE":
    case "RESTORE":
    case "RETRY_AUDIO":
    case "ASSIGNMENT_REVOKED":
      return { type } as HousehelpEvent;
    case "SELECT_LANGUAGE":
      return { type, locale: raw.locale as HousehelpLocale };
    case "HAVE":
    case "MISSING":
    case "START_COOKING":
    case "NEXT":
    case "INGREDIENT_MISSING":
    case "INSTRUCTION_UNCLEAR":
    case "CANNOT_COMPLETE":
    case "START_TIMER":
    case "DONE":
      return { type, idempotencyKey: raw.idempotencyKey as string } as HousehelpEvent;
    case "TELL_HOMEOWNER":
      return { type, idempotencyKey: raw.idempotencyKey as string | undefined };
    case "TIMER_ELAPSED":
      return { type, timerId: raw.timerId as string };
    case "AUDIO_ERROR":
      return { type, reason: raw.reason as string };
    case "SPEECH_CALLBACK":
      return {
        type,
        token: raw.token as SpeechToken,
        deferredEffect: raw.deferredEffect as string | undefined,
      };
    default:
      throw new Error(`Unsupported fixture event: ${type}`);
  }
}

function runCase(testCase: (typeof cases)[number], locale?: HousehelpLocale) {
  let state = stateFromGiven(testCase.given, locale);
  const speech: Array<{ locale: HousehelpLocale; text: string }> = [];
  let lastResult = null as ReturnType<typeof transitionHousehelp> | null;
  const rawEvents = testCase.events ?? (testCase.event ? [testCase.event] : []);

  for (const rawEvent of rawEvents) {
    const event = eventFromFixture(rawEvent);
    const noSource =
      testCase.id === "first_tap_without_speech_source_fails_visibly" ||
      testCase.id === "audio_failure_without_any_source_is_visual_and_haptic";
    lastResult = transitionHousehelp(state, event, {
      snapshot,
      speechSourceAvailable: !noSource,
      compatibleDeviceVoice: (testCase.given.compatibleDeviceVoice as boolean | undefined) ?? true,
      taskExists: (testCase.given.taskExists as boolean | undefined) ?? true,
      now: testCase.given.now ? new Date(testCase.given.now as string) : undefined,
    });
    state = lastResult.state;
    if (lastResult.playAlarmCue) speech.push({ locale: state.locale, text: "NONVERBAL_ALARM_CUE" });
    speech.push(...lastResult.speech);
  }
  return { state, speech, lastResult: lastResult! };
}

describe("frozen househelp locale and control fixtures", () => {
  it("keeps English and Hindi message, label, unit and placeholder keys identical", () => {
    for (const section of ["messages", "labels", "quantityTerms", "units"] as const) {
      const english = englishFixture[section];
      const hindi = hindiFixture[section];
      expect(Object.keys(english).sort()).toEqual(Object.keys(hindi).sort());
      for (const key of Object.keys(english)) {
        expect(messagePlaceholders(english[key as keyof typeof english])).toEqual(
          messagePlaceholders(hindi[key as keyof typeof hindi]),
        );
      }
    }
  });

  it("gives every declared control a non-empty visible label, accessible name and activation phrase", () => {
    for (const control of controlsFixture.controls) {
      for (const locale of ["en-IN", "hi-IN"] as const) {
        expect(localeBundles[locale].labels[control.labelId]).toBeTruthy();
        expect(localeBundles[locale].labels[control.accessibleNameId]).toBe(
          localeBundles[locale].labels[control.labelId],
        );
        expect(localeBundles[locale].messages[control.activationMessageId]).toBeTruthy();
      }
    }
  });
});

describe("all 26 frozen interaction cases", () => {
  expect(cases).toHaveLength(26);

  for (const testCase of cases) {
    it(testCase.id, () => {
      if (testCase.expected.speechByLocale) {
        for (const locale of ["en-IN", "hi-IN"] as const) {
          const expected = testCase.expected.speechByLocale[locale];
          if (!expected) continue;
          const actual = runCase(testCase, locale);
          expect(actual.speech.map(({ text }) => text)).toEqual(expected);
          expect(actual.speech.every((entry) => entry.locale === locale)).toBe(true);
          expect(actual.speech.every((entry) => !entry.text.includes("{"))).toBe(true);
        }
      } else if (testCase.expected.speech) {
        const actual = runCase(testCase);
        const expected = testCase.expected.speech;
        if (expected.every((entry) => typeof entry === "string")) {
          expect(actual.speech.map(({ text }) => text)).toEqual(expected);
        } else {
          expect(actual.speech).toEqual(expected);
        }
      } else {
        runCase(testCase);
      }
    });
  }

  it("checks fixture-declared state invariants for duplicate Next, stale callbacks, Stop and completion", () => {
    const duplicate = runCase(cases.find(({ id }) => id === "rapid_duplicate_next_is_ignored")!);
    expect(duplicate.lastResult.accepted).toBe(false);
    expect(duplicate.state.stepIndex).toBe(2);
    expect(duplicate.state.lastPersistedRevision).toBe(7);

    const stale = runCase(cases.find(({ id }) => id === "stale_callback_cannot_play_or_start_timer")!);
    expect(stale.lastResult.accepted).toBe(false);
    expect(stale.lastResult.deferredTimerStart).toBe(false);

    const stopped = runCase(cases.find(({ id }) => id === "stop_cancels_speech_and_deferred_timer")!);
    expect(stopped.state.stepIndex).toBe(2);
    expect(stopped.state.timer?.status).toBe("pending");

    const completed = runCase(cases.find(({ id }) => id === "final_next_enters_completion_then_done_notifies_once")!);
    expect(completed.state.view).toBe("completion");
    expect(completed.state.completed).toBe(true);
  });

  it("reviews an earlier cooking step without rewinding saved progress", () => {
    const current = stateFromGiven({ view: "cook", stepIndex: 3, revision: 9 });
    const previous = transitionHousehelp(current, { type: "BACK" }, { snapshot });

    expect(previous.state.view).toBe("cook");
    expect(previous.state.stepIndex).toBe(2);
    expect(previous.persistence).toEqual([]);

    const forward = transitionHousehelp(previous.state, {
      type: "NEXT",
      idempotencyKey: "review:next:step-stir",
    }, { snapshot });
    expect(forward.state.stepIndex).toBe(3);
    expect(forward.state.lastPersistedRevision).toBe(9);
    expect(forward.persistence).toEqual([]);
  });

  it("returns from completion to the final cooking instruction before Done", () => {
    const completion = stateFromGiven({ view: "completion", stepIndex: 3, revision: 10 });
    const back = transitionHousehelp(completion, { type: "BACK" }, { snapshot });

    expect(back.state.view).toBe("cook");
    expect(back.state.stepIndex).toBe(3);
    expect(back.persistence).toEqual([]);
  });

  it("serializes the reducer output for every fixture case through the speech queue", async () => {
    const spoken: Array<{ text: string; locale: HousehelpLocale }> = [];
    const adapter: SpeechAdapter = {
      cancel() {},
      probe: async () => true,
      speak: async (text, locale) => { spoken.push({ text, locale }); },
      alarm: async () => { spoken.push({ text: "NONVERBAL_ALARM_CUE", locale: "en-IN" }); },
    };
    const queue = new SerializedSpeechQueue(adapter);

    for (const testCase of cases) {
      const actual = runCase(testCase);
      spoken.length = 0;
      const alarmIndex = actual.speech.findIndex(({ text }) => text === "NONVERBAL_ALARM_CUE");
      if (alarmIndex >= 0) {
        await expect(queue.play(
          actual.speech.slice(0, alarmIndex),
          speechToken(actual.state),
          () => true,
        ), testCase.id).resolves.toBe("completed");
        await expect(queue.play(
          actual.speech.slice(alarmIndex + 1),
          speechToken(actual.state),
          () => true,
          true,
        ), testCase.id).resolves.toBe("completed");
      } else {
        await expect(queue.play(
          actual.speech,
          speechToken(actual.state),
          () => true,
        ), testCase.id).resolves.toBe("completed");
      }
      expect(spoken.map(({ text }) => text), testCase.id).toEqual(actual.speech.map(({ text }) => text));
    }
  });
});

describe("readiness and focal visual resolution", () => {
  it("matches every frozen readiness scenario", () => {
    for (const scenario of sampleFixture.readinessScenarios) {
      const candidate = structuredClone(snapshot);
      if (!scenario.allReviewedTextStored) {
        candidate.assignment.translationStatus["en-IN"] = "missing";
      }
      expect(resolveReadiness({
        snapshot: candidate,
        locale: "en-IN",
        compatibleDeviceVoice: scenario.compatibleDeviceVoice,
        allEssentialAudioCached: scenario.allEssentialAudioCached,
      })).toBe(scenario.expected);
    }
  });

  it("rejects the prohibited tomato visual and uses one approved fallback", () => {
    const visual = resolveIngredientVisual(snapshot, 1, "en-IN");
    expect(visual.assetId).toBe("state-ingredient-bundled");
    expect(visual.description).toBe("Two red tomatoes");
  });

  it("uses the approved bundled stir action when an exact step visual is absent", () => {
    expect(resolveStepVisual(snapshot, 2, "hi-IN").assetId).toBe("icon-stir-bundled");
  });
});
