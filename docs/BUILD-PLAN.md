# Build Plan

Status: Milestone 1 implemented and independently verified locally on 2026-08-30. Milestone 2 was approved for implementation on 2026-08-30; later milestones remain proposed.

The sequence uses complete vertical slices. Later milestones may change after user research and integration discovery.

## Milestone 1: Webpage recipe to assigned cook mode

Goal: prove the core household loop with one public recipe webpage, homeowner review, assignment, and househelp execution.

Completed workstreams:

1. Platform foundation: household roles, typed contracts, local persistence, signed development sessions, authorization policy, migrations, seed, and test harness.
2. Recipe pipeline: safe public-URL fetch, structured extraction, lossless normalization, warnings, evidence, fixtures, API, and manual fallback.
3. Homeowner workflow: import status, review/edit, exact bilingual speech review, publish gates, assignment, and immutable snapshots.
4. Househelp workflow: assigned-only Today/cook mode, audio activation, English/Hindi switching, ingredients, steps, timers, help, issues, retry/resume, and completion.
5. Independent acceptance review: permission, accessibility, offline/idempotency, production-mode, responsive visual, and end-to-end checks.

Acceptance achieved locally:

- A seeded demo household proves the homeowner/househelp role boundary and shared-device handoff; production household creation and identity remain intentionally unselected.
- Homeowner can import a supported public recipe webpage.
- Extracted title, servings, ingredients, and ordered steps appear as a draft with source attribution and warnings.
- Homeowner can correct, publish, and assign the recipe to a meal slot.
- Househelp can choose a spoken language by listening, open an assignment, check ingredients one at a time, complete spoken steps, leave/resume, and mark it done without needing to read.
- Every househelp control announces itself when activated; `Next` advances and automatically speaks the full new instruction.
- First-time setup works in environments that require an initial user gesture before audio begins.
- `Repeat`/`Stop`, `Help`, and language change remain available in a consistent position throughout the househelp flow.
- Ingredient and cooking screens show no more than one verified focal visual plus a consistent action/state icon; missing visuals fall back safely to spoken guidance.
- Every non-text control or instructional visual has an accessible name and matching spoken meaning.
- Househelp guidance uses stale-event guards, a persisted retry queue, and recoverable audio/readiness states for intermittent connectivity.
- Househelp cannot edit/publish recipes or access ordering controls.
- Unsupported import fails safely and clearly without invented recipe content.
- Automated extraction fixtures and role-permission tests pass.
- Automated keyboard/focus/labels/touch-target/responsive checks and deterministic spoken-feedback cases pass; real TalkBack/VoiceOver and device-voice validation remain required before production.
- `STATE`, `HISTORY`, `MEMORY`, `RUNBOOK`, and decisions are current.

## Milestone 2: Broad-source recipe import

Status: approved; implementation is active on an isolated worker branch.

Goal: make the existing reviewed import workflow work across more public recipe webpages and public YouTube videos without inventing recipe content.

Approved vertical slices:

1. Repair the Node 24 live-fetch DNS callback and retain the existing public-network, redirect, content-type, timeout, and size protections.
2. Keep native HTML fetch and deterministic Schema.org extraction as the first path; use Firecrawl as a configured fallback for eligible public webpage fetch/extraction failures.
3. Use OpenAI structured extraction only when deterministic webpage extraction is incomplete or the source is a YouTube transcript. Require source evidence and preserve warnings/review state.
4. Accept canonical public YouTube watch/share URLs, request available transcript text through Firecrawl, record transcript language when supplied, and fail to manual entry when usable transcript evidence is absent.
5. Extend the existing persisted import lifecycle and homeowner review UI with source/provider status, recoverable errors, and explicit manual fallback. Do not introduce a separate queue until measured latency or deployment limits require one.
6. Verify webpage success, partial success, provider failure, transcript success, missing transcript, permissions, keyboard/focus/labels, and narrow-screen behavior with deterministic fixtures and mocked providers.

Acceptance gates:

- Pinch-of-Yum-shaped public HTML succeeds through a mocked Firecrawl fallback when direct fetch cannot provide usable content.
- A blocked or contractually unsupported source such as Allrecipes fails clearly to manual entry; Firecrawl success is never assumed for every domain.
- Caption/transcript availability is detected and language recorded when the provider supplies it.
- Recipe fields link back to transcript timestamps only where timestamp evidence exists; untimed transcript evidence remains attributed without fabricated timing.
- Optional video help uses the attributed official YouTube player at the relevant timestamp; the app does not create or cache standalone YouTube clips.
- Missing transcript and ambiguous extraction have recoverable review states.
- Firecrawl and OpenAI calls are server-only, bounded, mock-tested, and disabled cleanly when credentials are absent.
- Recipe/transcript content is not retained by OpenAI beyond request processing (`store: false`); the app persists only the source/evidence needed by its reviewed draft workflow.
- No YouTube Data API key, browser cookies, `yt-dlp`, downloaded video/audio, invented nutrition, or invented servings/times are part of this milestone.
- Cost, retention, platform terms, and transcription limits are documented.

## Proposed Milestone 3: Household shopping list

Goal: convert selected assignments into a reviewable, consolidated shopping list.

Acceptance outline:

- Quantities scale and combine without losing original display lines.
- Homeowner can classify needed, at-home, and optional items.
- Househelp can flag missing items but cannot confirm purchase.
- Plain share/export fallback works without a provider integration.

## Proposed Milestone 4: Grocery provider discovery and handoff

Goal: validate one official provider path and implement only the supported handoff depth.

Acceptance outline:

- Discovery spike records official APIs, permissions, commercial access, limits, and rejected approaches.
- Provider adapter isolates catalog/cart behavior from core shopping logic.
- Homeowner resolves matches and confirms before leaving for checkout.
- No payment credentials are stored and failed/expired handoffs recover cleanly.

## Future ideas, not planned scope

- Conversational voice input or hands-free control.
- Additional regional-language voice packs beyond the validated launch set.
- Pantry inventory automation and recurring staples.
- Nutrition calculation, dietary profiles, and allergen workflows.
- Photos, cooking feedback, recipe discovery, public sharing, native apps, and delivery tracking.
