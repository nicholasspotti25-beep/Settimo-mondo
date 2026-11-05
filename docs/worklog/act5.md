# Work log — act5 (ACT V content, encounters 27–32 + Dragon Realm zones, Vite port 5186)

Brief: docs/briefs/act5.md (+ docs/CONTENT_BRIEF.md, docs/BOSS_AUTHORING.md). Encounters in story order: drago_di_ghiaccio
(mini, D14), drago_a_tre_teste (mini, D15), reina (principal, D16), idra (secondary, D15), grifone (secondary, D16),
re_drago (principal, D17). Palette act5_gold_white_midnight. Player at 1.12 scale (taller than mortals) for the whole act.
Owned: data/bosses/<6>.yaml, data/arenas/{ossa_altipiano,nidi_rupe,osservatorio_cupola,lago_specchi,scogliere_cornice,
chioma_yggdrasil}.yaml, data/zones/{altipiano_ossa,nidi,osservatorio,lago_nove_specchi,scogliere_vento,yggdrasil}.yaml
(+ their altars, keep ids), src/content/bosses/<6>/**, src/content/zones/<6 zones>/**, data/story/act5/**,
data/speakers/act5.yaml, data/voce/act5.yaml, data/reperti/act5.yaml, data/projectiles/act5.yaml, data/hazards/act5.yaml,
locales/{it,en}/act5_*.yaml, tools/bot/hooks/<6>.ts, tests/act5*.test.ts, docs/requests/act5.md. Also sequence act5_intro.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Boss data, all card elements (phases, attacks with fair telegraphs, parts, minions, music ids, lore, drops_weapon, Form, key item, brightens_sky, metamondo_reaction) | partial: drago_di_ghiaccio, drago_a_tre_teste done; reina, idra, grifone, re_drago missing | data/bosses/*.yaml |
| 2 | Behaviors (every card mechanic) | partial (unit-tested): ghiaccio icy patches (non-damaging, slide), breath aim lock, no tick flinch-lock, p2 storm (gusts with cue, marked stalactites that wait for the dragon, wing gale), NG+ ice cage; tre teste heads in turn, striking head comes to the center, head falls for good at its break → others enrage (×1.12 each), p2 at first fall, last head never falls, bolts one blow; Reina (orbits, constellations, gravity zones, star-bombs, Metamondo rewrite, echo of the player), Idra (regrowing heads 5 → 9), Grifone (wind pushes, swoops), Re Drago (4 phases, Pietà's surrender) missing | src/content/bosses/{drago_di_ghiaccio,drago_a_tre_teste}/behavior.ts |
| 3 | Time-of-day variants | partial: ghiaccio notte (breathes more) / alba (opens with the tail); tre teste notte (lightning opener, more strikes); Reina notte (whole sky, more stars) missing; others missing | boss yamls |
| 4 | NG+ `ng_plus` blocks (new attack per phase) | partial: ghiaccio ng_tail_return → ng_tail_back / + ng_ice_cage; tre teste ng_venom_line / + ng_bolt_cage — NG+ balance not yet clean (see Notes); 4 bosses missing | boss yamls |
| 5 | Story: act5_intro; intro/defeat per boss (Reina, Re Drago cinematics + verbatim quotes; Idra/Grifone 1–2 lines); minis none | partial: act5_intro (back to 112%, leaving the park, Yggdrasil reveal cue, Voce); minis need none; reina, idra, grifone, re_drago missing | data/story/act5/*.yaml |
| 6 | Speakers + Voce dell'Alba (6 altars + after-boss) | partial: Voce altar lines altare_ossa_01, altare_nidi_01, altare_osservatorio_01; speakers (reina, idra, grifone, re_drago) and the other 3 altars missing | data/voce/act5.yaml, data/speakers/act5.yaml (missing) |
| 7 | Locales IT+EN (verbatim canon quotes) | partial: every key referenced so far (unit-tested); Reina/Re Drago quotes come with item 1 | locales/{it,en}/act5_{bosses,story}.yaml |
| 8 | Projectile + hazard kinds | partial: hazards ghiaccio_ice, ghiaccio_stalactite, tre_teste_venom, tre_teste_bolt; projectile tre_teste_fireball; the other 4 bosses' kinds missing | data/projectiles/act5.yaml, data/hazards/act5.yaml |
| 9 | Arena data (6, incl. phase variants) | partial: ossa_altipiano (2 rib-bone colliders, variant storm), nidi_rupe (3 low nest rims, variant fury); 4 scaffold only (chioma_yggdrasil needs the suspended-branches variant) | data/arenas/*.yaml |
| 10 | Balance bot (perfect wins inside 120+20×D with few hits; sloppy not trivial), incl. NG+ and ToD probes | partial: ghiaccio PASS, tre teste PASS (see Notes); NG+ of both not clean | — |
| 11 | Bot hooks for scripted mechanics | partial: drago_di_ghiaccio (shared ground defenses + breathEscape, exported), drago_a_tre_teste (defenses + breath escape + head targeting: Spezzato head, the head in recovery, poison → fire → lightning) | tools/bot/hooks/<id>.ts |
| 12 | Unit tests tests/act5*.test.ts | partial: 8 tests (2 data/locales/intro + 3 ghiaccio + 3 tre teste), 8/8 | tests/act5.test.ts |
| 13 | Canon audit clean for act5 bosses | partial: ghiaccio/tre teste only "no music theme data" (audio stream) and "no model builder" (item 14); 4 missing encounters | — |
| 14 | Boss models (6; Re Drago's Legge/Pietà heads must mirror Regina Drago's visual language) | missing (later chunk; RENDER_KIT.md) | src/content/bosses/<id>/model.ts |
| 15 | Arena dressing (6) incl. cues | missing (later chunk; WORLD_KIT.md) | src/content/bosses/<id>/arena.ts |
| 16 | Zones (6): bone plateaus, nests in rock, observatory, Lago dei Nove Specchi, wind cliffs, Yggdrasil (crown above the clouds; visible on the horizon from altipiano_ossa) | partial: scaffold only | data/zones/*.yaml, src/content/zones/<zone>/** |
| 17 | Reperti dei Cercatori, 2–3 per zone, IT+EN | missing | data/reperti/act5.yaml, locales/*/act5_world.yaml |
| 18 | Requests to other streams | 2 open (integrator): tick damage must not flinch; local ice footing from hazards (both worked around) | docs/requests/act5.md |

