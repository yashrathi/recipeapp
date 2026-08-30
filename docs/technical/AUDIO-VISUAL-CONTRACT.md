# Househelp Audio and Visual Implementation Contract

Status: frozen Milestone 1 implementation contract

Audience: househelp UI, persistence, accessibility, and acceptance-test implementers

Companion fixtures: `docs/technical/fixtures/audio-visual/`

## 1. Purpose and scope

This contract makes the househelp flow operable by listening and tapping without reading. It defines the behavior between HH0 language setup, HH1 Today, HH2 briefing, HH3 ingredient check, HH4 cook mode/help/media, and HH5 completion.

Milestone 1 has no microphone or voice input, no paid speech API, no AI-generated cooking image, and no downloaded/repackaged YouTube clip. Homeowner authoring, recipe extraction, translation quality review, and grocery ordering are outside this contract except where they supply approved data.

The fixtures are normative. Examples in prose explain them. If prose and a fixture disagree, fix the discrepancy before implementation; do not silently choose one.

## 2. Non-negotiable invariants

1. Every enabled househelp control has a locale phrase ID, visible label, accessible name, and activation utterance with the same meaning.
2. A user event cancels unfinished ordinary speech before its response is queued. Two ordinary utterances never overlap.
3. Speech may play only when its event token still matches the visible screen, locale, assignment, pinned recipe version, and speech generation.
4. `Repeat` never changes progress. `Stop` never changes progress. `Next` changes progress once, persists it, renders the new step, and then speaks the complete new instruction.
5. Navigation and language change cancel speech and deferred effects from the previous state.
6. A timer alarm may interrupt ordinary speech, but it never overlaps it. The interrupted current prompt is replayable in full.
7. Cooking progress is pinned to one published recipe version. A later recipe or assignment edit cannot mutate an active session.
8. Essential guidance has a readiness result before cooking begins. Audio failure is visible, spoken when possible, recoverable, and never treated as successful playback.
9. Every ingredient/step screen has no more than one focal visual. A missing or ineligible visual falls back to a verified action/state icon and speech; it never guesses.
10. No moving media auto-plays. YouTube help uses the attributed official player at the source timestamp and is not downloaded or cached as a standalone clip.
11. Programmatic speech complements platform assistive technology. It does not move focus, steal screen-reader focus, or replace semantic HTML.

## 3. Canonical model

The client reducer owns one serializable `HousehelpState`:

```ts
type View =
  | "audio_gate" | "language" | "today" | "briefing"
  | "ingredient" | "cook" | "help" | "media"
  | "completion" | "audio_error";

type SpeechStatus = "idle" | "speaking" | "stopping" | "failed";
type Readiness = "checking" | "ready_cached_audio" | "ready_device_tts" | "not_ready";

type HousehelpState = {
  view: View;
  returnView: View | null;
  audioGate: "locked" | "unlocked";
  locale: "en-IN" | "hi-IN";
  assignmentId: string | null;
  sessionId: string | null;
  recipeVersionId: string | null;
  screenInstanceId: number;
  speechGeneration: number;
  speechStatus: SpeechStatus;
  currentPrompt: PromptDescriptor | null;
  interruptedPrompt: PromptDescriptor | null;
  readiness: Readiness;
  ingredientIndex: number;
  stepIndex: number;
  ingredientStates: Record<string, "unchecked" | "have" | "missing">;
  timer: null | {
    timerId: string;
    stepId: string;
    status: "pending" | "running" | "elapsed" | "dismissed";
    durationSeconds: number;
    endsAt: string | null;
  };
  online: boolean;
  lastPersistedRevision: number;
};
```

`PromptDescriptor` is structured data, never a pre-concatenated sentence:

```ts
type PromptDescriptor = {
  messageId: string;
  values: Record<string, string | number>;
  source: "entry" | "control" | "timer" | "resume" | "error";
};
```

Recipe content remains canonical and locale-neutral. Reviewed translations supply localized ingredient names, homeowner notes, and step text. Interface locale files supply only stable interface phrases and unit names.

## 4. Event token and queue

Every speech request receives this immutable token:

```ts
type SpeechToken = {
  assignmentId: string | null;
  recipeVersionId: string | null;
  locale: string;
  screenInstanceId: number;
  generation: number;
};
```

### Queue algorithm

For every user activation, route change, restore, network/readiness result, or timer alarm:

