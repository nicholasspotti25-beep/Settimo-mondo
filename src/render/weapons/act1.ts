/**
 * Weapon templates, Act I (the order a player meets them): spada_corta (Lama della Culla, the starter), lancia
 * (Lancia del Custode), spada_lunga (Brando del Viandante), bastone_magico (Ramo dell'Antico), mazza (Randello del
 * Pantano), spada_serpentina (Zanna Strisciante), alabarda (Remo del Traghettatore). Each is a type template
 * parameterized by the weapon's model params + colors; the Bible look is the default.
 */
import * as THREE from 'three';
import * as geo from '../kit/geometry';
import type { V3 } from '../kit/geometry';
import { Prng, seedOf } from '../kit/noise';
import { mix, shade } from '../kit/palette';
import type { WeaponDef } from '../../core/types';
import { Forge, bladeZ, inlay, latheZ, rodZ, wrapZ } from './forge';
import { colorsOf, num, type WeaponMorph, type WeaponTemplate, type WeaponVisual } from './types';

const TAU = Math.PI * 2;

function finish(def: WeaponDef, f: ReturnType<Forge['build']>, v: Omit<WeaponVisual, 'root' | 'dispose' | 'triangles' | 'def'>, extra: { dispose(): void }[] = []): WeaponVisual {
  return {
    ...v,
    def,
    root: f.root,
    triangles: f.triangles,
    dispose: () => {
      for (const d of f.disposables) d.dispose();
      for (const d of extra) d.dispose();
      f.root.removeFromParent();
    },
  };
}

/** Simple leather grip with a spiral wrap between z0 and z1. */
function grip(f: Forge, z0: number, z1: number, r: number, leather: string, turns = 6): void {
  f.add('matte', latheZ([[0, z0 - 0.004], [r * 0.95, z0], [r, z0 + (z1 - z0) * 0.2], [r * 0.92, (z0 + z1) / 2], [r, z0 + (z1 - z0) * 0.8], [r * 0.95, z1], [0, z1 + 0.003]], f.seg(10, 6)), leather);
  f.add('matte', wrapZ(r * 1.02, z0 + 0.008, z1 - 0.008, turns, r * 0.2, 4, f.seg(48, 20)), shade(leather, 0.62));
}

/* ================================================================================================================ */
/* Spada corta — Lama della Culla: plain worn steel, leather grip, bar guard, crescent pommel                       */
/* ================================================================================================================ */
export const spada_corta: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.36, metalness: 0.72 });
  const L = num(def, 'blade_len', 0.72), W = num(def, 'blade_w', 0.075), wear = num(def, 'wear', 0.5);
  const z0 = 0.112;
  grip(f, -0.105, 0.088, 0.0165, c.secondary, 5);
  // bar guard with rounded ends + a collar
  f.add('metal', geo.bevelBox(0.026, 0.19, 0.026, 0.009, 2), shade(c.primary, 0.78), [0, 0, 0.1]);
  for (const s of [-1, 1]) f.add('metal', geo.ellipsoid(0.017, 0.017, 0.019, f.seg(8, 6), f.seg(6, 4)), shade(c.primary, 0.85), [0, s * 0.097, 0.1]);
  f.add('metal', latheZ([[0.0, 0.086], [0.021, 0.088], [0.02, 0.112], [0, 0.114]], f.seg(10, 6)), shade(c.primary, 0.7));
  // blade: straight, slightly waisted, a short fuller; darker toward the guard (wear)
  const bl = bladeZ(L, [[0, W / 2], [0.08, W * 0.47], [0.62, W * 0.42], [0.86, W * 0.3], [1, 0.0008]], 0.0115, f.seg(18, 8));
  f.grad('metal', bl, 2, shade(c.primary, 1 - wear * 0.32), mix(c.primary, '#ffffff', 0.25), [0, 0, z0]);
  for (const s of [-1, 1]) f.add('metal', geo.bevelBox(0.003, W * 0.2, L * 0.52, 0.0012, 1), shade(c.primary, 0.52), [s * 0.0046, 0, z0 + 0.06 + L * 0.26]);
  // crescent pommel: a bone-pale crescent moon opening backward, a small cabochon in the middle
  const cres = geo.torus(0.034, 0.0085, f.seg(6, 4), f.seg(20, 10), Math.PI * 1.35);
  cres.rotateZ(Math.PI * 0.325);
  cres.rotateY(Math.PI / 2);
  f.add('metal', cres, c.accent, [0, 0, -0.105 - 0.032]);
  f.add('metal', geo.ellipsoid(0.012, 0.012, 0.012, 8, 6), shade(c.accent, 0.8), [0, 0, -0.112]);
  const b = f.build();
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, z0 + 0.08), tip: new THREE.Vector3(0, 0, z0 + L), grip: 'r',
    trail: { color: '#fff6e0', glow: '#ffd99a', width: 0.9 },
  });
};

