/** Analytic hitbox tests. Shapes are local to an owner (origin, yaw, scale); targets are spheres or vertical capsules. */
import { DEG, clamp, localToWorld, segmentClosestT, segSegDistSq, v3, wrapAngle, type Vec3 } from '../core/math';
import type { ShapeDef } from '../core/types';

/** Target volume: sphere when h === 0, otherwise a vertical capsule standing on (x, y, z) with total height h. */
export interface TargetVol {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
}

const tmpA = v3();
const tmpB = v3();
const tmpC = v3();

function targetSegment(t: TargetVol): [number, number] {
  if (t.h <= 0) return [t.y, t.y];
  const lo = t.y + t.r;
  const hi = Math.max(lo, t.y + t.h - t.r);
  return [lo, hi];
}

/** Distance from point to target volume surface-center axis (returns squared distance to the axis segment). */
function pointToTargetSq(px: number, py: number, pz: number, t: TargetVol): number {
  const [lo, hi] = targetSegment(t);
  const y = clamp(py, lo, hi);
  const dx = px - t.x, dy = py - y, dz = pz - t.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Test a shape against a target.
 * @param progress 0..1 within the hit window (used by expanding rings).
 * @param out optional world-space contact point (approximate) for VFX.
 */
export function shapeHits(shape: ShapeDef, origin: Vec3, yaw: number, scale: number, progress: number, t: TargetVol, out?: Vec3): boolean {
  switch (shape.type) {
    case 'sphere': {
      const c = localToWorld(origin, yaw, shape.c[0], shape.c[1], shape.c[2], tmpA, scale);
      const rr = shape.r * scale + t.r;
      const hit = pointToTargetSq(c.x, c.y, c.z, t) <= rr * rr;
      if (hit && out) contactBetween(c, t, out);
      return hit;
    }
    case 'capsule': {
      const a = localToWorld(origin, yaw, shape.a[0], shape.a[1], shape.a[2], tmpA, scale);
      const b = localToWorld(origin, yaw, shape.b[0], shape.b[1], shape.b[2], tmpB, scale);
      const [lo, hi] = targetSegment(t);
      const rr = shape.r * scale + t.r;
      const d2 = segSegDistSq(a.x, a.y, a.z, b.x, b.y, b.z, t.x, lo, t.z, t.x, hi, t.z);
      const hit = d2 <= rr * rr;
      if (hit && out) {
        const k = segmentClosestT(a.x, a.y, a.z, b.x, b.y, b.z, t.x, (lo + hi) / 2, t.z);
        out.x = a.x + (b.x - a.x) * k;
        out.y = a.y + (b.y - a.y) * k;
        out.z = a.z + (b.z - a.z) * k;
      }
      return hit;
    }
    case 'arc': {
      const c = shape.c ? localToWorld(origin, yaw, shape.c[0], shape.c[1], shape.c[2], tmpA, scale) : tmpA;
      if (!shape.c) {
        c.x = origin.x; c.y = origin.y; c.z = origin.z;
      }
      const dx = t.x - c.x, dz = t.z - c.z;
      const d = Math.hypot(dx, dz);
      const r = shape.r * scale, rin = (shape.r_in ?? 0) * scale;
      if (d - t.r > r || d + t.r < rin) return false;
      // vertical band (relative to arc center height)
      const yb = shape.y ?? [-0.5, 3];
      const y0 = c.y + yb[0] * scale, y1 = c.y + yb[1] * scale;
      const ty0 = t.h > 0 ? t.y : t.y - t.r, ty1 = t.h > 0 ? t.y + t.h : t.y + t.r;
      if (ty1 < y0 || ty0 > y1) return false;
      if (shape.angle < 360) {
        const facing = yaw + (shape.yaw ?? 0) * DEG;
        const ang = Math.atan2(dx, dz);
        const diff = Math.abs(wrapAngle(ang - facing));
        const tol = d > 1e-3 ? Math.asin(Math.min(1, t.r / d)) : Math.PI;
        if (diff > (shape.angle * DEG) / 2 + tol) return false;
      }
      if (out) {
        const k = d > 1e-3 ? Math.max(0, d - t.r) / d : 0;
        out.x = c.x + dx * k; out.z = c.z + dz * k; out.y = clamp(c.y + 1, ty0, ty1);
      }
      return true;
    }
    case 'box': {
      const c = localToWorld(origin, yaw, shape.c[0], shape.c[1], shape.c[2], tmpA, scale);
      const by = yaw + (shape.yaw ?? 0) * DEG;
      const s = Math.sin(by), co = Math.cos(by);
      const [lo, hi] = targetSegment(t);
      const hy = shape.half[1] * scale;
      const py = clamp(c.y, lo, hi);
      // target point in box local
      const dx = t.x - c.x, dz = t.z - c.z;
      const lx = dx * co - dz * s;
      const lz = dx * s + dz * co;
      const ly = py - c.y;
      const hx = shape.half[0] * scale, hz = shape.half[2] * scale;
      const qx = clamp(lx, -hx, hx), qy = clamp(ly, -hy, hy), qz = clamp(lz, -hz, hz);
      const ex = lx - qx, ey = ly - qy, ez = lz - qz;
      const hit = ex * ex + ey * ey + ez * ez <= t.r * t.r;
      if (hit && out) {
        out.x = c.x + (qx * co + qz * s);
        out.z = c.z + (-qx * s + qz * co);
        out.y = c.y + qy;
      }
      return hit;
    }
    case 'ring': {
      const c = shape.c ? localToWorld(origin, yaw, shape.c[0], shape.c[1], shape.c[2], tmpA, scale) : tmpA;
      if (!shape.c) {
        c.x = origin.x; c.y = origin.y; c.z = origin.z;
      }
      const r = (shape.r0 + (shape.r1 - shape.r0) * clamp(progress, 0, 1)) * scale;
      const w = (shape.width * scale) / 2;
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (Math.abs(d - r) > w + t.r) return false;
      const height = (shape.height ?? 0.9) * scale;
      const bottom = t.h > 0 ? t.y : t.y - t.r;
      if (bottom > c.y + height) return false; // jumped over the shockwave
      if (out) {
        const k = d > 1e-3 ? r / d : 0;
        out.x = c.x + (t.x - c.x) * k; out.z = c.z + (t.z - c.z) * k; out.y = c.y + 0.3;
      }
      return true;
    }
    case 'cylinder': {
      const c = localToWorld(origin, yaw, shape.c[0], shape.c[1], shape.c[2], tmpA, scale);
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d > shape.r * scale + t.r) return false;
      const ty0 = t.h > 0 ? t.y : t.y - t.r, ty1 = t.h > 0 ? t.y + t.h : t.y + t.r;
      if (ty1 < c.y || ty0 > c.y + shape.h * scale) return false;
      if (out) {
        out.x = t.x; out.z = t.z; out.y = clamp(t.y + 1, c.y, c.y + shape.h * scale);
      }
      return true;
    }
  }
}

