/**
 * Prop kind library: every PropScatterDef.kind the world renders, built procedurally as `Parts` (merged per material slot,
 * instanced by PropField). Each kind is authored at real-world size for scale 1 with its base at y = 0.
 * Unknown kinds fall back by name pattern (tree/rock/...) so a typo never leaves a hole, and log a warning in dev.
 */
import * as THREE from 'three';
import { Parts, R, alignY, archShape, blob, box, cone, cyl, extrude, lathe, mat4, sphere, torus, tube } from '../geo';

export interface PropKind {
  variants: number;
  build(r: R, v: number): Parts;
  /** Max draw distance in meters (at high quality). */
  far: number;
  /** Casts shadows (medium/high). */
  shadow?: boolean;
  /** Sits on the water surface instead of the terrain. */
  float?: number;
  /** Sink into the ground (meters at scale 1). */
  sink?: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------------------------------------------------------ */
/* Trees                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

interface TreeSpec {
  height: number;
  r0: number;
  lean: number;
  bark: [string, string];
  leaf?: [string, string];
  branches: number;
  /** Foliage clump radius (0 = bare). */
  clump: number;
  clumps: number;
  droop?: number;
  roots?: number;
  twist?: number;
}

function branchTree(p: Parts, r: R, s: TreeSpec): void {
  const pts: THREE.Vector3[] = [V(0, -0.4, 0)];
  const n = 5;
  let x = 0, z = 0;
  const la = r.range(-Math.PI, Math.PI);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    x += Math.cos(la + Math.sin(t * 5) * (s.twist ?? 0.6)) * s.lean * s.height * 0.12 * t;
    z += Math.sin(la + Math.cos(t * 4) * (s.twist ?? 0.6)) * s.lean * s.height * 0.12 * t;
    pts.push(V(x, s.height * t * 0.82, z));
  }
  const yr: [number, number] = [0, s.height];
  p.add(tube(pts, s.r0, 7, 10, s.r0 * 0.28), 'matte', { color: s.bark, cover: 0.7, aoBottom: 0.55, yRange: yr, jitter: 0.08 });
  // buttress roots
  for (let i = 0; i < (s.roots ?? 0); i++) {
    const a = (i / (s.roots ?? 1)) * Math.PI * 2 + r.range(-0.3, 0.3);
    const L = s.r0 * r.range(2.4, 3.6);
    const root = [V(0, s.r0 * 1.8, 0), V(Math.cos(a) * L * 0.45, s.r0 * 0.7, Math.sin(a) * L * 0.45), V(Math.cos(a) * L, -0.3, Math.sin(a) * L)];
    p.add(tube(root, s.r0 * 0.45, 5, 6, s.r0 * 0.12), 'matte', { color: s.bark, cover: 1, aoBottom: 0.5, yRange: yr });
  }
  // branches and foliage clumps
  const top = pts[pts.length - 1];
  for (let b = 0; b < s.branches; b++) {
    const t = r.range(0.45, 0.92);
    const k = Math.min(n - 1, Math.floor(t * n));
    const o = pts[k].clone().lerp(pts[k + 1], t * n - k);
    const a = (b / s.branches) * Math.PI * 2 + r.range(-0.5, 0.5);
    const len = s.height * r.range(0.22, 0.38) * (1.15 - t * 0.5);
    const up = r.range(0.25, 0.75) - (s.droop ?? 0) * 0.6;
    const mid = o.clone().add(V(Math.cos(a) * len * 0.55, len * up * 0.6, Math.sin(a) * len * 0.55));
    const end = o.clone().add(V(Math.cos(a + r.range(-0.4, 0.4)) * len, len * up, Math.sin(a + r.range(-0.4, 0.4)) * len));
    p.add(tube([o, mid, end], s.r0 * 0.32 * (1.1 - t * 0.4), 5, 5, s.r0 * 0.06), 'matte', { color: s.bark, cover: 0.8, yRange: yr });
    if (s.clump > 0 && s.leaf) {
      const cr = s.clump * r.range(0.75, 1.15);
      p.add(blob(cr, 1, 0.38, r.int(1, 999), 0.35), 'foliage', { color: s.leaf, wind: 0.35, cover: 0.4, yRange: [end.y - cr, end.y + cr], jitter: 0.12 }, mat4([end.x, end.y + cr * 0.15, end.z], [0, r.range(0, 6), 0], [1, 0.72, 1]));
    }
  }
  if (s.clump > 0 && s.leaf) {
    for (let c = 0; c < s.clumps; c++) {
      const cr = s.clump * r.range(0.9, 1.4);
      const a = r.range(0, Math.PI * 2), d = r.range(0, s.clump * 0.9);
      const y = top.y + r.range(-0.2, 0.5) * s.clump;
      p.add(blob(cr, 1, 0.4, r.int(1, 999), 0.3), 'foliage', { color: s.leaf, wind: 0.3, cover: 0.45, yRange: [y - cr, y + cr], jitter: 0.12 }, mat4([top.x + Math.cos(a) * d, y, top.z + Math.sin(a) * d], [0, r.range(0, 6), 0], [1, 0.7, 1]));
    }
  }
}

