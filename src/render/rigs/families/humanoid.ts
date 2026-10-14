/**
 * Humanoid family: knights, giants, mages, Lucifero, Loki, Uruk, Reina, the Portatore, mounted riders.
 *
 * Skeleton (rest pose: standing, arms hanging straight down, facing +Z, +X = the character's LEFT):
 *   root -> hips -> spine -> chest -> neck -> head (-> jaw)
 *   chest -> shoulder_l -> arm_l -> forearm_l -> hand_l   (sockets grip_l, + same for _r)
 *   hips  -> thigh_l -> shin_l -> foot_l                   (+ _r)
 *   optional chains: cape_0..n (chest back), hair_0..n (head back), tail_0..n (hips back)
 * Every bone name can carry a prefix (mounted riders use 'rider_').
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';

export interface HumanoidSkeletonOpts {
  /** Standing height in meters. */
  height: number;
  /** 0 slender .. 1 broad (shoulders, limb thickness). Default 0.5. */
  build?: number;
  /** Shoulder width multiplier. */
  shoulders?: number;
  /** Arm length multiplier (giants/apes > 1). */
  armLength?: number;
  /** Leg length multiplier. */
  legLength?: number;
  /** Forward hunch of the chest (meters, fraction of height). */
  hunch?: number;
  /** Bone name prefix (e.g. 'rider_'). */
  prefix?: string;
  /** Parent bone of the hips (default 'root'). */
  parent?: string;
  /** Hips position relative to the parent (default [0, hipY, 0]). */
  at?: V3;
  /** Cape chain bones (0 = none). */
  cape?: number;
  /** Hair chain bones (0 = none). */
  hair?: number;
  /** Tail chain bones (0 = none). */
  tail?: number;
  /** Add a jaw bone. */
  jaw?: boolean;
}

export interface HumanoidDims {
  H: number;
  p: string;
  build: number;
  sw: number;
  hipY: number;
  shoulderX: number;
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  /** Radius scale (limb thickness). */
  r: number;
  cape: string[];
  hair: string[];
  tail: string[];
}

