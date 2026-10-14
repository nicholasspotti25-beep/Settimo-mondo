/**
 * Deterministic terrain and prop placement shared by sim (collision, heights) and render (meshes, instancing).
 * Zone coordinates: x in [-w/2, w/2], z in [-d/2, d/2].
 */
import { Rng, hashString } from './rng';
import { clamp, fbm2, lerp, pointInPolygon, smoothstep } from './math';
import type { ArenaDef, ColliderDef, PropScatterDef, ZoneDef } from './types';

export interface ArenaShape {
  id: string;
  cx: number;
  cz: number;
  floor: number;
  shape: 'circle' | 'rect' | 'polygon';
  radius: number;
  hx: number;
  hz: number;
  yaw: number;
  poly: number[]; // world-space polygon (flat x,z pairs)
}

export function arenaShapeFrom(a: ArenaDef, override?: { radius?: number; half?: [number, number]; polygon?: number[]; floor_y?: number }): ArenaShape {
  const yaw = a.yaw ?? 0;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const polyLocal = override?.polygon ?? a.polygon ?? [];
  const poly: number[] = [];
  for (let i = 0; i < polyLocal.length; i += 2) {
    const lx = polyLocal[i], lz = polyLocal[i + 1];
    poly.push(a.center[0] + lx * c + lz * s, a.center[2] - lx * s + lz * c);
  }
  return {
    id: a.id,
    cx: a.center[0],
    cz: a.center[2],
    floor: override?.floor_y ?? a.floor_y,
    shape: a.shape,
    radius: override?.radius ?? a.radius ?? 20,
    hx: (override?.half ?? a.half ?? [20, 20])[0],
    hz: (override?.half ?? a.half ?? [20, 20])[1],
    yaw,
    poly,
  };
}

export function insideArena(a: ArenaShape, x: number, z: number, margin = 0): boolean {
  const dx = x - a.cx, dz = z - a.cz;
  if (a.shape === 'circle') return dx * dx + dz * dz <= (a.radius - margin) * (a.radius - margin);
  if (a.shape === 'rect') {
    const s = Math.sin(a.yaw), c = Math.cos(a.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) <= a.hx - margin && Math.abs(lz) <= a.hz - margin;
  }
  return pointInPolygon(x, z, a.poly);
}

/** Clamp a point into an arena (returns true if it was moved). Writes into out[0], out[1]. */
export function clampToArena(a: ArenaShape, x: number, z: number, margin: number, out: [number, number]): boolean {
  const dx = x - a.cx, dz = z - a.cz;
  if (a.shape === 'circle') {
    const r = Math.max(0.5, a.radius - margin);
    const d = Math.hypot(dx, dz);
    if (d <= r) {
      out[0] = x; out[1] = z;
      return false;
    }
    out[0] = a.cx + (dx / d) * r;
    out[1] = a.cz + (dz / d) * r;
    return true;
  }
  if (a.shape === 'rect') {
    const s = Math.sin(a.yaw), c = Math.cos(a.yaw);
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    const hx = Math.max(0.5, a.hx - margin), hz = Math.max(0.5, a.hz - margin);
    const moved = Math.abs(lx) > hx || Math.abs(lz) > hz;
    lx = clamp(lx, -hx, hx);
    lz = clamp(lz, -hz, hz);
    out[0] = a.cx + lx * c + lz * s;
    out[1] = a.cz - lx * s + lz * c;
    return moved;
  }
  if (pointInPolygon(x, z, a.poly)) {
    out[0] = x; out[1] = z;
    return false;
  }
  // project to nearest polygon edge, pushed inward by margin
  let best = Infinity, bx = x, bz = z;
  const p = a.poly;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], ex = p[i], ez = p[i + 1];
    const vx = ex - ax, vz = ez - az;
    const l2 = vx * vx + vz * vz || 1;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
    const qx = ax + vx * t, qz = az + vz * t;
    const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d2 < best) {
      best = d2; bx = qx; bz = qz;
    }
  }
  // push toward centroid by margin
  let cx = 0, cz = 0;
  for (let i = 0; i < p.length; i += 2) {
    cx += p[i]; cz += p[i + 1];
  }
  cx /= p.length / 2; cz /= p.length / 2;
  const dcx = cx - bx, dcz = cz - bz;
  const dl = Math.hypot(dcx, dcz) || 1;
  out[0] = bx + (dcx / dl) * (margin + 0.05);
  out[1] = bz + (dcz / dl) * (margin + 0.05);
  return true;
}

