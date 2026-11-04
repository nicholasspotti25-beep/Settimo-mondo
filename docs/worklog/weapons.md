# Work log — weapons (Vite port 5178)

Brief: docs/briefs/weapons.md. Owns src/sim/arts.ts, data/movesets/**, data/weapons/**, data/transitions/**,
data/projectiles/weapons.yaml, src/render/weapons/**, locales/{it,en}/weapons.yaml, tests/weapons*.test.ts, docs/WEAPONS.md.

## Status

| # | Deliverable | Status | Files |
| --- | --- | --- | --- |
| 1 | Movesets for all 38 types (light/heavy/run/jump keys, arc + anim, stamina, parry flags, ranged/catalyst/flexible specials) | done (data; validated by build-data, checked again by tests/weapons.test.ts) | data/movesets/*.yaml (38) |
| 2 | 38 weapon files (canon ids/types/categories, source_boss/D, model params, two Arts with exact names, poise_bonus) | done (data) | data/weapons/*.yaml (38) |
| 3 | 49 Transizioni (all ordered category pairs, names IT+EN) | done (data) | data/transitions/from_*.yaml (7 x 7) |
| 4 | src/sim/arts.ts: all 24 effects for all 78 Arts, deterministic, allocation-free | partial — all effects implemented; Act I weapons (starter + 6) verified by tests/weapons.test.ts in chunk 1; the remaining 31 weapons' Arts are not yet verified one by one | src/sim/arts.ts |
| 5 | Balance: roles distinct, DPS sanity table in docs/WEAPONS.md | partial — docs/WEAPONS.md written (damage model, roles, analytic DPS table for all 38); open item: catene / frusta / artigli light DPS 3.2–3.6x (multi-hit ticks) to be checked with the bot | docs/WEAPONS.md |
| 6 | Locales: desc for all, flavor for secondary/principal bosses' weapons (no flavor for the 7 mini-boss weapons), Art names + descs | done (320 lines IT + EN, build-data ok) | locales/{it,en}/weapons.yaml |
| 7 | src/render/weapons: buildWeapon (one template per type, 38 unique looks, <= ~3k tris, trail colors), installWeaponFx (swing trails, 78 Art VFX, Transizione flashes, pooled) | partial — dedicated templates + Art VFX for the 7 Act I weapons (14 Arts); the other 31 types use category templates (fallback.ts); swing trails, pooled slash arcs, root tendrils, Transizione flash (generic), snake-sword extension morph done | src/render/weapons/{index,types,forge,act1,fallback,fx}.ts |
| 8 | tests/weapons.test.ts (38 weapons + movesets valid, canon types, parry flags, damage formula, 49 transitions, every Art observable headless) | partial — all data checks + visuals for all 38; "Art observable" covers the 14 Act I Arts | tests/weapons.test.ts |

## Next

1. Art VFX legibility pass in daylight: the Act I Art visuals exist but several read faintly on the bright sepia
   Vetta/arena ground (additive light on a light floor): add a dark under-layer (alpha smoke ring / ground scorch decal)
   under bright bursts, larger Primo Passo / Carica wake, Ruota d'Argento wheel held longer, Radici roots visible from
   the follow camera; re-shoot each Art at its cue time (shoot script: scratchpad shoot.mjs, slow-mo 0.08–0.3).
2. Act II weapon templates in story order (triplice_guinzaglio catene, brace_eterna spadone, tuono_spezzacielo
   martello_da_guerra, brina_silente stocco, fenditura_ardente ascia_a_due_mani) + their 10 Art VFX + extend the
   "Art observable" test to them.
3. Balance check of catene / frusta / artigli multi-hit DPS with the bot (docs/WEAPONS.md open item).
4. Act III–VII templates (remaining 26 types) + Art VFX for the remaining Arts; Transizione flashes per category pair
   (today: one generic flash + linking arc for all 49).
5. Remaining morphs driven from sim state: shape-shifter forms, shears splitting, chakram / harpoon leaving the hand,
   bow string draw, chains/whip extension (EXTENDING already covers frusta/catene/flagello once their templates read
   `morph.extend`).
6. tests/weapons.test.ts: "every Art observable" for all 78 Arts; weapon gallery screenshot of all 38.

## Notes

- Chunk 1 (2026-11-04): inspected partial work; data/locales build clean (38 weapons, 38 movesets, 49 transitions).
  render/weapons was a stub.
- Built src/render/weapons/: `forge.ts` (merged vertex-colored meshes, <= 3 surfaces + pieces/instanced parts),
  `act1.ts` (7 dedicated templates: spada_corta crescent-pommel starter, lancia white shaft + gold spiral + vamplate +
  leaf head with broken-crown engraving, spada_lunga slim blade with glowing winding "roads" + lantern pommel,
  bastone_magico twisted living wood + seed of light + color-cycling leaves + mushrooms, mazza bog-oak burl + reeds +
  bones + swinging marsh lanterns, spada_serpentina serpent-head guard + instanced scale segments + fang tip that extends
  to 4.6 m on whip swings / Sibilo / Avvolgimento, alabarda black oar + paddle blade with ground edge + hook + spirit
  lantern + river runes), `fallback.ts` (category templates for the other 31 types), `fx.ts` (installWeaponFx).
- installWeaponFx: swing ribbon trails (Catmull-Rom, sim-time aging so they freeze in hit-stop and stretch in slow-mo,
  off-hand ribbon for dual weapons), pooled slash arcs (14 shader-swept arc strips), pooled root tendrils (one
  InstancedMesh), Art cast flare along the blade, Transizione flash + linking arc, 14 Act I Art visuals
  (`registerVfx('art_*')`, generic element-colored fallback for the other 64). All pooled at install; no per-frame
  allocation in the update path.
- Verification: `npx tsc --noEmit -p tsconfig.json` 0 errors (whole tree); `npx vitest run tests/weapons.test.ts` 12/12
  (data, canon, parry, stamina, swing arcs, 18 + 4D, 49 transitions, locales, 14 Act I Arts connect within budget with
  their cues / bind / slow / projectiles / counter, all 38 weapons build on low/medium/high <= 3600 tris, snake-sword
  extends and retracts); `npm run registry && SM_PARTIAL=1 npm run data` ok; balance bot `elder_tree
  mostro_della_palude caronte --seeds=2` 3/3 PASS with owned non-starter weapons (perfect 93 / 143 / 175 s vs targets
  200 / 220 / 240 s). Headless 1280x576 shots of all 7 Act I weapons in hand + their Arts looked at: weapons read
  well; trail visible (lance light swing); Ninnananna cut of light visible; several Art FX faint in daylight (Next 1).
  Scene in the Guardiano arena with a weapon: ~85 calls / ~120k tris.
- Requests: docs/requests/weapons.md #3 resolved on the weapons side (art_* claimed), #4 satisfied by PortatoreVisual,
  new #7 for render-kit (polearm poses: lances point straight up in the thrust clip).
