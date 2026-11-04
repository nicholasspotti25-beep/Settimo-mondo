/**
 * Bot hook for the Grande Lupo.
 *  - Phase 2, the spirit: a player watches it too. While the spirit winds up or strikes, the perfect profile does not
 *    start a swing (it keeps its dodge free); the sloppy profile keeps swinging at the wolf.
 *  - Frost gusts (round marked ground) and the leaps: the shared Act II defenses.
 */
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

const hook: BotHook = {
  input(sim, bot, base) {
    if (!sim.boss || sim.seq.running) return null;
    const d = act2Defense(sim, bot, base);
    if (d || bot.profile !== 'perfect') return d;
    const spiritBusy = sim.actors.some((m) => m.alive && m.flags.has('spirit') && !!m.attack && m.attack.stage !== 'recovery');
    if (!spiritBusy && !bot.threats(sim, 0.9).some((t) => t.kind === 'projectile')) return null;
    const self = bot.hook;
    bot.hook = null;
    let r;
    try {
      r = bot.decide(sim);
    } finally {
      bot.hook = self;
    }
    r.presses &= ~(Btn.Light | Btn.Heavy);
    return r;
  },
};
export default hook;
