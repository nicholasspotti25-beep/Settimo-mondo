/**
 * Small allocation-conscious math kit shared by sim and render.
 * Convention: +Y up, yaw = 0 faces +Z, forward(yaw) = (sin yaw, 0, cos yaw).
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Vec3T = [number, number, number];

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}
export function v3t(t: Vec3T | undefined, out: Vec3 = v3()): Vec3 {
  if (!t) {
    out.x = 0; out.y = 0; out.z = 0;
    return out;
  }
  out.x = t[0]; out.y = t[1]; out.z = t[2];
  return out;
}
export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x; out.y = y; out.z = z;
  return out;
}
export function copy(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x; out.y = a.y; out.z = a.z;
  return out;
}
export function clone(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}
export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z;
  return out;
}
export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z;
  return out;
}
export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s; out.y = a.y * s; out.z = a.z * s;
  return out;
}
export function addScaled(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out.x = a.x + b.x * s; out.y = a.y + b.y * s; out.z = a.z + b.z * s;
  return out;
}
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
export function len2D(a: Vec3): number {
  return Math.hypot(a.x, a.z);
}
export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
export function dist2D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function distSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
export function normalize(out: Vec3, a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  if (l < 1e-9) return set(out, 0, 0, 0);
  return scale(out, a, 1 / l);
}
export function normalize2D(out: Vec3, a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.z);
  if (l < 1e-9) return set(out, 0, a.y, 0);
  out.x = a.x / l; out.z = a.z / l; out.y = a.y;
  return out;
}
export function lerpV(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

/** Forward unit vector for a yaw. */
export function forward(yaw: number, out: Vec3 = v3()): Vec3 {
  out.x = Math.sin(yaw); out.y = 0; out.z = Math.cos(yaw);
  return out;
}
/** Right-hand unit vector for a yaw. NOTE: local +X (Three.js object space) is the character's LEFT; right(yaw) = -localX. */
export function right(yaw: number, out: Vec3 = v3()): Vec3 {
  out.x = -Math.cos(yaw); out.y = 0; out.z = Math.sin(yaw);
  return out;
}
/** Yaw that points from a to b on the ground plane. */
export function yawTo(a: Vec3, b: Vec3): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
export function yawOf(x: number, z: number): number {
  return Math.atan2(x, z);
}
/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from);
}
/** Rotate current yaw toward target by at most maxStep radians. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(d) * maxStep);
}

/** Transform a local offset (x right, y up, z forward in owner space) into world space. */
export function localToWorld(origin: Vec3, yaw: number, lx: number, ly: number, lz: number, out: Vec3, scaleF = 1): Vec3 {
  // Local frame == Three.js object space: +Z forward, +Y up, +X = the owner's LEFT. Rotation about Y by yaw.
  const s = Math.sin(yaw), c = Math.cos(yaw);
  out.x = origin.x + (lx * c + lz * s) * scaleF;
  out.y = origin.y + ly * scaleF;
  out.z = origin.z + (-lx * s + lz * c) * scaleF;
  return out;
}
/** Inverse of localToWorld on the ground plane (ignores y scale). */
export function worldToLocal(origin: Vec3, yaw: number, p: Vec3, out: Vec3, scaleF = 1): Vec3 {
  const dx = (p.x - origin.x) / scaleF, dy = (p.y - origin.y) / scaleF, dz = (p.z - origin.z) / scaleF;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  out.x = dx * c - dz * s;
  out.y = dy;
  out.z = dx * s + dz * c;
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function invLerp(a: number, b: number, v: number): number {
  return b === a ? 0 : (v - a) / (b - a);
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** Frame-rate independent exponential smoothing. */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return wrapAngle(a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt)));
}
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}
export function easeInCubic(t: number): number {
  const u = clamp01(t);
  return u * u * u;
}

/** Closest point parameter on segment ab to point p (3D). */
export function segmentClosestT(ax: number, ay: number, az: number, bx: number, by: number, bz: number, px: number, py: number, pz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const l2 = abx * abx + aby * aby + abz * abz;
  if (l2 < 1e-12) return 0;
  return clamp01(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l2);
}

/** Squared distance between two segments (for capsule-capsule tests). */
export function segSegDistSq(
  p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number,
): number {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    return rx * rx + ry * ry + rz * rz;
  }
  if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  const cz = p1z + d1z * s - (p2z + d2z * t);
  return cx * cx + cy * cy + cz * cz;
}

/** Point-in-polygon on XZ plane (polygon as flat [x0,z0,x1,z1,...]). */
export function pointInPolygon(x: number, z: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Catmull-Rom interpolation of a polyline of points at parameter u in [0, n-1]. */
export function catmullRom(points: Vec3T[], u: number, out: Vec3): Vec3 {
  const n = points.length;
  if (n === 0) return set(out, 0, 0, 0);
  if (n === 1) return v3t(points[0], out);
  const i = clamp(Math.floor(u), 0, n - 2);
  const t = clamp01(u - i);
  const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < 3; k++) {
    const v = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    if (k === 0) out.x = v;
    else if (k === 1) out.y = v;
    else out.z = v;
  }
  return out;
}

/** Hash-based value noise (deterministic, no tables) usable by sim terrain and render. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function fbm2(x: number, y: number, octaves = 4, seed = 0, lacunarity = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
