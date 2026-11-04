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
| 1 | Boss data, all card elements (phases, attacks with fair telegraphs, parts, music ids, lore, drops_weapon, Form) | partial: gigante_di_fuoco + yeti done (chunk 1); guardiano, loki missing | data/bosses/*.yaml |
| 2 | Behaviors: gigante grab+throw, ignited ground, unstable rim, p2 ablaze head-down charge; yeti blizzard visibility, avalanche screams, p2 never stops, defends the painting; guardiano frontal tower shield (modifyIncoming) + light-spam punish + Equilibrio gap, p2 orbiting blades, "Finalmente"; loki p1 illusions (illusion / casts_shadow / illusionist), p2 mirror labyrinth, p3 ice bridges + imitation of the player's three weapons, laugh + vanish | partial: gigante done (grab → carry → throw inside the arena, invulnerable flight, single landing hit; head anchor lowered on twin slam / after head charge / Spezzato; front-only blows, stomp under/behind, rim quake after 12 s); yeti done (blizzard 10 s: unlockable beyond 9 m, storm_rush only in the storm with an eyes-glint cue, never before 15 s; painting_guard leap lands between player and painting, chosen first; p2 fury rhythm 0.15 s gaps + 1.6 s pant every 3rd attack; dawn gaze 3 s) | src/content/bosses/<id>/behavior.ts |
| 3 | Time-of-day variants | partial: gigante alba (rim gives way more often) / notte (ember breath opener); yeti alba (gazes at the painting 3 s) / notte (blizzard opener) | boss yamls |
| 4 | NG+ `ng_plus` blocks (new attack per phase) | partial: gigante p1 ng_crater_spit, p2 + ng_double_charge; yeti p1 ng_double_leap, p2 + ng_cave_in (both bot-verified) | boss yamls |
| 5 | Story: act3_intro, intro/defeat per boss (Loki cinematic, laugh `loki_laugh`, brightens_sky, Specchio Form) | partial: act3_intro, gigante_intro/defeat, yeti_intro/defeat (cues yeti_painting_reveal / yeti_painting) done | data/story/act3a/*.yaml |
| 6 | Speakers + Voce dell'Alba (altars altare_vulcano_01, altare_corona_vista, altare_corona_01, altare_rocca_01, altare_rocca_02 + after-boss) | partial: speaker gigante_di_fuoco; Voce lines for all 5 altars done; after-boss lines: gigante, yeti | data/speakers/act3a.yaml, data/voce/act3a.yaml |
| 7 | Locales IT+EN (verbatim canon quotes) | partial: every key referenced so far (gigante, yeti, act3_intro, 5 altar lines) in both languages (unit-tested) | locales/{it,en}/act3a_*.yaml |
| 8 | Projectile + hazard kinds | partial: gigante hazards (gigante_brace, gigante_shock, gigante_flare, rim_crack, crater_boulder), yeti_avalanche; no projectiles needed yet | data/projectiles/act3a.yaml, data/hazards/act3a.yaml |
| 9 | Arena data (bounds, obstacles, surface, variants: crater rim, painted cave, gate, throne hall → mirror labyrinth → ice bridges) | partial: vulcano_cratere (surface ice = meltwater glaze, variant rim_broken r 30→26), yeti_caverna (snow, ceiling 18, painting at center+[0,0,23]) done | data/arenas/*.yaml |
| 10 | Balance bot (perfect wins inside 120+20×D with few hits; sloppy not trivial), incl. NG+ and ToD probes | partial: gigante + yeti PASS incl. NG+ and ToD probes (see Notes) | — |
| 11 | Bot hooks for scripted mechanics | partial: gigante (breath side-step/roll, head target, leaveBurningGround shared helper + act2Defense); yeti (steps away from the painting + act2Defense) | tools/bot/hooks/*.ts |
| 12 | Unit tests tests/act3a*.test.ts | partial: data/NG+/locale checks + 6 gigante + 4 yeti tests (13/13 pass) | tests/act3a.test.ts |
| 13 | Canon audit clean for act3a bosses | partial: gigante, yeti only "no music theme data" (audio stream) + "no model builder" (item 14) |
| 14 | Boss models (4) + exported yeti painting builder `buildYetiPainting(ctx, {withCompanion})` | missing (later chunk) | src/content/bosses/<id>/model.ts, src/content/bosses/yeti/painting.ts |
| 15 | Arena dressing (4) incl. cues | missing (later chunk) | src/content/bosses/<id>/arena.ts |
| 16 | Zones (3): terrain, path, colliders, props, landmarks, particles, vistas, auroras at night | partial: scaffold only | data/zones/*.yaml, src/content/zones/<zone>/** |
| 17 | Reperti dei Cercatori, 2–3 per zone (6–9), IT+EN | missing | data/reperti/act3a.yaml |
| 18 | Requests to other streams | none yet | docs/requests/act3a.md |

## Next

1. Guardiano della Rocca di Brina sim side (front shield, light-spam punish, Equilibrio gap, p2 orbiting blades, "Finalmente").
3. Loki sim side (illusions with the only shadow, mirror labyrinth, ice bridges + imitation of the three equipped weapons,
   lies mixed with truth, laugh and vanish, Specchio Form, brightens_sky). Arena variants mirror_maze (obstacles = mirror
   colliders, he exits mirrors: teleport) and ice_bridges (narrow polygon); imitation = AttackDefs built at runtime from
   sim.player.weapons movesets, retimed (telegraph >= 0.6, damage capped) — check whether the sim allows per-actor runtime
   AttackDefs in attackMap (otherwise file a request in docs/requests/act3a.md).
3. Reperti (2–3 per zone) IT+EN.
4. Models (4) + yeti painting builder; arena dressing (4); zone dressing (when RENDER_KIT / WORLD_KIT are READY).

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
