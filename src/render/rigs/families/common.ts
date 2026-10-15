/**
 * Shared helpers for rig family builders: radius profiles, standard surfaces, palette-driven color sets.
 */
import * as THREE from 'three';
import * as geo from '../../kit/geometry';
import type { RadiusFn, V3 } from '../../kit/geometry';
import type { ModelBuilder, SurfaceSpec } from '../../kit/model';
import type { Palette } from '../../kit/palette';
import { mix, shade } from '../../kit/palette';

/** Piecewise smooth radius profile from [t, r] stops (t ascending in 0..1). */
export function profile(stops: [number, number][]): RadiusFn {
  return (t: number) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, r0] = stops[i], [t1, r1] = stops[i + 1];
      if (t <= t1) {
        const k = (t - t0) / Math.max(1e-6, t1 - t0);
        const s = k * k * (3 - 2 * k);
        return r0 + (r1 - r0) * s;
      }
    }
    return stops[stops.length - 1][1];
  };
}

/** Standard surface ids used by family builders (prefix allows several bodies in one model). */
export interface SurfaceIds {
  skin: string;
  cloth: string;
  metal: string;
  dark: string;
  glow: string;
  cape: string;
  horn: string;
}

export interface SurfaceStyle {
  /** Detail map for skin-like body ('skin', 'scales', 'fur', 'chitin', 'bark', 'stone', 'feather'). */
  skinDetail?: SurfaceSpec['detail'];
  skinRough?: number;
  clothDetail?: SurfaceSpec['detail'];
  metalRough?: number;
  metalness?: number;
  glowIntensity?: number;
  rim?: number;
  toon?: boolean;
  /** Override any surface spec. */
  overrides?: Partial<Record<keyof SurfaceIds, Partial<SurfaceSpec>>>;
}

/** Define the standard surfaces on a builder (idempotent per prefix). Vertex colors carry the actual colors. */
export function standardSurfaces(mb: ModelBuilder, prefix = '', st: SurfaceStyle = {}): SurfaceIds {
  const ids: SurfaceIds = {
    skin: `${prefix}skin`, cloth: `${prefix}cloth`, metal: `${prefix}metal`, dark: `${prefix}dark`, glow: `${prefix}glow`, cape: `${prefix}cape`, horn: `${prefix}horn`,
  };
  const o = st.overrides ?? {};
  const rim = st.rim ?? 0.9;
  mb.surface(ids.skin, { roughness: st.skinRough ?? 0.62, metalness: 0.02, detail: st.skinDetail ?? 'skin', detailScale: 3.2, detailStrength: 0.45, rim, toon: st.toon, ...o.skin });
  mb.surface(ids.cloth, { roughness: 0.92, metalness: 0.0, detail: st.clothDetail ?? 'cloth', detailScale: 6, detailStrength: 0.55, rim: rim * 0.8, toon: st.toon, ...o.cloth });
  mb.surface(ids.metal, { roughness: st.metalRough ?? 0.36, metalness: st.metalness ?? 0.75, detail: 'metal', detailScale: 2.2, detailStrength: 0.6, rim: rim * 1.2, ...o.metal });
  mb.surface(ids.dark, { roughness: 0.7, metalness: 0.1, detail: 'leather', detailScale: 4, detailStrength: 0.5, rim: rim * 0.7, ...o.dark });
  mb.surface(ids.glow, { roughness: 0.4, metalness: 0, emissive: 0xffffff, emissiveIntensity: st.glowIntensity ?? 2.2, emissiveVertexColor: true, detail: null, rim: 0.2, castShadow: false, ...o.glow });
  mb.surface(ids.cape, { roughness: 0.95, metalness: 0, detail: 'cloth', detailScale: 5, detailStrength: 0.5, side: THREE.DoubleSide, rim: rim * 0.7, toon: st.toon, ...o.cape });
  mb.surface(ids.horn, { roughness: 0.45, metalness: 0.05, detail: 'bark', detailScale: 3, detailStrength: 0.5, rim, ...o.horn });
  return ids;
}

/** Color set derived from a palette (bosses) — every family uses these names. */
export interface ColorSet {
  body: string;
  bodyDark: string;
  belly: string;
  cloth: string;
  clothDark: string;
  metal: string;
  metalDark: string;
  trim: string;
  glow: string;
  horn: string;
  eye: string;
}

export function colorsFrom(p: Palette): ColorSet {
  return {
    body: p.primary,
    bodyDark: shade(p.primary, 0.55),
    belly: mix(p.primary, p.light, 0.45),
    cloth: p.secondary,
    clothDark: shade(p.secondary, 0.5),
    metal: p.metal,
    metalDark: shade(p.metal, 0.55),
    trim: p.accent,
    glow: p.glow,
    horn: mix(p.light, p.dark, 0.35),
    eye: p.glow,
  };
}

