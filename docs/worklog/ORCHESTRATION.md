# Orchestration (lead)

The multi-agent Workflow tool is off in this session, so the lead runs streams as background chunk agents (Agent tool,
general-purpose), two at a time — one per lane. Each chunk agent gets the standard chunk prompt: read COMMON.md, the
stream brief (+ CONTENT_BRIEF.md and BOSS_AUTHORING.md for act streams) and docs/worklog/<stream>.md; do the top 1-3 Next
items in ~50-80 tool calls; update the work log; never break the tree; no git; report done/next/blockers.

## Lanes (re-prioritised 2026-11-04: a completable game first, polish second)
- Visual lane (round-robin): render-kit, world, weapons, act1 (models/arenas), act2 (models/arenas), then audio, forms —
  plus an integration pass (requests, wiring, build + smoke) after every 3 chunks of this lane.
- Content lane (round-robin over all five): act3a, act3b, act4, act5, act67 — SIM-SIDE FIRST (boss data, behaviors,
  story, speakers, Voce, locales, bot hooks, balance, tests); their models/arenas come after every encounter is playable.
- ui stream is DONE (reviewed + fixed).
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
- ui review done: 6 major + 10 minor findings (fake aimAssist, blur freeze, title overlap at 667x375, zone+act card overlap, subtitles over menus, tablet thumb reach, ...). Lead fixed: focus -> onForeground (platform.ts), SW offline fallback only for navigations (gen-sw), smoke no longer awaits newGame across evaluate (real flake cause: CDP 'Promise was collected'). TODO integrate#2: SimSettings.aimAssist gating cone search + homing.
- started: ui fix chunk (review findings)
- 2026-11-04 ~05:30 usage limit stopped ui-fix and render-kit#4; 10:18 both resumed
- render-kit#4 done: pose libraries for all 7 remaining families (colossus, serpent, dragon, bird, insect, tree, tentacled), animator globs/bends/radial, keyword side fix, 30 render tests
- lead: engine lane now rotates world, render-kit, weapons (3 active) so weapons is not starved; started weapons#1
- ui fix chunk done: all 6 major + 10 minor review findings fixed; requests ui#3 (aimAssist sim/app) and ui#4 (Specchio in NG+) for integrate#2. ui stream DONE (light re-review at final pass)
- deployed b11aa6e (ui review fixes, pose libraries); started act1#4
- weapons#1 done: work log, buildWeapon (7 dedicated Act I models + 31 category fallbacks), installWeaponFx (trails, art flares, transizione flash), 14 Act I Arts tested, docs/WEAPONS.md DPS table; request #7 polearm poses -> render-kit
- started: integrate#2 (ui#3 aimAssist, ui#4 Specchio NG+, open requests)
- integrate#2 done: aimAssist gating, Specchio NG+ (everDefeated), smoke waits for build + stable resolution, onZoneEnter waits for world build; bot 12/12, tests 148/150 (strict gates)
- lead: applied integration request #2 (resize deferred to next render: no black flash on resolution steps)
- 2026-11-04 ~14:00 usage limit stopped act1#4; 16:18 resumed; started world#4
- act1#4 done: Cavaliere volume pass (surcoat, plate, hood, cloak drape), pianure_erba_alta arena dressing with cues; next Elder Tree
- started: act2#2 (models + arenas, NG+ fixes)
- deployed eed2e8e (weapons#1, integrate#2, flicker fix, act1#4)
- world#4 done: vetta perf (probe pass hides props, off-scene build + precompile, prop variant merge, bigger terrain chunks), paving flush, bridge/walkway/docks builders, grandi_pianure + foresta_oscura authored; request world#2 probe stats -> render-kit
- started: render-kit#5 (player silhouette, polearm poses, probe stats, then HDR)
- act2#2 done: Cerbero model (3 heads, per-head attack glow, chains) + Soglia di Dite arena (Porta di Dite opening); next Pyro
- lead: lanes re-prioritised (content lane = act3a..act67 sim-side first); started act3a#1
- 2026-11-04 ~19:00 usage limit stopped render-kit#5 and act3a#1; 22:18 both resumed
- render-kit#5 done: Portatore readable (hero light, cream tunic, gold-bordered cloak), polearm poses, exposure probe from presented frame (stable stats), weapon trails by weapons stream, stale boss model bug fixed
- started: weapons#2 (daylight Art pass, Act II weapons)
- deployed e51953f (readable Portatore, polearm poses, world#4, cerbero, act3a partial)
- act3a#1 done: all 4 act3a encounters sim-side playable (gigante, yeti, guardiano rocca, loki), 26 tests, bot 4/4 pass; models next
- started: act3b#1 (sim-side)
- act3b#1 done: grande_lupo + grande_orso sim-side playable (14 tests, bot pass incl. NG+/ToD); 4 encounters left
- started: act4#1 (sim-side)
- 2026-11-05 ~01:00 usage limit stopped weapons#2 and act4#1; 04:18 both resumed
- weapons#2 done: daylight Art legibility (dark under-layers, scorch decals, game-time aging fix), 5 Act II weapon models + 10 Art visuals, Art test 24/78, DPS bot check (no nerf)
- started: integrate#3
- act4#1 done: re_mantide + coleottero_imperiale sim-side pass bot; regina_formica playable but fails balance (834 s vs 400); uruk not started; request act4#1 (bot reach at 0.1 scale)
- started: act5#1 (sim-side)
- integrate#3 done: one_blow attack field, projectiles aim at player scale, shared tools/bot/defense.ts, save-compat test; bot 20/21 (regina_formica fail), tests 210/212
- started: act1#5 (Elder Tree model + foresta_cuore arena)
