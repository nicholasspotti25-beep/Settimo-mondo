# Work log — act3a (ACT III-A content, encounters 13–16 + zones, Vite port 5183)

Brief: docs/briefs/act3a.md (+ docs/CONTENT_BRIEF.md, docs/BOSS_AUTHORING.md). Bosses: gigante_di_fuoco (D10), yeti (D10),
guardiano_rocca_di_brina (D11), loki (principal, D13). Palette act3_white_azure.
Owned: data/bosses/<4>.yaml, data/arenas/{vulcano_cratere,yeti_caverna,rocca_cancello,rocca_sala_trono}.yaml,
data/zones/{bocca_vulcano,corona_bianca,rocca_brina}.yaml (+ their altars, keep ids), src/content/bosses/<4>/**,
src/content/zones/<3 zones>/**, data/story/act3a/**, data/speakers/act3a.yaml, data/voce/act3a.yaml, data/reperti/act3a.yaml,
data/projectiles/act3a.yaml, data/hazards/act3a.yaml, locales/{it,en}/act3a_*.yaml, tools/bot/hooks/<4>.ts,
tests/act3a*.test.ts, docs/requests/act3a.md. Also sequence act3_intro (up the Scala dei Dannati into white silence).

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Boss data, all card elements (phases, attacks with fair telegraphs, parts, music ids, lore, drops_weapon, Form) | done (chunk 1): gigante_di_fuoco, yeti, guardiano_rocca_di_brina, loki (+ minion loki_copy) | data/bosses/*.yaml |
| 2 | Behaviors (every card mechanic) | done (chunk 1, unit-tested): gigante grab → carry → throw inside the arena (invulnerable flight, one landing hit), head lowered on twin slam / after head charge / Spezzato, front-only blows, stomp under/behind, rim quake after 12 s; yeti blizzard 10 s (unlockable beyond 9 m, storm_rush only in the storm + eyes-glint cue, never before 15 s), painting_guard leap between player and painting (chosen first), p2 fury rhythm (0.15 s gaps, 1.6 s pant every 3rd attack), dawn gaze; guardiano frontal shield x0.12 / light poise x0.35 / heavy full / back x0.55, 3 light blows in 2.5 s → shield_punish, Spezzato = shield down, p2 blades_orbit + bladeAngle; loki casts_shadow + illusionist, copies flagged illusion (one blow shatters, no shadow), opens with the illusions, swap (always moves), one blow at a time (copies vs Loki), p2 mirror_strike (hidden/immune in the glowing exit mirror), p3 mimic_1..3 rebuilt from the player's loadout (buildMimic, fair clamps, every weapon of the game tested), vanish | src/content/bosses/<id>/behavior.ts, src/content/bosses/loki/minion_loki_copy.ts |
| 3 | Time-of-day variants | done: gigante alba (rim gives way more often) / notte (ember breath opener); yeti alba (gazes at the painting) / notte (blizzard opener); guardiano alba (bashes more) / notte (frost opener); loki alba (bow opener) / notte (three copies, one shadow) | boss yamls |
| 4 | NG+ `ng_plus` blocks (new attack per phase) | done (bot-verified): gigante ng_crater_spit / + ng_double_charge; yeti ng_double_leap / + ng_cave_in; guardiano ng_frost_cross / + ng_blade_rain; loki ng_trick_dance / ng_mirror_chain / ng_mimic_chain (rebuilt from the loadout) | boss yamls |
| 5 | Story: act3_intro, intro/defeat per boss (Loki cinematic, laugh `loki_laugh`, brightens_sky, Specchio Form) | done: act3_intro, gigante_intro/defeat, yeti_intro/defeat, guardiano_brina_intro/defeat ("Finalmente" verbatim), loki_intro/defeat (camera shots, 3 intro lines, the two lies at p2/p3, laugh cue, Voce); Form + sky via completeEncounter (unlocks_form, brightens_sky) | data/story/act3a/*.yaml |
| 6 | Speakers + Voce dell'Alba (5 altars + after-boss) | done: speakers gigante_di_fuoco, guardiano_rocca_di_brina, loki (Yeti mute); altar lines for altare_vulcano_01, altare_corona_vista, altare_corona_01, altare_rocca_01, altare_rocca_02; after-boss lines for all four | data/speakers/act3a.yaml, data/voce/act3a.yaml |
| 7 | Locales IT+EN (verbatim canon quotes) | done for every key referenced so far (unit-tested; canon quote "Finalmente" OK); Reperti texts come with item 17 | locales/{it,en}/act3a_{bosses,story}.yaml |
| 8 | Projectile + hazard kinds | done: hazards gigante_brace, gigante_shock, gigante_flare, rim_crack, crater_boulder, yeti_avalanche, brina_line, blade_ring, blade_rain, sala_crollo; projectiles brina_blade, loki_bolt, loki_mimic_shot | data/projectiles/act3a.yaml, data/hazards/act3a.yaml |
| 9 | Arena data | done: vulcano_cratere (surface ice = meltwater glaze, rim_broken r 30→26), yeti_caverna (snow, ceiling 18, painting at center+[0,0,23]), rocca_cancello (snow), rocca_sala_trono (polygon 24-gon r 30 → mirror_maze r 27 + 6 mirror colliders on a 13 m ring → ice_bridges convex bridge 10–18 m x 52 m) | data/arenas/*.yaml |
| 10 | Balance bot (perfect wins inside 120+20×D with few hits; sloppy not trivial), incl. NG+ and ToD probes | done: all 4 PASS (see Notes) | — |
| 11 | Bot hooks for scripted mechanics | done: gigante (breath side-step/roll, head target, shared leaveBurningGround), yeti (leave the painting), guardiano (heavy on the raised shield, back off the cyclone), loki (sloppy cannot read the shadow; perfect holds swings while a copy strikes or a bolt flies) | tools/bot/hooks/*.ts |
| 12 | Unit tests tests/act3a*.test.ts | done for the sim: 26 tests (data/NG+/locales + 6 gigante + 4 yeti + 6 guardiano + 7 loki), 26/26 | tests/act3a.test.ts |
| 13 | Canon audit clean for act3a bosses | partial: only "no music theme data" (audio stream) and "no model builder" (item 14); "Form specchio: no diorama environment" belongs to the Forms owner | — |
| 14 | Boss models (4) + exported yeti painting builder `buildYetiPainting(ctx, {withCompanion})` | missing (next chunk; RENDER_KIT.md is READY) | src/content/bosses/<id>/model.ts, src/content/bosses/yeti/painting.ts |
| 15 | Arena dressing (4) incl. cues | missing (next chunk; WORLD_KIT.md is READY) | src/content/bosses/<id>/arena.ts |
| 16 | Zones (3): terrain, path, colliders, props, landmarks, particles, vistas, auroras at night | partial: scaffold only | data/zones/*.yaml, src/content/zones/<zone>/** |
| 17 | Reperti dei Cercatori, 2–3 per zone (6–9), IT+EN | missing | data/reperti/act3a.yaml, locales/*/act3a_world.yaml |
| 18 | Requests to other streams | none needed so far | docs/requests/act3a.md |

