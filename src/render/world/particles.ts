/**
 * Zone particles: ambient motes that make each region breathe — fireflies, embers, snow, pollen, ash, souls (over the
 * river of souls), drifting star motes, rain, lightning (distant bolts + the atmosphere flash), ground mist banks, dust
 * and spores.
 *
 * Each kind is ONE instanced draw call. Every particle lives in a camera-following volume around the view focus and is
 * animated entirely in the vertex shader from per-instance seeds and time (no per-frame CPU work or allocation): its
 * horizontal position is fixed in the world and wraps at the volume edge (where it is faded out), so walking never drags
 * the particles along. Heights come from the baked zone field texture (the same heights as the sim), so fireflies hover
 * over the ground, embers rise from it, snow/rain/ash stop at it and souls rise only from water.
 * Glowing kinds are additive in display space (brighter at night); snow/ash/rain are lit by the shared hemisphere and
 * key light; mist banks take the horizon fog colour so they melt into the atmosphere.
 *
 * Kind list per zone: zone.particles, else the biome's list. An entry may carry a density factor: 'souls*1.6'.
 */
import * as THREE from 'three';
import { ATMOS } from './atmosphere';
import type { ZoneEnv } from './env';
import { GLSL_ATMOS_PARS, GLSL_NOISE } from './glsl';
import { GLSL_FIELD } from './terrain';

export const PARTICLE_KINDS = ['fireflies', 'embers', 'snow', 'pollen', 'ash', 'souls', 'stars', 'rain', 'lightning', 'mist', 'dust', 'spores'] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

// motion modes
const GROUND = 0, FALL = 1, RISE = 2, SKY = 3, WATER = 4;
// sprite shapes
const DOT = 0, FLAKE = 1, STREAK = 2, MIST = 3, EMBER = 4, STAR = 5;
// blending
const GLOW = 0, LIT = 1, FOG = 2;

interface Spec {
  /** Instances on High at density 1. */
  count: number;
  mode: number;
  shape: number;
  blend: number;
  /** Horizontal half-extent of the camera-following volume (m). */
  radius: number;
  /** Ground/rise: y above ground; fall: cycle height; sky: above the focus; water: above the water level. */
  band: [number, number];
  vel: [number, number, number];
  /** ± fraction of speed variation. */
  speedVar: number;
  windK: number;
  wander: number;
  wanderHz: number;
  size: [number, number];
  colA: string;
  colB: string;
  intensity: number;
  /** Visibility in full day (night = 1). */
  dayVis: number;
  /** 0..1 blinking. */
  blink: number;
  /** Streak length per m/s (rain). */
  stretch?: number;
  /** Fade-in distance from the camera [start, full]. */
  near?: [number, number];
}

