/**
 * Cavaliere Errante — the first Cercatore: a knight in a worn green travelling cloak and patched, mismatched armor on a
 * dapple-grey horse; a deep hood over a sallet whose visor slit holds a faint amber light; an unlit iron lantern swings
 * from the saddle; the Brando del Viandante (slim longsword, its fuller engraved with the lines of every road walked).
 *
 * Two kit models in one visual, both built in the sim's local frame from data/bosses/cavaliere_errante.yaml:
 *  - MOUNTED (phase 1, flag 'mounted'): mounted rig family (data/anim/mounted.yaml). Steed chest / barrel / head land on
 *    the `steed` part spheres, the seated rider's torso and hood on the `rider` part spheres.
 *  - ON FOOT (phase 2, flag 'dismounted'): humanoid rig at FOOT_HEIGHT (behavior.ts) over the body hurtboxes (legs 0.95,
 *    torso 2.15, hood 3.25). On the dismount he vaults down from the saddle, takes the lantern to his belt, and the grey
 *    horse rears and gallops away out of the circle of stones ("the mount leaves"); it is not drawn again.
 * Both models share the renderer's per-actor FX (hit flash, Colpo Rosso, Spezzato cracks, dissolve) by copying them.
 * Signature lights: the amber visor slit, the faint road-lines along the blade (brighter in the counter stance), and an
 * ember that wakes in the lantern as he falls ("L'alba non si trova. Si porta").
 */
