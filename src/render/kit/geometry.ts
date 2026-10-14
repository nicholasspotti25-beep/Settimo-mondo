/**
 * Procedural geometry builders (pure functions -> BufferGeometry with position/normal/uv).
 * All lengths in meters. Shapes are built in a local frame: +Y up, +Z forward, +X = left (Three.js object space).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fbm3, Prng } from './noise';

export type V3 = [number, number, number];
export type RadiusFn = number | ((t: number) => number);

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function radiusAt(r: RadiusFn, t: number): number {
  return typeof r === 'number' ? r : r(t);
}

/** Apply translation / rotation (degrees, XYZ) / scale to a geometry in place. Returns it. */
export function xform(geo: THREE.BufferGeometry, pos?: V3, rotDeg?: V3, scale?: V3 | number): THREE.BufferGeometry {
  _p.set(pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0);
  _q.setFromEuler(_e.set((rotDeg?.[0] ?? 0) * DEG, (rotDeg?.[1] ?? 0) * DEG, (rotDeg?.[2] ?? 0) * DEG));
  if (typeof scale === 'number') _s.setScalar(scale);
  else _s.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Ensure an index exists (merging needs indexed geometry). */
export function ensureIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) return geo;
  const n = geo.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/** Fill (or create) a vertex color attribute with one color. */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Vertex color gradient along an axis (0=x,1=y,2=z) between two colors over [min,max] (auto range when omitted). */
export function gradient(geo: THREE.BufferGeometry, axis: 0 | 1 | 2, c0: THREE.ColorRepresentation, c1: THREE.ColorRepresentation, min?: number, max?: number): THREE.BufferGeometry {
  const a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let lo = min ?? Infinity, hi = max ?? -Infinity;
  if (min === undefined || max === undefined) {
    for (let i = 0; i < pos.count; i++) {
      const v = pos.getComponent(i, axis);
      if (min === undefined) lo = Math.min(lo, v);
      if (max === undefined) hi = Math.max(hi, v);
    }
  }
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = hi > lo ? Math.min(1, Math.max(0, (pos.getComponent(i, axis) - lo) / (hi - lo))) : 0;
    t.copy(a).lerp(b, k);
    arr[i * 3] = t.r; arr[i * 3 + 1] = t.g; arr[i * 3 + 2] = t.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Multiply existing vertex colors by an ambient-occlusion-like factor from height (darker near `y0`). */
export function shadeByHeight(geo: THREE.BufferGeometry, y0: number, y1: number, dark = 0.55): THREE.BufferGeometry {
  if (!geo.attributes.color) paint(geo, 0xffffff);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / Math.max(1e-4, y1 - y0)));
    const f = dark + (1 - dark) * k;
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return geo;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Primitives                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export function ellipsoid(rx: number, ry: number, rz: number, ws = 16, hs = 12): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
}

/** Capsule along +Y, centered. */
export function capsule(r: number, len: number, radial = 12, cap = 5): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len), cap, radial);
}

/** Lathe around +Y from a profile of [radius, y] points (bottom to top). */
export function lathe(profile: [number, number][], segments = 16, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  g.computeVertexNormals();
  return g;
}

/** Rounded (beveled) box centered at origin. */
export function bevelBox(w: number, h: number, d: number, radius = 0.05, segments = 2): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
}

/** Cone/spike pointing +Y with base at y=0. */
export function spike(r: number, h: number, radial = 7, bendZ = 0): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, radial, 3, false).translate(0, h / 2, 0);
  if (bendZ) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = pos.getY(i) / h;
      pos.setZ(i, pos.getZ(i) + bendZ * k * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

export function torus(R: number, r: number, radial = 8, tubular = 24, arc = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.TorusGeometry(R, r, radial, tubular, arc);
}

/** Displaced icosphere (rocks, boulders, magma chunks). */
export function rock(r: number, detail = 1, seed = 1, rough = 0.28, stretch: V3 = [1, 1, 1]): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    const n = fbm3(_v.x / r * 1.3 + seed, _v.y / r * 1.3, _v.z / r * 1.3, 3, seed);
    _v.multiplyScalar(1 + (n - 0.5) * 2 * rough);
    pos.setXYZ(i, _v.x * stretch[0], _v.y * stretch[1], _v.z * stretch[2]);
  }
  const ng = g.index ? g : g;
  ng.computeVertexNormals();
  return ng;
}

