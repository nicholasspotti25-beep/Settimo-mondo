/**
 * Bot hook for Lucifero I (scripted). The perfect profile chooses Affronta and survives the two-minute duel until Il
 * Rifiuto; the sloppy profile chooses Implora and holds for five seconds. Either way the encounter completes when
 * lucifero_choice is set (the fight ends with end_fight_scripted, never with a kill).
 */
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

let profile: 'perfect' | 'sloppy' = 'perfect';

const hook: BotHook = {
  before(_sim, bot) {
    profile = bot.profile;
  },
  choice(_sim, keys) {
    const want = profile === 'perfect' ? 'choice.lucifero.affronta' : 'choice.lucifero.implora';
    return Math.max(0, keys.indexOf(want));
  },
  countsAsWin(sim) {
    return sim.state.luciferoChoice !== null;
  },
  input(sim, bot, base) {
    return act2Defense(sim, bot, base);
  },
};
export default hook;
