/**
 * Bot hook for the Cavaliere Errante, plus the Act I defensive helpers shared by the other Act I hooks:
 *  - box-shaped hazards (Caronte's lantern gaze along the bridge, the Great Devourer's tail across the pier) are escaped
 *    sideways, across their long axis, instead of "away from the center" (which would run along the beam);
 *  - the perfect profile never holds guard (the knight dives at an open guard), so no extra rule is needed for that here.
 */
import { DEG } from '../../../src/core/math';
import type { Sim } from '../../../src/sim/sim';
import { shapeHits, type TargetVol } from '../../../src/sim/shapes';
import { Btn, type PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';

const vol: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };

/** Escape an enemy box hazard that is about to turn active under the player: roll across its short axis. */
export function boxHazardDodge(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  const lead = bot.profile === 'perfect' ? 0.1 : 0.05;
  let best: { t: number; yaw: number } | null = null;
  const pv = pl.volume(vol, sim);
  pv.r += 0.35;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || h.shape.type !== 'box' || h.hitOnce.has(-1)) return;
    const until = h.delay - h.age;
    if (until < -0.02 || until > lead) return;
    if (!shapeHits(h.shape, h.pos, h.yaw, 1, 0, pv)) return;
    const sh = h.shape;
    // box local frame: x' = across, z' = along (data yaw convention); escape along the short half-axis
    const alongX = sh.half[0] >= sh.half[2];
    const by = h.yaw + (sh.yaw ?? 0) * DEG;
    const s = Math.sin(by), co = Math.cos(by);
    // box center in world
    const cx = h.pos.x + sh.c[0] * co + sh.c[2] * s;
    const cz = h.pos.z - sh.c[0] * s + sh.c[2] * co;
    const dx = pl.pos.x - cx, dz = pl.pos.z - cz;
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    // world direction of the short axis
    let yaw: number;
    if (alongX) yaw = by + (lz >= 0 ? 0 : Math.PI); // local +z
    else yaw = by + (lx >= 0 ? Math.PI / 2 : -Math.PI / 2); // local +x
    if (!best || until < best.t) best = { t: until, yaw };
  });
  if (!best) return null;
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.state === 'dodge' && pl.stateTime > 0.32);
  if (!free || pl.fiato <= 1) return null;
  const b = best as { t: number; yaw: number };
  base.moveX = Math.sin(b.yaw);
  base.moveZ = Math.cos(b.yaw);
  base.presses |= Btn.Dodge;
  bot.lastDodgeTime = sim.time;
  return base;
}

/** All Act I defensive helpers in priority order. */
export function act1Defense(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (sim.seq.running || !sim.boss) return null;
  return boxHazardDodge(sim, bot, base);
}

const hook: BotHook = {
  input(sim, bot, base) {
    return act1Defense(sim, bot, base);
  },
};
export default hook;
