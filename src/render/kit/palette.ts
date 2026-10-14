/**
 * Palette helper: data/palettes entries (primary, secondary, accent, dark, light, metal, glow) with safe fallbacks
 * and small color operations (mix, shade, saturate) returning hex strings for vertex colors / materials.
 */
import * as THREE from 'three';

export type PaletteKey = 'primary' | 'secondary' | 'accent' | 'dark' | 'light' | 'metal' | 'glow';

const FALLBACK: Record<PaletteKey, string> = {
  primary: '#8a8478', secondary: '#5a4a6a', accent: '#ffd98a', dark: '#2a2430', light: '#f4ece0', metal: '#a8a0a0', glow: '#ffe6b0',
};

const _a = new THREE.Color();
const _b = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

export class Palette {
  readonly id: string;
  private readonly map: Record<string, string>;
  constructor(id: string, map: Record<string, string> | undefined) {
    this.id = id;
    this.map = map ?? {};
  }
  /** Palette color by key (any key present in the YAML, with fallbacks for the standard seven). */
  c(key: PaletteKey | string): string {
    return this.map[key] ?? FALLBACK[key as PaletteKey] ?? '#888888';
  }
  get primary(): string { return this.c('primary'); }
  get secondary(): string { return this.c('secondary'); }
  get accent(): string { return this.c('accent'); }
  get dark(): string { return this.c('dark'); }
  get light(): string { return this.c('light'); }
  get metal(): string { return this.c('metal'); }
  get glow(): string { return this.c('glow'); }
}

/** Linear mix of two colors (k = 0 -> a). */
export function mix(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, k: number): string {
  return `#${_a.set(a).lerp(_b.set(b), k).getHexString()}`;
}

/** Multiply lightness (k < 1 darker, > 1 lighter). */
export function shade(c: THREE.ColorRepresentation, k: number): string {
  _a.set(c).getHSL(_hsl);
  _a.setHSL(_hsl.h, _hsl.s, Math.min(1, Math.max(0, _hsl.l * k)));
  return `#${_a.getHexString()}`;
}

/** Multiply saturation. */
export function saturate(c: THREE.ColorRepresentation, k: number): string {
  _a.set(c).getHSL(_hsl);
  _a.setHSL(_hsl.h, Math.min(1, Math.max(0, _hsl.s * k)), _hsl.l);
  return `#${_a.getHexString()}`;
}

/** Shift hue by degrees. */
export function hue(c: THREE.ColorRepresentation, deg: number): string {
  _a.set(c).getHSL(_hsl);
  _a.setHSL((((_hsl.h + deg / 360) % 1) + 1) % 1, _hsl.s, _hsl.l);
  return `#${_a.getHexString()}`;
}

/** Element -> signature color (sparks, hazards, generic VFX). */
export const ELEMENT_COLORS: Record<string, string> = {
  physical: '#ffe6b8', fire: '#ff7a2a', ice: '#9ad8ff', lightning: '#b8e4ff', void: '#9a5aff', light: '#fff1c0', poison: '#8ae04a',
  water: '#5ab8ff', nature: '#7ad86a', spirit: '#a8f0ff', chaos: '#c84aff', blood: '#ff2a3a',
};

export function elementColor(e: string | undefined): string {
  return ELEMENT_COLORS[e ?? 'physical'] ?? ELEMENT_COLORS.physical;
}