export class Terrain {
  readonly zone: ZoneDef;
  readonly arenas: ArenaShape[];
  readonly type: string;
  private bounds: number[] | null;
  private hw: number;
  private hd: number;

  constructor(zone: ZoneDef, arenas: ArenaDef[]) {
    this.zone = zone;
    this.arenas = arenas.map((a) => arenaShapeFrom(a));
    this.type = zone.terrain.type ?? 'heightfield';
    this.bounds = zone.bounds && zone.bounds.length >= 6 ? zone.bounds : null;
    this.hw = zone.size[0] / 2;
    this.hd = zone.size[1] / 2;
  }

  /** Distance on XZ to the main path polyline. */
  distToPath(x: number, z: number): number {
    const p = this.zone.path;
    let best = Infinity;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][2], bx = p[i + 1][0], bz = p[i + 1][2];
      const vx = bx - ax, vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
      const dx = x - (ax + vx * t), dz = z - (az + vz * t);
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Signed distance to the zone edge (positive inside). */
  edgeDistance(x: number, z: number): number {
    if (this.bounds) {
      const p = this.bounds;
      let best = Infinity;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const ax = p[j], az = p[j + 1], ex = p[i], ez = p[i + 1];
        const vx = ex - ax, vz = ez - az;
        const l2 = vx * vx + vz * vz || 1;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
        const dx = x - (ax + vx * t), dz = z - (az + vz * t);
        best = Math.min(best, Math.hypot(dx, dz));
      }
      return pointInPolygon(x, z, p) ? best : -best;
    }
    return Math.min(this.hw - Math.abs(x), this.hd - Math.abs(z));
  }

  inBounds(x: number, z: number, margin = 0): boolean {
    return this.edgeDistance(x, z) >= margin;
  }

  arenaAt(x: number, z: number): ArenaShape | null {
    for (const a of this.arenas) if (insideArena(a, x, z)) return a;
    return null;
  }

  /** Raw terrain height (no arena override). */
  rawHeight(x: number, z: number): number {
    const t = this.zone.terrain;
    let h = t.base;
    if (this.type === 'interior' || this.type === 'deck') {
      return this.applyFlats(x, z, h);
    }
    if (t.bumps) {
      for (const [bx, bz, bh, br] of t.bumps) {
        const dx = x - bx, dz = z - bz;
        const d2 = (dx * dx + dz * dz) / (br * br);
        if (d2 < 9) h += bh * Math.exp(-d2);
      }
    }
    if (t.noise) {
      let n = fbm2(x / t.noise.scale, z / t.noise.scale, t.noise.octaves ?? 4, t.noise.seed ?? 7) * t.noise.amp;
      if (t.path_flatten) {
        const d = this.distToPath(x, z);
        n *= lerp(0.15, 1, smoothstep(t.path_flatten * 0.4, t.path_flatten * 1.6, d));
      }
      h += n;
    }
    if (t.rim) {
      const e = this.edgeDistance(x, z);
      if (e < t.rim.width) {
        const k = 1 - Math.max(0, e) / t.rim.width;
        h += t.rim.height * k * k;
      }
    }
    return this.applyFlats(x, z, h);
  }

  private applyFlats(x: number, z: number, h: number): number {
    const flats = this.zone.terrain.flats;
    if (flats) {
      for (const [fx, fz, fr, fh, ff] of flats) {
        const d = Math.hypot(x - fx, z - fz);
        if (d <= fr) h = fh;
        else if (d < fr + ff) h = lerp(fh, h, smoothstep(fr, fr + ff, d));
      }
    }
    return h;
  }

  heightAt(x: number, z: number): number {
    for (const a of this.arenas) {
      if (insideArena(a, x, z)) return a.floor;
    }
    const h = this.rawHeight(x, z);
    // smooth skirt around arenas so the arena edge meets the terrain
    for (const a of this.arenas) {
      const dx = x - a.cx, dz = z - a.cz;
      const reach = (a.shape === 'circle' ? a.radius : Math.max(a.hx, a.hz)) + 8;
      const d = Math.hypot(dx, dz);
      if (d < reach) {
        const inner = reach - 8;
        const k = smoothstep(inner, reach, d);
        return lerp(a.floor, h, k);
      }
    }
    return h;
  }

  waterLevel(): number | null {
    return this.zone.water ? this.zone.water.level : this.zone.terrain.water_level ?? null;
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Prop scatter (deterministic: sim colliders and render instances agree)                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface PropInstance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  variant: number;
}

