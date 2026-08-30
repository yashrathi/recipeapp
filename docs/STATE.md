# Current State

Updated: 2026-08-30

## Current milestone

Milestone 2 is integrated and verified locally on `main`: reviewed recipe import now supports wider public webpages through a Firecrawl fallback and public YouTube videos through available transcript evidence plus OpenAI structured extraction. Milestone 1 remains integrated and verified.

## Integrated task branches and worktrees

- Coordinator base: `main` at `/Users/yashmac16/Documents/ChatGPT/Recipe App`
- Visible homeowner task `01a05153-f4d3-7091-87f6-bc55eb1a29b0`, branch `feature/homeowner-recipe-flow`, at `/Users/yashmac16/.codex/worktrees/d50a/Recipe App`
- Visible import task `01a05153-f172-7252-8c79-bea624f25d53`, branch `feature/web-recipe-import`, at `/Users/yashmac16/.codex/worktrees/1283/Recipe App`
- Visible househelp task `01a05153-f6f9-71c0-9997-699f2235d8ac`, branch `feature/househelp-cook-mode`, at `/Users/yashmac16/.codex/worktrees/85f5/Recipe App`
- Visible acceptance-review task `01a05154-027f-7cc2-a232-a7dedd36ac8c`, branch `review/milestone-1-acceptance`, at `/Users/yashmac16/.codex/worktrees/840f/Recipe App`
- Completed Milestone 2 worker `/root/broad_source_import`, branch `feature/broad-source-import`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-broad-source-import`; reviewed commits were integrated as `31ebe0c`, `d2ff144`, `9e845e3`, and `6322476` after explicit authorization.

- Active househelp-flow repair: branch `fix/househelp-main-menu-flow`, at `/Users/yashmac16/Documents/ChatGPT/Recipe App-househelp-flow-fix`.

All accepted Milestone 1 and Milestone 2 worker commits are cherry-picked to `main`. The househelp-flow repair remains isolated and unmerged pending verification and explicit merge authorization.

## Working behavior

- The Node 24/Next.js 16 foundation, frozen contracts, six deterministic SQLite migrations, signed development-only role sessions, server-side household policy, seed, and test harness are committed on the repair branch.
- A homeowner can import a supported public recipe webpage or public YouTube watch/share/Shorts link, or use manual entry; inspect provider/source evidence and warnings; edit the draft; review exact English/Hindi dish, ingredient, and step speech; publish; and assign a pinned recipe snapshot with optional bilingual notes.
- On `fix/househelp-main-menu-flow`, a househelp hears and browses active assignments and current published household recipes one at a time. They can choose or resume an assigned task, or use `Cook now` after an in-person request to create a bilingual pinned ad-hoc cooking run without homeowner assignment. They can review prior cooking steps without rewinding saved progress and explicitly return to the menu from an active or completed run. `Done` also returns automatically through a bounded fallback when confirmation speech stalls.
- Visuals are deliberately light: bundled focal state/action illustrations have accessible equivalents, while spoken guidance remains authoritative.
- The integrated baseline remains 18 files / 187 tests plus 10 Playwright cases. The repair branch is undergoing regression verification.
- The exact Pinch-of-Yum page succeeds through both repaired direct fetch and forced Firecrawl fallback with deterministic extraction (12 ingredients, 7 steps). A live captioned YouTube recipe succeeds through Firecrawl transcript retrieval and OpenAI evidence extraction as `partial_success` (3 evidenced ingredients, 12 steps, language recorded, no timestamps fabricated). Credentials and raw source/transcript text were not printed or persisted by the smoke harness.
- Verified `main` is pushed to the private GitHub repository `https://github.com/yashrathi/recipeapp.git`; GitHub default branch is `main`.

## Blockers

- No Milestone 2 implementation or live-provider blocker remains.
- Public deployment is not yet configured. The current local SQLite datastore, development-only role session, production-disabled demo login, and absence of a connected hosting target make an immediate production deployment non-functional until a datastore/identity/hosting target is selected.
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

Select a compatible public hosting target, persistent datastore, and production identity approach before deploying. No Vercel/Render/Railway/Fly/Cloudflare link or deployment configuration exists in the repository. Real-device househelp sessions remain required before production launch.
