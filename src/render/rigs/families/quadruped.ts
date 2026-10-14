/**
 * Quadruped family: wolves, bears, Cerbero (multi-head), steeds of mounted knights, lion bodies.
 *
 * Skeleton (rest: standing, facing +Z, +X = LEFT):
 *   root -> body (pelvis, over the hind legs) -> spine -> chest (over the front legs)
 *   chest -> neck_0..n -> head -> jaw            (extra heads: neck_l_*, head_l, jaw_l / neck_r_*, head_r, jaw_r)
 *   chest -> leg_fl_0 (upper) -> leg_fl_1 (lower) -> leg_fl_2 (foot)   (+ leg_fr_*)
 *   body  -> leg_bl_0 (thigh) -> leg_bl_1 (shank) -> leg_bl_2 (foot)   (+ leg_br_*)
 *   body  -> tail_0..n
 * Clip root offsets/rotation apply to `body` (rearing pivots on the hind legs).
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';

export type LegStyle = 'equine' | 'canine' | 'ursine' | 'feline';

export interface QuadrupedOpts {
  /** Shoulder-to-hip distance (meters). */
  length: number;
  /** Height at the withers (meters). */
  height: number;
  legStyle?: LegStyle;
  /** 1, 2 or 3 heads. */
  heads?: number;
  neckBones?: number;
  /** Neck length as a fraction of height (default by leg style). */
  neckLength?: number;
  /** Neck elevation in degrees above horizontal (equine ~50, canine ~25). */
  neckAngle?: number;
  tailBones?: number;
  tailLength?: number;
  /** Body half-width (meters). Default 0.22 x height. */
  width?: number;
  prefix?: string;
}

export interface QuadrupedDims {
  h: number;
  L: number;
  w: number;
  p: string;
  style: LegStyle;
  heads: string[]; // head suffixes: '' | '_l' | '_r'
  necks: Record<string, string[]>;
  tail: string[];
  legs: Record<'fl' | 'fr' | 'bl' | 'br', string[]>;
  /** Vertical distance from the lowest leg bone to the ground (rest). */
  foot: Record<'fl' | 'fr' | 'bl' | 'br', number>;
  bodyY: number;
  chestY: number;
}

