/**
 * Bot hook for the Drago del Vuoto (Act VI mini boss): the void breath escaped like the Drago di Ghiaccio's (out of the cone,
 * sideways or back), the shared ground defenses (marked gravity holes, black hole, drop marks, void rings jumped), and
 * walking out against the pull of an open hole instead of trading blows inside it.
 */
import type { Sim } from '../../../src/sim/sim';
import type { PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';
import { breathEscape } from './drago_di_ghiaccio';

/** The void cones (radius from the dragon's center, half-angle in degrees). */
const BREATHS: Record<string, { r: number; half: number }> = {
  void_breath: { r: 17.5, half: 24 },
  ng_sweeping_breath: { r: 15.5, half: 46 },
};

/** Walk out of the pull of an open hole (every profile). */
export function holeEscape(sim: Sim, _bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  if (pl.state !== 'idle' && pl.state !== 'move' && pl.state !== 'guard' && pl.state !== 'running') return null;
  let ex = 0, ez = 0, found = false;
  sim.hazards.forEachActive((h) => {
    if ((h.kind !== 'vuoto_hole' && h.kind !== 'vuoto_black_hole') || h.age < h.delay || h.shape.type !== 'cylinder') return;
    const dx = pl.pos.x - h.pos.x, dz = pl.pos.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < h.shape.r + 3.5) { found = true; ex += dx / (d || 1); ez += dz / (d || 1); }
  });
  if (!found) return null;
  const l = Math.hypot(ex, ez) || 1;
  base.moveX = ex / l;
  base.moveZ = ez / l;
  base.sprint = true;
  return base;
}

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base) ?? breathEscape(sim, bot, base, BREATHS) ?? holeEscape(sim, bot, base);
  },
};
export default hook;
