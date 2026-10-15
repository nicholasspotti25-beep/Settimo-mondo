/**
 * Bot hook for the Elder Tree. The tree never moves: its threats are the ground hazards announced by cracking soil (erupting
 * roots, the rolling root wave, the cage of roots) and the pollen clouds, all of which stay live longer than a roll's i-frames.
 * The shared Act I defense walks/rolls the bot out of their footprint during the telegraph, as a player reading the decals does.
 * In phase 2 the bot aims at the heart of light (lockable weak point) when it is in front of it.
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