export const DEG = Math.PI / 180;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Shared creature parts                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface CreatureHeadOpts {
  /** Skull length (meters, along +Z of the head bone). */
  length: number;
  /** Skull width. */
  width: number;
  /** Skull height. */
  height?: number;
  color: string;
  belly?: string;
  eye: string;
  eyeGlow?: boolean;
  /** Eye size multiplier. */
  eyeSize?: number;
  teeth?: boolean;
  /** Horn pairs (dragons 1-2, serpents 0-1). */
  horns?: number;
  hornColor?: string;
  /** Spiky crest along the skull top. */
  crest?: number;
  /** Nostril smoke / glow spots at the snout. */
  nostrilGlow?: boolean;
  /** Snout shape: 'reptile' (long, flat), 'canine', 'beak' (curved hooked beak), 'blunt'. */
  snout?: 'reptile' | 'canine' | 'beak' | 'blunt';
  beakColor?: string;
}

/**
 * Creature head on `bone` (+ lower jaw on `jaw` when given): lathed skull along +Z, jaw, eyes, teeth, horns, crest.
 * Rest: head bone at the back of the skull, snout toward +Z.
 */
export function creatureHead(mb: ModelBuilder, S: SurfaceIds, bone: string, jaw: string | null, o: CreatureHeadOpts): void {
  const L = o.length, W = o.width, Hh = o.height ?? W * 0.8;
  const snout = o.snout ?? 'reptile';
  const prof: [number, number][] = snout === 'beak'
    ? [[0, 0], [0.5, 0.04], [0.56, 0.2], [0.5, 0.42], [0.36, 0.6], [0, 0.62]]
    : snout === 'blunt'
      ? [[0, 0], [0.52, 0.05], [0.56, 0.3], [0.5, 0.62], [0.36, 0.86], [0, 0.92]]
      : snout === 'canine'
        ? [[0, 0], [0.5, 0.05], [0.54, 0.22], [0.42, 0.45], [0.26, 0.72], [0.2, 0.94], [0, 1]]
        : [[0, 0], [0.48, 0.04], [0.52, 0.2], [0.4, 0.42], [0.28, 0.66], [0.22, 0.9], [0.1, 1], [0, 1]];
  const skull = geo.lathe(prof.map(([r, y]) => [r * W, y * L] as [number, number]), mb.seg(14, 8));
  skull.rotateX(Math.PI / 2);
  skull.scale(1, Hh / W, 1);
  // flatten the underside a little so the jaw reads
  mb.part(bone, skull, S.skin, { pos: [0, 0.05 * Hh, -0.05 * L], color: o.color });
  if (snout === 'beak') {
    const beak = geo.tube([[0, 0.12 * Hh, 0.45 * L], [0, 0.1 * Hh, 0.8 * L], [0, -0.02 * Hh, 1.05 * L], [0, -0.22 * Hh, 1.12 * L]], (t) => (1 - t * 0.85) * W * 0.3, { radial: mb.seg(8, 5), perSeg: 3, flatten: [0.65, 1] });
    mb.part(bone, beak, S.horn, { color: o.beakColor ?? '#d8b048' });
  }
  if (jaw) {
    const jl = snout === 'beak' ? 0.75 : 0.92;
    const j = geo.lathe([[0, 0], [0.42 * W, 0.04 * L], [0.4 * W, 0.4 * L], [0.24 * W, 0.8 * L * jl], [0, L * jl]], mb.seg(10, 6), 0, Math.PI);
    j.rotateX(Math.PI / 2);
    j.rotateZ(Math.PI);
    j.scale(1, 0.55 * (Hh / W), 1);
    mb.part(jaw, j, snout === 'beak' ? S.horn : S.skin, { pos: [0, 0, 0], color: snout === 'beak' ? (o.beakColor ?? '#d8b048') : (o.belly ?? o.color) });
    if (o.teeth) {
      const n = mb.quality === 'low' ? 3 : 5;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const z = (0.35 + (i / n) * 0.55) * L;
          const w = (0.36 - (i / n) * 0.18) * W;
          mb.part(bone, geo.spike(0.035 * W, 0.16 * Hh * (i === 0 ? 1.6 : 1), 4), S.horn, { pos: [sx * w, -0.02 * Hh, z], rot: [180, 0, 0], color: '#efe6d2' });
          mb.part(jaw, geo.spike(0.03 * W, 0.12 * Hh, 4), S.horn, { pos: [sx * w * 0.92, 0.02 * Hh, z * 0.95], color: '#e6dcc4' });
        }
      }
    }
  }
  // eyes
  const es = (o.eyeSize ?? 1) * W * 0.12;
  for (const sx of [-1, 1]) {
    const eye = geo.ellipsoid(es, es * 0.75, es * 0.9, 10, 7);
    mb.part(bone, eye, o.eyeGlow ? S.glow : S.dark, { pos: [sx * W * 0.4, 0.28 * Hh, 0.3 * L], rot: [0, sx * 20, 0], color: o.eye });
    // brow ridge
    mb.part(bone, geo.ellipsoid(es * 1.5, es * 0.5, es * 1.4, 8, 5), S.skin, { pos: [sx * W * 0.38, 0.4 * Hh, 0.27 * L], rot: [-12, 0, sx * -15], color: shade(o.color, 0.8) });
    if (o.nostrilGlow) mb.part(bone, geo.ellipsoid(es * 0.35, es * 0.25, es * 0.3, 6, 4), S.glow, { pos: [sx * W * 0.12, 0.16 * Hh, 0.95 * L], color: o.eye });
  }
  for (let h = 0; h < (o.horns ?? 0); h++) {
    for (const sx of [-1, 1]) {
      const len = L * (h === 0 ? 0.9 : 0.55);
      const hg = geo.horn(len, W * (h === 0 ? 0.14 : 0.09), 1.0 + h * 0.4, 0.15, 9, 7);
      mb.part(bone, hg, S.horn, { pos: [sx * W * (0.3 + h * 0.12), 0.4 * Hh, -0.02 * L - h * 0.12 * L], rot: [-115 + h * 25, 0, sx * -(28 + h * 18)], color: o.hornColor ?? '#d8ccb0' });
    }
  }
  const crest = o.crest ?? 0;
  for (let i = 0; i < crest; i++) {
    const k = i / Math.max(1, crest - 1);
    mb.part(bone, geo.spike(W * 0.07, Hh * (0.35 - k * 0.18), 4), S.horn, { pos: [0, 0.45 * Hh - k * 0.1 * Hh, (0.25 - k * 0.5) * L], rot: [-40, 0, 0], color: o.hornColor ?? shade(o.color, 0.6) });
  }
}

