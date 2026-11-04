/**
 * ruins: a cluster of what is left of an old building, settled on the terrain: wall fragments with jagged broken tops
 * (some with a window or doorway), standing and broken columns, fallen drums and capitals, a toppled lintel, rubble
 * and paving fragments. Everything is placed inside `radius` around the origin.
 *
 * params: radius (9), walls (3), columns (4), style ('pale' | 'stone' | 'dark' | 'marble' | 'black'), height (5),
 * seed. Solid fragments should get sim colliders (walls: boxes, columns: cylinders r 1) when they stand on a route.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { zoneEnv } from '../../render/world/env';
import { blob, box, cyl, disposeTree, mat4 } from '../../render/world/geo';
import { DARK, Parts, R, column, extrudeWall, groundLocal, num, styleColor, wallShape, type WallOpening } from './_kit';

export default function build(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const env = zoneEnv(zone, ctx);
  const rad = num(def, 'radius', 9), H = num(def, 'height', 5);
  const col = styleColor(def.params?.style);
  const seed = num(def, 'seed', 61);
  const r = new R(seed);
  const p = new Parts(seed);
  const low = ctx.quality === 'low';
  const I = new THREE.Matrix4();
  const g = (x: number, z: number) => groundLocal(env, def, x, z);

  // wall fragments around a rough rectangle footprint
  const nW = Math.round(num(def, 'walls', 3));
  const fw = rad * 1.2, fd = rad * 0.8;
  const sides: [number, number, number][] = [[0, fd / 2, 0], [fw / 2, 0, Math.PI / 2], [0, -fd / 2, Math.PI], [-fw / 2, 0, -Math.PI / 2]];
  for (let i = 0; i < nW; i++) {
    const [sx, sz, yaw] = sides[(i + r.int(0, 3)) % 4];
    const len = (yaw === 0 || yaw === Math.PI ? fw : fd) * r.range(0.45, 0.85);
    const off = r.range(-0.2, 0.2) * len;
    const h = H * r.range(0.6, 1.15);
    const ph = r.range(0, 6);
    const ops: WallOpening[] = [];
    const kind = r.next();
    if (kind < 0.35 && len > 3.5) ops.push({ x: r.range(-0.15, 0.15) * len, w: Math.min(1.6, len * 0.3), h: h * 0.42, sill: h * 0.35, pointed: r.next() < 0.5 });
    else if (kind < 0.6 && len > 4) ops.push({ x: r.range(-0.2, 0.2) * len, w: Math.min(2.4, len * 0.35), h: h * 0.62, sill: 0, pointed: false });
    const shape = wallShape(len, h, ops, (x) => h * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.9 + ph))) - Math.max(0, x / len + 0.5) * h * 0.35 * r.next());
    const cx = sx + Math.cos(yaw) * off, cz = sz - Math.sin(yaw) * off;
    const gy = Math.min(g(cx - Math.cos(yaw) * len / 2, cz + Math.sin(yaw) * len / 2), g(cx + Math.cos(yaw) * len / 2, cz - Math.sin(yaw) * len / 2), g(cx, cz)) - 0.5;
    const tilt = r.range(-0.03, 0.03);
    p.add(extrudeWall(shape, 0.9), 'matte', { color: col, cover: 0.9, aoBottom: 0.55, jitter: 0.08 }, mat4([cx, gy, cz], [tilt, yaw, 0]));
    p.add(box(len + 0.4, 0.8, 1.3), 'matte', { color: DARK, cover: 1 }, mat4([cx, gy + 0.3, cz], [0, yaw, 0]));
    // rubble at its foot
    for (let k = 0; k < (low ? 2 : 5); k++) {
      const t = r.range(-0.5, 0.5) * len, o = r.sign() * r.range(0.8, 1.8);
      const x = cx + Math.cos(yaw) * t + Math.sin(yaw) * o, z = cz - Math.sin(yaw) * t + Math.cos(yaw) * o;
      p.add(r.next() < 0.5 ? box(r.range(0.4, 0.9), r.range(0.3, 0.5), r.range(0.4, 0.7)) : blob(r.range(0.2, 0.5), 0, 0.3, r.int(1, 999), 0.4), 'matte', { color: col, cover: 1, aoBottom: 0.5 }, mat4([x, g(x, z) + 0.12, z], [r.range(-0.3, 0.3), r.range(0, 6), r.range(-0.3, 0.3)]));
    }
  }

  // columns: a row along the long axis, some broken, some fallen
  const nC = Math.round(num(def, 'columns', 4));
  for (let i = 0; i < nC; i++) {
    const x = (nC > 1 ? i / (nC - 1) - 0.5 : 0) * fw * 0.8, z = fd * 0.15 * (i % 2 ? 1 : -1) + r.range(-0.4, 0.4);
    const roll = r.next();
    const cr = r.range(0.45, 0.6);
    if (roll < 0.25) {
      // fallen drums in a line
      const yaw = r.range(0, Math.PI * 2);
      for (let k = 0; k < 3; k++) {
        const dx = Math.sin(yaw) * k * 1.5, dz = Math.cos(yaw) * k * 1.5;
        p.add(cyl(cr, cr, 1.35, low ? 8 : 12), 'matte', { color: col, cover: 1, aoBottom: 0.6 }, mat4([x + dx, g(x + dx, z + dz) + cr * 0.8, z + dz], [Math.PI / 2, yaw, r.range(-0.1, 0.1)]));
      }
      continue;
    }
    const by = g(x, z) - 0.15;
    column(p, I, x, by, z, H * r.range(0.9, 1.3), cr, col, r, roll < 0.7 ? r.range(0.25, 0.7) : 0, low ? 8 : 12);
  }
  // a toppled lintel and paving fragments
  const lx = r.range(-rad * 0.3, rad * 0.3), lz = r.range(-rad * 0.3, rad * 0.3);
  p.add(box(3.6, 0.7, 0.9), 'matte', { color: col, cover: 1, aoBottom: 0.6 }, mat4([lx, g(lx, lz) + 0.25, lz], [0.05, r.range(0, 6), 0.12]));
  for (let k = 0; k < (low ? 6 : 14); k++) {
    const a = r.range(0, Math.PI * 2), d = r.range(0, rad * 0.75);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    p.add(box(r.range(0.9, 1.6), 0.18, r.range(0.9, 1.6)), 'matte', { color: ['#7e776c', '#a39b8c'], cover: 0.9, jitter: 0.1 }, mat4([x, g(x, z) + 0.03, z], [r.range(-0.06, 0.06), r.range(0, 1.5), r.range(-0.06, 0.06)]));
  }
  const group = p.build({ matte: { detail: 0.8, breakup: 0.4, rim: 0.3 } }, !low);
  group.name = 'ruins';
  return { object: group, dispose: () => disposeTree(group) };
}
