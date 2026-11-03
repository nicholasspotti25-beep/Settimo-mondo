# Work log — act2 (ACT II content, encounters 7–12 + Act II zones, Vite port 5182)

Brief: docs/briefs/act2.md (+ docs/CONTENT_BRIEF.md, docs/BOSS_AUTHORING.md). Bosses: cerbero (D7), pyro (D8), thunder (D8),
ice (D9), mostro_di_magma (D9), lucifero_1 (principal, scripted). Palette act2_red_blue_black.
Owned: data/bosses/<6>.yaml, data/arenas/{dite_soglia,roghi_campo,bufera_altura,cocito_lago,fucine_incudini,
cattedrale_navata}.yaml, data/zones/{porta_dite,landa_roghi,bufera_eterna,cocito,fucine_sepolte,cattedrale_caduta}.yaml (+ their
altars, keep ids), src/content/bosses/<6>/**, src/content/zones/<6 zones>/**, data/story/act2/**, data/speakers/act2.yaml,
data/voce/act2.yaml, data/reperti/act2.yaml, data/projectiles/act2.yaml, data/hazards/act2.yaml, locales/{it,en}/act2_*.yaml,
tools/bot/hooks/<6>.ts, tests/act2*.test.ts, docs/requests/act2.md. Also sequence act2_intro.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Boss data, all card elements (6 bosses: phases, attacks, parts, music ids, lore, grants, drops_weapon) | done (authored by an earlier session; balance in item 10) | data/bosses/*.yaml |
| 2 | Behaviors: cerbero per-head anchors + head tell + p2 chains; pyro running fire waves (single/fan/nova) + wreathed; thunder p2 ambient storm strikes; ice spam parry + En Garde + p2 mirrors; magma heart bend + eruption islands/flood + p2 obsidian carapace; lucifero_1 throne, invulnerable, shatter, Il Rifiuto at 118 s | done (not unit-tested yet) | src/content/bosses/*/behavior.ts |
| 3 | Time-of-day variants | done: cerbero notte/alba, pyro notte, thunder notte, ice alba/notte, magma notte | boss yamls |
| 4 | NG+ `ng_plus` blocks (new attack per phase) | done in data (ice/magma distinct per phase; cerbero/pyro/thunder share one NG+ attack in p1+p2); not bot/test verified | boss yamls |
| 5 | Story: act2_intro, intro/defeat per boss, seal captions, lucifero choice (Affronta / Implora hold 5) + lucifero_rifiuto (narrative defeat, wake at altare_scala_01 via teleport_altar = rest) | done | data/story/act2/*.yaml |
| 6 | Speakers (pyro, thunder, ice, lucifero; Cerbero/Magma mute) + Voce dell'Alba (7 altars + after-boss lines) | done | data/speakers/act2.yaml, data/voce/act2.yaml |
| 7 | Locales IT+EN | done for all keys referenced so far (104 keys, script check) | locales/{it,en}/act2_{bosses,story,world}.yaml |
| 8 | Projectile + hazard kinds | done | data/projectiles/act2.yaml, data/hazards/act2.yaml |
| 9 | Arena data (bounds, obstacles, surface, variants, from_phase hazards) | partial: cocito_lago `surface: ice` done (chunk 1); still no anvil obstacles in fucine_incudini, no throne/pillars in the nave, no bones/iron in dite_soglia | data/arenas/*.yaml |
| 10 | Balance bot (perfect wins inside 120+20×D with few hits; sloppy not trivial) | partial: base game ALL 6 PASS (chunk 1, seeds=3): cerbero 134 s/260, 0.7 hits; pyro 144 s/280, 4.3; thunder 160 s/280, 4.0; ice (on ice) 176 s/300, 6.7; magma 185 s/300, 7.3; lucifero_1 scripted 3/3. Left: hit counts of ice/magma; NG+ ice loses (spike lines), NG+ cerbero bite_frenzy | tools/bot/hooks/*, boss yamls |
| 11 | Bot hooks for scripted mechanics | done (chunk 1): all 6; act2Defense = wave roll + Act I helpers (box hazards, charge lines, ring wind-up hold/jump, round-hazard escape) + Act II ring jump; magma hook runs to the basalt crusts | tools/bot/hooks/*.ts |
| 12 | Unit tests tests/act2*.test.ts | missing | tests/act2.test.ts |
| 13 | Canon audit clean for act2 bosses | partial: only "no music theme data" (audio stream) and "no model builder" (item 14) | — |
| 14 | Boss models (6) incl. Lucifero dual look (lucifero_1 seated / lucifero_2 standing via actor.defId), exported for reuse | missing — blocked: docs/RENDER_KIT.md absent | src/content/bosses/<id>/model.ts |
| 15 | Arena dressing (6) incl. cues (head_tell, cerbero_chains_break, dite_gate_open, storm_rain, ice_mirror_*, forge_cools, lucifero_*) | missing — blocked: docs/WORLD_KIT.md absent | src/content/bosses/<id>/arena.ts |
| 16 | Zones (6): terrain, path, colliders, props, landmarks, particles, vistas | partial: scaffold only (terrain/path/altars/exits/1 vista each, no landmarks/props); dressing blocked on WORLD_KIT.md | data/zones/*.yaml, src/content/zones/<zone>/** |
| 17 | Reperti dei Cercatori, 2–3 per zone (12–18), IT+EN | missing | data/reperti/act2.yaml, locales/*/act2_world.yaml |
| 18 | Cathedral seals diegetic (break as each knight falls) | partial: defeat cues seal_broken_* + captions exist; zone/landmark side missing (WORLD_KIT) | data/zones/cattedrale_caduta.yaml |
| 19 | Requests to other streams | 1 open: sim — one hit per attack for hazards of the same spawn (double hits in overlapping lines) | docs/requests/act2.md |

