/**
 * ModelBuilder: assemble a character from a bone hierarchy + procedural parts, then merge everything sharing a surface
 * (material) into one SkinnedMesh bound to one Skeleton. A whole boss is typically 3-6 draw calls.
 *
 *  - `bone()` / `chain()` define the skeleton in REST pose (model space: origin on the ground, +Z forward, +X = left).
 *  - `part()` attaches a rigid geometry to a bone (weight 1).
 *  - `tube()` sweeps a smooth skinned tube along a bone chain (necks, tails, serpents, tentacles, limbs).
 *  - `cloth()` hangs a skinned strip (capes, banners, barding skirts) on a chain driven by springs.
 *  - `membrane()` spans a skinned surface between bone rays (bat/dragon wings, fins, Cthulhu wings).
 *  - `socket()` creates an attachment point (weapons, FX emitters, rider saddle).
 *  - `build()` returns a Model (root, bones, skeleton, meshes, per-actor FX uniforms).
 */
import * as THREE from 'three';
import type { QualityLevel } from '../types';
import { createActorFx, createFresnel, createStylized, type ActorFx, type KitGlobals, type SurfaceOpts, type ColorLike } from './materials';
import { ensureIndexed, mergeGeometries, radiusAt, sweep, type RadiusFn, type SweepOpts, type V3 } from './geometry';

const DEG = Math.PI / 180;

export interface PartOpts {
  /** Geometry transform in the bone's local frame. */
  pos?: V3;
  rot?: V3;
  scale?: V3 | number;
  /** Vertex color for geometries without a color attribute (default white). */
  color?: ColorLike;
  /** Darken toward the part's bottom (0..1) for painterly occlusion. */
  shade?: number;
}

export interface TubeOpts extends Omit<SweepOpts, 'capStart' | 'capEnd'> {
  /** Radius profile over the whole chain (t: 0 = first bone, 1 = tip). */
  radius: RadiusFn;
  /** Rings per bone segment (quality-scaled). Default 4. */
  perBone?: number;
  /** Extension past the last bone (meters). Default = 60% of the last segment. */
  tip?: number;
  /** Extension before the first bone back toward its parent (meters, weighted to the parent). */
  start?: number;
  capStart?: boolean;
  capEnd?: boolean;
  color?: ColorLike;
  /** Color at the tip end (gradient along the chain). */
  colorEnd?: ColorLike;
  /** Underside color (belly/ventral) blended by the frame angle. */
  belly?: ColorLike;
  /** Blend the first segment with the chain's parent bone (default true). */
  blendParent?: boolean;
  /** Offset every center by this (model space). */
  offset?: V3;
}

export interface ClothOpts {
  width: number;
  widthEnd?: number;
  /** Columns across (quality scaled). Default 6. */
  cols?: number;
  rowsPerBone?: number;
  color?: ColorLike;
  colorEnd?: ColorLike;
  /** Side axis (model space) the width spans. Default +X. */
  side?: V3;
  /** Bulge of the cloth away from the body (meters, along `bulgeDir`). */
  bulge?: number;
  bulgeDir?: V3;
  /** Extend past the last bone. */
  tip?: number;
  /** Ragged hem amplitude (0..1). */
  ragged?: number;
}

export interface MembraneOpts {
  /** Samples along each ray (quality scaled). Default 8. */
  samples?: number;
  /** Columns between rays. Default 4. */
  cols?: number;
  /** Trailing edge scallop depth (fraction of span). */
  scallop?: number;
  color?: ColorLike;
  colorEdge?: ColorLike;
  /** Tip extension per ray (meters). */
  tip?: number;
}

export interface SurfaceSpec extends SurfaceOpts {
  castShadow?: boolean;
}

interface PartRec {
  surface: string;
  geo: THREE.BufferGeometry;
}

/** A sampled skinned path (tube/cloth/membrane ray) for surface queries and scatter. */
export interface PathSample {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  nrm: THREE.Vector3;
  bin: THREE.Vector3;
  r: number;
  t: number;
  idx: [number, number, number, number];
  w: [number, number, number, number];
}

