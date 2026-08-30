# Project Operating Guide

Read this file before changing the project.

## Product

This repository contains the household recipe-assistant web app described in `PROJECT.md`. Product behavior, screens, workflows, and data requirements live in `docs/PRODUCT-PLAN.md`; low-fidelity layouts live in `docs/WIREFRAMES.md`.

## Working rules

- Build in small, complete vertical slices from `docs/BUILD-PLAN.md`.
- Do not implement an unapproved milestone. Proposed scope is not approved scope.
- Preserve user changes and do not push to a remote unless explicitly asked.
- Keep the coordinator checkout for planning, review, and integration decisions.
- Implementation workers must use one isolated branch and sibling worktree each.
- Worker branches use `feature/`, `fix/`, `review/`, or `spike/` prefixes.
- Every worker reports its worktree, branch, changed files, verification, tradeoffs, and next recommendation.
- Do not merge worker output without explicit merge authorization.

## Verification expectations

- Test user-visible behavior at the level appropriate to the slice.
- Verify both homeowner and househelp permissions where a feature crosses roles.
- Extraction features need fixture-based success, partial-success, and failure tests.
- User-facing recipe data must expose its source and extraction confidence/review state.
- Ordering actions must require explicit homeowner confirmation; never place an order silently.
- Check accessibility for keyboard use, contrast, readable type, labels, focus, and reduced motion.
- Househelp acceptance tests must prove the core flow works by listening and tapping without reading, including spoken control labels, `Next` narration, replay, language change, interruption, and audio failure.
- Househelp visuals must be purposeful, verified, source/rights-aware, and paired with spoken meaning. Never use an unverified or decorative image as a cooking instruction.

## Document ownership

- `PROJECT.md`: stable product brief and boundaries.
- `DESIGN.md`: durable UX/UI and accessibility direction.
- `docs/PRODUCT-PLAN.md`: screens, workflows, data needs, permissions, and product rules.
- `docs/WIREFRAMES.md`: current low-fidelity screen layouts.
- `docs/STATE.md`: current milestone, active work, risks, blockers, and next step.
- `docs/BUILD-PLAN.md`: approved implementation slices and acceptance gates.
- `docs/DECISIONS.md`: append-only decisions and their rationale.
- `docs/HISTORY.md`: append-only completed work.
- `docs/MEMORY.md`: durable quirks and lessons not to rediscover.
- `docs/GLOSSARY.md`: canonical vocabulary.
- `docs/RUNBOOK.md`: setup, verification, deployment, rollback, and troubleshooting.

Update only the document that owns a changed fact. `STATE` is now; `HISTORY` is done; `DECISIONS` is why; `MEMORY` is what not to rediscover; `AGENTS` is how agents behave.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
