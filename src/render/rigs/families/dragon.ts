/**
 * Dragon family (up to 3 heads, membrane wings, long tail; walks, flies, hovers and dives): Drago Rosso, Drago di Ghiaccio,
 * Drago Tricefalo, Re Drago / Regina Drago, Drago del Vuoto. Also wyverns (`frontLegs: false`).
 *
 * Skeleton (rest: standing, wings SPREAD, facing +Z, +X = LEFT):
 *   root -> body (pelvis) -> spine -> chest
 *   chest -> neck{sfx}_0..k -> head{sfx} -> jaw{sfx}            sfx: '' | _l | _r
 *   chest -> leg_fl_0..2 / leg_fr_0..2      body -> leg_bl_0..2 / leg_br_0..2
 *   body  -> tail_0..m
 *   chest -> wing_l_0 (humerus) -> wing_l_1 (forearm) -> wing_l_2 (wrist) -> wing_l_f{0,1,2}_{0,1} (fingers)
 *   chest -> wing_l_b_0 -> wing_l_b_1 (membrane edge along the flank)   (+ the same for _r)
 * Clip root offsets/rotation drive `body`.
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { bezierPoints, boneAt, chainThrough, creatureHead, dorsalSpikes, headSuffixes, profile, standardSurfaces, suffixSide, type SurfaceIds, type SurfaceStyle } from './common';

export interface DragonOpts {
  /** Pelvis-to-chest length (meters). */
  length: number;
  /** Height at the shoulders (meters). */
  height: number;
  heads?: number;
  neckLength?: number;
  neckBones?: number;
  tailLength?: number;
  tailBones?: number;
  /** Wing span of ONE wing (meters). 0 = wingless. */
  wingSpan?: number;
  /** Wyvern: wings are the forelimbs (no front legs). */
  frontLegs?: boolean;
  width?: number;
}

export interface DragonDims {
  L: number;
  h: number;
  w: number;
  heads: string[];
  necks: Record<string, string[]>;
  tail: string[];
  legs: Record<'fl' | 'fr' | 'bl' | 'br', string[]>;
  footY: Record<'fl' | 'fr' | 'bl' | 'br', number>;
  wings: Record<'l' | 'r', { arm: string[]; fingers: string[][]; edge: string[] }>;
  span: number;
  bodyY: number;
}

