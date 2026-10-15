/**
 * Water surfaces, all one shader with per-kind looks (display-space, like the sky, so reflections match it exactly):
 *  swamp  - murky olive water, floating scum, mist-soft reflections
 *  souls  - the River of Souls: black, mirror-still, luminous lights drifting with the current
 *  river  - cold flowing river (streaks along the flow)
 *  sea    - the night sea: dark swells, crest foam, long glints toward the twilight glow
 *  mirror - the mirror lake: near-perfect reflection of the sky, faint rings
 *  lava   - molten rivers: emissive cells, crust, heat glow
 *  cloud  - the cloud sea (Yggdrasil, Terrazze Celesti): soft billowing tops lit by the glow
 *  ice    - frozen lake (Cocito): cracked pale ice with deep blue
 * Shoreline foam/softening comes from the zone field (terrain height vs water level).
 */
import * as THREE from 'three';
import type { ZoneDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import { ATMOS } from './atmosphere';
import type { BiomeDef } from './biomes';
import type { ZoneEnv } from './env';
import { GLSL_ATMOS_PARS, GLSL_NOISE, GLSL_SKY_PARS } from './glsl';
import { GLSL_FIELD } from './terrain';

export type WaterKind = 'swamp' | 'souls' | 'river' | 'sea' | 'mirror' | 'lava' | 'cloud' | 'ice';
const KINDS: WaterKind[] = ['swamp', 'souls', 'river', 'sea', 'mirror', 'lava', 'cloud', 'ice'];

export function waterKindFor(def: ZoneDef, biome: BiomeDef): WaterKind | null {
  const k = def.water?.kind ?? (def.terrain.water_level !== undefined ? biome.water : undefined) ?? (def.water ? biome.water : undefined);
  if (!k) return null;
  return (KINDS as string[]).includes(k) ? (k as WaterKind) : 'swamp';
}

const vert = /* glsl */ `
varying vec3 vW;
uniform float uTime;
uniform float uWaveAmp;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y += (sin(w.x * 0.08 + uTime * 0.7) * 0.5 + sin(w.z * 0.11 - uTime * 0.9) * 0.5) * uWaveAmp;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vW;
uniform float uTime;
uniform int uKind;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uAccent;
uniform vec2 uFlow;
uniform float uLevel;
uniform float uNight;
uniform float uGlowBoost;
uniform float uFlash;
${GLSL_NOISE}
${GLSL_ATMOS_PARS}
${GLSL_SKY_PARS}
${GLSL_FIELD}

vec2 waveGrad(vec2 p, float t) {
  float e = 0.35;
  float a = smFbm2x3(p + t), b = smFbm2x3(p + vec2(e, 0.0) + t), c = smFbm2x3(p + vec2(0.0, e) + t);
  return vec2(b - a, c - a) / e;
}

void main() {
  vec3 ray = vW - cameraPosition;
  float dist = length(ray);
  vec3 V = ray / max(dist, 1e-3);
  float t = uTime;
  vec2 p = vW.xz;
  vec4 fld = smField(p);
  float inF = smInField(p);
  float depth = mix(8.0, uLevel - fld.r, inF);
  float shore = 1.0 - smoothstep(0.0, 0.9, depth);

  vec3 col;
  float alpha = 1.0;
  if (uKind == 5) {
    // lava
    vec2 q = p * 0.08 + uFlow * t * 0.05;
    float n = smFbm2(q * 2.0 + smFbm2x3(q * 3.0 - t * 0.04) * 1.5);
    float crust = smoothstep(0.42, 0.62, n);
    float veins = 1.0 - smoothstep(0.0, 0.08, abs(n - 0.45));
    vec3 hot = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.82, 0.35), smNoise2(q * 9.0 + t * 0.3));
    col = mix(hot * 1.6, vec3(0.1, 0.05, 0.05), crust) + vec3(1.0, 0.5, 0.15) * veins * 0.8 * crust;
    col += vec3(1.0, 0.4, 0.1) * shore * 0.5;
  } else if (uKind == 6) {
    // cloud sea
    vec2 q = p * 0.012 + uFlow * t * 0.004;
    float n = smFbm2(q * 2.0) * 0.65 + smFbm2(q * 6.0 + 3.0) * 0.35;
    float lit = pow(max(dot(normalize(vec3(V.x, 0.25, V.z)), uGlowDir), 0.0), 3.0);
    vec3 top = mix(uShallow, uGlow * 1.05, lit * 0.5 + n * 0.25);
    col = mix(uDeep, top, smoothstep(0.25, 0.75, n));
    col *= uSkyBright;
  } else if (uKind == 7) {
    // ice
    float c1 = abs(smNoise2(p * 0.35 + smNoise2(p * 1.4) * 1.6) - 0.5);
    float cracks = smoothstep(0.03, 0.0, c1);
    float frost = smFbm2x3(p * 0.5);
    vec3 refl = smSkyGradient(reflect(V, vec3(0.0, 1.0, 0.0)));
    col = mix(uDeep, uShallow, frost * 0.6 + 0.2);
    col = mix(col, refl, 0.25) + vec3(0.9, 0.95, 1.0) * cracks * 0.35;
  } else {
    float amp = uKind == 3 ? 0.55 : uKind == 4 ? 0.04 : uKind == 1 ? 0.06 : uKind == 0 ? 0.12 : 0.3;
    float sc = uKind == 3 ? 0.09 : 0.35;
    vec2 g = waveGrad(p * sc + uFlow * t * 0.08, t * (uKind == 3 ? 0.12 : 0.05));
    if (uKind == 2) g += vec2(smNoise2(vec2(p.x * 0.2, p.y * 2.0) - uFlow * t * 0.6) - 0.5) * 0.6;
    vec3 N = normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
    vec3 R = reflect(V, N);
    R.y = abs(R.y);
    vec3 refl = smSkyGradient(R);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
    if (uKind == 4) fres = 0.55 + 0.45 * fres;
    if (uKind == 1) fres = 0.25 + 0.5 * fres;
    vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 4.0, depth));
    col = mix(body, refl, fres);
    // glints toward the glow
    float spec = pow(max(dot(R, uGlowDir), 0.0), uKind == 3 ? 90.0 : 220.0);
    col += uGlow * spec * (uKind == 1 ? 0.4 : 1.2);
    if (uKind == 3) {
      float crest = smoothstep(0.62, 0.9, smFbm2(p * 0.05 + uFlow * t * 0.03 + g * 0.2));
      col = mix(col, vec3(0.75, 0.8, 0.85) * uSkyBright, crest * 0.35);
    }
    if (uKind == 0) {
      float scum = smoothstep(0.55, 0.8, smFbm2(p * 0.12 + 7.0)) * 0.55;
      col = mix(col, uAccent, scum);
    }
    if (uKind == 1) {
      // drifting soul lights below the black surface
      vec2 q = p * 0.22 - uFlow * t * 0.35;
      vec2 id = floor(q);
      vec2 f = fract(q) - 0.5;
      vec2 o = (smHash22(id) - 0.5) * 0.7;
      float h = smHash12(id + 3.1);
      float pulse = 0.6 + 0.4 * sin(t * (1.0 + h * 2.0) + h * 30.0);
      float light = smoothstep(0.16, 0.0, length(f - o)) * step(0.72, h) * pulse;
      vec2 q2 = p * 0.07 - uFlow * t * 0.2 + 13.0;
      vec2 id2 = floor(q2);
      vec2 f2 = fract(q2) - 0.5;
      float h2 = smHash12(id2);
      float light2 = smoothstep(0.3, 0.0, length(f2 - (smHash22(id2) - 0.5) * 0.5)) * step(0.6, h2);
      col += uAccent * (light * 1.6 + light2 * 0.45) * uGlowBoost;
    }
  }
  // shore foam/softening
  if (uKind != 5 && uKind != 6) {
    float foam = shore * (0.5 + 0.5 * smNoise2(p * 1.8 + t * 0.3));
    col = mix(col, uShallow * 1.4 + 0.05, foam * (uKind == 1 ? 0.15 : 0.35));
  }
  col += vec3(0.6, 0.6, 0.75) * uFlash * 0.25;
  // fog
  float fa = smFogAmount(ray, dist);
  col = mix(col, smFogColor(V), fa);
  gl_FragColor = vec4(max(col, 0.0), alpha);
}
`;

const LOOK: Record<WaterKind, { deep: string; shallow: string; accent: string; wave: number; flow: [number, number] }> = {
  swamp: { deep: '#141a12', shallow: '#3a4228', accent: '#4a5230', wave: 0.02, flow: [0.2, 0.1] },
  souls: { deep: '#020306', shallow: '#0a0e16', accent: '#bfe2ff', wave: 0.0, flow: [0.0, 1.0] },
  river: { deep: '#0e1a24', shallow: '#3a5a6a', accent: '#cfe6f0', wave: 0.05, flow: [0.0, 1.0] },
  sea: { deep: '#06101a', shallow: '#1a3448', accent: '#cfe0ea', wave: 0.6, flow: [0.6, 0.8] },
  mirror: { deep: '#0e1420', shallow: '#2a3a48', accent: '#ffffff', wave: 0.0, flow: [0.1, 0.1] },
  lava: { deep: '#2a0a04', shallow: '#ff6a1a', accent: '#ffd27a', wave: 0.08, flow: [0.3, 1.0] },
  cloud: { deep: '#8a84a8', shallow: '#f4eef8', accent: '#ffffff', wave: 0.0, flow: [1.0, 0.3] },
  ice: { deep: '#3a6a90', shallow: '#cfe6f6', accent: '#ffffff', wave: 0.0, flow: [0, 0] },
};

export class WaterSurface {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(env: ZoneEnv, readonly kind: WaterKind) {
    const def = env.def;
    const level = env.field.water ?? def.water?.level ?? 0;
    const L = LOOK[kind];
    const ext = env.backdrop === 'water' || kind === 'sea' || kind === 'cloud' ? 900 : 60;
    const area = def.water?.area;
    const [w, d] = def.size;
    const x0 = area ? area[0] : -w / 2 - ext, z0 = area ? area[1] : -d / 2 - ext;
    const x1 = area ? area[2] : w / 2 + ext, z1 = area ? area[3] : d / 2 + ext;
    const seg = kind === 'sea' ? (env.ctx.quality === 'low' ? 48 : 96) : 8;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...ATMOS,
        ...env.field.uniforms,
        uFogScale: { value: 1 },
        uKind: { value: KINDS.indexOf(kind) },
        uDeep: { value: new THREE.Color().setStyle(L.deep, THREE.NoColorSpace) },
        uShallow: { value: new THREE.Color().setStyle(L.shallow, THREE.NoColorSpace) },
        uAccent: { value: new THREE.Color().setStyle(L.accent, THREE.NoColorSpace) },
        uFlow: { value: new THREE.Vector2(...L.flow).normalize().multiplyScalar(kind === 'ice' ? 0 : 1) },
        uLevel: { value: level },
        uWaveAmp: { value: L.wave },
      },
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = level;
    this.mesh.name = `water:${kind}`;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
  }

  update(_sim: Sim, _dt: number, _camera: THREE.Camera): void {
    // all animation is in the shader (shared ATMOS time); kept for API symmetry with other zone parts
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
