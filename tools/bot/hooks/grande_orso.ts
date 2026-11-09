/**
 * Bot hook for the Grande Orso: the falling trees (long box shadows), the quake rings and the head charges are read by
 * the shared Act II defenses; the hug and the back kick by the generic dodges.
 */
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base);
  },
};
export default hook;