export class TubeHandle {
  constructor(readonly samples: PathSample[], readonly builder: ModelBuilder) {}
  /** Surface point at chain parameter t (0..1) and angle theta (0 = frame up/dorsal, PI = ventral). */
  at(t: number, theta: number, out = new THREE.Vector3()): { pos: THREE.Vector3; normal: THREE.Vector3; s: PathSample } {
    const s = this.samples[Math.min(this.samples.length - 1, Math.max(0, Math.round(t * (this.samples.length - 1))))];
    const n = new THREE.Vector3().copy(s.nrm).multiplyScalar(Math.cos(theta)).addScaledVector(s.bin, Math.sin(theta)).normalize();
    out.copy(s.pos).addScaledVector(n, s.r);
    return { pos: out, normal: n, s };
  }
  /**
   * Scatter copies of a geometry on the tube surface (scales, plates, spikes, fur tufts), skinned like the tube.
   * The geometry's +Y is aligned to the surface normal; `lean` tilts it back along the chain (degrees).
   */
  scatter(surface: string, geo: THREE.BufferGeometry, count: number, o: { t?: [number, number]; theta?: [number, number]; scale?: [number, number]; lean?: number; seed?: number; color?: ColorLike; sink?: number; rows?: boolean } = {}): void {
    let s = (o.seed ?? 7) >>> 0;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const [t0, t1] = o.t ?? [0.05, 0.95];
    const [a0, a1] = o.theta ?? [-Math.PI, Math.PI];
    const [s0, s1] = o.scale ?? [0.8, 1.2];
    const parts: THREE.BufferGeometry[] = [];
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const t = o.rows ? t0 + ((i + 0.5) / count) * (t1 - t0) : t0 + rnd() * (t1 - t0);
      const th = a0 + rnd() * (a1 - a0);
      const { normal, s: smp } = this.at(t, th, p);
      const sc = (s0 + rnd() * (s1 - s0)) * smp.r;
      q.setFromUnitVectors(up, normal);
      if (o.lean) {
        const axis = new THREE.Vector3().crossVectors(normal, smp.tan).normalize();
        q2.setFromAxisAngle(axis, -(o.lean ?? 0) * DEG);
        q.premultiply(q2);
      }
      p.addScaledVector(normal, -(o.sink ?? 0.15) * sc);
      m.compose(p, q, new THREE.Vector3(sc, sc, sc));
      const g = ensureIndexed(geo.clone()).applyMatrix4(m);
      this.builder.skinGeometry(g, smp.idx, smp.w, o.color);
      parts.push(g);
    }
    if (parts.length) this.builder.addRaw(surface, mergeGeometries(parts));
  }
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Built model: add `root` to the scene, pose `bones`, drive `fx` uniforms. */
export class Model {
  readonly root: THREE.Group;
  readonly bones: Record<string, THREE.Bone>;
  readonly boneList: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  readonly meshes: THREE.SkinnedMesh[];
  readonly materials: Record<string, THREE.Material>;
  readonly fx: ActorFx;
  readonly sockets: Record<string, THREE.Object3D>;
  /** Named bone chains (springs, IK, procedural waves). */
  readonly chains: Record<string, string[]>;
  /** Reference size for root offsets in pose clips (hip height of the main body), meters. */
  size: number;
  /** Visual height (meters). */
  height: number;
  /** Family-specific metadata written by rig builders (legs, wings, heads...). */
  info: Record<string, unknown>;
  private extras: THREE.Object3D[] = [];
  private auras: THREE.SkinnedMesh[] = [];
  triangles: number;

  constructor(init: {
    root: THREE.Group; bones: Record<string, THREE.Bone>; boneList: THREE.Bone[]; skeleton: THREE.Skeleton; meshes: THREE.SkinnedMesh[];
    materials: Record<string, THREE.Material>; fx: ActorFx; sockets: Record<string, THREE.Object3D>; chains: Record<string, string[]>;
    size: number; height: number; info: Record<string, unknown>; triangles: number;
  }) {
    this.root = init.root;
    this.bones = init.bones;
    this.boneList = init.boneList;
    this.skeleton = init.skeleton;
    this.meshes = init.meshes;
    this.materials = init.materials;
    this.fx = init.fx;
    this.sockets = init.sockets;
    this.chains = init.chains;
    this.size = init.size;
    this.height = init.height;
    this.info = init.info;
    this.triangles = init.triangles;
    this.root.userData.smFx = this.fx;
    this.root.userData.smModel = this;
  }

