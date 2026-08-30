export type HousehelpLocale = "en-IN" | "hi-IN";

export type HousehelpView =
  | "audio_gate"
  | "language"
  | "today"
  | "briefing"
  | "ingredient"
  | "cook"
  | "help"
  | "media"
  | "completion"
  | "audio_error";

export type SpeechStatus = "idle" | "speaking" | "stopping" | "failed";
export type AudioReadiness =
  | "checking"
  | "ready_cached_audio"
  | "ready_device_tts"
  | "not_ready";

export interface PromptDescriptor {
  messageId: string;
  values: Record<string, string | number>;
  source: "entry" | "control" | "timer" | "resume" | "error";
}

export interface SpeechToken {
  assignmentId: string | null;
  recipeVersionId: string | null;
  locale: HousehelpLocale;
  screenInstanceId: number;
  generation: number;
}

export interface HousehelpTimer {
  timerId: string;
  stepId: string;
  status: "pending" | "running" | "elapsed" | "dismissed";
  durationSeconds: number;
  endsAt: string | null;
}

export interface HousehelpState {
  view: HousehelpView;
  returnView: HousehelpView | null;
  returnPrompt: PromptDescriptor | null;
  audioGate: "locked" | "unlocked";
  locale: HousehelpLocale;
  assignmentId: string | null;
  sessionId: string | null;
  recipeVersionId: string | null;
  screenInstanceId: number;
  speechGeneration: number;
  speechStatus: SpeechStatus;
  currentPrompt: PromptDescriptor | null;
  interruptedPrompt: PromptDescriptor | null;
  readiness: AudioReadiness;
  ingredientIndex: number;
  stepIndex: number;
  furthestStepIndex: number;
  ingredientStates: Record<string, "unchecked" | "have" | "missing">;
  timer: HousehelpTimer | null;
  online: boolean;
  lastPersistedRevision: number;
  acceptedIdempotencyKeys: string[];
  ingredientsComplete: boolean;
  mediaStatus: "stopped" | "playing" | "paused";
  completed: boolean;
  assignmentUnavailable: boolean;
}

export interface AssignmentSnapshot {
  schemaVersion: number;
  assignment: {
    id: string;
    assigneeId: string;
    recipeVersionId: string;
    status: string;
    meal: string;
    targetTime: string;
    servings: number;
    selectedLocale: HousehelpLocale;
    translationStatus: Record<HousehelpLocale, string>;
  };
  recipe: {
    id: string;
    versionId: string;
    sourceAttribution: string;
    ingredients: Array<{
      id: string;
      quantity: Record<string, string | number>;
      visualAssetId: string | null;
    }>;
    steps: Array<{
      id: string;
      action: string;
      timer: null | { durationSeconds: number; startMode: "explicit" | "guided" };
      visualAssetId: string | null;
      mediaAssetId: string | null;
    }>;
  };
  translations: Record<
    HousehelpLocale,
    {
      dish: string;
      meal: string;
      servingsSpeech: string;
      targetTimeSpeech: string;
      note: string;
      ingredients: Record<
        string,
        {
          singular: string;
          plural: string;
          quantitySpeech: string;
          preparation: string;
          visualDescription: string;
        }
      >;
      steps: Record<
        string,
        { instruction: string; visualDescription: string; durationSpeech?: string }
      >;
    }
  >;
  visualAssets: Array<{
    id: string;
    kind: "ingredient_photo" | "step_image" | "action_icon" | "state_icon";
    purpose: "identify_ingredient" | "show_result" | "show_action" | "show_state";
    verification: string;
    rights: string;
    attribution: string;
    spokenDescriptionPath: string | null;
  }>;
  fallbackIcons: {
    ingredient: string;
    actions: Record<string, string>;
  };
  mediaAssets: Array<{
    id: string;
    kind: "youtube_embed" | "video";
    verification: string;
    rights: string;
    sourceVideoId?: string;
    sourceTimestampSeconds?: number;
    cachePolicy: string;
    autoplay: boolean;
    spokenDescriptionPath: string;
  }>;
}

export interface PersistedHousehelpProgress {
  sessionId: string | null;
  assignmentId: string;
  recipeVersionId: string;
  locale: HousehelpLocale;
  view: HousehelpView;
  ingredientIndex: number;
  stepIndex: number;
  ingredientStates: Record<string, "unchecked" | "have" | "missing">;
  timer: HousehelpTimer | null;
  revision: number;
  status: string;
  completed: boolean;
}
