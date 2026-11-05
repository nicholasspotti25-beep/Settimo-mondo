/**
 * Elder Tree — a seed of Yggdrasil grown without sun: a gigantic rooted tree whose trunk holds an old, sorrowful bark face
 * (heavy brows over deep hollows with amber embers for eyes, a knotted nose, a mouth that grinds open on the jaw bone, a beard
 * of hanging moss), two branch arms that sweep low across the clearing, a vast canopy of BLACK leaves, buttress roots that
 * dive into the soil and luminous teal mushrooms in their crevices.
 *
 * Built on the tree rig family (bone names of src/render/rigs/families/tree.ts, so data/anim/tree.yaml drives every
 * keyword: root_call = summon, shake_canopy = shake, root_stomp = stomp, heart_pulse = roar, death topples) with the
 * proportions of this boss: arms lowered to 9 m and long enough (13.5 m) to reach the whip arcs (r 12.5) and the slam box
 * (z 13.8); three model clips (`branch_whip_l`, mirrored `branch_whip_r`, `branch_slam`) bring the branches down to the
 * ground where the data hits are.
 *
 * Heart (phase 2, flag 'heart_open'; part `heart` sphere [0, 2.3, 2.95] r 1.15): a lens-shaped bark scar low on the front of
 * the trunk, between two buttress roots, its seam faintly warm in phase 1. On heart_open the two bark lips swing outward on
 * hinge bones and the heart of light pushes forward out of a hollow veined with light; it beats (faster in the heart_pulse
 * wind-up) and a golden fresnel halo wraps it. The state is read from the flag every frame (a save loaded in phase 2 shows
 * it open).
 */