/* ================================================================================================================ */
/* Spada lunga — Brando del Viandante: slim blade engraved with all the roads walked, long cross, lantern pommel     */
/* ================================================================================================================ */
export const spada_lunga: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.26, metalness: 0.82, glowIntensity: 1.5 });
  const L = num(def, 'blade_len', 1.0), W = num(def, 'blade_w', 0.06);
  const z0 = 0.13, th = 0.0105;
  grip(f, -0.17, 0.1, 0.0155, c.secondary, 8);
  // long cross guard, quillons swept slightly toward the blade, finials
  const guard = geo.tube([[0, -0.16, 0.135], [0, -0.09, 0.118], [0, 0, 0.112], [0, 0.09, 0.118], [0, 0.16, 0.135]], (t) => 0.0085 + 0.006 * Math.sin(t * Math.PI), { radial: f.seg(6, 4), perSeg: 3 });
  f.add('metal', guard, shade(c.primary, 0.82));
  for (const s of [-1, 1]) f.add('metal', geo.ellipsoid(0.011, 0.013, 0.011, 8, 6), c.accent, [0, s * 0.165, 0.137]);
  f.add('metal', geo.bevelBox(0.03, 0.05, 0.03, 0.008), shade(c.primary, 0.7), [0, 0, 0.115]);
  // slim blade with a ricasso and a long taper
  const bl = bladeZ(L, [[0, W * 0.5], [0.06, W * 0.5], [0.08, W * 0.44], [0.75, W * 0.38], [0.92, W * 0.24], [1, 0.0006]], th, f.seg(20, 10));
  f.grad('metal', bl, 2, shade(c.primary, 0.82), mix(c.primary, '#ffffff', 0.35), [0, 0, z0]);
  // the roads: a winding engraved line on each flat that branches and rejoins, faintly lit like a far lantern
  const rng = new Prng(seedOf(def.id));
  const roads: V3[][] = [[], []];
  const n = f.seg(26, 12);
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = z0 + 0.07 + t * L * 0.78;
    const w = W * 0.3 * (1 - t * 0.45);
    roads[0].push([0, Math.sin(t * 13.5 + 0.4) * w * 0.8 + (rng.next() - 0.5) * w * 0.25, z]);
    if (t > 0.18 && t < 0.62) roads[1].push([0, Math.sin(t * 9 + 2.2) * w * 0.9, z]);
  }
  const road = shade(c.accent, 0.82);
  for (const s of [-1, 1]) {
    for (const r of roads) {
      if (r.length < 2) continue;
      const pts = r.map(([, y, z]) => [s * (th * 0.5 + 0.0004), y, z] as V3);
      f.add('glow', inlay(pts, 0.0016, 3), road);
    }
  }
  // lantern pommel: a tiny cage with a warm glass core
  const pz = -0.215;
  f.add('glow', geo.ellipsoid(0.017, 0.017, 0.024, 8, 6), c.accent, [0, 0, pz]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    f.add('metal', rodZ(0.0028, 0.0028, pz - 0.028, pz + 0.028, 4), shade(c.secondary, 0.9), [Math.cos(a) * 0.021, Math.sin(a) * 0.021, 0]);
  }
  f.add('metal', latheZ([[0, pz - 0.046], [0.012, pz - 0.042], [0.024, pz - 0.028], [0.0, pz - 0.026]], f.seg(10, 6)), shade(c.primary, 0.7));
  f.add('metal', latheZ([[0, pz + 0.026], [0.024, pz + 0.028], [0.016, pz + 0.042], [0.012, -0.17], [0, -0.168]], f.seg(10, 6)), shade(c.primary, 0.7));
  const b = f.build();
  const glow = b.materials.glow;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, z0 + 0.1), tip: new THREE.Vector3(0, 0, z0 + L), grip: 'r',
    trail: { color: '#fff0d0', glow: '#e8b860', width: 1.0 },
    morph(m: WeaponMorph) {
      if (glow) glow.emissiveIntensity = 1.3 + m.art * 2.2 + m.swing * 0.4;
    },
    update(_dt, time) {
      if (glow) glow.emissiveIntensity += Math.sin(time * 3.1) * 0.12 + Math.sin(time * 7.7) * 0.06;
    },
  });
};