1. Increment `speechGeneration` synchronously.
2. Call `speechSynthesis.cancel()` and stop any app-owned audio element.
3. Cancel deferred `onSpeechEnd` effects owned by the older generation.
4. Reduce and render the new state.
5. Build the utterance sequence from message IDs and reviewed dynamic values.
6. Before starting each segment and inside every completion/error callback, compare all token fields to current state.
7. Drop the segment/callback on any mismatch. A dropped callback cannot navigate, advance, persist, start a timer, or enqueue more audio.
8. Serialize valid segments. Never invoke device speech and cached audio concurrently.

`screenInstanceId` increments on every view entry, including returning to the same route. `generation` increments for every event that can affect speech, even when the view does not change. These two guards prevent both late callbacks and same-screen rapid-tap races.

Rapid duplicate `Next`, `Have it`, `Missing`, `Done`, or `Start timer` activations are additionally protected by a persisted idempotency key: `<sessionId>:<control>:<entityId>:<targetRevision>`. The first accepted event disables the control until the local transaction finishes. Later duplicates produce no second state mutation.

### Speech sequence

A control response is one sequence:

```text
[activation label] → [outcome or complete new prompt]
```

The label is not repeated when it is already the first word of the localized outcome. For example, `Next. Now stir ...` satisfies both parts. Screen entry contains no synthetic control activation; it announces location and main action.

## 5. Deterministic state machine

The canonical acceptance paths are in `interaction-cases.json`. The following table defines all event classes.

| Current state | Event | State/effect | Spoken result |
|---|---|---|---|
| `audio_gate/locked` | `ACTIVATE_AUDIO` | unlock; probe voices/cache; enter `language` when ready, otherwise `audio_error` | `control.activate_audio`, then `app.sound_on_choose_language`; visual/haptic error only if no source can speak |
| `language` | `SELECT_LANGUAGE(locale)` | cancel; select and persist locale | option name in that locale, then `language.selected_continue` in that locale |
| `language` | `CONTINUE` | enter `today` | `control.continue`, then current Today entry prompt |
| any normal view | `OPEN_LANGUAGE` | set return view; enter `language` | `control.change_language`, then `language.choose` |
| `today` | `ENTER`, task exists | set current prompt | `today.task` |
| `today` | `ENTER`, no task | set current prompt | `today.no_task` |
| `today` | `START_OR_RESUME` | enter briefing or restored session state | `today.start` or `resume.ingredient`/`resume.step` |
| `briefing` | `ENTER` | set current prompt | `briefing.summary` |
| `briefing` | `CHECK_INGREDIENTS` | enter ingredient 0 | `briefing.check`, then `ingredient.prompt` |
| `ingredient` | `HAVE` | persist `have`; advance or finish | `ingredient.have_next` or `ingredient.have_complete` |
| `ingredient` | `MISSING` | persist `missing`; enqueue idempotent issue; advance or finish | `ingredient.missing_next` or `ingredient.missing_complete` |
| `ingredient` | `START_COOKING` after list complete | enter `cook` step 0 | `control.start_cooking`, then first `cook.step_entry` |
| `cook` | `NEXT` | persist current complete; advance once | `cook.step_next`; final step enters completion and speaks `completion.prompt` |
| `cook` | `START_TIMER` | create running timer only after start phrase completes | `timer.start` |
| any normal view | `REPEAT` | no domain mutation | `control.repeat`, then exact `currentPrompt` in full |
| any speaking view | `STOP` | cancel current generation | `control.stop`; preserve `currentPrompt` |
| any normal view | `HELP` | enter help; preserve return view | `help.menu` |
| `help` | help issue | enqueue idempotent issue; stay help | activated issue phrase and acknowledgement |
| `help` | `BACK` | return to preserved view | `control.back`, then preserved current prompt |
| `cook` | `SHOW_HOW`, eligible media | enter media | `media.intro` (no playback) |
| `media` | `PLAY` | start user-owned/official media | `control.play`; pause app speech first |
| `media` | `PAUSE` | pause media | `control.pause` |
| `media` | `REPLAY_MEDIA` | seek eligible media to its approved start; play after label | `control.replay` |
| `media` | `BACK` | stop media; return cook | `control.back`, then step prompt |
| any active state | `TIMER_ELAPSED` | cancel ordinary speech; mark timer elapsed | alarm cue, then `timer.done`; restore prompt as replay target |
| any normal view | `NETWORK_OFFLINE`, audio remains ready | show offline status; do not interrupt instruction | none; activating the status speaks `offline.continue` |
| any normal view | `NETWORK_OFFLINE`, audio not ready | enter `audio_error` | cached error if possible, otherwise visual/haptic error only |
| any normal view | `NETWORK_ONLINE` | show restored status; re-sync idempotently | none; activating the status speaks `online.restored` |
| persisted session | `RESTORE` | verify assignment/version; enter saved ingredient/step | `resume.ingredient` or `resume.step` |
| `completion` | `DONE` | persist done; notify idempotently; remain confirmation state | `completion.done` |
| any view | `AUDIO_ERROR` | enter `audio_error`; preserve return view | cached error phrase if usable, otherwise visual/haptic error only |
| `audio_error` | `RETRY_AUDIO` | re-probe exact locale source | `audio.retrying`, then return-view prompt on success |
| `audio_error` | `TELL_HOMEOWNER` | enqueue issue; remain error | `audio.homeowner_told` if speech is usable; otherwise visual/haptic acknowledgement |