const SPECS: Record<Exclude<ParticleKind, 'lightning'>, Spec> = {
  fireflies: {
    count: 150, mode: GROUND, shape: DOT, blend: GLOW, radius: 26, band: [0.35, 2.8], vel: [0, 0, 0], speedVar: 0, windK: 0.15,
    wander: 1.3, wanderHz: 0.09, size: [0.3, 0.46], colA: '#d6ff7e', colB: '#ffe27a', intensity: 1.05, dayVis: 0.3, blink: 0.85,
  },
  embers: {
    count: 230, mode: RISE, shape: EMBER, blend: GLOW, radius: 24, band: [0, 10], vel: [0, 1.25, 0], speedVar: 0.5, windK: 1.3,
    wander: 0.55, wanderHz: 0.22, size: [0.09, 0.17], colA: '#ff8a32', colB: '#ffd27a', intensity: 1.2, dayVis: 0.75, blink: 0.35,
  },
  snow: {
    count: 1100, mode: FALL, shape: FLAKE, blend: LIT, radius: 22, band: [0, 17], vel: [0, -1.05, 0], speedVar: 0.35, windK: 1.25,
    wander: 0.45, wanderHz: 0.12, size: [0.05, 0.1], colA: '#ffffff', colB: '#e6ecff', intensity: 0.95, dayVis: 1, blink: 0,
  },
  pollen: {
    count: 300, mode: GROUND, shape: DOT, blend: GLOW, radius: 22, band: [0.3, 5], vel: [0, 0.06, 0], speedVar: 0.5, windK: 0.7,
    wander: 0.9, wanderHz: 0.05, size: [0.1, 0.17], colA: '#ffe6a0', colB: '#fff4cc', intensity: 0.42, dayVis: 1, blink: 0.25,
  },
  ash: {
    count: 650, mode: FALL, shape: FLAKE, blend: LIT, radius: 24, band: [0, 16], vel: [0, -0.5, 0], speedVar: 0.4, windK: 1,
    wander: 0.8, wanderHz: 0.08, size: [0.06, 0.12], colA: '#3e383c', colB: '#7a7276', intensity: 0.85, dayVis: 1, blink: 0,
  },
  souls: {
    count: 230, mode: WATER, shape: DOT, blend: GLOW, radius: 32, band: [0.05, 4.5], vel: [0, 0.2, 0], speedVar: 0.5, windK: 0.25,
    wander: 1.1, wanderHz: 0.04, size: [0.32, 0.55], colA: '#b8e2ff', colB: '#eef6ff', intensity: 0.95, dayVis: 0.65, blink: 0.3,
  },
  stars: {
    count: 220, mode: SKY, shape: STAR, blend: GLOW, radius: 30, band: [1.5, 15], vel: [0, 0.05, 0], speedVar: 0.3, windK: 0.1,
    wander: 0.6, wanderHz: 0.03, size: [0.2, 0.42], colA: '#fff2d6', colB: '#cfe0ff', intensity: 0.9, dayVis: 0.5, blink: 0.7,
  },
  rain: {
    count: 1800, mode: FALL, shape: STREAK, blend: LIT, radius: 18, band: [0, 18], vel: [0, -15, 0], speedVar: 0.15, windK: 3.5,
    wander: 0, wanderHz: 0, size: [0.014, 0.022], colA: '#c4ccdc', colB: '#e2e8f2', intensity: 0.3, dayVis: 1, blink: 0, stretch: 0.075,
    near: [0.8, 2.5],
  },
  mist: {
    count: 38, mode: GROUND, shape: MIST, blend: FOG, radius: 42, band: [0.6, 2.6], vel: [0.22, 0, 0.12], speedVar: 0.4, windK: 0.4,
    wander: 2.2, wanderHz: 0.012, size: [10, 18], colA: '#ffffff', colB: '#ffffff', intensity: 0.26, dayVis: 1, blink: 0,
    near: [3, 11],
  },
  dust: {
    count: 260, mode: GROUND, shape: DOT, blend: GLOW, radius: 18, band: [0.2, 4.5], vel: [0, 0.03, 0], speedVar: 0.5, windK: 0.9,
    wander: 0.7, wanderHz: 0.05, size: [0.06, 0.1], colA: '#fff0d4', colB: '#ffe4c0', intensity: 0.32, dayVis: 1, blink: 0.2,
  },
  spores: {
    count: 240, mode: GROUND, shape: DOT, blend: GLOW, radius: 22, band: [0.2, 7], vel: [0, 0.12, 0], speedVar: 0.5, windK: 0.3,
    wander: 0.8, wanderHz: 0.05, size: [0.11, 0.2], colA: '#90ffd4', colB: '#d2ffac', intensity: 0.7, dayVis: 0.45, blink: 0.5,
  },
};

const QUALITY_FACTOR = { low: 0.35, medium: 0.7, high: 1 } as const;

