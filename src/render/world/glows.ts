/**
 * GlowSet: every small light of a zone's sites in ONE draw call — camera-facing glow orbs, flickering lantern flames,
 * vertical light beams (cylindrical billboards), flat light pools on the ground and pulsing star glints (Reperti, vista
 * cairns). No real lights (the forward renderer would recompile every material per light): the glows are additive,
 * display-space, brighter at night (ATMOS.uNight), dimmed by the shared atmosphere fog and occluded by the depth buffer.
 * Each glow fades smoothly toward its target visibility (setOn), so a lantern being lit or a Reperto being taken eases.
 */
import * as THREE from 'three';
import { ATMOS } from './atmosphere';
import { GLSL_ATMOS_PARS } from './glsl';

export type GlowMode = 'orb' | 'beam' | 'pool' | 'glint' | 'flame';
const MODE: Record<GlowMode, number> = { orb: 0, beam: 1, pool: 2, glint: 3, flame: 4 };

export interface GlowSpec {
  pos: [number, number, number];
  /** sRGB hex. */
  color: string;
  /** Width (orb/glint/flame/beam) or diameter (pool), meters. */
  size: number;
  /** Beam height / flame height (default = size). */
  height?: number;
  intensity: number;
  mode: GlowMode;
  phase?: number;
  /** Initial visibility 0..1 (default 1). */
  on?: number;
}

const vert = /* glsl */ `
attribute vec3 aCenter;
attribute vec4 aGlow;   // x: width, y: height, z: mode, w: phase
attribute vec4 aColor;  // rgb display-space, a: intensity
attribute float aOn;
varying vec2 vUv;
varying vec4 vCol;
varying float vMode;
varying float vPhase;
varying vec3 vAtmWorld;
void main() {
  vUv = position.xy + 0.5;
  float mode = aGlow.z;
  vec3 c = aCenter;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp;
  if (mode > 1.5 && mode < 2.5) {
    wp = c + vec3(position.x * aGlow.x, 0.0, position.y * aGlow.x);
  } else if (mode > 0.5 && mode < 1.5) {
    vec3 toC = c - cameraPosition;
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), toC) + vec3(1e-5, 0.0, 0.0));
    wp = c + r * position.x * aGlow.x + vec3(0.0, (position.y + 0.5) * aGlow.y, 0.0);
  } else {
    float h = mode > 3.5 ? aGlow.y : aGlow.x;
    wp = c + camR * position.x * aGlow.x + camU * position.y * h;
    // pull toward the camera a little so a glow inside a lantern cage is not clipped by the cage
    wp += normalize(cameraPosition - c) * min(aGlow.x * 0.35, 0.6);
  }
  vCol = vec4(aColor.rgb, aColor.a * aOn);
  vMode = mode;
  vPhase = aGlow.w;
  vAtmWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  if (aOn < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uNight;
varying vec2 vUv;
varying vec4 vCol;
varying float vMode;
varying float vPhase;
varying vec3 vAtmWorld;
${GLSL_ATMOS_PARS}
void main() {
  vec2 p = vUv - 0.5;
  float a = 0.0;
  if (vMode < 0.5) {
    float r2 = dot(p, p) * 4.0;
    a = exp(-r2 * 3.2) * 0.55 + exp(-r2 * 16.0) * 0.7;
    a *= 0.92 + 0.08 * sin(uTime * 1.7 + vPhase);
  } else if (vMode < 1.5) {
    float x = p.x * 2.0;
    float y = vUv.y;
    a = exp(-x * x * 6.0) * pow(1.0 - y, 1.7) * smoothstep(0.0, 0.06, y);
    a *= 0.78 + 0.22 * sin(y * 11.0 - uTime * 1.1 + vPhase);
  } else if (vMode < 2.5) {
    float r2 = dot(p, p) * 4.0;
    a = exp(-r2 * 2.6) * (1.0 - smoothstep(0.75, 1.0, r2));
  } else if (vMode < 3.5) {
    vec2 q = abs(p) * 2.0;
    float star = exp(-q.x * 26.0) * exp(-q.y * 3.2) + exp(-q.y * 26.0) * exp(-q.x * 3.2);
    float core = exp(-dot(q, q) * 34.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 2.3 + vPhase);
    a = (star * 0.75 * (0.4 + 0.6 * pulse) + core * (0.7 + 0.3 * pulse) + exp(-dot(q, q) * 5.0) * 0.22 * pulse);
  } else {
    vec2 q = p * 2.0;
    q.y += 0.2;
    float fl = 0.8 + 0.12 * sin(uTime * 17.0 + vPhase) + 0.08 * sin(uTime * 29.0 + vPhase * 2.3);
    a = (exp(-(q.x * q.x * 10.0 + q.y * q.y * 4.0)) * 0.95 + exp(-dot(q, q) * 1.8) * 0.3) * fl;
  }
  vec3 ray = vAtmWorld - cameraPosition;
  float dist = length(ray);
  float fa = smFogAmount(ray, dist);
  float nb = mix(1.0, 1.65, uNight);
  vec3 col = vCol.rgb * (a * vCol.a * nb * (1.0 - fa * 0.85));
  if (max(col.r, max(col.g, col.b)) < 0.003) discard;
  gl_FragColor = vec4(min(col, vec3(1.6)), 1.0);
}
`;

