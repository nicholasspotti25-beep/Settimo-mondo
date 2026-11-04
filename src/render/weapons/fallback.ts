/**
 * Category templates for weapon types that do not have their dedicated template yet: a recognizable weapon of the
 * right category, size and colors (blade, great blade, polearm, bow, catalyst orb staff, flail, gauntlets).
 */
import * as THREE from 'three';
import * as geo from '../kit/geometry';
import type { V3 } from '../kit/geometry';
import { mix, shade } from '../kit/palette';
import type { WeaponDef } from '../../core/types';
import type { RenderCtx } from '../types';
import { Forge, bladeZ, latheZ, rodZ, wrapZ } from './forge';
import { colorsOf, type WeaponVisual } from './types';

const TWO = new Set(['spadone', 'ascia_a_due_mani', 'martello_da_guerra', 'falce']);
const AXE = new Set(['ascia_a_due_mani', 'asce_gemelle', 'kama_gemelle']);
const BLUNT = new Set(['martello_da_guerra', 'mazza', 'flagello']);

export function buildFallback(def: WeaponDef, ctx: RenderCtx): WeaponVisual {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.32, metalness: 0.75, glowIntensity: 1.8 });
  const cat = def.category;
  const t = def.type;
  const glowOn = def.model?.glow && def.model.glow !== 'none';
  let base = new THREE.Vector3(0, 0, 0.2), tip = new THREE.Vector3(0, 0, 1);
  let gripKind: WeaponVisual['grip'] = 'r';
  if (cat === 'ranged') {
    // bow / crossbow: limbs along Y (held vertically in the left hand), string, arrow rest
    gripKind = 'bow';
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12 - 0.5;
      pts.push([0, k * 1.3, -Math.cos(k * Math.PI) * 0.22 + 0.1]);
    }
    f.grad('matte', geo.tube(pts, (u) => 0.016 - Math.abs(u - 0.5) * 0.018, { radial: f.seg(6, 4), perSeg: 2 }), 1, shade(c.primary, 0.8), c.primary);
    f.add('glow', geo.tube([pts[0], [0, 0, -0.14], pts[12]], 0.0022, { radial: 3, perSeg: 1 }), mix(c.accent, '#ffffff', 0.4));
    grip(f, -0.08, 0.08, 0.02, c.secondary);
    base = new THREE.Vector3(0, -0.5, 0.05);
    tip = new THREE.Vector3(0, 0.5, 0.05);
  } else if (cat === 'catalyst') {
    const S = 1.5, zb = -0.4, zt = zb + S;
    f.grad('matte', latheZ([[0, zb], [0.02, zb + 0.02], [0.018, zt - 0.1], [0.024, zt], [0, zt + 0.01]], f.seg(10, 6)), 2, shade(c.primary, 0.8), c.primary);
    f.add('metal', wrapZ(0.021, zt - 0.4, zt - 0.02, 3, 0.004, 4, f.seg(40, 16)), c.secondary);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      f.add('metal', geo.tube([[0, 0, zt - 0.02], [Math.cos(a) * 0.06, Math.sin(a) * 0.06, zt + 0.06], [Math.cos(a) * 0.03, Math.sin(a) * 0.03, zt + 0.16]], 0.007, { radial: 4, perSeg: 3 }), c.secondary);
    }
    f.add('glow', geo.ellipsoid(0.045, 0.045, 0.045, f.seg(12, 8), f.seg(10, 6)), c.accent, [0, 0, zt + 0.09]);
    base = new THREE.Vector3(0, 0, zt - 0.2);
    tip = new THREE.Vector3(0, 0, zt + 0.12);
  } else if (cat === 'fist') {
    gripKind = 'fist';
    f.grad('metal', geo.ellipsoid(0.055, 0.06, 0.085, f.seg(12, 8), f.seg(9, 6)), 2, shade(c.primary, 0.7), c.primary, [0, 0, 0.0]);
    for (let i = 0; i < 4; i++) {
      const y = -0.036 + i * 0.024;
      const sp = geo.spike(0.012, t === 'artigli' ? 0.2 : 0.035, 5, t === 'artigli' ? 0.05 : 0);
      sp.rotateX(Math.PI / 2);
      f.add('metal', sp, t === 'artigli' ? mix(c.primary, '#ffffff', 0.3) : c.secondary, [0.02, y, 0.07]);
    }
    if (glowOn) f.add('glow', geo.ellipsoid(0.02, 0.02, 0.02, 8, 6), c.accent, [0.05, 0, 0.0]);
    base = new THREE.Vector3(0, 0, 0.04);
    tip = new THREE.Vector3(0, 0, t === 'artigli' ? 0.28 : 0.12);
  } else if (cat === 'flexible') {
    grip(f, -0.12, 0.1, 0.017, c.secondary);
    const n = 10;
    for (let i = 0; i < n; i++) f.add('metal', geo.torus(0.016, 0.004, 4, 8), shade(c.primary, 0.85), [0, 0, 0.12 + i * 0.03], [0, i % 2 ? 90 : 0, 0]);
    if (BLUNT.has(t)) f.add('metal', geo.ellipsoid(0.07, 0.07, 0.07, f.seg(10, 7), f.seg(8, 6)), c.primary, [0, 0, 0.12 + n * 0.03 + 0.06]);
    else f.add('metal', bladeZ(0.3, [[0, 0.02], [0.5, 0.03], [1, 0.001]], 0.01, 6), c.primary, [0, 0, 0.12 + n * 0.03]);
    if (glowOn) f.add('glow', geo.ellipsoid(0.014, 0.014, 0.014, 6, 4), c.accent, [0, 0, 0.11]);
    base = new THREE.Vector3(0, 0, 0.2);
    tip = new THREE.Vector3(0, 0, 0.12 + n * 0.03 + 0.25);
  } else if (cat === 'polearm') {
    gripKind = 'both';
    const S = 2.1, zb = -0.7, zt = zb + S;
    f.grad('matte', latheZ([[0, zb], [0.023, zb + 0.01], [0.024, 0], [0.02, zt], [0, zt + 0.01]], f.seg(10, 6)), 2, shade(c.primary, 0.75), c.primary);
    for (const z of [zb + 0.03, zt - 0.05]) f.add('metal', latheZ([[0.024, z - 0.02], [0.028, z], [0.024, z + 0.02]], f.seg(10, 6)), c.secondary);
    if (t === 'falce' || t === 'naginata') {
      f.add('metal', bladeZ(0.6, [[0, 0.03], [0.3, 0.05], [1, 0.001]], 0.012, 10, (u) => u * u * 0.18), c.primary, [0, 0, zt]);
    } else if (t === 'tridente') {
      for (const y of [-0.07, 0, 0.07]) f.add('metal', bladeZ(0.32, [[0, 0.012], [0.8, 0.012], [1, 0.001]], 0.012, 4), c.primary, [0, y, zt + 0.05]);
      f.add('metal', geo.bevelBox(0.02, 0.17, 0.03, 0.006), c.secondary, [0, 0, zt + 0.04]);
    } else f.add('metal', bladeZ(0.45, [[0, 0.02], [0.3, 0.06], [1, 0.001]], 0.015, 10), c.primary, [0, 0, zt]);
    if (glowOn) f.add('glow', geo.ellipsoid(0.018, 0.018, 0.018, 6, 4), c.accent, [0, 0, zt]);
    base = new THREE.Vector3(0, 0, zt - 0.2);
    tip = new THREE.Vector3(0, 0, zt + 0.5);
  } else {
    // one-handed / two-handed: blade or axe / hammer head on a hilt
    const two = cat === 'two_handed' || TWO.has(t);
    if (two) gripKind = 'both';
    const L = two ? 1.3 : 0.85, W = two ? 0.12 : 0.065;
    const gl = two ? 0.3 : 0.18;
    grip(f, -gl, 0.09, two ? 0.019 : 0.016, c.secondary);
    f.add('metal', latheZ([[0, -gl - 0.04], [0.022, -gl - 0.03], [0.02, -gl], [0, -gl + 0.005]], 8), c.secondary);
    if (AXE.has(t) || BLUNT.has(t)) {
      const hz = two ? 0.9 : 0.5;
      f.add('matte', rodZ(0.02, 0.018, 0.09, hz + 0.1, f.seg(8, 6)), shade(c.primary, 0.5));
      if (BLUNT.has(t)) f.add('metal', geo.bevelBox(0.1, two ? 0.3 : 0.16, 0.12, 0.02), c.primary, [0, 0, hz]);
      else f.add('metal', bladeZ(two ? 0.3 : 0.18, [[0, two ? 0.16 : 0.1], [1, two ? 0.2 : 0.12]], 0.014, 4).rotateX(-Math.PI / 2), c.primary, [0, 0, hz]);
      tip = new THREE.Vector3(0, two ? 0.25 : 0.14, hz);
      base = new THREE.Vector3(0, 0, hz - 0.1);
    } else {
      f.add('metal', geo.bevelBox(0.03, two ? 0.3 : 0.2, 0.03, 0.008), shade(c.primary, 0.75), [0, 0, 0.1]);
      const curve = t === 'katana' || t === 'scimitarra' ? (u: number) => u * u * 0.06 : undefined;
      f.grad('metal', bladeZ(L, [[0, W / 2], [0.8, W * 0.42], [1, 0.001]], two ? 0.016 : 0.011, f.seg(14, 7), curve), 2, shade(c.primary, 0.8), mix(c.primary, '#ffffff', 0.3), [0, 0, 0.115]);
      if (glowOn) f.add('glow', geo.bevelBox(0.003, W * 0.18, L * 0.6, 0.001), c.accent, [0.0065, 0, 0.115 + L * 0.35]);
      base = new THREE.Vector3(0, 0, 0.2);
      tip = new THREE.Vector3(0, 0, 0.115 + L);
    }
  }
  const b = f.build();
  let off: THREE.Object3D | undefined;
  if (def.type === 'asce_gemelle' || def.type === 'kama_gemelle' || def.type === 'pugnali' || cat === 'fist') {
    off = b.root.clone();
    gripKind = cat === 'fist' ? 'fist' : 'dual';
  }
  return {
    root: b.root, base, tip, grip: gripKind, offhand: off, offBase: off ? base.clone() : undefined, offTip: off ? tip.clone() : undefined,
    def, triangles: b.triangles * (off ? 2 : 1),
    trail: { color: mix(c.accent, '#ffffff', 0.5), glow: c.accent, width: 0.9 },
    dispose: () => {
      for (const d of b.disposables) d.dispose();
      b.root.removeFromParent();
      off?.removeFromParent();
    },
  };
}

function grip(f: Forge, z0: number, z1: number, r: number, leather: string): void {
  f.add('matte', latheZ([[0, z0], [r, z0 + 0.005], [r, z1 - 0.005], [0, z1]], f.seg(8, 6)), leather);
  f.add('matte', wrapZ(r * 1.03, z0 + 0.01, z1 - 0.01, 6, r * 0.2, 3, f.seg(36, 16)), shade(leather, 0.62));
}
