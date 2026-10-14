/**
 * Deterministic noise helpers for procedural textures and geometry displacement (render side only).
 * All functions are allocation-free.
 */

/** Integer hash -> [0, 1). */
export function hash3i(x: number, y: number, z: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 1103515245)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0,1], tileable with integer period (0 = no tiling). */
export function vnoise2(x: number, y: number, period = 0, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const p = period;
  const x0 = p ? ((xi % p) + p) % p : xi, x1 = p ? (((xi + 1) % p) + p) % p : xi + 1;
  const y0 = p ? ((yi % p) + p) % p : yi, y1 = p ? (((yi + 1) % p) + p) % p : yi + 1;
  const a = hash3i(x0, y0, 0, seed), b = hash3i(x1, y0, 0, seed), c = hash3i(x0, y1, 0, seed), d = hash3i(x1, y1, 0, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal 2D value noise in [0,1]; tileable when period > 0 (period doubles per octave). */
export function fbm2(x: number, y: number, octaves = 4, period = 0, seed = 0): number {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise2(x * f, y * f, period ? period * f : 0, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** 3D value noise in [0,1]. */
export function vnoise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const c000 = hash3i(xi, yi, zi, seed), c100 = hash3i(xi + 1, yi, zi, seed);
  const c010 = hash3i(xi, yi + 1, zi, seed), c110 = hash3i(xi + 1, yi + 1, zi, seed);
  const c001 = hash3i(xi, yi, zi + 1, seed), c101 = hash3i(xi + 1, yi, zi + 1, seed);
  const c011 = hash3i(xi, yi + 1, zi + 1, seed), c111 = hash3i(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

export function fbm3(x: number, y: number, z: number, octaves = 3, seed = 0): number {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise3(x * f, y * f, z * f, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/**
 * Tileable 2D Worley (cellular) noise: returns F1 and F2 distances (in cell units) through `out`.
 * `cells` = number of cells per tile.
 */
export function worley2(x: number, y: number, cells: number, seed: number, out: { f1: number; f2: number; id: number }): void {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const px = cx + hash3i(wx, wy, 1, seed), py = cy + hash3i(wx, wy, 2, seed);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash3i(wx, wy, 3, seed);
      } else if (d < f2) f2 = d;
    }
  }
  out.f1 = f1;
  out.f2 = f2;
  out.id = id;
}

/** Small seeded PRNG (mulberry32) for procedural placement in builders. */
export class Prng {
  private s: number;
  constructor(seed = 1) {
    this.s = (seed | 0) || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}

/** Hash a string to a 32-bit seed. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
