# Orchestration (lead)

The multi-agent Workflow tool is off in this session, so the lead runs streams as background chunk agents (Agent tool,
general-purpose), two at a time — one per lane. Each chunk agent gets the standard chunk prompt: read COMMON.md, the
stream brief (+ CONTENT_BRIEF.md and BOSS_AUTHORING.md for act streams) and docs/worklog/<stream>.md; do the top 1-3 Next
items in ~50-80 tool calls; update the work log; never break the tree; no git; report done/next/blockers.

## Lanes (priority order; work the first two unfinished streams of a lane round-robin)
- Engine lane: render-kit, world, weapons, audio, forms — plus an integration pass (requests, wiring, build + smoke)
  after every 3 engine chunks.
- Game lane: ui, act1, act2, act3a, act3b, act4, act5, act67.
- A stream whose agent reports its whole brief done gets one adversarial read-only review agent, then a fix chunk.

## Loop
- When a chunk agent finishes: commit + push, then start the next chunk in that lane (keep both lanes busy).
- Every few chunks, and at scheduled check-ins: `SM_PARTIAL=1 npm run build && npm run smoke`; if both pass and the
  screenshots are no worse than the live site, `tools/deploy-pages.sh --partial`.
- A recurring scheduled check-in restarts the lanes after a usage-limit stop.

## Chunk log (lane: stream#n — result)
- engine: world#1 done, render-kit#1 done, world#2 interrupted (partial work on disk)
- game: ui#1 done, act1#1 done, ui#2 done, act1#2 interrupted
- 2026-11-03 17:15 started: render-kit#2 (engine), ui#3 (game)
- ui#3 done: title + slots + import, character creator, settings, touch layout editor (touch-audited at 3 viewports)
- act1#2 started
- render-kit#2 done: Guardiano model, tube winding fix, auto exposure (HDR path built but off), screenPoint/registerShot; request to world re haze
- act1#2 done: 27 act1 tests, double_slam bot fix, NG+/ToD bot passes, devourer hp 4800; models blocked on RENDER_KIT.md/WORLD_KIT.md
- deployed a22cf27+ (ui#3 + render-kit#2); smoke waits 2.5 s for boot (was flaky)
- started: world#2 (haze fix + WORLD_KIT.md first), act2#1 (create work log, sim-side bosses). Next engine: render-kit#3 must publish docs/RENDER_KIT.md (STATUS: READY) first, then integration pass.
- act2#1 done: work log, all 6 act2 encounters pass the bot (thunder ring timing, magma hook + early-eruption guard, ice surface); request to sim: one hit per attack for overlapping same-spawn hazards (integration pass)
- started: ui#4 (collections, credits mode, ending overlay, debug menu)
- 2026-11-03 ~19:00 usage limit stopped ui#4 and world#2 mid-chunk; 22:18 both resumed via SendMessage
