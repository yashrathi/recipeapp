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

Open `http://localhost:3000`. The development-only role switcher creates a signed HTTP-only demo session for either seeded role. The endpoint is always disabled in production. Use the homeowner flow to import/manual-enter, review bilingual guidance, publish, and assign. In the househelp role, either open the assigned task or choose the published household recipe and use `Cook now` to exercise an ad-hoc cooking run after an in-person request.

Environment values:

- `SESSION_SECRET`: at least 32 random characters; required at runtime in production.
- `DATABASE_PATH`: SQLite file path, default `.data/recipe-app.sqlite`.
- `FIRECRAWL_API_KEY`: optional server-only key used after an eligible public webpage passes URL safety checks but direct fetching or deterministic extraction cannot produce a usable page.
- `FIRECRAWL_API_URL`: Firecrawl scrape endpoint, default `https://api.firecrawl.dev/v2/scrape`; keep the default outside controlled adapter tests.
- `FIRECRAWL_ZERO_DATA_RETENTION`: optional `true`/`false`, default `false`. Set `true` only when Zero Data Retention is enabled for the Firecrawl account; standard paid plans can reject the flag with `403`.
- `OPENAI_API_KEY`: optional server-only key for evidence-checked extraction from unstructured Firecrawl markdown and public YouTube transcripts. Never use a `NEXT_PUBLIC_` prefix.
- `OPENAI_RECIPE_MODEL`: required with `OPENAI_API_KEY`; choose an available Responses API model that supports strict JSON Schema structured outputs. Model usage incurs provider cost.
- `OPENAI_API_URL`: Responses endpoint, default `https://api.openai.com/v1/responses`; keep the default outside controlled adapter tests.

The synchronous OpenAI extraction timeout is 60 seconds. A representative live YouTube transcript import measured about 52 seconds end to end, so deployment request limits must exceed the complete Firecrawl-plus-OpenAI path with operational headroom. Hosts with shorter function/request ceilings can terminate otherwise successful imports; moving long-running imports to a queue would require a separately approved architecture slice and is not implemented here.

Do not commit `.env.local`, database files, or real secrets. The committed `.env.example` contains placeholders only.

## Database lifecycle

`npm run db:migrate` applies the six current SQL migrations in filename order and records them in `app_migrations`; `0040_ad_hoc_cooking.sql` distinguishes scheduled assignments from ad-hoc cooking runs. `npm run db:seed` upserts fixed IDs and timestamps, so rerunning it produces the same demo household, users, recipe, complete bilingual guidance, visual metadata, readiness state, and assignment without duplicates. `npm run db:setup` performs both operations.

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

The E2E runner initializes deterministic data in a dedicated per-run `.data/playwright-<pid>.sqlite` database and starts its own development server on port `3100` by default. It never reuses the normal port-3000 server or database. Stop any active `next dev` process before starting the browser suite because Next.js permits only one development process per build directory. It intentionally uses one worker because the desktop and mobile projects share the isolated fixture. Set `PORT` or `PLAYWRIGHT_DATABASE_PATH` only when a controlled test environment requires an override. Four desktop cases are skipped because their cook-mode acceptance is deliberately phone-only. HTML reports are written to the ignored `playwright-report/` directory.

Current verified baseline: 18 test files / 187 Vitest tests, a warning-free production build, and 10 passing Playwright cases across desktop/mobile with 2 intentional desktop skips.

## Runtime checks

- `GET /api/health` returns `200` with the latest applied migration when SQLite is ready.
- A `503` response with `database: not_initialized` means `npm run db:setup` has not completed or the configured database cannot be opened.
- If a demo session redirects back to `/`, confirm the seed exists and that the signed session's user, household, membership, and role still match an active membership.
- If webpage or YouTube import fails, read the surfaced warning and use manual entry. The importer rejects private/loopback destinations, redirects outside policy, oversized/slow responses, unsupported media, and sources without trustworthy recipe evidence. When configured, Firecrawl is attempted only after the original URL passes the same public-address policy and direct retrieval or extraction cannot produce a usable recipe. Firecrawl caching is always disabled with `storeInCache:false`; standard accounts remain subject to Firecrawl's provider retention policy. ZDR-capable accounts may explicitly enable `FIRECRAWL_ZERO_DATA_RETENTION=true`. The app never silently retries without ZDR after a rejected ZDR request. Returned URLs and bounded content are revalidated before extraction. Allrecipes and other blocking/unsupported sources may still require manual entry.
- YouTube watch, share, and Shorts links use Firecrawl's transcript markdown and do not need a YouTube Data API key. Missing captions/transcripts fail safely to manual entry. The app does not use Pick-a-Recipe code, `yt-dlp`, browser cookies, or downloaded/cached audio or video.
- AI extraction makes one bounded Responses API call with `store: false`. The submitted bounded source text still crosses the OpenAI provider boundary and is subject to the deployment's OpenAI data controls and retention terms; `store: false` is not a zero-retention claim. Persisted jobs retain only the reviewed draft and bounded evidence excerpts, never the full page/transcript or raw provider errors.
- If househelp audio is unavailable, use the on-screen audio recovery action and device settings. The local progress queue retries connectivity failures but deliberately retains rejected mutations for safe recovery instead of silently discarding them.
- If production startup reports `SESSION_SECRET is required in production`, provide a secret through the hosting platform's secret manager; do not add a fallback to source control.

## Deployment and rollback

Verified `main` is pushed to the private GitHub repository, but no deployment target is approved or connected. Before deployment, complete real-device/assistive-technology validation, select a persistent production datastore, replace local demo authentication with the approved identity flow, configure encrypted secrets, exercise migrations against a backup, and document platform-specific health, deployment, and rollback commands here. A default Vercel deployment would not make the current app functional: local SQLite is not a durable production datastore and the development-only demo session endpoint is disabled when `NODE_ENV=production`.

## Planning verification

- Confirm every screen ID referenced in a workflow exists in `docs/PRODUCT-PLAN.md`.
- Confirm wireframes cover the core homeowner import/review/assign/shop loop and househelp prepare/cook loop.
- Confirm provider-dependent behavior is labeled as discovery or fallback rather than guaranteed.
- Confirm the househelp flow includes first-tap audio activation, active assignments plus current published household recipes, an assignment-free `Cook now` path, spoken labels/results, automatic next-step speech, replay, language change, offline readiness, a recoverable audio-failure path, local-only previous-step review, and a `Cooking menu` escape that works while completion speech is stalled.
- Confirm every househelp visual is purposeful, verified, accessible, rights-aware, and safely replaceable by spoken guidance if unavailable.
- Confirm current facts live in `STATE`, completed work in `HISTORY`, decisions in `DECISIONS`, and durable gotchas in `MEMORY`.

Planning checks remain required when product documents change. Application checks above are required when runtime code changes.
