/**
 * walkway: rotten plank walkway on stilts (swamps, flooded woods, river banks) along local Z from z = -length/2 to
 * +length/2, deck top at local y = `height` above pos.y. Uneven sagging boards with missing planks (`broken`), pairs of
 * leaning stilts every bay driven down into the ground / water bed, cross beams, a few fallen boards in the mud, an
 * optional hand rail of crooked posts and slack rope on one side, seeker lanterns hung from tall poles (`lanterns`), and
 * an optional square pier head at the far end (`platform`, e.g. the palude's deep-water pier).
 *
 * params: length 24, width 2.2, height 0.6, bend 0 (lateral S-curve amplitude in m), broken 0.25, rail 'left' |
 * 'right' | 'both' | 'none' (left), lanterns 2, platform 0 (side length of the pier head, 0 = none), seed. The sim walks
 * on the terrain: carve the path under it (or keep it as dressing); add colliders for stilts standing on a route.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { zoneEnv } from '../../render/world/env';
import { box, cyl, disposeTree, mat4 } from '../../render/world/geo';
import { GlowSet } from '../../render/world/glows';
import { ATMOS } from '../../render/world/atmosphere';
import { IRON, Parts, R, ROPE, ROT_WOOD, groundLocal, num, str } from './_kit';

const BOARD: [string, string] = ['#241d16', '#54452f'];

export default function build(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const env = zoneEnv(zone, ctx);
  const L = num(def, 'length', 24), W = num(def, 'width', 2.2), H = num(def, 'height', 0.6);
  const bend = num(def, 'bend', 0);
  const broken = num(def, 'broken', 0.25);
  const rail = str(def, 'rail', 'left');
  const nLamps = Math.round(num(def, 'lanterns', 2));
  const plat = num(def, 'platform', 0);
  const seed = num(def, 'seed', 47);
  const low = ctx.quality === 'low';
  const r = new R(seed);
  const p = new Parts(seed);
  const glows = new GlowSet('walkway-glows');
  const lamps: number[] = [];
  const g = (x: number, z: number) => groundLocal(env, def, x, z);
  // centreline offset and heading along the walk (gentle S-curve)
  const cx = (z: number) => bend * Math.sin(((z + L / 2) / L) * Math.PI * 2);
  const head = (z: number) => Math.atan((bend * Math.PI * 2 * Math.cos(((z + L / 2) / L) * Math.PI * 2)) / L);
  // deck sag between stilts
  const bay = 2.0;
  const sag = (z: number) => -0.06 * Math.sin((((z + L / 2) % bay) / bay) * Math.PI) - 0.04 * Math.sin(z * 0.7 + seed);

  // stilts + cross beams
  const nb = Math.max(2, Math.round(L / bay));
  for (let i = 0; i <= nb; i++) {
    const z = -L / 2 + (i * L) / nb;
    const x0 = cx(z), a = head(z);
    for (const s of [-1, 1]) {
      const lx = x0 + Math.cos(a) * s * (W / 2 - 0.15), lz = z - Math.sin(a) * s * (W / 2 - 0.15);
      const gl = g(lx, lz) - 0.9;
      const top = H - 0.12;
      const lean = r.range(-0.08, 0.08);
      if (top - gl > 0.2) p.add(cyl(0.09, 0.12, top - gl, 5), 'matte', { color: ROT_WOOD, cover: 0.6, aoBottom: 0.9, jitter: 0.12 }, mat4([lx, (top + gl) / 2, lz], [lean, 0, s * r.range(0, 0.07)]));
    }
    p.add(box(W + 0.25, 0.14, 0.18), 'matte', { color: ROT_WOOD, cover: 0.5 }, mat4([x0, H - 0.17 + sag(z) * 0.5, z], [0, a, r.range(-0.03, 0.03)]));
  }
  // runners under the boards
  const nRun = Math.round(L / 1.0);
  for (let k = 0; k < nRun; k++) {
    const z0 = -L / 2 + (k * L) / nRun, zm = z0 + L / nRun / 2;
    for (const s of [-1, 1]) p.add(box(0.12, 0.12, L / nRun + 0.02), 'matte', { color: ROT_WOOD, cover: 0.3 }, mat4([cx(zm) + s * (W / 2 - 0.35), H - 0.1 + sag(zm), zm], [0, head(zm), 0]));
  }
  // boards (some missing, some cracked short, a few fallen in the mud beside)
  const pn = Math.round(L / (low ? 0.42 : 0.24));
  for (let k = 0; k < pn; k++) {
    const z = -L / 2 + ((k + 0.5) * L) / pn;
    const lost = r.next() < broken * 0.45;
    if (lost) {
      if (r.next() < 0.3) {
        const s = r.sign();
        const fx = cx(z) + s * (W / 2 + r.range(0.4, 1.6));
        p.add(box(W * r.range(0.5, 0.9), 0.06, 0.2), 'matte', { color: BOARD, cover: 0.8, jitter: 0.2 }, mat4([fx, g(fx, z) + 0.02, z], [r.range(-0.2, 0.2), r.range(0, 6), r.range(-0.2, 0.2)]));
      }
      continue;
    }
    const short = r.next() < broken * 0.3 ? r.range(0.45, 0.75) : 1;
    const off = short < 1 ? r.sign() * (1 - short) * W * 0.5 : 0;
    p.add(box(W * short - r.range(0, 0.15), 0.055, (L / pn) * 0.86), 'matte', { color: BOARD, cover: 0.45, jitter: 0.22 }, mat4([cx(z) + off, H + sag(z) + r.range(-0.012, 0.01), z], [r.range(-0.015, 0.015), head(z) + r.range(-0.04, 0.04), r.range(-0.03, 0.03)]));
  }
  // hand rail: crooked posts + slack rope
  const sides = rail === 'both' ? [-1, 1] : rail === 'right' ? [1] : rail === 'none' ? [] : [-1];
  for (const s of sides) {
    for (let i = 0; i <= nb; i += 1) {
      if (r.next() < broken * 0.35 && i > 0 && i < nb) continue;
      const z = -L / 2 + (i * L) / nb;
      const x = cx(z) + s * (W / 2 - 0.05);
      p.add(cyl(0.05, 0.07, 1.25, 5), 'matte', { color: ROT_WOOD, cover: 0.5 }, mat4([x, H + 0.5, z], [r.range(-0.1, 0.1), 0, s * r.range(0.02, 0.14)]));
      if (i < nb && !low) {
        const zm = z + L / nb / 2;
        p.add(cyl(0.022, 0.022, L / nb, 4), 'matte', { color: ROPE, cover: 0 }, mat4([cx(zm) + s * (W / 2 - 0.02), H + 0.82, zm], [Math.PI / 2 + r.range(0.05, 0.14), 0, 0]));
      }
    }
  }
  // pier head
  if (plat > 0) {
    const z0 = L / 2, x0 = cx(L / 2);
    const n = Math.round(plat / (low ? 0.42 : 0.26));
    for (let k = 0; k < n; k++) {
      if (r.next() < broken * 0.3) continue;
      const z = z0 + ((k + 0.5) * plat) / n;
      p.add(box(plat - r.range(0, 0.2), 0.06, (plat / n) * 0.86), 'matte', { color: BOARD, cover: 0.45, jitter: 0.22 }, mat4([x0, H + r.range(-0.02, 0.01), z], [r.range(-0.012, 0.012), r.range(-0.02, 0.02), r.range(-0.02, 0.02)]));
    }
    for (const sx of [-1, 1]) for (const sz of [0, 0.5, 1]) {
      const x = x0 + sx * (plat / 2 - 0.2), z = z0 + sz * plat;
      const gl = g(x, z) - 1;
      p.add(cyl(0.13, 0.16, H + 0.5 - gl, 5), 'matte', { color: ROT_WOOD, cover: 0.6, aoBottom: 0.9 }, mat4([x, (H + 0.5 + gl) / 2, z], [r.range(-0.05, 0.05), 0, r.range(-0.05, 0.05)]));
    }
  }
  // seeker lanterns on tall poles beside the walk
  for (let i = 0; i < nLamps; i++) {
    const z = -L / 2 + ((i + 0.5) * L) / nLamps + r.range(-1, 1);
    const s = i % 2 ? 1 : -1;
    const x = cx(z) + s * (W / 2 + 0.25);
    const base = g(x, z) - 0.6;
    const top = H + 2.6;
    p.add(cyl(0.06, 0.09, top - base, 5), 'matte', { color: ROT_WOOD, cover: 0.4 }, mat4([x, (top + base) / 2, z], [0, 0, s * 0.05]));
    p.add(box(0.06, 0.06, 0.6), 'matte', { color: ROT_WOOD }, mat4([x - s * 0.02, top - 0.05, z + 0.28]));
    p.add(cyl(0.11, 0.13, 0.28, 6), 'metal', { color: IRON }, mat4([x - s * 0.02, top - 0.38, z + 0.55]));
    lamps.push(glows.add({ pos: [x - s * 0.02, top - 0.38, z + 0.55], color: '#ffc27a', size: 1.5, intensity: 0.55, mode: 'flame', phase: r.range(0, 6), on: 0.6 }));
  }
  glows.finish();
  const mesh = p.build({ matte: { detail: 0.9, breakup: 0.45, rim: 0.25 } }, !low);
  const root = new THREE.Group();
  root.name = 'walkway';
  root.add(mesh, glows.mesh);
  return {
    object: root,
    update(_sim: Sim, dt: number) {
      const k = 0.4 + 0.6 * ATMOS.uNight.value;
      for (const i of lamps) glows.setOn(i, k);
      glows.update(dt);
    },
    dispose() {
      glows.dispose();
      disposeTree(root);
    },
  };
}
