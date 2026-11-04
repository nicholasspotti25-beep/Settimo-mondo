/**
 * vetta_piazzale (Guardiano del Regno): the ancient summit plaza. Concentric paving and a compass medallion across
 * the whole walkable circle (center [0,0,60], r 24), a kerb and steps down, a broken balustrade open at the fog gate
 * (south, z 36) and at the descent (north), a ruined archway framing the gate (piers outside the circle), eight broken
 * guardian statues and colossal column stumps standing outside the circle, braziers waking at dusk, and a worn stair
 * going down toward the road to the plains. Everything solid stays outside the arena radius (no obstacles needed).
 */
import * as THREE from 'three';
import type { ArenaDef, ZoneDef } from '../../../core/types';
import type { Sim } from '../../../sim/sim';
import type { ArenaVisual, RenderCtx } from '../../../render/types';
import { zoneEnv } from '../../../render/world/env';
import { blob, box, disposeTree, mat4 } from '../../../render/world/geo';
import { GlowSet } from '../../../render/world/glows';
import { BRONZE, DARK, PALE, Parts, R, column, statue, voussoirs, type StatueOpts } from '../../landmarks/_kit';
import { brazierLevel, plazaParts } from '../../landmarks/summit_plaza';
import { cyl, lathe } from '../../../render/world/geo';