import * as THREE from 'three';
import type { BossDef, MinionDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import type { Sim } from '../../../sim/sim';
import type { ActorVisual, BossModelBuilder, RenderCtx } from '../../../render/types';
import * as geo from '../../../render/kit/geometry';
import { pal } from '../../../render/kit/index';
import { mix, shade } from '../../../render/kit/palette';
import type { Model, ModelBuilder } from '../../../render/kit/model';
import { standardSurfaces, type SurfaceIds } from '../../../render/rigs/families/common';
import { humanoidBody, humanoidSkeleton, type HumanoidDims } from '../../../render/rigs/families/humanoid';
import { quadrupedBody, type QuadrupedDims } from '../../../render/rigs/families/quadruped';
import { mountedSkeleton } from '../../../render/rigs/families/mounted';
import { Animator, type AnimInput, type AnimStageName } from '../../../render/rigs/animator';
import type { ClipDef } from '../../../render/rigs/clips';

/** Knight standing height (matches behavior.ts FOOT_HEIGHT 3.9 with the hood) and the steed's withers. */
const KNIGHT_H = 3.6;
const HORSE_H = 2.6;

function colors(ctx: RenderCtx, def: BossDef | MinionDef) {
  const P = pal(ctx, def.model?.palette ?? 'act1_green_gold');
  return {
    steel: mix(P.metal, '#8d9192', 0.55),
    steelDark: shade(mix(P.metal, '#7c8082', 0.5), 0.6),
    brass: mix(P.secondary, '#9a7a3c', 0.45),
    gold: mix(P.accent, '#c8a85a', 0.4),
    cloak: mix(P.primary, '#6f7a4c', 0.55),
    cloakDark: mix(shade(P.primary, 0.6), '#3a4030', 0.5),
    cloakHem: mix(shade(P.primary, 0.7), '#7a6844', 0.5),
    patch: '#6e5a3c',
    leather: '#4a3424',
    leatherDark: '#2a1e16',
    coat: '#868a90',
    coatBelly: '#a4a8ad',
    coatDark: '#2f3237',
    mane: '#d6d8d8',
    blanket: mix(shade(P.primary, 0.7), '#6a6442', 0.35),
    iron: '#2e2d2c',
    glassDark: '#1b1712',
    amber: '#ffb34a',
    ember: '#ffc46a',
    road: mix(P.glow, '#ffd790', 0.5),
  };
}
type Colors = ReturnType<typeof colors>;

/* ---------------------------------------------------------------------------------------------------------------- */
/* Knight (shared by the seated rider and the knight on foot)                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

interface KnightSurfaces extends SurfaceIds {
  bladeGlow: string;
  flame: string;
  glass: string;
}

function knightSurfaces(mb: ModelBuilder): KnightSurfaces {
  const S = standardSurfaces(mb, 'knight_', { metalRough: 0.58, metalness: 0.62, rim: 1.05, glowIntensity: 1.7, clothDetail: 'cloth' });
  const bladeGlow = mb.surface('knight_road', { roughness: 0.3, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1.1, emissiveVertexColor: true, detail: null, rim: 0.2, castShadow: false });
  const flame = mb.surface('lantern_flame', { roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0, emissiveVertexColor: true, detail: null, rim: 0, castShadow: false });
  const glass = mb.surface('lantern_glass', { roughness: 0.15, metalness: 0.2, detail: null, rim: 1.4, rimPower: 2.5 });
  return { ...S, bladeGlow, flame, glass };
}

/** Deep travelling hood (open at the face) over a rounded sallet with a glowing visor slit. */
function hoodedHelm(mb: ModelBuilder, d: HumanoidDims, S: KnightSurfaces, C: Colors): void {
  const H = d.H, R = d.r;
  const B = (n: string) => `${d.p}${n}`;
  // sallet: rounded bowl, a short flared tail at the back
  const sallet = geo.lathe([[0, -0.03 * H], [0.064 * R, -0.03 * H], [0.07 * R, 0.0], [0.072 * R, 0.045 * H], [0.06 * R, 0.085 * H], [0.03 * R, 0.104 * H], [0, 0.108 * H]], mb.seg(16, 9));
  mb.part(B('head'), sallet, S.metal, { pos: [0, 0, 0.004 * H], color: C.steel, shade: 0.35 });
  mb.part(B('head'), geo.plate(0.16 * R, 0.035 * H, 0.08 * R, 0.006 * R, mb.seg(8, 5), 1), S.metal, { pos: [0, -0.02 * H, -0.012 * H], rot: [-28, 180, 0], color: C.steelDark });
  // visor: a narrow slit of warm amber light, a riveted brow
  mb.part(B('head'), geo.bevelBox(0.11 * R, 0.015 * H, 0.014 * R, 0.003 * R), S.glow, { pos: [0, 0.05 * H, 0.068 * R], color: C.amber });
  mb.part(B('head'), geo.torus(0.07 * R, 0.0035 * H, 4, mb.seg(18, 10), Math.PI * 0.9), S.metal, { pos: [0, 0.062 * H, 0.004 * H], rot: [90, 0, 18], color: C.brass });
  mb.part(B('head'), geo.bevelBox(0.016 * R, 0.044 * H, 0.012 * R, 0.003 * R), S.metal, { pos: [0, 0.018 * H, 0.071 * R], color: C.steelDark });
  // the hood: deep cowl over the helm, open in front, peaked at the back; worn green with a darker lining edge
  const hood = geo.lathe([[0.07 * R, -0.05 * H], [0.092 * R, -0.01 * H], [0.096 * R, 0.05 * H], [0.086 * R, 0.1 * H], [0.06 * R, 0.13 * H], [0.024 * R, 0.142 * H], [0.0, 0.144 * H]], mb.seg(18, 10), 0.62, Math.PI * 2 - 1.24);
  mb.part(B('head'), hood, S.cape, { pos: [0, 0, -0.008 * H], color: C.cloak, shade: 0.5 });
  // mantle: a short cape over the shoulders (the long cloak hangs from the cape chain)
  const mantle = geo.lathe([[0.05 * R, 0.03 * H], [0.1 * R, 0.0], [0.15 * R, -0.05 * H], [0.17 * R, -0.09 * H]], mb.seg(18, 10), 0.5, Math.PI * 2 - 1.0);
  mb.part(B('chest'), mantle, S.cape, { pos: [0, 0.1 * H, -0.01 * H], scale: [d.sw * 1.05, 1, 0.82], color: C.cloak, shade: 0.4 });
  mb.part(B('neck'), geo.lathe([[0.05 * R, -0.01 * H], [0.058 * R, 0.0], [0.05 * R, 0.035 * H], [0.042 * R, 0.05 * H]], mb.seg(14, 8)), S.metal, { color: C.steelDark });
}

/** Patched, mismatched plate: one brass pauldron and one of steel lames, leather patches, a riveted repair, belt. */
function patchedArmor(mb: ModelBuilder, d: HumanoidDims, S: KnightSurfaces, C: Colors): void {
  const H = d.H, R = d.r;
  const B = (n: string) => `${d.p}${n}`;
  // left: an old rounded brass pauldron (taken from another seeker's armor)
  mb.part(B('arm_l'), geo.lathe([[0, 0.05 * H], [0.05 * R, 0.046 * H], [0.08 * R, 0.02 * H], [0.088 * R, -0.01 * H], [0.084 * R, -0.03 * H]], mb.seg(14, 8)), S.metal, { pos: [0.012 * H, 0.0, 0], rot: [0, 0, 14], scale: [1, 1, 0.92], color: C.brass, shade: 0.3 });
  mb.part(B('arm_l'), geo.torus(0.085 * R, 0.004 * H, 4, mb.seg(16, 8)), S.metal, { pos: [0.012 * H, -0.03 * H, 0], rot: [90, 0, 14], color: C.gold });
  // right: three steel lames
  for (let k = 0; k < 3; k++) {
    mb.part(B('arm_r'), geo.plate(0.15 * R, 0.044 * H, 0.08 * R, 0.007 * R, 8, 1), S.metal, { pos: [-0.026 * H, 0.018 * H - k * 0.026 * H, 0], rot: [0, -90, -(10 + k * 9)], color: shade(C.steel, 1.02 - k * 0.07) });
  }
  // breastplate repairs: a leather patch with stitches and a riveted steel square of a different temper
  mb.part(B('chest'), geo.plate(0.07 * R, 0.06 * H, 0.1 * R, 0.004 * R, 5, 1), S.dark, { pos: [0.03 * H, 0.01 * H, 0.074 * R], rot: [0, 18, -8], color: C.patch });
  mb.part(B('chest'), geo.bevelBox(0.05 * R, 0.042 * H, 0.008 * R, 0.003 * R), S.metal, { pos: [-0.026 * H, -0.035 * H, 0.083 * R], rot: [0, -14, 6], color: shade(C.steel, 0.82) });
  for (const [x, y] of [[-0.044, -0.017], [-0.01, -0.017], [-0.044, -0.053], [-0.01, -0.053]] as const) {
    mb.part(B('chest'), geo.ellipsoid(0.0035 * H, 0.0035 * H, 0.002 * H, 5, 4), S.metal, { pos: [x * H, y * H, 0.088 * R], color: C.brass });
  }
  // baldric across the chest and a wide belt with a pouch
  mb.part(B('chest'), geo.torus(0.11 * R, 0.006 * H, 4, mb.seg(20, 10)), S.dark, { pos: [0, -0.02 * H, 0.004 * H], rot: [90, 34, 0], scale: [d.sw, 1, 0.8], color: C.leather });
  mb.part(B('hips'), geo.torus(0.1 * R, 0.009 * H, 4, mb.seg(20, 10)), S.dark, { pos: [0, 0.03 * H, 0], rot: [90, 0, 0], scale: [1, 0.85, 1], color: C.leather });
  mb.part(B('hips'), geo.bevelBox(0.03 * H, 0.03 * H, 0.016 * H, 0.004 * H), S.dark, { pos: [-0.05 * H, 0.012 * H, 0.06 * R], rot: [0, -30, 0], color: C.leatherDark });
  mb.part(B('hips'), geo.bevelBox(0.022 * H, 0.012 * H, 0.008 * H, 0.002 * H), S.metal, { pos: [0, 0.03 * H, 0.1 * R], color: C.brass });
  // tasset skirt of travel-worn cloth over the faulds
  mb.part(B('hips'), geo.lathe([[0.095 * R, 0.01 * H], [0.11 * R, -0.05 * H], [0.12 * R, -0.1 * H]], mb.seg(16, 8), 0.4, Math.PI * 2 - 0.8), S.cape, { pos: [0, 0, 0], scale: [1, 1, 0.85], color: C.cloakDark, shade: 0.5 });
}

/** Brando del Viandante on the right grip: slim longsword, downturned quillons, the fuller engraved with roads. */
function longsword(mb: ModelBuilder, d: HumanoidDims, S: KnightSurfaces, C: Colors): void {
  const H = d.H;
  const hand = `${d.p}hand_r`;
  const gy = -0.045 * H, gz = 0.012 * H;
  const L = 0.5 * H, w = 0.032 * H, grip = 0.12 * H;
  const outline: [number, number][] = [[-w / 2, 0], [-w * 0.46, L * 0.82], [-w * 0.2, L * 0.96], [0, L], [w * 0.2, L * 0.96], [w * 0.46, L * 0.82], [w / 2, 0]];
  const blade = geo.blade(outline, 0.006 * H, 0.0022 * H).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  mb.part(hand, blade, S.metal, { pos: [0, gy, gz + 0.03 * H], color: '#d7dcdc' });
  // the roads: a long fuller line with branching tracks, faint light (both faces)
  for (const sx of [-1, 1]) {
    mb.part(hand, geo.bevelBox(0.0014 * H, 0.0042 * H, L * 0.74, 0.0006 * H, 1), S.bladeGlow, { pos: [sx * 0.0031 * H, gy, gz + 0.03 * H + L * 0.42], color: C.road });
    for (let k = 0; k < 5; k++) {
      const z = gz + 0.03 * H + L * (0.12 + k * 0.14);
      const side = k % 2 ? 1 : -1;
      mb.part(hand, geo.bevelBox(0.0012 * H, 0.0032 * H, L * 0.07, 0.0005 * H, 1), S.bladeGlow, { pos: [sx * 0.0031 * H, gy + side * 0.006 * H, z + L * 0.03], rot: [side * 24, 0, 0], color: C.road });
    }
  }
  // cross-guard with downturned quillons, grip wraps, a disc pommel
  const guard = geo.tube([[-0.07 * H, 0, -0.012 * H], [-0.035 * H, 0, 0.004 * H], [0, 0, 0.008 * H], [0.035 * H, 0, 0.004 * H], [0.07 * H, 0, -0.012 * H]], (t) => 0.0065 * H * (1 - Math.abs(t - 0.5) * 0.5), { perSeg: 3 });
  mb.part(hand, guard, S.metal, { pos: [0, gy, gz + 0.026 * H], color: C.brass });
  mb.part(hand, geo.lathe([[0.008 * H, -grip * 0.5], [0.0095 * H, 0], [0.008 * H, grip * 0.5]], mb.seg(10, 6)).rotateX(Math.PI / 2), S.dark, { pos: [0, gy, gz - grip * 0.42], color: C.leather });
  mb.part(hand, geo.ellipsoid(0.017 * H, 0.017 * H, 0.009 * H, mb.seg(10, 6), 6), S.metal, { pos: [0, gy, gz - grip * 0.98], color: C.brass });
}

/** Iron lantern (unlit dark glass, an ember that wakes only as he falls) on the last bone of `chain`. */
function lantern(mb: ModelBuilder, bone: string, s: number, S: KnightSurfaces, C: Colors): void {
  mb.part(bone, geo.torus(0.035 * s, 0.009 * s, 4, 10), S.metal, { pos: [0, 0.02 * s, 0], rot: [0, 90, 0], color: C.iron });
  mb.part(bone, geo.lathe([[0.02 * s, -0.02 * s], [0.11 * s, -0.08 * s], [0.12 * s, -0.1 * s], [0.0, -0.1 * s]], 8), S.metal, { color: C.iron, shade: 0.3 });
  mb.part(bone, geo.lathe([[0.075 * s, -0.1 * s], [0.095 * s, -0.2 * s], [0.088 * s, -0.33 * s], [0.06 * s, -0.37 * s]], 8), S.glass, { color: C.glassDark });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    mb.part(bone, geo.bevelBox(0.016 * s, 0.28 * s, 0.016 * s, 0.004 * s), S.metal, { pos: [Math.sin(a) * 0.1 * s, -0.235 * s, Math.cos(a) * 0.1 * s], color: C.iron });
  }
  mb.part(bone, geo.lathe([[0.0, -0.37 * s], [0.1 * s, -0.37 * s], [0.11 * s, -0.4 * s], [0.0, -0.42 * s]], 8), S.metal, { color: C.iron });
  mb.part(bone, geo.ellipsoid(0.035 * s, 0.06 * s, 0.035 * s, 6, 5), S.flame, { pos: [0, -0.27 * s, 0], color: C.ember });
}

