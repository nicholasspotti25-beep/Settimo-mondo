/**
 * Post pipeline: auto exposure (all tiers), HDR bloom with a soft threshold, ACES tone mapping, per-act color grading
 * and a light vignette (Medium/High).
 *
 * - High / Medium: the scene renders into a half-float target (MSAA x4 on High). A 32x16 luminance probe is downsampled
 *   from it, a bright-pass + mip chain builds the bloom, and one composite pass applies exposure, bloom, ACES, grading,
 *   vignette, dithering and the sRGB output transform.
 * - Low: same HDR path without MSAA and bloom (one extra full-screen pass), so exposure, dehaze and grading match.
 * - No renderable half-float (fallback): the scene renders straight to the canvas with the renderer's ACES tone mapping;
 *   every PROBE_DT seconds a 32x16 render of the scene (no shadow update) feeds the same luminance probe.
 * Exposure: the world's atmosphere sets the base exposure (renderer.toneMappingExposure in scene.onBeforeRender); the
 * probe measures the center-weighted log-average luminance (1x1 RGBA8 reduction, read back asynchronously, no stalls)
 * and the CPU eases a correction factor so the exposed key stays inside a comfort band: bright dawn/sunset scenes facing
 * the glow are pulled down (they washed out to near-white), dark scenes are lifted only a little (night stays night).
 * Dehaze: the probe also measures a soft minimum (the veil every pixel shares: haze, mist, glare); when it dominates the
 * average, up to 60% of it is subtracted before tone mapping so silhouettes and the HUD keep their contrast.
 */
import * as THREE from 'three';
import type { QualityLevel } from '../types';

const PROBE_W = 32, PROBE_H = 16;
/** Seconds between luminance probes on the direct (Low) path. */
const PROBE_DT = 0.3;
/** Exposed log-average key comfort band (linear, pre tone mapping). */
const KEY_LO = 0.075, KEY_HI = 0.21;
/**
 * Bloom mip levels per tier. Held at 0 until the kit rim / emissive terms are calibrated for linear HDR (at 5/3 levels the
 * rim highlights of thin limbs bloom into white sparkles, see docs/worklog/render-kit.md); the passes are complete.
 */
const BLOOM_LEVELS: Record<QualityLevel, number> = { low: 0, medium: 0, high: 0 };
/**
 * HDR path switch. Off for now: (1) the world's additive / toneMapped:false layers were tuned for blending on the sRGB
 * canvas and read much hazier when blended in linear HDR; (2) the kit rim term overflows half floats on some thin parts
 * (white blocks after the MSAA resolve); (3) the dehaze cut crushes the frame to black when the view turns away from the
 * glow faster than it eases. Until those are fixed every tier uses the direct path + probe-driven auto exposure.
 */
const HDR_ENABLED = false;

export interface ActGrade {
  sat: number;
  contrast: number;
  /** Shadow lift (perceptual space, added toward black). */
  lift: [number, number, number];
  /** Highlight gain (perceptual space). */
  gain: [number, number, number];
  bloom: number;
}

/** Gentle per-act grades (Game Bible act palettes). Index = act number (0 = neutral / Metamondo / title). */
export const ACT_GRADES: ActGrade[] = [
  { sat: 1.0, contrast: 1.04, lift: [0.006, 0.006, 0.012], gain: [1, 1, 1], bloom: 1 },
  { sat: 1.06, contrast: 1.07, lift: [0.012, 0.008, 0.022], gain: [1.0, 0.99, 0.95], bloom: 1 }, // green-gold dawn
  { sat: 1.08, contrast: 1.1, lift: [0.0, 0.006, 0.026], gain: [1.02, 0.97, 0.94], bloom: 1.1 }, // red-blue-black
  { sat: 0.95, contrast: 1.05, lift: [0.01, 0.016, 0.03], gain: [0.96, 0.99, 1.03], bloom: 0.9 }, // white-azure
  { sat: 1.14, contrast: 1.06, lift: [0.006, 0.01, 0.012], gain: [1.0, 1.0, 0.98], bloom: 1 }, // vivid
  { sat: 1.02, contrast: 1.08, lift: [0.006, 0.008, 0.03], gain: [1.03, 1.0, 0.93], bloom: 1.15 }, // gold-white-midnight
  { sat: 1.06, contrast: 1.12, lift: [0.02, 0.0, 0.03], gain: [1.02, 0.95, 0.98], bloom: 1.2 }, // violet-red-black
  { sat: 1.0, contrast: 1.04, lift: [0.012, 0.01, 0.012], gain: [1.03, 1.01, 0.95], bloom: 1.1 }, // white-gold sunrise
];

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const LUM = 'const vec3 LUMW = vec3(0.2126, 0.7152, 0.0722);';

