/**
 * castle_hall: a pale-stone castle interior (hall / corridor) along local +Z, floor at y = 0: long walls with huge
 * pointed windows (tracery, sills), engaged piers and outer buttresses per bay, transverse vault ribs and a pointed
 * vault (whole, broken open in places, or roofless), end walls with a great doorway and a rose window, an optional
 * nave arcade of columns, a paved floor with a processional runner, fallen stones along the walls, and live light
 * shafts through every window that faces the key light (violet at night).
 *
 * params: length (40), width (14), height (16, wall height), bays (length/8), roof ('broken' | 'vault' | 'open'),
 * endN / endS ('door' | 'open' | 'wall' | 'rose'), doorWidth (width*0.45), windows ('both' | 'west' | 'east' | 'none'),
 * doorE / doorW (bay index of a side doorway, -1 none), sideDoorWidth (bay*0.62), aisles (false), aisleX (width*0.28),
 * tiles (true), shafts (true), debris (true), style ('pale'), seed.
 * Colliders are NOT created here: walkable bounds stay inside width/2 - 1.6 (piers), aisle columns need cylinders r 1.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { blob, box, disposeTree, mat4 } from '../../render/world/geo';
import { DARK, LightShafts, Parts, R, archBand, bool, column, num, str, styleColor, wallShape, extrudeWall, type WallOpening } from './_kit';

export default function build(def: LandmarkDef, _zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const L = num(def, 'length', 40), W = num(def, 'width', 14), H = num(def, 'height', 16);
  const bays = Math.max(1, Math.round(num(def, 'bays', Math.round(L / 8))));
  const bl = L / bays;
  const roof = str(def, 'roof', 'broken');
  const endN = str(def, 'endN', 'door'), endS = str(def, 'endS', 'door');
  const doorWidth = num(def, 'doorWidth', W * 0.45);
  const windows = str(def, 'windows', 'both');
  const doorE = num(def, 'doorE', -1), doorW = num(def, 'doorW', -1);
  const sideDoorW = num(def, 'sideDoorWidth', bl * 0.62);
  const aisles = bool(def, 'aisles', false);
  const aisleX = num(def, 'aisleX', W * 0.28);
  const col = styleColor(def.params?.style);
  const seed = num(def, 'seed', 17);
  const r = new R(seed);
  const p = new Parts(seed + 3);
  const shafts = bool(def, 'shafts', true) ? new LightShafts() : null;
  const low = ctx.quality === 'low';
  const t = 1.4;
  const rise = W * 0.42;
  const I = new THREE.Matrix4();
  const ow = Math.min(bl * 0.56, H * 0.36), oh = H * 0.6, sill = H * 0.2;

  // ---- side walls ------------------------------------------------------------------------------------------------
  for (const side of [-1, 1]) {
    const isEast = side > 0;
    const hasWin = windows === 'both' || (windows === 'east' && isEast) || (windows === 'west' && !isEast);
    const doorBay = isEast ? doorE : doorW;
    const ops: WallOpening[] = [];
    for (let i = 0; i < bays; i++) {
      const z = -L / 2 + (i + 0.5) * bl;
      if (i === doorBay) ops.push({ x: z, w: sideDoorW, h: Math.min(H * 0.72, sideDoorW * 1.9), sill: 0, pointed: true });
      else if (hasWin) {
        ops.push({ x: z, w: ow, h: oh, sill, pointed: true });
        if (H > 11) ops.push({ x: z, w: ow * 0.42, h: 0, sill: H * 0.9, round: true });
      }
    }
    const x = side * (W / 2);
    p.add(extrudeWall(wallShape(L, H, ops), t), 'matte', { color: col, cover: 0.35, aoBottom: 0.6, jitter: 0.05 }, mat4([x, 0, 0], [0, -Math.PI / 2, 0]));
    // plinth course + string course
    p.add(box(t + 0.5, 0.7, L), 'matte', { color: DARK, cover: 0.5 }, mat4([x - side * 0.1, 0.35, 0]));
    p.add(box(t + 0.35, 0.3, L), 'matte', { color: col, cover: 0.2 }, mat4([x, sill - 0.25, 0]));
    p.add(box(t + 0.5, 0.45, L), 'matte', { color: col, cover: 0.2 }, mat4([x, H - 0.1, 0]));
    for (let i = 0; i < bays; i++) {
      if (i === doorBay || !hasWin) continue;
      const z = -L / 2 + (i + 0.5) * bl;
      // tracery: central mullion, two sub-arches' transom, the oculus ring left to the round hole above
      const spring = sill + oh - ow * 0.75;
      p.add(box(0.22, spring - sill + ow * 0.35, 0.34), 'matte', { color: col, cover: 0.2 }, mat4([x, sill + (spring - sill + ow * 0.35) / 2, z], [0, Math.PI / 2, 0]));
      p.add(box(0.2, 0.2, ow), 'matte', { color: col, cover: 0.2 }, mat4([x, sill + (spring - sill) * 0.62, z]));
      p.add(box(t + 0.7, 0.28, ow + 0.6), 'matte', { color: col, cover: 0.6 }, mat4([x, sill - 0.05, z]));
      if (shafts) {
        const inner = x - side * (t / 2);
        shafts.add(new THREE.Vector3(inner, sill + oh * 0.46, z), new THREE.Vector3(0, 0, ow * 0.44), new THREE.Vector3(0, oh * 0.44, 0), new THREE.Vector3(-side, 0, 0), r.range(0, 9));
      }
    }
    // piers inside, buttresses outside
    for (let i = 0; i <= bays; i++) {
      const z = -L / 2 + i * bl;
      if (!low || i % 2 === 0) column(p, I, x - side * (t / 2), 0, z, H, 0.55, col, r, 0, low ? 8 : 12);
      p.add(box(1.7, H * 0.86, 1.3), 'matte', { color: col, cover: 0.5, aoBottom: 0.6 }, mat4([x + side * (t / 2 + 0.85), H * 0.43, z]));
      p.add(box(1.2, 2.2, 1.0), 'matte', { color: col, cover: 0.8 }, mat4([x + side * (t / 2 + 0.6), H * 0.86 + 0.6, z], [0, 0, side * 0.6]));
    }
  }

  // ---- end walls -------------------------------------------------------------------------------------------------
  const gable = (x: number) => H + rise * Math.max(0, 1 - Math.abs(x) / (W / 2)) + 0.8;
  for (const [end, zEnd] of [[endN, L / 2], [endS, -L / 2]] as const) {
    if (end === 'open') continue;
    const ops: WallOpening[] = [];
    if (end === 'door') ops.push({ x: 0, w: doorWidth, h: Math.min(H * 0.82, doorWidth * 1.6), sill: 0, pointed: true });
    if (end === 'wall') ops.push({ x: 0, w: Math.min(W * 0.32, 5), h: H * 0.66, sill: H * 0.22, pointed: true });
    if (H > 10 && (end === 'rose' || W > 12)) ops.push({ x: 0, w: Math.min(W * 0.34, (H + rise) * 0.3), h: 0, sill: Math.max(H * 0.86, (end === 'door' ? Math.min(H * 0.82, doorWidth * 1.6) : 0) + W * 0.2 + 1.2), round: true });
    p.add(extrudeWall(wallShape(W + t, H + rise + 1, ops, gable), t), 'matte', { color: col, cover: 0.35, aoBottom: 0.6 }, mat4([0, 0, zEnd]));
    if (end === 'door') {
      const dh = Math.min(H * 0.82, doorWidth * 1.6);
      const dr = doorWidth * 0.75;
      p.add(archBand(doorWidth, dr, 0.55, t + 0.5, true), 'matte', { color: col, cover: 0.3 }, mat4([0, dh - dr, zEnd]));
      p.add(box(doorWidth + 1.4, 0.3, t + 1.2), 'matte', { color: DARK, cover: 0.3 }, mat4([0, 0.04, zEnd]));
    }
    if (shafts && ops.some((o) => o.round)) {
      const o = ops.find((q) => q.round)!;
      const zi = zEnd - Math.sign(zEnd) * (t / 2);
      shafts.add(new THREE.Vector3(0, o.sill, zi), new THREE.Vector3(o.w * 0.34, 0, 0), new THREE.Vector3(0, o.w * 0.34, 0), new THREE.Vector3(0, 0, -Math.sign(zEnd)), r.range(0, 9));
    }
  }

  // ---- vault: transverse ribs + pointed vault slabs (broken open in places) --------------------------------------
  const span = W - t;
  const slabLen = Math.hypot(span / 2, rise) + 0.3;
  const slabAng = Math.atan2(rise, span / 2);
  for (let i = 0; i <= bays; i++) {
    const z = -L / 2 + i * bl;
    if (roof === 'open' && i % 2 === 1) continue;
    p.add(archBand(span, rise, 0.62, 0.8, true), 'matte', { color: col, cover: 0.3 }, mat4([0, H, z]));
  }
  if (roof !== 'open') {
    for (let i = 0; i < bays; i++) {
      const z = -L / 2 + (i + 0.5) * bl;
      const broken = roof === 'broken' && (i % 3 === 1 || r.next() < 0.18);
      for (const s of [-1, 1]) {
        if (broken && (s > 0 || r.next() < 0.6)) {
          // a jagged stub of the vault where it fell
          p.add(box(slabLen * 0.32, 0.55, bl * r.range(0.4, 0.8)), 'matte', { color: col, cover: 1 }, mat4([s * (span / 2 - slabLen * 0.14 * Math.cos(slabAng)), H + slabLen * 0.14 * Math.sin(slabAng) + 0.2, z + r.range(-0.6, 0.6)], [0, 0, -s * slabAng]));
          continue;
        }
        p.add(box(slabLen, 0.55, bl + 0.05), 'matte', { color: col, cover: 0.2, aoBottom: 0.85 }, mat4([s * (span / 4), H + rise / 2 + 0.25, z], [0, 0, -s * slabAng]));
      }
      if (broken && shafts) {
        shafts.add(new THREE.Vector3(span * 0.15, H + rise * 0.6, z), new THREE.Vector3(span * 0.22, 0, 0), new THREE.Vector3(0, 0, bl * 0.34), new THREE.Vector3(0, -1, 0), r.range(0, 9));
      }
      if (broken && bool(def, 'debris', true)) {
        // fallen vault stones heaped against a wall, outside the walkable lane
        const sx = r.sign() * (W / 2 - 1.6);
        for (let k = 0; k < (low ? 3 : 6); k++) {
          p.add(blob(r.range(0.35, 0.9), 0, 0.3, r.int(1, 999), 0.5), 'matte', { color: col, cover: 1, aoBottom: 0.5 }, mat4([sx + r.range(-0.5, 0.6) * Math.sign(-sx), 0.2, z + r.range(-bl * 0.35, bl * 0.35)], [r.range(0, 3), r.range(0, 6), 0]));
        }
        p.add(box(1.5, 0.7, 0.9), 'matte', { color: col, cover: 1 }, mat4([sx, 0.32, z + r.range(-1, 1)], [0.1, r.range(0, 3), 0.05]));
      }
    }
  }

  // ---- nave arcade ------------------------------------------------------------------------------------------------
  if (aisles) {
    const ch = H * 0.6;
    for (const s of [-1, 1]) {
      for (let i = 1; i < bays; i++) column(p, I, s * aisleX, 0, -L / 2 + i * bl, ch, 0.75, col, r, 0, low ? 8 : 14);
      for (let i = 1; i < bays - 1; i++) {
        const z = -L / 2 + (i + 0.5) * bl;
        p.add(archBand(bl - 1.6, (bl - 1.6) * 0.62, 0.55, 1.1, true), 'matte', { color: col, cover: 0.3 }, mat4([s * aisleX, ch, z], [0, Math.PI / 2, 0]));
      }
      p.add(box(1.1, 0.5, L - bl * 2 + 1.6), 'matte', { color: col, cover: 0.3 }, mat4([s * aisleX, ch + (bl - 1.6) * 0.62 + 0.9, 0]));
    }
  }

  // ---- floor: slabs with a processional runner -------------------------------------------------------------------
  if (bool(def, 'tiles', true)) {
    const nx = Math.max(2, Math.round(W / 2)), nz = Math.max(2, Math.round(L / 2));
    const tw = W / nx, tl = L / nz;
    const runner: [string, string] = ['#6e6660', '#8a8078'];
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = -W / 2 + (ix + 0.5) * tw, z = -L / 2 + (iz + 0.5) * tl;
        const centre = Math.abs(x) < tw * 0.75;
        const tilt = r.next() < 0.05 ? 0.05 : 0.008;
        p.add(box(tw - 0.07, 0.2, tl - 0.07), 'matte', { color: centre ? runner : ((ix + iz) % 2 ? ['#a49c8e', '#b8b0a2'] : ['#958d80', '#aaa294']), cover: 0.25, jitter: 0.1 }, mat4([x, -0.07 + r.range(-0.012, 0.01), z], [r.range(-tilt, tilt), 0, r.range(-tilt, tilt)]));
      }
    }
  }

  const group = p.build({ matte: { detail: 0.55, breakup: 0.32, rim: 0.25 } }, !low);
  group.name = 'castle_hall';
  const sm = shafts?.finish(num(def, 'shaftStrength', 0.075));
  if (sm) group.add(sm);
  return {
    object: group,
    dispose() {
      shafts?.dispose();
      disposeTree(group);
    },
  };
}