import * as THREE from 'three';
import type { BossDef, MinionDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import type { Sim } from '../../../sim/sim';
import type { BossModelBuilder, RenderCtx } from '../../../render/types';
import * as geo from '../../../render/kit/geometry';
import type { V3 } from '../../../render/kit/geometry';
import { pal } from '../../../render/kit/index';
import { mix, shade } from '../../../render/kit/palette';
import { Prng, seedOf } from '../../../render/kit/noise';
import type { ModelBuilder } from '../../../render/kit/model';
import { boneAt, chainThrough, profile } from '../../../render/rigs/families/common';
import { RigVisual } from '../../../render/rigs/visual';
import type { ClipDef } from '../../../render/rigs/clips';

const DEG = Math.PI / 180;

function colors(ctx: RenderCtx, def: BossDef | MinionDef) {
  const P = pal(ctx, def.model?.palette ?? 'act1_green_gold');
  return {
    bark: mix(P.dark, '#3a3029', 0.8),
    barkDark: '#1b1612',
    barkLight: mix(P.secondary, '#4d4237', 0.8),
    mossBark: mix(P.dark, '#2e3624', 0.5),
    moss: mix(P.primary, '#3f4c28', 0.6),
    mossPale: mix(P.light, '#6f7856', 0.7),
    hollow: '#0a0705',
    leaf: '#0c0e0b',
    leafTip: mix(P.dark, '#20251b', 0.5),
    leafSheen: '#2a2d33',
    eye: mix(P.glow, '#ffaa3a', 0.6),
    heart: '#ffe7b0',
    heartGold: mix(P.glow, '#e8a548', 0.55),
    sap: mix(P.accent, '#ffbf5a', 0.5),
    lining: '#3a2414',
    liningDeep: '#140b06',
    mushroom: '#3f9c86',
    mushroomGold: '#9c7c48',
    stem: '#cfc6b4',
  };
}
type Colors = ReturnType<typeof colors>;

interface Surfaces {
  bark: string;
  leaves: string;
  moss: string;
  glow: string;
  heart: string;
}

/** Rest joints of the trunk tube (start extension, trunk_0..3, crown_0..1, tip) as heights: maps tube t <-> height. */
interface TrunkFrame {
  ys: number[];
  yAt(t: number): number;
  /** Trunk radius at height y (before the ridge). */
  r(y: number): number;
  /** Trunk front surface (z) at height y, including the face bulge. */
  front(y: number): number;
  /** Trunk surface z at (x, y) on the front half (face bulge included, furrows excluded). */
  surf(x: number, y: number): number;
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Skeleton                                                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Root angles (deg, from +Z toward +X): the front wedge (-30..30) is left free for the heart. */
const ROOT_DEG = [30, 90, 150, 210, 270, 330];

function skeleton(mb: ModelBuilder, H: number, R: number) {
  const k = H / 18;
  const trunk = chainThrough(mb, 'trunk', 'root', [[0, 0.3 * k, 0], [0, 4.0 * k, 0.1 * k], [0, 8.0 * k, 0.25 * k], [0, 11.4 * k, 0.1 * k]]);
  const crown = chainThrough(mb, 'crown', 'trunk_3', [[0, 14.0 * k, -0.3 * k], [0, 16.4 * k, -0.6 * k]]);
  const arms = {} as Record<'l' | 'r', string[]>;
  const upper = {} as Record<'l' | 'r', string[]>;
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    arms[s] = chainThrough(mb, `branch_${s}`, 'trunk_2', [[sx * R * 0.78, 9.0 * k, 0.45 * k], [sx * (R + 4.3 * k), 9.3 * k, 1.2 * k], [sx * (R + 8.3 * k), 8.4 * k, 2.0 * k]]);
    upper[s] = chainThrough(mb, `branch_${s}2`, 'trunk_3', [[sx * R * 0.55, 12.0 * k, 0], [sx * (R + 3.4 * k), 14.4 * k, -0.5 * k]]);
  }
  const roots: string[][] = [];
  for (let i = 0; i < ROOT_DEG.length; i++) {
    const a = ROOT_DEG[i] * DEG, dx = Math.sin(a), dz = Math.cos(a);
    const reach = [4.3, 5.1, 3.7, 4.8, 4.0, 5.0][i] * k, lift = [1.25, 1.5, 1.0, 1.4, 1.1, 1.45][i] * k;
    roots.push(chainThrough(mb, `rootl_${i}`, 'root', [[dx * R * 0.85, 1.7 * k, dz * R * 0.85], [dx * (R + reach * 0.52), lift, dz * (R + reach * 0.52)], [dx * (R + reach), -0.2 * k, dz * (R + reach)]]));
  }
  mb.size = 0.3 * H;
  mb.height = H;
  mb.info.family = 'tree';
  mb.info.rootBone = 'trunk_0';
  mb.info.walkSpeed = 0.8 * (H / 8);
  mb.info.runSpeed = 2.5 * (H / 8);
  mb.info.look = [{ bone: 'trunk_2', weight: 0.12, limit: 12 }, { bone: 'trunk_3', weight: 0.2, limit: 18 }];
  mb.info.flinch = ['trunk_2', 'trunk_3'];
  mb.info.springs = [
    { chain: 'crown', stiffness: 25, damping: 4, gravity: 0, falloff: 0.4, weight: 0.6 },
    { chain: 'branch_l2', stiffness: 30, damping: 4, gravity: 0.3, falloff: 0.4, weight: 0.6 },
    { chain: 'branch_r2', stiffness: 30, damping: 4, gravity: 0.3, falloff: 0.4, weight: 0.6 },
  ];
  return { k, trunk, crown, arms, upper, roots };
}
type Dims = ReturnType<typeof skeleton>;

function trunkFrame(mb: ModelBuilder, d: Dims, R: number, startExt: number, tip: number): TrunkFrame {
  const bones = [...d.trunk, ...d.crown];
  const ys = bones.map((b) => mb.restPos(b).y);
  ys.unshift(ys[0] - startExt);
  ys.push(ys[ys.length - 1] + tip);
  const segs = ys.length - 1;
  const yAt = (t: number) => {
    const f = Math.max(0, Math.min(segs, t * segs));
    const i = Math.min(segs - 1, Math.floor(f));
    return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
  };
  const k = d.k;
  const stops: [number, number][] = [[-0.7, 1.45], [0.3, 1.24], [1.6, 1.05], [3.0, 1.0], [5.0, 0.95], [8.0, 0.86], [11.4, 0.7], [14.0, 0.46], [16.4, 0.26], [17.8, 0.12]];
  const rp = profile(stops.map(([y, r]): [number, number] => [(y - stops[0][0]) / (17.8 - stops[0][0]), r * R])) as (t: number) => number;
  const r = (y: number) => rp((y / k - stops[0][0]) / (17.8 - stops[0][0]));
  const front = (y: number) => r(y) * (1 + faceBulge(y / k));
  const surf = (x: number, y: number) => {
    const r0 = r(y);
    const c = Math.cos(Math.asin(Math.max(-1, Math.min(1, x / r0))));
    const rr = r0 * (1 + faceBulge(y / k) * smooth(0.35, 0.95, c));
    return Math.sqrt(Math.max(0, rr * rr - x * x));
  };
  return { ys, yAt, r, front, surf };
}

/** Forward bulge of the face area (multiplier on the radius at the front), y in 18 m units. */
function faceBulge(y: number): number {
  const u = (y - 4.8) / 4.6;
  return u <= 0 || u >= 1 ? 0 : 0.07 * Math.sin(Math.PI * u) ** 1.5;
}

/** Heart cleft: half-angle (rad) of the lens at height y (18 m units), 0 outside. */
function cleftHalf(y: number): number {
  const u = (y - 0.75) / 3.15;
  return u <= 0 || u >= 1 ? 0 : 0.36 * Math.sin(Math.PI * u) ** 0.7;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Body                                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------- */

function surfaces(mb: ModelBuilder): Surfaces {
  return {
    bark: mb.surface('elder_bark', { roughness: 0.95, metalness: 0, detail: 'bark', detailScale: 0.85, detailStrength: 0.9, rim: 0.9, rimPower: 2.6 }),
    leaves: mb.surface('elder_leaves', { roughness: 0.8, metalness: 0, detail: 'noise', detailScale: 1.6, detailStrength: 0.45, rim: 0.35, rimPower: 3, side: THREE.DoubleSide }),
    moss: mb.surface('elder_moss', { roughness: 1, metalness: 0, detail: 'fur', detailScale: 2.6, detailStrength: 0.55, rim: 0.45, side: THREE.DoubleSide }),
    glow: mb.surface('elder_glow', { roughness: 0.6, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1.7, emissiveVertexColor: true, detail: null, rim: 0.3, castShadow: false }),
    heart: mb.surface('elder_heart', { roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.3, emissiveVertexColor: true, detail: null, rim: 0.6, castShadow: false }),
  };
}

function trunkAndLimbs(mb: ModelBuilder, d: Dims, S: Surfaces, C: Colors, F: TrunkFrame, R: number, rng: Prng): void {
  const k = d.k;
  const rootA = ROOT_DEG.map((a) => a * DEG);
  // gnarled trunk: vertical furrows that twist slowly, buttress lobes at the roots, the face bulge, the heart cleft
  const armRidge = (th: number, t: number) => 1 + 0.13 * Math.sin(th * 5 + t * 9) + 0.07 * Math.sin(th * 9 - t * 17) + 0.1 * Math.max(0, Math.sin(t * 31)) ** 6;
  const ridge = (th: number, t: number) => {
    const y = F.yAt(t) / k;
    const c = Math.cos(th);
    const faceMask = smooth(0.45, 0.92, c) * smooth(4.3, 5.2, y) * (1 - smooth(9.4, 10.2, y));
    let m = 1 + (1 - 0.9 * faceMask) * (0.095 * Math.sin(th * 7 + y * 0.32) + 0.06 * Math.sin(th * 13 - y * 0.55) + 0.045 * Math.abs(Math.sin(th * 19 + y * 0.9)) - 0.02);
    if (y < 3.2) {
      let lobe = 0;
      for (const a of rootA) lobe = Math.max(lobe, Math.cos(th - a));
      m += 0.2 * Math.max(0, lobe) ** 10 * (1 - y / 3.2) ** 1.4;
    }
    m += faceBulge(y) * smooth(0.35, 0.95, c);
    const w = cleftHalf(y);
    if (w > 0) {
      const a = Math.abs(Math.atan2(Math.sin(th), c));
      m -= 0.5 * smooth(w * 1.25, w * 0.35, a) * Math.min(1, w / 0.2);
    }
    return m;
  };
  const trunk = mb.tube([...d.trunk, ...d.crown], S.bark, {
    radius: (t) => F.r(F.yAt(t)), start: 1.0 * k, tip: 1.4 * k, radial: 32, perBone: 7, ridge,
    color: C.mossBark, colorEnd: C.barkDark, capStart: false, blendParent: false,
  });
  // moss on the lower trunk and bark knots
  trunk.scatter(S.moss, geo.furTuft(0.55 * k, 0.12 * k, 5, 3, 0.8), mb.quality === 'low' ? 10 : 34, { t: [0.04, 0.32], theta: [0.9, 5.4], scale: [0.6, 1.2], seed: 11, color: C.moss, sink: 0.12 });
  // arm branches: thick at the shoulder, gnarled, twig fingers splayed at the end
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    const arm = d.arms[s];
    mb.tube(['trunk_2', ...arm], S.bark, {
      radius: profile([[0, R * 0.5], [0.22, R * 0.42], [0.55, R * 0.27], [0.85, R * 0.15], [1, R * 0.07]]), tip: 3.0 * k, radial: 14, perBone: 5,
      ridge: armRidge, color: C.bark, colorEnd: C.barkDark, blendParent: false,
    });
    // a broken spur and a side shoot on the upper arm (silhouette)
    const p1 = mb.restPos(arm[1]);
    mb.partModel(arm[1], geo.tube([[p1.x - sx * 0.6 * k, p1.y + 0.3 * k, p1.z], [p1.x + sx * 0.4 * k, p1.y + 2.0 * k, p1.z - 0.6 * k], [p1.x + sx * 1.4 * k, p1.y + 3.1 * k, p1.z - 1.3 * k]], profile([[0, 0.34 * k], [1, 0.06 * k]]), { radial: 7, perSeg: 3 }), S.bark, C.barkDark);
    const p2 = mb.restPos(arm[2]);
    mb.partModel(arm[2], geo.tube([[p2.x - sx * 1.2 * k, p2.y + 0.2 * k, p2.z], [p2.x - sx * 0.4 * k, p2.y + 1.4 * k, p2.z + 0.8 * k], [p2.x + sx * 0.3 * k, p2.y + 2.0 * k, p2.z + 1.6 * k]], profile([[0, 0.22 * k], [1, 0.04 * k]]), { radial: 6, perSeg: 3 }), S.bark, C.barkDark);
    mb.partModel(arm[1], geo.xform(geo.noiseDisplace(geo.ellipsoid(0.75 * k, 0.6 * k, 0.65 * k, 9, 7), 0.12 * k, 1.5 / k, 9), [p1.x, p1.y + 0.1 * k, p1.z]), S.bark, C.bark);
    mb.partModel(arm[0], geo.tube([[sx * (R + 1.6 * k), 9.0 * k, 0.8 * k], [sx * (R + 2.4 * k), 10.6 * k, 1.6 * k]], profile([[0, 0.3 * k], [1, 0.12 * k]]), { radial: 6, perSeg: 2, capEnd: true }), S.bark, C.bark);
    // fingers: five twigs fanning from the tip, each with a crooked sub-twig
    const tip = mb.restPos(arm[2]);
    const dir = new THREE.Vector3().subVectors(tip, mb.restPos(arm[1])).normalize();
    const base = tip.clone().addScaledVector(dir, 2.2 * k);
    for (let f = 0; f < 5; f++) {
      const spread = (f - 2) * 0.42;
      const len = (2.4 + rng.range(-0.3, 0.5)) * k;
      const fx = dir.x * Math.cos(spread * 0.3), fz = dir.z + Math.sin(spread) * 0.9, fy = dir.y - 0.25 + (f % 2) * 0.3;
      const p0: V3 = [base.x, base.y, base.z];
      const pm: V3 = [base.x + fx * len * 0.55, base.y + fy * len * 0.5, base.z + fz * len * 0.5];
      const pe: V3 = [base.x + fx * len, base.y + (fy - 0.45) * len, base.z + fz * len * 0.95];
      mb.partModel(arm[2], geo.tube([p0, pm, pe], profile([[0, 0.2 * k], [1, 0.035 * k]]), { radial: 6, perSeg: 3 }), S.bark, C.barkDark);
      const q: V3 = [pm[0] + sx * 0.5 * k, pm[1] + 0.35 * k, pm[2] + rng.range(-0.4, 0.4) * k];
      mb.partModel(arm[2], geo.tube([pm, q, [q[0] + sx * 0.3 * k, q[1] - 0.2 * k, q[2]]], profile([[0, 0.07 * k], [1, 0.015 * k]]), { radial: 4, perSeg: 2 }), S.bark, C.barkDark);
    }
    // upper boughs that carry the canopy
    mb.tube(['trunk_3', ...d.upper[s]], S.bark, { radius: profile([[0, R * 0.36], [1, R * 0.08]]), tip: 3.6 * k, radial: 10, perBone: 4, ridge: armRidge, color: C.bark, colorEnd: C.barkDark, blendParent: false });
  }
  // crown boughs spreading the black canopy wide (rigid on crown_0)
  const c0 = mb.restPos('crown_0');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const len = (5.4 + rng.range(-0.6, 0.8)) * k;
    const pts: V3[] = [[c0.x, c0.y - 0.6 * k, c0.z], [c0.x + Math.sin(a) * len * 0.45, c0.y + 0.9 * k, c0.z + Math.cos(a) * len * 0.45], [c0.x + Math.sin(a) * len, c0.y + 1.2 * k + rng.range(-0.5, 0.6) * k, c0.z + Math.cos(a) * len]];
    mb.partModel('crown_0', geo.tube(pts, profile([[0, 0.55 * k], [1, 0.1 * k]]), { radial: 8, perSeg: 3 }), S.bark, C.barkDark);
  }
  // buttress roots: six animated (root rig) + six static flares between them, all diving into the soil
  d.roots.forEach((r, i) => {
    const h = mb.tube(r, S.bark, { radius: profile([[0, R * 0.52], [0.45, R * 0.3], [1, R * 0.16]]), tip: 1.6 * k, start: R * 0.35, radial: 11, perBone: 4, ridge: armRidge, color: C.mossBark, colorEnd: C.barkDark, blendParent: false, flatten: [1, 0.66] });
    // moss on the back of each root breaks the smooth tapered silhouette
    h.scatter(S.moss, geo.furTuft(0.45 * k, 0.1 * k, 5, 20 + i, 0.9), mb.quality === 'low' ? 2 : 6, { t: [0.1, 0.75], theta: [-0.9, 0.9], scale: [0.6, 1.2], seed: 40 + i, color: i % 2 ? C.moss : C.mossBark, sink: 0.15 });
  });
  for (let i = 0; i < 6; i++) {
    const a = (ROOT_DEG[i] + 30) * DEG;
    if (Math.abs(Math.sin(a / 2)) < 0.06) continue; // keep the front (0 deg) free for the heart
    const dx = Math.sin(a), dz = Math.cos(a), out = R + 2.2 * k;
    const pts: V3[] = [[dx * R * 0.8, 1.4 * k, dz * R * 0.8], [dx * (R + 0.9 * k), 0.75 * k, dz * (R + 0.9 * k)], [dx * out, -0.9 * k, dz * out]];
    mb.partModel('root', geo.tube(pts, profile([[0, R * 0.3], [1, R * 0.08]]), { radial: 8, perSeg: 3, flatten: [1, 0.6] }), S.bark, C.barkDark);
  }
}

