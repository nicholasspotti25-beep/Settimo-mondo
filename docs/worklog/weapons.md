# Work log — weapons (Vite port 5178)

Brief: docs/briefs/weapons.md. Owns src/sim/arts.ts, data/movesets/**, data/weapons/**, data/transitions/**,
data/projectiles/weapons.yaml, src/render/weapons/**, locales/{it,en}/weapons.yaml, tests/weapons*.test.ts, docs/WEAPONS.md.

## Status

| # | Deliverable | Status | Files |
| --- | --- | --- | --- |
| 1 | Movesets for all 38 types (light/heavy/run/jump keys, arc + anim, stamina, parry flags, ranged/catalyst/flexible specials) | done (data; validated by build-data, checked again by tests/weapons.test.ts) | data/movesets/*.yaml (38) |
| 2 | 38 weapon files (canon ids/types/categories, source_boss/D, model params, two Arts with exact names, poise_bonus) | done (data) | data/weapons/*.yaml (38) |
| 3 | 49 Transizioni (all ordered category pairs, names IT+EN) | done (data) | data/transitions/from_*.yaml (7 x 7) |
| 4 | src/sim/arts.ts: all 24 effects for all 78 Arts, deterministic, allocation-free | partial — all effects implemented; Act I + II weapons (starter + 11, 24 Arts) verified one by one by tests/weapons.test.ts; the remaining 26 weapons' Arts are not yet verified one by one | src/sim/arts.ts |
| 5 | Balance: roles distinct, DPS sanity table in docs/WEAPONS.md | done — analytic DPS table for all 38 + bot check of the multi-hit weapons (catene / frusta / artigli not dominant on cerbero, mostro_di_magma, yeti: no nerf); follow-up: catene / frusta underperform vs the Mostro di Magma | docs/WEAPONS.md |
| 6 | Locales: desc for all, flavor for secondary/principal bosses' weapons (no flavor for the 7 mini-boss weapons), Art names + descs | done (320 lines IT + EN, build-data ok) | locales/{it,en}/weapons.yaml |
| 7 | src/render/weapons: buildWeapon (one template per type, 38 unique looks, <= ~3k tris, trail colors), installWeaponFx (swing trails, 78 Art VFX, Transizione flashes, pooled) | partial — dedicated templates + Art VFX for the 7 Act I and 5 Act II weapons (24 Arts); the other 26 types use category templates (fallback.ts); swing trails, pooled slash arcs, root tendrils, ground scorch decals, weapon auras, Transizione flash (generic), snake-sword + chain extension morphs done | src/render/weapons/{index,types,forge,act1,act2,fallback,fx}.ts |
| 8 | tests/weapons.test.ts (38 weapons + movesets valid, canon types, parry flags, damage formula, 49 transitions, every Art observable headless) | partial — all data checks + visuals for all 38; "Art observable" covers the 24 Act I + II Arts | tests/weapons.test.ts |

## Next

1. Act III weapon templates in story order + their Art VFX + extend the "Art observable" test (then Acts IV–VII:
   26 types remain on category templates); Transizione flashes per category pair (today: one generic flash + linking
   arc for all 49).
2. Remaining morphs driven from sim state: shape-shifter forms, shears splitting, chakram / harpoon leaving the hand,
   bow string draw; frusta / flagello templates read `morph.extend` (EXTEND_ANIM already covers whip/chain/hook/lash/
   flail anims).
3. tests/weapons.test.ts: "every Art observable" for all 78 Arts; weapon gallery screenshot of all 38.
4. Balance follow-up: catene / frusta underperform against the Mostro di Magma with the perfect bot (eff 0.24 / 0.45,
   11–23 hits taken): look at their lash recoveries and the bot's reach handling when Act II bosses are tuned.

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
- Chunk 2 (2026-11-04): **daylight legibility pass** (Next 1 of chunk 1). fx.ts: trails and slash arcs now blend
  premultiplied (`LIGHT_OVER_DARK`: rgb added, alpha darkens what is behind, `uDark` 0.3 trails / 0.4 arcs / 0.55 for
  the Ruota wheel), so bright light reads on bright sand and snow; `under()` puts a soft dark sprite (alpha layer,
  drawn before the additive one) behind every bright burst; new pooled `Scorches` (18-slot InstancedMesh, one draw
  call): ground decals with a ragged dark body + tinted rim (burns, rime, mud, craters, skid marks); dash wakes are
  bigger (bright streaks over dark under-streaks, ground dust, a skid scorch along the whole dash); the Ruota d'Argento
  wheel is swept then HELD 0.32 s as a full disc edge with a ground ring; Radici roots close around the target's body
  (radius >= body + 0.5 m, height scaled to the target), thicker, brighter rim/emissive, ground darkened for the whole
  bind. `WeaponVisual.aura` (mist / ember / spark / drip shed along the blade line of the equipped weapon, x3 while
  swinging, x4 under an Art or imbue) and `WeaponMorph.buff` (Lama Rovente imbue) added to the contract (types.ts).
- Chunk 2: **Act II templates** (src/render/weapons/act2.ts, story order): catene (Triplice Guinzaglio — three
  black-iron chains of instanced oval links hung from three points of a heavy ring, hanging under gravity in the weapon
  frame at rest, thrown out to 4.4 m fanned like three heads with a travelling whip wave on chain_/hook_/lash anims and
  on its Arts, barbed hooks with ember eyes, heat glints only when they bite), spadone (Brace Eterna — dark red
  flamberge whose whole blade snakes, an incandescent core strip in both fullers, additive shader flame sheets licking
  both edges that grow under Lama Rovente, flame-tongue quillons, ember pommel), martello_da_guerra (Tuono Spezzacielo
  — azure head bound in silver, octagonal striking face, back spike, forked storm runes, four live arcs re-placed along
  the haft every few frames, spark aura), stocco (Brina Silente — ultra-thin translucent ice blade with a sliver of
  light, swept frost-crystal hilt with knuckle bow, side rings and crystal finials, cold-breath mist aura at the point),
  ascia_a_due_mani (Fenditura Ardente — bearded black volcanic-rock blade, noise-displaced, lava veins branching from
  the haft and a molten line inside the edge with a slow heartbeat, charred haft, obsidian crown spike, lava drips).
  High-quality triangles: 2868 / 2932 / 2308 / 1794 / 2130.
- Chunk 2: **Act II Art visuals** (fx.ts): Tre Morsi (three alternating lashes, each ending in two ember jaws snapping
  shut), Guinzaglio (three hooks on ember lines, taut flickering chains while the target is dragged, slam crater),
  Onda Incandescente (tall cut into the ground, a burning furrow of scorches + flame tongues racing with the wave),
  Lama Rovente (flame ring, ground burn, fire climbing the blade; edge flames grow for the imbue), Schianto Tonante
  (sky bolt into the impact, eight forked ground cracks over dark under-streaks, scorched crater), Catena di Fulmini
  (bolt into the raised hammer; the sim's lightning_arc draws the bounces), Affondo Gelido (frost wake + rime skid,
  crystal burst with a hanging frost ring), Danza dei Cristalli (three needle lines of cold light ending in crystal
  stars), Frattura Magmatica (axe bite, crack scorches tearing forward with the fissure, spatter and black smoke),
  Eruzione (ember leap, crater, lava fountains, black smoke, rock).
- Tests: tests/weapons.test.ts covers the 12 Act I + II weapons (24 Arts) in the Art-observable and budget tests (pulls
  for grab_pull, freeze -> bound, hazards for ground waves, projectiles for Danza, lightning_arc for Catena), dedicated
  templates, <= 3000 tris on high + trail colors, and the chains extending to > 4 m and falling back to hang.
  The imbue burst is cast point-blank (1.2 m) in castArt, as it is a ring around the caster.
- Chunk 2: **bot check of the multi-hit weapons** (chunk 1 open item): perfect bot, forced single-weapon loadouts
  (weapon given before `runFight`), cerbero / mostro_di_magma / yeti x 2 seeds, eff = damage / (time x weapon damage):
  catene 1.23 / 0.24 / 0.85, frusta 1.37 / 0.45 / 1.01, artigli 1.48 / 1.35 / 1.26 vs stocco 1.26 / 1.11 / 1.28,
  katana 1.64 / 1.24 / 1.31, spadone 1.33 / 1.44 / 1.34, alabarda 1.28 / 1.11 / 1.10. No weapon dominates; no nerf.
  Table + verdict in docs/WEAPONS.md. Script: scratchpad dpsbot.ts.
- Chunk 2 verification: `npx tsc --noEmit -p tsconfig.json` 0 errors (whole tree); `npx vitest run
  tests/weapons.test.ts` 14/14; `npm run registry && SM_PARTIAL=1 npm run data` ok (38 weapons, 38 movesets, 49
  transitions). Headless 1280x576, **follow camera** (no inspect), Guardiano arena, each Art shot at its own cue +
  a sim delay (scratchpad cueshot.mjs, hooks `fx.registerHandler('vfx')` to time the shot in sim seconds, clears the
  weapon pools between shots via `zoneEnter`): all 24 Act I + II Arts by day (`giorno`, bright sepia paving), Act II +
  Radici + Fioritura by night (`notte`). Looked at every sheet. Reads well by day: Ninnananna cross + burst, Carica
  starburst, the held Ruota wheel, Fendente rising cut, Postura riposte, Radici roots now closing around the
  Guardiano (they were invisible: Roots aged in real time and had sunk by the cue under slow motion; now sim time),
  Fioritura fan, mud pits, Sibilo / Avvolgimento venom, Richiamo souls, Spinta water stroke, Tre Morsi jaws, Lama
  Rovente burn ring, Schianto Tonante crater, frost rings and crystal stars, Eruzione crater. Fixed after the first
  pass: Guinzaglio's chains (thicker taut line over a dark under-dot), Frattura Magmatica (12 overlapping narrow crack
  decals with a molten rim + glowing seam streaks: now one molten line from the axe to the target, day and night),
  Catena di Fulmini (a stationary jagged bolt column of flashes over a dark core from the sky into the hammer; the
  falling streaks had left the frame by the cue). Act II weapons in hand looked at in close-ups (scratchpad
  gallery.mjs): chains hang as three black-iron strands, flamberge dark red with its core and edge flames, azure
  hammer, ice rapier, lava-veined rock axe. Scene with an Act II weapon: ~58–69 calls / ~110–125k tris.
- Harness note: under swiftshader the sim advances ~0.1–0.3 s per real second (frame dt clamp), so shot scripts
  must wait in sim time (`sim.time`), never in real time.
