/**
 * Landmark registry: every file src/content/landmarks/<builder>.ts default-exports a LandmarkBuilder. Zone data
 * (`landmarks: [{builder, pos, yaw, scale, params}]`) places them; custom zone/arena builders may call `buildLandmark`.
 * Modules are discovered with import.meta.glob (lazy, one chunk each), so adding a builder needs no registry edit.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { RenderCtx } from '../types';
import { disposeTree } from './geo';

/** What a landmark builder returns: an object, optionally with an animation hook and a disposer. */
export interface LandmarkResult {
  object: THREE.Object3D;
  update?(sim: Sim, dt: number): void;
  dispose?(): void;
}

/** default export of src/content/landmarks/<builder>.ts. The object is placed at def.pos/yaw/scale by the caller. */
export type LandmarkBuilder = (def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx) => THREE.Object3D | LandmarkResult | Promise<THREE.Object3D | LandmarkResult>;

export interface LandmarkInstance {
  builder: string;
  object: THREE.Object3D;
  update?(sim: Sim, dt: number): void;
  dispose(): void;
}

const MODULES = import.meta.glob<{ default: LandmarkBuilder }>('../../content/landmarks/*.ts');
const byName = new Map<string, () => Promise<{ default: LandmarkBuilder }>>();
for (const [path, loader] of Object.entries(MODULES)) {
  const name = path.split('/').pop()!.replace(/\.ts$/, '');
  if (!name.startsWith('_')) byName.set(name, loader);
}

/** Builder ids available in this build. */
export function landmarkBuilders(): string[] {
  return [...byName.keys()].sort();
}

export function hasLandmarkBuilder(id: string): boolean {
  return byName.has(id);
}

function isResult(x: THREE.Object3D | LandmarkResult): x is LandmarkResult {
  return !(x instanceof THREE.Object3D) && 'object' in x;
}

/** Build one landmark (placed at def.pos, rotated by def.yaw, scaled by def.scale). */
export async function buildLandmark(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): Promise<LandmarkInstance | null> {
  const loader = byName.get(def.builder);
  if (!loader) {
    console.warn(`[world] landmark builder '${def.builder}' not found (zone ${zone.id})`);
    return null;
  }
  const mod = await loader();
  const out = await mod.default(def, zone, ctx);
  const res: LandmarkResult = isResult(out) ? out : { object: out };
  const o = res.object;
  o.position.set(def.pos[0], def.pos[1], def.pos[2]);
  o.rotation.y = def.yaw ?? 0;
  o.scale.setScalar(def.scale ?? 1);
  o.name ||= `landmark:${def.builder}`;
  o.updateMatrixWorld(true);
  return {
    builder: def.builder,
    object: o,
    update: res.update,
    dispose: () => {
      if (res.dispose) res.dispose();
      else disposeTree(o);
    },
  };
}

export async function buildLandmarks(defs: LandmarkDef[], zone: ZoneDef, ctx: RenderCtx): Promise<LandmarkInstance[]> {
  const out = await Promise.all(defs.map((d) => buildLandmark(d, zone, ctx)));
  return out.filter((x): x is LandmarkInstance => !!x);
}
