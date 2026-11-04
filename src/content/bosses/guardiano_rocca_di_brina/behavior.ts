/**
 * Guardiano della Rocca di Brina (15) — the empty ice armor at the gate of the Rocca.
 *
 *  - Tower shield (phase 1, flag `shield_up`): blows from the front (the engine's fromFront, 70 degrees) pass the shield at
 *    SHIELD_FRONT_MULT of their damage. Heavy blows (heavy, running, jumping, Arts) still push his Equilibrio in full;
 *    light ones only at SHIELD_LIGHT_POISE. His back is armor too (BACK_MULT), and the back sweep answers whoever camps
 *    there. Breaking Equilibrio opens the gap: while Spezzato the shield is down (full damage, Colpo di Grazia).
 *  - Light spam: SPAM_HITS light blows on the shield within SPAM_WINDOW s and he answers at once (as soon as he is not in
 *    the middle of a blow) with shield_punish, a faster bash announced by the cue guardiano_spam_punish.
 *  - Phase 2: the shield shatters into blades that orbit him (flag blades_orbit; bstate.bladeAngle advances BLADE_SPIN
 *    rad/s for the renderer); no more block.
 *  - Falling he says "Finalmente" (defeat sequence) and crumbles (cue guardiano_crumble).
 * Deterministic: no randomness of its own.
 */
import { yawTo } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor, PartRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import type { DamageEvent } from '../../../sim/types';

export const SHIELD_FRONT_MULT = 0.12;
export const SHIELD_LIGHT_POISE = 0.35;
export const BACK_MULT = 0.55;
export const SPAM_HITS = 3;
export const SPAM_WINDOW = 2.5;
export const BLADE_SPIN = 2.2;
export const BLADES = 4;

const HEAVY_KINDS = new Set(['heavy', 'running', 'jumping', 'art', 'grace', 'transizione', 'counter']);
const FRONT = new Set(['sword_thrust', 'sword_cut', 'overhead_cleave', 'shield_bash', 'frost_slam']);

/** Is the tower shield raised (phase 1, not Spezzato)? */
export function shieldUp(a: Actor): boolean {
  return a.phaseIndex === 0 && a.state !== 'spezzato' && !a.flags.has('shield_broken') && a.alive;
}

function relYaw(a: Actor, sim: Sim): number {
  const d = yawTo(a.pos, sim.player.pos) - a.yaw;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.spam = [] as number[];
    a.bstate.punish = false;
    a.bstate.punishes = 0;
    a.bstate.blocked = 0;
    a.bstate.bladeAngle = 0;
    a.flags.add('shield_up');
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    if (shieldUp(a)) a.flags.add('shield_up');
    else a.flags.delete('shield_up');
    const spam = g.spam as number[];
    while (spam.length && sim.time - spam[0] > SPAM_WINDOW) spam.shift();
    // the answer to light spam: as soon as he is not in the middle of a blow
    if (g.punish) {
      const busy = a.state === 'spezzato' || a.state === 'stagger' || a.state === 'transition' || a.state === 'dead' || a.state === 'intro';
      const free = a.state === 'idle' || a.state === 'move' || (a.state === 'attack' && !!a.attack && a.attack.stage !== 'active');
      if (busy || !shieldUp(a)) g.punish = false;
      else if (free) {
        g.punish = false;
        g.punishes++;
        a.cancelAttack(sim);
        a.setState('idle');
        a.yaw = yawTo(a.pos, sim.player.pos);
        a.startAttack(sim, a.attackMap.get('shield_punish')!);
        sim.emit({ type: 'cue', id: 'guardiano_spam_punish', actor: a.id });
      }
    }
    if (a.flags.has('blades_orbit')) g.bladeAngle = ((g.bladeAngle as number) + BLADE_SPIN * dt) % (Math.PI * 2);
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.id === 'shield_punish') return false;
    const rel = relYaw(a, sim);
    if (def.id === 'back_sweep') return rel > 1.9;
    if (FRONT.has(def.id)) return rel < 1.4;
    return true;
  },

  modifyIncoming(a: Actor, sim: Sim, dmg: DamageEvent, _part: PartRuntime | null, fromFront: boolean) {
    if (!shieldUp(a)) return;
    if (!fromFront) {
      dmg.amount *= BACK_MULT;
      return;
    }
    const heavy = HEAVY_KINDS.has(dmg.kind ?? 'light');
    dmg.amount *= SHIELD_FRONT_MULT;
    if (!heavy) dmg.poise *= SHIELD_LIGHT_POISE;
    a.bstate.blocked++;
    sim.emit({ type: 'cue', id: 'guardiano_block', pos: { ...dmg.pos }, actor: a.id });
    if (!heavy) {
      const spam = a.bstate.spam as number[];
      spam.push(sim.time);
      if (spam.length >= SPAM_HITS) {
        spam.length = 0;
        a.bstate.punish = true;
      }
    }
  },

  onSpezzato(a: Actor, sim: Sim, part: PartRuntime | null) {
    if (part || a.phaseIndex > 0) return;
    // the gap: the shield drops while he is Spezzato
    sim.emit({ type: 'cue', id: 'guardiano_shield_down', actor: a.id });
    a.bstate.punish = false;
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    a.flags.delete('shield_up');
    a.bstate.punish = false;
    sim.emit({ type: 'vfx', id: 'guardiano_shield_shatter', pos: { x: a.pos.x, y: a.pos.y + 3, z: a.pos.z } });
    sim.emit({ type: 'cue', id: 'guardiano_shield_shatter', actor: a.id });
    sim.emit({ type: 'shake', strength: 0.55, dur: 1.0 });
  },

  onDeath(a: Actor, sim: Sim) {
    a.flags.delete('blades_orbit');
    sim.emit({ type: 'cue', id: 'guardiano_crumble', actor: a.id, pos: { ...a.pos } });
  },
}));
