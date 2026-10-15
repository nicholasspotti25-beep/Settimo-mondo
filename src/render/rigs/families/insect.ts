/**
 * Insect family: Mantide Regina (mantis: raptorial scythe forelegs, upright thorax), Scarabeo Imperiale (beetle: elytra,
 * stag mandibles, buzzing wings), Formica Regina (ant: swollen abdomen), giant wasps and spiders (8 legs: `legPairs: 4`).
 *
 * Skeleton (rest: standing, facing +Z, +X = LEFT):
 *   root -> body (thorax) -> abd_0..2 (abdomen, toward -Z)
 *   body -> chest (prothorax, raised for mantises) -> head -> mand_l / mand_r (mandibles), ant_l_0..2 / ant_r_0..2 (antennae)
 *   body -> leg_l{i}_0..2 / leg_r{i}_0..2 for i = 0 (front) .. pairs-1 (back)   (mantis: the front pair is scythe_l_0..2)
 *   body -> elytra_l / elytra_r (beetle wing cases), wing_l_0 / wing_r_0 (membrane wings)
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { V3 } from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { boneAt, chainThrough, profile, standardSurfaces, type SurfaceIds, type SurfaceStyle } from './common';

export type InsectKind = 'mantis' | 'beetle' | 'ant' | 'wasp' | 'spider';

export interface InsectOpts {
  kind: InsectKind;
  /** Total height (meters) — head top for mantis, back for the others. */
  height: number;
  /** Body length (meters). Default by kind. */
  length?: number;
  legPairs?: number;
}

export interface InsectDims {
  kind: InsectKind;
  h: number;
  L: number;
  r: number;
  abd: string[];
  legs: { name: string; bones: string[]; footY: number; side: number; pair: number }[];
  scythes: string[][];
  antennae: string[][];
  wings: string[];
}

