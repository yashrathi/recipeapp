# Runbook

## Current status

Planning-only repository. There is no application runtime, dependency installation, test command, deployment, or rollback procedure yet.

## Coordinator resume

1. Read `AGENTS.md`.
2. Read `docs/STATE.md`.
3. Load only the documents relevant to the next task.
4. Confirm a milestone is approved before creating implementation branches or worktrees.

## Worker setup policy

When implementation is approved, the coordinator creates a dedicated branch and sibling worktree per worker, records both in `docs/STATE.md`, and supplies exact verification commands in the assignment. Workers must not push.

## Planning verification

- Confirm every screen ID referenced in a workflow exists in `docs/PRODUCT-PLAN.md`.
- Confirm wireframes cover the core homeowner import/review/assign/shop loop and househelp prepare/cook loop.
- Confirm provider-dependent behavior is labeled as discovery or fallback rather than guaranteed.
- Confirm the househelp flow includes first-tap audio activation, spoken labels/results, automatic next-step speech, replay, language change, offline readiness, and a recoverable audio-failure path.
- Confirm every househelp visual is purposeful, verified, accessible, rights-aware, and safely replaceable by spoken guidance if unavailable.
- Confirm current facts live in `STATE`, completed work in `HISTORY`, decisions in `DECISIONS`, and durable gotchas in `MEMORY`.

Application setup, test, deployment, rollback, and troubleshooting commands must be added when the first technical stack and deployment target are approved.
