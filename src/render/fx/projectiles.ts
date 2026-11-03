/**
 * Projectile visuals for every ProjectileKindDef.visual: a luminous head (camera-facing sprites, velocity-stretched for
 * bolts), solid instanced meshes oriented along the flight (arrows, harpoons, chains, rocks, discs, shards, feathers,
 * ravens), camera-facing ribbon trails that taper and fade, and particles shed along the path (embers, wisps, sparks,
 * petals, drips, dust). Everything is pooled per sim pool slot: no allocation per frame.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { Projectile } from '../../sim/pools';
import type { Kit } from '../kit/index';
import * as geo from '../kit/geometry';
import { spriteAtlas, ATLAS_N } from '../kit/textures';
import { CELL, type ParticleSystem } from './particles';

type Emit = '' | 'embers' | 'wisps' | 'sparks' | 'smoke' | 'petals' | 'drips' | 'dust' | 'stars' | 'feathers';
interface PV {
  /** Head sprite cell (-1 none). */
  head: number;
  /** Head size x radius. */
  glow: number;
  /** White core dot. */
  core: boolean;
  /** Solid mesh: -1 none, 0 spear, 1 rock, 2 disc, 3 shard. */
  mesh: number;
  /** Mesh scale [across, along] x radius. */
  ms: [number, number];
  /** Trail width x radius (0 = none). */
  trail: number;
  /** Emission per second. */
  emit: Emit;
  rate: number;
  spin: number;
  stretch: number;
  /** Mesh color darkening (ravens, tentacles, rocks). */
  dark: number;
}
const V = (o: Partial<PV>): PV => ({ head: CELL.dot, glow: 2.4, core: true, mesh: -1, ms: [1, 1], trail: 0.8, emit: '', rate: 0, spin: 0, stretch: 0, dark: 0, ...o });
const VISUALS: Record<string, PV> = {
  orb: V({}),
  ball: V({ mesh: 1, ms: [1, 1], glow: 2.0, trail: 0.6 }),
  bolt: V({ head: CELL.spark, glow: 3.2, stretch: 0.12, trail: 0.45, emit: 'sparks', rate: 30 }),
  arrow: V({ head: -1, core: false, mesh: 0, ms: [0.35, 4.5], trail: 0.25 }),
  harpoon: V({ head: -1, core: false, mesh: 0, ms: [0.45, 5.5], trail: 0.3 }),
  chain: V({ head: -1, core: false, mesh: 0, ms: [0.5, 4], trail: 0, dark: 0.3 }),
  tentacle: V({ head: -1, core: false, mesh: 0, ms: [0.9, 4], trail: 0, dark: 0.55, emit: 'drips', rate: 10 }),
  soul: V({ head: CELL.dot, glow: 3.0, trail: 1.3, emit: 'wisps', rate: 24 }),
  spirit: V({ head: CELL.star, glow: 3.0, trail: 1.4, emit: 'wisps', rate: 26, spin: 1.5 }),
  feather: V({ head: -1, core: false, mesh: 3, ms: [0.7, 2.6], trail: 0.35, emit: 'feathers', rate: 4 }),
  petal: V({ head: CELL.petal, glow: 2.2, core: false, trail: 0, emit: 'petals', rate: 10, spin: 5 }),
  shard: V({ head: CELL.dot, glow: 1.6, core: false, mesh: 3, ms: [0.6, 2.4], trail: 0.4 }),
  raven: V({ head: -1, core: false, mesh: 3, ms: [2.2, 1.6], trail: 0, dark: 0.85, emit: 'smoke', rate: 18 }),
  fireball: V({ head: CELL.flame, glow: 2.8, trail: 1.2, emit: 'embers', rate: 40 }),
  comet: V({ head: CELL.star, glow: 3.6, trail: 1.8, emit: 'sparks', rate: 36, spin: 2 }),
  star: V({ head: CELL.star, glow: 3.0, trail: 0.9, emit: 'stars', rate: 14, spin: 3 }),
  disc: V({ head: CELL.ring, glow: 2.4, core: false, mesh: 2, ms: [1.1, 0.16], trail: 0.5 }),
  crescent: V({ head: CELL.crescent, glow: 3.2, core: false, trail: 0.9, spin: 0, stretch: 0 }),
  acid: V({ head: CELL.blob, glow: 2.2, trail: 0.7, emit: 'drips', rate: 20 }),
  drop: V({ head: CELL.dot, glow: 1.8, trail: 0.5, emit: 'drips', rate: 8 }),
  wave: V({ head: CELL.crescent, glow: 4.5, core: false, trail: 0, emit: 'drips', rate: 30 }),
  rock: V({ head: -1, core: false, mesh: 1, ms: [1, 1], trail: 0, dark: 0.35, emit: 'dust', rate: 14 }),
  seed: V({ mesh: 1, ms: [0.7, 0.7], glow: 2.2, trail: 0.6, emit: 'wisps', rate: 8 }),
};