/* ================================================================================================================ */
/* Lancia — Lancia del Custode: long white shaft, gold bands and vamplate, leaf head engraved with a crown           */
/* ================================================================================================================ */
export const lancia: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.3, metalness: 0.7, matteRough: 0.42, matteDetail: 'noise', matteDetailScale: 6, glowIntensity: 1.6 });
  const S = num(def, 'shaft_len', 2.25), HL = num(def, 'head_len', 0.52), HW = num(def, 'head_w', 0.13);
  const zb = -S * 0.32, zt = zb + S;
  const ivory = c.primary, gold = c.secondary;
  // white shaft: thick at the grip, tapering toward the head
  f.grad('matte', latheZ([[0, zb], [0.024, zb + 0.01], [0.026, zb + 0.2], [0.025, 0.0], [0.027, 0.3], [0.022, zt - 0.4], [0.018, zt], [0, zt + 0.002]], f.seg(12, 7)), 2, shade(ivory, 0.88), ivory);
  // gold spiral inlay along the shaft (the Custode's crown-gold)
  f.add('metal', wrapZ(0.0235, 0.4, zt - 0.1, 4.5, 0.0032, 4, f.seg(80, 36)), gold);
  // bands, butt cap
  for (const z of [zb + 0.012, -0.12, 0.12, zt - 0.05]) f.add('metal', latheZ([[0.0262, z - 0.016], [0.0295, z - 0.01], [0.0295, z + 0.01], [0.0262, z + 0.016]], f.seg(12, 7)), gold);
  f.add('metal', latheZ([[0, zb - 0.06], [0.014, zb - 0.055], [0.026, zb - 0.02], [0.027, zb + 0.01], [0, zb + 0.01]], f.seg(12, 7)), gold);
  // vamplate: a fluted cone protecting the hand, wide toward the grip, gold rim
  const vz = 0.16;
  f.grad('metal', latheZ([[0.028, vz + 0.24], [0.04, vz + 0.17], [0.07, vz + 0.07], [0.108, vz], [0.112, vz - 0.008], [0.03, vz - 0.004]], f.seg(18, 10)), 2, '#fbf6ea', shade(ivory, 0.92));
  f.add('metal', geo.torus(0.11, 0.0055, 5, f.seg(28, 14)), gold, [0, 0, vz - 0.004]);
  // socket collar + leaf head with a midrib
  f.add('metal', latheZ([[0.018, zt - 0.08], [0.024, zt - 0.06], [0.021, zt + 0.02], [0.012, zt + 0.06], [0, zt + 0.065]], f.seg(12, 7)), gold);
  const h0 = zt + 0.02;
  const head = bladeZ(HL, [[0, 0.012], [0.1, HW * 0.36], [0.34, HW * 0.5], [0.72, HW * 0.34], [0.93, HW * 0.1], [1, 0.0006]], 0.017, f.seg(20, 10));
  f.grad('metal', head, 2, '#e9e6dc', '#ffffff', [0, 0, h0]);
  for (const s of [-1, 1]) f.add('metal', inlay([[s * 0.0088, 0, h0 + 0.04], [s * 0.0088, 0, h0 + HL * 0.9]], 0.0022, 3), '#f6f2e4');
  // crown engraving on both flats: band + five points, two of them broken (the Regno's broken crown)
  const cz = h0 + HL * 0.18, cw = HW * 0.34, ch = HL * 0.16;
  for (const s of [-1, 1]) {
    const x = s * 0.0094;
    f.add('glow', inlay([[x, -cw, cz], [x, cw, cz]], 0.0021, 3), c.accent);
    const pts: V3[] = [];
    const tips = [1, 0.45, 1, 0.5, 1];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8, y = -cw + k * cw * 2;
      const up = i % 2 === 0 ? tips[i / 2] : 0.25;
      pts.push([x, y, cz + ch * up]);
    }
    f.add('glow', inlay(pts, 0.0017, 3), c.accent);
  }
  const b = f.build();
  const glow = b.materials.glow;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, zt - 0.3), tip: new THREE.Vector3(0, 0, h0 + HL), grip: 'both',
    trail: { color: '#ffffff', glow: '#ffe6a8', width: 1.1 },
    morph(m) {
      if (glow) glow.emissiveIntensity = 1.4 + m.art * 2.6;
    },
  });
};