/** Displace vertices along their normal by fn(x,y,z) meters. */
export function displace(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = fn(x, y, z);
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

export function noiseDisplace(geo: THREE.BufferGeometry, amp: number, freq: number, seed = 1): THREE.BufferGeometry {
  return displace(geo, (x, y, z) => (fbm3(x * freq + seed * 3.1, y * freq, z * freq, 3, seed) - 0.5) * 2 * amp);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Sweeps (tubes along curves with radius profiles)                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface SweepOpts {
  radial?: number;
  /** Cross-section scale [side, up] (ellipse). */
  flatten?: [number, number];
  /** Cross-section radius multiplier by angle (theta 0..2PI, 0 = frame "up"). */
  ridge?: (theta: number, t: number) => number;
  capStart?: boolean;
  capEnd?: boolean;
  /** Preferred up vector for the first frame (default +Y, or +Z for vertical paths). */
  up?: V3;
  /** Extra twist in radians along the path (t = 0..1). */
  twist?: (t: number) => number;
}

export interface SweepResult {
  geometry: THREE.BufferGeometry;
  /** Ring parameter (0..1 along the path) per vertex. */
  ringT: Float32Array;
}

/** Smooth a polyline with Catmull-Rom into `perSeg` samples per segment. */
export function smoothPath(points: THREE.Vector3[], perSeg: number): THREE.Vector3[] {
  if (points.length < 3 || perSeg <= 1) return points.map((p) => p.clone());
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const n = (points.length - 1) * perSeg;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) out.push(curve.getPoint(i / n));
  return out;
}

/**
 * Sweep a circular (or shaped) cross-section along centers with per-center radius. Parallel-transport frames.
 * Returns the geometry plus the path parameter of each vertex (for skinning).
 */
export function sweep(centers: THREE.Vector3[], radii: number[], opts: SweepOpts = {}): SweepResult {
  const radial = opts.radial ?? 10;
  const n = centers.length;
  const [fx, fy] = opts.flatten ?? [1, 1];
  // cumulative length
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + centers[i].distanceTo(centers[i - 1]));
  const total = Math.max(1e-6, lens[n - 1]);
  // tangents
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = centers[Math.max(0, i - 1)], b = centers[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
    T.push(t.normalize());
  }
  // frames
  const up = new THREE.Vector3(...(opts.up ?? [0, 1, 0]));
  if (Math.abs(up.dot(T[0])) > 0.95) up.set(0, 0, 1);
  if (Math.abs(up.dot(T[0])) > 0.95) up.set(1, 0, 0);
  const N: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
  let nPrev = new THREE.Vector3().copy(up).addScaledVector(T[0], -up.dot(T[0])).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      // parallel transport
      const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
      const s = axis.length();
      if (s > 1e-6) {
        const ang = Math.atan2(s, T[i - 1].dot(T[i]));
        nPrev = nPrev.clone().applyAxisAngle(axis.normalize(), ang);
      } else nPrev = nPrev.clone();
      nPrev.addScaledVector(T[i], -nPrev.dot(T[i])).normalize();
    }
    let nn = nPrev.clone();
    if (opts.twist) nn = nn.applyAxisAngle(T[i], opts.twist(lens[i] / total));
    N.push(nn);
    B.push(new THREE.Vector3().crossVectors(T[i], nn).normalize());
  }
  const ringVerts = radial + 1;
  const capS = opts.capStart ? 1 : 0, capE = opts.capEnd ? 1 : 0;
  const vcount = n * ringVerts + capS + capE;
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2);
  const ringT = new Float32Array(vcount);
  const idx: number[] = [];
  const avgR = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length);
  let vi = 0;
  for (let i = 0; i < n; i++) {
    const t = lens[i] / total;
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const rm = opts.ridge ? opts.ridge(th, t) : 1;
      const cx = Math.cos(th) * fy, sx = Math.sin(th) * fx;
      const r = radii[i] * rm;
      // point = c + N*cos*fy*r + B*sin*fx*r
      const px = centers[i].x + (N[i].x * cx + B[i].x * sx) * r;
      const py = centers[i].y + (N[i].y * cx + B[i].y * sx) * r;
      const pz = centers[i].z + (N[i].z * cx + B[i].z * sx) * r;
      pos[vi * 3] = px; pos[vi * 3 + 1] = py; pos[vi * 3 + 2] = pz;
      // normal (ellipse-aware approximation)
      const nx = N[i].x * Math.cos(th) / fy + B[i].x * Math.sin(th) / fx;
      const ny = N[i].y * Math.cos(th) / fy + B[i].y * Math.sin(th) / fx;
      const nz = N[i].z * Math.cos(th) / fy + B[i].z * Math.sin(th) / fx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor[vi * 3] = nx / nl; nor[vi * 3 + 1] = ny / nl; nor[vi * 3 + 2] = nz / nl;
      uv[vi * 2] = j / radial;
      uv[vi * 2 + 1] = lens[i] / (Math.PI * 2 * Math.max(0.01, avgR));
      ringT[vi] = t;
      vi++;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ringVerts + j, b = a + 1, c = a + ringVerts, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capS) {
    const ci = vi;
    const c = centers[0];
    pos[ci * 3] = c.x - T[0].x * radii[0] * 0.35; pos[ci * 3 + 1] = c.y - T[0].y * radii[0] * 0.35; pos[ci * 3 + 2] = c.z - T[0].z * radii[0] * 0.35;
    nor[ci * 3] = -T[0].x; nor[ci * 3 + 1] = -T[0].y; nor[ci * 3 + 2] = -T[0].z;
    uv[ci * 2] = 0.5; uv[ci * 2 + 1] = 0;
    ringT[ci] = 0;
    for (let j = 0; j < radial; j++) idx.push(ci, j, j + 1);
    vi++;
  }
  if (capE) {
    const ci = vi;
    const L = n - 1, c = centers[L];
    pos[ci * 3] = c.x + T[L].x * radii[L] * 0.35; pos[ci * 3 + 1] = c.y + T[L].y * radii[L] * 0.35; pos[ci * 3 + 2] = c.z + T[L].z * radii[L] * 0.35;
    nor[ci * 3] = T[L].x; nor[ci * 3 + 1] = T[L].y; nor[ci * 3 + 2] = T[L].z;
    uv[ci * 2] = 0.5; uv[ci * 2 + 1] = 1;
    ringT[ci] = 1;
    const base = L * ringVerts;
    for (let j = 0; j < radial; j++) idx.push(ci, base + j + 1, base + j);
    vi++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geometry: g, ringT };
}

