/**
 * Shared helpers for the landmark builders (files starting with `_` are not builders): stone palettes, wall shapes
 * with arched windows and doorways, arch curves and voussoir arches, columns, statues, ring-sector paving, window light
 * shafts (one additive draw call, aimed at the live key-light direction), and ground sampling in landmark space.
 */
import * as THREE from 'three';
import type { LandmarkDef } from '../../core/types';
import type { ZoneEnv } from '../../render/world/env';
import { Parts, R, blob, box, cyl, displace, extrude, lathe, mat4, sphere, cone } from '../../render/world/geo';
import { ATMOS } from '../../render/world/atmosphere';

export type Col = [string, string];
export const PALE: Col = ['#8f897e', '#dcd4c3'];
export const PALE_WARM: Col = ['#93897a', '#e2d6bf'];
export const STONE: Col = ['#6a645a', '#b9b1a0'];
export const DARK: Col = ['#3e3a34', '#6e675c'];
export const MARBLE_BLACK: Col = ['#141218', '#3a3640'];
export const SLATE: Col = ['#2c2e3c', '#4c5068'];
export const IRON: Col = ['#24221f', '#4a4640'];
export const WOOD: Col = ['#2e2219', '#5a4432'];
export const ROT_WOOD: Col = ['#1e1a14', '#463a2a'];
export const BRONZE: Col = ['#3a2a18', '#7a5a32'];
export const ROPE: Col = ['#4a3e2a', '#7a6a4a'];

export function styleColor(style: unknown): Col {
  switch (style) {
    case 'stone': return STONE;
    case 'dark': return DARK;
    case 'marble': return ['#b8b2aa', '#f0ece4'];
    case 'black': return MARBLE_BLACK;
    case 'warm': return PALE_WARM;
    default: return PALE;
  }
}

export function num(def: LandmarkDef, key: string, d: number): number {
  const v = def.params?.[key];
  return typeof v === 'number' ? v : d;
}
export function str(def: LandmarkDef, key: string, d: string): string {
  const v = def.params?.[key];
  return typeof v === 'string' ? v : d;
}
export function bool(def: LandmarkDef, key: string, d: boolean): boolean {
  const v = def.params?.[key];
  return typeof v === 'boolean' ? v : d;
}

/** Height of the ground (local landmark y, unscaled) under local point (lx, lz) of a placed landmark. */
export function groundLocal(env: ZoneEnv, def: LandmarkDef, lx: number, lz: number): number {
  const yaw = def.yaw ?? 0, s = def.scale ?? 1;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const wx = def.pos[0] + (lx * c + lz * sn) * s;
  const wz = def.pos[2] + (-lx * sn + lz * c) * s;
  return (env.heightAt(wx, wz) - def.pos[1]) / s;
}

/** Compose parent * local. */
export function mul(parent: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  return parent.clone().multiply(local);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Arches                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Points of an arch intrados from the left springing (-span/2, 0) over the apex (0, rise) to (span/2, 0). */
export function archCurve(span: number, rise: number, pointed: boolean, n = 10): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  const hs = span / 2;
  if (!pointed) {
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI;
      out.push(new THREE.Vector2(-Math.cos(a) * hs, Math.sin(a) * rise));
    }
    return out;
  }
  // equilateral pointed arch, each half an arc centered on the opposite springing, y scaled to the rise
  const ky = rise / (span * Math.sin(Math.PI / 3));
  for (let i = 0; i <= n; i++) {
    const th = Math.PI - (i / n) * (Math.PI / 3);
    out.push(new THREE.Vector2(hs + span * Math.cos(th), span * Math.sin(th) * ky));
  }
  for (let i = n - 1; i >= 0; i--) {
    const p = out[i];
    out.push(new THREE.Vector2(-p.x, p.y));
  }
  return out;
}