function conifer(p: Parts, r: R, h: number, w: number, leaf: [string, string], bark: [string, string], tiers: number): void {
  p.add(cyl(w * 0.07, w * 0.12, h * 0.4, 6), 'matte', { color: bark, aoBottom: 0.6 });
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = h * (0.16 + t * 0.7);
    const rad = w * (1 - t * 0.78) * r.range(0.9, 1.1);
    const g = cone(rad, h * 0.32 * (1 - t * 0.35), 8);
    p.add(g, 'foliage', { color: leaf, wind: 0.18 + t * 0.2, cover: 1, yRange: [0, h], jitter: 0.1 }, mat4([r.range(-0.1, 0.1), y, r.range(-0.1, 0.1)], [r.range(-0.06, 0.06), r.range(0, 6), r.range(-0.06, 0.06)]));
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Small helpers                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export function rockPiece(p: Parts, r: R, rad: number, col: [string, string], pos: [number, number, number] = [0, 0, 0], sy = 0.7, detail = 1): void {
  p.add(blob(rad, detail, 0.32, r.int(1, 9999), 0.4), 'matte', { color: col, cover: 1, aoBottom: 0.55, jitter: 0.1 }, mat4([pos[0], pos[1] + rad * sy * 0.55, pos[2]], [r.range(-0.3, 0.3), r.range(0, 6), r.range(-0.3, 0.3)], [r.range(0.9, 1.3), sy, r.range(0.8, 1.1)]));
}

function blade(h: number, w: number, bend: number): THREE.BufferGeometry {
  // tapered blade with 3 segments, bent along +Z
  const pos: number[] = [];
  const idx: number[] = [];
  const seg = 3;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const ww = w * (1 - t * 0.92);
    const z = bend * t * t * h;
    pos.push(-ww / 2, h * t, z, ww / 2, h * t, z);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function leafDisc(rad: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(rad, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function sword(p: Parts, r: R, at: [number, number, number], tilt: [number, number, number], len = 1.3): void {
  const m = mat4(at, tilt);
  p.add(box(0.09, len, 0.02), 'metal', { color: ['#4a4a52', '#9a9aa6'] }, m.clone().multiply(mat4([0, len / 2, 0])));
  p.add(box(0.38, 0.05, 0.06), 'metal', { color: '#5a4a3a' }, m.clone().multiply(mat4([0, len, 0])));
  p.add(cyl(0.025, 0.025, 0.24, 5), 'matte', { color: '#3a2a22', cover: 0 }, m.clone().multiply(mat4([0, len + 0.02, 0])));
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Kinds                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const BARK: [string, string] = ['#2e241e', '#5a4636'];
const LEAF_TWILIGHT: [string, string][] = [['#2c3a22', '#8a8a4a'], ['#33402a', '#a08a5a'], ['#2a3428', '#7a7a6a']];

export const PROP_KINDS: Record<string, PropKind> = {
  twilight_tree: {
    variants: 4, far: 520, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 11);
      branchTree(p, r, { height: r.range(7, 10), r0: 0.36, lean: r.range(0.6, 1.3), bark: BARK, leaf: LEAF_TWILIGHT[v % 3], branches: 5, clump: 1.9, clumps: 3, twist: 1.1 });
      return p;
    },
  },
  giant_tree: {
    variants: 3, far: 900, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 21);
      branchTree(p, r, { height: r.range(34, 44), r0: 2.3, lean: 0.25, bark: ['#1c1814', '#3a2e24'], leaf: ['#141e14', '#3a4a2a'], branches: 8, clump: 7.5, clumps: 5, roots: 7, twist: 0.4 });
      return p;
    },
  },
  oak: {
    variants: 3, far: 600, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 23);
      branchTree(p, r, { height: r.range(9, 12), r0: 0.55, lean: 0.35, bark: BARK, leaf: ['#2a3a1e', '#6a7a3a'], branches: 7, clump: 2.6, clumps: 4, roots: 4 });
      return p;
    },
  },
  pine: {
    variants: 3, far: 600, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 31);
      conifer(p, r, r.range(12, 17), 2.6, ['#16241c', '#2e4430'], ['#2a1e18', '#4a3626'], 6);
      return p;
    },
  },
  fir: {
    variants: 3, far: 600, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 33);
      conifer(p, r, r.range(9, 13), 3.2, ['#1a2a26', '#3a5248'], ['#2a1e18', '#4a3626'], 8);
      return p;
    },
  },
  birch: {
    variants: 3, far: 420, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 37);
      branchTree(p, r, { height: r.range(8, 11), r0: 0.18, lean: 0.25, bark: ['#cfc8bc', '#ece6da'], leaf: ['#5a6a2a', '#c8b64a'], branches: 5, clump: 1.4, clumps: 3 });
      return p;
    },
  },
  dead_tree: {
    variants: 4, far: 520, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 41);
      branchTree(p, r, { height: r.range(6, 11), r0: 0.32, lean: r.range(0.5, 1.4), bark: ['#2a2622', '#5a544c'], branches: 6, clump: 0, clumps: 0, twist: 1.4 });
      return p;
    },
  },
  willow_tree: {
    variants: 3, far: 520, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 43);
      branchTree(p, r, { height: r.range(7, 9), r0: 0.45, lean: 0.8, bark: ['#2a2620', '#4a4232'], leaf: ['#26301e', '#5a6a3a'], branches: 6, clump: 1.6, clumps: 3, droop: 0.4 });
      // hanging strands
      for (let i = 0; i < 22; i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(1.2, 3.6), y = r.range(5.5, 8);
        const L = r.range(2.5, 5);
        p.add(cone(0.18, L, 4), 'foliage', { color: ['#3a4a2a', '#26301e'], wind: 0.9, windByHeight: false, cover: 0 }, mat4([Math.cos(a) * d, y - L, Math.sin(a) * d], [Math.PI, 0, 0]));
      }
      return p;
    },
  },
  reeds: {
    variants: 3, far: 160,
    build: (r, v) => {
      const p = new Parts(v + 51);
      const n = r.int(9, 15);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(0, 0.5), h = r.range(1.2, 2.2);
        p.add(blade(h, 0.07, r.range(0.05, 0.2)), 'foliage', { color: ['#2c3420', '#9a945a'], wind: 1, windByHeight: true, cover: 0 }, mat4([Math.cos(a) * d, 0, Math.sin(a) * d], [0, r.range(0, 6), 0]));
        if (r.next() < 0.35) p.add(cyl(0.045, 0.045, 0.22, 5), 'matte', { color: '#4a2e1e', wind: 1, cover: 0 }, mat4([Math.cos(a) * d, h * 0.86, Math.sin(a) * d]));
      }
      return p;
    },
  },
  fern: {
    variants: 3, far: 140,
    build: (r, v) => {
      const p = new Parts(v + 53);
      const n = r.int(6, 9);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
        const g = blade(r.range(0.8, 1.2), 0.26, 0.9);
        g.rotateX(0.9);
        p.add(g, 'foliage', { color: ['#1e3018', '#5a7a34'], wind: 0.6, windByHeight: true, cover: 0 }, mat4([0, 0.05, 0], [0, a, 0]));
      }
      return p;
    },
  },
  tall_grass: {
    variants: 3, far: 140,
    build: (r, v) => {
      const p = new Parts(v + 55);
      const n = r.int(10, 16);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(0, 0.6);
        p.add(blade(r.range(1.1, 1.9), 0.09, r.range(0.1, 0.35)), 'foliage', { color: ['#3c5426', '#c8b870'], wind: 1, windByHeight: true, cover: 0 }, mat4([Math.cos(a) * d, 0, Math.sin(a) * d], [0, r.range(0, 6), 0]));
      }
      return p;
    },
  },
  mushroom_glow: {
    variants: 3, far: 140,
    build: (r, v) => {
      const p = new Parts(v + 61);
      const hue = ['#7af0d8', '#b89aff', '#ffd27a'][v % 3];
      const n = r.int(3, 6);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, 6.28), d = r.range(0, 0.45), h = r.range(0.15, 0.55), cr = h * r.range(0.4, 0.7);
        p.add(cyl(0.03, 0.05, h, 5), 'matte', { color: '#d8d0c0', cover: 0 }, mat4([Math.cos(a) * d, 0, Math.sin(a) * d]));
        p.add(lathe([[0, cr * 0.5], [cr, 0], [cr * 0.6, cr * 0.35], [0, cr * 0.55]], 8), 'matte', { color: hue, emissive: 0.5, cover: 0 }, mat4([Math.cos(a) * d, h, Math.sin(a) * d]));
      }
      return p;
    },
  },
  flower_glow: {
    variants: 3, far: 120,
    build: (r, v) => {
      const p = new Parts(v + 63);
      const hue = ['#ffe6a8', '#c8b0ff', '#ffb0c8'][v % 3];
      const n = r.int(3, 6);
      for (let i = 0; i < n; i++) {
        const a = r.range(0, 6.28), d = r.range(0, 0.35), h = r.range(0.3, 0.6);
        p.add(cyl(0.012, 0.018, h, 4), 'foliage', { color: '#3a5a2a', wind: 0.8, windByHeight: true, cover: 0 }, mat4([Math.cos(a) * d, 0, Math.sin(a) * d]));
        p.add(sphere(0.06, 6, 4), 'matte', { color: hue, emissive: 0.7, wind: 0.8, cover: 0 }, mat4([Math.cos(a) * d, h, Math.sin(a) * d], [0, 0, 0], [1, 0.6, 1]));
      }
      return p;
    },
  },
  rock: {
    variants: 4, far: 260, shadow: true, sink: 0.15,
    build: (r, v) => {
      const p = new Parts(v + 71);
      rockPiece(p, r, r.range(0.7, 1.1), ['#55524e', '#8a857c']);
      return p;
    },
  },
  boulder: {
    variants: 4, far: 420, shadow: true, sink: 0.3,
    build: (r, v) => {
      const p = new Parts(v + 73);
      rockPiece(p, r, r.range(2, 2.8), ['#4e4b48', '#8a857c'], [0, 0, 0], 0.75, 2);
      if (r.next() < 0.6) rockPiece(p, r, 0.9, ['#55524e', '#8a857c'], [2.2, 0, 0.6]);
      return p;
    },
  },
  cliff_rock: {
    variants: 4, far: 1200, shadow: true, sink: 0.5,
    build: (r, v) => {
      const p = new Parts(v + 75);
      const h = r.range(5, 9);
      p.add(blob(2.2, 2, 0.34, r.int(1, 9999)), 'matte', { color: ['#3e3c3c', '#7a746c'], cover: 1, aoBottom: 0.5, jitter: 0.1 }, mat4([0, h * 0.45, 0], [r.range(-0.15, 0.15), r.range(0, 6), r.range(-0.15, 0.15)], [1.1, h / 4.4, 0.9]));
      rockPiece(p, r, 1.4, ['#3e3c3c', '#6a645c'], [1.9, 0, 0.8]);
      return p;
    },
  },
  pebbles: {
    variants: 3, far: 90, sink: 0.05,
    build: (r, v) => {
      const p = new Parts(v + 77);
      for (let i = 0; i < 6; i++) rockPiece(p, r, r.range(0.08, 0.22), ['#5a5650', '#9a948a'], [r.range(-0.7, 0.7), 0, r.range(-0.7, 0.7)], 0.55, 0);
      return p;
    },
  },
  snowy_rock: {
    variants: 3, far: 300, shadow: true, sink: 0.2,
    build: (r, v) => {
      const p = new Parts(v + 79);
      const rad = r.range(1, 1.8);
      rockPiece(p, r, rad, ['#4a4a50', '#7a7a84']);
      p.add(blob(rad * 0.95, 1, 0.25, r.int(1, 999)), 'matte', { color: ['#d8e2ee', '#ffffff'], cover: 0 }, mat4([0, rad * 0.62, 0], [0, r.range(0, 6), 0], [1.05, 0.32, 0.95]));
      return p;
    },
  },
  obsidian_rock: {
    variants: 3, far: 600, shadow: true, sink: 0.4,
    build: (r, v) => {
      const p = new Parts(v + 81);
      for (let i = 0; i < 3; i++) {
        const h = r.range(2, 6);
        p.add(cone(r.range(0.6, 1.2), h, 5), 'gloss', { color: ['#0e0c12', '#2a2232'] }, mat4([r.range(-1, 1), -0.3, r.range(-1, 1)], [r.range(-0.3, 0.3), r.range(0, 6), r.range(-0.3, 0.3)]));
      }
      return p;
    },
  },
  ruin_column: {
    variants: 4, far: 520, shadow: true, sink: 0.1,
    build: (r, v) => {
      const p = new Parts(v + 91);
      const h = v === 0 ? 7 : r.range(2, 6);
      const col: [string, string] = ['#8a8274', '#cfc6b4'];
      p.add(cyl(0.9, 1.0, 0.5, 10), 'matte', { color: col, cover: 1 });
      p.add(cyl(0.62, 0.68, h, 12), 'matte', { color: col, cover: 1, aoBottom: 0.7 }, mat4([0, 0.5, 0]));
      if (v === 0) p.add(cyl(0.95, 0.7, 0.55, 10), 'matte', { color: col, cover: 1 }, mat4([0, h + 0.5, 0]));
      else p.add(blob(0.66, 1, 0.3, v * 7), 'matte', { color: col, cover: 1 }, mat4([0, h + 0.4, 0], [0, 0, 0], [1, 0.4, 1]));
      if (v >= 2) p.add(cyl(0.62, 0.62, 2.2, 12), 'matte', { color: col, cover: 1 }, mat4([1.7, 0.6, 0.3], [0, r.range(0, 3), Math.PI / 2]));
      return p;
    },
  },
  ruin_arch: {
    variants: 2, far: 700, shadow: true, sink: 0.1,
    build: (r, v) => {
      const p = new Parts(v + 93);
      const w = 7, h = 8;
      const s = archShape(w, h, 4.4, 6.4, v === 1);
      p.add(extrude(s, 1.3, 0.05, 10), 'matte', { color: ['#7a7264', '#c4baa6'], cover: 1, aoBottom: 0.7 });
      if (v === 0) p.add(box(2.2, 1.2, 1.4), 'matte', { color: '#9a917f', cover: 1 }, mat4([-3.4, 0.5, 2], [0.2, 0.6, 0.1]));
      return p;
    },
  },
  ruin_wall: {
    variants: 3, far: 600, shadow: true, sink: 0.2,
    build: (r, v) => {
      const p = new Parts(v + 95);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const h = r.range(1.2, 4.5) * (1 - Math.abs(i - n / 2) / n);
        p.add(box(1.25, h, 1.1), 'matte', { color: ['#7a7264', '#bdb3a0'], cover: 1, aoBottom: 0.7 }, mat4([(i - n / 2) * 1.2, h / 2, r.range(-0.05, 0.05)], [0, r.range(-0.04, 0.04), 0]));
      }
      for (let i = 0; i < 3; i++) p.add(box(r.range(0.4, 0.9), 0.4, 0.5), 'matte', { color: '#8a8272', cover: 1 }, mat4([r.range(-3, 3), 0.15, r.range(1, 2.2)], [r.range(0, 0.4), r.range(0, 6), 0]));
      return p;
    },
  },
  gravestone: {
    variants: 3, far: 200, shadow: true, sink: 0.1,
    build: (r, v) => {
      const p = new Parts(v + 97);
      const s = new THREE.Shape();
      s.moveTo(-0.4, 0);
      s.lineTo(0.4, 0);
      s.lineTo(0.4, 0.9);
      s.absarc(0, 0.9, 0.4, 0, Math.PI, false);
      s.lineTo(-0.4, 0);
      p.add(extrude(s, 0.16, 0.02, 6), 'matte', { color: ['#5a5852', '#8a867c'], cover: 1, aoBottom: 0.6 }, mat4([0, -0.15, 0], [r.range(-0.2, 0.15), 0, r.range(-0.12, 0.12)]));
      if (v === 2) p.add(box(0.12, 0.9, 0.12), 'matte', { color: '#6a665e' }, mat4([0.8, 0.3, 0.3], [0, 0, 0.3]));
      return p;
    },
  },
  seeker_lantern: {
    variants: 2, far: 260, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 101);
      const h = 2.4;
      p.add(cyl(0.05, 0.07, h, 6), 'matte', { color: ['#2a201a', '#4a3a2a'], cover: 0.5 }, mat4([0, 0, 0], [r.range(-0.1, 0.1), 0, r.range(-0.1, 0.1)]));
      p.add(box(0.5, 0.06, 0.06), 'matte', { color: '#3a2c22' }, mat4([0.22, h - 0.05, 0]));
      p.add(cyl(0.12, 0.16, 0.34, 6, true), 'metal', { color: '#3a3a3e', cover: 0 }, mat4([0.42, h - 0.52, 0]));
      p.add(sphere(0.1, 8, 6), 'matte', { color: '#ffd890', emissive: 1.2, cover: 0 }, mat4([0.42, h - 0.36, 0]));
      p.add(sphere(0.32, 8, 6), 'glow', { color: '#6a4a1a' }, mat4([0.42, h - 0.36, 0]));
      return p;
    },
  },
  armor_remains: {
    variants: 3, far: 160, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 103);
      const m: [string, string] = ['#3a3a40', '#7a7a84'];
      p.add(lathe([[0, 0], [0.32, 0.05], [0.36, 0.4], [0.24, 0.62], [0, 0.66]], 10), 'metal', { color: m }, mat4([0, 0.12, 0], [1.3, r.range(0, 6), 0.2]));
      p.add(sphere(0.18, 10, 6, ), 'metal', { color: m }, mat4([0.55, 0.12, 0.2], [0.5, 0, 0.4], [1, 1.1, 1.1]));
      sword(p, r, [-0.6, -0.1, 0.3], [0.25, r.range(0, 6), 0.15]);
      if (v > 0) p.add(torus(0.3, 0.04, 4, 10, Math.PI), 'metal', { color: '#5a4a3a' }, mat4([0.1, 0.05, -0.5], [Math.PI / 2, 0, 0]));
      return p;
    },
  },
  bones: {
    variants: 3, far: 150, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 105);
      const c: [string, string] = ['#a89c80', '#e2d8c0'];
      for (let i = 0; i < 5; i++) p.add(torus(0.55 - i * 0.04, 0.035, 4, 10, Math.PI * 0.85), 'matte', { color: c, cover: 0.5 }, mat4([i * 0.22 - 0.4, 0.05, 0], [0, Math.PI / 2, 0.2]));
      p.add(cyl(0.05, 0.05, 1.3, 5), 'matte', { color: c }, mat4([-0.65, 0.05, 0], [0, 0, Math.PI / 2]));
      p.add(sphere(0.2, 8, 6), 'matte', { color: c }, mat4([0.9, 0.12, 0.3], [0, 0, 0], [1, 0.85, 1.2]));
      return p;
    },
  },
  dragon_bones: {
    variants: 2, far: 800, shadow: true, sink: 0.6,
    build: (r, v) => {
      const p = new Parts(v + 107);
      const c: [string, string] = ['#8a7e66', '#e2d8c0'];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const s = 1 - Math.abs(i - 3) / 9;
        p.add(torus(5 * s, 0.32 * s, 5, 14, Math.PI * 0.9), 'matte', { color: c, cover: 0.6 }, mat4([0, 0, i * 2.4 - 8], [0, 0, 0.1 + r.range(-0.15, 0.15)]));
      }
      const spine = [];
      for (let i = 0; i <= 8; i++) spine.push(V(Math.sin(i * 0.5) * 0.8, 4.6 - Math.abs(i - 3) * 0.35, i * 3 - 9));
      p.add(tube(spine, 0.5, 6, 20, 0.2), 'matte', { color: c, cover: 0.6 });
      p.add(blob(2.2, 1, 0.25, 7), 'matte', { color: c }, mat4([1, 1.2, -13], [0.3, 0.4, 0.2], [1.6, 0.9, 1]));
      return p;
    },
  },
  crystal: {
    variants: 3, far: 300,
    build: (r, v) => {
      const p = new Parts(v + 109);
      const hue = ['#9ad8ff', '#c8a8ff', '#ffd8a0'][v % 3];
      for (let i = 0; i < r.int(4, 7); i++) {
        const h = r.range(0.8, 2.6);
        const g = new THREE.OctahedronGeometry(0.3, 0);
        g.scale(1, h / 0.6, 1);
        p.add(g, 'gloss', { color: ['#3a4a6a', hue], emissive: 0.35 }, mat4([r.range(-0.6, 0.6), h * 0.35, r.range(-0.6, 0.6)], [r.range(-0.5, 0.5), r.range(0, 6), r.range(-0.5, 0.5)]));
      }
      return p;
    },
  },
  ice_spike: {
    variants: 3, far: 600, shadow: true, sink: 0.4,
    build: (r, v) => {
      const p = new Parts(v + 111);
      for (let i = 0; i < r.int(3, 5); i++) {
        const h = r.range(2, 6);
        p.add(cone(r.range(0.3, 0.8), h, 6), 'gloss', { color: ['#6a9ac0', '#e6f4ff'], emissive: 0.05 }, mat4([r.range(-1, 1), -0.3, r.range(-1, 1)], [r.range(-0.35, 0.35), r.range(0, 6), r.range(-0.35, 0.35)]));
      }
      return p;
    },
  },
  giant_clover: {
    variants: 3, far: 300, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 113);
      const h = r.range(3, 5);
      p.add(tube([V(0, 0, 0), V(0.2, h * 0.5, 0.1), V(0, h, 0)], 0.12, 5, 6, 0.08), 'foliage', { color: ['#2e5a24', '#5a8a3a'], wind: 0.4, windByHeight: true, cover: 0 });
      for (let i = 0; i < (v === 2 ? 4 : 3); i++) {
        const a = (i / 3) * Math.PI * 2;
        p.add(leafDisc(1.1, 10), 'foliage', { color: ['#2e6a2a', '#6aa04a'], wind: 0.5, cover: 0 }, mat4([Math.cos(a) * 1.0, h, Math.sin(a) * 1.0], [r.range(-0.3, 0.1), a, 0.15], [1, 1, 1.3]));
      }
      return p;
    },
  },
  giant_grass: {
    variants: 3, far: 300,
    build: (r, v) => {
      const p = new Parts(v + 115);
      for (let i = 0; i < r.int(5, 8); i++) {
        const a = r.range(0, 6.28), d = r.range(0, 1);
        p.add(blade(r.range(6, 12), 0.55, r.range(0.15, 0.4)), 'foliage', { color: ['#2a5222', '#9ac05a'], wind: 0.7, windByHeight: true, cover: 0 }, mat4([Math.cos(a) * d, 0, Math.sin(a) * d], [0, r.range(0, 6), 0]));
      }
      return p;
    },
  },
  giant_flower: {
    variants: 3, far: 420, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 117);
      const h = r.range(6, 10);
      const hue = (['#ff8ac0', '#ffd25a', '#b08aff'] as const)[v % 3];
      p.add(tube([V(0, 0, 0), V(0.5, h * 0.5, 0.2), V(0.2, h, 0)], 0.18, 6, 8, 0.12), 'foliage', { color: ['#2a5a24', '#5a8a3a'], wind: 0.35, windByHeight: true, cover: 0 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        p.add(leafDisc(1.1, 8), 'foliage', { color: [hue, '#fff4e0'], wind: 0.35, cover: 0 }, mat4([0.2 + Math.cos(a) * 1.0, h + 0.15, Math.sin(a) * 1.0], [-0.35, -a + Math.PI / 2, 0], [0.6, 1, 1.3]));
      }
      p.add(sphere(0.55, 8, 6), 'matte', { color: '#ffcc4a', emissive: 0.25, cover: 0 }, mat4([0.2, h + 0.25, 0], [0, 0, 0], [1, 0.5, 1]));
      return p;
    },
  },
  giant_mushroom: {
    variants: 3, far: 420, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 119);
      const h = r.range(3, 6), cr = h * r.range(0.45, 0.65);
      p.add(cyl(0.35, 0.5, h, 10), 'matte', { color: ['#cfc4b0', '#efe6d4'], cover: 0, aoBottom: 0.6 });
      p.add(lathe([[0, cr * 0.45], [cr, 0], [cr * 0.92, cr * 0.18], [cr * 0.55, cr * 0.42], [0, cr * 0.5]], 14), 'matte', { color: (['#a83a2a', '#c8a85a', '#7a5ab0'] as const)[v % 3], emissive: 0.08, cover: 0.4 }, mat4([0, h, 0]));
      return p;
    },
  },
  anvil: {
    variants: 2, far: 200, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 121);
      const m: [string, string] = ['#2a2a2e', '#5a5a64'];
      p.add(box(0.7, 0.5, 0.5), 'metal', { color: m }, mat4([0, 0.25, 0]));
      p.add(box(0.4, 0.3, 0.32), 'metal', { color: m }, mat4([0, 0.65, 0]));
      p.add(box(1.3, 0.28, 0.46), 'metal', { color: m }, mat4([0.1, 0.94, 0]));
      p.add(cone(0.2, 0.55, 6), 'metal', { color: m }, mat4([0.95, 0.94, 0], [0, 0, -Math.PI / 2]));
      return p;
    },
  },
  chains: {
    variants: 2, far: 260, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 123);
      p.add(cyl(0.18, 0.24, 4, 6), 'metal', { color: ['#2a2826', '#4a4642'] });
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = 0.3 + t * 3.4, y = 3.7 - Math.sin(t * Math.PI) * 1.6 - t * 3.2;
        p.add(torus(0.16, 0.04, 4, 8), 'metal', { color: '#4a4440' }, mat4([x, Math.max(0.1, y), 0], [0, i % 2 ? Math.PI / 2 : 0, 0.4]));
      }
      return p;
    },
  },
  sword_grave: {
    variants: 3, far: 220, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 125);
      for (let i = 0; i < r.int(2, 5); i++) sword(p, r, [r.range(-0.8, 0.8), -0.25, r.range(-0.8, 0.8)], [r.range(-0.3, 0.3), r.range(0, 6), r.range(-0.3, 0.3)], r.range(1.1, 1.6));
      return p;
    },
  },
  ember_vent: {
    variants: 2, far: 260, sink: 0.1,
    build: (r, v) => {
      const p = new Parts(v + 127);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        rockPiece(p, r, r.range(0.35, 0.6), ['#1e1a1a', '#3a302c'], [Math.cos(a) * 0.9, -0.1, Math.sin(a) * 0.9], 0.6, 0);
      }
      p.add(sphere(0.7, 10, 6), 'matte', { color: ['#ff3a0a', '#ffb04a'], emissive: 1.4, cover: 0 }, mat4([0, -0.3, 0], [0, 0, 0], [1, 0.4, 1]));
      p.add(sphere(1.4, 10, 6), 'glow', { color: '#5a1a04' }, mat4([0, 0.2, 0], [0, 0, 0], [1, 0.6, 1]));
      return p;
    },
  },
  marble_pillar: {
    variants: 2, far: 600, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 129);
      const h = 9;
      const c: [string, string] = ['#cfc8bc', '#f6f2ea'];
      p.add(box(2.2, 0.5, 2.2), 'gloss', { color: c }, mat4([0, 0.25, 0]));
      p.add(cyl(0.8, 0.85, h, 16), 'gloss', { color: c }, mat4([0, 0.5, 0]));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.add(cyl(0.09, 0.09, h, 4), 'gloss', { color: '#bdb6aa' }, mat4([Math.cos(a) * 0.82, 0.5, Math.sin(a) * 0.82]));
      }
      p.add(box(2.2, 0.6, 2.2), 'gloss', { color: c }, mat4([0, h + 0.8, 0]));
      if (v === 1) p.add(box(0.8, 0.8, 0.8), 'glow', { color: '#6a5a2a' }, mat4([0, h + 1.6, 0], [0.6, 0.6, 0]));
      return p;
    },
  },
  statue: {
    variants: 3, far: 520, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 131);
      const c: [string, string] = ['#7a7468', '#c8bfae'];
      p.add(box(2, 1, 2), 'matte', { color: c, cover: 1 }, mat4([0, 0.5, 0]));
      p.add(lathe([[0, 0], [0.9, 0], [0.75, 1.2], [0.55, 2.6], [0.62, 3.2], [0.3, 3.5], [0, 3.55]], 12), 'matte', { color: c, cover: 1, aoBottom: 0.8 }, mat4([0, 1, 0]));
      if (v !== 2) p.add(sphere(0.42, 10, 8), 'matte', { color: c, cover: 1 }, mat4([0, 4.95, 0.05]));
      if (v === 0) sword(p, r, [0.2, 1.2, 0.75], [0, 0, 0], 2.2);
      if (v === 1) p.add(blob(0.6, 1, 0.3, 4), 'matte', { color: c, cover: 1 }, mat4([1.6, 0.25, 0.8], [0.4, 0, 0.6], [1, 0.6, 1]));
      return p;
    },
  },
  hanging_garden: {
    variants: 2, far: 420, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 133);
      p.add(box(4, 0.8, 2.2), 'gloss', { color: ['#cfc8bc', '#f2ede4'] }, mat4([0, 3.6, 0]));
      p.add(blob(1.6, 1, 0.35, 5), 'foliage', { color: ['#2e5a2a', '#7ab05a'], wind: 0.2, cover: 0 }, mat4([0, 4.3, 0], [0, 0, 0], [1.3, 0.5, 0.7]));
      for (let i = 0; i < 12; i++) {
        const L = r.range(1.2, 3.4);
        p.add(cone(0.12, L, 4), 'foliage', { color: ['#3a6a2a', '#2a4a22'], wind: 0.9, cover: 0 }, mat4([r.range(-1.9, 1.9), 3.3 - L, r.range(-1, 1)], [Math.PI, 0, 0]));
      }
      for (let i = 0; i < 6; i++) p.add(sphere(0.12, 6, 4), 'matte', { color: '#ffe0f0', emissive: 0.4, cover: 0 }, mat4([r.range(-1.8, 1.8), r.range(1.5, 3.2), r.range(-1, 1)]));
      return p;
    },
  },
  cloud_puff: {
    variants: 3, far: 700,
    build: (r, v) => {
      const p = new Parts(v + 135);
      for (let i = 0; i < 6; i++) p.add(blob(r.range(1.2, 2.4), 1, 0.2, r.int(1, 999)), 'matte', { color: ['#d8d0e4', '#ffffff'], emissive: 0.12, cover: 0 }, mat4([r.range(-2.5, 2.5), r.range(0.3, 1.6), r.range(-1.6, 1.6)], [0, 0, 0], [1, 0.7, 1]));
      return p;
    },
  },
  void_shard: {
    variants: 3, far: 520,
    build: (r, v) => {
      const p = new Parts(v + 137);
      for (let i = 0; i < 3; i++) {
        const g = new THREE.OctahedronGeometry(r.range(0.4, 1.0), 0);
        g.scale(0.5, 2.2, 0.5);
        const at: [number, number, number] = [r.range(-1.2, 1.2), r.range(0.8, 3.2), r.range(-1.2, 1.2)];
        const rot: [number, number, number] = [r.range(-0.6, 0.6), r.range(0, 6), r.range(-0.6, 0.6)];
        p.add(g, 'gloss', { color: ['#0a0812', '#2a1e44'], emissive: 0.15 }, mat4(at, rot));
        const h = new THREE.OctahedronGeometry(1, 0);
        h.scale(0.5 * 0.55, 2.2 * 0.55, 0.5 * 0.55);
        p.add(h, 'glow', { color: '#3a2a7a' }, mat4(at, rot, 1.5));
      }
      return p;
    },
  },
  lily_pad: {
    variants: 3, far: 120, float: 0.02,
    build: (r, v) => {
      const p = new Parts(v + 139);
      for (let i = 0; i < r.int(2, 4); i++) {
        const g = new THREE.CircleGeometry(r.range(0.25, 0.5), 9, 0.3, Math.PI * 2 - 0.3);
        g.rotateX(-Math.PI / 2);
        p.add(g, 'foliage', { color: ['#2a4a22', '#4a6a2a'], wind: 0, cover: 0 }, mat4([r.range(-0.7, 0.7), 0.01 * i, r.range(-0.7, 0.7)], [0, r.range(0, 6), 0]));
      }
      if (v === 1) p.add(sphere(0.1, 6, 4), 'matte', { color: '#f0e0ff', emissive: 0.5, cover: 0 }, mat4([0, 0.08, 0], [0, 0, 0], [1, 0.6, 1]));
      return p;
    },
  },
  soul_light: {
    variants: 2, far: 400, float: 0.6,
    build: (r, v) => {
      const p = new Parts(v + 141);
      p.add(sphere(0.12, 8, 6), 'matte', { color: '#e8f4ff', emissive: 1.5, cover: 0 });
      p.add(sphere(0.55, 8, 6), 'glow', { color: v ? '#2a4a6a' : '#3a3a6a' });
      return p;
    },
  },
  log: {
    variants: 2, far: 260, shadow: true, sink: 0.25,
    build: (r, v) => {
      const p = new Parts(v + 143);
      const L = r.range(4, 7);
      p.add(tube([V(-L / 2, 0.35, 0), V(0, 0.4, r.range(-0.3, 0.3)), V(L / 2, 0.3, 0)], 0.38, 7, 6, 0.3), 'matte', { color: BARK, cover: 1 });
      p.add(cone(0.12, 1.2, 5), 'matte', { color: BARK, cover: 1 }, mat4([r.range(-1, 1), 0.6, 0], [0.4, 0, -0.8]));
      return p;
    },
  },
  stump: {
    variants: 2, far: 200, shadow: true,
    build: (r, v) => {
      const p = new Parts(v + 145);
      p.add(cyl(0.45, 0.6, r.range(0.5, 1.1), 9), 'matte', { color: BARK, cover: 1, aoBottom: 0.6 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * 6.28 + r.range(-0.3, 0.3);
        p.add(tube([V(0, 0.4, 0), V(Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7), V(Math.cos(a) * 1.1, -0.15, Math.sin(a) * 1.1)], 0.16, 5, 4, 0.05), 'matte', { color: BARK, cover: 1 });
      }
      return p;
    },
  },
};