  bone(name: string): THREE.Bone | undefined {
    return this.bones[name];
  }

  /** Restore every bone to its rest transform. */
  resetPose(): void {
    for (const b of this.boneList) {
      b.position.copy(b.userData.restPos as THREE.Vector3);
      b.quaternion.copy(b.userData.restQuat as THREE.Quaternion);
      b.scale.set(1, 1, 1);
    }
  }

  setShadow(cast: boolean): void {
    for (const m of this.meshes) m.castShadow = cast && m.userData.castShadow !== false;
  }

  /**
   * Add a fresnel aura shell (additive, inflated) over the meshes of the given surfaces (default: all).
   * Returns the shell meshes; set `.visible` or material.uniforms.uFade to animate.
   */
  addAura(color: ColorLike, opts: { surfaces?: string[]; inflate?: number; power?: number; strength?: number; flow?: number; time?: { value: number } } = {}): THREE.SkinnedMesh[] {
    const out: THREE.SkinnedMesh[] = [];
    const mat = createFresnel(color, { inflate: opts.inflate ?? 0.06 * this.size, power: opts.power ?? 2.0, strength: opts.strength ?? 1.3, flow: opts.flow ?? 0.6, time: opts.time, core: 0.04 });
    for (const m of this.meshes) {
      if (opts.surfaces && !opts.surfaces.includes(m.userData.surface as string)) continue;
      const s = new THREE.SkinnedMesh(m.geometry, mat);
      s.bind(this.skeleton, m.bindMatrix);
      s.frustumCulled = false;
      s.renderOrder = 2;
      s.userData.surface = `aura:${m.userData.surface as string}`;
      this.root.add(s);
      out.push(s);
      this.auras.push(s);
    }
    return out;
  }

  /** Attach a non-skinned object to a bone (kept for disposal). */
  attach(boneOrSocket: string, obj: THREE.Object3D): THREE.Object3D {
    const parent = this.sockets[boneOrSocket] ?? this.bones[boneOrSocket] ?? this.root;
    parent.add(obj);
    this.extras.push(obj);
    return obj;
  }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        geos.add(mesh.geometry);
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((x) => mats.add(x));
        else mats.add(m);
      }
    });
    for (const g of geos) g.dispose();
    for (const m of mats) if (!m.userData.smShared) m.dispose();
    this.skeleton.dispose();
    this.root.removeFromParent();
  }
}

export class ModelBuilder {
  readonly root = new THREE.Group();
  readonly bones: Record<string, THREE.Bone> = {};
  readonly boneList: THREE.Bone[] = [];
  readonly fx: ActorFx = createActorFx();
  private parts: PartRec[] = [];
  private surfaces = new Map<string, SurfaceSpec>();
  private socketsMap: Record<string, THREE.Object3D> = {};
  private chainsMap: Record<string, string[]> = {};
  private restDirty = true;
  info: Record<string, unknown> = {};
  /** Reference size for pose root offsets (hip height). */
  size = 1;
  height = 2;

  constructor(readonly globals: KitGlobals, readonly quality: QualityLevel = 'high', name = 'model') {
    this.root.name = name;
    const r = new THREE.Bone();
    r.name = 'root';
    this.root.add(r);
    this.registerBone(r);
  }

  /** Quality-scaled segment count. */
  seg(base: number, min = 3): number {
    const k = this.quality === 'low' ? 0.6 : this.quality === 'medium' ? 0.8 : 1;
    return Math.max(min, Math.round(base * k));
  }

  private registerBone(b: THREE.Bone): void {
    b.userData.restPos = b.position.clone();
    b.userData.restQuat = b.quaternion.clone();
    this.bones[b.name] = b;
    this.boneList.push(b);
    this.restDirty = true;
  }

  has(name: string): boolean {
    return !!this.bones[name];
  }

