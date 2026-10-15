/**
 * PropField: instanced world props. Placement comes ONLY from core `scatterProps` with the sim's avoid list (env.avoid =
 * altarAvoid(zone, altar positions)), so every collider the sim builds has a visual at the same spot. Render-only
 * dressing (biome table) and an out-of-bounds rim (forest walls, rock spires on the backdrop) are added on top.
 *
 * One InstancedMesh per (kind, variant, material slot); slots of a batch share one instance-matrix attribute. Culling is
 * done on the CPU per instance (frustum + per-kind draw distance), compacting visible instances to the front of the
 * attribute, so triangles are only paid for what is on screen and draw calls stay at one per batch slot.
 */
import * as THREE from 'three';
import { scatterProps } from '../../../core/terrain';
import { hashString } from '../../../core/rng';
import type { PropScatterDef } from '../../../core/types';
import type { ZoneEnv } from '../env';
import { R } from '../geo';
import { worldMat, type WorldMatKind } from '../materials';
import { propKind, type PropKind } from './kinds';

interface Batch {
  kind: string;
  spec: PropKind;
  variant: number;
  meshes: THREE.InstancedMesh[];
  attr: THREE.InstancedBufferAttribute | null;
  /** Source matrices (16 floats per instance) and bounding spheres (x, y, z, r). */
  src: number[];
  sph: number[];
  srcF: Float32Array;
  sphF: Float32Array;
  count: number;
  far: number;
  localCenter: THREE.Vector3;
  localRadius: number;
  visible: number;
}

const geoCache = new Map<string, Map<string, THREE.BufferGeometry>>();

function kindGeometries(kind: string, spec: PropKind, v: number): Map<string, THREE.BufferGeometry> {
  const key = `${kind}#${v}`;
  let g = geoCache.get(key);
  if (!g) {
    g = spec.build(new R(hashString(key)), v).geometries() as Map<string, THREE.BufferGeometry>;
    geoCache.set(key, g);
  }
  return g;
}

