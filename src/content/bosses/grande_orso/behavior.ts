/**
 * Grande Orso (18) — second of the Tre Spiriti della Taiga, protector of the woods.
 *
 *  - The hug (data flag `grab` on `hug`): the player is held against his chest for HUG_TIME s (flag `hugging`, cues
 *    orso_hug_caught / orso_hug_release), crushed ONCE (the grab hit itself), then dropped in front of him, down with
 *    i-frames until they stand up. Never on a player who is already down or held.
 *  - Only from behind: rear_kick (and it comes first when you stand there).
 *  - Phase 2 (flag `standing`): he stands up and shakes the forest. Trees fall on the arena: forest_shake (or ng_timber in
 *    NG+) comes every TREE_INTERVAL s and never sooner than TREE_MIN s after the last one; each trunk's long shadow is
 *    marked 1.6 s before it lands (cue orso_forest_shake for the arena dressing).
 *  - No stun-lock: a landed standing swipe throws you out of the second (guardMultiHit).
 * Deterministic: no randomness of its own.
 */
import type { AttackDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import { guardMultiHit } from '../grande_lupo/behavior';

export const HUG_TIME = 1.1;
/** Held at this distance in front of his chest. */
export const HUG_REACH = 3.4;
export const TREE_INTERVAL = 15;
export const TREE_MIN = 8;
export const BEHIND = (115 * Math.PI) / 180;
const SHAKES = new Set(['forest_shake', 'ng_timber']);

function release(a: Actor, sim: Sim): void {
  const pl = sim.player;
  a.bstate.hugT = -1;
  a.flags.delete('hugging');
  if (pl.grabbedBy === a.id) pl.grabbedBy = -1;
  if (pl.state === 'grabbed') {
    pl.setState('knockdown', sim.bal.player.knockdown_time);
    pl.invuln = Math.max(pl.invuln, sim.bal.player.knockdown_time + 0.1);
  }
  sim.emit({ type: 'cue', id: 'orso_hug_release', actor: a.id, pos: { ...pl.pos } });
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.hugT = -1;
    a.bstate.sinceShake = 0;
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    const pl = sim.player;
    guardMultiHit(a);
    if (a.phaseIndex >= 1) g.sinceShake += dt;
    // the hug: held against the chest, then dropped
    if (pl.state === 'grabbed' && pl.grabbedBy === a.id) {
      if (g.hugT < 0) {
        g.hugT = 0;
        a.flags.add('hugging');
        sim.emit({ type: 'cue', id: 'orso_hug_caught', actor: a.id });
      }
      g.hugT += dt;
      pl.pos.x = a.pos.x + Math.sin(a.yaw) * HUG_REACH;
      pl.pos.z = a.pos.z + Math.cos(a.yaw) * HUG_REACH;
      pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) + 1.2;
      pl.vy = 0;
      pl.invuln = Math.max(pl.invuln, 0.15);
      if (g.hugT >= HUG_TIME) release(a, sim);
    } else if (g.hugT >= 0) {
      release(a, sim);
    }
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    const st = sim.player.state;
    if (def.id === 'hug') return st !== 'knockdown' && st !== 'grabbed';
    if (def.id === 'rear_kick') return Math.abs(a.relativeAngle(sim.player.pos)) > BEHIND;
    if (SHAKES.has(def.id)) return a.phaseIndex >= 1 && a.bstate.sinceShake >= TREE_MIN;
    return true;
  },

  selectAttack(a: Actor, _sim: Sim, cands: AttackDef[]) {
    const kick = cands.find((d) => d.id === 'rear_kick');
    if (kick) return kick;
    if (a.phaseIndex >= 1 && a.bstate.sinceShake >= TREE_INTERVAL) {
      const shakes = cands.filter((d) => SHAKES.has(d.id));
      if (shakes.length) return shakes[shakes.length - 1];
    }
    return undefined;
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    if (atk.def.id === 'head_charge' || atk.def.id === 'ng_double_charge') sim.emit({ type: 'cue', id: 'orso_head_down', actor: a.id });
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    if (event !== 'forest_shake') return;
    a.bstate.sinceShake = 0;
    sim.emit({ type: 'cue', id: 'orso_forest_shake', actor: a.id, pos: { ...a.pos } });
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    // the opener shakes the forest at once
    a.bstate.sinceShake = TREE_INTERVAL;
    sim.emit({ type: 'cue', id: 'orso_stand', actor: a.id });
  },

  onDeath(a: Actor, sim: Sim) {
    if (a.bstate.hugT >= 0) release(a, sim);
  },
}));
