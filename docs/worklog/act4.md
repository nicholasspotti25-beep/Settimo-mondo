# Work log — act4 (ACT IV content, encounters 23–26 + Little Garden, Vite port 5184)

Brief: docs/briefs/act4.md (+ docs/CONTENT_BRIEF.md, docs/BOSS_AUTHORING.md). Bosses in story order: re_mantide (D13),
coleottero_imperiale (D14), regina_formica (D14), uruk (principal, D15). Palette act4_vivid.
Owned: data/bosses/<4>.yaml, data/arenas/{giardino_trifogli,giardino_muschio,giardino_formicaio,serra_giardiniere}.yaml,
data/zones/{little_garden,serra_giardiniere}.yaml (+ their altars, keep ids), src/content/bosses/<4>/**,
src/content/zones/{little_garden,serra_giardiniere}/**, data/story/act4/**, data/speakers/act4.yaml, data/voce/act4.yaml,
data/reperti/act4.yaml, data/projectiles/act4.yaml, data/hazards/act4.yaml, locales/{it,en}/act4_*.yaml,
tools/bot/hooks/<4>.ts, tests/act4*.test.ts, docs/requests/act4.md. Also sequence act4_intro (touching the shore, the
Sguardo del Giardiniere shrinks you).
SCALE: the player is 0.1 (~0.18 m, weapon reach ~0.25 m), moving at 60% (run 3 m/s, dodge 2.5 m, jump apex ~1.9 m,
1.3 s airtime). Bosses 2–6 m in world units; every shape, hurtbox and range below is authored for that.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Boss data, all card elements (phases, attacks with fair telegraphs, parts, minions, music ids, lore, drops_weapon, Form) | partial: re_mantide, coleottero_imperiale done; regina_formica authored (all card elements) but NOT balanced; uruk missing | data/bosses/*.yaml |
| 2 | Behaviors (every card mechanic) | partial (unit-tested for mantide/coleottero): re_mantide camouflage (rustle cue behind you REVEAL_LEAD 1.0 s before he rises → ambush_cross 0.7 s wind-up), combos end when a blow lands (endComboIfLanded), X cuts guarded (guardMultiHit from act3b), study, p2 petals aimed low (aimLow); coleottero front armor ×0.5, mandible grip (1.0 s, crushed once, dropped with i-frames), carapace slam only from the side/back, p2 flight chain, dawn salute; regina_formica worker lines laid across the view through the player (layWave), no blow while a line is coming (waveIncoming), acid aimed low, p2 burrow → hole under you → emerges there (not unit-tested yet); uruk missing | src/content/bosses/{re_mantide,coleottero_imperiale,regina_formica}/behavior.ts |
| 3 | Time-of-day variants | partial: re_mantide alba (curious) / notte (from the leaves); coleottero alba (salutes, grabs less) / notte (charges more); regina alba (tends the eggs: fewer waves, more pulses) / notte (more waves) — regina not probed | boss yamls |
| 4 | NG+ `ng_plus` blocks (new attack per phase) | partial (bot-verified for mantide/coleottero): re_mantide ng_green_ambush / + ng_petal_volley; coleottero ng_double_charge / + ng_take_off → ng_carpet_run; regina ng_twin_wave (two lines 5.5 m apart) / + ng_burrow → ng_tunnel_chain (two holes) — not probed | boss yamls |
| 5 | Story: act4_intro, intro/defeat per boss (Uruk cinematic + Ascesa, set_scale 1.12, verbatim quote) | partial: act4_intro, re_mantide_intro/defeat, coleottero_imperiale_intro/defeat, regina_formica_intro/defeat (mute: captions, cue regina_passage_open, Voce); uruk missing | data/story/act4/*.yaml |
| 6 | Speakers + Voce dell'Alba (4 altars + after-boss) | partial: speakers re_mantide, coleottero_imperiale (the Queen is mute); altar lines for all 4 altars; after-boss mantide, coleottero, regina; uruk missing | data/speakers/act4.yaml, data/voce/act4.yaml |
| 7 | Locales IT+EN (verbatim canon quotes) | partial: every key referenced so far (unit-tested for mantide/coleottero/intro; regina keys written IT+EN, not yet in the test list); Uruk's quote comes with item 1 | locales/{it,en}/act4_{bosses,story}.yaml |
| 8 | Projectile + hazard kinds | partial: projectiles mantide_petal, regina_acid; hazards mantide_petal_fall, coleottero_clod, regina_acid_pool, regina_workers, regina_egg_burst, regina_hole; uruk's missing | data/projectiles/act4.yaml, data/hazards/act4.yaml |
| 9 | Arena data (4, incl. phase variants) | partial: giardino_trifogli, giardino_muschio, giardino_formicaio (soil, 2 root columns, variant tunnels) done; serra_giardiniere scaffold only | data/arenas/*.yaml |
| 10 | Balance bot (perfect wins inside 120+20×D with few hits; sloppy not trivial), incl. NG+ and ToD probes | partial: re_mantide, coleottero_imperiale PASS; regina_formica FAIL (perfect 3/3 but avg 834 s / 400, 5 hits; see Notes) | — |
| 11 | Bot hooks for scripted mechanics | partial: re_mantide (+ shared gardenDecide/gardenOffense), coleottero_imperiale (dive landing spot, flank circling), regina_formica (jumps the worker lines, keeps the jump free while one approaches) | tools/bot/hooks/<id>.ts |
| 12 | Unit tests tests/act4*.test.ts | partial: 13 tests (3 data/locales/intro + 5 mantide + 5 coleottero), 13/13; regina tests missing | tests/act4.test.ts |
| 13 | Canon audit clean for act4 bosses | partial: mantide/coleottero/regina only "no music theme data" (audio stream) and "no model builder" (item 14); uruk missing | — |
| 14 | Boss models (4) | missing (later chunk; RENDER_KIT.md) | src/content/bosses/<id>/model.ts |
| 15 | Arena dressing (4) incl. cues | missing (later chunk; WORLD_KIT.md) | src/content/bosses/<id>/arena.ts |
| 16 | Zones (2): little_garden (giant clovers, moss, flowers, glowing pollen, endless hedge, three gates), serra_giardiniere | partial: scaffold only | data/zones/*.yaml, src/content/zones/<zone>/** |
| 17 | Reperti dei Cercatori, 2–3 per zone, IT+EN | missing | data/reperti/act4.yaml, locales/*/act4_world.yaml |
| 18 | Requests to other streams | 1 open: tools/bot/bot.ts approach distance for sub-scale players (worked around in the hooks) | docs/requests/act4.md |

