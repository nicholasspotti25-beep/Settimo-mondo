/**
 * Weapon FX: swing trails (camera-independent ribbons swept by the blade line of the Portatore's weapon), sim-driven
 * weapon morphs (snake-sword extension, Art glow), Transizione flashes and the Art visuals (vfx ids `art_*:<phase>`
 * emitted by src/sim/arts.ts). Everything is pooled at install time: ribbons, slash arcs (a shader-swept arc strip),
 * root tendrils (one InstancedMesh); the per-frame path allocates nothing.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { SimEvent } from '../../sim/types';
import type { WeaponDef } from '../../core/types';
import * as geo from '../kit/geometry';
import { elementColor } from '../kit/palette';
import { CELL } from '../fx/particles';
import { jit, rnd } from '../fx/projectiles';
import type { FxRenderer } from '../fx/FxRenderer';
import type { WeaponMorph, WeaponVisual } from './types';

/* ---------------------------------------------------------------------------------------------------------------- */
/* Live weapon visuals (registered by buildWeapon)                                                                   */
/* ---------------------------------------------------------------------------------------------------------------- */

export const LIVE = new Set<WeaponVisual>();

function inScene(o: THREE.Object3D, scene: THREE.Object3D | null): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (p === scene) return true;
    p = p.parent;
  }
  return false;
}

