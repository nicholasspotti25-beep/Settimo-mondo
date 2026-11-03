/**
 * Guardiano del Regno — reference boss model (docs/RENDER_KIT.md, "worked example").
 *
 * A knight in dull silver plate on a barded destrier, helm shaped like a broken crown, the Lancia del Custode in the
 * right hand (long white shaft, leaf-shaped head engraved with a crown). Built on the mounted rig family so every clip
 * of data/anim/mounted.yaml drives it (charge / thrust / overhead / sweep_r / rear_stomp ...). Proportions line up with
 * data/bosses/guardiano_del_regno.yaml: horse chest hurtbox at z +0.9 / y 1.4, barrel at z -0.8 / y 1.5, rider torso at
 * y 3.2, helm at y 4.0; the couched lance reaches ~6 m forward (lance_thrust_combo capsules end at z 6.0..6.4).
 * Flag 'spectral_aura' (phase 2 on_enter) wraps only the steed (its own surfaces) in a pale spectral shell; the steed's
 * eyes and the lance's leaf edge burn brighter while it is set.
 */
import * as THREE from 'three';
import type { BossDef, MinionDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import type { ActorVisual, BossModelBuilder, RenderCtx } from '../../../render/types';
import * as geo from '../../../render/kit/geometry';
import { pal } from '../../../render/kit/index';
import { mix, shade } from '../../../render/kit/palette';
import type { ModelBuilder } from '../../../render/kit/model';
import { profile, standardSurfaces, type SurfaceIds } from '../../../render/rigs/families/common';
import { humanoidBody } from '../../../render/rigs/families/humanoid';
import { quadrupedBody, type QuadrupedDims } from '../../../render/rigs/families/quadruped';
import { mountedSkeleton, type MountedDims } from '../../../render/rigs/families/mounted';
import { RigVisual } from '../../../render/rigs/visual';

/** Colors (dull silver knight, slate destrier, green-and-gold caparison of the old Regno). */
function colors(ctx: RenderCtx, def: BossDef | MinionDef) {
  const P = pal(ctx, def.model?.palette ?? 'act1_green_gold');
  return {
    silver: mix(P.metal, '#8c9094', 0.5),
    silverDark: shade(mix(P.metal, '#8c9094', 0.5), 0.62),
    gold: mix(P.secondary, '#a08850', 0.35),
    goldLight: P.accent,
    green: shade(P.primary, 0.78),
    greenDark: mix(P.dark, P.primary, 0.25),
    coat: '#55565e',
    coatBelly: '#75767c',
    coatDark: '#2a2a30',
    mane: '#dcdcd4',
    leather: '#3b2b22',
    ivory: '#ece7da',
    leafSteel: '#e6ebee',
    glow: P.glow,
    spectral: '#c4e8ff',
  };
}
type Colors = ReturnType<typeof colors>;

/* ---------------------------------------------------------------------------------------------------------------- */
/* Steed barding                                                                                                     */
/* ---------------------------------------------------------------------------------------------------------------- */

/**
 * Caparison: one sheet draped over the barrel from the left hem across the back to the right hem, dagged hem, gold
 * trim band, skinned to body/spine/chest with Bernstein weights along the body so rearing and galloping bend it.
 */
function caparison(mb: ModelBuilder, q: QuadrupedDims, surface: string, C: Colors): void {
  const body = mb.restPos('body'), chest = mb.restPos('chest');
  const z0 = body.z - 0.3 * q.L, z1 = chest.z + 0.12 * q.L;
  // clears the hind thighs / shoulders (leg tubes reach ~1.4 w out) and the barrel top
  const half = q.w * 1.36, top = q.w * 1.16;
  const nu = mb.seg(26, 12), nv = mb.seg(24, 10);
  const pos: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const bi = mb.boneIndex('body'), spi = mb.boneIndex('spine'), ci = mb.boneIndex('chest');
  const cA = new THREE.Color(C.green), cD = new THREE.Color(C.greenDark), cT = new THREE.Color(C.gold), tmp = new THREE.Color();
  const dags = 9, folds = 6, wrap = 0.5, wrapAng = Math.PI * 0.6;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const z = z0 + (z1 - z0) * u;
    const cy = body.y + (chest.y - body.y) * u;
    // ends round in (rump, breast)
    const endK = (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, 0.1 + u * 0.9))) * (1 + 0.12 * Math.max(0, 1 - u * 2.2));
    // hem: lowest at mid-flank, rising toward breast and rump so the legs read; dagged scallops
    const hemMid = 0.6 * q.h, rise = Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 0.2 * q.h;
    const dag = Math.pow(Math.abs(Math.sin(u * Math.PI * dags)), 0.5) * 0.085 * q.h;
    for (let j = 0; j <= nv; j++) {
      const s = (j / nv) * 2 - 1; // -1 right hem .. 0 spine .. +1 left hem
      const side = Math.sign(s) || 1, a = Math.abs(s);
      let x: number, y: number;
      let hem = 0;
      if (a <= wrap) {
        const ang = (a / wrap) * wrapAng;
        x = Math.sin(ang) * half * endK * side;
        y = cy + Math.cos(ang) * top * endK;
      } else {
        hem = (a - wrap) / (1 - wrap);
        const yStart = cy + Math.cos(wrapAng) * top * endK;
        const yEnd = hemMid + rise - dag;
        y = yStart + (yEnd - yStart) * hem;
        // soft vertical folds growing toward the hem + a little flare
        const fold = Math.sin(u * Math.PI * folds * 2 + 0.6) * 0.035 * q.h * hem;
        x = (Math.sin(wrapAng) * half * endK + hem * hem * 0.07 * q.h + fold) * side;
      }
      pos.push(x, y, z);
      const t = THREE.MathUtils.clamp((z - body.z) / Math.max(1e-3, chest.z - body.z), 0, 1);
      si.push(bi, spi, ci, 0);
      sw.push((1 - t) * (1 - t), 2 * t * (1 - t), t * t, 0);
      // deep green, darker in the folds' hollows and toward the hem; gold border band and a gold line on the spine
      const hollow = a > wrap ? 0.5 + 0.5 * Math.sin(u * Math.PI * folds * 2 + 0.6) : 1;
      tmp.copy(cA).lerp(cD, hem * 0.5 + (1 - hollow) * 0.25 * hem);
      if (hem > 0.8 && hem < 0.92) tmp.copy(cT);
      if (a < 0.03) tmp.copy(cT);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  mb.addRaw(surface, g);
  // heraldry: the Regno's broken crown in gold on each flank
  const spine = mb.restPos('spine');
  for (const sx of [-1, 1]) {
    const emblem = geo.crown(0.2 * q.h * 0.5, 0.05 * q.h, 5, 0.12 * q.h, [1], 0.012, mb.seg(14, 8));
    emblem.scale(1, 1, 0.12);
    emblem.rotateY(sx * Math.PI / 2);
    emblem.translate(sx * (Math.sin(wrapAng) * half + 0.06 * q.h * 0.25 + 0.01), q.h * 0.74, spine.z);
    mb.partModel('spine', emblem, surface, C.goldLight);
  }
}

