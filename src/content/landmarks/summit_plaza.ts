/**
 * summit_plaza: an ancient round plaza paved in concentric rings of slabs around a compass medallion, a darker kerb,
 * steps going down outside the kerb, a low balustrade with gaps (openings for paths, broken sections) and bronze
 * braziers whose embers wake at dusk and night. Floor top at y = 0.03 (just above the terrain / arena floor).
 *
 * params: radius (9), rings (3), center (true), steps (2), balustrade (0.75 = fraction standing, 0 none),
 * gaps ('0,180': opening directions in degrees, 0 = local +Z), gapWidth (6), braziers (4), style ('pale'), seed.
 * Also used by the vetta_piazzale arena dressing.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { blob, box, cyl, disposeTree, lathe, mat4, torus } from '../../render/world/geo';
import { GlowSet } from '../../render/world/glows';
import { ATMOS } from '../../render/world/atmosphere';
import { BRONZE, DARK, Parts, R, bool, mul, num, slabRing, str, styleColor } from './_kit';

export interface PlazaOpts {
  radius: number;
  rings: number;
  center: boolean;
  steps: number;
  balustrade: number;
  gaps: number[];
  gapWidth: number;
  braziers: number;
  col: [string, string];
  seed: number;
  low: boolean;
}

/** Build the plaza pieces into `p` (local frame m) and its brazier glows into `glows`; returns brazier glow ids. */
export function plazaParts(p: Parts, m: THREE.Matrix4, glows: GlowSet, o: PlazaOpts): number[] {
  const r = new R(o.seed);
  const R0 = o.radius;
  const inGap = (a: number, rad: number, extra = 0) => {
    for (const g of o.gaps) {
      let d = Math.abs(a - g);
      d = Math.min(d, Math.PI * 2 - d);
      if (d * rad < o.gapWidth / 2 + extra) return true;
    }
    return false;
  };
  // medallion
  let rIn = 0;
  if (o.center) {
    // flush with the paving: disc top at +0.03 (the slab tops are at +0.02), inlays and ring a hair above it
    p.add(cyl(1.7, 1.75, 0.22, 24), 'matte', { color: DARK, cover: 0.3 }, mul(m, mat4([0, 0.03 - 0.11, 0])));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const L = i % 2 ? 1.1 : 1.6;
      p.add(box(0.28, 0.03, L), 'matte', { color: o.col, cover: 0 }, mul(m, mat4([Math.sin(a) * L * 0.5, 0.04, Math.cos(a) * L * 0.5], [0, a, 0])));
    }
    p.add(torus(1.72, 0.06, 4, 32), 'matte', { color: o.col, cover: 0 }, mul(m, mat4([0, 0.02, 0], [Math.PI / 2, 0, 0])));
    rIn = 1.8;
  }
  const bandW = (R0 - rIn) / o.rings;
  for (let k = 0; k < o.rings; k++) {
    const a = rIn + k * bandW, b = a + bandW;
    const n = Math.max(6, Math.round((Math.PI * 2 * b) / 2.3));
    // slab tops 2 cm above the flattened floor (covers the terrain's own paving without z-fighting), 20 cm thick
    slabRing(p, m, 0, 0, a, b, n, 0.02, 0.2, k % 2 ? ['#8c8478', '#a8a092'] : ['#9a9284', '#b4ac9c'], r);
  }
  // kerb + steps down
  slabRing(p, m, 0, 0, R0, R0 + 0.7, Math.round((Math.PI * 2 * R0) / 1.6), 0.12, 0.5, DARK, r);
  for (let s = 0; s < o.steps; s++) {
    const a = R0 + 0.7 + s * 0.85;
    slabRing(p, m, 0, 0, a, a + 0.85, Math.round((Math.PI * 2 * a) / 1.8), -0.22 - s * 0.26, 0.5, o.col, r);
  }
  // balustrade
  if (o.balustrade > 0) {
    const rb = R0 + 0.35;
    const nPost = Math.round((Math.PI * 2 * rb) / 3.2);
    for (let i = 0; i < nPost; i++) {
      const a0 = (i / nPost) * Math.PI * 2, a1 = ((i + 1) / nPost) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const standing = r.next() < o.balustrade;
      if (inGap(a0, rb, 0.6) && inGap(a1, rb, 0.6)) continue;
      const post = (a: number) => {
        if (inGap(a, rb, 0.4)) return;
        p.add(box(0.55, 1.15, 0.55), 'matte', { color: o.col, cover: 0.8, aoBottom: 0.6 }, mul(m, mat4([Math.sin(a) * rb, 0.62, Math.cos(a) * rb], [0, a, 0])));
        p.add(box(0.7, 0.16, 0.7), 'matte', { color: o.col, cover: 1 }, mul(m, mat4([Math.sin(a) * rb, 1.25, Math.cos(a) * rb], [0, a, 0])));
      };
      post(a0);
      if (inGap(am, rb, 0.2)) continue;
      const chord = 2 * rb * Math.sin((a1 - a0) / 2) - 0.6;
      const cx = Math.sin(am) * rb * Math.cos((a1 - a0) / 2), cz = Math.cos(am) * rb * Math.cos((a1 - a0) / 2);
      if (standing) {
        p.add(box(chord, 0.16, 0.42), 'matte', { color: o.col, cover: 1 }, mul(m, mat4([cx, 1.1, cz], [0, am + Math.PI / 2, 0])));
        p.add(box(chord, 0.14, 0.5), 'matte', { color: o.col, cover: 0.6 }, mul(m, mat4([cx, 0.12, cz], [0, am + Math.PI / 2, 0])));
        const nb = o.low ? 3 : Math.floor(chord / 0.42);
        for (let j = 0; j < nb; j++) {
          const t = (j + 0.5) / nb - 0.5;
          const ax = Math.cos(am) * t * chord, az = -Math.sin(am) * t * chord;
          p.add(lathe([[0, 0], [0.12, 0], [0.09, 0.15], [0.15, 0.42], [0.08, 0.72], [0.11, 0.8], [0, 0.8]], 6), 'matte', { color: o.col, cover: 0.5 }, mul(m, mat4([cx + ax, 0.2, cz + az])));
        }
      } else {
        // fallen section: rail broken on the ground, a couple of balusters standing
        p.add(box(chord * 0.6, 0.16, 0.42), 'matte', { color: o.col, cover: 1 }, mul(m, mat4([cx * 1.04, 0.2, cz * 1.04], [0.2, am + Math.PI / 2 + r.range(-0.3, 0.3), 0.1])));
        p.add(blob(0.3, 0, 0.35, r.int(1, 999), 0.4), 'matte', { color: o.col, cover: 1 }, mul(m, mat4([cx * 1.05, 0.15, cz * 1.05])));
      }
    }
  }
  // braziers
  const ids: number[] = [];
  const mp = new THREE.Vector3();
  for (let i = 0; i < o.braziers; i++) {
    let a = (i / o.braziers) * Math.PI * 2 + Math.PI / o.braziers;
    for (let k = 0; k < 8 && inGap(a, R0, 1.5); k++) a += 0.12;
    const rr = R0 - 1.0;
    const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
    p.add(cyl(0.45, 0.55, 0.25, 8), 'matte', { color: DARK, cover: 0.6 }, mul(m, mat4([x, 0.03, z])));
    p.add(cyl(0.08, 0.12, 1.3, 6), 'metal', { color: BRONZE, cover: 0 }, mul(m, mat4([x, 0.2, z])));
    p.add(lathe([[0.1, 0], [0.5, 0.12], [0.62, 0.4], [0.56, 0.42], [0.45, 0.18], [0.1, 0.06]], 10), 'metal', { color: BRONZE, cover: 0 }, mul(m, mat4([x, 1.45, z])));
    p.add(blob(0.36, 0, 0.4, i + 3, 0.6), 'matte', { color: ['#1a1410', '#3a2a1e'], cover: 0, emissive: 0 }, mul(m, mat4([x, 1.62, z], [0, 0, 0], [1, 0.4, 1])));
    mp.set(x, 1.85, z).applyMatrix4(m);
    ids.push(glows.add({ pos: [mp.x, mp.y, mp.z], color: '#ff9c4a', size: 1.6, height: 1.2, intensity: 0.55, mode: 'flame', phase: i * 1.7, on: 0 }));
  }
  return ids;
}