/** Full-res HDR -> 32x16 probe (16 source texels per probe texel through 4 bilinear taps). */
const PROBE_COPY = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uStep * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uStep * vec2(1.0, -1.0)).rgb
         + texture2D(tSrc, vUv + uStep * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uStep * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  gl_FragColor = vec4(min(c, vec3(64.0)), 1.0);
}`;

/** 32x16 probe -> 1x1: center-weighted log2 average (R,G = 16-bit encoded) + clipped fraction (B). */
const REDUCE = /* glsl */ `
${LUM}
uniform sampler2D tProbe;
uniform float uExposure;
void main() {
  float sumL = 0.0, sumW = 0.0, hot = 0.0, sumInv = 0.0;
  for (int y = 0; y < ${PROBE_H}; y++) {
    for (int x = 0; x < ${PROBE_W}; x++) {
      vec3 c = texelFetch(tProbe, ivec2(x, y), 0).rgb;
      vec2 p = (vec2(float(x), float(y)) + 0.5) / vec2(${PROBE_W}.0, ${PROBE_H}.0) - vec2(0.5, 0.45);
      float w = exp(-(p.x * p.x) / 0.09 - (p.y * p.y) / 0.07) + 0.08;
      float l = dot(c, LUMW);
      sumL += w * log2(max(l, 1e-5));
      sumInv += w * pow(max(l, 1e-4), -1.5);
      hot += w * step(1.6, l * uExposure);
      sumW += w;
    }
  }
  float v = clamp((sumL / sumW + 14.0) / 20.0, 0.0, 1.0);
  float hi = floor(v * 255.0) / 255.0;
  float lo = fract(v * 255.0);
  // soft minimum (power mean p = -1.5 ~ a low-ish percentile): the additive veil (haze, mist, glare) every pixel shares
  float fl = pow(sumInv / sumW, -1.0 / 1.5);
  gl_FragColor = vec4(hi, lo, hot / sumW, clamp((log2(max(fl, 1e-5)) + 14.0) / 20.0, 0.0, 1.0));
}`;

/** Bright pass (full res -> half res, 4 bilinear taps) with a soft knee, in exposed space. */
const PREFILTER = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uExposure;
uniform vec3 uThreshold; // threshold, knee, clamp
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  // a single NaN/Inf pixel (half-float overflow in additive layers) would smear across the whole bloom chain
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = min(c * 0.25 * uExposure, vec3(uThreshold.z));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold.x + uThreshold.y, 0.0, 2.0 * uThreshold.y);
  soft = soft * soft / (4.0 * uThreshold.y + 1e-4);
  float k = max(soft, br - uThreshold.x) / max(br, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}`;

/** Dual-filter downsample (5 taps). */
const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.125, 1.0);
}`;

/** Tent upsample (8 taps), additively blended onto the next larger mip. */
const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uScatter;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * 1.5;
  vec3 c = texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb
         + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb;
  c *= 2.0;
  c += texture2D(tSrc, vUv + vec2(-t.x, -t.y) * 0.7).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y) * 0.7).rgb
     + texture2D(tSrc, vUv + vec2(-t.x, t.y) * 0.7).rgb + texture2D(tSrc, vUv + vec2(t.x, t.y) * 0.7).rgb;
  gl_FragColor = vec4(c / 12.0 * uScatter, 1.0);
}`;

