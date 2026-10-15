/**
 * Bird / griffin family: Aquila Dorata (giant golden eagle), Grifone (eagle front + lion hindquarters), harpies, ravens.
 *
 * Skeleton (rest: standing upright-ish, wings SPREAD, facing +Z, +X = LEFT):
 *   root -> body (pelvis) -> chest -> neck_0..2 -> head -> jaw (lower beak)
 *   chest -> wing_l_0 (humerus) -> wing_l_1 (forearm) -> wing_l_2 (hand)        (+ _r)
 *   body  -> tail_0 (fan)  [griffin: tail_0..n lion tail]
 *   bird:    body -> leg_l_0 (thigh) -> leg_l_1 (tarsus) -> leg_l_2 (foot)      (+ _r)
 *   griffin: chest -> leg_fl_0..2 (eagle forelegs, talons), body -> leg_bl_0..2 (lion hind legs)  (+ right)
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { bezierPoints, boneAt, chainThrough, creatureHead, profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';

export interface BirdOpts {
  /** Standing height to the top of the head (meters). */
  height: number;
  /** Span of ONE wing (meters). */
  wingSpan?: number;
  griffin?: boolean;
  /** Body length (griffin) — default 0.9 x height. */
  length?: number;
}

export interface BirdDims {
  h: number;
  L: number;
  griffin: boolean;
  span: number;
  neck: string[];
  legs: Record<string, string[]>;
  footY: Record<string, number>;
  wings: Record<'l' | 'r', string[]>;
  tail: string[];
  w: number;
}

export function birdSkeleton(mb: ModelBuilder, o: BirdOpts): BirdDims {
  const h = o.height;
  const griffin = !!o.griffin;
  const L = o.length ?? (griffin ? 0.9 * h : 0.45 * h);
  const w = griffin ? 0.2 * h : 0.17 * h;
  const bodyY = griffin ? 0.52 * h : 0.48 * h;
  mb.bone('body', 'root', [0, bodyY, griffin ? -L * 0.45 : -0.08 * h]);
  mb.bone('chest', 'body', griffin ? [0, 0.08 * h, L * 0.9] : [0, 0.16 * h, 0.12 * h]);
  const chest = mb.restPos('chest');
  const a: V3 = [0, chest.y + 0.08 * h, chest.z + 0.06 * h];
  const tip: V3 = [0, h * 0.86, chest.z + 0.18 * h];
  const np = [a, ...bezierPoints(a, [0, h * 0.8, chest.z + 0.02 * h], tip, 3)];
  const neck = chainThrough(mb, 'neck', 'chest', np.slice(0, 3));
  boneAt(mb, 'head', neck[2], tip);
  boneAt(mb, 'jaw', 'head', [0, tip[1] - 0.02 * h, tip[2] + 0.03 * h]);
  mb.socket('mouth', 'head', [0, -0.02 * h, 0.22 * h]);
  const span = o.wingSpan ?? 1.2 * h;
  const wings = {} as BirdDims['wings'];
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    const sh: V3 = [sx * w * 0.7, chest.y + 0.08 * h, chest.z - 0.02 * h];
    const el: V3 = [sx * (w * 0.7 + span * 0.32), sh[1] + span * 0.04, sh[2] - span * 0.02];
    const wr: V3 = [sx * (w * 0.7 + span * 0.6), sh[1] + span * 0.06, sh[2] + span * 0.02];
    wings[s] = chainThrough(mb, `wing_${s}`, 'chest', [sh, el, wr]);
  }
  const legs: Record<string, string[]> = {};
  const footY: Record<string, number> = {};
  if (griffin) {
    for (const sfx of ['fl', 'fr']) {
      const sx = sfx === 'fl' ? 1 : -1;
      mb.bone(`leg_${sfx}_0`, 'chest', [sx * w * 0.75, -0.08 * h, 0.02 * h]);
      mb.bone(`leg_${sfx}_1`, `leg_${sfx}_0`, [0, -0.2 * h, -0.02 * h]);
      mb.bone(`leg_${sfx}_2`, `leg_${sfx}_1`, [0, -0.17 * h, 0.03 * h]);
      legs[sfx] = [`leg_${sfx}_0`, `leg_${sfx}_1`, `leg_${sfx}_2`];
      footY[sfx] = mb.restPos(`leg_${sfx}_2`).y;
    }
    for (const sfx of ['bl', 'br']) {
      const sx = sfx === 'bl' ? 1 : -1;
      mb.bone(`leg_${sfx}_0`, 'body', [sx * w * 0.8, -0.04 * h, 0]);
      mb.bone(`leg_${sfx}_1`, `leg_${sfx}_0`, [0, -0.2 * h, 0.08 * h]);
      mb.bone(`leg_${sfx}_2`, `leg_${sfx}_1`, [0, -0.2 * h, -0.08 * h]);
      legs[sfx] = [`leg_${sfx}_0`, `leg_${sfx}_1`, `leg_${sfx}_2`];
      footY[sfx] = mb.restPos(`leg_${sfx}_2`).y;
    }
  } else {
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      mb.bone(`leg_${s}_0`, 'body', [sx * w * 0.55, -0.04 * h, 0.04 * h]);
      mb.bone(`leg_${s}_1`, `leg_${s}_0`, [0, -0.2 * h, 0.06 * h]);
      mb.bone(`leg_${s}_2`, `leg_${s}_1`, [0, -0.18 * h, -0.02 * h]);
      legs[s] = [`leg_${s}_0`, `leg_${s}_1`, `leg_${s}_2`];
      footY[s] = mb.restPos(`leg_${s}_2`).y;
    }
  }
  const body = mb.restPos('body');
  const tail = griffin
    ? chainThrough(mb, 'tail', 'body', [0, 1, 2, 3, 4].map((i) => [0, body.y + 0.04 * h - i * 0.06 * h, body.z - 0.12 * h - i * 0.14 * h] as V3))
    : chainThrough(mb, 'tail', 'body', [[0, body.y + 0.02 * h, body.z - 0.14 * h]]);
  mb.size = bodyY;
  mb.height = h;
  mb.info.family = mb.info.family ?? 'bird';
  mb.info.rootBone = 'body';
  mb.info.walkSpeed = 1.4 * (h / 3);
  mb.info.runSpeed = 5 * (h / 3);
  mb.info.look = [{ bone: 'head', weight: 0.7, limit: 70 }, { bone: 'neck_2', weight: 0.25, limit: 30 }];
  mb.info.flinch = ['chest', 'neck_0'];
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  if (griffin) springs.push({ chain: 'tail', stiffness: 40, damping: 6, gravity: 1.2, falloff: 0.5 });
  mb.info.springs = springs;
  return { h, L, griffin, span, neck, legs, footY, wings, tail, w };
}

