/** Small color helpers. World shaders that run after tone mapping (sky, fog, water) work in display (sRGB) space. */
import * as THREE from 'three';

/** Parse '#rrggbb' into display-space RGB 0..1 (no color management). */
export function srgb(hex: string, out = new THREE.Vector3()): THREE.Vector3 {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Linear (working space) THREE.Color from a hex string, scaled. */
export function lin(hex: string, k = 1): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

/** Display-space vector -> working-space color. */
export function srgbToColor(v: THREE.Vector3, out = new THREE.Color()): THREE.Color {
  return out.setRGB(v.x, v.y, v.z, THREE.SRGBColorSpace);
}

/** Mix two hex colors in sRGB space; returns hex string. */
export function mixHex(a: string, b: string, t: number): string {
  const va = srgb(a), vb = srgb(b);
  va.lerp(vb, t);
  const c = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${c(va.x)}${c(va.y)}${c(va.z)}`;
}

/** Scale a hex color's brightness in sRGB space. */
export function shadeHex(a: string, k: number): string {
  const v = srgb(a).multiplyScalar(k);
  const c = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${c(v.x)}${c(v.y)}${c(v.z)}`;
}
