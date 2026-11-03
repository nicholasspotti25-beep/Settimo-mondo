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
| 2 | Behaviors for scripted mechanics (mounted/dismount + counter stance + night dark; elder front cone + heart weak point + first_light; palude hidden/emerge + voices + 3-figure split; devourer surfaced/submerged + stilts + pier smash; caronte boat → soul bridge → current) | done (bot-verified + unit-tested) | src/content/bosses/*/behavior.ts, mostro_della_palude/{voices,minion_*}.ts |
| 3 | Time-of-day variants (cavaliere alba/notte, caronte giorno/notte) | done (bot + unit-tested chunk 2) | boss yamls |
| 4 | NG+ `ng_plus` blocks, new attack per phase | done (chunk 2): data + unit tests + bot at ngCycle=1 (all 5 perfect 3/3) | boss yamls |
| 5 | Story sequences intro/defeat (devourer none: mini) incl. lantern grant caption, first_light cue, ferry travel | done | data/story/act1/*.yaml |
| 6 | Speakers, Voce dell'Alba lines (altars + after-boss) | done | data/speakers/act1.yaml, data/voce/act1.yaml |
| 7 | Locales IT+EN (dialogue, verbatim canon quotes, lore, ToD notes, parts, minions, 24 voice whispers + clue, captions, voce) | done (chunk 1) | locales/{it,en}/act1_bosses.yaml |
| 8 | Projectile + hazard kinds | done | data/projectiles/act1.yaml, data/hazards/act1.yaml |
| 9 | Arena data (bounds, obstacles, variants pier_destroyed / soul_bridge / current) | done | data/arenas/*.yaml |
| 10 | Balance bot: perfect wins inside 120+20×D with few hits; sloppy not trivial | done (chunk 2): all 5 PASS base; NG+ and ToD variants all won by the perfect bot | tools/bot/hooks/*, data/bosses/great_devourer.yaml |
| 11 | Bot hooks for scripted mechanics | done (chunk 1): all 5 hooks; shared act1Defense (box hazards, charge lines, ring jumps, round-hazard escape) | tools/bot/hooks/{cavaliere_errante,elder_tree,mostro_della_palude,great_devourer,caronte}.ts |
| 12 | Unit tests tests/act1*.test.ts | done for sim (27); model tests started chunk 3 (3: Cavaliere budget, hurtbox alignment, dismount/horse leaves/retry) | tests/act1.test.ts, tests/act1_models.test.ts |
| 13 | Canon audit clean for act1 bosses | partial: only "no music theme data" (audio stream) and "no model builder" (item 14) remain; canon quotes OK | — |
| 14 | Boss models (5) | partial (chunk 3): cavaliere_errante first pass (mounted + on-foot composite, horse gallops off on dismount, lantern ember on death; screenshots checked) — needs a volume pass on the knight's body; elder_tree, palude, devourer, caronte missing | src/content/bosses/cavaliere_errante/model.ts |
| 15 | Arena dressing (5) incl. first_light, pier_destroyed, soul_bridge/current, caronte_ferry cues | missing (unblocked: WORLD_KIT.md and RENDER_KIT.md both STATUS: READY) | src/content/bosses/<id>/arena.ts |
| 16 | Requests to other streams | none needed so far | docs/requests/act1.md |

## Next

1. Cavaliere model, volume pass: the plate-style humanoid body reads as a thin mannequin (ball joints, stick limbs) up close and
   on foot. Add a long surcoat/tabard skinned over chest/hips/thighs (cloth over the plate), thicker greaves/vambraces, make
   the cloak hang wider over the horse's rump; check the hood frames the sallet from the front (on foot, outside the
   transition aura). Then check `counter_stance` / `salute` clips read (pose screenshots with fightPaused during the
   telegraph), and the night charge out of the dark.
2. Arena dressing pianure_erba_alta (src/content/bosses/cavaliere_errante/arena.ts): ring of leaning standing stones at
   r ≈ 36 leaving the gate (z 96) and the north exit path (z 164 → 195) open; taller golden grass band (render-only
   PropField tall_grass) outside r 30; GlowSet; cues cavaliere_dismount (trampled ring / dust), cavaliere_into_dark /
   out_of_dark (night), cavaliere_lantern (a warm glint on death). The biome cover already grows inside the arena.
3. Elder Tree: model (tree family; pose clips for root_call, branch_whip_l/r, branch_slam, shake_canopy, root_stomp,
   heart_pulse via RigVisualOpts.clips since data/anim has no tree.yaml yet; heart part sphere [0, 2.3, 2.95] with flag
   heart_open showing the light) + arena foresta_cuore (black canopy, luminous mushrooms, roots; cue first_light = a shaft
   of dawn light through the canopy on death, elder_heart_open). Boss spawns at z ≈ 132 (north side).
4. Then palude, devourer (arena_state pier_destroyed), caronte (soul_bridge / current, caronte_ferry).
5. Optional bot polish (unchanged): Caronte NG+ 3.7 hits, Devourer 3.3–3.6 hits.

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
- Chunk 2 (2026-11-03): tests/act1.test.ts (27 tests, `npx vitest run tests/act1.test.ts` 27/27 pass, ~0.5 s): cavaliere
  dismount at 50% (flags, parts off, foot radius, cue, lunge opener), guard_dive only on an open guard, counter stance
  (frontal hit parried → riposte, back hit → stagger + cue), notte dark (hidden+untargetable, visible before active), alba
  salute + no attacks on a drinking/knocked-down player, grants/canon line; elder front cone, heart inactive in p1 / active
  in p2, bark x0.5 vs heart x2.5 poise (4 heavy blows to Spezzato on the heart vs 16 on the bark), first_light on death;
  palude every voice key IT+EN + clue, emerge opener, every telegraph preceded by its family's sfx + caption ≥ VOICE_LEAD
  before, split → 3 figures in order, one at a time, shared HP, boss dies with the third; devourer submerged ⇒
  hidden+untargetable, surfaced streak ≤ 4 between dives, p2 pier_destroyed variant + cue + no stilts; caronte bridge at
  78% (variant soul_bridge, waits on the landing), p2 current variant + drift ≈ 0.85 m/s, ToD souls (giorno 3 fast /
  tramonto 5 / notte 10 slow); NG+ per boss: ng ids defined, not in base patterns, never available/used at ngCycle 0,
  available+used at ngCycle 1; palude figures' `requires: ng` attacks only in NG+.
- Chunk 2, double_slam: not a fairness problem. Trace (scratchpad act1/slam2.ts): bot.threats() saw the fist box all through
  the last 0.25 s of the telegraph (t=0.08 at active -0.03, player 3.2 m from the center, dead ahead), but the shared
  `ringJump` returned a hold-still input for any wind-up that spawns a low ring, so the generic roll never ran. Fix in
  tools/bot/hooks/cavaliere_errante.ts: while holding for a ring, a non-jumpable threat ≤ 0.1 s away hands control back to the
  generic dodge. Bot (seeds=3, all PASS): palude 149 s/220, 0.7 hits (was 4.7), sloppy 0/3 (5.3 hits); cavaliere 111 s/180,
  0.0, sloppy 3/3 with 11.7 hits; elder 95 s/200, 2.3, sloppy 1/3; devourer 229 s/240, 2.0, sloppy 0/3; caronte 181 s/240,
  1.3, sloppy 0/3.
- Chunk 2, variant bot passes (scratchpad act1/variants.ts = runFight with opts.tod / sim.state.ngCycle=1, seeds=3; target is
  the base-game 120+20×D, NG+ has x1.15 Health): NG+ cavaliere 155/142/154 s, 1.7 hits, sloppy 0/3; elder 125/118/120,
  2.7, sloppy 0/3; palude 187/186/197, 3.0, sloppy 1/3 (8 hits); devourer (after HP fix) 249/229/281, 1.0, sloppy 0/3;
  caronte 183/190/172, 3.7, sloppy 0/3 — hit attribution shows no NG+-only attack among the hits. ToD: cavaliere alba
  102–107 s, 0.0 hits, sloppy 2/3 (13.7 hits); notte 124–148 s, 1.3 hits, sloppy 3/3 (17 hits); caronte giorno 163–177 s,
  0.3 hits; notte 184–190 s, 1.7 hits, sloppy 1/3 (10.3 hits). All perfect runs won, 0 deaths.
- Great Devourer `hp_override` 5200 → 4800 (margin): base perfect 223/226/213/224/227 s (5 seeds) of 240, sloppy 0/5;
  balance-bot seeds=3: PASS 220 s, 3.3 hits, sloppy 0/3 (14.3 hits).
- End of chunk 2: `npx tsc --noEmit -p tsconfig.json` clean (whole tree); eslint clean on tests/act1.test.ts +
  tools/bot/hooks/cavaliere_errante.ts; `npm run registry && SM_PARTIAL=1 npm run data` ok (1026 it / 1026 en); canon audit for
  act1 bosses: only "no music theme data" (audio stream) and "no model builder" (blocked on RENDER_KIT.md).

- Chunk 3 (2026-11-03): docs/RENDER_KIT.md appeared with STATUS: READY during the chunk (read in full; WORLD_KIT.md READY too).
  Cavaliere model src/content/bosses/cavaliere_errante/model.ts: own ActorVisual composing two kit models — mounted
  (mountedSkeleton, horse withers 2.6 m, knight 3.6 m, seat 0.82 w; family 'mounted') and on foot (humanoidSkeleton 3.6 m,
  family 'humanoid'); both get model-specific clips `salute` and `counter_stance` (RigVisualOpts-style extra clips on the
  Animator). On 'dismounted' the rider vaults down (0.55 s), the horse rears (rear_stomp telegraph) then gallops away from
  the player (≤ 11 m/s, drawn in actor-local space from its own world track) and is hidden after 7 s; a retry (flags back to
  'mounted') restores rider + horse; a load straight into p2 shows no horse. FX uniforms copied from the mounted model to the
  foot model every frame (hit flash, Spezzato, dissolve, aura). Lantern on a 2-bone spring chain (saddle, then belt) with an
  ember surface that warms only while dying (canon: lit for real only in the ending); road-line glow on the blade brightens
  in counter_stance / riposte. ~33k triangles on high for both models before trimming the blade-line boxes (measured), 13 + 9
  surfaces; tests/act1_models.test.ts asserts < 80k on every preset.
- Data: Cavaliere steed/rider part spheres moved onto the model (measured bones: steed chest y 2.46 z 1.27, body y 2.36
  z -1.27, head y 3.83 z 2.35, rider chest y 3.91, rider head y 4.49): steed [0,2.2,1.15] r1.2, [0,2.15,-1.05] r1.25,
  [0,3.5,2.3] r0.65; rider [0,3.7,-0.15] r0.75, [0,4.6,-0.1] r0.5. Body hurtboxes (on foot) unchanged — foot bones hips
  1.88 / chest 2.64 / head 3.21 sit inside them. Bot after the change (seeds=3): PASS perfect 3/3 avg 110 s / 180, 0.3
  hits; sloppy wins 2/3 with 12.3 hits.
- Screenshots (port 5181, 1280x576, scratchpad shots/cav2..cav4, alba / tramonto / notte, mounted + phase 2): mounted reads
  as a hooded green-cloaked rider on a grey horse with the lantern and saddlebag visible at follow distance; on foot the
  knight reads as a thin mannequin (Next 1). Note: with Vite watch off, restart the server after every edit (stale
  transforms otherwise; the first shot set showed a green horse from a stale module).
- End of chunk 3: `npx tsc --noEmit -p tsconfig.json` clean (whole tree); `npx vitest run tests/act1.test.ts
  tests/act1_models.test.ts tests/render_models.test.ts` 34/34 pass; `npm run registry && SM_PARTIAL=1 npm run data` ok
  (1071 it / 1071 en).
