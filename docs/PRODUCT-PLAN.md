# Product Plan: Screens, Data, and Workflows

Status: Milestone 1 product defaults approved on 2026-08-30. Open questions remain as validation items or later-milestone decisions.

## 1. Roles and permissions

| Capability | Homeowner | Househelp |
|---|---:|---:|
| Create/import a recipe | Yes | No |
| Review/edit/publish recipe | Yes | No |
| Assign or reschedule cooking | Yes | No |
| View cookable recipe | Yes | Yes, active assignments and published household recipes; never drafts/archived versions |
| Run cook mode and mark progress | Optional | Yes |
| Report missing item/question | Yes | Yes |
| Choose spoken language/replay guidance | Optional | Yes |
| Prepare shopping list | Yes | Can flag needs |
| Confirm provider cart/order | Yes | No |
| Manage household members | Yes | No |

Recommended authentication assumption: homeowner uses email/phone sign-in; househelp uses phone sign-in or a homeowner-issued invite with a simple PIN. Do not share one household-wide password.

## 2. Screen inventory

### Shared and onboarding

| ID | Screen | Purpose | Key states |
|---|---|---|---|
| S1 | Welcome/sign in | Authenticate and choose language | new, returning, error |
| S2 | Household setup/invite | Create household or accept role-bound invite | homeowner, househelp, expired invite |
| S3 | Notifications/settings | Language, units, accessibility, notifications | offline, permission denied |

### Homeowner

| ID | Screen | Purpose | Key content/actions |
|---|---|---|---|
| H1 | Today dashboard | See meals, assignments, imports, and issues | add recipe, assign, resolve issue |
| H2 | Add recipe | Paste a public YouTube or webpage URL | URL validation, source preview |
| H3 | Import progress | Show transcript/fetch/extraction stages | retry, cancel, partial extraction |
| H4 | Review recipe | Correct title, servings, time, ingredients, steps, and guidance visuals | confidence flags, source link, visual approval, publish |
| H5 | Recipe detail | Read a published recipe and manage it | short/detail view, assign, duplicate/edit |
| H6 | Assign recipe | Choose date, meal, person, servings, notes | scheduling conflict, save |
| H7 | Shopping list | Classify and edit required items | needed, at home, optional, quantities |
| H8 | Provider match/review | Resolve product matches and hand off cart | unavailable item, substitution, total |
| H9 | Household management | Invite/remove members and set permissions | pending invite, revoke access |

### Househelp

| ID | Screen | Purpose | Key content/actions |
|---|---|---|---|
| HH0 | Spoken-language setup | Hear language samples and select one without reading | sample playing, selected, audio unavailable |
| HH1 | Cooking menu | Hear and browse active assignments and published household recipes one item at a time | next item, start, resume, cook now, no recipe, changed task |
| HH2 | Task briefing | Hear dish, target time, servings, and homeowner note | repeat, ingredients, start, cannot complete |
| HH3 | Ingredient check | Confirm one spoken ingredient with one verified visual at a time | have it, missing, repeat, visual unavailable, complete |
| HH4 | Cook mode | Hear and see one cooking action at a time | repeat, next, timer, optional media help, audio/visual failure |
| HH5 | Completion | Hear confirmation and report a simple outcome | done, changed, need help |
| HH6 | Completed history | Hear recent completed assignments one item at a time | next item, repeat, back |

### System and exception surfaces

- Import failed or unsupported source.
- Transcript unavailable; allow manual paste or recipe entry in a later slice.
- Offline/reconnecting state.
- Spoken guidance unavailable, interrupted, or not downloaded for the selected language.
- Access revoked or assignment reassigned.
- Recipe changed after cooking started; pin the session to its recipe version.
- Provider unavailable; preserve a plain shopping list/export fallback.

## 3. Core workflows

### A. Import a recipe webpage

1. Homeowner pastes a public URL.
2. System validates URL safety and source eligibility.
3. Importer first looks for structured recipe metadata, then falls back to allowed page extraction.
4. Normalizer identifies title, yield, times, ingredient lines, ordered steps, images, and attribution.
5. Confidence and warnings are attached per field.
6. Homeowner reviews and edits the draft.
7. Publishing creates an immutable recipe version.

