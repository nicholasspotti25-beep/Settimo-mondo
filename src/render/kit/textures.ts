/**
 * Small procedural textures generated in code (no image assets): tileable detail maps for the stylized material
 * (RGBA = albedo variation, roughness variation, cavity, crack mask) and sprite textures for FX/overlays.
 * Everything is a DataTexture (works headless), cached by key, generated lazily on first use.
 */
import * as THREE from 'three';
import { fbm2, vnoise2, worley2, hash3i } from './noise';

export type DetailKind =
  | 'noise' | 'metal' | 'scales' | 'bark' | 'cloth' | 'fur' | 'stone' | 'chitin' | 'feather' | 'skin' | 'leather' | 'crystal' | 'lava' | 'mud';

export const DETAIL_KINDS: readonly DetailKind[] = [
  'noise', 'metal', 'scales', 'bark', 'cloth', 'fur', 'stone', 'chitin', 'feather', 'skin', 'leather', 'crystal', 'lava', 'mud',
];

export type SpriteKind = 'dot' | 'spark' | 'star' | 'ring' | 'blob' | 'smoke' | 'warning' | 'glyph' | 'rays' | 'feather' | 'petal' | 'flame' | 'crescent' | 'shard';

const cache = new Map<string, THREE.DataTexture>();

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function makeTex(size: number, data: Uint8Array, repeat: boolean, color: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const W = { f1: 0, f2: 0, id: 0 };

/** Crack mask shared by every detail map (alpha channel): thin cellular edges, tileable. */
function crackMask(u: number, v: number): number {
  worley2(u * 5, v * 5, 5, 911, W);
  const e = W.f2 - W.f1;
  const wobble = vnoise2(u * 40, v * 40, 40, 5) * 0.06;
  return 1 - smooth(0.0, 0.07 + wobble, e);
}

/** Per-kind generator: returns [albedo 0..1 (0.5 neutral), roughness 0..1 (0.5 neutral), cavity 0..1 (1 = open)]. */
function sample(kind: DetailKind, u: number, v: number, out: [number, number, number]): void {
  switch (kind) {
    case 'metal': {
      const brushed = fbm2(u * 64, v * 2, 3, 64, 3);
      const scratch = Math.pow(clamp01(vnoise2(u * 3 + v * 90, v * 4, 0, 7) * 1.0), 18) + Math.pow(clamp01(vnoise2(u * 120, v * 3 - u * 2, 0, 9)), 22);
      const blot = fbm2(u * 4, v * 4, 4, 4, 11);
      out[0] = 0.42 + brushed * 0.12 + blot * 0.18 + scratch * 0.35;
      out[1] = 0.55 + (blot - 0.5) * 0.6 - scratch * 0.5;
      out[2] = 0.75 + blot * 0.25;
      return;
    }
    case 'scales': {
      // offset rows of round scales
      const rows = 10;
      const sv = v * rows;
      const row = Math.floor(sv);
      const su = u * rows + (row % 2) * 0.5;
      const cx = Math.floor(su) + 0.5, cy = row + 0.15;
      const dx = su - cx, dy = (sv - cy) * 1.15;
      const d = Math.hypot(dx, dy);
      const rim = smooth(0.42, 0.55, d);
      const shade = 1 - clamp01(dy + 0.5) * 0.35;
      const n = vnoise2(u * 30, v * 30, 30, 2);
      out[0] = 0.45 + shade * 0.25 - rim * 0.18 + n * 0.08 + hash3i(Math.floor(su), row, 0, 4) * 0.08;
      out[1] = 0.45 + rim * 0.25;
      out[2] = 1 - rim * 0.55;
      return;
    }
    case 'bark': {
      const fib = fbm2(u * 18, v * 1.5, 4, 18, 21);
      const groove = Math.pow(Math.abs(Math.sin((u * 14 + fbm2(u * 3, v * 2, 3, 3, 22) * 2.5) * Math.PI)), 0.35);
      const knots = smooth(0.72, 0.9, fbm2(u * 6, v * 6, 3, 6, 23));
      out[0] = 0.3 + fib * 0.35 + groove * 0.2 - knots * 0.15;
      out[1] = 0.7 + (1 - groove) * 0.2;
      out[2] = 0.35 + groove * 0.65;
      return;
    }
    case 'cloth': {
      const nn = 48;
      const wx = Math.sin(u * nn * Math.PI * 2), wy = Math.sin(v * nn * Math.PI * 2);
      const weave = (Math.floor(u * nn) + Math.floor(v * nn)) % 2 === 0 ? wx * wx : wy * wy;
      const blot = fbm2(u * 5, v * 5, 4, 5, 31);
      out[0] = 0.42 + weave * 0.16 + blot * 0.2;
      out[1] = 0.7 + weave * 0.1;
      out[2] = 0.7 + weave * 0.3;
      return;
    }
    case 'fur': {
      const strands = fbm2(u * 90, v * 6, 3, 90, 41);
      const clump = fbm2(u * 8, v * 3, 3, 8, 42);
      out[0] = 0.28 + strands * 0.45 + clump * 0.2;
      out[1] = 0.85;
      out[2] = 0.4 + strands * 0.6;
      return;
    }
    case 'stone': {
      worley2(u * 6, v * 6, 6, 51, W);
      const cell = W.f2 - W.f1;
      const n = fbm2(u * 12, v * 12, 5, 12, 52);
      out[0] = 0.35 + n * 0.35 + W.id * 0.12;
      out[1] = 0.75 + (n - 0.5) * 0.3;
      out[2] = 0.45 + smooth(0, 0.12, cell) * 0.55;
      return;
    }
    case 'chitin': {
      worley2(u * 4, v * 4, 4, 61, W);
      const n = fbm2(u * 10, v * 10, 3, 10, 62);
      const seam = smooth(0, 0.05, W.f2 - W.f1);
      out[0] = 0.45 + n * 0.15 + W.f1 * 0.15;
      out[1] = 0.3 + n * 0.2;
      out[2] = 0.35 + seam * 0.65;
      return;
    }
    case 'feather': {
      const barb = Math.abs(Math.sin((u * 60 + Math.abs(v - 0.5) * 30) * Math.PI));
      const n = fbm2(u * 6, v * 6, 3, 6, 71);
      out[0] = 0.38 + barb * 0.18 + n * 0.2;
      out[1] = 0.75;
      out[2] = 0.55 + barb * 0.45;
      return;
    }
    case 'skin': {
      const pores = vnoise2(u * 80, v * 80, 80, 81);
      const n = fbm2(u * 6, v * 6, 4, 6, 82);
      out[0] = 0.44 + n * 0.16 - pores * 0.04;
      out[1] = 0.55 + pores * 0.1;
      out[2] = 0.85 + pores * 0.15;
      return;
    }
    case 'leather': {
      worley2(u * 14, v * 14, 14, 91, W);
      const n = fbm2(u * 4, v * 4, 4, 4, 92);
      out[0] = 0.38 + n * 0.25 + W.f1 * 0.08;
      out[1] = 0.6 + n * 0.2;
      out[2] = 0.55 + smooth(0, 0.15, W.f2 - W.f1) * 0.45;
      return;
    }
    case 'crystal': {
      worley2(u * 3, v * 3, 3, 101, W);
      const facet = W.id;
      const edge = smooth(0, 0.06, W.f2 - W.f1);
      out[0] = 0.4 + facet * 0.3 + (1 - edge) * 0.25;
      out[1] = 0.15 + (1 - edge) * 0.2;
      out[2] = 0.8 + edge * 0.2;
      return;
    }
    case 'lava': {
      worley2(u * 5, v * 5, 5, 111, W);
      const crust = smooth(0.02, 0.18, W.f2 - W.f1);
      const n = fbm2(u * 9, v * 9, 4, 9, 112);
      out[0] = 0.25 + crust * 0.35 + n * 0.15;
      out[1] = 0.85;
      out[2] = 0.3 + crust * 0.7;
      return;
    }
    case 'mud': {
      const n = fbm2(u * 7, v * 7, 5, 7, 121);
      const drip = fbm2(u * 20, v * 2, 3, 20, 122);
      out[0] = 0.3 + n * 0.3 + drip * 0.15;
      out[1] = 0.35 + n * 0.4;
      out[2] = 0.5 + n * 0.5;
      return;
    }
    case 'noise':
    default: {
      const n = fbm2(u * 6, v * 6, 5, 6, 131);
      const m = fbm2(u * 24, v * 24, 3, 24, 132);
      out[0] = 0.38 + n * 0.3 + m * 0.1;
      out[1] = 0.45 + (n - 0.5) * 0.4;
      out[2] = 0.7 + m * 0.3;
    }
  }
}

/** Tileable RGBA detail map for the stylized material. */
export function detailTexture(kind: DetailKind, size = 128): THREE.DataTexture {
  const key = `detail:${kind}:${size}`;
  let t = cache.get(key);
  if (t) return t;
  const data = new Uint8Array(size * size * 4);
  const s: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      sample(kind, u, v, s);
      const i = (y * size + x) * 4;
      data[i] = Math.round(clamp01(s[0]) * 255);
      data[i + 1] = Math.round(clamp01(s[1]) * 255);
      data[i + 2] = Math.round(clamp01(s[2]) * 255);
      data[i + 3] = Math.round(crackMask(u, v) * 255);
    }
  }
  t = makeTex(size, data, true, false);
  cache.set(key, t);
  return t;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Sprites (alpha in A, white RGB unless noted)                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

function sdSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function spriteAlpha(kind: SpriteKind, x: number, y: number, seed: number): number {
  // x, y in [-1, 1]
  const r = Math.hypot(x, y);
  switch (kind) {
    case 'dot':
      return Math.pow(clamp01(1 - r), 2.2);
    case 'spark': {
      const core = Math.exp(-r * r * 18);
      const streak = Math.exp(-y * y * 120) * clamp01(1 - Math.abs(x));
      return clamp01(core + streak * 0.8);
    }
    case 'star': {
      const a = Math.atan2(y, x);
      const spikes = Math.pow(Math.abs(Math.cos(a * 2)), 24) * clamp01(1 - r) + Math.pow(Math.abs(Math.cos(a * 2 + Math.PI / 4)), 40) * clamp01(1 - r * 1.6) * 0.5;
      return clamp01(Math.exp(-r * r * 30) + spikes);
    }
    case 'ring':
      return Math.exp(-Math.pow((r - 0.78) * 9, 2)) * (r < 1 ? 1 : 0);
    case 'blob':
      return Math.pow(clamp01(1 - r), 1.6);
    case 'smoke': {
      const n = fbm2((x + 1) * 3 + seed, (y + 1) * 3, 4, 0, 7);
      return clamp01((1 - r) * 1.4 - 0.3 + (n - 0.5) * 0.9) * clamp01(1 - r);
    }
    case 'rays': {
      const a = Math.atan2(y, x);
      const ray = Math.pow(0.5 + 0.5 * Math.sin(a * 9 + Math.sin(a * 3) * 1.5), 6) + Math.pow(0.5 + 0.5 * Math.sin(a * 14 + 1.3), 10) * 0.6;
      return clamp01(ray * clamp01(1 - r) * 1.2 + Math.exp(-r * r * 12));
    }
    case 'feather': {
      // vertical feather: shaft along y
      const w = 0.42 * Math.sin(clamp01((y + 1) / 2) * Math.PI) * (1 - 0.3 * (y + 1) / 2);
      const inside = smooth(w, w - 0.06, Math.abs(x));
      const barbs = 0.75 + 0.25 * Math.sin((y * 30 + Math.abs(x) * 25));
      const shaft = Math.exp(-x * x * 900);
      return clamp01(inside * barbs + shaft) * (y > -0.98 && y < 0.98 ? 1 : 0);
    }
    case 'petal': {
      const yy = (y + 1) / 2;
      const w = 0.55 * Math.pow(Math.sin(clamp01(yy) * Math.PI), 0.7) * (0.6 + 0.4 * yy);
      return smooth(w, w - 0.08, Math.abs(x)) * (yy > 0.02 && yy < 0.98 ? 1 : 0);
    }
    case 'flame': {
      const yy = (y + 1) / 2;
      const w = 0.5 * Math.pow(clamp01(1 - yy), 0.6) * clamp01(yy * 4);
      const n = fbm2(x * 3 + seed, y * 3, 3, 0, 3);
      return clamp01(smooth(w + 0.05, w - 0.15, Math.abs(x) + (n - 0.5) * 0.25));
    }
    case 'crescent': {
      const d1 = Math.hypot(x, y) - 0.8;
      const d2 = Math.hypot(x, y + 0.35) - 0.75;
      const d = Math.max(d1, -d2);
      return smooth(0.06, -0.04, d);
    }
    case 'shard': {
      const d = Math.max(Math.abs(x) * 1.9 + Math.abs(y) * 0.55, Math.abs(y)) - 0.9;
      return smooth(0.05, -0.05, d);
    }
    case 'warning': {
      // colorblind-safe Colpo Rosso icon: bold diamond outline + thick exclamation bar + dot (shape reads without color)
      const dd = Math.abs(x) + Math.abs(y);
      const outer = smooth(0.96, 0.9, dd);
      const innerEdge = smooth(0.7, 0.76, dd);
      const frame = outer * innerEdge;
      const bar = smooth(0.11, 0.07, sdSegment(x, y, 0, -0.05, 0, 0.42));
      const dot = smooth(0.12, 0.08, Math.hypot(x, y + 0.32));
      const fill = outer * (1 - innerEdge) * 0.35;
      return clamp01(frame + bar + dot + fill);
    }
    case 'glyph': {
      // procedural star-script glyph: a few strokes between points on a 3x3 lattice + dots
      let a = 0;
      const pts = [-0.6, 0, 0.6];
      for (let i = 0; i < 4; i++) {
        const ax = pts[Math.floor(hash3i(seed, i, 0, 1) * 3)], ay = pts[Math.floor(hash3i(seed, i, 1, 1) * 3)];
        const bx = pts[Math.floor(hash3i(seed, i, 2, 1) * 3)], by = pts[Math.floor(hash3i(seed, i, 3, 1) * 3)];
        if (ax === bx && ay === by) continue;
        a = Math.max(a, smooth(0.09, 0.04, sdSegment(x, y, ax, ay, bx, by)));
      }
      for (let i = 0; i < 2; i++) {
        const cx = pts[Math.floor(hash3i(seed, i, 5, 1) * 3)], cy = pts[Math.floor(hash3i(seed, i, 6, 1) * 3)];
        a = Math.max(a, smooth(0.16, 0.1, Math.hypot(x - cx, y - cy)));
      }
      return a;
    }
  }
  return 0;
}