export function quadrupedSkeleton(mb: ModelBuilder, o: QuadrupedOpts): QuadrupedDims {
  const h = o.height, L = o.length, p = o.prefix ?? '';
  const style = o.legStyle ?? 'canine';
  const B = (n: string) => `${p}${n}`;
  const w = o.width ?? 0.22 * h;
  const bodyY = h * (style === 'ursine' ? 0.86 : style === 'equine' ? 0.9 : 0.88);
  const chestY = h * 0.94;
  mb.bone(B('body'), 'root', [0, bodyY, -L / 2]);
  mb.bone(B('spine'), B('body'), [0, (chestY - bodyY) * 0.5 + 0.02 * h, L * 0.5]);
  mb.bone(B('chest'), B('spine'), [0, (chestY - bodyY) * 0.5 - 0.02 * h, L * 0.5]);
  // necks/heads
  const nHeads = Math.max(1, Math.min(3, o.heads ?? 1));
  const suffixes = nHeads === 1 ? [''] : nHeads === 2 ? ['_l', '_r'] : ['', '_l', '_r'];
  const nb = o.neckBones ?? (style === 'equine' ? 3 : 2);
  const nl = (o.neckLength ?? (style === 'equine' ? 0.62 : style === 'ursine' ? 0.32 : 0.42)) * h;
  const na = (o.neckAngle ?? (style === 'equine' ? 52 : style === 'ursine' ? 12 : 28)) * (Math.PI / 180);
  const necks: Record<string, string[]> = {};
  for (const sfx of suffixes) {
    const side = sfx === '_l' ? 1 : sfx === '_r' ? -1 : 0;
    const splay = side * 0.32;
    const seg = nl / nb;
    const step: V3 = [Math.sin(splay) * seg * 0.6, Math.sin(na) * seg, Math.cos(na) * seg];
    const first: V3 = [side * w * 0.45, 0.08 * h, 0.1 * L];
    const names = mb.chain(B(`neck${sfx}`), B('chest'), nb, first, step);
    necks[sfx] = names;
    const headOff: V3 = [step[0] * 0.5, step[1] * 0.6, step[2] * 0.7];
    mb.bone(B(`head${sfx}`), names[names.length - 1], headOff);
    mb.bone(B(`jaw${sfx}`), B(`head${sfx}`), [0, -0.04 * h, 0.04 * h]);
    mb.socket(B(`mouth${sfx}`), B(`head${sfx}`), [0, -0.02 * h, (style === 'equine' ? 0.42 : 0.3) * h * 0.8]);
  }
  // legs
  const legs = {} as QuadrupedDims['legs'];
  const fUp = 0.3 * h, fLo = 0.3 * h;
  for (const sfx of ['fl', 'fr'] as const) {
    const sx = sfx === 'fl' ? 1 : -1;
    const y0 = chestY - 0.06 * h;
    const top: V3 = [sx * w * 0.72, -0.06 * h, 0.02 * L];
    const footLen = Math.max(0.05 * h, y0 - fUp - fLo);
    mb.bone(B(`leg_${sfx}_0`), B('chest'), top);
    mb.bone(B(`leg_${sfx}_1`), B(`leg_${sfx}_0`), [0, -fUp, style === 'ursine' ? 0.02 * h : -0.03 * h]);
    mb.bone(B(`leg_${sfx}_2`), B(`leg_${sfx}_1`), [0, -fLo, style === 'equine' ? 0.0 : 0.02 * h]);
    legs[sfx] = [B(`leg_${sfx}_0`), B(`leg_${sfx}_1`), B(`leg_${sfx}_2`)];
    mb.socket(B(`paw_${sfx}`), B(`leg_${sfx}_2`), [0, -footLen + 0.02 * h, 0.04 * h]);
    void y0;
  }
  const hUp = 0.32 * h, hLo = 0.34 * h;
  for (const sfx of ['bl', 'br'] as const) {
    const sx = sfx === 'bl' ? 1 : -1;
    mb.bone(B(`leg_${sfx}_0`), B('body'), [sx * w * 0.7, -0.04 * h, 0.0]);
    const ursine = style === 'ursine';
    mb.bone(B(`leg_${sfx}_1`), B(`leg_${sfx}_0`), [0, -hUp, ursine ? 0.04 * h : 0.12 * h]);
    mb.bone(B(`leg_${sfx}_2`), B(`leg_${sfx}_1`), [0, -hLo, ursine ? -0.02 * h : -0.14 * h]);
    legs[sfx] = [B(`leg_${sfx}_0`), B(`leg_${sfx}_1`), B(`leg_${sfx}_2`)];
  }
  const foot = { fl: chestY - 0.06 * h - fUp - fLo, fr: chestY - 0.06 * h - fUp - fLo, bl: bodyY - 0.04 * h - hUp - hLo, br: bodyY - 0.04 * h - hUp - hLo };
  const tb = o.tailBones ?? (style === 'ursine' ? 1 : 4);
  const tl = (o.tailLength ?? (style === 'equine' ? 0.55 : style === 'ursine' ? 0.12 : 0.5)) * h;
  const tail = tb > 0 ? mb.chain(B('tail'), B('body'), tb, [0, 0.06 * h, -0.12 * L], [0, -tl / tb * (style === 'equine' ? 0.8 : 0.35), -tl / tb * 0.75]) : [];
  mb.size = bodyY;
  mb.height = Math.max(h + nl * Math.sin(na) * 0.8, h);
  mb.info.family = mb.info.family ?? 'quadruped';
  mb.info.rootBone = B('body');
  mb.info.walkSpeed = 1.6 * (h / 1.5);
  mb.info.runSpeed = 7 * (h / 1.5);
  mb.info.look = suffixes.map((s) => ({ bone: B(`head${s}`), weight: 0.55, limit: 45 }));
  mb.info.flinch = [B('spine'), B('chest')];
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  if (tail.length) springs.push({ chain: B('tail'), stiffness: 45, damping: 6, gravity: style === 'equine' ? 2 : 0.5, falloff: 0.5 });
  mb.info.springs = springs;
  return { h, L, w, p, style, heads: suffixes, necks, tail, legs, foot, bodyY, chestY };
}

export interface QuadrupedBodyStyle {
  body: string;
  belly?: string;
  dark?: string;
  mane?: string;
  hoof?: string;
  eye?: string;
  eyeGlow?: boolean;
  /** Fur tufts along the back / shoulders (wolves, bears). */
  fur?: boolean;
  /** Muzzle length multiplier. */
  muzzle?: number;
  ears?: 'pointed' | 'round' | 'equine' | 'none';
  horns?: boolean;
  teeth?: boolean;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
  /** Barrel thickness multiplier. */
  bulk?: number;
}

