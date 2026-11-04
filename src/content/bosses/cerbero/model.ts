/**
 * Cerbero — the three-headed hound of the Porta di Dite (data/bosses/cerbero.yaml, Bible C10 #7): an enormous dog with
 * pitch-black shaggy fur, ember eyes and broken chains at the necks.
 *
 * Built on a quadruped skeleton of our own (bone names and axes of the quadruped family, so every clip of
 * data/anim/quadruped.yaml drives it) with three arched necks whose head bones sit exactly on the data part spheres
 * (head_left / head_center / head_right): `info.partChains` hands each neck to the behavior's anchors (behavior.ts rears
 * the attacking head, drives it down to the ground and keeps it low through the recovery).
 * Read the head: each head has its own glow surface (eyes + throat) and a flare between the eyes. The head that winds up
 * an attack flares in its own color while the others dim: LEFT bites (blood-red), CENTER spits fire (fire-gold, embers
 * smoulder in its jaws all fight long), RIGHT growls shockwaves (ember-orange, the widest ruff, ears flat).
 * Silhouette: the three heads fanned wide over a deep chest, a mane of spiky fur, a long tail with a row of bone spikes.
 * Phase 1: a heavy iron chain is still draped across the chest between the shoulders, a shackle ring hanging from it.
 * Phase 2 (flag 'chains_broken'): that chain is gone (hideOnFlag) and a smouldering ember shell wakes on the fur.
 * Each collar keeps its broken chain end in both phases (spring chains, they swing and whip with the body).
 * Local frame: +Z forward, +Y up, +X = Cerbero's LEFT; every size derives from def.body.height (7.2 m).
 */
import * as THREE from 'three';
import type { BossDef, MinionDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import type { Sim } from '../../../sim/sim';
import type { ActorVisual, BossModelBuilder, RenderCtx } from '../../../render/types';
import * as geo from '../../../render/kit/geometry';
import type { V3 } from '../../../render/kit/geometry';
import { pal } from '../../../render/kit/index';
import { mix, shade } from '../../../render/kit/palette';
import type { ModelBuilder } from '../../../render/kit/model';
import { Prng, seedOf } from '../../../render/kit/noise';
import { bezierPoints, boneAt, chainThrough, profile, standardSurfaces, type SurfaceIds } from '../../../render/rigs/families/common';
import { RigVisual } from '../../../render/rigs/visual';
import { ATMOS } from '../../../render/world/atmosphere';

function colors(ctx: RenderCtx, def: BossDef | MinionDef) {
  const P = pal(ctx, def.model?.palette ?? 'act2_red_blue_black');
  return {
    fur: mix(P.dark, '#1b1820', 0.55),
    furLight: '#2c2733',
    belly: '#241d24',
    dark: '#08070a',
    iron: mix(P.metal, '#2b2a2e', 0.5),
    ironHot: mix(P.primary, '#5a2a1c', 0.5),
    claw: '#1d1917',
    bone: '#bfb39c',
    fang: '#ddd1b8',
    gum: '#3c1517',
    /** LEFT (bite): blood ember. */
    eyeL: '#ff3416',
    /** CENTER (fire): fire-gold. */
    eyeC: mix(P.glow, '#ffc05a', 0.35),
    /** RIGHT (shockwave): ember orange. */
    eyeR: P.accent,
    ember: '#ff4a1a',
  };
}
type Colors = ReturnType<typeof colors>;

interface HeadSpec {
  sfx: '' | '_l' | '_r';
  part: string;
  side: number;
  /** Hurt sphere centre of the part (model space). */
  c: V3;
  glow: string;
  eye: string;
  size: number;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);

/** Lean fur tuft: 4 open single-segment spikes (~32 triangles), base at the origin, pointing +Y. */
function tuftGeo(seed: number): THREE.BufferGeometry {
  const rng = new Prng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const l = rng.range(0.65, 1.1);
    const c = new THREE.ConeGeometry(0.15 * rng.range(0.75, 1.1), l, 4, 1, true).translate(0, l / 2, 0);
    geo.xform(c, [rng.range(-0.22, 0.22), 0, rng.range(-0.22, 0.22)], [rng.range(-20, 20), rng.range(0, 360), rng.range(-20, 20)]);
    parts.push(c);
  }
  return geo.mergeGeometries(parts);
}

/** One chain link: a torus elongated along +Y (lies in the XY plane). */
function linkGeo(mb: ModelBuilder, R: number, r: number): THREE.BufferGeometry {
  const g = geo.torus(R, r, mb.seg(6, 4), mb.seg(14, 8));
  g.scale(1, 1.5, 1.15);
  return g;
}