function face(mb: ModelBuilder, S: Surfaces, C: Colors, F: TrunkFrame, k: number, rng: Prng): void {
  const Z = (x: number, y: number) => F.surf(x, y);
  const T = (pts: V3[], r0: number, r1: number, radial = 7) => geo.tube(pts, profile([[0, r0], [0.5, Math.max(r0, r1) * 1.05], [1, r1]]), { radial, perSeg: 4 });
  // eyes: deep hollows under heavy brows, amber embers recessed in them (on trunk_2: they sit at its pivot height)
  for (const sx of [-1, 1]) {
    const ex = sx * 0.8 * k, ey = 7.85 * k, ez = Z(ex, ey) - 0.06 * k;
    mb.partModel('trunk_2', geo.xform(geo.ellipsoid(0.46 * k, 0.3 * k, 0.24 * k, 12, 8), [ex, ey, ez - 0.05 * k], [8, sx * 18, sx * 10]), S.bark, C.hollow);
    mb.partModel('trunk_2', geo.xform(geo.ellipsoid(0.22 * k, 0.13 * k, 0.1 * k, 10, 6), [ex - sx * 0.03 * k, ey - 0.02 * k, ez + 0.2 * k], [0, sx * 18, sx * 8]), S.glow, C.eye);
    // brow: an arched bark ridge, heavier at the outer end, drooping (old, sorrowful)
    mb.partModel('trunk_2', T([[sx * 0.18 * k, 8.18 * k, Z(sx * 0.18 * k, 8.18 * k) + 0.12 * k], [sx * 0.75 * k, 8.42 * k, Z(sx * 0.75 * k, 8.42 * k) + 0.2 * k], [sx * 1.4 * k, 8.05 * k, Z(sx * 1.4 * k, 8.05 * k) - 0.18 * k], [sx * 1.7 * k, 7.55 * k, Z(sx * 1.7 * k, 7.55 * k) - 0.55 * k]], 0.2 * k, 0.1 * k, 8), S.bark, C.bark);
    // under-eye bags and the deep line from the nose to the jaw
    mb.partModel('trunk_1', T([[sx * 0.4 * k, 7.5 * k, Z(sx * 0.4 * k, 7.5 * k) + 0.04 * k], [sx * 0.85 * k, 7.42 * k, Z(sx * 0.85 * k, 7.42 * k) + 0.02 * k], [sx * 1.25 * k, 7.6 * k, Z(sx * 1.25 * k, 7.6 * k) - 0.2 * k]], 0.1 * k, 0.07 * k), S.bark, C.barkLight);
    mb.partModel('trunk_1', T([[sx * 0.42 * k, 7.15 * k, Z(sx * 0.42 * k, 7.15 * k) + 0.12 * k], [sx * 0.9 * k, 6.5 * k, Z(sx * 0.9 * k, 6.5 * k) + 0.04 * k], [sx * 1.08 * k, 5.6 * k, Z(sx * 1.08 * k, 5.6 * k) - 0.08 * k]], 0.14 * k, 0.08 * k), S.bark, C.bark);
    // forehead wrinkles
    for (let w = 0; w < 2; w++) {
      const y = (8.8 + w * 0.42) * k;
      mb.partModel('trunk_2', T([[sx * 0.1 * k, y, Z(sx * 0.1 * k, y) + 0.02 * k], [sx * 0.7 * k, y + 0.12 * k, Z(sx * 0.7 * k, y + 0.12 * k) - 0.02 * k], [sx * 1.3 * k, y - 0.08 * k, Z(sx * 1.3 * k, y - 0.08 * k) - 0.25 * k]], 0.07 * k, 0.04 * k, 5), S.bark, C.barkDark);
    }
  }
  // the nose: a long knot, nostrils as dark dents
  mb.partModel('trunk_1', T([[0, 7.75 * k, Z(0, 7.75 * k) + 0.02 * k], [0, 7.2 * k, Z(0, 7.2 * k) + 0.22 * k], [0, 6.75 * k, Z(0, 6.75 * k) + 0.42 * k]], 0.2 * k, 0.26 * k, 9), S.bark, C.barkLight);
  mb.partModel('trunk_1', geo.xform(geo.ellipsoid(0.34 * k, 0.24 * k, 0.26 * k, 10, 7), [0, 6.68 * k, Z(0, 6.68 * k) + 0.38 * k]), S.bark, C.bark);
  for (const sx of [-1, 1]) mb.partModel('trunk_1', geo.xform(geo.ellipsoid(0.09 * k, 0.06 * k, 0.08 * k, 6, 4), [sx * 0.15 * k, 6.55 * k, Z(sx * 0.15 * k, 6.55 * k) + 0.55 * k]), S.bark, C.hollow);
  // mouth: a dark hollow, an upper lip ridge; the lower lip + chin on the jaw bone (hinge behind it, +x drops it)
  mb.partModel('trunk_1', geo.xform(geo.ellipsoid(0.82 * k, 0.5 * k, 0.32 * k, 12, 8), [0, 5.85 * k, Z(0, 5.85 * k) - 0.14 * k]), S.bark, C.hollow);
  mb.partModel('trunk_1', T([[-0.95 * k, 6.0 * k, Z(-0.95 * k, 6.0 * k) - 0.15 * k], [-0.4 * k, 6.24 * k, Z(-0.4 * k, 6.24 * k) + 0.12 * k], [0.4 * k, 6.24 * k, Z(0.4 * k, 6.24 * k) + 0.12 * k], [0.95 * k, 6.0 * k, Z(0.95 * k, 6.0 * k) - 0.15 * k]], 0.12 * k, 0.12 * k), S.bark, C.bark);
  mb.partModel('jaw', T([[-0.85 * k, 5.72 * k, Z(-0.85 * k, 5.72 * k) - 0.12 * k], [-0.35 * k, 5.5 * k, Z(-0.35 * k, 5.5 * k) + 0.12 * k], [0.35 * k, 5.5 * k, Z(0.35 * k, 5.5 * k) + 0.12 * k], [0.85 * k, 5.72 * k, Z(0.85 * k, 5.72 * k) - 0.12 * k]], 0.17 * k, 0.17 * k, 8), S.bark, C.bark);
  mb.partModel('jaw', geo.xform(geo.ellipsoid(0.5 * k, 0.4 * k, 0.3 * k, 10, 7), [0, 5.15 * k, Z(0, 5.15 * k) - 0.02 * k]), S.bark, C.bark);
  // beard of hanging moss from the jaw (sways with it)
  const strands = mb.quality === 'low' ? 7 : 13;
  for (let i = 0; i < strands; i++) {
    const u = i / (strands - 1) - 0.5;
    const x = u * 1.6 * k, y0 = (5.45 - Math.abs(u) * 0.5) * k, z0 = Z(x, y0) + 0.05 * k;
    const len = (1.3 + rng.range(0, 0.9) - Math.abs(u) * 0.8) * k;
    mb.partModel('jaw', geo.tube([[x, y0, z0], [x * 1.05, y0 - len * 0.5, z0 + 0.12 * k], [x * 1.1 + rng.range(-0.1, 0.1) * k, y0 - len, z0 + 0.02 * k]], profile([[0, 0.11 * k], [0.6, 0.07 * k], [1, 0.015 * k]]), { radial: 5, perSeg: 3 }), S.moss, i % 3 ? C.moss : C.mossPale);
  }
}

