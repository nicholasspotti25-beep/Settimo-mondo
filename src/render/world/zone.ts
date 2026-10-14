/**
 * Generic zone builder: builds a whole zone from data (biome -> terrain material, backdrop, ground cover, water,
 * PropScatterDef props via core scatterProps (same placements as the sim colliders), render-only biome dressing,
 * landmarks from the registry, horizon impostors). Custom src/content/zones/<id>/zone.ts builders call
 * `buildZone(def, ctx, opts)` and add their own objects to the returned visual.
 */
import * as THREE from 'three';
import type { ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { RenderCtx, ZoneVisual } from '../types';
import { createZoneEnv, type ZoneEnv } from './env';
import { TerrainMeshes, buildBackdrop } from './terrain';
import { PropField } from './props/field';
import { GroundCover } from './cover';
import { WaterSurface, waterKindFor } from './water';
import { buildLandmarks, type LandmarkInstance } from './landmarks';
import { buildHorizon } from './horizon';

export interface BuildZoneOpts {
  /** Skip the heightfield (interiors that model their own floor). Default: false. */
  noTerrain?: boolean;
  /** Skip the out-of-bounds backdrop ring. */
  noBackdrop?: boolean;
  /** Skip ground cover (grass/moss/reeds). */
  noCover?: boolean;
  /** Skip water. */
  noWater?: boolean;
  /** Use the biome's render-only dressing even when the zone has its own props. */
  dressing?: boolean;
  /** Override the ground cover definition. */
  cover?: import('./biomes').CoverDef | null;
}

/** A zone visual that custom builders can extend: add objects to `root`, updaters to `updaters`. */
export interface WorldZoneVisual extends ZoneVisual {
  env: ZoneEnv;
  landmarks: LandmarkInstance[];
  updaters: ((sim: Sim, dt: number, camera: THREE.Camera) => void)[];
  disposers: (() => void)[];
}

export async function buildZone(def: ZoneDef, ctx: RenderCtx, opts: BuildZoneOpts = {}): Promise<WorldZoneVisual> {
  const env = createZoneEnv(def, ctx);
  const root = new THREE.Group();
  root.name = `zone:${def.id}`;
  const updaters: WorldZoneVisual['updaters'] = [];
  const disposers: (() => void)[] = [];
  const type = def.terrain.type ?? 'heightfield';

  let terrain: TerrainMeshes | null = null;
  if (!opts.noTerrain && type !== 'void') {
    terrain = new TerrainMeshes(env.field, env.biome, ctx);
    root.add(terrain.group);
    const t = terrain;
    updaters.push((_s, _dt, cam) => t.update(cam));
    disposers.push(() => t.dispose());
    if (!opts.noBackdrop && env.backdrop !== 'none') {
      const bd = buildBackdrop(env.field, env.backdrop, env.backdropHeight, terrain.material, ctx.quality);
      root.add(bd);
      disposers.push(() => bd.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));
    }
  }

  // water
  const wk = opts.noWater ? null : waterKindFor(def, env.biome);
  if (wk) {
    const water = new WaterSurface(env, wk);
    root.add(water.mesh);
    updaters.push((sim, dt, cam) => water.update(sim, dt, cam));
    disposers.push(() => water.dispose());
  }

  // ground cover
  const coverDef = opts.cover === undefined ? env.biome.cover : opts.cover;
  if (!opts.noCover && coverDef && coverDef.type !== 'none' && type !== 'void') {
    const cover = new GroundCover(env, coverDef);
    root.add(cover.mesh);
    updaters.push((sim, dt, cam) => cover.update(cam));
    disposers.push(() => cover.dispose());
  }

  // props: data props (sim colliders agree) + biome dressing + out-of-bounds rim
  const props = new PropField(env);
  for (const p of def.props) props.addScatter(p, false);
  if (opts.dressing || def.props.length === 0) for (const p of env.biome.dressing ?? []) props.addScatter(p, true);
  if (env.backdrop !== 'none' && !opts.noBackdrop) for (const r of env.biome.rim ?? []) props.addRim(r.kind, r.count, r.scale);
  props.finish();
  root.add(props.group);
  updaters.push((_s, _dt, cam) => props.update(cam));
  disposers.push(() => props.dispose());

  // landmarks
  const landmarks = await buildLandmarks(def.landmarks, def, ctx);
  for (const l of landmarks) root.add(l.object);
  updaters.push((sim, dt) => {
    for (const l of landmarks) l.update?.(sim, dt);
  });
  disposers.push(() => {
    for (const l of landmarks) l.dispose();
  });

  // horizon impostors (regions ahead)
  if (def.horizon?.length) {
    const hz = await buildHorizon(def, ctx, env);
    root.add(hz.group);
    updaters.push((sim, dt, cam) => hz.update(cam, dt));
    disposers.push(() => hz.dispose());
  }

  const visual: WorldZoneVisual = {
    root,
    env,
    landmarks,
    updaters,
    disposers,
    update(sim: Sim, dt: number, camera: THREE.Camera) {
      for (const u of updaters) u(sim, dt, camera);
    },
    dispose() {
      for (const d of disposers) d();
      root.clear();
    },
  };
  return visual;
}