export function dragonSkeleton(mb: ModelBuilder, o: DragonOpts): DragonDims {
  const L = o.length, h = o.height, w = o.width ?? 0.3 * h;
  const bodyY = h * 0.98, chestY = h * 1.02;
  mb.bone('body', 'root', [0, bodyY, -L * 0.45]);
  mb.bone('spine', 'body', [0, (chestY - bodyY) * 0.5 + 0.04 * h, L * 0.5]);
  mb.bone('chest', 'spine', [0, (chestY - bodyY) * 0.5 - 0.04 * h, L * 0.5]);
  const chest = mb.restPos('chest');
  const heads = headSuffixes(Math.min(3, o.heads ?? 1));
  const nl = o.neckLength ?? 1.1 * h;
  const nb = mb.seg(o.neckBones ?? 6, 4);
  const necks: Record<string, string[]> = {};
  for (const sfx of heads) {
    const { side } = suffixSide(sfx);
    const a: V3 = [side * w * 0.5, chest.y + 0.12 * h, chest.z + 0.18 * L];
    const tip: V3 = [side * nl * 0.38, chest.y + nl * 0.62, chest.z + nl * 0.72];
    const ctrl: V3 = [side * nl * 0.12, chest.y + nl * 0.75, chest.z + nl * 0.12];
    const np = [a, ...bezierPoints(a, ctrl, tip, nb)];
    necks[sfx] = chainThrough(mb, `neck${sfx}`, 'chest', np.slice(0, nb));
    const hp = np[np.length - 1];
    boneAt(mb, `head${sfx}`, necks[sfx][nb - 1], hp);
    boneAt(mb, `jaw${sfx}`, `head${sfx}`, [hp[0], hp[1] - 0.06 * h, hp[2] + 0.06 * h]);
    mb.socket(`mouth${sfx}`, `head${sfx}`, [0, -0.04 * h, 0.55 * h]);
  }
  // legs
  const legs = {} as DragonDims['legs'];
  const footY = {} as DragonDims['footY'];
  const front = o.frontLegs !== false;
  const fUp = 0.36 * h, fLo = 0.34 * h;
  if (front) {
    for (const sfx of ['fl', 'fr'] as const) {
      const sx = sfx === 'fl' ? 1 : -1;
      mb.bone(`leg_${sfx}_0`, 'chest', [sx * w * 0.85, -0.1 * h, 0.04 * L]);
      mb.bone(`leg_${sfx}_1`, `leg_${sfx}_0`, [sx * 0.04 * h, -fUp, -0.06 * h]);
      mb.bone(`leg_${sfx}_2`, `leg_${sfx}_1`, [0, -fLo, 0.06 * h]);
      legs[sfx] = [`leg_${sfx}_0`, `leg_${sfx}_1`, `leg_${sfx}_2`];
      footY[sfx] = mb.restPos(`leg_${sfx}_2`).y;
    }
  }
  const hUp = 0.42 * h, hLo = 0.4 * h;
  for (const sfx of ['bl', 'br'] as const) {
    const sx = sfx === 'bl' ? 1 : -1;
    mb.bone(`leg_${sfx}_0`, 'body', [sx * w * 0.9, -0.08 * h, 0]);
    mb.bone(`leg_${sfx}_1`, `leg_${sfx}_0`, [sx * 0.03 * h, -hUp, 0.2 * h]);
    mb.bone(`leg_${sfx}_2`, `leg_${sfx}_1`, [0, -hLo, -0.22 * h]);
    legs[sfx] = [`leg_${sfx}_0`, `leg_${sfx}_1`, `leg_${sfx}_2`];
    footY[sfx] = mb.restPos(`leg_${sfx}_2`).y;
  }
  // tail
  const tl = o.tailLength ?? 1.6 * L;
  const tb = mb.seg(o.tailBones ?? 9, 5);
  const body = mb.restPos('body');
  const tailPts: V3[] = [];
  for (let i = 0; i < tb; i++) {
    const t = i / tb;
    tailPts.push([0, body.y + 0.05 * h - t * t * h * 0.75, body.z - 0.2 * L - t * tl]);
  }
  const tail = chainThrough(mb, 'tail', 'body', tailPts);
  // wings
  const span = o.wingSpan ?? 1.6 * h;
  const wings = {} as DragonDims['wings'];
  if (span > 0) {
    for (const s of ['l', 'r'] as const) {
      const sx = s === 'l' ? 1 : -1;
      const sh: V3 = [sx * w * 0.6, chest.y + 0.22 * h, chest.z - 0.05 * L];
      const elbow: V3 = [sx * (w * 0.6 + span * 0.3), sh[1] + span * 0.16, sh[2] - span * 0.05];
      const wrist: V3 = [sx * (w * 0.6 + span * 0.55), sh[1] + span * 0.22, sh[2] + span * 0.04];
      const arm = chainThrough(mb, `wing_${s}`, 'chest', [sh, elbow, wrist]);
      const fingers: string[][] = [];
      const fdirs: [number, number, number][] = [[0.5, 0.06, -0.06], [0.42, -0.08, -0.28], [0.22, -0.18, -0.46]];
      fdirs.forEach((fd, k) => {
        const p1: V3 = [wrist[0] + sx * fd[0] * span * 0.5, wrist[1] + fd[1] * span * 0.5, wrist[2] + fd[2] * span * 0.5];
        const p2: V3 = [wrist[0] + sx * fd[0] * span, wrist[1] + fd[1] * span, wrist[2] + fd[2] * span];
        const fp = [wrist, p1, p2];
        const names: string[] = [];
        let par = arm[2];
        for (let i = 1; i < fp.length; i++) {
          const n = `wing_${s}_f${k}_${i - 1}`;
          boneAt(mb, n, par, fp[i]);
          names.push(n);
          par = n;
        }
        mb.namedChain(`wing_${s}_f${k}`, names);
        fingers.push(names);
      });
      const e0 = boneAt(mb, `wing_${s}_b_0`, 'chest', [sx * w * 0.75, chest.y + 0.12 * h, chest.z - 0.1 * L]);
      const e1 = boneAt(mb, `wing_${s}_b_1`, 'body', [sx * w * 0.8, body.y + 0.06 * h, body.z + 0.05 * L]);
      mb.namedChain(`wing_${s}_b`, [e0, e1]);
      wings[s] = { arm, fingers, edge: [e0, e1] };
    }
  }
  mb.size = bodyY;
  mb.height = Math.max(chest.y + nl * 0.75, h * 1.6);
  mb.info.family = mb.info.family ?? 'dragon';
  mb.info.rootBone = 'body';
  mb.info.walkSpeed = 1.6 * (h / 3);
  mb.info.runSpeed = 6 * (h / 3);
  mb.info.look = heads.map((s) => ({ bone: `head${s}`, weight: 0.55, limit: 50 }));
  mb.info.flinch = ['spine', 'chest', ...heads.map((s) => `neck${s}_0`)];
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  springs.push({ chain: 'tail', stiffness: 34, damping: 5.5, gravity: 0.6, falloff: 0.55 });
  if (span > 0) for (const s of ['l', 'r']) for (let k = 0; k < 3; k++) springs.push({ chain: `wing_${s}_f${k}`, stiffness: 90, damping: 9, gravity: 0.2, falloff: 0.3, weight: 0.5 });
  mb.info.springs = springs;
  return { L, h, w, heads, necks, tail, legs, footY, wings, span, bodyY };
}