/** The visual of the weapon in the Portatore's hand (attached under the same scene as the fx group). */
function playerWeapon(sim: Sim, scene: THREE.Object3D | null): WeaponVisual | null {
  const id = sim.player.weaponId;
  if (!id) return null;
  for (const v of LIVE) if (v.def?.id === id && v.root.parent && inScene(v.root, scene)) return v;
  return null;
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Ribbon trail                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

const RIB_VERT = /* glsl */ `
attribute vec2 aRib; // x = age 0..1 (0 newest), y = 0 hilt side .. 1 tip
varying vec2 vRib;
void main() {
  vRib = aRib;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIB_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
uniform float uAlpha;
varying vec2 vRib;
void main() {
  float age = clamp(vRib.x, 0.0, 1.0);
  float side = vRib.y;
  float life = pow(1.0 - age, 1.6);
  float body = smoothstep(0.0, 0.55, side);
  float edge = smoothstep(0.72, 1.0, side);
  vec3 col = mix(uGlow, uCore, edge * (1.0 - age * 0.6));
  float a = (body * 0.62 + edge * 1.15) * life * uAlpha;
  gl_FragColor = vec4(col * a, 1.0);
}`;

const CAP = 28; // samples
const SUB = 3; // Catmull-Rom subdivisions per sample gap
const RV = ((CAP - 1) * SUB + 1) * 2;

class Ribbon {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly rib: Float32Array;
  private readonly s = new Float32Array(CAP * 7); // bx by bz tx ty tz age
  private n = 0;
  private readonly mat: THREE.ShaderMaterial;
  life = 0.2;

  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(RV * 3);
    this.rib = new Float32Array(RV * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRib', new THREE.BufferAttribute(this.rib, 2).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < RV / 2 - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      name: 'weapon-trail', vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, uniforms: { uCore: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffd080') }, uAlpha: { value: 1 } },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  colors(core: THREE.Color, glow: THREE.Color, alpha: number): void {
    (this.mat.uniforms.uCore.value as THREE.Color).copy(core);
    (this.mat.uniforms.uGlow.value as THREE.Color).copy(glow);
    this.mat.uniforms.uAlpha.value = alpha;
  }

  push(b: THREE.Vector3, t: THREE.Vector3): void {
    const s = this.s;
    if (this.n === CAP) this.n--;
    s.copyWithin(7, 0, this.n * 7);
    s[0] = b.x; s[1] = b.y; s[2] = b.z; s[3] = t.x; s[4] = t.y; s[5] = t.z; s[6] = 0;
    this.n++;
  }

  clear(): void {
    this.n = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  update(dt: number): void {
    const s = this.s;
    for (let i = 0; i < this.n; i++) s[i * 7 + 6] += dt;
    while (this.n > 0 && s[(this.n - 1) * 7 + 6] > this.life) this.n--;
    const n = this.n;
    if (n < 2) {
      this.mesh.geometry.setDrawRange(0, 0);
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const P = this.pos, R = this.rib;
    let v = 0;
    for (let i = 0; i < n - 1; i++) {
      const i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n - 1, i + 2);
      for (let k = 0; k < SUB; k++) {
        const u = k / SUB;
        for (let side = 0; side < 2; side++) {
          const o = side * 3;
          for (let ax = 0; ax < 3; ax++) {
            const p0 = s[i0 * 7 + o + ax], p1 = s[i * 7 + o + ax], p2 = s[i2 * 7 + o + ax], p3 = s[i3 * 7 + o + ax];
            P[v * 3 + ax] = catmull(p0, p1, p2, p3, u);
          }
          const age = s[i * 7 + 6] + (s[i2 * 7 + 6] - s[i * 7 + 6]) * u;
          R[v * 2] = age / this.life;
          R[v * 2 + 1] = side;
          v++;
        }
      }
    }
    for (let side = 0; side < 2; side++) {
      const o = side * 3, i = n - 1;
      P[v * 3] = s[i * 7 + o]; P[v * 3 + 1] = s[i * 7 + o + 1]; P[v * 3 + 2] = s[i * 7 + o + 2];
      R[v * 2] = s[i * 7 + 6] / this.life;
      R[v * 2 + 1] = side;
      v++;
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aRib as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, (v / 2 - 1) * 6);
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Pooled slash arcs                                                                                                  */
/* ---------------------------------------------------------------------------------------------------------------- */

const ARC_VERT = /* glsl */ `
attribute vec2 aUV;
uniform float uA0;
uniform float uA1;
uniform float uR0;
uniform float uR1;
varying vec2 vUV;
void main() {
  float a = mix(uA0, uA1, aUV.x);
  float r = mix(uR0, uR1, aUV.y);
  vUV = aUV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * r, sin(a) * r, 0.0, 1.0);
}`;
const ARC_FRAG = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uGlow;
uniform float uHead;
uniform float uTail;
uniform float uAlpha;
varying vec2 vUV;
void main() {
  float u = vUV.x;
  if (u > uHead) discard;
  float tail = smoothstep(uTail, uTail + 0.35, u);
  float across = vUV.y;
  float edge = pow(smoothstep(0.35, 1.0, across), 2.0);
  float body = smoothstep(0.0, 0.7, across) * (1.0 - smoothstep(0.96, 1.0, across) * 0.4);
  float head = smoothstep(uHead - 0.12, uHead, u);
  vec3 col = mix(uGlow, uCore, clamp(edge + head * 0.5, 0.0, 1.0));
  float a = (body * 0.7 + edge * 1.3 + head * edge * 0.7) * tail * uAlpha;
  gl_FragColor = vec4(col * a, 1.0);
}`;

/** Arc planes: 0 horizontal (a = 90deg forward, 0deg left), 1 vertical through forward (a = 0 forward, 90 up),
 *  2 facing (perpendicular to forward, a = 90 up, 0 left). */
interface ArcSlot {
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  sweep: number;
  life: number;
  hold: number;
  tailLen: number;
  alpha: number;
  active: boolean;
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');

class Arcs {
  readonly group = new THREE.Group();
  private slots: ArcSlot[] = [];

  constructor(count: number) {
    const along = 40, g = new THREE.BufferGeometry();
    const uv = new Float32Array((along + 1) * 2 * 2), pos = new Float32Array((along + 1) * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i <= along; i++) {
      uv[i * 4] = i / along; uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = i / along; uv[i * 4 + 3] = 1;
      if (i < along) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        name: 'weapon-arc', vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: {
          uA0: { value: 0 }, uA1: { value: 1 }, uR0: { value: 0.5 }, uR1: { value: 1 }, uCore: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
          uHead: { value: 0 }, uTail: { value: -1 }, uAlpha: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 13;
      const pivot = new THREE.Object3D();
      pivot.add(mesh);
      pivot.visible = false;
      this.group.add(pivot);
      this.slots.push({ pivot, mesh, mat, t: 0, sweep: 0.1, life: 0.4, hold: 0, tailLen: 0.6, alpha: 1, active: false });
    }
  }

  /**
   * Spawn a slash arc centred at (x, y, z) in the player's frame (yaw), plane 0/1/2, rolled about the forward axis.
   * a0 -> a1 (radians) is swept over `sweep` s, held `hold` s, then fades over the rest of `life`.
   */
  spawn(x: number, y: number, z: number, yaw: number, plane: number, roll: number, r: number, width: number, a0: number, a1: number,
    core: THREE.Color, glow: THREE.Color, sweep: number, life: number, hold = 0, alpha = 1, tailLen = 0.7, offY = 0): void {
    let s = this.slots[0];
    for (const c of this.slots) {
      if (!c.active) { s = c; break; }
      if (c.t / c.life > s.t / s.life) s = c;
    }
    s.active = true;
    s.t = 0; s.sweep = Math.max(0.01, sweep); s.life = Math.max(life, sweep + hold + 0.05); s.hold = hold; s.alpha = alpha; s.tailLen = tailLen;
    s.pivot.position.set(x, y, z);
    _e.set(0, yaw, roll, 'YXZ');
    s.pivot.quaternion.setFromEuler(_e);
    if (plane === 0) s.mesh.rotation.set(Math.PI / 2, 0, 0);
    else if (plane === 1) s.mesh.rotation.set(0, -Math.PI / 2, 0);
    else s.mesh.rotation.set(0, 0, 0);
    s.mesh.position.set(0, offY, 0);
    const u = s.mat.uniforms;
    u.uA0.value = a0; u.uA1.value = a1; u.uR0.value = Math.max(0, r - width); u.uR1.value = r;
    (u.uCore.value as THREE.Color).copy(core);
    (u.uGlow.value as THREE.Color).copy(glow);
    u.uHead.value = 0; u.uTail.value = -1; u.uAlpha.value = alpha;
    s.pivot.visible = true;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.active) continue;
      s.t += dt;
      const u = s.mat.uniforms;
      const head = Math.min(1, s.t / s.sweep);
      u.uHead.value = head;
      const after = s.t - s.sweep - s.hold;
      // the tail chases the head while sweeping, then the whole arc fades
      u.uTail.value = s.hold > 0 ? -1 : head - s.tailLen - Math.max(0, after) * 2.5;
      const fadeT = Math.max(0, after) / Math.max(0.01, s.life - s.sweep - s.hold);
      u.uAlpha.value = s.alpha * (1 - fadeT * fadeT);
      if (s.t >= s.life) {
        s.active = false;
        s.pivot.visible = false;
      }
    }
  }

  clear(): void {
    for (const s of this.slots) {
      s.active = false;
      s.pivot.visible = false;
    }
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Pooled root tendrils (Radici Fameliche)                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

interface RootSet { x: number; y: number; z: number; r: number; t: number; delay: number; hold: number; active: boolean; seed: number }

class Roots {
  readonly mesh: THREE.InstancedMesh;
  private sets: RootSet[] = [];
  private readonly per = 9;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(material: THREE.Material) {
    const g = geo.horn(1, 0.11, 1.5, 0.4, 10, 6);
    geo.gradient(g, 1, '#2a1e14', '#6a8a3a');
    this.mesh = new THREE.InstancedMesh(g, material, this.per * 2);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.per * 2;
    for (let i = 0; i < 2; i++) this.sets.push({ x: 0, y: 0, z: 0, r: 2, t: 0, delay: 0.4, hold: 2.5, active: false, seed: 0 });
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.per * 2; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.visible = false;
  }

  spawn(x: number, y: number, z: number, r: number, delay: number, hold: number): void {
    const s = this.sets[0].active ? this.sets[1] : this.sets[0];
    s.x = x; s.y = y; s.z = z; s.r = r; s.t = 0; s.delay = delay; s.hold = hold; s.active = true; s.seed = rnd() * 6.28;
    this.mesh.visible = true;
  }

  update(dt: number, time: number): void {
    let any = false;
    for (let k = 0; k < 2; k++) {
      const s = this.sets[k];
      if (s.active) s.t += dt;
      const grow = s.active ? smooth((s.t - s.delay) / 0.22) : 0;
      const sink = s.active ? 1 - smooth((s.t - s.delay - s.hold) / 0.45) : 0;
      const g = grow * sink;
      if (s.active && s.t > s.delay + s.hold + 0.5) s.active = false;
      if (g > 0) any = true;
      for (let i = 0; i < this.per; i++) {
        const a = s.seed + (i / this.per) * Math.PI * 2;
        const rr = s.r * (0.55 + ((i * 37) % 10) / 22);
        this.p.set(s.x + Math.sin(a) * rr, s.y - 0.15, s.z + Math.cos(a) * rr);
        // lean inward over the target, writhing while it holds
        const writhe = Math.sin(time * 3.1 + i * 1.7) * 0.12;
        this.e.set(0, a + Math.PI + writhe, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        const h = (1.2 + ((i * 53) % 7) * 0.16) * Math.min(1.6, 0.6 + s.r * 0.25);
        this.sc.set(g * 0.9 + 0.001, g * h + 0.001, g * h * 0.6 + 0.001);
        this.m.compose(this.p, this.q, this.sc);
        this.mesh.setMatrixAt(k * this.per + i, this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = any;
  }

  clear(): void {
    for (const s of this.sets) s.active = false;
  }
}

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Install                                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

type VfxEvent = Extract<SimEvent, { type: 'vfx' }>;
interface ArtCtx { fx: FxRenderer; sim: Sim; arcs: Arcs; roots: Roots; w: WeaponVisual | null; e: VfxEvent; phase: string; x: number; y: number; z: number; yaw: number; k: number; n: number }
type ArtFx = (c: ArtCtx) => void;

const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const MORPH: WeaponMorph = { extend: 0, art: 0, swing: 0 };
/** Sim-time step of the current frame (scheduled visuals follow the sim through hit-stop and slow motion). */
let SIM_DT = 0;
/** Effects whose Arts swing the weapon (trail on during the Art). */
const MELEE_ARTS = new Set(['dash_strike', 'spin', 'multi_strike', 'counter_stance', 'slam', 'grab_pull', 'dot_stab', 'throw_return', 'hazard_zone']);
/** Weapon types whose blade extends on whip swings. */
const EXTENDING = new Set(['spada_serpentina', 'frusta', 'catene', 'flagello']);

export function installWeaponFxImpl(fx: FxRenderer): void {
  const main = new Ribbon(), off = new Ribbon();
  const arcs = new Arcs(14);
  const rootMat = fx.ctx.kit.surface({ vertexColors: true, roughness: 0.85, metalness: 0, detail: 'bark', detailScale: 6, detailStrength: 0.5, rim: 1.2, emissive: '#3a5a1a', emissiveIntensity: 0.25 });
  const roots = new Roots(rootMat);
  fx.group.add(main.mesh, off.mesh, arcs.group, roots.mesh);
  const core = new THREE.Color(), glow = new THREE.Color();
  let lastWeapon: WeaponVisual | null = null;
  let artGlow = 0;
  let time = 0;
  let simT = -1;

  fx.spawn({
    update: (dt, sim) => {
      time += dt;
      // trails and arcs age in sim time: they freeze in hit-stop and stretch in slow motion like the swing itself
      const sdt = simT < 0 || sim.time < simT ? dt : Math.min(0.1, sim.time - simT);
      simT = sim.time;
      SIM_DT = sdt;
      const scene = fx.group.parent;
      const w = playerWeapon(sim, scene);
      if (w !== lastWeapon) {
        main.clear();
        off.clear();
        lastWeapon = w;
      }
      const p = sim.player;
      // morph input
      const sw = p.swing;
      let swingK = 0, extend = 0, emit = false;
      const st = p.state;
      if (sw && (st === 'light' || st === 'heavy' || st === 'running' || st === 'jumping' || st === 'transizione' || st === 'counter')) {
        const d = sw.def;
        const sum = Math.max(0.05, d.startup + d.active + d.recovery);
        const k = Math.max(0.05, sw.dur) / sum;
        const s0 = d.startup * k, s1 = (d.startup + d.active) * k;
        const t = sw.t;
        swingK = t < s0 ? smooth((t - s0 * 0.5) / (s0 * 0.5)) : t < s1 ? 1 : 1 - smooth((t - s1) / Math.max(0.05, (sw.dur - s1) * 0.5));
        emit = !!d.shape && t > s0 * 0.55 && t < s1 + (sw.dur - s1) * 0.22;
        if (w?.def && EXTENDING.has(w.def.type) && d.anim.startsWith('whip')) extend = swingK;
      }
      const art = p.art;
      if (st === 'art' && art) {
        artGlow = Math.min(1, artGlow + dt * 8);
        const melee = MELEE_ARTS.has(art.effect);
        if (melee && art.t > 0.06 && art.t < art.dur * 0.82) emit = true;
        if (w?.def && EXTENDING.has(w.def.type) && (art.effect === 'dash_strike' || art.effect === 'grab_pull')) extend = art.t < art.dur * 0.85 ? 1 : 0;
        swingK = Math.max(swingK, melee ? 0.8 : 0);
      } else artGlow = Math.max(0, artGlow - dt * 2.5);
      MORPH.extend = extend;
      MORPH.art = artGlow;
      MORPH.swing = swingK;
      if (w) w.morph?.(MORPH);
      // trails
      if (w && w.trail) {
        core.set(w.trail.color);
        glow.set(w.trail.glow);
        const a = Math.min(1.5, w.trail.width * (1 + artGlow * 0.4));
        main.colors(core, glow, a);
        off.colors(core, glow, a);
        main.life = artGlow > 0.5 ? 0.26 : 0.2;
        off.life = main.life;
        if (emit && p.alive && sdt > 0) {
          w.root.updateWorldMatrix(true, false);
          _b.copy(w.base).applyMatrix4(w.root.matrixWorld);
          _t.copy(w.tip).applyMatrix4(w.root.matrixWorld);
          main.push(_b, _t);
          if (w.offhand && w.offBase && w.offTip && w.offhand.parent) {
            w.offhand.updateWorldMatrix(true, false);
            _b.copy(w.offBase).applyMatrix4(w.offhand.matrixWorld);
            _t.copy(w.offTip).applyMatrix4(w.offhand.matrixWorld);
            off.push(_b, _t);
          }
        }
      }
      main.update(sdt);
      off.update(sdt);
      arcs.update(sdt);
      roots.update(dt, time);
      return true;
    },
    dispose: () => undefined,
  });

  const ctx: ArtCtx = { fx, sim: null as unknown as Sim, arcs, roots, w: null, e: null as unknown as VfxEvent, phase: '', x: 0, y: 0, z: 0, yaw: 0, k: 0, n: 0 };

  fx.registerVfx('art_*', (e, sim) => {
    const i = e.id.indexOf(':');
    const name = i >= 0 ? e.id.slice(0, i) : e.id;
    ctx.phase = i >= 0 ? e.id.slice(i + 1) : '';
    ctx.sim = sim;
    ctx.e = e;
    ctx.w = playerWeapon(sim, fx.group.parent);
    ctx.x = e.pos.x; ctx.y = e.pos.y; ctx.z = e.pos.z;
    const pr = e.params ?? {};
    ctx.yaw = typeof pr.yaw === 'number' ? pr.yaw : sim.player.yaw;
    ctx.k = typeof pr.k === 'number' ? pr.k : 0;
    ctx.n = typeof pr.n === 'number' ? pr.n : 0;
    const h = ART_FX[name];
    if (h) h(ctx);
    else genericArt(ctx);
  });

  // Art cast: a flare along the weapon (start of every Art) + per-Art start dressing
  fx.registerHandler('art', (e, sim) => {
    if (e.type !== 'art') return;
    const w = playerWeapon(sim, fx.group.parent);
    const def = sim.c.hasWeapon(e.weapon) ? sim.c.weapon(e.weapon) : null;
    const col = fx.color(def?.model.colors?.accent ?? '#ffe6b0');
    if (w) {
      w.root.updateWorldMatrix(true, false);
      _t.copy(w.tip).applyMatrix4(w.root.matrixWorld);
      _b.copy(w.base).applyMatrix4(w.root.matrixWorld);
      fx.flash(_t.x, _t.y, _t.z, col, 1.3, 0.3, CELL.star, 3);
      for (let i = 0; i < 6; i++) {
        const k = i / 5;
        fx.motes(_b.x + (_t.x - _b.x) * k, _b.y + (_t.y - _b.y) * k, _b.z + (_t.z - _b.z) * k, col, 2, 0.05, 0.5, 0.12);
      }
    }
    const start = e.vfx ? ART_START[e.vfx] : undefined;
    if (start) {
      ctx.sim = sim; ctx.w = w; ctx.phase = 'start';
      ctx.x = sim.player.pos.x; ctx.y = sim.player.pos.y; ctx.z = sim.player.pos.z; ctx.yaw = sim.player.yaw; ctx.k = 0; ctx.n = 0;
      start(ctx);
    }
  });

  // Transizione: a flash in the new weapon's color and a linking arc
  fx.registerHandler('transizione', (e, sim) => {
    if (e.type !== 'transizione') return;
    const p = sim.player;
    const wid = p.weaponId;
    const def = wid && sim.c.hasWeapon(wid) ? sim.c.weapon(wid) : null;
    const a = fx.color(def?.model.colors?.accent ?? '#ffe6b0');
    const y = p.pos.y + 1.15 * p.scale;
    fx.flash(p.pos.x, y, p.pos.z, fx.color('#ffffff'), 1.6, 0.22, CELL.star, 4);
    fx.flash(p.pos.x, y, p.pos.z, a, 2.6, 0.32, CELL.rays, -2);
    fx.motes(p.pos.x, p.pos.y + 0.6, p.pos.z, a, 10, 0.6, 1.4, 0.14);
    _c0.copy(a).lerp(fx.color('#ffffff'), 0.5);
    arcs.spawn(p.pos.x, y, p.pos.z, p.yaw, 0, 0, 2.6 * p.scale, 0.9 * p.scale, Math.PI / 2 + 1.4, Math.PI / 2 - 1.4, _c0, a, 0.14, 0.4, 0, 0.9);
  });

  fx.registerHandler('zoneEnter', () => {
    main.clear();
    off.clear();
    arcs.clear();
    roots.clear();
  });
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Art visuals                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

const FWD = { x: 0, z: 0 };
function fwd(yaw: number): { x: number; z: number } {
  FWD.x = Math.sin(yaw);
  FWD.z = Math.cos(yaw);
  return FWD;
}

/** A light wake along the player's path for `dur` seconds (dash Arts). */
function wake(c: ArtCtx, col: THREE.Color, dur: number, rate: number, size: number, cell: number = CELL.dot, back = 6): void {
  const fx = c.fx;
  let t = 0, acc = 0;
  fx.spawn({
    update: (_dt, sim) => {
      const dt = SIM_DT;
      t += dt;
      acc += dt * rate;
      const p = sim.player;
      const f = fwd(p.yaw);
      while (acc >= 1) {
        acc -= 1;
        const h = 0.3 + rnd() * 1.5;
        fx.particles.emitRaw(p.pos.x + jit() * 0.35, p.pos.y + h, p.pos.z + jit() * 0.35, -f.x * back + jit() * 0.6, jit() * 0.4, -f.z * back + jit() * 0.6,
          0.25 + rnd() * 0.25, size, size * 0.2, col.r, col.g, col.b, 1, cell, 0, 3, 0, cell === CELL.spark ? 0.06 : 0, 0.02);
      }
      return t < dur;
    },
    dispose: () => undefined,
  });
}

/** Run `fn` after `delay` seconds (scheduled visuals: the rising cut at the end of a dash). */
function later(c: ArtCtx, delay: number, fn: (sim: Sim) => void): void {
  let t = 0;
  c.fx.spawn({
    update: (_dt, sim) => {
      t += SIM_DT;
      if (t >= delay) {
        fn(sim);
        return false;
      }
      return true;
    },
    dispose: () => undefined,
  });
}

/** Strike point in front of the player at `reach` (chest height). */
function strikePoint(sim: Sim, reach: number, out: THREE.Vector3): THREE.Vector3 {
  const p = sim.player, f = fwd(p.yaw);
  return out.set(p.pos.x + f.x * reach, p.pos.y + 1.15 * p.scale, p.pos.z + f.z * reach);
}

function artParam(sim: Sim, _c: ArtCtx, key: string, d: number): number {
  const v = sim.player.art?.def.params[key];
  return typeof v === 'number' ? v : d;
}

function weaponOf(c: ArtCtx): WeaponDef | null {
  return c.w?.def ?? null;
}

function genericArt(c: ArtCtx): void {
  const { fx, x, y, z } = c;
  const def = weaponOf(c);
  const col = fx.color(def?.model.colors?.accent ?? '#ffe6b0');
  const el = c.sim.player.art?.def.params.element;
  const ec = typeof el === 'string' ? fx.color(elementColor(el as never)) : col;
  const h = y + 1.1;
  switch (c.phase) {
    case 'hit': case 'impact': case 'burst': case 'counter': case 'throw': case 'emerge': case 'crush':
      fx.flash(x, h, z, ec, 2.4, 0.3, CELL.rays, 2);
      fx.sparks(x, h, z, ec, 18, 8);
      break;
    default:
      fx.motes(x, y + 0.5, z, ec, 8, 0.7, 1.4, 0.16);
      fx.flash(x, h, z, col, 1.2, 0.2, CELL.star);
  }
}

const PI = Math.PI;

const ART_START: Record<string, ArtFx> = {
  // Postura del Viandante: the guard is taken — a lantern-amber ring at the feet and a vertical guard line
  art_postura_viandante: (c) => {
    const { fx, sim } = c;
    const p = sim.player;
    const amber = fx.color('#e8b860');
    const dur = artParam(sim, c, 'dur', 1.4) - 0.3;
    fx.ring(p.pos.x, sim.groundAt(p.pos.x, p.pos.z), p.pos.z, 1.6 * p.scale, amber, 0.45, 0.35, 0, 1.2);
    _c0.set('#fff0d0');
    c.arcs.spawn(p.pos.x, p.pos.y + 0.06, p.pos.z, p.yaw, 0, 0, 1.25 * p.scale, 0.12, PI / 2 - 1.4, PI / 2 + 1.4, _c0, amber, 0.18, dur, dur - 0.25, 0.8);
    let t = 0;
    fx.spawn({
      update: (dt, s) => {
        t += dt;
        const pl = s.player;
        if (pl.state !== 'art' || !pl.art || pl.art.def.vfx !== 'art_postura_viandante' || pl.art.data.countered) return false;
        if (rnd() < dt * 22) fx.motes(pl.pos.x + jit() * 0.8, pl.pos.y + 0.1, pl.pos.z + jit() * 0.8, amber, 1, 0.1, 1.0, 0.11);
        return t < dur + 0.2;
      },
      dispose: () => undefined,
    });
  },
};

const ART_FX: Record<string, ArtFx> = {
  /* --- Lama della Culla ------------------------------------------------------------------------------------------ */
  // Primo Passo: a pale dawn wake along the lunge, a star where it lands
  art_primo_passo: (c) => {
    const { fx, sim } = c;
    const dawn = fx.color('#fff1d0'), gold = fx.color('#ffd99a');
    if (c.phase === 'dash') {
      wake(c, dawn, 0.3, 120, 0.3, CELL.spark, 7);
      fx.flash(c.x, c.y + 1.0, c.z, gold, 1.6, 0.2, CELL.star, 2);
      fx.puff(c.x, c.y, c.z, fx.color('#b8aa98'), 5, 0.6, 0.6, 0.3);
      later(c, 0.2, (s) => {
        const p = s.player;
        _c0.copy(dawn);
        c.arcs.spawn(p.pos.x, p.pos.y + 1.1 * p.scale, p.pos.z, p.yaw, 2, 0.25, 1.3 * p.scale, 0.5 * p.scale, PI * 0.95, PI * 0.05, _c0, gold, 0.1, 0.36);
      });
    } else if (c.phase === 'hit') {
      strikePoint(sim, 1.7 * sim.player.scale, _t);
      fx.flash(_t.x, _t.y, _t.z, fx.color('#ffffff'), 2.2, 0.22, CELL.star, 3);
      fx.flash(_t.x, _t.y, _t.z, gold, 3.4, 0.32, CELL.rays, -2);
      fx.sparks(_t.x, _t.y, _t.z, dawn, 20, 9, 0.15);
    }
  },
  // Ninnananna dell'Alba: two crossing cuts that hang as a cross of pale light, then burst
  art_croce_di_luce: (c) => {
    const { fx, sim } = c;
    const pale = fx.color('#fff8e8'), dawn = fx.color('#ffd99a');
    const p = sim.player, s = p.scale;
    if (c.phase === 'strike') {
      const f = fwd(p.yaw);
      const d = 1.55 * s;
      const roll = c.k % 2 === 0 ? 0.72 : -0.72;
      _c0.copy(pale);
      // a long diagonal cut that stays hanging until the burst
      c.arcs.spawn(p.pos.x + f.x * d, p.pos.y + 1.25 * s, p.pos.z + f.z * d, p.yaw, 2, roll, 2.2 * s, 0.16 * s, PI / 2 + 0.62, PI / 2 - 0.62, _c0, dawn, 0.09, 0.75, Math.max(0.02, 0.27 - c.k * 0.2), 1.1, 0.7, -2.2 * s);
      // and its swing wash
      c.arcs.spawn(p.pos.x, p.pos.y + 1.15 * s, p.pos.z, p.yaw, 0, roll * 0.5, 2.7 * s, 1.3 * s, PI / 2 + (c.k % 2 ? -1 : 1) * 1.05, PI / 2 - (c.k % 2 ? -1 : 1) * 1.05, _c0, dawn, 0.1, 0.3, 0, 0.55);
      fx.sparks(p.pos.x + f.x * d, p.pos.y + 1.25 * s, p.pos.z + f.z * d, dawn, 8, 4, 0.12, 2);
    } else if (c.phase === 'burst') {
      const r = Math.max(1.5, c.k);
      fx.flash(c.x, c.y, c.z, fx.color('#ffffff'), r * 1.4, 0.25, CELL.star, 2);
      fx.flash(c.x, c.y, c.z, dawn, r * 2.6, 0.45, CELL.rays, 1);
      fx.sparks(c.x, c.y, c.z, pale, 34, 10, 0.16, 4);
      fx.motes(c.x, c.y - 0.6, c.z, dawn, 24, r * 0.6, 1.8, 0.2);
      fx.ring(c.x, sim.groundAt(c.x, c.z), c.z, r * 1.25, dawn, 0.5, 0.7);
    }
  },

  /* --- Lancia del Custode ---------------------------------------------------------------------------------------- */
  // Carica del Custode: the Guardiano's charge — gold speed lines, hoof-dust, a spear of light where it lands
  art_carica_custode: (c) => {
    const { fx, sim } = c;
    const gold = fx.color('#ffe6a8'), white = fx.color('#ffffff'), spectral = fx.color('#cfe6ff');
    if (c.phase === 'dash') {
      wake(c, gold, 0.42, 130, 0.26, CELL.spark, 11);
      wake(c, spectral, 0.42, 40, 0.3, CELL.dot, 4);
      fx.ring(c.x, sim.groundAt(c.x, c.z), c.z, 2.4, gold, 0.4, 0.5);
      fx.puff(c.x, c.y, c.z, fx.color('#a89a84'), 8, 0.8, 1.0, 0.4);
      let t = 0;
      fx.spawn({
        update: (dt, s) => {
          t += dt;
          const p = s.player;
          if (rnd() < dt * 30) fx.puff(p.pos.x, p.pos.y, p.pos.z, fx.color('#a89a84'), 1, 0.6, 0.5, 0.3);
          return t < 0.4;
        },
        dispose: () => undefined,
      });
    } else if (c.phase === 'hit') {
      const reach = artParam(sim, c, 'reach', 4.6) * sim.player.scale;
      strikePoint(sim, reach * 0.75, _t);
      const f = fwd(sim.player.yaw);
      fx.flash(_t.x, _t.y, _t.z, white, 2.8, 0.22, CELL.star, 4);
      fx.flash(_t.x, _t.y, _t.z, gold, 4.6, 0.4, CELL.rays, -1.5);
      for (let i = 0; i < fxN(fx, 26); i++) {
        const sp = 9 + rnd() * 12;
        fx.particles.emitRaw(_t.x, _t.y, _t.z, f.x * sp + jit() * 2.5, jit() * 2.5, f.z * sp + jit() * 2.5, 0.25 + rnd() * 0.2, 0.2, 0.05, gold.r, gold.g, gold.b, 1, CELL.spark, 3, 2.5, 0, 0.08, 0.02);
      }
    }
  },
  // Ruota d'Argento: a full silver wheel (twice), ground ring, sparks thrown outward
  art_ruota_argento: (c) => {
    const { fx, sim } = c;
    const silver = fx.color('#eef4ff'), pale = fx.color('#b8c8e0'), gold = fx.color('#ffe6a8');
    if (c.phase !== 'spin') return;
    const p = sim.player, s = p.scale;
    const r = Math.max(2, c.k), hits = Math.max(1, c.n);
    const dur = artParam(sim, c, 'dur', 0.9);
    const gap = hits > 1 ? (dur * 0.55) / (hits - 1) : 0;
    for (let i = 0; i < hits; i++) {
      later(c, i * gap, (sm) => {
        const pl = sm.player;
        _c0.copy(silver);
        c.arcs.spawn(pl.pos.x, pl.pos.y + (1.0 + i * 0.25) * s, pl.pos.z, pl.yaw, 0, i % 2 ? 0.12 : -0.12, r, r * 0.55, PI / 2 + i * 0.4, PI / 2 + i * 0.4 - PI * 2, _c0, pale, 0.22, 0.42, 0, 1.0, 0.85);
        fx.ring(pl.pos.x, sm.groundAt(pl.pos.x, pl.pos.z), pl.pos.z, r, pale, 0.45, 0.6, 0, 0.6);
        for (let j = 0; j < fxN(fx, 22); j++) {
          const a = rnd() * PI * 2, sp = 7 + rnd() * 6;
          fx.particles.emitRaw(pl.pos.x + Math.sin(a) * r * 0.8, pl.pos.y + 1.0 * s, pl.pos.z + Math.cos(a) * r * 0.8, Math.sin(a) * sp, 1 + rnd() * 2, Math.cos(a) * sp,
            0.3, 0.16, 0.04, silver.r, silver.g, silver.b, 1, CELL.spark, 8, 2, 0, 0.06, 0.02);
        }
      });
    }
    fx.flash(p.pos.x, p.pos.y + 1.1 * s, p.pos.z, gold, 2.0, 0.25, CELL.star);
  },

  /* --- Brando del Viandante -------------------------------------------------------------------------------------- */
  // Fendente Itinerante: a road-dust slide, then a tall rising cut of lantern light
  art_fendente_itinerante: (c) => {
    const { fx, sim } = c;
    const amber = fx.color('#e8b860'), warm = fx.color('#fff0d0');
    if (c.phase === 'dash') {
      wake(c, amber, 0.3, 60, 0.16, CELL.dot, 3);
      let t = 0;
      fx.spawn({
        update: (dt, s) => {
          t += dt;
          const p = s.player;
          if (rnd() < dt * 40) fx.puff(p.pos.x, s.groundAt(p.pos.x, p.pos.z), p.pos.z, fx.color('#a8987e'), 1, 0.5, 0.4, 0.25);
          return t < 0.3;
        },
        dispose: () => undefined,
      });
      const dur = artParam(sim, c, 'dur', 0.6);
      later(c, Math.max(0.1, dur * 0.62 - 0.2), (s) => {
        const p = s.player, sc = p.scale;
        _c0.copy(warm);
        c.arcs.spawn(p.pos.x, p.pos.y + 0.9 * sc, p.pos.z, p.yaw, 1, 0, 2.6 * sc, 1.1 * sc, -0.9, PI * 0.62, _c0, amber, 0.12, 0.42, 0, 1.0);
        const f = fwd(p.yaw);
        fx.sparks(p.pos.x + f.x * 1.8 * sc, p.pos.y + 2.0 * sc, p.pos.z + f.z * 1.8 * sc, amber, 14, 6, 0.13, 4);
      });
    } else if (c.phase === 'hit') {
      strikePoint(sim, 1.9 * sim.player.scale, _t);
      fx.flash(_t.x, _t.y + 0.4, _t.z, warm, 2.2, 0.25, CELL.star, 2);
      fx.flash(_t.x, _t.y + 0.4, _t.z, amber, 3.2, 0.35, CELL.rays, 1);
    }
  },
  // Postura del Viandante: the blow is turned aside and answered — a wide crossing riposte
  art_postura_viandante: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'counter') return;
    const amber = fx.color('#e8b860'), warm = fx.color('#fff4dc');
    const p = sim.player, s = p.scale;
    const reach = artParam(sim, c, 'reach', 3.6) * s;
    _c0.copy(warm);
    c.arcs.spawn(p.pos.x, p.pos.y + 1.1 * s, p.pos.z, p.yaw, 0, -0.2, reach, reach * 0.6, PI / 2 + 1.45, PI / 2 - 1.45, _c0, amber, 0.1, 0.45, 0, 1.15);
    c.arcs.spawn(p.pos.x, p.pos.y + 1.3 * s, p.pos.z, p.yaw, 0, 0.25, reach * 0.9, reach * 0.35, PI / 2 - 1.2, PI / 2 + 1.2, _c0, amber, 0.12, 0.5, 0, 0.8);
    strikePoint(sim, 1.6 * s, _t);
    fx.flash(_t.x, _t.y, _t.z, fx.color('#ffffff'), 2.6, 0.24, CELL.star, 4);
    fx.flash(_t.x, _t.y, _t.z, amber, 4.2, 0.4, CELL.rays, -2);
    fx.sparks(_t.x, _t.y, _t.z, amber, 26, 10, 0.14, 8);
  },

  /* --- Ramo dell'Antico ------------------------------------------------------------------------------------------ */
  // Radici Fameliche: the ground darkens under the target, then famished roots erupt and coil over it
  art_radici_fameliche: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'cast') return;
    const r = Math.max(1.2, c.k), delay = c.n || 0.45;
    const bind = artParam(sim, c, 'bind_time', 2.6);
    const green = fx.color('#7fc85a'), lime = fx.color('#d8f08a'), earth = fx.color('#3a2c1e');
    fx.ring(c.x, c.y, c.z, r * 1.1, green, delay + 0.1, 0.25, 0, r * 0.2);
    fx.motes(c.x, c.y + 0.1, c.z, lime, 10, r * 0.8, 0.8, 0.14);
    c.roots.spawn(c.x, c.y, c.z, r * 0.75, delay, bind);
    later(c, delay, () => {
      fx.puff(c.x, c.y, c.z, earth, 14, 1.0, r * 0.9, 0.9);
      fx.shards(c.x, c.y + 0.2, c.z, fx.color('#5a4a34'), 14, 5, 0.25);
      fx.motes(c.x, c.y + 0.2, c.z, lime, 18, r, 1.6, 0.16);
    });
  },
  // Fioritura: the staff blooms — a burst of petals and pollen at the tip as the seeds fly
  art_fioritura: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'release') return;
    const pink = fx.color('#f0a8d8'), lime = fx.color('#d8f08a'), white = fx.color('#fff8f0');
    const p = sim.player, f = fwd(p.yaw);
    let x = c.x, y = c.y, z = c.z;
    if (c.w) {
      c.w.root.updateWorldMatrix(true, false);
      _t.copy(c.w.tip).applyMatrix4(c.w.root.matrixWorld);
      x = _t.x; y = _t.y; z = _t.z;
    }
    fx.flash(x, y, z, white, 1.8, 0.22, CELL.star, 2);
    fx.flash(x, y, z, pink, 3.0, 0.4, CELL.petal, 1);
    for (let i = 0; i < fxN(fx, 30); i++) {
      const a = p.yaw + jit() * 0.7, sp = 3 + rnd() * 5;
      const col = i % 3 === 0 ? lime : pink;
      fx.smoke.emitRaw(x, y, z, Math.sin(a) * sp, 0.5 + rnd() * 1.5, Math.cos(a) * sp, 1.0 + rnd() * 0.8, 0.16, 0.1, col.r, col.g, col.b, 0.95, CELL.petal, 1.2, 1.8, jit() * 6, 0, 0.04);
    }
    fx.motes(x + f.x, y, z + f.z, lime, 12, 0.6, 0.8, 0.12);
  },

  /* --- Randello del Pantano -------------------------------------------------------------------------------------- */
  // Colpo Melmoso: a heavy splash of marsh mud; sickly marsh-light lingers on the slowed
  art_colpo_melmoso: (c) => {
    const { fx } = c;
    if (c.phase !== 'impact') return;
    mudSplash(c, Math.max(1.5, c.k));
    fx.motes(c.x, c.y + 0.2, c.z, fx.color('#c8d890'), 16, c.k * 0.9, 0.6, 0.15);
  },
  // Sprofondamento: the ground opens into a sucking pit; mud swirls inward for the zone's life
  art_sprofondamento: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'impact') return;
    const r = Math.max(1.5, c.k);
    mudSplash(c, r);
    const life = artParam(sim, c, 'zone_time', 5);
    const mud = fx.color('#4a3a26'), dark = fx.color('#2a2016'), glint = fx.color('#c8d890');
    const x = c.x, y = c.y, z = c.z;
    let t = 0, a0 = rnd() * 6;
    fx.spawn({
      update: (dt) => {
        t += dt;
        a0 += dt * 2.2;
        const fade = Math.min(1, (life - t) / 0.6);
        if (rnd() < dt * 26 * fade) {
          const a = a0 + rnd() * PI * 2, rr = r * (0.6 + rnd() * 0.4);
          // tangential + inward velocity: the pit swallows
          const vx = Math.cos(a) * 1.8 - Math.sin(a) * rr * 0.3, vz = -Math.sin(a) * 1.8 - Math.cos(a) * rr * 0.3;
          const col = rnd() < 0.5 ? mud : dark;
          fx.smoke.emitRaw(x + Math.sin(a) * rr, y + 0.05, z + Math.cos(a) * rr, vx, -0.05, vz, 0.9, 0.7, 0.2, col.r, col.g, col.b, 0.55, CELL.smoke, 0, 0.8, 1.5, 0, 0.1);
        }
        if (rnd() < dt * 4 * fade) fx.particles.emitRaw(x + jit() * r * 0.6, y + 0.05, z + jit() * r * 0.6, 0, 0.6, 0, 0.6, 0.18, 0.05, glint.r, glint.g, glint.b, 0.7, CELL.dot, 0, 0, 0, 0, 0.1);
        return t < life;
      },
      dispose: () => undefined,
    });
  },

  /* --- Zanna Strisciante ----------------------------------------------------------------------------------------- */
  // Sibilo: a hissing venom streak along the extended blade
  art_sibilo: (c) => {
    const { fx, sim } = c;
    const venom = fx.color('#a8d060'), pale = fx.color('#e8ffb0');
    if (c.phase === 'dash') {
      wake(c, venom, 0.36, 80, 0.2, CELL.spark, 6);
      fx.flash(c.x, c.y + 1.0, c.z, pale, 1.4, 0.2, CELL.star);
    } else if (c.phase === 'hit') {
      strikePoint(sim, 3.0 * sim.player.scale, _t);
      fx.flash(_t.x, _t.y, _t.z, venom, 3.0, 0.35, CELL.rays, 2);
      for (let i = 0; i < fxN(fx, 18); i++) {
        fx.smoke.emitRaw(_t.x, _t.y, _t.z, jit() * 3, 1 + rnd() * 2, jit() * 3, 0.6 + rnd() * 0.4, 0.14, 0.08, venom.r * 0.7, venom.g * 0.8, venom.b * 0.4, 0.9, CELL.blob, 9, 1, 0, 0, 0.02);
      }
      fx.sparks(_t.x, _t.y, _t.z, pale, 12, 7);
    }
  },
  // Avvolgimento: the blade coils around the target (rings of venom light), drags it in and snaps
  art_avvolgimento: (c) => {
    const { fx, sim } = c;
    const venom = fx.color('#a8d060'), pale = fx.color('#e8ffb0');
    if (c.phase === 'cast') {
      fx.flash(c.x, c.y + 1.1, c.z, venom, 1.4, 0.2, CELL.star);
    } else if (c.phase === 'catch') {
      const r = Math.max(0.8, c.k) + 0.25, h = Math.max(1.5, c.n);
      for (let i = 0; i < 3; i++) {
        later(c, i * 0.06, () => {
          _c0.copy(pale);
          c.arcs.spawn(c.x, c.y + h * (0.25 + i * 0.25), c.z, i * 2.1, 0, (i - 1) * 0.18, r, 0.2, 0, PI * 2.0, _c0, venom, 0.16, 0.9, 0.45, 1.0, 0.9);
        });
      }
      fx.flash(c.x, c.y + h * 0.5, c.z, venom, 2.4, 0.3, CELL.ring, 1);
      fx.sparks(c.x, c.y + h * 0.5, c.z, pale, 14, 5);
    } else if (c.phase === 'throw') {
      fx.flash(c.x, c.y + 1.0, c.z, pale, 2.6, 0.25, CELL.star, 3);
      fx.flash(c.x, c.y + 1.0, c.z, venom, 4.0, 0.4, CELL.rays, -2);
      for (let i = 0; i < fxN(fx, 22); i++) fx.smoke.emitRaw(c.x, c.y + 1, c.z, jit() * 5, 1 + rnd() * 3, jit() * 5, 0.7, 0.18, 0.08, 0.45, 0.62, 0.22, 0.9, CELL.blob, 9, 1, 0, 0, 0.02);
    } else if (c.phase === 'miss') {
      fx.motes(c.x, c.y + 1, c.z, venom, 5, 0.4, 0.6, 0.1);
    }
  },

  /* --- Remo del Traghettatore ------------------------------------------------------------------------------------ */
  // Richiamo delle Anime: the lantern flares and souls rise from it before flying out
  art_richiamo_anime: (c) => {
    const { fx } = c;
    if (c.phase !== 'release') return;
    const spirit = fx.color('#9ae8ff'), white = fx.color('#eefcff');
    let x = c.x, y = c.y, z = c.z;
    if (c.w) {
      c.w.root.updateWorldMatrix(true, false);
      _t.copy(c.w.tip).applyMatrix4(c.w.root.matrixWorld);
      x = _t.x; y = _t.y; z = _t.z;
    }
    fx.flash(x, y, z, white, 1.8, 0.25, CELL.star, 2);
    fx.flash(x, y, z, spirit, 3.4, 0.5, CELL.dot);
    fx.motes(x, y - 0.3, z, spirit, 22, 0.5, 1.6, 0.18);
    fx.ring(c.sim.player.pos.x, c.sim.player.pos.y + 0.05, c.sim.player.pos.z, 2.2, spirit, 0.6, 0.3, 0, 0.4);
  },
  // Spinta della Corrente: a wide rowing stroke of river water that throws everything back
  art_spinta_corrente: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'spin') return;
    const p = sim.player, s = p.scale;
    const r = Math.max(2.5, c.k);
    const ang = (artParam(sim, c, 'angle', 210) * PI) / 180;
    const water = fx.color('#6ac8f0'), foam = fx.color('#e8fbff');
    _c0.copy(foam);
    _c1.copy(water);
    c.arcs.spawn(p.pos.x, p.pos.y + 0.75 * s, p.pos.z, p.yaw, 0, 0.08, r, r * 0.7, PI / 2 + ang / 2, PI / 2 - ang / 2, _c0, _c1, 0.16, 0.55, 0, 1.1, 0.9);
    c.arcs.spawn(p.pos.x, p.pos.y + 0.25 * s, p.pos.z, p.yaw, 0, 0, r * 1.15, r * 0.25, PI / 2 + ang / 2, PI / 2 - ang / 2, _c0, _c1, 0.2, 0.7, 0, 0.8, 0.7);
    for (let i = 0; i < fxN(fx, 40); i++) {
      const a = p.yaw + jit() * ang * 0.5, rr = r * (0.4 + rnd() * 0.6), sp = 5 + rnd() * 6;
      fx.smoke.emitRaw(p.pos.x + Math.sin(a) * rr, p.pos.y + 0.3 + rnd() * 1.2, p.pos.z + Math.cos(a) * rr, Math.sin(a) * sp, 2 + rnd() * 3, Math.cos(a) * sp,
        0.6 + rnd() * 0.4, 0.22, 0.1, foam.r, foam.g, foam.b, 0.75, CELL.blob, 12, 1.2, 0, 0.04, 0.02);
    }
    fx.ring(p.pos.x, sim.groundAt(p.pos.x, p.pos.z), p.pos.z, r * 1.1, water, 0.5, 0.6);
  },
};

function mudSplash(c: ArtCtx, r: number): void {
  const { fx, x, y, z } = c;
  const mud = fx.color('#4a3a26'), wet = fx.color('#6a5a3a'), green = fx.color('#7a8a4a');
  fx.puff(x, y, z, mud, 16, 1.2, r * 0.7, 0.8);
  for (let i = 0; i < fxN(fx, 40); i++) {
    const a = rnd() * PI * 2, sp = 3 + rnd() * r * 1.6;
    const col = i % 4 === 0 ? green : i % 2 ? wet : mud;
    fx.smoke.emitRaw(x + Math.sin(a) * 0.4, y + 0.2, z + Math.cos(a) * 0.4, Math.sin(a) * sp, 3 + rnd() * 5, Math.cos(a) * sp, 0.7 + rnd() * 0.5, 0.26, 0.16, col.r, col.g, col.b, 0.95, CELL.blob, 14, 0.8, 0, 0.03, 0.02);
  }
  fx.flash(x, y + 0.4, z, fx.color('#c8d890'), r * 1.2, 0.25, CELL.dot);
}

function fxN(fx: FxRenderer, n: number): number {
  const q = fx.ctx.quality;
  return Math.max(1, Math.round(n * (q === 'high' ? 1 : q === 'medium' ? 0.75 : 0.5)));
}

/** Art vfx ids with a dedicated visual (tests / docs). */
export function weaponArtVfxIds(): string[] {
  return Object.keys(ART_FX);
}
