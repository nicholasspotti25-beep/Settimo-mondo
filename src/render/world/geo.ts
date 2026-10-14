/**
 * Procedural geometry toolkit for world props and landmarks: primitives, organic displacement, transforms, and `Parts`,
 * an accumulator that merges pieces per material slot (one draw call per slot) with vertex colors and the world
 * attributes (aParams: wind, emissive, cover, ao).
 */
import * as THREE from 'three';
import { worldMat, type WorldMatKind, type WorldMatOpts } from './materials';

export type Slot = 'matte' | 'foliage' | 'gloss' | 'metal' | 'glass' | 'glow' | 'impostor';

export interface PieceOpts {
  /** Solid color or vertical gradient [bottom, top] (sRGB hex). */
  color: string | [string, string];
  /** Wind weight: number, or 'height' for 0 at the bottom of the piece -> value at the top. */
  wind?: number;
  windByHeight?: boolean;
  emissive?: number;
  /** Moss/snow coverage weight 0..1 (default 1 for matte, 0 for others). */
  cover?: number;
  /** Ambient occlusion at the bottom of the piece (0..1, 1 = none). */
  aoBottom?: number;
  /** Random per-vertex color jitter amount (0..0.3). */
  jitter?: number;
  /** World-space y range for gradients/ao/wind (defaults to the piece's own bounds). */
  yRange?: [number, number];
}

interface Piece {
  geo: THREE.BufferGeometry;
  o: PieceOpts;
}

const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Build a transform matrix from position, rotation (x, y, z radians, YXZ order) and scale. */
export function mat4(pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): THREE.Matrix4 {
  _e.set(rot[0], rot[1], rot[2], 'YXZ');
  _q.setFromEuler(_e);
  const s = typeof scale === 'number' ? _s.set(scale, scale, scale) : _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_v.set(pos[0], pos[1], pos[2]), _q, s);
}

/** Matrix that maps +Y to the direction a->b, positioned at a (for limbs, beams, branches). */
export function alignY(a: THREE.Vector3, b: THREE.Vector3, sx = 1, sz = 1): THREE.Matrix4 {
  const dir = _v.subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return new THREE.Matrix4().compose(a.clone(), _q.clone(), new THREE.Vector3(sx, len, sz));
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(Math.floor(x * 73.1) | 0, 374761393) ^ Math.imul(Math.floor(y * 91.7) | 0, 668265263) ^ Math.imul(Math.floor(z * 57.3) | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a: number, b: number, c: number) => hash3(xi + a + 0.5, yi + b + 0.5, zi + c + 0.5, seed);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w) * 2 - 1;
}

/** Organic displacement along normals-from-center (rocks, foliage blobs). Same position -> same offset (no cracks). */
export function displace(geo: THREE.BufferGeometry, amount: number, freq = 1.3, seed = 1, flatten = 0): THREE.BufferGeometry {
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise3(x * freq, y * freq, z * freq, seed) * 0.7 + vnoise3(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3, seed + 7) * 0.3;
    const l = Math.hypot(x, y, z) || 1;
    const k = 1 + n * amount;
    let ny = y * k;
    if (flatten > 0 && ny < 0) ny *= 1 - flatten;
    p.setXYZ(i, (x / l) * l * k, ny, (z / l) * l * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Faceted organic blob (rock, boulder, foliage clump). */
export function blob(r: number, detail = 1, rough = 0.28, seed = 1, flatten = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  return displace(g, rough, 1.4 / Math.max(0.2, r), seed, flatten);
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
/** Cylinder standing on y = 0. */
export function cyl(rTop: number, rBot: number, h: number, seg = 8, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.translate(0, h / 2, 0);
  return g;
}
export function cone(r: number, h: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(0, h / 2, 0);
  return g;
}
export function sphere(r: number, ws = 10, hs = 8): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, ws, hs);
}
export function lathe(points: [number, number][], seg = 12): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}
export function torus(r: number, tube: number, rs = 6, ts = 16, arc = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, rs, ts, arc);
}
export function plane(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}

/** Extruded 2D shape (profile in XY, depth along Z centered). */
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, curveSegments = 8): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return g;
}

/** Arch opening shape: outer rectangle w x h with a round-headed opening (iw wide, ih tall). */
export function archShape(w: number, h: number, iw: number, ih: number, pointed = false): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-iw / 2, 0);
  const spring = ih - iw / 2;
  s.lineTo(-iw / 2, spring);
  if (pointed) {
    s.quadraticCurveTo(-iw / 2, ih, 0, ih + iw * 0.15);
    s.quadraticCurveTo(iw / 2, ih, iw / 2, spring);
  } else {
    s.absarc(0, spring, iw / 2, Math.PI, 0, true);
  }
  s.lineTo(iw / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, 0);
  return s;
}