function heart(mb: ModelBuilder, S: Surfaces, C: Colors, F: TrunkFrame, k: number, rng: Prng): void {
  const hy = 2.3 * k, zs = F.r(hy);
  // the heart of light on its own bone (pushed forward and grown when the trunk opens)
  boneAt(mb, 'heart', 'trunk_0', [0, hy, zs - 0.3 * k]);
  const core = geo.noiseDisplace(geo.ellipsoid(0.84 * k, 1.04 * k, 0.72 * k, 18, 14), 0.08 * k, 2.2 / k, 7);
  geo.gradient(core, 1, C.heartGold, C.heart, -0.9 * k, 0.6 * k);
  mb.part('heart', core, S.heart);
  // inner brighter knot + root-veins of light reaching into the hollow's walls
  mb.part('heart', geo.ellipsoid(0.36 * k, 0.48 * k, 0.33 * k, 10, 8), S.heart, { pos: [0, 0.05 * k, 0.32 * k], color: '#ffffff' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const ex = Math.cos(a) * 0.95 * k, ey = Math.sin(a) * 1.35 * k;
    mb.part('heart', geo.tube([[Math.cos(a) * 0.5 * k, Math.sin(a) * 0.6 * k, 0], [ex * 0.8, ey * 0.75, -0.15 * k], [ex, ey, -0.4 * k + rng.range(-0.1, 0.1) * k]], profile([[0, 0.12 * k], [1, 0.03 * k]]), { radial: 5, perSeg: 3 }), S.heart, { color: C.heartGold });
  }
  // the hollow (lining seen from inside), veined with light
  const lining = geo.flipFaces(geo.ellipsoid(1.05 * k, 1.6 * k, 0.8 * k, 16, 12));
  geo.gradient(lining, 2, C.liningDeep, C.lining, -0.8 * k, 0.6 * k);
  mb.partModel('trunk_0', geo.xform(lining, [0, hy, zs - 0.62 * k]), S.bark);
  for (let i = 0; i < 6; i++) {
    const sx = i % 2 ? 1 : -1, yy = hy + (Math.floor(i / 2) - 1) * 0.85 * k;
    mb.partModel('trunk_0', geo.tube([[sx * 0.25 * k, yy, zs - 1.25 * k], [sx * 0.7 * k, yy + 0.25 * k, zs - 0.9 * k], [sx * 0.92 * k, yy + 0.1 * k, zs - 0.35 * k]], profile([[0, 0.06 * k], [1, 0.03 * k]]), { radial: 4, perSeg: 3 }), S.heart, C.sap);
  }
  // seam of sap along the cleft's edge (faint in phase 1, bright when open)
  for (const sx of [-1, 1]) {
    const pts: V3[] = [];
    for (let j = 0; j <= 8; j++) {
      const y = (0.8 + (j / 8) * 3.05) * k;
      const w = cleftHalf(y / k) * 0.9;
      const rr = F.r(y);
      pts.push([sx * Math.sin(w) * rr, y, Math.cos(w) * rr - 0.06 * k]);
    }
    mb.partModel('trunk_0', geo.tube(pts, profile([[0, 0.02 * k], [0.5, 0.05 * k], [1, 0.02 * k]]), { radial: 5, perSeg: 2 }), S.heart, C.sap);
  }
  // the two bark lips that close over it (hinged at the cleft's outer edges)
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    const hingeX = sx * 1.02 * k, hingeZ = zs - 0.32 * k;
    const bone = boneAt(mb, `heart_door_${s}`, 'trunk_0', [hingeX, hy, hingeZ]);
    const lip = geo.noiseDisplace(geo.ellipsoid(0.56 * k, 1.6 * k, 0.36 * k, 12, 14), 0.06 * k, 2.6 / k, s === 'l' ? 3 : 4);
    geo.gradient(lip, 1, C.mossBark, C.bark, -1.6 * k, 1.6 * k);
    mb.partModel(bone, geo.xform(lip, [sx * 0.5 * k, hy, zs - 0.05 * k], [0, sx * -6, 0]), S.bark);
    // the lip's inner edge glows when it opens
    mb.partModel(bone, geo.tube([[sx * 0.05 * k, hy - 1.25 * k, zs + 0.05 * k], [sx * 0.03 * k, hy, zs + 0.18 * k], [sx * 0.05 * k, hy + 1.25 * k, zs + 0.05 * k]], profile([[0, 0.025 * k], [0.5, 0.07 * k], [1, 0.025 * k]]), { radial: 5, perSeg: 4 }), S.heart, C.sap);
  }
}

