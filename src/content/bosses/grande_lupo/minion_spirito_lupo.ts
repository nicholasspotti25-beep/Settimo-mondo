/**
 * The Grande Lupo's spirit (registry key grande_lupo:spirito_lupo): a pale wolf of snow and light (flag `spirit`).
 * Fairness: it only starts a blow while the wolf is not attacking at all (one blow at a time). Its pack leap is started by
 * the wolf's behavior (pack_lunge), never on a downed player.
 */
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export default defineBehavior(() => ({
  init(m: Actor) {
    m.flags.add('spirit');
  },

  canUseAttack(_m: Actor, sim: Sim, _def: AttackDef) {
    return !sim.boss?.attack;
  },

  onDeath(m: Actor, sim: Sim) {
    sim.emit({ type: 'vfx', id: 'spirit_fade', pos: { x: m.pos.x, y: m.pos.y + 2, z: m.pos.z } });
    sim.emit({ type: 'cue', id: 'lupo_spirit_fade', actor: m.id, pos: { ...m.pos } });
  },
}));