function barding(mb: ModelBuilder, q: QuadrupedDims, S: SurfaceIds, C: Colors): void {
  const h = q.h, L = q.L, w = q.w;
  caparison(mb, q, S.cape, C);
  // peytral: curved breastplate over the chest front with a gold boss and rim
  mb.part('chest', geo.plate(1.05 * w * 2, 0.3 * h, 0.62 * w, 0.03, mb.seg(12, 6), 2), S.metal, { pos: [0, -0.09 * h, 0.24 * L + 0.2 * w], rot: [8, 0, 0], color: C.silver, shade: 0.35 });
  mb.part('chest', geo.torus(0.6 * w, 0.018, 5, mb.seg(20, 10), Math.PI * 0.9), S.metal, { pos: [0, -0.22 * h, 0.24 * L + 0.18 * w], rot: [8, 0, 189], color: C.gold });
  mb.part('chest', geo.ellipsoid(0.07 * h, 0.07 * h, 0.035 * h, 10, 7), S.metal, { pos: [0, -0.08 * h, 0.24 * L + 0.2 * w + 0.03], color: C.gold });
  // crinet: overlapping lames along the top of the neck, under the mane
  const neck = q.necks[''] ?? [];
  neck.forEach((bn, i) => {
    const r = w * (0.62 - i * 0.07);
    mb.part(bn, geo.plate(r * 2.4, 0.36 * h / neck.length * 2.2, r, 0.02, mb.seg(9, 5), 1), S.metal, { pos: [0, 0.14 * h, -0.02 * h], rot: [218, 0, 0], color: shade(C.silver, 0.92 - i * 0.04) });
  });
  // chanfron: face plate along the skull, gold brow band and a short leaf crest
  mb.part('head', geo.plate(0.2 * h, 0.4 * h, 0.08 * h, 0.018, mb.seg(9, 5), 2), S.metal, { pos: [0, -0.07 * h, 0.2 * h], rot: [-52, 0, 0], color: C.silver, shade: 0.25 });
  mb.part('head', geo.torus(0.075 * h, 0.01, 5, 12, Math.PI), S.metal, { pos: [0, 0.03 * h, 0.05 * h], rot: [-52, 0, 90], color: C.gold });
  const crest = geo.blade(geo.leafOutline(0.2 * h, 0.07 * h, 0.35, 8, 1.4), 0.02);
  mb.part('head', crest, S.metal, { pos: [0, 0.06 * h, 0.02 * h], rot: [-18, 90, 0], color: C.goldLight });
  // saddle: seat, high cantle and pommel, girth strap
  mb.part('saddle', geo.bevelBox(0.5 * w * 2, 0.07 * h, 0.34 * L, 0.04, 2), S.dark, { pos: [0, -0.02 * h, 0], color: C.leather, shade: 0.4 });
  mb.part('saddle', geo.plate(0.85 * w, 0.17 * h, 0.3 * w, 0.03, 8, 1), S.dark, { pos: [0, 0.06 * h, -0.17 * L], rot: [-10, 0, 0], color: C.leather });
  mb.part('saddle', geo.plate(0.6 * w, 0.1 * h, 0.22 * w, 0.03, 8, 1), S.metal, { pos: [0, 0.04 * h, 0.15 * L], rot: [12, 180, 0], color: C.gold });
  mb.part('spine', geo.torus(q.w * 1.04, 0.03, 4, mb.seg(24, 12)), S.dark, { pos: [0, 0.0, 0.08 * L], rot: [0, 90, 0], scale: [0.86, 1, 1], color: shade(C.leather, 0.8) });
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Knight                                                                                                            */
/* ---------------------------------------------------------------------------------------------------------------- */

/** The broken-crown great helm with a cross-shaped visor slit (faint gold glow behind it). */
function crownHelm(mb: ModelBuilder, d: MountedDims['rider'], S: SurfaceIds, C: Colors): void {
  const H = d.H, R = d.r * 1.08;
  const B = (n: string) => `${d.p}${n}`;
  const helm = geo.lathe([[0.0, -0.034 * H], [0.066 * R, -0.034 * H], [0.074 * R, -0.004 * H], [0.077 * R, 0.05 * H], [0.074 * R, 0.088 * H], [0.07 * R, 0.104 * H], [0.0, 0.106 * H]], mb.seg(18, 10));
  mb.part(B('head'), helm, S.metal, { pos: [0, 0, 0.006 * H], color: C.silver, shade: 0.3 });
  // the crown: helm rim rising into seven points, two snapped off
  const crown = geo.crown(0.072 * R, 0.026 * H, 7, 0.07 * H, [1, 4], 0.006 * H, mb.seg(28, 14));
  mb.part(B('head'), crown, S.metal, { pos: [0, 0.112 * H, 0.006 * H], color: shade(C.silver, 1.12) });
  mb.part(B('head'), geo.torus(0.074 * R, 0.0045 * H, 5, mb.seg(28, 14)), S.metal, { pos: [0, 0.1 * H, 0.006 * H], rot: [90, 0, 0], color: C.gold });
  // visor: horizontal slit + vertical breath, dark recess with a faint glow inside
  mb.part(B('head'), geo.bevelBox(0.1 * R, 0.011 * H, 0.012 * R, 0.002 * R), S.glow, { pos: [0, 0.06 * H, 0.074 * R], color: shade(C.glow, 0.55) });
  mb.part(B('head'), geo.bevelBox(0.012 * R, 0.05 * H, 0.012 * R, 0.002 * R), S.dark, { pos: [0, 0.034 * H, 0.075 * R], color: '#0c0b0e' });
  // central ridge
  mb.part(B('head'), geo.bevelBox(0.008 * R, 0.1 * H, 0.016 * R, 0.003 * R), S.metal, { pos: [0, 0.055 * H, 0.074 * R], color: shade(C.silver, 1.08) });
  // gorget
  mb.part(B('neck'), geo.lathe([[0.05 * R, -0.01 * H], [0.06 * R, 0.0], [0.054 * R, 0.03 * H], [0.044 * R, 0.05 * H]], mb.seg(16, 8)), S.metal, { pos: [0, 0, 0], color: C.silverDark });
}

function knightArmor(mb: ModelBuilder, d: MountedDims['rider'], S: SurfaceIds, C: Colors): void {
  const H = d.H, R = d.r;
  const B = (n: string) => `${d.p}${n}`;
  // layered pauldrons over the base plate ones
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const pl = geo.plate(0.16 * R, 0.05 * H, 0.08 * R, 0.008 * R, 8, 1);
      mb.part(B(`arm_${side}`), pl, S.metal, { pos: [sx * 0.03 * H, 0.02 * H - k * 0.028 * H, 0], rot: [0, sx * 90, sx * (12 + k * 8)], color: k === 0 ? C.gold : shade(C.silver, 1 - k * 0.07) });
    }
  }
  // tabard panel over the breastplate: the Regno's green with a gold crown-sign
  mb.part(B('chest'), geo.plate(0.1 * R * d.sw, 0.15 * H, 0.1 * R, 0.004 * R, 6, 2), S.cloth, { pos: [0, -0.03 * H, 0.07 * R], color: C.green });
  mb.part(B('chest'), geo.crown(0.016 * R, 0.006 * H, 5, 0.012 * H, [1], 0.003 * R, 10), S.metal, { pos: [0, -0.01 * H, 0.072 * R], rot: [90, 0, 0], scale: [1, 1, 0.3], color: C.goldLight });
  // faulds (skirt lames) down over the saddle
  for (let k = 0; k < 2; k++) {
    mb.part(B('hips'), geo.lathe([[0.1 * R, 0], [0.11 * R, -0.03 * H]], mb.seg(16, 8)), S.metal, { pos: [0, 0.01 * H - k * 0.028 * H, 0], scale: [1, 1, 0.78], color: shade(C.silver, 0.95 - k * 0.06) });
  }
}

