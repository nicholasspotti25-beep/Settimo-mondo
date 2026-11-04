/**
 * castle_gate: the outside of a pale-stone castle, front facing local +Z, ground at y = 0. Curtain walls with
 * battlements and arrow slits, a gatehouse with a huge pointed gate (archivolts, raised portcullis, dim violet light
 * deep in the passage, the broken-crown emblem and a stone guardian in a niche above), round flanking and corner
 * towers with slate cones, and behind it the keep: a great hall with tall windows glowing violet, a donjon and
 * slender spires; optionally a rocky crag under everything so the castle stands on its mountain over the void.
 *
 * params: width (100), height (24), gateWidth (9), keep (true), crag (true), style ('pale'), seed.
 * Sim colliders are authored in the zone data (walls/towers), see docs/WORLD_KIT.md.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { zoneEnv } from '../../render/world/env';
import { blob, box, cone, cyl, disposeTree, mat4, plane } from '../../render/world/geo';
import { DARK, IRON, Parts, R, SLATE, archBand, bool, extrudeWall, groundLocal, num, statue, styleColor, wallShape, type Col } from './_kit';

const VIOLET = '#3c2e5c';

export default function build(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const env = zoneEnv(zone, ctx);
  const Wd = num(def, 'width', 100), H = num(def, 'height', 24), gw = num(def, 'gateWidth', 9);
  const col = styleColor(def.params?.style);
  const seed = num(def, 'seed', 41);
  const r = new R(seed);
  const p = new Parts(seed);
  const low = ctx.quality === 'low';
  let base = 0;
  for (let x = -Wd / 2; x <= Wd / 2; x += 6) base = Math.min(base, groundLocal(env, def, x, 0), groundLocal(env, def, x, 6));
  base -= 4;

  const merlons = (x0: number, x1: number, y: number, z: number, d = 0.9) => {
    for (let x = x0 + 0.9; x < x1 - 0.5; x += 2.3) p.add(box(1.35, 1.5, d), 'matte', { color: col, cover: 0.8 }, mat4([x, y + 0.75, z]));
  };

  // ---- curtain walls -------------------------------------------------------------------------------------------
  const gh = 14; // half width of the gatehouse
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -Wd / 2 : gh, x1 = s < 0 ? -gh : Wd / 2;
    const len = x1 - x0, cx = (x0 + x1) / 2;
    p.add(box(len, H - base, 5), 'matte', { color: col, cover: 0.45, aoBottom: 0.55, jitter: 0.05 }, mat4([cx, (H + base) / 2, 0]));
    p.add(box(len, 3 - base, 7.4), 'matte', { color: DARK, cover: 0.8, aoBottom: 0.5 }, mat4([cx, (3 + base) / 2, 0.2]));
    p.add(box(len, 0.5, 5.6), 'matte', { color: col, cover: 0.6 }, mat4([cx, H - 0.1, 0]));
    merlons(x0, x1, H, 2.1);
    if (!low) merlons(x0, x1, H, -2.1, 0.7);
    for (let x = x0 + 5; x < x1 - 3; x += 7) p.add(box(0.42, 2.4, 0.2), 'matte', { color: ['#141218', '#221e26'], cover: 0 }, mat4([x, H * 0.62, 2.55]));
  }

  // ---- gatehouse ------------------------------------------------------------------------------------------------
  const GH = H * 1.35;
  const gateH = gw * 1.5;
  const front = 6;
  p.add(extrudeWall(wallShape(gh * 2, GH, [{ x: 0, w: gw, h: gateH, sill: 0, pointed: true }]), 12), 'matte', { color: col, cover: 0.4, aoBottom: 0.55 }, mat4([0, 0, 0]));
  if (base < 0) p.add(box(gh * 2, -base, 12), 'matte', { color: DARK, cover: 0.8 }, mat4([0, base / 2, 0]));
  p.add(archBand(gw, gw * 0.75, 1.0, 1.2, true), 'matte', { color: col, cover: 0.3 }, mat4([0, gateH - gw * 0.75, front + 0.4]));
  p.add(archBand(gw + 2.4, gw * 0.75 + 1.2, 0.5, 0.8, true), 'matte', { color: DARK, cover: 0.5 }, mat4([0, gateH - gw * 0.75, front + 0.6]));
  p.add(box(gw + 3, 0.35, 14), 'matte', { color: DARK, cover: 0.2 }, mat4([0, 0.02, 0.5]));
  // light deep in the passage (the castle's halls) + inner door frame
  p.add(plane(gw, gateH), 'glow', { color: VIOLET }, mat4([0, gateH / 2, -5.6]));
  // raised portcullis teeth
  for (let x = -gw / 2 + 0.5; x < gw / 2; x += 0.75) {
    p.add(box(0.16, 2.2, 0.16), 'metal', { color: IRON, cover: 0 }, mat4([x, gateH - gw * 0.75 - 0.4, 3.6]));
    p.add(cone(0.1, 0.35, 4), 'metal', { color: IRON, cover: 0 }, mat4([x, gateH - gw * 0.75 - 1.85, 3.6], [Math.PI, 0, 0]));
  }
  p.add(box(gw, 0.2, 0.2), 'metal', { color: IRON, cover: 0 }, mat4([0, gateH - gw * 0.75 - 1.0, 3.6]));
  // the broken crown emblem and the guardian of the gate in his niche
  const ey = gateH + 1.4;
  p.add(box(4.2, 0.8, 0.7), 'matte', { color: col, cover: 0.3 }, mat4([0, ey, front + 0.35]));
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.95;
    const h = i === 3 ? 0.45 : i === 2 ? 1.5 : 1.05;
    p.add(cone(0.34, h, 4), 'matte', { color: col, cover: 0.3 }, mat4([x, ey + 0.4, front + 0.35], [0, Math.PI / 4, i === 3 ? 0.5 : 0]));
  }
  p.add(box(3.6, 6.4, 0.6), 'matte', { color: ['#1c1a22', '#2c2832'], cover: 0 }, mat4([0, ey + 4.8, front + 0.05]));
  p.add(archBand(3.0, 1.6, 0.4, 0.8, true), 'matte', { color: col, cover: 0.4 }, mat4([0, ey + 6.6, front + 0.3]));
  const sp = new Parts(seed + 5);
  statue(sp, mat4([0, ey + 1.6, front - 0.3], [0, 0, 0], 1.15), r, { pose: 'spear', broken: 0.15, col, plinth: 0.4 });
  p.merge(sp);
  // machicolations + parapet
  for (let x = -gh + 0.8; x < gh; x += 1.7) p.add(box(0.7, 1.4, 1.3), 'matte', { color: col, cover: 0.6 }, mat4([x, GH - 1.9, front + 0.5]));
  p.add(box(gh * 2 + 0.6, 2.2, 1.2), 'matte', { color: col, cover: 0.6 }, mat4([0, GH - 0.1, front + 0.6]));
  merlons(-gh, gh, GH + 1, front + 0.7);

  // ---- towers ---------------------------------------------------------------------------------------------------
  const tower = (x: number, z: number, rad: number, h: number, roofH: number, rc: Col = SLATE) => {
    const seg = low ? 10 : 16;
    p.add(cyl(rad, rad * 1.04, h - base, seg), 'matte', { color: col, cover: 0.45, aoBottom: 0.55, jitter: 0.05 }, mat4([x, base, z]));
    p.add(cyl(rad * 1.04, rad * 1.22, 7, seg), 'matte', { color: DARK, cover: 0.8 }, mat4([x, -3, z]));
    p.add(cyl(rad * 1.14, rad * 1.04, 2.2, seg), 'matte', { color: col, cover: 0.6 }, mat4([x, h - 0.4, z]));
    p.add(cyl(rad * 1.16, rad * 1.16, 1.6, seg), 'matte', { color: col, cover: 0.5 }, mat4([x, h + 1.8, z]));
    p.add(cone(rad * 1.3, roofH, seg), 'gloss', { color: rc, cover: 0.3 }, mat4([x, h + 3.2, z]));
    p.add(cyl(0.12, 0.12, 3, 5), 'metal', { color: IRON, cover: 0 }, mat4([x, h + 3.2 + roofH - 0.3, z]));
    // slit windows facing outwards / forwards
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.7 + (x < 0 ? -0.2 : 0.2);
      const y = h * (0.45 + k * 0.17);
      p.add(box(0.5, 2.4, 0.4), 'glow', { color: k === 2 ? VIOLET : '#16141c' }, mat4([x + Math.sin(a) * rad, y, z + Math.cos(a) * rad], [0, a, 0]));
    }
  };
  tower(-gh - 4.5, 1.5, 6.5, H * 1.75, 15);
  tower(gh + 4.5, 1.5, 6.5, H * 1.75, 15);
  tower(-Wd / 2, 0, 5, H * 1.45, 12);
  tower(Wd / 2, 0, 5, H * 1.45, 12);

  // ---- the keep ---------------------------------------------------------------------------------------------------
  if (bool(def, 'keep', true)) {
    const KH = H * 2.0, kz = -34, kd = 26, kw = 56;
    p.add(box(kw, KH - base, kd), 'matte', { color: col, cover: 0.35, aoBottom: 0.6 }, mat4([0, (KH + base) / 2, kz]));
    const ops = [] as { x: number; w: number; h: number; sill: number; pointed: boolean }[];
    for (let i = 0; i < 5; i++) ops.push({ x: (i - 2) * 10, w: 5.2, h: H * 1.05, sill: H * 0.75, pointed: true });
    p.add(extrudeWall(wallShape(kw, KH, ops), 2.4), 'matte', { color: col, cover: 0.35 }, mat4([0, 0, kz + kd / 2 + 1.2]));
    for (const o of ops) {
      p.add(plane(o.w, o.h), 'glow', { color: VIOLET }, mat4([o.x, o.sill + o.h / 2, kz + kd / 2 + 0.05]));
      p.add(box(0.3, o.h * 0.7, 0.4), 'matte', { color: col, cover: 0 }, mat4([o.x, o.sill + o.h * 0.35, kz + kd / 2 + 1.2]));
    }
    // pitched slate roof
    const rr = kd / 2 + 1.5, ra = 0.62;
    for (const s of [-1, 1]) p.add(box(kw + 2, 0.8, rr / Math.cos(ra)), 'gloss', { color: SLATE, cover: 0.4 }, mat4([0, KH + Math.tan(ra) * rr / 2, kz + s * rr / 2], [s * ra, 0, 0]));
    p.add(box(kw - 2, Math.tan(ra) * rr * 0.98, 0.8), 'matte', { color: col, cover: 0.3 }, mat4([kw / 2 - 1, KH + Math.tan(ra) * rr * 0.49, kz], [0, Math.PI / 2, 0], [1, 1, 1]));
    tower(0, -56, 9, H * 3.3, 26);
    tower(-24, -26, 4.2, H * 2.6, 20);
    tower(24, -26, 4.2, H * 2.75, 20);
    tower(-17, -60, 3.6, H * 2.9, 18);
    tower(19, -62, 3.4, H * 2.4, 16);
    // wings joining the gatehouse to the keep
    for (const s of [-1, 1]) p.add(box(12, H * 1.2 - base, 26), 'matte', { color: col, cover: 0.4 }, mat4([s * 22, (H * 1.2 + base) / 2, -13]));
  }

  // ---- crag: the mountain under the castle -----------------------------------------------------------------------
  if (bool(def, 'crag', true)) {
    const rock: Col = ['#2e2a30', '#5e5864'];
    for (let i = 0; i < (low ? 10 : 18); i++) {
      const x = r.range(-Wd * 0.6, Wd * 0.6), z = r.range(-80, -6);
      const rad = r.range(16, 30), sy = r.range(1.1, 1.8);
      p.add(blob(rad, 1, 0.32, r.int(1, 999)), 'matte', { color: rock, cover: 0.5, aoBottom: 0.4 }, mat4([x, base - rad * sy * 1.05, z - rad * 0.5], [0, r.range(0, 6), 0], [1, sy, 1]));
    }
    for (let i = 0; i < (low ? 5 : 10); i++) {
      const a = r.range(-Math.PI * 0.95, -Math.PI * 0.05);
      const d = r.range(50, 90);
      const h = r.range(40, 110);
      p.add(blob(r.range(10, 16), 1, 0.3, r.int(1, 999)), 'matte', { color: rock, cover: 0.6 }, mat4([Math.cos(a) * d, base - 6 - h * 0.85, Math.sin(a) * d - 30], [0, r.range(0, 6), 0], [1, h / 22, 1]));
    }
  }

  const group = p.build({ matte: { detail: 0.45, breakup: 0.3, rim: 0.3 } }, !low);
  group.name = 'castle_gate';
  return { object: group, dispose: () => disposeTree(group) };
}
