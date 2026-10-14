/**
 * Shared helpers for rig family builders: radius profiles, standard surfaces, palette-driven color sets.
 */
import * as THREE from 'three';
import type { RadiusFn } from '../../kit/geometry';
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
