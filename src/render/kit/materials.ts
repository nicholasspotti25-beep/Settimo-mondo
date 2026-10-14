/**
 * Stylized PBR: MeshStandardMaterial patched through onBeforeCompile with
 *  - wrap / optional toon-ramp diffuse (painterly soft terminator),
 *  - rim light + fresnel (global rim color driven by the scene, per-material strength),
 *  - triplanar object-space detail map (albedo / roughness / cavity / crack mask) from a procedural DataTexture,
 *  - per-actor FX uniforms (hit flash, Colpo Rosso tint, Spezzato glowing cracks, aura, dissolve-into-light).
 * Programs are shared: every variant has a stable customProgramCacheKey.
 */
import * as THREE from 'three';
import { detailTexture, type DetailKind } from './textures';

export type ColorLike = string | number | THREE.Color;

/** Scene-wide uniforms shared by every kit material (the renderer updates them each frame). */
export interface KitGlobals {
  time: { value: number };
  rimColor: { value: THREE.Color };
  /** Global rim multiplier (time of day / act grading). */
  rimStrength: { value: number };
  /** Wrap lighting amount 0..1 (softer terminator). */
  wrap: { value: number };
}

/** Per-actor uniforms. One instance per actor visual; all of its materials reference it. */
export interface ActorFx {
  /** rgb = flash color, a = amount 0..1. */
  flash: { value: THREE.Vector4 };
  /** 0 = intact, 1 = fully dissolved into light. */
  dissolve: { value: number };
  dissolveColor: { value: THREE.Color };
  /** Spezzato cracks glow 0..1. */
  crack: { value: number };
  crackColor: { value: THREE.Color };
  /** rgb = aura color, a = strength (fresnel shell inside the material). */
  aura: { value: THREE.Vector4 };
}

export function createActorFx(): ActorFx {
  return {
    flash: { value: new THREE.Vector4(1, 1, 1, 0) },
    dissolve: { value: 0 },
    dissolveColor: { value: new THREE.Color('#fff1c0') },
    crack: { value: 0 },
    crackColor: { value: new THREE.Color('#ffd27a') },
    aura: { value: new THREE.Vector4(1, 1, 1, 0) },
  };
}

export interface SurfaceOpts {
  /** Base color (multiplied by vertex colors when vertexColors is on). Default white. */
  color?: ColorLike;
  roughness?: number;
  metalness?: number;
  emissive?: ColorLike;
  emissiveIntensity?: number;
  /** Procedural detail map kind (default 'noise'; null disables). */
  detail?: DetailKind | null;
  /** Detail frequency in cycles per meter (object space). Default 1.2. */
  detailScale?: number;
  /** Detail strength 0..1. Default 0.6. */
  detailStrength?: number;
  /** Rim multiplier (default 1). */
  rim?: number;
  /** Rim falloff exponent (default 3). */
  rimPower?: number;
  /** Toon-ish banded diffuse. */
  toon?: boolean;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  alphaTest?: number;
  map?: THREE.Texture | null;
  flatShading?: boolean;
  depthWrite?: boolean;
  /** Fog off for skyboxes/huge distant things. */
  fog?: boolean;
}

const LIGHT_PARS_PATCHED = (() => {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const needle = 'vec3 irradiance = dotNL * directLight.color;';
  if (!src.includes(needle)) return src;
  return src.replace(needle, 'vec3 irradiance = smLightRamp( dot( geometryNormal, directLight.direction ) ) * directLight.color;');
})();

