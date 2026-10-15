/** Bot hook for Thunder: Act II defenses (jumps his shock rings, rolls through running waves). */
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base);
  },
};
export default hook;
