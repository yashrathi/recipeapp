import { formatMessage, label, resolvePrompt } from "./locales";
import type {
  AssignmentSnapshot,
  AudioReadiness,
  HousehelpLocale,
  HousehelpState,
  HousehelpView,
  PromptDescriptor,
  SpeechToken,
} from "./types";

type IdempotentEvent = { idempotencyKey: string };

export type HousehelpEvent =
  | { type: "ACTIVATE_AUDIO" }
  | { type: "SELECT_LANGUAGE"; locale: HousehelpLocale }
  | { type: "CONTINUE" }
  | { type: "OPEN_LANGUAGE" }
  | { type: "START_OR_RESUME" }
  | { type: "CHECK_INGREDIENTS" }
  | ({ type: "HAVE" } & IdempotentEvent)
  | ({ type: "MISSING" } & IdempotentEvent)
  | ({ type: "START_COOKING" } & IdempotentEvent)
  | { type: "REPEAT" }
  | { type: "REPEAT_CONTEXT" }
  | { type: "STOP" }
  | ({ type: "NEXT" } & IdempotentEvent)
  | { type: "HELP" }
  | ({ type: "INGREDIENT_MISSING" } & IdempotentEvent)
  | ({ type: "INSTRUCTION_UNCLEAR" } & IdempotentEvent)
  | ({ type: "CANNOT_COMPLETE" } & IdempotentEvent)
  | ({ type: "TELL_HOMEOWNER" } & Partial<IdempotentEvent>)
  | { type: "BACK" }
  | { type: "ACTIVATE_FOCAL_VISUAL" }
  | { type: "SHOW_HOW" }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "REPLAY_MEDIA" }
  | ({ type: "START_TIMER" } & IdempotentEvent)
  | { type: "TIMER_STARTED"; endsAt: string }
  | { type: "TIMER_ELAPSED"; timerId: string }
  | { type: "NETWORK_OFFLINE" }
  | { type: "NETWORK_ONLINE" }
  | { type: "RESTORE" }
  | { type: "AUDIO_ERROR"; reason: string }
  | { type: "RETRY_AUDIO" }
  | {
      type: "SPEECH_CALLBACK";
      token: SpeechToken;
      deferredEffect?: string;
    }
  | ({ type: "DONE" } & IdempotentEvent)
  | { type: "ASSIGNMENT_REVOKED" };

export type HousehelpPersistenceEffect =
  | { type: "locale"; locale: HousehelpLocale }
  | { type: "start"; idempotencyKey: string }
  | {
      type: "ingredient";
      ingredientId: string;
      decision: "have" | "missing";
      ingredientIndex: number;
      idempotencyKey: string;
    }
  | { type: "start_cooking"; idempotencyKey: string }
  | { type: "step"; stepId: string; stepIndex: number; idempotencyKey: string }
  | { type: "issue"; issueType: string; entityId: string; idempotencyKey: string }
  | { type: "timer"; timerId: string; stepId: string; durationSeconds: number; endsAt: string; status: string; idempotencyKey?: string }
  | { type: "done"; idempotencyKey: string };

export interface TransitionResult {
  state: HousehelpState;
  speech: Array<{ locale: HousehelpLocale; text: string }>;
  cancelPreviousSpeech: boolean;
  persistence: HousehelpPersistenceEffect[];
  deferredTimerStart: boolean;
  playAlarmCue: boolean;
  accepted: boolean;
}

export interface MachineContext {
  snapshot: AssignmentSnapshot;
  speechSourceAvailable?: boolean;
  compatibleDeviceVoice?: boolean;
  taskExists?: boolean;
  now?: Date;
}

function descriptor(
  messageId: string,
  values: Record<string, string | number>,
  source: PromptDescriptor["source"] = "entry",
): PromptDescriptor {
  return { messageId, values, source };
}

function translation(snapshot: AssignmentSnapshot, locale: HousehelpLocale) {
  return snapshot.translations[locale];
}