/* ================================================================================================================ */
/* Bastone magico — Ramo dell'Antico: living twisted wood, a seed of light cradled in branchlets, color-cycling      */
/* leaves, small mushrooms                                                                                          */
/* ================================================================================================================ */
const LEAF_CYCLE = ['#7fc85a', '#b8d84a', '#e8c048', '#e07a3a', '#c04a5a', '#9a6ad8', '#5ab88a'];
export const bastone_magico: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { matteRough: 0.85, matteDetail: 'bark', matteDetailScale: 18, glowIntensity: 2.0 });
  const S = num(def, 'staff_len', 1.75), twist = num(def, 'twist', 0.6), nLeaves = Math.round(num(def, 'leaves', 9)), nMush = Math.round(num(def, 'mushrooms', 3));
  const rng = new Prng(seedOf(def.id));
  const zb = -S * 0.3, zt = zb + S;
  const wood = c.primary;
  // two strands twisted around each other + a thin core
  const n = f.seg(22, 12);
  for (const ph of [0, Math.PI]) {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = ph + t * twist * TAU * 2.2, r = 0.011 + 0.004 * Math.sin(t * 9 + ph);
      pts.push([Math.cos(a) * r + Math.sin(t * 5.3) * 0.006, Math.sin(a) * r, zb + t * (S - 0.12)]);
    }
    f.grad('matte', geo.tube(pts, (t) => 0.017 - t * 0.006 + (t < 0.05 ? 0.004 : 0), { radial: f.seg(7, 5), perSeg: 2 }), 2, shade(wood, 0.8), mix(wood, '#6a5038', 0.35));
  }
  // knots
  for (let i = 0; i < 4; i++) f.add('matte', geo.rock(0.017, 0, 11 + i, 0.3, [1, 1, 1.4]), shade(wood, 0.9), [(rng.next() - 0.5) * 0.02, (rng.next() - 0.5) * 0.02, zb + 0.2 + i * S * 0.2]);
  // branchlets at the top curling around the seed
  const seedZ = zt + 0.02;
  const nb = 4;
  const branchTips: V3[] = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + 0.3;
    const pts: V3[] = [
      [0, 0, zt - 0.16],
      [Math.cos(a) * 0.035, Math.sin(a) * 0.035, zt - 0.08],
      [Math.cos(a) * 0.065, Math.sin(a) * 0.065, zt],
      [Math.cos(a + 0.5) * 0.05, Math.sin(a + 0.5) * 0.05, zt + 0.08],
      [Math.cos(a + 0.9) * 0.018, Math.sin(a + 0.9) * 0.018, zt + 0.11],
    ];
    branchTips.push(pts[3]);
    f.add('matte', geo.tube(pts, (t) => 0.011 * (1 - t * 0.75), { radial: f.seg(6, 4), perSeg: 3 }), mix(wood, '#5a4630', 0.3));
  }
  // the seed of light (glow) + a faint inner ring of motes (glow beads)
  f.add('glow', geo.ellipsoid(0.03, 0.03, 0.036, f.seg(12, 8), f.seg(10, 6)), c.accent, [0, 0, seedZ]);
  // mushrooms along the shaft (pale caps with glowing gills)
  for (let i = 0; i < nMush; i++) {
    const z = zb + S * (0.22 + i * 0.13), a = i * 2.1 + 0.6;
    const ox = Math.cos(a) * 0.02, oy = Math.sin(a) * 0.02;
    const cap = geo.lathe([[0, 0.014], [0.012, 0.012], [0.019, 0.004], [0.017, 0], [0.004, 0.0]], f.seg(9, 6));
    f.add('matte', cap, mix('#e8dcc0', c.secondary, 0.15), [ox * 1.3, oy * 1.3, z], [0, 0, (a * 180) / Math.PI - 90]);
    f.add('glow', geo.ellipsoid(0.012, 0.002, 0.012, 6, 3), shade(c.secondary, 1.15), [ox * 1.3, oy * 1.3, z]);
  }
  // leaves on their own material: their color slowly cycles through the seasons it never saw
  const leafGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < nLeaves; i++) {
    const bt = branchTips[i % nb];
    const lg = geo.leaf(0.075 + rng.next() * 0.03, 0.035, 4, 0.25, 0.2);
    const ax = Math.atan2(bt[1], bt[0]);
    geo.xform(lg, undefined, [-40 - rng.next() * 40, 0, (ax * 180) / Math.PI - 90 + (rng.next() - 0.5) * 50]);
    const along = i < nb ? 0 : -0.05 - rng.next() * 0.12;
    geo.xform(lg, [bt[0] * (1 + rng.next() * 0.3), bt[1] * (1 + rng.next() * 0.3), bt[2] + along]);
    geo.gradient(lg, 2, '#ffffff', '#d8d8d8');
    leafGeos.push(lg);
  }
  const leafMat = ctx.kit.surface({ vertexColors: true, color: LEAF_CYCLE[0], emissive: LEAF_CYCLE[0], emissiveIntensity: 0.25, roughness: 0.7, metalness: 0, detail: null, rim: 1.2, side: THREE.DoubleSide });
  const leafGeo = geo.mergeGeometries(leafGeos);
  for (const g of leafGeos) g.dispose();
  const leaves = new THREE.Mesh(leafGeo, leafMat);
  leaves.frustumCulled = false;
  const b = f.build();
  b.root.add(leaves);
  b.triangles += geo.triCount(leafGeo);
  const glow = b.materials.glow;
  const ca = new THREE.Color(), cb = new THREE.Color();
  let art = 0;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, zt - 0.3), tip: new THREE.Vector3(0, 0, seedZ), grip: 'r',
    trail: { color: '#efffd0', glow: '#7fc85a', width: 0.7 },
    morph(m) {
      art = m.art;
    },
    update(_dt, time) {
      const u = (time / 3.2) % LEAF_CYCLE.length;
      const i = Math.floor(u), k = u - i;
      ca.set(LEAF_CYCLE[i]);
      cb.set(LEAF_CYCLE[(i + 1) % LEAF_CYCLE.length]);
      ca.lerp(cb, k * k * (3 - 2 * k));
      leafMat.color.copy(ca);
      leafMat.emissive.copy(ca);
      leafMat.emissiveIntensity = 0.22 + art * 0.9;
      if (glow) glow.emissiveIntensity = 1.8 + Math.sin(time * 2.4) * 0.35 + art * 3.0;
    },
  }, [leafGeo, leafMat]);
};

