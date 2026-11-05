/**
 * A segment of the Verme Mangiamondi rolling like a millstone (registry key verme_mangiamondi:macina). One blow at a time: it
 * starts a roll only while no other enemy is winding up or striking, and never at a player lying on the floor.
 */
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import { otherEnemyStriking } from './behavior';

export default defineBehavior(() => ({
  init(m: Actor) {
    m.flags.add('millstone');
  },

  canUseAttack(m: Actor, sim: Sim, _def: AttackDef) {
    if (sim.player.state === 'knockdown' || sim.player.state === 'dead') return false;
    return !otherEnemyStriking(sim, m);
  },

  onDeath(m: Actor, sim: Sim) {
    sim.emit({ type: 'cue', id: 'verme_segment_crumbles', actor: m.id, pos: { ...m.pos } });
  },
}));
