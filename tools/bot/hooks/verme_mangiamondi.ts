/**
 * Bot hook for the Verme Mangiamondi (Act VI mini boss). While a swallow band (the rim it is about to eat) is marked, every
 * profile walks toward the arena center (the perfect one early, the sloppy one late, rolling if needed); otherwise the shared
 * ground defenses (eruption marks, ash rings jumped, falling debris).
 */
import type { Sim } from '../../../src/sim/sim';
import { Btn, type PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';

export function swallowEscape(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const ar = sim.zone?.activeArenaDef;
  if (!ar) return null;
  let inner = Infinity, left = Infinity;
  sim.hazards.forEachActive((h) => {
    if (h.kind !== 'verme_swallow' || h.age >= h.delay || h.shape.type !== 'arc') return;
    inner = Math.min(inner, h.shape.r_in ?? 0);
    left = Math.min(left, h.delay - h.age);
  });
  if (!Number.isFinite(inner)) return null;
  const pl = sim.player;
  const dx = ar.center[0] - pl.pos.x, dz = ar.center[2] - pl.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < inner - 2.5) return null;
  if (bot.profile !== 'perfect' && left > 0.7) return null;
  base.moveX = dx / (d || 1);
  base.moveZ = dz / (d || 1);
  base.sprint = true;
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || pl.state === 'running';
  if (left < 0.6 && free && pl.fiato > 1 && sim.time - bot.lastDodgeTime > 0.34) {
    base.presses |= Btn.Dodge;
    bot.lastDodgeTime = sim.time;
  }
  return base;
}

const hook: BotHook = {
  input(sim, bot, base) {
    return swallowEscape(sim, bot, base) ?? act2Defense(sim, bot, base);
  },
};
export default hook;