/** Static tube along a polyline (smoothed) with a radius profile r(t). Horns, roots, branches, tusks, chains of flesh. */
export function tube(points: V3[], radius: RadiusFn, opts: SweepOpts & { perSeg?: number } = {}): THREE.BufferGeometry {
  const pts = smoothPath(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), opts.perSeg ?? 4);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = Math.max(1e-6, lens[lens.length - 1]);
  const radii = lens.map((l) => Math.max(0.001, radiusAt(radius, l / total)));
  return sweep(pts, radii, { capStart: true, capEnd: true, ...opts }).geometry;
}

/** Curved tapering horn from the origin along +Y curving toward +Z (bend in radians), with optional spiral twist. */
export function horn(length: number, baseR: number, bend = 0.8, spiral = 0, segs = 10, radial = 8): THREE.BufferGeometry {
  const pts: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    let y = length * t, z = 0;
    if (Math.abs(bend) > 1e-3) {
      const R = length / bend;
      y = R * Math.sin(bend * t);
      z = R * (1 - Math.cos(bend * t));
    }
    const x = spiral ? Math.sin(spiral * t * Math.PI * 2) * length * 0.12 * t : 0;
    pts.push([x, y, z]);
  }
  return tube(pts, (t) => baseR * Math.pow(1 - t, 0.85) + 0.004, { radial, perSeg: 1 });
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Flat shapes: blades, plates, leaves, feathers, membranes                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Extruded blade/plate from a 2D outline in the XY plane (x across, y along the blade), extruded along Z (thickness),
 * centered on Z, with bevel. Use for claws, scythes, horns-as-blades, axe heads, leaf lance heads, armor edges.
 */
