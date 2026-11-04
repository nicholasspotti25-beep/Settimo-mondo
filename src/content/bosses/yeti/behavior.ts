/**
 * Yeti (14) — the white beast of the painted cave.
 *
 *  - Blizzard: the howl whips the cave into a snowstorm for BLIZZARD_DUR seconds (flag `blizzard`, cues
 *    yeti_blizzard_start / yeti_blizzard_end for the renderer's fog). Poor visibility: while the storm blows he cannot be
 *    locked on beyond BLIZZARD_SIGHT m. Out of the storm he rushes and claws (storm_rush, `requires: blizzard`); his blue
 *    eyes glint at the start of every rush (cue yeti_eyes): the telegraph stays readable even when he is hard to see.
 *    Never called in the first BLIZZARD_EARLIEST seconds (the night opener is the exception: the storm is already up).
 *  - The painting of the last dawn on the north wall: whoever goes within PAINTING_GUARD m of it is cut off by a leap that
 *    lands between them and the wall (painting_guard, chosen before anything else).
 *  - Phase 2, furious, he never stops: attacks chain with FURY_GAP s between them; every FURY_CHAIN attacks he pants for
 *    FURY_PANT s (flag `panting`): the punish window.
 *  - Dawn (flag `gazing`): the light falls on the painting and he looks at it for GAZE_TIME s before turning to you (unless
 *    you strike him first).
 * Deterministic: no randomness of its own.
 */
import { dist2D } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export const BLIZZARD_DUR = 10;
export const BLIZZARD_SIGHT = 9;
export const BLIZZARD_EARLIEST = 15;
/** The painting, relative to the arena center (north wall). */
export const PAINTING_LOCAL: readonly [number, number] = [0, 23];
export const PAINTING_GUARD = 9;
/** Guard leap lands this far from the player, toward the painting. */
export const GUARD_LAND = 4.5;
export const FURY_GAP = 0.15;
export const FURY_CHAIN = 3;
export const FURY_PANT = 1.6;
export const GAZE_TIME = 3;

/** World position of the painting of the last dawn. */
export function paintingPos(sim: Sim): { x: number; z: number } {
  const c = sim.zone?.activeArenaDef?.center ?? sim.c.arena('yeti_caverna').center;
  return { x: c[0] + PAINTING_LOCAL[0], z: c[2] + PAINTING_LOCAL[1] };
}

export function nearPainting(sim: Sim): boolean {
  const p = paintingPos(sim);
  return Math.hypot(sim.player.pos.x - p.x, sim.player.pos.z - p.z) < PAINTING_GUARD;
}

function stopBlizzard(a: Actor, sim: Sim): void {
  if (!a.flags.has('blizzard')) return;
  a.bstate.blizzard = 0;
  a.flags.delete('blizzard');
  a.untargetable = false;
  sim.emit({ type: 'cue', id: 'yeti_blizzard_end', actor: a.id });
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.fightT = 0;
    a.bstate.blizzard = 0;
    a.bstate.chain = 0;
    a.bstate.prevState = 'idle';
    a.bstate.guardFixed = true;
    a.bstate.gaze = a.flags.has('gazing') ? GAZE_TIME : 0;
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    const live = !!sim.fight?.active && !sim.fight.intro && !sim.seq.running;
    if (live) g.fightT += dt;
    // dawn: he looks at the painting first
    if (g.gaze > 0) {
      if (live) g.gaze = Math.max(0, g.gaze - dt);
      if (a.state === 'idle') a.idleTimer = Math.max(a.idleTimer, g.gaze);
      if (g.gaze <= 0) a.flags.delete('gazing');
    }
    // blizzard: poor visibility
    if (g.blizzard > 0) {
      g.blizzard = Math.max(0, g.blizzard - dt);
      a.untargetable = dist2D(a.pos, sim.player.pos) > BLIZZARD_SIGHT;
      if (g.blizzard <= 0) stopBlizzard(a, sim);
    }
    // the guard leap lands between the player and the painting
    const atk = a.attack;
    if (atk && atk.def.id === 'painting_guard' && !g.guardFixed) {
      const ms = atk.motionStart.get(0);
      if (ms) {
        const p = paintingPos(sim);
        const pl = sim.player.pos;
        const d = Math.hypot(p.x - pl.x, p.z - pl.z) || 1;
        const k = Math.min(GUARD_LAND, d * 0.7) / d;
        ms.to.x = pl.x + (p.x - pl.x) * k;
        ms.to.z = pl.z + (p.z - pl.z) * k;
        g.guardFixed = true;
      }
    }
    // phase 2: furious, he never stops (a short pant every few attacks)
    if (a.phaseIndex >= 1 && a.state === 'idle' && g.prevState === 'attack') {
      g.chain++;
      const pant = g.chain % FURY_CHAIN === 0;
      a.idleTimer = pant ? FURY_PANT : FURY_GAP;
      if (pant) {
        a.flags.add('panting');
        g.pantT = FURY_PANT;
        sim.emit({ type: 'cue', id: 'yeti_pant', actor: a.id });
      }
    }
    if (g.pantT > 0) {
      g.pantT = Math.max(0, g.pantT - dt);
      if (g.pantT <= 0) a.flags.delete('panting');
    }
    g.prevState = a.state;
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.requires === 'blizzard') return a.bstate.blizzard > 0;
    if (def.id === 'blizzard') return a.bstate.blizzard <= 0 && a.bstate.fightT >= BLIZZARD_EARLIEST;
    if (def.id === 'painting_guard') return nearPainting(sim);
    if (def.id === 'ground_slam') return dist2D(a.pos, sim.player.pos) < a.radius + 2.5;
    return true;
  },

  selectAttack(_a: Actor, sim: Sim, cands: AttackDef[]) {
    // the painting first: nothing else matters while you stand by it
    if (nearPainting(sim)) {
      const guard = cands.find((d) => d.id === 'painting_guard');
      if (guard) return guard;
    }
    return undefined;
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    if (atk.def.id === 'painting_guard') {
      a.bstate.guardFixed = false;
      sim.emit({ type: 'cue', id: 'yeti_guard', actor: a.id });
    } else if (atk.def.id === 'storm_rush') {
      sim.emit({ type: 'cue', id: 'yeti_eyes', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 4.9, z: a.pos.z } });
    }
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    if (event !== 'blizzard_start') return;
    a.bstate.blizzard = BLIZZARD_DUR;
    a.flags.add('blizzard');
    sim.emit({ type: 'cue', id: 'yeti_blizzard_start', actor: a.id });
    sim.emit({ type: 'vfx', id: 'yeti_blizzard', pos: { ...a.pos } });
  },

  onDamaged(a: Actor) {
    // struck while gazing at the painting: he turns at once
    if (a.bstate.gaze > 0) {
      a.bstate.gaze = 0;
      a.flags.delete('gazing');
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    a.bstate.chain = 0;
    sim.emit({ type: 'cue', id: 'yeti_furious', actor: a.id });
  },

  onDeath(a: Actor, sim: Sim) {
    stopBlizzard(a, sim);
  },
}));