/** Square sprite texture (white RGB, shape in alpha). */
export function spriteTexture(kind: SpriteKind, size = 64, seed = 0): THREE.DataTexture {
  const key = `sprite:${kind}:${size}:${seed}`;
  let t = cache.get(key);
  if (t) return t;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2 - 1, py = ((y + 0.5) / size) * 2 - 1;
      const a = spriteAlpha(kind, px, py, seed);
      const i = (y * size + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      data[i + 3] = Math.round(clamp01(a) * 255);
    }
  }
  t = makeTex(size, data, false, false);
  cache.set(key, t);
  return t;
}

/**
 * Atlas of N x N sprites in one texture (one draw call for mixed particle shapes). Cell index = row * n + col.
 * Order: dot, spark, star, ring, smoke, feather, petal, flame, crescent, shard, glyph(0..5).
 */
export const ATLAS_CELLS: readonly SpriteKind[] = ['dot', 'spark', 'star', 'ring', 'smoke', 'feather', 'petal', 'flame', 'crescent', 'shard', 'glyph', 'glyph', 'glyph', 'glyph', 'rays', 'blob'];
export const ATLAS_N = 4;
export function spriteAtlas(cell = 64): THREE.DataTexture {
  const key = `atlas:${cell}`;
  let t = cache.get(key);
  if (t) return t;
  const n = ATLAS_N;
  const size = cell * n;
  const data = new Uint8Array(size * size * 4);
  ATLAS_CELLS.forEach((kind, idx) => {
    const cx = idx % n, cy = Math.floor(idx / n);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        // 1px padding to avoid bleeding
        const px = ((x + 0.5) / cell) * 2.1 - 1.05, py = ((y + 0.5) / cell) * 2.1 - 1.05;
        const a = Math.abs(px) > 1 || Math.abs(py) > 1 ? 0 : spriteAlpha(kind, px, py, idx);
        const i = ((cy * cell + y) * size + cx * cell + x) * 4;
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
        data[i + 3] = Math.round(clamp01(a) * 255);
      }
    }
  });
  t = makeTex(size, data, false, false);
  t.generateMipmaps = true;
  cache.set(key, t);
  return t;
}
export function atlasIndex(kind: SpriteKind, variant = 0): number {
  if (kind === 'glyph') return 10 + (variant % 4);
  const i = ATLAS_CELLS.indexOf(kind);
  return i < 0 ? 0 : i;
}

/** Vertical gradient ramp (1 x N) used by toon ramps and sky-ish fills. */
export function rampTexture(stops: [number, string][], size = 64): THREE.DataTexture {
  const key = `ramp:${JSON.stringify(stops)}:${size}`;
  let t = cache.get(key);
  if (t) return t;
  const data = new Uint8Array(size * size * 4);
  const cols = stops.map(([p, c]) => [p, new THREE.Color(c)] as const);
  const tmp = new THREE.Color();
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    let j = 0;
    while (j < cols.length - 2 && v > cols[j + 1][0]) j++;
    const [p0, c0] = cols[j], [p1, c1] = cols[Math.min(j + 1, cols.length - 1)];
    tmp.copy(c0).lerp(c1, p1 > p0 ? clamp01((v - p0) / (p1 - p0)) : 0);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = Math.round(tmp.r * 255); data[i + 1] = Math.round(tmp.g * 255); data[i + 2] = Math.round(tmp.b * 255); data[i + 3] = 255;
    }
  }
  t = makeTex(size, data, false, true);
  cache.set(key, t);
  return t;
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
