/**
 * Tentacled family: the Kraken (mantle + enormous eye rising from the sea, ring of tentacles) and Cthulhu (titan of dreams:
 * humanoid torso, tentacled face, leathery wings, body dissolving into mist), plus lesser horrors.
 *
 * Skeleton (rest: facing +Z, +X = LEFT):
 *   kraken:   root -> body (waterline) -> head (mantle tip);  body -> tent_0..n-1 chains `tent{i}_0..k` rising around the body
 *   cthulhu:  humanoid skeleton (hips, spine, chest, neck, head, arms; legs become mist tendrils `mist{i}_*`)
 *             + head -> face{i}_0..k (face tentacles) + chest -> wing_l_* / wing_r_* (as the dragon family) + jaw
 * Waves on `tent*` / `face*` chains animate the tentacles; partChains let behaviors drive individual tentacles.
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { boneAt, chainThrough, profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';
import { humanoidSkeleton, type HumanoidDims } from './humanoid';

export interface TentacledOpts {
  variant: 'kraken' | 'cthulhu';
  height: number;
  tentacles?: number;
  tentacleBones?: number;
  /** Tentacle length (meters). */
  tentacleLength?: number;
  wingSpan?: number;
}

export interface TentacledDims {
  variant: 'kraken' | 'cthulhu';
  H: number;
  R: number;
  tentacles: string[][];
  face: string[][];
  mist: string[][];
  wings: Record<'l' | 'r', { arm: string[]; fingers: string[][] }> | null;
  hum: HumanoidDims | null;
}

export function tentacledSkeleton(mb: ModelBuilder, o: TentacledOpts): TentacledDims {
  const H = o.height;
  const tb = mb.seg(o.tentacleBones ?? 7, 5);
  if (o.variant === 'kraken') {
    const R = 0.2 * H;
    mb.bone('body', 'root', [0, 0.25 * H, 0]);
    boneAt(mb, 'head', 'body', [0, 0.62 * H, -0.12 * H]);
    mb.socket('eye', 'body', [0, 0.12 * H, R * 0.9]);
    mb.socket('mouth', 'body', [0, -0.05 * H, R * 0.5]);
    const n = o.tentacles ?? 8;
    const tl = o.tentacleLength ?? 1.1 * H;
    const tentacles: string[][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      const dx = Math.sin(a), dz = Math.cos(a);
      const pts: V3[] = [];
      for (let k = 0; k < tb; k++) {
        const t = k / (tb - 1);
        const out = R * 0.9 + t * tl * 0.55;
        const up = 0.2 * H + Math.sin(t * Math.PI * 0.85) * tl * 0.55;
        const curl = t > 0.7 ? (t - 0.7) * tl * 0.5 : 0;
        pts.push([dx * (out - curl), up, dz * (out - curl)]);
      }
      tentacles.push(chainThrough(mb, `tent${i}`, 'body', pts));
    }
    mb.size = 0.25 * H;
    mb.height = H;
    mb.info.family = mb.info.family ?? 'tentacled';
    mb.info.rootBone = 'body';
    mb.info.walkSpeed = 1.5;
    mb.info.runSpeed = 5;
    mb.info.look = [{ bone: 'body', weight: 0.25, limit: 25 }];
    mb.info.flinch = ['body', 'head'];
    const springs = (mb.info.springs as unknown[] | undefined) ?? [];
    for (const t of tentacles) springs.push({ chain: t.slice(Math.floor(tb / 2)), stiffness: 35, damping: 5, gravity: 0.4, falloff: 0.4, weight: 0.6 });
    mb.info.springs = springs;
    return { variant: 'kraken', H, R, tentacles, face: [], mist: [], wings: null, hum: null };
  }
  // Cthulhu: humanoid titan
  const hum = humanoidSkeleton(mb, { height: H, build: 0.85, shoulders: 1.25, armLength: 1.2, hunch: 0.05, jaw: true });
  const R = 0.08 * H;
  const head = mb.restPos('head');
  const face: string[][] = [];
  const nf = o.tentacles ?? 6;
  for (let i = 0; i < nf; i++) {
    const a = ((i / (nf - 1)) - 0.5) * 1.8;
    const len = 0.22 * H * (1 - Math.abs(a) * 0.25);
    const pts: V3[] = [];
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      pts.push([head.x + Math.sin(a) * 0.04 * H * (1 + t), head.y + 0.02 * H - t * len, head.z + 0.06 * H + Math.cos(a) * 0.02 * H + t * 0.05 * H]);
    }
    face.push(chainThrough(mb, `face${i}`, 'head', pts));
  }
  // legs dissolve into mist tendrils
  const mist: string[][] = [];
  const hips = mb.restPos('hips');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pts: V3[] = [0, 1, 2].map((k) => [Math.sin(a) * (0.05 + k * 0.06) * H, hips.y - (0.12 + k * 0.16) * H, Math.cos(a) * (0.05 + k * 0.06) * H] as V3);
    mist.push(chainThrough(mb, `mist${i}`, 'hips', pts));
  }
  const span = o.wingSpan ?? 0.9 * H;
  const wings = {} as NonNullable<TentacledDims['wings']>;
  const chest = mb.restPos('chest');
  for (const s of ['l', 'r'] as const) {
    const sx = s === 'l' ? 1 : -1;
    const sh: V3 = [sx * 0.08 * H, chest.y + 0.05 * H, chest.z - 0.08 * H];
    const el: V3 = [sx * (0.08 * H + span * 0.3), sh[1] + span * 0.25, sh[2] - span * 0.1];
    const wr: V3 = [sx * (0.08 * H + span * 0.5), sh[1] + span * 0.42, sh[2] - span * 0.06];
    const arm = chainThrough(mb, `wing_${s}`, 'chest', [sh, el, wr]);
    const fingers: string[][] = [];
    [[0.45, 0.25], [0.5, -0.05], [0.35, -0.4]].forEach((fd, k) => {
      const p: V3 = [wr[0] + sx * fd[0] * span, wr[1] + fd[1] * span, wr[2] - 0.1 * span];
      fingers.push([boneAt(mb, `wing_${s}_f${k}_0`, arm[2], p)]);
    });
    wings[s] = { arm, fingers };
  }
  mb.info.family = 'tentacled';
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  for (const f of face) springs.push({ chain: f, stiffness: 50, damping: 5, gravity: 1.5, falloff: 0.4 });
  for (const m of mist) springs.push({ chain: m, stiffness: 20, damping: 3, gravity: -0.5, falloff: 0.3, weight: 0.7 });
  mb.info.springs = springs;
  return { variant: 'cthulhu', H, R, tentacles: [], face, mist, wings, hum };
}