Failure path: preserve source and job logs, explain the unsupported/failed stage, and allow retry. Manual entry is a recommended fallback slice.

### B. Import a YouTube recipe

1. Homeowner pastes a public YouTube URL.
2. System stores video identity and attribution, then requests available captions/transcript.
3. If permitted and captions are unavailable, a future transcription service may process audio; this needs policy, cost, and rights validation.
4. Extractor converts transcript segments into ingredients and ordered steps.
5. Timestamp references are retained so a reviewer can check the source.
6. Homeowner resolves missing quantities or ambiguous instructions and publishes.

Failure path: show `Transcript unavailable` and offer retry/manual entry instead of fabricating a recipe.

### C. Review and publish

1. Show source beside extracted fields.
2. Flag missing/low-confidence quantity, unit, temperature, timing, or ordering.
3. Homeowner edits and previews short, detailed, and spoken instructions.
4. Homeowner approves each recipe-specific ingredient/step visual or leaves it blank when no trustworthy visual exists.
5. Publish locks version 1; later edits create version 2 rather than changing active cooking sessions.

### D. Schedule and assign

1. Homeowner selects recipe, date, meal, servings, assignee, and notes.
2. System computes scaled ingredient display from the reviewed recipe.
3. Househelp receives an assignment notification.
4. Changes notify the assignee; started sessions remain pinned to the version they began with unless explicitly restarted.

### E. Prepare and cook

1. At first setup, one full-screen speaker control invites the initial tap needed to start audio. The app then speaks the language-selection prompt; each language option says its own name aloud, and the chosen language is immediately confirmed and remembered on that device. Later menu visits, task openings, reloads, and completion returns reuse it; language setup appears again only when the househelp explicitly chooses `Change language`.
2. Househelp opens the cooking menu. The app announces one item at a time. Assignments include date, meal, target time, and `Start`/`Resume`; published household recipes are identified as such and offer `Cook now`. `Next` cycles through both.
3. If househelp was asked in person to make an unassigned dish, `Cook now` creates one homeowner-visible ad-hoc cooking run and atomically pins the current reviewed bilingual recipe version before opening it.
4. Opening the task speaks a short briefing: dish, servings, target time, and homeowner note when present.
5. Ingredient check presents one item at a time with a verified ingredient photo when available and asks a spoken question such as `Do you have one cup of spinach?`
6. Tapping `Have it`, `Missing`, or `Repeat` speaks the control label. `Missing` also confirms that the homeowner was notified.
7. Cook mode records the active recipe version, shows one action visual, and automatically speaks the first instruction.
8. Tapping `Next` says `Next`, advances, and speaks the full next instruction. `Go back` reviews an earlier instruction without rewinding saved progress. `Repeat` replays without changing progress; `Help` speaks the available help choices.
9. A user may tap a verified step image or video for help. Motion never auto-plays and never blocks `Repeat`, `Next`, or `Help`.
10. Timers announce start, remaining-time checkpoints only when useful, and completion without overlapping instructions.
11. Progress auto-saves. After interruption or reconnection, the app announces the restored step before accepting input.
12. Completion is spoken and requires one large confirmation. Homeowner sees status: not started, preparing, cooking, blocked, or done; after confirmation the househelp returns to the cooking menu and the completed run is no longer offered as active. A persistent `Cooking menu` control and bounded automatic fallback keep this exit usable even when sync or speech stalls.

The core path must remain operable by listening and tapping. Text and simple icons reinforce the spoken interface but are not required to understand it.

### F. Change spoken language

1. A persistent language/audio control appears in the same location on every househelp screen.
2. Activating it says `Change language` in the current language.
3. Each available option speaks its language name in that language.
4. Selecting one immediately changes interface speech and replays the current instruction in the new language.
5. The choice is saved for the user, not globally for every household member.

### G. Build a shopping list and order handoff

1. System combines ingredients from selected assignments and scales quantities.
2. Homeowner marks items already at home and adjusts quantities.
3. Catalog matcher proposes delivery-provider products with confidence and pack-size differences.
4. Homeowner resolves unmatched items and substitutions.
5. System either creates a supported provider cart through an official integration or opens a provider-neutral handoff/export.
6. Homeowner performs final review and confirms in the provider's supported checkout.
7. App stores handoff state, not payment credentials.

