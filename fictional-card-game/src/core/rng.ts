/**
 * Random number source. Gameplay uses the browser's cryptographic generator (genuinely random, unbiased);
 * tests inject a seeded generator. Integers are drawn with rejection sampling so every outcome of `int(n)`
 * has exactly the same probability — no modulo bias.
 */
export interface Rng {
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

const RANGE = 0x1_0000_0000; // 2^32

function uniformFrom(next32: () => number, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`rng.int: invalid bound ${n}`);
  if (n === 1) return 0;
  const limit = RANGE - (RANGE % n);
  for (;;) {
    const x = next32();
    if (x < limit) return x % n;
  }
}

export const cryptoRng: Rng = {
  int(n: number): number {
    const buf = new Uint32Array(1);
    return uniformFrom(() => {
      crypto.getRandomValues(buf);
      return buf[0]!;
    }, n);
  },
};

/** Deterministic generator for tests (sfc32). */
export function seededRng(seed: number): Rng {
  let a = 0x9e3779b9 ^ seed, b = 0x243f6a88 ^ (seed * 31), c = 0xb7e15162 ^ (seed * 17), d = 1;
  const next = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return r >>> 0;
  };
  for (let i = 0; i < 12; i++) next();
  return { int: (n) => uniformFrom(next, n) };
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  if (list.length === 0) throw new Error('pick: empty list');
  return list[rng.int(list.length)]!;
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** `k` distinct elements, uniformly (partial Fisher–Yates). */
export function sample<T>(rng: Rng, list: readonly T[], k: number): T[] {
  if (k > list.length) throw new Error('sample: not enough elements');
  const a = list.slice();
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(a.length - i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, k);
}

/** Fair coin: true/false with exactly 50% each. */
export function coin(rng: Rng): boolean {
  return rng.int(2) === 0;
}