## Next

1. Reina (principal, D16, osservatorio_cupola, 3 phases): p1 le Orbite (concentric ring hazards rotating on the ground —
   moving box/arc hazards or custom; falling stars marked; constellations: 3–5 star marks appear, lines drawn between them
   via cue, they strike when the lines join, ≥ 1.2 s, very clear); p2 il Cielo Riscritto (gravity zones: behavior reads
   sim.player.vy / grounded inside a zone to lighten or deepen jumps/falls, pull zones via hazard `pull`; star-bombs;
   metamondo_reaction rewrite + onMetamondoStart 'rewrite'); p3 la Profezia (record sim.player pos/yaw/state each tick into
   a 10 s ring buffer from fight start; echo minion `eco` (untargetable, minion behavior minion_eco.ts) replays positions
   10 s late and its recorded swings as damaging hits with a short glow tell, one blow per replayed swing, never on a
   downed player); notte variant (more stars, spawn_mult); intro cinematic + dialogue with the verbatim quote "Se le stelle
   mentono, voglio vederlo."; defeat: the seventh place in the sky was empty, the Rituale delle Due Metà (Cuore di Luce from
   Re Drago + Cuore d'Ombra from Regina Drago on the Altare del Rovescio); brightens_sky, unlocks_form firmamento, speaker,
   Voce after, hazards/projectiles, arena data, hook, tests, bot.
2. Idra (secondary, D15, lago_specchi): five head parts with equilibrio + regrow 20 (grace → no regrow, sim handles),
   heads attack in turn (bites, venom sprays: reuse the Tre Teste turn rule and head anchors), p2 nine heads (four inactive
   parts activated in onPhaseEnter); 1–2 line intro/defeat (asks whether the Portatore is ready to climb), lore_key.
3. Grifone (secondary, D16, scogliere_cornice rect 8×34): telegraphed gusts via sim.pushPlayer (reuse the Ghiaccio gust
   pattern: cue with the wind vector, then push), swoops (rise/dive_to_target), lion claws, gliding through gusts; p2
   storm of sharp feathers (projectile kind feather); 1–2 lines (whoever defeats both keepers may climb), lore_key.
4. Re Drago (principal, D17, chioma_yggdrasil, 4 phases): p1 heads Legge/Memoria/Pietà in turn (gold breath, azure roar
   that slows, white bite); p2 flight around the Tree (arena variant suspended branches: islands/obstacles, rains of light);
   p3 grounded, gold waves and charges; p4 Pietà stops and admits defeat (canDie false → scripted end, grants
   cuore_di_luce); verbatim "Sono ciò che resta quando si toglie il rimpianto."; points to the root descending to the
   Inferno; brightens_sky, unlocks_form cielo_aureo, speaker, Voce, tests, bot.
5. NG+ polish: tre teste NG+ (2 seeds) the perfect bot dies just before the end (bossHp 0.00/0.06, 27/10 hits, mostly dot
   ticks + wing_buffet in puddles) → shorter puddles in NG+, wing_buffet only when no puddle under the player; ghiaccio NG+
   1/2 (ambient stalactites while idle: 5 hits) → no ambient drop within 2 s of an NG+ cage/rain.
6. Reperti dei Cercatori (2–3 per zone × 6) IT+EN; Voce for the remaining altars; speakers file.
7. Boss models (6), arena dressing (6), zone dressing (6) with RENDER_KIT / WORLD_KIT; Yggdrasil on the horizon from
   altipiano_ossa; coordinate Re Drago's heads with the act6 stream (Regina Drago).

## Notes