const VERT_HEAD = /* glsl */ `
varying vec3 vSmObj;
varying vec3 vSmObjN;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vSmObj;
varying vec3 vSmObjN;
uniform float uSmTime;
uniform vec3 uSmRim;
uniform vec2 uSmRimP; // x = strength, y = power
uniform float uSmRimG; // global multiplier
uniform float uSmWrap;
#ifdef SM_DETAIL
uniform sampler2D uSmDetail;
uniform vec2 uSmDetailP; // x = scale, y = strength
#endif
#ifdef SM_FX
uniform vec4 uSmFlash;
uniform float uSmDissolve;
uniform vec3 uSmDissolveCol;
uniform float uSmCrack;
uniform vec3 uSmCrackCol;
uniform vec4 uSmAura;
float smHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float smNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( smHash( i + vec3( 0, 0, 0 ) ), smHash( i + vec3( 1, 0, 0 ) ), f.x ),
                   mix( smHash( i + vec3( 0, 1, 0 ) ), smHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( smHash( i + vec3( 0, 0, 1 ) ), smHash( i + vec3( 1, 0, 1 ) ), f.x ),
                   mix( smHash( i + vec3( 0, 1, 1 ) ), smHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
#endif
float smLightRamp( float ndl ) {
  float w = clamp( ( ndl + uSmWrap ) / ( 1.0 + uSmWrap ), 0.0, 1.0 );
  #ifdef SM_TOON
  w = mix( w, smoothstep( 0.28, 0.40, w ) * 0.82 + smoothstep( 0.72, 0.8, w ) * 0.18, 0.75 );
  #endif
  return w;
}
#ifdef SM_DETAIL
vec4 smTri( vec3 p, vec3 n ) {
  vec3 w = abs( n );
  w = w * w * w * w;
  w /= ( w.x + w.y + w.z + 1e-4 );
  return texture2D( uSmDetail, p.zy ) * w.x + texture2D( uSmDetail, p.xz ) * w.y + texture2D( uSmDetail, p.xy ) * w.z;
}
#endif
`;

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms, u: Record<string, THREE.IUniform>): void {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSmObj = position; vSmObjN = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
    .replace('#include <lights_physical_pars_fragment>', LIGHT_PARS_PATCHED)
    .replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  float smDn = 1.0;
  #ifdef SM_FX
  if ( uSmDissolve > 0.0 ) {
    smDn = smNoise( vSmObj * 2.1 ) * 0.7 + smNoise( vSmObj * 6.3 + 3.1 ) * 0.3;
    if ( smDn < uSmDissolve * 1.08 - 0.02 ) discard;
  }
  #endif`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  #ifdef SM_DETAIL
  vec4 smD = smTri( vSmObj * uSmDetailP.x, vSmObjN );
  diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.5 + smD.r ) * mix( 1.0, smD.b, 0.65 ), uSmDetailP.y );
  #endif`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
  #ifdef SM_DETAIL
  roughnessFactor = clamp( roughnessFactor + ( smD.g - 0.5 ) * 0.6 * uSmDetailP.y, 0.04, 1.0 );
  #endif`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  #ifdef SM_FX
  #ifdef SM_DETAIL
  totalEmissiveRadiance += uSmCrackCol * smoothstep( 0.45, 0.85, smD.a ) * uSmCrack * 2.2;
  #endif
  if ( uSmDissolve > 0.0 ) totalEmissiveRadiance += uSmDissolveCol * ( 1.0 - smoothstep( 0.0, 0.09, smDn - uSmDissolve * 1.08 + 0.02 ) ) * 4.0;
  #endif`,
    )
    .replace(
      '#include <opaque_fragment>',
      `float smNV = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  outgoingLight += uSmRim * pow( smNV, uSmRimP.y ) * uSmRimP.x * uSmRimG;
  #ifdef SM_FX
  outgoingLight += uSmAura.rgb * pow( smNV, 1.6 ) * uSmAura.a;
  outgoingLight = mix( outgoingLight, uSmFlash.rgb, uSmFlash.a * ( 0.45 + 0.55 * smNV ) );
  #endif
  #include <opaque_fragment>`,
    );
}

const NEUTRAL_FX = createActorFx();

/**
 * Create a stylized material. `globals` are shared scene uniforms; `fx` (optional) binds per-actor effects.
 * Not cached: callers cache (Kit.mat) or own (ModelBuilder surfaces) the result.
 */