Important: direct Swiggy cart creation, prices, inventory, checkout, and tracking are discovery items until official API/partner access is confirmed.

## 4. Data requirements

### Identity and household

| Entity | Essential fields |
|---|---|
| User | id, name, phone/email, locale, spoken locale, audio-first mode, speech rate, autoplay/replay preferences, timezone, accessibility preferences, status |
| Household | id, name, timezone, default units, default languages |
| Membership | user id, household id, role, permissions, invite/status, created/revoked timestamps |
| Device/notification preference | user id, channel, token/endpoint, quiet hours, consent |

### Source and extraction

| Entity | Essential fields |
|---|---|
| RecipeSource | id, type (web/YouTube/manual), canonical URL, provider/video id, title, author/channel, image, attribution, fetched timestamp, terms/robots result |
| ImportJob | id, household/creator, source id, stage, status, error code, attempt count, timestamps, extractor version |
| SourceArtifact | import id, artifact type, language, raw location, content hash, retention/consent metadata |
| TranscriptSegment | artifact id, start/end time, text, language, confidence |
| ExtractionWarning | import/field path, category, severity, message, evidence reference, resolved state |

Raw page/transcript retention should be minimized and governed by a defined deletion period. Secrets, cookies, payment data, and authenticated page content must not be stored in source artifacts.

### Recipe

| Entity | Essential fields |
|---|---|
| Recipe | id, household, source id, current version, status, created by, archived state |
| RecipeVersion | recipe id, version, title, description, servings, prep/cook/total time, cuisine, language, review status, reviewer, published time |
| Ingredient | canonical name, aliases, category, allergen tags |
| RecipeIngredient | version id, display line, quantity, unit, ingredient id, preparation note, optional flag, section, order, confidence, source evidence |
| RecipeStep | version id, order, section, short text, detailed text, structured action/quantity/ingredient/time/heat, duration, temperature, ingredient references, media timestamp, safety note, confidence |
| RecipeTranslation | version/locale, translated fields, spoken instruction text, pronunciation hints, translation status/version, reviewer |
| SpokenGuidance | recipe/step or interface key, locale, speakable text, audio asset/cache key, voice/version, generation status, duration, reviewed state |
| VisualAsset | id, type (photo/icon/illustration/video/embed), source/owner, source URL, attribution, rights/usage status, locale neutrality, alt/spoken description, crop/poster, verification state, reviewer, cache policy |
| RecipeVisual | recipe version, ingredient/step/dish reference, visual asset id, purpose, display order, source timestamp, approved state |

Preserve the original ingredient line even when normalized quantity/unit parsing fails.

### Planning and cooking

| Entity | Essential fields |
|---|---|
| CookingAssignment | household, origin (`scheduled` or `ad_hoc`), recipe version, assignee, creator, date/time, meal, target servings, notes, status |
| CookingSession | assignment or ad-hoc run, pinned recipe version, started/finished times, current step, status, last synced time |
| StepProgress | session, step, state, started/completed time, timer state |
| Issue | assignment/session, reporter, type, message, ingredient/step reference, status, resolution |
| AudioReadiness | assignment, locale, required asset count, ready/failed count, checked time, failure reason |

### Shopping and integration

| Entity | Essential fields |
|---|---|
| ShoppingList | household, assignment ids, creator, status, provider, timestamps |
| ShoppingListItem | ingredient/display name, required quantity/unit, source assignments, state, homeowner note |
| CatalogMatch | list item, provider SKU, title, pack size, price snapshot, availability snapshot, confidence, substitution state |
| OrderHandoff | list, provider, external cart/reference, handoff URL, status, created/confirmed timestamps, failure code |
| IntegrationAccount | household, provider, authorization metadata, scopes, status; tokens stored encrypted outside ordinary app records |

Do not store payment card details. Treat provider price and availability as time-stamped snapshots, never stable facts.

### Operational and safety data

- Audit events for recipe publication, assignment changes, access changes, and order handoffs.
- Idempotency keys for imports, notifications, and provider actions.
- Consent and deletion records.
- Structured error codes and redacted diagnostic logs.
- Recipe/source/extractor versions for reproducibility.

## 5. State models

Import job: `queued → fetching/transcribing → extracting → needs_review → ready`, with `failed` or `cancelled` exits.

