/**
 * Bot hook for Cerbero, plus Act II defensive helpers shared by the other Act II hooks:
 *  - shockwave rings (growls, howls, novas) are meant to be JUMPED: the perfect profile jumps a ring when it is about to
 *    pass under its feet instead of rolling away along with it;
 *  - moving hazards (Pyro's running fire waves) are predicted along their velocity and rolled THROUGH at the last moment.
 */
import { yawOf } from '../../../src/core/math';
import type { Sim } from '../../../src/sim/sim';
import { shapeHits, type TargetVol } from '../../../src/sim/shapes';
import { Btn, type PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';

const vol: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };
const probe = { x: 0, y: 0, z: 0 };

/** Jump incoming ground rings (perfect profile). Returns an input to use this tick, or null. */
export function ringJump(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (bot.profile !== 'perfect') return null;
  const pl = sim.player;
  const th = bot.threats(sim, 0.6);
  const t0 = th[0];
  if (!t0) return null;
  if (!pl.grounded) {
    // airborne over a ring: do nothing else this tick (no wasted dodge press)
    return t0.kind === 'ring' && t0.t < 0.35 ? base : null;
  }
  if (t0.kind !== 'ring' || !t0.jumpable) return null;
  if (pl.state !== 'idle' && pl.state !== 'move') return null;
  // another (non-jumpable) threat landing around the same time: let the generic dodge handle it
  if (th.some((t) => t.kind !== 'ring' && t.t < t0.t + 0.45)) return null;
  if (t0.t <= 0.23 && t0.t >= 0.1) {
    base.presses |= Btn.Jump;
    return base;
  }
  return null;
}

/** Earliest contact (s) of a moving enemy hazard with the player within `horizon`, and its velocity yaw. */
export function movingHazardContact(sim: Sim, horizon: number): { t: number; yaw: number } | null {
  const pl = sim.player;
  const pv = pl.volume(vol, sim);
  pv.r += 0.3;
  let best: { t: number; yaw: number } | null = null;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || (h.vel.x === 0 && h.vel.z === 0) || h.hitOnce.has(-1)) return;
    for (let t = 0; t <= horizon; t += 1 / 60) {
      const age = h.age + t;
      if (age < h.delay) continue;
      if (age > h.delay + h.activeDur) break;
      probe.x = h.pos.x + h.vel.x * t;
      probe.y = h.pos.y;
      probe.z = h.pos.z + h.vel.z * t;
      if (shapeHits(h.shape, probe, h.yaw, 1, 0, pv)) {
        if (!best || t < best.t) best = { t, yaw: yawOf(h.vel.x, h.vel.z) };
        break;
      }
    }
  });
  return best;
}

/** Roll through a running wall of fire right before it reaches the player (perfect profile). */
export function waveDodge(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (bot.profile !== 'perfect') return null;
  const pl = sim.player;
  const c = movingHazardContact(sim, 0.4);
  if (!c) return null;
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.state === 'dodge' && pl.stateTime > 0.32);
  if (c.t <= 0.09 && free && pl.fiato > 1 && pl.grounded) {
    // through the wave: opposite to its travel direction
    const y = c.yaw + Math.PI;
    base.moveX = Math.sin(y);
    base.moveZ = Math.cos(y);
    base.presses |= Btn.Dodge;
    bot.lastDodgeTime = sim.time;
    return base;
  }
  return null;
}

/** All Act II defensive helpers in priority order. */
export function act2Defense(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (sim.seq.running || !sim.boss) return null;
  return waveDodge(sim, bot, base) ?? ringJump(sim, bot, base);
}

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base);
  },
};
export default hook;