/** Links along a model-space polyline (alternating 90 deg rolls), skinned rigidly to `bone`. */
function chainAlong(mb: ModelBuilder, bone: string, surface: string, pts: THREE.Vector3[], R: number, r: number, color: string, colorHot: string): void {
  const step = 2 * R * 1.5 - 2.2 * r;
  // resample by arc length
  let acc = 0, n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    while (acc <= len) {
      const p = _v.copy(a).lerp(b, acc / Math.max(1e-6, len));
      const d = _v2.copy(b).sub(a).normalize();
      _q.setFromUnitVectors(_up, d);
      _q2.setFromAxisAngle(_up, (n % 2) * Math.PI / 2);
      _q.multiply(_q2);
      _m.compose(p, _q, _one);
      const g = linkGeo(mb, R, r).applyMatrix4(_m);
      mb.partModel(bone, g, surface, n % 3 === 1 ? colorHot : color);
      acc += step;
      n++;
    }
    acc -= len;
  }
}

/** Geometry placed at a model-space point, its +Y axis along `dir`. */
function placeAlong(g: THREE.BufferGeometry, at: V3, dir: THREE.Vector3, roll = 0): THREE.BufferGeometry {
  _q.setFromUnitVectors(_up, _v2.copy(dir).normalize());
  if (roll) {
    _q2.setFromAxisAngle(_up, roll);
    _q.multiply(_q2);
  }
  _m.compose(_v.set(at[0], at[1], at[2]), _q, _one);
  return g.applyMatrix4(_m);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Skeleton                                                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */

interface Dims {
  k: number;
  h: number;
  L: number;
  w: number;
  bodyY: number;
  chestY: number;
  foot: Record<'fl' | 'fr' | 'bl' | 'br', number>;
  legs: Record<'fl' | 'fr' | 'bl' | 'br', string[]>;
  necks: Record<string, string[]>;
  tail: string[];
}

function skeleton(mb: ModelBuilder, def: BossDef | MinionDef, heads: HeadSpec[]): Dims {
  const k = Math.max(3, def.body.height) / 7.2;
  const h = 3.9 * k, L = 3.9 * k, w = 1.2 * k;
  const bodyY = 0.88 * h, chestY = 0.94 * h;
  mb.bone('body', 'root', [0, bodyY, -L / 2]);
  mb.bone('spine', 'body', [0, (chestY - bodyY) * 0.5 + 0.02 * h, L * 0.5]);
  mb.bone('chest', 'spine', [0, (chestY - bodyY) * 0.5 - 0.02 * h, L * 0.5]);
  // three arched necks: from the shoulders up and out, the head bone ON the part sphere (IK target at rest)
  const necks: Record<string, string[]> = {};
  for (const hs of heads) {
    const p0: V3 = [hs.side * 0.78 * k, chestY + 0.52 * k, L / 2 + 0.72 * k - Math.abs(hs.side) * 0.12 * k];
    const c = hs.c;
    const ctrl: V3 = [c[0] * 0.8, c[1] + 0.85 * k, p0[2] + (c[2] - p0[2]) * 0.22];
    const pts = [p0, ...bezierPoints(p0, ctrl, c, 3)];
    const names = chainThrough(mb, `neck${hs.sfx}`, 'chest', pts.slice(0, 3));
    necks[hs.sfx] = names;
    boneAt(mb, `head${hs.sfx}`, names[2], c);
    // jaw hinge under the back of the skull, resting a little open (a snarl: the throat embers show)
    mb.bone(`jaw${hs.sfx}`, `head${hs.sfx}`, [0, -0.2 * k * hs.size, -0.08 * k * hs.size], [hs.sfx === '' ? 13 : 9, 0, 0]);
    mb.socket(`mouth${hs.sfx}`, `head${hs.sfx}`, [0, -0.1 * k * hs.size, 1.25 * k * hs.size]);
  }
  // legs (canine): chest -> leg_f*_0..2, body -> leg_b*_0..2
  const legs = {} as Dims['legs'];
  const fUp = 0.3 * h, fLo = 0.3 * h;
  for (const sfx of ['fl', 'fr'] as const) {
    const sx = sfx === 'fl' ? 1 : -1;
    mb.bone(`leg_${sfx}_0`, 'chest', [sx * w * 0.74, -0.06 * h, 0.02 * L]);
    mb.bone(`leg_${sfx}_1`, `leg_${sfx}_0`, [0, -fUp, -0.03 * h]);
    mb.bone(`leg_${sfx}_2`, `leg_${sfx}_1`, [0, -fLo, 0.02 * h]);
    legs[sfx] = [`leg_${sfx}_0`, `leg_${sfx}_1`, `leg_${sfx}_2`];
  }
  const hUp = 0.32 * h, hLo = 0.34 * h;
  for (const sfx of ['bl', 'br'] as const) {
    const sx = sfx === 'bl' ? 1 : -1;
    mb.bone(`leg_${sfx}_0`, 'body', [sx * w * 0.7, -0.04 * h, 0.0]);
    mb.bone(`leg_${sfx}_1`, `leg_${sfx}_0`, [0, -hUp, 0.12 * h]);
    mb.bone(`leg_${sfx}_2`, `leg_${sfx}_1`, [0, -hLo, -0.14 * h]);
    legs[sfx] = [`leg_${sfx}_0`, `leg_${sfx}_1`, `leg_${sfx}_2`];
  }
  const fFoot = chestY - 0.06 * h - fUp - fLo, bFoot = bodyY - 0.04 * h - hUp - hLo;
  const foot = { fl: fFoot, fr: fFoot, bl: bFoot, br: bFoot };
  // long whip tail: out and down from the rump, then lifting a little toward the tip
  const t0: V3 = [0, bodyY + 0.2 * k, -L / 2 - 0.85 * k];
  const tail = chainThrough(mb, 'tail', 'body', [
    t0, [0, t0[1] - 0.45 * k, t0[2] - 0.8 * k], [0, t0[1] - 0.95 * k, t0[2] - 1.55 * k], [0, t0[1] - 1.3 * k, t0[2] - 2.35 * k],
    [0, t0[1] - 1.45 * k, t0[2] - 3.2 * k], [0, t0[1] - 1.4 * k, t0[2] - 4.05 * k],
  ]);
  mb.size = bodyY;
  mb.height = Math.max(def.body.height, h);
  mb.info.family = 'quadruped';
  mb.info.rootBone = 'body';
  mb.info.walkSpeed = 1.6 * (h / 1.5);
  mb.info.runSpeed = 7 * (h / 1.5);
  mb.info.look = heads.map((hs) => ({ bone: `head${hs.sfx}`, weight: 0.5, limit: 40 }));
  mb.info.flinch = ['spine', 'chest'];
  mb.info.partChains = Object.fromEntries(heads.map((hs) => [hs.part, { bones: [...necks[hs.sfx], `head${hs.sfx}`], weight: 1 }]));
  mb.info.springs = [{ chain: 'tail', stiffness: 38, damping: 5.5, gravity: 0.6, falloff: 0.55 }];
  mb.info.hideOnFlag = { chains_broken: ['yoke'] };
  return { k, h, L, w, bodyY, chestY, foot, legs, necks, tail };
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Body                                                                                                               */
/* ---------------------------------------------------------------------------------------------------------------- */

function body(mb: ModelBuilder, d: Dims, S: SurfaceIds, C: Colors): void {
  const { k, h, L } = d;
  const w = d.w * 1.05;
  const tuft = tuftGeo(3);
  // barrel: deep chest, tucked waist, heavy haunches
  const barrel = mb.tube(['body', 'spine', 'chest'], S.skin, {
    radius: profile([[0, w * 0.55], [0.14, w * 0.95], [0.32, w * 0.9], [0.5, w * 0.8], [0.74, w * 1.06], [0.88, w * 1.02], [1, w * 0.62]]),
    start: 0.36 * L, tip: 0.36 * L, blendParent: false, flatten: [0.92, 1.0], radial: mb.seg(16, 10), perBone: 4,
    color: C.fur, belly: C.belly, capStart: true, capEnd: true,
  });
  // shaggy back and shoulders: spiky tufts along the top, a thick mane over the shoulders
  barrel.scatter(S.skin, tuft, mb.seg(110, 40), { t: [0.06, 0.97], theta: [-1.35, 1.35], scale: [0.3, 0.52], lean: 70, seed: 11, color: C.fur, sink: 0.25 });
  barrel.scatter(S.skin, tuft, mb.seg(70, 26), { t: [0.62, 0.99], theta: [-2.4, 2.4], scale: [0.4, 0.66], lean: 64, seed: 12, color: C.furLight, sink: 0.22 });
  barrel.scatter(S.skin, tuft, mb.seg(40, 14), { t: [0.05, 0.45], theta: [-2.6, 2.6], scale: [0.26, 0.4], lean: 74, seed: 13, color: C.fur, sink: 0.25 });
  // legs: muscled upper tube + heavy cannon + broad paw with black claws
  for (const leg of ['fl', 'fr', 'bl', 'br'] as const) {
    const front = leg[0] === 'f';
    const bones = d.legs[leg];
    const top = front ? w * 0.68 : w * 0.78;
    const handle = mb.tube([...bones], S.skin, {
      radius: profile([[0, top], [0.3, top * 0.7], [0.58, 0.12 * h], [0.85, 0.095 * h], [1, 0.09 * h]]),
      tip: 0.02 * h, radial: mb.seg(12, 8), perBone: 3, color: C.fur, colorEnd: shade(C.fur, 0.85), capEnd: false, blendParent: false,
    });
    handle.scatter(S.skin, tuft, mb.seg(9, 4), { t: [0.15, 0.55], theta: [-3, 3], scale: [0.45, 0.7], lean: 75, seed: 20 + leg.length + (front ? 1 : 2), color: C.fur, sink: 0.25 });
    const last = bones[2];
    const fl = d.foot[leg];
    const cr = 0.085 * h;
    const cannon = geo.tube([[0, 0.02 * h, 0], [0, -fl * 0.5, 0.004 * h], [0, -fl + 0.05 * h, 0.01 * h]], profile([[0, cr * 1.2], [0.5, cr], [1, cr * 1.25]]), { radial: mb.seg(10, 6), perSeg: 2 });
    mb.part(last, cannon, S.skin, { color: shade(C.fur, 0.85) });
    mb.part(last, geo.ellipsoid(0.13 * h, 0.065 * h, 0.17 * h, mb.seg(12, 8), 7), S.skin, { pos: [0, -fl + 0.05 * h, 0.07 * h], color: shade(C.fur, 0.8), shade: 0.4 });
    for (const sx of [-1.5, -0.5, 0.5, 1.5]) {
      const claw = geo.spike(0.022 * h, 0.13 * h, 5, 0.05 * h);
      mb.part(last, claw, S.horn, { pos: [sx * 0.055 * h, -fl + 0.04 * h, 0.2 * h], rot: [95, sx * 6, 0], color: C.claw });
    }
  }
  // tail: tapering whip with a ridge of bone spikes and a brush of fur at the tip
  const tailH = mb.tube(d.tail, S.skin, {
    radius: profile([[0, w * 0.26], [0.35, w * 0.2], [0.8, w * 0.11], [1, w * 0.05]]),
    tip: 0.5 * k, radial: mb.seg(10, 6), perBone: 3, color: C.fur, colorEnd: C.dark, blendParent: false,
  });
  tailH.scatter(S.skin, tuft, mb.seg(16, 8), { t: [0.75, 1.0], theta: [-3, 3], scale: [0.9, 1.6], lean: 70, seed: 31, color: C.fur, sink: 0.1 });
  d.tail.slice(0, -1).forEach((bn, i) => {
    const s = (0.5 - i * 0.07) * k;
    mb.part(bn, geo.spike(s * 0.24, s, 5, -s * 0.35), S.horn, { pos: [0, w * (0.24 - i * 0.03), -0.1 * k], rot: [-48, 0, 0], color: C.bone });
  });
  // spine ridge of short bone spikes along the back (reads against the red sky)
  for (const [bn, n, z0] of [['body', 3, -0.35], ['spine', 3, -0.4], ['chest', 2, -0.6]] as [string, number, number][]) {
    for (let i = 0; i < n; i++) {
      const s = (0.42 + 0.06 * ((i + n) % 3)) * k;
      mb.part(bn, geo.spike(s * 0.22, s, 5, -s * 0.3), S.horn, { pos: [0, w * 1.02, (z0 + i * 0.55) * k * 1.2], rot: [-40, 0, 0], color: shade(C.bone, 0.75) });
    }
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Necks, collars, heads                                                                                              */
/* ---------------------------------------------------------------------------------------------------------------- */

function neckAndCollar(mb: ModelBuilder, d: Dims, hs: HeadSpec, S: SurfaceIds, C: Colors): void {
  const { k } = d;
  const nk = d.necks[hs.sfx];
  const tuft = tuftGeo(5 + hs.side);
  const neck = mb.tube(['chest', ...nk, `head${hs.sfx}`], S.skin, {
    radius: profile([[0, 1.18 * k], [0.25, 0.98 * k], [0.62, 0.72 * k], [0.86, 0.6 * k], [1, 0.55 * k]]),
    tip: 0.05 * k, blendParent: false, radial: mb.seg(12, 8), perBone: 3, color: C.fur, belly: C.belly, flatten: [0.9, 1], capEnd: false,
  });
  // the ruff: long spiky fur from the shoulders up the neck (the RIGHT head, the growler, bristles the widest)
  const ruff = hs.sfx === '_r' ? 1.25 : hs.sfx === '' ? 1.08 : 0.95;
  neck.scatter(S.skin, tuft, mb.seg(52, 20), { t: [0.25, 0.9], theta: [-1.9, 1.9], scale: [0.55 * ruff, 0.95 * ruff], lean: 58, seed: 40 + hs.side * 3, color: C.fur, sink: 0.22 });
  neck.scatter(S.skin, tuft, mb.seg(20, 8), { t: [0.7, 0.96], theta: [-3, 3], scale: [0.5 * ruff, 0.8 * ruff], lean: 50, seed: 47 + hs.side * 3, color: C.furLight, sink: 0.2 });
  // spiked iron collar around the middle of the neck
  const a = mb.restPos(nk[1]), b = mb.restPos(nk[2]);
  const dir = _v2.copy(b).sub(a).normalize().clone();
  const cr = 0.78 * k;
  const at: V3 = [a.x + dir.x * 0.25 * k, a.y + dir.y * 0.25 * k, a.z + dir.z * 0.25 * k];
  const band = geo.torus(cr, 0.13 * k, mb.seg(6, 4), mb.seg(22, 12));
  band.rotateX(Math.PI / 2);
  band.scale(1, 1.9, 1);
  mb.partModel(nk[1], placeAlong(band, at, dir), S.metal, C.iron);
  const nSp = mb.seg(9, 6);
  for (let i = 0; i < nSp; i++) {
    const ang = (i / nSp) * Math.PI * 2;
    // radial spike in the collar's plane (+Y = collar axis before placing)
    const sp = geo.spike(0.075 * k, 0.42 * k, 5);
    sp.rotateZ(-Math.PI / 2);
    sp.translate(cr + 0.05 * k, 0, 0);
    sp.rotateY(ang);
    mb.partModel(nk[1], placeAlong(sp, at, dir), S.metal, i % 2 ? C.iron : C.ironHot);
  }
  // broken chain end hanging from the collar's underside (spring chain: swings, whips in the spin)
  const under: V3 = [at[0] + hs.side * 0.25 * k, at[1] - cr * 0.95, at[2] + 0.12 * k];
  const R = 0.17 * k, r = 0.055 * k;
  const step = 2 * R * 1.5 - 2.2 * r;
  const n = hs.sfx === '' ? 5 : 4;
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) pts.push([under[0], under[1] - i * step * 1.02, under[2]]);
  const ch = chainThrough(mb, `chain${hs.sfx}`, nk[1], pts);
  ch.forEach((bn, i) => {
    mb.part(bn, linkGeo(mb, R, r), S.metal, { pos: [0, -step * 0.5, 0], rot: [0, (i % 2) * 90, 0], color: i === n - 1 ? C.ironHot : C.iron });
  });
  (mb.info.springs as unknown[]).push({ chain: `chain${hs.sfx}`, stiffness: 16, damping: 2.6, gravity: 6, falloff: 0.3 });
}

function head(mb: ModelBuilder, d: Dims, hs: HeadSpec, S: SurfaceIds, C: Colors): void {
  const k = d.k * hs.size;
  const H = `head${hs.sfx}`, J = `jaw${hs.sfx}`;
  const left = hs.sfx === '_l', right = hs.sfx === '_r', center = hs.sfx === '';
  const seg = (n: number, m: number) => mb.seg(n, m);
  // cranium + heavy brow mass
  mb.part(H, geo.ellipsoid(0.54 * k, 0.5 * k, 0.8 * k, seg(16, 10), seg(12, 8)), S.skin, { pos: [0, 0.12 * k, -0.24 * k], color: C.fur, shade: 0.35 });
  mb.part(H, geo.ellipsoid(0.46 * k, 0.24 * k, 0.5 * k, seg(12, 8), seg(8, 6)), S.skin, { pos: [0, 0.32 * k, 0.16 * k], rot: [-14, 0, 0], color: shade(C.fur, 0.9) });
  for (const sx of [-1, 1]) mb.part(H, geo.ellipsoid(0.3 * k, 0.36 * k, 0.5 * k, seg(10, 7), 6), S.skin, { pos: [sx * 0.3 * k, -0.06 * k, 0.02 * k], color: C.fur });
  // muzzle: broad, square (mastiff), slightly wrinkled up into a snarl
  const muzzle = geo.lathe([[0.0, 0], [0.42, 0.02], [0.42, 0.3], [0.35, 0.66], [0.28, 1.0], [0.21, 1.2], [0, 1.28]].map(([r0, y]) => [r0 * k, y * k] as [number, number]), seg(14, 9));
  muzzle.rotateX(Math.PI / 2);
  muzzle.scale(1, 0.74, 1);
  mb.part(H, muzzle, S.skin, { pos: [0, 0.0, 0.12 * k], color: C.fur });
  mb.part(H, geo.ellipsoid(0.17 * k, 0.12 * k, 0.12 * k, seg(10, 6), seg(7, 5)), S.dark, { pos: [0, 0.1 * k, 1.38 * k], color: C.dark });
  // snarl ridges over the muzzle
  for (let i = 0; i < 3; i++) mb.part(H, geo.ellipsoid(0.36 * k, 0.05 * k, 0.06 * k, seg(8, 5), 4), S.skin, { pos: [0, 0.2 * k, (0.55 + i * 0.17) * k], rot: [0, 0, 0], color: shade(C.fur, 1.25) });
  // upper gum line, fangs and teeth
  mb.part(H, geo.ellipsoid(0.4 * k, 0.07 * k, 0.55 * k, seg(10, 6), 5), S.dark, { pos: [0, -0.18 * k, 0.72 * k], color: C.gum });
  const fangL = (left ? 0.5 : 0.4) * k;
  for (const sx of [-1, 1]) {
    mb.part(H, geo.spike(0.07 * k, fangL, 6, 0.04 * k), S.horn, { pos: [sx * 0.27 * k, -0.17 * k, 1.0 * k], rot: [180, 0, 0], color: C.fang });
    for (let i = 0; i < 3; i++) mb.part(H, geo.spike(0.035 * k, 0.15 * k, 4), S.horn, { pos: [sx * (0.3 - i * 0.02) * k, -0.17 * k, (0.78 - i * 0.16) * k], rot: [180, 0, 0], color: C.fang });
  }
  // eyes: slanted ember slits under the brows (own glow surface per head)
  for (const sx of [-1, 1]) {
    mb.part(H, geo.ellipsoid(0.105 * k, 0.045 * k, 0.085 * k, seg(10, 6), 6), hs.glow, { pos: [sx * 0.3 * k, 0.26 * k, 0.5 * k], rot: [0, sx * 30, sx * -24], color: hs.eye });
    mb.part(H, geo.ellipsoid(0.2 * k, 0.075 * k, 0.2 * k, seg(8, 5), 5), S.skin, { pos: [sx * 0.31 * k, 0.34 * k, 0.48 * k], rot: [-8, 0, sx * 28], color: shade(C.fur, 0.75) });
  }
  // ears: pointed, laid back; LEFT head has one ear torn, RIGHT head flattens both (growling)
  for (const sx of [-1, 1]) {
    const torn = left && sx === 1;
    const len = (torn ? 0.42 : 0.8) * k;
    const ear = geo.spike(0.21 * k, len, 6, -0.12 * k);
    ear.scale(1, 1, 0.42);
    mb.part(H, ear, S.skin, { pos: [sx * 0.34 * k, 0.48 * k, -0.3 * k], rot: [right ? -78 : -28, 0, sx * (right ? -30 : -14)], color: shade(C.fur, 0.85) });
  }
  // ruff on the nape
  const tuft = tuftGeo(7 + hs.side);
  for (let i = 0; i < (mb.quality === 'low' ? 3 : 5); i++) {
    const a = (i / 4 - 0.5) * 3.0;
    const s = (right ? 0.7 : 0.55) * k;
    mb.part(H, tuft.clone(), S.skin, { pos: [Math.sin(a) * 0.5 * k, 0.05 * k + Math.cos(a) * 0.3 * k, -0.72 * k], rot: [-118, 0, -a * 40], scale: [s, s, s], color: i % 2 ? C.fur : C.furLight });
  }
  // CENTER head: a crest of bone spikes over the skull (the eldest)
  if (center) {
    for (let i = 0; i < 4; i++) mb.part(H, geo.spike(0.08 * k, (0.5 - i * 0.07) * k, 5, -0.12 * k), S.horn, { pos: [0, 0.6 * k - i * 0.04 * k, (0.05 - i * 0.24) * k], rot: [-40 - i * 8, 0, 0], color: shade(C.bone, 0.8) });
  }
  // LEFT head: an old scar across the muzzle (bare, paler skin)
  if (left) mb.part(H, geo.ellipsoid(0.05 * k, 0.04 * k, 0.42 * k, 6, 4), S.skin, { pos: [0.16 * k, 0.21 * k, 0.72 * k], rot: [0, -24, 0], color: '#4a3a3c' });
  // lower jaw (jaw bone: hinge under the back of the skull), lower fangs, the throat glow inside
  const jz = 0.08 * k, jy = 0.2 * k;
  const jaw = geo.lathe([[0, 0], [0.42 * k, 0.06 * k], [0.38 * k, 0.55 * k], [0.26 * k, 1.0 * k], [0, 1.12 * k]], seg(10, 6), 0, Math.PI);
  jaw.rotateX(Math.PI / 2);
  jaw.rotateZ(Math.PI);
  jaw.scale(1, 0.5, 1);
  mb.part(J, jaw, S.skin, { pos: [0, -0.04 * k + jy - 0.2 * k, 0.12 * k + jz], color: C.belly });
  mb.part(J, geo.ellipsoid(0.32 * k, 0.05 * k, 0.5 * k, seg(10, 6), 5), hs.glow, { pos: [0, 0.03 * k, 0.62 * k + jz], color: shade(hs.eye, center ? 0.9 : 0.55) });
  for (const sx of [-1, 1]) {
    mb.part(J, geo.spike(0.06 * k, 0.3 * k, 5), S.horn, { pos: [sx * 0.24 * k, 0.02 * k, 1.02 * k + jz], color: C.fang });
    for (let i = 0; i < 2; i++) mb.part(J, geo.spike(0.03 * k, 0.12 * k, 4), S.horn, { pos: [sx * 0.26 * k, 0.02 * k, (0.8 - i * 0.18) * k + jz], color: C.fang });
  }
  // the fire head: embers in the roof of the mouth too
  if (center) mb.part(H, geo.ellipsoid(0.3 * k, 0.05 * k, 0.42 * k, seg(10, 6), 5), hs.glow, { pos: [0, -0.15 * k, 0.6 * k], color: shade(hs.eye, 0.8) });
}

/** P1: a heavy chain draped across the chest between the shoulders, a shackle ring hanging from it (bone 'yoke'). */
function yoke(mb: ModelBuilder, d: Dims, S: SurfaceIds, C: Colors): void {
  const { k, L, chestY } = d;
  mb.bone('yoke', 'chest', [0, 0, 0.4 * k]);
  const zc = L / 2;
  const R = 0.2 * k, r = 0.066 * k;
  const pts: THREE.Vector3[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = t * 2 - 1;
    // from the left shoulder, down over the breast, up to the right shoulder
    const x = s * 1.72 * k;
    const y = chestY + 0.55 * k - (1 - s * s) * 1.35 * k;
    const z = zc + 0.25 * k + (1 - Math.pow(Math.abs(s), 1.6)) * 1.28 * k;
    pts.push(new THREE.Vector3(x, y, z));
  }
  chainAlong(mb, 'yoke', S.metal, pts, R, r, C.iron, C.ironHot);
  // shackle ring at the bottom of the swag + a padlock plate with the hot rivet
  const low = pts[n / 2];
  const ring = geo.torus(0.42 * k, 0.1 * k, mb.seg(7, 5), mb.seg(20, 12));
  mb.partModel('yoke', ring.translate(low.x, low.y - 0.46 * k, low.z + 0.04 * k), S.metal, C.iron);
  const plate = geo.bevelBox(0.5 * k, 0.42 * k, 0.16 * k, 0.04 * k, 2);
  mb.partModel('yoke', plate.translate(low.x, low.y - 0.92 * k, low.z + 0.04 * k), S.metal, C.ironHot);
  // hanging length from the ring (spring chain, child of the yoke so it vanishes with it)
  const step = 2 * R * 1.5 - 2.2 * r;
  const cp: V3[] = [];
  for (let i = 0; i < 4; i++) cp.push([low.x, low.y - 1.15 * k - i * step, low.z + 0.04 * k]);
  const ch = chainThrough(mb, 'yokechain', 'yoke', cp);
  ch.forEach((bn, i) => mb.part(bn, linkGeo(mb, R, r), S.metal, { pos: [0, -step * 0.5, 0], rot: [0, (i % 2) * 90, 0], color: C.iron }));
  (mb.info.springs as unknown[]).push({ chain: 'yokechain', stiffness: 14, damping: 2.4, gravity: 6, falloff: 0.3 });
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Visual: per-head tells                                                                                             */
/* ---------------------------------------------------------------------------------------------------------------- */

interface HeadFx {
  part: string;
  mat: THREE.MeshStandardMaterial | null;
  flare: THREE.Sprite;
  flareMat: THREE.SpriteMaterial;
  k: number;
  base: number;
  phase: number;
}

function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** How strongly a head's tell burns for the actor's current attack (0 rest .. 1 striking). */
function tellOf(actor: Actor, part: string): number {
  const atk = actor.attack;
  if (!atk || actor.state === 'dead') return 0;
  const def = atk.def;
  const mine = def.part === part || (!def.part && (def.anim === 'howl' || def.anim === 'roar'));
  if (!mine) return def.part ? -1 : 0;
  if (atk.stage === 'telegraph') return 0.35 + 0.65 * smooth01(atk.time / Math.max(0.05, def.telegraph * 0.85));
  if (atk.stage === 'active') return 1;
  const tr = (atk.activeTime - def.active) / Math.max(0.05, def.recovery);
  return 1 - smooth01(tr * 2.2);
}

const build: BossModelBuilder = (def, ctx, actor: Actor): ActorVisual => {
  const C = colors(ctx, def);
  const rng = new Prng(seedOf(def.id));
  const mb = ctx.kit.model(def.id, ctx.quality);
  const partC = (id: string, fb: V3): V3 => {
    const ps = (def as BossDef).parts;
    const p = ps?.find((x) => x.id === id);
    const c = p?.hurt?.[0]?.c;
    return c ? [c[0], c[1], c[2]] : fb;
  };
  const S = standardSurfaces(mb, '', { skinDetail: 'fur', skinRough: 0.85, metalRough: 0.58, metalness: 0.62, rim: 0.55, glowIntensity: 2.0 });
  const glowSpec = { roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: 2.0, emissiveVertexColor: true, detail: null, rim: 0.2, castShadow: false } as const;
  const heads: HeadSpec[] = [
    { sfx: '', part: 'head_center', side: 0, c: partC('head_center', [0, 5.8, 6.2]), glow: mb.surface('glow_c', glowSpec), eye: C.eyeC, size: 1.24 },
    { sfx: '_l', part: 'head_left', side: 1, c: partC('head_left', [2.3, 5.2, 5.6]), glow: mb.surface('glow_l', glowSpec), eye: C.eyeL, size: 1.14 },
    { sfx: '_r', part: 'head_right', side: -1, c: partC('head_right', [-2.3, 5.2, 5.6]), glow: mb.surface('glow_r', glowSpec), eye: C.eyeR, size: 1.14 },
  ];
  const d = skeleton(mb, def, heads);
  body(mb, d, S, C);
  for (const hs of heads) {
    neckAndCollar(mb, d, hs, S, C);
    head(mb, d, hs, S, C);
  }
  yoke(mb, d, S, C);
  const model = mb.build();
  model.setShadow(ctx.quality !== 'low');

  // flares between the eyes (camera-facing, additive): the tell that reads at phone size
  const tex = ctx.kit.sprite('rays', 64);
  const fx: HeadFx[] = heads.map((hs) => {
    const flareMat = new THREE.SpriteMaterial({ map: tex, color: hs.eye, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const flare = new THREE.Sprite(flareMat);
    // in front of the brow, clear of the snout: seen from the front even when the head is down at the ground
    flare.position.set(0, 0.42 * d.k * hs.size, 1.15 * d.k * hs.size);
    flare.visible = false;
    flare.name = `cerbero_flare${hs.sfx}`;
    model.attach(`head${hs.sfx}`, flare);
    return { part: hs.part, mat: (model.materials[hs.glow] as THREE.MeshStandardMaterial | undefined) ?? null, flare, flareMat, k: 0, base: 0.3, phase: rng.range(0, 6.28) };
  });

  const onUpdate = (v: RigVisual, a: Actor, _sim: Sim, dt: number) => {
    const alive = a.state !== 'dead';
    const unleashed = a.flags.has('chains_broken');
    for (const h of fx) {
      const tell = tellOf(a, h.part);
      // other heads dim while one attacks (contrast), smoulder at rest; the fire head always smoulders a little more
      const smoulder = 0.28 + 0.06 * Math.sin(v.time * 2.1 + h.phase) + (unleashed ? 0.1 : 0);
      const want = !alive ? 0 : tell < 0 ? 0.12 : Math.max(smoulder, tell);
      h.k += (want - h.k) * Math.min(1, dt * (want > h.k ? 14 : 5));
      if (h.mat) h.mat.emissiveIntensity = 0.9 + 5.5 * h.k;
      const f = Math.max(0, (h.k - 0.42) / 0.58);
      h.flare.visible = f > 0.01;
      if (h.flare.visible) {
        const s = (1.2 + 2.8 * f) * d.k * (1 + 0.06 * Math.sin(v.time * 31 + h.phase));
        h.flare.scale.set(s * 1.6, s, 1);
        h.flareMat.opacity = Math.min(1, 0.95 * f) * ATMOS.uHazeK.value;
        h.flareMat.rotation = Math.sin(v.time * 0.7 + h.phase) * 0.15;
      }
    }
  };

  const visual = new RigVisual(ctx, def, actor, model, {
    family: 'quadruped',
    height: 4.2 * d.k,
    flagAuras: {
      chains_broken: { color: C.ember, surfaces: [S.skin], strength: 0.16, power: 4.0, flow: 1.1, inflate: 0.04 },
    },
    onUpdate,
  });
  const dispose = visual.dispose.bind(visual);
  visual.dispose = () => {
    for (const h of fx) h.flareMat.dispose();
    dispose();
  };
  return visual;
};

export default build;
