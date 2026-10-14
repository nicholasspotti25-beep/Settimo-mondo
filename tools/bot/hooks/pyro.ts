/** Bot hook for Pyro: rolls through his running fire waves and jumps the nova ring (Act II helpers). */
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base);
  },
};
export default hook;
