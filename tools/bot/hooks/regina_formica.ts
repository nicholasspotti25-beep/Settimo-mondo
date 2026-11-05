/**
 * Bot hook for the Regina Formica.
 *  - The waves of workers are meant to be JUMPED: the perfect profile jumps a marching line when it is about to pass under
 *    its feet (contact predicted along the line's velocity); the sloppy profile jumps late or not at all and falls back
 *    on the generic roll.
 *  - Acid puddles, the eggs' pulse and the holes of phase 2: the shared Act II defenses (marked ground).
 *  - Garden offense (shared, tools/bot/hooks/re_mantide.ts): she keeps away, so the bot chases her down.
 */
import type { Sim } from '../../../src/sim/sim';
import { shapeHits, type TargetVol } from '../../../src/sim/shapes';
import { Btn } from '../../../src/sim/types';
import type { BotHook } from '../hooks';
import { gardenDecide } from './re_mantide';

const vol: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };
const probe = { x: 0, y: 0, z: 0 };
let lcg = 4242;
function rand(): number {
  lcg = (lcg * 1103515245 + 12345) & 0x7fffffff;
  return lcg / 0x7fffffff;
}

/** Seconds until a marching worker line reaches the player (within `horizon`), or -1. */
export function workerContact(sim: Sim, horizon: number): number {
  const pv = sim.player.volume(vol, sim);
  pv.r += 0.05;
  let best = -1;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || h.kind !== 'regina_workers' || h.hitOnce.has(-1)) return;
    for (let t = 0; t <= horizon; t += 1 / 60) {
      if (h.age + t < h.delay) continue;
      probe.x = h.pos.x + h.vel.x * t;
      probe.y = h.pos.y;
      probe.z = h.pos.z + h.vel.z * t;
      if (shapeHits(h.shape, probe, h.yaw, 1, 0, pv)) {
        if (best < 0 || t < best) best = t;
        break;
      }
    }
  });
  return best;
}

const hook: BotHook = {
  input(sim, bot, base) {
    if (!sim.boss || sim.seq.running) return null;
    const pl = sim.player;
    const t = workerContact(sim, 0.5);
    if (t >= 0) {
      if (!pl.grounded) return base; // over the line: nothing else this tick
      const free = pl.state === 'idle' || pl.state === 'move';
      const perfect = bot.profile === 'perfect';
      const lo = perfect ? 0.08 : 0.0, hi = perfect ? 0.2 : 0.06;
      if (free && t >= lo && t <= hi && (perfect || rand() < 0.5)) {
        base.presses |= Btn.Jump;
        return base;
      }
      if (perfect && t < 0.5) return base; // keep the jump free
    }
    const r = gardenDecide(sim, bot, base);
    // a line is on its way: the perfect profile starts no swing it could not jump out of
    if (r && bot.profile === 'perfect' && !(r.presses & Btn.Dodge) && workerContact(sim, 1.2) >= 0) r.presses &= ~(Btn.Light | Btn.Heavy | Btn.ArtPrima | Btn.ArtSeconda);
    return r;
  },
};
export default hook;