Recipe: `draft → reviewed/published → archived`; edits create a new draft version.

Assignment: `scheduled → acknowledged → preparing → cooking → done`, with `blocked`, `cancelled`, and `reassigned` paths.

Shopping list: `draft → reviewed → handed_off → confirmed`, with `failed` or `expired` paths.

## 6. System components (conceptual, not a framework choice)

- Web clients with role-aware routes and shared household session.
- Application API and authorization layer.
- Background import pipeline with source-specific adapters.
- Transcript/caption adapter and webpage structured-data extractor.
- Recipe normalization/extraction service with confidence and evidence.
- Relational application store plus short-lived artifact storage.
- Notification service.
- Translation and speech adapter with versioned, cacheable guidance.
- Verified visual-asset library and source-aware media adapter.
- Provider-neutral grocery catalog/cart adapter.
- Audit, observability, and deletion jobs.

## 7. Nonfunctional requirements

- Authorization checks at the API/data layer, not only hidden UI.
- Safe URL fetching: block private-network targets, redirects to private IPs, oversized content, and unsupported schemes.
- Background jobs must be retryable and idempotent.
- Cooking progress should tolerate intermittent connectivity and reconcile safely.
- Assigned househelp tasks must pass an audio-readiness check for the selected language before the target cooking time.
- Essential control announcements and recipe guidance must be cached or otherwise available during intermittent connectivity.
- Speech events must be serialized, cancellable, and tied to the visible state so stale instructions cannot play after navigation.
- Every meaningful image/icon has an accessible name and spoken equivalent; visuals are never the only way to understand an instruction.
- Moving media is user-initiated and has visible play/pause/replay controls.
- Media storage, caching, attribution, and playback must respect the source's rights and platform policy.
- Encrypt data in transit and at rest; rotate provider secrets.
- Delete household and user data through a documented lifecycle.
- Clearly label AI-generated content and uncertainty.
- Maintain source attribution and comply with platform/site terms and applicable copyright rules.
- Do not present generated allergen, nutrition, or safety content as medical advice.

## 8. Analytics for product validation

- Import started/succeeded/failed by source type and failure stage.
- Time from import to reviewed recipe.
- Count and category of reviewer corrections; never log recipe text in analytics by default.
- Assignment opened, cooking started, step resumed, completed, or blocked.
- Missing-ingredient issue rate.
- Shopping-list handoff and unmatched-item rate.
- Accessibility/language settings used.
- Guidance replay rate, audio failures, language changes, and abandoned steps; do not record microphone audio because the core flow does not require listening to the user.

## 9. Open questions requiring product validation

1. Which spoken languages and dialects do homeowner/househelp pairs need at launch, and how should ingredient names be pronounced locally?
2. Is the househelp expected to own a smartphone and phone number, or is a shared-device/PIN flow required?
3. Should the homeowner be able to create manual recipes in MVP when import fails?
4. Does the homeowner want inventory tracking, or only a one-time `already at home` checklist?
5. Which meal scheduling model fits: exact time, meal slot, or simple day?
6. Is Swiggy a hard requirement, and is official partner/API access available?
7. Resolved for Milestone 1 follow-up: househelp sees active assignments plus published household recipes, but never drafts or archived versions.
8. Should audio use a consistent generated voice, available device voices, or pre-recorded human voice packs for the first launch languages?
9. Will recipe visuals come from a curated licensed ingredient/action library, homeowner uploads, allowed source media, or a combination?

## 10. Approved starting defaults

- Mobile-first responsive web app, not separate native apps.
- Human-reviewed draft required before assignment.
- One homeowner and one househelp supported first, with a data model that allows more members.
- Meal-slot scheduling (`breakfast`, `lunch`, `snack`, `dinner`) plus an optional target time.
- Audio-first househelp flow is required in the first usable slice; no core task may require reading.
- Homeowner selects a likely spoken language during invite; househelp confirms it with spoken samples and can change it from every screen.
- Launch with a small validated language set while keeping recipe guidance and interface speech fully locale-versioned.
- Use a small verified visual vocabulary in the first slice: ingredient photo, action icon, quantity/heat/timer cues, and optional source media.
- Shopping-list handoff first; direct Swiggy cart/checkout only after integration discovery.
- Manual recipe fallback included before expanding source coverage.
