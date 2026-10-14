/**
 * Blob shadows: one InstancedMesh of soft dark ground discs (one draw call for every actor). Cheap contact shadows on all
 * presets; real shadow maps are added on Medium/High by the renderer. The Portatore never gets one until the ending.
 */
import * as THREE from 'three';
import { spriteTexture } from './textures';

export class BlobShadows {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly opacity: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  private readonly nrm = new THREE.Vector3();

  constructor(readonly capacity = 48) {
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.opacity.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOpacity', this.opacity);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: spriteTexture('blob', 64) }, uColor: { value: new THREE.Color('#0d0a14') } },
      vertexShader: /* glsl */ `
        attribute float aOpacity;
        varying vec2 vUv;
        varying float vO;
        void main() {
          vUv = uv;
          vO = aOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vO;
        void main() {
          float a = texture2D( uMap, vUv ).a * vO;
          gl_FragColor = vec4( uColor, a );
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.name = 'blob-shadows';
  }

  begin(): void {
    this.n = 0;
  }

  /** Add a blob at ground point (x, groundY, z) with radius; `lift` = height of the caster above the ground (fades/grows). */
  add(x: number, groundY: number, z: number, radius: number, opacity = 0.55, lift = 0, normal?: THREE.Vector3): void {
    if (this.n >= this.capacity) return;
    const fade = 1 / (1 + Math.max(0, lift) / Math.max(0.5, radius * 2));
    const r = radius * (1 + Math.max(0, lift) * 0.08);
    this.p.set(x, groundY + 0.03, z);
    if (normal) this.q.setFromUnitVectors(BlobShadows.UP, this.nrm.copy(normal).normalize());
    else this.q.identity();
    this.s.set(r, 1, r);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    this.opacity.setX(this.n, opacity * fade);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.opacity.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