/** Free the shared prop geometry cache (zone change to a different act, context loss). */
export function clearPropGeometryCache(): void {
  for (const m of geoCache.values()) for (const g of m.values()) g.dispose();
  geoCache.clear();
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

export class PropField {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private list: Batch[] = [];
  private lastCam = new THREE.Vector3(1e9, 0, 0);
  private lastQ = new THREE.Quaternion();
  private frame = 0;
  private farMult: number;
  private shadows: boolean;

  constructor(private env: ZoneEnv) {
    this.group.name = 'props';
    const q = env.ctx.quality;
    this.farMult = q === 'low' ? 0.6 : q === 'medium' ? 0.82 : 1;
    this.shadows = q !== 'low';
  }

  private batch(kind: string, variant: number): Batch {
    const spec = propKind(kind);
    const v = variant % spec.variants;
    const key = `${kind}#${v}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { kind, spec, variant: v, meshes: [], attr: null, src: [], sph: [], srcF: new Float32Array(0), sphF: new Float32Array(0), count: 0, far: spec.far, localCenter: new THREE.Vector3(), localRadius: 1, visible: -1 };
      this.batches.set(key, b);
    }
    return b;
  }

  private push(kind: string, variant: number, x: number, y: number, z: number, yaw: number, scale: number, tilt: number): void {
    const b = this.batch(kind, variant);
    _e.set(tilt * Math.cos(yaw * 3.1), yaw, tilt * Math.sin(yaw * 2.3), 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
    for (let i = 0; i < 16; i++) b.src.push(_m.elements[i]);
    b.sph.push(x, y, z, scale);
    b.count++;
  }

  /** Data props (renderOnly = false: exact sim placements) or biome dressing (renderOnly = true: thinned by quality). */
  addScatter(def: PropScatterDef, renderOnly: boolean): void {
    const env = this.env;
    const d = renderOnly ? { ...def, count: Math.max(1, Math.round(def.count * env.density)) } : def;
    const list = scatterProps(env.terrain, d, env.avoid);
    const spec = propKind(def.kind);
    const water = env.terrain.waterLevel();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      // thin non-colliding data props on lower qualities (colliders always keep their visual)
      if (!renderOnly && !def.collide && env.density < 1 && ((i * 0.618034) % 1) > env.density) continue;
      let y = p.y - (spec.sink ?? 0) * p.scale;
      if (spec.float !== undefined && water !== null) y = water + spec.float * (0.6 + 0.4 * ((i * 0.37) % 1));
      const tilt = spec.shadow ? 0.04 : 0.1;
      this.push(def.kind, p.variant, p.x, y, p.z, p.yaw, p.scale, tilt);
    }
  }

  /** Render-only ring of props outside the walkable bounds, standing on the backdrop. */
  addRim(kind: string, count: number, scale: [number, number]): void {
    const env = this.env;
    const r = new R(hashString(`${env.def.id}:rim:${kind}`));
    const [w, d] = env.def.size;
    const n = Math.round(count * (env.ctx.quality === 'low' ? 0.6 : 1));
    let placed = 0, attempts = n * 12;
    while (placed < n && attempts-- > 0) {
      const x = r.range(-w / 2 - 160, w / 2 + 160);
      const z = r.range(-d / 2 - 160, d / 2 + 160);
      const e = env.terrain.edgeDistance(x, z);
      if (e > -6 || e < -170) continue;
      const y = env.heightAt(x, z);
      if (env.field.water !== null && y < env.field.water + 0.2) continue;
      const s = r.range(scale[0], scale[1]);
      this.push(kind, r.int(0, 7), x, y - 0.3 * s, z, r.range(-Math.PI, Math.PI), s, 0.05);
      placed++;
    }
  }

  /** Build the instanced meshes. */
  finish(): void {
    for (const b of this.batches.values()) {
      if (!b.count) continue;
      const geos = kindGeometries(b.kind, b.spec, b.variant);
      b.srcF = new Float32Array(b.src);
      b.sphF = new Float32Array(b.sph);
      b.src = [];
      b.sph = [];
      const arr = new Float32Array(b.count * 16);
      arr.set(b.srcF);
      b.attr = new THREE.InstancedBufferAttribute(arr, 16);
      b.attr.setUsage(THREE.DynamicDrawUsage);
      const box = new THREE.Box3();
      for (const g of geos.values()) {
        g.computeBoundingBox();
        box.union(g.boundingBox!);
      }
      box.getCenter(b.localCenter);
      b.localRadius = box.getSize(_p).length() / 2;
      for (const [slot, g] of geos) {
        const mesh = new THREE.InstancedMesh(g, worldMat(slot as WorldMatKind), b.count);
        mesh.instanceMatrix = b.attr;
        mesh.frustumCulled = false;
        mesh.castShadow = this.shadows && !!b.spec.shadow && slot !== 'glow' && slot !== 'glass';
        mesh.receiveShadow = slot !== 'glow';
        mesh.name = `prop:${b.kind}:${b.variant}:${slot}`;
        if (slot === 'glow' || slot === 'glass') mesh.renderOrder = 2;
        b.meshes.push(mesh);
        this.group.add(mesh);
      }
      this.list.push(b);
    }
  }

  /** CPU culling: compact visible instances to the front of each batch's matrix attribute. */
  update(camera: THREE.Camera): void {
    this.frame++;
    const moved = camera.position.distanceToSquared(this.lastCam) > 0.6 || Math.abs(camera.quaternion.dot(this.lastQ)) < 0.99985;
    if (!moved && this.frame % 20 !== 0) return;
    this.lastCam.copy(camera.position);
    this.lastQ.copy(camera.quaternion);
    camera.updateMatrixWorld();
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (const b of this.list) {
      const attr = b.attr!;
      const dst = attr.array as Float32Array;
      const far = b.far * this.farMult;
      let n = 0;
      for (let i = 0; i < b.count; i++) {
        const o = i * 4;
        const s = b.sphF[o + 3];
        const x = b.sphF[o] + b.localCenter.x * s, y = b.sphF[o + 1] + b.localCenter.y * s, z = b.sphF[o + 2] + b.localCenter.z * s;
        const r = b.localRadius * s;
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const lim = far + r;
        if (dx * dx + dy * dy + dz * dz > lim * lim) continue;
        _sphere.center.set(x, y, z);
        _sphere.radius = r;
        if (!_frustum.intersectsSphere(_sphere)) continue;
        if (n !== i) dst.set(b.srcF.subarray(i * 16, i * 16 + 16), n * 16);
        else if (b.visible !== b.count) dst.set(b.srcF.subarray(i * 16, i * 16 + 16), n * 16);
        n++;
      }
      b.visible = n;
      for (const m of b.meshes) {
        m.count = n;
        m.visible = n > 0;
      }
      if (n > 0) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, n * 16);
        attr.needsUpdate = true;
      }
    }
  }

  /** Total instances (for stats/tests). */
  get instanceCount(): number {
    let n = 0;
    for (const b of this.list) n += b.count;
    return n;
  }

  dispose(): void {
    for (const b of this.list) for (const m of b.meshes) m.dispose();
    this.group.clear();
    this.list = [];
    this.batches.clear();
  }
}
