/**
 * Ground cover (grass, moss tufts, reeds, flowers, snow grass): a camera-following ring of cells around the view focus.
 * Each cell's tufts are placed deterministically from a world-cell hash (so walking back shows the same grass), on the
 * exact field heights, avoiding steep slopes, the main path, altars/exits/vistas, arenas (unless the cover grows inside
 * them, e.g. the tall-grass duel) and water. One InstancedMesh (one draw call); cells are rewritten only when the focus
 * crosses a cell border. Custom shader: base->tip gradient, wind bending by height with gusts, translucency toward the
 * twilight glow, distance shrink (no popping) and the shared atmosphere fog.
 */
import * as THREE from 'three';
import { ATMOS } from './atmosphere';
import type { CoverDef } from './biomes';
import type { ZoneEnv } from './env';
import { GLSL_ATMOS_FRAG, GLSL_ATMOS_PARS, GLSL_ATMOS_VERT, GLSL_NOISE } from './glsl';
import { atmosUniforms } from './materials';

function tuftGeometry(type: CoverDef['type']): THREE.BufferGeometry {
  const pos: number[] = [];
  const t: number[] = [];
  const idx: number[] = [];
  const blades = type === 'reeds' ? 4 : type === 'moss' ? 6 : type === 'flowers' ? 5 : 5;
  const seg = type === 'moss' ? 1 : 2;
  let base = 0;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 1.7;
    const off = type === 'moss' ? 0.22 : 0.12;
    const ox = Math.cos(a * 1.3) * off, oz = Math.sin(a * 1.3) * off;
    const h = (type === 'moss' ? 0.5 : 1) * (0.75 + ((b * 0.37) % 0.5));
    const w = type === 'reeds' ? 0.05 : type === 'moss' ? 0.22 : 0.075;
    const lean = type === 'moss' ? 0.6 : 0.28;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i <= seg; i++) {
      const k = i / seg;
      const ww = w * (1 - k * 0.85);
      const bend = lean * k * k * h;
      const cx = ox + ca * bend, cz = oz + sa * bend;
      pos.push(cx - sa * ww, h * k, cz + ca * ww, cx + sa * ww, h * k, cz - ca * ww);
      t.push(k, k);
    }
    for (let i = 0; i < seg; i++) {
      const o = base + i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    base += (seg + 1) * 2;
  }
  // flower heads: a small diamond at the tip of two blades
  if (type === 'flowers') {
    for (let b = 0; b < 2; b++) {
      const a = b * 2.6;
      const x = Math.cos(a) * 0.18, z = Math.sin(a) * 0.18, y = 1.02, s = 0.09;
      const o = pos.length / 3;
      pos.push(x - s, y, z, x + s, y, z, x, y + s, z, x, y - s * 0.4, z, x, y, z - s, x, y, z + s);
      t.push(2, 2, 2, 2, 2, 2);
      idx.push(o, o + 1, o + 2, o, o + 3, o + 1, o + 4, o + 5, o + 2, o + 4, o + 3, o + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const vert = /* glsl */ `
attribute float aT;
varying float vT;
varying vec3 vCol;
varying vec3 vAtmWorld;
varying float vSeed;
uniform float uTime;
uniform vec4 uWind;
uniform vec3 uFocus;
uniform float uRadius;
uniform vec3 uBase;
uniform vec3 uTip;
${GLSL_NOISE}
void main() {
  vec3 org = instanceMatrix[3].xyz;
  float seed = smHash12(org.xz);
  vSeed = seed;
  float d = length(org.xz - uFocus.xz);
  float fade = 1.0 - smoothstep(uRadius * 0.62, uRadius, d);
  vec3 p = position;
  vec4 wp = instanceMatrix * vec4(p * vec3(1.0, fade, 1.0), 1.0);
  float k = clamp(aT, 0.0, 1.0);
  float gust = 0.55 + 0.9 * smNoise2(org.xz * 0.045 - uWind.xy * uTime * 0.8) * (0.5 + uWind.w);
  float sway = sin(uTime * 2.1 + seed * 6.28 + dot(org.xz, vec2(0.21, 0.17))) * 0.35 + gust;
  float bendAmt = k * k * 0.28 * uWind.z * sway * (wp.y - org.y + 0.2);
  wp.xz += uWind.xy * bendAmt;
  wp.y -= bendAmt * 0.25;
  vT = aT;
  vec3 tint = mix(vec3(0.85, 0.9, 0.8), vec3(1.12, 1.05, 0.92), seed);
  vCol = mix(uBase, uTip, k) * tint;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vAtmWorld = wp.xyz;
}
`;

const frag = /* glsl */ `
varying float vT;
varying vec3 vCol;
varying vec3 vAtmWorld;
varying float vSeed;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uFlower;
uniform float uGlowBoost;
${GLSL_ATMOS_PARS}
void main() {
  vec3 base = vCol;
  vec3 emis = vec3(0.0);
  if (vT > 1.5) {
    base = mix(uFlower, vec3(1.0), vSeed * 0.35);
    emis = base * 0.35 * uGlowBoost;
  }
  vec3 V = normalize(cameraPosition - vAtmWorld);
  float ao = mix(0.45, 1.0, clamp(vT, 0.0, 1.0));
  vec3 amb = mix(uHemiGround, uHemiSky, 0.65 + 0.35 * clamp(vT, 0.0, 1.0));
  float ndl = 0.55 + 0.45 * max(uLightDir.y, 0.0);
  float trans = pow(max(dot(-V, uLightDir), 0.0), 3.0) * clamp(vT, 0.0, 1.0) * 0.9;
  vec3 col = base * (amb * ao + uLightColor * (ndl * 0.65 + trans) * ao) + emis;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${GLSL_ATMOS_FRAG.replace('#ifdef USE_FOG', '#if 1')}
}
`;

interface CellSlot {
  key: number;
  start: number;
  count: number;
}

export class GroundCover {
  readonly mesh: THREE.InstancedMesh;
  private cell: number;
  private grid: number;
  private perCell: number;
  private slots: CellSlot[] = [];
  private focusCell = [1e9, 1e9];
  private uFocus = { value: new THREE.Vector3() };
  private mat: THREE.ShaderMaterial;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private fwd = new THREE.Vector3();

  constructor(private env: ZoneEnv, private def: CoverDef) {
    const q = env.ctx.quality;
    const scaleAdj = def.type === 'moss' ? 1.1 : 1;
    this.cell = 10;
    this.grid = q === 'low' ? 5 : q === 'medium' ? 7 : 9;
    const dens = def.density * (q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1) * scaleAdj;
    this.perCell = Math.max(4, Math.round(this.cell * this.cell * dens));
    const total = this.perCell * this.grid * this.grid;
    const geo = tuftGeometry(def.type);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...atmosUniforms(1),
        uWind: ATMOS.uWind,
        uFocus: this.uFocus,
        uRadius: { value: (this.grid / 2) * this.cell },
        uBase: { value: new THREE.Color(def.base) },
        uTip: { value: new THREE.Color(def.tip) },
        uFlower: { value: new THREE.Color(def.type === 'flowers' ? def.tip : '#ffffff') },
        uLightDir: ATMOS.uLightDir,
        uLightColor: ATMOS.uLightColor,
        uHemiSky: ATMOS.uHemiSky,
        uHemiGround: ATMOS.uHemiGround,
        uGlowBoost: ATMOS.uGlowBoost,
      },
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, total);
    this.mesh.name = 'cover';
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.grid * this.grid; i++) this.slots.push({ key: NaN, start: i * this.perCell, count: 0 });
  }

  private fillCell(slot: CellSlot, ci: number, cj: number): void {
    const env = this.env;
    const f = env.field;
    const def = this.def;
    const C = this.cell;
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    let seed = (Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ 0x5bd1e995) >>> 0;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const maxSlope = def.maxSlope ?? 0.42;
    const pathW = env.biome.pathWidth ?? 3;
    const water = f.water;
    let n = 0;
    for (let k = 0; k < this.perCell; k++) {
      const x = (ci + rnd()) * C, z = (cj + rnd()) * C;
      const yaw = rnd() * 6.283;
      const sc = def.height[0] + (def.height[1] - def.height[0]) * rnd();
      const keep = rnd();
      if (!env.terrain.inBounds(x, z, 0.5)) continue;
      const fx = Math.min(f.nx - 1, Math.max(0, Math.round((x - f.x0) / f.step)));
      const fz = Math.min(f.nz - 1, Math.max(0, Math.round((z - f.z0) / (env.def.size[1] / (f.nz - 1)))));
      const gi = fz * f.nx + fx;
      if (1 - f.nrm[gi * 3 + 1] > maxSlope) continue;
      const pd = f.pathD[gi];
      if (pd < pathW * 0.55) continue;
      if (pd < pathW * 1.4 && keep < 0.6) continue;
      let clear = false;
      for (const a of env.avoid) {
        const dx = x - a.x, dz = z - a.z;
        if (dx * dx + dz * dz < a.r * a.r * 0.55) {
          clear = true;
          break;
        }
      }
      if (clear) continue;
      if (!def.inArenas && env.terrain.arenaAt(x, z)) continue;
      const y = f.height(x, z);
      if (water !== null) {
        if (def.type === 'reeds') {
          if (y > water + 0.8 || y < water - 0.9) continue;
        } else if (y < water + 0.15) continue;
      }
      this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      const w = sc * (0.85 + keep * 0.3);
      this.m.compose(this.p.set(x, y - 0.03, z), this.q, this.s.set(w, sc, w));
      this.m.toArray(arr, (slot.start + n) * 16);
      n++;
    }
    slot.count = n;
  }

  update(camera: THREE.Camera): void {
    // focus: a point in front of the camera on the ground (where the player is looking)
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize();
    const C = this.cell;
    const fx = camera.position.x + this.fwd.x * C * 1.2;
    const fz = camera.position.z + this.fwd.z * C * 1.2;
    this.uFocus.value.set(fx, 0, fz);
    const ci = Math.floor(fx / C), cj = Math.floor(fz / C);
    if (ci === this.focusCell[0] && cj === this.focusCell[1]) return;
    this.focusCell[0] = ci;
    this.focusCell[1] = cj;
    const G = this.grid, h = Math.floor(G / 2);
    // which world cells are wanted
    const want = new Set<number>();
    for (let j = -h; j <= h; j++) for (let i = -h; i <= h; i++) want.add((ci + i) * 65536 + (cj + j));
    const free: CellSlot[] = [];
    for (const s of this.slots) {
      if (want.has(s.key)) want.delete(s.key);
      else free.push(s);
    }
    for (const key of want) {
      const s = free.pop();
      if (!s) break;
      s.key = key;
      const i = Math.round(key / 65536);
      const j = key - i * 65536;
      this.fillCell(s, i, j);
    }
    // compact: slots are fixed ranges; zero-scale unused tails so a single draw covers everything
    const arr = this.mesh.instanceMatrix.array as Float32Array;
    for (const s of this.slots) {
      for (let k = s.count; k < this.perCell; k++) {
        const o = (s.start + k) * 16;
        for (let e = 0; e < 16; e++) arr[o + e] = 0;
      }
    }
    this.mesh.count = this.perCell * this.grid * this.grid;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}
