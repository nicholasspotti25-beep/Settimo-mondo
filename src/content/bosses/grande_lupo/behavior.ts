/**
 * Grande Lupo (17) — first of the Tre Spiriti della Taiga.
 *
 *  - The howl calls a snowstorm for STORM_DUR seconds (flag `snowstorm`, cues lupo_storm_start / lupo_storm_end; the cue
 *    `pos` of lupo_storm_start carries the wind direction as a unit vector). The wind drifts the player at WIND_SPEED m/s
 *    (always slower than walking: you can lean into it), frozen gusts sweep marked lines (storm_gust) and he rushes out of
 *    the snow (storm_lunge, eyes glint first: cue lupo_eyes). Never called in the first STORM_EARLIEST seconds (the night
 *    opener is the exception: the storm comes with the first howl).
 *  - Only from behind: tail_sweep (whoever slips behind him).
 *  - Phase 2 (flag `split`): he splits into a spirit (minion spirito_lupo) that fights alongside him. One blow at a time:
 *    he waits while the spirit strikes and the spirit waits while he does. pack_lunge sends the spirit's leap PACK_DELAY s
 *    after his own (never if the player is down). A dispersed spirit is howled back (spirit_call) RESPLIT_DELAY s later.
 *  - No stun-lock: once one window of a multi-hit blow (ng_triple_bite) lands, its later windows skip the player.
 *  - Dawn (flag `circling`): he circles and studies you for CIRCLE_TIME s before the first strike (guide and keeper).
 * Deterministic: sim.rng only (wind direction).
 */
