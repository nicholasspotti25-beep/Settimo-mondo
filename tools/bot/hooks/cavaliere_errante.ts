/**
 * Bot hook for the Cavaliere Errante. The Act I defensive helpers (box hazards escaped across their short axis — Caronte's
 * lantern gaze along the bridge, the Great Devourer's tail across the pier —, through-charges read in the telegraph, low
 * rings held for and jumped, round ground hazards left during their telegraph) live in the integrator-owned
 * tools/bot/defense.ts (integration #3/#5); they are re-exported here so older imports keep working.
 * The perfect profile never holds guard (the knight dives at an open guard), so no extra rule is needed for that here.
 */
import { act1Defense } from '../defense';
import type { BotHook } from '../hooks';

export { boxHazardDodge, hazardEscape, ringJump, chargeDodge, act1Defense } from '../defense';

const hook: BotHook = {
  input(sim, bot, base) {
    return act1Defense(sim, bot, base);
  },
};
export default hook;