/** Lancia del Custode on the right grip: +Z forward out of the fist. Returns nothing (parts skinned to the hand). */
function lance(mb: ModelBuilder, d: MountedDims['rider'], S: SurfaceIds, C: Colors): void {
  const H = d.H;
  const hand = `${d.p}hand_r`;
  // grip position in the hand bone's frame (= the humanoid grip socket)
  const gy = -0.045 * H, gz = 0.012 * H;
  const back = 0.9, front = 4.1, head = 1.0;
  const shaft = geo.lathe([
    [0, -back], [0.07, -back + 0.02], [0.075, -back + 0.12], [0.064, -0.15], [0.058, 0.0], [0.064, 0.2],
    [0.075, 0.28], [0.068, 1.2], [0.056, 2.6], [0.046, front - 0.1], [0.054, front - 0.02], [0.036, front], [0, front + 0.02],
  ], mb.seg(12, 7)).rotateX(Math.PI / 2);
  const ivory = mb.surface('lance_ivory', { roughness: 0.4, metalness: 0.04, detail: 'stone', detailScale: 9, detailStrength: 0.14, rim: 1.1 });
  mb.part(hand, shaft, ivory, { pos: [0, gy, gz], color: C.ivory });
  // vamplate: funnel hand-guard in silver with a gold rim
  const vamp = geo.lathe([[0.05, 0], [0.24, 0.02], [0.2, 0.08], [0.06, 0.5], [0.05, 0.54]], mb.seg(16, 8)).rotateX(Math.PI / 2);
  mb.part(hand, vamp, S.metal, { pos: [0, gy, gz + 0.18], color: C.silver, shade: 0.2 });
  mb.part(hand, geo.torus(0.235, 0.012, 4, mb.seg(18, 10)), S.metal, { pos: [0, gy, gz + 0.2], color: C.gold });
  // leather grip wraps
  for (let k = 0; k < 3; k++) mb.part(hand, geo.torus(0.05, 0.01, 4, 10), S.dark, { pos: [0, gy, gz - 0.12 + k * 0.1], color: C.leather });
  // socket ring + small crown engraved at the head's base
  mb.part(hand, geo.crown(0.045, 0.05, 5, 0.06, [], 0.01, 12).rotateX(Math.PI / 2), S.metal, { pos: [0, gy, gz + front - 0.08], color: C.gold });
  // leaf-shaped head
  const leaf = geo.blade(geo.leafOutline(head, 0.27, 0.36, mb.seg(14, 8), 1.3), 0.04, 0.014).rotateX(Math.PI / 2);
  mb.part(hand, leaf, S.metal, { pos: [0, gy, gz + front - 0.02], color: C.leafSteel });
  // central rib with a thin glow line (engraving light)
  mb.part(hand, geo.ellipsoid(0.012, 0.022, head * 0.4, 6, 4), S.glow, { pos: [0, gy, gz + front + head * 0.4], color: shade(C.glow, 0.75) });
}

