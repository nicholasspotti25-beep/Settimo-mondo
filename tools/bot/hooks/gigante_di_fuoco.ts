/**
 * Bot hook for the Gigante di Fuoco.
 *  - Ember breath: a slow sweeping cone. A player steps out of it sideways and keeps walking with the sweep; the perfect
 *    profile leaves during the last part of the wind-up, the sloppy one only once the embers already burn.
 *  - The head: when he bends over his fists (twin slam) or hangs it after a charge (flag head_low), strike the head.
 *  - Everything else: the shared Act II defenses (ring jumps for the slam / flare rings, ground hazards left during their
 *    telegraph — the cracking rim, the burning basalt, the crater boulders —, through-charges read during the wind-up).
 */
import { dist2D, yawTo } from '../../../src/core/math';
import type { Sim } from '../../../src/sim/sim';
import { Btn, type PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

/**
 * Walk out of burning ground (active damage-over-time hazards), away from its center: a player does not stand in fire.
 * Shared by the Act III-A hooks.
 */
export function leaveBurningGround(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  if (pl.state !== 'idle' && pl.state !== 'move' && pl.state !== 'guard') return null;
  let best = -1, bx = 0, bz = 0;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || h.tick <= 0 || h.age < h.delay - 0.15 || h.age > h.delay + h.activeDur) return;
    const r = sim.hazardRadius(h) + 0.6;
    const d = Math.hypot(pl.pos.x - h.pos.x, pl.pos.z - h.pos.z);
    if (d < r && r - d > best) { best = r - d; bx = h.pos.x; bz = h.pos.z; }
  });
  if (best < 0) return null;
  // the sloppy profile lingers a little in the fire
  if (bot.profile !== 'perfect' && best < 1.0) return null;
  const y = Math.atan2(pl.pos.x - bx, pl.pos.z - bz);
  base.moveX = Math.sin(y);
  base.moveZ = Math.cos(y);
  base.sprint = true;
  return base;
}

/** Half-angle of the breath cone (data: 38 degrees) plus a margin, radians. */
const HALF = ((38 / 2 + 9) * Math.PI) / 180;

const hook: BotHook = {
  input(sim, bot, base) {
    const boss = sim.boss;
    if (!boss || sim.seq.running) return null;
    const atk = boss.attack;
    if (atk && atk.def.id === 'ember_breath') {
      const perfect = bot.profile === 'perfect';
      const pl = sim.player;
      const early = atk.stage === 'telegraph' && atk.activeTime > -0.65;
      const live = atk.stage === 'active';
      if ((perfect && (early || live)) || (!perfect && live && atk.activeTime > 0.35)) {
        const d = dist2D(boss.pos, pl.pos);
        const yawP = yawTo(boss.pos, pl.pos);
        const rel = Math.atan2(Math.sin(yawP - boss.yaw), Math.cos(yawP - boss.yaw));
        if (d < 26 && Math.abs(rel) < HALF) {
          // perpendicular to the boss->player line, on the side the player already leans to
          const side = rel >= 0 ? 1 : -1;
          const y = yawP + side * Math.PI * 0.5;
          base.moveX = Math.sin(y);
          base.moveZ = Math.cos(y);
          base.sprint = true;
          base.presses = 0;
          // caught by the embers: roll out sideways (i-frames)
          const pl2 = sim.player;
          if (live && perfect && (pl2.state === 'idle' || pl2.state === 'move') && pl2.fiato > 20 && sim.time - bot.lastDodgeTime > 0.5) {
            base.presses |= Btn.Dodge;
            bot.lastDodgeTime = sim.time;
          }
          return base;
        }
      }
    }
    return act2Defense(sim, bot, base) ?? leaveBurningGround(sim, bot, base);
  },
  target(sim) {
    const boss = sim.boss;
    if (!boss || !boss.flags.has('head_low')) return null;
    const head = boss.part('head');
    if (!head || !head.active) return null;
    return { pos: head.center, radius: 1.7 };
  },
};
export default hook;
