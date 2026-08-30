# Build Plan

Status: Milestone 1 implemented and independently verified locally on 2026-08-30. Later milestones remain proposed.

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

## Proposed Milestone 2: YouTube transcript import

Goal: add public YouTube URLs while preserving transcript evidence and safe failure behavior.

Acceptance outline:

- Caption/transcript availability is detected and language recorded.
- Recipe fields link back to transcript timestamps where evidence exists.
- Optional video help uses the attributed official YouTube player at the relevant timestamp; the app does not create or cache standalone YouTube clips.
- Missing transcript and ambiguous extraction have recoverable review states.
- Cost, retention, platform terms, and transcription fallback are documented.

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
