# UX and Design Direction

## Experience model

The product has two intentionally different surfaces connected by the same recipe and assignment data.

- The homeowner surface is a planning and review workspace: import, inspect, correct, assign, and shop.
- The househelp surface is an audio-first execution tool: listen, tap one obvious action, and hear what happens next. Reading is never required for the core cooking flow.

## Information hierarchy

Homeowner navigation:

1. Today
2. Recipes
3. Add recipe
4. Shopping
5. Household and settings

Househelp navigation is deliberately shallow:

1. Today's next task
2. One-at-a-time ingredient check
3. One-at-a-time cooking steps
4. Completion

Upcoming work and settings are secondary. A persistent language/audio control is available from every househelp screen.

## Interaction principles

- Show extraction progress as named stages, not an indefinite spinner.
- Mark generated recipes as `Draft — needs review` until the homeowner confirms them.
- Highlight missing or low-confidence fields inline.
- Default recipe pages to a short overview; preserve detailed instructions one tap away.
- Every househelp screen speaks its title and main choice when opened.
- Every activated househelp control speaks its label. Safe actions then happen immediately and announce the result; consequential actions use a spoken confirmation.
- Moving forward speaks the new instruction, for example: `Next. Now add one cup of spinach.`
- Cook mode shows and speaks one action at a time with only `Repeat`, `Next`, and `Help` as persistent controls.
- Ingredient preparation checks one ingredient at a time using `Have it`, `Missing`, and `Repeat`.
- Progress is saved automatically and can recover after a weak connection.
- The househelp can report `ingredient missing`, `instruction unclear`, or `cannot complete` without editing the canonical recipe.
- Shopping distinguishes `needed`, `already at home`, and `optional` items.
- A provider handoff always has a final homeowner review screen.

## Visual direction

- Mobile-first, calm, high-contrast, and utility-led.
- Homeowner: compact cards and review panels with visible status.
- Househelp: one dominant action, very large touch targets, generous spacing, minimal text, simple familiar icons, and no dense lists.
- Use imagery only when it reduces ambiguity, such as a verified ingredient photo. Avoid decorative graphics and image-dependent meaning.
- Do not encode statuses with color alone. Pair color with text and icons.
- Avoid decorative motion during cooking; honor reduced-motion preferences.

## Visual guidance system

Househelp screens use one focal visual at a time. Audio remains authoritative; the visual confirms the ingredient or action and reduces ambiguity.

### Visual priority

1. **Ingredient photo:** a clear, verified photo of the exact ingredient currently being checked or added.
2. **Action icon:** a small consistent library for actions such as add, cut, wash, stir, cover, heat, wait, and serve.
3. **State cue:** simple quantity, flame/heat, timer, progress, done, missing, and help symbols.
4. **Step image:** a verified source still or curated illustration when appearance matters, such as `cook until golden`.
5. **Step video:** optional tap-to-play help when motion is essential to understand the action.

### Rules

- Use at most one main photo, illustration, or video per ingredient/step screen.
- Prefer verified real ingredient photos over decorative food photography or AI-generated approximations.
- Use icons consistently and always pair them with a spoken label and accessible name. Icons never carry the full instruction alone.
- Keep text live and localizable; do not bake labels or quantities into images.
- The homeowner previews and approves any recipe-specific visual before assignment.
- If no trustworthy visual exists, show the action icon and continue with spoken guidance. Never guess or substitute a misleading image.
- Images use a simple crop, uncluttered background, strong contrast, and a recognisable subject at arm's length.
- Do not automatically play moving media. A video has one large play/pause control and can be replayed.
- YouTube help opens or embeds the attributed original player at the relevant timestamp. Do not download, crop, restyle, or extract standalone clips from YouTube as the default behavior.
- User-owned or properly licensed demonstrations may be stored as short muted clips, but they still require pause/stop controls and a spoken description.

## Audio, language, and readability

- Use short verbs: `Add`, `Review`, `Assign`, `Start`, `Done`, `Ask for help`.
- Househelp labels are one to three words where possible. Text remains as a visual confirmation but is not the primary instruction channel.
- Automatically speak the current task, ingredient, or step on entry. A large `Repeat` control is always available.
- The persistent speaker control becomes `Stop` while speech is playing and returns to `Repeat` when speech ends.
- On activation, speak the control and outcome: `Missing. The homeowner has been told.`
- Keep spoken steps short, concrete, and ordered: action + quantity + ingredient + timing/heat when relevant.
- Speak quantities naturally in the selected language; do not read database abbreviations such as `tbsp` verbatim.
- Pause or duck speech when a timer alarm plays. Never overlap two spoken messages.
- The homeowner can preview the exact spoken guidance before assigning a recipe.
- Homeowner authoring is English-first. Hindi recipe guidance and notes are generated from English; Hindi fields are optional overrides, never required inputs.
- Store canonical recipe content separately from translations.
- Spoken guidance and interface phrases are versioned by language. A reviewed source version remains the authority.
- Language is chosen during setup with spoken samples and can be changed from every househelp screen without entering settings.
- The homeowner may preselect a language on the invite, but the househelp confirms it by hearing a sample.
- Launch languages require user validation; the architecture must support English, Hindi, and household-selected Indian languages without hard-coded strings.
- Audio guidance is required in the first usable slice, not deferred enhancement work.

## Househelp audio interaction contract

1. **First activation:** if the environment requires user interaction before speech, show one full-screen speaker control. Its first tap starts audio and the spoken language setup.
2. **Screen entry:** announce where the user is and the main available action.
3. **Control activation:** speak the short label immediately.
4. **Safe result:** perform the action, then speak the new state or next instruction.
5. **High-impact result:** speak what will happen and require one explicit confirmation.
6. **Interruption:** stop current speech when another control is tapped, then speak the new response.
7. **Replay:** repeat the current instruction in full without changing state.
8. **Language change:** announce each language in that language; selection takes effect immediately and replays the current instruction.
9. **Audio failure:** show a simple sound-error state, retry automatically, and offer a one-tap call/alert to the homeowner. Never silently continue as if guidance played.

## Accessibility targets

- WCAG 2.2 AA as the implementation target.
- Minimum 44 × 44 px touch targets.
- Househelp primary controls target at least 64 px height with ample separation to reduce accidental taps.
- Keyboard navigation and visible focus on the homeowner interface.
- Labels must not depend on placeholder text.
- Timers and state changes need visual and nonvisual feedback.
- Cooking mode should not require precise gestures or continuous screen attention.
- Spoken feedback must not rely on screen-reader focus behavior; it is an explicit product feature that also remains compatible with platform assistive technology.
- Essential househelp interface phrases and assigned-recipe audio must be available during intermittent connectivity.

## Responsive intent

- Househelp screens are optimized for a narrow phone first.
- Homeowner screens work on phone and desktop; review uses stacked sections on phone and a two-column layout on wider screens.
- Ordering provider content may open in a new app or browser and must return the user to a recoverable handoff state.