export function quadrupedBody(mb: ModelBuilder, d: QuadrupedDims, s: QuadrupedBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, d.p, { skinDetail: d.style === 'equine' ? 'skin' : 'fur', ...s.surfaceStyle });
  const h = d.h, L = d.L, w = d.w * (s.bulk ?? 1), p = d.p;
  const B = (n: string) => `${p}${n}`;
  const belly = s.belly ?? mix(s.body, '#f0e6d0', 0.25);
  const dark = s.dark ?? shade(s.body, 0.5);
  const hoof = s.hoof ?? '#2a2420';
  const equine = d.style === 'equine', ursine = d.style === 'ursine';
  // barrel: rump -> chest
  mb.tube([B('body'), B('spine'), B('chest')], S.skin, {
    radius: profile([[0, w * 0.55], [0.15, w * 1.0], [0.35, w * 1.04], [0.55, w * 0.98], [0.78, w * 1.08], [0.92, w * 0.95], [1, w * 0.6]]),
    start: 0.22 * L, tip: 0.2 * L, blendParent: false, flatten: [0.85, ursine ? 1.1 : 1.0], radial: 14, perBone: 4, color: s.body, belly, capStart: true, capEnd: true,
  });
  // necks + heads
  for (const sfx of d.heads) {
    const nk = d.necks[sfx];
    mb.tube([B('chest'), ...nk, B(`head${sfx}`)], S.skin, {
      radius: profile([[0, w * 0.82], [0.3, w * (equine ? 0.5 : 0.62)], [0.8, w * (equine ? 0.36 : 0.48)], [1, w * 0.4]]),
      tip: 0.02 * h, blendParent: false, radial: 12, perBone: 3, color: s.body, belly, flatten: [equine ? 0.62 : 0.9, 1], capEnd: false,
    });
    const mz = (s.muzzle ?? 1) * (equine ? 0.42 : ursine ? 0.24 : 0.3) * h;
    // skull + muzzle (lathe along +Z)
    const prof: [number, number][] = equine
      ? [[0.0, 0], [0.13, 0.02], [0.135, 0.1], [0.11, 0.3], [0.085, 0.62], [0.08, 0.86], [0.05, 0.98], [0, 1]]
      : [[0.0, 0], [0.16, 0.04], [0.17, 0.22], [0.13, 0.46], [0.08, 0.72], [0.065, 0.92], [0, 1]];
    const head = geo.lathe(prof.map(([r, y]) => [r * h * (equine ? 0.95 : 1.0), y * mz] as [number, number]), 12);
    head.rotateX(Math.PI / 2);
    head.scale(equine ? 0.75 : 1, 1, 1);
    mb.part(B(`head${sfx}`), head, S.skin, { pos: [0, 0, -0.02 * h], rot: [equine ? 38 : 10, 0, 0], color: s.body });
    // jaw
    const jaw = geo.lathe([[0, 0], [0.08 * h, 0.05 * mz], [0.07 * h, 0.5 * mz], [0.04 * h, 0.9 * mz], [0, mz * 0.95]], 8, 0, Math.PI);
    jaw.rotateX(Math.PI / 2);
    jaw.rotateZ(Math.PI);
    jaw.scale(equine ? 0.7 : 0.9, 0.7, 1);
    mb.part(B(`jaw${sfx}`), jaw, S.skin, { pos: [0, 0.03 * h, -0.05 * h], rot: [equine ? 36 : 8, 0, 0], color: belly });
    if (s.teeth && !equine) {
      for (const sx of [-1, 1]) {
        mb.part(B(`head${sfx}`), geo.spike(0.012 * h, 0.07 * h, 5), S.horn, { pos: [sx * 0.05 * h, -0.05 * h, mz * 0.7], rot: [180, 0, 0], color: '#f0e8d8' });
        mb.part(B(`jaw${sfx}`), geo.spike(0.01 * h, 0.05 * h, 5), S.horn, { pos: [sx * 0.04 * h, 0.03 * h, mz * 0.6], rot: [0, 0, 0], color: '#f0e8d8' });
      }
    }
    // eyes
    for (const sx of [-1, 1]) {
      const ex = equine ? 0.1 * h : 0.11 * h;
      mb.part(B(`head${sfx}`), geo.ellipsoid(0.022 * h, 0.016 * h, 0.018 * h, 8, 6), s.eyeGlow ? S.glow : S.dark, { pos: [sx * ex, equine ? 0.06 * h : 0.07 * h, equine ? 0.1 * h : 0.12 * h], color: s.eye ?? '#120c08' });
      // ears
      const ears = s.ears ?? (equine ? 'equine' : ursine ? 'round' : 'pointed');
      if (ears !== 'none') {
        const ear = ears === 'round' ? geo.ellipsoid(0.04 * h, 0.04 * h, 0.015 * h, 8, 6) : geo.spike(0.035 * h, (ears === 'equine' ? 0.12 : 0.14) * h, 6);
        mb.part(B(`head${sfx}`), ear, S.skin, { pos: [sx * 0.08 * h, 0.13 * h, -0.02 * h], rot: [-15, 0, sx * -18], color: dark });
      }
      if (s.horns) mb.part(B(`head${sfx}`), geo.horn(0.3 * h, 0.04 * h, 1.4, 0.2, 9, 7), S.horn, { pos: [sx * 0.07 * h, 0.12 * h, 0.0], rot: [-40, 0, sx * -30], color: '#d8ccb0' });
    }
    // mane
    if (s.mane) {
      const mane = [...nk, B(`head${sfx}`)];
      mane.forEach((bn, i) => {
        if (i === mane.length - 1) return;
        for (let k = 0; k < 3; k++) {
          const lf = geo.leaf((equine ? 0.28 : 0.22) * h, 0.12 * h, 4, -0.25, 0.3);
          mb.part(bn, geo.doubleSide(lf), S.cloth, { pos: [(k - 1) * 0.03 * h, w * (equine ? 0.36 : 0.5), -0.02 * h + k * 0.04 * h], rot: [-60 - k * 10, 0, (k - 1) * 20], color: shade(s.mane!, 0.9 + k * 0.08) });
        }
      });
    }
  }
  // legs: upper/lower tube + rigid cannon/foot down to the ground + hoof or paw
  for (const leg of ['fl', 'fr', 'bl', 'br'] as const) {
    const front = leg[0] === 'f';
    const bones = d.legs[leg];
    const top = front ? w * 0.55 : w * 0.7;
    const footLen = d.foot[leg];
    mb.tube([...bones], S.skin, {
      radius: profile(equine
        ? [[0, top], [0.3, top * 0.6], [0.55, h * 0.075], [0.85, h * 0.06], [1, h * 0.055]]
        : ursine
          ? [[0, top], [0.3, top * 0.7], [0.6, h * 0.11], [1, h * 0.1]]
          : [[0, top], [0.3, top * 0.6], [0.55, h * 0.075], [0.85, h * 0.06], [1, h * 0.055]]),
      tip: 0.02 * h, radial: 10, perBone: 3, color: s.body, colorEnd: shade(s.body, 0.85), capEnd: false, blendParent: false,
    });
    const last = bones[2];
    const cr = equine ? 0.042 * h : ursine ? 0.09 * h : 0.05 * h;
    const cannon = geo.tube([[0, 0.02 * h, 0], [0, -footLen * 0.5, 0.004 * h], [0, -footLen + 0.04 * h, 0.006 * h]], profile([[0, cr * 1.25], [0.5, cr], [1, cr * 1.15]]), { radial: 8, perSeg: 2 });
    mb.part(last, cannon, S.skin, { color: equine ? shade(s.body, 0.7) : shade(s.body, 0.8) });
    if (equine) {
      const hf = geo.lathe([[0.062 * h, 0], [0.066 * h, 0.035 * h], [0.05 * h, 0.085 * h], [0.0, 0.085 * h]], 10);
      mb.part(last, hf, S.dark, { pos: [0, -footLen, 0.008 * h], color: hoof });
      mb.part(last, geo.lathe([[0.072 * h, 0], [0.058 * h, 0.07 * h], [0.044 * h, 0.13 * h]], 10), S.cloth, { pos: [0, -footLen + 0.06 * h, 0.004 * h], color: s.mane ?? dark });
    } else {
      const paw = geo.ellipsoid(0.07 * h * (ursine ? 1.4 : 1), 0.04 * h, 0.1 * h * (ursine ? 1.3 : 1), 10, 6);
      mb.part(last, paw, S.skin, { pos: [0, -footLen + 0.035 * h, 0.05 * h], color: dark });
      for (const sx of [-1, 0, 1]) mb.part(last, geo.spike(0.012 * h, 0.05 * h, 4), S.horn, { pos: [sx * 0.035 * h, -footLen + 0.02 * h, 0.14 * h], rot: [80, 0, 0], color: '#e8dcc0' });
    }
  }
  // tail
  if (d.tail.length) {
    mb.tube(d.tail, equine ? S.cloth : S.skin, {
      radius: profile(equine ? [[0, w * 0.18], [0.3, w * 0.28], [0.8, w * 0.24], [1, w * 0.05]] : [[0, w * 0.22], [0.5, w * 0.18], [1, w * 0.04]]),
      tip: 0.1 * h, radial: 8, perBone: 3, color: equine ? (s.mane ?? dark) : s.body, colorEnd: equine ? shade(s.mane ?? dark, 0.8) : dark, flatten: equine ? [0.5, 1] : [1, 1],
    });
  }
  // fur ridge
  if (s.fur) {
    const tuft = geo.furTuft(0.16 * h, 0.03 * h, 5, 3, 0.6);
    for (const [bn, n] of [[B('body'), 4], [B('spine'), 4], [B('chest'), 5]] as [string, number][]) {
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 1.6;
        mb.part(bn, tuft.clone(), S.skin, { pos: [Math.sin(a) * w * 0.9, w * Math.cos(a) * 0.95, (i % 2) * 0.05 * h], rot: [-50, 0, -a * 57], color: shade(s.body, 0.8 + (i % 3) * 0.1) });
      }
    }
  }
  return S;
}

export const _q = new THREE.Quaternion();
