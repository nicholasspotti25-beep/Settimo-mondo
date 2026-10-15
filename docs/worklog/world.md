# Work log — WORLD + ENVIRONMENT stream (Vite port 5176)

## Status

1. WorldRenderer — **partial**
   - done: WorldRenderer.ts wired (API kept: constructor(scene, ctx), loadZone(sim), onEvent, update, group, dispose;
     extras: `atmosphere`, `sky`, `zoneVisual`, `arenaVisuals`, `busy`). Loads custom zone builders from
     ZONE_BUILDERS (registry) else the generic data builder; loads ARENA_BUILDERS for every arena of the zone; forwards
     `cue` events (arena_state:<s> -> setState, lightning -> flash); rebuilds on quality change; sun shadow box on
     medium/high; exposure applied through scene.onBeforeRender (no Renderer edit needed).
   - done: atmosphere.ts (tod blending 2.8–3.2 s, zone change snaps, skyShade violet→gold retarget, ending/sunrise,
     act aurora, Act III night aurora ≥ 0.9, fog matched to the horizon, hemi + one directional, lights ×π for three's
     Lambert BRDF, desaturated ambient well under the key light).
   - done: sky.ts (gradient, sunless glow, god-rays softened, wisps + horizon banks, stars, aurora, sun disc only in
     ending/sunrise), terrain.ts (field = core heightAt, chunks/skirts/LOD, biome shader, backdrop ring without
     poke-through), biomes.ts, geo.ts, materials.ts, glsl.ts, env.ts, zone.ts (generic builder).
   - done: props/kinds.ts (45 kinds, see list in Notes) + props/field.ts (instancing, exact sim placements via
     scatterProps + env.avoid, CPU per-instance frustum/distance culling, rim ring on the backdrop, dressing thinned by
     quality); cover.ts (camera-following grass/moss/reeds/flowers/snowgrass, wind, translucency, fade); water.ts
     (swamp, souls, river, sea, mirror, lava, cloud, ice); landmarks.ts (registry via import.meta.glob of
     src/content/landmarks/*.ts); horizon.ts (14 silhouette builders).
   - missing: particles (fireflies, embers, snow, pollen, ash, souls, stars, rain, lightning, mist, dust, spores),
     altars (+ Cavaliere lantern), fog gates (Nebbia dell'Alba), Reperti visuals, diegetic exits, vista points,
     ship zones (zone.platform), act colour grading beyond tod tint, prop LOD for far trees.
2. Act I zones authored (data + builders) — **missing** (data files are skeletons: no props, landmarks, reperti, climb,
   horizon; no src/content/zones/<id>/zone.ts).
3. Arena dressing src/content/bosses/guardiano_del_regno/arena.ts — **missing**.
4. docs/WORLD_KIT.md — **missing**.
- Landmark builders (src/content/landmarks/**) — **missing** (registry loader ready, directory empty).
- data/reperti/act1_world.yaml + locales/{it,en}/act1_world.yaml — **missing**.
- tests/world*.test.ts — **missing**.
- data/skies (28 act presets + sunrise), data/timeofday (all zones), data/palettes — present (initial values; night
  presets may need darkening, see Notes).

## Next

1. Altars (stone + dawn-light glow; Cavaliere lantern when state.items has 'lanterna_del_cavaliere'), fog gates
   (Nebbia dell'Alba at arena.gate while sealed/fighting), Reperti visuals by kind (hidden once collected), diegetic
   exits by kind, vista points — src/render/world/{altars,gates,interact}.ts, driven from WorldRenderer.
2. Particles system (instanced quads, own system unless renderer.fx.particles appears) for biome particle lists.
3. Landmark builders set (castle shell/interiors + arched windows, ruins, arches, bone-and-iron gate, bridges,
   walkways/piers, docks, ...) in src/content/landmarks/.
4. Act I zones authoring: castello_culla (interior castle via landmarks), vetta_attesa (plaza, castle gate, vista,
   horizon), grandi_pianure, foresta_oscura, palude, fiume_anime + data/reperti/act1_world.yaml + locales; keep all
   ids/arena/altar positions; keep fog-gate passages clear.
5. vetta_piazzale arena dressing (guardiano_del_regno/arena.ts) matching data/arenas/vetta_piazzale.yaml.
6. Night look pass: stars barely visible near the glow at night (sky too lavender at the horizon); far-tree LOD.
7. Ship zones (platform), remaining landmark set for later acts.
8. tests/world*.test.ts (prop placement == sim colliders, kinds coverage, horizon/landmark registry), docs/WORLD_KIT.md,
   budgets per zone × quality, 4-tod screenshots per Act I zone.

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
