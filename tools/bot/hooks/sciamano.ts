/**
 * Bot hook for the Sciamano: the spirits are projectiles (generic dodges), the bear rising and the raven dives are marked
 * circles (shared Act II defenses). Phase 2: while he flies above the arena a melee player cannot reach him, so the
 * perfect profile keeps its stamina and dodges free (no swings at the air) and waits under him for the swoop's landing.
 */
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';

const hook: BotHook = {
  input(sim, bot, base) {
    if (!sim.boss || sim.seq.running) return null;
    const d = act2Defense(sim, bot, base);
    if (d || bot.profile !== 'perfect' || !sim.boss.flags.has('flying')) return d;
    const self = bot.hook;
    bot.hook = null;
    let r;
    try {
      r = bot.decide(sim);
    } finally {
      bot.hook = self;
    }
    r.presses &= ~(Btn.Light | Btn.Heavy | Btn.ArtPrima | Btn.ArtSeconda);
    return r;
  },
};
export default hook;