export function blade(outline: [number, number][], thickness: number, bevel = thickness * 0.4, curveSegments = 6): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = Math.max(0.0005, thickness - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Leaf-shaped outline (lance heads, leaves, petals, feathers): length along +Y, max width w at `widest` (0..1). */
export function leafOutline(length: number, w: number, widest = 0.38, steps = 12, tipSharp = 1.2): [number, number][] {
  const right: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = t < widest ? Math.sin((t / widest) * Math.PI / 2) : Math.pow(Math.cos(((t - widest) / (1 - widest)) * Math.PI / 2), tipSharp);
    right.push([-(w / 2) * k, t * length]);
  }
  const left = right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [...right, ...left];
}

/** Curved armor plate: a cylinder patch (radius R, arc angle deg, height h) with thickness, facing +Z. */
export function plate(width: number, height: number, curveR = 1, thickness = 0.04, ws = 6, hs = 2): THREE.BufferGeometry {
  const arc = Math.min(Math.PI * 1.6, width / Math.max(0.05, curveR));
  const g = new THREE.CylinderGeometry(curveR, curveR, height, ws, hs, true, -arc / 2, arc);
  // shell: duplicate inward for thickness
  const inner = new THREE.CylinderGeometry(curveR - thickness, curveR - thickness, height, ws, hs, true, -arc / 2, arc);
  flipFaces(inner);
  const m = mergeGeometries([g, inner]);
  m.translate(0, 0, -curveR + thickness / 2);
  return m;
}

/** Flat leaf/feather blade made of quads, along +Y, width along X, slight fold along the midrib (curl, meters). */
export function leaf(length: number, width: number, segs = 6, curl = 0.0, fold = 0.15): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const cols = 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = width * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.5 * (1 - 0.25 * t) + 0.002;
    for (let j = 0; j < cols; j++) {
      const s = j / (cols - 1) * 2 - 1;
      const x = s * w;
      const y = t * length;
      const z = curl * t * t * length + Math.abs(s) * w * fold;
      pos.push(x, y, z);
      nor.push(0, 0, -1);
      uv.push((s + 1) / 2, t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Cluster of thin tapered cones (stylized fur tufts / mane spikes / grass). Base at origin, pointing +Y. */
export function furTuft(len: number, r: number, count = 5, seed = 1, spread = 0.5): THREE.BufferGeometry {
  const rng = new Prng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const l = len * rng.range(0.6, 1.1);
    const c = spike(r * rng.range(0.6, 1.1), l, 4, rng.range(-0.3, 0.3) * l);
    xform(c, [rng.range(-r, r) * 1.5, 0, rng.range(-r, r) * 1.5], [rng.range(-spread, spread) * 40, rng.range(0, 360), rng.range(-spread, spread) * 40]);
    parts.push(c);
  }
  return mergeGeometries(parts);
}

/** Band crown: a ring of spikes on a band. `broken` = indices of points snapped off (Guardiano's broken crown). */
export function crown(radius: number, bandH: number, points: number, spikeH: number, broken: number[] = [], thickness = 0.03, radial = 32): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const band = new THREE.CylinderGeometry(radius, radius * 1.04, bandH, radial, 1, true);
  const bandIn = new THREE.CylinderGeometry(radius - thickness, radius * 1.04 - thickness, bandH, radial, 1, true);
  flipFaces(bandIn);
  parts.push(band, bandIn);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const isBroken = broken.includes(i);
    const h = isBroken ? spikeH * 0.35 : spikeH * (i % 2 === 0 ? 1 : 0.7);
    const outline: [number, number][] = isBroken
      ? [[-radius * 0.22, 0], [radius * 0.22, 0], [radius * 0.14, h * 0.8], [radius * 0.02, h * 0.55], [-radius * 0.08, h], [-radius * 0.16, h * 0.6]]
      : [[-radius * 0.22, 0], [radius * 0.22, 0], [radius * 0.05, h * 0.75], [0, h], [-radius * 0.05, h * 0.75]];
    const s = blade(outline, thickness * 1.6, thickness * 0.3, 2);
    s.translate(0, bandH / 2 - 0.005, 0);
    s.translate(0, 0, radius);
    s.rotateY(a);
    parts.push(s);
  }
  return mergeGeometries(parts);
}

