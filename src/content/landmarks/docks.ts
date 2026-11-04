/**
 * docks: a river-port quay. A wooden wharf along local X (length) whose front edge faces local +Z (the water), deck top
 * at local y = 0, on a row of pilings driven into the bed; a stone quay wall behind it; a jetty running out over the
 * water (+Z) with mooring bollards, rope coils and a ladder down; crates, barrels and a stack of sacks; a timber derrick
 * crane with a hanging hook; lantern posts along the front (warm flames, brighter at night); an optional boat-house roof.
 *
 * params: length 30, depth 7, jetty 14 (0 = none), jettyX 0 (offset along X), crane true, lanterns 4, shed true,
 * style 'wood' | 'dark' (wood), seed. Colliders: none; add zone.colliders for the crane / shed if they stand on a route.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { zoneEnv } from '../../render/world/env';
import { box, cyl, disposeTree, lathe, mat4, torus } from '../../render/world/geo';
import { GlowSet } from '../../render/world/glows';
import { ATMOS } from '../../render/world/atmosphere';
import { DARK, IRON, Parts, R, ROPE, ROT_WOOD, STONE, WOOD, bool, groundLocal, num, str, type Col } from './_kit';

export default function build(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const env = zoneEnv(zone, ctx);
  const Lx = num(def, 'length', 30), D = num(def, 'depth', 7);
  const J = num(def, 'jetty', 14), jx = num(def, 'jettyX', 0);
  const seed = num(def, 'seed', 59);
  const dark = str(def, 'style', 'wood') === 'dark';
  const col: Col = dark ? ROT_WOOD : WOOD;
  const plank: Col = dark ? ['#1c1814', '#3c3226'] : ['#33271c', '#6a5440'];
  const low = ctx.quality === 'low';
  const r = new R(seed);
  const p = new Parts(seed);
  const glows = new GlowSet('docks-glows');
  const lamps: number[] = [];
  const g = (x: number, z: number) => groundLocal(env, def, x, z);
  const step = low ? 0.5 : 0.3;

  // stone quay wall at the back (z = -D/2), down to the ground
  {
    const gl = Math.min(g(-Lx / 2, -D / 2), g(0, -D / 2), g(Lx / 2, -D / 2)) - 1;
    p.add(box(Lx + 1, -gl + 0.1, 1.4), 'matte', { color: STONE, cover: 0.6, aoBottom: 0.8, jitter: 0.08 }, mat4([0, gl / 2 + 0.05, -D / 2 - 0.7]));
    p.add(box(Lx + 1.4, 0.3, 1.7), 'matte', { color: DARK, cover: 1 }, mat4([0, 0.12, -D / 2 - 0.7]));
  }
  // pilings + beams + deck of the wharf
  const nx = Math.max(3, Math.round(Lx / 2.5));
  for (let i = 0; i <= nx; i++) {
    const x = -Lx / 2 + (i * Lx) / nx;
    for (const z of [-D / 2 + 0.3, 0, D / 2 - 0.25]) {
      const gl = g(x, z) - 1.2;
      p.add(cyl(0.16, 0.19, -0.3 - gl, 6), 'matte', { color: col, cover: 0.5, aoBottom: 0.9, jitter: 0.1 }, mat4([x, (gl - 0.3) / 2, z]));
    }
    p.add(box(0.28, 0.26, D), 'matte', { color: col, cover: 0.3 }, mat4([x, -0.22, 0]));
  }
  const pn = Math.round(D / step);
  for (let k = 0; k < pn; k++) {
    const z = -D / 2 + ((k + 0.5) * D) / pn;
    p.add(box(Lx - r.range(0, 0.4), 0.07, (D / pn) * 0.88), 'matte', { color: plank, cover: 0.4, jitter: 0.2 }, mat4([r.range(-0.1, 0.1), -0.045 + r.range(-0.01, 0.006), z], [r.range(-0.006, 0.006), 0, r.range(-0.004, 0.004)]));
  }
  // front fender beam + bollards along the edge
  p.add(box(Lx + 0.2, 0.32, 0.26), 'matte', { color: col, cover: 0.3 }, mat4([0, -0.12, D / 2 + 0.05]));
  const bollard = lathe([[0, 0], [0.2, 0], [0.18, 0.35], [0.13, 0.42], [0.2, 0.52], [0.2, 0.6], [0, 0.62]], 8);
  for (let i = 0; i < Math.max(2, Math.round(Lx / 7)); i++) {
    const x = -Lx / 2 + 2 + (i * (Lx - 4)) / Math.max(1, Math.round(Lx / 7) - 1);
    p.add(bollard.clone(), 'metal', { color: IRON }, mat4([x, 0, D / 2 - 0.45]));
    if (r.next() < 0.5) p.add(torus(0.32, 0.06, 4, 10), 'matte', { color: ROPE, cover: 0 }, mat4([x + 0.7, 0.05, D / 2 - 0.8], [Math.PI / 2, 0, 0]));
  }
  // jetty over the water
  if (J > 0) {
    const jw = 2.6;
    const nj = Math.max(2, Math.round(J / 2.5));
    for (let i = 0; i <= nj; i++) {
      const z = D / 2 + (i * J) / nj;
      for (const s of [-1, 1]) {
        const x = jx + s * (jw / 2 - 0.15);
        const gl = g(x, z) - 1.4;
        p.add(cyl(0.14, 0.17, 0.4 - gl, 6), 'matte', { color: col, cover: 0.5, aoBottom: 0.9 }, mat4([x, (gl + 0.4) / 2 - 0.2, z], [r.range(-0.03, 0.03), 0, r.range(-0.03, 0.03)]));
      }
      p.add(box(jw + 0.3, 0.22, 0.26), 'matte', { color: col }, mat4([jx, -0.2, z]));
    }
    for (const s of [-1, 1]) p.add(box(0.2, 0.22, J), 'matte', { color: col }, mat4([jx + s * (jw / 2 - 0.4), -0.16, D / 2 + J / 2]));
    const jn = Math.round(J / step);
    for (let k = 0; k < jn; k++) {
      const z = D / 2 + ((k + 0.5) * J) / jn;
      p.add(box(jw - r.range(0, 0.2), 0.065, (J / jn) * 0.86), 'matte', { color: plank, cover: 0.4, jitter: 0.22 }, mat4([jx + r.range(-0.05, 0.05), -0.04, z], [0, r.range(-0.03, 0.03), r.range(-0.01, 0.01)]));
    }
    // bollards + ladder at the head
    for (const s of [-1, 1]) p.add(bollard.clone(), 'metal', { color: IRON }, mat4([jx + s * (jw / 2 - 0.35), 0, D / 2 + J - 0.5]));
    for (const s of [-1, 1]) p.add(box(0.07, 2.4, 0.07), 'metal', { color: IRON }, mat4([jx + s * 0.25, -1.1, D / 2 + J + 0.12]));
    for (let k = 0; k < 6; k++) p.add(box(0.55, 0.05, 0.05), 'metal', { color: IRON }, mat4([jx, -0.2 - k * 0.38, D / 2 + J + 0.12]));
  }
  // cargo: crates, barrels, sacks (on the back half of the wharf)
  const crate = (x: number, z: number, s: number, y = 0) => {
    p.add(box(s, s, s), 'matte', { color: col, cover: 0.3, jitter: 0.15 }, mat4([x, y + s / 2, z], [0, r.range(-0.3, 0.3), 0]));
    if (!low) for (const e of [-1, 1]) p.add(box(s + 0.04, 0.08, s + 0.04), 'matte', { color: DARK, cover: 0 }, mat4([x, y + s / 2 + e * s * 0.36, z], [0, r.range(-0.3, 0.3), 0]));
  };
  const barrel = lathe([[0, 0], [0.3, 0], [0.36, 0.25], [0.38, 0.45], [0.36, 0.65], [0.3, 0.9], [0, 0.9]], 9);
  for (let k = 0; k < (low ? 4 : 7); k++) {
    const x = r.range(-Lx / 2 + 2, Lx / 2 - 2), z = r.range(-D / 2 + 1, -0.5);
    if (J > 0 && Math.abs(x - jx) < 2.5) continue;
    if (r.next() < 0.5) {
      const s = r.range(0.8, 1.2);
      crate(x, z, s);
      if (r.next() < 0.5) crate(x + r.range(-0.1, 0.1), z, s * 0.8, s);
    } else {
      for (let b = 0; b < 3; b++) p.add(barrel.clone(), 'matte', { color: ['#3a2a1c', '#7a5a3c'], cover: 0.2, jitter: 0.2 }, mat4([x + (b % 2) * 0.8, 0, z + (b > 1 ? 0.75 : 0)]));
    }
  }
  // derrick crane: mast, raked jib, stays, hanging hook
  if (bool(def, 'crane', true)) {
    const x = -Lx / 2 + 3.5, z = D / 2 - 1.6;
    p.add(box(1.2, 0.4, 1.2), 'matte', { color: col }, mat4([x, 0.2, z]));
    p.add(box(0.36, 6.5, 0.36), 'matte', { color: col, cover: 0.2 }, mat4([x, 3.6, z]));
    const jl = 7.5, ja = 0.75;
    p.add(box(0.26, jl, 0.26), 'matte', { color: col, cover: 0.2 }, mat4([x + Math.sin(ja) * jl * 0.5 * 0.2, 1.4 + Math.cos(ja) * jl * 0.5, z + Math.sin(ja) * jl * 0.5], [ja, 0, 0]));
    const tipY = 1.4 + Math.cos(ja) * jl, tipZ = z + Math.sin(ja) * jl;
    p.add(cyl(0.025, 0.025, 2.8, 4), 'metal', { color: IRON }, mat4([x, tipY - 1.4, tipZ]));
    p.add(torus(0.18, 0.04, 4, 8, Math.PI * 1.4), 'metal', { color: IRON }, mat4([x, tipY - 2.9, tipZ], [0, 0, 0.6]));
    p.add(cyl(0.03, 0.03, Math.hypot(tipY - 6.8, tipZ - z), 4), 'matte', { color: ROPE, cover: 0 }, mat4([x, (tipY + 6.8) / 2, (tipZ + z) / 2], [Math.atan2(tipZ - z, tipY - 6.8), 0, 0]));
  }
  // boat-house roof over the east end
  if (bool(def, 'shed', true)) {
    const x = Lx / 2 - 4, w = 6, d = D - 1.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(box(0.28, 3.4, 0.28), 'matte', { color: col, cover: 0.3 }, mat4([x + sx * (w / 2 - 0.2), 1.7, sz * (d / 2 - 0.2)]));
    for (const s of [-1, 1]) p.add(box(w / 2 + 0.6, 0.12, d + 0.6), 'matte', { color: dark ? ['#1a1820', '#2c2a34'] : ['#2a2026', '#4e3e3a'], cover: 0.8, jitter: 0.1 }, mat4([x + s * (w / 4 + 0.1), 3.4 + 0.75, 0], [0, 0, -s * 0.48]));
    p.add(box(0.2, 0.24, d + 0.8), 'matte', { color: col }, mat4([x, 4.3, 0]));
  }
  // lantern posts along the front
  const nl = Math.round(num(def, 'lanterns', 4));
  for (let i = 0; i < nl; i++) {
    const x = -Lx / 2 + ((i + 0.5) * Lx) / nl;
    const z = D / 2 - 0.3;
    p.add(cyl(0.07, 0.09, 3, 6), 'matte', { color: col }, mat4([x, 1.5, z]));
    p.add(box(0.05, 0.05, 0.7), 'metal', { color: IRON }, mat4([x, 2.95, z + 0.3]));
    p.add(cyl(0.12, 0.15, 0.3, 6), 'metal', { color: IRON }, mat4([x, 2.62, z + 0.62]));
    lamps.push(glows.add({ pos: [x, 2.62, z + 0.62], color: '#ffb468', size: 1.7, intensity: 0.55, mode: 'flame', phase: r.range(0, 6), on: 0.5 }));
  }
  glows.finish();
  const mesh = p.build({ matte: { detail: 0.85, breakup: 0.4, rim: 0.3 } }, !low);
  const root = new THREE.Group();
  root.name = 'docks';
  root.add(mesh, glows.mesh);
  return {
    object: root,
    update(_sim: Sim, dt: number) {
      const k = 0.35 + 0.65 * ATMOS.uNight.value;
      for (const i of lamps) glows.setOn(i, k);
      glows.update(dt);
    },
    dispose() {
      glows.dispose();
      disposeTree(root);
    },
  };
}
