# Work log — WORLD + ENVIRONMENT stream (Vite port 5176)

## Status

1. WorldRenderer — **partial**
   - done: WorldRenderer.ts (API kept: constructor(scene, ctx), loadZone(sim), onEvent, update, group, dispose; extras
     `atmosphere`, `sky`, `zoneVisual`, `sites`, `particles`, `arenaVisuals`, `busy`); custom ZONE_BUILDERS else generic
     builder; ARENA_BUILDERS per arena; cue forwarding (arena_state:<s> -> setState, every cue -> onCue, lightning ->
     flash + bolt); exposure via scene.onBeforeRender; per-frame `ATMOS.uHazeK` (auto-exposure / HDR haze scale).
   - done: atmosphere.ts, sky.ts, terrain.ts, biomes.ts, geo.ts, materials.ts, glsl.ts, env.ts, zone.ts, props/kinds.ts
     (46 kinds), props/field.ts, cover.ts, water.ts, landmarks.ts (registry), horizon.ts (14 builders).
   - done (chunk 2, interrupted session, verified this chunk): sites.ts (altars + Cavaliere lantern, Nebbia dell'Alba
     fog gates, Reperti by kind hidden once collected, exits by kind lit once open, vista cairns), glows.ts (GlowSet),
     mist.ts (DawnMist wall/disk), particles.ts (fireflies, embers, snow, pollen, ash, souls, stars, rain, lightning,
     mist, dust, spores; `kind*factor`).
   - done: wash-out fix for the render-kit request (uHazeK on glows/mist/particles; fog-gate wall near-camera,
     camera-outside and grazing fades; gate pool/orb dimmed).
   - missing: ship zones (zone.platform), act colour grading beyond tod tint (post.ts grades per act now), far-tree LOD,
     sky god-rays read as a sunburst at tramonto on High (no disc, but rays converge to a point; soften).
2. Act I zones authored (data + builders) — **missing** (data skeletons: no props, landmarks, reperti, climb, horizon;
   no src/content/zones/<id>/zone.ts). Zones currently look empty (generic biome dressing only).
3. Arena dressing src/content/bosses/guardiano_del_regno/arena.ts — **missing** (terrain paves the arena floor).
4. docs/WORLD_KIT.md — **done** (STATUS: READY; example arena.ts typechecked against the tree).
- Landmark builders (src/content/landmarks/**) — **missing** (registry ready, directory empty).
- data/reperti/act1_world.yaml + locales/{it,en}/act1_world.yaml — **missing**.
- tests/world_kit.test.ts — **done** (kind coverage, prop placement == sim colliders, uHazeK, WORLD_KIT sync).
- data/skies, data/timeofday, data/palettes — present.

## Next

1. Landmark builders set in src/content/landmarks/ (castle shell/interiors + arched windows, ruins, arches,
   bone-and-iron gate, bridges, walkways/piers, docks, summit plaza/castle gate first), then the later-act set.
2. vetta_attesa authoring + vetta_piazzale dressing (guardiano_del_regno/arena.ts: broken statues, castle gate behind,
   world below at the edges; keep center [0,0,60] r 24, gate [0,0,36] w 6 clear), horizon vista from the Vetta.
3. Other Act I zones: castello_culla (interior castle via landmarks), grandi_pianure, foresta_oscura, palude,
   fiume_anime + data/reperti/act1_world.yaml + locales (2-3 Reperti per zone); keep all ids/arena/altar positions.
4. Sky: soften the tramonto god-ray convergence on High (reads like a sun); grandi_pianure distance haze a bit strong.
5. Ship zones (platform), far-tree LOD, budgets per zone x quality table, 4-tod screenshots per authored Act I zone.
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