/** Reverse triangle winding and normals (inner shells, double-siding). */
export function flipFaces(g: THREE.BufferGeometry): THREE.BufferGeometry {
  ensureIndexed(g);
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (n) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Duplicate a geometry with flipped faces so a single-sided material renders both sides with correct lighting. */
export function doubleSide(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const back = flipFaces(g.clone());
  return mergeGeometries([g, back]);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Merge                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Merge geometries (position, normal, uv, color + any float attribute present in ALL inputs; missing uv/color filled).
 * Output is indexed. Inputs are not disposed.
 */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geos = list.map((g) => ensureIndexed(g.index ? g : g.clone()));
  let vtotal = 0, itotal = 0;
  for (const g of geos) {
    vtotal += g.attributes.position.count;
    itotal += g.index!.count;
  }
  const anyColor = geos.some((g) => !!g.attributes.color);
  const extra = Object.keys(geos[0]?.attributes ?? {}).filter(
    (k) => !['position', 'normal', 'uv', 'color'].includes(k) && geos.every((g) => !!g.attributes[k] && g.attributes[k].itemSize === geos[0].attributes[k].itemSize),
  );
  const pos = new Float32Array(vtotal * 3), nor = new Float32Array(vtotal * 3), uv = new Float32Array(vtotal * 2);
  const col = anyColor ? new Float32Array(vtotal * 3) : null;
  const ex: Record<string, Float32Array> = {};
  for (const k of extra) ex[k] = new Float32Array(vtotal * geos[0].attributes[k].itemSize);
  const index = new (vtotal > 65535 ? Uint32Array : Uint16Array)(itotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    const c = g.attributes.color as THREE.BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      const o = vo + i;
      pos[o * 3] = p.getX(i); pos[o * 3 + 1] = p.getY(i); pos[o * 3 + 2] = p.getZ(i);
      nor[o * 3] = n.getX(i); nor[o * 3 + 1] = n.getY(i); nor[o * 3 + 2] = n.getZ(i);
      if (u) {
        uv[o * 2] = u.getX(i); uv[o * 2 + 1] = u.getY(i);
      }
      if (col) {
        if (c) {
          col[o * 3] = c.getX(i); col[o * 3 + 1] = c.getY(i); col[o * 3 + 2] = c.getZ(i);
        } else {
          col[o * 3] = 1; col[o * 3 + 1] = 1; col[o * 3 + 2] = 1;
        }
      }
      for (const k of extra) {
        const a = g.attributes[k] as THREE.BufferAttribute;
        const s = a.itemSize;
        for (let j = 0; j < s; j++) ex[k][o * s + j] = a.getComponent(i, j);
      }
    }
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) index[io + i] = idx.getX(i) + vo;
    vo += p.count;
    io += idx.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of extra) out.setAttribute(k, new THREE.BufferAttribute(ex[k], geos[0].attributes[k].itemSize));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

/** Count triangles of a geometry. */
export function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Instancing + LOD helpers (static props, scatter)                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface InstanceSpec {
  pos: V3;
  rot?: V3; // degrees
  scale?: number | V3;
  color?: THREE.ColorRepresentation;
}

/** One InstancedMesh for many copies of a geometry (plates, scales, spikes, props). */
export function instances(geo: THREE.BufferGeometry, mat: THREE.Material, list: InstanceSpec[]): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const c = new THREE.Color();
  list.forEach((s, i) => {
    _p.set(s.pos[0], s.pos[1], s.pos[2]);
    _q.setFromEuler(_e.set((s.rot?.[0] ?? 0) * DEG, (s.rot?.[1] ?? 0) * DEG, (s.rot?.[2] ?? 0) * DEG));
    if (typeof s.scale === 'number' || s.scale === undefined) _s.setScalar((s.scale as number | undefined) ?? 1);
    else _s.set(s.scale[0], s.scale[1], s.scale[2]);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(i, _m);
    if (s.color !== undefined) im.setColorAt(i, c.set(s.color));
  });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

/** THREE.LOD from [object, distance] levels (distance in meters; first level = closest). */
export function lod(levels: [THREE.Object3D, number][], hysteresis = 0.1): THREE.LOD {
  const l = new THREE.LOD();
  for (const [o, d] of levels) l.addLevel(o, d, hysteresis);
  return l;
}

/** Segment count scaled by quality (low 0.6, medium 0.8, high 1), never below `min`. */
export function seg(base: number, quality: 'low' | 'medium' | 'high', min = 3): number {
  const k = quality === 'low' ? 0.6 : quality === 'medium' ? 0.8 : 1;
  return Math.max(min, Math.round(base * k));
}