const _c = new THREE.Color();

export class GlowSet {
  readonly mesh: THREE.Mesh;
  private specs: GlowSpec[] = [];
  private geo = new THREE.InstancedBufferGeometry();
  private mat: THREE.ShaderMaterial;
  private onAttr: THREE.InstancedBufferAttribute | null = null;
  private target: Float32Array = new Float32Array(0);
  private dirty = false;

  constructor(name = 'glows') {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { ...ATMOS, uFogScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** Add a glow; returns its index (for setOn). Call finish() once after the last add. */
  add(s: GlowSpec): number {
    this.specs.push(s);
    return this.specs.length - 1;
  }

  get count(): number {
    return this.specs.length;
  }

  finish(): void {
    const n = this.specs.length;
    const center = new Float32Array(n * 3);
    const glow = new Float32Array(n * 4);
    const color = new Float32Array(n * 4);
    const on = new Float32Array(n);
    this.target = new Float32Array(n);
    this.specs.forEach((s, i) => {
      center.set(s.pos, i * 3);
      glow.set([s.size, s.height ?? s.size, MODE[s.mode], s.phase ?? i * 1.37], i * 4);
      _c.setStyle(s.color, THREE.NoColorSpace);
      color.set([_c.r, _c.g, _c.b, s.intensity], i * 4);
      on[i] = s.on ?? 1;
      this.target[i] = on[i];
    });
    this.geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 3));
    this.geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 4));
    this.geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 4));
    this.onAttr = new THREE.InstancedBufferAttribute(on, 1);
    this.onAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aOn', this.onAttr);
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  /** Target visibility (0..1); `instant` skips the fade. */
  setOn(i: number, v: number, instant = false): void {
    if (i < 0 || i >= this.target.length) return;
    if (this.target[i] !== v) {
      this.target[i] = v;
      this.dirty = true;
    }
    if (instant && this.onAttr) {
      (this.onAttr.array as Float32Array)[i] = v;
      this.onAttr.needsUpdate = true;
    }
  }

  update(dt: number): void {
    if (!this.dirty || !this.onAttr) return;
    const a = this.onAttr.array as Float32Array;
    const k = Math.min(1, dt * 1.4);
    let busy = false;
    for (let i = 0; i < a.length; i++) {
      const d = this.target[i] - a[i];
      if (d === 0) continue;
      if (Math.abs(d) < 0.01) a[i] = this.target[i];
      else {
        a[i] += Math.sign(d) * Math.max(Math.abs(d) * k * 2, dt * 0.5) * (Math.abs(d) > 1e-3 ? 1 : 0);
        if ((d > 0 && a[i] > this.target[i]) || (d < 0 && a[i] < this.target[i])) a[i] = this.target[i];
        busy = true;
      }
    }
    this.onAttr.needsUpdate = true;
    this.dirty = busy;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