/** Window opening path (hole) with the sill at y0, total height h, width w, centered at x. */
function openingPath(path: THREE.Path, x: number, y0: number, w: number, h: number, pointed: boolean, fromBottom: boolean): void {
  const rise = pointed ? w * 0.75 : w / 2;
  const spring = y0 + Math.max(0.1, h - rise);
  const pts = archCurve(w, rise, pointed, 6);
  if (!fromBottom) path.moveTo(x - w / 2, y0);
  path.lineTo(x - w / 2, spring);
  for (const p of pts) path.lineTo(x + p.x, spring + p.y);
  path.lineTo(x + w / 2, y0);
  if (!fromBottom) path.lineTo(x - w / 2, y0);
}

export interface WallOpening {
  /** Center x along the wall. */
  x: number;
  w: number;
  h: number;
  /** Sill height (0 = doorway reaching the floor). */
  sill: number;
  pointed?: boolean;
  /** Round (oculus) window instead of an arch: h is ignored, w is the diameter, sill the center height. */
  round?: boolean;
}

/** Wall face shape len x h (x in [-len/2, len/2], y in [0, h]) with arched openings; doorways cut into the bottom edge. */
export function wallShape(len: number, h: number, openings: WallOpening[], topProfile?: (x: number) => number): THREE.Shape {
  const s = new THREE.Shape();
  const doors = openings.filter((o) => o.sill <= 0.001 && !o.round).sort((a, b) => a.x - b.x);
  s.moveTo(-len / 2, 0);
  for (const d of doors) {
    s.lineTo(d.x - d.w / 2, 0);
    openingPath(s, d.x, 0, d.w, d.h, !!d.pointed, true);
  }
  s.lineTo(len / 2, 0);
  if (topProfile) {
    const n = Math.max(4, Math.round(len / 0.9));
    for (let i = n; i >= 0; i--) {
      const x = -len / 2 + (i / n) * len;
      s.lineTo(x, Math.max(0.4, topProfile(x)));
    }
  } else {
    s.lineTo(len / 2, h);
    s.lineTo(-len / 2, h);
  }
  s.lineTo(-len / 2, 0);
  for (const o of openings) {
    if (o.sill <= 0.001 && !o.round) continue;
    const hole = new THREE.Path();
    if (o.round) hole.absarc(o.x, o.sill, o.w / 2, 0, Math.PI * 2, false);
    else openingPath(hole, o.x, o.sill, o.w, o.h, !!o.pointed, false);
    s.holes.push(hole);
  }
  return s;
}

/** Extrude a wall face shape `thick` deep (centered on z = 0), no uvs. */
export function extrudeWall(s: THREE.Shape, thick: number): THREE.BufferGeometry {
  return extrude(s, thick, 0, 6);
}

/** Arch band (rib / archivolt) between the curve of `span` and a curve `thick` wider, extruded `depth`. */
export function archBand(span: number, rise: number, thick: number, depth: number, pointed: boolean): THREE.BufferGeometry {
  const inner = archCurve(span, rise, pointed, 8);
  const outer = archCurve(span + thick * 2, rise + thick, pointed, 8);
  const s = new THREE.Shape();
  s.moveTo(outer[0].x, outer[0].y);
  for (const p of outer) s.lineTo(p.x, p.y);
  for (let i = inner.length - 1; i >= 0; i--) s.lineTo(inner[i].x, inner[i].y);
  s.lineTo(outer[0].x, outer[0].y);
  return extrude(s, depth, 0, 8);
}

/**
 * Arch of individual voussoirs + keystone under `m` (opening in the local XY plane, depth along Z). `keep(i, n)` may
 * drop stones (broken arches). Springing at y = 0.
 */
