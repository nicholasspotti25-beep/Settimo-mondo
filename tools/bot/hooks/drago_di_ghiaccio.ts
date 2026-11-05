/**
 * Bot hook for the Drago di Ghiaccio (Act V mini boss).
 *
 * - The shared ground defenses (tools/bot/defense.ts: frost rings jumped, marked stalactites left during their 1.5 s mark
 *   instead of being rolled at the last frame of a swing).
 * - Breath escape (both profiles, the sloppy one late): during the 1.1 s inhale and the breath, a player inside the cone
 *   runs out sideways (away from the cone's axis) instead of rolling inside a 15 m cone that follows a little.
 * The icy patches are not threats (they never hit): the bot slides on them like a player.
 */
import { angleDiff, dist2D, yawTo } from '../../../src/core/math';
import { emptyInput } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import type { Sim } from '../../../src/sim/sim';
import type { Bot } from '../bot';
import type { PlayerInput } from '../../../src/sim/types';
import { act2Defense } from '../defense';

const BREATHS: Record<string, { r: number; half: number }> = {
  frost_breath: { r: 15, half: 21 },
  blizzard_breath: { r: 16, half: 26 },
};

export function breathEscape(sim: Sim, bot: Bot, base: PlayerInput, cones: Record<string, { r: number; half: number }>): PlayerInput | null {
  const boss = sim.boss;
  const pl = sim.player;
  const atk = boss?.attack;
  if (!boss || !atk || !cones[atk.def.id] || atk.stage === 'recovery') return null;
  if (pl.state !== 'idle' && pl.state !== 'move') return null;
  if (bot.profile !== 'perfect' && atk.stage === 'telegraph' && atk.time < atk.def.telegraph * 0.6) return null;
  const c = cones[atk.def.id];
  const d = dist2D(boss.pos, pl.pos);
  if (d > c.r + 2) return null;
  const off = angleDiff(boss.yaw, yawTo(boss.pos, pl.pos));
  const margin = (c.half + 14) * (Math.PI / 180);
  if (Math.abs(off) > margin) return null;
  const side = off >= 0 ? 1 : -1;
  // near the tip of the cone, step back out of its reach; otherwise run out sideways
  const y = d > c.r - 3.5 ? yawTo(boss.pos, pl.pos) : boss.yaw + side * (Math.PI / 2 + 0.25);
  const r = { ...emptyInput(), ...base };
  r.moveX = Math.sin(y);
  r.moveZ = Math.cos(y);
  r.sprint = true;
  r.presses = 0;
  return r;
}

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base) ?? breathEscape(sim, bot, base, BREATHS);
  },
};
export default hook;