function todayPrompt(state: HousehelpState, context: MachineContext): PromptDescriptor {
  const localized = translation(context.snapshot, state.locale);
  const taskExists = context.taskExists ?? !state.assignmentUnavailable;
  if (!taskExists) return descriptor("today.no_task", {});
  return descriptor("today.task", {
    dish: localized.dish,
    meal: localized.meal,
    action: label(state.locale, state.sessionId ? "resume" : "start"),
  });
}

function briefingPrompt(state: HousehelpState, context: MachineContext): PromptDescriptor {
  const localized = translation(context.snapshot, state.locale);
  const messageId = localized.note ? "briefing.summary" : "briefing.summary_no_note";
  return descriptor(messageId, {
    dish: localized.dish,
    servings: localized.servingsSpeech,
    targetTime: localized.targetTimeSpeech,
    ...(localized.note ? { note: localized.note } : {}),
  });
}

function ingredientPrompt(state: HousehelpState, context: MachineContext): PromptDescriptor {
  const ingredients = context.snapshot.recipe.ingredients;
  const ingredient = ingredients[Math.min(state.ingredientIndex, ingredients.length - 1)]!;
  return descriptor("ingredient.prompt", {
    current: state.ingredientIndex + 1,
    total: ingredients.length,
    quantityIngredient:
      translation(context.snapshot, state.locale).ingredients[ingredient.id]!.quantitySpeech,
  });
}

function stepPrompt(
  state: HousehelpState,
  context: MachineContext,
  messageId: "cook.step_entry" | "cook.step_next" | "resume.step" = "cook.step_entry",
): PromptDescriptor {
  const steps = context.snapshot.recipe.steps;
  const step = steps[Math.min(state.stepIndex, steps.length - 1)]!;
  return descriptor(messageId, {
    current: state.stepIndex + 1,
    total: steps.length,
    instruction: translation(context.snapshot, state.locale).steps[step.id]!.instruction,
  });
}

function completionPrompt(state: HousehelpState, context: MachineContext): PromptDescriptor {
  return descriptor("completion.prompt", {
    dish: translation(context.snapshot, state.locale).dish,
  });
}

export function promptForView(state: HousehelpState, context: MachineContext): PromptDescriptor | null {
  switch (state.view) {
    case "today":
      return todayPrompt(state, context);
    case "briefing":
      return briefingPrompt(state, context);
    case "ingredient":
      return ingredientPrompt(state, context);
    case "cook":
      return stepPrompt(state, context);
    case "completion":
      return completionPrompt(state, context);
    case "help":
      return descriptor("help.menu", {});
    case "audio_error":
      return descriptor("audio.error", {}, "error");
    case "language":
      return descriptor("language.choose", {});
    default:
      return null;
  }
}

export function createInitialHousehelpState(
  snapshot: AssignmentSnapshot,
  locale: HousehelpLocale = snapshot.assignment.selectedLocale,
): HousehelpState {
  return {
    view: "audio_gate",
    returnView: null,
    returnPrompt: null,
    audioGate: "locked",
    locale,
    assignmentId: snapshot.assignment.id,
    sessionId: null,
    recipeVersionId: snapshot.assignment.recipeVersionId,
    screenInstanceId: 1,
    speechGeneration: 0,
    speechStatus: "idle",
    currentPrompt: null,
    interruptedPrompt: null,
    readiness: "checking",
    ingredientIndex: 0,
    stepIndex: 0,
    ingredientStates: Object.fromEntries(
      snapshot.recipe.ingredients.map((ingredient) => [ingredient.id, "unchecked"]),
    ),
    timer: null,
    online: true,
    lastPersistedRevision: 0,
    acceptedIdempotencyKeys: [],
    ingredientsComplete: false,
    mediaStatus: "stopped",
    completed: false,
    assignmentUnavailable: false,
  };
}