function contactBetween(c: Vec3, t: TargetVol, out: Vec3): void {
  const [lo, hi] = targetSegment(t);
  tmpC.x = t.x; tmpC.y = clamp(c.y, lo, hi); tmpC.z = t.z;
  out.x = (c.x + tmpC.x) / 2;
  out.y = (c.y + tmpC.y) / 2;
  out.z = (c.z + tmpC.z) / 2;
}

/** Rough world-space reach of a shape (used by AI range checks and aim assist). */
export function shapeReach(shape: ShapeDef): number {
  switch (shape.type) {
    case 'sphere': return Math.hypot(shape.c[0], shape.c[2]) + shape.r;
    case 'capsule': return Math.max(Math.hypot(shape.a[0], shape.a[2]), Math.hypot(shape.b[0], shape.b[2])) + shape.r;
    case 'arc': return shape.r + (shape.c ? Math.hypot(shape.c[0], shape.c[2]) : 0);
    case 'box': return Math.hypot(shape.c[0], shape.c[2]) + Math.hypot(shape.half[0], shape.half[2]);
    case 'ring': return shape.r1 + shape.width / 2;
    case 'cylinder': return Math.hypot(shape.c[0], shape.c[2]) + shape.r;
  }
}

/** Scale a shape uniformly (returns a new object). */
export function scaleShape(shape: ShapeDef, k: number): ShapeDef {
  const sv = (v: [number, number, number]): [number, number, number] => [v[0] * k, v[1] * k, v[2] * k];
  switch (shape.type) {
    case 'sphere': return { ...shape, c: sv(shape.c), r: shape.r * k };
    case 'capsule': return { ...shape, a: sv(shape.a), b: sv(shape.b), r: shape.r * k };
    case 'arc': return { ...shape, r: shape.r * k, r_in: shape.r_in !== undefined ? shape.r_in * k : undefined, c: shape.c ? sv(shape.c) : undefined, y: shape.y ? [shape.y[0] * k, shape.y[1] * k] : undefined };
    case 'box': return { ...shape, c: sv(shape.c), half: sv(shape.half) };
    case 'ring': return { ...shape, r0: shape.r0 * k, r1: shape.r1 * k, width: shape.width * k, height: shape.height !== undefined ? shape.height * k : undefined, c: shape.c ? sv(shape.c) : undefined };
    case 'cylinder': return { ...shape, c: sv(shape.c), r: shape.r * k, h: shape.h * k };
  }
}