function dressKnight(mb: ModelBuilder, d: HumanoidDims, S: KnightSurfaces, C: Colors): void {
  humanoidBody(mb, d, {
    skin: '#7e786c', cloth: C.cloak, clothDark: C.cloakDark, metal: C.steel, trim: C.brass, glow: C.amber,
    armor: 'plate', head: 'none', boots: C.leatherDark, gloves: C.leather,
    cape: { width: 0.5, color: C.cloak, colorEnd: C.cloakDark, ragged: 0.8 }, surfaces: S, bulk: 1.3,
  });
  hoodedHelm(mb, d, S, C);
  patchedArmor(mb, d, S, C);
  longsword(mb, d, S, C);
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Steed gear                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

function steedGear(mb: ModelBuilder, q: QuadrupedDims, S: SurfaceIds, K: KnightSurfaces, C: Colors): void {
  const h = q.h, L = q.L, w = q.w;
  // saddle: worn seat, high cantle, a brass-capped pommel
  mb.part('saddle', geo.bevelBox(0.5 * w * 2, 0.07 * h, 0.34 * L, 0.04, 2), S.dark, { pos: [0, -0.02 * h, 0], color: C.leather, shade: 0.4 });
  mb.part('saddle', geo.plate(0.85 * w, 0.17 * h, 0.3 * w, 0.03, 8, 1), S.dark, { pos: [0, 0.06 * h, -0.17 * L], rot: [-10, 0, 0], color: C.leatherDark });
  mb.part('saddle', geo.plate(0.6 * w, 0.1 * h, 0.22 * w, 0.03, 8, 1), S.dark, { pos: [0, 0.04 * h, 0.15 * L], rot: [12, 180, 0], color: C.leather });
  mb.part('saddle', geo.ellipsoid(0.035 * h, 0.03 * h, 0.035 * h, 8, 6), S.metal, { pos: [0, 0.1 * h, 0.16 * L], color: C.brass });
  // saddle blanket: faded green, a darker stripe, frayed patched corner
  mb.part('spine', geo.plate(2.3 * w, 0.26 * h, 1.02 * w, 0.02, mb.seg(14, 8), 2), S.cloth, { pos: [0, 0.03 * h, -0.02 * L], rot: [0, 90, 0], scale: [1, 1, 1], color: C.blanket, shade: 0.45 });
  mb.part('spine', geo.plate(2.36 * w, 0.03 * h, 1.04 * w, 0.022, mb.seg(14, 8), 1), S.cloth, { pos: [0, -0.07 * h, -0.02 * L], rot: [0, 90, 0], color: C.brass });
  mb.part('spine', geo.plate(0.24 * w, 0.1 * h, 1.05 * w, 0.024, 4, 1), S.cloth, { pos: [0, -0.02 * h, -0.2 * L], rot: [0, 90 + 30, 0], color: C.patch });
  // girth strap
  mb.part('spine', geo.torus(w * 1.04, 0.026, 4, mb.seg(24, 12)), S.dark, { pos: [0, 0.0, 0.1 * L], rot: [0, 90, 0], scale: [0.86, 1, 1], color: C.leatherDark });
  // saddlebags on both flanks and a bedroll behind the cantle
  for (const sx of [-1, 1]) {
    mb.part('body', geo.bevelBox(0.12 * h, 0.2 * h, 0.26 * L, 0.05 * h, 2), S.dark, { pos: [sx * 1.08 * w, 0.0, 0.3 * L], rot: [0, 0, sx * -8], color: C.leather, shade: 0.4 });
    mb.part('body', geo.plate(0.14 * h, 0.06 * h, 0.12 * h, 0.012, 5, 1), S.dark, { pos: [sx * 1.16 * w, 0.08 * h, 0.3 * L], rot: [0, sx * 90, 0], color: C.leatherDark });
  }
  mb.part('body', geo.capsule(0.085 * h, 1.5 * w, mb.seg(10, 6), 3).rotateZ(Math.PI / 2), S.cloth, { pos: [0, 0.27 * h, 0.36 * L], color: C.cloakHem, shade: 0.3 });
  for (const sx of [-0.45, 0.45]) mb.part('body', geo.torus(0.09 * h, 0.012 * h, 4, 10), S.dark, { pos: [sx * w, 0.27 * h, 0.36 * L], rot: [0, 90, 0], color: C.leatherDark });
  // bridle: brow band, nose band and a brass rosette
  mb.part('head', geo.torus(0.085 * h, 0.012 * h, 4, mb.seg(14, 8)), S.dark, { pos: [0, -0.02 * h, 0.08 * h], rot: [-40, 0, 0], scale: [0.8, 1, 1], color: C.leatherDark });
  mb.part('head', geo.torus(0.075 * h, 0.012 * h, 4, mb.seg(14, 8)), S.dark, { pos: [0, -0.13 * h, 0.27 * h], rot: [-60, 0, 0], scale: [0.75, 1, 1], color: C.leatherDark });
  for (const sx of [-1, 1]) mb.part('head', geo.ellipsoid(0.02 * h, 0.02 * h, 0.01 * h, 6, 4), S.metal, { pos: [sx * 0.068 * h, -0.03 * h, 0.1 * h], rot: [0, sx * 90, 0], color: C.brass });
  // the lantern hangs from the pommel on the left (near) side, swinging on a two-link chain
  const s = KNIGHT_H / 1.8 * 0.6;
  lantern(mb, 'lantern_1', s, K, C);
  mb.part('lantern_0', geo.capsule(0.006 * h, 0.12 * h, 4, 2), K.metal, { pos: [0, -0.06 * h, 0], color: C.iron });
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Clips: the chivalrous salute (blade upright before the visor) and the counter stance (Postura del Viandante)      */
/* ---------------------------------------------------------------------------------------------------------------- */

function knightClips(p: string): Record<string, ClipDef> {
  const b = (n: string) => `${p}${n}`;
  return {
    salute: {
      pose: {},
      telegraph: { pose: { [b('arm_r')]: [-58, 18, -16], [b('forearm_r')]: [-78, 0, 0], [b('hand_r')]: [46, 0, 0], [b('head')]: [10, 0, 0], [b('chest')]: [4, 0, 0], [b('arm_l')]: [-6, 0, 10] }, ease: 'inout' },
      active: { pose: { [b('arm_r')]: [-62, 16, -14], [b('forearm_r')]: [-80, 0, 0], [b('hand_r')]: [50, 0, 0], [b('head')]: [16, 0, 0], [b('chest')]: [8, 0, 0], [b('spine')]: [4, 0, 0] }, ease: 'inout' },
      recovery: { pose: { [b('arm_r')]: [-20, 0, -26], [b('forearm_r')]: [-20, 0, 0], [b('hand_r')]: [30, 0, 0] }, blend: 0.6 },
    },
    counter_stance: {
      hold: 1.2,
      pose: {},
      telegraph: { pose: { [b('spine')]: [10, -14, 0], [b('chest')]: [6, -10, 0], [b('arm_r')]: [-62, -24, -30], [b('forearm_r')]: [-58, 0, 0], [b('hand_r')]: [28, 0, 0], [b('arm_l')]: [-58, -30, 26], [b('forearm_l')]: [-70, 0, 0], [b('thigh_l')]: [-34, 0, 8], [b('shin_l')]: [42, 0, 0], [b('thigh_r')]: [18, 0, -8], [b('shin_r')]: [30, 0, 0], [b('head')]: [-4, 10, 0] }, root: [0, -0.12, -0.02], ease: 'out' },
      active: { pose: { [b('spine')]: [12, -16, 0], [b('chest')]: [8, -12, 0], [b('arm_r')]: [-66, -24, -30], [b('forearm_r')]: [-58, 0, 0], [b('hand_r')]: [30, 0, 0], [b('arm_l')]: [-60, -30, 26], [b('forearm_l')]: [-72, 0, 0], [b('thigh_l')]: [-36, 0, 8], [b('shin_l')]: [44, 0, 0], [b('thigh_r')]: [18, 0, -8], [b('shin_r')]: [32, 0, 0], [b('head')]: [-4, 12, 0] }, root: [0, -0.13, -0.02], ease: 'out' },
      recovery: { pose: {}, blend: 0.5 },
    },
  };
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Visual                                                                                                            */
/* ---------------------------------------------------------------------------------------------------------------- */

const EMPTY_FLAGS: ReadonlySet<string> = new Set<string>();
const _look = new THREE.Vector3();

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function newInput(): AnimInput {
  return { anim: 'idle', stage: 'idle', time: 0, dur: 1, speed: 0, scale: 1, flags: undefined, airborne: false, hitFlash: 0 };
}

type Mode = 'mounted' | 'leaving' | 'foot';

class CavaliereVisual implements ActorVisual {
  readonly root = new THREE.Group();
  height: number;
  private mode: Mode | null = null;
  private inpM = newInput();
  private inpF = newInput();
  private leaveT = 0;
  private dropT = 9;
  private hx = 0;
  private hz = 0;
  private hy = 0;
  private hyaw = 0;
  private hspeed = 0;
  private ember = 0;
  private time = 0;
  private readonly riderRoot: THREE.Bone | undefined;
  private readonly saddleLantern: THREE.Bone | undefined;
  private readonly roadM: THREE.MeshStandardMaterial[];
  private readonly flameM: THREE.MeshStandardMaterial | undefined;

  constructor(
    private readonly def: BossDef | MinionDef,
    private readonly mounted: Model,
    private readonly foot: Model,
    private readonly animM: Animator,
    private readonly animF: Animator,
    actor: Actor,
  ) {
    this.root.name = `boss:${def.id}`;
    this.root.add(mounted.root, foot.root);
    this.root.userData.smFx = mounted.fx;
    this.height = mounted.height * 0.55;
    this.riderRoot = mounted.bones.rider_root;
    this.saddleLantern = mounted.bones.lantern_0;
    this.roadM = [mounted.materials.knight_road, foot.materials.knight_road].filter(Boolean) as THREE.MeshStandardMaterial[];
    this.flameM = foot.materials.lantern_flame as THREE.MeshStandardMaterial | undefined;
    this.place(actor, 1);
  }

  private place(actor: Actor, alpha: number): void {
    const px = actor.prevPos.x + (actor.pos.x - actor.prevPos.x) * alpha;
    const py = actor.prevPos.y + (actor.pos.y - actor.prevPos.y) * alpha;
    const pz = actor.prevPos.z + (actor.pos.z - actor.prevPos.z) * alpha;
    this.root.position.set(px, py, pz);
    this.root.rotation.set(0, angleLerp(actor.prevYaw, actor.yaw, alpha), 0);
    this.root.scale.setScalar(Math.max(1e-3, actor.scale * (this.def.model?.scale ?? 1)));
  }

  private fill(inp: AnimInput, actor: Actor, sim: Sim): void {
    inp.anim = actor.anim;
    inp.stage = actor.animStage as AnimStageName;
    inp.time = actor.animTime;
    inp.dur = actor.animDur;
    inp.speed = actor.moveSpeedNow;
    inp.scale = actor.scale * (this.def.model?.scale ?? 1);
    inp.flags = actor.flags;
    inp.airborne = !!actor.airborne && actor.pos.y - sim.groundAt(actor.pos.x, actor.pos.z) > 0.5;
    inp.hitFlash = actor.hitFlash;
  }

  private setMode(m: Mode, actor: Actor): void {
    this.mode = m;
    const riderScale = m === 'mounted' ? 1 : 0.001;
    for (const b of [this.riderRoot, this.saddleLantern]) {
      if (!b) continue;
      b.scale.setScalar(riderScale);
      b.userData.smScaled = riderScale !== 1;
    }
    this.mounted.root.visible = m !== 'foot';
    this.foot.root.visible = m !== 'mounted';
    this.mounted.root.position.set(0, 0, 0);
    this.mounted.root.rotation.set(0, 0, 0);
    if (m === 'leaving') {
      this.leaveT = 0;
      this.dropT = 0;
      this.hx = this.root.position.x;
      this.hz = this.root.position.z;
      this.hy = this.root.position.y;
      this.hyaw = actor.yaw;
      this.hspeed = 0;
    } else this.dropT = 9;
    this.height = (m === 'mounted' ? this.mounted.height : this.foot.height) * 0.55;
  }

  update(actor: Actor, alpha: number, dt: number, sim: Sim): void {
    this.time += dt;
    this.place(actor, alpha);
    const down = actor.flags.has('dismounted');
    if (this.mode === null) this.setMode(down ? 'foot' : 'mounted', actor);
    else if (!down && this.mode !== 'mounted') this.setMode('mounted', actor);
    else if (down && this.mode === 'mounted') this.setMode('leaving', actor);
    const pl = sim.player;
    _look.set(pl.pos.x, pl.pos.y + 1.3 * pl.scale, pl.pos.z);
    this.root.updateMatrixWorld(true);
    if (this.mode === 'mounted') {
      this.fill(this.inpM, actor, sim);
      this.animM.lookTarget = _look;
      this.animM.update(this.inpM, dt);
    } else {
      if (this.mode === 'leaving') this.updateHorse(actor, sim, dt);
      this.updateFoot(actor, sim, dt);
    }
    // the road-lines brighten in the counter stance and the riposte
    const stance = actor.anim === 'counter_stance' || actor.anim === 'riposte' ? 1 : 0;
    const k = 1.1 + stance * (2.2 + 0.6 * Math.sin(this.time * 9));
    for (const m of this.roadM) m.emissiveIntensity += (k - m.emissiveIntensity) * Math.min(1, dt * 6);
    // an ember wakes in the lantern as he falls
    const want = actor.alive ? 0 : 1;
    this.ember += (want - this.ember) * Math.min(1, dt * 0.8);
    if (this.flameM) this.flameM.emissiveIntensity = this.ember * (1.6 + 0.35 * Math.sin(this.time * 13) + 0.2 * Math.sin(this.time * 31));
    // share the renderer's FX uniforms with the knight on foot
    const a = this.mounted.fx, b = this.foot.fx;
    b.flash.value.copy(a.flash.value);
    b.dissolve.value = a.dissolve.value;
    b.crack.value = a.crack.value;
    b.aura.value.copy(a.aura.value);
  }

  private updateFoot(actor: Actor, sim: Sim, dt: number): void {
    // vault down from the saddle on his left side (first 0.55 s after the dismount)
    const fr = this.foot.root;
    if (this.dropT < 0.55) {
      this.dropT += dt;
      const t = Math.min(1, this.dropT / 0.55);
      fr.position.set(1.1 * (1 - t), 1.6 * (1 - t * t) + Math.sin(t * Math.PI) * 0.35, 0);
    } else if (fr.position.x !== 0 || fr.position.y !== 0) fr.position.set(0, 0, 0);
    this.fill(this.inpF, actor, sim);
    this.animF.lookTarget = _look;
    this.animF.update(this.inpF, dt);
  }

  /** The grey horse rears, then gallops away from the player out of the circle; hidden after ~7 s. */
  private updateHorse(actor: Actor, sim: Sim, dt: number): void {
    this.leaveT += dt;
    const t = this.leaveT;
    if (t > 7) {
      this.mode = 'foot';
      this.mounted.root.visible = false;
      return;
    }
    const pl = sim.player;
    const away = Math.atan2(this.hx - pl.pos.x, this.hz - pl.pos.z);
    if (t > 0.8) {
      this.hspeed = Math.min(11, this.hspeed + dt * 7);
      let d = away + 0.5 - this.hyaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.hyaw += Math.max(-dt * 1.6, Math.min(dt * 1.6, d));
      this.hx += Math.sin(this.hyaw) * this.hspeed * dt;
      this.hz += Math.cos(this.hyaw) * this.hspeed * dt;
    }
    this.hy = sim.groundAt(this.hx, this.hz);
    // world -> actor-local (the root follows the knight)
    const ay = this.root.rotation.y, s = this.root.scale.x;
    const dx = this.hx - this.root.position.x, dz = this.hz - this.root.position.z;
    const c = Math.cos(ay), sn = Math.sin(ay);
    this.mounted.root.position.set((dx * c - dz * sn) / s, (this.hy - this.root.position.y) / s, (dx * sn + dz * c) / s);
    this.mounted.root.rotation.set(0, this.hyaw - ay, 0);
    const inp = this.inpM;
    if (t < 0.8) {
      inp.anim = 'rear_stomp';
      inp.stage = 'telegraph';
      inp.time = t;
      inp.dur = 0.8;
      inp.speed = 0;
    } else {
      inp.anim = 'run';
      inp.stage = 'move';
      inp.time = t - 0.8;
      inp.dur = 1;
      inp.speed = this.hspeed;
    }
    inp.scale = s;
    inp.flags = EMPTY_FLAGS;
    inp.airborne = false;
    inp.hitFlash = 0;
    this.animM.lookTarget = null;
    this.mounted.root.updateMatrixWorld(true);
    this.animM.update(inp, dt);
  }

  dispose(): void {
    this.mounted.dispose();
    this.foot.dispose();
    this.root.clear();
  }
}

/* ---------------------------------------------------------------------------------------------------------------- */

const build: BossModelBuilder = (def, ctx, actor: Actor): ActorVisual => {
  const C = colors(ctx, def);
  // --- mounted: dapple-grey horse + seated knight ---
  const mbM = ctx.kit.model(`${def.id}:mounted`, ctx.quality);
  const dm = mountedSkeleton(mbM, {
    horse: { length: HORSE_H * 0.98, height: HORSE_H, legStyle: 'equine', tailBones: 4, width: 0.225 * HORSE_H },
    rider: { height: KNIGHT_H, build: 0.85, shoulders: 1.1, cape: 6, jaw: false },
    seat: 0.225 * HORSE_H * 0.82,
  });
  mbM.chain('lantern', 'saddle', 2, [0.225 * HORSE_H * 1.05, 0.04 * HORSE_H, 0.15 * dm.horse.L], [0, -0.12 * HORSE_H, 0]);
  (mbM.info.springs as unknown[]).push({ chain: 'lantern', stiffness: 22, damping: 2.6, gravity: 5, falloff: 0.2, weight: 1 });
  const SS = standardSurfaces(mbM, 'steed_', { skinDetail: 'fur', skinRough: 0.7, metalRough: 0.5, metalness: 0.6, rim: 1.0 });
  const SKm = knightSurfaces(mbM);
  quadrupedBody(mbM, dm.horse, { body: C.coat, belly: C.coatBelly, dark: C.coatDark, mane: C.mane, hoof: '#24211e', eye: '#1a1614', ears: 'equine', surfaces: SS, bulk: 0.98 });
  steedGear(mbM, dm.horse, SS, SKm, C);
  dressKnight(mbM, dm.rider, SKm, C);
  const mounted = mbM.build();
  mounted.setShadow(ctx.quality !== 'low');
  // --- on foot: the same knight standing, the lantern now at his belt ---
  const mbF = ctx.kit.model(`${def.id}:foot`, ctx.quality);
  const df = humanoidSkeleton(mbF, { height: KNIGHT_H, build: 0.85, shoulders: 1.1, cape: 6, jaw: false });
  mbF.chain('lantern', 'hips', 2, [0.105 * KNIGHT_H, 0.0, 0.02 * KNIGHT_H], [0, -0.07 * KNIGHT_H, 0]);
  (mbF.info.springs as unknown[]).push({ chain: 'lantern', stiffness: 26, damping: 3, gravity: 5, falloff: 0.2, weight: 1 });
  const SKf = knightSurfaces(mbF);
  dressKnight(mbF, df, SKf, C);
  lantern(mbF, 'lantern_1', KNIGHT_H / 1.8 * 0.5, SKf, C);
  mbF.part('lantern_0', geo.capsule(0.004 * KNIGHT_H, 0.05 * KNIGHT_H, 4, 2), SKf.metal, { pos: [0, -0.035 * KNIGHT_H, 0], color: C.iron });
  const foot = mbF.build();
  foot.setShadow(ctx.quality !== 'low');
  const animM = new Animator(mounted, ctx.content, 'mounted', undefined, { clips: knightClips('rider_') });
  const animF = new Animator(foot, ctx.content, 'humanoid', undefined, { clips: knightClips('') });
  return new CavaliereVisual(def, mounted, foot, animM, animF, actor);
};

export default build;
