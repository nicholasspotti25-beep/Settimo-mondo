/**
 * World materials: three's Lambert/Standard materials patched (onBeforeCompile) with
 *  - the shared atmosphere fog (height fog + in-scattering toward the twilight glow),
 *  - world-space procedural detail (color breakup, baked AO from geometry, moss/snow/ash coverage on upward faces),
 *  - wind sway (vertex attribute aParams.x), emissive accents (aParams.y, brighter at night), rim light toward the glow.
 * Geometry attributes: `color` (vertex color, linear), `aParams` vec4 (wind, emissive, cover, ao).
 * Missing aParams defaults to (0,0,0,1) in WebGL, i.e. no wind, no glow, no coverage, full AO.
 */
import * as THREE from 'three';
import { ATMOS } from './atmosphere';
import { GLSL_ATMOS_FRAG, GLSL_ATMOS_PARS, GLSL_ATMOS_VERT, GLSL_NOISE } from './glsl';

export type WorldMatKind = 'matte' | 'gloss' | 'metal' | 'glass' | 'glow' | 'foliage' | 'impostor';

export interface WorldMatOpts {
  /** World-space noise scale for color breakup (default 0.35). */
  detail?: number;
  /** Strength of color breakup 0..1 (default 0.35). */
  breakup?: number;
  /** Rim light strength (default 0.35). */
  rim?: number;
  /** Fog distance multiplier (impostors < 1). */
  fogScale?: number;
  side?: THREE.Side;
  opacity?: number;
  /** Multiplier on coverage (moss/snow) for this material. */
  cover?: number;
  flat?: boolean;
}

const VERT_PARS = /* glsl */ `
attribute vec4 aParams;
varying vec4 vParams;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vAtmWorld;
uniform float uTime;
uniform vec4 uWind;
${GLSL_NOISE}
`;

const VERT_WIND = /* glsl */ `
vParams = aParams;
{
  float wk = aParams.x;
  if (wk > 0.0) {
    vec3 org = vec3(0.0);
    #ifdef USE_INSTANCING
      org = instanceMatrix[3].xyz;
    #endif
    org = (modelMatrix * vec4(org, 1.0)).xyz;
    float ph = dot(org.xz, vec2(0.13, 0.17));
    float gust = 0.6 + 0.8 * smNoise2(org.xz * 0.02 - uWind.xy * uTime * 0.35) * (0.5 + uWind.w);
    float sway = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * gust * uWind.z;
    vec3 wl = vec3(uWind.x, 0.0, uWind.y) * (sway + gust * 0.6 * uWind.z);
    #ifdef USE_INSTANCING
      wl = (vec4(wl, 0.0) * instanceMatrix).xyz / max(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 1e-4);
    #endif
    float flutter = sin(uTime * 7.0 + position.x * 3.0 + position.y * 2.0 + ph) * 0.03 * step(0.5, wk);
    transformed += (wl * 0.06 + vec3(flutter)) * wk * wk;
  }
}
`;

const VERT_WORLD = /* glsl */ `
{
  vec4 wp = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3(instanceMatrix) * wn;
  #endif
  wp = modelMatrix * wp;
  vWPos = wp.xyz;
  vWNrm = normalize(mat3(modelMatrix) * wn);
}
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vParams;
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec3 vAtmWorld;
uniform float uTime;
uniform float uDetail;
uniform float uBreakup;
uniform float uRim;
uniform float uCoverMul;
uniform vec3 uCoverColor;
uniform float uCoverAmount;
uniform float uGlowBoost;
uniform vec3 uLightColor;
${GLSL_NOISE}
${GLSL_ATMOS_PARS}
`;

const FRAG_COLOR = /* glsl */ `
{
  vec3 q = vWPos * uDetail;
  float n1 = smNoise3(q);
  float n2 = smNoise3(q * 3.7 + 11.0);
  float br = (n1 * 0.65 + n2 * 0.35) - 0.5;
  diffuseColor.rgb *= 1.0 + br * uBreakup;
  diffuseColor.rgb *= mix(1.0, vParams.w, 1.0);
  float up = clamp(vWNrm.y, 0.0, 1.0);
  float cov = smoothstep(0.55, 0.85, up + (n1 - 0.5) * 0.5) * vParams.z * uCoverMul * uCoverAmount;
  diffuseColor.rgb = mix(diffuseColor.rgb, uCoverColor * (0.85 + n2 * 0.3), clamp(cov, 0.0, 1.0));
}
`;

const FRAG_EMISSIVE = /* glsl */ `
{
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    vec3 ec = vColor.rgb;
  #else
    vec3 ec = diffuse;
  #endif
  totalEmissiveRadiance += ec * vParams.y * uGlowBoost * 2.2;
}
`;

const FRAG_RIM = /* glsl */ `
{
  vec3 vd = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.0);
  vec3 wv = normalize(vWPos - cameraPosition);
  float facing = 0.35 + 0.65 * max(dot(wv, uGlowDir), 0.0);
  outgoingLight += fres * facing * uRim * uLightColor * (diffuseColor.rgb * 0.6 + 0.08);
}
`;