  /** Create a bone. `pos` is relative to the parent (rest pose); `rot` degrees XYZ (rest rotation, usually omitted). */
  bone(name: string, parent: string | null, pos: V3, rot?: V3): THREE.Bone {
    if (this.bones[name]) throw new Error(`duplicate bone ${name}`);
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(pos[0], pos[1], pos[2]);
    if (rot) b.quaternion.setFromEuler(_e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
    const p = parent ? this.bones[parent] : this.bones.root;
    if (!p) throw new Error(`unknown parent bone ${parent}`);
    p.add(b);
    this.registerBone(b);
    return b;
  }

  /**
   * Create a chain of `count` bones `${prefix}_0..n-1`; each is offset by `step` from the previous (parent-local).
   * `bend` (degrees XYZ) is applied as the rest rotation of every bone after the first, curling the chain.
   * Registers the chain under `prefix` for springs/IK.
   */
  chain(prefix: string, parent: string, count: number, first: V3, step: V3, bend?: V3): string[] {
    const names: string[] = [];
    let par = parent;
    for (let i = 0; i < count; i++) {
      const n = `${prefix}_${i}`;
      this.bone(n, par, i === 0 ? first : step, i > 0 ? bend : undefined);
      names.push(n);
      par = n;
    }
    this.chainsMap[prefix] = names;
    return names;
  }

  /** Register an existing list of bones as a named chain. */
  namedChain(name: string, bones: string[]): void {
    this.chainsMap[name] = bones;
  }

  private updateRest(): void {
    if (!this.restDirty) return;
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.scale.set(1, 1, 1);
    this.root.updateMatrixWorld(true);
    this.restDirty = false;
  }

  /** Rest model-space position of a bone. */
  restPos(name: string, out = new THREE.Vector3()): THREE.Vector3 {
    this.updateRest();
    const b = this.bones[name];
    if (!b) throw new Error(`unknown bone ${name}`);
    return out.setFromMatrixPosition(b.matrixWorld);
  }

  /** Rest model-space matrix of a bone. */
  restMatrix(name: string, out = new THREE.Matrix4()): THREE.Matrix4 {
    this.updateRest();
    const b = this.bones[name];
    if (!b) throw new Error(`unknown bone ${name}`);
    return out.copy(b.matrixWorld);
  }

  boneIndex(name: string): number {
    const b = this.bones[name];
    if (!b) throw new Error(`unknown bone ${name}`);
    return this.boneList.indexOf(b);
  }

  /** Define a surface (material) by id. Parts reference surfaces by id; one SkinnedMesh per surface. */
  surface(id: string, o: SurfaceSpec): string {
    this.surfaces.set(id, { vertexColors: true, ...o });
    return id;
  }

  /** Attachment point on a bone (weapons, emitters, mount saddle). */
  socket(name: string, bone: string, pos: V3 = [0, 0, 0], rot?: V3): THREE.Object3D {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(pos[0], pos[1], pos[2]);
    if (rot) o.quaternion.setFromEuler(_e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
    const b = this.bones[bone];
    if (!b) throw new Error(`unknown bone ${bone}`);
    b.add(o);
    this.socketsMap[name] = o;
    return o;
  }

  /** Write skinIndex/skinWeight/color attributes for a geometry influenced by up to 4 bones. */
  skinGeometry(g: THREE.BufferGeometry, idx: number[] | [number, number, number, number], w: number[] | [number, number, number, number], color?: ColorLike): THREE.BufferGeometry {
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        si[i * 4 + k] = idx[k] ?? 0;
        sw[i * 4 + k] = w[k] ?? 0;
      }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (!g.attributes.color) {
      _c.set((color ?? 0xffffff) as THREE.ColorRepresentation);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return g;
  }

  /** Add an already model-space, already skinned geometry. */
  addRaw(surface: string, geo: THREE.BufferGeometry): void {
    if (!this.surfaces.has(surface)) throw new Error(`unknown surface ${surface}`);
    this.parts.push({ surface, geo: ensureIndexed(geo) });
  }

  /** Rigid part on a bone. The geometry is consumed (transformed in place). */
  part(bone: string, geo: THREE.BufferGeometry, surface: string, o: PartOpts = {}): void {
    const g = ensureIndexed(geo);
    _p.set(o.pos?.[0] ?? 0, o.pos?.[1] ?? 0, o.pos?.[2] ?? 0);
    _q.setFromEuler(_e.set((o.rot?.[0] ?? 0) * DEG, (o.rot?.[1] ?? 0) * DEG, (o.rot?.[2] ?? 0) * DEG));
    if (typeof o.scale === 'number') _s.setScalar(o.scale);
    else _s.set(o.scale?.[0] ?? 1, o.scale?.[1] ?? 1, o.scale?.[2] ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    if (o.shade) {
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      if (!g.attributes.color) {
        this.skinGeometry(g, [0], [1], o.color);
        g.deleteAttribute('skinIndex');
        g.deleteAttribute('skinWeight');
      }
      const pos = g.attributes.position as THREE.BufferAttribute, col = g.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const k = (pos.getY(i) - bb.min.y) / Math.max(1e-4, bb.max.y - bb.min.y);
        const f = 1 - o.shade * (1 - k);
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
    g.applyMatrix4(this.restMatrix(bone, _m2));
    this.skinGeometry(g, [this.boneIndex(bone)], [1], o.color);
    this.addRaw(surface, g);
  }

  /** Rigid part placed directly in model space (rest pose) but skinned to a bone. */
  partModel(bone: string, geo: THREE.BufferGeometry, surface: string, color?: ColorLike): void {
    const g = ensureIndexed(geo);
    this.skinGeometry(g, [this.boneIndex(bone)], [1], color);
    this.addRaw(surface, g);
  }

  /** Sample a skinned path through bone joints (+ tip/start extensions) with joint-blended weights. */
  samplePath(bones: string[], opts: { perBone?: number; tip?: number; start?: number; blendParent?: boolean; offset?: V3; up?: V3 }): PathSample[] {
    const pts: THREE.Vector3[] = bones.map((b) => this.restPos(b));
    if (opts.offset) for (const p of pts) p.add(new THREE.Vector3(...opts.offset));
    const nb = pts.length;
    const lastDir = nb > 1 ? new THREE.Vector3().subVectors(pts[nb - 1], pts[nb - 2]) : new THREE.Vector3(0, 1, 0);
    const lastLen = lastDir.length() || 0.5;
    lastDir.normalize();
    const tip = opts.tip ?? lastLen * 0.6;
    const joints = pts.map((p) => p.clone());
    joints.push(pts[nb - 1].clone().addScaledVector(lastDir, Math.max(0.01, tip)));
    const parentBone = this.bones[bones[0]].parent as THREE.Bone | null;
    const parentIdx = parentBone && (parentBone as THREE.Bone).isBone ? this.boneList.indexOf(parentBone) : -1;
    let startExt = 0;
    if (opts.start && opts.start > 0 && nb > 1) {
      const d = new THREE.Vector3().subVectors(pts[0], pts[1]).normalize();
      joints.unshift(pts[0].clone().addScaledVector(d, opts.start));
      startExt = 1;
    }
    const curve = new THREE.CatmullRomCurve3(joints, false, 'centripetal', 0.5);
    const segs = joints.length - 1;
    const perBone = Math.max(1, this.seg(opts.perBone ?? 4, 2));
    const out: PathSample[] = [];
    const total = segs * perBone;
    const bi = bones.map((b) => this.boneIndex(b));
    for (let k = 0; k <= total; k++) {
      const u = k / total;
      const segF = u * segs;
      let si = Math.min(segs - 1, Math.floor(segF));
      let f = segF - si;
      if (k === total) {
        si = segs - 1;
        f = 1;
      }
      const pos = curve.getPoint(u);
      const tan = curve.getTangent(u).normalize();
      const idx: [number, number, number, number] = [0, 0, 0, 0];
      const w: [number, number, number, number] = [0, 0, 0, 0];
      const boneSeg = si - startExt; // -1 = start extension
      if (boneSeg < 0) {
        idx[0] = parentIdx >= 0 && opts.blendParent !== false ? parentIdx : bi[0];
        w[0] = 1;
      } else {
        const cur = Math.min(boneSeg, nb - 1);
        const prev = boneSeg === 0 ? (parentIdx >= 0 && opts.blendParent !== false ? parentIdx : bi[0]) : bi[cur - 1];
        const next = cur + 1 < nb ? bi[cur + 1] : bi[cur];
        if (boneSeg >= nb - 1 && f > 0.5) {
          // tip region of the last bone
          idx[0] = bi[cur];
          w[0] = 1;
        } else if (f < 0.5) {
          idx[0] = bi[cur]; w[0] = 0.5 + f;
          idx[1] = prev; w[1] = 0.5 - f;
        } else {
          idx[0] = bi[cur]; w[0] = 1.5 - f;
          idx[1] = next; w[1] = f - 0.5;
        }
        if (idx[1] === idx[0]) {
          w[0] += w[1];
          w[1] = 0;
        }
      }
      out.push({ pos, tan, nrm: new THREE.Vector3(), bin: new THREE.Vector3(), r: 0, t: u, idx, w });
    }
    // parallel transport frames
    const up = new THREE.Vector3(...(opts.up ?? [0, 1, 0]));
    if (Math.abs(up.dot(out[0].tan)) > 0.95) up.set(0, 0, 1);
    let n = up.clone().addScaledVector(out[0].tan, -up.dot(out[0].tan)).normalize();
    for (let i = 0; i < out.length; i++) {
      if (i > 0) {
        const axis = new THREE.Vector3().crossVectors(out[i - 1].tan, out[i].tan);
        const s = axis.length();
        if (s > 1e-6) n.applyAxisAngle(axis.normalize(), Math.atan2(s, out[i - 1].tan.dot(out[i].tan)));
        n.addScaledVector(out[i].tan, -n.dot(out[i].tan)).normalize();
      }
      out[i].nrm.copy(n);
      out[i].bin.crossVectors(out[i].tan, n).normalize();
    }
    return out;
  }

  /** Smooth skinned tube along a bone chain. Returns a handle for scatter/surface queries. */
  tube(bones: string[], surface: string, o: TubeOpts): TubeHandle {
    const samples = this.samplePath(bones, { perBone: o.perBone, tip: o.tip, start: o.start, blendParent: o.blendParent, offset: o.offset, up: o.up });
    const radii = samples.map((s) => Math.max(0.002, radiusAt(o.radius, s.t)));
    samples.forEach((s, i) => (s.r = radii[i]));
    const { geometry, ringT } = sweep(samples.map((s) => s.pos), radii, {
      radial: this.seg(o.radial ?? 10, 5), flatten: o.flatten, ridge: o.ridge, capStart: o.capStart ?? false, capEnd: o.capEnd ?? true, up: o.up, twist: o.twist,
    });
    // map each vertex to its ring sample for weights
    const n = geometry.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const radial = this.seg(o.radial ?? 10, 5);
    const ringVerts = radial + 1;
    const cA = new THREE.Color((o.color ?? 0xffffff) as THREE.ColorRepresentation);
    const cB = new THREE.Color((o.colorEnd ?? o.color ?? 0xffffff) as THREE.ColorRepresentation);
    const cBelly = o.belly !== undefined ? new THREE.Color(o.belly as THREE.ColorRepresentation) : null;
    const nrm = geometry.attributes.normal as THREE.BufferAttribute;
    const tmpN = new THREE.Vector3();
    for (let v = 0; v < n; v++) {
      let ring = Math.floor(v / ringVerts);
      if (ring >= samples.length) ring = ringT[v] < 0.5 ? 0 : samples.length - 1;
      const s = samples[ring];
      for (let k = 0; k < 4; k++) {
        si[v * 4 + k] = s.idx[k];
        sw[v * 4 + k] = s.w[k];
      }
      _c.copy(cA).lerp(cB, s.t);
      if (cBelly) {
        tmpN.fromBufferAttribute(nrm, v);
        const down = -tmpN.dot(s.nrm);
        const k = Math.max(0, Math.min(1, (down - 0.15) * 1.6));
        _c.lerp(cBelly, k);
      }
      col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
    }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.addRaw(surface, geometry);
    return new TubeHandle(samples, this);
  }

  /** Skinned cloth strip hanging along a chain (cape, tabard, banner, barding skirt). Use a DoubleSide surface. */
  cloth(bones: string[], surface: string, o: ClothOpts): void {
    const samples = this.samplePath(bones, { perBone: o.rowsPerBone ?? 3, tip: o.tip, blendParent: true });
    const cols = this.seg(o.cols ?? 6, 3);
    const side = new THREE.Vector3(...(o.side ?? [1, 0, 0])).normalize();
    const bulgeDir = new THREE.Vector3(...(o.bulgeDir ?? [0, 0, -1])).normalize();
    const rows = samples.length;
    const pos = new Float32Array(rows * (cols + 1) * 3), uv = new Float32Array(rows * (cols + 1) * 2), col = new Float32Array(rows * (cols + 1) * 3);
    const si = new Uint16Array(rows * (cols + 1) * 4), sw = new Float32Array(rows * (cols + 1) * 4);
    const cA = new THREE.Color((o.color ?? 0xffffff) as THREE.ColorRepresentation), cB = new THREE.Color((o.colorEnd ?? o.color ?? 0xffffff) as THREE.ColorRepresentation);
    const idx: number[] = [];
    let v = 0;
    for (let r = 0; r < rows; r++) {
      const s = samples[r];
      const w = (o.width + ((o.widthEnd ?? o.width) - o.width) * s.t) / 2;
      for (let c = 0; c <= cols; c++) {
        const a = c / cols * 2 - 1;
        const bul = (o.bulge ?? 0) * (1 - a * a);
        let hem = 0;
        if (o.ragged && r === rows - 1) hem = (Math.sin(c * 2.7) * 0.5 + 0.5) * o.ragged * (o.width * 0.12);
        const px = s.pos.x + side.x * a * w + bulgeDir.x * bul - s.tan.x * -hem;
        const py = s.pos.y + side.y * a * w + bulgeDir.y * bul + hem * 0.8;
        const pz = s.pos.z + side.z * a * w + bulgeDir.z * bul;
        pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
        uv[v * 2] = c / cols; uv[v * 2 + 1] = s.t;
        _c.copy(cA).lerp(cB, s.t);
        col[v * 3] = _c.r; col[v * 3 + 1] = _c.g; col[v * 3 + 2] = _c.b;
        for (let k = 0; k < 4; k++) {
          si[v * 4 + k] = s.idx[k];
          sw[v * 4 + k] = s.w[k];
        }
        v++;
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b = a + 1, cc = a + cols + 1, d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.addRaw(surface, g);
  }

  /**
   * Skinned membrane spanning consecutive bone rays (each ray: bones from the wing root outward).
   * Rays are resampled to equal counts; the outer edge between rays is scalloped.
   */
  membrane(rays: string[][], surface: string, o: MembraneOpts = {}): void {
    const S = this.seg(o.samples ?? 8, 4);
    const C = this.seg(o.cols ?? 4, 2);
    const paths = rays.map((r) => this.samplePath(r, { perBone: 3, tip: o.tip ?? 0.001, blendParent: true }));
    const res = paths.map((p) => {
      const out: PathSample[] = [];
      for (let i = 0; i < S; i++) out.push(p[Math.round((i / (S - 1)) * (p.length - 1))]);
      return out;
    });
    const pos: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
    const cA = new THREE.Color((o.color ?? 0xffffff) as THREE.ColorRepresentation), cE = new THREE.Color((o.colorEdge ?? o.color ?? 0xffffff) as THREE.ColorRepresentation);
    const wmap = new Map<number, number>();
    let base = 0;
    for (let r = 0; r < res.length - 1; r++) {
      const A = res[r], B = res[r + 1];
      for (let i = 0; i < S; i++) {
        for (let c = 0; c <= C; c++) {
          const k = c / C;
          const p = new THREE.Vector3().lerpVectors(A[i].pos, B[i].pos, k);
          if (i === S - 1 || i === S - 2) {
            // scallop: pull the outer rows toward the root between rays
            const sc = (o.scallop ?? 0.18) * Math.sin(k * Math.PI) * (i === S - 1 ? 1 : 0.45);
            const rootMid = new THREE.Vector3().lerpVectors(A[0].pos, B[0].pos, k);
            p.lerp(rootMid, sc);
          }
          pos.push(p.x, p.y, p.z);
          uv.push(r + k, i / (S - 1));
          _c.copy(cA).lerp(cE, Math.pow(i / (S - 1), 2));
          col.push(_c.r, _c.g, _c.b);
          // blend weights of A[i] and B[i]
          wmap.clear();
          for (let q = 0; q < 4; q++) {
            if (A[i].w[q] > 0) wmap.set(A[i].idx[q], (wmap.get(A[i].idx[q]) ?? 0) + A[i].w[q] * (1 - k));
            if (B[i].w[q] > 0) wmap.set(B[i].idx[q], (wmap.get(B[i].idx[q]) ?? 0) + B[i].w[q] * k);
          }
          const top = [...wmap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
          const tot = top.reduce((s, e) => s + e[1], 0) || 1;
          for (let q = 0; q < 4; q++) {
            si.push(top[q]?.[0] ?? 0);
            sw.push((top[q]?.[1] ?? 0) / tot);
          }
        }
      }
      for (let i = 0; i < S - 1; i++) {
        for (let c = 0; c < C; c++) {
          const a = base + i * (C + 1) + c, b = a + 1, cc = a + C + 1, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
      }
      base += S * (C + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.addRaw(surface, g);
  }

  /** Fan of feather/leaf geometries rigidly skinned to a bone (feathered wings, tail fans, plumes). */
  fan(bone: string, surface: string, geo: () => THREE.BufferGeometry, count: number, o: { from: V3; to: V3; pos?: V3; posTo?: V3; scale?: [number, number]; color?: ColorLike; colorEnd?: ColorLike }): void {
    const parts: THREE.BufferGeometry[] = [];
    const cA = new THREE.Color((o.color ?? 0xffffff) as THREE.ColorRepresentation), cB = new THREE.Color((o.colorEnd ?? o.color ?? 0xffffff) as THREE.ColorRepresentation);
    for (let i = 0; i < count; i++) {
      const k = count > 1 ? i / (count - 1) : 0;
      const g = ensureIndexed(geo());
      const rot: V3 = [o.from[0] + (o.to[0] - o.from[0]) * k, o.from[1] + (o.to[1] - o.from[1]) * k, o.from[2] + (o.to[2] - o.from[2]) * k];
      const p0 = o.pos ?? [0, 0, 0], p1 = o.posTo ?? p0;
      const pos: V3 = [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k];
      const sc = o.scale ? o.scale[0] + (o.scale[1] - o.scale[0]) * k : 1;
      _p.set(pos[0], pos[1], pos[2]);
      _q.setFromEuler(_e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
      _m.compose(_p, _q, _s.setScalar(sc));
      g.applyMatrix4(_m);
      _c.copy(cA).lerp(cB, k);
      parts.push(this.skinGeometry(g, [0], [1], `#${_c.getHexString()}`));
    }
    const merged = mergeGeometries(parts);
    merged.deleteAttribute('skinIndex');
    merged.deleteAttribute('skinWeight');
    merged.applyMatrix4(this.restMatrix(bone, _m2));
    this.skinGeometry(merged, [this.boneIndex(bone)], [1]);
    this.addRaw(surface, merged);
  }

  /** Finish: merge per surface into SkinnedMeshes bound to one skeleton. */
  build(): Model {
    this.updateRest();
    const skeleton = new THREE.Skeleton(this.boneList);
    const meshes: THREE.SkinnedMesh[] = [];
    const materials: Record<string, THREE.Material> = {};
    let tris = 0;
    const bySurface = new Map<string, THREE.BufferGeometry[]>();
    for (const p of this.parts) {
      const l = bySurface.get(p.surface) ?? [];
      l.push(p.geo);
      bySurface.set(p.surface, l);
    }
    const bbox = new THREE.Box3();
    for (const [sid, list] of bySurface) {
      const spec = this.surfaces.get(sid)!;
      const geo = mergeGeometries(list);
      for (const g of list) g.dispose();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      bbox.union(geo.boundingBox!);
      tris += geo.index ? geo.index.count / 3 : 0;
      const mat = createStylized(spec, this.globals, this.fx);
      materials[sid] = mat;
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = `${this.root.name}:${sid}`;
      mesh.userData.surface = sid;
      mesh.userData.castShadow = spec.castShadow !== false;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      meshes.push(mesh);
    }
    const height = this.height || (bbox.isEmpty() ? 2 : bbox.max.y);
    return new Model({
      root: this.root, bones: this.bones, boneList: this.boneList, skeleton, meshes, materials, fx: this.fx, sockets: this.socketsMap,
      chains: this.chainsMap, size: this.size, height, info: this.info, triangles: tris,
    });
  }
}
