# Runbook

## Current status

Milestone 1 is a locally verified single Next.js TypeScript application on Node.js 24. SQLite is the local development datastore; Drizzle provides typed queries behind repository interfaces. Production hosting, datastore, and identity targets are not selected.

## Coordinator resume

1. Read `AGENTS.md`.
2. Read `docs/STATE.md`.
3. Load only the documents relevant to the next task.
4. Treat Milestone 1 as frozen unless a new change is explicitly requested; later milestones still require approval.

## Worker setup policy

When implementation is approved, the coordinator creates a dedicated branch and sibling worktree per worker, records both in `docs/STATE.md`, and supplies exact verification commands in the assignment. Workers must not push.

## Local application setup

Prerequisites:

- Node.js 24 and npm 11. The exact supported Node range is enforced in `package.json`.
- No paid service, external account, or API key is required for Milestone 1.

From the repository root:

```bash
npm ci
cp .env.example .env.local
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. The development-only role switcher creates a signed HTTP-only demo session for either seeded role. The endpoint is always disabled in production. Use the homeowner flow to import/manual-enter, review bilingual guidance, publish, and assign; use the househelp role to exercise the pinned assignment.

Environment values:

- `SESSION_SECRET`: at least 32 random characters; required at runtime in production.
- `DATABASE_PATH`: SQLite file path, default `.data/recipe-app.sqlite`.

Do not commit `.env.local`, database files, or real secrets. The committed `.env.example` contains placeholders only.

## Database lifecycle

`npm run db:migrate` applies the five current SQL migrations in filename order and records them in `app_migrations`. `npm run db:seed` upserts fixed IDs and timestamps, so rerunning it produces the same demo household, users, recipe, bilingual guidance, visual metadata, readiness state, and assignment without duplicates. `npm run db:setup` performs both operations.

The local database is disposable. To rebuild it, stop the app, move `.data/recipe-app.sqlite` and its `-shm`/`-wal` companions out of `.data`, then run `npm run db:setup`. Moving the files preserves a recoverable backup. There are no production rollback commands until a production datastore is selected; SQL migrations are forward-only in this milestone.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run all four gates with `npm run verify`.

Browser smoke tests are configured for desktop and narrow mobile Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

The E2E runner initializes deterministic data in a dedicated per-run `.data/playwright-<pid>.sqlite` database and starts its own development server on port `3100` by default. It never reuses the normal port-3000 server or database. Stop any active `next dev` process before starting the browser suite because Next.js permits only one development process per build directory. It intentionally uses one worker because the desktop and mobile projects share the isolated fixture. Set `PORT` or `PLAYWRIGHT_DATABASE_PATH` only when a controlled test environment requires an override. Two desktop cases are skipped because their cook-mode acceptance is deliberately phone-only. HTML reports are written to the ignored `playwright-report/` directory.

Current verified baseline: 12 test files / 135 Vitest tests, a warning-free production build, and 10 passing Playwright cases across desktop/mobile with 2 intentional desktop skips.

## Runtime checks

- `GET /api/health` returns `200` with the latest applied migration when SQLite is ready.
- A `503` response with `database: not_initialized` means `npm run db:setup` has not completed or the configured database cannot be opened.
- If a demo session redirects back to `/`, confirm the seed exists and that the signed session's user, household, membership, and role still match an active membership.
- If public webpage import fails, read the surfaced warning and use manual entry. The importer rejects private/loopback destinations, redirects outside policy, oversized/slow responses, unsupported media, and pages without trustworthy recipe evidence.
- If househelp audio is unavailable, use the on-screen audio recovery action and device settings. The local progress queue retries connectivity failures but deliberately retains rejected mutations for safe recovery instead of silently discarding them.
- If production startup reports `SESSION_SECRET is required in production`, provide a secret through the hosting platform's secret manager; do not add a fallback to source control.

## Deployment and rollback

No deployment target is approved and nothing has been pushed. Before deployment, complete real-device/assistive-technology validation, select a persistent production datastore, replace local demo authentication with the approved identity flow, configure encrypted secrets, exercise migrations against a backup, and document platform-specific health, deployment, and rollback commands here.

## Planning verification

- Confirm every screen ID referenced in a workflow exists in `docs/PRODUCT-PLAN.md`.
- Confirm wireframes cover the core homeowner import/review/assign/shop loop and househelp prepare/cook loop.
- Confirm provider-dependent behavior is labeled as discovery or fallback rather than guaranteed.
- Confirm the househelp flow includes first-tap audio activation, spoken labels/results, automatic next-step speech, replay, language change, offline readiness, and a recoverable audio-failure path.
- Confirm every househelp visual is purposeful, verified, accessible, rights-aware, and safely replaceable by spoken guidance if unavailable.
- Confirm current facts live in `STATE`, completed work in `HISTORY`, decisions in `DECISIONS`, and durable gotchas in `MEMORY`.

Planning checks remain required when product documents change. Application checks above are required when runtime code changes.
