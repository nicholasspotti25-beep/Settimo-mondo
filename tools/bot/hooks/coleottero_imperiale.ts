/**
 * Bot hook for the Coleottero Imperiale.
 *  - Garden offense (shared, tools/bot/hooks/re_mantide.ts); the perfect profile fights from his flanks and back (his
 *    front armor turns blows): while he is not attacking it circles toward his side before closing in.
 *  - The dive from above: the generic threat model tests the hit at his airborne position, so the hook rolls away from
 *    the marked landing spot (the player's position when the dive starts) right before the impact.
 *  - Bombing-run clods and the quake rings: the shared Act II defenses.
 */
import { dist2D, yawTo } from '../../../src/core/math';
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { gardenDecide } from './re_mantide';

const mark = { x: 0, y: 0, z: 0, set: false };

const hook: BotHook = {
  input(sim, bot, base) {
    const boss = sim.boss;
    if (!boss || sim.seq.running) return null;
    const pl = sim.player;
    const atk = boss.attack;
    if (atk?.def.id === 'dive_bomb') {
      if (atk.stage === 'telegraph') mark.set = false;
      else if (!mark.set) {
        mark.x = pl.pos.x;
        mark.z = pl.pos.z;
        mark.set = true;
      }
      const impact = (0.6 - atk.activeTime) / atk.rate;
      const perfect = bot.profile === 'perfect';
      if (atk.stage === 'active' && impact > 0 && impact < (perfect ? 0.2 : 0.08) && dist2D(pl.pos, mark) < 2.8 && pl.grounded && pl.fiato > 1 &&
        (pl.state === 'idle' || pl.state === 'move')) {
        const y = yawTo(mark, pl.pos);
        base.moveX = Math.sin(y);
        base.moveZ = Math.cos(y);
        base.presses |= Btn.Dodge;
        bot.lastDodgeTime = sim.time;
        return base;
      }
    }
    const r = gardenDecide(sim, bot, base);
    if (!r || bot.profile !== 'perfect' || r.presses & (Btn.Dodge | Btn.Jump | Btn.Drink)) return r;
    // circle toward his flank while he is idle and you stand in front of his mandibles
    if (!boss.attack && Math.abs(boss.relativeAngle(pl.pos)) < (60 * Math.PI) / 180 && dist2D(pl.pos, boss.pos) < 4.5) {
      const side = boss.relativeAngle(pl.pos) >= 0 ? 1 : -1;
      const y = yawTo(boss.pos, pl.pos) + side * 0.9;
      const tx = boss.pos.x + Math.sin(y) * (boss.radius + 0.4), tz = boss.pos.z + Math.cos(y) * (boss.radius + 0.4);
      const my = yawTo(pl.pos, { x: tx, y: 0, z: tz });
      r.moveX = Math.sin(my);
      r.moveZ = Math.cos(my);
      r.presses &= ~(Btn.Light | Btn.Heavy);
    }
    return r;
  },
};
export default hook;
