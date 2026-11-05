/**
 * Drago del Vuoto (34), mini boss. It moves in reverse: while closing distance it walks backward, tail first, on the sky that
 * has become ground (flag `reverse_walk` while it does), so its tail lash and reverse charge are offered only toward a player
 * behind it, and its breath/bite turn it round first (the turn is the read). Phase 2 inverts the gravity of the whole arena
 * (sim.setGravity(-1)); gravity is restored when it dies or the fight is set up again.
 * Deterministic: no randomness here.
 */
import { DEG, angleDiff, yawTo } from '../../../core/math';
import type { AttackDef, PhaseDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Attacks performed by the hindquarters: only toward a player more than BEHIND_ANGLE from its head. */
export const TAIL_ATTACKS = ['tail_lash', 'reverse_charge'];
export const BEHIND_ANGLE = 110 * DEG;

/** Signed angle of the player from the dragon's head direction (0 = in front, ±PI = right behind). */
export function playerAngle(a: Actor, sim: Sim): number {
  return angleDiff(a.yaw, yawTo(a.pos, sim.player.pos));
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    sim.setGravity(1);
    a.bstate.inverted = false;
  },

  movement(a: Actor, sim: Sim, dt: number) {
    const pl = sim.player;
    const dx = pl.pos.x - a.pos.x, dz = pl.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const reach = a.radius * a.scale + a.boss.move.preferred_range[1];
    if (d <= reach || d < 1e-3) {
      a.flags.delete('reverse_walk');
      return false;
    }
    // walk backward toward the player: the head faces away
    const away = Math.atan2(-dx, -dz);
    const turn = a.boss.move.turn * dt;
    const diff = angleDiff(a.yaw, away);
    a.yaw += Math.max(-turn, Math.min(turn, diff));
    const sp = a.boss.move.walk * a.rate(sim) * dt;
    a.pos.x += (dx / d) * sp;
    a.pos.z += (dz / d) * sp;
    sim.clampActor(a);
    a.flags.add('reverse_walk');
    a.anim = 'walk_reverse';
    return true;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (TAIL_ATTACKS.includes(def.id)) return Math.abs(playerAngle(a, sim)) >= BEHIND_ANGLE;
    return true;
  },

  onAttackStart(a: Actor) {
    a.flags.delete('reverse_walk');
  },

  onPhaseEnter(a: Actor, sim: Sim, _i: number, ph: PhaseDef) {
    if (ph.id !== 'p2' || a.bstate.inverted) return;
    a.bstate.inverted = true;
    sim.setGravity(-1);
    sim.emit({ type: 'cue', id: 'vuoto_gravity_inverts', actor: a.id, pos: { ...a.pos } });
    sim.emit({ type: 'shake', strength: 0.6, dur: 1.2 });
  },

  onDeath(_a: Actor, sim: Sim) {
    sim.setGravity(1);
  },
}));