/* ---------------------------------------------------------------------------------------------------------------- */

const build: BossModelBuilder = (def, ctx, actor: Actor): ActorVisual => {
  const C = colors(ctx, def);
  const H = Math.max(3, def.body.height);
  const mb = ctx.kit.model(def.id, ctx.quality);
  const horseH = H * 0.5;
  const d = mountedSkeleton(mb, {
    horse: { length: horseH * 0.98, height: horseH, legStyle: 'equine', tailBones: 4, width: 0.235 * horseH },
    rider: { height: H * 0.52, build: 0.9, shoulders: 1.08, cape: 6, jaw: false },
  });
  // separate surface sets so the spectral aura can wrap the steed alone
  const SS = standardSurfaces(mb, 'steed_', { skinDetail: 'skin', skinRough: 0.55, metalRough: 0.5, metalness: 0.68 });
  const SK = standardSurfaces(mb, 'knight_', { metalRough: 0.46, metalness: 0.72, rim: 1.0, glowIntensity: 1.6 });
  quadrupedBody(mb, d.horse, { body: C.coat, belly: C.coatBelly, dark: C.coatDark, mane: C.mane, hoof: '#1e1c1a', eye: '#cfe8ff', eyeGlow: true, ears: 'equine', surfaces: SS, bulk: 1.06 });
  barding(mb, d.horse, SS, C);
  humanoidBody(mb, d.rider, {
    skin: '#8a8880', cloth: C.green, clothDark: C.greenDark, metal: C.silver, trim: C.gold, glow: C.glow,
    armor: 'plate', head: 'none', cape: { width: 0.36, color: C.green, colorEnd: C.greenDark, ragged: 0.45 }, surfaces: SK, bulk: 1.3,
  });
  crownHelm(mb, d.rider, SK, C);
  knightArmor(mb, d.rider, SK, C);
  lance(mb, d.rider, SK, C);
  const model = mb.build();
  model.setShadow(ctx.quality !== 'low');
  const steedSurfaces = Object.values(SS);
  return new RigVisual(ctx, def, actor, model, {
    family: 'mounted',
    flagAuras: {
      spectral_aura: { color: C.spectral, surfaces: steedSurfaces, strength: 1.5, power: 2.2, flow: 1.2 },
      enraged: { color: '#ff7a48', surfaces: steedSurfaces, strength: 0.8 },
    },
  });
};

export default build;
