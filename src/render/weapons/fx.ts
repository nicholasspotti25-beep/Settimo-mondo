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
uniform float uDark;
varying vec2 vRib;
void main() {
  float age = clamp(vRib.x, 0.0, 1.0);
  float side = vRib.y;
  float life = pow(1.0 - age, 1.6);
  float body = smoothstep(0.0, 0.55, side);
  float edge = smoothstep(0.72, 1.0, side);
  vec3 col = mix(uGlow, uCore, edge * (1.0 - age * 0.6));
  float a = (body * 0.62 + edge * 1.15) * life * uAlpha;
  // premultiplied: light added over a slightly darkened floor, so the ribbon reads on bright sand and snow too
  gl_FragColor = vec4(col * a, min(0.5, a * uDark));
}`;

/** Premultiplied blending: rgb is added, alpha darkens what is behind (dark under-layer for bright effects). */
const LIGHT_OVER_DARK = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

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
      name: 'weapon-trail', vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, transparent: true, depthWrite: false, ...LIGHT_OVER_DARK,
      side: THREE.DoubleSide, uniforms: { uCore: { value: new THREE.Color('#ffffff') }, uGlow: { value: new THREE.Color('#ffd080') }, uAlpha: { value: 1 }, uDark: { value: 0.3 } },
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
uniform float uDark;
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
  gl_FragColor = vec4(col * a, min(0.55, a * uDark));
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
  /** Darkening under the next spawned arcs (0 pure light .. ~0.6 strong shadow); set before spawn, kept per slot. */
  dark = 0.4;

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
        name: 'weapon-arc', vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, transparent: true, depthWrite: false, ...LIGHT_OVER_DARK, side: THREE.DoubleSide,
        uniforms: {
          uA0: { value: 0 }, uA1: { value: 1 }, uR0: { value: 0.5 }, uR1: { value: 1 }, uCore: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
          uHead: { value: 0 }, uTail: { value: -1 }, uAlpha: { value: 0 }, uDark: { value: 0.4 },
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
    u.uHead.value = 0; u.uTail.value = -1; u.uAlpha.value = alpha; u.uDark.value = this.dark;
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

interface RootSet { x: number; y: number; z: number; r: number; t: number; delay: number; hold: number; active: boolean; seed: number; tall: number }

class Roots {
  readonly mesh: THREE.InstancedMesh;
  private sets: RootSet[] = [];
  private readonly per = 11;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(material: THREE.Material) {
    const g = geo.horn(1, 0.15, 1.1, 0.35, 10, 7);
    geo.gradient(g, 1, '#2a1e14', '#8ab84a');
    this.mesh = new THREE.InstancedMesh(g, material, this.per * 2);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.per * 2;
    for (let i = 0; i < 2; i++) this.sets.push({ x: 0, y: 0, z: 0, r: 2, t: 0, delay: 0.4, hold: 2.5, active: false, seed: 0, tall: 1 });
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.per * 2; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.visible = false;
  }

  spawn(x: number, y: number, z: number, r: number, delay: number, hold: number, tall = 1): void {
    const s = this.sets[0].active ? this.sets[1] : this.sets[0];
    s.x = x; s.y = y; s.z = z; s.r = r; s.t = 0; s.delay = delay; s.hold = hold; s.active = true; s.seed = rnd() * 6.28; s.tall = tall;
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
        const rr = s.r * (0.9 + ((i * 37) % 10) / 45);
        this.p.set(s.x + Math.sin(a) * rr, s.y - 0.2, s.z + Math.cos(a) * rr);
        // lean inward over the target, writhing while it holds
        const writhe = Math.sin(time * 3.1 + i * 1.7) * 0.12;
        this.e.set(0, a + Math.PI + writhe, 0, 'YXZ');
        this.q.setFromEuler(this.e);
        const h = (1.5 + ((i * 53) % 7) * 0.2) * Math.min(1.8, 0.7 + s.r * 0.22) * s.tall;
        this.sc.set(g * 1.7 + 0.001, g * h + 0.001, g * h * 0.5 + 0.001);
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

/* ---------------------------------------------------------------------------------------------------------------- */
/* Pooled ground scorches (dark under-layer decals with a tinted rim: burns, frost, mud, impact craters, skid marks) */
/* ---------------------------------------------------------------------------------------------------------------- */

const SC_VERT = /* glsl */ `
attribute vec4 aSc; // x alpha, y rim strength, z 0 disc .. 1 ring only, w seed
attribute vec3 aTint;
varying vec2 vUv;
varying vec4 vSc;
varying vec3 vTint;
void main() {
  vUv = uv * 2.0 - 1.0;
  vSc = aSc;
  vTint = aTint;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const SC_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vSc;
varying vec3 vTint;
void main() {
  float d = length(vUv);
  if (d > 1.0 || vSc.x < 0.002) discard;
  float ang = atan(vUv.y, vUv.x);
  float rag = 0.84 + 0.09 * sin(ang * 7.0 + vSc.w) + 0.05 * sin(ang * 13.0 + vSc.w * 2.3) + 0.02 * sin(ang * 31.0 + vSc.w * 5.1);
  float body = 1.0 - smoothstep(rag * 0.45, rag, d);
  float ring = smoothstep(rag * 0.55, rag * 0.82, d) * (1.0 - smoothstep(rag * 0.86, rag, d));
  // streaks radiating from the centre (scorch / crater spokes)
  float spokes = 0.75 + 0.25 * sin(ang * 23.0 + vSc.w * 3.0) * sin(ang * 9.0 - vSc.w);
  float dark = mix(body * spokes, ring, vSc.z) * vSc.x * 0.66;
  vec3 rim = vTint * (ring * 0.9 + body * 0.12) * vSc.y * vSc.x;
  gl_FragColor = vec4(rim, dark);
}`;

interface ScorchSlot { t: number; life: number; fadeIn: number; alpha: number; active: boolean }

class Scorches {
  readonly mesh: THREE.InstancedMesh;
  private readonly slots: ScorchSlot[] = [];
  private readonly sc: THREE.InstancedBufferAttribute;
  private readonly tint: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(count: number) {
    const g = new THREE.PlaneGeometry(2, 2, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.sc = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSc', this.sc);
    g.setAttribute('aTint', this.tint);
    const mat = new THREE.ShaderMaterial({
      name: 'weapon-scorch', vertexShader: SC_VERT, fragmentShader: SC_FRAG, transparent: true, depthWrite: false, ...LIGHT_OVER_DARK,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.m);
      this.slots.push({ t: 0, life: 1, fadeIn: 0.06, alpha: 0, active: false });
    }
    this.mesh.visible = false;
  }

  /** A ground decal at (x, y, z): radius r (x `stretch` along `yaw`), dark body + `tint` rim; `ring` 0 disc .. 1 ring only. */
  spawn(x: number, y: number, z: number, r: number, life: number, tint: THREE.Color, rim = 0.7, ring = 0, alpha = 1, stretch = 1, yaw = 0, fadeIn = 0.06): void {
    let k = 0, worst = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.active) { k = i; break; }
      const age = s.t / s.life;
      if (age > worst) { worst = age; k = i; }
    }
    const s = this.slots[k];
    s.t = 0; s.life = Math.max(0.1, life); s.fadeIn = fadeIn; s.alpha = alpha; s.active = true;
    this.e.set(0, yaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(x, y + 0.03, z);
    this.s.set(r, 1, r * stretch);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(k, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    const a = this.sc.array as Float32Array, c = this.tint.array as Float32Array;
    a[k * 4] = 0; a[k * 4 + 1] = rim; a[k * 4 + 2] = ring; a[k * 4 + 3] = rnd() * 6.28;
    c[k * 3] = tint.r; c[k * 3 + 1] = tint.g; c[k * 3 + 2] = tint.b;
    this.tint.needsUpdate = true;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    const a = this.sc.array as Float32Array;
    let any = false;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) {
        s.active = false;
        a[i * 4] = 0;
        continue;
      }
      any = true;
      // pops in, holds, fades over the last 45 %; the rim cools faster than the burn
      a[i * 4] = s.alpha * smooth(s.t / s.fadeIn) * (1 - smooth((k - 0.55) / 0.45));
      a[i * 4 + 1] *= Math.max(0, 1 - dt * 0.9);
    }
    this.sc.needsUpdate = true;
    this.mesh.visible = any;
  }

  clear(): void {
    const a = this.sc.array as Float32Array;
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].active = false;
      a[i * 4] = 0;
    }
    this.sc.needsUpdate = true;
    this.mesh.visible = false;
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
interface ArtCtx { fx: FxRenderer; sim: Sim; arcs: Arcs; roots: Roots; scorch: Scorches; w: WeaponVisual | null; e: VfxEvent; phase: string; x: number; y: number; z: number; yaw: number; k: number; n: number }
type ArtFx = (c: ArtCtx) => void;

const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const MORPH: WeaponMorph = { extend: 0, art: 0, swing: 0, buff: 0 };
/** Sim-time step of the current frame (scheduled visuals follow the sim through hit-stop and slow motion). */
let SIM_DT = 0;
/** Effects whose Arts swing the weapon (trail on during the Art). */
const MELEE_ARTS = new Set(['dash_strike', 'spin', 'multi_strike', 'counter_stance', 'slam', 'grab_pull', 'dot_stab', 'throw_return', 'hazard_zone']);
/** Weapon types whose blade extends on whip swings. */
const EXTENDING = new Set(['spada_serpentina', 'frusta', 'catene', 'flagello']);
/** Swing anims that throw a flexible weapon out to its reach. */
const EXTEND_ANIM = /^(whip|chain|hook|lash|flail)/;
/** Sim-time accumulator of the aura emitters (fractional particles carry over). */
let AURA_ACC = 0;

export function installWeaponFxImpl(fx: FxRenderer): void {
  const main = new Ribbon(), off = new Ribbon();
  const arcs = new Arcs(14);
  const rootMat = fx.ctx.kit.surface({ vertexColors: true, roughness: 0.85, metalness: 0, detail: 'bark', detailScale: 6, detailStrength: 0.5, rim: 1.6, emissive: '#5a8a2a', emissiveIntensity: 0.45 });
  const roots = new Roots(rootMat);
  const scorches = new Scorches(18);
  fx.group.add(scorches.mesh, main.mesh, off.mesh, arcs.group, roots.mesh);
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
        if (w?.def && EXTENDING.has(w.def.type) && EXTEND_ANIM.test(d.anim)) extend = swingK;
      }
      const art = p.art;
      if (st === 'art' && art) {
        artGlow = Math.min(1, artGlow + dt * 8);
        const melee = MELEE_ARTS.has(art.effect);
        if (melee && art.t > 0.06 && art.t < art.dur * 0.82) emit = true;
        if (w?.def && EXTENDING.has(w.def.type) && (art.effect === 'dash_strike' || art.effect === 'grab_pull' || art.effect === 'multi_strike')) extend = art.t < art.dur * 0.85 ? 1 : 0;
        swingK = Math.max(swingK, melee ? 0.8 : 0);
      } else artGlow = Math.max(0, artGlow - dt * 2.5);
      MORPH.extend = extend;
      MORPH.art = artGlow;
      MORPH.swing = swingK;
      MORPH.buff = p.buff && p.buff.time > 0 ? Math.min(1, p.buff.time) : 0;
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
      scorches.update(sdt);
      roots.update(sdt, time);
      aura(fx, w, sim, sdt);
      return true;
    },
    dispose: () => undefined,
  });

  const ctx: ArtCtx = { fx, sim: null as unknown as Sim, arcs, roots, scorch: scorches, w: null, e: null as unknown as VfxEvent, phase: '', x: 0, y: 0, z: 0, yaw: 0, k: 0, n: 0 };

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
    scorches.clear();
  });
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Art visuals                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

const E3 = { x: 0, y: 0, z: 0 };
/** Shared scratch position (sim queries that take a Vec3). */
function e3(x: number, y: number, z: number): { x: number; y: number; z: number } {
  E3.x = x; E3.y = y; E3.z = z;
  return E3;
}

const FWD = { x: 0, z: 0 };
function fwd(yaw: number): { x: number; z: number } {
  FWD.x = Math.sin(yaw);
  FWD.z = Math.cos(yaw);
  return FWD;
}

/**
 * Dark under-layer: a soft shadow sprite (alpha, drawn before the additive layer) behind a bright burst so it reads on
 * bright floors and skies. `col` tints the shadow (a deep version of the effect color).
 */
function under(fx: FxRenderer, x: number, y: number, z: number, size: number, life = 0.3, col: THREE.Color | null = null, alpha = 0.55): void {
  const r = col ? col.r * 0.16 : 0.03, g = col ? col.g * 0.16 : 0.025, b = col ? col.b * 0.16 : 0.03;
  fx.smoke.emitRaw(x, y, z, 0, 0, 0, life, size * 0.7, size * 1.05, r, g, b, alpha, CELL.dot, 0, 0, 0, 0, 0.03);
}

/** Ground height under (x, z) (scorches, skids). */
function gy(sim: Sim, x: number, z: number): number {
  return sim.groundAt(x, z);
}

/**
 * A wake along the player's path for `dur` seconds (dash Arts): bright streaks over dark under-streaks, ground dust and
 * a skid scorch along the whole dash (`dist` m from the start, tinted `rim`).
 */
function wake(c: ArtCtx, col: THREE.Color, dur: number, rate: number, size: number, cell: number = CELL.dot, back = 6, dist = 0, rim: THREE.Color | null = null, dust: THREE.Color | null = null): void {
  const fx = c.fx;
  let t = 0, acc = 0;
  const stretch = cell === CELL.spark ? 0.08 : 0;
  if (dist > 0) {
    const p = c.sim.player, f = fwd(p.yaw);
    const mx = p.pos.x + f.x * dist * 0.45, mz = p.pos.z + f.z * dist * 0.45;
    c.scorch.spawn(mx, gy(c.sim, mx, mz), mz, 0.62 * p.scale, 1.6, rim ?? col, 0.9, 0, 0.75, (dist * 0.62) / (0.62 * p.scale), p.yaw, Math.max(0.06, dur * 0.6));
  }
  fx.spawn({
    update: (_dt, sim) => {
      const dt = SIM_DT;
      t += dt;
      acc += dt * rate;
      const p = sim.player;
      const f = fwd(p.yaw);
      while (acc >= 1) {
        acc -= 1;
        const h = 0.25 + rnd() * 1.6, ox = jit() * 0.4, oz = jit() * 0.4;
        const vx = -f.x * back + jit() * 0.6, vy = jit() * 0.4, vz = -f.z * back + jit() * 0.6, life = 0.28 + rnd() * 0.3;
        // dark under-streak first (alpha layer, drawn beneath), then the bright streak on top
        fx.smoke.emitRaw(p.pos.x + ox, p.pos.y + h, p.pos.z + oz, vx, vy, vz, life, size * 1.7, size * 0.5, col.r * 0.12, col.g * 0.1, col.b * 0.1, 0.4, cell, 0, 3, 0, stretch, 0.02);
        fx.particles.emitRaw(p.pos.x + ox, p.pos.y + h, p.pos.z + oz, vx, vy, vz, life, size, size * 0.2, col.r, col.g, col.b, 1, cell, 0, 3, 0, stretch, 0.02);
      }
      if (dust && rnd() < dt * 40) fx.puff(p.pos.x + jit() * 0.3, gy(sim, p.pos.x, p.pos.z), p.pos.z + jit() * 0.3, dust, 1, 0.75, 0.5, 0.35);
      return t < dur;
    },
    dispose: () => undefined,
  });
}

/** Ambient particles of the equipped weapon (cold breath, embers, crackling sparks, lava drops) along its blade line. */
function aura(fx: FxRenderer, w: WeaponVisual | null, sim: Sim, dt: number): void {
  const a = w?.aura;
  if (!w || !a || dt <= 0 || !sim.player.alive || !w.root.visible) return;
  const st = sim.player.state;
  const busy = st === 'light' || st === 'heavy' || st === 'running' || st === 'jumping' ? 3 : 1;
  const boost = Math.max(busy, (MORPH.art > 0.2 ? 4 : 1), 1 + (MORPH.buff ?? 0) * 3);
  AURA_ACC += dt * a.rate * boost * (fx.ctx.quality === 'low' ? 0.5 : 1);
  if (AURA_ACC < 1) return;
  w.root.updateWorldMatrix(true, false);
  _b.copy(w.base).applyMatrix4(w.root.matrixWorld);
  _t.copy(w.tip).applyMatrix4(w.root.matrixWorld);
  const col = fx.color(a.color);
  const k0 = a.from ?? 0.3;
  while (AURA_ACC >= 1) {
    AURA_ACC -= 1;
    const k = k0 + rnd() * (1 - k0);
    const x = _b.x + (_t.x - _b.x) * k, y = _b.y + (_t.y - _b.y) * k, z = _b.z + (_t.z - _b.z) * k;
    switch (a.kind) {
      case 'mist':
        fx.smoke.emitRaw(x, y, z, jit() * 0.25, -0.25 - rnd() * 0.3, jit() * 0.25, 0.9 + rnd() * 0.6, 0.08, 0.34, col.r, col.g, col.b, 0.32, CELL.smoke, -0.05, 1.2, jit() * 1.5, 0, 0.25);
        break;
      case 'ember':
        fx.particles.emitRaw(x, y, z, jit() * 0.5, 0.8 + rnd() * 1.2, jit() * 0.5, 0.5 + rnd() * 0.5, 0.07, 0.02, col.r, col.g, col.b, 1, CELL.spark, -1.2, 1.5, 0, 0.05, 0.05);
        break;
      case 'spark':
        fx.particles.emitRaw(x, y, z, jit() * 3, jit() * 3, jit() * 3, 0.08 + rnd() * 0.08, 0.09, 0.03, col.r, col.g, col.b, 1, CELL.spark, 0, 4, 0, 0.12, 0.01);
        break;
      case 'drip':
        fx.particles.emitRaw(x, y, z, jit() * 0.2, -0.2, jit() * 0.2, 0.5 + rnd() * 0.3, 0.06, 0.04, col.r, col.g, col.b, 1, CELL.dot, 9, 0.5, 0, 0.04, 0.05);
        break;
    }
  }
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
      under(fx, x, h, z, 3.0, 0.34, ec);
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
      wake(c, dawn, 0.34, 170, 0.5, CELL.spark, 8, c.k, gold, fx.color('#a89a84'));
      under(fx, c.x, c.y + 1.0, c.z, 2.0, 0.24, gold);
      fx.flash(c.x, c.y + 1.0, c.z, gold, 1.8, 0.22, CELL.star, 2);
      fx.puff(c.x, c.y, c.z, fx.color('#a89a84'), 7, 0.7, 0.7, 0.3);
      later(c, 0.2, (s) => {
        const p = s.player;
        _c0.copy(dawn);
        c.arcs.spawn(p.pos.x, p.pos.y + 1.1 * p.scale, p.pos.z, p.yaw, 2, 0.25, 1.3 * p.scale, 0.5 * p.scale, PI * 0.95, PI * 0.05, _c0, gold, 0.1, 0.36);
      });
    } else if (c.phase === 'hit') {
      strikePoint(sim, 1.7 * sim.player.scale, _t);
      under(fx, _t.x, _t.y, _t.z, 3.6, 0.36, gold);
      fx.flash(_t.x, _t.y, _t.z, fx.color('#ffffff'), 2.4, 0.24, CELL.star, 3);
      fx.flash(_t.x, _t.y, _t.z, gold, 3.8, 0.36, CELL.rays, -2);
      fx.sparks(_t.x, _t.y, _t.z, dawn, 24, 9, 0.2);
      c.scorch.spawn(_t.x, gy(sim, _t.x, _t.z), _t.z, 1.1, 1.2, gold, 1, 0, 0.7);
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
      under(fx, c.x, c.y, c.z, r * 2.4, 0.42, dawn, 0.6);
      c.scorch.spawn(c.x, gy(sim, c.x, c.z), c.z, r * 1.15, 1.8, dawn, 1.1, 0, 0.8);
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
      wake(c, gold, 0.46, 170, 0.46, CELL.spark, 12, c.k, gold, null);
      wake(c, spectral, 0.46, 46, 0.42, CELL.dot, 4);
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
      under(fx, _t.x, _t.y, _t.z, 4.4, 0.4, gold, 0.6);
      c.scorch.spawn(_t.x, gy(sim, _t.x, _t.z), _t.z, 1.5, 1.6, gold, 1, 0, 0.75, 1.8, sim.player.yaw);
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
        // the wheel is swept, then HANGS as a full silver disc edge before fading (readable at a glance)
        c.arcs.dark = 0.55;
        c.arcs.spawn(pl.pos.x, pl.pos.y + (1.0 + i * 0.25) * s, pl.pos.z, pl.yaw, 0, i % 2 ? 0.12 : -0.12, r, r * 0.42, PI / 2 + i * 0.4, PI / 2 + i * 0.4 - PI * 2, _c0, pale, 0.2, 0.95, 0.32, 1.1, 0.85);
        c.arcs.dark = 0.4;
        fx.ring(pl.pos.x, sm.groundAt(pl.pos.x, pl.pos.z), pl.pos.z, r, pale, 0.6, 0.6, 0, 0.6);
        if (i === 0) c.scorch.spawn(pl.pos.x, gy(sm, pl.pos.x, pl.pos.z), pl.pos.z, r * 1.05, 1.6, silver, 1.2, 0.7, 0.85);
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
      wake(c, amber, 0.32, 120, 0.4, CELL.spark, 6, c.k, amber, null);
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
      under(fx, _t.x, _t.y + 0.4, _t.z, 3.4, 0.36, amber);
      c.scorch.spawn(_t.x, gy(sim, _t.x, _t.z), _t.z, 1.0, 1.2, amber, 1, 0, 0.7);
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
    under(fx, _t.x, _t.y, _t.z, 4.2, 0.4, amber, 0.6);
    c.scorch.spawn(p.pos.x, gy(sim, p.pos.x, p.pos.z), p.pos.z, reach * 0.8, 1.2, amber, 1.1, 0.75, 0.7);
    fx.flash(_t.x, _t.y, _t.z, fx.color('#ffffff'), 2.6, 0.24, CELL.star, 4);
    fx.flash(_t.x, _t.y, _t.z, amber, 4.2, 0.4, CELL.rays, -2);
    fx.sparks(_t.x, _t.y, _t.z, amber, 26, 10, 0.14, 8);
  },

  /* --- Ramo dell'Antico ------------------------------------------------------------------------------------------ */
  // Radici Fameliche: the ground darkens under the target, then famished roots erupt and coil over it
  art_radici_fameliche: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'cast') return;
    const delay = c.n || 0.45;
    const bind = artParam(sim, c, 'bind_time', 2.6);
    const green = fx.color('#7fc85a'), lime = fx.color('#d8f08a'), earth = fx.color('#3a2c1e');
    // the roots close around the target's body (never inside it) and rise above its flanks
    const tgt = sim.nearestEnemy(e3(c.x, c.y, c.z), 3, 0, PI);
    const body = tgt ? tgt.radius * tgt.scale : 0;
    const r = Math.max(1.2, c.k * 0.8, body + 0.5);
    const tall = tgt ? Math.max(1, (tgt.height * tgt.scale) / 2.4) : 1;
    const ground = gy(sim, c.x, c.z);
    fx.ring(c.x, ground, c.z, r * 1.1, green, delay + 0.1, 0.25, 0, r * 0.2);
    fx.motes(c.x, ground + 0.1, c.z, lime, 10, r * 0.8, 0.8, 0.14);
    c.scorch.spawn(c.x, ground, c.z, r * 1.25, delay + bind + 0.6, green, 0.8, 0, 0.85, 1, 0, delay * 0.8);
    c.roots.spawn(c.x, ground, c.z, r, delay, bind, tall);
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
    under(fx, x, y, z, 2.6, 0.36, pink);
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
    const life = artParam(sim, c, 'zone_time', 5);
    mudSplash(c, r, life + 0.6);
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
      wake(c, venom, 0.38, 130, 0.38, CELL.spark, 7, c.k, venom, null);
      fx.flash(c.x, c.y + 1.0, c.z, pale, 1.4, 0.2, CELL.star);
    } else if (c.phase === 'hit') {
      strikePoint(sim, 3.0 * sim.player.scale, _t);
      under(fx, _t.x, _t.y, _t.z, 3.4, 0.4, venom);
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
      under(fx, c.x, c.y + 1.0, c.z, 4.0, 0.4, venom, 0.6);
      c.scorch.spawn(c.x, gy(sim, c.x, c.z), c.z, 1.8, 1.4, venom, 0.9, 0, 0.75);
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
    under(fx, x, y, z, 3.0, 0.45, spirit);
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
    c.scorch.spawn(p.pos.x, gy(sim, p.pos.x, p.pos.z), p.pos.z, r * 1.05, 1.4, water, 1.1, 0.6, 0.6);
  },

  /* --- Triplice Guinzaglio --------------------------------------------------------------------------------------- */
  // Tre Morsi: three lashes, one per chain, each ending in a bite of ember jaws at the edge of the fan (three heads)
  art_tre_morsi: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'strike') return;
    const p = sim.player, s = p.scale;
    const ember = fx.color('#ff5a2a'), hot = fx.color('#ffd0a0');
    const reach = artParam(sim, c, 'reach', 5) * s, ang = (artParam(sim, c, 'angle', 70) * PI) / 180;
    const k = c.k, dir = k % 2 ? -1 : 1, last = k >= c.n - 1;
    const h = (0.75 + k * 0.32) * s;
    c.arcs.spawn(p.pos.x, p.pos.y + h, p.pos.z, p.yaw, 0, dir * 0.15, reach, 0.34 * s, PI / 2 + dir * ang * 0.8, PI / 2 - dir * ang * 0.8, hot, ember, 0.1, 0.36, 0, 1.15, 0.6);
    // the bite, where the lash ends: two jaws snapping shut
    const by = p.yaw - dir * ang * 0.45;
    const bx = p.pos.x + Math.sin(by) * reach * 0.86, bz = p.pos.z + Math.cos(by) * reach * 0.86, bh = p.pos.y + h;
    const jr = (last ? 0.85 : 0.6) * s;
    under(fx, bx, bh, bz, jr * 4.2, 0.36, ember, 0.6);
    c.arcs.spawn(bx, bh + jr * 0.35, bz, by, 2, 0, jr, jr * 0.32, PI * 0.08, PI * 0.92, hot, ember, 0.07, 0.3, 0.04, 1.2, 0.8);
    c.arcs.spawn(bx, bh - jr * 0.35, bz, by, 2, 0, jr, jr * 0.32, -PI * 0.08, -PI * 0.92, hot, ember, 0.07, 0.3, 0.04, 1.2, 0.8);
    fx.flash(bx, bh, bz, ember, last ? 3.4 : 2.4, 0.3, CELL.rays, 2);
    fx.sparks(bx, bh, bz, hot, last ? 24 : 14, 8, 0.16);
    fx.puff(bx, bh - 0.3, bz, fx.color('#2a1a14'), last ? 5 : 3, 0.6, 0.4, 0.6);
  },
  // Guinzaglio: three hooks fly out on ember lines, bite the target, drag it in along taut chains, and slam it down
  art_guinzaglio: (c) => {
    const { fx, sim } = c;
    const ember = fx.color('#ff5a2a'), hot = fx.color('#ffd0a0');
    const p = sim.player, s = p.scale;
    if (c.phase === 'cast') {
      const range = Math.max(3, c.k), y = p.pos.y + 1.2 * s;
      for (let i = 0; i < 3; i++) {
        const a = p.yaw + (i - 1) * 0.12, sp = range / 0.24;
        const vx = Math.sin(a) * sp, vz = Math.cos(a) * sp;
        fx.smoke.emitRaw(p.pos.x, y, p.pos.z, vx, 0, vz, 0.24, 0.55, 0.35, 0.08, 0.04, 0.03, 0.45, CELL.spark, 0, 0, 0, 0.05, 0.02);
        fx.particles.emitRaw(p.pos.x, y, p.pos.z, vx, 0, vz, 0.24, 0.36, 0.22, hot.r, hot.g, hot.b, 1, CELL.spark, 0, 0, 0, 0.05, 0.02);
      }
      fx.flash(p.pos.x + Math.sin(p.yaw) * 0.8, y, p.pos.z + Math.cos(p.yaw) * 0.8, ember, 1.5, 0.2, CELL.star);
    } else if (c.phase === 'catch') {
      const h = Math.max(1.5, c.n), cy = c.y + h * 0.55;
      under(fx, c.x, cy, c.z, 3.6, 0.4, ember, 0.6);
      fx.flash(c.x, cy, c.z, ember, 3.0, 0.35, CELL.rays, 2);
      fx.sparks(c.x, cy, c.z, hot, 22, 8, 0.16);
      // the taut chains: ember links flickering along the three lines while the target is dragged in
      const tgt = sim.nearestEnemy(e3(c.x, c.y, c.z), 3, 0, PI);
      let t = 0;
      fx.spawn({
        update: (_dt, sm) => {
          t += SIM_DT;
          const pl = sm.player;
          if (!tgt || !tgt.alive || pl.state !== 'art' || SIM_DT <= 0) return t < 0.5 && pl.state === 'art';
          const f = fwd(pl.yaw);
          const ax = pl.pos.x + f.x * 0.5, ay = pl.pos.y + 1.15 * pl.scale, az = pl.pos.z + f.z * 0.5;
          const tx = tgt.pos.x, ty = tgt.pos.y + tgt.height * tgt.scale * 0.5, tz = tgt.pos.z;
          for (let ci = 0; ci < 3; ci++) {
            const lat = (ci - 1) * 0.3;
            for (let j = 0; j < 3; j++) {
              const u = rnd(), sag = Math.sin(u * PI) * 0.35;
              const x = ax + (tx - ax) * u + f.z * lat * Math.sin(u * PI), y = ay + (ty - ay) * u - sag, z = az + (tz - az) * u - f.x * lat * Math.sin(u * PI);
              fx.particles.emitRaw(x, y, z, 0, 0, 0, 0.07, 0.16, 0.12, ember.r, ember.g, ember.b, 1, CELL.dot, 0, 0, 0, 0, 0.01);
            }
          }
          return t < 0.5;
        },
        dispose: () => undefined,
      });
    } else if (c.phase === 'throw') {
      const y = gy(sim, c.x, c.z);
      under(fx, c.x, c.y + 1.0, c.z, 4.6, 0.45, ember, 0.65);
      c.scorch.spawn(c.x, y, c.z, 2.4, 1.8, ember, 1.3, 0, 0.9);
      fx.flash(c.x, c.y + 1.0, c.z, fx.color('#ffffff'), 2.6, 0.22, CELL.star, 3);
      fx.flash(c.x, c.y + 1.0, c.z, ember, 4.4, 0.42, CELL.rays, -2);
      fx.sparks(c.x, c.y + 0.6, c.z, hot, 30, 10, 0.18);
      fx.shards(c.x, y + 0.2, c.z, fx.color('#2a2220'), 14, 6, 0.3);
      fx.puff(c.x, y, c.z, fx.color('#3a2a22'), 10, 1.1, 1.4, 0.6);
    } else if (c.phase === 'miss') {
      fx.motes(c.x, c.y + 1, c.z, ember, 6, 0.4, 0.6, 0.1);
    }
  },

  /* --- Brace Eterna ---------------------------------------------------------------------------------------------- */
  // Onda Incandescente: a tall cut into the ground, then a burning furrow racing ahead with the wave of fire
  art_onda_incandescente: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'release') return;
    const p = sim.player, s = p.scale, f = fwd(p.yaw);
    const fx0 = f.x, fz0 = f.z, x0 = p.pos.x, z0 = p.pos.z, yaw0 = p.yaw;
    const len = Math.max(4, c.k), speed = Math.max(4, c.n), width = artParam(sim, c, 'width', 2.4) * s;
    const ember = fx.color('#ff6a1a'), hot = fx.color('#ffd27a');
    c.arcs.spawn(x0, p.pos.y + 0.9 * s, z0, yaw0, 1, 0, 2.5 * s, 1.0 * s, PI * 0.72, -0.35, hot, ember, 0.11, 0.42, 0, 1.1);
    const gx = x0 + fx0 * 1.4, gz = z0 + fz0 * 1.4, g0 = gy(sim, gx, gz);
    under(fx, gx, g0 + 0.5, gz, 3.4, 0.4, ember, 0.6);
    fx.flash(gx, g0 + 0.5, gz, hot, 2.6, 0.3, CELL.rays, 2);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const d = 1.2 + (len - 1.2) * (i / (N - 1));
      later(c, d / speed, (sm) => {
        const x = x0 + fx0 * d, z = z0 + fz0 * d, y = gy(sm, x, z);
        c.scorch.spawn(x, y, z, width * 0.5, 3.4, ember, 1.4, 0, 0.85, 1.4, yaw0);
        for (let j = 0; j < fxN(fx, 8); j++) {
          fx.particles.emitRaw(x + jit() * width * 0.4, y + 0.1, z + jit() * width * 0.4, jit() * 0.6, 2.5 + rnd() * 2.5, jit() * 0.6, 0.45 + rnd() * 0.3, 0.6, 0.16,
            ember.r, ember.g, ember.b, 1, CELL.flame, -1.5, 1.2, jit() * 2, 0, 0.1);
        }
        fx.smoke.emitRaw(x, y + 0.7, z, jit() * 0.3, 1.4, jit() * 0.3, 1.4, 0.7, 2.0, 0.12, 0.09, 0.08, 0.45, CELL.smoke, -0.3, 1, jit(), 0, 0.15);
      });
    }
  },
  // Lama Rovente: the core's fire bursts out in a ring of flame and climbs the blade (the edge flames grow for the imbue)
  art_lama_rovente: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'ignite') return;
    const p = sim.player, r = Math.max(1.5, c.k);
    const ember = fx.color('#ff6a1a'), hot = fx.color('#ffd27a');
    const y = gy(sim, p.pos.x, p.pos.z);
    under(fx, p.pos.x, p.pos.y + 1.1, p.pos.z, r * 1.8, 0.45, ember, 0.55);
    c.scorch.spawn(p.pos.x, y, p.pos.z, r, 2.6, ember, 1.4, 0.3, 0.9);
    fx.ring(p.pos.x, y, p.pos.z, r, ember, 0.5, 1.2, 0, 0.4);
    for (let i = 0, n = fxN(fx, 36); i < n; i++) {
      const a = (i / n) * PI * 2, rr = r * (0.7 + rnd() * 0.25);
      fx.particles.emitRaw(p.pos.x + Math.sin(a) * rr, y + 0.1, p.pos.z + Math.cos(a) * rr, Math.sin(a) * 1.5, 3 + rnd() * 3, Math.cos(a) * 1.5, 0.5 + rnd() * 0.3, 0.75, 0.2,
        ember.r, ember.g, ember.b, 1, CELL.flame, -1.2, 1.4, jit() * 2, 0, 0.08);
    }
    const w = c.w;
    if (w) {
      w.root.updateWorldMatrix(true, false);
      _t.copy(w.tip).applyMatrix4(w.root.matrixWorld);
      fx.flash(_t.x, _t.y, _t.z, fx.color('#ffffff'), 1.8, 0.24, CELL.star, 3);
      fx.flash(_t.x, _t.y, _t.z, ember, 3.2, 0.4, CELL.rays, -2);
      let t = 0;
      fx.spawn({
        update: (_dt, sm) => {
          t += SIM_DT;
          const ww = playerWeapon(sm, fx.group.parent);
          if (!ww) return false;
          ww.root.updateWorldMatrix(true, false);
          _b.copy(ww.base).applyMatrix4(ww.root.matrixWorld);
          _t.copy(ww.tip).applyMatrix4(ww.root.matrixWorld);
          for (let i = 0; i < 3; i++) {
            const k = Math.min(1, t / 0.5) * rnd();
            fx.particles.emitRaw(_b.x + (_t.x - _b.x) * k, _b.y + (_t.y - _b.y) * k, _b.z + (_t.z - _b.z) * k, jit() * 0.4, 1.2 + rnd(), jit() * 0.4, 0.35, 0.34, 0.1,
              hot.r, hot.g, hot.b, 1, CELL.flame, -1, 1, jit() * 3, 0, 0.1);
          }
          return t < 0.7;
        },
        dispose: () => undefined,
      });
    }
  },

  /* --- Tuono Spezzacielo ----------------------------------------------------------------------------------------- */
  // Schianto Tonante: a bolt from the sky into the impact, forked lightning cracks racing out over the ground
  art_schianto_tonante: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'impact') return;
    const r = Math.max(2, c.k), y = gy(sim, c.x, c.z);
    const azure = fx.color('#5aa8ff'), pale = fx.color('#d8f0ff'), white = fx.color('#ffffff');
    under(fx, c.x, y + 0.8, c.z, r * 1.6, 0.42, azure, 0.6);
    c.scorch.spawn(c.x, y, c.z, r * 0.85, 2.4, azure, 1.5, 0, 0.95);
    fx.flash(c.x, y + 0.8, c.z, white, 3.0, 0.2, CELL.star, 4);
    fx.flash(c.x, y + 0.8, c.z, azure, r * 1.4, 0.4, CELL.rays, -2);
    for (let i = 0; i < fxN(fx, 14); i++) {
      const hy = 2 + rnd() * 10;
      fx.particles.emitRaw(c.x + jit() * 0.3, y + hy, c.z + jit() * 0.3, 0, -60, 0, Math.min(0.16, hy / 60), 0.55, 0.3, pale.r, pale.g, pale.b, 1, CELL.spark, 0, 0, 0, 0.12, 0.01);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2 + jit() * 0.3;
      for (let j = 0; j < fxN(fx, 6); j++) {
        const sp = r * (2.2 + rnd() * 2.5), a2 = a + jit() * 0.25, vx = Math.sin(a2) * sp, vz = Math.cos(a2) * sp, life = 0.22 + rnd() * 0.1;
        fx.smoke.emitRaw(c.x, y + 0.08, c.z, vx, 0, vz, life, 0.5, 0.16, 0.03, 0.05, 0.1, 0.45, CELL.spark, 0, 5, 0, 0.1, 0.01);
        fx.particles.emitRaw(c.x, y + 0.08, c.z, vx, 0, vz, life, 0.28, 0.08, pale.r, pale.g, pale.b, 1, CELL.spark, 0, 5, 0, 0.1, 0.01);
      }
    }
    fx.sparks(c.x, y + 0.5, c.z, white, 30, 11, 0.16);
    fx.shards(c.x, y + 0.2, c.z, fx.color('#3a3a44'), 12, 6, 0.3);
  },
  // Catena di Fulmini: a falling bolt strikes the raised hammer; the charge leaps on to the targets (sim arcs)
  art_catena_fulmini: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'cast') return;
    const p = sim.player;
    const azure = fx.color('#5aa8ff'), pale = fx.color('#d8f0ff');
    let x = p.pos.x, y = p.pos.y + 2.2 * p.scale, z = p.pos.z;
    if (c.w) {
      c.w.root.updateWorldMatrix(true, false);
      _t.copy(c.w.tip).applyMatrix4(c.w.root.matrixWorld);
      x = _t.x; y = _t.y; z = _t.z;
    }
    under(fx, x, y, z, 3.2, 0.4, azure, 0.6);
    fx.flash(x, y, z, fx.color('#ffffff'), 2.4, 0.25, CELL.star, 4);
    fx.flash(x, y, z, azure, 4.0, 0.4, CELL.rays, -2);
    for (let i = 0; i < fxN(fx, 12); i++) {
      const hy = 1 + rnd() * 10;
      fx.particles.emitRaw(x + jit() * 0.2, y + hy, z + jit() * 0.2, 0, -60, 0, Math.min(0.15, hy / 60), 0.5, 0.3, pale.r, pale.g, pale.b, 1, CELL.spark, 0, 0, 0, 0.12, 0.01);
    }
    fx.sparks(x, y, z, pale, 20, 8, 0.14);
    const g = gy(sim, p.pos.x, p.pos.z);
    fx.ring(p.pos.x, g, p.pos.z, 2.4, azure, 0.4, 0.4);
    c.scorch.spawn(p.pos.x, g, p.pos.z, 1.7, 1.4, azure, 1.3, 0.6, 0.8);
  },

  /* --- Brina Silente --------------------------------------------------------------------------------------------- */
  // Affondo Gelido: a frost wake and a rime streak on the ground, an ice-crystal burst at the point (the freeze is sim's)
  art_affondo_gelido: (c) => {
    const { fx, sim } = c;
    const frost = fx.color('#bfe6ff'), deep = fx.color('#4a8ad8'), white = fx.color('#ffffff'), mist = fx.color('#e4f6ff');
    if (c.phase === 'dash') {
      wake(c, frost, 0.3, 150, 0.42, CELL.spark, 8, c.k, deep, null);
      under(fx, c.x, c.y + 1.0, c.z, 1.8, 0.22, deep);
      fx.flash(c.x, c.y + 1.0, c.z, white, 1.4, 0.2, CELL.star);
      let t = 0;
      fx.spawn({
        update: (_dt, sm) => {
          t += SIM_DT;
          const pl = sm.player;
          if (rnd() < SIM_DT * 40) fx.smoke.emitRaw(pl.pos.x + jit() * 0.3, pl.pos.y + 0.3 + rnd() * 1.2, pl.pos.z + jit() * 0.3, jit() * 0.3, 0.1, jit() * 0.3, 0.9, 0.3, 1.1, mist.r, mist.g, mist.b, 0.4, CELL.smoke, -0.1, 1.2, jit(), 0, 0.15);
          return t < 0.32;
        },
        dispose: () => undefined,
      });
    } else if (c.phase === 'hit' || c.phase === 'shatter') {
      const p = sim.player;
      strikePoint(sim, artParam(sim, c, 'reach', 3.4) * p.scale * 0.8, _t);
      under(fx, _t.x, _t.y, _t.z, 3.4, 0.42, deep, 0.6);
      fx.flash(_t.x, _t.y, _t.z, white, 2.2, 0.24, CELL.star, 3);
      fx.flash(_t.x, _t.y, _t.z, frost, 3.6, 0.4, CELL.rays, -2);
      fx.shards(_t.x, _t.y, _t.z, frost, 18, 7, 0.32);
      c.arcs.spawn(_t.x, _t.y, _t.z, p.yaw, 2, 0, 0.9 * p.scale, 0.24, 0, PI * 2, white, frost, 0.08, 0.55, 0.16, 1.0, 0.9);
      fx.puff(_t.x, _t.y - 0.4, _t.z, mist, 8, 0.8, 0.8, 0.3);
      c.scorch.spawn(_t.x, gy(sim, _t.x, _t.z), _t.z, 1.3, 2.4, frost, 1.6, 0, 0.6);
    }
  },
  // Danza dei Cristalli: three needle thrusts, each a line of cold light ending in a crystal star (the shards fly as projectiles)
  art_danza_cristalli: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'strike') return;
    const p = sim.player, s = p.scale, f = fwd(p.yaw);
    const fx0 = f.x, fz0 = f.z;
    const frost = fx.color('#bfe6ff'), deep = fx.color('#4a8ad8'), white = fx.color('#ffffff');
    const reach = artParam(sim, c, 'reach', 3.3) * s;
    const lat = ((c.k % 3) - 1) * 0.22 * s, rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const ox = p.pos.x + rx * lat, oz = p.pos.z + rz * lat, oy = p.pos.y + 1.15 * s;
    for (let i = 0; i < fxN(fx, 6); i++) {
      const sp = 26 + rnd() * 10, d0 = 0.5 + rnd() * 0.4, life = reach / sp;
      fx.smoke.emitRaw(ox + fx0 * d0, oy, oz + fz0 * d0, fx0 * sp, 0, fz0 * sp, life, 0.5, 0.2, 0.03, 0.06, 0.12, 0.4, CELL.spark, 0, 0, 0, 0.12, 0.01);
      fx.particles.emitRaw(ox + fx0 * d0, oy, oz + fz0 * d0, fx0 * sp, 0, fz0 * sp, life, 0.3, 0.12, frost.r, frost.g, frost.b, 1, CELL.spark, 0, 0, 0, 0.12, 0.01);
    }
    const tx = ox + fx0 * reach, tz = oz + fz0 * reach;
    under(fx, tx, oy, tz, 2.0, 0.32, deep);
    fx.flash(tx, oy, tz, white, 1.5, 0.2, CELL.star, 6);
    c.arcs.spawn(tx, oy, tz, p.yaw, 2, c.k * 0.6, 0.5 * s, 0.14, 0, PI * 2, white, frost, 0.06, 0.34, 0.08, 1.0, 0.9);
    fx.shards(tx, oy, tz, frost, 6, 4, 0.22);
  },

  /* --- Fenditura Ardente ----------------------------------------------------------------------------------------- */
  // Frattura Magmatica: the axe bites the ground; a glowing crack tears forward with the fissure, smoke and spatter
  art_frattura_magmatica: (c) => {
    const { fx, sim } = c;
    if (c.phase !== 'release') return;
    const p = sim.player, s = p.scale, f = fwd(p.yaw);
    const fx0 = f.x, fz0 = f.z, x0 = p.pos.x, z0 = p.pos.z, yaw0 = p.yaw;
    const len = Math.max(4, c.k), speed = Math.max(4, c.n), width = artParam(sim, c, 'width', 1.8) * s;
    const linger = artParam(sim, c, 'linger_time', 3);
    const lava = fx.color('#ff5a1a'), hot = fx.color('#ffb040'), rock = fx.color('#2a2220');
    const bx = x0 + fx0 * 1.2, bz = z0 + fz0 * 1.2, by = gy(sim, bx, bz);
    under(fx, bx, by + 0.4, bz, 3.0, 0.4, lava, 0.6);
    fx.flash(bx, by + 0.4, bz, lava, 3.0, 0.35, CELL.rays, 2);
    fx.shards(bx, by + 0.2, bz, rock, 14, 6, 0.3);
    fx.sparks(bx, by + 0.3, bz, hot, 20, 8, 0.16);
    const N = 9;
    for (let i = 0; i < N; i++) {
      const d = 1.0 + (len - 1.0) * (i / (N - 1));
      later(c, d / speed, (sm) => {
        const x = x0 + fx0 * d, z = z0 + fz0 * d, y = gy(sm, x, z);
        c.scorch.spawn(x, y, z, width * 0.42, linger + 1.2, lava, 1.7, 0, 0.95, 2.2, yaw0 + jit() * 0.25);
        for (let j = 0; j < fxN(fx, 5); j++) {
          const col = j % 2 ? hot : lava;
          fx.particles.emitRaw(x + jit() * 0.4, y + 0.1, z + jit() * 0.4, jit() * 1.5, 3 + rnd() * 3, jit() * 1.5, 0.7 + rnd() * 0.3, 0.24, 0.12, col.r, col.g, col.b, 1, CELL.blob, 9, 0.6, 0, 0.03, 0.03);
        }
        fx.smoke.emitRaw(x, y + 0.5, z, jit() * 0.3, 1.2, jit() * 0.3, 1.6, 0.6, 2.0, 0.1, 0.08, 0.07, 0.5, CELL.smoke, -0.3, 1, jit(), 0, 0.15);
      });
    }
  },
  // Eruzione: a leap trailing embers, then the ground erupts: a crater, lava fountains, black smoke and rock
  art_eruzione: (c) => {
    const { fx, sim } = c;
    const lava = fx.color('#ff5a1a'), hot = fx.color('#ffb040'), smoke = fx.color('#1a1412');
    if (c.phase === 'leap') {
      fx.puff(c.x, c.y, c.z, fx.color('#3a2a22'), 10, 0.9, 1.0, 0.5);
      const dur = Math.max(0.2, c.n);
      let t = 0;
      fx.spawn({
        update: (_dt, sm) => {
          t += SIM_DT;
          const pl = sm.player;
          if (rnd() < SIM_DT * 70) fx.particles.emitRaw(pl.pos.x + jit() * 0.4, pl.pos.y + 0.6 + rnd() * 1.2, pl.pos.z + jit() * 0.4, jit() * 0.6, 0.4, jit() * 0.6, 0.45, 0.16, 0.05, hot.r, hot.g, hot.b, 1, CELL.spark, -0.5, 1.5, 0, 0.05, 0.03);
          if (rnd() < SIM_DT * 20) fx.smoke.emitRaw(pl.pos.x, pl.pos.y + 1, pl.pos.z, 0, 0.3, 0, 0.8, 0.4, 1.0, 0.1, 0.08, 0.07, 0.4, CELL.smoke, 0, 1, jit(), 0, 0.15);
          return t < dur;
        },
        dispose: () => undefined,
      });
    } else if (c.phase === 'impact') {
      const r = Math.max(2, c.k), y = gy(sim, c.x, c.z);
      under(fx, c.x, y + 1, c.z, r * 1.8, 0.5, lava, 0.65);
      c.scorch.spawn(c.x, y, c.z, r * 0.95, 3.6, lava, 1.8, 0, 1.0);
      fx.flash(c.x, y + 1, c.z, fx.color('#ffffff'), 3.2, 0.22, CELL.star, 4);
      fx.flash(c.x, y + 1, c.z, lava, r * 1.5, 0.45, CELL.rays, -2);
      for (let i = 0; i < fxN(fx, 56); i++) {
        const a = rnd() * PI * 2, sp = 2 + rnd() * r * 1.4, col = i % 3 ? lava : hot;
        fx.particles.emitRaw(c.x + Math.sin(a) * 0.5, y + 0.3, c.z + Math.cos(a) * 0.5, Math.sin(a) * sp, 6 + rnd() * 7, Math.cos(a) * sp, 0.9 + rnd() * 0.4, 0.32, 0.12,
          col.r, col.g, col.b, 1, CELL.blob, 14, 0.4, 0, 0.03, 0.02);
      }
      fx.puff(c.x, y, c.z, smoke, 18, 1.6, r * 0.6, 2.2);
      fx.shards(c.x, y + 0.3, c.z, fx.color('#2a2220'), 20, 8, 0.4);
      fx.ring(c.x, y, c.z, r * 1.1, lava, 0.55, 1.0);
    }
  },
};

function mudSplash(c: ArtCtx, r: number, life = 2.2): void {
  const { fx, x, y, z } = c;
  const mud = fx.color('#4a3a26'), wet = fx.color('#6a5a3a'), green = fx.color('#7a8a4a');
  c.scorch.spawn(x, gy(c.sim, x, z), z, r * 1.1, life, green, 0.5, 0, 0.9);
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
