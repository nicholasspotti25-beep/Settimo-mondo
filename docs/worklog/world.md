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
   - done (chunk 4): grandi_pianure (tall grass road west to the ruined watch-hill of the vista altar, broken
     archway over the road, ruined stone bridge over the east gully, waystation ruins, oaks / twilight trees, armor
     and sword graves before the gate, horizon: dark forest ahead, castle + Vetta behind, red glow; 3 Reperti) and
     foresta_oscura (giant trunks, ferns, glowing mushrooms, logs, seekers' boardwalk over a mossy hollow, ring of dark
     standing stones, broken dark archway, gravestones; 3 Reperti). 12 Reperti in act1_world (IT + EN).
   - missing: palude, fiume_anime (data skeletons only), their Reperti; climb walls.
3. Arena dressing src/content/bosses/guardiano_del_regno/arena.ts — **done** (paving + medallion over the whole circle,
   kerb, steps, balustrade open at the gate and the descent, ruined archway framing the gate, 8 guardian statues (one
   toppled), column stumps, braziers lit at dusk/night, stair down to the road; nothing solid inside r 24).
4. docs/WORLD_KIT.md — **done** (STATUS: READY; new section 4b: landmark builders + params + _kit helpers).
- Landmark builders (src/content/landmarks/**) — **partial**: done _kit.ts (helpers), castle_hall, castle_gate,
  summit_plaza, arch, ruins, world_below, bridge, walkway (rotten piers), docks (chunk 4). Missing: bone_gate, sunken cathedral,
  crater rim, painted cave, ice castle, taiga logs, drum circle, ships, observatory, dragon nests, mirror shrines, wind
  cliffs, yggdrasil, root tunnel, inverted palace, celestial terraces, greenhouse, hedge walls.
- tests/world_kit.test.ts — **done** (5/5 pass).
- data/skies, data/timeofday, data/palettes — present.

## Next

1. Author palude (fog, rotten walkways with the `walkway` builder + platform pier for the deep water, seeker lanterns)
   and fiume_anime (black river of souls, `docks` at the crossing near the boat exit z 195, clear of the fiume_traghetto
   arena centre [0,0,-40]) with 2-3 Reperti each; screenshot the docks builder (built + typechecked, not yet seen).
2. Re-check grandi_pianure looking north: dark blobs floating near the top of the frame (dark_forest horizon impostor,
   scale lowered 1.2 -> 0.8, not re-shot) and the gully bridge from a viewpoint that shows the drop; foresta_oscura day
   reads hazy-bright for "light barely filtering" (data/timeofday/foresta_oscura: darker giorno, heavier canopy).
   foresta_oscura High measured 127 calls / 401k tris before trimming giant_tree 34 -> 28, fern 240 -> 200: re-measure.
3. Vetta vista polish: faint pale line on the horizon NNE (world_below far land), world below hazy from the east edge;
   generic boulder/cliff_rock props look like faceted eggs (props/kinds.ts).
4. One climb wall per zone (zone.climb).
5. Later-act landmark set (bone_gate, cathedral, ...), ship zones (platform), far-tree LOD, budgets per zone x quality
   table.
6. When render-kit applies docs/requests/world.md #2 (probe stats / probe from the frame) re-measure; when it enables
   HDR (post.ts HDR_ENABLED): re-check uHazeK = HDR_HAZE_K and the display-space fog/sky.

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

- Chunk 4 (2026-11-04). Item: Vetta performance (Next 1 of chunk 3) — DONE.
  Diagnosis (scratchpad world/c4/prof.mjs: per-pass calls/tris by world category via onBeforeRender/onBeforeShadow
  hooks, CPU profile of the build): (a) the "alternating" counts and "Medium > High" were the post pipeline's luminance
  probe: on the direct path it re-renders the whole scene into a 32x16 target every 0.3 s and `stats` sums it (Medium
  spawn 148 real -> 260 on a probe frame); (b) props cost one call per kind x variant x slot (Medium ~45 main + ~37
  shadow); terrain 15 + backdrop 10 calls; (c) the build: ~75% of it was synchronous shader compiling under SwiftShader
  (35 programs, plus a second render-target variant of every material compiled at the first probe), JS work 0.3-0.8 s;
  frames rendered between the build's awaits drew the half-built zone (and compiled it) mid-build.
  Fixes: WorldRenderer hides props / cover / particles / sites during passes into targets <= 64 px (probe-lite); the
  zone is built off-scene (stage group) and enters the scene in one step after `compile` of both the canvas and the
  probe variants (compileAsync where KHR_parallel_shader_compile exists, else compile + program link queries, all
  behind the loading fade); `world.buildStats` (ms per phase: env, zone.terrain/water/cover/props/landmarks/horizon,
  sites, particles, arenas, compile, total). PropField folds variants on lower qualities (High all, Medium <= 3 / 2
  small, Low 2 / 1 small; small = draw distance <= 260 m) and small kinds cast shadows on High only. Terrain chunks 56 /
  64 / 72 cells (High / Medium / Low), backdrop 3x3 blocks (2x2 on Low). Request: docs/requests/world.md #2 (render
  kit: report the probe separately in stats; better, probe from the drawn frame).
  Measured (1280x576, steady frame / probe frame): spawn High 145 / 198 calls, 290k / 469k tris (was 149 / 261);
  Medium 111 / 158, 219k / 368k (was 148 / 260, 228k / 428k); Low 68 / 108, 132k / 239k (was 102 / 205). Fight view
  (follow cam, tramonto): High 105 / 154, 278k / 432k; Medium 93 / 140, 243k / 385k; Low 55 / 98, 125k / 236k.
  Build (world.buildStats, travel castello -> vetta, machine load 2-4): 0.3-0.5 s JS when warm, ~2 s with the
  synchronous compile on Low (was 4-10 s); no mid-build frames of the new zone.
- Chunk 4. Item: arena paving in the fight view — DONE. Root cause: `slabRing` tilted each slab about the RING centre
  (mat4 pivot at the plaza centre), so a 0.012 rad tilt lifted / sank slabs at r 20 m by up to 25 cm: thick plates at
  random heights with visible sides. Now each slab is settled about its own centroid (tilt +-0.0035, height jitter
  +-6 mm), slab tops 2 cm above the flattened floor (y is the TOP: the slab spans [y - th, y]), 20 cm thick; medallion
  disc top at +3 cm with inlays/ring flush. Same fix for summit_plaza (shared plazaParts). Checked in the actual fight
  camera (startFightDirect guardiano, follow cam + overview) at alba/giorno/tramonto/notte on High (scratchpad
  world/c4/sheet_f2.png) and tramonto on Low/Medium/High (sheet_q.png): flush concentric paving, medallion, thin grout,
  no floating plates.
- Chunk 4. Item: Act I builders + zones — DONE for bridge, walkway, docks, grandi_pianure, foresta_oscura (palude and
  fiume_anime remain). Layout notes: plains watch-hill bump moved to [-160,-5] (was 2 m above the vista altar's flat:
  the altar sat in a pit); bridge deck at y -0.6 (ends meet the banks: terrain -1.8 / -0.1, gully bottom -9.8, sampled
  with core Terrain via scratchpad world/c4/h.ts); boardwalk deck at y -0.6 over the hollow (-3.8 centre). Colliders:
  archway piers on both roads, the 3 interior bridge piers. Ids, arenas, altars, gates and exits unchanged.
  Verification: screenshots 1280x576 at alba/giorno/tramonto/notte, High, 4 viewpoints per zone (scratchpad
  world/c4/sheet_gp.png, sheet_fo.png): plains = gold tall grass in wind, road, ruins on the hill, broken archway,
  fireflies at night; forest = giant trunks, mist, ferns, boardwalk with rail and stilts, standing stones, dark arch,
  fireflies, violet night. renderer.stats High: plains 133 calls / 369k, forest 127 / 401k (trimmed after).
- Verification chunk 4: `npx tsc --noEmit -p tsconfig.json` 0 errors (whole tree); `npx vitest run
  tests/world_kit.test.ts` 5/5; `npm run registry && SM_PARTIAL=1 npm run data` ok (1101 it / 1101 en strings);
  eslint on world files 0 errors (the two old unused-import warnings in castle_gate.ts / cover.ts removed).

### Lead note (smoke shot boss_02, grandi_pianure tramonto fight camera)
- A hard-edged orange/yellow elliptical blob (sun/glow disc on the horizon) top-left reads as a flat cut-out; soften it.
- A huge black flat-shaded tree canopy hangs over the top of the frame near the camera (a giant tree placed too close to
  the road/arena approach, or its LOD/shading is off) — move it away from the fight camera path or fix its shading.
- Distant trees on the hills are dark flat silhouettes with hard edges; consider the atmospheric fade.