export function humanoidSkeleton(mb: ModelBuilder, o: HumanoidSkeletonOpts): HumanoidDims {
  const H = o.height;
  const p = o.prefix ?? '';
  const b = o.build ?? 0.5;
  const sw = (o.shoulders ?? 1) * (0.9 + b * 0.25);
  const legK = o.legLength ?? 1;
  const armK = o.armLength ?? 1;
  const thigh = 0.235 * H * legK, shin = 0.22 * H * legK;
  const hipJointY = 0.045 * H + thigh + shin;
  const hipY = hipJointY + 0.03 * H;
  const hunch = (o.hunch ?? 0) * H;
  const B = (n: string) => `${p}${n}`;
  mb.bone(B('hips'), o.parent ?? 'root', o.at ?? [0, hipY, 0]);
  mb.bone(B('spine'), B('hips'), [0, 0.09 * H, hunch * 0.3]);
  mb.bone(B('chest'), B('spine'), [0, 0.12 * H, hunch * 0.7]);
  mb.bone(B('neck'), B('chest'), [0, 0.1 * H, hunch * 0.4 + 0.004 * H]);
  mb.bone(B('head'), B('neck'), [0, 0.06 * H, 0.006 * H]);
  if (o.jaw) mb.bone(B('jaw'), B('head'), [0, 0.0, 0.03 * H]);
  const shoulderX = 0.085 * H * sw;
  const upperArm = 0.17 * H * armK, forearm = 0.15 * H * armK;
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    mb.bone(B(`shoulder_${s}`), B('chest'), [sx * shoulderX, 0.07 * H, -0.008 * H]);
    mb.bone(B(`arm_${s}`), B(`shoulder_${s}`), [sx * 0.042 * H * sw, -0.004 * H, 0]);
    mb.bone(B(`forearm_${s}`), B(`arm_${s}`), [0, -upperArm, -0.004 * H]);
    mb.bone(B(`hand_${s}`), B(`forearm_${s}`), [0, -forearm, 0.004 * H]);
    // grip socket: weapon +Z points forward out of the fist, held at the palm
    mb.socket(B(`grip_${s}`), B(`hand_${s}`), [0, -0.045 * H, 0.012 * H]);
    mb.bone(B(`thigh_${s}`), B('hips'), [sx * 0.055 * H * (0.92 + b * 0.16), -0.03 * H, 0]);
    mb.bone(B(`shin_${s}`), B(`thigh_${s}`), [0, -thigh, 0.004 * H]);
    mb.bone(B(`foot_${s}`), B(`shin_${s}`), [0, -shin, -0.006 * H]);
  }
  mb.socket(B('back'), B('chest'), [0, 0.02 * H, -0.08 * H]);
  mb.socket(B('seed'), B('chest'), [0, 0.01 * H, 0.072 * H * (0.9 + b * 0.2)]);
  mb.socket(B('head_top'), B('head'), [0, 0.13 * H, 0]);
  const cape = o.cape ? mb.chain(B('cape'), B('chest'), o.cape, [0, 0.06 * H, -0.085 * H * (0.9 + b * 0.2)], [0, -(0.62 * H) / o.cape, -0.012 * H]) : [];
  const hair = o.hair ? mb.chain(B('hair'), B('head'), o.hair, [0, 0.06 * H, -0.055 * H], [0, -0.05 * H, -0.012 * H]) : [];
  const tail = o.tail ? mb.chain(B('tail'), B('hips'), o.tail, [0, -0.02 * H, -0.08 * H], [0, -0.04 * H, -0.12 * H]) : [];
  mb.size = hipY;
  mb.height = H;
  mb.info.family = mb.info.family ?? 'humanoid';
  mb.info.rootBone = B('hips');
  mb.info.walkSpeed = 1.4 * (H / 1.8);
  mb.info.runSpeed = 4.5 * (H / 1.8);
  mb.info.look = [{ bone: B('head'), weight: 0.6, limit: 55 }, { bone: B('neck'), weight: 0.25, limit: 30 }];
  mb.info.flinch = [B('spine'), B('chest'), B('neck')];
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  if (cape.length) springs.push({ chain: B('cape'), stiffness: 55, damping: 7, gravity: 3.5, falloff: 0.55 });
  if (hair.length) springs.push({ chain: B('hair'), stiffness: 80, damping: 8, gravity: 2.5, falloff: 0.4 });
  if (tail.length) springs.push({ chain: B('tail'), stiffness: 40, damping: 6, gravity: 1, falloff: 0.5 });
  mb.info.springs = springs;
  return {
    H, p, build: b, sw, hipY, shoulderX, upperArm, forearm, thigh, shin, r: (H / 1.8) * (0.85 + b * 0.35), cape, hair, tail,
  };
}

export type HeadStyle = 'human' | 'helm' | 'hood' | 'skull' | 'beast' | 'mask' | 'none';
export type ArmorStyle = 'none' | 'tunic' | 'plate' | 'robe' | 'bare';

export interface HumanoidBodyStyle {
  skin: string;
  cloth: string;
  clothDark?: string;
  metal?: string;
  trim?: string;
  glow?: string;
  armor?: ArmorStyle;
  head?: HeadStyle;
  hairColor?: string;
  /** Hair style index (0 short crop, 1 swept, 2 long tied, 3 braided, 4 wild, 5 shaved). */
  hairStyle?: number;
  eyeColor?: string;
  /** Glowing eyes (bosses). */
  eyeGlow?: boolean;
  cape?: { width?: number; color: string; colorEnd?: string; ragged?: number };
  boots?: string;
  gloves?: string;
  /** Extra limb thickness multiplier (giants, brutes). */
  bulk?: number;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

/** Procedural humanoid body over a humanoid skeleton. Returns the surface ids used. */
export function humanoidBody(mb: ModelBuilder, d: HumanoidDims, s: HumanoidBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, d.p, s.surfaceStyle);
  const H = d.H, p = d.p;
  const B = (n: string) => `${p}${n}`;
  const R = d.r * (s.bulk ?? 1);
  const armor = s.armor ?? 'tunic';
  const metal = s.metal ?? '#a8a8b0';
  const trim = s.trim ?? '#d8b870';
  const clothDark = s.clothDark ?? shade(s.cloth, 0.6);
  const boots = s.boots ?? shade(clothDark, 0.8);
  const gloves = s.gloves ?? (armor === 'plate' ? metal : s.skin);
  const radial = 12;