## Next

1. Reperti dei Cercatori (2–3 per zone: bocca_vulcano, corona_bianca, rocca_brina) IT+EN in data/reperti/act3a.yaml +
   locales/*/act3a_world.yaml (canon-consistent: seekers who climbed the Scala, one who saw the painted dawn, one of
   Loki's guests who believed him).
2. Yeti painting builder src/content/bosses/yeti/painting.ts (`buildYetiPainting(ctx, { withCompanion })`, used by the
   ending) + Yeti model + yeti_caverna dressing (painted walls, blizzard fog on yeti_blizzard_start/end, eyes glint,
   painting lit on yeti_painting).
3. Gigante di Fuoco model (16 m colossus: black rock, fire veins, beard of flames; flags ablaze/head_low/holding; the
   thrown player is moved by the sim) + vulcano_cratere dressing (crater to the north, snow melting on gigante_rise,
   glaze on the rim, rim_broken crumble, crater_cools).
4. Guardiano model (empty ice armor, tower shield; shield_up/shield_broken; 4 blades orbiting at bstate.bladeAngle;
   guardiano_crumble) + rocca_cancello dressing (castle gate opening on the defeat).
5. Loki model (green-and-gold cloak, crooked smile, changing face; a real shadow only on the actor flagged casts_shadow,
   copies without; in_mirror hidden; anim `mimic_<swing anim>` + bstate.mimicNow = imitated weapon id) + rocca_sala_trono
   dressing (mirror_maze mirrors at the collider positions, loki_mirror_glow, ice_bridges collapse, loki_laugh/vanish).
6. Zone dressing for bocca_vulcano, corona_bianca, rocca_brina (terrain, path, props, landmarks, auroras at night, vistas).
7. Optional balance polish: Loki at notte (388 s, 3 copies) and in NG+ (417/354 s) run near or over the base target.

## Notes

- Chunk 1 (2026-11-04): log created. Inspection: no act3a files existed except the scaffolded arenas/zones (ids, centers,
  gates, altars kept) and canon names in locales/*/canon_names.yaml + world_names.yaml (not mine; referenced only).