export default function build(def: ArenaDef, zone: ZoneDef, ctx: RenderCtx): ArenaVisual {
  const env = zoneEnv(zone, ctx);
  const root = new THREE.Group();
  root.name = `arena:${def.id}`;
  const [cx, , cz] = def.center;
  const fy = def.floor_y;
  const rad = def.radius ?? 24;
  const low = ctx.quality === 'low';
  const r = new R(1907);
  const p = new Parts(1907);
  const glows = new GlowSet(`arena-glows:${def.id}`);
  const I = new THREE.Matrix4();
  const gy = (x: number, z: number) => env.heightAt(x, z);
  // the gate direction from the center (degrees, 0 = +Z) and the descent opposite to it
  const gateA = Math.atan2(def.gate.pos[0] - cx, def.gate.pos[2] - cz);
  const descentA = gateA + Math.PI;

  // paving, kerb, steps and balustrade (braziers are placed outside below)
  plazaParts(p, mat4([cx, fy, cz]), glows, {
    radius: rad, rings: 4, center: true, steps: 2, balustrade: 0.62, gaps: [gateA, descentA], gapWidth: Math.max(9, def.gate.width + 3),
    braziers: 0, col: PALE, seed: 77, low,
  });

  // ruined archway framing the fog gate (piers outside the circle, opening wider than the gate)
  {
    const gx = def.gate.pos[0], gz = def.gate.pos[2];
    const span = def.gate.width + 4.4;
    const out = 1.6;
    const ax = gx + Math.sin(gateA) * out, az = gz + Math.cos(gateA) * out;
    const m = mat4([ax, gy(ax, az), az], [0, gateA, 0]);
    for (const s of [-1, 1]) {
      const px = s * (span / 2 + 0.9);
      p.add(box(2.4, 1.4, 2.4), 'matte', { color: DARK, cover: 1, aoBottom: 0.5 }, m.clone().multiply(mat4([px, 0.5, 0])));
      p.add(box(1.8, 8.2, 1.8), 'matte', { color: PALE, cover: 0.7, aoBottom: 0.6 }, m.clone().multiply(mat4([px, 5.2, 0])));
      p.add(box(2.2, 0.45, 2.2), 'matte', { color: PALE, cover: 1 }, m.clone().multiply(mat4([px, 9.4, 0])));
    }
    voussoirs(p, m.clone().multiply(mat4([0, 9.6, 0])), span + 0.2, span * 0.55, 1.0, 1.8, true, PALE, r, (k, n) => k < n * 0.62 || k > n * 0.9);
    // the fallen keystone and voussoirs at the foot, just outside the circle
    for (let k = 0; k < 4; k++) {
      const x = r.sign() * r.range(span / 2 + 2.2, span / 2 + 4.5), z = r.range(-1.5, 2.5);
      p.add(box(r.range(0.9, 1.3), 0.9, 1.6), 'matte', { color: PALE, cover: 1, aoBottom: 0.6 }, m.clone().multiply(mat4([x, 0.35, z + 1], [r.range(-0.4, 0.4), r.range(0, 6), r.range(-0.4, 0.4)])));
    }
  }

  // broken guardian statues and colossal column stumps around the plaza, facing in
  const poses: StatueOpts['pose'][] = ['spear', 'sword', 'kneel', 'spear', 'mourner', 'sword', 'spear', 'kneel'];
  const n = 8;
  let si = 0;
  const brz: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = gateA + ((i + 0.5) / n) * Math.PI * 2;
    let d = Math.abs(((a - descentA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < 0.3) continue;
    d = Math.abs(((a - gateA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < 0.3) continue;
    const sr = rad + 4.6;
    const x = cx + Math.sin(a) * sr, z = cz + Math.cos(a) * sr;
    const y = gy(x, z) - 0.2;
    const broken = [0.2, 0.7, 0.45, 0.9, 0.35, 0.6, 0.15, 0.8][i];
    if (broken > 0.85) {
      // toppled: lying face down beside its plinth
      const sp = new Parts(i + 9);
      statue(sp, mat4([0, 0, 0]), r, { pose: poses[si++ % poses.length], broken: 0.5, col: PALE, plinth: 0.01 });
      p.merge(sp, mat4([x + Math.cos(a) * 2.5, y + 0.9, z - Math.sin(a) * 2.5], [Math.PI / 2 - 0.08, a + Math.PI + 0.4, 0]));
      p.add(box(2.2, 1.2, 2.2), 'matte', { color: DARK, cover: 1, aoBottom: 0.5 }, mat4([x, y + 0.6, z], [0, a, 0.04]));
    } else {
      const sp = new Parts(i + 9);
      statue(sp, mat4([0, 0, 0]), r, { pose: poses[si++ % poses.length], broken, col: PALE, plinth: 1.3 });
      p.merge(sp, mat4([x, y, z], [0, a + Math.PI, 0], 1.25));
    }
    // a column stump between statues, further out
    const a2 = a + Math.PI / n;
    d = Math.min(Math.abs(((a2 - descentA + Math.PI * 3) % (Math.PI * 2)) - Math.PI), Math.abs(((a2 - gateA + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    if (d > 0.35) {
      const cr = rad + 8.5;
      const x2 = cx + Math.sin(a2) * cr, z2 = cz + Math.cos(a2) * cr;
      column(p, I, x2, gy(x2, z2) - 0.3, z2, r.range(9, 15), 1.15, PALE, r, r.range(0.2, 0.75), low ? 10 : 16);
    }
    // braziers on the kerb steps, between the statues facing the gate side
    if (i % 2 === 0) {
      const ba = a + Math.PI / n * 0.5;
      const br = rad + 2.4;
      const bx = cx + Math.sin(ba) * br, bz = cz + Math.cos(ba) * br;
      const by = gy(bx, bz) - 0.25;
      p.add(cyl(0.55, 0.65, 0.5, 8), 'matte', { color: DARK, cover: 0.8 }, mat4([bx, by, bz]));
      p.add(cyl(0.09, 0.14, 1.4, 6), 'metal', { color: BRONZE, cover: 0 }, mat4([bx, by + 0.45, bz]));
      p.add(lathe([[0.1, 0], [0.55, 0.14], [0.7, 0.45], [0.62, 0.48], [0.5, 0.2], [0.1, 0.07]], 10), 'metal', { color: BRONZE, cover: 0 }, mat4([bx, by + 1.8, bz]));
      p.add(blob(0.42, 0, 0.4, i + 3, 0.6), 'matte', { color: ['#1a1410', '#3a2a1e'], cover: 0 }, mat4([bx, by + 2.0, bz], [0, 0, 0], [1, 0.4, 1]));
      brz.push(glows.add({ pos: [bx, by + 2.25, bz], color: '#ff9c4a', size: 1.9, height: 1.4, intensity: 0.6, mode: 'flame', phase: i, on: 0 }));
      brz.push(glows.add({ pos: [bx, by + 2.2, bz], color: '#ff8a3a', size: 5.5, intensity: 0.16, mode: 'orb', phase: i, on: 0 }));
    }
  }

  // the worn stair going down toward the road to the plains
  {
    const sx = Math.sin(descentA), sz = Math.cos(descentA);
    const w = 9;
    let prev = fy;
    for (let k = 0; k < 14; k++) {
      const d = rad + 2.2 + k * 1.3;
      const x = cx + sx * d, z = cz + sz * d;
      const y = Math.min(prev, gy(x, z));
      prev = y;
      p.add(box(w, 0.9, 1.35), 'matte', { color: k % 2 ? ['#857e72', '#a49c8c'] : ['#8e877a', '#ada594'], cover: 0.9, aoBottom: 0.6, jitter: 0.1 }, mat4([x, y - 0.4, z], [r.range(-0.02, 0.02), descentA, r.range(-0.015, 0.015)]));
      if (k % 3 === 0) for (const s of [-1, 1]) p.add(box(0.9, 1.4, 1.4), 'matte', { color: PALE, cover: 1 }, mat4([x + Math.cos(descentA) * s * (w / 2 + 0.5), y - 0.1, z - Math.sin(descentA) * s * (w / 2 + 0.5)], [0, descentA, 0]));
    }
  }

  glows.finish();
  root.add(p.build({ matte: { detail: 0.7, breakup: 0.35, rim: 0.28 } }, !low));
  root.add(glows.mesh);

  return {
    root,
    update(_sim: Sim, dt: number) {
      const k = brazierLevel();
      for (const i of brz) glows.setOn(i, k);
      glows.update(dt);
    },
    dispose() {
      glows.dispose();
      disposeTree(root);
    },
  };
}
