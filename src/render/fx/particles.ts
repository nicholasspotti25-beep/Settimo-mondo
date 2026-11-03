/**
 * GPU particle system: a ring buffer of camera-facing quads whose whole life (ballistic motion with drag and gravity,
 * size and alpha curves, spin, velocity stretch) is evaluated in the vertex shader from the emission parameters. The CPU
 * writes a particle once when it is emitted (only the written range is uploaded); nothing per frame per particle.
 * One draw call per system; sprites come from the kit sprite atlas (src/render/kit/textures.ts ATLAS_CELLS).
 * Exposed as `fx.particles` (additive: sparks, glows, embers, motes) and `fx.smoke` (alpha: smoke, dust, debris).
 */
import * as THREE from 'three';
import { spriteAtlas, ATLAS_N } from '../kit/textures';

/** Atlas cells (index into ATLAS_CELLS). */
export const CELL = { dot: 0, spark: 1, star: 2, ring: 3, smoke: 4, feather: 5, petal: 6, flame: 7, crescent: 8, shard: 9, glyph: 10, rays: 14, blob: 15 } as const;

const VERT = /* glsl */ `
attribute vec4 aP0;   // xyz start, w = birth time
attribute vec4 aVel;  // xyz velocity, w = life
attribute vec4 aSize; // x size0, y size1, z gravity, w drag
attribute vec4 aCol;  // rgb, a = alpha
attribute vec4 aMisc; // x cell, y spin (rad/s), z stretch, w fade-in fraction
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying float vK;
void main() {
  float age = uTime - aP0.w;
  float life = max(aVel.w, 1e-3);
  float k = age / life;
  vK = k;
  if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vUv = vec2(0.0); return; }
  float drag = aSize.w;
  float dk = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = aP0.xyz + aVel.xyz * dk;
  p.y -= 0.5 * aSize.z * age * age;
  vec3 vel = aVel.xyz * (drag > 0.001 ? exp(-drag * age) : 1.0);
  vel.y -= aSize.z * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(aSize.x, aSize.y, k);
  vec2 c = position.xy;
  float a = aMisc.y * age + aMisc.x * 1.7;
  vec2 axisX = vec2(cos(a), sin(a));
  vec2 axisY = vec2(-axisX.y, axisX.x);
  vec2 off = (axisX * c.x + axisY * c.y) * size;
  if (aMisc.z > 0.0) {
    vec2 vv = (modelViewMatrix * vec4(vel, 0.0)).xy;
    float sp = length(vv);
    if (sp > 1e-3) {
      vec2 d = vv / sp;
      vec2 n = vec2(-d.y, d.x);
      off = n * c.x * size + d * c.y * size * (1.0 + sp * aMisc.z);
    }
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float cell = aMisc.x;
  vec2 cxy = vec2(mod(cell, ${ATLAS_N}.0), floor(cell / ${ATLAS_N}.0));
  vUv = (cxy + (c + 0.5)) / ${ATLAS_N}.0;
  float fin = smoothstep(0.0, max(aMisc.w, 1e-3), k);
  float fout = 1.0 - k * k;
  vCol = vec4(aCol.rgb, aCol.a * fin * fout);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uAdd;
varying vec2 vUv;
varying vec4 vCol;
varying float vK;
void main() {
  float a = texture2D(uAtlas, vUv).a * vCol.a;
  if (a < 0.003) discard;
  // additive particles cool from white-hot to their color
  vec3 col = uAdd > 0.5 ? mix(vec3(1.0), vCol.rgb, smoothstep(0.0, 0.35, vK) * 0.8 + 0.2) * 1.35 : vCol.rgb;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface ParticleSpec {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size0: number; size1: number;
  r: number; g: number; b: number; a: number;
  cell: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  stretch?: number;
  fadeIn?: number;
}

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private head = 0;
  private dMin = Infinity;
  private dMax = -1;
  private readonly p0: THREE.InstancedBufferAttribute;
  private readonly vel: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly misc: THREE.InstancedBufferAttribute;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly mat: THREE.ShaderMaterial;
  /** Current clock (seconds); birth times are stamped with it. */
  time = 0;

  constructor(capacity: number, additive: boolean, name: string) {
    this.capacity = capacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.p0 = mk(4); this.vel = mk(4); this.size = mk(4); this.col = mk(4); this.misc = mk(4);
    // never-born particles: birth far in the future
    for (let i = 0; i < capacity; i++) this.p0.array[i * 4 + 3] = 1e9;
    g.setAttribute('aP0', this.p0);
    g.setAttribute('aVel', this.vel);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aCol', this.col);
    g.setAttribute('aMisc', this.misc);
    g.instanceCount = capacity;
    this.attrs = [this.p0, this.vel, this.size, this.col, this.misc];
    this.mat = new THREE.ShaderMaterial({
      name,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uAtlas: { value: spriteAtlas(64) }, uAdd: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 11;
  }

  /** Emit one particle (no allocation). */
  emit(s: ParticleSpec): void {
    this.emitRaw(s.x, s.y, s.z, s.vx, s.vy, s.vz, s.life, s.size0, s.size1, s.r, s.g, s.b, s.a, s.cell, s.gravity ?? 0, s.drag ?? 0, s.spin ?? 0, s.stretch ?? 0, s.fadeIn ?? 0.06);
  }

  emitRaw(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size0: number, size1: number,
    r: number, g: number, b: number, a: number, cell: number, gravity: number, drag: number, spin: number, stretch: number, fadeIn: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    const o = i * 4;
    const P = this.p0.array as Float32Array, V = this.vel.array as Float32Array, S = this.size.array as Float32Array;
    const C = this.col.array as Float32Array, M = this.misc.array as Float32Array;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = this.time;
    V[o] = vx; V[o + 1] = vy; V[o + 2] = vz; V[o + 3] = life;
    S[o] = size0; S[o + 1] = size1; S[o + 2] = gravity; S[o + 3] = drag;
    C[o] = r; C[o + 1] = g; C[o + 2] = b; C[o + 3] = a;
    M[o] = cell; M[o + 1] = spin; M[o + 2] = stretch; M[o + 3] = fadeIn;
    if (i < this.dMin) this.dMin = i;
    if (i > this.dMax) this.dMax = i;
  }

  /** Advance the clock and upload what was emitted since the last frame. */
  update(dt: number): void {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.dMax < 0) return;
    for (let i = 0; i < this.attrs.length; i++) {
      const a = this.attrs[i];
      a.clearUpdateRanges();
      a.addUpdateRange(this.dMin * 4, (this.dMax - this.dMin + 1) * 4);
      a.needsUpdate = true;
    }
    this.dMin = Infinity;
    this.dMax = -1;
  }

  /** Kill every live particle (zone change). */
  clear(): void {
    const P = this.p0.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) P[i * 4 + 3] = 1e9;
    this.dMin = 0;
    this.dMax = this.capacity - 1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
