# Current State

Updated: 2026-08-30

## Current milestone

Milestones 1 and 2, English-first automatic Hindi, the househelp cooking-menu/one-time-language repair, speech-failure navigation fixes, and uncapped homeowner-authored text are integrated, verified, pushed, and deployed as a public preview.

## Integrated task branches and worktrees

- Coordinator base: `main` at `/Users/yashmac16/Documents/ChatGPT/Recipe App`
- Visible homeowner task `01a05153-f4d3-7091-87f6-bc55eb1a29b0`, branch `feature/homeowner-recipe-flow`, at `/Users/yashmac16/.codex/worktrees/d50a/Recipe App`
- Visible import task `01a05153-f172-7252-8c79-bea624f25d53`, branch `feature/web-recipe-import`, at `/Users/yashmac16/.codex/worktrees/1283/Recipe App`
- Visible househelp task `01a05153-f6f9-71c0-9997-699f2235d8ac`, branch `feature/househelp-cook-mode`, at `/Users/yashmac16/.codex/worktrees/85f5/Recipe App`
- Visible acceptance-review task `01a05154-027f-7cc2-a232-a7dedd36ac8c`, branch `review/milestone-1-acceptance`, at `/Users/yashmac16/.codex/worktrees/840f/Recipe App`
- Completed Milestone 2 worker `/root/broad_source_import`, branch `feature/broad-source-import`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-broad-source-import`; reviewed commits were integrated as `31ebe0c`, `d2ff144`, `9e845e3`, and `6322476` after explicit authorization.
- Completed English-first authoring worker, branch `feature/automatic-hindi-translation`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-auto-hindi`; reviewed commit `3c370bc` was integrated to `main` as `5bbcf93` after explicit authorization.
- Completed househelp-flow repair, branch `fix/househelp-main-menu-flow`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-househelp-flow-fix`; commits `1b95369`, `fac34a2`, `37a703b`, and `a477a13` are included in the authorized local merge.
- Completed no-character-limit worker, branch `fix/remove-recipe-char-limits`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-no-char-limit`; reviewed commit `8134c53` was integrated to `main` as `a80e6d8` after the live speech-failure fixes.

All accepted Milestone 1, Milestone 2, automatic-Hindi, househelp-flow, speech-failure, and authored-text work is integrated on `main`. Worktrees are retained for review history; there is no active implementation worker.

## Working behavior

- The Node 24/Next.js 16 foundation now has seven deterministic SQLite migrations, signed development/preview role sessions, server-side household policy, seed, and test harness.
- A homeowner can author and review recipe guidance and assignment notes in English; blank Hindi values are generated server-side, optional Hindi overrides are preserved, and publication/assignment still pin complete immutable bilingual snapshots.
- Homeowner-authored titles, ingredient guidance, cooking instructions, spoken text, and assignment notes have no per-field character cap. Required/nonblank checks, list counts, request/provider byte bounds, timeouts, identifiers, and numeric rules remain enforced.
- A househelp hears and browses active assignments and current published household recipes one at a time. They can choose/resume assigned work or use `Cook now` after an in-person request, review earlier steps locally, and return to the menu explicitly or after `Done`.
- Failed activation speech no longer traps `Resume` or `Cook now`; navigation continues unless speech was deliberately dropped as stale.
- Spoken-language confirmation occurs once per device. The selected locale is reused when entering a task, resuming after reload, and returning after completion; language selection reappears only through the explicit change control.
- Visuals are deliberately light: bundled focal state/action illustrations have accessible equivalents, while spoken guidance remains authoritative.
- Combined verification passes lint, strict TypeScript, 22 files / 220 tests, and the production build. Playwright passes 17 desktop/mobile cases with 5 intentional skips, including uncapped publish/assignment text, speech-failure navigation, automatic Hindi, menu browsing, assignment-free cooking, role denials, active-task escape, stalled completion speech, and offline progress behavior.
- The exact Pinch-of-Yum page succeeds through both repaired direct fetch and forced Firecrawl fallback with deterministic extraction (12 ingredients, 7 steps). A live captioned YouTube recipe succeeds through Firecrawl transcript retrieval and OpenAI evidence extraction as `partial_success` (3 evidenced ingredients, 12 steps, language recorded, no timestamps fabricated). Credentials and raw source/transcript text were not printed or persisted by the smoke harness.
- The private GitHub repository is `https://github.com/yashrathi/recipeapp.git` with default branch `main`; combined application release `a80e6d8` is pushed and deployed at `https://ghormai.everythingweb.in` from `/opt/ghormai/releases/a80e6d83939f` on the Linode target.

## Blockers

- No Milestone 2 implementation or live-provider blocker remains.
- The Linode deployment is a protected public preview with seeded demo roles and a persistent SQLite file, not an approved production identity/datastore architecture.
- Official Swiggy or alternative grocery-provider API/partnership capability remains unverified and out of scope.

## Risks

- Extraction quality and source/platform permissions.
- English/Hindi wording and pronunciation, kitchen audibility, first-tap audio, TalkBack/VoiceOver behavior, vibration/alarms, and offline/background behavior still need real Android/iOS validation and low-literacy user sessions.
- Automatic Hindi translation quality, culinary terminology, names, quantities, and pronunciation still require bilingual human pilot validation; provider failure must continue to leave publication/assignment incomplete.
- Webpage parsing is deliberately bounded and deterministic; wider public-site coverage and source terms still require discovery.
- Firecrawl does not guarantee access to every domain. Allrecipes currently blocks or restricts automated access, so the product must surface manual entry rather than bypass site controls.
- Public YouTube pages do not always expose a usable transcript, and Firecrawl transcript output may omit timestamps or language metadata. The importer must preserve that uncertainty.
- Standard Firecrawl paid plans may reject `zeroDataRetention:true`; caching remains disabled, ZDR is explicit opt-in for capable accounts, and public source content remains subject to standard provider retention otherwise.
- The measured live Firecrawl-to-OpenAI YouTube path took roughly 42–52 seconds. The current bounded synchronous implementation uses a 60-second OpenAI limit, so production request ceilings need headroom or a later background-job slice.
- Bundled illustrations have safe fallbacks, but any future external recipe imagery needs explicit rights and content review.
- Grocery catalog matching and checkout scope depend on provider access.

## Immediate next step

Validate real-device househelp sessions and select an approved production identity/datastore approach before treating the public preview as a production launch.
