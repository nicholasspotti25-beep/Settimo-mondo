# Work log: integration (integrator = deputy of the lead)

Owned: src/sim/** (except arts.ts), src/core/**, src/app/**, src/input/** (except touch.ts), src/main.ts, index.html,
tools/** (except tools/bot/hooks/*), tests/sim*.test.ts, tests/data.test.ts, package.json scripts, docs/requests/integration.md.
In other streams' files: only the small wiring edits a request in docs/requests explicitly asks of the integrator/lead/sim.

## Status

| # | Deliverable (per pass) | Status | Files |
|---|---|---|---|
| 1 | Open requests to integrator / lead / sim | done (pass #1): act2 #1, ui #2, weapons #2 #5 (+ #1 #6 found already applied) | src/sim/sim.ts, src/sim/pools.ts, src/sim/actor.ts, src/sim/types.ts, src/render/Renderer.ts (wiring) |
| 2 | Smoke-screenshot bug: captions / cards surviving a fight or zone change | sim side done; ui side requested (docs/requests/integration.md #1) | src/sim/sim.ts, tools/bot/bot.ts |
| 3 | tsc + lint clean in owned files | done: tsc 0 errors (whole tree); lint 0 errors, own warnings fixed except 2 (arts.ts belongs to weapons; build-data `loadArrayFile` kept) | src/sim/player.ts, src/sim/actor.ts |
| 4 | Build + smoke + tests + bot | done (pass #1): all pass, see Notes | — |
| 5 | Requests and per-stream fix list | done (pass #1) | this file, docs/requests/integration.md |

## Next (integration pass #2)

1. Re-read docs/requests/*.md for new items addressed to the integrator / lead / sim; check that ui applied
   docs/requests/integration.md #1, then re-run `npm run smoke` and look at boss_05..boss_08 (no palude caption, no act card
   over a boss card).
2. Once the weapons stream fills `installWeaponFx` / arts lingering effects: smoke an Art-heavy fight (Innesto seed follows
   its target), check no double drawing of `art_*` vfx (render-kit #3).
3. Consider making tools/smoke.ts sample like real play (a short `seq`/fade wait or a travel between fights) in addition to
   the rapid `startFightDirect` loop, and record the UI timer stall during zone builds.
4. tests/data.test.ts stays strict (it is the final gate and fails until every boss/zone/sequence exists); keep it so.

## Notes

### Pass #1 (2026-11-03)
Changes:
- act2 #1, one blow per spawn: `Hazard.group` (pools.ts) = id of the first hazard placed by a multi-position spawn
  (sim.ts `bossSpawn`). When one resolves against the player (hit/blocked/parried/dodged/absorbed), `spendHazardGroup`
  marks the rest of the spawn spent for its whole life (stronger than the proposed same-frame check: a player knocked from
  one footprint into the next is not hit again, and an overlap gives one perfect dodge, not one per footprint). Separate
  spawns of the same attack (second wave, 2nd lava ring) keep separate groups. dot hazards, static arena hazards and the
  player-team branch are unchanged.
- ui #2: `Actor.forEachActiveShape(fn)` (actor.ts): read-only, allocation-free, mirrors the hit-window test; scratch origin.
- weapons #5: `updateArtEffects(this, dt)` after `updateHazards` in `step()`, `clearArtEffects()` in `clearCombat()`.
- weapons #2: `installWeaponFx(this.fx)` after the FxRenderer is created (src/render/Renderer.ts, render-kit file, wiring
  only; the function is still the weapons stream's empty stub).
- Caption / card bug (goal 2): a fight dropped unfinished (zone change, another fight started: debug teleport, story
  `start_fight_direct`, smoke) now emits `{type:'fightEnd', boss, won:false, abandoned:true}` before the new `zoneEnter` /
  `fightStart` (sim.ts `abandonFight`, `fightClosed` so it is said once; won fights and `end_fight_scripted` are not
  announced twice). The HUD hides the old boss bar and story clears its queue. The bot ignores `abandoned` ends.
  Root cause of the screenshots, which the sim cannot fix alone: story.ts never drops the line on screen (`cur`) on
  fightEnd/respawn/zoneEnter; cards.ts on fightStart hides the zone card but not the act card nor `pendingZone`; and UI
  timers run on the clamped frame dt (0.1 s cap), so the long frame of a zone build eats almost none of a card's time.
  Real-play paths exist: Specchio dei Ricordi (`startMemoryFight` does loadZone + startFight in one tick: act card over the
  boss card when the boss is in another act; the altar's Voce line carries into the memory fight), lines emitted just
  before an exit / fast travel, debug teleport. Request with diff: docs/requests/integration.md #1 (ui).
- Lint: removed unused `shapeHits`/`contact`/`TargetVol` in player.ts and actor.ts, `_sim`/`_dt` unused params.
- New tests: tests/sim_integration.test.ts (5): cluster from one spawn hits once (verified it hits more than once with the
  groups disabled), separate spawns stay separate, forEachActiveShape only during live windows, abandoned fightEnd order
  and once-only, won fight not re-announced.

Verification:
- `npx tsc --noEmit -p tsconfig.json`: 0 errors. `npm run lint`: 0 errors, 12 warnings before -> 10 (remaining: other streams'
  files + arts.ts `d` + build-data `loadArrayFile`).
- `SM_PARTIAL=1 npm run build`: ok (12 bosses, 38 weapons, 38 movesets, 49 transitions, 7 forms, 34 zones, 37 arenas,
  42 altars, 26 sequences, 1074 it / 1074 en strings; warnings = not-yet-authored bosses of later acts). 13 files precached.
- `npm run smoke`: 12 scenes, 0 console errors (1280x576, medium, SwiftShader 10-15 fps, 60-171 draw calls, 106k-321k tris).
  Screenshots read: boss_05 (Great Devourer), boss_07 (Cerbero), boss_08 (Pyro) still show the palude caption and the
  act card over the boss card, as expected until ui applies request #1 (the line was already on screen, `cur`, not queued).
- `npx vitest run`: 111/113 pass; the 2 failures are the strict final gates in tests/data.test.ts (strict data build:
  81 errors, all references to not-yet-authored content; canon audit: missing encounters/themes/models), expected while
  content streams are in flight.
- `npx tsx tools/balance-bot.ts --seeds=3`: 12/12 PASS. perfect avg time / hits: guardiano 77 s / 0.0, cavaliere 110 / 0.3,
  elder_tree 95 / 2.3, palude 149 / 0.7, devourer 220 / 3.3 (target 240: tight), caronte 181 / 1.3, cerbero 134 / 0.7,
  pyro 144 / 4.3, thunder 160 / 4.0, ice 173 / 6.3, magma 185 / 7.3, lucifero_1 scripted 3/3. Sloppy never trivial
  except guardiano (wins 2/3, hits 17.3) and cavaliere (2/3, 12.3), the D2/D3 openers.

Open problems / what each stream must fix:
- ui: docs/requests/integration.md #1 (drop `cur` on fightEnd/respawn/zoneEnter; on fightStart hide the act card and drop
  `pendingZone`; no act/zone card when `sim.fight` is already set at zoneEnter). Then draw melee shapes with
  `forEachActiveShape` in the hitbox overlay (ui worklog Next 5).
- render-kit: weapons #3 (generic vfx fallback must skip `art_*` / `tr_*`), weapons #4 (per-weapon `trail` colors; swing
  trails still missing per the render-kit log). world #1 (PCFShadowMap) is applied in Renderer.ts but not marked done.
- weapons: `installWeaponFx` and `buildWeapon` are still the stubs in src/render/weapons/index.ts; arts.ts lint warning
  (`d` unused, line 323). No weapons work log exists yet (docs/worklog/weapons.md).
- audio: ui request #1 (`titoli` cue in credits mode) still open; canon audit lists missing music themes.
- act1: devourer perfect average 220 s against a 240 s target (little headroom).
- act2: magma 7.3 and ice 6.3 perfect hits (their Next 1 and 3), NG+ ice / cerbero (their Next 2).