function canopy(mb: ModelBuilder, d: Dims, S: Surfaces, C: Colors, rng: Prng): void {
  const k = d.k;
  const q = mb.quality === 'low' ? 0.35 : mb.quality === 'medium' ? 0.6 : 1;
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), qt = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  /** A spray of five black leaves along a short stem, pointing +Y (stem base at the origin). */
  const spray = (len: number): THREE.BufferGeometry => {
    const leaves: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const t = 0.25 + i * 0.18, side = i % 2 ? 1 : -1;
      const ll = len * rng.range(0.42, 0.6) * (i === 4 ? 1.15 : 1);
      const lf = geo.leaf(ll, ll * rng.range(0.38, 0.5), 2, rng.range(0.05, 0.3), 0.35);
      geo.xform(lf, [0, t * len, 0], i === 4 ? [rng.range(-15, 15), rng.range(0, 360), 0] : [rng.range(-25, 25), rng.range(-30, 30) + (side > 0 ? 0 : 180), side * rng.range(35, 60)]);
      const sheen = rng.next();
      geo.paint(lf, sheen > 0.88 ? C.leafSheen : mix(C.leaf, C.leafTip, sheen));
      leaves.push(lf);
    }
    return geo.mergeGeometries(leaves);
  };
  /** A clump of black leaf sprays radiating from a dark leaf-mass core. Positions in model space. */
  const clump = (bone: string, c: V3, rx: number, ry: number, rz: number, n: number) => {
    const list: THREE.BufferGeometry[] = [];
    const coreG = geo.noiseDisplace(geo.ellipsoid(rx * 0.48, ry * 0.5, rz * 0.48, 10, 7), 0.3 * Math.min(rx, rz), 0.9 / k, Math.floor(rng.next() * 1000));
    geo.paint(coreG, '#040504');
    geo.xform(coreG, c);
    list.push(coreG);
    const count = Math.max(10, Math.round(n * q * 1.1));
    for (let i = 0; i < count; i++) {
      const u = rng.next() * Math.PI * 2, v = rng.range(-0.75, 1);
      const sv = Math.sqrt(1 - v * v);
      dir.set(Math.cos(u) * sv, v * 0.8 + 0.15, Math.sin(u) * sv).normalize();
      const g = spray(rng.range(1.5, 2.4) * k);
      qt.setFromUnitVectors(up, dir);
      const rr = rng.range(0.45, 0.85);
      m4.compose(new THREE.Vector3(c[0] + Math.cos(u) * sv * rx * rr, c[1] + v * ry * rr, c[2] + Math.sin(u) * sv * rz * rr), qt, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m4);
      list.push(g);
    }
    mb.partModel(bone, geo.mergeGeometries(list), S.leaves);
  };
  const c1 = mb.restPos('crown_1'), c0 = mb.restPos('crown_0');
  clump('crown_1', [c1.x, c1.y + 1.2 * k, c1.z - 0.2 * k], 4.4 * k, 3.0 * k, 4.2 * k, 110);
  clump('crown_0', [c0.x, c0.y + 0.2 * k, c0.z + 2.2 * k], 3.4 * k, 2.6 * k, 2.8 * k, 60);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const len = 5.6 * k;
    clump('crown_0', [c0.x + Math.sin(a) * len, c0.y + (1.4 + (i % 2) * 0.9) * k, c0.z + Math.cos(a) * len], 3.0 * k, 2.3 * k, 3.0 * k, 52);
  }
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    const u1 = mb.restPos(d.upper[s][1]);
    clump(d.upper[s][1], [u1.x + sx * 2.4 * k, u1.y + 1.3 * k, u1.z], 3.4 * k, 2.4 * k, 3.2 * k, 64);
    const a1 = mb.restPos(d.arms[s][1]), a2 = mb.restPos(d.arms[s][2]);
    clump(d.arms[s][1], [a1.x + sx * 1.0 * k, a1.y + 3.2 * k, a1.z - 1.2 * k], 1.8 * k, 1.4 * k, 1.7 * k, 26);
    clump(d.arms[s][2], [a2.x + sx * 0.3 * k, a2.y + 2.2 * k, a2.z + 1.7 * k], 1.3 * k, 1.0 * k, 1.3 * k, 16);
  }
}