export function speechToken(state: HousehelpState): SpeechToken {
  return {
    assignmentId: state.assignmentId,
    recipeVersionId: state.recipeVersionId,
    locale: state.locale,
    screenInstanceId: state.screenInstanceId,
    generation: state.speechGeneration,
  };
}

export function isSpeechTokenCurrent(token: SpeechToken, state: HousehelpState): boolean {
  const current = speechToken(state);
  return (
    token.assignmentId === current.assignmentId &&
    token.recipeVersionId === current.recipeVersionId &&
    token.locale === current.locale &&
    token.screenInstanceId === current.screenInstanceId &&
    token.generation === current.generation
  );
}

function utterance(locale: HousehelpLocale, messageId: string, values = {}) {
  return { locale, text: formatMessage(locale, messageId, values) };
}

function promptUtterance(locale: HousehelpLocale, prompt: PromptDescriptor) {
  return { locale, text: resolvePrompt(locale, prompt) };
}

function acceptedKey(state: HousehelpState, event: HousehelpEvent): string | null {
  return "idempotencyKey" in event && event.idempotencyKey
    ? event.idempotencyKey
    : null;
}

function result(
  state: HousehelpState,
  speech: TransitionResult["speech"] = [],
  additions: Partial<Omit<TransitionResult, "state" | "speech">> = {},
): TransitionResult {
  return {
    state,
    speech,
    cancelPreviousSpeech: true,
    persistence: [],
    deferredTimerStart: false,
    playAlarmCue: false,
    accepted: true,
    ...additions,
  };
}

function beginEvent(state: HousehelpState): HousehelpState {
  return {
    ...state,
    speechGeneration: state.speechGeneration + 1,
    speechStatus: "idle",
  };
}

function enterView(state: HousehelpState, view: HousehelpView): HousehelpState {
  return {
    ...state,
    view,
    screenInstanceId: state.screenInstanceId + 1,
  };
}

function rememberKey(state: HousehelpState, key: string | null): HousehelpState {
  return key
    ? { ...state, acceptedIdempotencyKeys: [...state.acceptedIdempotencyKeys, key] }
    : state;
}

function currentOrVisiblePrompt(state: HousehelpState, context: MachineContext) {
  return state.currentPrompt ?? promptForView(state, context);
}