const vert = /* glsl */ `
attribute vec4 aA; // x,z: position, y: height, w: phase
attribute vec4 aB; // x: size, y: colour, z: speed, w: rate
uniform float uPT;
uniform vec3 uFocus;
uniform vec4 uWind;
uniform float uNight;
uniform float uMode;
uniform float uShape;
uniform float uCycle;
uniform vec2 uBand;
uniform float uRadius;
uniform vec3 uVel;
uniform vec4 uMove; // x: speed variation, y: wind factor, z: wander, w: wander Hz
uniform vec2 uSize;
uniform float uStretch;
uniform float uWater;
uniform vec2 uVis;  // x: day visibility, y: blink
uniform vec2 uNear;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying vec3 vAtmWorld;
${GLSL_FIELD}
void main() {
  float t = uPT;
  float spd = 1.0 + (aB.z * 2.0 - 1.0) * uMove.x;
  vec3 vel = uVel * spd + vec3(uWind.x, 0.0, uWind.y) * uWind.z * uMove.y;
  vec3 drift = vel * t;
  float R = uRadius;
  vec2 rel = mod(aA.xz * 2.0 * R + drift.xz - uFocus.xz + R, 2.0 * R) - R;
  float ph = aA.w * 6.2831853;
  float wf = uMove.w * 6.2831853;
  vec2 wander = vec2(sin(t * wf * (0.7 + aB.w * 0.6) + ph), cos(t * wf * 0.8 * (0.8 + aB.x * 0.5) + ph * 1.7)) * uMove.z;
  vec2 xz = uFocus.xz + rel + wander;
  float g = smField(xz).x;
  float span = max(uBand.y - uBand.x, 0.01);
  float yc = mod(aA.y * span + drift.y, span);
  float k = yc / span;
  float fade = 1.0 - smoothstep(0.7 * R, R, length(rel));
  float y;
  if (uMode < 0.5) {
    y = g + uBand.x + (uCycle > 0.5 ? yc : aA.y * span) + sin(t * 0.6 + ph) * 0.25 * uMove.z;
    if (uCycle > 0.5) fade *= smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.75, 1.0, k));
  } else if (uMode < 1.5) {
    y = uFocus.y - 3.0 + yc;
    fade *= smoothstep(g - 0.05, g + 0.35, y) * (1.0 - smoothstep(0.85, 1.0, k));
  } else if (uMode < 2.5) {
    y = g + yc;
    fade *= smoothstep(0.0, 0.05, k) * pow(1.0 - k, 1.3);
  } else if (uMode < 3.5) {
    y = uFocus.y + uBand.x + aA.y * span + sin(t * 0.3 + ph) * 0.4;
    fade *= smoothstep(g + 0.2, g + 1.2, y);
  } else {
    y = uWater + uBand.x + yc;
    fade *= uWater > -1000.0 ? smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 1.0, k)) * (1.0 - smoothstep(uWater - 0.6, uWater - 0.05, g)) : 0.0;
  }
  vec3 c = vec3(xz.x, y, xz.y);
  float vis = mix(uVis.x, 1.0, uNight);
  float bl = smoothstep(0.3, 0.85, 0.5 + 0.5 * sin(t * (0.8 + aB.w * 1.5) + ph * 3.0));
  float size = mix(uSize.x, uSize.y, aB.x);
  float dc = distance(c, cameraPosition);
  vAlpha = fade * vis * mix(1.0, bl, uVis.y) * smoothstep(uNear.x, uNear.y, dc);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp;
  if (uShape > 1.5 && uShape < 2.5) {
    vec3 ax = normalize(vel + vec3(0.0, -0.001, 0.0));
    vec3 side = normalize(cross(ax, cameraPosition - c) + vec3(1e-5, 0.0, 0.0));
    wp = c + side * position.x * size + ax * position.y * length(vel) * uStretch;
  } else if ((uShape > 0.5 && uShape < 1.5) || (uShape > 2.5 && uShape < 3.5)) {
    float ang = uShape < 1.5 ? t * (0.8 + aB.w * 2.0) + ph : t * 0.015 * (aB.w - 0.5) + ph;
    float cs = cos(ang), sn = sin(ang);
    vec2 p = position.xy;
    if (uShape < 1.5) p.y *= 0.55 + 0.45 * abs(sin(t * (1.1 + aB.z) + ph));
    p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    wp = c + camR * p.x * size + camU * p.y * size * (uShape > 2.5 ? 0.42 : 1.0);
  } else {
    wp = c + camR * position.x * size + camU * position.y * size;
  }
  vUv = position.xy + 0.5;
  vSeed = aB.y;
  vAtmWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const frag = /* glsl */ `
