/**
 * RigVisual: the standard ActorVisual for kit models. Places the model at the interpolated sim actor transform, runs the
 * data-driven Animator from the actor's animation exposure, follows sim part anchors (multi-head rigs), hides broken /
 * inactive parts, shows flag auras (e.g. 'spectral_aura') and calls an optional content hook every frame.
 * Hit flash, Colpo Rosso tint, Spezzato cracks, phase aura and the death dissolve are driven generically by the
 * ActorRenderer through the model's per-actor FX uniforms (model.fx).
 */
import * as THREE from 'three';
import type { BossDef, MinionDef } from '../../core/types';
import type { Actor } from '../../sim/actor';
import type { Sim } from '../../sim/sim';
import type { ActorVisual, RenderCtx } from '../types';
import type { Model } from '../kit/model';
import { Animator, type AnimInput, type AnimStageName, type RigInfo } from './animator';

export interface FlagAura {
  color: string;
  /** Limit the shell to these surfaces (default all). */
  surfaces?: string[];
  strength?: number;
  /** Shell inflation in meters (default 4% of model size). */
  inflate?: number;
  power?: number;
  flow?: number;
}

export interface RigVisualOpts {
  /** Clip library id (data/anim/<family>.yaml). */
  family: string;
  /** Visual center height override (meters, before actor scale). */
  height?: number;
  /** Turn heads toward the player (default true). */
  lookAtPlayer?: boolean;
  /** actor.flags -> fresnel aura shown while the flag is set (fades in/out). */
  flagAuras?: Record<string, FlagAura>;
  /** Per-frame hook after animation (custom procedural touches, emissive pulses, extra meshes). */
  onUpdate?: (v: RigVisual, actor: Actor, sim: Sim, dt: number) => void;
  /** Extra objects updated each frame (glow sprites, weapons with their own animation). */
  extras?: { update(dt: number, time: number): void }[];
  /** Override rig info (else model.info). */
  info?: RigInfo;
}

const _v = new THREE.Vector3();

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RigVisual implements ActorVisual {
  readonly root: THREE.Group;
  readonly model: Model;
  readonly animator: Animator;
  height: number;
  readonly modelScale: number;
  private auras: { flag: string; meshes: THREE.SkinnedMesh[]; k: number }[] = [];
  private partHide = new Map<string, { bone: THREE.Bone; k: number }>();
  private input: AnimInput = { anim: 'idle', stage: 'idle', time: 0, dur: 1, speed: 0, scale: 1, flags: undefined, airborne: false, hitFlash: 0 };
  private look = new THREE.Vector3();
  time = 0;

  constructor(readonly ctx: RenderCtx, readonly def: BossDef | MinionDef, actor: Actor, model: Model, readonly opts: RigVisualOpts) {
    this.model = model;
    this.root = model.root;
    this.modelScale = def.model?.scale ?? 1;
    this.animator = new Animator(model, ctx.content, opts.family, opts.info);
    this.height = (opts.height ?? model.height * 0.55) * this.modelScale;
    for (const [flag, a] of Object.entries(opts.flagAuras ?? {})) {
      const meshes = model.addAura(a.color, { surfaces: a.surfaces, inflate: a.inflate ?? model.size * 0.05, strength: a.strength ?? 1.3, power: a.power ?? 2.0, flow: a.flow ?? 0.7, time: ctx.kit.globals.time });
      for (const m of meshes) m.visible = false;
      this.auras.push({ flag, meshes, k: 0 });
    }
    const pcs = (opts.info ?? (model.info as RigInfo)).partChains ?? {};
    for (const [id, pc] of Object.entries(pcs)) {
      const tip = model.bones[pc.bones[pc.bones.length - 1]];
      if (tip) this.partHide.set(id, { bone: tip, k: 1 });
    }
    this.place(actor, 1);
  }

  private place(actor: Actor, alpha: number): void {
    const px = actor.prevPos.x + (actor.pos.x - actor.prevPos.x) * alpha;
    const py = actor.prevPos.y + (actor.pos.y - actor.prevPos.y) * alpha;
    const pz = actor.prevPos.z + (actor.pos.z - actor.prevPos.z) * alpha;
    this.root.position.set(px, py, pz);
    this.root.rotation.set(0, angleLerp(actor.prevYaw, actor.yaw, alpha), 0);
    this.root.scale.setScalar(Math.max(1e-3, actor.scale * this.modelScale));
  }

  update(actor: Actor, alpha: number, dt: number, sim: Sim): void {
    this.time += dt;
    this.place(actor, alpha);
    const inp = this.input;
    inp.anim = actor.anim;
    inp.stage = actor.animStage as AnimStageName;
    inp.time = actor.animTime;
    inp.dur = actor.animDur;
    inp.speed = actor.moveSpeedNow;
    inp.scale = actor.scale * this.modelScale;
    inp.flags = actor.flags;
    inp.airborne = actor.airborne && (actor.def.move.flying || actor.pos.y - sim.groundAt(actor.pos.x, actor.pos.z) > 0.5);
    inp.hitFlash = actor.hitFlash;
    if (this.opts.lookAtPlayer !== false && actor.team === 'enemy') {
      const pl = sim.player;
      this.look.set(pl.pos.x, pl.pos.y + 1.3 * pl.scale, pl.pos.z);
      this.animator.lookTarget = this.look;
    } else this.animator.lookTarget = null;
    this.root.updateMatrixWorld(true);
    this.animator.update(inp, dt);
    this.animator.followParts(actor.parts, actor.scale * this.modelScale, dt);
    // broken / inactive parts shrink away (and regrow)
    for (const p of actor.parts) {
      const h = this.partHide.get(p.id);
      if (!h) continue;
      const want = p.broken || !p.active ? 0 : 1;
      h.k += (want - h.k) * Math.min(1, dt * (want ? 2.5 : 6));
      if (h.k > 0.999 && want) {
        if (h.bone.userData.smScaled) {
          h.bone.scale.set(1, 1, 1);
          h.bone.userData.smScaled = false;
        }
      } else {
        h.bone.scale.setScalar(Math.max(0.001, h.k));
        h.bone.userData.smScaled = true;
      }
    }
    for (const a of this.auras) {
      const want = actor.flags.has(a.flag) && actor.alive ? 1 : 0;
      a.k += (want - a.k) * Math.min(1, dt * 2.2);
      const vis = a.k > 0.01;
      for (const m of a.meshes) {
        m.visible = vis;
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        if (u?.uFade) u.uFade.value = a.k * (0.85 + 0.15 * Math.sin(this.time * 5.3));
      }
    }
    if (this.opts.extras) for (const e of this.opts.extras) e.update(dt, this.time);
    this.opts.onUpdate?.(this, actor, sim, dt);
  }

  /** World position of a bone (FX anchoring). */
  boneWorld(name: string, out = _v): THREE.Vector3 | null {
    return this.animator.boneWorld(name, out);
  }

  dispose(): void {
    this.model.dispose();
  }
}

/** Convenience factory used by content model modules. */
export function rigVisual(ctx: RenderCtx, def: BossDef | MinionDef, actor: Actor, model: Model, opts: RigVisualOpts): RigVisual {
  return new RigVisual(ctx, def, actor, model, opts);
}
