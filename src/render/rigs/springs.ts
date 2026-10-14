/**
 * Secondary motion: verlet-style spring chains in world space (capes, banners, hair, tails, chains, tentacles, wing tips,
 * antennae). Each joint tip is a particle pulled toward its animated position; bones are re-aimed at the particles after
 * the animated pose is applied, so springs add lag/overshoot on top of the clips without fighting them.
 * Zero allocation per frame.
 */
import * as THREE from 'three';

export interface SpringSpec {
  /** Chain name registered on the model (ModelBuilder.chain/namedChain) or explicit bone list. */
  chain: string | string[];
  /** Pull toward the animated pose (1/s^2). Default 70. */
  stiffness?: number;
  /** Velocity damping (1/s). Default 9. */
  damping?: number;
  /** Gravity pull in model-size units per s^2 (cloth/hair hang). Default 0. */
  gravity?: number;
  /** Weight of the spring result vs the animated pose 0..1 (default 1). */
  weight?: number;
  /** Stiffness multiplier along the chain: tip = root * (1 - falloff). Default 0.5. */
  falloff?: number;
  /** Length of the virtual segment after the last bone (fraction of the last segment). Default 0.8. */
  tip?: number;
}

const _w = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _bp = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class SpringChain {
  readonly bones: THREE.Bone[];
  private pos: Float32Array;
  private vel: Float32Array;
  private target: Float32Array;
  private len: Float32Array;
  private tipLocal: THREE.Vector3;
  private init = false;
  private readonly k: number;
  private readonly d: number;
  private readonly g: number;
  private readonly falloff: number;
  weight: number;

  constructor(bones: THREE.Bone[], spec: SpringSpec, private size: number) {
    this.bones = bones;
    const n = bones.length;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.target = new Float32Array(n * 3);
    this.len = new Float32Array(n);
    this.k = spec.stiffness ?? 70;
    this.d = spec.damping ?? 9;
    this.g = (spec.gravity ?? 0) * size;
    this.weight = spec.weight ?? 1;
    this.falloff = spec.falloff ?? 0.5;
    // tip offset: continue the last segment direction
    const last = bones[n - 1];
    const lp = (last.userData.restPos as THREE.Vector3 | undefined) ?? last.position;
    this.tipLocal = lp.clone().multiplyScalar(spec.tip ?? 0.8);
    if (this.tipLocal.lengthSq() < 1e-8) this.tipLocal.set(0, -0.2 * size, 0);
  }

  reset(): void {
    this.init = false;
  }

  /** World position of the animated child joint of bone i (the next bone, or the virtual tip). */
  private childWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    if (i + 1 < this.bones.length) return this.bones[i + 1].getWorldPosition(out);
    return out.copy(this.tipLocal).applyMatrix4(this.bones[i].matrixWorld);
  }

  /** Call after the animated pose has been applied and world matrices updated. */
  update(dt: number, scale: number): void {
    const n = this.bones.length;
    if (!n || this.weight <= 0) return;
    this.bones[0].updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      this.childWorld(i, _w);
      this.target[i * 3] = _w.x; this.target[i * 3 + 1] = _w.y; this.target[i * 3 + 2] = _w.z;
      this.bones[i].getWorldPosition(_bp);
      this.len[i] = _bp.distanceTo(_w);
    }
    const h = Math.min(dt, 1 / 30);
    let teleport = !this.init;
    if (!teleport) {
      // big jumps (respawn, teleport) reset the chain
      const dx = this.pos[0] - this.target[0], dy = this.pos[1] - this.target[1], dz = this.pos[2] - this.target[2];
      if (dx * dx + dy * dy + dz * dz > (this.size * scale * 4) ** 2) teleport = true;
    }
    if (teleport || h <= 0) {
      this.pos.set(this.target);
      this.vel.fill(0);
      this.init = true;
      if (h <= 0) return;
    }
    const g = this.g * scale;
    for (let i = 0; i < n; i++) {
      const kk = this.k * (1 - this.falloff * (n > 1 ? i / (n - 1) : 0));
      for (let c = 0; c < 3; c++) {
        const j = i * 3 + c;
        let a = (this.target[j] - this.pos[j]) * kk - this.vel[j] * this.d;
        if (c === 1) a -= g;
        this.vel[j] += a * h;
        this.pos[j] += this.vel[j] * h;
      }
    }
    // re-aim bones at their particles (root first), keeping segment lengths
    for (let i = 0; i < n; i++) {
      const b = this.bones[i];
      b.getWorldPosition(_bp);
      this.childWorld(i, _w);
      _d1.subVectors(_w, _bp);
      _tmp.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      _d2.subVectors(_tmp, _bp);
      const l = this.len[i];
      if (_d1.lengthSq() < 1e-10 || _d2.lengthSq() < 1e-10) continue;
      // length constraint on the particle
      _d2.setLength(l);
      this.pos[i * 3] = _bp.x + _d2.x; this.pos[i * 3 + 1] = _bp.y + _d2.y; this.pos[i * 3 + 2] = _bp.z + _d2.z;
      _d1.normalize();
      _d2.normalize();
      _q.setFromUnitVectors(_d1, _d2);
      if (this.weight < 1) _q.slerp(_qp.identity(), 1 - this.weight);
      b.getWorldQuaternion(_qw);
      _qw.premultiply(_q);
      if (b.parent) {
        b.parent.getWorldQuaternion(_qp);
        b.quaternion.copy(_qp.invert().multiply(_qw));
      }
      b.updateMatrixWorld(true);
    }
  }
}