/** Tube along points (branches, roots, chains). */
export function tube(points: THREE.Vector3[], r: number, radial = 6, segs?: number, rEnd?: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const n = segs ?? Math.max(2, points.length * 3);
  const g = new THREE.TubeGeometry(curve, n, r, radial, false);
  if (rEnd !== undefined && rEnd !== r) {
    // taper: scale ring radius along the tube
    const p = g.attributes.position as THREE.BufferAttribute;
    const ring = radial + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = curve.getPointAt(t);
      const k = (r + (rEnd - r) * t) / r;
      for (let j = 0; j < ring; j++) {
        const idx = i * ring + j;
        p.setXYZ(idx, c.x + (p.getX(idx) - c.x) * k, c.y + (p.getY(idx) - c.y) * k, c.z + (p.getZ(idx) - c.z) * k);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Parts accumulator                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

export class Parts {
  private slots = new Map<Slot, Piece[]>();
  private seed = 1;

  constructor(seed = 1) {
    this.seed = seed;
  }

  /** Add a geometry (consumed) with an optional transform. */
  add(geo: THREE.BufferGeometry, slot: Slot, o: PieceOpts, m?: THREE.Matrix4): this {
    if (m) geo.applyMatrix4(m);
    const l = this.slots.get(slot) ?? [];
    l.push({ geo, o });
    this.slots.set(slot, l);
    return this;
  }

  /** Append all pieces of another Parts transformed by m. */
  merge(other: Parts, m?: THREE.Matrix4): this {
    for (const [slot, list] of other.slots) {
      for (const p of list) this.add(m ? p.geo.clone().applyMatrix4(m) : p.geo.clone(), slot, p.o);
    }
    return this;
  }

  get empty(): boolean {
    return this.slots.size === 0;
  }

  /** Merge pieces per slot into geometries with position, normal, color, aParams. */
  geometries(): Map<Slot, THREE.BufferGeometry> {
    const out = new Map<Slot, THREE.BufferGeometry>();
    for (const [slot, list] of this.slots) {
      let vcount = 0, icount = 0;
      for (const p of list) {
        vcount += p.geo.attributes.position.count;
        icount += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
      }
      const pos = new Float32Array(vcount * 3);
      const nrm = new Float32Array(vcount * 3);
      const col = new Float32Array(vcount * 3);
      const prm = new Float32Array(vcount * 4);
      const idx = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
      let vo = 0, io = 0;
      for (const p of list) {
        const g = p.geo;
        if (!g.attributes.normal) g.computeVertexNormals();
        const P = g.attributes.position as THREE.BufferAttribute;
        const N = g.attributes.normal as THREE.BufferAttribute;
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        const y0 = p.o.yRange ? p.o.yRange[0] : bb.min.y, y1 = p.o.yRange ? p.o.yRange[1] : bb.max.y;
        const dy = Math.max(1e-4, y1 - y0);
        const grad = Array.isArray(p.o.color);
        _c0.set(grad ? (p.o.color as [string, string])[0] : (p.o.color as string));
        _c1.set(grad ? (p.o.color as [string, string])[1] : (p.o.color as string));
        const wind = p.o.wind ?? 0;
        const em = p.o.emissive ?? 0;
        const cov = p.o.cover ?? (slot === 'matte' || slot === 'foliage' ? 1 : 0);
        const aoB = p.o.aoBottom ?? 1;
        const jit = p.o.jitter ?? 0.06;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          const t = Math.min(1, Math.max(0, (y - y0) / dy));
          const o = (vo + i) * 3;
          pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          nrm[o] = N.getX(i); nrm[o + 1] = N.getY(i); nrm[o + 2] = N.getZ(i);
          const j = 1 + (hash3(x, y, z, this.seed) - 0.5) * 2 * jit;
          col[o] = (_c0.r + (_c1.r - _c0.r) * t) * j;
          col[o + 1] = (_c0.g + (_c1.g - _c0.g) * t) * j;
          col[o + 2] = (_c0.b + (_c1.b - _c0.b) * t) * j;
          const q = (vo + i) * 4;
          prm[q] = p.o.windByHeight ? wind * t : wind;
          prm[q + 1] = em;
          prm[q + 2] = cov;
          prm[q + 3] = aoB + (1 - aoB) * Math.min(1, t * 1.6);
        }
        if (g.index) {
          const I = g.index;
          for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
          io += I.count;
        } else {
          for (let i = 0; i < P.count; i++) idx[io + i] = vo + i;
          io += P.count;
        }
        vo += P.count;
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aParams', new THREE.BufferAttribute(prm, 4));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      out.set(slot, geo);
    }
    this.slots.clear();
    return out;
  }

  /** Build meshes (one per slot) under a group. */
  build(opts: Partial<Record<Slot, WorldMatOpts>> = {}, shadows = true): THREE.Group {
    const g = new THREE.Group();
    for (const [slot, geo] of this.geometries()) {
      const mesh = new THREE.Mesh(geo, worldMat(slot as WorldMatKind, opts[slot] ?? {}));
      mesh.castShadow = shadows && slot !== 'glow' && slot !== 'glass';
      mesh.receiveShadow = slot !== 'glow';
      mesh.name = slot;
      if (slot === 'glow' || slot === 'glass') mesh.renderOrder = 2;
      g.add(mesh);
    }
    return g;
  }
}

/** Dispose all geometries under an object (materials are shared and cached). */
export function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

/** Deterministic random helper for builders. */
export class R {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}
