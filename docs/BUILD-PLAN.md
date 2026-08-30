# Build Plan

Status: Milestone 1 plan approved on 2026-08-30. Implementation has not started; later milestones remain proposed.

The sequence uses complete vertical slices. Later milestones may change after user research and integration discovery.

## Milestone 1: Webpage recipe to assigned cook mode

Goal: prove the core household loop with one public recipe webpage, homeowner review, assignment, and househelp execution.

Workers (after approval):

1. Product/UI foundation: household roles, homeowner import/review screens, househelp Today/cook-mode screens.
2. Recipe pipeline: safe public-URL fetch, structured recipe extraction, draft normalization, warnings, and fixture tests.
3. Quality review: permission, accessibility, workflow, and end-to-end acceptance review.

Acceptance:

- Homeowner can create a household, invite one househelp, and import a supported public recipe webpage.
- Extracted title, servings, ingredients, and ordered steps appear as a draft with source attribution and warnings.
- Homeowner can correct, publish, and assign the recipe to a meal slot.
- Househelp can choose a spoken language by listening, open an assignment, check ingredients one at a time, complete spoken steps, leave/resume, and mark it done without needing to read.
- Every househelp control announces itself when activated; `Next` advances and automatically speaks the full new instruction.
- First-time setup works in environments that require an initial user gesture before audio begins.
- `Repeat`/`Stop`, `Help`, and language change remain available in a consistent position throughout the househelp flow.
- Ingredient and cooking screens show no more than one verified focal visual plus a consistent action/state icon; missing visuals fall back safely to spoken guidance.
- Every non-text control or instructional visual has an accessible name and matching spoken meaning.
- Househelp guidance survives intermittent connectivity, does not overlap or play stale instructions, and exposes a recoverable audio-failure state.
- Househelp cannot edit/publish recipes or access ordering controls.
- Unsupported import fails safely and clearly without invented recipe content.
- Automated extraction fixtures and role-permission tests pass.
- Keyboard, focus, labels, touch targets, contrast, spoken-feedback behavior, and audio-language readiness meet the documented accessibility target.
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