## Next

1. Regina Formica balance (data, behavior, story, locales, arena, hook exist): perfect bot 834 s / 400. Measured hits:
   mandible_shove (5–8 per fight) and worker lines while she waits. Suspects to check first with the probe: she backs
   away from melee (walk 0.8 → back-off 0.64 m/s) so every swing loses the reach; long dot puddles and lines keep the
   bot's `danger` flag up so gardenOffense does not approach; the shove's lateral-roll geometry vs its 120° r 2.6 arc.
   Likely fixes: a punish window after each acid attack / summon (she plants her legs: recovery ≥ 1.4 s), stop backing
   off during recovery, shove arc 100°, an idle beat after the line passes; then NG+ / ToD probes and unit tests (wave
   laid across the view through the player, low enough to jump: a raised player is not hit; no blow while a line is
   coming; burrow → hidden → hole under the player ≥ 1.0 s → emerges there visible; never stays hidden; dawn/night
   openers) and add regina_formica to the ACT4 test list.
2. Uruk (principal, D15, 3 phases): Potatura (guillotine shears, carnivorous flowers sprouting as minions/hazards, cut
   like a dead branch), Annaffiatoio (watering: flowers grow in real time into barricades and traps via
   sim.addArenaCollider/removeArenaCollider + hazards; enormous drops raining, marked), Erbaccia (arena_state greenhouse
   opened, sky, full size: model scale/flags + larger shapes); intro cinematic with camera shots and dialogue, the verbatim
   quote "Un giardino piccolo non si può perdere.", defeat = Ascesa (camera pull-back, storyEvent set_scale 1.12,
   brightens_sky, unlocks_form gigante, Little Garden revealed as a flowerbed), speaker, Voce, serra_giardiniere arena
   with variants, hook, tests, bot.
