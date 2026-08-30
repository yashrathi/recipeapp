# Durable Memory

- The repository was already an empty Git repository on 2026-08-30; no Git initialization was performed.
- Git remote `origin` is `https://github.com/yashrathi/recipeapp.git`. Nothing has been pushed.
- The initial user request is planning and wireframing only. Do not infer approval to implement.
- Swiggy cart, pricing, checkout, or delivery-tracking access is not known. Validate official partner/API access before committing scope or architecture.
- Preserve source attribution, extraction evidence, and per-field uncertainty. Never fabricate a recipe when a transcript or page cannot be processed.
- Separate canonical recipe versions from cooking-session progress and translations.
- The househelp experience is audio-first and must not require reading. Every activated control speaks its label; each new ingredient or step speaks automatically.
- Spoken language is chosen through audio samples during setup and can be changed from every househelp screen.
- Design first-time setup around one obvious initial tap before speech, because web audio behavior can vary by device/browser.
- Househelp screens use one verified focal visual at a time. Audio remains authoritative; visuals confirm meaning and never replace it.
- Use attributed official YouTube playback at a timestamp rather than downloading or repackaging step clips.
- Accessibility references checked 2026-08-30: [W3C Audio Control](https://www.w3.org/WAI/WCAG22/Understanding/audio-control) recommends user-initiated audio and requires a stop/pause or independent volume mechanism for longer automatic audio; [W3C Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) requires equivalent alternatives for meaningful visuals.
- YouTube policy reference checked 2026-08-30: [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide) require the standard attributed playback experience and prohibit downloading or separating video/audio outside supported behavior.
- Milestone 1 runtime is Node 24 with Next.js 16.3.3/React 19.2.8. Read the generated Next guidance in `AGENTS.md` and relevant local docs under `node_modules/next/dist/docs/` before changing framework code.
- SQLite/Drizzle and signed demo role sessions are local foundation choices, not approved production datastore/identity decisions. Production demo auth is disabled.
- Extracted quantities are stored as validated lossless JSON; legacy nullable numeric columns exist only for forward local migration compatibility and are not authoritative.
- Launch languages, dialect/pronunciation needs, phone ownership, kitchen noise, speaker audibility, and connectivity still need real-user validation.
