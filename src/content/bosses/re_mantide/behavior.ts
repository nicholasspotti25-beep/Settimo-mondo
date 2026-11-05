/**
 * Re Mantide (23) — chief of the garden's guards, first gate of Little Garden.
 *
 *  - Camouflage: `camouflage` folds him into the clover leaves (hidden + untargetable, cue mantide_vanish). At
 *    `camo_mark` the spot where he will rise is chosen BEHIND the player (relative to the way they face, kept inside the
 *    arena) and announced by the leaves rustling and glinting there (cue mantide_rustle, pos = the spot) REVEAL_LEAD s
 *    before he appears; `ambush_cross` then starts at the spot (visible, 0.7 s wind-up) and cuts an X.
 *  - Tight combos (combo_a → combo_b → combo_c) and every chained follow-up: a landed blow ends the chain (the player is
 *    never locked into the next cut). Crossed slashes skip the player once one window lands (guardMultiHit, act3b).
 *  - The naturalist (`study`, flag `studying`): he circles and watches you; at dawn (flag `curious`) he opens with it.
 *  - Phase 2 (flag `crown_bloom`, cue mantide_crown_bloom): petal fans re-aimed low at the tiny player (aimLow), marked
 *    petal falls.
 * Shared Act IV helpers (imported by the other Act IV behaviors): endComboIfLanded, aimLow, act4Reveal.
 * Deterministic: sim.rng only.
 */
import { forward } from '../../../core/math';
import { insideArena } from '../../../core/terrain';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import { guardMultiHit } from '../grande_lupo/behavior';

/** Seconds between the rustle cue and the moment he rises out of the leaves (camouflage active 1.5 − mark 0.55 + recovery). */
export const REVEAL_LEAD = 1.0;
/** Distance behind the player where he rises (m, garden scale). */
export const AMBUSH_DIST = 1.5;
/** Attacks whose X / multi-window cuts skip the player once one window lands. */
const MULTI = new Set(['cross_slash', 'ambush_cross', 'ng_green_ambush']);

const PLAYER = -1;
const tmp = { x: 0, y: 0, z: 0 };

/**
 * No stun-lock in chains: when a blow of a chained attack (combo_next) landed and left the player staggered or down,
 * the chain ends here and the boss idles. Call from onAttackEnd; returns true when it ended the chain.
 */
export function endComboIfLanded(a: Actor, sim: Sim, atk: AttackRuntime): boolean {
  if (!atk.def.combo_next) return false;
  if (!atk.windows.some((w) => w.hitTargets.has(PLAYER))) return false;
  const st = sim.player.state;
  if (st !== 'stagger' && st !== 'knockdown') return false;
  a.setState('idle');
  const [g0, g1] = a.def.idle_gap;
  a.idleTimer = sim.rng.range(g0, g1);
  return true;
}

/**
 * Re-aim the projectiles of `kind` this actor fired this tick at the tiny player's chest (`lift` m above the feet),
 * keeping their horizontal direction and speed (the default aim is ~1 m above the target: above a 0.18 m player).
 */
export function aimLow(sim: Sim, a: Actor, kind: string, lift = 0.09): void {
  const pl = sim.player.pos;
  sim.projectiles.forEachActive((p) => {
    if (p.owner !== a.id || p.kind !== kind || p.age > 1e-6 || p.team !== 'enemy') return;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (hs < 1e-3) return;
    const dh = Math.max(0.5, Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z));
    p.vel.y = ((pl.y + lift - p.pos.y) * hs) / dh;
  });
}

/** Unhide after a vanish (safety for cancelled attacks, phase changes, the end of a reveal). */
export function act4Reveal(a: Actor, sim: Sim, cue: string): void {
  if (!a.hidden && !a.untargetable) return;
  a.hidden = false;
  a.untargetable = false;
  sim.emit({ type: 'cue', id: cue, actor: a.id, pos: { ...a.pos } });
}

/** The spot behind the player (relative to their facing), inside the arena; tries the flanks when the rim is close. */
export function spotBehind(sim: Sim, dist: number, out: { x: number; z: number }): void {
  const pl = sim.player;
  const ar = sim.zone?.activeArena;
  const tries = [Math.PI, Math.PI * 0.75, -Math.PI * 0.75, Math.PI * 0.5, -Math.PI * 0.5, 0];
  for (const off of tries) {
    forward(pl.yaw + off, tmp);
    const x = pl.pos.x + tmp.x * dist, z = pl.pos.z + tmp.z * dist;
    if (!ar || insideArena(ar, x, z, 1.0)) {
      out.x = x;
      out.z = z;
      return;
    }
  }
  out.x = pl.pos.x;
  out.z = pl.pos.z;
}

interface MantideState {
  markX: number;
  markZ: number;
  hasMark: number;
}

function st(a: Actor): MantideState {
  return a.bstate as unknown as MantideState;
}

const mark = { x: 0, z: 0 };

export default defineBehavior(() => ({
  init(a: Actor) {
    const s = st(a);
    s.markX = 0;
    s.markZ = 0;
    s.hasMark = 0;
  },

  update(a: Actor, sim: Sim) {
    const atk = a.attack;
    // never stay hidden outside the camouflage (cancelled attacks, phase changes, Metamondo)
    if (a.hidden && (!atk || atk.def.id !== 'camouflage')) act4Reveal(a, sim, 'mantide_reveal');
    if (atk && MULTI.has(atk.def.id)) guardMultiHit(a);
    if (a.flags.has('studying') && (!atk || atk.def.id !== 'study')) a.flags.delete('studying');
  },

  canUseAttack(a: Actor, _sim: Sim, def) {
    if (def.id === 'ambush_cross') return a.hidden;
    return true;
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    if (atk.def.id !== 'ambush_cross') return;
    const s = st(a);
    if (s.hasMark) {
      a.pos.x = s.markX;
      a.pos.z = s.markZ;
      sim.clampActor(a);
      a.pos.y = sim.groundAt(a.pos.x, a.pos.z);
      a.yaw = Math.atan2(sim.player.pos.x - a.pos.x, sim.player.pos.z - a.pos.z);
      atk.startYaw = a.yaw;
    }
    s.hasMark = 0;
    act4Reveal(a, sim, 'mantide_reveal');
  },

  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    if (atk.def.id === 'study') a.flags.delete('studying');
    endComboIfLanded(a, sim, atk);
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    const s = st(a);
    switch (event) {
      case 'camo_hide':
        a.hidden = true;
        a.untargetable = true;
        s.hasMark = 0;
        sim.emit({ type: 'cue', id: 'mantide_vanish', actor: a.id, pos: { ...a.pos } });
        break;
      case 'camo_mark':
        spotBehind(sim, AMBUSH_DIST, mark);
        s.markX = mark.x;
        s.markZ = mark.z;
        s.hasMark = 1;
        sim.emit({ type: 'cue', id: 'mantide_rustle', actor: a.id, pos: { x: mark.x, y: sim.groundAt(mark.x, mark.z), z: mark.z } });
        break;
      case 'study':
        a.flags.add('studying');
        sim.emit({ type: 'cue', id: 'mantide_study', actor: a.id });
        break;
      case 'aim_petals':
        aimLow(sim, a, 'mantide_petal');
        break;
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    act4Reveal(a, sim, 'mantide_reveal');
    if (phase === 1) sim.emit({ type: 'cue', id: 'mantide_crown_bloom', actor: a.id });
  },

  onDeath(a: Actor, sim: Sim) {
    act4Reveal(a, sim, 'mantide_reveal');
  },
}));