  // --- torso (pelvis -> neck) ---
  const torsoSurf = armor === 'plate' ? S.metal : armor === 'bare' ? S.skin : S.cloth;
  const torsoCol = armor === 'plate' ? metal : armor === 'bare' ? s.skin : s.cloth;
  mb.tube([B('hips'), B('spine'), B('chest'), B('neck')], torsoSurf, {
    radius: profile([[0, 0.07 * R], [0.12, 0.093 * R], [0.25, 0.09 * R], [0.42, 0.078 * R], [0.62, 0.098 * R * d.sw], [0.76, 0.095 * R * d.sw], [0.86, 0.05 * R], [1, 0.034 * R]]),
    start: 0.07 * H, blendParent: false, tip: 0.03 * H, flatten: [1, 0.66], radial: radial + 2, perBone: 4,
    color: torsoCol, colorEnd: armor === 'bare' ? s.skin : shade(torsoCol, 0.85), capStart: true, capEnd: false,
  });
  // neck skin
  mb.part(B('neck'), geo.capsule(0.032 * R, 0.05 * H, 8, 3), S.skin, { pos: [0, 0.025 * H, 0.002 * H], color: s.skin });
  // shoulders / pauldrons
  for (const side of ['l', 'r'] as const) {
    const sx = side === 'l' ? 1 : -1;
    if (armor === 'plate') {
      const pd = geo.ellipsoid(0.07 * R, 0.05 * R, 0.07 * R, 12, 8);
      mb.part(B(`arm_${side}`), pd, S.metal, { pos: [sx * 0.012 * H, 0.012 * H, 0], color: metal });
      const rim = geo.torus(0.06 * R, 0.008 * R, 5, 14, Math.PI);
      mb.part(B(`arm_${side}`), rim, S.metal, { pos: [sx * 0.012 * H, 0.0, 0], rot: [90, 0, sx * 70], color: trim });
    } else {
      mb.part(B(`arm_${side}`), geo.ellipsoid(0.045 * R, 0.042 * R, 0.045 * R, 10, 7), armor === 'bare' ? S.skin : S.cloth, { pos: [sx * 0.006 * H, -0.004 * H, 0], color: armor === 'bare' ? s.skin : s.cloth });
    }
  }
  // belt
  if (armor !== 'bare') {
    mb.part(B('hips'), geo.torus(0.092 * R, 0.012 * R, 6, 22), S.dark, { pos: [0, 0.035 * H, 0], rot: [90, 0, 0], scale: [1, 0.7, 1], color: shade(clothDark, 0.7) });
    mb.part(B('hips'), geo.bevelBox(0.035 * R, 0.03 * R, 0.012 * R, 0.004 * R), S.metal, { pos: [0, 0.035 * H, 0.066 * R], color: trim });
  }
  // tunic skirt flaps / robe
  if (armor === 'tunic' || armor === 'robe' || armor === 'plate') {
    const len = armor === 'robe' ? 0.42 * H : armor === 'plate' ? 0.16 * H : 0.2 * H;
    const col = armor === 'plate' ? s.cloth : s.cloth;
    for (const [zz, rot] of [[1, 0], [-1, 180]] as const) {
      const flap = geo.leaf(len, 0.17 * R * (armor === 'robe' ? 1.6 : 1.1), 4, 0, 0.1);
      geo.xform(flap, [0, 0, 0], [180, 0, 0]);
      flap.scale(1, 1, 1);
      mb.part(B('hips'), geo.doubleSide(flap), armor === 'plate' ? S.cloth : S.cloth, { pos: [0, 0.01 * H, zz * 0.068 * R], rot: [zz * 8, rot, 0], color: col });
    }
    if (armor === 'plate') {
      // tasset plates
      for (const side of [-1, 1]) {
        const pl = geo.plate(0.09 * R, 0.08 * H, 0.1 * R, 0.008 * R, 5, 1);
        mb.part(B('hips'), pl, S.metal, { pos: [side * 0.07 * R, -0.02 * H, 0.01 * R], rot: [0, side * 70, 0], color: shade(metal, 0.9) });
      }
    }
  }
  // chest detail: plate ridge or tunic collar
  if (armor === 'plate') {
    const ridge = geo.plate(0.16 * R * d.sw, 0.13 * H, 0.12 * R, 0.01 * R, 8, 2);
    mb.part(B('chest'), ridge, S.metal, { pos: [0, -0.005 * H, 0.062 * R], color: shade(metal, 1.08) });
    mb.part(B('chest'), geo.torus(0.05 * R, 0.01 * R, 6, 16), S.metal, { pos: [0, 0.088 * H, 0], rot: [90, 0, 0], color: trim });
  } else if (armor !== 'bare') {
    mb.part(B('chest'), geo.torus(0.045 * R, 0.012 * R, 6, 16), S.cloth, { pos: [0, 0.09 * H, -0.004 * H], rot: [80, 0, 0], color: clothDark });
  }