import type { AttackDef, MinionDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export const STORM_DUR = 12;
export const STORM_EARLIEST = 14;
export const WIND_SPEED = 1.3;
export const PACK_DELAY = 0.9;
export const RESPLIT_DELAY = 18;
export const CIRCLE_TIME = 2.5;
/** tail_sweep only when the player is beyond this angle from his muzzle (radians). */
export const BEHIND = (115 * Math.PI) / 180;
export const SPIRIT_ID = 'spirito_lupo';

/** Player target id in hit windows. */
const PLAYER = -1;

/** No stun-lock: after one window of a multi-hit blow lands on the player, the later windows skip them. */
export function guardMultiHit(a: Actor): void {
  const atk = a.attack;
  if (!atk || atk.windows.length < 2) return;
  let landed = false;
  for (const w of atk.windows) {
    if (landed) w.hitTargets.add(PLAYER);
    else if (w.hitTargets.has(PLAYER)) landed = true;
  }
}

/** The living spirit of this wolf, if any. */
export function spiritOf(a: Actor, sim: Sim): Actor | undefined {
  return sim.actors.find((m) => m !== a && m.alive && m.ownerId === a.id && m.def.id === SPIRIT_ID);
}

function busy(x: Actor | undefined): boolean {
  return !!x?.attack && x.attack.stage !== 'recovery';
}

function stopStorm(a: Actor, sim: Sim): void {
  if (!a.flags.has('snowstorm')) return;
  a.bstate.storm = 0;
  a.flags.delete('snowstorm');
  sim.emit({ type: 'cue', id: 'lupo_storm_end', actor: a.id });
}

function split(a: Actor, sim: Sim): void {
  if (spiritOf(a, sim)) return;
  const md = (a.bossDef?.minions ?? []).find((m: MinionDef) => m.id === SPIRIT_ID);
  if (!md) return;
  // the spirit steps out of his left flank
  const side = a.yaw + Math.PI / 2;
  const pos = { x: a.pos.x + Math.sin(side) * 4.5, y: a.pos.y, z: a.pos.z + Math.cos(side) * 4.5 };
  const m = sim.spawnMinion(md, pos, a, -1);
  sim.clampActor(m);
  m.idleTimer = 1.6;
  a.bstate.spiritGone = 0;
  sim.emit({ type: 'cue', id: 'lupo_split', actor: a.id, pos: { ...m.pos } });
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.fightT = 0;
    a.bstate.storm = 0;
    a.bstate.windX = 0;
    a.bstate.windZ = 1;
    a.bstate.packT = 0;
    a.bstate.spiritGone = 0;
    a.bstate.circle = a.flags.has('circling') ? CIRCLE_TIME : 0;
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    const live = !!sim.fight?.active && !sim.fight.intro && !sim.seq.running;
    if (live) g.fightT += dt;
    // dawn: he circles before the first strike
    if (g.circle > 0) {
      if (live) g.circle = Math.max(0, g.circle - dt);
      if (a.state === 'idle' || a.state === 'move') a.idleTimer = Math.max(a.idleTimer, g.circle);
      if (g.circle <= 0) a.flags.delete('circling');
    }
    // the snowstorm: steady wind (slower than a walk) while it blows
    if (g.storm > 0) {
      g.storm = Math.max(0, g.storm - dt);
      const pl = sim.player;
      if (live && pl.state !== 'dead' && pl.state !== 'grace' && pl.state !== 'grabbed') sim.pushPlayer(g.windX * WIND_SPEED * dt, g.windZ * WIND_SPEED * dt);
      if (g.storm <= 0) stopStorm(a, sim);
    }
    guardMultiHit(a);
    // phase 2: the spirit
    if (a.phaseIndex >= 1 && a.alive) {
      const sp = spiritOf(a, sim);
      if (!sp) g.spiritGone += dt;
      if (g.packT > 0) {
        g.packT -= dt;
        if (g.packT <= 0 && sp && !sp.attack && sp.state !== 'dead') {
          const st = sim.player.state;
          const leap = (sp.def.attacks ?? []).find((d) => d.id === 'spirit_leap');
          if (leap && st !== 'knockdown' && st !== 'dead') {
            sp.setState('idle');
            sp.startAttack(sim, leap);
          }
        }
      }
    }
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.requires === 'storm') return a.bstate.storm > 0;
    if (def.requires === 'spirit') return !!spiritOf(a, sim);
    if (def.id === 'howl') return a.bstate.storm <= 0 && a.bstate.fightT >= STORM_EARLIEST;
    if (def.id === 'tail_sweep') return Math.abs(a.relativeAngle(sim.player.pos)) > BEHIND;
    if (def.id === 'spirit_call') return a.phaseIndex >= 1 && !spiritOf(a, sim) && a.bstate.spiritGone >= RESPLIT_DELAY;
    return true;
  },

  selectAttack(a: Actor, sim: Sim, cands: AttackDef[]) {
    // one blow at a time: he waits while his spirit strikes
    if (busy(spiritOf(a, sim))) return null;
    // whoever slips behind him meets the tail first
    const tail = cands.find((d) => d.id === 'tail_sweep');
    if (tail) return tail;
    return undefined;
  },

  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    // one blow at a time: no combo follow-up while the spirit is striking
    if (atk.def.combo_next && busy(spiritOf(a, sim))) {
      a.setState('idle');
      a.idleTimer = 0.4;
    }
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    if (atk.def.id === 'storm_lunge') sim.emit({ type: 'cue', id: 'lupo_eyes', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 4.9, z: a.pos.z } });
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    if (event === 'storm_start') {
      const y = sim.rng.range(0, Math.PI * 2);
      a.bstate.windX = Math.sin(y);
      a.bstate.windZ = Math.cos(y);
      a.bstate.storm = STORM_DUR;
      a.flags.add('snowstorm');
      sim.emit({ type: 'cue', id: 'lupo_storm_start', actor: a.id, pos: { x: a.bstate.windX, y: 0, z: a.bstate.windZ } });
      sim.emit({ type: 'vfx', id: 'lupo_snowstorm', pos: { ...a.pos } });
    } else if (event === 'pack') {
      a.bstate.packT = PACK_DELAY;
    } else if (event === 'split') {
      split(a, sim);
    }
  },

  onDamaged(a: Actor) {
    // struck while circling: he answers at once
    if (a.bstate.circle > 0) {
      a.bstate.circle = 0;
      a.flags.delete('circling');
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    split(a, sim);
  },

  onDeath(a: Actor, sim: Sim) {
    stopStorm(a, sim);
    const sp = spiritOf(a, sim);
    if (sp) sp.lifetime = 0.01; // the spirit fades back into the snow
  },
}));
