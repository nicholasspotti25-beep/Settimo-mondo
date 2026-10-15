/**
 * Bot hook for the Great Devourer (mini boss). Most of its threats come from below the planks or across the rafts, announced
 * only by ripples and wakes: strikes from below and triple strikes (round ripple hazards that stay live past a roll's
 * i-frames), the breach charge through the rafts (a 24 m/s through-charge), coils around the stilts and the tail across the
 * pier. The shared Act I defense (cavaliere_errante.ts) reads those telegraphs as a player does: off the charge line, out of
 * the ripples, across the tail.
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
