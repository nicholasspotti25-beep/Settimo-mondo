# Work log — WORLD + ENVIRONMENT stream (Vite port 5176)

## Status

1. WorldRenderer — **partial**
   - done: WorldRenderer.ts (API kept: constructor(scene, ctx), loadZone(sim), onEvent, update, group, dispose; extras
     `atmosphere`, `sky`, `zoneVisual`, `sites`, `particles`, `arenaVisuals`, `busy`); custom ZONE_BUILDERS else generic
     builder; ARENA_BUILDERS per arena; cue forwarding; exposure; per-frame `ATMOS.uHazeK`.
   - done: atmosphere.ts, sky.ts, terrain.ts, biomes.ts, geo.ts, materials.ts, glsl.ts, env.ts, zone.ts, props/kinds.ts
     (46 kinds), props/field.ts, cover.ts, water.ts, landmarks.ts (registry), horizon.ts (14 builders), sites.ts,
     glows.ts, mist.ts, particles.ts.
   - done (chunk 3): sky god-rays now fan from a virtual source below the horizon and the focused glow core became a
     horizon band (no sun-like burst at any tod); summit biome: snowy rock, backdropHeight 260 (real drop to the world
     below).
   - missing: ship zones (zone.platform), act colour grading beyond tod tint, far-tree LOD.
2. Act I zones authored (data + builders) — **partial**
   - done: vetta_attesa (data/zones/vetta_attesa.yaml: organic bounds, terrain, colliders for castle + arch piers,
     props, landmarks castle_gate / summit_plaza / 2 arches / 3 ruins / world_below, particles, 3 Reperti) and
     castello_culla (data/zones/castello_culla.yaml: bounds polygon of 5 halls + loggia, nave column colliders,
     castle_hall x5 + loggia arcade + world_below, 3 Reperti; src/content/zones/castello_culla/zone.ts: no heightfield,
     crag under the castle). data/reperti/act1_world.yaml + locales/{it,en}/act1_world.yaml (6 Reperti).
     data/timeofday/castello_culla.yaml: brighter ambient (night interior readable).
   - missing: grandi_pianure, foresta_oscura, palude, fiume_anime (data skeletons only), their Reperti; climb walls.
3. Arena dressing src/content/bosses/guardiano_del_regno/arena.ts — **done** (paving + medallion over the whole circle,
   kerb, steps, balustrade open at the gate and the descent, ruined archway framing the gate, 8 guardian statues (one
   toppled), column stumps, braziers lit at dusk/night, stair down to the road; nothing solid inside r 24).