export interface DragonBodyStyle {
  body: string;
  belly?: string;
  membrane?: string;
  membraneEdge?: string;
  horn?: string;
  eye: string;
  /** Per-head colors (Re Drago: Legge gold, Memoria white, Pietà azure). */
  headColors?: Record<string, string>;
  /** Glowing veins/crystals scattered on the back. */
  glow?: string;
  /** Crystal shards instead of scales (ice dragon). */
  crystals?: boolean;
  /** Star specks inside dark scales (Drago del Vuoto). */
  stars?: boolean;
  spikes?: boolean;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

export function dragonBody(mb: ModelBuilder, d: DragonDims, s: DragonBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: s.crystals ? 'crystal' : 'scales', skinRough: 0.48, ...s.surfaceStyle });
  const h = d.h, L = d.L, w = d.w;
  const belly = s.belly ?? mix(s.body, '#f0e0b0', 0.4);
  const horn = s.horn ?? '#e8dcc0';
  const dark = shade(s.body, 0.55);
  // barrel
  const barrel = mb.tube(['body', 'spine', 'chest'], S.skin, {
    radius: profile([[0, w * 0.7], [0.15, w * 1.05], [0.45, w * 1.1], [0.75, w * 1.12], [0.92, w * 0.95], [1, w * 0.7]]),
    start: 0.25 * L, tip: 0.18 * L, blendParent: false, flatten: [0.9, 1.0], radial: 16, perBone: 4, color: s.body, belly, capStart: false, capEnd: true,
  });
  // belly plates
  const bp = geo.plate(0.8, 0.5, 0.7, 0.06, 4, 1);
  bp.rotateX(Math.PI / 2);
  barrel.scatter(S.skin, bp, mb.quality === 'low' ? 6 : 12, { t: [0.1, 0.92], theta: [Math.PI - 0.15, Math.PI + 0.15], scale: [0.55, 0.6], seed: 2, color: shade(belly, 0.92), rows: true, sink: 0.3 });
  if (s.crystals) barrel.scatter(S.glow, geo.spike(0.25, 1, 5), mb.quality === 'low' ? 10 : 26, { t: [0.05, 0.95], theta: [-1.3, 1.3], scale: [0.3, 0.75], lean: 20, seed: 4, color: s.glow ?? '#bfe8ff', sink: 0.2 });
  if (s.stars) barrel.scatter(S.glow, geo.ellipsoid(0.06, 0.06, 0.06, 5, 4), mb.quality === 'low' ? 14 : 40, { t: [0.02, 0.98], scale: [0.25, 0.5], seed: 9, color: s.glow ?? '#d8c8ff', sink: 0.6 });
  // necks + heads
  for (const sfx of d.heads) {
    const hc = s.headColors?.[sfx] ?? s.body;
    const nk = d.necks[sfx];
    const neck = mb.tube(['chest', ...nk, `head${sfx}`], S.skin, {
      radius: profile([[0, w * 0.75], [0.25, w * 0.5], [0.8, w * 0.36], [1, w * 0.33]]), tip: 0.04 * h, blendParent: false, radial: 12, perBone: 3,
      color: s.body, colorEnd: hc, belly, capEnd: false,
    });
    if (s.crystals) neck.scatter(S.glow, geo.spike(0.25, 1, 5), mb.quality === 'low' ? 4 : 10, { t: [0.1, 0.9], theta: [-0.6, 0.6], scale: [0.3, 0.5], lean: 30, seed: 6, color: s.glow ?? '#bfe8ff', sink: 0.2 });
    creatureHead(mb, S, `head${sfx}`, `jaw${sfx}`, {
      length: 0.62 * h, width: 0.3 * h, height: 0.24 * h, color: hc, belly, eye: s.eye, eyeGlow: true, teeth: true, horns: 2, hornColor: horn, crest: 4,
      nostrilGlow: !!s.glow, snout: 'reptile',
    });
    if (s.spikes !== false) dorsalSpikes(mb, S.horn, nk, (t) => 0.12 * h * (1 - t * 0.4), horn, { offsetY: () => w * 0.36, lean: 40 });
  }
  // legs
  for (const leg of Object.keys(d.legs) as ('fl' | 'fr' | 'bl' | 'br')[]) {
    const bones = d.legs[leg];
    const front = leg[0] === 'f';
    const top = front ? w * 0.48 : w * 0.62;
    mb.tube(bones, S.skin, {
      radius: profile([[0, top], [0.3, top * 0.7], [0.6, h * 0.08], [1, h * 0.06]]), tip: 0.04 * h, radial: 10, perBone: 3, color: s.body, colorEnd: dark, blendParent: false,
    });
    const foot = bones[2];
    const fy = d.footY[leg];
    const pad = geo.ellipsoid(0.11 * h, 0.05 * h, 0.15 * h, 10, 6);
    mb.part(foot, pad, S.skin, { pos: [0, -fy + 0.05 * h, 0.06 * h], color: dark });
    for (const sx of [-1, 0, 1]) mb.part(foot, geo.horn(0.13 * h, 0.03 * h, 1.2, 0, 6, 5), S.horn, { pos: [sx * 0.06 * h, -fy + 0.05 * h, 0.17 * h], rot: [90, 0, 0], color: horn });
    if (fy > 0.02) mb.part(foot, geo.tube([[0, 0, 0], [0, -fy * 0.5, 0.02 * h], [0, -fy + 0.04 * h, 0.04 * h]], profile([[0, 0.07 * h], [1, 0.06 * h]]), { radial: 8, perSeg: 2 }), S.skin, { color: dark });
  }
  // tail
  const tail = mb.tube(d.tail, S.skin, { radius: profile([[0, w * 0.62], [0.3, w * 0.42], [0.8, w * 0.14], [1, w * 0.05]]), tip: 0.2 * h, radial: 10, perBone: 3, color: s.body, colorEnd: dark, belly, start: 0.1 * L });
  if (s.crystals) tail.scatter(S.glow, geo.spike(0.25, 1, 5), mb.quality === 'low' ? 5 : 12, { t: [0.05, 0.9], theta: [-0.5, 0.5], scale: [0.3, 0.55], lean: 35, seed: 8, color: s.glow ?? '#bfe8ff', sink: 0.2 });
  const tipBone = d.tail[d.tail.length - 1];
  const spade = geo.blade([[-0.16 * h, 0], [0.16 * h, 0], [0.05 * h, 0.22 * h], [0, 0.34 * h], [-0.05 * h, 0.22 * h]], 0.03 * h, 0.01 * h, 2);
  mb.part(tipBone, spade, S.horn, { pos: [0, 0, -0.1 * h], rot: [-90, 0, 0], color: horn });
  if (s.spikes !== false) {
    dorsalSpikes(mb, S.horn, ['body', 'spine', 'chest'], (t) => 0.18 * h * (0.7 + t * 0.3), horn, { offsetY: () => w * 0.95, lean: 35, perBone: 2 });
    dorsalSpikes(mb, S.horn, d.tail.slice(0, -1), (t) => 0.15 * h * (1 - t * 0.8), horn, { offsetY: (t) => w * 0.55 * (1 - t * 0.7), lean: 45 });
  }
  // wings
  if (d.span > 0) {
    const mem = s.membrane ?? shade(s.body, 0.75);
    const edge = s.membraneEdge ?? mix(mem, s.glow ?? '#ffb070', 0.35);
    mb.surface('membrane', { roughness: 0.75, metalness: 0, detail: 'skin', detailScale: 1.4, detailStrength: 0.5, rim: 1.4, side: THREE.DoubleSide, ...(s.surfaceStyle?.overrides?.cape ?? {}) });
    for (const sd of ['l', 'r'] as const) {
      const wg = d.wings[sd];
      mb.tube(wg.arm, S.skin, { radius: profile([[0, w * 0.32], [0.5, w * 0.18], [1, w * 0.12]]), tip: 0.05 * h, radial: 8, perBone: 3, color: s.body, colorEnd: dark, blendParent: false });
      for (const f of wg.fingers) mb.tube([wg.arm[2], ...f], S.horn, { radius: profile([[0, w * 0.09], [1, w * 0.02]]), tip: 0.02 * h, radial: 6, perBone: 3, color: shade(s.body, 0.7), blendParent: false });
      mb.part(wg.arm[2], geo.horn(0.2 * h, 0.04 * h, 0.8, 0, 6, 5), S.horn, { rot: [-60, 0, 0], color: horn });
      const lead = [...wg.arm, ...wg.fingers[0]];
      const rays = [lead, [wg.arm[2], ...wg.fingers[1]], [wg.arm[2], ...wg.fingers[2]], wg.edge];
      mb.membrane(rays, 'membrane', { samples: 9, cols: 4, scallop: 0.22, color: mem, colorEdge: edge, tip: 0.001 });
    }
  }
  return S;
}