/* ================================================================================================================ */
/* Mazza — Randello del Pantano: black knotted wood, reed bundle lashed on the head, spent lanterns and bones        */
/* hanging from it, a marsh-light flicker                                                                           */
/* ================================================================================================================ */
export const mazza: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { matteRough: 0.9, matteDetail: 'bark', matteDetailScale: 16, metalRough: 0.6, metalness: 0.4, glowIntensity: 1.4 });
  const HL = num(def, 'haft_len', 0.85), HR = num(def, 'head_r', 0.16);
  const nReeds = Math.round(num(def, 'reeds', 10)), nLant = Math.round(num(def, 'lanterns', 3)), nBones = Math.round(num(def, 'bones', 2));
  const rng = new Prng(seedOf(def.id));
  const zb = -0.17, zh = zb + HL;
  const wood = c.primary;
  // haft: black wood, slightly crooked, thicker toward the head
  f.grad('matte', geo.tube([[0, 0, zb], [0.004, -0.003, zb + HL * 0.35], [-0.006, 0.004, zb + HL * 0.7], [0, 0, zh]], (t) => 0.019 + t * 0.012, { radial: f.seg(9, 6), perSeg: 3 }), 2, shade(wood, 0.9), mix(wood, '#3a3020', 0.4));
  grip(f, zb + 0.01, zb + 0.19, 0.022, mix(c.secondary, '#2a2418', 0.55), 5);
  // the head: a knotted burl of bog oak
  const head = geo.rock(HR, f.q >= 1 ? 2 : 1, 7, 0.32, [0.82, 0.82, 1.15]);
  f.grad('matte', head, 2, mix(wood, '#3a3424', 0.3), shade(wood, 1.3), [0, 0, zh]);
  // reeds lashed around the head, pointing up past it
  for (let i = 0; i < nReeds; i++) {
    const a = (i / nReeds) * TAU + rng.next() * 0.3, r = HR * 0.78;
    const len = HR * (1.6 + rng.next() * 1.0);
    const reed = geo.spike(0.0065, len, 4, (rng.next() - 0.5) * 0.04);
    reed.rotateX(Math.PI / 2);
    f.add('matte', reed, mix(c.secondary, '#c8c070', rng.next() * 0.35), [Math.cos(a) * r, Math.sin(a) * r, zh - HR * 0.75], [Math.sin(a) * -8, Math.cos(a) * 8, 0]);
    // reed seed-heads (cattails) on a few
    if (i % 3 === 0) f.add('matte', geo.capsule(0.011, 0.04, 5, 2), '#4a3424', [Math.cos(a) * (r + 0.01), Math.sin(a) * (r + 0.01), zh - HR * 0.75 + len * 0.86], [90, 0, 0]);
  }
  // cord lashings
  for (const dz of [-0.45, 0.05]) f.add('matte', geo.torus(HR * 0.86, 0.007, 4, f.seg(24, 12)), '#6a5a3a', [0, 0, zh + dz * HR]);
  // bones tied crosswise
  for (let i = 0; i < nBones; i++) {
    const a = i * 2.4 + 0.8;
    const bz = zh - HR * 0.2;
    const g = geo.capsule(0.009, 0.13, 5, 2);
    f.add('matte', g, '#d8ccb0', [Math.cos(a) * HR * 0.95, Math.sin(a) * HR * 0.95, bz], [0, 0, (a * 180) / Math.PI]);
    for (const s of [-1, 1]) f.add('matte', geo.ellipsoid(0.015, 0.012, 0.012, 6, 4), '#e0d4b8', [Math.cos(a) * HR * 0.95 - Math.sin(a) * s * 0.072, Math.sin(a) * HR * 0.95 + Math.cos(a) * s * 0.072, bz]);
  }
  // hanging lanterns: pieces on cords, swinging; dim marsh light inside
  const lanterns: THREE.Object3D[] = [];
  for (let i = 0; i < nLant; i++) {
    const a = (i / nLant) * TAU + 0.5;
    const cord = rodZ(0.0022, 0.0022, -0.09, 0, 3);
    const body = latheZ([[0, -0.15], [0.016, -0.145], [0.024, -0.125], [0.024, -0.098], [0.016, -0.09], [0, -0.088]], f.seg(8, 6));
    const p = f.piece('metal', [cord, geo.paint(body, '#4a4436')], null, [Math.cos(a) * HR * 0.9, Math.sin(a) * HR * 0.9, zh - HR * 0.55]);
    geo.paint(cord, '#3a3226');
    f.piece('glow', [geo.paint(geo.ellipsoid(0.013, 0.013, 0.018, 6, 4).translate(0, 0, -0.12), c.accent)], p);
    p.userData.phase = rng.next() * TAU;
    lanterns.push(p);
  }
  const b = f.build();
  const glow = b.materials.glow;
  let art = 0;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, zh - HR * 0.6), tip: new THREE.Vector3(0, 0, zh + HR * 1.1), grip: 'r',
    trail: { color: '#e8f0c0', glow: '#7a8a4a', width: 0.85 },
    morph(m) {
      art = m.art;
    },
    update(_dt, time) {
      for (const l of lanterns) {
        const ph = l.userData.phase as number;
        // hang "down" the haft (the hand is below the head most of the time) and sway
        l.rotation.set(Math.PI + Math.sin(time * 2.3 + ph) * 0.35, Math.sin(time * 1.7 + ph * 1.3) * 0.3, 0);
      }
      if (glow) glow.emissiveIntensity = 0.9 + Math.max(0, Math.sin(time * 5.3) * Math.sin(time * 1.3 + 1)) * 0.9 + art * 2.6;
    },
  });
};