  // --- arms ---
  for (const side of ['l', 'r'] as const) {
    const armSurf = armor === 'plate' ? S.metal : armor === 'bare' ? S.skin : S.cloth;
    const armCol = armor === 'plate' ? metal : armor === 'bare' ? s.skin : s.cloth;
    mb.tube([B(`arm_${side}`), B(`forearm_${side}`), B(`hand_${side}`)], armSurf, {
      radius: profile([[0, 0.04 * R], [0.25, 0.034 * R], [0.5, 0.03 * R], [0.75, 0.024 * R], [1, 0.02 * R]]),
      tip: 0.01 * H, radial: 10, perBone: 4, color: armCol, colorEnd: armor === 'bare' ? s.skin : shade(armCol, 0.9), capStart: true,
    });
    // bracer / gauntlet
    const brc = geo.lathe([[0.028 * R, 0], [0.031 * R, 0.02 * H], [0.03 * R, 0.07 * H], [0.034 * R, 0.085 * H]], 10);
    mb.part(B(`forearm_${side}`), brc, armor === 'plate' ? S.metal : S.dark, { pos: [0, -0.15 * H * (d.forearm / (0.15 * H)), 0], rot: [0, 0, 0], color: armor === 'plate' ? shade(metal, 0.9) : shade(clothDark, 0.8) });
    // hand
    const hand = geo.ellipsoid(0.024 * R, 0.042 * R, 0.03 * R, 10, 7);
    mb.part(B(`hand_${side}`), hand, armor === 'plate' ? S.metal : S.skin, { pos: [0, -0.03 * H, 0.004 * H], color: gloves });
    const thumb = geo.capsule(0.008 * R, 0.02 * R, 6, 2);
    mb.part(B(`hand_${side}`), thumb, armor === 'plate' ? S.metal : S.skin, { pos: [(side === 'l' ? -1 : 1) * 0.0 * R, -0.022 * H, 0.026 * R], rot: [-40, 0, 0], color: gloves });
  }

  // --- legs ---
  for (const side of ['l', 'r'] as const) {
    const legSurf = armor === 'plate' ? S.metal : armor === 'bare' ? S.skin : S.cloth;
    const legCol = armor === 'plate' ? metal : armor === 'bare' ? s.skin : clothDark;
    mb.tube([B(`thigh_${side}`), B(`shin_${side}`), B(`foot_${side}`)], legSurf, {
      radius: profile([[0, 0.062 * R], [0.2, 0.056 * R], [0.45, 0.04 * R], [0.62, 0.042 * R], [0.85, 0.03 * R], [1, 0.026 * R]]),
      tip: 0.012 * H, radial: 11, perBone: 4, color: legCol, colorEnd: boots, capStart: false,
    });
    // boot
    const boot = geo.lathe([[0.033 * R, 0], [0.037 * R, 0.05 * H], [0.034 * R, 0.1 * H], [0.04 * R, 0.13 * H]], 10);
    mb.part(B(`shin_${side}`), boot, armor === 'plate' ? S.metal : S.dark, { pos: [0, -d.shin + 0.0 * H, 0], color: armor === 'plate' ? shade(metal, 0.85) : boots });
    const foot = geo.bevelBox(0.055 * R, 0.042 * H, 0.15 * H, 0.012 * R, 2);
    mb.part(B(`foot_${side}`), foot, armor === 'plate' ? S.metal : S.dark, { pos: [0, -0.024 * H, 0.04 * H], color: armor === 'plate' ? shade(metal, 0.8) : boots, shade: 0.3 });
    if (armor === 'plate') {
      const knee = geo.ellipsoid(0.04 * R, 0.035 * R, 0.035 * R, 8, 6);
      mb.part(B(`shin_${side}`), knee, S.metal, { pos: [0, 0.0, 0.03 * R], color: trim });
    }
  }

