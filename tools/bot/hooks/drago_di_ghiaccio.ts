/**
 * Bot hook for the Drago di Ghiaccio (Act V mini boss).
 *
 * The shared ground defenses (tools/bot/defense.ts: frost rings jumped, marked stalactites left during their 1.5 s mark
 * instead of being rolled at the last frame of a swing). The icy patches are not threats (they never hit): the bot simply
 * slides on them like a player. Tail sweeps and the tail spin are low hit windows read by the generic threat model.
 */
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base);
  },
};
export default hook;
