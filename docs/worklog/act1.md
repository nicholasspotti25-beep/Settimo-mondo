# Work log — act1 (ACT I content, encounters 2–6, Vite port 5181)

Brief: docs/briefs/act1.md (+ docs/CONTENT_BRIEF.md, docs/BOSS_AUTHORING.md). Bosses: cavaliere_errante (D3), elder_tree (D4),
mostro_della_palude (D5), great_devourer (mini, D6), caronte (D6). Palette act1_green_gold.
Owned: data/bosses/<5>.yaml, data/arenas/{pianure_erba_alta,foresta_cuore,palude_pozza,palude_molo,fiume_traghetto}.yaml,
src/content/bosses/<5>/**, data/story/act1/<boss>.yaml (not guardiano), data/speakers/act1.yaml, data/voce/act1.yaml,
data/projectiles/act1.yaml, data/hazards/act1.yaml, locales/{it,en}/act1_bosses.yaml, tools/bot/hooks/<5>.ts,
tests/act1*.test.ts, docs/requests/act1.md.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Boss data, all card elements (phases, attacks, music ids, parts/minions, grants, lore_key, mounted, drops_weapon) | done | data/bosses/*.yaml |
| 2 | Behaviors for scripted mechanics (mounted/dismount + counter stance + night dark; elder front cone + heart weak point + first_light; palude hidden/emerge + voices + 3-figure split; devourer surfaced/submerged + stilts + pier smash; caronte boat → soul bridge → current) | done (bot-verified; unit tests missing) | src/content/bosses/*/behavior.ts, mostro_della_palude/{voices,minion_*}.ts |
| 3 | Time-of-day variants (cavaliere alba/notte, caronte giorno/notte) | done | boss yamls |
| 4 | NG+ `ng_plus` blocks, new attack per phase | partial: data done; bot run with ngCycle=1 not yet done | boss yamls |
| 5 | Story sequences intro/defeat (devourer none: mini) incl. lantern grant caption, first_light cue, ferry travel | done | data/story/act1/*.yaml |
| 6 | Speakers, Voce dell'Alba lines (altars + after-boss) | done | data/speakers/act1.yaml, data/voce/act1.yaml |
| 7 | Locales IT+EN (dialogue, verbatim canon quotes, lore, ToD notes, parts, minions, 24 voice whispers + clue, captions, voce) | done (chunk 1) | locales/{it,en}/act1_bosses.yaml |
| 8 | Projectile + hazard kinds | done | data/projectiles/act1.yaml, data/hazards/act1.yaml |
| 9 | Arena data (bounds, obstacles, variants pier_destroyed / soul_bridge / current) | done | data/arenas/*.yaml |
| 10 | Balance bot: perfect wins inside 120+20×D with few hits; sloppy not trivial | partial: all 5 PASS; mostro_della_palude perfect still 4.7 hits (double_slam, see Notes) | tools/bot/hooks/* |
| 11 | Bot hooks for scripted mechanics | done (chunk 1): all 5 hooks; shared act1Defense (box hazards, charge lines, ring jumps, round-hazard escape) | tools/bot/hooks/{cavaliere_errante,elder_tree,mostro_della_palude,great_devourer,caronte}.ts |
| 12 | Unit tests tests/act1*.test.ts | missing | tests/act1*.test.ts |
| 13 | Canon audit clean for act1 bosses | partial: only "no music theme data" (audio stream) and "no model builder" (item 14) remain; canon quotes OK | — |
| 14 | Boss models (5) | missing — blocked: docs/RENDER_KIT.md not present / not READY | src/content/bosses/<id>/model.ts |
| 15 | Arena dressing (5) incl. first_light, pier_destroyed, soul_bridge/current, caronte_ferry cues | missing — blocked: docs/WORLD_KIT.md not present / not READY | src/content/bosses/<id>/arena.ts |
| 16 | Requests to other streams | none needed so far | docs/requests/act1.md |

## Next

1. tests/act1.test.ts: cavaliere dismount at 50% + counter stance riposte + night dark; elder heart part active only in p2 +
   bark poise mult + first_light cue on death; palude voices announce before attack (sfx `voices_<fam>` + caption key present in
   both locales) + split into 3 figures in sequence + clue caption; devourer pier_destroyed variant on p2 + surfaced streak;
   caronte soul_bridge at 78% + current in p2 + ToD spawn/speed mults; NG+ patterns only with ngCycle ≥ 1.
2. Mostro della Palude double_slam: the generic bot dodges only at active 0.00 (too late) when standing ~3.2 m from the center
   (between the legs); trace with a slamdbg-style script (bot threats() during telegraph vs. the box at c z=5) — decide whether
   the box should start further out (fairness: an unreadable hit under the body?) or the bot needs a telegraph-aware dodge.
3. Bot pass with `sim.state.ngCycle = 1` for all five (NG+ fairness), and bot with tod alba/notte (cavaliere) and
   giorno/notte (caronte) via runFight opts.tod.
4. Great Devourer margin: 229 s avg of 240 s; re-check after tests (consider `hp_override` 5000 if any seed nears 240).
5. When RENDER_KIT.md / WORLD_KIT.md say STATUS: READY: 5 boss models + 5 arena dressings, headless screenshots on port 5181,
   iterate; then canon audit should only show the audio stream's themes.

## Notes

- Chunk 1 (2026-10-15): log created from inspection of partial work (boss data, behaviors, story, voce, speakers, kinds and
  arenas already authored by an earlier session; locales were missing entirely).
- Locales written: 74 keys referenced by act1 data/behaviors (incl. VOICE_VARIANTS keys built at runtime in voices.ts) all
  present in it.json and en.json (checked by script). Canon quotes verbatim: "L'alba non si trova. Si porta"
  (boss.cavaliere_errante.defeat), "Non hai ombra, Portatore. Né passato." (boss.caronte.intro2); canon-audit reports no quote
  mismatch. Data build warnings went from 171 to 81 (none left for act1 keys).
- Bot baseline before chunk 1 (seeds=3): cavaliere 111 s/180, 0 hits; elder_tree 94 s/200, 9.3 hits; palude 137 s/220,
  3.7 hits; devourer 215 s/240, 8.0 hits; caronte 190 s/240, 5.3 hits.
- Hit attribution (scratch diagnostic wrapping sim.drainEvents): elder hits were pollen/roots hazards live longer than a roll's
  i-frames + heart_pulse ring spawning on top of a trunk-hugging player (impact ≈ 0 s); devourer: breach_charge (24 m/s, seen
  by the generic bot only on overlap), ripples, splash rings; caronte: soul_hands_ring.
- Fixes: shared act1Defense in tools/bot/hooks/cavaliere_errante.ts gained chargeDodge (walk off the predicted charge_through
  line, roll at arrival), ringJump (hold swings during a ring wind-up, jump the low ring), hazardEscape (16-direction probe out
  of pending round hazards, walk early / roll when too wide). Data fairness: elder heart_pulse ring and devourer splash rings
  now flash on the ground before expanding (`delay: 0.3` / `0.25`) — before, a player next to the body was hit on the spawn
  frame. Devourer: surfaced streak 3–4 attacks (was 2–3, max 11 s) = more punish windows; `hp_override: 5200` (formula 5654
  assumes reference uptime, the serpent is submerged ~1/3 of the fight).
- Bot after chunk 1 (seeds=3, all PASS): cavaliere 111 s/180, 0.0 hits, sloppy wins 3/3 with 11.7 hits (not untouched);
  elder_tree 95 s/200, 2.3 hits, sloppy 1/3; palude 151 s/220, 4.7 hits, sloppy 0/3; devourer 229 s/240, 2.0 hits,
  sloppy 0/3 (14.7 hits); caronte 181 s/240, 1.3 hits, sloppy 0/3.
- `npx tsc --noEmit -p tsconfig.json`: clean (whole tree) at end of chunk 1. `SM_PARTIAL=1 npm run data`: ok.
- Diagnostic scripts live in the session scratchpad (not in the repo).