export interface BirdBodyStyle {
  feather: string;
  featherTip?: string;
  belly?: string;
  /** Griffin hindquarter fur. */
  fur?: string;
  beak?: string;
  talon?: string;
  eye: string;
  /** Glowing feather edges (light / golden birds). */
  glow?: string;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

/** One feather: quill + vane (double sided), along +Y. */
export function featherGeo(len: number, width: number, curl = 0.08): THREE.BufferGeometry {
  return geo.doubleSide(geo.leaf(len, width, 5, curl, 0.12));
}

export function birdBody(mb: ModelBuilder, d: BirdDims, s: BirdBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: 'feather', skinRough: 0.8, ...s.surfaceStyle });
  mb.surface('feathers', { roughness: 0.85, metalness: 0, detail: 'feather', detailScale: 3, detailStrength: 0.6, rim: 1.2, side: THREE.DoubleSide, ...(s.surfaceStyle?.overrides?.cape ?? {}) });
  const h = d.h, w = d.w;
  const belly = s.belly ?? mix(s.feather, '#fff4dc', 0.4);
  const tipC = s.featherTip ?? shade(s.feather, 0.55);
  const talon = s.talon ?? '#2a2018';
  const beak = s.beak ?? '#e8b830';
  // torso
  if (d.griffin) {
    mb.tube(['body', 'chest'], S.skin, {
      radius: profile([[0, w * 0.8], [0.25, w * 1.05], [0.6, w * 1.0], [0.85, w * 1.15], [1, w * 0.9]]), start: 0.18 * h, tip: 0.12 * h, blendParent: false, radial: 14, perBone: 6,
      color: s.fur ?? '#c89a58', colorEnd: s.feather, belly, flatten: [0.85, 1], capStart: true, capEnd: true,
    });
  } else {
    mb.tube(['body', 'chest'], S.skin, {
      radius: profile([[0, w * 0.75], [0.3, w * 1.05], [0.7, w * 1.08], [1, w * 0.85]]), start: 0.12 * h, tip: 0.1 * h, blendParent: false, radial: 14, perBone: 6,
      color: s.feather, belly, flatten: [0.92, 1.05], capStart: true, capEnd: true,
    });
  }
  // neck + head
  const neck = mb.tube(['chest', ...d.neck, 'head'], S.skin, { radius: profile([[0, w * 0.8], [0.5, w * 0.5], [1, w * 0.42]]), tip: 0.03 * h, blendParent: false, radial: 12, perBone: 3, color: s.feather, belly, capEnd: false });
  neck.scatter('feathers', featherGeo(1, 0.5, 0.15), mb.quality === 'low' ? 8 : 18, { t: [0.05, 0.95], scale: [0.45, 0.7], lean: 70, seed: 3, color: s.feather, sink: 0.25 });
  creatureHead(mb, S, 'head', 'jaw', { length: 0.16 * h, width: 0.12 * h, height: 0.11 * h, color: s.feather, belly, eye: s.eye, eyeGlow: !!s.glow, eyeSize: 1.3, snout: 'beak', beakColor: beak });
  // wings: feathers fanned on the three arm bones
  for (const sd of ['l', 'r'] as const) {
    const sx = sd === 'l' ? 1 : -1;
    const bones = d.wings[sd];
    mb.tube(bones, S.skin, { radius: profile([[0, w * 0.32], [0.6, w * 0.16], [1, w * 0.1]]), tip: 0.04 * h, radial: 8, perBone: 3, color: s.feather, blendParent: false });
    const seg = d.span / 3;
    const pri = mb.quality === 'low' ? 6 : 9, sec = mb.quality === 'low' ? 6 : 9, cov = mb.quality === 'low' ? 5 : 8;
    // primaries: long, fanning from the hand toward the tip and back
    mb.fan(bones[2], 'feathers', () => featherGeo(d.span * 0.42, d.span * 0.07, 0.1), pri, {
      from: [-90, 0, sx * -84], to: [-90, 0, sx * -22], pos: [sx * seg * 0.1, 0, 0], posTo: [sx * seg * 0.55, 0, 0], scale: [1, 0.85], color: s.feather, colorEnd: tipC,
    });
    // secondaries: along the forearm, pointing back
    mb.fan(bones[1], 'feathers', () => featherGeo(d.span * 0.3, d.span * 0.07, 0.08), sec, {
      from: [-90, 0, sx * -16], to: [-90, 0, sx * -4], pos: [0, 0, -0.01 * h], posTo: [sx * seg * 0.95, 0, -0.01 * h], scale: [0.95, 0.85], color: shade(s.feather, 0.95), colorEnd: tipC,
    });
    // coverts over the arm
    mb.fan(bones[0], 'feathers', () => featherGeo(d.span * 0.18, d.span * 0.08, 0.05), cov, {
      from: [-90, 0, sx * -14], to: [-90, 0, sx * -2], pos: [0, 0.01 * h, 0], posTo: [sx * seg * 0.95, 0.01 * h, 0], scale: [0.9, 0.8], color: s.feather, colorEnd: shade(s.feather, 0.85),
    });
    if (s.glow) mb.fan(bones[2], S.glow, () => geo.leaf(d.span * 0.36, d.span * 0.012, 3, 0.1, 0), pri, {
      from: [-90, 0, sx * -84], to: [-90, 0, sx * -22], pos: [sx * seg * 0.1, -0.005 * h, 0], posTo: [sx * seg * 0.55, -0.005 * h, 0], scale: [1, 0.85], color: s.glow,
    });
  }
  // tail
  if (d.griffin) {
    mb.tube(d.tail, S.skin, { radius: profile([[0, w * 0.18], [0.9, w * 0.1], [1, w * 0.04]]), tip: 0.06 * h, radial: 7, perBone: 2, color: s.fur ?? '#c89a58' });
    mb.part(d.tail[d.tail.length - 1], geo.furTuft(0.16 * h, 0.03 * h, 6, 7, 0.4), S.skin, { rot: [-100, 0, 0], color: shade(s.fur ?? '#c89a58', 0.6) });
  } else {
    mb.fan(d.tail[0], 'feathers', () => featherGeo(0.32 * h, 0.06 * h, 0.05), mb.quality === 'low' ? 5 : 9, { from: [-100, 0, 35], to: [-100, 0, -35], color: s.feather, colorEnd: tipC });
  }
  // legs
  for (const [leg, bones] of Object.entries(d.legs)) {
    const lion = d.griffin && leg[0] === 'b';
    const fy = d.footY[leg];
    mb.tube(bones, S.skin, {
      radius: profile(lion ? [[0, w * 0.55], [0.4, w * 0.3], [1, w * 0.18]] : [[0, w * 0.45], [0.35, w * 0.2], [0.5, w * 0.1], [1, w * 0.09]]), tip: 0.02 * h, radial: 9, perBone: 3,
      color: lion ? (s.fur ?? '#c89a58') : s.feather, colorEnd: lion ? shade(s.fur ?? '#c89a58', 0.8) : '#d8a83a', blendParent: false,
    });
    const foot = bones[2];
    if (lion) {
      mb.part(foot, geo.ellipsoid(0.06 * h, 0.035 * h, 0.08 * h, 8, 6), S.skin, { pos: [0, -fy + 0.03 * h, 0.03 * h], color: shade(s.fur ?? '#c89a58', 0.7) });
    } else {
      for (const a of [-30, 0, 30, 180]) {
        const toe = geo.tube([[0, 0, 0], [0, -0.01 * h, 0.07 * h], [0, -0.03 * h, 0.1 * h]], profile([[0, 0.014 * h], [1, 0.004 * h]]), { radial: 5, perSeg: 2 });
        mb.part(foot, toe, S.horn, { pos: [0, -fy + 0.025 * h, 0], rot: [0, a, 0], color: talon });
      }
    }
  }
  return S;
}