4. docs/WORLD_KIT.md — **done** (STATUS: READY; new section 4b: landmark builders + params + _kit helpers).
- Landmark builders (src/content/landmarks/**) — **partial**: done _kit.ts (helpers), castle_hall, castle_gate,
  summit_plaza, arch, ruins, world_below. Missing: bridge, walkway (rotten piers), docks, bone_gate, sunken cathedral,
  crater rim, painted cave, ice castle, taiga logs, drum circle, ships, observatory, dragon nests, mirror shrines, wind
  cliffs, yggdrasil, root tunnel, inverted palace, celestial terraces, greenhouse, hedge walls.
- tests/world_kit.test.ts — **done** (5/5 pass).
- data/skies, data/timeofday, data/palettes — present.

## Next

1. Budget check on the Vetta: medium at the spawn measured 258 calls / 425k tris (zs.mjs, giorno), more than High
   (78-122 calls / 204-336k). Find out why (shadow pass? quality-dependent prop counts?) and bring it under D3. Also
   trim Low (101 calls).
2. Vetta vista polish: a faint short pale line remains on the horizon NNE (the world_below far land, fully fogged); the
   world below still reads hazy from the east edge: lower its fog further or add a visible cliff edge + nearer cloud
   banks; generic boulder/cliff_rock props look like faceted eggs (props/kinds.ts).
3. Landmark builders still missing for Act I: bridge, walkway (rotten piers on stilts), docks (river port); then
   grandi_pianure, foresta_oscura, palude, fiume_anime authoring + 2-3 Reperti each (keep ids/arena/altar positions).
4. Fight check of vetta_piazzale with the Guardiano (startFightDirect) at 4 tods; one climb wall per zone.
5. Later-act landmark set (bone_gate, cathedral, ...), ship zones (platform), far-tree LOD, budgets per zone x quality
   table.
6. When render-kit enables HDR (post.ts HDR_ENABLED): re-check uHazeK = HDR_HAZE_K and the display-space fog/sky.

## Notes

- Chunk 1 (2026-10-15): started from the WorldRenderer stub + helper modules of an interrupted session (commit
  1082c5e); zone.ts imported 5 non-existent modules, so the tree did not typecheck. Created props/kinds.ts,
  props/field.ts, cover.ts, water.ts, landmarks.ts, horizon.ts and the real WorldRenderer.ts.
- Verification chunk 1: `npx tsc --noEmit -p tsconfig.json` → 0 errors (whole tree). Headless (port 5176, 1280×576)
  screenshots LOOKED at: vetta_attesa alba/giorno/tramonto/notte (high), grandi_pianure giorno/tramonto (high), giorno
  (low, medium). Fixes made from them: lights ×π (scene was ~25% too dark/brown), ambient desaturated and lowered
  (lavender flat look), glow core softened (read as a sun), god-rays narrowed/dimmed (night factor 0.12), cover tufts
  trimmed (4 blades), backdrop chord poke-through near the zone rim (light hard-edged patch on Low).
- renderer.stats grandi_pianure giorno: low 33 calls / 48k tris; medium 53 / 154k; high 63 / 254k (shadow pass
  included). vetta_attesa high: 26 calls / 166k. All within D3 (≤ 250 calls, ≤ 400k tris on High).
- Prop kinds (props/kinds.ts): twilight_tree, giant_tree, oak, pine, fir, birch, dead_tree, willow_tree, reeds, fern,
  tall_grass, mushroom_glow, flower_glow, rock, boulder, cliff_rock, pebbles, snowy_rock, obsidian_rock, ruin_column,
  ruin_arch, ruin_wall, gravestone, seeker_lantern, armor_remains, bones, dragon_bones, crystal, ice_spike,
  giant_clover, giant_grass, giant_flower, giant_mushroom, anvil, chains, sword_grave, ember_vent, marble_pillar,
  statue, hanging_garden, cloud_puff, void_shard, lily_pad, soul_light, log, stump. Unknown kinds fall back by name
  pattern (dev warning).
- Horizon convention: zone.horizon[].dir in degrees (0 = +Z north, 90 = +X east), dist in m from the zone centre.
- Scratchpad is shared with other streams: world capture script lives at
  <scratchpad>/world/wshot.mjs (args: zones, tods, quality, "x:z" player pos, "camYaw:pitch").
- Request sent: docs/requests/world.md (PCFSoftShadowMap removed in three 0.186 → console warning).
- Chunk 2 (2026-11-03, resumed after a usage-limit stop). Wash-out (docs/requests/render-kit.md, marked HANDLED): root
  cause = the follow camera backs out of the sealed vetta_piazzale through the Nebbia dell'Alba wall (player near the
  gate z 36-40); the additive wall veiled the whole lower screen and its arc ends read as vertical glow columns; the
  toneMapped:false layers also ignored the post pipeline's auto-exposure. Fix: ATMOS.uHazeK (direct path: final/base
  exposure of the last frame, pow 1.15 when dimming, max x1.12; HDR path: HDR_HAZE_K 0.45) in glows/mist/particles;
  wall fades within 2-12 m of the camera, 15% shimmer seen from outside the arena, grazing-angle fade; glows fade when
  the camera is inside them; gate pool 0.35->0.2, orb 0.16->0.11.
- Verification chunk 2 (1280x576, scratchpad world/c2/, LOOKED at): before b0_tramonto_0 (low, exposure 0.71, near-white
  veil + columns); after b1_* (low) and b2_* (high) tramonto/alba/giorno, follow + reverse cam: floor tiles, boss, player
  and HUD clear; high 64-65 calls / 175k tris, exposure 0.88-1.04, key 0.13-0.25. One zone per act at alba/giorno
  (z0_*, medium: grandi_pianure, landa_roghi, corona_bianca, little_garden, lago_nove_specchi, deserto_cenere,
  terrazze_celesti) reads; 34-105 calls, 66-263k tris. foresta_oscura notte (todp.png): dark violet, fireflies, stars.
  `npx tsc --noEmit -p tsconfig.json`: 0 errors in world files + tests/world_kit.test.ts; `npx vitest run
  tests/world_kit.test.ts`: 5/5 pass. WORLD_KIT.md example compiled against the tree (scratchpad world/kitcheck).
- Capture scripts (scratchpad world/): vite-w.mjs (private Vite 5176, hmr off), ws.mjs (boss fight: out quality tods
  boss:<id>|zone:<id> camsJSON), zs.mjs (zone sweep), dbgh.mjs (hide-one-layer debug). Page sometimes reloads once
  right after load (scripts retry). After sim.travel wait ~3 s+ before meditate: the arrival flow can override the tod.
- Chunk 3 (2026-11-04, resumed after a usage-limit stop). Landmark kit + 6 builders, Vetta + Castello authored,
  arena dressing, sky softened. Verification (1280x576, scratchpad world/c3/, LOOKED at): sheet_vetta.png (spawn
  road north, east vista, altar plaza -> arena; alba/giorno/tramonto/notte, high), sheet_castello.png (corridor, great
  hall nave, east loggia; 4 tods, high), g_pair.png (vista tramonto + hall notte after fixes), castle gate tramonto
  (v6_tramonto_2), overhead (v5_giorno_0). Fixes from the shots: sun-like ray burst (sky), sandy/grassy summit -> snowy
  rock, 40 m backdrop drop hid the world below -> 260, square mesa -> organic bounds, crag blobs poking through the
  castle front and the great-hall floor, mound bumps removed, styrofoam clouds smoothed, rim-lit horizon line
  (mostly fixed), castle night too dark (ambient 0.95).
  renderer.stats: vetta high 78-122 calls / 204-336k tris by view; castello high 37-67 / 128-198k; low: vetta 101 /
  123k, castello 34 / 83k; medium: vetta 258 / 426k (OVER, see Next 1), castello 74 / 265k.
  `npx tsc --noEmit -p tsconfig.json`: 0 errors in world files; `npx vitest run tests/world_kit.test.ts`: 5/5;
  `npm run registry && SM_PARTIAL=1 npm run data`: ok (1 arena + 1 zone builder registered).
- Capture: scratchpad world/c3.mjs (ws.mjs + seq.skip and a long wait after meditate: the meditate fade covers the
  first ~10 s, so the first cam of each tod is a dummy; cams accept "hide": [object names] for layer debugging).
- Castello layout (world coords): waking chamber z -113..-80 (W16), corridor -80..0 (W14, east side door bay 4 at
  z -35 -> loggia wing x 7..34), great hall 0..70 (W30, nave columns x +-8.5), gallery 70..112 (W12), exit z 105.
  The vista vista_culla_finestre moved to [28,0,-35] (loggia axis); vetta vista look lowered to the world below.

### Lead note (smoke shot boss_01, fight camera at vetta_piazzale)
- In the actual Guardiano fight view the arena paving/medallion segments read as thick slabs floating at different heights
  (raised plates with visible side faces, overlapping the path tiles). Check z-fighting/offsets and seat the paving flush
  with the terrain in the fight camera view (item 4: capture the fight at four times of day).
