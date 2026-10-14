/**
 * Sky dome "Lungo Crepuscolo": gradient (zenith/horizon/ground), sunless glow toward glow_dir with god-rays, layered
 * drifting clouds (high wisps + horizon banks with glowing rims), stars + a faint milky band, aurora curtains and, only in
 * the ending, the sun disc. Drawn last among opaques at the far plane so covered pixels cost nothing.
 */
import * as THREE from 'three';
import type { QualityLevel } from '../types';
import { ATMOS } from './atmosphere';
import { GLSL_ATMOS_PARS, GLSL_NOISE, GLSL_SKY_PARS } from './glsl';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uStars;
uniform float uAurora;
uniform vec3 uAuroraA;
uniform vec3 uAuroraB;
uniform float uCloud;
uniform vec3 uCloudColor;
uniform float uRays;
uniform float uFlash;
uniform float uSunDisc;
uniform float uFogSky;
${GLSL_NOISE}
${GLSL_ATMOS_PARS}
${GLSL_SKY_PARS}

vec3 stars(vec3 d, float k) {
  vec3 p = d * k;
  vec3 i = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = smHash13(i);
  if (h < 0.955) return vec3(0.0);
  vec3 o = (smHash33(i) - 0.5) * 0.7;
  float r = length(f - o);
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 60.0);
  float b = smoothstep(0.11, 0.0, r) * tw * (h - 0.955) * 22.0;
  vec3 c = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), smHash13(i + 7.0));
  return c * b;
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 col = smSkyGradient(d);
  float g = max(dot(d, uGlowDir), 0.0);

  // god-rays fanning out of the sunless glow
  #if SKY_Q > 0
  {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 ax = normalize(cross(up, uGlowDir) + 1e-4);
    vec3 ay = cross(uGlowDir, ax);
    float ang = atan(dot(d, ay), dot(d, ax));
    float rays = smNoise2(vec2(ang * 9.0, uTime * 0.04)) * 0.6 + smNoise2(vec2(ang * 23.0, -uTime * 0.03)) * 0.4;
    rays = smoothstep(0.45, 0.95, rays);
    float fall = pow(g, 3.0) * smoothstep(-0.02, 0.12, e);
    col += uGlow * rays * fall * 0.32 * uRays;
  }
  #endif

  // stars + milky band (above the horizon)
  if (uStars > 0.01) {
    float above = smoothstep(0.0, 0.18, e);
    vec3 st = stars(d, 140.0) + stars(d.zxy, 260.0) * 0.6;
    float band = smFbm2x3(vec2(atan(d.x, d.z) * 2.0, d.y * 5.0) + 3.0);
    float mb = exp(-pow(dot(d, normalize(vec3(0.6, 0.35, -0.7))) * 3.2, 2.0));
    col += (st + vec3(0.42, 0.38, 0.6) * mb * band * 0.16) * uStars * above;
  }

  // aurora curtains
  #if SKY_Q > 0
  if (uAurora > 0.01 && e > 0.02) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float h = 0.9 + fi * 0.22;
      vec2 p = d.xz / (e + 0.08) * h;
      float wave = sin(p.x * 0.55 + uTime * 0.05 + fi * 0.7) * 1.4 + smNoise2(vec2(p.x * 0.35 + uTime * 0.03, fi)) * 2.2;
      float band = exp(-abs(p.y - wave - 1.5) * 1.6);
      float streak = 0.55 + 0.45 * smNoise2(vec2(p.x * 7.0 + fi * 3.0, uTime * 0.25));
      acc += mix(uAuroraA, uAuroraB, fi / 5.0) * band * streak * (1.0 - fi / 7.0);
    }
    col += acc * 0.11 * uAurora * smoothstep(0.02, 0.25, e);
  }
  #endif

  // clouds: high wisps
  #if SKY_Q > 0
  if (e > -0.02) {
    vec2 p = d.xz / (e + 0.14) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
    float n = smFbm2(p * 1.3);
    float cov = 1.0 - uCloud * 0.75;
    float a = smoothstep(cov - 0.12, cov + 0.28, n) * smoothstep(-0.01, 0.2, e) * 0.85;
    float lit = pow(g, 4.0);
    vec3 cc = mix(uCloudColor * 0.85, uGlow * 1.15, lit * 0.8 + 0.12) + uFlash * 0.4;
    col = mix(col, cc * uSkyBright, a);
  }
  #endif

  // horizon cloud banks with glowing rims
  {
    float az = atan(d.x, d.z);
    float n = smFbm2x3(vec2(az * 2.6, e * 9.0 - uTime * 0.004) + vec2(uTime * 0.002, 0.0));
    float top = 0.05 + n * 0.16 * uCloud;
    float bank = smoothstep(top + 0.015, top - 0.015, e) * smoothstep(-0.06, 0.02, e);
    float rim = smoothstep(top - 0.05, top, e) * bank;
    vec3 bc = mix(uHorizon * 0.62, uZenith * 0.8, 0.35);
    bc += uGlow * rim * pow(g, 2.0) * 0.7;
    col = mix(col, bc * uSkyBright, bank * 0.75 * clamp(uCloud * 1.4, 0.0, 1.0));
  }

  // the sun (ending only)
  if (uSunDisc > 0.001) {
    float disc = smoothstep(0.9993, 0.9996, g);
    col += vec3(1.0, 0.92, 0.75) * (disc * 2.5 + pow(g, 300.0) * 1.2 + pow(g, 24.0) * 0.4) * uSunDisc;
  }

  // haze at the horizon matches the world fog exactly
  float fb = smoothstep(0.08 + uFogSky * 0.22, -0.04, e) * (0.35 + 0.65 * uFogSky);
  col = mix(col, smFogColor(d), clamp(fb, 0.0, 1.0));
  col += vec3(0.75, 0.75, 0.9) * uFlash * 0.35 * smoothstep(-0.1, 0.4, e);

  // dither against banding
  col += (smHash12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private uFogSky = { value: 0.5 };

  constructor(quality: QualityLevel) {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...ATMOS,
        uFogScale: { value: 1 },
        uFogSky: this.uFogSky,
      },
      defines: { SKY_Q: quality === 'low' ? 0 : 1 },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10000;
    this.mesh.scale.setScalar(2500);
    this.mesh.name = 'sky';
  }

  setQuality(q: QualityLevel): void {
    const v = q === 'low' ? 0 : 1;
    if (this.mat.defines.SKY_Q !== v) {
      this.mat.defines.SKY_Q = v;
      this.mat.needsUpdate = true;
    }
  }

  update(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
    const d = ATMOS.uFogParams.value.x;
    this.uFogSky.value = Math.min(1, d * 140 + ATMOS.uFogParams.value.y * 8);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