export function voussoirs(p: Parts, m: THREE.Matrix4, span: number, rise: number, thick: number, depth: number, pointed: boolean, col: Col, r: R, keep: (i: number, n: number) => boolean = () => true): void {
  const curve = archCurve(span + thick, rise + thick / 2, pointed, 7);
  const n = curve.length - 1;
  for (let i = 0; i < n; i++) {
    if (!keep(i, n)) continue;
    const a = curve[i], b = curve[i + 1];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const key = i === Math.floor(n / 2) || (n % 2 === 0 && i === n / 2 - 1);
    const g = box(len * 0.96, thick * (key ? 1.22 : 1), depth * (key ? 1.06 : 1));
    p.add(g, 'matte', { color: col, cover: 0.7, jitter: 0.08 }, mul(m, mat4([mx, my, 0], [0, 0, ang + r.range(-0.015, 0.015)])));
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Columns, statues, paving                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Column standing at (x, y, z): plinth, slightly tapered shaft, capital. `broken` 0..1 shortens with a jagged top. */
export function column(p: Parts, m: THREE.Matrix4, x: number, y: number, z: number, h: number, rad: number, col: Col, r: R, broken = 0, seg = 12): void {
  const base = lathe([[0, 0], [rad * 1.45, 0], [rad * 1.45, rad * 0.35], [rad * 1.25, rad * 0.5], [rad * 1.12, rad * 0.72], [0, rad * 0.72]], seg);
  p.add(base, 'matte', { color: col, cover: 0.8, aoBottom: 0.55 }, mul(m, mat4([x, y, z])));
  const sh = broken > 0 ? h * (1 - broken) : h - rad * 1.6;
  const shaft = cyl(rad * 0.88, rad, Math.max(0.3, sh - rad * 0.7), seg);
  p.add(shaft, 'matte', { color: col, cover: 0.6, aoBottom: 0.75, yRange: [y, y + h] }, mul(m, mat4([x, y + rad * 0.7, z])));
  if (broken > 0) {
    const top = displace(cyl(rad * 0.86, rad * 0.88, rad * 0.9, seg), 0.22, 2.2, r.int(1, 999));
    p.add(top, 'matte', { color: col, cover: 1 }, mul(m, mat4([x, y + sh - 0.1, z], [r.range(-0.2, 0.2), r.range(0, 6), r.range(-0.2, 0.2)])));
    return;
  }
  const cap = lathe([[0, 0], [rad * 0.92, 0], [rad * 1.05, rad * 0.25], [rad * 1.35, rad * 0.62], [rad * 1.5, rad * 0.72], [rad * 1.5, rad * 0.98], [0, rad * 0.98]], seg);
  p.add(cap, 'matte', { color: col, cover: 0.9 }, mul(m, mat4([x, y + h - rad * 0.98, z])));
}

export interface StatueOpts {
  pose: 'sword' | 'spear' | 'kneel' | 'mourner';
  /** 0 intact .. 1 heavily broken (head, arm, weapon missing). */
  broken: number;
  col: Col;
  plinth?: number;
}

/** A stone guardian on a plinth, built around the local origin, facing +Z, about 4.2 m tall (plinth included). */
export function statue(p: Parts, m: THREE.Matrix4, r: R, o: StatueOpts): void {
  const C = o.col;
  const ph = o.plinth ?? 1.2;
  p.add(box(2.2, ph, 2.2), 'matte', { color: DARK, cover: 0.9, aoBottom: 0.5 }, mul(m, mat4([0, ph / 2, 0])));
  p.add(box(2.5, 0.22, 2.5), 'matte', { color: DARK, cover: 0.9 }, mul(m, mat4([0, 0.11, 0])));
  p.add(box(2.35, 0.18, 2.35), 'matte', { color: C, cover: 1 }, mul(m, mat4([0, ph + 0.09, 0])));
  const y0 = ph + 0.18;
  const lostHead = o.broken > 0.35 && r.next() < 0.75;
  const lostArm = o.broken > 0.55;
  const kneel = o.pose === 'kneel';
  // legs + robe
  if (kneel) {
    p.add(cyl(0.34, 0.38, 0.9, 8), 'matte', { color: C }, mul(m, mat4([0.38, y0, 0.25], [Math.PI / 2 - 0.2, 0, 0])));
    p.add(cyl(0.3, 0.34, 0.95, 8), 'matte', { color: C }, mul(m, mat4([-0.38, y0, -0.1])));
    p.add(lathe([[0, 0], [0.75, 0], [0.62, 0.7], [0.5, 1.1], [0, 1.1]], 9), 'matte', { color: C, cover: 0.8 }, mul(m, mat4([0, y0 + 0.55, -0.05])));
  } else {
    p.add(lathe([[0, 0], [0.82, 0], [0.7, 0.6], [0.52, 1.5], [0.48, 1.75], [0, 1.75]], 10), 'matte', { color: C, cover: 0.8, aoBottom: 0.7 }, mul(m, mat4([0, y0, 0])));
  }
  const ty = y0 + (kneel ? 1.55 : 1.7);
  // torso, pauldrons, cloak
  p.add(displace(cyl(0.5, 0.42, 1.1, 9), 0.05, 2, r.int(1, 99)), 'matte', { color: C, cover: 0.7 }, mul(m, mat4([0, ty, 0])));
  p.add(sphere(0.3, 8, 6), 'matte', { color: C, cover: 0.9 }, mul(m, mat4([0.56, ty + 0.95, 0], [0, 0, 0], [1, 0.75, 1])));
  if (!lostArm) p.add(sphere(0.3, 8, 6), 'matte', { color: C, cover: 0.9 }, mul(m, mat4([-0.56, ty + 0.95, 0], [0, 0, 0], [1, 0.75, 1])));
  p.add(cone(0.82, 2.1, 9), 'matte', { color: C, cover: 0.9 }, mul(m, mat4([0, ty - 1.05 + (kneel ? 0.25 : 0), -0.22], [0.08, 0, 0], [1, 1, 0.55])));
  if (!lostHead) {
    p.add(cyl(0.16, 0.2, 0.26, 8), 'matte', { color: C }, mul(m, mat4([0, ty + 1.08, 0.02])));
    // closed helm with a crest (the old guard of the Culla)
    p.add(lathe([[0, 0], [0.27, 0], [0.3, 0.2], [0.27, 0.42], [0.14, 0.56], [0, 0.6]], 9), 'matte', { color: C, cover: 1 }, mul(m, mat4([0, ty + 1.28, 0.03])));
    p.add(box(0.06, 0.32, 0.5), 'matte', { color: C, cover: 1 }, mul(m, mat4([0, ty + 1.78, 0])));
  } else {
    p.add(displace(cyl(0.18, 0.2, 0.2, 7), 0.25, 3, r.int(1, 99)), 'matte', { color: C }, mul(m, mat4([0, ty + 1.08, 0])));
  }
  // arms + weapon held point-down in front (sword) or a spear planted at the side
  const hands = new THREE.Vector3(0, ty + 0.35, 0.5);
  if (o.pose === 'sword' || kneel) {
    p.add(cyl(0.13, 0.15, 0.9, 6), 'matte', { color: C }, mul(m, mat4([0.38, ty + 0.4, 0.28], [-0.7, 0, 0.25])));
    if (!lostArm) p.add(cyl(0.13, 0.15, 0.9, 6), 'matte', { color: C }, mul(m, mat4([-0.38, ty + 0.4, 0.28], [-0.7, 0, -0.25])));
    if (o.broken < 0.8) {
      const bl = kneel ? 1.5 : 1.9;
      p.add(box(0.16, bl, 0.05), 'matte', { color: C, cover: 0.6 }, mul(m, mat4([0, hands.y - bl / 2 - 0.15, hands.z + 0.02])));
      p.add(box(0.7, 0.1, 0.12), 'matte', { color: C }, mul(m, mat4([0, hands.y - 0.08, hands.z + 0.02])));
      p.add(sphere(0.09, 6, 4), 'matte', { color: C }, mul(m, mat4([0, hands.y + 0.18, hands.z + 0.02])));
    }
  } else if (o.pose === 'spear') {
    p.add(cyl(0.13, 0.15, 1.0, 6), 'matte', { color: C }, mul(m, mat4([0.6, ty + 0.5, 0.15], [-0.25, 0, 0.12])));
    if (o.broken < 0.7) {
      p.add(cyl(0.05, 0.06, 4.4, 6), 'matte', { color: C }, mul(m, mat4([0.78, y0 - 0.05, 0.35])));
      p.add(cone(0.14, 0.6, 6), 'matte', { color: C }, mul(m, mat4([0.78, y0 + 4.35, 0.35], [0, 0, 0], [1, 1, 0.35])));
    }
    if (!lostArm) p.add(cyl(0.13, 0.15, 0.9, 6), 'matte', { color: C }, mul(m, mat4([-0.5, ty + 0.25, 0.1], [0, 0, -0.2])));
  } else {
    // mourner: hands joined at the breast, hood
    p.add(cyl(0.13, 0.15, 0.75, 6), 'matte', { color: C }, mul(m, mat4([0.3, ty + 0.55, 0.3], [-1.2, 0, 0.6])));
    p.add(cyl(0.13, 0.15, 0.75, 6), 'matte', { color: C }, mul(m, mat4([-0.3, ty + 0.55, 0.3], [-1.2, 0, -0.6])));
  }
  // fragments at the plinth foot
  if (o.broken > 0.3) {
    for (let i = 0; i < 3; i++) {
      const a = r.range(0, Math.PI * 2);
      p.add(blob(r.range(0.15, 0.32), 0, 0.35, r.int(1, 999), 0.4), 'matte', { color: C, cover: 1 }, mul(m, mat4([Math.sin(a) * r.range(1.4, 2.2), 0.08, Math.cos(a) * r.range(1.4, 2.2)])));
    }
    if (lostHead) p.add(lathe([[0, 0], [0.27, 0], [0.3, 0.2], [0.27, 0.42], [0.14, 0.56], [0, 0.6]], 9), 'matte', { color: C, cover: 1 }, mul(m, mat4([r.range(1.5, 2.0), 0.25, r.range(-1, 1)], [1.3, r.range(0, 6), 0.4])));
  }
}

/** Ring of paving slabs between radii r0..r1 (n sectors), top at y, thickness th, built at (cx, cz). */
export function slabRing(p: Parts, m: THREE.Matrix4, cx: number, cz: number, r0: number, r1: number, n: number, y: number, th: number, col: Col, r: R, skip?: (a: number) => boolean, gap = 0.05): void {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + gap / Math.max(r0, 0.5);
    const a1 = ((i + 1) / n) * Math.PI * 2 - gap / Math.max(r0, 0.5);
    const am = (a0 + a1) / 2;
    if (skip && skip(am)) continue;
    const s = new THREE.Shape();
    const seg = Math.max(2, Math.ceil(((a1 - a0) * r1) / 1.2));
    s.moveTo(Math.cos(a0) * (r0 + gap), Math.sin(a0) * (r0 + gap));
    for (let k = 0; k <= seg; k++) {
      const a = a0 + ((a1 - a0) * k) / seg;
      s.lineTo(Math.cos(a) * (r1 - gap), Math.sin(a) * (r1 - gap));
    }
    for (let k = seg; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / seg;
      s.lineTo(Math.cos(a) * (r0 + gap), Math.sin(a) * (r0 + gap));
    }
    const g = extrude(s, th, 0, 2);
    g.rotateX(-Math.PI / 2);
    const tilt = r.range(-0.012, 0.012);
    p.add(g, 'matte', { color: col, cover: 0.55, jitter: 0.12 }, mul(m, mat4([cx, y - th / 2 + r.range(-0.015, 0.012), cz], [tilt, 0, -tilt])));
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Window light shafts                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const SHAFT_VERT = /* glsl */ `
attribute vec4 aShaft;   // x: 0 window / 1 floor end, y: across 0..1, z: 1 = floor pool, w: phase
attribute vec3 aIn;      // inward normal of the window (local)
uniform vec3 uLightDir;
uniform float uTime;
varying vec4 vS;
varying float vFace;
varying float vDist;
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 L = normalize(uLightDir);
  float floorW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y + 0.04;
  if (aShaft.x > 0.5) {
    float k = max(0.0, wp.y - floorW) / max(L.y, 0.2);
    wp.xyz -= L * k;
    wp.y = max(wp.y, floorW);
  }
  vec3 nW = normalize(mat3(modelMatrix) * aIn);
  vFace = smoothstep(0.04, 0.4, dot(nW, -L));
  vS = aShaft;
  vW = wp.xyz;
  vDist = distance(cameraPosition, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SHAFT_FRAG = /* glsl */ `
uniform vec3 uLightColor;
uniform float uHazeK;
uniform float uNight;
uniform float uTime;
uniform float uStrength;
uniform vec3 uTint;
varying vec4 vS;
varying float vFace;
varying float vDist;
varying vec3 vW;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  float across = smoothstep(0.0, 0.3, vS.y) * smoothstep(1.0, 0.7, vS.y);
  float a;
  if (vS.z > 0.5) {
    a = across * 0.55;
  } else {
    a = across * pow(1.0 - vS.x, 1.4) * (0.35 + 0.65 * smoothstep(0.0, 0.2, vS.x));
    // drifting dust in the light
    vec2 q = vW.xz * 1.7 + vec2(vW.y * 0.6, uTime * 0.07 + vS.w);
    float d = h21(floor(q * 6.0));
    a *= 0.8 + 0.4 * step(0.985, d);
  }
  a *= vFace * uStrength * smoothstep(1.2, 6.0, vDist) * (1.0 - smoothstep(70.0, 120.0, vDist));
  float lum = dot(uLightColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = mix(uLightColor / max(lum, 0.05), uTint, 0.45) * min(lum, 2.5) * mix(1.0, 0.55, uNight);
  gl_FragColor = vec4(c * a * uHazeK, 1.0);
}`;

/** Light shafts from window openings onto the floor of a hall (live key-light direction; only lit windows show). */
export class LightShafts {
  private pos: number[] = [];
  private sh: number[] = [];
  private inn: number[] = [];
  private idx: number[] = [];
  mesh: THREE.Mesh | null = null;
  private mat: THREE.ShaderMaterial | null = null;

  /** Window quad: center c, half-width axis u, half-height axis v (local), inward normal n. */
  add(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3, phase = 0): void {
    const corners = [
      c.clone().sub(u).sub(v), c.clone().add(u).sub(v), c.clone().add(u).add(v), c.clone().sub(u).add(v),
    ];
    const push = (p: THREE.Vector3, t: number, across: number, pool: number) => {
      this.pos.push(p.x, p.y, p.z);
      this.sh.push(t, across, pool, phase);
      this.inn.push(n.x, n.y, n.z);
      return this.pos.length / 3 - 1;
    };
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const i0 = push(a, 0, 0, 0), i1 = push(b, 0, 1, 0), i2 = push(b, 1, 1, 0), i3 = push(a, 1, 0, 0);
      this.idx.push(i0, i1, i2, i0, i2, i3);
    }
    // floor pool: the projected window (soft edges across both directions via two overlaid strips)
    const p0 = push(corners[0], 1, 0, 1), p1 = push(corners[1], 1, 1, 1), p2 = push(corners[2], 1, 1, 1), p3 = push(corners[3], 1, 0, 1);
    this.idx.push(p0, p1, p2, p0, p2, p3);
  }

  finish(strength = 0.08, tint = '#b49ae6'): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aShaft', new THREE.Float32BufferAttribute(this.sh, 4));
    g.setAttribute('aIn', new THREE.Float32BufferAttribute(this.inn, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    if (g.boundingSphere) g.boundingSphere.radius += 40;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: {
        uLightDir: ATMOS.uLightDir, uLightColor: ATMOS.uLightColor, uHazeK: ATMOS.uHazeK, uNight: ATMOS.uNight, uTime: ATMOS.uTime,
        uStrength: { value: strength }, uTint: { value: new THREE.Color(tint) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'light-shafts';
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    return this.mesh;
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.mat?.dispose();
  }
}

export { Parts, R };