/** Ember brightness of the braziers for the current light: cold by day, glowing at dusk and night. */
export function brazierLevel(): number {
  return 0.15 + 0.85 * Math.min(1, ATMOS.uNight.value * 1.4 + Math.max(0, 0.6 - ATMOS.uLightColor.value.b) * 0.8);
}

export function parseGaps(s: string): number[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (Number(x) * Math.PI) / 180);
}

export default function build(def: LandmarkDef, _zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const p = new Parts(num(def, 'seed', 5));
  const glows = new GlowSet('plaza-glows');
  const ids = plazaParts(p, new THREE.Matrix4(), glows, {
    radius: num(def, 'radius', 9), rings: Math.max(1, Math.round(num(def, 'rings', 3))), center: bool(def, 'center', true),
    steps: Math.round(num(def, 'steps', 2)), balustrade: num(def, 'balustrade', 0.75), gaps: parseGaps(str(def, 'gaps', '0,180')),
    gapWidth: num(def, 'gapWidth', 6), braziers: Math.round(num(def, 'braziers', 4)), col: styleColor(def.params?.style),
    seed: num(def, 'seed', 5), low: ctx.quality === 'low',
  });
  glows.finish();
  const group = p.build({ matte: { detail: 0.7, breakup: 0.35, rim: 0.25 } }, ctx.quality !== 'low');
  group.name = 'summit_plaza';
  // glow positions were computed in local space; the GlowSet mesh rides with the group
  group.add(glows.mesh);
  return {
    object: group,
    update(_sim: Sim, dt: number) {
      const k = brazierLevel();
      for (const i of ids) glows.setOn(i, k);
      glows.update(dt);
    },
    dispose() {
      glows.dispose();
      disposeTree(group);
    },
  };
}
