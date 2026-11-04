# Work log — act3b (ACT III-B content, encounters 17–22 + zones, Vite port 5185)

Brief: docs/briefs/act3b.md (+ docs/CONTENT_BRIEF.md, docs/BOSS_AUTHORING.md). Bosses in story order: grande_lupo (D11),
grande_orso (D12), sciamano (D12), grande_aquila_reale (D12), drago_di_fuoco (mini, D12), kraken (mini, D13).
Palette act3_white_azure.
Owned: data/bosses/<6>.yaml, data/arenas/{taiga_radura,taiga_tronchi,taiga_tamburi,fiume_nave_ponte,porto_moli,
mare_nave_ponte}.yaml, data/zones/{taiga,grande_fiume,porto_fiume,mare}.yaml (+ their altars, keep ids),
src/content/bosses/<6>/**, src/content/zones/<4 zones>/**, data/story/act3b/**, data/speakers/act3b.yaml,
data/voce/act3b.yaml, data/reperti/act3b.yaml, data/projectiles/act3b.yaml, data/hazards/act3b.yaml,
locales/{it,en}/act3b_*.yaml, tools/bot/hooks/<6>.ts, tests/act3b*.test.ts, docs/requests/act3b.md.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Boss data, all card elements (phases, attacks with fair telegraphs, parts, minions, music ids, lore, drops_weapon) | partial: grande_lupo (+ minion spirito_lupo), grande_orso done; sciamano, grande_aquila_reale, drago_di_fuoco, kraken missing | data/bosses/*.yaml |
| 2 | Behaviors (every card mechanic) | partial (unit-tested): lupo howl → 12 s snowstorm (wind drift 1.3 m/s, frost gusts, storm_lunge + eyes cue), tail only from behind, p2 split into the spirit (one blow at a time, pack leap 0.9 s after his, never on a downed player, recall after 18 s), dawn circling, guardMultiHit (no stun-lock); orso hug (held 1.1 s at the chest, one hit, dropped with i-frames), rear kick only from behind, p2 standing + forest shake (trees every 15 s, never < 8 s apart); 4 bosses missing | src/content/bosses/grande_lupo/{behavior,minion_spirito_lupo}.ts, src/content/bosses/grande_orso/behavior.ts |
| 3 | Time-of-day variants | partial: lupo alba (circles and studies you, flank opener) / notte (storm opener); orso alba (guards the old trees: grabs more, charges less) / notte (head-charge opener) | boss yamls |
| 4 | NG+ `ng_plus` blocks (new attack per phase) | partial (bot-verified): lupo ng_triple_bite chain (3 bites with own tells) / + ng_frost_gale (marked gusts around you); orso ng_double_charge / + ng_timber | boss yamls |
| 5 | Story: intro/defeat per secondary boss (1–2 lines), Sciamano's verbatim quote; minis without dialogue | partial: grande_lupo_intro/defeat, grande_orso_intro/defeat (caption + line, line + caption + Voce) | data/story/act3b/*.yaml |
| 6 | Speakers + Voce dell'Alba (6 altars + after-boss lines) | partial: speakers grande_lupo, grande_orso; altar lines altare_taiga_01/02/03; after-boss lupo, orso | data/speakers/act3b.yaml, data/voce/act3b.yaml |
| 7 | Locales IT+EN (verbatim canon quotes) | partial: every key referenced so far (unit-tested); Sciamano quote comes with item 1 | locales/{it,en}/act3b_{bosses,story}.yaml |
| 8 | Projectile + hazard kinds | partial: hazards lupo_gust, orso_tree; projectiles file exists (no kinds yet; Sciamano's spirits next) | data/projectiles/act3b.yaml, data/hazards/act3b.yaml |
| 9 | Arena data (6, incl. phase variants: ship lifted, burning docks, whirlpool) | partial: taiga_radura (snow, 3 spirit stones), taiga_tronchi (snow, 2 fallen logs, forest_shaken cue) done; 4 scaffold only | data/arenas/*.yaml |
| 10 | Balance bot (perfect wins inside 120+20×D with few hits; sloppy not trivial), incl. NG+ and ToD probes | partial: lupo, orso PASS (see Notes) | — |
| 11 | Bot hooks for scripted mechanics (ballista, tentacles/eye, falling trees, drum rhythm) | partial: grande_lupo (holds swings while the spirit strikes), grande_orso (shared Act II defenses) | tools/bot/hooks/grande_{lupo,orso}.ts |
| 12 | Unit tests tests/act3b*.test.ts | partial: 14 tests (2 data/locales + 8 lupo + 4 orso), 14/14 | tests/act3b.test.ts |
| 13 | Canon audit clean for act3b bosses | partial: lupo/orso only "no music theme data" (audio stream) and "no model builder" (item 14); the 4 missing encounters + Sciamano quote | — |
| 14 | Boss models (6) | missing (later chunk; RENDER_KIT.md) | src/content/bosses/<id>/model.ts |
| 15 | Arena dressing (6) incl. cues | missing (later chunk; WORLD_KIT.md) | src/content/bosses/<id>/arena.ts |
| 16 | Zones (4): taiga (three clearings), grande_fiume (deck), porto_fiume, mare (night sea) | partial: scaffold only | data/zones/*.yaml, src/content/zones/<zone>/** |
| 17 | Reperti dei Cercatori, 2–3 per walkable zone, IT+EN (the Nave dei Cercatori carries seekers' relics) | missing | data/reperti/act3b.yaml, locales/*/act3b_world.yaml |
| 18 | Requests to other streams | none needed so far | docs/requests/act3b.md |

## Next