### Screen entry

`ENTER` is emitted only after assignment authorization and data validation succeed. Entry speech is scheduled after the new view commits. It is not tied to animation completion. Background-tab or hidden-document entry does not speak; on return, `RESTORE` announces the visible saved state once.

### Repeat and Stop

- `currentPrompt` always means the complete instruction or question needed to act in the visible state, not the last short control label.
- `Repeat` cancels current speech, says `control.repeat`, and replays `currentPrompt` from the beginning.
- While ordinary speech is active, the persistent audio control is labeled and named `Stop`. Otherwise it is `Repeat`.
- `Stop` cancels, speaks the short `control.stop` acknowledgement in a new generation, and returns to idle. It does not clear `currentPrompt`.
- If `Stop` cancels a step utterance with a deferred automatic timer start, that deferred start is canceled. The visible `Start timer` action remains available.

### Next and completion

- `Next` is accepted only in `cook`, only when the visible step matches persisted session revision, and at most once per step revision.
- The newly rendered step becomes `currentPrompt` before speech begins.
- If there is another step, say `cook.step_next` containing the entire new instruction.
- If the current step was final, enter completion and say `completion.prompt`; never say an out-of-range step.

### Interruption and cancellation

- Any control tap interrupts ordinary programmatic speech first, including language, help, visual, media, and navigation controls.
- Opening media pauses programmatic speech. Closing media stops media audio before the cook prompt is replayed.
- Page hide, logout, revoked access, assignment cancellation, or route departure cancels all speech, media, deferred effects, and nonelapsed local alarms.
- Telephone/OS audio interruption is detected where APIs permit. On return, stay on the same state and expose `Repeat`; do not auto-resume mid-sentence.

### Timers

- A step may define at most one Milestone 1 timer.
- Reading a timed instruction does not itself prove the timer started. The start is a separate persisted transition.
- If configured for guided automatic start, schedule it only after the complete step instruction ends and the event token remains current. Otherwise show `Start timer`.
- Timer truth is `endsAt`, not a decrementing counter. Resume recomputes remaining seconds from the clock.
- At elapsed time, cancel ordinary speech, play one short nonverbal alarm cue, then speak `timer.done`. No looped alarm. A visible/haptic cue accompanies it.
- After the alarm, `Repeat` repeats the step prompt, not the alarm.

### Restore and changed assignments

- Persist after every ingredient decision, accepted `Next`, timer transition, issue creation, and completion.
- Restore validates assignee, assignment status, pinned recipe version, and saved entity IDs before rendering.
- If valid, announce `resume.ingredient` or `resume.step` once.
- If assignment access was revoked/canceled, do not expose recipe content; cancel audio and show the role-safe unavailable state.
- If the homeowner publishes a newer recipe, the active session continues with its pinned version. A not-started assignment may be updated only before session creation.

## 6. Locales and message formatting

Milestone 1 locale identifiers are `en-IN` and `hi-IN`. Locale JSON files contain an identical set of message IDs. Tests must fail on a missing/extra ID, unresolved placeholder, empty accessible name, or dynamic recipe text that lacks eligible content in the chosen locale. Eligible content is homeowner-reviewed English, a Hindi override, or a complete server-generated Hindi translation created before publication/assignment.

Use ICU MessageFormat semantics for plural/select values in production. Fixtures use named `{placeholders}` so they remain framework-neutral. Do not concatenate translated sentence fragments in UI code. It is acceptable to serialize a response as multiple complete message segments so long as they play as one cancellable sequence.

### Dynamic content boundary

- Interface phrases and unit terms: locale JSON.
- Dish/ingredient/step/homeowner note: the assignment's immutable `RecipeTranslation` snapshot. Snapshot status distinguishes `reviewed` wording from `auto_translated` Hindi.
- Missing recipe translation: assignment is `not_ready`; never improvise machine translation during cooking. Automatic Hindi must be generated and pinned before cooking.
- Homeowner notes are entered in English and translated before snapshot creation unless omitted; a Hindi override remains optional. Do not read untranslated private text with a wrong-locale voice.