const COMPOSITE = /* glsl */ `
${LUM}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uBlack;
uniform float uAspect;
uniform float uTime;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= 1.0 / 0.6;
  color = OUT * RRTAndODTFit(IN * color);
  return clamp(color, 0.0, 1.0);
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  if (any(isnan(c))) c = vec3(0.0);
  c = min(c, vec3(256.0)) * uExposure;
  // dehaze: remove part of the shared veil so forms keep their contrast when facing the glow
  c = max(c - vec3(uBlack), vec3(0.0));
  #ifdef BLOOM
  vec3 bl = texture2D(tBloom, vUv).rgb;
  if (!any(isnan(bl))) c += bl * uBloom;
  #endif
  c = aces(c);
  // grading in a perceptual (gamma 2.2) space
  vec3 g = pow(c, vec3(1.0 / 2.2));
  float l = dot(g, LUMW);
  g = mix(vec3(l), g, uSat);
  g = (g - 0.5) * uContrast + 0.5;
  g = g * uGain + uLift * (1.0 - g);
  // vignette (also keeps the corner HUD readable)
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.42, 1.18, length(q) * 1.25);
  g *= 1.0 - uVignette * vig;
  c = pow(clamp(g, 0.0, 1.0), vec3(2.2));
  // dither against banding in the sky gradients
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = linearToOutputTexel(vec4(c, 1.0));
  gl_FragColor.rgb += (n - 0.5) / 255.0;
}`;

function pass(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
}

export class PostPipeline {
  /** Exposure correction applied on top of the atmosphere's base exposure (eased). */
  exposureScale = 1;
  /** Last measured exposed key (log-average luminance x exposure) and clipped fraction. */
  key = 0.15;
  hot = 0;
  /** Base exposure captured from the scene's onBeforeRender (set by WorldRenderer's atmosphere). */
  baseExposure = 1;
  /** Current act grade (blended). */
  readonly grade: ActGrade = { ...ACT_GRADES[0], lift: [...ACT_GRADES[0].lift], gain: [...ACT_GRADES[0].gain] };
  private hdr: THREE.WebGLRenderTarget | null = null;
  private mips: THREE.WebGLRenderTarget[] = [];
  private probe: THREE.WebGLRenderTarget;
  private reduce: THREE.WebGLRenderTarget;
  private readBuf = new Uint8Array(4);
  private reading = false;
  private probeT = 0;
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mCopy: THREE.ShaderMaterial;
  private mReduce: THREE.ShaderMaterial;
  private mPre: THREE.ShaderMaterial;
  private mDown: THREE.ShaderMaterial;
  private mUp: THREE.ShaderMaterial;
  private mComp: THREE.ShaderMaterial;
  private mCompBloom: THREE.ShaderMaterial;
  private halfFloat: boolean;
  private quality: QualityLevel = 'medium';
  private size = new THREE.Vector2();
  private disposed = false;
  private builtKey = '';

  constructor(private gl: THREE.WebGLRenderer) {
    const ext = gl.extensions;
    this.halfFloat = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    const type = this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.probe = new THREE.WebGLRenderTarget(PROBE_W, PROBE_H, { type, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.reduce = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mCopy = pass(PROBE_COPY, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.mReduce = pass(REDUCE, { tProbe: { value: this.probe.texture }, uExposure: { value: 1 } });
    this.mPre = pass(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uThreshold: { value: new THREE.Vector3(1.5, 0.7, 8) } });
    this.mDown = pass(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = pass(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.85 } });
    this.mUp.blending = THREE.AdditiveBlending;
    this.mUp.transparent = true;
    const compU = () => ({
      tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.3 }, uSat: { value: 1 }, uContrast: { value: 1 },
      uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uVignette: { value: 0.2 }, uBlack: { value: 0 }, uAspect: { value: 2 }, uTime: { value: 0 },
    });
    this.mComp = pass(COMPOSITE, compU());
    this.mCompBloom = pass(COMPOSITE, compU(), { BLOOM: '' });
    this.quad = new THREE.Mesh(g, this.mComp);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  /** True when the scene renders into the HDR target (Medium/High with renderable half floats). */
  get hdrActive(): boolean {
    return this.hdr !== null;
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.rebuild();
  }

  /** Recreate GPU targets (quality change, resize, context restore). */
  rebuild(force = false): void {
    this.gl.getDrawingBufferSize(this.size);
    const w = Math.max(2, this.size.x), h = Math.max(2, this.size.y);
    const key = `${this.quality}|${w}x${h}`;
    if (!force && key === this.builtKey) return;
    this.builtKey = key;
    this.freeTargets();
    if (!HDR_ENABLED || !this.halfFloat || this.disposed) return;
    this.hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0, depthBuffer: true });
    const levels = BLOOM_LEVELS[this.quality];
    let mw = w, mh = h;
    for (let i = 0; i < levels; i++) {
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
  }

