# Current State

Updated: 2026-08-30

## Current milestone

Milestone 2 is approved and in implementation: broaden the reviewed recipe-import workflow to more public webpages through a Firecrawl fallback and to public YouTube videos through available transcript evidence plus OpenAI structured extraction. Milestone 1 remains integrated and verified locally on `main`.

## Integrated task branches and worktrees

- Coordinator base: `main` at `/Users/yashmac16/Documents/ChatGPT/Recipe App`
- Visible homeowner task `01a05153-f4d3-7091-87f6-bc55eb1a29b0`, branch `feature/homeowner-recipe-flow`, at `/Users/yashmac16/.codex/worktrees/d50a/Recipe App`
- Visible import task `01a05153-f172-7252-8c79-bea624f25d53`, branch `feature/web-recipe-import`, at `/Users/yashmac16/.codex/worktrees/1283/Recipe App`
- Visible househelp task `01a05153-f6f9-71c0-9997-699f2235d8ac`, branch `feature/househelp-cook-mode`, at `/Users/yashmac16/.codex/worktrees/85f5/Recipe App`
- Visible acceptance-review task `01a05154-027f-7cc2-a232-a7dedd36ac8c`, branch `review/milestone-1-acceptance`, at `/Users/yashmac16/.codex/worktrees/840f/Recipe App`
- Completed Milestone 2 worker `/root/broad_source_import`, branch `feature/broad-source-import`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-broad-source-import`; commits `48ad00d` (safe Firecrawl webpage fallback), `dbe45a9` (OpenAI/YouTube transcript import), `2482838` (standard-plan Firecrawl retention configuration), and `099be1b` (verified OpenAI timeout) await integration authorization.

All Milestone 1 worker commits are cherry-picked to `main`. Those worktrees are retained only for review history. The Milestone 2 worker output must not be merged without explicit authorization.

## Working behavior

- The Node 24/Next.js 16 foundation, frozen contracts, five deterministic SQLite migrations, signed development-only role sessions, server-side household policy, seed, and test harness are committed.
- A homeowner can import a supported public recipe webpage or use manual entry, inspect source evidence/warnings, edit the draft, review exact English/Hindi dish, ingredient, and step speech, publish, and assign a pinned recipe snapshot with optional bilingual notes.
- A househelp sees only their next assigned task and can use English/Hindi audio setup, one-at-a-time ingredient checks, automatically spoken steps, Repeat/Stop/Help/language controls, timers, resume, issue reporting, and completion on a narrow phone. Progress is persisted server-side and mirrored in a bounded local retry queue for intermittent connectivity.
- Visuals are deliberately light: bundled focal state/action illustrations have accessible equivalents, while spoken guidance remains authoritative.
- `npm run verify` passes lint, strict TypeScript, 135 unit/integration tests, and the production build. Playwright passes 10 desktop/mobile flows with 2 intentional desktop skips for phone-only cook-mode cases. Production smoke checks return `200` for landing/health and `404` for the demo-session endpoint.
- On the unmerged Milestone 2 worker branch, coordinator verification passes 18 files / 187 tests and the production build; worker Playwright verification passes 10 flows with 2 intentional desktop skips. The exact Pinch-of-Yum page succeeds through both repaired direct fetch and forced Firecrawl fallback with deterministic extraction (12 ingredients, 7 steps). A live captioned YouTube recipe succeeds through Firecrawl transcript retrieval and OpenAI evidence extraction as `partial_success` (3 evidenced ingredients, 12 steps, language recorded, no timestamps fabricated). Credentials and raw source/transcript text were not printed or persisted by the smoke harness.
- Git remote `origin` points to `https://github.com/yashrathi/recipeapp.git`; the remote currently has no branches and nothing has been pushed.

## Blockers

- No implementation or live-provider blocker remains on the worker branch. Integration into `main` still requires explicit merge authorization under the project operating guide.
- Official Swiggy or alternative grocery-provider API/partnership capability remains unverified and out of scope.

## Risks

- Extraction quality and source/platform permissions.
- English/Hindi wording and pronunciation, kitchen audibility, first-tap audio, TalkBack/VoiceOver behavior, vibration/alarms, and offline/background behavior still need real Android/iOS validation and low-literacy user sessions.
- Webpage parsing is deliberately bounded and deterministic; wider public-site coverage and source terms still require discovery.
- Firecrawl does not guarantee access to every domain. Allrecipes currently blocks or restricts automated access, so the product must surface manual entry rather than bypass site controls.
- Public YouTube pages do not always expose a usable transcript, and Firecrawl transcript output may omit timestamps or language metadata. The importer must preserve that uncertainty.
- Standard Firecrawl paid plans may reject `zeroDataRetention:true`; caching remains disabled, ZDR is explicit opt-in for capable accounts, and public source content remains subject to standard provider retention otherwise.
- The measured live Firecrawl-to-OpenAI YouTube path took roughly 42–52 seconds. The current bounded synchronous implementation uses a 60-second OpenAI limit, so production request ceilings need headroom or a later background-job slice.
- Bundled illustrations have safe fallbacks, but any future external recipe imagery needs explicit rights and content review.
- Grocery catalog matching and checkout scope depend on provider access.

## Immediate next step

Request explicit authorization before integrating `48ad00d`, `dbe45a9`, `2482838`, and `099be1b` into `main`, then rerun the full verification suite on the integrated tree. Real-device househelp sessions remain required before production selection.
