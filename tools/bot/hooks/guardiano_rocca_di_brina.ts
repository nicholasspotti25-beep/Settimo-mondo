/**
 * Bot hook for the Guardiano della Rocca di Brina.
 *  - The tower shield: a player soon learns that light blows on the shield do nothing but bring the punishing bash, and
 *    that heavy blows still break the armor's Equilibrio. While the shield is up and the bot stands in front of it, the
 *    perfect profile turns its light presses into heavy ones; the sloppy profile keeps spamming light blows (and gets
 *    punished). Once Spezzato (shield down) and in phase 2 the generic offense is untouched.
 *  - The blade cyclone (phase 2): back away from it as it walks forward (the perfect profile from the end of the wind-up,
 *    the sloppy one late).
 *  - Frost lines (box hazards), the blade ring (jump), the charge: the shared Act II defenses.
 */
import { yawTo } from '../../../src/core/math';
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

const hook: BotHook = {
  input(sim, bot, base) {
    const boss = sim.boss;
    if (!boss || sim.seq.running) return null;
    const d = act2Defense(sim, bot, base);
    if (d) return d;
    const atk = boss.attack;
    if (atk && atk.def.id === 'blade_cyclone') {
      const perfect = bot.profile === 'perfect';
      const go = perfect ? atk.stage === 'active' || (atk.stage === 'telegraph' && atk.activeTime > -0.5) : atk.stage === 'active' && atk.activeTime > 0.5;
      const pl = sim.player;
      const dist = Math.hypot(pl.pos.x - boss.pos.x, pl.pos.z - boss.pos.z);
      if (go && dist < 9 && (pl.state === 'idle' || pl.state === 'move')) {
        const y = yawTo(boss.pos, pl.pos);
        base.moveX = Math.sin(y);
        base.moveZ = Math.cos(y);
        base.sprint = true;
        return base;
      }
    }
    if (bot.profile !== 'perfect' || !boss.flags.has('shield_up')) return null;
    const rel = yawTo(boss.pos, sim.player.pos) - boss.yaw;
    if (Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel))) > (70 * Math.PI) / 180) return null;
    // run the generic logic without this hook, then swap light blows for heavy ones
    const self = bot.hook;
    bot.hook = null;
    let r;
    try {
      r = bot.decide(sim);
    } finally {
      bot.hook = self;
    }
    if (r.presses & Btn.Light) {
      r.presses &= ~Btn.Light;
      if (sim.player.fiato > 30) r.presses |= Btn.Heavy;
    }
    return r;
  },
};
export default hook;
