/**
 * Bot hook for Ice: Act II defenses (ring jumps, running waves) plus the duelist's rule — never feed him a fourth light hit
 * in a chain (he parries it and ripostes) and never strike into En Garde. The perfect profile mixes in a heavy blow or
 * steps back when the chain is about to become spam; the sloppy profile spams and gets punished.
 */
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';
import { ICE_CHAIN_GAP, ICE_SPAM } from '../../../src/content/bosses/ice/behavior';

let inner = false;

const hook: BotHook = {
  input(sim, bot, base) {
    const d = act2Defense(sim, bot, base);
    if (d) return d;
    if (inner || bot.profile !== 'perfect') return null;
    const boss = sim.boss;
    if (!boss) return null;
    inner = true;
    const out = bot.decide(sim);
    inner = false;
    const atk = boss.attack;
    // never strike into the guard
    if (atk?.def.id === 'en_garde' && atk.stage !== 'recovery') out.presses &= ~(Btn.Light | Btn.Heavy);
    const live = sim.time - (boss.bstate.lastLight ?? -99) <= ICE_CHAIN_GAP;
    if (live && (boss.bstate.chain ?? 0) >= ICE_SPAM - 1 && out.presses & Btn.Light) {
      out.presses &= ~Btn.Light;
      if (sim.player.fiato > 35) out.presses |= Btn.Heavy;
    }
    return out;
  },
};
export default hook;
