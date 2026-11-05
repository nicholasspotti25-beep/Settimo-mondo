/**
 * Bot hook for the Drago a Tre Teste (Act V mini boss).
 *
 * Defenses: the shared ground defenses (venom puddles and lightning marks left during their mark, the strike line
 * stepped out of) and the breath escape of the Drago di Ghiaccio hook (out of the fire cone, sideways or back). Offense (perfect profile only): it plays the key of the fight, bringing heads down one at a time —
 * a head lying in its Spezzato first (Colpo di Grazia), then the head that just struck (lowered at the center during its
 * recovery), then the poison head (its puddles clutter the nest), the fire head, the lightning head. The sloppy profile
 * swings at the body.
 */
import type { Sim } from '../../../src/sim/sim';
import type { BotHook } from '../hooks';
import { act2Defense } from '../defense';
import { breathEscape } from './drago_di_ghiaccio';

/** The fire cones (radius from the dragon's center, half-angle in degrees; the sweep covers its three beats). */
const BREATHS: Record<string, { r: number; half: number }> = {
  fire_breath: { r: 16.5, half: 20 },
  rage_fire_sweep: { r: 16.5, half: 62 },
};
import { HEADS, standingHeads } from '../../../src/content/bosses/drago_a_tre_teste/behavior';

const ORDER = ['testa_veleno', 'testa_fuoco', 'testa_fulmine'];

function headTarget(sim: Sim): { pos: { x: number; y: number; z: number }; radius: number } | null {
  const boss = sim.boss;
  if (!boss || !boss.alive) return null;
  const heads = boss.parts.filter((p) => HEADS.includes(p.id as (typeof HEADS)[number]) && p.active && !p.broken);
  const down = heads.find((p) => p.spezzato > 0);
  if (down) return { pos: down.center, radius: 0.8 };
  const standing = standingHeads(boss);
  const atk = boss.attack;
  if (atk && atk.def.part && atk.stage === 'recovery') {
    const p = standing.find((h) => h.id === atk.def.part);
    if (p) return { pos: p.center, radius: 0.8 };
  }
  for (const id of ORDER) {
    const p = standing.find((h) => h.id === id);
    if (p) return { pos: p.center, radius: 0.8 };
  }
  return null;
}

const hook: BotHook = {
  input(sim, bot, base) {
    return act2Defense(sim, bot, base) ?? breathEscape(sim, bot, base, BREATHS);
  },
  target(sim, bot) {
    return bot.profile === 'perfect' ? headTarget(sim) : null;
  },
};
export default hook;