export function insectSkeleton(mb: ModelBuilder, o: InsectOpts): InsectDims {
  const h = o.height, kind = o.kind;
  const L = o.length ?? (kind === 'mantis' ? 1.1 * h : kind === 'beetle' ? 1.5 * h : kind === 'spider' ? 1.3 * h : 1.6 * h);
  const r = (kind === 'mantis' ? 0.12 : kind === 'beetle' ? 0.3 : 0.2) * h;
  const bodyY = kind === 'mantis' ? 0.42 * h : kind === 'beetle' ? 0.5 * h : 0.55 * h;
  mb.bone('body', 'root', [0, bodyY, 0]);
  const body = mb.restPos('body');
  const abdLen = (kind === 'ant' ? 0.55 : kind === 'mantis' ? 0.5 : kind === 'spider' ? 0.5 : 0.35) * L;
  const abd = chainThrough(mb, 'abd', 'body', [0, 1, 2].map((i) => [0, body.y + (kind === 'mantis' ? 0.02 : 0.05) * h * i, body.z - r * 0.8 - (abdLen / 3) * i] as V3));
  // prothorax + head
  const chestP: V3 = kind === 'mantis' ? [0, body.y + 0.32 * h, body.z + 0.12 * h] : [0, body.y + 0.04 * h, body.z + r * 1.0];
  boneAt(mb, 'chest', 'body', chestP);
  const headP: V3 = kind === 'mantis' ? [0, h * 0.92, chestP[2] + 0.06 * h] : [0, chestP[1] + 0.02 * h, chestP[2] + r * 0.9];
  boneAt(mb, 'head', 'chest', headP);
  boneAt(mb, 'mand_l', 'head', [headP[0] + r * 0.3, headP[1] - r * 0.25, headP[2] + r * 0.45]);
  boneAt(mb, 'mand_r', 'head', [headP[0] - r * 0.3, headP[1] - r * 0.25, headP[2] + r * 0.45]);
  mb.socket('mouth', 'head', [0, -r * 0.2, r * 0.6]);
  const antennae: string[][] = [];
  if (kind !== 'spider') {
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      const al = (kind === 'beetle' ? 0.4 : 0.7) * h;
      const pts: V3[] = [0, 1, 2].map((i) => [headP[0] + sx * (r * 0.25 + i * al * 0.12), headP[1] + r * 0.35 + i * al * 0.22, headP[2] + r * 0.3 + i * al * 0.2]);
      antennae.push(chainThrough(mb, `ant_${s}`, 'head', pts));
    }
  }
  // legs
  const pairs = o.legPairs ?? (kind === 'spider' ? 4 : 3);
  const legs: InsectDims['legs'] = [];
  const scythes: string[][] = [];
  for (let i = 0; i < pairs; i++) {
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      const z = (pairs === 1 ? 0 : (0.5 - i / (pairs - 1))) * r * 2.2;
      const reach = (kind === 'spider' ? 0.75 : kind === 'beetle' ? 0.55 : 0.6) * h * (i === pairs - 1 ? 1.1 : 1);
      if (kind === 'mantis' && i === 0) {
        // raptorial foreleg hanging from the prothorax, folded in prayer
        const base = mb.restPos('chest');
        const p0: V3 = [sx * r * 0.7, base.y - 0.04 * h, base.z + 0.02 * h];
        const p1: V3 = [sx * r * 1.0, base.y - 0.02 * h, base.z + 0.26 * h];
        const p2: V3 = [sx * r * 0.9, base.y - 0.3 * h, base.z + 0.32 * h];
        scythes.push(chainThrough(mb, `scythe_${s}`, 'chest', [p0, p1, p2]));
        continue;
      }
      const hip: V3 = [sx * r * 0.8, body.y - 0.02 * h, body.z + z];
      const knee: V3 = [sx * (r + reach * 0.45), body.y + 0.18 * h, body.z + z * 1.3 + (i === 0 ? 0.08 * h : 0)];
      const ankle: V3 = [sx * (r + reach * 0.8), 0.12 * h, body.z + z * 1.6 + (i === 0 ? 0.14 * h : -0.04 * h * i)];
      const bones = chainThrough(mb, `leg_${s}${i}`, 'body', [hip, knee, ankle]);
      legs.push({ name: `leg_${s}${i}`, bones, footY: ankle[1], side: sx, pair: i });
    }
  }
  // wings / elytra
  const wings: string[] = [];
  if (kind === 'beetle' || kind === 'wasp' || kind === 'mantis') {
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      if (kind === 'beetle') boneAt(mb, `elytra_${s}`, 'body', [sx * r * 0.15, body.y + r * 0.85, body.z + r * 0.4]);
      wings.push(boneAt(mb, `wing_${s}_0`, 'body', [sx * r * 0.2, body.y + r * 0.8, body.z + r * 0.3]));
    }
  }
  mb.size = bodyY;
  mb.height = h;
  mb.info.family = mb.info.family ?? 'insect';
  mb.info.rootBone = 'body';
  mb.info.walkSpeed = 1.8 * (h / 3);
  mb.info.runSpeed = 6 * (h / 3);
  mb.info.look = [{ bone: 'head', weight: 0.7, limit: 60 }, ...(kind === 'mantis' ? [{ bone: 'chest', weight: 0.3, limit: 30 }] : [])];
  mb.info.flinch = ['chest', 'head'];
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  for (const s of ['l', 'r']) if (antennae.length) springs.push({ chain: `ant_${s}`, stiffness: 120, damping: 7, gravity: 0.3, falloff: 0.5, weight: 0.8 });
  mb.info.springs = springs;
  return { kind, h, L, r, abd, legs, scythes, antennae, wings };
}

