/**
 * Nebbia dell'Alba (Dawn Mist): the luminous mist wall that closes an arena at its gate while the arena is sealed or its
 * fight is running, plus the same dawn-light material shaped as a disk for portal exits.
 * The wall follows the arena boundary (an arc for circular arenas, a straight curtain otherwise), hugs the terrain at its
 * foot, billows gently, and is drawn with flowing layered noise: a warm gold core, lilac edges, rising bright streaks
 * and sparks. Additive, display-space, dimmed by the shared atmosphere fog; `opacity` fades it in and out.
 */
import * as THREE from 'three';
import { ATMOS } from './atmosphere';
import { GLSL_ATMOS_PARS, GLSL_NOISE } from './glsl';

const vert = /* glsl */ `
uniform float uTime;
uniform float uShape;
varying vec2 vUv;
varying vec3 vAtmWorld;
void main() {
  vUv = uv;
  vec3 p = position;
  if (uShape < 0.5) {
    float w = sin(uv.x * 9.0 + uTime * 1.1) * 0.14 + sin(uv.y * 5.0 - uTime * 1.6 + uv.x * 4.0) * 0.1;
    p += normal * w * smoothstep(0.0, 0.3, uv.y);
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vAtmWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uNight;
uniform float uShape;
uniform vec2 uSize;
uniform vec3 uCore;
uniform vec3 uEdge;
varying vec2 vUv;
varying vec3 vAtmWorld;
${GLSL_NOISE}
${GLSL_ATMOS_PARS}
void main() {
  vec2 q;
  float mask;
  float lift;
  if (uShape < 0.5) {
    q = vec2(vUv.x * uSize.x, vUv.y * uSize.y);
    float sides = smoothstep(0.0, 0.17, vUv.x) * smoothstep(1.0, 0.83, vUv.x);
    float edgeN = smNoise2(vec2(vUv.x * 6.0, uTime * 0.4));
    float top = 1.0 - smoothstep(0.32 + edgeN * 0.28, 1.0, vUv.y);
    float foot = smoothstep(0.0, 0.05, vUv.y);
    mask = sides * top * foot;
    lift = vUv.y;
  } else {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float ang = atan(c.y, c.x);
    float sw = ang + r * 2.6 - uTime * 0.6;
    q = vec2(cos(sw), sin(sw)) * r * uSize.x * 0.5 + vec2(0.0, -uTime * 0.2);
    mask = 1.0 - smoothstep(0.78, 1.0, r);
    lift = r;
  }
  float n1 = smNoise2(q * 0.42 + vec2(uTime * 0.13, -uTime * 0.5));
  float n2 = smNoise2(q * 1.05 + vec2(-uTime * 0.22, -uTime * 0.85) + n1 * 1.6);
  float n3 = smNoise2(q * 2.7 + vec2(uTime * 0.35, -uTime * 1.5));
  float dens = n1 * 0.55 + n2 * 0.33 + n3 * 0.18;
  float streak = pow(smNoise2(vec2(q.x * 1.5, q.y * 0.11 - uTime * 0.65)), 3.0);
  float warm = clamp(dens * 1.2 + streak * 0.6 - lift * 0.45 + 0.1, 0.0, 1.0);
  vec3 col = mix(uEdge, uCore, warm) * (0.5 + dens * 0.5);
  col += uCore * streak * 0.55;
  // sparks drifting upward
  vec2 sq = vec2(q.x * 1.7, q.y * 1.7 - uTime * 1.1);
  vec2 cell = floor(sq);
  float h = smHash12(cell);
  vec2 f = fract(sq) - 0.5 - (smHash22(cell) - 0.5) * 0.6;
  float sp = step(0.9, h) * exp(-dot(f, f) * 70.0) * (0.55 + 0.45 * sin(uTime * 5.0 + h * 40.0));
  col += vec3(1.0, 0.94, 0.82) * sp * 1.6;
  float a = (0.16 + dens * 0.62) * mask * uOpacity;
  vec3 ray = vAtmWorld - cameraPosition;
  float dist = length(ray);
  float fa = smFogAmount(ray, dist);
  float nb = mix(0.62, 1.05, uNight);
  // a little stronger seen edge-on so the wall still reads from oblique angles
  gl_FragColor = vec4(col * a * nb * (1.0 - fa * 0.8), 1.0);
}
`;

