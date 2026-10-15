/**
 * Bot hook for the Mostro della Palude. Phase 2 splits the colossus into three drowned figures that fight one after another
 * while the colossus itself is hidden: the generic bot only reads `sim.boss`, so during the split the hook runs the generic
 * decision with the active figure standing in as the boss (read-only swap for the duration of the decision).
 * Both phases also use the shared Act I defensive helpers (cavaliere_errante.ts).
 */
import type { Actor } from '../../../src/sim/actor';
import type { Sim } from '../../../src/sim/sim';
import type { PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act1Defense } from './cavaliere_errante';

let nested = false;

/** The drowned figure currently fighting (phase 2), if any. */
export function activeFigure(sim: Sim): Actor | null {
  for (const a of sim.actors) if (a.kind === 'minion' && a.team === 'enemy' && a.alive) return a;
  return null;
}

const hook: BotHook = {
  input(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
    if (nested) return null;
    const d = act1Defense(sim, bot, base);
    if (d) return d;
    const boss = sim.boss;
    const fig = activeFigure(sim);
    if (!boss || !fig || !boss.flags.has('split')) return null;
    nested = true;
    const saved = sim.boss;
    try {
      sim.boss = fig;
      if (!sim.player.lock || sim.player.lock.actor !== fig.id) sim.player.lock = { actor: fig.id, part: -1 };
      return bot.decide(sim);
    } finally {
      sim.boss = saved;
      nested = false;
    }
  },
};
export default hook;