### Quantity speech

Normalized quantities use exact `{whole, numerator, denominator}` fields where possible. The formatter follows these rules in order:

1. `qualifier` values such as `to_taste` or `as_needed` use the locale term and ignore unit pluralization.
2. Unknown quantity says `<ingredient>, quantity not provided` / `<ingredient>, मात्रा नहीं दी गई है`. Published tasks should normally block this during homeowner review.
3. Fractions use natural forms: `1/4` quarter, `1/2` half, `3/4` three quarters. A mixed value joins whole and fraction with `and` / `और`.
4. The English unit is singular only for exactly one. Hindi unit terms are stable forms and do not receive programmatic suffixes.
5. Count ingredients may omit `piece`: `one tomato`, `two tomatoes`; their reviewed English ingredient record supplies singular and plural names. Hindi uses reviewed ingredient name plus number without automatic noun inflection.
6. Decimals that cannot be represented as a supported fraction are spoken with locale decimal digits, maximum two decimal places. Never expose binary floating-point tails.
7. Abbreviations are never read verbatim. `tsp`, `tbsp`, `g`, `kg`, `ml`, `l`, `°C`, minutes, and hours map through locale terms.
8. Ranges say `one to two` / `एक से दो`; approximate says `about` / `लगभग`.
9. Preparation follows the ingredient as a reviewed phrase: `one cup of spinach, washed` / `एक कप पालक, धुला हुआ`.
10. Do not automatically convert units or temperatures during speech.

The sample assignment exercises count, fraction, mass, and time/heat forms.

## 7. Speech source and readiness boundary

The `SpeechAdapter` accepts fully resolved text plus a token. Its source order is deterministic:

1. Exact reviewed audio asset for `{phrase-or-guidance-id, locale, contentHash, voiceVersion}` in app-managed cache.
2. Installed browser/device `SpeechSynthesisVoice` matching the exact locale or same base language (`hi-*` for `hi-IN`, `en-*` for `en-IN`), after a post-gesture voice probe.
3. `not_ready` / `audio_error`.

Never silently cross language families and never call an undeclared cloud endpoint. Milestone 1 requires no paid API key.

Browser/device TTS audio cannot be assumed cacheable. For `ready_device_tts`, cache the reviewed text, locale, hashes, and session data; speech is synthesized locally at playback. Exact audio caching is optional when app-bundled, user-owned, or separately generated assets are legitimately supplied. Store those responses in Cache Storage/IndexedDB with their content hash; do not record or scrape the device voice output.

### Readiness check

Run after the initial user gesture, when locale changes, when an assignment downloads, and before cook mode:

- all interface phrase IDs exist;
- all assignment ingredients, steps, and notes have reviewed localized speakable text;
- either every required exact audio asset is cached or a compatible device voice is currently available;
- session and recipe-version snapshot are stored locally;
- focal visual metadata and fallback icon metadata are stored; optional media does not block readiness.

The result is:

- `ready_cached_audio`: every essential utterance resolves to cached exact audio;
- `ready_device_tts`: reviewed text is local and a compatible installed voice is available;
- `not_ready`: neither path can speak every essential utterance.

`ready_device_tts` is best-effort across browser/OS changes. Re-probe on each new app session. If a previously available voice disappears, enter the explicit audio-error flow before the next cooking action.

### Offline and failure behavior

- Offline with `ready_cached_audio`: full core flow works.
- Offline with `ready_device_tts`: full core flow works while the compatible local voice remains available.
- Offline with `not_ready`: do not present silent cooking as normal. Show the large audio-error state, vibrate where allowed, offer Retry and Tell homeowner, and retain already saved progress.
- Online does not imply speech readiness; this release has no cloud TTS dependency.
- Optional source media may be unavailable offline. Say `media.offline_unavailable`, return to the same step, and keep cooking controls usable.
- A synthesis `error`, timeout, missing `onend`, asset decode failure, or three-second no-start watchdog enters `audio_error`. One automatic re-probe is allowed; continued retries require a user tap.

## 8. Visual and media contract

### One focal visual

Each `ingredient` or `cook` view resolves exactly one `VisualPresentation`:

```ts
type VisualPresentation = {
  assetId: string;
  kind: "ingredient_photo" | "step_image" | "action_icon" | "state_icon";
  purpose: "identify_ingredient" | "show_result" | "show_action" | "show_state";
  accessibleNameMessageId: string;
  spokenDescriptionMessageId: string;
  verification: "approved";
  rights: "bundled" | "licensed" | "user_owned_confirmed" | "source_embed_allowed";
  attribution?: string;
};
```

