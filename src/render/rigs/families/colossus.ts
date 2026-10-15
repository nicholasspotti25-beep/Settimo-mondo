/**
 * Colossus family: huge, heavy humanoids built of matter — Mostro della Palude (mud, reeds, bones, unlit lanterns), Mostro
 * di Magma (rock and lava, pulsing heart), the fire giant, ice armor golems. Humanoid skeleton with heavy proportions
 * (long arms, short legs, hunched) and the 'colossus' clip library (slower, weightier versions of the humanoid moves).
 */
import * as geo from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { Prng } from '../../kit/noise';
import { mix, shade } from '../../kit/palette';
import { profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';
import { humanoidSkeleton, type HumanoidDims, type HumanoidSkeletonOpts } from './humanoid';

export function colossusSkeleton(mb: ModelBuilder, o: Omit<HumanoidSkeletonOpts, 'build'> & { build?: number }): HumanoidDims {
  const d = humanoidSkeleton(mb, { build: 1, shoulders: 1.45, armLength: 1.28, legLength: 0.82, hunch: 0.07, jaw: true, ...o });
  mb.info.family = 'colossus';
  mb.info.walkSpeed = 1.1 * (o.height / 1.8) * 0.55;
  mb.info.runSpeed = 3.2 * (o.height / 1.8) * 0.5;
  mb.socket('heart', 'chest', [0, 0.02 * o.height, 0.075 * o.height]);
  return d;
}

export type ColossusMatter = 'rock' | 'mud' | 'lava' | 'ice' | 'bone';

export interface ColossusBodyStyle {
  matter: ColossusMatter;
  body: string;
  /** Chunk / plate color. */
  chunk?: string;
  /** Glow of cracks, heart, eyes. */
  glow: string;
  /** Pulsing heart in the chest. */
  heart?: boolean;
  /** Extra dressing for mud colossi: reeds, bones, unlit lanterns. */
  dressing?: boolean;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

export function colossusBody(mb: ModelBuilder, d: HumanoidDims, s: ColossusBodyStyle): SurfaceIds {
  const detail = s.matter === 'mud' ? 'mud' : s.matter === 'lava' ? 'lava' : s.matter === 'ice' ? 'crystal' : 'stone';
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: detail, skinRough: s.matter === 'ice' ? 0.3 : 0.92, glowIntensity: 2.6, ...s.surfaceStyle, overrides: { skin: { detailScale: 1.4, detailStrength: 0.8 }, ...(s.surfaceStyle?.overrides ?? {}) } });
  const H = d.H, R = d.r * 1.25;
  const rng = new Prng(23);
  const chunk = s.chunk ?? shade(s.body, 0.75);
  const dark = shade(s.body, 0.5);
  // torso
  const torso = mb.tube(['hips', 'spine', 'chest', 'neck'], S.skin, {
    radius: profile([[0, 0.085 * R], [0.2, 0.1 * R], [0.5, 0.12 * R * d.sw], [0.75, 0.13 * R * d.sw], [0.88, 0.08 * R], [1, 0.05 * R]]), start: 0.06 * H, tip: 0.03 * H, radial: 16, perBone: 4,
    color: s.body, colorEnd: shade(s.body, 0.85), flatten: [1, 0.78], capStart: true, blendParent: false,
  });
  const rockG = (seed: number) => geo.rock(1, 1, seed, 0.3);
  torso.scatter(S.skin, rockG(3), mb.quality === 'low' ? 10 : 22, { t: [0.1, 0.85], scale: [0.45, 0.85], seed: 4, color: chunk, sink: 0.45 });
  if (s.matter === 'lava' || s.matter === 'ice') torso.scatter(S.glow, geo.spike(0.2, 1.2, 5), mb.quality === 'low' ? 6 : 14, { t: [0.2, 0.8], theta: [-2, 2], scale: [0.2, 0.4], seed: 6, color: s.glow, sink: 0.5 });
  // shoulders: massive boulders
  for (const sd of ['l', 'r'] as const) {
    const sx = sd === 'l' ? 1 : -1;
    mb.part(`arm_${sd}`, geo.rock(0.1 * R, 1, 7 + sx, 0.25, [1.2, 0.9, 1.1]), S.skin, { pos: [sx * 0.02 * H, 0.03 * H, 0], color: chunk });
    const arm = mb.tube([`arm_${sd}`, `forearm_${sd}`, `hand_${sd}`], S.skin, {
      radius: profile([[0, 0.06 * R], [0.3, 0.052 * R], [0.55, 0.058 * R], [0.85, 0.066 * R], [1, 0.05 * R]]), tip: 0.03 * H, radial: 12, perBone: 4, color: s.body, colorEnd: dark, capStart: true,
    });
    arm.scatter(S.skin, rockG(9), mb.quality === 'low' ? 5 : 10, { t: [0.1, 0.9], scale: [0.5, 0.9], seed: 8 + sx, color: chunk, sink: 0.5 });
    // fist: big knuckled block
    mb.part(`hand_${sd}`, geo.rock(0.055 * R, 1, 11 + sx, 0.2, [1.1, 1.2, 1.1]), S.skin, { pos: [0, -0.04 * H, 0.01 * H], color: chunk });
    const leg = mb.tube([`thigh_${sd}`, `shin_${sd}`, `foot_${sd}`], S.skin, {
      radius: profile([[0, 0.085 * R], [0.4, 0.07 * R], [0.75, 0.075 * R], [1, 0.08 * R]]), tip: 0.02 * H, radial: 12, perBone: 4, color: s.body, colorEnd: dark,
    });
    leg.scatter(S.skin, rockG(13), mb.quality === 'low' ? 4 : 8, { t: [0.1, 0.8], scale: [0.5, 0.8], seed: 12 + sx, color: chunk, sink: 0.5 });
    mb.part(`foot_${sd}`, geo.rock(0.07 * R, 1, 15 + sx, 0.18, [1.1, 0.55, 1.5]), S.skin, { pos: [0, -0.02 * H, 0.04 * H], color: dark });
  }
  // head: low brow, glowing eyes, jaw
  mb.part('head', geo.rock(0.07 * R, 1, 21, 0.2, [1.1, 0.9, 1.05]), S.skin, { pos: [0, 0.05 * H, 0.01 * H], color: s.body });
  for (const sx of [-1, 1]) mb.part('head', geo.ellipsoid(0.012 * H, 0.007 * H, 0.006 * H, 8, 6), S.glow, { pos: [sx * 0.025 * H, 0.055 * H, 0.06 * R], color: s.glow });
  mb.part('jaw', geo.rock(0.05 * R, 1, 25, 0.2, [1.1, 0.6, 1.1]), S.skin, { pos: [0, 0.015 * H, 0.03 * H], color: dark });
  if (s.heart) {
    mb.part('chest', geo.ellipsoid(0.05 * R, 0.06 * R, 0.04 * R, 12, 10), S.glow, { pos: [0, 0.02 * H, 0.085 * R], color: s.glow });
    mb.part('chest', geo.torus(0.06 * R, 0.012 * R, 6, 16), S.skin, { pos: [0, 0.02 * H, 0.08 * R], color: dark });
  }
  if (s.dressing) {
    // reeds sprouting from the shoulders/back, ribs of old bones, unlit lanterns hanging on the belt
    for (let i = 0; i < (mb.quality === 'low' ? 10 : 22); i++) {
      const bone = i % 3 === 0 ? 'chest' : i % 3 === 1 ? 'arm_l' : 'arm_r';
      const reed = geo.tube([[0, 0, 0], [rng.range(-0.02, 0.02) * H, 0.08 * H, rng.range(-0.02, 0.02) * H], [rng.range(-0.05, 0.05) * H, 0.15 * H, rng.range(-0.06, 0.02) * H]], profile([[0, 0.004 * H], [1, 0.0015 * H]]), { radial: 4, perSeg: 2 });
      mb.part(bone, reed, S.cloth, { pos: [rng.range(-0.06, 0.06) * H, 0.05 * H, -0.04 * H], rot: [rng.range(-30, 10), rng.range(0, 360), rng.range(-25, 25)], color: mix('#7a7a3a', '#a89a58', rng.next()) });
    }
    for (let i = 0; i < 4; i++) {
      const rib = geo.tube([[0, 0, 0], [0.04 * H, -0.02 * H, 0.03 * H], [0.07 * H, -0.06 * H, 0.02 * H]], profile([[0, 0.006 * H], [1, 0.003 * H]]), { radial: 5, perSeg: 2 });
      mb.part('chest', rib, S.horn, { pos: [0.02 * H, 0.06 * H - i * 0.025 * H, 0.06 * R], rot: [0, -30, 0], color: '#e0d6c0' });
    }
    for (const sx of [-1, 1]) {
      const lan = geo.lathe([[0, 0], [0.012 * H, 0.004 * H], [0.014 * H, 0.03 * H], [0.008 * H, 0.04 * H], [0.003 * H, 0.048 * H]], 6);
      mb.part('hips', lan, S.metal, { pos: [sx * 0.08 * R, -0.04 * H, 0.05 * R], rot: [180, 0, 0], color: '#3a3428' });
    }
  }
  return S;
}