1. Sciamano: data (ranged caster; wolf/bear/raven spirit projectiles; drum: behavior picks pattern sets by beat, cue per
   beat change; p2 fuses with the raven and flies above the arena: `move.flying`/hover + descend windows to punish),
   story with the verbatim quote "Il fiume sa dov'è il mare. Il mare sa dov'è il giardino." (defeat line), speaker,
   Voce after (points to the Grande Fiume and the Nave dei Cercatori), arena taiga_tamburi, projectiles, hook, tests.
2. Grande Aquila Reale: dives on the narrow rocking deck (fiume_nave_ponte rect 8x30, mast/sail colliders); ballista via
   sim.addFightInteractable + onInteract → big bolt that hits her in flight (clear window after each dive; prompt key in
   locales); p2 grabs the ship and lifts it (arena variant ship_lifted + cue); behavior module required by the audit.
3. Drago di Fuoco (mini, no dialogue/lore/say): attacks from above, cone breath, glide + claws; p2 docks burning (arena
   hazards from_phase p2 on porto_moli).
4. Kraken (mini): breakable lockable tentacle parts (sweeps; each broken tentacle removes its sweep), eye weak point
   (modifyIncoming), p2 whirlpool: rotating push via sim.pushPlayer around the ship center + cue for the camera.
5. Reperti (taiga 3, grande_fiume 2–3 on the Nave dei Cercatori, porto_fiume 2–3, mare 2) IT+EN.
6. Models (6), arena dressing (6), zone dressing (4) with RENDER_KIT / WORLD_KIT.
7. Optional polish: lupo perfect-bot hits 5.7 avg (leaps and pack_lunge landings); revisit with the model's real reach.

## Notes

- Chunk 1 (2026-11-04): log created. Inspection: no act3b files existed except the scaffolded arenas/zones/altars (ids,
  centers, gates, altars kept) and canon names in locales/*/canon_names.yaml + world_names.yaml (not mine; referenced).
- Grande Lupo (chunk 1). 6 m quadruped (radius 2.4, run 12, turn 3.0), equilibrio 200. P1 bite (→ bite_2 50%),
  leap_bite, pounce, flank_dash (bound 0.4 s, crouch, lunge: first version ran straight from the bound into the lunge and
  was misread), tail_sweep (only from behind, chosen first), howl (storm, never before 14 s), storm_gust (marked line of
  5 gust zones), storm_lunge. P2 (split, mid line): + pack_lunge, spirit_call; minion spirito_lupo (12% HP, main_share
  0.4, spirit_bite / spirit_leap, idle 2.2–3.4 s). Fairness fixes from the bot: the spirit striking during his attacks
  (24 of 40 hits) → strict one blow at a time (spirit starts only while he is not attacking, his combo follow-up is dropped
  while the spirit strikes) + perfect hook holds swings while the spirit winds up; NG+ triple bite as one multi-window
  blow stun-locked/out-tracked the bot (12–14 hits over 2 seeds) → three chained bites with their own tells; NG+ gale
  projectile fan was a wall → marked gust zones.
- Bot (seeds=3): PASS perfect 3/3 avg 254 s / 340, 5.7 hits; sloppy 0/3 (4.3 hits, boss HP left 0.94). NG+ probe (2 seeds)
  won 335/342 s, 7/9 hits (NG+ HP x1.15); ToD notte won 223 s (6 hits), alba won 235 s (6 hits).
- Grande Orso (chunk 1). 5.6 m quadruped (radius 2.8, walk 3.0, turn 1.7: slow), equilibrio 240. P1 paw_swipe (→ left
  45%), maul_slam (Colpo Rosso + jumpable quake ring), hug (grab), head_charge (charge_through, line fixed at start),
  rear_kick (only from behind). P2 (standing, arena_state forest_shaken cue, mid line): + standing_slam, standing_swipe
  (two swipes, knockback, guardMultiHit), forest_shake (3 trunks as spokes around you + 2 across the arena, shadows marked
  1.7 s). Fairness fix from the bot: quake rings born where the roll out of the slam ends (22 hits / 3 seeds) → the band is
  born 0.8 s later at r0 7.5 m (8 m standing): close range is the slam, far range the ring, never both at one spot.
- Bot (seeds=3): PASS perfect 3/3 avg 206 s / 360, 3.3 hits; sloppy 0/3 (3.7 hits, boss HP left 0.96). NG+ (2 seeds) won
  260/249 s, 4/5 hits; ToD notte won 198 s (1 hit), alba won 220 s (4 hits).
- Hit attribution script: session scratchpad act3b/hits.ts (`tsx hits.ts <boss> perfect|sloppy <seeds> <ng> <tod>`).
- End of chunk 1 verification: `npx tsc --noEmit -p tsconfig.json` no act3b errors; eslint clean on all act3b TS files;
  `npx vitest run tests/act3b.test.ts` 14/14; `npm run registry && SM_PARTIAL=1 npm run data`: no warning for lupo/orso
  (remaining act3b warnings are the scaffolded zones/altars naming the 4 encounters not authored yet); canon-audit
  act3b: music themes (audio stream) + model builders (item 14) + 4 missing encounters + the Sciamano quote (item 1).
- Render side owed (later chunk): cues lupo_storm_start (pos = wind unit vector) / lupo_storm_end, lupo_eyes, lupo_split,
  lupo_spirit_fade, lupo_fade; flags snowstorm, split, circling; the spirit is a minion with builder grande_lupo at scale
  0.7 and flag `spirit` (translucent). Orso: cues orso_hug_caught / orso_hug_release, orso_head_down, orso_stand,
  orso_forest_shake, arena_state:forest_shaken, orso_rest; flags hugging, standing, guarding.