/* ================================================================================================================ */
/* Spada serpentina — Zanna Strisciante: scale segments on a venom cord, a serpent-head guard, a fang tip; the      */
/* blade extends like a whip (morph.extend)                                                                         */
/* ================================================================================================================ */
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _pv = new THREE.Vector3();
const _sv = new THREE.Vector3(1, 1, 1);
export const spada_serpentina: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { metalRough: 0.32, metalness: 0.6, glowIntensity: 2.0 });
  const N = Math.max(4, Math.round(num(def, 'segments', 9))), SL = num(def, 'seg_len', 0.11), W = num(def, 'blade_w', 0.07), EXT = num(def, 'extend', 4.6);
  const z0 = 0.2;
  grip(f, -0.13, 0.07, 0.016, c.secondary, 7);
  f.add('metal', latheZ([[0, -0.16], [0.018, -0.155], [0.022, -0.14], [0.016, -0.13], [0, -0.128]], f.seg(10, 6)), shade(c.primary, 0.7));
  // serpent-head guard: the blade comes out of the open jaws
  f.grad('metal', geo.ellipsoid(0.034, 0.048, 0.07, f.seg(12, 8), f.seg(9, 6)), 2, shade(c.primary, 0.6), c.primary, [0, 0, 0.13]);
  f.add('metal', geo.spike(0.022, 0.07, f.seg(6, 4), 0).rotateX(Math.PI / 2), shade(c.primary, 0.8), [0, 0.028, 0.15], [-14, 0, 0]);
  f.add('metal', geo.spike(0.02, 0.06, f.seg(6, 4), 0).rotateX(Math.PI / 2), shade(c.primary, 0.75), [0, -0.026, 0.15], [14, 0, 0]);
  for (const s of [-1, 1]) {
    f.add('glow', geo.ellipsoid(0.0075, 0.0075, 0.011, 6, 4), c.accent, [s * 0.03, 0.02, 0.16]);
    f.add('metal', geo.spike(0.004, 0.03, 4, 0).rotateX(Math.PI / 2), '#f0f0e0', [s * 0.008, 0.02, 0.17], [22, 0, 0]);
  }
  // one scale segment (instanced N - 1 times) + the fang tip
  const segGeo = bladeZ(SL * 1.22, [[0, W * 0.32], [0.3, W * 0.5], [0.75, W * 0.36], [1, 0.004]], 0.011, f.seg(8, 5));
  geo.gradient(segGeo, 2, shade(c.primary, 0.55), mix(c.primary, c.accent, 0.3));
  const ridge = rodZ(0.0045, 0.002, 0.005, SL * 1.05, 4);
  geo.paint(ridge, shade(c.secondary, 1.4));
  const segMerged = geo.mergeGeometries([segGeo, ridge]);
  segGeo.dispose();
  ridge.dispose();
  const segs = f.instanced('metal', segMerged, N - 1);
  const fang = geo.horn(SL * 1.7, W * 0.32, 0.5, 0, f.seg(8, 5), f.seg(6, 4));
  fang.rotateX(Math.PI / 2);
  fang.rotateZ(Math.PI / 2);
  geo.gradient(fang, 2, mix(c.primary, '#e8e8d0', 0.5), '#f4f4e4');
  const fangPiece = f.piece('metal', [fang]);
  // the venom cord between segments (visible as the blade extends)
  const cordGeo = rodZ(0.004, 0.004, 0, 1, 4);
  geo.paint(cordGeo, c.accent);
  const cord = f.piece('glow', [cordGeo], null, [0, 0, z0]);
  const b = f.build();
  const glow = b.materials.glow;
  const tip = new THREE.Vector3(0, 0, z0 + N * SL);
  const pts = new Float32Array((N + 1) * 3);
  let ext = 0, art = 0, sw = 0, extNow = 0, time = 0;
  const place = (): void => {
    const L0 = N * SL, L = L0 + (EXT - L0) * extNow;
    const gap = L / N;
    // centre line: straight when sheathed, a travelling S-wave in the edge plane while extended
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const amp = extNow * (0.16 + sw * 0.1) * Math.sin(t * Math.PI);
      pts[i * 3] = extNow * Math.sin(t * 5 - time * 9) * 0.05 * t;
      pts[i * 3 + 1] = amp * Math.sin(t * 7.5 - time * 13);
      pts[i * 3 + 2] = z0 + gap * i;
    }
    const im = segs.mesh();
    for (let i = 0; i < N; i++) {
      const x0 = pts[i * 3], y0 = pts[i * 3 + 1], zz0 = pts[i * 3 + 2];
      const x1 = pts[i * 3 + 3], y1 = pts[i * 3 + 4], zz1 = pts[i * 3 + 5];
      const dz = zz1 - zz0;
      _e.set(-Math.atan2(y1 - y0, dz), Math.atan2(x1 - x0, dz), 0);
      _q.setFromEuler(_e);
      _pv.set(x0, y0, zz0);
      if (i < N - 1) {
        _m4.compose(_pv, _q, _sv);
        im?.setMatrixAt(i, _m4);
      } else {
        fangPiece.position.copy(_pv);
        fangPiece.quaternion.copy(_q);
      }
    }
    if (im) im.instanceMatrix.needsUpdate = true;
    tip.set(pts[N * 3], pts[N * 3 + 1], pts[N * 3 + 2] + SL * 0.6);
    cord.scale.set(1, 1, Math.max(1e-3, L));
    cord.visible = extNow > 0.04;
  };
  place();
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, z0 + 0.1), tip, grip: 'r',
    trail: { color: '#e8ffb0', glow: '#a8d060', width: 1.0 },
    morph(m) {
      ext = m.extend;
      art = m.art;
      sw = m.swing;
    },
    update(dt, t) {
      time = t;
      // extend fast, retract a little slower (the segments rattle home)
      const k = ext > extNow ? 1 - Math.exp(-dt * 26) : 1 - Math.exp(-dt * 9);
      extNow += (ext - extNow) * k;
      if (extNow < 1e-3) extNow = 0;
      place();
      if (glow) glow.emissiveIntensity = 1.6 + extNow * 1.2 + art * 2.4;
    },
  });
};