- Chunk 1 (2026-11-05): log created. Inspection: no act5 files existed except the scaffolded arenas/zones/altars (ids,
  centers, gates, altars kept), canon names in locales/*/canon_names.yaml + world_names.yaml (not mine; referenced) and
  progression act 5 → act5_intro.
- Drago di Ghiaccio (chunk 1). ~20 m quadruped (radius 3.2, walk 3.2, turn 1.6), equilibrio 260, low hurtboxes (legs,
  chest, belly, tail). P1 claw_swipe (→ claw_swipe_l 40%, own tell), bite, frost_breath (1.1 s inhale, aim locked the last
  0.45 s, 42° × 15 m cone, ticks 0.45 s, slow 1.2 s; three ice_trail events → patches r 2.6 along its line), tail_sweep
  (only beside/behind; low, jumpable), tail_spin (360°, Colpo Rosso, low), frost_stomp (ring born at 9 m, beyond the stomp).
  P2 storm (flag storm, arena_state storm): + blizzard_breath (52°, four patches r 3.1), stalactite_rain (one on you + four
  ≥ 5 m away, one blow), wing_gale (pushes away 4.2 m/s for 1.6 s); ambient gusts (cue ghiaccio_gust 1.0 s ahead, 1.3 m/s
  for 2.4 s every 9–12 s) and ambient stalactites (marked 1.7 s on you every 8.5–11 s, never while it winds up/strikes;
  its next blow waits for the fall). Ice patches: ≤ 8 live, 16 s, never damage, ignored by the bot's threat model.
- Fairness fixes from the bot: the first runs had 13 hits/fight and 2/3 deaths: breath ticks each restarted the flinch
  (engine, request 1 → noTickFlinch), telegraph tracking kept a far player centered (→ aim lock + track_active 0.1),
  the opener breath caught the approach (→ no opener), stalactite impact 0.35 s (→ 0.2 s, r 1.8, ×1.1, mark 1.7 s).
- Bot (seeds=3): PASS perfect 3/3 avg 179 s / 400, 5.0 hits; sloppy 0/3 (4.7 hits, boss HP left 0.93). NG+ (2 seeds):
  won 221 s (6 hits) / lost at boss HP 0.10 (183 s); ToD notte won 184 s (3 hits), alba won 187 s (6 hits).
- Drago a Tre Teste (chunk 1). ~16 m (radius 3.0), equilibrio 300; parts testa_fuoco (left), testa_veleno (center),
  testa_fulmine (right): equilibrio 100 each, lockable, ×1.15 damage. P1 fire_breath (aim lock, cone 40° × 14 m from
  2.5 m ahead, burn), fire_spit (3-ball fan, burst 1.2 m), venom_spray (3 puddles, dot 5 s, poison), venom_bite,
  bolt_strikes (three marked strikes on your predicted spot, 0.45 s apart, one blow), bolt_lash (0.6 s tell), tail_sweep
  (beside/behind), wing_buffet. P2 fury (first fall; HP 0.3 fallback for a player who never aims a head): + rage_fire_sweep
  (three beats left → right), rage_venom_rain (ring of 5 + 1 on you), rage_bolt_line (7 strikes through you).
- Bot (seeds=3): PASS perfect 3/3 avg 263 s / 420, 7.0 hits (incl. dot ticks); sloppy 0/3 (6.0 hits, boss HP left 0.88).
  NG+ (2 seeds): lost both near the end (Next 5); the first NG+ p1 attack (double fire volley) was a wall (died in 35 s)
  → replaced by ng_venom_line. ToD notte won 256 s (22 hits, mostly puddle ticks), alba (no variant) 269 s.
- Probe scripts (scratchpad, not in tests/): act5/probe.ts `npx tsx <scratchpad>/act5/probe.ts <boss> perfect|sloppy
  <seeds> <ng> <tod|->` (hit attribution: attack id, hazard kinds near, @ice when sliding, @p<phase>); act5/breath.ts
  (per-tick trace of one attack vs the bot).
- End of chunk 1 verification: `npx tsc --noEmit -p tsconfig.json` 0 errors; eslint clean on all act5 TS files;
  `npx vitest run tests/act5.test.ts` 8/8; `npm run registry && SM_PARTIAL=1 npm run data`: no warning for my two bosses
  (remaining act5 warnings: the scaffolded osservatorio zone/altar and the firmamento form naming reina, not authored yet);
  canon-audit act5: music themes (audio stream) + model builders (item 14) only.
- Render side owed (later chunk): ghiaccio cues ghiaccio_gust (pos = wind unit vector), ghiaccio_storm, arena_state:storm;
  vfx ghiaccio_inhale, ghiaccio_gale; flag storm; static hazard visual `ice` for the patches (ground ice, flat), `spikes`
  for stalactites (draw them falling from above during the mark); anims claw_r, claw_l, bite, breath, tail_sweep,
  tail_sweep_back, tail_spin, stomp, roar_up, wing_beat. Tre teste: the three heads follow part anchors (striking head
  forward/center/low, others up/back, Spezzato and fallen heads on the ground); cue tre_teste_head_down, partBroken per
  head; flags fury, fallen_testa_*; vfx tre_teste_fire_glow (part); anims breath_fire, breath_sweep, spit, spray,
  spray_high, spray_low, bite, roar_sky, lash, tail_sweep, wing_beat.