  // --- head ---
  const head = s.head ?? 'human';
  const headC: V3 = [0, 0.058 * H, 0.012 * H];
  if (head !== 'none') {
    if (head === 'helm') {
      const helm = geo.lathe([[0.0, -0.03 * H], [0.062 * R, -0.03 * H], [0.07 * R, 0.0], [0.072 * R, 0.05 * H], [0.06 * R, 0.09 * H], [0.03 * R, 0.112 * H], [0, 0.118 * H]], 16);
      mb.part(B('head'), helm, S.metal, { pos: [0, 0.0, 0.006 * H], color: metal, shade: 0.25 });
      const visor = geo.bevelBox(0.11 * R, 0.012 * H, 0.02 * R, 0.003 * R);
      mb.part(B('head'), visor, S.dark, { pos: [0, 0.055 * H, 0.072 * R], color: '#0c0a10' });
    } else if (head === 'hood') {
      const hood = geo.lathe([[0.0, -0.02 * H], [0.07 * R, -0.01 * H], [0.078 * R, 0.05 * H], [0.06 * R, 0.1 * H], [0.02 * R, 0.13 * H], [0, 0.13 * H]], 14);
      mb.part(B('head'), hood, S.cloth, { pos: [0, -0.005 * H, -0.006 * H], color: s.cloth, shade: 0.4 });
      mb.part(B('head'), geo.ellipsoid(0.052 * R, 0.06 * R, 0.03 * R, 10, 8), S.dark, { pos: [0, 0.052 * H, 0.05 * R], color: '#07060a' });
    } else {
      const skull = geo.ellipsoid(0.058 * R, 0.07 * R, 0.065 * R, 16, 12);
      mb.part(B('head'), skull, S.skin, { pos: headC, color: head === 'skull' ? '#e8e0cc' : s.skin });
      const jaw = geo.ellipsoid(0.045 * R, 0.035 * R, 0.05 * R, 12, 8);
      mb.part(B('head'), jaw, S.skin, { pos: [0, 0.022 * H, 0.03 * H], color: head === 'skull' ? '#d8d0bc' : s.skin });
      const nose = geo.spike(0.009 * R, 0.022 * R, 5);
      mb.part(B('head'), nose, S.skin, { pos: [0, 0.055 * H, 0.072 * R], rot: [80, 0, 0], color: shade(s.skin, 0.95) });
      for (const sx of [-1, 1]) {
        const eye = geo.ellipsoid(0.011 * R, 0.007 * R, 0.006 * R, 8, 6);
        mb.part(B('head'), eye, s.eyeGlow ? S.glow : S.dark, { pos: [sx * 0.024 * R, 0.066 * H, 0.06 * R], color: s.eyeColor ?? '#1a1410' });
        // brow
        const brow = geo.bevelBox(0.026 * R, 0.006 * R, 0.01 * R, 0.002 * R);
        mb.part(B('head'), brow, S.skin, { pos: [sx * 0.024 * R, 0.076 * H, 0.06 * R], rot: [0, 0, sx * -8], color: shade(s.skin, 0.85) });
        // ears
        if (head !== 'skull') mb.part(B('head'), geo.ellipsoid(0.008 * R, 0.018 * R, 0.012 * R, 6, 5), S.skin, { pos: [sx * 0.058 * R, 0.06 * H, 0.004 * H], color: s.skin });
      }
      if (head === 'human' && s.hairColor) hair(mb, d, S, s.hairStyle ?? 1, s.hairColor);
      if (head === 'beast') {
        for (const sx of [-1, 1]) mb.part(B('head'), geo.horn(0.12 * R, 0.018 * R, 1.1, 0.4, 8, 6), S.horn, { pos: [sx * 0.045 * R, 0.1 * H, 0], rot: [-30, 0, sx * -40], color: '#3a3028' });
      }
      if (head === 'mask') {
        const mask = geo.plate(0.1 * R, 0.08 * H, 0.07 * R, 0.006 * R, 8, 2);
        mb.part(B('head'), mask, S.metal, { pos: [0, 0.058 * H, 0.072 * R], color: metal });
      }
    }
  }

