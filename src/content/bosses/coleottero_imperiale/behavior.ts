/**
 * Coleottero Imperiale (24) — general of Uruk's court, second gate of Little Garden.
 *
 *  - Armored: blows that land from the front (head, pronotum, mandibles) deal FRONT_ARMOR of their damage and
 *    FRONT_POISE of their poise; flanks and back take full damage. Spezzato (head in the moss) drops the armor rule.
 *  - Mandibles that grab and crush (data flag `grab` on `mandible_grab`): the player is held between the mandibles for
 *    GRAB_TIME s (flag `gripping`, cues coleottero_grip / coleottero_release), crushed ONCE (the grab hit itself), then
 *    dropped in front of him, down with i-frames until they stand up. Never on a player who is already down or held.
 *  - carapace_slam only when the player is beside or behind him (beyond SIDE_ANGLE from his head).
 *  - Phase 2 (flag `wings_open`, cue coleottero_wings_open): take_off (flag `flying`) → bombing_run → dive_bomb (cue
 *    coleottero_dive_mark on the player, then `landed` clears the flag in a long punish window). Never stays aloft
 *    outside the flight chain.
 *  - Dawn (flag `chivalrous`): the opener is a salute (no blow), once.
 *  - No stun-lock: a landed charge ends the NG+ double charge (endComboIfLanded).
 * Deterministic: no randomness of its own.
 */
import type { AttackDef } from '../../../core/types';
import type { Actor, AttackRuntime, PartRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import type { DamageEvent } from '../../../sim/types';
import { endComboIfLanded } from '../re_mantide/behavior';

export const FRONT_ARMOR = 0.5;
export const FRONT_POISE = 0.5;
export const GRAB_TIME = 1.0;
/** Held this far in front of his head, lifted GRAB_LIFT m. */
export const GRAB_REACH = 1.9;
export const GRAB_LIFT = 0.5;
/** carapace_slam only beyond this angle from his head (radians). */
export const SIDE_ANGLE = (70 * Math.PI) / 180;
const FLIGHT = new Set(['take_off', 'bombing_run', 'dive_bomb', 'ng_take_off', 'ng_carpet_run']);

function release(a: Actor, sim: Sim): void {
  const pl = sim.player;
  a.bstate.gripT = -1;
  a.flags.delete('gripping');
  if (pl.grabbedBy === a.id) pl.grabbedBy = -1;
  if (pl.state === 'grabbed') {
    pl.setState('knockdown', sim.bal.player.knockdown_time);
    pl.invuln = Math.max(pl.invuln, sim.bal.player.knockdown_time + 0.1);
    pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z);
  }
  sim.emit({ type: 'cue', id: 'coleottero_release', actor: a.id, pos: { ...pl.pos } });
}

function land(a: Actor, sim: Sim): void {
  if (!a.flags.has('flying')) return;
  a.flags.delete('flying');
  sim.emit({ type: 'cue', id: 'coleottero_land', actor: a.id, pos: { ...a.pos } });
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.gripT = -1;
    a.bstate.saluted = 0;
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    const pl = sim.player;
    // never aloft outside the flight chain (cancelled attacks, phase changes, Spezzato)
    if (a.flags.has('flying') && (!a.attack || !FLIGHT.has(a.attack.def.id))) land(a, sim);
    // the mandibles: held, crushed once, dropped
    if (pl.state === 'grabbed' && pl.grabbedBy === a.id) {
      if (g.gripT < 0) {
        g.gripT = 0;
        a.flags.add('gripping');
        sim.emit({ type: 'cue', id: 'coleottero_grip', actor: a.id });
      }
      g.gripT += dt;
      pl.pos.x = a.pos.x + Math.sin(a.yaw) * GRAB_REACH;
      pl.pos.z = a.pos.z + Math.cos(a.yaw) * GRAB_REACH;
      pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) + GRAB_LIFT;
      pl.vy = 0;
      pl.invuln = Math.max(pl.invuln, 0.15);
      if (g.gripT >= GRAB_TIME) release(a, sim);
    } else if (g.gripT >= 0) {
      release(a, sim);
    }
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    const st = sim.player.state;
    if (def.id === 'mandible_grab') return st !== 'knockdown' && st !== 'grabbed';
    if (def.id === 'carapace_slam') return Math.abs(a.relativeAngle(sim.player.pos)) > SIDE_ANGLE;
    if (def.id === 'salute') return a.flags.has('chivalrous') && !a.bstate.saluted;
    if (def.id === 'bombing_run' || def.id === 'dive_bomb' || def.id === 'ng_carpet_run') return a.flags.has('flying');
    return true;
  },

  modifyIncoming(a: Actor, _sim: Sim, dmg: DamageEvent, _part: PartRuntime | null, fromFront: boolean) {
    if (!fromFront || a.state === 'spezzato') return;
    dmg.amount *= FRONT_ARMOR;
    dmg.poise *= FRONT_POISE;
  },

  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    endComboIfLanded(a, sim, atk);
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    switch (event) {
      case 'fly':
        a.flags.add('flying');
        sim.emit({ type: 'cue', id: 'coleottero_take_off', actor: a.id, pos: { ...a.pos } });
        break;
      case 'dive_mark':
        sim.emit({ type: 'cue', id: 'coleottero_dive_mark', actor: a.id, pos: { ...sim.player.pos } });
        break;
      case 'landed':
        land(a, sim);
        break;
      case 'salute':
        a.bstate.saluted = 1;
        sim.emit({ type: 'cue', id: 'coleottero_salute', actor: a.id });
        break;
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (a.bstate.gripT >= 0) release(a, sim);
    if (phase === 1) sim.emit({ type: 'cue', id: 'coleottero_wings_open', actor: a.id });
  },

  onDeath(a: Actor, sim: Sim) {
    if (a.bstate.gripT >= 0) release(a, sim);
    land(a, sim);
  },
}));