export interface InsectBodyStyle {
  shell: string;
  shellDark?: string;
  belly?: string;
  eye: string;
  /** Chitin highlight (iridescent rim). */
  sheen?: string;
  /** Glowing abdomen/eggs (ant queen). */
  glow?: string;
  /** Mantis crown of petals. */
  crown?: string;
  /** Blade color for scythes / mandibles. */
  blade?: string;
  wing?: string;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

export function insectBody(mb: ModelBuilder, d: InsectDims, s: InsectBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: 'chitin', skinRough: 0.32, rim: 1.2, ...s.surfaceStyle, overrides: { skin: { metalness: 0.25 }, ...(s.surfaceStyle?.overrides ?? {}) } });
  const h = d.h, r = d.r, kind = d.kind;
  const dark = s.shellDark ?? shade(s.shell, 0.5);
  const belly = s.belly ?? mix(s.shell, '#f0e8c0', 0.3);
  const blade = s.blade ?? mix(s.shell, '#f4f0e0', 0.35);
  // thorax
  mb.part('body', geo.ellipsoid(r * 0.95, r * 0.8, r * 1.15, mb.seg(16, 10), mb.seg(12, 8)), S.skin, { color: s.shell, shade: 0.35 });
  // abdomen
  const abdR = kind === 'ant' ? r * 1.5 : kind === 'beetle' ? r * 1.05 : kind === 'spider' ? r * 1.6 : r * 0.9;
  const ab = mb.tube(['body', ...d.abd], S.skin, {
    radius: profile([[0, r * 0.45], [0.25, abdR * 0.85], [0.6, abdR], [0.9, abdR * 0.7], [1, abdR * 0.2]]), tip: abdR * 0.9, start: 0, radial: 14, perBone: 4, blendParent: false,
    color: s.shell, colorEnd: kind === 'ant' && s.glow ? mix(s.shell, s.glow, 0.45) : dark, belly, flatten: [1.05, 0.9],
  });
  // segment rings
  const ringG = geo.torus(abdR * 0.9, abdR * 0.06, 5, mb.seg(20, 10));
  for (let i = 1; i < d.abd.length; i++) mb.part(d.abd[i], ringG.clone(), S.dark, { rot: [0, 0, 0], scale: [1, 0.85, 0.5], color: dark });
  if (s.glow && (kind === 'ant' || kind === 'wasp')) ab.scatter(S.glow, geo.ellipsoid(0.2, 0.2, 0.26, 6, 4), mb.quality === 'low' ? 8 : 18, { t: [0.3, 0.9], theta: [Math.PI * 0.5, Math.PI * 1.5], scale: [0.2, 0.32], seed: 4, color: s.glow, sink: 0.4 });
  // prothorax neck
  mb.tube(['body', 'chest', 'head'], S.skin, { radius: profile([[0, r * 0.55], [0.5, r * (kind === 'mantis' ? 0.32 : 0.6)], [1, r * 0.4]]), tip: r * 0.1, radial: 10, perBone: 4, color: s.shell, colorEnd: s.shell, belly, blendParent: false });
  // head
  const hs = kind === 'mantis' ? 0.75 : kind === 'beetle' ? 0.7 : 0.85;
  const head = geo.ellipsoid(r * hs * 1.1, r * hs * 0.85, r * hs, 14, 10);
  mb.part('head', head, S.skin, { color: s.shell });
  for (const sx of [-1, 1]) {
    const eye = geo.ellipsoid(r * hs * 0.45, r * hs * 0.55, r * hs * 0.45, 10, 8);
    mb.part('head', eye, S.glow, { pos: [sx * r * hs * 0.85, r * hs * 0.3, r * hs * 0.35], color: s.eye });
  }
  if (s.crown) {
    for (let i = 0; i < 7; i++) {
      const a = ((i / 6) - 0.5) * 2.6;
      const pet = geo.doubleSide(geo.leaf(r * 1.1, r * 0.5, 4, 0.1, 0.2));
      mb.part('head', pet, S.cape, { pos: [Math.sin(a) * r * 0.5, r * hs * 0.7, Math.cos(a) * r * 0.2 - r * 0.2], rot: [-20, (a * 180) / Math.PI, 0], color: mix(s.crown, '#ffffff', (i % 2) * 0.25) });
    }
  }
  // mandibles
  const mandL = kind === 'beetle' ? 1.6 * r : 0.6 * r;
  for (const sd of ['l', 'r'] as const) {
    const sx = sd === 'l' ? 1 : -1;
    const pts: V3[] = kind === 'beetle'
      ? [[0, 0, 0], [sx * mandL * 0.35, mandL * 0.15, mandL * 0.4], [sx * mandL * 0.2, mandL * 0.28, mandL * 0.8], [-sx * mandL * 0.12, mandL * 0.3, mandL]]
      : [[0, 0, 0], [sx * mandL * 0.15, -mandL * 0.05, mandL * 0.6], [-sx * mandL * 0.2, -mandL * 0.1, mandL]];
    mb.part(`mand_${sd}`, geo.tube(pts, profile([[0, r * 0.14], [0.7, r * 0.08], [1, r * 0.02]]), { radial: 7, perSeg: 3 }), S.horn, { color: kind === 'beetle' ? dark : blade });
    if (kind === 'beetle') for (let k = 1; k < 4; k++) mb.part(`mand_${sd}`, geo.spike(r * 0.04, r * 0.18, 4), S.horn, { pos: [sx * mandL * 0.25, mandL * (0.1 + k * 0.06), mandL * k * 0.22], rot: [0, 0, sx * 70], color: dark });
  }
  // antennae
  for (const a of d.antennae) mb.tube(a, S.horn, { radius: profile([[0, r * 0.05], [1, r * 0.02]]), tip: r * 0.25, radial: 5, perBone: 3, color: dark, blendParent: false });
  // legs
  for (const l of d.legs) {
    mb.tube(l.bones, S.skin, { radius: profile([[0, r * 0.16], [0.3, r * 0.13], [0.55, r * 0.1], [1, r * 0.06]]), tip: l.footY * 0.9, radial: 8, perBone: 3, color: s.shell, colorEnd: dark, blendParent: false });
    for (let k = 0; k < 3; k++) mb.part(l.bones[1], geo.spike(r * 0.03, r * 0.16, 4), S.horn, { pos: [l.side * r * 0.08, -0.02 * h - k * 0.05 * h, 0], rot: [0, 0, l.side * 110], color: dark });
  }
  // mantis scythes
  for (const sc of d.scythes) {
    mb.tube(sc, S.skin, { radius: profile([[0, r * 0.28], [0.5, r * 0.22], [1, r * 0.12]]), tip: 0.05 * h, radial: 9, perBone: 3, color: s.shell, colorEnd: s.shell, blendParent: false });
    const out = geo.blade([[0, 0], [r * 0.18, 0], [r * 0.32, -0.16 * h], [r * 0.1, -0.42 * h], [0, -0.46 * h], [-r * 0.04, -0.2 * h]], r * 0.07, r * 0.025, 4);
    mb.part(sc[2], out, S.metal, { pos: [0, 0, r * 0.12], rot: [0, 90, 0], color: blade });
    for (let k = 0; k < 4; k++) mb.part(sc[1], geo.spike(r * 0.04, r * 0.2, 4), S.horn, { pos: [0, -r * 0.2, (0.05 + k * 0.05) * h], rot: [180, 0, 0], color: dark });
  }
  // elytra + wings
  if (kind === 'beetle') {
    for (const sd of ['l', 'r'] as const) {
      const sx = sd === 'l' ? 1 : -1;
      const ely = geo.ellipsoid(r * 0.62, r * 0.42, abdR * 1.6, 14, 10);
      const pos = ely.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.15);
      ely.computeVertexNormals();
      mb.part(`elytra_${sd}`, ely, S.metal, { pos: [sx * r * 0.45, 0, -abdR * 1.2], rot: [-6, 0, sx * -8], color: s.sheen ? mix(s.shell, s.sheen, 0.3) : s.shell });
    }
  }
  if (d.wings.length) {
    mb.surface('wingglass', { roughness: 0.2, metalness: 0.1, detail: 'crystal', detailScale: 2, detailStrength: 0.4, rim: 1.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, castShadow: false });
    for (const w of d.wings) {
      const sx = w.endsWith('l_0') ? 1 : -1;
      const wg = geo.doubleSide(geo.leaf(1.0 * h, 0.32 * h, 6, 0, 0));
      mb.part(w, wg, 'wingglass', { rot: [-92, 0, sx * -12], color: s.wing ?? '#d8e8ff' });
    }
  }
  return S;
}