/* ================================================================================================================ */
/* Alabarda — Remo del Traghettatore: long black oar, a paddle blade sharpened on one edge, a back hook, a ferryman  */
/* lantern hanging below the blade with a pale spirit light, faint runes                                            */
/* ================================================================================================================ */
export const alabarda: WeaponTemplate = (def, ctx) => {
  const c = colorsOf(def);
  const f = new Forge(ctx, { matteRough: 0.55, matteDetail: 'bark', matteDetailScale: 8, metalRough: 0.4, metalness: 0.65, glowIntensity: 2.2 });
  const S = num(def, 'shaft_len', 2.2), BL = num(def, 'blade_len', 0.62), BW = num(def, 'blade_w', 0.26);
  const zb = -S * 0.33, zt = zb + S;
  const black = c.primary, slate = c.secondary;
  // the oar shaft: black wood, worn paler where hands rowed
  f.grad('matte', latheZ([[0, zb], [0.022, zb + 0.01], [0.024, zb + 0.3], [0.025, 0], [0.024, zt - 0.2], [0.03, zt], [0, zt + 0.01]], f.seg(12, 7)), 2, mix(black, '#3a3a44', 0.4), black);
  for (const z of [zb + 0.02, -0.25, 0.32, zt - 0.08]) f.add('metal', latheZ([[0.025, z - 0.018], [0.029, z - 0.012], [0.029, z + 0.012], [0.025, z + 0.018]], f.seg(12, 7)), slate);
  // oarlock collar
  f.add('metal', geo.torus(0.034, 0.008, 5, f.seg(18, 10)), shade(slate, 0.8), [0, 0, 0.55]);
  // paddle blade: flat, broad, the +Y edge ground to a pale cutting edge
  const z0 = zt - 0.04;
  const prof: [number, number][] = [[0, 0.03], [0.12, BW * 0.36], [0.42, BW * 0.5], [0.82, BW * 0.47], [0.96, BW * 0.3], [1, BW * 0.12]];
  f.grad('metal', bladeZ(BL, prof, 0.02, f.seg(18, 9)), 2, shade(slate, 0.7), slate, [0, 0, z0]);
  const edge: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = 0.1 + i * 0.088;
    let w = 0;
    for (let j = 1; j < prof.length; j++) if (t <= prof[j][0]) { const k = (t - prof[j - 1][0]) / (prof[j][0] - prof[j - 1][0]); w = prof[j - 1][1] + (prof[j][1] - prof[j - 1][1]) * k; break; }
    edge.push([0, w + 0.001, z0 + t * BL]);
  }
  f.add('metal', inlay(edge, 0.0055, 4), '#d8e4ec');
  // the back hook (halberd fluke)
  const hook = geo.horn(0.17, 0.022, -0.9, 0, f.seg(8, 5), f.seg(6, 4));
  hook.rotateX(-Math.PI / 2);
  f.add('metal', hook, shade(slate, 0.85), [0, -0.03, z0 + 0.04], [0, 0, 180]);
  // runes of the river on both flats (spirit glow)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = z0 + BL * (0.28 + i * 0.2);
      f.add('glow', inlay([[s * 0.0105, -BW * 0.18, z], [s * 0.0105, -BW * 0.05, z + 0.025], [s * 0.0105, BW * 0.08, z], [s * 0.0105, BW * 0.2, z + 0.03]], 0.0024, 3), c.accent);
    }
  }
  // the ferryman lantern on a short chain below the blade
  const lp = f.piece('metal', [
    geo.paint(rodZ(0.0025, 0.0025, -0.07, 0, 3), '#2a2a30'),
    geo.paint(latheZ([[0, -0.17], [0.03, -0.16], [0.036, -0.12], [0.03, -0.085], [0.012, -0.072], [0, -0.07]], f.seg(9, 6)), '#2a3038'),
  ], null, [0, -0.035, zt - 0.1]);
  f.piece('glow', [geo.paint(geo.ellipsoid(0.02, 0.02, 0.028, 7, 5).translate(0, 0, -0.122), c.accent)], lp);
  const b = f.build();
  const glow = b.materials.glow;
  let art = 0;
  return finish(def, b, {
    base: new THREE.Vector3(0, 0, z0 + 0.05), tip: new THREE.Vector3(0, 0, z0 + BL), grip: 'both',
    trail: { color: '#d8f8ff', glow: '#5ab8d8', width: 1.1 },
    morph(m) {
      art = m.art;
    },
    update(_dt, time) {
      lp.rotation.set(Math.PI * 0.5 + Math.sin(time * 1.9) * 0.3, Math.sin(time * 1.3) * 0.25, 0);
      if (glow) glow.emissiveIntensity = 1.8 + Math.sin(time * 2.7) * 0.3 + art * 3.0;
    },
  });
};

export const ACT1_TEMPLATES: Record<string, WeaponTemplate> = { spada_corta, spada_lunga, lancia, bastone_magico, mazza, spada_serpentina, alabarda };
