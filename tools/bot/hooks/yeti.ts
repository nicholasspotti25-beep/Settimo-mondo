/**
 * Bot hook for the Yeti.
 *  - The painting: a player soon learns that standing by the painting of the last dawn brings the guard leap; the perfect
 *    profile steps away from it (outside PAINTING_GUARD) when nothing else threatens.
 *  - Avalanches (round ground hazards) and the leaps: the shared Act II defenses.
 */
import { nearPainting, paintingPos } from '../../../src/content/bosses/yeti/behavior';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

const hook: BotHook = {
  input(sim, bot, base) {
    const boss = sim.boss;
    if (!boss || sim.seq.running) return null;
    const d = act2Defense(sim, bot, base);
    if (d) return d;
    const pl = sim.player;
    if (bot.profile === 'perfect' && nearPainting(sim) && (pl.state === 'idle' || pl.state === 'move')) {
      const p = paintingPos(sim);
      const y = Math.atan2(pl.pos.x - p.x, pl.pos.z - p.z);
      base.moveX = Math.sin(y);
      base.moveZ = Math.cos(y);
      base.sprint = true;
      return base;
    }
    return null;
  },
};
export default hook;