- Gigante di Fuoco (chunk 1). 16 m giant, hurtboxes legs/thighs/pelvis/chest, lockable head part (anchor lowered to ~3.4 m
  in front when he bends over the twin slam, hangs it after a head charge, or is Spezzato). P1 fist_slam (burning basalt
  3 s dot), twin_slam (Colpo Rosso + jumpable heat ring), backhand, grab (unblockable; behavior carry 0.75 s → throw 12 m
  to the roomier side, always inside the arena, invulnerable 0.7 s flight, ONE landing hit, burn while ablaze), ember_breath
  (38° cone, ticks every 0.6 s, poise 0 so the player can walk/roll out), stomp (only under/behind), rim_quake (unstable
  rim: cracks under marked ground, never before 12 s). P2 (ablaze, arena_state rim_broken, mid line): head_charge
  (Colpo Rosso, leaves burning ground), flare_burst ring. NG+ ng_crater_spit (p1+p2), ng_double_charge (p2).
- Fairness fixes found with the bot: the breath ticked every 0.35 s with poise 8 = flinch-lock (flinch 0.38 s) → tick
  0.6 s, poise 0; heat rings slower than other acts' rings were hard to jump (long dwell) → 12 m/s, width 1.1, height 0.7,
  delay 0.6 (twin) / 0.5 (flare) so the roll out of the blow ends first; burning ground 4 s/r 3.8 → 3 s/r 2.8–3.4, no burn
  status on top of the dot.
- Bot (seeds=3): PASS perfect 3/3 avg 191 s / 320, 1.7 hits; sloppy 0/3 (10.3 hits, dies standing in fire). NG+ probe
  (ngCycle 1, 2 seeds): won 255/253 s, 2/1 hits. ToD probes: notte won 191 s (3 hits), alba won 213 s (4 hits).
  Hit attribution: session scratchpad act3a/hits.ts (`tsx hits.ts <boss> perfect|sloppy <seeds> <ng> <tod>`).
- Verification: `npx tsc --noEmit -p tsconfig.json` clean (whole tree); `npx vitest run tests/act3a.test.ts` 9/9;
  `npm run registry && SM_PARTIAL=1 npm run data` ok (act3a warnings only for the not-yet-authored yeti/guardiano/loki ids
  referenced by the scaffolded zones/altars); canon-audit: gigante only music theme + model builder.
- Yeti (chunk 1). 5.6 m humanoid beast (agile: run 8.5, turn 2.4). P1 claw_r (→ claw_l 55%), claw_l, sudden_leap,
  avalanche_scream (roof snow on marked ground, delay 1.3 s), blizzard (custom event → 10 s storm), storm_rush (requires
  blizzard), ground_slam (under him), painting_guard. P2 (furious): + frenzy (3 claws 0.45 s apart with knockback so one
  landed claw throws you out of the next: no stun-lock). Fairness fix from the bot: the first frenzy (4 claws 0.28 s apart,
  step 3 m/s) caused 11 hits over 2 seeds (flinch-lock).
- Bot (seeds=3): PASS perfect 3/3 avg 203 s / 320, 3.0 hits; sloppy 0/3 (7.7 hits, boss HP left 0.84). NG+ probe
  (2 seeds) won 225/255 s, 0/3 hits; ToD probes notte won 191 s (1 hit), alba won 214 s (0 hits).
- End of chunk 1: `npx tsc --noEmit -p tsconfig.json` clean (whole tree); eslint clean on my 5 TS files;
  `npx vitest run tests/act3a.test.ts` 13/13; `npm run registry && SM_PARTIAL=1 npm run data` ok (act3a warnings only:
  scaffolded rocca_brina exit / altars referencing guardiano_rocca_di_brina and loki, not authored yet); canon-audit for
  act3a: music themes (audio stream) + model builders (item 14) + the two missing encounters. No requests filed yet.