export interface MistOpts {
  core?: string;
  edge?: string;
}

function makeMaterial(shape: 0 | 1, size: [number, number], o: MistOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      ...ATMOS,
      uFogScale: { value: 1 },
      uOpacity: { value: 0 },
      uShape: { value: shape },
      uSize: { value: new THREE.Vector2(size[0], size[1]) },
      uCore: { value: new THREE.Color().setStyle(o.core ?? '#ffd9a2', THREE.NoColorSpace) },
      uEdge: { value: new THREE.Color().setStyle(o.edge ?? '#8a74c8', THREE.NoColorSpace) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Mist wall or portal disk with a smoothly fading opacity. */
export class DawnMist {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private target = 0;
  private cur = 0;

  private constructor(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, name: string) {
    this.mat = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  /**
   * Wall across an arena gate. `center` = arena center (the wall bends around it when `radius` > 0, i.e. circular arena),
   * `gate` = gate position, `width` = gate width, `heightAt` = render ground height.
   */
  static wall(center: [number, number], gate: [number, number], yaw: number, width: number, radius: number, height: number, heightAt: (x: number, z: number) => number, o: MistOpts = {}): DawnMist {
    const W = width * 1.45 + 2;
    const cols = 30, rows = 10;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    // inward direction (toward the arena)
    let ix = center[0] - gate[0], iz = center[1] - gate[1];
    const il = Math.hypot(ix, iz);
    if (il > 1) {
      ix /= il; iz /= il;
    } else {
      ix = Math.sin(yaw); iz = Math.cos(yaw);
    }
    const tx = iz, tz = -ix; // tangent
    const arc = radius > 0 && il > 1;
    const R = il;
    const a0 = Math.atan2(gate[0] - center[0], gate[1] - center[1]);
    for (let c = 0; c <= cols; c++) {
      const t = c / cols;
      const s = (t - 0.5) * W;
      let x: number, z: number, nx: number, nz: number;
      if (arc) {
        const a = a0 + s / R;
        x = center[0] + Math.sin(a) * R;
        z = center[1] + Math.cos(a) * R;
        nx = Math.sin(a); nz = Math.cos(a);
      } else {
        x = gate[0] + tx * s;
        z = gate[1] + tz * s;
        nx = -ix; nz = -iz;
      }
      const g = heightAt(x, z) - 0.35;
      for (let r = 0; r <= rows; r++) {
        const v = r / rows;
        pos.push(x, g + v * height, z);
        nrm.push(nx, 0, nz);
        uv.push(t, v);
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const a = c * (rows + 1) + r, b = a + rows + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return new DawnMist(geo, makeMaterial(0, [W, height], o), 'nebbia_alba');
  }

  /** Vertical disk (portal), centered at `at`, facing `yaw`. */
  static disk(at: [number, number, number], yaw: number, radius: number, o: MistOpts = {}): DawnMist {
    const geo = new THREE.CircleGeometry(radius, 40);
    const m = new DawnMist(geo, makeMaterial(1, [radius * 2, radius * 2], o), 'portal_mist');
    m.mesh.position.set(at[0], at[1], at[2]);
    m.mesh.rotation.y = yaw;
    return m;
  }

  /** Target opacity 0..1 (fades over ~1 s); `instant` snaps. */
  set(on: number, instant = false): void {
    this.target = on;
    if (instant) this.cur = on;
  }

  update(dt: number): void {
    const d = this.target - this.cur;
    if (d !== 0) {
      const step = dt * (d > 0 ? 1.2 : 0.7);
      this.cur = Math.abs(d) <= step ? this.target : this.cur + Math.sign(d) * step;
    }
    this.mat.uniforms.uOpacity.value = this.cur;
    this.mesh.visible = this.cur > 0.003;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
