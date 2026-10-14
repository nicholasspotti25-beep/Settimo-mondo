/**
 * Terrain rendering: a zone "field" (heights sampled from the shared core Terrain.heightAt, so the mesh matches the sim
 * exactly at every vertex), chunked heightfield meshes with skirts and distance LOD, an out-of-bounds backdrop ring
 * (hills, cliffs, peaks, a drop into the world below, flooded lowlands) and the biome surface shader.
 */
import * as THREE from 'three';
import { Terrain, altarAvoid } from '../../core/terrain';
import { fbm2, smoothstep } from '../../core/math';
import type { ZoneDef } from '../../core/types';
import type { QualityLevel, RenderCtx } from '../types';
import { ATMOS } from './atmosphere';
import { SURFACES, type BiomeDef } from './biomes';
import { GLSL_ATMOS_FRAG, GLSL_ATMOS_PARS, GLSL_ATMOS_VERT, GLSL_NOISE } from './glsl';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Field                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface ZoneField {
  def: ZoneDef;
  terrain: Terrain;
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  h: Float32Array;
  nrm: Float32Array;
  pathD: Float32Array;
  tex: THREE.DataTexture;
  uniforms: { uField: THREE.IUniform; uFieldMin: THREE.IUniform; uFieldSize: THREE.IUniform };
  water: number | null;
  /** Bilinear height from the field grid (equals Terrain.heightAt at grid points). */
  height(x: number, z: number): number;
  dispose(): void;
}

export function buildField(def: ZoneDef, ctx: RenderCtx, terrain: Terrain): ZoneField {
  const [w, d] = def.size;
  const q = ctx.quality;
  const target = q === 'low' ? 2.6 : q === 'medium' ? 1.9 : 1.5;
  const maxN = q === 'low' ? 160 : 288;
  const step = Math.max(target, Math.max(w, d) / maxN);
  const nx = Math.max(2, Math.ceil(w / step) + 1);
  const nz = Math.max(2, Math.ceil(d / step) + 1);
  const sx = w / (nx - 1), sz = d / (nz - 1);
  const x0 = -w / 2, z0 = -d / 2;
  const h = new Float32Array(nx * nz);
  const pathD = new Float32Array(nx * nz);
  const clear = new Float32Array(nx * nz);
  const arena = new Float32Array(nx * nz);
  const altarPos = ctx.content.altarsInZone(def.id).map((a) => a.pos);
  const avoid = altarAvoid(def, altarPos);
  const gates = def.arenas.map((id) => ctx.content.arena(id).gate.pos);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * sz;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * sx;
      const k = j * nx + i;
      h[k] = terrain.heightAt(x, z);
      pathD[k] = def.path.length > 1 ? terrain.distToPath(x, z) : 99;
      let c = 0;
      for (const a of avoid) {
        const dd = Math.hypot(x - a.x, z - a.z);
        c = Math.max(c, 1 - smoothstep(a.r * 0.5, a.r, dd));
      }
      for (const g of gates) c = Math.max(c, 1 - smoothstep(2.5, 6, Math.hypot(x - g[0], z - g[2])));
      clear[k] = c;
      arena[k] = terrain.arenaAt(x, z) ? 1 : 0;
    }
  }
  // normals by central differences on the exact grid
  const nrm = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const hl = h[j * nx + Math.max(0, i - 1)], hr = h[j * nx + Math.min(nx - 1, i + 1)];
      const hd = h[Math.max(0, j - 1) * nx + i], hu = h[Math.min(nz - 1, j + 1) * nx + i];
      const dx = (hr - hl) / ((Math.min(nx - 1, i + 1) - Math.max(0, i - 1)) * sx);
      const dz = (hu - hd) / ((Math.min(nz - 1, j + 1) - Math.max(0, j - 1)) * sz);
      const l = Math.hypot(dx, 1, dz);
      const o = (j * nx + i) * 3;
      nrm[o] = -dx / l;
      nrm[o + 1] = 1 / l;
      nrm[o + 2] = -dz / l;
    }
  }
  const data = new Uint16Array(nx * nz * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let k = 0; k < nx * nz; k++) {
    data[k * 4] = toHalf(h[k]);
    data[k * 4 + 1] = toHalf(Math.min(64, pathD[k]));
    data[k * 4 + 2] = toHalf(clear[k]);
    data[k * 4 + 3] = toHalf(arena[k]);
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const field: ZoneField = {
    def, terrain, x0, z0, step: sx, nx, nz, h, nrm, pathD, tex,
    uniforms: {
      uField: { value: tex },
      uFieldMin: { value: new THREE.Vector2(x0, z0) },
      uFieldSize: { value: new THREE.Vector2(w, d) },
    },
    water: terrain.waterLevel(),
    height(x: number, z: number): number {
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / sx));
      const fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / sz));
      const i = Math.floor(fx), j = Math.floor(fz);
      const u = fx - i, v = fz - j;
      const a = h[j * nx + i], b = h[j * nx + i + 1], c = h[(j + 1) * nx + i], e = h[(j + 1) * nx + i + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
    },
    dispose() {
      tex.dispose();
    },
  };
  return field;
}

