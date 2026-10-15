/**
 * Lucifero, l'Arcangelo Caduto — first encounter (12). Scripted: cannot be won.
 *
 *  - He sits on the throne of swords at the far end of the overturned nave and never leaves it during the duel (move 0);
 *    he is invulnerable and cannot die. Every attack is readable and avoidable.
 *  - The Metamondo is shattered "with one finger" (reaction 'shatter').
 *  - After LUCIFERO_RIFIUTO_TIME seconds of real fight he rises for the first time: Il Rifiuto, an unavoidable blow that
 *    ends the fight as a narrative defeat (never a death: the player is left on the floor with a sliver of Health) and starts
 *    the `lucifero_rifiuto` sequence (Cicatrice del Rifiuto, lucifero_choice fought, wake by the Scala dei Dannati).
 *  - The Implora branch lives entirely in the intro sequence (hold 5 s, Piuma Nera).
 * Deterministic: no randomness here.
 */
import { DEG, angleDiff, yawTo } from '../../../core/math';
import type { AttackDef, SpawnDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior, type MetamondoReaction } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Seconds of real duel before Il Rifiuto (the card: "after about two minutes"). */
export const LUCIFERO_RIFIUTO_TIME = 118;
/** Distance of the throne from the far end of the nave (m). */
const THRONE_BACK = 8;

/** Place him on the throne at the far end of the nave, facing the gate. */
export function seatOnThrone(a: Actor, sim: Sim): void {
  const arena = sim.c.arena(a.boss.arena);
  const cx = arena.center[0], cz = arena.center[2];
  const gx = arena.gate.pos[0], gz = arena.gate.pos[2];
  const dl = Math.hypot(cx - gx, cz - gz) || 1;
  const dx = (cx - gx) / dl, dz = (cz - gz) / dl;
  const half = arena.shape === 'rect' ? (arena.half ?? [20, 40])[1] : arena.radius ?? 20;
  const reach = Math.max(4, half - THRONE_BACK);
  a.pos.x = cx + dx * reach;
  a.pos.z = cz + dz * reach;
  a.pos.y = sim.groundAt(a.pos.x, a.pos.z);
  a.prevPos.x = a.pos.x; a.prevPos.y = a.pos.y; a.prevPos.z = a.pos.z;
  a.yaw = Math.atan2(-dx, -dz);
  a.prevYaw = a.yaw;
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    a.invulnerable = true;
    a.bstate.t = 0;
    a.bstate.rifiuto = false;
    a.bstate.ended = false;
    a.bstate.shattered = 0;
    a.flags.add('seated');
    seatOnThrone(a, sim);
  },

  update(a: Actor, sim: Sim, dt: number) {
    a.invulnerable = true;
    if (a.bstate.ended) {
      if (a.state !== 'attack' && a.state !== 'scripted') a.setState('scripted');
      if (a.state === 'scripted') {
        a.anim = 'rifiuto_stand';
        a.animStage = 'scripted';
        a.animTime += dt;
        return true;
      }
      return false;
    }
    const f = sim.fight;
    if (f?.active && !f.intro && !sim.seq.running && sim.player.state !== 'dead' && a.state !== 'intro') a.bstate.t += dt;
    if (!a.bstate.rifiuto && a.bstate.t >= LUCIFERO_RIFIUTO_TIME) {
      const busy = a.state === 'attack' && a.attack && a.attack.stage !== 'recovery';
      if (!busy || a.bstate.t >= LUCIFERO_RIFIUTO_TIME + 4) {
        const def = a.attackMap.get('il_rifiuto');
        if (def) {
          a.bstate.rifiuto = true;
          a.flags.delete('seated');
          a.flags.add('standing');
          if (a.attack) a.cancelAttack(sim);
          a.setState('idle');
          sim.emit({ type: 'cue', id: 'lucifero_rises', actor: a.id, pos: { ...a.pos } });
          a.startAttack(sim, def);
        }
      }
    }
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.id === 'il_rifiuto') return false;
    if (a.bstate.rifiuto) return false;
    const rel = angleDiff(a.yaw, yawTo(a.pos, sim.player.pos));
    // +rel = his left (+X): each wing only sweeps its own side of the nave
    if (def.id === 'wing_sweep_l') return rel > -25 * DEG;
    if (def.id === 'wing_sweep_r') return rel < 25 * DEG;
    return true;
  },

  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, _atk: AttackRuntime | null) {
    if (event !== 'rifiuto' || a.bstate.ended) return;
    a.bstate.ended = true;
    const pl = sim.player;
    if (sim.meta.active) sim.meta.end(sim, 0);
    if (pl.state !== 'dead') {
      // a narrative defeat, never a death: he leaves you on the floor with a sliver of Health
      pl.hp = Math.max(1, Math.min(pl.hp, Math.round(pl.hpMax * 0.05)));
      pl.cancelSwing();
      pl.art = null;
      pl.setState('knockdown', 3.5);
    }
    sim.emit({ type: 'vfx', id: 'lucifero_rifiuto_wave', pos: { x: a.pos.x, y: a.pos.y + 5, z: a.pos.z } });
    sim.emit({ type: 'shake', strength: 1.0, dur: 1.4 });
    sim.emit({ type: 'hitstop', dur: 0.3 });
    sim.emit({ type: 'cue', id: 'lucifero_rifiuto', actor: a.id });
    if (sim.c.hasSequence('lucifero_rifiuto')) sim.seq.start(sim, sim.c.sequence('lucifero_rifiuto'));
  },

  onAttackEnd(a: Actor) {
    if (a.bstate.ended) a.flags.add('standing');
  },

  canDie() {
    return false;
  },

  onMetamondoStart(a: Actor, sim: Sim): MetamondoReaction {
    // one finger
    a.bstate.shattered = (a.bstate.shattered ?? 0) + 1;
    sim.emit({ type: 'cue', id: 'lucifero_finger', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 5.5, z: a.pos.z } });
    if (a.bstate.shattered === 1) sim.emit({ type: 'dialogue', key: 'boss.lucifero_1.shatter', speaker: 'lucifero' });
    return 'shatter';
  },
}));