export function transitionHousehelp(
  currentState: HousehelpState,
  event: HousehelpEvent,
  context: MachineContext,
): TransitionResult {
  const key = acceptedKey(currentState, event);
  if (key && currentState.acceptedIdempotencyKeys.includes(key)) {
    return result(currentState, [], {
      cancelPreviousSpeech: false,
      accepted: false,
    });
  }

  if (event.type === "SPEECH_CALLBACK") {
    return result(currentState, [], {
      cancelPreviousSpeech: false,
      accepted: isSpeechTokenCurrent(event.token, currentState),
    });
  }

  let state = beginEvent(currentState);
  const locale = event.type === "SELECT_LANGUAGE" ? event.locale : state.locale;

  switch (event.type) {
    case "ACTIVATE_AUDIO": {
      state = { ...state, audioGate: "unlocked" };
      if (context.speechSourceAvailable === false) {
        state = enterView({ ...state, returnView: "language", readiness: "not_ready" }, "audio_error");
        state.currentPrompt = descriptor("audio.error", {}, "error");
        return result(state, []);
      }
      state = enterView({ ...state, readiness: "ready_device_tts" }, "language");
      state.currentPrompt = descriptor("language.choose", {});
      return result(state, [
        utterance(locale, "control.activate_audio"),
        utterance(locale, "app.sound_on_choose_language"),
      ]);
    }

    case "SELECT_LANGUAGE": {
      state = { ...state, locale: event.locale };
      return result(
        state,
        [
          utterance(event.locale, "language.name"),
          utterance(event.locale, "language.selected_continue"),
        ],
        { persistence: [{ type: "locale", locale: event.locale }] },
      );
    }

    case "CONTINUE": {
      const target = state.returnView ?? "today";
      const preservedPrompt = state.returnPrompt;
      state = enterView({ ...state, returnView: null, returnPrompt: null }, target);
      state.currentPrompt = preservedPrompt
        ? { ...preservedPrompt, values: promptForView(state, context)?.values ?? preservedPrompt.values }
        : promptForView(state, context);
      return result(state, [
        utterance(state.locale, "control.continue"),
        ...(state.currentPrompt ? [promptUtterance(state.locale, state.currentPrompt)] : []),
      ]);
    }

    case "OPEN_LANGUAGE": {
      const preserved = currentOrVisiblePrompt(currentState, context);
      state = enterView(
        { ...state, returnView: currentState.view, returnPrompt: preserved },
        "language",
      );
      state.currentPrompt = descriptor("language.choose", {});
      return result(state, [
        utterance(state.locale, "control.change_language"),
        utterance(state.locale, "language.choose"),
      ]);
    }

    case "START_OR_RESUME": {
      if (currentState.sessionId) {
        const restoreView = currentState.ingredientsComplete ? "cook" : "ingredient";
        state = enterView(state, restoreView);
        const restorePrompt = restoreView === "cook"
          ? stepPrompt(state, context, "resume.step")
          : descriptor("resume.ingredient", ingredientPrompt(state, context).values, "resume");
        state.currentPrompt = restorePrompt;
        return result(state, [promptUtterance(state.locale, restorePrompt)]);
      }
      state = enterView({ ...state, sessionId: state.sessionId ?? "pending-session" }, "briefing");
      state.currentPrompt = briefingPrompt(state, context);
      const localized = translation(context.snapshot, state.locale);
      return result(
        state,
        [
          utterance(state.locale, "today.start", { dish: localized.dish }),
          promptUtterance(state.locale, state.currentPrompt),
        ],
        {
          persistence: [{
            type: "start",
            idempotencyKey: `${state.assignmentId}:start:${state.recipeVersionId}:1`,
          }],
        },
      );
    }

    case "CHECK_INGREDIENTS": {
      state = enterView({ ...state, ingredientIndex: 0 }, "ingredient");
      state.currentPrompt = ingredientPrompt(state, context);
      return result(state, [
        utterance(state.locale, "briefing.check"),
        promptUtterance(state.locale, state.currentPrompt),
      ]);
    }

    case "HAVE":
    case "MISSING": {
      const ingredients = context.snapshot.recipe.ingredients;
      const ingredient = ingredients[currentState.ingredientIndex]!;
      const decision = event.type === "HAVE" ? "have" : "missing";
      const finalIngredient = currentState.ingredientIndex >= ingredients.length - 1;
      const nextIndex = finalIngredient ? currentState.ingredientIndex : currentState.ingredientIndex + 1;
      state = rememberKey({
        ...state,
        ingredientIndex: nextIndex,
        ingredientStates: { ...state.ingredientStates, [ingredient.id]: decision },
        ingredientsComplete: finalIngredient,
        lastPersistedRevision: state.lastPersistedRevision + 1,
      }, key);
      const nextIngredient = ingredients[nextIndex]!;
      const messageId = finalIngredient
        ? event.type === "HAVE" ? "ingredient.have_complete" : "ingredient.missing_complete"
        : event.type === "HAVE" ? "ingredient.have_next" : "ingredient.missing_next";
      const values: Record<string, string | number> = finalIngredient
        ? {}
        : {
            quantityIngredient:
              translation(context.snapshot, state.locale).ingredients[nextIngredient.id]!.quantitySpeech,
          };
      state.currentPrompt = finalIngredient
        ? descriptor(messageId, values)
        : ingredientPrompt(state, context);
      const persistence: HousehelpPersistenceEffect[] = [{
        type: "ingredient",
        ingredientId: ingredient.id,
        decision,
        ingredientIndex: nextIndex,
        idempotencyKey: key!,
      }];
      if (decision === "missing") {
        persistence.push({
          type: "issue",
          issueType: "ingredient_missing",
          entityId: ingredient.id,
          idempotencyKey: `${key}:issue`,
        });
      }
      return result(state, [utterance(state.locale, messageId, values)], { persistence });
    }

    case "START_COOKING": {
      state = rememberKey(enterView({
        ...state,
        stepIndex: 0,
        lastPersistedRevision: state.lastPersistedRevision + 1,
      }, "cook"), key);
      state.currentPrompt = stepPrompt(state, context);
      return result(
        state,
        [
          utterance(state.locale, "control.start_cooking"),
          promptUtterance(state.locale, state.currentPrompt),
        ],
        { persistence: [{ type: "start_cooking", idempotencyKey: key! }] },
      );
    }

    case "REPEAT": {
      const prompt = currentOrVisiblePrompt(currentState, context);
      state.currentPrompt = prompt;
      return result(state, [
        utterance(state.locale, "control.repeat"),
        ...(prompt ? [promptUtterance(state.locale, prompt)] : []),
      ]);
    }

    case "REPEAT_CONTEXT": {
      const prompt = currentState.returnPrompt ?? currentOrVisiblePrompt(currentState, context);
      return result(state, [
        utterance(state.locale, "control.repeat"),
        ...(prompt ? [promptUtterance(state.locale, prompt)] : []),
      ]);
    }

    case "STOP":
      state = { ...state, interruptedPrompt: currentOrVisiblePrompt(currentState, context) };
      return result(state, [utterance(state.locale, "control.stop")]);

    case "NEXT": {
      const steps = context.snapshot.recipe.steps;
      const currentStep = steps[currentState.stepIndex]!;
      const finalStep = currentState.stepIndex >= steps.length - 1;
      state = rememberKey({
        ...state,
        lastPersistedRevision: state.lastPersistedRevision + 1,
      }, key);
      if (finalStep) {
        state = enterView(state, "completion");
        state.currentPrompt = completionPrompt(state, context);
        return result(
          state,
          [promptUtterance(state.locale, state.currentPrompt)],
          { persistence: [{ type: "step", stepId: currentStep.id, stepIndex: currentState.stepIndex, idempotencyKey: key! }] },
        );
      }
      state.stepIndex = currentState.stepIndex + 1;
      const nextSpeech = stepPrompt(state, context, "cook.step_next");
      state.currentPrompt = stepPrompt(state, context);
      return result(
        state,
        [promptUtterance(state.locale, nextSpeech)],
        { persistence: [{ type: "step", stepId: currentStep.id, stepIndex: state.stepIndex, idempotencyKey: key! }] },
      );
    }

    case "HELP": {
      const preserved = currentOrVisiblePrompt(currentState, context);
      state = enterView({ ...state, returnView: currentState.view, returnPrompt: preserved }, "help");
      state.currentPrompt = descriptor("help.menu", {});
      return result(state, [utterance(state.locale, "help.menu")]);
    }

    case "INGREDIENT_MISSING":
    case "INSTRUCTION_UNCLEAR":
    case "CANNOT_COMPLETE":
    case "TELL_HOMEOWNER": {
      const mapping = {
        INGREDIENT_MISSING: ["ingredient_missing", "help.ingredient_missing_ack"],
        INSTRUCTION_UNCLEAR: ["instruction_unclear", "help.instruction_unclear_ack"],
        CANNOT_COMPLETE: ["cannot_complete", "help.cannot_complete_ack"],
        TELL_HOMEOWNER: ["tell_homeowner", currentState.view === "audio_error" ? "audio.homeowner_told" : "help.homeowner_told"],
      } as const;
      const [issueType, messageId] = mapping[event.type];
      state = rememberKey(state, key);
      const entity = currentState.view === "ingredient"
        ? context.snapshot.recipe.ingredients[currentState.ingredientIndex]!.id
        : context.snapshot.recipe.steps[currentState.stepIndex]?.id ?? state.assignmentId!;
      return result(state, [utterance(state.locale, messageId)], {
        persistence: key ? [{ type: "issue", issueType, entityId: entity, idempotencyKey: key }] : [],
      });
    }

    case "BACK": {
      const target = state.returnView ?? "today";
      const preserved = state.returnPrompt;
      state = enterView({ ...state, returnView: null, returnPrompt: null, mediaStatus: "stopped" }, target);
      state.currentPrompt = preserved ?? promptForView(state, context);
      return result(state, [
        utterance(state.locale, "control.back"),
        ...(state.currentPrompt ? [promptUtterance(state.locale, state.currentPrompt)] : []),
      ]);
    }

    case "ACTIVATE_FOCAL_VISUAL": {
      const description = currentState.view === "ingredient"
        ? translation(context.snapshot, state.locale).ingredients[
            context.snapshot.recipe.ingredients[state.ingredientIndex]!.id
          ]!.visualDescription
        : translation(context.snapshot, state.locale).steps[
            context.snapshot.recipe.steps[state.stepIndex]!.id
          ]!.visualDescription;
      return result(state, [utterance(state.locale, "visual.description", { description })]);
    }

    case "SHOW_HOW": {
      const step = context.snapshot.recipe.steps[state.stepIndex]!;
      const description = translation(context.snapshot, state.locale).steps[step.id]!.visualDescription;
      if (!state.online) {
        const prompt = currentOrVisiblePrompt(currentState, context)!;
        state.currentPrompt = prompt;
        return result(state, [
          utterance(state.locale, "control.show_how"),
          utterance(state.locale, "media.offline_unavailable"),
          promptUtterance(state.locale, prompt),
        ]);
      }
      state = enterView({ ...state, returnView: "cook", returnPrompt: currentOrVisiblePrompt(currentState, context) }, "media");
      state.currentPrompt = descriptor("media.intro", { description });
      return result(state, [promptUtterance(state.locale, state.currentPrompt)]);
    }

    case "PLAY":
      return result({ ...state, mediaStatus: "playing" }, [utterance(state.locale, "control.play")]);
    case "PAUSE":
      return result({ ...state, mediaStatus: "paused" }, [utterance(state.locale, "control.pause")]);
    case "REPLAY_MEDIA":
      return result({ ...state, mediaStatus: "playing" }, [utterance(state.locale, "control.replay")]);

    case "START_TIMER": {
      const step = context.snapshot.recipe.steps[state.stepIndex]!;
      if (!step.timer) return result(state, [], { accepted: false });
      state = rememberKey({
        ...state,
        timer: {
          timerId: `timer-${step.id}`,
          stepId: step.id,
          status: "pending",
          durationSeconds: step.timer.durationSeconds,
          endsAt: null,
        },
      }, key);
      const duration = translation(context.snapshot, state.locale).steps[step.id]!.durationSpeech!;
      return result(state, [utterance(state.locale, "timer.start", { duration })], {
        deferredTimerStart: true,
      });
    }

    case "TIMER_STARTED": {
      if (!state.timer) return result(state, [], { accepted: false });
      state.timer = { ...state.timer, status: "running", endsAt: event.endsAt };
      return result(state, [], {
        cancelPreviousSpeech: false,
        persistence: [{
          type: "timer",
          timerId: state.timer.timerId,
          stepId: state.timer.stepId,
          durationSeconds: state.timer.durationSeconds,
          endsAt: event.endsAt,
          status: "running",
        }],
      });
    }

    case "TIMER_ELAPSED": {
      if (!state.timer || state.timer.timerId !== event.timerId) return result(state, [], { accepted: false });
      state.timer = { ...state.timer, status: "elapsed" };
      const timedStepIndex = context.snapshot.recipe.steps.findIndex(
        (candidate) => candidate.id === state.timer?.stepId,
      );
      const prompt = currentOrVisiblePrompt(currentState, context);
      state.currentPrompt = prompt;
      return result(
        state,
        [utterance(state.locale, "timer.done", {
          step: timedStepIndex >= 0 ? timedStepIndex + 1 : state.stepIndex + 1,
        })],
        {
          playAlarmCue: true,
          persistence: [{
            type: "timer",
            timerId: state.timer.timerId,
            stepId: state.timer.stepId,
            durationSeconds: state.timer.durationSeconds,
            endsAt: state.timer.endsAt ?? new Date(0).toISOString(),
            status: "elapsed",
          }],
        },
      );
    }

    case "NETWORK_OFFLINE": {
      state.online = false;
      if (state.readiness === "not_ready") {
        state = enterView({ ...state, returnView: currentState.view, returnPrompt: currentOrVisiblePrompt(currentState, context) }, "audio_error");
        state.currentPrompt = descriptor("audio.error", {}, "error");
        return result(state, []);
      }
      return result(state, [], { cancelPreviousSpeech: false });
    }

    case "NETWORK_ONLINE":
      return result({ ...state, online: true }, [], { cancelPreviousSpeech: false });

    case "RESTORE": {
      const target: HousehelpView = state.ingredientsComplete || state.stepIndex > 0 ? "cook" : "ingredient";
      state = enterView(state, target);
      if (state.timer?.endsAt && state.timer.status === "running") {
        const remaining = new Date(state.timer.endsAt).getTime() - (context.now ?? new Date()).getTime();
        state.timer = { ...state.timer, status: remaining > 0 ? "running" : "elapsed" };
      }
      state.currentPrompt = target === "cook"
        ? stepPrompt(state, context, "resume.step")
        : descriptor("resume.ingredient", ingredientPrompt(state, context).values, "resume");
      return result(state, [promptUtterance(state.locale, state.currentPrompt)]);
    }

    case "AUDIO_ERROR": {
      state = enterView({
        ...state,
        returnView: currentState.view,
        returnPrompt: currentOrVisiblePrompt(currentState, context),
        readiness: "not_ready",
        speechStatus: "failed",
      }, "audio_error");
      state.currentPrompt = descriptor("audio.error", {}, "error");
      return result(state, context.speechSourceAvailable === false
        ? []
        : [utterance(state.locale, "audio.error")]);
    }

    case "RETRY_AUDIO": {
      if (context.compatibleDeviceVoice === false) return result(state, [utterance(state.locale, "audio.retrying")]);
      const target = state.returnView ?? "today";
      const restoredPrompt = state.returnPrompt;
      state = enterView({
        ...state,
        returnView: null,
        returnPrompt: null,
        readiness: "ready_device_tts",
        speechStatus: "idle",
      }, target);
      state.currentPrompt = restoredPrompt ?? promptForView(state, context);
      const currentPrompt = state.currentPrompt ? resolvePrompt(state.locale, state.currentPrompt) : "";
      return result(state, [
        utterance(state.locale, "audio.retrying"),
        utterance(state.locale, "audio.restored", { currentPrompt }),
      ]);
    }

    case "DONE": {
      state = rememberKey({
        ...state,
        completed: true,
        lastPersistedRevision: state.lastPersistedRevision + 1,
      }, key);
      return result(state, [utterance(state.locale, "completion.done")], {
        persistence: [{ type: "done", idempotencyKey: key! }],
      });
    }

    case "ASSIGNMENT_REVOKED": {
      state = enterView({
        ...state,
        assignmentUnavailable: true,
        returnView: null,
        returnPrompt: null,
        mediaStatus: "stopped",
        timer: null,
      }, "today");
      state.currentPrompt = descriptor("assignment.unavailable", {}, "error");
      return result(state, [utterance(state.locale, "assignment.unavailable")]);
    }
  }
}

export function withReadiness(state: HousehelpState, readiness: AudioReadiness): HousehelpState {
  return { ...state, readiness };
}
