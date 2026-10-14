/**
 * Elder Tree — rooted giant. Turns its bark face slowly (data `move.turn`), never walks.
 * - Frontal attacks (`requires: front`) need the player within the face's reach cone; behind it the tree answers with roots.
 * - Phase 2 (flag 'heart_open'): the trunk opens, the heart part becomes active and lockable. Heavy hits and Arts on the heart
 *   break Equilibrio fast (part poise_mult in data); the bark resists Equilibrio damage (x0.5) once the heart is exposed.
 * - Death: cue 'first_light' — the arena dressing lets the first ray of light in centuries reach the forest floor.
 */
import { DEG, angleDiff, yawTo } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Half-angle (deg) of the cone in front of the face where branch attacks can reach. */
export const FRONT_CONE_DEG = 80;
/** Equilibrio multiplier on the bark while the heart is exposed. */
export const BARK_POISE_MULT = 0.5;

export function playerInFront(a: Actor, sim: Sim): boolean {
  return Math.abs(angleDiff(a.yaw, yawTo(a.pos, sim.player.pos))) <= FRONT_CONE_DEG * DEG;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate = { heartOpen: false };
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef): boolean {
    const open = a.flags.has('heart_open');
    switch (def.requires) {
      case 'front': return playerInFront(a, sim);
      case 'heart_open': return open;
      case 'heart_open_front': return open && playerInFront(a, sim);
      default: return true;
    }
  },

  modifyIncoming(a, _sim, dmg, part) {
    if (!a.flags.has('heart_open')) return;
    if (part?.id === 'heart') return; // weak point: data multipliers apply
    dmg.poise *= BARK_POISE_MULT;
  },

  onPhaseEnter(a: Actor, sim: Sim, _index: number, def) {
    if (def.id !== 'p2') return;
    const heart = a.part('heart');
    if (heart) heart.active = true;
    a.bstate.heartOpen = true;
    sim.emit({ type: 'cue', id: 'elder_heart_open', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 2.3, z: a.pos.z } });
  },

  onDeath(a: Actor, sim: Sim) {
    const heart = a.part('heart');
    if (heart) heart.active = false;
    sim.emit({ type: 'cue', id: 'first_light', actor: a.id, pos: { ...a.pos } });
  },
}));