/** Fallback for unknown kinds by name pattern. */
export function propKind(kind: string): PropKind {
  const k = PROP_KINDS[kind];
  if (k) return k;
  const fb = /giant/.test(kind) ? 'giant_tree'
    : /pine|fir|conifer/.test(kind) ? 'pine'
    : /tree|trunk|oak/.test(kind) ? 'twilight_tree'
    : /reed|cattail/.test(kind) ? 'reeds'
    : /grass/.test(kind) ? 'tall_grass'
    : /flower|bloom/.test(kind) ? 'flower_glow'
    : /mushroom|fung/.test(kind) ? 'mushroom_glow'
    : /column|pillar/.test(kind) ? 'ruin_column'
    : /ruin|wall/.test(kind) ? 'ruin_wall'
    : /bone|skull/.test(kind) ? 'bones'
    : /crystal|gem/.test(kind) ? 'crystal'
    : /ice/.test(kind) ? 'ice_spike'
    : /cliff|spire/.test(kind) ? 'cliff_rock'
    : 'rock';
  if (import.meta.env?.DEV) console.warn(`[world] unknown prop kind '${kind}', using '${fb}'`);
  return PROP_KINDS[fb];
}

/** Every kind the library defines (documented in docs/WORLD_KIT.md). */
export const PROP_KIND_IDS = Object.keys(PROP_KINDS);

/** Matrix helper for a single prop placed upright. */
export function propMatrix(x: number, y: number, z: number, yaw: number, scale: number, tilt = 0, tiltDir = 0): THREE.Matrix4 {
  return mat4([x, y, z], [Math.cos(tiltDir) * tilt, yaw, Math.sin(tiltDir) * tilt], scale);
}

export { alignY };