/** Row of dorsal spikes/plates along a list of bones (each bone gets `perBone` spikes pointing up/back). */
export function dorsalSpikes(mb: ModelBuilder, surface: string, bones: string[], size: (t: number) => number, color: string, o: { perBone?: number; lean?: number; offsetY?: (t: number) => number; plate?: boolean } = {}): void {
  const n = bones.length;
  const per = o.perBone ?? 1;
  bones.forEach((b, i) => {
    for (let k = 0; k < per; k++) {
      const t = (i + k / per) / Math.max(1, n - 1);
      const s = size(t);
      if (s <= 0.001) continue;
      const g = o.plate ? geo.blade([[-s * 0.45, 0], [s * 0.45, 0], [s * 0.1, s * 0.9], [0, s], [-s * 0.15, s * 0.8]], s * 0.08, s * 0.025, 2) : geo.spike(s * 0.22, s, 5, -s * 0.25);
      if (o.plate) g.rotateY(Math.PI / 2);
      mb.part(b, g, surface, { pos: [0, o.offsetY ? o.offsetY(t) : 0, (k / per) * 0.3 * s], rot: [-(o.lean ?? 30), 0, 0], color });
    }
  });
}

/** Glowing spots (eyes, embers, crystals) as small emissive ellipsoids on a bone. */
export function glowSpots(mb: ModelBuilder, surface: string, bone: string, spots: { pos: V3; r: number }[], color: string): void {
  for (const s of spots) mb.part(bone, geo.ellipsoid(s.r, s.r, s.r, 8, 6), surface, { pos: s.pos, color });
}

/**
 * Create a bone chain `${prefix}_0..n-1` through MODEL-space points (rest rotations stay identity, so clip rotations keep
 * the documented axis convention). Registers the chain under `prefix`.
 */
export function chainThrough(mb: ModelBuilder, prefix: string, parent: string, points: V3[]): string[] {
  const names: string[] = [];
  let par = parent;
  for (let i = 0; i < points.length; i++) {
    const pp = mb.restPos(par);
    const n = `${prefix}_${i}`;
    mb.bone(n, par, [points[i][0] - pp.x, points[i][1] - pp.y, points[i][2] - pp.z]);
    names.push(n);
    par = n;
  }
  mb.namedChain(prefix, names);
  return names;
}

/** Child bone at a MODEL-space point. */
export function boneAt(mb: ModelBuilder, name: string, parent: string, p: V3): string {
  const pp = mb.restPos(parent);
  mb.bone(name, parent, [p[0] - pp.x, p[1] - pp.y, p[2] - pp.z]);
  return name;
}

/** Points along a quadratic Bezier (model space), `n` points excluding the start. */
export function bezierPoints(a: V3, ctrl: V3, b: V3, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1], u * u * a[2] + 2 * u * t * ctrl[2] + t * t * b[2]]);
  }
  return out;
}

/** Head suffixes for 1..5 heads (center first). */
export function headSuffixes(n: number): string[] {
  const k = Math.max(1, Math.min(5, Math.round(n)));
  return k === 1 ? [''] : k === 2 ? ['_l', '_r'] : k === 3 ? ['', '_l', '_r'] : k === 4 ? ['_l', '_r', '_l2', '_r2'] : ['', '_l', '_r', '_l2', '_r2'];
}

/** Lateral side (+1 left, -1 right) and rank (0 center/inner, 1 outer) of a head suffix. */
export function suffixSide(sfx: string): { side: number; rank: number } {
  if (sfx === '_l') return { side: 1, rank: 1 };
  if (sfx === '_r') return { side: -1, rank: 1 };
  if (sfx === '_l2') return { side: 1, rank: 2 };
  if (sfx === '_r2') return { side: -1, rank: 2 };
  return { side: 0, rank: 0 };
}