export function scatterProps(terrain: Terrain, prop: PropScatterDef, avoid: { x: number; z: number; r: number }[] = []): PropInstance[] {
  const zone = terrain.zone;
  const rng = new Rng(prop.seed ?? hashString(`${zone.id}:${prop.kind}:${prop.count}`));
  const area = prop.area ?? [-zone.size[0] / 2, -zone.size[1] / 2, zone.size[0] / 2, zone.size[1] / 2];
  const [s0, s1] = prop.scale ?? [0.8, 1.25];
  const out: PropInstance[] = [];
  const water = terrain.waterLevel();
  const kindIsWater = /reed|lily|lotus|stilt|lantern_float|soul_light|water/.test(prop.kind);
  let attempts = prop.count * 8;
  while (out.length < prop.count && attempts-- > 0) {
    const x = rng.range(area[0], area[2]);
    const z = rng.range(area[1], area[3]);
    const yaw = rng.range(-Math.PI, Math.PI);
    const scale = rng.range(s0, s1);
    const variant = rng.int(0, 7);
    if (!terrain.inBounds(x, z, 1)) continue;
    if (terrain.arenaAt(x, z)) continue;
    let bad = false;
    for (const a of terrain.arenas) {
      const r = (a.shape === 'circle' ? a.radius : Math.max(a.hx, a.hz)) + 3;
      if (Math.hypot(x - a.cx, z - a.cz) < r) {
        bad = true;
        break;
      }
    }
    if (bad) continue;
    if (prop.avoid_path !== undefined && terrain.distToPath(x, z) < prop.avoid_path) continue;
    for (const a of avoid) if (Math.hypot(x - a.x, z - a.z) < a.r) bad = true;
    if (bad) continue;
    const y = terrain.heightAt(x, z);
    if (water !== null && !kindIsWater && y < water + 0.05) continue;
    if (water !== null && kindIsWater && y > water + 0.4) continue;
    out.push({ x, y, z, yaw, scale, variant });
  }
  return out;
}

/** Collider radius per prop kind for scattered props with collide: true. */
export function propColliderRadius(kind: string, scale: number): number {
  if (/giant|yggdrasil|colossal/.test(kind)) return 3.2 * scale;
  if (/tree|trunk|pine|fir|oak|birch|log/.test(kind)) return 0.6 * scale;
  if (/rock|boulder|pillar|column|ruin|bone|crystal|stone|statue|anvil|tomb/.test(kind)) return 1.0 * scale;
  if (/mushroom|flower|clover|stem/.test(kind)) return 0.5 * scale;
  return 0.5 * scale;
}

export function propColliders(terrain: Terrain, avoid: { x: number; z: number; r: number }[]): ColliderDef[] {
  const out: ColliderDef[] = [];
  for (const p of terrain.zone.props) {
    if (!p.collide) continue;
    for (const inst of scatterProps(terrain, p, avoid)) {
      out.push({ type: 'cylinder', c: [inst.x, inst.y, inst.z], r: propColliderRadius(p.kind, inst.scale), h: 6 * inst.scale });
    }
  }
  return out;
}

/** Areas kept clear of props (altars, spawn, exits, vistas). */
export function altarAvoid(zone: ZoneDef, altarPositions: [number, number, number][] = []): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [{ x: zone.spawn[0], z: zone.spawn[2], r: 6 }];
  for (const e of zone.exits) out.push({ x: e.at[0], z: e.at[2], r: e.radius + 4 });
  for (const v of zone.vistas) out.push({ x: v.pos[0], z: v.pos[2], r: 5 });
  for (const a of altarPositions) out.push({ x: a[0], z: a[2], r: 6 });
  return out;
}
