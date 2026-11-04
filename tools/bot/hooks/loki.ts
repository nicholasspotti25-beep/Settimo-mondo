/**
 * Bot hook for Loki.
 *  - Phase 1: the perfect profile reads the shadow and always goes for the real Loki (the generic target); the sloppy
 *    profile cannot tell them apart and goes for whichever figure is nearest (copies included).
 *  - The copies: a player watches them too. While an illusion winds up or strikes, or a bolt is on its way, the perfect
 *    profile does not start a swing (it keeps its dodge free).
 *  - Mirror strikes, bolts, falling ice and the imitations: the shared Act II defenses + generic dodges.
 */
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

const hook: BotHook = {
  input(sim, bot, base) {
    if (!sim.boss || sim.seq.running) return null;
    const d = act2Defense(sim, bot, base);
    if (d || bot.profile !== 'perfect') return d;
    const copyBusy = sim.actors.some((m) => m.alive && m.flags.has('illusion') && !!m.attack && m.attack.stage !== 'recovery');
    if (!copyBusy && !bot.threats(sim, 0.9).some((t) => t.kind === 'projectile')) return null;
    const self = bot.hook;
    bot.hook = null;
    let r;
    try {
      r = bot.decide(sim);
    } finally {
      bot.hook = self;
    }
    r.presses &= ~(Btn.Light | Btn.Heavy);
    return r;
  },
  target(sim, bot) {
    const boss = sim.boss;
    if (!boss || bot.profile === 'perfect') return null;
    const pl = sim.player.pos;
    let best = boss, bd = Math.hypot(boss.pos.x - pl.x, boss.pos.z - pl.z);
    for (const m of sim.actors) {
      if (!m.alive || !m.flags.has('illusion')) continue;
      const d = Math.hypot(m.pos.x - pl.x, m.pos.z - pl.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best === boss ? null : { pos: best.pos, radius: best.radius };
  },
};
export default hook;