  // --- cape ---
  if (s.cape && d.cape.length) {
    mb.cloth(d.cape, S.cape, {
      width: (s.cape.width ?? 0.3) * H, widthEnd: (s.cape.width ?? 0.3) * H * 1.35, cols: 6, rowsPerBone: 3, color: s.cape.color, colorEnd: s.cape.colorEnd ?? shade(s.cape.color, 0.55),
      bulge: 0.05 * H, bulgeDir: [0, 0, -1], ragged: s.cape.ragged ?? 0.3,
    });
    // clasp
    mb.part(B('chest'), geo.torus(0.016 * R, 0.005 * R, 5, 12), S.metal, { pos: [0.06 * R, 0.085 * H, 0.03 * R], color: trim });
    mb.part(B('chest'), geo.torus(0.016 * R, 0.005 * R, 5, 12), S.metal, { pos: [-0.06 * R, 0.085 * H, 0.03 * R], color: trim });
  }
  return S;
}

/** Hair styles on the head bone (+ hair chain when present). */
function hair(mb: ModelBuilder, d: HumanoidDims, S: SurfaceIds, style: number, color: string): void {
  const H = d.H, R = d.r, p = d.p;
  const B = (n: string) => `${p}${n}`;
  const st = ((style % 6) + 6) % 6;
  if (st === 5) return; // shaved
  // cap covering the skull top/back
  const capR = st === 0 ? 1.04 : 1.09;
  const cap = geo.ellipsoid(0.058 * R * capR, 0.06 * R * capR, 0.066 * R * capR, 14, 10);
  // remove the face region by squashing the front lower vertices back
  const pos = cap.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    if (z > 0.02 * R && y < 0.03 * R) pos.setZ(i, Math.min(z, 0.02 * R + (y + 0.02 * R) * 0.6));
  }
  cap.computeVertexNormals();
  mb.part(B('head'), cap, S.cloth, { pos: [0, 0.066 * H, 0.006 * H], color });
  const strands = (n: number, len: number, spread: number, back: number, curl: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * spread;
      const lf = geo.leaf(len * (0.8 + ((i * 37) % 7) / 20), 0.035 * R, 4, curl, 0.25);
      mb.part(B('head'), geo.doubleSide(lf), S.cloth, { pos: [Math.sin(a) * 0.05 * R, 0.1 * H, Math.cos(a) * 0.03 * R - back], rot: [200 - Math.abs(a) * 10, a * 57, 0], color: shade(color, 0.9 + (i % 3) * 0.06) });
    }
  };
  if (st === 1) strands(7, 0.09 * H, 2.4, 0.01 * H, 0.15);
  if (st === 4) strands(11, 0.12 * H, 3.6, 0.0, 0.3);
  if ((st === 2 || st === 3) && d.hair.length) {
    mb.tube(d.hair, S.cloth, { radius: profile([[0, 0.022 * R], [0.6, 0.016 * R], [1, 0.006 * R]]), radial: 7, perBone: 3, color, colorEnd: shade(color, 0.8), blendParent: true });
    if (st === 3) mb.part(B('head'), geo.torus(0.016 * R, 0.005 * R, 5, 10), S.metal, { pos: [0, 0.07 * H, -0.06 * R], rot: [60, 0, 0], color: '#d8b870' });
  }
  if (st === 0) strands(5, 0.04 * H, 1.6, 0.0, 0.05);
  void mix;
}
