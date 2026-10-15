/**
 * Bot hook for Caronte. On the boat and the bridge of souls the lantern's gaze runs along the bridge (box hazard, escaped across
 * its short axis); in phase 2, on the luminous current, rings of drowned hands and eddies rise around the player (round hazards
 * live longer than a roll's i-frames). The shared Act I defense (cavaliere_errante.ts) handles all of them.
 */
import type { Sim } from '../../../src/sim/sim';
import type { PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act1Defense } from './cavaliere_errante';

const hook: BotHook = {
  input(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
    return act1Defense(sim, bot, base);
  },
};
export default hook;