## Next

1. Mostro di Magma hit count (7.3 perfect): lava_wave (2 rings, the 2nd spawns at r0 4.0 = where a player punishing the bent
   heart stands) and fist_slam's magma_crack ring right after the fist. A plain `delay` on those rings made it WORSE (10.0
   hits: the ring then lands inside the punish window while the bot swings) — reverted. Try instead: second lava ring from
   r0 2 with a 0.3 s flash and interval 0.9, or the bot holding swings during a pending ring flash (act1 ringJump only
   holds during wind-ups); re-run bot.
2. NG+ fixes: ice under NG+ LOSES (ice_spike_line 26 hits over 2 seeds: ng_glacial_lunge_2 + ice_spikes lines on the
   sliding ice); cerbero NG+ `bite_frenzy` (3 bites, 12 hits over 2 seeds) needs a readable rhythm / bot handling. Then
   NG+ passes for all 5 + ToD variant passes; consider distinct NG+ attacks for p2 of cerbero/pyro/thunder.
3. Ice base hit count (6.7: cut_sweep/cut_return 10 of 20, frost_ring 4) — check the bot's attack windows vs his idle gap
   and the return-cut timing on ice.
4. Arena data: obstacles (anvils in fucine_incudini, throne + pillars in cattedrale_navata, bones/iron in dite_soglia), p2
   from_phase hazards/variants where the cards want them; re-run bots.
5. tests/act2.test.ts: per-head part attacks + p2 chains, pyro waves, thunder ambient strikes never under the player, ice
   spam parry/En Garde/mirrors, magma islands/flood/carapace/heart + eruption not before 20 s, lucifero
   shatter/invulnerable/Il Rifiuto/both choices, NG+ attacks only at ngCycle ≥ 1, cocito_lago surface ice.
6. Reperti (2–3 per zone, IT+EN) + zone data (landmarks/vistas/props) as far as possible without WORLD_KIT.md.
7. When RENDER_KIT.md / WORLD_KIT.md say STATUS: READY: 6 models (Lucifero dual look, exported), 6 arena dressings, zone
   dressing incl. diegetic seals; screenshots on port 5182 at 1280x576.

