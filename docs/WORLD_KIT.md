STATUS: READY

# World kit — dressing zones and arenas

How content streams dress their zones and boss arenas with the world stream's code (src/render/world/**). Everything
below matches the code as it is today; if something you need is missing, ask in docs/requests/<your-stream>.md.

## 1. Who draws what

`WorldRenderer` (src/render/world/WorldRenderer.ts) owns the world part of the scene. On every zone load it builds, in
this order:

1. **Atmosphere + sky** (always): time-of-day blend, Lungo Crepuscolo sky dome, fog matched to the horizon, one
   hemisphere + one directional light, exposure. Driven by `data/timeofday/<zone.timeofday>.yaml` -> `data/skies/*.yaml`.
2. **Zone visual**: `src/content/zones/<zoneId>/zone.ts` if it exists (registry), else the generic data builder
   `buildZone(def, ctx)` (src/render/world/zone.ts): terrain chunks, backdrop ring, ground cover, water, data props,
   biome dressing, landmarks, horizon impostors.
3. **Sites** (automatic for every zone, custom or generic; src/render/world/sites.ts): altars of the zone (+ the
   Cavaliere's lantern once `state.items` has `lanterna_del_cavaliere`), the Nebbia dell'Alba wall at every arena gate
   (shown while the arena is sealed or its fight runs), Reperti by kind (hidden once collected), exits by kind (lit once
   open), vista cairns. **Do not build your own fog gate, altar or exit visuals.**
4. **Particles** (automatic): `zone.particles`, else the biome's list.
5. **Arena dressing**: for every id in `zone.arenas` that has a registered builder.

Placement rule shared with the sim: terrain heights come from `core/terrain.ts` `Terrain.heightAt` and data props from
`scatterProps` with the same avoid list (`altarAvoid`) as the sim colliders, so what you see is what collides. Inside
every arena the core terrain is flattened to `arena.floor_y` and the terrain shader paves it (arena mask in the field
texture); props never scatter inside an arena.

## 2. Registering builders

| What | File | Default export | Registered by |
| --- | --- | --- | --- |
| Arena dressing | `src/content/bosses/<bossId>/arena.ts` | `ArenaBuilder` | `npm run registry`, keyed by the ARENA id read from `data/bosses/<bossId>.yaml` `arena:` (bosses sharing an arena share the first builder found) |
| Custom zone | `src/content/zones/<zoneId>/zone.ts` | `ZoneBuilder` | `npm run registry` |
| Landmark | `src/content/landmarks/<builder>.ts` | `LandmarkBuilder` | nothing: discovered by `import.meta.glob` (files starting with `_` are helpers, not builders) |

Types (src/render/types.ts, src/render/world/landmarks.ts):

```ts
type ArenaBuilder = (def: ArenaDef, zone: ZoneDef, ctx: RenderCtx) => ArenaVisual;
interface ArenaVisual {
  root: THREE.Object3D;
  update(sim: Sim, dt: number): void;     // every frame
  setState?(state: string): void;         // arena_state keyword (see 5)
  onCue?(id: string): void;               // every sim/sequence cue
  dispose(): void;
}
type ZoneBuilder = (def: ZoneDef, ctx: RenderCtx) => Promise<ZoneVisual>;   // ZoneVisual: root, update(sim, dt, camera), onCue?, dispose
type LandmarkBuilder = (def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx)
  => THREE.Object3D | { object: THREE.Object3D; update?(sim, dt): void; dispose?(): void } | Promise<...>;
```

A landmark is placed by the caller at `def.pos`, rotated by `def.yaw` (radians), scaled by `def.scale`; build it around
its own origin. `params` carries free per-instance options. Without a custom `dispose` the tree is disposed with
`disposeTree`. Unknown builder ids log a warning and are skipped.

A custom zone.ts normally starts from the generic builder and adds to it:

```ts
import { buildZone } from '../../../render/world/zone';
export default async function build(def: ZoneDef, ctx: RenderCtx) {
  const v = await buildZone(def, ctx, { noCover: false });   // BuildZoneOpts: noTerrain, noBackdrop, noCover, noWater, dressing, cover
  v.root.add(myObjects);
  v.updaters.push((sim, dt, cam) => { /* animate */ });
  v.disposers.push(() => disposeTree(myObjects));
  return v;   // WorldZoneVisual: env, landmarks, updaters, disposers
}
```

## 3. Zone data (data/zones/<id>.yaml) read by the visuals

| Field | Visual effect |
| --- | --- |
| `biome` | terrain surface layers, ground cover, atmosphere modifiers, default dressing, particles, backdrop, water kind. Biomes: castle, summit, plains, dark_forest, swamp, river_souls, hell_gate, pyres, tempest, cocytus, forges, cathedral, volcano, snow_peaks, ice_castle, taiga, ship_river, river_port, ship_sea, giant_garden, greenhouse, bone_plateau, nests, observatory, mirror_lake, wind_cliffs, world_tree, hollow_root, upturned_plain, ash_desert, upturned_palace, celestial, collapse, cloud_sea |
| `terrain` | `type` heightfield (default) / interior / deck / void (no terrain, no cover) / islands; interior, deck and void have no backdrop ring. `bumps`, `noise`, `flats`, `path_flatten`, `rim`, `water_level` shape the shared heightfield |
| `path` | carved corridor (path surface in the terrain shader, props keep `avoid_path` away) |
| `props` | `PropScatterDef[]`: `{kind, count, area?: [x0,z0,x1,z1], seed?, scale?: [min,max], avoid_path?, collide?}`. Exact sim placement. When `props` is empty the biome's render-only dressing is used instead |
| `landmarks` | `{builder, pos, yaw?, scale?, params?}` (section 2) |
| `water` | `{level, kind, area?}`; kinds: swamp, souls (river of souls: black, drifting lights), river, sea, mirror, lava, cloud, ice. Without `kind` the biome's water kind is used |
| `particles` | list of kinds, optional density factor `kind*factor` (e.g. `mist*0.5`): fireflies, embers, snow, pollen, ash, souls, stars, rain, lightning (distant bolts + atmosphere flash), mist (ground banks), dust, spores |
| `horizon` | `{builder, dir, dist, scale?}`; `dir` in DEGREES (0 = +Z north, 90 = +X east), `dist` in m from the zone centre. Builders: mountains, cliffs, castle, forest, dark_forest, ruins, plains, swamp, river, red_glow, volcano, ice_castle, yggdrasil, sea_cliffs |
| `altars`, `arenas`, `exits` (`kind`: walk, boat, ship, stair, root, portal, ritual, fall), `vistas`, `reperti` | drawn by the sites layer (section 1.3) |
| `timeofday` | id of data/timeofday/<id>.yaml (per-tod `{sky, fog, ambient}`) |

Prop kinds (src/render/world/props/kinds.ts, `PROP_KIND_IDS`): twilight_tree, giant_tree, oak, pine, fir, birch,
dead_tree, willow_tree, reeds, fern, tall_grass, mushroom_glow, flower_glow, rock, boulder, cliff_rock, pebbles,
snowy_rock, obsidian_rock, ruin_column, ruin_arch, ruin_wall, gravestone, seeker_lantern, armor_remains, bones,
dragon_bones, crystal, ice_spike, giant_clover, giant_grass, giant_flower, giant_mushroom, anvil, chains, sword_grave,
ember_vent, marble_pillar, statue, hanging_garden, cloud_puff, void_shard, lily_pad, soul_light, log, stump. Unknown
kinds fall back by name pattern with a dev warning. Collider radii come from `core/terrain.ts` `propColliderRadius`.

## 4. Helpers for arena.ts / zone.ts / landmark code

All in src/render/world/ (import with relative paths from src/content/...).

- **`zoneEnv(def, ctx)`** (env.ts): the env of the zone being built — `terrain` (core Terrain), `field`,
  `biome`, `avoid`, `heightAt(x, z)` (exact terrain inside the bounds, backdrop outside), `density` (quality factor).
  Always put things on the ground with `env.heightAt`.
- **`Parts`** + primitives (geo.ts): `box, cyl, cone, sphere, lathe, torus, plane, extrude, archShape, tube, blob,
  displace`, `mat4(pos, rotXYZ, scale)`, `alignY(a, b)`, seeded `R` (`range`, `int`, `sign`). `parts.add(geo, slot,
  {color: hex | [bottom, top], cover?, aoBottom?, jitter?, wind?, emissive?}, matrix)`; slots: matte, foliage, gloss,
  metal, glass, glow, impostor. `parts.build({matte: {detail, breakup, rim}}, shadows)` merges everything into ONE mesh
  per slot with the world materials (atmosphere fog, moss/snow cover, wind, rim). `disposeTree(obj)` frees it.
- **`worldMat(kind, opts)`** (materials.ts): the shared cached world materials if you need a material directly;
  **`useWorldFog(material)`** patches any three material (e.g. a kit material) to use the world fog so it melts into
  the horizon like everything else; `atmosUniforms()` + `GLSL_ATMOS_PARS` / `GLSL_NOISE` (glsl.ts) for custom shaders.
- **`GlowSet`** (glows.ts): all small lights of a builder in one draw call. `add({pos, color, size, height?, intensity,
  mode: 'orb' | 'beam' | 'pool' | 'glint' | 'flame', phase?, on?})` -> index; `finish()` once; `setOn(i, 0..1)` fades;
  `update(dt)` each frame; add `glows.mesh` to your root. No real lights: never add THREE point/spot lights.
- **`DawnMist`** (mist.ts): `DawnMist.wall(...)` / `DawnMist.disk(at, yaw, radius, {core, edge})` luminous dawn
  mist (the fog gates use it already; use the disk for a portal-like effect in your arena). `set(0..1)`, `update(dt)`.
- **`PropField`** (props/field.ts): extra instanced scatters with the zone's kinds: `new PropField(env)`,
  `addScatter(def, renderOnly)`, `finish()`, `update(camera)`. Render-only scatters do NOT collide: anything solid
  must also be a sim collider (`arena.obstacles` / `zone.colliders`).
- **`WaterSurface(env, kind)`**, **`GroundCover(env, coverDef)`**: the generic builder's water and grass, reusable in
  custom zones.
- **`ATMOS`** (atmosphere.ts): shared uniforms by reference (`uTime`, `uNight` 0 day..1 night, `uWind`, fog, glow
  direction, light colors, `uHazeK`). Additive / `toneMapped:false` materials must multiply their output by `uHazeK`
  (auto-exposure / HDR scale) or they wash the screen out when the camera faces the alba/tramonto glow.

## 4b. Landmark builders (src/content/landmarks/)

Place with `landmarks: [{builder, pos, yaw, scale, params}]` (pos y = ground height at pos; builders that settle on
the terrain sample `env.heightAt` themselves). No builder creates sim colliders: add `zone.colliders` (or arena
`obstacles`) for anything solid on a route.

| Builder | What | params (default) |
| --- | --- | --- |
| `castle_hall` | pale-stone interior along local +Z, floor y 0: walls with huge pointed windows (tracery), piers + buttresses, vault ribs and pointed vault, end walls with great door / rose window, nave arcade, paved floor with runner, fallen stones, live window light shafts | length 40, width 14, height 16, bays length/8, roof broken/vault/open, endN/endS door/open/wall/rose, doorWidth (doorWidthN/doorWidthS), windows both/west/east/none, doorE/doorW (side door bay), sideDoorWidth, aisles false, aisleX width*0.28, tiles, shafts, shaftStrength 0.075, debris, style, seed. Walkable bounds: width/2 - 1.6; aisle columns at x = +-aisleX, z = -length/2 + i*length/bays (i = 1..bays-1), cylinder r 1.1 |
| `castle_gate` | castle exterior facing +Z: curtain walls + battlements, gatehouse with pointed gate (violet light in the passage, raised portcullis, broken-crown emblem, guardian statue niche), round towers with slate cones, keep with glowing windows and spires, rocky crag below | width 100, height 24, gateWidth 9, keep true, crag true, style, seed |
| `summit_plaza` | round plaza: compass medallion, concentric slab rings, kerb, steps down, broken balustrade with gaps, bronze braziers lit at dusk/night | radius 9, rings 3, center true, steps 2, balustrade 0.75, gaps '0,180' (deg, 0 = +Z), gapWidth 6, braziers 4, style, seed. `plazaParts()` reusable from arena.ts |
| `arch` | freestanding archway / arcade along local X (opening faces +Z), voussoirs + keystone, spandrels and cornice when intact, broken variant with fallen blocks | span 6, height 5, depth 1.6, bays 1, broken 0..1, pointed false, style, seed. Piers at x = -total/2 + 0.8 + i*(span + 1.6) |
| `ruins` | wall fragments with jagged tops (window/doorway), standing/broken/fallen columns, toppled lintel, rubble, paving, settled on the terrain | radius 9, walls 3, columns 4, height 5, style, seed |
| `world_below` | the panorama from a summit: land far below, plains + road, dark forest + Elder Tree shadow, swamp lights, river of souls, red glow, great peaks, sea of clouds (hazy impostors, 2-3 draw calls) | depth -240, clouds 1, seed. Place at the zone centre |

Styles: pale (default), stone, dark, marble, black, warm. Helpers for your own builders (`_kit.ts`, files starting with
`_` are not builders): `wallShape` (wall face with arched openings, doorways and a free top profile), `extrudeWall`,
`archCurve` / `archBand` / `voussoirs`, `column`, `statue` (guardian on a plinth, poses sword/spear/kneel/mourner,
`broken`), `slabRing`, `groundLocal`, and `LightShafts` (additive window shafts aimed at the live key light; only windows
facing the light show; `add(center, halfWidthAxis, halfHeightAxis, inwardNormal)`, `finish(strength)`).

## 5. Arena states, cues and the fight

- A boss phase with `arena_state: <state>` calls `sim.setArenaVariant(state)` (bounds/obstacles/surface/gravity from
  `arena.variants[state]`) and emits the cue `arena_state:<state>`; a reset (death, retry, fight end) emits
  `arena_state:default`. Sequence steps `arena_state {state}` do the same.
- The WorldRenderer forwards **every** `cue` event: ids starting with `arena_state:` call `setState(<state>)` on every
  arena visual of the zone (check `sim.fight?.arena === def.id` in `update` if several arenas share a zone), then
  `onCue(id)` on every arena visual and on the zone visual. Cues whose id starts with `lightning` also flash the
  atmosphere and fire a distant bolt.
- In `update(sim, dt)` read what you need directly: `sim.fight` (`active`, `arena`, `won`), `sim.boss` (`pos`, `yaw`,
  `flags` set by phase `on_enter`), `sim.zone.sealed.has(arenaId)`, `sim.state` (defeated bosses, items).
- `setState` must be idempotent and instant-safe (a save can load straight into a variant); ease visual changes in
  `update` rather than snapping in `setState`.
- Keep `arena.gate` clear (the Nebbia dell'Alba wall stands there, `gate.width` wide) and keep dressing outside the
  walkable floor unless it is also an `obstacles` collider.

## 6. Budgets and rules

- Whole scene (D3): ~250 draw calls / ~400k triangles on High, far less on Low. An arena dressing should stay within
  ~15-25 draw calls and ~60k triangles on High (Parts merges to one mesh per slot; one GlowSet per builder).
- Quality via `ctx.quality` ('low' | 'medium' | 'high'): drop small detail and shadows on Low (`parts.build(opts,
  ctx.quality !== 'low')`).
- No per-frame allocation in `update` (reuse vectors), no real lights, no `Math.random` (use `R` with a seed so the
  dressing is identical every load), every visible string through locales.
- Dispose everything you create in `dispose()` (geometries + non-shared materials; `disposeTree` does both).

## 7. Example: an arena dressing

```ts
// src/content/bosses/<boss>/arena.ts
import * as THREE from 'three';
import type { ArenaDef, ZoneDef } from '../../../core/types';
import type { Sim } from '../../../sim/sim';
import type { ArenaVisual, RenderCtx } from '../../../render/types';
import { zoneEnv } from '../../../render/world/env';
import { Parts, R, cyl, box, mat4, disposeTree } from '../../../render/world/geo';
import { GlowSet } from '../../../render/world/glows';

export default function build(def: ArenaDef, zone: ZoneDef, ctx: RenderCtx): ArenaVisual {
  const env = zoneEnv(zone, ctx);
  const root = new THREE.Group();
  root.name = `arena:${def.id}`;
  const r = new R(7);
  const p = new Parts(11);
  const [cx, , cz] = def.center;
  const rad = def.radius ?? 20;
  // ring of broken pillars just outside the walkable circle, skipping the gate side
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = cx + Math.sin(a) * (rad + 1.5), z = cz + Math.cos(a) * (rad + 1.5);
    if (Math.hypot(x - def.gate.pos[0], z - def.gate.pos[2]) < def.gate.width + 2) continue;
    const h = r.range(2, 6);
    p.add(cyl(0.55, 0.65, h, 10), 'matte', { color: ['#6a645a', '#b9b1a0'], aoBottom: 0.6 }, mat4([x, env.heightAt(x, z) + h / 2 - 0.1, z], [0, r.range(0, 6), r.range(-0.08, 0.08)]));
  }
  p.add(box(3, 0.4, 3), 'matte', { color: '#8a8274' }, mat4([cx, env.heightAt(cx, cz) + 0.1, cz]));
  root.add(p.build({ matte: { detail: 0.9, breakup: 0.3 } }, ctx.quality !== 'low'));
  const glows = new GlowSet(`arena-glows:${def.id}`);
  const brazier = glows.add({ pos: [cx, env.heightAt(cx, cz) + 1.2, cz], color: '#ffb468', size: 2.2, intensity: 0.4, mode: 'orb', on: 0 });
  glows.finish();
  root.add(glows.mesh);
  let broken = false;
  return {
    root,
    setState(state) { broken = state === 'collapsed'; },
    onCue(id) { if (id === 'brazier_lit') glows.setOn(brazier, 1); },
    update(sim: Sim, dt: number) {
      const fighting = !!sim.fight && sim.fight.active && sim.fight.arena === def.id;
      if (!fighting && !broken) glows.setOn(brazier, 0);
      glows.update(dt);
    },
    dispose() { glows.dispose(); disposeTree(root); },
  };
}
```

Then run `npm run registry` (and `SM_PARTIAL=1 npm run data` if you changed data). The builder is picked up on the
next zone load; check it headless with `__game.sim.startFightDirect('<boss>', {skipIntro: true})`.