const BB_VERT = /* glsl */ `
attribute vec4 aP;    // xyz, size
attribute vec4 aC;    // rgb, alpha
attribute vec4 aM;    // cell, rotation, stretch, _
attribute vec3 aD;    // world direction (stretch)
varying vec2 vUv;
varying vec4 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(aP.xyz, 1.0);
  vec2 c = position.xy;
  float r = aM.y;
  vec2 ax = vec2(cos(r), sin(r)), ay = vec2(-ax.y, ax.x);
  vec2 off = (ax * c.x + ay * c.y) * aP.w;
  if (aM.z > 0.0) {
    vec2 vv = (modelViewMatrix * vec4(aD, 0.0)).xy;
    float l = length(vv);
    if (l > 1e-4) { vec2 d = vv / l; vec2 n = vec2(-d.y, d.x); off = n * c.x * aP.w + d * c.y * aP.w * (1.0 + aM.z * l); }
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vec2 cxy = vec2(mod(aM.x, ${ATLAS_N}.0), floor(aM.x / ${ATLAS_N}.0));
  vUv = (cxy + (c + 0.5)) / ${ATLAS_N}.0;
  vC = aC;
}
`;
const BB_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vC;
void main() {
  float a = texture2D(uAtlas, vUv).a * vC.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Per-frame camera-facing sprites (projectile heads). */
export class Billboards {
  readonly mesh: THREE.Mesh;
  count = 0;
  private readonly p: Float32Array;
  private readonly c: Float32Array;
  private readonly m: Float32Array;
  private readonly d: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly geo: THREE.InstancedBufferGeometry;
  constructor(readonly capacity: number) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (name: string, n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    const a1 = mk('aP', 4), a2 = mk('aC', 4), a3 = mk('aM', 4), a4 = mk('aD', 3);
    this.attrs = [a1, a2, a3, a4];
    this.p = a1.array as Float32Array; this.c = a2.array as Float32Array; this.m = a3.array as Float32Array; this.d = a4.array as Float32Array;
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      name: 'fx-billboards', vertexShader: BB_VERT, fragmentShader: BB_FRAG, uniforms: { uAtlas: { value: spriteAtlas(64) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
  }
  begin(): void { this.count = 0; }
  add(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number, cell: number, rot: number, stretch: number, dx: number, dy: number, dz: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.p[i * 4] = x; this.p[i * 4 + 1] = y; this.p[i * 4 + 2] = z; this.p[i * 4 + 3] = size;
    this.c[i * 4] = r; this.c[i * 4 + 1] = g; this.c[i * 4 + 2] = b; this.c[i * 4 + 3] = a;
    this.m[i * 4] = cell; this.m[i * 4 + 1] = rot; this.m[i * 4 + 2] = stretch;
    this.d[i * 3] = dx; this.d[i * 3 + 1] = dy; this.d[i * 3 + 2] = dz;
  }
  end(): void {
    const n = this.count;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (let i = 0; i < this.attrs.length; i++) {
      const a = this.attrs[i];
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const RB_VERT = /* glsl */ `
attribute vec4 aRC;
varying vec4 vC;
void main() { vC = aRC; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RB_FRAG = /* glsl */ `
varying vec4 vC;
void main() {
  if (vC.a < 0.003) discard;
  gl_FragColor = vec4(vC.rgb, vC.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Cheap render-side PRNG (visual jitter only; never used by the sim). */
let _seed = 0x2f6b3a1d;
export function rnd(): number {
  _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0;
  return _seed / 4294967296;
}
export function jit(): number {
  return rnd() * 2 - 1;
}

const K = 12; // trail points per slot
const SLOTS = 96;
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _y = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _e = new THREE.Euler();

export class ProjectileFx {
  readonly group = new THREE.Group();
  private readonly heads = new Billboards(SLOTS * 2);
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly ribbon: THREE.Mesh;
  private readonly rPos: Float32Array;
  private readonly rCol: Float32Array;
  private readonly rGeo: THREE.BufferGeometry;
  private readonly hist = new Float32Array(SLOTS * K * 3);
  private readonly histN = new Int32Array(SLOTS);
  private readonly histT = new Float32Array(SLOTS);
  private readonly slotId = new Int32Array(SLOTS).fill(-1);
  private readonly fade = new Float32Array(SLOTS);
  private readonly emitAcc = new Float32Array(SLOTS);
  private readonly slotVis: (PV | null)[] = new Array(SLOTS).fill(null);
  private readonly slotCol: THREE.Color[] = [];
  private readonly slotR = new Float32Array(SLOTS);
  private readonly colors = new Map<string, THREE.Color>();
  private time = 0;
  /** 0..1 emission density by quality. */
  density = 1;

  constructor(kit: Kit, private readonly particles: ParticleSystem, private readonly smoke: ParticleSystem) {
    for (let i = 0; i < SLOTS; i++) this.slotCol.push(new THREE.Color());
    this.group.name = 'fx-projectiles';
    this.group.add(this.heads.mesh);
    // solid meshes (unit size, +Z along the flight)
    const spear = geo.mergeGeometries([
      geo.ensureIndexed(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6, 1).rotateX(Math.PI / 2).translate(0, 0, -0.15)),
      geo.ensureIndexed(new THREE.ConeGeometry(0.16, 0.42, 6).rotateX(Math.PI / 2).translate(0, 0, 0.9)),
      geo.ensureIndexed(new THREE.BoxGeometry(0.28, 0.02, 0.22).translate(0, 0, -0.95)),
    ]);
    const rock = geo.rock(1, 1, 7, 0.3);
    const disc = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
    const shard = new THREE.OctahedronGeometry(1, 0).scale(0.5, 0.25, 1);
    const mat = kit.mat({ color: '#ffffff', roughness: 0.5, metalness: 0.2, rim: 0.9, detail: 'stone' });
    for (const g of [spear, rock, disc, shard]) {
      const im = new THREE.InstancedMesh(g, mat, SLOTS);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS * 3), 3);
      im.frustumCulled = false;
      im.count = 0;
      im.castShadow = false;
      this.meshes.push(im);
      this.group.add(im);
    }
    // ribbons: K points x 2 verts per slot
    const nv = SLOTS * K * 2;
    this.rPos = new Float32Array(nv * 3);
    this.rCol = new Float32Array(nv * 4);
    const idx: number[] = [];
    for (let s = 0; s < SLOTS; s++) {
      for (let k = 0; k < K - 1; k++) {
        const a = (s * K + k) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.rGeo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.rPos, 3).setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.rCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.rGeo.setAttribute('position', pa);
    this.rGeo.setAttribute('aRC', ca);
    this.rGeo.setIndex(idx);
    this.ribbon = new THREE.Mesh(this.rGeo, new THREE.ShaderMaterial({
      name: 'fx-trails', vertexShader: RB_VERT, fragmentShader: RB_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 13;
    this.group.add(this.ribbon);
  }

  private color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  update(sim: Sim, alpha: number, dt: number, cam: THREE.Vector3): void {
    this.time += dt;
    this.heads.begin();
    for (const m of this.meshes) m.count = 0;
    const items = sim.projectiles.items;
    const n = Math.min(SLOTS, items.length);
    for (let i = 0; i < n; i++) this.slot(i, items[i], alpha, dt, cam);
    this.heads.end();
    for (const m of this.meshes) {
      m.visible = m.count > 0;
      if (m.count) {
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor!.needsUpdate = true;
      }
    }
    (this.rGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.rGeo.attributes.aRC as THREE.BufferAttribute).needsUpdate = true;
  }

  private slot(i: number, p: Projectile, alpha: number, dt: number, cam: THREE.Vector3): void {
    const H = this.hist;
    if (p.active && this.slotId[i] !== p.id) {
      // new projectile in this pool slot
      this.slotId[i] = p.id;
      this.histN[i] = 0;
      this.histT[i] = 0;
      this.fade[i] = 1;
      this.emitAcc[i] = 0;
      this.slotVis[i] = VISUALS[p.visual] ?? VISUALS.orb;
      this.slotCol[i].copy(this.color(p.color || '#ffe0a0'));
      this.slotR[i] = Math.max(0.08, p.radius);
    }
    const vis = this.slotVis[i];
    if (!vis) return this.clearRibbon(i);
    if (!p.active) {
      // let the trail fade out behind a projectile that just ended
      this.fade[i] = Math.max(0, this.fade[i] - dt * 4);
      if (this.fade[i] <= 0) {
        this.slotVis[i] = null;
        this.slotId[i] = -1;
        return this.clearRibbon(i);
      }
      return this.writeRibbon(i, vis, cam, null);
    }
    const x = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
    const y = p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha;
    const z = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;
    _p.set(x, y, z);
    const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    if (sp > 1e-4) _d.set(p.vel.x / sp, p.vel.y / sp, p.vel.z / sp);
    else _d.set(0, 0, 1);
    const r = this.slotR[i];
    const c = this.slotCol[i];
    // history: a point every 25 ms (head always current)
    this.histT[i] += dt;
    if (this.histN[i] === 0 || this.histT[i] > 0.025) {
      this.histT[i] = 0;
      const o = i * K * 3;
      H.copyWithin(o + 3, o, o + (K - 1) * 3);
      this.histN[i] = Math.min(K, this.histN[i] + 1);
    }
    H[i * K * 3] = x; H[i * K * 3 + 1] = y; H[i * K * 3 + 2] = z;
    // head sprites
    const t = this.time;
    if (vis.head >= 0) this.heads.add(x, y, z, r * vis.glow, c.r * 1.2, c.g * 1.2, c.b * 1.2, 0.9, vis.head, vis.spin * t + i, vis.stretch, _d.x, _d.y, _d.z);
    if (vis.core) this.heads.add(x, y, z, r * 1.1, 1, 1, 1, 0.95, CELL.dot, 0, vis.stretch * 0.6, _d.x, _d.y, _d.z);
    if (vis.mesh >= 0) {
      const im = this.meshes[vis.mesh];
      const k = im.count++;
      if (vis.mesh === 2) {
        _q.setFromEuler(_e.set(0.15, t * 9 + i, 0));
      } else if (vis.mesh === 1) {
        _q.setFromEuler(_e.set(t * 3.1 + i, t * 2.3, 0));
      } else {
        _q.setFromUnitVectors(_z, _d);
      }
      const across = r * vis.ms[0], along = r * vis.ms[1];
      _s.set(across, vis.mesh === 2 ? along : across, vis.mesh === 2 ? across : along);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(k, _m);
      const dk = 1 - vis.dark;
      _side.set(c.r * dk + 0.12 * (1 - dk), c.g * dk + 0.1 * (1 - dk), c.b * dk + 0.12 * (1 - dk));
      im.instanceColor!.setXYZ(k, _side.x, _side.y, _side.z);
    }
    this.writeRibbon(i, vis, cam, c);
    // particles shed along the path
    if (vis.emit && vis.rate > 0) {
      this.emitAcc[i] += dt * vis.rate * this.density;
      while (this.emitAcc[i] >= 1) {
        this.emitAcc[i] -= 1;
        this.shed(vis.emit, x, y, z, r, c, p.vel.x, p.vel.y, p.vel.z);
      }
    }
  }

  private shed(kind: Emit, x: number, y: number, z: number, r: number, c: THREE.Color, vx: number, vy: number, vz: number): void {
    const P = this.particles, S = this.smoke;
    switch (kind) {
      case 'embers':
        P.emitRaw(x + jit() * r * 0.5, y + jit() * r * 0.5, z + jit() * r * 0.5, vx * 0.1 + jit() * 1.2, vy * 0.1 + 1.2 + jit(), vz * 0.1 + jit() * 1.2, 0.5 + rnd() * 0.4, r * 0.55, r * 0.1, c.r, c.g * 0.8, c.b * 0.5, 0.9, CELL.dot, -1.5, 1.2, 0, 0.05, 0.05);
        if (rnd() < 0.35) S.emitRaw(x, y, z, jit() * 0.4, 0.8, jit() * 0.4, 0.9, r * 0.8, r * 2.2, 0.18, 0.15, 0.14, 0.35, CELL.smoke, -0.4, 1.5, jit(), 0, 0.15);
        break;
      case 'wisps':
        P.emitRaw(x + jit() * r * 0.6, y + jit() * r * 0.6, z + jit() * r * 0.6, jit() * 0.5, 0.4 + rnd() * 0.5, jit() * 0.5, 0.7 + rnd() * 0.5, r * 0.9, r * 0.2, c.r, c.g, c.b, 0.55, CELL.dot, -0.3, 1.0, 0, 0, 0.15);
        break;
      case 'sparks':
        P.emitRaw(x, y, z, -vx * 0.15 + jit() * 2.5, -vy * 0.15 + jit() * 2.5, -vz * 0.15 + jit() * 2.5, 0.25 + rnd() * 0.25, r * 0.35, r * 0.08, c.r, c.g, c.b, 1, CELL.spark, 3, 2, 0, 0.08, 0.02);
        break;
      case 'stars':
        P.emitRaw(x + jit() * r, y + jit() * r, z + jit() * r, jit() * 0.3, jit() * 0.3, jit() * 0.3, 0.6 + rnd() * 0.4, r * 0.7, 0, c.r, c.g, c.b, 0.9, CELL.star, 0, 0.5, 2, 0, 0.1);
        break;
      case 'petals':
        S.emitRaw(x + jit() * r, y + jit() * r, z + jit() * r, jit() * 0.8, -0.3, jit() * 0.8, 1.2 + rnd() * 0.6, r * 0.6, r * 0.5, c.r, c.g, c.b, 0.9, CELL.petal, 0.6, 0.8, jit() * 4, 0, 0.05);
        break;
      case 'feathers':
        S.emitRaw(x, y, z, jit() * 0.6, -0.2, jit() * 0.6, 1.4, r * 0.9, r * 0.8, Math.min(1, c.r + 0.3), Math.min(1, c.g + 0.3), Math.min(1, c.b + 0.3), 0.85, CELL.feather, 0.8, 1.2, jit() * 3, 0, 0.05);
        break;
      case 'drips':
        S.emitRaw(x + jit() * r * 0.4, y - r * 0.3, z + jit() * r * 0.4, vx * 0.05, -0.5, vz * 0.05, 0.6, r * 0.35, r * 0.2, c.r * 0.9, c.g * 0.9, c.b * 0.9, 0.8, CELL.dot, 9, 0.5, 0, 0, 0.05);
        break;
      case 'smoke':
        S.emitRaw(x + jit() * r * 0.5, y + jit() * r * 0.5, z + jit() * r * 0.5, jit() * 0.4, 0.2, jit() * 0.4, 0.8 + rnd() * 0.4, r * 1.0, r * 2.0, 0.05, 0.04, 0.06, 0.55, CELL.smoke, -0.2, 1.5, jit(), 0, 0.1);
        break;
      case 'dust':
        S.emitRaw(x, y - r * 0.5, z, jit() * 0.5, 0.3, jit() * 0.5, 1.0, r * 0.8, r * 2.4, 0.42, 0.38, 0.32, 0.35, CELL.smoke, -0.2, 1.8, jit(), 0, 0.15);
        break;
      default:
        break;
    }
  }

  private writeRibbon(i: number, vis: PV, cam: THREE.Vector3, col: THREE.Color | null): void {
    const n = this.histN[i];
    const P = this.rPos, C = this.rCol, H = this.hist;
    const w0 = this.slotR[i] * vis.trail;
    const c = col ?? this.slotCol[i];
    const f = this.fade[i];
    for (let k = 0; k < K; k++) {
      const v = (i * K + k) * 2;
      const kk = Math.min(k, Math.max(0, n - 1));
      const o = (i * K + kk) * 3;
      const px = H[o], py = H[o + 1], pz = H[o + 2];
      if (vis.trail <= 0 || n < 2) {
        P[v * 3] = P[v * 3 + 3] = px; P[v * 3 + 1] = P[v * 3 + 4] = py; P[v * 3 + 2] = P[v * 3 + 5] = pz;
        C[v * 4 + 3] = C[v * 4 + 7] = 0;
        continue;
      }
      // segment direction (toward the older point) and side vector facing the camera
      const o2 = (i * K + Math.min(n - 1, kk + 1)) * 3, o1 = (i * K + Math.max(0, kk - 1)) * 3;
      _seg.set(H[o2] - H[o1], H[o2 + 1] - H[o1 + 1], H[o2 + 2] - H[o1 + 2]);
      _toCam.set(cam.x - px, cam.y - py, cam.z - pz);
      _side.crossVectors(_seg, _toCam);
      const sl = _side.length();
      // a trail flying straight at the camera thins out instead of standing up as a bar
      const denom = _seg.length() * _toCam.length();
      const face = denom > 1e-6 ? Math.min(1, Math.max(0.15, sl / denom)) : 0.15;
      if (sl > 1e-6) _side.multiplyScalar(1 / sl);
      else _side.copy(_y);
      const u = k / (K - 1);
      const w = w0 * (1 - u * 0.85) * face;
      P[v * 3] = px + _side.x * w; P[v * 3 + 1] = py + _side.y * w; P[v * 3 + 2] = pz + _side.z * w;
      P[v * 3 + 3] = px - _side.x * w; P[v * 3 + 4] = py - _side.y * w; P[v * 3 + 5] = pz - _side.z * w;
      const a = (k < n ? (1 - u) * (1 - u) : 0) * 0.85 * f;
      const hot = 1 - u;
      C[v * 4] = C[v * 4 + 4] = c.r + (1 - c.r) * hot * 0.4;
      C[v * 4 + 1] = C[v * 4 + 5] = c.g + (1 - c.g) * hot * 0.4;
      C[v * 4 + 2] = C[v * 4 + 6] = c.b + (1 - c.b) * hot * 0.4;
      C[v * 4 + 3] = C[v * 4 + 7] = a;
    }
  }

  private clearRibbon(i: number): void {
    const C = this.rCol;
    for (let k = 0; k < K; k++) {
      const v = (i * K + k) * 2;
      C[v * 4 + 3] = 0;
      C[v * 4 + 7] = 0;
    }
  }

  dispose(): void {
    this.heads.dispose();
    for (const m of this.meshes) m.geometry.dispose();
    this.rGeo.dispose();
    (this.ribbon.material as THREE.Material).dispose();
  }
}