- Render side still owed by this stream (later chunk): src/content/bosses/yeti/painting.ts must export
  `buildYetiPainting(ctx, opts: { withCompanion: boolean })` (the ending reuses it). Sim cues to answer: gigante_rise,
  gigante_grab_caught, gigante_throw, gigante_ablaze, crater_cools, arena_state:rim_broken; yeti_painting_reveal,
  yeti_blizzard_start/end, yeti_eyes, yeti_guard, yeti_pant, yeti_furious, yeti_painting. Flags: head_low, holding,
  ablaze; blizzard, panting, furious, gazing.
- Guardiano della Rocca di Brina (chunk 1). 6.8 m empty ice armor (humanoid), equilibrio 190. P1 sword_thrust, sword_cut,
  overhead_cleave (Colpo Rosso + frost box ahead), shield_bash, shield_charge, frost_slam (frost line of 5 boxes), back_sweep
  (only from behind); shield_punish only from the spam rule. P2 (shield_broken, blades_orbit, mid line): + blade_whirl
  (jumpable ring), blade_volley (4 brina_blade projectiles), blade_cyclone (360° r 4.5, tick 0.75 with knockback, walks
  3.8 m/s; first version 4.5 m/s r 4.8 gave 6 hits / 2 seeds).
- Bot (seeds=3): PASS perfect 3/3 avg 225 s / 340, 1.3 hits; sloppy 0/3 (5.0 hits, boss HP left 0.99: its light spam is
  blocked and punished — the shield works as the card says). NG+ (2 seeds) won 342/338 s, 0/1 hits (slow but clean; NG+
  HP is x1.15); ToD notte won 221 s (5 hits), alba 222 s (5 hits) — probes before the cyclone retreat in the hook.
- Verification after the Guardiano: tsc clean (whole tree), eslint clean, `npx vitest run tests/act3a.test.ts` 19/19,
  `npm run registry && SM_PARTIAL=1 npm run data` ok (act3a warning left: rocca_brina exit requires loki), canon-audit act3a:
  music themes + model builders + missing Loki only ("Finalmente" quote OK).
- Loki (chunk 1). 3.2 m principal (humanoid), equilibrio 170, three phases (1.0–0.66–0.33). P1 dagger_flurry (2 cuts,
  first knocks back), dagger_lunge, false_bolt, twin_illusion (first attack of the fight, only with no copy alive),
  mirror_swap (only with copies), trick_step (teleport behind, cut 0.5 s later). P2 mirror_strike (1.1 s wind-up inside the
  glowing exit mirror, forward lunge — `toward_target` was mispredicted by the bot: 14 hits → `forward`), mirror_volley +
  the P1 blades. P3 mimic_1..3 (rebuilt), dagger_lunge, false_bolt, falling_ice. Copies: hp 1.2% and one-blow shatter,
  copy_flurry / copy_bolt (range 6–28, speed 14). One blow at a time (copies wait for Loki, Loki waits for copies): the
  first version let copies' bolts hit the bot mid-swing (15 of 22 hits).
- Bot (seeds=3): PASS perfect 3/3 avg 275 s / 380, 4.3 hits; sloppy 0/3 (12.7 hits, boss HP left 0.79). NG+ (2 seeds)
  won 417/354 s, 6/4 hits; ToD notte won 388 s (6 hits, three copies), alba won 306 s (9 hits) — probes before the
  illusion opener.
- Final chunk-1 bot table (seeds=3, all PASS): gigante 191 s/320, 1.7 hits; yeti 203 s/320, 3.0; guardiano 225 s/340,
  1.3; loki 275 s/380, 4.3. Sloppy 0/3 everywhere.
- End of chunk 1 (after the usage reset): tsc clean (whole tree); eslint clean on all act3a TS files;
  `npx vitest run tests/act3a.test.ts` 26/26; tests/sim + sim_integration pass; tests/data.test.ts strict fails only on
  other streams' gaps (strict `npm run data` has no act3a error; the only grep hit is "form gigante: unknown boss uruk",
  Act IV); `npm run registry && SM_PARTIAL=1 npm run data` ok with zero act3a warnings; canon-audit act3a: music themes +
  model builders only.
