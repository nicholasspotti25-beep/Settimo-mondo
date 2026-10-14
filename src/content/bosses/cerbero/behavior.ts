/**
 * Cerbero (7) — three heads, three roles. The sim drives each head through its part anchor so that the head performing
 * an attack visibly winds up (rears back), strikes, and then stays low through the recovery where it can be punished.
 * Front attacks need the target in front, the tail and stomp cover the back and the belly. Phase 2 breaks the chains.
 * Deterministic: no randomness here (selection uses the default sim.rng selector).
 */
import { DEG, angleDiff, clamp, yawTo } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor, PartRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Attacks that need the target in front (heads and paws). */
const FRONT = new Set(['bite_left', 'bite_snap', 'fire_spit', 'fire_breath', 'paw_swipe', 'three_heads', 'three_heads_fire', 'bite_frenzy']);
/** Attacks for a target behind. */
const BACK = new Set(['tail_lash']);

type Pose = [number, number, number];
const REST: Pose = [0, 0, 0];
const REAR: Pose = [0, 0.55, -1.0];
const BITE_DOWN: Pose = [-0.3, -3.4, 2.6];
const LOW: Pose = [0, -2.9, 0.9];
const SPIT_SNAP: Pose = [0, -0.8, 1.0];
const ROAR_UP: Pose = [0, 0.9, -0.2];
const SLUMP: Pose = [0, -3.4, 0.6];
const GROWL_LOW: Pose = [0, -3.0, 1.2];

/** Target anchor for one head given the current attack and stage. */
function headPose(a: Actor, p: PartRuntime, out: Pose): number {
  // returns the smoothing rate
  if (a.state === 'dead' || a.state === 'spezzato' || p.spezzato > 0) {
    set(out, SLUMP);
    return 5;
  }
  if (a.state === 'transition') {
    set(out, ROAR_UP);
    return 6;
  }
  const atk = a.attack;
  if (!atk) {
    set(out, REST);
    return 3.5;
  }
  const def = atk.def;
  const anim = def.anim ?? def.id;
  const mine = def.part === p.id;
  const tTele = clamp(atk.time / Math.max(0.01, def.telegraph), 0, 1);
  const tRec = clamp((atk.activeTime - def.active) / Math.max(0.01, def.recovery), 0, 1);
  if (anim === 'howl') {
    // all three heads howl together, then sag
    if (atk.stage === 'recovery') set(out, tRec < 0.7 ? LOW : REST);
    else set(out, ROAR_UP);
    return 6;
  }
  if (!mine) {
    // the other heads pull aside so the attacking one reads clearly
    out[0] = p.id === 'head_left' ? 0.5 : p.id === 'head_right' ? -0.5 : 0;
    out[1] = def.part ? 0.25 : 0;
    out[2] = def.part ? -0.4 : 0;
    return 4;
  }
  if (anim === 'bite_l') {
    if (atk.stage === 'telegraph') lerpPose(out, REST, REAR, tTele);
    else if (atk.stage === 'active') set(out, BITE_DOWN);
    else set(out, tRec < 0.72 ? BITE_DOWN : REST);
    return atk.stage === 'active' ? 22 : 7;
  }
  if (anim === 'spit') {
    if (atk.stage === 'telegraph') lerpPose(out, REST, REAR, tTele);
    else if (atk.stage === 'active') set(out, SPIT_SNAP);
    else set(out, tRec < 0.7 ? LOW : REST);
    return atk.stage === 'active' ? 18 : 6;
  }
  if (anim === 'breath') {
    if (atk.stage === 'telegraph') lerpPose(out, REST, REAR, tTele);
    else if (atk.stage === 'active') {
      // the head sweeps from Cerbero's right (-X) to its left (+X) with the flame
      const k = clamp(atk.activeTime / Math.max(0.01, def.active), 0, 1);
      out[0] = -2.2 + 4.4 * k;
      out[1] = -2.2;
      out[2] = 1.2;
    } else set(out, tRec < 0.75 ? LOW : REST);
    return 8;
  }
  if (anim === 'howl_r') {
    // growls low to the ground, then lifts as the shockwave leaves, then sags panting
    if (atk.stage === 'telegraph') set(out, GROWL_LOW);
    else if (atk.stage === 'active') set(out, ROAR_UP);
    else set(out, tRec < 0.7 ? LOW : REST);
    return atk.stage === 'telegraph' ? 5 : 8;
  }
  set(out, REST);
  return 4;
}

function set(out: Pose, v: Pose): void {
  out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
}
function lerpPose(out: Pose, a: Pose, b: Pose, t: number): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

const pose: Pose = [0, 0, 0];

export function cerberoAnimateHeads(a: Actor, dt: number): void {
  for (const p of a.parts) {
    const rate = headPose(a, p, pose);
    const k = 1 - Math.exp(-rate * dt);
    p.anchor.x += (pose[0] - p.anchor.x) * k;
    p.anchor.y += (pose[1] - p.anchor.y) * k;
    p.anchor.z += (pose[2] - p.anchor.z) * k;
  }
}

/** Signed angle (rad) from the boss's facing to the player. */
function relToPlayer(a: Actor, sim: Sim): number {
  return angleDiff(a.yaw, yawTo(a.pos, sim.player.pos));
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.chains = false;
  },
  update(a: Actor, sim: Sim, dt: number) {
    cerberoAnimateHeads(a, dt);
    return false;
  },
  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase >= 1 && !a.bstate.chains) {
      a.bstate.chains = true;
      for (const p of a.parts) sim.emit({ type: 'vfx', id: 'cerbero_chains_break', pos: { ...p.center } });
      sim.emit({ type: 'shake', strength: 0.5, dur: 0.8 });
      sim.emit({ type: 'sfx', id: 'chains_snap', pos: { ...a.pos } });
    }
  },
  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    const rel = Math.abs(relToPlayer(a, sim));
    if (FRONT.has(def.id)) return rel < 75 * DEG;
    if (BACK.has(def.id)) return rel > 105 * DEG;
    return true;
  },
  onAttackStart(a: Actor, sim: Sim, atk) {
    // which head is about to strike: the presentation lights its eyes and throat
    if (atk.def.part) sim.emit({ type: 'cue', id: `head_tell:${atk.def.part}`, actor: a.id, pos: { ...(a.part(atk.def.part)?.center ?? a.pos) } });
  },
}));