  private freeTargets(): void {
    this.hdr?.dispose();
    this.hdr = null;
    for (const m of this.mips) m.dispose();
    this.mips = [];
  }

  /** Blend the color grade toward an act's (0 = neutral). */
  updateGrade(act: number, dt: number): void {
    const t = ACT_GRADES[Math.max(0, Math.min(ACT_GRADES.length - 1, act | 0))];
    const k = 1 - Math.exp(-dt * 1.5);
    const G = this.grade;
    G.sat += (t.sat - G.sat) * k;
    G.contrast += (t.contrast - G.contrast) * k;
    G.bloom += (t.bloom - G.bloom) * k;
    for (let i = 0; i < 3; i++) {
      G.lift[i] += (t.lift[i] - G.lift[i]) * k;
      G.gain[i] += (t.gain[i] - G.gain[i]) * k;
    }
  }

  /** Final exposure for this frame (base from the atmosphere x auto correction). */
  get exposure(): number {
    return this.baseExposure * this.exposureScale;
  }

  /** Begin the frame: route the scene into the HDR target when active. */
  begin(): void {
    if (this.hdr) this.gl.setRenderTarget(this.hdr);
  }

  /** After the scene render: probe, bloom and composite (HDR path) or the periodic probe (direct path). */
  end(scene: THREE.Scene, camera: THREE.Camera, dt: number, time: number): void {
    const gl = this.gl;
    this.ease(dt);
    if (!this.hdr) {
      this.probeT -= dt;
      if (this.probeT <= 0 && !this.reading) {
        this.probeT = PROBE_DT;
        const auto = gl.shadowMap.autoUpdate;
        gl.shadowMap.autoUpdate = false;
        const exp = gl.toneMappingExposure;
        gl.setRenderTarget(this.probe);
        gl.render(scene, camera);
        gl.shadowMap.autoUpdate = auto;
        gl.toneMappingExposure = exp;
        this.measure();
      }
      gl.setRenderTarget(null);
      return;
    }
    const hdr = this.hdr;
    const E = this.exposure;
    // luminance probe from the HDR frame (every frame on this path: two tiny passes)
    if (!this.reading) {
      this.mCopy.uniforms.tSrc.value = hdr.texture;
      (this.mCopy.uniforms.uStep.value as THREE.Vector2).set(0.25 / PROBE_W, 0.25 / PROBE_H);
      this.blit(this.mCopy, this.probe);
      this.measure();
    }
    const G = this.grade;
    const bloom = this.mips.length > 0;
    if (bloom) {
      const m0 = this.mips[0];
      this.mPre.uniforms.tSrc.value = hdr.texture;
      (this.mPre.uniforms.uTexel.value as THREE.Vector2).set(1 / hdr.width, 1 / hdr.height);
      this.mPre.uniforms.uExposure.value = E;
      this.blit(this.mPre, m0);
      for (let i = 1; i < this.mips.length; i++) {
        const src = this.mips[i - 1];
        this.mDown.uniforms.tSrc.value = src.texture;
        (this.mDown.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.blit(this.mDown, this.mips[i]);
      }
      for (let i = this.mips.length - 1; i > 0; i--) {
        const src = this.mips[i];
        this.mUp.uniforms.tSrc.value = src.texture;
        (this.mUp.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.blit(this.mUp, this.mips[i - 1], false);
      }
    }
    const m = bloom ? this.mCompBloom : this.mComp;
    const U = m.uniforms;
    U.tScene.value = hdr.texture;
    U.tBloom.value = bloom ? this.mips[0].texture : null;
    U.uExposure.value = E;
    U.uBloom.value = (this.quality === 'high' ? 0.24 : 0.17) * G.bloom;
    U.uSat.value = G.sat;
    U.uContrast.value = G.contrast;
    (U.uLift.value as THREE.Vector3).set(G.lift[0], G.lift[1], G.lift[2]);
    (U.uGain.value as THREE.Vector3).set(G.gain[0], G.gain[1], G.gain[2]);
    U.uVignette.value = 0.24;
    U.uBlack.value = this.veilCut * E;
    U.uAspect.value = hdr.width / Math.max(1, hdr.height);
    U.uTime.value = time % 100;
    this.blit(m, null);
  }

  private blit(m: THREE.Material, target: THREE.WebGLRenderTarget | null, clear = true): void {
    const gl = this.gl;
    this.quad.material = m;
    gl.setRenderTarget(target);
    const ac = gl.autoClear;
    gl.autoClear = clear;
    gl.render(this.qScene, this.qCam);
    gl.autoClear = ac;
  }

  /** Reduce the probe to 1x1 and read it back asynchronously. */
  private measure(): void {
    this.mReduce.uniforms.uExposure.value = this.exposure;
    this.blit(this.mReduce, this.reduce);
    const gl = this.gl as THREE.WebGLRenderer & { readRenderTargetPixelsAsync?: (rt: THREE.WebGLRenderTarget, x: number, y: number, w: number, h: number, buf: Uint8Array) => Promise<unknown> };
    if (gl.readRenderTargetPixelsAsync) {
      this.reading = true;
      gl.readRenderTargetPixelsAsync(this.reduce, 0, 0, 1, 1, this.readBuf).then(() => this.decode(), () => undefined).finally(() => {
        this.reading = false;
      });
    } else {
      gl.readRenderTargetPixels(this.reduce, 0, 0, 1, 1, this.readBuf);
      this.decode();
    }
  }

  private decode(): void {
    const b = this.readBuf;
    const v = b[0] / 255 + b[1] / (255 * 255);
    const logL = v * 20 - 14;
    this.key = Math.pow(2, logL) * this.exposure;
    this.hot = b[2] / 255;
    const L = Math.pow(2, logL);
    this.floor = Math.pow(2, (b[3] / 255) * 20 - 14);
    // veil = share of the average brightness every pixel has (haze/glare); cut up to 60% of it when it dominates
    const veil = Math.min(1, this.floor / Math.max(1e-5, L));
    this.veilTarget = this.hdr ? this.floor * 0.6 * THREE.MathUtils.smoothstep(veil, 0.25, 0.65) : 0;
    // the controller meters the full image at base exposure (the cut only restores contrast, it never brightens)
    this.lumBase = L * this.baseExposure;
  }

  private lumBase = 0.14;
  /** Soft-minimum luminance of the metered area (unexposed) and the veil amount removed in the composite. */
  floor = 0;
  veilCut = 0;
  private veilTarget = 0;

  /** Ease the exposure correction toward the comfort band. */
  private ease(dt: number): void {
    const k = this.lumBase;
    let s = 1;
    if (k > KEY_HI) s = Math.pow(KEY_HI / k, 0.85);
    else if (k < KEY_LO) s = Math.min(1.3, Math.pow(KEY_LO / Math.max(1e-4, k), 0.45));
    // many clipped pixels in the metered area: pull down a little more
    s *= 1 - 0.22 * THREE.MathUtils.smoothstep(this.hot, 0.2, 0.6);
    s = THREE.MathUtils.clamp(s, 0.3, 1.3);
    this.veilCut += (this.veilTarget - this.veilCut) * (1 - Math.exp(-dt * 1.5));
    const rate = s < this.exposureScale ? 2.4 : 1.1;
    this.exposureScale += (s - this.exposureScale) * (1 - Math.exp(-dt * rate));
  }

  dispose(): void {
    this.disposed = true;
    this.freeTargets();
    this.probe.dispose();
    this.reduce.dispose();
    for (const m of [this.mCopy, this.mReduce, this.mPre, this.mDown, this.mUp, this.mComp, this.mCompBloom]) m.dispose();
    this.quad.geometry.dispose();
  }
}
