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
- world#2 done: wash-out fixed (uHazeK on all additive layers, fog-gate wall camera fades), docs/WORLD_KIT.md STATUS: READY, altars/gates/reperti/exits/vistas/particles confirmed; started render-kit#3 (RENDER_KIT.md first, then FxRenderer)
- ui#4 done: collections, NG+ start, credits mode, ending letterbox, debug menu; requests to audio (titoli cue) and sim (attack shapes for hitbox overlay)
- started: act1#3 (arena dressing + models for cavaliere_errante, elder_tree)
- render-kit#3 done: docs/RENDER_KIT.md STATUS: READY, FxRenderer v1 (telegraph decals, shockwaves, projectiles, combat FX, particles), model clips/minion hooks, render_models test
- act1#3 done: Cavaliere Errante model (mounted + dismount, lantern), hit spheres re-aligned, act1_models test; arenas + elder tree next
- deployed (FX v1, haze fix, ui#4, Cavaliere model)
- started: integrate#1 (engine), ui#5 (game)
- integrate#1 done: one-hit-per-spawn hazards, forEachActiveShape, art effect hooks, installWeaponFx wired, abandoned fightEnd; caption/card carry-over -> ui request; build/smoke ok, bot 12/12, tests 111/113 (strict gates)
- started: world#3 (landmarks, Act I zones, vetta arena dressing)
- 2026-11-03 ~23:00 usage limit stopped ui#5 and world#3; 2026-11-04 04:18 both resumed via SendMessage
- ui#5 done: ui brief COMPLETE (portrait hint, tablet HUD, 36px floor, caption/card carry-over fix, melee shapes overlay, docs/UI.md, final pass 5 viewports); next: ui review
- started: ui review (adversarial, read-only; also the newGame-at-load reload flake)
- world#3 done: 6 landmark builders, vetta_attesa + castello_culla authored, guardiano arena dressing, act1_world reperti, sky god-ray fix; open: vetta Medium over budget (258 calls/426k)
- deployed 60dadc8 (world#3 + ui#5 + integration); started render-kit#4 (pose libraries for 7 families)