export function createStylized(o: SurfaceOpts, globals: KitGlobals, fx: ActorFx | null): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: o.color !== undefined ? new THREE.Color(o.color as THREE.ColorRepresentation) : new THREE.Color(0xffffff),
    roughness: o.roughness ?? 0.75,
    metalness: o.metalness ?? 0.05,
    emissive: o.emissive !== undefined ? new THREE.Color(o.emissive as THREE.ColorRepresentation) : new THREE.Color(0),
    emissiveIntensity: o.emissiveIntensity ?? 1,
    vertexColors: o.vertexColors ?? false,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    alphaTest: o.alphaTest ?? 0,
    map: o.map ?? null,
    flatShading: o.flatShading ?? false,
    depthWrite: o.depthWrite ?? true,
    fog: o.fog ?? true,
  });
  const detail = o.detail === undefined ? 'noise' : o.detail;
  const defines: Record<string, string> = {};
  if (detail) defines.SM_DETAIL = '';
  if (o.toon) defines.SM_TOON = '';
  if (fx) defines.SM_FX = '';
  m.defines = defines;
  const f = fx ?? NEUTRAL_FX;
  const uniforms: Record<string, THREE.IUniform> = {
    uSmTime: globals.time,
    uSmRim: globals.rimColor,
    uSmRimP: { value: new THREE.Vector2(o.rim ?? 1, o.rimPower ?? 3) },
    uSmRimG: globals.rimStrength,
    uSmWrap: globals.wrap,
    uSmFlash: f.flash,
    uSmDissolve: f.dissolve,
    uSmDissolveCol: f.dissolveColor,
    uSmCrack: f.crack,
    uSmCrackCol: f.crackColor,
    uSmAura: f.aura,
  };
  if (detail) {
    uniforms.uSmDetail = { value: detailTexture(detail) };
    uniforms.uSmDetailP = { value: new THREE.Vector2(o.detailScale ?? 1.2, o.detailStrength ?? 0.6) };
  }
  m.userData.smUniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    patchShader(shader, m.userData.smUniforms as Record<string, THREE.IUniform>);
    m.userData.smShader = shader;
  };
  const key = `sm1|${detail ? 'd' : ''}|${o.toon ? 't' : ''}|${fx ? 'f' : ''}`;
  m.customProgramCacheKey = () => key;
  return m;
}

/** Per-material rim strength (e.g. brighten a boss's rim in a phase change). */
export function setRim(m: THREE.Material, strength: number): void {
  const u = m.userData.smUniforms as Record<string, THREE.IUniform> | undefined;
  if (u) (u.uSmRimP.value as THREE.Vector2).x = strength;
}

/**
 * Fresnel shell material (additive): auras, spectral wraps, ghost/illusion bodies, Metamondo glass.
 * Works on skinned meshes (skinning is injected automatically by three).
 */
export function createFresnel(color: ColorLike, opts: { power?: number; strength?: number; inflate?: number; core?: number; time?: { value: number }; flow?: number } = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color as THREE.ColorRepresentation) },
      uPower: { value: opts.power ?? 2.2 },
      uStrength: { value: opts.strength ?? 1.4 },
      uInflate: { value: opts.inflate ?? 0 },
      uCore: { value: opts.core ?? 0.08 },
      uTime: opts.time ?? { value: 0 },
      uFlow: { value: opts.flow ?? 0 },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uInflate;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        transformed += normalize( objectNormal ) * uInflate;
        #include <skinning_vertex>
        vP = position;
        vec4 mv = modelViewMatrix * vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
        mv = modelViewMatrix * instanceMatrix * vec4( transformed, 1.0 );
        #endif
        vN = normalize( normalMatrix * objectNormal );
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uStrength;
      uniform float uCore;
      uniform float uTime;
      uniform float uFlow;
      uniform float uFade;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float f = 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) );
        float a = pow( f, uPower ) * uStrength + uCore;
        if ( uFlow > 0.0 ) {
          float w = 0.5 + 0.5 * sin( vP.y * 3.0 - uTime * 4.0 + sin( vP.x * 2.0 + uTime ) * 1.5 );
          a *= mix( 1.0, 0.45 + w, uFlow );
        }
        gl_FragColor = vec4( uColor * a * uFade, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return m;
}