## Notes

- Chunk 1 (2026-11-03): log created from inspection. Boss data, behaviors, story, speakers, voce, kinds, IT/EN locales and
  5 bot hooks were already authored by earlier sessions (commits 7cb5217, b7f197e). `npm run registry && SM_PARTIAL=1 npm run
  data` ok, no act2 warnings. Canon audit act2: only music themes + model builders missing.
- Chunk 1 balance. Baseline (seeds=3): cerbero PASS 133 s, 0.7 hits; ice PASS 170 s, 9.0; lucifero_1 PASS; pyro FAIL 2/3,
  7.0; thunder FAIL 0/3, 20.7; magma FAIL 0/3, 13.3. Hit attribution with a scratch script (session scratchpad act2/hits.ts:
  wraps sim.drainEvents, logs the boss attack/stage and enemy hazards/projectiles near the player at each playerHurt).
- Thunder: hits were thunder_mark (the 4th mark lands ON the player; bot mid-swing in the boss's recovery), the overhead's
  thunder_ring (delay 0.3 → ring arrives at the end of the roll out of the hammer: unjumpable) and the p2 storm. Fixes:
  data — overhead_smash ring delay 0.3 → 0.5, thunder_dive ring delay 0.3 → 0.45 (a roll out of the blow ends before the
  ring, then jump it); bot — act2Defense now composes the Act I helpers (exported from tools/bot/hooks/cavaliere_errante.ts:
  boxHazardDodge, chargeDodge, ringJump wind-up hold, hazardEscape) after waveDodge and the Act II ringJump. Thunder seed 0
  went from a loss with 23 hits to a win in 155 s with 3 hits. Pyro also gained from the helpers (fire pillars).
- Mostro di Magma: 7 of 8 hits on seed 0 were the eruption flood (no hook: the bot stood in the magma). New hook
  tools/bot/hooks/mostro_di_magma.ts (run to the nearest basalt crust while bstate.warn/flood, hold still on it; sloppy reacts
  late). Behavior: eruption never before ERUPTION_EARLIEST = 20 s of real fight (bstate.fightT), it was the 2nd attack at 6 s.
- Ice: data/arenas/cocito_lago.yaml `surface: ice` (card: the lake slides; engine support in Player: icy accel 3.2). On ice:
  173/180/177 s, 5/3/12 hits (seed 2 includes a same-frame double hit from two overlapping ice_spike_line footprints →
  request 1 in docs/requests/act2.md).
- After chunk 1 (seeds=3, all PASS): cerbero 134 s/260, 0.7 hits, sloppy 0/3 (10.3 hits); pyro 144 s/280, 4.3, sloppy 0/3
  (7.7); thunder 160 s/280, 4.0, sloppy 0/3 (7.3); ice 176 s/300, 6.7, sloppy 0/3 (15.7); mostro_di_magma 185 s/300, 7.3,
  sloppy 0/3 (8.0); lucifero_1 scripted 3/3 (perfect Affronta → Il Rifiuto at 122 s, sloppy Implora).
- NG+ probe (ngCycle=1, perfect, 2 seeds): cerbero 136/148 s, 5/7 hits (all bite_frenzy); pyro 219/172 s, 5/2; thunder
  173/170 s, 5/3; magma 232/248 s, 7/11; ice LOST both (20/11 hits, ice_spike_line 26) → Next 2.
- End of chunk 1: `npx tsc --noEmit -p tsconfig.json` clean (whole tree); eslint clean on tools/bot/hooks/{cerbero,
  mostro_di_magma}.ts + src/content/bosses/mostro_di_magma/behavior.ts; `npm run registry && SM_PARTIAL=1 npm run data` ok
  (no act2 warnings); tests/data.test.ts strict checks fail only on other streams' missing bosses (same 81 errors as
  before), tests/sim.test.ts passes.