3. Reperti dei Cercatori (little_garden 3, serra_giardiniere 2) IT+EN (data/reperti/act4.yaml, locales/*/act4_world.yaml).
4. Boss models (4) and arena dressing (4) with RENDER_KIT / WORLD_KIT; check camera framing at 0.1 scale.
5. Zone dressing little_garden / serra_giardiniere (giant clovers, moss, flowers, glowing pollen, endless hedge, three
   gates; the greenhouse).

## Notes

- Chunk 1 (2026-11-04): log created. Inspection: no act4 files existed (the WIP snapshot d638780 only touched weapons)
  except the scaffolded arenas/zones/altars (ids, centers, gates, altars kept) and canon names in
  locales/*/canon_names.yaml + world_names.yaml (not mine; referenced only).
- Re Mantide (chunk 1). ~4 m mantis (radius 0.7, turn 3.2, quick), equilibrio 150; low hurtboxes on the four walking legs
  and the abdomen tip (the 0.18 m player hits what touches the ground). P1 scythe_slash (→ left 50%), cross_slash (X, two
  windows), combo_a → combo_b → combo_c (tells 0.55/0.42/0.6, thrust knockdown, 1.4 s punish), leap_strike, camouflage →
  ambush_cross, study (opener; no blow). P2 (crown_bloom, mid line): + petal_burst (5-petal fan, gaps), petal_rain (marked
  falls around you + across the meadow, 1.25 s). Shared helpers exported for Act IV: endComboIfLanded, aimLow (the default
  projectile aim is ~1 m above the target: above a 0.18 m player), act4Reveal, spotBehind.
- Bot (seeds=3): PASS perfect 3/3 avg 239 s / 380, 0 hits; sloppy 0/3 (5 hits, boss HP left 0.92). NG+ (2 seeds) won
  274/275 s, 2/0 hits; ToD alba 251 s (1 hit), notte 264 s (1 hit), giorno 258 s (1 hit).
- Bot at 0.1 scale: the generic approach never reaches swing range (request 1); gardenDecide in tools/bot/hooks/re_mantide.ts
  (Act II defenses → generic decision → reach-aware approach/offense, sloppy stays greedy) is shared by the Act IV hooks.
- Probe script (scratchpad, not in tests/): act4/probe.ts `npx tsx <scratchpad>/act4/probe.ts <boss> perfect|sloppy <seeds>
  <ng> <tod|->` (run from the repo root), prints win/time/hits and which attack landed each hit.
- Render side owed (later chunk): re_mantide cues mantide_vanish / mantide_rustle (pos = where he rises) / mantide_reveal,
  mantide_study, mantide_crown_bloom, mantide_gate_open (defeat); flags crown_bloom, studying, curious; anims slash_r,
  slash_l, cross_slash, combo_1, combo_2, thrust, leap, camouflage, study, crown_burst, crown_rain, dash_cut.
- Coleottero Imperiale (chunk 1). ~4.6 m stag beetle (radius 1.3, walk 1.0, turn 1.4: slow, circle him), equilibrio
  200; six low leg hurtboxes + soft abdomen tip behind. P1 mandible_snap, mandible_grab (grab, unblockable), head_charge
  (line fixed), horn_toss (knockback), carapace_slam (only beside/behind; Colpo Rosso; ring born at r0 5 m 0.8 s later,
  jumpable 0.35 m), salute (dawn opener). P2 (wings_open, mid line): + buzz_charge, take_off → bombing_run (5 marked clods
  on a line, 1.0 s) → dive_bomb (hovers 0.9 s tracking, 0.6 s dive, ring, 1.7 s punish). Tuning from the bot: front armor
  ×0.35 made the perfect run 367 s / 400 → ×0.5; equilibrio 230 → 200, take_off cooldown 14 → 16, snap 1.3 → 1.2,
  toss 1.1 → 1.0 (sloppy died to 3 hits in ~15 s).
- Bot (seeds=3): PASS perfect 3/3 avg 313 s / 400, 0 hits; sloppy 0/3 (6 hits, boss HP left 0.98). NG+ (2 seeds, HP ×1.15)
  won 407/417 s, 1/0 hits; ToD alba 363 s (1 hit), notte 339 s (0 hits) (measured before the last tuning step).
- End of chunk 1 verification: `npx tsc --noEmit -p tsconfig.json` 0 errors; eslint clean on all act4 TS files;
  `npx vitest run tests/act4.test.ts` 13/13; `npm run registry && SM_PARTIAL=1 npm run data` ok, the only act4 warnings are
  the scaffolded zones/altars naming regina_formica/uruk (authored next); canon-audit act4: music themes (audio stream),
  model builders (item 14), the two missing encounters.
- Render side owed (later chunk): coleottero cues coleottero_grip / coleottero_release, coleottero_salute,
  coleottero_wings_open, coleottero_take_off, coleottero_dive_mark (pos = player when the dive starts), coleottero_land,
  coleottero_gate_open (defeat); flags gripping, wings_open, flying, chivalrous; anims bite, grab, charge, toss, slam,
  salute, take_off, fly_run, dive.
- Regina Formica (chunk 1, after the usage-limit reset; unbalanced). ~5.5 m ant (radius 1.2, mute), equilibrio 150.
  P1 acid_spit (3-drop fan, aimLow, poison 3 s), acid_arc (marked puddle at your predicted spot + one elsewhere, dot
  2.5 s), worker_wave (5 low boxes 2.4 m wide, 0.36 m high, 3.5 m/s; laid at the rim ≥ 3 m behind you, crossing the view;
  one blow per line), mandible_shove (knockback + skitter back), egg_pulse (marked ring of 6 around her, 1.0 s). P2
  (tunnels, arena_state tunnels): + burrow → tunnel_strike (hole under you 1.1 s; she emerges there, 1.8 s punish).
  Bot runs: first 879 s (keep-away 3.5–7 m), then 834 s after keep-away [1.2, 4.5] / walk 0.8, shove window 0.15 s,
  waves cd 9, equilibrio 150, puddles 2.5 s, perfect hook keeping the jump free; sloppy 0/3. Attribution probe with the
  hazard kinds near the player: <scratchpad>/act4/probe2.ts.
- Render side owed (later chunk): regina cues regina_workers (pos = line center at the rim), regina_dig, regina_emerge,
  regina_tunnels, arena_state:tunnels, regina_passage_open; flags tunnels, tending, eggs_bright; the regina_workers hazard
  is drawn as marching ants (visual shadow for now); anims spit, spit_high, summon, shove, egg_pulse, burrow, emerge.
