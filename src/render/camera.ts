/**
 * Third-person camera rig: free orbit (right-half drag), lock-on framing of player and target (pulls back for huge bosses),
 * player-scale adaptation (Little Garden 10%, Gigante 3x), terrain clearance, shake, and named cutscene shots.
 */
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle, yawTo } from '../core/math';
import type { Sim } from '../sim/sim';

export type ShotFn = (sim: Sim, t: number, out: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }) => void;

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.32;
  distance = 5.2;
  private curDist = 5.2;
  private target = new THREE.Vector3();
  private shake = 0;
  private shakeT = 0;
  sensitivity = 1;
  invertY = false;
  reduceShake = false;
  baseFov = 58;
  shots = new Map<string, ShotFn>();
  private shotId: string | null = null;
  private shotT = 0;
  private tmpPos = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private shotOut = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: undefined as number | undefined };
  /** Extra roll used by gravity flips (Rovescio). */
  roll = 0;
  rollTarget = 0;
  /** Lock-on framing (horizontal unit direction player -> target, look-ahead and look rise in meters). */
  private lockDir = new THREE.Vector3();
  private lockAhead = 0;
  private lockRise = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.03, 4000);
    this.registerDefaultShots();
  }

  addShake(strength: number, dur: number): void {
    const s = this.reduceShake ? strength * 0.25 : strength;
    this.shake = Math.max(this.shake, s);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  registerShot(id: string, fn: ShotFn): void {
    this.shots.set(id, fn);
  }

  snapBehindPlayer(sim: Sim): void {
    this.yaw = sim.player.yaw;
    this.pitch = 0.3;
  }

  update(sim: Sim, alpha: number, dt: number, input: { dx: number; dy: number }): void {
    const pl = sim.player;
    const scale = pl.scale;
    const px = pl.prevPos.x + (pl.pos.x - pl.prevPos.x) * alpha;
    const py = pl.prevPos.y + (pl.pos.y - pl.prevPos.y) * alpha;
    const pz = pl.prevPos.z + (pl.pos.z - pl.prevPos.z) * alpha;
    const scaleK = Math.pow(Math.max(0.08, scale), 0.78);
    const headH = 1.45 * scale;

    // cutscene shot
    const shot = sim.seq.running ? sim.seq.view.camera : null;
    if (shot && this.shots.has(shot)) {
      if (shot !== this.shotId) {
        this.shotId = shot;
        this.shotT = 0;
      }
      this.shotT += dt;
      this.shotOut.fov = undefined;
      this.shots.get(shot)!(sim, this.shotT, this.shotOut);
      this.camera.position.lerp(this.shotOut.pos, this.shotT < 0.05 ? 1 : 1 - Math.exp(-4 * dt));
      this.tmpLook.copy(this.shotOut.look);
      this.camera.lookAt(this.tmpLook);
      this.camera.fov = damp(this.camera.fov, this.shotOut.fov ?? this.baseFov, 4, dt);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.shotId = null;

    const sens = this.sensitivity;
    const lock = pl.lock ? sim.lockPointPos(pl.lock.actor, pl.lock.part, { x: 0, y: 0, z: 0 }) : null;
    const lockActor = pl.lock ? sim.actorById(pl.lock.actor) : null;
    if (lock && lockActor) {
      // frame both player and target
      const desiredYaw = yawTo({ x: px, y: 0, z: pz }, lock);
      this.yaw = dampAngle(this.yaw, desiredYaw, 6, dt);
      const size = lockActor.height * lockActor.scale;
      const d2 = Math.hypot(lock.x - px, lock.z - pz);
      this.distance = (5.2 + size * 0.42 + Math.max(0, 8 - d2) * 0.05) * scaleK;
      const dh = lock.y - (py + headH);
      const desiredPitch = clamp(0.22 + Math.atan2(Math.max(-2, dh), Math.max(2, d2)) * 0.55 + size * 0.008, 0.08, 0.95);
      this.pitch = damp(this.pitch, desiredPitch + clamp(input.dy * 0, -0.2, 0.2), 4, dt);
      // orbit around the player (a small bounded lean toward the target keeps both in frame at any range)
      const inv = d2 > 1e-3 ? 1 / d2 : 0;
      const lean = Math.min(d2 * 0.1, 1.1 * scaleK);
      this.lockDir.set((lock.x - px) * inv, 0, (lock.z - pz) * inv);
      this.target.set(px + this.lockDir.x * lean, py + headH + clamp(dh, 0, size * 0.6) * 0.12, pz + this.lockDir.z * lean);
      this.lockAhead = Math.min(d2 * 0.35, (4.5 + size * 0.15) * scaleK);
      this.lockRise = clamp(dh, -1.5 * scaleK, size * 0.5) * 0.35;
    } else {
      this.yaw = wrapAngle(this.yaw + input.dx * sens);
      this.pitch = clamp(this.pitch + (this.invertY ? -input.dy : input.dy) * sens, -0.35, 1.15);
      this.distance = 5.2 * scaleK;
      this.target.set(px, py + headH, pz);
    }
    if (sim.meta.active && sim.meta.ability === 'statura') this.distance *= 1.35;
    if (sim.meta.active && sim.player.flying) this.distance *= 1.2;
    this.curDist = damp(this.curDist, this.distance, 5, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.tmpPos.set(
      this.target.x - Math.sin(this.yaw) * cp * this.curDist,
      this.target.y + sp * this.curDist,
      this.target.z - Math.cos(this.yaw) * cp * this.curDist,
    );
    // terrain clearance
    const g = sim.groundAt(this.tmpPos.x, this.tmpPos.z) + 0.35 * Math.max(0.15, scale);
    if (this.tmpPos.y < g) this.tmpPos.y = g;

    // shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shake * Math.max(0, this.shakeT) * 0.5 * Math.max(0.2, scaleK);
      this.tmpPos.x += (Math.random() - 0.5) * k;
      this.tmpPos.y += (Math.random() - 0.5) * k;
      this.tmpPos.z += (Math.random() - 0.5) * k;
      if (this.shakeT <= 0) this.shake = 0;
    }
    this.camera.position.copy(this.tmpPos);
    this.tmpLook.copy(this.target);
    if (lock) this.tmpLook.set(this.target.x + this.lockDir.x * this.lockAhead, this.target.y + this.lockRise, this.target.z + this.lockDir.z * this.lockAhead);
    this.camera.lookAt(this.tmpLook);
    this.roll = damp(this.roll, this.rollTarget, 3, dt);
    if (this.roll) this.camera.rotateZ(this.roll);
    this.camera.fov = damp(this.camera.fov, this.baseFov + (sim.player.sprinting ? 4 : 0), 4, dt);
    this.camera.near = Math.max(0.01, 0.05 * Math.min(1, scale * 2));
    this.camera.updateProjectionMatrix();
  }

  private registerDefaultShots(): void {
    const bossFrame = (low: boolean): ShotFn => (sim, t, out) => {
      const b = sim.boss;
      const pl = sim.player;
      if (!b) {
        out.pos.set(pl.pos.x, pl.pos.y + 3, pl.pos.z - 6);
        out.look.set(pl.pos.x, pl.pos.y + 1, pl.pos.z);
        return;
      }
      const h = b.height * b.scale;
      const yaw = yawTo(pl.pos, b.pos);
      const d = 4 + h * 0.9;
      const side = 0.5 + t * 0.05;
      out.pos.set(b.pos.x - Math.sin(yaw + side) * d, b.pos.y + (low ? h * 0.25 : h * 0.8), b.pos.z - Math.cos(yaw + side) * d);
      out.look.set(b.pos.x, b.pos.y + h * 0.65, b.pos.z);
    };
    this.shots.set('boss_reveal', bossFrame(true));
    this.shots.set('boss_close', bossFrame(false));
    const playerShot: ShotFn = (sim, t, out) => {
      const pl = sim.player;
      const s = Math.max(0.1, pl.scale);
      const ang = pl.yaw + Math.PI * 0.8 + t * 0.06;
      out.pos.set(pl.pos.x + Math.sin(ang) * 2.6 * s, pl.pos.y + 1.6 * s, pl.pos.z + Math.cos(ang) * 2.6 * s);
      out.look.set(pl.pos.x, pl.pos.y + 1.2 * s, pl.pos.z);
    };
    this.shots.set('player_close', playerShot);
    this.shots.set('castle_wake', (sim, t, out) => {
      const pl = sim.player;
      out.pos.set(pl.pos.x + 1.8, pl.pos.y + 3.2 - Math.min(1.2, t * 0.12), pl.pos.z - 3.4);
      out.look.set(pl.pos.x, pl.pos.y + 0.6, pl.pos.z);
    });
    const wide: ShotFn = (sim, t, out) => {
      const pl = sim.player;
      const s = Math.max(0.1, pl.scale);
      out.pos.set(pl.pos.x - 9 * s, pl.pos.y + 5 * s + t * 0.15, pl.pos.z - 12 * s);
      out.look.set(pl.pos.x, pl.pos.y + 1.5 * s, pl.pos.z);
    };
    this.shots.set('wide', wide);
    this.shots.set('vista', (sim, t, out) => {
      const pl = sim.player;
      const s = Math.max(0.1, pl.scale);
      const z = sim.zone?.def;
      const v = z?.vistas.find((x) => Math.hypot(x.pos[0] - pl.pos.x, x.pos[2] - pl.pos.z) < 6);
      const look = v ? v.look : [pl.pos.x + Math.sin(pl.yaw) * 100, pl.pos.y + 10, pl.pos.z + Math.cos(pl.yaw) * 100];
      out.pos.set(pl.pos.x - Math.sin(pl.yaw) * 2 * s, pl.pos.y + 1.8 * s, pl.pos.z - Math.cos(pl.yaw) * 2 * s);
      out.look.set(look[0], look[1], look[2]);
      out.fov = 50 - Math.min(8, t * 1.2);
    });
  }
}
