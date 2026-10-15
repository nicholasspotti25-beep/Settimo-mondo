/**
 * Tree family: Elder Tree (bark face in the trunk, branch arms, black leaves, luminous mushrooms at the roots), treants,
 * Yggdrasil-born guardians, plant colossi.
 *
 * Skeleton (rest: upright, facing +Z, +X = LEFT):
 *   root -> trunk_0..3 (vertical) -> crown_0..k (top branches)
 *   trunk_2 -> branch_l_0..2 (left arm-branch), branch_r_0..2 (right)     trunk_3 -> branch_l2_0..1 / branch_r2_0..1 (upper)
 *   trunk_1 -> jaw (bark mouth hinge) ; root -> rootl_0..n_0..1 (surface roots, slam/stomp the ground)
 * Clip root offsets/rotation drive trunk_0 (sway pivots at the base).
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { Prng } from '../../kit/noise';
import { mix, shade } from '../../kit/palette';
import { boneAt, chainThrough, profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';

export interface TreeOpts {
  height: number;
  /** Trunk radius at the base (meters). */
  radius?: number;
  /** Arm-branch length (meters). */
  armLength?: number;
  roots?: number;
}

export interface TreeDims {
  H: number;
  R: number;
  trunk: string[];
  arms: Record<'l' | 'r', string[]>;
  upper: string[][];
  crown: string[];
  roots: string[][];
}

export function treeSkeleton(mb: ModelBuilder, o: TreeOpts): TreeDims {
  const H = o.height, R = o.radius ?? 0.09 * H;
  const trunk = chainThrough(mb, 'trunk', 'root', [[0, 0.02 * H, 0], [0, 0.22 * H, 0.01 * H], [0, 0.45 * H, 0.02 * H], [0, 0.66 * H, 0]]);
  const crown = chainThrough(mb, 'crown', 'trunk_3', [[0, 0.8 * H, -0.02 * H], [0, 0.93 * H, -0.04 * H]]);
  const al = o.armLength ?? 0.42 * H;
  const arms = {} as TreeDims['arms'];
  const upper: string[][] = [];
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    const base = mb.restPos('trunk_2');
    arms[s] = chainThrough(mb, `branch_${s}`, 'trunk_2', [
      [sx * R * 0.8, base.y + 0.06 * H, base.z + 0.02 * H],
      [sx * (R + al * 0.42), base.y + 0.02 * H, base.z + 0.06 * H],
      [sx * (R + al * 0.78), base.y - 0.08 * H, base.z + 0.12 * H],
    ]);
    const tb = mb.restPos('trunk_3');
    upper.push(chainThrough(mb, `branch_${s}2`, 'trunk_3', [[sx * R * 0.6, tb.y + 0.05 * H, tb.z], [sx * (R + al * 0.4), tb.y + 0.2 * H, tb.z - 0.04 * H]]));
  }
  boneAt(mb, 'jaw', 'trunk_1', [0, 0.3 * H, R * 0.85]);
  mb.socket('mouth', 'jaw', [0, 0, R * 0.2]);
  mb.socket('heart', 'trunk_1', [0, 0.1 * H, R * 0.4]);
  const nRoots = o.roots ?? 6;
  const roots: string[][] = [];
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * Math.PI * 2 + 0.3;
    const dx = Math.sin(a), dz = Math.cos(a);
    roots.push(chainThrough(mb, `rootl_${i}`, 'root', [[dx * R * 0.9, 0.06 * H, dz * R * 0.9], [dx * R * 2.4, 0.03 * H, dz * R * 2.4]]));
  }
  mb.size = 0.3 * H;
  mb.height = H;
  mb.info.family = mb.info.family ?? 'tree';
  mb.info.rootBone = 'trunk_0';
  mb.info.walkSpeed = 0.8 * (H / 8);
  mb.info.runSpeed = 2.5 * (H / 8);
  mb.info.look = [{ bone: 'trunk_3', weight: 0.25, limit: 20 }];
  mb.info.flinch = ['trunk_2', 'trunk_3'];
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  springs.push({ chain: 'crown', stiffness: 25, damping: 4, gravity: 0, falloff: 0.4, weight: 0.7 });
  for (const s of ['l', 'r']) springs.push({ chain: `branch_${s}2`, stiffness: 30, damping: 4, gravity: 0.3, falloff: 0.4, weight: 0.7 });
  mb.info.springs = springs;
  return { H, R, trunk, arms, upper, crown, roots };
}

