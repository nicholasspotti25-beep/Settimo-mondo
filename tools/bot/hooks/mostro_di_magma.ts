/**
 * Bot hook for the Mostro di Magma: the eruption. When the colossus plunges its fists into the forge, black crusts of
 * basalt rise from the floor (bstate.islands) and the arena floods with magma 2.3 s later. A player runs to the nearest
 * crust as soon as it appears and waits there until the flood drains; the bot does the same (the perfect profile at once,
 * the sloppy one late, sometimes too late). Otherwise the shared Act II defenses (ring jumps for the slam waves, ground
 * hazards left during their telegraph).
 */
import { Btn } from '../../../src/sim/types';
import type { MagmaIsland } from '../../../src/content/bosses/mostro_di_magma/behavior';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

/** Stop this far inside the crust's edge. */
const INSIDE = 1.3;

const hook: BotHook = {
  input(sim, bot, base) {
    const boss = sim.boss;
    if (!boss || sim.seq.running) return null;
    const islands = boss.bstate.islands as MagmaIsland[] | undefined;
    const warn = (boss.bstate.warn as number | undefined) ?? 0;
    const flood = (boss.bstate.flood as number | undefined) ?? 0;
    if (!islands?.length || (warn <= 0 && flood <= 0)) return act2Defense(sim, bot, base);
    const perfect = bot.profile === 'perfect';
    // the sloppy profile notices the crusts late
    if (!perfect && flood <= 0 && warn > 1.0) return act2Defense(sim, bot, base);
    const pl = sim.player;
    let best: MagmaIsland | null = null;
    let bd = Infinity;
    for (const i of islands) {
      const d = Math.hypot(i.x - pl.pos.x, i.z - pl.pos.z);
      if (d < bd) { bd = d; best = i; }
    }
    if (!best) return act2Defense(sim, bot, base);
    const need = bd - (best.r - INSIDE);
    if (need <= 0) {
      // on the crust: hold still and let the defenses handle anything else; never step off to attack
      const d = act2Defense(sim, bot, base);
      if (d) {
        d.moveX = 0;
        d.moveZ = 0;
        d.sprint = false;
        return d;
      }
      return base;
    }
    const yaw = Math.atan2(best.x - pl.pos.x, best.z - pl.pos.z);
    base.moveX = Math.sin(yaw);
    base.moveZ = Math.cos(yaw);
    base.sprint = true;
    // far and little time left: a roll covers 4.2 m at once
    const free = pl.state === 'idle' || pl.state === 'move' || (pl.state === 'dodge' && pl.stateTime > 0.32);
    if (free && need > 3 && warn < 0.9 && pl.fiato > 20 && sim.time - bot.lastDodgeTime > 0.34) {
      base.presses |= Btn.Dodge;
      bot.lastDodgeTime = sim.time;
    }
    return base;
  },
};
export default hook;
