/**
 * Bot hook for the Re Mantide, plus the Little Garden offense shared by every Act IV hook.
 *
 * Garden scale (player at 0.1, weapon reach ~0.25 m): the generic bot keeps max(0.6, reach − 0.6) m from the boss
 * surface but only swings inside reach + 0.2, so it would never attack (request in docs/requests/act4.md).
 * gardenDecide runs the generic decision (defense, healing, Metamondo) and then replaces the approach/offense with a
 * reach-aware one: close in to 70% of the reach and swing in the same open windows the generic bot uses (the sloppy
 * profile stays greedy). The mantis's reappearance behind you, the petal fans and the petal falls are read by the generic
 * threat model (they are ordinary hit windows / projectiles / hazards once he is visible).
 */
import { dist2D, yawTo } from '../../../src/core/math';
import type { Sim } from '../../../src/sim/sim';
import { Btn, type PlayerInput } from '../../../src/sim/types';
import type { Bot } from '../bot';
import type { BotHook } from '../hooks';
import { act2Defense } from './cerbero';

let lcg = 98765;
function rand(): number {
  lcg = (lcg * 1103515245 + 12345) & 0x7fffffff;
  return lcg / 0x7fffffff;
}

/** The generic decision with the hook disabled (no recursion). */
export function genericDecide(sim: Sim, bot: Bot): PlayerInput {
  const self = bot.hook;
  bot.hook = null;
  try {
    return bot.decide(sim);
  } finally {
    bot.hook = self;
  }
}

/** Reach-aware approach and offense for the tiny player (see header). `r` is the generic decision of this tick. */
export function gardenOffense(sim: Sim, bot: Bot, r: PlayerInput): PlayerInput {
  const pl = sim.player;
  const boss = sim.boss;
  if (!boss || !boss.alive || sim.seq.running || pl.baseScale >= 0.5 || pl.state === 'dead') return r;
  if (r.presses & (Btn.Dodge | Btn.Jump | Btn.Drink)) return r;
  if (!pl.grounded) return r;
  const t = bot.pickTarget(sim, boss);
  const dist = dist2D(pl.pos, t.pos) - t.radius;
  const reach = pl.reach(sim);
  const perfect = bot.profile === 'perfect';
  const danger = bot.threats(sim, 0.5).some((x) => x.t < 0.5);
  const window = boss.hidden || boss.untargetable ? 0 : bot.openWindow(sim, boss, dist);
  const greedy = !perfect && rand() < 0.35;
  if (dist > reach * 0.7 && (window > 0 || !danger || greedy)) {
    const y = yawTo(pl.pos, t.pos);
    r.moveX = Math.sin(y);
    r.moveZ = Math.cos(y);
    r.sprint = dist > 4 && !danger;
  }
  if ((window > 0 || greedy) && dist <= reach + 0.05 && sim.time - bot.lastAttackPress > 0.12 && !boss.untargetable) {
    r.presses &= ~(Btn.Light | Btn.Heavy | Btn.ArtPrima | Btn.ArtSeconda);
    const ecoArt = pl.eco >= 200 && window > 1.1 ? Btn.ArtSeconda : pl.eco >= 100 && window > 0.9 ? Btn.ArtPrima : 0;
    if (ecoArt && !greedy) r.presses |= ecoArt;
    else if (window > 1.4 && pl.fiato > 45) r.presses |= Btn.Heavy;
    else if (pl.fiato > (perfect ? 30 : 5) || greedy) r.presses |= Btn.Light;
    bot.lastAttackPress = sim.time;
  }
  return r;
}

/** Shared Act IV decision: Act II defenses (rings to jump, moving hazards, marked ground), then garden offense. */
export function gardenDecide(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (sim.seq.running || !sim.boss) return null;
  const d = act2Defense(sim, bot, base);
  if (d) return d;
  return gardenOffense(sim, bot, genericDecide(sim, bot));
}

const hook: BotHook = {
  input(sim, bot, base) {
    return gardenDecide(sim, bot, base);
  },
};
export default hook;
