/**
 * Loki's copies (registry key loki:loki_copy). Same look and blows (weaker), flagged `illusion`: one blow shatters them,
 * Verità Scomoda dissolves them, and they cast NO shadow (only the real Loki has the flag `casts_shadow`).
 * Fairness: one illusion strikes at a time, and never while Loki himself is winding up or striking.
 */
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export default defineBehavior(() => ({
  init(m: Actor) {
    m.flags.add('illusion');
  },

  canUseAttack(m: Actor, sim: Sim, _def: AttackDef) {
    const boss = sim.boss;
    if (boss?.attack && boss.attack.stage !== 'recovery') return false;
    for (const o of sim.actors) {
      if (o === m || !o.alive || !o.flags.has('illusion')) continue;
      if (o.attack && o.attack.stage !== 'recovery') return false;
    }
    return true;
  },

  onDeath(m: Actor, sim: Sim) {
    sim.emit({ type: 'vfx', id: 'illusion_shatter', pos: { x: m.pos.x, y: m.pos.y + 1.6, z: m.pos.z } });
    sim.emit({ type: 'cue', id: 'loki_copy_shatter', actor: m.id, pos: { ...m.pos } });
  },
}));