Resolution order is approved exact ingredient photo, approved step/result image, bundled verified action icon, bundled state icon. An `unknown`, `prohibited`, `expired`, or unreviewed asset is ineligible. Ineligibility is not an error and must not block audio guidance.

The focal visual's button, when interactive, uses its short spoken description as its accessible name. A noninteractive meaningful image uses the same description as `alt`; decorative wrappers use empty alt. Icons inside already named buttons are hidden from the accessibility tree.

Text/quantities remain live DOM content. Images never contain required baked-in labels. Visual loading failure swaps to the eligible fallback without changing the spoken recipe prompt.

### Media help

- `Show how` exists only with approved eligible media metadata.
- User-owned/licensed video must have a poster, play/pause, replay, and a localized spoken description.
- YouTube uses an official attributed embed/open action at `sourceTimestampSeconds`; no download, detached audio, crop, or local caching.
- Starting media cancels app speech. App speech cannot start while media audio plays; an app control tap pauses media first.
- `Play` and `Replay` begin media only after their short spoken control label completes with a current event token. `Pause` pauses media first, then speaks its label.
- Offline or embed failure says the unavailable phrase and returns to the cook step. It never substitutes unrelated media.
- Captions are desirable for literate users, but the reviewed step narration remains authoritative for the no-reading path.

## 9. Semantic controls and focus

- Use native `button`, heading, progress, and dialog semantics. No clickable `div`.
- Minimum target is 44 by 44 CSS pixels; househelp primary actions are at least 64 pixels high with 12 pixels separation.
- Visible label and accessible name must contain the same localized control phrase. Do not add hidden instructions that change its meaning.
- `aria-live` does not carry programmatic narration. Use a polite live region only for visual system status and avoid duplicating spoken product audio to screen readers.
- A view entry moves DOM focus to its heading only after direct navigation, with `preventScroll` where needed. Programmatic speech never moves focus.
- Help and language selectors are modal dialogs with focus containment and return focus. Their speech token uses the dialog's screen instance.
- The speaker control occupies a consistent position. It exposes pressed/busy state without changing its button identity unpredictably for assistive technology.
- Respect reduced motion; speech behavior is unchanged.

## 10. Acceptance fixture use

`sample-assignment.json` is a reviewed, pinned assignment with eligible/ineligible visuals and a timer. `en-IN.json` and `hi-IN.json` provide matching phrase IDs and sample recipe translations. `interaction-cases.json` supplies reducer-level sequences and exact expected speech.

Minimum automated checks:

1. Parse every JSON file.
2. Assert English and Hindi message-ID/label/unit key parity and placeholder parity.
3. Resolve every `expectedSpeech` entry in every interaction case with no remaining `{placeholder}`.
4. Assert every declared control has visible label, accessible name, and activation speech IDs.
5. Assert generation/screen/locale/version mismatch drops callbacks and deferred timer starts.
6. Assert double `Next` advances once and `Repeat`/`Stop` do not mutate progress.
7. Assert language change cancels old speech and replays the same semantic prompt in the new locale.
8. Assert timer alarm cancels ordinary speech, never overlaps, and preserves the step as replay target.
9. Run offline cases for cached audio, device TTS, no speech source, and unavailable optional media.
10. Reject unknown/unapproved/prohibited visuals, keep one focal visual, and resolve the approved fallback.
11. Assert a missing reviewed translation makes readiness `not_ready`.
12. Test the complete HH0-to-HH5 path using taps plus expected audio only; no visible text assertion may be required to choose the next core action.

Manual validation remains required with low-literacy English/Hindi users, kitchen noise, an arm's-length phone, weak connectivity, screen lock/interruption, and at least one Android Chrome and one iOS Safari device. Device voice availability, pronunciation, and actual Hindi terminology cannot be certified by fixtures alone.

## 11. Explicit non-goals and open validation

- No hands-free commands, microphone permission, speech recognition, or conversational assistant.
- No cloud TTS account, key, or promised server-side voice generation in Milestone 1.
- No phoneme/SSML dependency; browser support is inconsistent. Reviewed text and optional pronunciation hints remain data for a later adapter.
- No automatic translation in the cooking session.
- No recipe safety inference from an icon/image.
- No promise that a YouTube embed works offline.
- English/Hindi wording and device pronunciation require pilot validation; fixture wording is an implementation baseline, not final linguistic certification.
