/**
 * Bot hook for Lucifero II. Defenses: the shared ground defenses (sky blades, feathers, ember rings, dive marks, red-hot glass
 * stepped out of). La Caduta (caduta_finale) covers the whole nave and cannot be dodged: in its last second the perfect
 * profile stops, turns to face him and taps Guard at the instant the light breaks (any weapon may parry the parry_final
 * blow); the sloppy profile keeps fighting and eats it.
 */
import type { Sim } from '../../../src/sim/sim';
import { Btn, type PlayerInput } from '../../../src/sim/types';
import { CADUTA_ID, GLASS_KIND } from '../../../src/content/bosses/lucifero_2/behavior';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';

/** Seconds before the strike when the perfect profile taps Guard. */
export const PARRY_LEAD = 0.05;

export function cadutaParry(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const b = sim.boss;
  const atk = b?.attack;
  if (!b || !atk || atk.def.id !== CADUTA_ID || atk.stage !== 'telegraph' || bot.profile !== 'perfect') return null;
  const left = (atk.def.telegraph - atk.time) / atk.rate;
  if (left > 1.1) return null;
  const pl = sim.player;
  const yaw = Math.atan2(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z);
  const inp: PlayerInput = { ...base, sprint: false, guardHeld: false, presses: 0 };
  // a short step toward him turns the body to face him; still for the tap
  const step = left > 0.3 ? 0.35 : 0;
  inp.moveX = Math.sin(yaw) * step;
  inp.moveZ = Math.cos(yaw) * step;
  if (left <= PARRY_LEAD + sim.dt && pl.state !== 'parry') inp.presses = Btn.Guard;
  return inp;
}

/** Step off the red-hot glass (every profile; it burns while you stand on it). */
export function glassEscape(sim: Sim, _bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  if (pl.state !== 'idle' && pl.state !== 'move' && pl.state !== 'guard' && pl.state !== 'running') return null;
  let ex = 0, ez = 0, found = false;
  sim.hazards.forEachActive((h) => {
    if (h.kind !== GLASS_KIND || h.shape.type !== 'cylinder') return;
    const dx = pl.pos.x - h.pos.x, dz = pl.pos.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < h.shape.r + 0.8) { found = true; ex += dx / (d || 1); ez += dz / (d || 1); }
  });
  if (!found) return null;
  const l = Math.hypot(ex, ez) || 1;
  base.moveX = ex / l;
  base.moveZ = ez / l;
  return base;
}

const hook: BotHook = {
  input(sim, bot, base) {
    return cadutaParry(sim, bot, base) ?? act2Defense(sim, bot, base) ?? glassEscape(sim, bot, base);
  },
};
export default hook;