export interface TreeBodyStyle {
  bark: string;
  barkDark?: string;
  leaves: string;
  leavesTip?: string;
  /** Glowing eyes / heart / mushrooms. */
  glow: string;
  mushrooms?: string;
  moss?: string;
  /** Face in the trunk (eyes + mouth). */
  face?: boolean;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

export function treeBody(mb: ModelBuilder, d: TreeDims, s: TreeBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: 'bark', skinRough: 0.95, ...s.surfaceStyle, overrides: { skin: { detailScale: 1.2, detailStrength: 0.8 }, ...(s.surfaceStyle?.overrides ?? {}) } });
  mb.surface('leaves', { roughness: 0.9, metalness: 0, detail: 'noise', detailScale: 2, detailStrength: 0.5, rim: 1.1, side: THREE.DoubleSide, alphaTest: 0 });
  const H = d.H, R = d.R;
  const dark = s.barkDark ?? shade(s.bark, 0.55);
  const rng = new Prng(17);
  // gnarled trunk: ridged tube
  const ridge = (th: number, t: number) => 1 + 0.12 * Math.sin(th * 5 + t * 4) + 0.06 * Math.sin(th * 11 - t * 9);
  const trunk = mb.tube([...d.trunk, ...d.crown], S.skin, {
    radius: profile([[0, R * 1.5], [0.08, R * 1.1], [0.35, R * 0.95], [0.6, R * 0.78], [0.85, R * 0.5], [1, R * 0.22]]), start: 0.02 * H, tip: 0.05 * H, radial: 16, perBone: 4,
    ridge, color: s.bark, colorEnd: dark, capStart: true, blendParent: false,
  });
  if (s.moss) trunk.scatter(S.cloth, geo.furTuft(0.4, 0.08, 4, 3, 0.7), mb.quality === 'low' ? 8 : 20, { t: [0.02, 0.5], theta: [-2.5, 2.5], scale: [0.4, 0.8], seed: 9, color: s.moss, sink: 0.1 });
  // arm branches with twig fingers
  for (const sd of ['l', 'r'] as const) {
    const arm = d.arms[sd];
    mb.tube(['trunk_2', ...arm], S.skin, { radius: profile([[0, R * 0.62], [0.3, R * 0.45], [0.8, R * 0.24], [1, R * 0.14]]), tip: 0.06 * H, radial: 11, perBone: 3, ridge, color: s.bark, colorEnd: dark, blendParent: false });
    for (let k = 0; k < 4; k++) {
      const sx = sd === 'l' ? 1 : -1;
      const len = 0.1 * H * rng.range(0.7, 1.1);
      const tw = geo.tube([[0, 0, 0], [sx * len * 0.4, -len * 0.3, len * 0.3 * (k - 1.5)], [sx * len * 0.6, -len * 0.75, len * 0.45 * (k - 1.5)]], profile([[0, R * 0.09], [1, R * 0.015]]), { radial: 5, perSeg: 2 });
      mb.part(arm[2], tw, S.skin, { pos: [sx * 0.02 * H, 0, 0], color: dark });
    }
  }
  for (const up of d.upper) mb.tube(['trunk_3', ...up], S.skin, { radius: profile([[0, R * 0.45], [1, R * 0.1]]), tip: 0.08 * H, radial: 9, perBone: 3, color: s.bark, colorEnd: dark, blendParent: false });
  // roots
  for (const r of d.roots) mb.tube(r, S.skin, { radius: profile([[0, R * 0.55], [1, R * 0.12]]), tip: R * 0.9, start: R * 0.3, radial: 9, perBone: 3, color: dark, colorEnd: shade(dark, 0.8), blendParent: false, flatten: [1, 0.7] });
  // canopy: clustered leaf cards on crown + upper branches + arm tips
  const cluster = (bone: string, count: number, radius: number, center: V3) => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const lf = geo.leaf(radius * rng.range(0.5, 0.8), radius * rng.range(0.25, 0.4), 3, rng.range(-0.1, 0.2), 0.25);
      const u = rng.next() * Math.PI * 2, v = rng.range(-0.6, 1);
      geo.xform(lf, [center[0] + Math.cos(u) * radius * 0.7 * Math.sqrt(1 - v * v), center[1] + v * radius * 0.5, center[2] + Math.sin(u) * radius * 0.7 * Math.sqrt(1 - v * v)], [rng.range(-80, 80), rng.range(0, 360), rng.range(-60, 60)]);
      geo.paint(lf, mix(s.leaves, s.leavesTip ?? shade(s.leaves, 1.5), rng.next() * 0.6));
      parts.push(lf);
    }
    mb.part(bone, geo.mergeGeometries(parts), 'leaves');
  };
  const nL = mb.quality === 'low' ? 26 : mb.quality === 'medium' ? 44 : 64;
  cluster(d.crown[1], nL, 0.22 * H, [0, 0.03 * H, 0]);
  for (const up of d.upper) cluster(up[1], Math.round(nL * 0.6), 0.15 * H, [0, 0.04 * H, 0]);
  for (const sd of ['l', 'r'] as const) cluster(d.arms[sd][1], Math.round(nL * 0.35), 0.09 * H, [0, 0.03 * H, 0]);
  // face: hollow eyes glowing, brow ridges, gaping mouth on the jaw bone
  if (s.face !== false) {
    // trunk_1 sits at 0.22 H: eyes ~0.38 H, mouth ~0.3 H (local offsets below)
    for (const sx of [-1, 1]) {
      mb.part('trunk_1', geo.ellipsoid(R * 0.2, R * 0.12, R * 0.08, 10, 6), S.glow, { pos: [sx * R * 0.36, 0.16 * H, R * 0.93], rot: [0, sx * 25, sx * 12], color: s.glow });
      mb.part('trunk_1', geo.ellipsoid(R * 0.34, R * 0.12, R * 0.24, 10, 6), S.skin, { pos: [sx * R * 0.34, 0.19 * H, R * 0.9], rot: [0, sx * 25, sx * -14], color: dark });
      mb.part('trunk_1', geo.ellipsoid(R * 0.16, R * 0.3, R * 0.2, 8, 6), S.skin, { pos: [sx * R * 0.55, 0.12 * H, R * 0.82], rot: [0, sx * 30, 0], color: shade(s.bark, 0.8) });
    }
    mb.part('trunk_1', geo.ellipsoid(R * 0.36, R * 0.2, R * 0.16, 10, 6), S.dark, { pos: [0, 0.085 * H, R * 0.88], color: '#060406' });
    mb.part('jaw', geo.plate(R * 0.8, 0.05 * H, R * 0.6, R * 0.06, 6, 1), S.skin, { pos: [0, -0.02 * H, R * 0.02], color: dark });
  }
  // luminous mushrooms at the roots
  const mush = s.mushrooms ?? s.glow;
  const nm = mb.quality === 'low' ? 5 : 10;
  for (let i = 0; i < nm; i++) {
    const r = d.roots[i % d.roots.length];
    const sc = R * rng.range(0.15, 0.32);
    const at: V3 = [rng.range(-0.5, 0.5) * R, -0.02 * H, rng.range(-0.5, 0.5) * R];
    const cap = geo.lathe([[0, sc * 0.9], [sc * 0.9, sc * 0.75], [sc * 1.05, sc * 0.55], [sc * 0.2, sc * 0.6], [0, sc * 0.62]], 10);
    const stem = geo.lathe([[sc * 0.18, 0], [sc * 0.14, sc * 0.6]], 6);
    mb.part(r[1], stem, S.cloth, { pos: at, color: '#d8d0c0' });
    mb.part(r[1], cap, S.glow, { pos: at, color: mush });
  }
  return S;
}
