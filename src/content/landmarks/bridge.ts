/**
 * bridge: a crossing along local Z (from z = -length/2 to +length/2), deck top at local y = 0 (place `pos.y` at the
 * walking height; the sim walks on the terrain, so carve the path to the deck height or use it over a drop/water as
 * scenery). Two styles:
 * - stone: piers with cutwaters down to the ground, barrel arches between them (skipped where the ground is too high
 *   for an opening), spandrel walls, paved deck with a kerb, parapets with coping and end posts; `broken` drops parapet
 *   sections and coping stones, and can cut a ruined gap in the deck centre (broken >= 0.8).
 * - wood: trestles of round posts and cross braces down to the ground, stringers, plank deck with uneven boards, post-
 *   and-rail sides with sagging rope; `broken` drops planks and rails.
 * Lantern posts at both ends (warm flame glows, brighter at night).
 *
 * params: length 30, width 5, style 'stone' | 'wood' | any stone style name (pale, dark, ...) (stone), arches 3,
 * rise (span * 0.42), parapet true, broken 0, lanterns true, seed. Colliders: none (the deck is walked on the terrain);
 * add zone.colliders for piers standing on a route.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { zoneEnv } from '../../render/world/env';
import { box, cyl, blob, disposeTree, mat4 } from '../../render/world/geo';
import { GlowSet } from '../../render/world/glows';
import { ATMOS } from '../../render/world/atmosphere';
import { DARK, IRON, Parts, R, ROPE, WOOD, archBand, bool, groundLocal, num, str, styleColor, type Col } from './_kit';

export default function build(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const env = zoneEnv(zone, ctx);
  const L = num(def, 'length', 30), W = num(def, 'width', 5);
  const style = str(def, 'style', 'stone');
  const wood = style === 'wood';
  const broken = num(def, 'broken', 0);
  const parapet = bool(def, 'parapet', true);
  const seed = num(def, 'seed', 31);
  const low = ctx.quality === 'low';
  const r = new R(seed);
  const p = new Parts(seed);
  const glows = new GlowSet('bridge-glows');
  const g = (x: number, z: number) => groundLocal(env, def, x, z);
  const lamps: number[] = [];

  if (!wood) {
    const col: Col = styleColor(style === 'stone' ? 'stone' : style);
    const spans = Math.max(1, Math.round(num(def, 'arches', 3)));
    const sp = L / spans;
    const rise = num(def, 'rise', sp * 0.42);
    const deckT = 0.7;
    const spring = -deckT - rise - 0.5;
    // piers (with pointed cutwaters on both faces) and abutments
    for (let i = 0; i <= spans; i++) {
      const z = -L / 2 + i * sp;
      const gl = Math.min(g(0, z), g(-W / 2, z), g(W / 2, z)) - 1.2;
      const pw = i === 0 || i === spans ? 2.4 : 1.8;
      const top = spring + 0.2;
      if (top - gl > 0.3) {
        p.add(box(W + 0.4, top - gl, pw), 'matte', { color: col, cover: 0.6, aoBottom: 0.7, jitter: 0.06 }, mat4([0, (top + gl) / 2, z]));
        if (i > 0 && i < spans) for (const s of [-1, 1]) p.add(cyl(0.02, pw * 0.72, top - gl, 4), 'matte', { color: col, cover: 0.5, aoBottom: 0.7 }, mat4([s * (W / 2 + 0.2), (top + gl) / 2, z], [0, Math.PI / 4, 0], [1, 1, 0.7]));
      }
      // impost band
      p.add(box(W + 0.7, 0.35, pw + 0.3), 'matte', { color: DARK, cover: 1 }, mat4([0, spring + 0.1, z]));
    }
    // arches + spandrel fill per span
    for (let i = 0; i < spans; i++) {
      const zc = -L / 2 + (i + 0.5) * sp;
      const clear = sp - 1.8;
      const groundMid = g(0, zc);
      if (groundMid < spring + rise * 0.6) {
        p.add(archBand(clear, rise, 0.75, W, false), 'matte', { color: col, cover: 0.5, jitter: 0.05 }, mat4([0, spring + 0.2, zc], [0, Math.PI / 2, 0]));
        // spandrel walls on both faces between the extrados and the deck
        for (const s of [-1, 1]) {
          for (const e of [-1, 1]) {
            const h = -deckT - (spring + rise * 0.55);
            p.add(box(0.6, h, clear * 0.36), 'matte', { color: col, cover: 0.5, jitter: 0.06 }, mat4([s * (W / 2 - 0.3), spring + rise * 0.55 + h / 2, zc + e * clear * 0.34]));
          }
          p.add(box(0.6, rise * 0.3, clear * 0.5), 'matte', { color: col, cover: 0.5, jitter: 0.06 }, mat4([s * (W / 2 - 0.3), -deckT - rise * 0.15 + 0.1, zc]));
        }
      } else {
        // causeway: solid fill where the ground is too high for an opening
        const gl = Math.min(g(-W / 2, zc), g(W / 2, zc)) - 0.8;
        p.add(box(W, -deckT - gl, sp), 'matte', { color: col, cover: 0.7, aoBottom: 0.6 }, mat4([0, (gl - deckT) / 2, zc]));
      }
    }
    // deck: slab + paving strips + kerbs; an optional ruined gap at the centre
    const gap = broken >= 0.8 ? Math.min(3.2, sp * 0.4) : 0;
    const strips = Math.round(L / (low ? 2.4 : 1.2));
    for (let k = 0; k < strips; k++) {
      const z0 = -L / 2 + (k * L) / strips, z1 = z0 + L / strips;
      const zm = (z0 + z1) / 2;
      if (gap && Math.abs(zm) < gap / 2) continue;
      p.add(box(W - 0.9, 0.18, L / strips - 0.05), 'matte', { color: ['#7a7466', '#a49c8c'], cover: 0.6, jitter: 0.12 }, mat4([0, -0.09 + r.range(-0.01, 0.005), zm]));
    }
    const segs = gap ? [[-L / 2, -gap / 2], [gap / 2, L / 2]] : [[-L / 2, L / 2]];
    for (const [a, b] of segs) {
      p.add(box(W, deckT - 0.18, b - a), 'matte', { color: col, cover: 0.3 }, mat4([0, -0.18 - (deckT - 0.18) / 2, (a + b) / 2]));
      for (const s of [-1, 1]) p.add(box(0.45, 0.22, b - a), 'matte', { color: DARK, cover: 1 }, mat4([s * (W / 2 - 0.22), 0.05, (a + b) / 2]));
    }
    if (gap) for (let k = 0; k < 5; k++) p.add(blob(r.range(0.3, 0.6), 0, 0.35, r.int(1, 999), 0.4), 'matte', { color: col, cover: 1 }, mat4([r.range(-W / 2, W / 2), g(0, r.range(-2, 2)) + 0.2, r.range(-gap, gap)]));
    // parapets with coping, broken sections
    if (parapet) {
      const n = Math.round(L / 2.2);
      for (const s of [-1, 1]) {
        for (let k = 0; k < n; k++) {
          const z0 = -L / 2 + (k * L) / n, z1 = z0 + L / n, zm = (z0 + z1) / 2;
          if (gap && Math.abs(zm) < gap / 2 + 0.8) continue;
          const lost = r.next() < broken * 0.6;
          const h = lost ? r.range(0.2, 0.5) : 0.95;
          p.add(box(0.42, h, L / n - 0.04), 'matte', { color: col, cover: 0.7, jitter: 0.06 }, mat4([s * (W / 2 - 0.21), h / 2, zm]));
          if (!lost) p.add(box(0.55, 0.16, L / n - 0.02), 'matte', { color: col, cover: 1 }, mat4([s * (W / 2 - 0.21), h + 0.08, zm]));
          else p.add(box(0.5, 0.3, 0.9), 'matte', { color: col, cover: 1, aoBottom: 0.6 }, mat4([s * (W / 2 + 0.9 + r.range(0, 1.2)), g(s * (W / 2 + 1.4), zm) + 0.12, zm + r.range(-0.6, 0.6)], [0.2, r.range(0, 6), 0.1]));
        }
      }
    }
    // end posts
    for (const e of [-1, 1]) for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.3), z = e * (L / 2 - 0.4);
      p.add(box(0.75, 1.6, 0.75), 'matte', { color: col, cover: 0.8, aoBottom: 0.5 }, mat4([x, 0.8, z]));
      p.add(box(0.9, 0.22, 0.9), 'matte', { color: DARK, cover: 1 }, mat4([x, 1.7, z]));
    }
  } else {
    const col = WOOD;
    const bayN = Math.max(2, Math.round(L / 3.2));
    const bay = L / bayN;
    // trestles: two leaning posts + a cross brace + cap beam per bent
    for (let i = 0; i <= bayN; i++) {
      const z = -L / 2 + i * bay;
      for (const s of [-1, 1]) {
        const x = s * (W / 2 - 0.25);
        const gl = g(x, z) - 0.8;
        const h = -0.35 - gl;
        if (h > 0.2) p.add(cyl(0.14, 0.17, h, 6), 'matte', { color: col, cover: 0.4, aoBottom: 0.8, jitter: 0.1 }, mat4([x + s * 0.06, gl + h / 2, z], [0, 0, s * 0.04]));
      }
      const gl = Math.min(g(-W / 2, z), g(W / 2, z));
      if (-0.35 - gl > 1.4) {
        const len = Math.hypot(W - 0.5, -0.6 - gl - 0.4);
        p.add(box(0.12, len, 0.14), 'matte', { color: col, cover: 0.3 }, mat4([0, (gl - 0.6) / 2 + 0.2, z], [0, 0, Math.atan2(W - 0.5, -0.6 - gl - 0.4) * (i % 2 ? 1 : -1)]));
      }
      p.add(box(W + 0.3, 0.22, 0.3), 'matte', { color: col, cover: 0.6 }, mat4([0, -0.33, z]));
    }
    // stringers
    for (const x of [-W / 2 + 0.5, 0, W / 2 - 0.5]) p.add(box(0.2, 0.24, L), 'matte', { color: col, cover: 0.2 }, mat4([x, -0.2, 0]));
    // planks
    const pn = Math.round(L / (low ? 0.5 : 0.28));
    for (let k = 0; k < pn; k++) {
      if (r.next() < broken * 0.35) continue;
      const z = -L / 2 + ((k + 0.5) * L) / pn;
      p.add(box(W - r.range(0, 0.3), 0.07, (L / pn) * 0.9), 'matte', { color: ['#3a2c20', '#6e5640'], cover: 0.35, jitter: 0.18 }, mat4([r.range(-0.08, 0.08), -0.04 + r.range(-0.015, 0.01), z], [r.range(-0.01, 0.01), r.range(-0.03, 0.03), r.range(-0.012, 0.012)]));
    }
    // posts + rails + rope
    if (parapet) {
      for (const s of [-1, 1]) {
        for (let i = 0; i <= bayN; i++) {
          if (i > 0 && i < bayN && r.next() < broken * 0.4) continue;
          const z = -L / 2 + i * bay;
          p.add(cyl(0.08, 0.1, 1.15, 6), 'matte', { color: col, cover: 0.4 }, mat4([s * (W / 2 - 0.12), 0.5, z], [r.range(-0.04, 0.04), 0, s * r.range(0, 0.06)]));
          if (i < bayN && r.next() > broken * 0.5) p.add(box(0.08, 0.1, bay), 'matte', { color: col, cover: 0.6 }, mat4([s * (W / 2 - 0.12), 1.0, z + bay / 2], [r.range(-0.02, 0.02), 0, 0]));
          if (i < bayN && !low) p.add(cyl(0.025, 0.025, bay, 4), 'matte', { color: ROPE, cover: 0 }, mat4([s * (W / 2 - 0.1), 0.55, z + bay / 2], [Math.PI / 2 + 0.06, 0, 0]));
        }
      }
    }
  }

  // lantern posts at both ends (iron post, hanging cage, warm flame)
  if (bool(def, 'lanterns', true)) {
    for (const e of [-1, 1]) {
      const s = e;
      const x = s * (W / 2 + 0.35), z = e * (L / 2 + 0.6);
      const base = g(x, z) - 0.2;
      const top = Math.max(0, base) + 2.9;
      p.add(cyl(0.06, 0.08, top - base, 6), 'metal', { color: IRON }, mat4([x, (top + base) / 2, z]));
      p.add(box(0.7, 0.06, 0.06), 'metal', { color: IRON }, mat4([x - s * 0.32, top, z]));
      p.add(cyl(0.13, 0.16, 0.32, 6), 'metal', { color: IRON }, mat4([x - s * 0.62, top - 0.3, z]));
      lamps.push(glows.add({ pos: [x - s * 0.62, top - 0.3, z], color: '#ffb468', size: 1.6, intensity: 0.5, mode: 'flame', phase: r.range(0, 6), on: 0.5 }));
    }
  }
  glows.finish();
  const group = p.build({ matte: { detail: 0.85, breakup: 0.35, rim: 0.3 } }, !low);
  group.name = 'bridge';
  const root = new THREE.Group();
  root.name = 'bridge';
  root.add(group, glows.mesh);
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