function mossAndFungi(mb: ModelBuilder, d: Dims, S: Surfaces, C: Colors, F: TrunkFrame, R: number, rng: Prng): void {
  const k = d.k;
  // hanging moss from the arms and the upper boughs
  const hang = (bone: string, at: THREE.Vector3, n: number, maxLen: number) => {
    for (let i = 0; i < n; i++) {
      const x = at.x + rng.range(-1.2, 1.2) * k, z = at.z + rng.range(-0.6, 0.6) * k, y = at.y - 0.2 * k;
      const len = rng.range(0.5, 1) * maxLen;
      mb.partModel(bone, geo.tube([[x, y, z], [x + 0.08 * k, y - len * 0.55, z + 0.1 * k], [x, y - len, z]], profile([[0, 0.16 * k], [0.7, 0.08 * k], [1, 0.02 * k]]), { radial: 4, perSeg: 3, flatten: [1, 0.5] }), S.moss, i % 3 ? C.moss : C.mossBark);
    }
  };
  const lowQ = mb.quality === 'low';
  for (const s of ['l', 'r'] as const) {
    hang(d.arms[s][0], mb.restPos(d.arms[s][1]).lerp(mb.restPos(d.arms[s][0]), 0.5), lowQ ? 1 : 3, 2.6 * k);
    hang(d.arms[s][1], mb.restPos(d.arms[s][1]).lerp(mb.restPos(d.arms[s][2]), 0.4), lowQ ? 1 : 2, 2.0 * k);
    hang(d.upper[s][1], mb.restPos(d.upper[s][1]), lowQ ? 2 : 5, 3.2 * k);
  }
  // luminous mushrooms: clusters in the crevices between the roots and along them (teal, a few pale gold)
  const cap = (sc: number) => geo.lathe([[0, sc * 0.95], [sc * 0.7, sc * 0.86], [sc * 1.05, sc * 0.6], [sc * 0.9, sc * 0.52], [sc * 0.18, sc * 0.6], [0, sc * 0.62]], 10);
  const stem = (sc: number) => geo.lathe([[sc * 0.2, 0], [sc * 0.15, sc * 0.35], [sc * 0.13, sc * 0.62]], 6);
  const clusters = lowQ ? 6 : 12;
  for (let i = 0; i < clusters; i++) {
    const a = (i / clusters) * Math.PI * 2 + rng.range(-0.15, 0.15);
    if (Math.cos(a) > 0.93) continue; // not over the heart
    const dist = R * rng.range(1.15, 1.9);
    const cx = Math.sin(a) * dist, cz = Math.cos(a) * dist;
    const n = lowQ ? 2 : 4;
    for (let m = 0; m < n; m++) {
      const sc = rng.range(0.16, 0.4) * k;
      const x = cx + rng.range(-0.6, 0.6) * k, z = cz + rng.range(-0.6, 0.6) * k;
      const y = Math.max(0, 1.2 * k * (1 - (Math.hypot(x, z) - R) / (3.3 * k))) * 0.4;
      const gold = rng.next() > 0.8;
      mb.partModel('root', geo.xform(stem(sc), [x, y, z], [rng.range(-12, 12), 0, rng.range(-12, 12)]), S.bark, C.stem);
      mb.partModel('root', geo.xform(cap(sc), [x, y, z], [rng.range(-12, 12), 0, rng.range(-12, 12)]), S.glow, gold ? C.mushroomGold : C.mushroom);
    }
  }
  // glowing shelf fungi stepping up the sides and back of the trunk
  const shelves = lowQ ? 4 : 9;
  for (let i = 0; i < shelves; i++) {
    const a = rng.range(0.9, Math.PI * 2 - 0.9);
    const y = rng.range(1.2, 6.5) * k, rr = F.r(y) * 0.98;
    const sc = rng.range(0.35, 0.6) * k;
    const shelf = geo.lathe([[0, 0.12 * sc], [sc, 0.05 * sc], [sc * 1.05, -0.06 * sc], [0, -0.1 * sc]], 10, -Math.PI / 2, Math.PI);
    geo.xform(shelf, [Math.sin(a) * rr, y, Math.cos(a) * rr], [0, a / DEG - 90, 0], [1, 1, 0.8]);
    mb.partModel('trunk_0', shelf, S.glow, rng.next() > 0.7 ? C.mushroomGold : C.mushroom);
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Clips: the branches reach the ground where the data hits are                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

const CLIPS: Record<string, ClipDef> = {
  // low sweep of the LEFT arm (+X) from behind the tree, through the front, to the front-right (arc yaw 35, 150 deg)
  branch_whip_l: {
    hold: 2,
    telegraph: {
      pose: {
        trunk_1: [0, 6, 0], trunk_2: [-3, 14, -3], trunk_3: [-2, 8, 0], crown_0: [0, 4, 0],
        branch_l_0: [0, 30, -20], branch_l_1: [0, 6, 10], branch_l_2: [0, 4, 4],
        branch_r_0: [0, 18, 6], branch_r_1: [0, 8, 0], jaw: [10, 0, 0],
      },
      rootRot: [0, 8, 0],
      ease: 'inout',
    },
    active: {
      pose: {
        trunk_1: [3, -8, 0], trunk_2: [7, -16, 4], trunk_3: [4, -10, 0], crown_0: [3, -6, 0],
        branch_l_0: [0, -84, -31], branch_l_1: [0, 0, 16], branch_l_2: [0, 0, 10],
        branch_r_0: [0, -14, 8], branch_r_1: [0, -6, 0], jaw: [22, 0, 0],
      },
      rootRot: [0, -10, 0],
      root: [0, -0.03, 0.03],
    },
    recovery: {
      pose: {
        trunk_1: [2, -6, 0], trunk_2: [5, -12, 3], trunk_3: [3, -8, 0],
        branch_l_0: [0, -76, -26], branch_l_1: [0, 0, 13], branch_l_2: [0, 0, 8], jaw: [8, 0, 0],
      },
      rootRot: [0, -7, 0],
      blend: 0.4,
    },
  },
  branch_whip_r: { mirror: 'branch_whip_l' },
  // the RIGHT arm rises high over the crown, then falls along the line in front of the face onto the ground
  branch_slam: {
    hold: 3,
    telegraph: {
      pose: {
        trunk_1: [-3, -5, 0], trunk_2: [-8, -10, 4], trunk_3: [-8, -6, 0], crown_0: [-6, 0, 0],
        branch_r_0: [0, 62, -72], branch_r_1: [0, 10, -24], branch_r_2: [0, 4, -14],
        branch_l_0: [0, -10, 22], branch_l_1: [0, -6, 8], jaw: [18, 0, 0],
      },
      root: [0, 0.02, -0.05],
      ease: 'inout',
    },
    active: {
      pose: {
        trunk_1: [6, 4, 0], trunk_2: [12, 8, -2], trunk_3: [9, 4, 0], crown_0: [8, 0, 0],
        branch_r_0: [0, 82, 26], branch_r_1: [0, 0, -16], branch_r_2: [0, 0, -8],
        branch_l_0: [6, -12, -8], jaw: [28, 0, 0],
      },
      root: [0, -0.08, 0.06],
    },
    recovery: {
      pose: {
        trunk_1: [5, 3, 0], trunk_2: [10, 7, -2], trunk_3: [7, 3, 0],
        branch_r_0: [0, 80, 22], branch_r_1: [0, 0, -14], branch_r_2: [0, 0, -6], jaw: [12, 0, 0],
      },
      root: [0, -0.06, 0.05],
      blend: 0.3,
    },
  },
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Build                                                                                                             */
/* ---------------------------------------------------------------------------------------------------------------- */

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const DOOR_OPEN_DEG = 138;

/** Lub-dub heartbeat 0..1 with period p seconds. */
function beat(time: number, p: number): number {
  const u = (time / p) % 1;
  return Math.exp(-((u - 0.08) ** 2) / 0.0018) + 0.6 * Math.exp(-((u - 0.28) ** 2) / 0.0025);
}

const build: BossModelBuilder = (def, ctx, actor) => {
  const C = colors(ctx, def);
  const H = Math.max(8, def.body.height);
  const R = Math.max(1.2, def.body.radius * 0.86);
  const mb = ctx.kit.model(def.id, ctx.quality);
  const rng = new Prng(seedOf(def.id));
  const d = skeleton(mb, H, R);
  boneAt(mb, 'jaw', 'trunk_1', [0, 6.05 * d.k, R * 0.95 * (1 + faceBulge(6.05)) - 0.85 * d.k]);
  mb.socket('mouth', 'jaw', [0, -0.3 * d.k, 0.9 * d.k]);
  const S = surfaces(mb);
  const F = trunkFrame(mb, d, R, 1.0 * d.k, 1.4 * d.k);
  trunkAndLimbs(mb, d, S, C, F, R, rng);
  face(mb, S, C, F, d.k, rng);
  heart(mb, S, C, F, d.k, rng);
  mb.socket('heart', 'heart', [0, 0, 0.6 * d.k]);
  canopy(mb, d, S, C, rng);
  mossAndFungi(mb, d, S, C, F, R, rng);
  const model = mb.build();
  model.setShadow(ctx.quality !== 'low');

  const heartMat = model.materials[S.heart] as THREE.MeshStandardMaterial;
  const glowMat = model.materials[S.glow] as THREE.MeshStandardMaterial;
  const doorL = model.bones['heart_door_l'], doorR = model.bones['heart_door_r'], heartBone = model.bones['heart'];
  const heartRest = (heartBone.userData.restPos as THREE.Vector3 | undefined)?.clone() ?? heartBone.position.clone();
  let open = actor.flags.has('heart_open') ? 1 : 0;
  let surge = 0;
  const k = d.k;

  return new RigVisual(ctx, def, actor, model, {
    family: 'tree',
    height: 7.5 * k,
    clips: CLIPS,
    flagAuras: {
      heart_open: { color: '#ffd98a', surfaces: [S.heart], strength: 1.2, power: 1.8, inflate: 0.12 * k, flow: 0.9 },
    },
    onUpdate(v: RigVisual, a: Actor, _sim: Sim, dt: number) {
      const want = a.flags.has('heart_open') && a.alive ? 1 : 0;
      // opens over the phase transition (~3 s), closes fast on a retry
      open += (want - open) * Math.min(1, dt * (want ? 0.9 : 4));
      const o = open < 0.001 ? 0 : open > 0.999 ? 1 : open;
      const ease = o * o * (3 - 2 * o);
      for (const [b, sx] of [[doorL, 1], [doorR, -1]] as const) {
        const rq = b.userData.restQuat as THREE.Quaternion | undefined;
        _e.set(0, sx * ease * DOOR_OPEN_DEG * DEG, sx * ease * -4 * DEG, 'XYZ');
        _q.setFromEuler(_e);
        if (rq) b.quaternion.copy(rq).multiply(_q);
        else b.quaternion.copy(_q);
      }
      // the heart beats; its wind-up (heart_pulse / spore_volley share the anim) quickens and swells it
      const winding = a.anim === 'heart_pulse' && (a.animStage === 'telegraph' || a.animStage === 'active');
      const surgeWant = winding ? (a.animStage === 'active' ? 1 : 0.35 + 0.65 * Math.min(1, a.animTime / Math.max(0.1, a.animDur))) : 0;
      surge += (surgeWant - surge) * Math.min(1, dt * 6);
      const b = beat(v.time, 1.15 - 0.6 * surge);
      const sc = (0.5 + 0.5 * ease) * (1 + 0.06 * b * ease + 0.08 * surge);
      heartBone.scale.setScalar(sc);
      heartBone.userData.smScaled = true;
      heartBone.position.set(heartRest.x, heartRest.y, heartRest.z - 0.85 * k * (1 - ease));
      heartMat.emissiveIntensity = 0.22 + ease * (0.85 + 0.45 * b) + surge * 1.1;
      // the embers in the eyes and the fungi wake a little with the tree's wind-ups
      const tele = a.animStage === 'telegraph' ? 1 : 0;
      glowMat.emissiveIntensity = 1.5 + 0.5 * tele;
    },
  });
};

export default build;