uniform float uPT;
uniform float uNight;
uniform float uShape;
uniform float uBlend;
uniform float uIntensity;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uLightColor;
uniform vec3 uHemiSky;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying vec3 vAtmWorld;
${GLSL_NOISE}
${GLSL_ATMOS_PARS}
void main() {
  vec2 p = vUv - 0.5;
  float r2 = dot(p, p) * 4.0;
  float a;
  if (uShape < 0.5) {
    a = exp(-r2 * 4.5) * 0.45 + exp(-r2 * 30.0) * 0.95;
  } else if (uShape < 1.5) {
    a = smoothstep(1.0, 0.25, r2);
  } else if (uShape < 2.5) {
    float x = p.x * 2.0;
    a = (1.0 - x * x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  } else if (uShape < 3.5) {
    float n = smNoise2(vUv * 2.6 + vSeed * 17.0 + uPT * 0.03) * 0.6 + smNoise2(vUv * 6.1 - vSeed * 5.0 - uPT * 0.05) * 0.4;
    a = exp(-r2 * 2.0) * smoothstep(1.0, 0.55, r2) * (0.3 + 0.9 * n);
  } else if (uShape < 4.5) {
    a = exp(-r2 * 12.0) * 1.1 + exp(-r2 * 2.6) * 0.22;
  } else {
    vec2 q = abs(p) * 2.0;
    a = exp(-q.x * 20.0) * exp(-q.y * 3.0) + exp(-q.y * 20.0) * exp(-q.x * 3.0) + exp(-dot(q, q) * 26.0);
  }
  a *= vAlpha;
  if (a < 0.002) discard;
  vec3 ray = vAtmWorld - cameraPosition;
  float dist = length(ray);
  float fa = smFogAmount(ray, dist);
  vec3 col = mix(uColA, uColB, vSeed);
  if (uBlend < 0.5) {
    vec3 o = col * a * uIntensity * mix(1.0, 1.45, uNight) * (1.0 - fa * 0.9);
    gl_FragColor = vec4(min(o, vec3(2.0)), 1.0);
  } else if (uBlend < 1.5) {
    gl_FragColor = vec4(col * (uHemiSky * 0.85 + uLightColor * 0.4), min(1.0, a * uIntensity));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb = mix(gl_FragColor.rgb, smFogColor(ray / max(dist, 1e-3)), fa);
  } else {
    gl_FragColor = vec4(smFogColor(ray / max(dist, 1e-3)) * 1.04, min(1.0, a * uIntensity * (1.0 - fa * 0.5)));
  }
}
`;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lightning bolts                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const boltVert = /* glsl */ `
attribute float aT;
varying float vT;
varying float vX;
void main() {
  vT = aT;
  vX = uv.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const boltFrag = /* glsl */ `
uniform float uBolt;
uniform vec3 uColor;
varying float vT;
varying float vX;
void main() {
  float x = abs(vX * 2.0 - 1.0);
  float a = (exp(-x * x * 9.0) + exp(-x * x * 60.0)) * uBolt * smoothstep(0.0, 0.04, vT) * mix(1.0, 0.55, vT);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

/** Jagged bolt ribbon in the local XY plane from (0,0) to (0,1) (scaled by the mesh), with two side branches. */
function boltGeometry(rnd: () => number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], t: number[] = [], idx: number[] = [];
  const strand = (x0: number, y0: number, len: number, dirX: number, width: number, segs: number, t0: number) => {
    let x = x0, y = y0;
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const w = width * (1 - k * 0.7);
      pos.push(x - w, y, 0, x + w, y, 0);
      uv.push(0, k, 1, k);
      t.push(t0 + (1 - t0) * k, t0 + (1 - t0) * k);
      y -= len / segs;
      x += dirX * (len / segs) + (rnd() - 0.5) * (len / segs) * 0.9;
    }
    for (let i = 0; i < segs; i++) {
      const o = base + i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
  };
  // main strand from the cloud (y=1) down to the ground (y=0); t: 0 at the ground .. reversed via 1-k below
  const pts: [number, number][] = [];
  let x = 0;
  const segs = 22;
  for (let i = 0; i <= segs; i++) {
    pts.push([x, 1 - i / segs]);
    x += (rnd() - 0.5) * 0.09;
  }
  const base = 0;
  for (let i = 0; i <= segs; i++) {
    const [px, py] = pts[i];
    const w = 0.012;
    pos.push(px - w, py, 0, px + w, py, 0);
    uv.push(0, py, 1, py);
    t.push(1 - py, 1 - py);
  }
  for (let i = 0; i < segs; i++) {
    const o = base + i * 2;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  for (let b = 0; b < 2; b++) {
    const at = pts[4 + Math.floor(rnd() * 8)];
    strand(at[0], at[1], 0.18 + rnd() * 0.18, (rnd() < 0.5 ? -1 : 1) * 0.35, 0.007, 8, 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setIndex(idx);
  return g;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Lightning {
  readonly mesh: THREE.Mesh;
  private variants: THREE.BufferGeometry[] = [];
  private mat: THREE.ShaderMaterial;
  private next: number;
  private t = 99;
  private flashes: number[] = [0, 0.09, 0.2];
  private fired = 0;
  private dir = new THREE.Vector3();

  constructor(private env: ZoneEnv, private rnd: () => number, private flash?: (s: number) => void) {
    for (let i = 0; i < 4; i++) this.variants.push(boltGeometry(rnd));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: boltVert,
      fragmentShader: boltFrag,
      uniforms: { uBolt: { value: 0 }, uColor: { value: new THREE.Color().setStyle('#e6deff', THREE.NoColorSpace) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.variants[0], this.mat);
    this.mesh.name = 'lightning';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
    this.next = 4 + rnd() * 8;
  }

  /** Start a strike somewhere ahead of the camera; `withFlash` also flashes the atmosphere. */
  strike(focus: THREE.Vector3, camera: THREE.Camera, withFlash: boolean): void {
    const r = this.rnd;
    camera.getWorldDirection(this.dir);
    const yaw = Math.atan2(this.dir.x, this.dir.z) + (r() - 0.5) * 2.2;
    const dist = 110 + r() * 150;
    const x = focus.x + Math.sin(yaw) * dist, z = focus.z + Math.cos(yaw) * dist;
    const y = this.env.heightAt(x, z) - 4;
    const h = 150 + r() * 90;
    this.mesh.geometry = this.variants[Math.floor(r() * this.variants.length)];
    this.mesh.position.set(x, y, z);
    this.mesh.scale.set(h * (r() < 0.5 ? -1 : 1), h, 1);
    this.mesh.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), 0);
    this.t = 0;
    this.fired = withFlash ? 0 : this.flashes.length;
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 7 + this.rnd() * 15;
      this.strike(focus, camera, true);
    }
    this.t += dt;
    while (this.fired < this.flashes.length && this.t >= this.flashes[this.fired]) {
      this.flash?.(this.fired === 0 ? 0.85 : 0.55);
      this.fired++;
    }
    // flicker: three pulses over ~0.45 s
    const t = this.t;
    let b = 0;
    for (const f of this.flashes) {
      const d = t - f;
      if (d >= 0 && d < 0.14) b = Math.max(b, 1 - d / 0.14);
    }
    b = Math.max(b, t < 0.5 ? (1 - t / 0.5) * 0.25 : 0);
    this.mat.uniforms.uBolt.value = b * 1.6;
    this.mesh.visible = b > 0.002;
  }

  dispose(): void {
    for (const g of this.variants) g.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */

interface Layer {
  kind: string;
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  mat: THREE.ShaderMaterial;
}

/** Particle kind list of a zone: zone.particles, else the biome's. */
export function zoneParticleList(env: ZoneEnv): string[] {
  return env.def.particles ?? env.biome.particles ?? [];
}

function parseEntry(e: string): { kind: string; factor: number } {
  const [k, f] = e.split('*');
  const factor = f !== undefined ? Number(f) : 1;
  return { kind: k.trim(), factor: Number.isFinite(factor) ? Math.max(0, factor) : 1 };
}

export class ZoneParticles {
  readonly group = new THREE.Group();
  private layers: Layer[] = [];
  private pt = { value: 0 };
  private focusU = { value: new THREE.Vector3() };
  private lightning: Lightning | null = null;
  private focus = new THREE.Vector3();

  constructor(private env: ZoneEnv, list: string[], flash?: (strength: number) => void) {
    this.group.name = `particles:${env.def.id}`;
    const q = QUALITY_FACTOR[env.ctx.quality] ?? 1;
    const rnd = mulberry(hashId(env.def.id));
    const water = env.field.water ?? env.def.water?.level ?? null;
    const quad = new THREE.PlaneGeometry(1, 1);
    for (const entry of list) {
      const { kind, factor } = parseEntry(entry);
      if (kind === 'lightning') {
        if (!this.lightning) {
          this.lightning = new Lightning(env, rnd, flash);
          this.group.add(this.lightning.mesh);
        }
        continue;
      }
      const spec = (SPECS as Record<string, Spec | undefined>)[kind];
      if (!spec) {
        if (import.meta.env?.DEV) console.warn(`[world] unknown particle kind '${kind}' in ${env.def.id}`);
        continue;
      }
      const n = Math.max(kind === 'mist' ? 8 : 12, Math.round(spec.count * q * factor));
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = quad.index;
      geo.setAttribute('position', quad.attributes.position);
      const a = new Float32Array(n * 4), b = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) {
        a[i] = rnd();
        b[i] = rnd();
      }
      geo.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
      geo.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
      geo.instanceCount = n;
      const glow = spec.blend === GLOW;
      const colA = new THREE.Color(), colB = new THREE.Color();
      if (spec.blend === LIT) {
        colA.setStyle(spec.colA);
        colB.setStyle(spec.colB);
      } else {
        colA.setStyle(spec.colA, THREE.NoColorSpace);
        colB.setStyle(spec.colB, THREE.NoColorSpace);
      }
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: {
          uFogColor: ATMOS.uFogColor, uFogGlow: ATMOS.uFogGlow, uGlowDir: ATMOS.uGlowDir, uFogParams: ATMOS.uFogParams,
          uFogMax: ATMOS.uFogMax, uFogScale: { value: 1 },
          uWind: ATMOS.uWind, uNight: ATMOS.uNight, uLightColor: ATMOS.uLightColor, uHemiSky: ATMOS.uHemiSky,
          ...env.field.uniforms,
          uPT: this.pt,
          uFocus: this.focusU,
          uMode: { value: spec.mode },
          uShape: { value: spec.shape },
          uBlend: { value: spec.blend },
          uCycle: { value: spec.vel[1] !== 0 ? 1 : 0 },
          uBand: { value: new THREE.Vector2(spec.band[0], spec.band[1]) },
          uRadius: { value: spec.radius },
          uVel: { value: new THREE.Vector3(...spec.vel) },
          uMove: { value: new THREE.Vector4(spec.speedVar, spec.windK, spec.wander, spec.wanderHz) },
          uSize: { value: new THREE.Vector2(spec.size[0], spec.size[1]) },
          uStretch: { value: spec.stretch ?? 0 },
          uWater: { value: water ?? -1e4 },
          uVis: { value: new THREE.Vector2(spec.dayVis, spec.blink) },
          uNear: { value: new THREE.Vector2(...(spec.near ?? [0.25, 1.2])) },
          uIntensity: { value: spec.intensity },
          uColA: { value: new THREE.Vector3(colA.r, colA.g, colA.b) },
          uColB: { value: new THREE.Vector3(colB.r, colB.g, colB.b) },
        },
        transparent: true,
        depthWrite: false,
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: spec.blend === LIT,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `particles-${kind}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = spec.blend === FOG ? 1 : 2;
      this.group.add(mesh);
      this.layers.push({ kind, mesh, geo, mat });
    }
    quad.dispose();
  }

  /** Kinds actually built (for stats/tests). */
  get kinds(): string[] {
    const k = this.layers.map((l) => l.kind);
    if (this.lightning) k.push('lightning');
    return k;
  }

  /** A distant bolt now (the atmosphere flash is fired by the caller, e.g. a 'lightning' cue). */
  strike(camera: THREE.Camera): void {
    if (!this.lightning) {
      this.lightning = new Lightning(this.env, mulberry(hashId(this.env.def.id) + 11));
      this.group.add(this.lightning.mesh);
    }
    this.lightning.strike(this.focus, camera, false);
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.pt.value += Math.min(dt, 0.1);
    this.focus.copy(focus);
    this.focusU.value.copy(focus);
    this.lightning?.update(dt, focus, camera);
  }

  dispose(): void {
    for (const l of this.layers) {
      l.geo.dispose();
      l.mat.dispose();
    }
    this.lightning?.dispose();
    this.group.clear();
  }
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