/** GLSL to sample the field texture (height, path distance, clearing, arena). */
export const GLSL_FIELD = /* glsl */ `
uniform sampler2D uField;
uniform vec2 uFieldMin;
uniform vec2 uFieldSize;
vec4 smField(vec2 xz) {
  vec2 uv = (xz - uFieldMin) / uFieldSize;
  return texture2D(uField, clamp(uv, 0.0, 1.0));
}
float smInField(vec2 xz) {
  vec2 uv = (xz - uFieldMin) / uFieldSize;
  return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
}
`;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Material                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

function colU(hex: string): THREE.IUniform {
  return { value: new THREE.Color(hex) };
}

export function terrainMaterial(biome: BiomeDef, field: ZoneField, quality: QualityLevel): THREE.MeshLambertMaterial {
  const L = biome.layers;
  const S = (id: string) => SURFACES[id] ?? SURFACES.rock;
  const base = S(L.base), alt = S(L.alt), steep = S(L.steep), high = S(L.high), path = S(L.path), wet = S(L.wet ?? 'wet');
  const speck = [base, alt, steep, high, path].find((s) => s.speck)?.speck;
  const vein = [base, alt, high, path].find((s) => s.vein)?.vein;
  const u = {
    uBaseA: colU(base.a), uBaseB: colU(base.b), uAltA: colU(alt.a), uAltB: colU(alt.b),
    uSteepA: colU(steep.a), uSteepB: colU(steep.b), uHighA: colU(high.a), uHighB: colU(high.b),
    uPathA: colU(path.a), uPathB: colU(path.b), uWetA: colU(wet.a),
    uHigh: { value: new THREE.Vector2(...(biome.high ?? [1e4, 1e4 + 10])) },
    uSteep: { value: new THREE.Vector2(...(biome.steep ?? [0.28, 0.5])) },
    uAltAmt: { value: biome.alt ?? 0.5 },
    uPathW: { value: biome.pathWidth ?? 3 },
    uPave: { value: new THREE.Vector4(base.pave ?? 0, path.pave ?? 0, alt.pave ?? 0, 0) },
    uWater: { value: field.water ?? -1e4 },
    uSpeck: { value: new THREE.Vector4(...(speck ? [...new THREE.Color(speck[0]).toArray(), speck[1]] : [0, 0, 0, 0])) },
    uVein: { value: new THREE.Vector4(...(vein ? [...new THREE.Color(vein[0]).toArray(), vein[1]] : [0, 0, 0, 0])) },
    uFogScale: { value: 1 },
  };
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.name = 'world-terrain';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, field.uniforms, {
      uTime: ATMOS.uTime, uFogColor: ATMOS.uFogColor, uFogGlow: ATMOS.uFogGlow, uGlowDir: ATMOS.uGlowDir, uFogParams: ATMOS.uFogParams,
      uFogMax: ATMOS.uFogMax, uGlowBoost: ATMOS.uGlowBoost, uCoverColor: ATMOS.uCoverColor,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTWPos;\nvarying vec3 vTWNrm;\nvarying vec3 vAtmWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTWNrm = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${GLSL_ATMOS_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTWPos;
varying vec3 vTWNrm;
varying vec3 vAtmWorld;
uniform float uTime;
uniform vec3 uBaseA; uniform vec3 uBaseB; uniform vec3 uAltA; uniform vec3 uAltB;
uniform vec3 uSteepA; uniform vec3 uSteepB; uniform vec3 uHighA; uniform vec3 uHighB;
uniform vec3 uPathA; uniform vec3 uPathB; uniform vec3 uWetA;
uniform vec2 uHigh; uniform vec2 uSteep; uniform float uAltAmt; uniform float uPathW; uniform vec4 uPave;
uniform float uWater; uniform vec4 uSpeck; uniform vec4 uVein; uniform float uGlowBoost; uniform vec3 uCoverColor;
${GLSL_NOISE}
${GLSL_FIELD}
${GLSL_ATMOS_PARS}
float smPave(vec2 p, float sc) {
  vec2 q = p / sc;
  q.x += floor(q.y) * 0.5;
  vec2 f = fract(q);
  vec2 id = floor(q);
  float edge = min(min(f.x, 1.0 - f.x) * 1.4, min(f.y, 1.0 - f.y));
  return smoothstep(0.0, 0.07, edge) * (0.82 + smHash12(id) * 0.3);
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 tEmis = vec3(0.0);
{
  vec3 P = vTWPos;
  vec3 N = normalize(vTWNrm);
  float n1 = smFbm2x3(P.xz * 0.035);
  float n2 = smNoise2(P.xz * 0.31);
  float n3 = smNoise2(P.xz * 1.9);
  float slope = 1.0 - N.y;
  vec3 base = mix(uBaseA, uBaseB, smoothstep(0.2, 0.8, n2 * 0.55 + n1 * 0.45));
  base *= mix(1.0, smPave(P.xz, 1.6), uPave.x);
  vec3 alt = mix(uAltA, uAltB, n3);
  alt *= mix(1.0, smPave(P.xz, 1.2), uPave.z);
  float wAlt = smoothstep(0.42, 0.68, n1 + (n2 - 0.5) * 0.35) * uAltAmt;
  vec3 col = mix(base, alt, wAlt);
  float wSteep = smoothstep(uSteep.x, uSteep.y, slope + (n2 - 0.5) * 0.12);
  float strata = smNoise2(vec2(P.y * 1.3, (P.x + P.z) * 0.12));
  vec3 rock = mix(uSteepA, uSteepB, smoothstep(0.25, 0.75, n3 * 0.45 + strata * 0.55));
  col = mix(col, rock, wSteep);
  float wHigh = smoothstep(uHigh.x, uHigh.y, P.y + (n1 - 0.5) * 6.0) * (1.0 - wSteep * 0.65);
  col = mix(col, mix(uHighA, uHighB, n3), wHigh);
  vec4 fld = smField(P.xz);
  float inF = smInField(P.xz);
  float pd = mix(64.0, fld.g, inF);
  float wPath = 1.0 - smoothstep(uPathW * 0.4, uPathW, pd + (n2 - 0.5) * uPathW * 0.7);
  vec3 pathC = mix(uPathA, uPathB, n3) * mix(1.0, smPave(P.xz, 1.1), uPave.y);
  col = mix(col, pathC, wPath * (1.0 - wSteep * 0.6));
  float wWet = 1.0 - smoothstep(0.0, 0.9, P.y - uWater);
  col = mix(col, uWetA, wWet * 0.8);
  if (uVein.w > 0.0) {
    float v = abs(smNoise2(P.xz * 0.25 + vec2(smNoise2(P.xz * 0.9) * 2.0)) - 0.5);
    col = mix(col, uVein.rgb, smoothstep(0.035, 0.0, v) * uVein.w * (1.0 - wSteep));
  }
  col *= 0.86 + n3 * 0.22 + n2 * 0.06;
  diffuseColor.rgb = col;
  if (uSpeck.w > 0.0) {
    vec2 cell = floor(P.xz * 2.5);
    float h = smHash12(cell);
    float pulse = 0.55 + 0.45 * sin(uTime * (1.0 + h * 2.0) + h * 40.0);
    tEmis = uSpeck.rgb * step(1.0 - uSpeck.w * 0.035, h) * pulse * uGlowBoost * (1.0 - wSteep);
  }
}
`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tEmis;')
      .replace('#include <fog_fragment>', GLSL_ATMOS_FRAG);
    if (quality !== 'low') {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec2 pp = vTWPos.xz * 0.9;
  float a0 = smNoise2(pp), ax = smNoise2(pp + vec2(0.35, 0.0)), az = smNoise2(pp + vec2(0.0, 0.35));
  vec3 gw = vec3(a0 - ax, 0.0, a0 - az) * 0.9;
  normal = normalize(normal + mat3(viewMatrix) * gw);
}`,
      );
    }
  };
  m.customProgramCacheKey = () => `sm-terrain-${quality === 'low' ? 0 : 1}`;
  return m;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Chunks                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Chunk {
  mesh: THREE.Mesh;
  lods: THREE.BufferGeometry[];
  cx: number;
  cz: number;
  half: number;
  lod: number;
}

function chunkGeometry(f: ZoneField, i0: number, j0: number, i1: number, j1: number, step: number, skirt: number): THREE.BufferGeometry {
  const cols: number[] = [];
  for (let i = i0; i < i1; i += step) cols.push(i);
  cols.push(i1);
  const rows: number[] = [];
  for (let j = j0; j < j1; j += step) rows.push(j);
  rows.push(j1);
  const nc = cols.length, nr = rows.length;
  const vcount = nc * nr + 2 * (nc + nr);
  const sz = f.def.size[1] / (f.nz - 1);
  const pos = new Float32Array(vcount * 3);
  const nrm = new Float32Array(vcount * 3);
  const idx: number[] = [];
  let v = 0;
  const put = (i: number, j: number, dy: number) => {
    const k = j * f.nx + i;
    pos[v * 3] = f.x0 + i * f.step;
    pos[v * 3 + 1] = f.h[k] + dy;
    pos[v * 3 + 2] = f.z0 + j * sz;
    nrm[v * 3] = f.nrm[k * 3];
    nrm[v * 3 + 1] = f.nrm[k * 3 + 1];
    nrm[v * 3 + 2] = f.nrm[k * 3 + 2];
    return v++;
  };
  for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) put(cols[c], rows[r], 0);
  for (let r = 0; r < nr - 1; r++) {
    for (let c = 0; c < nc - 1; c++) {
      const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  // skirts (hide LOD cracks): duplicate edge vertices pushed down
  const edge = (ij: [number, number][], first: number[]) => {
    const bot = ij.map(([i, j]) => put(i, j, -skirt));
    for (let s = 0; s < first.length - 1; s++) {
      idx.push(first[s], bot[s], first[s + 1], first[s + 1], bot[s], bot[s + 1]);
      idx.push(first[s], first[s + 1], bot[s], first[s + 1], bot[s + 1], bot[s]);
    }
  };
  const rowE = (r: number) => edge(cols.map((c) => [c, rows[r]] as [number, number]), cols.map((_, c) => r * nc + c));
  const colE = (c: number) => edge(rows.map((r) => [cols[c], r] as [number, number]), rows.map((_, r) => r * nc + c));
  rowE(0);
  rowE(nr - 1);
  colE(0);
  colE(nc - 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, v * 3), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export class TerrainMeshes {
  readonly group = new THREE.Group();
  private chunks: Chunk[] = [];
  readonly material: THREE.MeshLambertMaterial;
  private lodDist: [number, number];

  constructor(readonly field: ZoneField, biome: BiomeDef, private ctx: RenderCtx) {
    this.group.name = 'terrain';
    this.material = terrainMaterial(biome, field, ctx.quality);
    const C = ctx.quality === 'low' ? 40 : 56;
    const f = field;
    const steps = ctx.quality === 'low' ? [1, 2, 4] : [1, 2, 4];
    this.lodDist = ctx.quality === 'low' ? [60, 140] : ctx.quality === 'medium' ? [90, 200] : [120, 260];
    for (let j0 = 0; j0 < f.nz - 1; j0 += C) {
      for (let i0 = 0; i0 < f.nx - 1; i0 += C) {
        const i1 = Math.min(f.nx - 1, i0 + C), j1 = Math.min(f.nz - 1, j0 + C);
        const lods = steps.map((s) => chunkGeometry(f, i0, j0, i1, j1, s, 3));
        const mesh = new THREE.Mesh(lods[0], this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        const bb = lods[0].boundingBox!;
        const chunk: Chunk = { mesh, lods, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, half: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2, lod: 0 };
        this.chunks.push(chunk);
        this.group.add(mesh);
      }
    }
  }

  update(camera: THREE.Camera): void {
    const p = camera.position;
    for (const c of this.chunks) {
      const dx = Math.max(0, Math.abs(p.x - c.cx) - c.half);
      const dz = Math.max(0, Math.abs(p.z - c.cz) - c.half);
      const d = Math.hypot(dx, dz);
      const lod = d < this.lodDist[0] ? 0 : d < this.lodDist[1] ? 1 : 2;
      if (lod !== c.lod) {
        c.lod = lod;
        c.mesh.geometry = c.lods[lod];
      }
    }
  }

  dispose(): void {
    for (const c of this.chunks) for (const g of c.lods) g.dispose();
    this.material.dispose();
    this.group.clear();
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Backdrop (render-only terrain outside the walkable bounds)                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export type BackdropKind = 'hills' | 'cliffs' | 'drop' | 'water' | 'none' | 'peaks';

export function backdropRise(kind: BackdropKind, height: number, out: number, x: number, z: number, water: number | null): number {
  const n = fbm2(x / 180, z / 180, 4, 99);
  switch (kind) {
    case 'hills':
      return height * smoothstep(0, 260, out) * (0.65 + 0.7 * n);
    case 'cliffs': {
      const r = 1 - Math.abs(fbm2(x / 90, z / 90, 3, 41));
      return height * smoothstep(0, 70, out) * (0.6 + 0.6 * r) + height * 0.6 * smoothstep(120, 500, out) * n;
    }
    case 'peaks': {
      const r = 1 - Math.abs(fbm2(x / 220, z / 220, 4, 17));
      return height * smoothstep(30, 520, out) * (0.3 + r * r * 1.4);
    }
    case 'drop':
      return -height * smoothstep(0, 140, out) * (0.85 + 0.3 * n);
    case 'water':
      return water !== null ? -2.5 * smoothstep(0, 30, out) - 2 * smoothstep(30, 200, out) : 0;
    default:
      return 0;
  }
}

export function buildBackdrop(field: ZoneField, kind: BackdropKind, height: number, material: THREE.Material, quality: QualityLevel): THREE.Group {
  const g = new THREE.Group();
  g.name = 'backdrop';
  if (kind === 'none') return g;
  const [w, d] = field.def.size;
  const M = quality === 'low' ? 420 : 640;
  const S = quality === 'low' ? 20 : 13;
  const X0 = -w / 2 - M, Z0 = -d / 2 - M;
  const NX = Math.ceil((w + 2 * M) / S) + 1, NZ = Math.ceil((d + 2 * M) / S) + 1;
  const t = field.terrain;
  const water = field.water;
  const H = new Float32Array(NX * NZ);
  const inside = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const x = X0 + i * S, z = Z0 + j * S;
      const e = t.edgeDistance(x, z);
      const k = j * NX + i;
      if (e > S * 1.5) {
        inside[k] = 1;
        H[k] = field.height(x, z) - 1.5;
        continue;
      }
      const base = e >= 0 ? field.height(x, z) : t.heightAt(x, z);
      const out = Math.max(0, -e);
      let y = base + backdropRise(kind, height, out, x, z, water);
      if (e > 0) y -= 0.6;
      if (kind === 'water' && water !== null && out > 10) y = Math.min(y, water - 1.2 - out * 0.004);
      H[k] = y;
    }
  }
  // blocks for culling
  const B = 4;
  const bx = Math.ceil((NX - 1) / B), bz = Math.ceil((NZ - 1) / B);
  for (let bj = 0; bj < B; bj++) {
    for (let bi = 0; bi < B; bi++) {
      const i0 = bi * bx, j0 = bj * bz, i1 = Math.min(NX - 1, i0 + bx), j1 = Math.min(NZ - 1, j0 + bz);
      if (i1 <= i0 || j1 <= j0) continue;
      const nc = i1 - i0 + 1, nr = j1 - j0 + 1;
      const pos = new Float32Array(nc * nr * 3);
      for (let r = 0; r < nr; r++) {
        for (let c = 0; c < nc; c++) {
          const k = (j0 + r) * NX + (i0 + c);
          const o = (r * nc + c) * 3;
          pos[o] = X0 + (i0 + c) * S;
          pos[o + 1] = H[k];
          pos[o + 2] = Z0 + (j0 + r) * S;
        }
      }
      const idx: number[] = [];
      for (let r = 0; r < nr - 1; r++) {
        for (let c = 0; c < nc - 1; c++) {
          const ka = (j0 + r) * NX + (i0 + c);
          if (inside[ka] && inside[ka + 1] && inside[ka + NX] && inside[ka + NX + 1]) continue;
          const a = r * nc + c, b = a + 1, dd = a + nc, e = dd + 1;
          idx.push(a, dd, b, b, dd, e);
        }
      }
      if (!idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
    }
  }
  return g;
}

/** Render-only height for points outside the walkable bounds (props on the backdrop ring). */
export function backdropHeightAt(field: ZoneField, kind: BackdropKind, height: number, x: number, z: number): number {
  const t = field.terrain;
  const e = t.edgeDistance(x, z);
  if (e >= 0) return field.height(x, z);
  return t.heightAt(x, z) + backdropRise(kind, height, -e, x, z, field.water);
}