const cache = new Map<string, THREE.Material>();

function patch(mat: THREE.Material, o: WorldMatOpts, rim: boolean): void {
  const local = {
    uDetail: { value: o.detail ?? 0.35 },
    uBreakup: { value: o.breakup ?? 0.35 },
    uRim: { value: o.rim ?? 0.35 },
    uCoverMul: { value: o.cover ?? 1 },
    uFogScale: { value: o.fogScale ?? 1 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: ATMOS.uTime, uWind: ATMOS.uWind, uFogColor: ATMOS.uFogColor, uFogGlow: ATMOS.uFogGlow, uGlowDir: ATMOS.uGlowDir,
      uFogParams: ATMOS.uFogParams, uFogMax: ATMOS.uFogMax, uCoverColor: ATMOS.uCoverColor, uCoverAmount: ATMOS.uCoverAmount,
      uGlowBoost: ATMOS.uGlowBoost, uLightColor: ATMOS.uLightColor,
      ...local,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_WIND}\n${VERT_WORLD}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${GLSL_ATMOS_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`)
      .replace('#include <fog_fragment>', GLSL_ATMOS_FRAG);
    if (rim) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${FRAG_RIM}\n#include <opaque_fragment>`);
    }
  };
  mat.customProgramCacheKey = () => `sm-world-${rim ? 1 : 0}`;
}

/**
 * Shared world material by kind (cached). All world geometry uses vertex colors, so one material serves many objects.
 */
export function worldMat(kind: WorldMatKind, o: WorldMatOpts = {}): THREE.Material {
  const key = `${kind}:${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  switch (kind) {
    case 'gloss':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, side: o.side ?? THREE.FrontSide, flatShading: o.flat ?? false });
      patch(m, { breakup: 0.18, ...o }, true);
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.75, side: o.side ?? THREE.FrontSide, flatShading: o.flat ?? false });
      patch(m, { breakup: 0.25, ...o }, true);
      break;
    case 'glass':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: o.opacity ?? 0.35, depthWrite: false, side: o.side ?? THREE.DoubleSide });
      patch(m, { breakup: 0.05, ...o }, true);
      break;
    case 'glow': {
      const b = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o.opacity ?? 1, blending: THREE.AdditiveBlending, depthWrite: false, side: o.side ?? THREE.DoubleSide, toneMapped: false });
      b.fog = false;
      m = b;
      break;
    }
    case 'foliage':
      m = new THREE.MeshLambertMaterial({ vertexColors: true, side: o.side ?? THREE.DoubleSide, flatShading: o.flat ?? false });
      patch(m, { breakup: 0.3, detail: 0.6, ...o }, true);
      break;
    case 'impostor':
      m = new THREE.MeshLambertMaterial({ vertexColors: true, side: o.side ?? THREE.FrontSide, flatShading: o.flat ?? false });
      patch(m, { breakup: 0.25, detail: 0.02, fogScale: 0.22, rim: 0.2, ...o }, false);
      break;
    default:
      m = new THREE.MeshLambertMaterial({ vertexColors: true, side: o.side ?? THREE.FrontSide, flatShading: o.flat ?? false });
      patch(m, o, true);
      break;
  }
  m.name = `world-${kind}`;
  cache.set(key, m);
  return m;
}

/**
 * Patch any custom ShaderMaterial-free three material so it uses the world atmosphere fog (for other streams' materials
 * that want to sit in the world, e.g. arena dressing built with kit materials). Safe to call once per material.
 */
export function useWorldFog(mat: THREE.Material, fogScale = 1): THREE.Material {
  const prev = mat.onBeforeCompile;
  const fs = { value: fogScale };
  mat.onBeforeCompile = (shader, r) => {
    prev.call(mat, shader, r);
    Object.assign(shader.uniforms, { uFogColor: ATMOS.uFogColor, uFogGlow: ATMOS.uFogGlow, uGlowDir: ATMOS.uGlowDir, uFogParams: ATMOS.uFogParams, uFogMax: ATMOS.uFogMax, uFogScale: fs });
    if (!shader.vertexShader.includes('vAtmWorld')) {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAtmWorld;').replace('#include <fog_vertex>', `#include <fog_vertex>\n${GLSL_ATMOS_VERT}`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vAtmWorld;\n${GLSL_ATMOS_PARS}`).replace('#include <fog_fragment>', GLSL_ATMOS_FRAG);
    }
  };
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}-smfog`;
  mat.needsUpdate = true;
  return mat;
}

/** Shader-material helpers: uniforms + chunks for custom world shaders (water, grass, particles, gates). */
export function atmosUniforms(fogScale = 1): Record<string, THREE.IUniform> {
  return {
    uTime: ATMOS.uTime, uFogColor: ATMOS.uFogColor, uFogGlow: ATMOS.uFogGlow, uGlowDir: ATMOS.uGlowDir, uFogParams: ATMOS.uFogParams,
    uFogMax: ATMOS.uFogMax, uFogScale: { value: fogScale },
  };
}

export function disposeWorldMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