export interface TentacledBodyStyle {
  skin: string;
  belly?: string;
  /** Sucker / underside color. */
  sucker?: string;
  eye: string;
  /** Glow (eyes, veins, mist). */
  glow: string;
  membrane?: string;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

export function tentacledBody(mb: ModelBuilder, d: TentacledDims, s: TentacledBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: 'skin', skinRough: 0.42, rim: 1.3, ...s.surfaceStyle });
  const H = d.H;
  const belly = s.belly ?? mix(s.skin, '#e8c8c0', 0.35);
  const sucker = s.sucker ?? mix(s.skin, '#f0d0c8', 0.55);
  const dark = shade(s.skin, 0.5);
  if (d.variant === 'kraken') {
    const R = d.R;
    // mantle: lathe dome from the waterline up to the tip
    const mantle = geo.lathe([[R * 0.8, -0.1 * H], [R * 1.05, 0.05 * H], [R * 1.1, 0.18 * H], [R * 0.95, 0.32 * H], [R * 0.6, 0.48 * H], [R * 0.2, 0.56 * H], [0, 0.58 * H]], mb.seg(20, 12));
    geo.noiseDisplace(mantle, 0.02 * H, 1.5 / H, 7);
    mb.part('body', mantle, S.skin, { pos: [0, 0, -0.04 * H], rot: [-14, 0, 0], color: s.skin, shade: 0.3 });
    // the enormous eye
    const ew = R * 0.48;
    mb.part('body', geo.ellipsoid(ew * 1.25, ew * 1.05, ew * 0.6, 18, 12), S.skin, { pos: [0, 0.12 * H, R * 0.86], color: dark });
    mb.part('body', geo.ellipsoid(ew, ew * 0.85, ew * 0.5, 18, 12), S.glow, { pos: [0, 0.12 * H, R * 0.95], color: s.eye });
    mb.part('body', geo.ellipsoid(ew * 0.18, ew * 0.7, ew * 0.2, 10, 8), S.dark, { pos: [0, 0.12 * H, R * 0.95 + ew * 0.42], color: '#050307' });
    for (const t of d.tentacles) {
      const tube = mb.tube(['body', ...t], S.skin, {
        radius: profile([[0, R * 0.36], [0.2, R * 0.3], [0.7, R * 0.14], [1, R * 0.03]]), tip: 0.1 * H, radial: 11, perBone: 3, color: s.skin, colorEnd: dark, belly: sucker, blendParent: false,
      });
      tube.scatter(S.cloth, geo.ellipsoid(1, 0.35, 1, 8, 4), mb.quality === 'low' ? 8 : 18, { t: [0.15, 0.95], theta: [Math.PI - 0.5, Math.PI + 0.5], scale: [0.22, 0.32], rows: true, seed: 3, color: sucker, sink: 0.15 });
    }
    return S;
  }
  // Cthulhu
  const hum = d.hum!;
  const R = hum.r;
  mb.tube(['hips', 'spine', 'chest', 'neck'], S.skin, {
    radius: profile([[0, 0.07 * R], [0.2, 0.1 * R], [0.55, 0.11 * R * 1.25], [0.8, 0.12 * R * 1.25], [0.92, 0.06 * R], [1, 0.045 * R]]),
    start: 0.04 * H, tip: 0.03 * H, radial: 16, perBone: 4, color: s.skin, colorEnd: s.skin, belly, flatten: [1, 0.7], capStart: false, blendParent: false,
  });
  for (const sd of ['l', 'r'] as const) {
    mb.tube([`arm_${sd}`, `forearm_${sd}`, `hand_${sd}`], S.skin, { radius: profile([[0, 0.05 * R], [0.5, 0.04 * R], [1, 0.03 * R]]), tip: 0.02 * H, radial: 11, perBone: 4, color: s.skin, colorEnd: dark, capStart: true });
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * 0.35;
      const claw = geo.tube([[0, 0, 0], [Math.sin(a) * 0.02 * H, -0.04 * H, 0.015 * H], [Math.sin(a) * 0.03 * H, -0.08 * H, 0.03 * H]], profile([[0, 0.012 * R * 1.6], [1, 0.003 * R]]), { radial: 5, perSeg: 2 });
      mb.part(`hand_${sd}`, claw, S.horn, { pos: [0, -0.04 * H, 0.01 * H], color: dark });
    }
  }
  // head: bulbous cranium, many eyes
  const cr = geo.ellipsoid(0.07 * R * 1.6, 0.09 * R * 1.6, 0.08 * R * 1.6, 16, 12);
  mb.part('head', cr, S.skin, { pos: [0, 0.06 * H, -0.01 * H], color: s.skin, shade: 0.25 });
  const eyes: [number, number][] = [[-0.035, 0.07], [0.035, 0.07], [-0.055, 0.085], [0.055, 0.085], [0, 0.095], [-0.02, 0.1], [0.02, 0.1]];
  for (const [x, y] of eyes) mb.part('head', geo.ellipsoid(0.01 * H, 0.007 * H, 0.006 * H, 8, 6), S.glow, { pos: [x * H, y * H, 0.05 * H], color: s.eye });
  for (const f of d.face) mb.tube(['head', ...f], S.skin, { radius: profile([[0, 0.025 * R * 1.6], [1, 0.004 * R]]), tip: 0.04 * H, radial: 7, perBone: 3, color: s.skin, colorEnd: sucker, blendParent: false });
  // mist tendrils (translucent, glowing)
  mb.surface('mist', { roughness: 1, metalness: 0, detail: 'noise', detailScale: 1, detailStrength: 0.6, rim: 2.2, transparent: true, opacity: 0.55, depthWrite: false, emissive: s.glow, emissiveIntensity: 0.4, castShadow: false });
  for (const m of d.mist) mb.tube(['hips', ...m], 'mist', { radius: profile([[0, 0.12 * R], [0.6, 0.08 * R], [1, 0.01 * R]]), tip: 0.12 * H, radial: 9, perBone: 3, color: s.skin, colorEnd: s.glow, blendParent: false });
  // wings
  if (d.wings) {
    mb.surface('membrane', { roughness: 0.8, metalness: 0, detail: 'leather', detailScale: 1.2, detailStrength: 0.6, rim: 1.4, side: THREE.DoubleSide });
    for (const sd of ['l', 'r'] as const) {
      const w = d.wings[sd];
      mb.tube(w.arm, S.skin, { radius: profile([[0, 0.04 * R], [1, 0.015 * R]]), tip: 0.02 * H, radial: 7, perBone: 3, color: dark, blendParent: false });
      for (const f of w.fingers) mb.tube([w.arm[2], ...f], S.horn, { radius: profile([[0, 0.012 * R * 1.5], [1, 0.003 * R]]), tip: 0.02 * H, radial: 5, perBone: 3, color: dark, blendParent: false });
      mb.membrane([[...w.arm, ...w.fingers[0]], [w.arm[2], ...w.fingers[1]], [w.arm[2], ...w.fingers[2]], ['chest', 'spine', 'hips']], 'membrane', {
        samples: 8, cols: 4, scallop: 0.25, color: s.membrane ?? shade(s.skin, 0.6), colorEdge: mix(s.membrane ?? shade(s.skin, 0.6), s.glow, 0.25),
      });
    }
  }
  return S;
}
