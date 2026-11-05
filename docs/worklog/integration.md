# Work log: integration (integrator = deputy of the lead)

Owned: src/sim/** (except arts.ts), src/core/**, src/app/**, src/input/** (except touch.ts), src/main.ts, index.html,
tools/** (except tools/bot/hooks/*), tests/sim*.test.ts, tests/data.test.ts, package.json scripts, docs/requests/integration.md.
In other streams' files: only the small wiring edits a request in docs/requests explicitly asks of the integrator/lead/sim.

## Status

| # | Deliverable (per pass) | Status | Files |
|---|---|---|---|
| 1 | Open requests to integrator / lead / sim / app | done (pass #3): act4 #1 (bot approach at sub-scale). act3a and act3b filed no requests; their logs and act4's need no other sim API (addArenaCollider, addFightInteractable, pushPlayer, spawnMinion, hover/flying, set_scale all exist). Pass #2: ui #3, ui #4. Pass #1: act2 #1, ui #2, weapons #2 #5 | tools/bot/bot.ts |
| 2 | Cross-stream health: shared patterns promoted | done (pass #3): `AttackDef.one_blow` (sim) replaces act3b's guardMultiHit (3 bosses, 2 streams, Acts V-VII next); enemy projectile aim/homing at `player.scale` (sim; act4's aimLow workaround); tools/bot/defense.ts (bot defenses 4 streams imported from act1/act2 hook files). Adoption requests: docs/requests/integration.md #3, #5 | src/core/types.ts, tools/schemas.ts, src/sim/actor.ts, src/sim/sim.ts, tools/bot/defense.ts, docs/BOSS_AUTHORING.md |
| 3 | tsc + lint clean in owned files | done (pass #3): tsc 0 errors (whole tree); lint 0 errors, 10 warnings, none in owned files | — |
| 4 | Build + smoke + tests + bot | done (pass #3): build ok, smoke 21 scenes 0 errors, vitest 210/212 (2 strict gates), bot 20/21 (regina_formica in progress, act4) | — |
| 5 | Save compatibility | done (pass #3): a save written by the pre-Act-III build (30fa9fc) imports, continues in the browser and plays through every authored encounter; durable test tests/sim_save_compat.test.ts | tests/sim_save_compat.test.ts |
| 6 | Requests and per-stream fix list | done (pass #3) | this file, docs/requests/integration.md #3-#6 |

## Next (integration pass #4)

1. Re-read docs/requests/*.md; check adoption of integration #3 (one_blow: act3b orso, act4 mantide) and #5 (hooks import
   tools/bot/defense.ts); re-run their bot rows (they should not move).
2. "One blow at a time" across foes (a minion / copy waits while another foe of the fight is in telegraph/active) is now
   hand-written in act3a (loki `canUseAttack` + minion_loki_copy) and act3b (grande_lupo `busy`; lucifero_1's check is
   about itself only): two streams, so not promoted yet. Promote it to a sim helper (e.g. `sim.foeMidBlow(except)` in
   src/sim/behavior.ts) as soon as a third stream (Act V-VII minion bosses) writes it again.
3. Carried from pass #2 (not done this pass): an Art-heavy smoke (equip each Act I/II weapon, fire both Arts with a lock,
   screenshot at the cue time) and `npm run smoke -- --quality=low` / `--quality=high` with calls / tris per zone vs D3.
4. When Act V lands: add a post-Act-IV save fixture next to the pre-Act-III one in tests/sim_save_compat.test.ts.
5. tests/data.test.ts stays strict (final gate).

## Notes

### Pass #3 (2026-11-05)
Changes:
- act4 #1: `Bot.decide` approach range `max(min(0.6, reach * 0.7), reach - 0.6)` (tools/bot/bot.ts): the generic bot now
  closes inside a 0.25 m garden reach; identical for every reach >= 0.86 m.
- `AttackDef.one_blow` (src/core/types.ts, tools/schemas.ts, src/sim/actor.ts `landedOn`): a multi-window attack lands once
  per target (hit / blocked / parried; a dodged window does not count; tick windows unaffected). Same rule as act3b's
  `guardMultiHit`, which grande_lupo, grande_orso and re_mantide (act4 imports it from act3b's file) run every tick; the
  data field is also exact for windows overlapping in one tick. docs/BOSS_AUTHORING.md documents it (example block +
  fairness checklist). Adoption: docs/requests/integration.md #3.
- Enemy projectile aim (src/sim/sim.ts): `aimLift(id)` = `player.scale` for the player, 1 m for actors, used for the pitch
  in `bossSpawn` and for enemy homing (was a fixed +1 m: over the head of the 0.18 m garden player, the knees of the x3
  Gigante Form). Scale 1 unchanged. Homing no longer allocates a target vector per projectile per frame (`homeTgt`
  scratch, also for player-team lock homing). FYI to act4: request #4.
- tools/bot/defense.ts: the Act I / Act II bot defenses moved verbatim (names kept; cerbero's `ringJump` is
  `shockRingJump`). Scratch A/B: cavaliere_errante and cerbero hooks rebuilt on it give identical win/time/hits per seed.
  Adoption: request #5 (act1/act2 re-export, everyone else imports from '../defense').
- Tests: tests/sim_integration.test.ts +2 (one_blow: two windows land twice without the field, once with it; aimLift
  scales with the player); new tests/sim_save_compat.test.ts (the pre-Act-III save code embedded as a fixture).
- Requests filed: integration.md #3 (act3b, act4: one_blow), #4 (act4 FYI: aim), #5 (act1-act4: bot defenses), #6
  (render-kit: follow camera at player scale 0.1).

Verification:
- `npx tsc --noEmit -p tsconfig.json`: 0 errors. `npm run lint`: 0 errors, 10 warnings, none in owned files (weapons
  arts.ts `d` 323; act1 guardiano_del_regno/model.ts `profile`; render-kit FxRenderer.ts `oy`, kit/model.ts `n`; ui altar.ts
  `row`/`toggleCtl`, debug.ts / settings.ts `toggleCtl`, editor.ts `id`; tests/render_anim.test.ts `c`).
- `SM_PARTIAL=1 npm run build`: ok (21 bosses, 38 weapons, 38 movesets, 49 transitions, 7 forms, 34 zones, 37 arenas,
  42 altars, 46 sequences, 1209 it / 1209 en strings; partial warnings = not-yet-authored Act III-B/IV-VII bosses);
  gen-sw 33 files (2.6 MB).
- `npm run smoke`: 21 scenes, 0 console errors (1280x576 medium, SwiftShader 10-12 fps, 40-96 calls, 78k-290k tris;
  vetta_attesa 92 calls / 239k, down from 182 / 402k thanks to render-kit's probe fix). Screenshots read: all new
  encounters start with their boss card and bar; gigante, yeti, guardiano rocca, loki, lupo, orso, mantide, coleottero and
  regina still draw as generic figures (no model builders yet: their item 14); bocca_vulcano / corona_bianca / rocca_brina /
  taiga are scaffold plains (item 16); in the Little Garden the 0.1-scale player is under the boss bar (coleottero, regina)
  or hidden (mantide): request #6 (render-kit).
- `npx vitest run`: 210/212 after the new tests (207/209 in the full run before them); the 2 failures are the strict final
  gates in tests/data.test.ts (strict data build 56 errors, down from 81: references to not-yet-authored content; canon
  audit 76 mismatches, up from 68: more authored bosses without model builders / music themes).
- `npx tsx tools/balance-bot.ts --seeds=3`: 20/21 PASS. perfect avg s / hits | sloppy wins: guardiano 77 / 0.0 | 2/3,
  cavaliere 110 / 0.3 | 2/3, elder_tree 95 / 2.3 | 1/3, palude 149 / 0.7 | 0/3, devourer 220 / 3.3 (target 240) | 0/3,
  caronte 181 / 1.3, cerbero 134 / 0.7, pyro 144 / 4.3, thunder 160 / 4.0, ice 173 / 6.3, magma 185 / 7.3 (all sloppy 0/3),
  lucifero_1 scripted 122 / 3.3 (sloppy 3/3 by design), gigante 191 / 1.7, yeti 203 / 3.0, guardiano rocca 225 / 1.3,
  loki 275 / 4.3, grande_lupo 254 / 5.7, grande_orso 206 / 3.3, re_mantide 255 / 0.3 (target 380), coleottero 331 / 0.0
  (target 400) (all sloppy 0/3). FAIL regina_formica: perfect 3/3 but 845 s avg (target 400), 5.3 hits; act4 is authoring
  it right now (files modified on disk). A/B (perfect, 3 seeds) with the old aim and/or the old approach range: regina
  774-921 s in every configuration, so not caused by this pass; re_mantide 239 -> 255 s and coleottero 313 -> 331 s move
  within seed noise, still far inside target. Acts I-III identical to pass #2 / their streams' logs.
- Save compatibility: archived the pre-Act-III tree read-only (`git archive 30fa9fc` into the scratchpad) and played a new
  game there through the Guardiano del Regno and the Cavaliere Errante; its save (JSON + SM1 code) in the current build:
  `deserialize` == `importCode`; loads at altare_vetta_01 (vetta_attesa); headless it then plays every authored encounter
  in story order through Act IV (elder_tree ... regina_formica, garden scale 0.1, forms + Specchio, 21 weapons) and
  round-trips; in the browser `importSave` -> reload -> `continueGame(1)` -> game mode at vetta_attesa -> elder_tree fight in
  foresta_oscura, 0 console errors. Durable gate: tests/sim_save_compat.test.ts.

Open problems / what each stream must fix:
- act4: regina_formica perfect bot 845 s vs 400 s target (FAIL); adopt integration #3 (one_blow on cross_slash,
  ambush_cross, ng_green_ambush) and #5; with render-kit check camera framing at 0.1 scale (#6); `gardenOffense` optional now.
- act3b: adopt #3 (grande_orso standing_swipe; drop guardMultiHit once re_mantide no longer imports it) and #5; sciamano,
  grande_aquila_reale, drago_di_fuoco, kraken still missing; lupo 5.7 perfect hits.
- act3a: adopt #5; models, arena dressing, zone dressing (smoke shows generic figures on scaffold plains), reperti.
- act2: #5 (cerbero.ts re-exports from tools/bot/defense.ts); remaining models (pyro, thunder, ice, magma, lucifero_1).
- act1: #5 (cavaliere_errante.ts re-exports); devourer 220 s vs 240 s target.
- render-kit: #6 follow camera at player scale 0.1.
- weapons: arts.ts lint warning (`d`, line 323).
- ui: 5 unused-import/variable lint warnings (altar, debug, settings, editor).
- audio / forms: music themes for authored bosses, Form dioramas (canon audit).

### Pass #2 (2026-11-04)
Changes:
- ui #3, Aim assist: `SimSettings.aimAssist` (Sim default true). Gates the three unlocked aim paths only: the 35-degree cone
  search in `Sim.firePlayerProjectile` (no aim -> no homing), the soft turn in `Player.faceForAction`, and the Arts fallback
  target in src/sim/arts.ts (weapons file, the one line the request names; off -> 8 m ahead). A lock always aims.
  `Game.applySettings` and `Game.makeSim` copy it; old saved settings without the key get the default (loadSettings merges).
  Not gated on purpose: chain lightning's first link (searches all around, an effect), `pullEnemyToward` / `applyDotToTarget`
  fallbacks (they receive the Art's target, which is already -1 without assist, and then pick the nearest foe in range).
  The balance bot always locks, so its numbers are unchanged.
- ui #4, Specchio dei Ricordi in NG+ (Bible: "replay any defeated boss"): `everDefeated` in src/sim/gamestate.ts (`defeated`
  or carried `todDefeats`), used by `Sim.startMemoryFight` and src/ui/altar.ts `memoryBosses` (the request's one-line
  change; altar's other two `isDefeated` uses stay per-cycle). Memory wins still never mark the boss defeated this cycle.
- tools/smoke.ts: `sample()` waits for `renderer.world.busy` to clear (up to 30 s; build time logged as `buildMs`), then
  2.5 s, then until `resScale` has held for 1.2 s. Under CPU load (vitest in parallel) the fixed 2.5 s caught vetta_attesa
  mid-build (~10 s under SwiftShader). A second blank had a different cause (render-kit, below).
- Found: `Renderer.render` calls `adapt()` -> `resize()` -> `gl.setSize()` after drawing, which clears the canvas before it is
  composited: one blank frame per dynamic-resolution step (on a phone, a black flash; near the budget it can oscillate).
  Verified with forced steps + rapid screenshots (2/24 blank). Request with diff: docs/requests/integration.md #2
  (render-kit).
- src/app/Game.ts `onZoneEnter`: a `zoneEnter` that arrives while a build is running was dropped, so `setLoading(false)` and
  the camera snap ran when the superseded job resolved, while the newer zone was still building. Now it keeps awaiting
  `world.loadZone(sim)` while `world.busy` (bounded), then snaps.
- tools/build-data.ts: removed the unused `loadArrayFile` (last lint warning in owned files).
- Tests (tests/sim_integration.test.ts, now 8): aim assist on turns an unlocked light attack to a foe 30 degrees aside, off
  keeps the yaw; NG+ Specchio replays a previous-cycle boss, refuses a never-defeated one, and a memory win leaves the
  cycle's `defeated` untouched.

Verification:
- `npx tsc --noEmit -p tsconfig.json`: 0 errors. `npm run lint`: 0 errors, 12 warnings, none in owned files (arts.ts `d`
  line 323 = weapons; guardiano model.ts `profile`, castle_gate.ts `THREE`, FxRenderer.ts `oy`, kit/model.ts `n`,
  weapons/fx.ts `sim`, world/cover.ts `GLSL_ATMOS_VERT`, ui altar/debug/settings/editor unused imports).
- `SM_PARTIAL=1 npm run build`: ok (12 bosses, 38 weapons, 38 movesets, 49 transitions, 7 forms, 34 zones, 37 arenas,
  42 altars, 26 sequences, 1089 it / 1089 en strings); gen-sw 25 files precached (2.4 MB).
- `npx vitest run`: 148/150; the 2 failures are the strict final gates in tests/data.test.ts (strict data build 81 errors,
  all references to not-yet-authored content; canon audit 68 mismatches: 26 missing encounters, music themes and boss
  models for authored bosses, 7 Form dioramas, 6 canonical quotes, the Rituale delle Due Metà, later bosses' rules).
- `npx tsx tools/balance-bot.ts --seeds=3`: 12/12 PASS, identical to pass #1 (perfect avg s / hits: guardiano 77 / 0.0,
  cavaliere 110 / 0.3, elder_tree 95 / 2.3, palude 149 / 0.7, devourer 220 / 3.3 (target 240), caronte 181 / 1.3,
  cerbero 134 / 0.7, pyro 144 / 4.3, thunder 160 / 4.0, ice 173 / 6.3, magma 185 / 7.3, lucifero_1 scripted 3/3).
  Sloppy wins only guardiano 2/3 and cavaliere 2/3 (D2/D3 openers), elder_tree 1/3.
- `npm run smoke` (final run, after the smoke.ts and Game.ts changes): 12 scenes, 0 console errors, no blank frame
  (1280x576 medium, SwiftShader 10-15 fps, 61-173 draw calls, 108k-315k tris; vetta_attesa reads 106 or 182 calls /
  236k or 402k tris depending on the frame). Screenshots read: boss_05 / 07 / 08 no longer show the palude caption and no
  act card covers a boss card (ui request #1 verified). Two earlier runs this pass had blank boss_01 / boss_02 frames: first
  a mid-build sample under CPU load, then the render-kit resize clear (above). Palude and Devourer start submerged, so their
  boss bar is hidden by design (`!b.hidden`). Bosses without a model builder (elder tree, palude, devourer, caronte, all of
  Act II) still draw as small generic figures; the Portatore reads as a black slab from behind.

Open problems / what each stream must fix:
- render-kit: docs/requests/integration.md #2 (defer the dynamic-resolution resize to the next frame: flicker on device);
  weapons #7 (polearm clips); world #1 PCFShadowMap is applied in Renderer.ts but not marked done there. The Portatore reads
  as a flat black slab from the follow camera in every shot (cloak silhouette, no rim light / material break-up).
- world: vetta_attesa Medium over budget (182 calls / 402k tris, ~10 s build under SwiftShader; world Next 1); the same
  static shot alternates 106 / 182 calls frame to frame.
- weapons: arts.ts lint warning (`d` unused, line 323); weapons#1 Next (Art VFX legibility in daylight, Act II-VII templates).
- act1: models still missing for elder_tree, mostro_della_palude, great_devourer, caronte (generic figures in smoke; canon
  audit); devourer perfect 220 s vs 240 s target.
- act2: models for cerbero, pyro, thunder, ice, mostro_di_magma, lucifero_1; ice 6.3 / magma 7.3 perfect hits.
- audio: music themes for all authored bosses (canon audit); ui request #1 (`titoli` cue in credits mode) still open.
- forms: the 7 Form dioramas (src/content/forms/<id>/environment.ts).
- ui: nothing new; uses `everDefeated` now in altar.ts (my wiring edit per request #4).

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
