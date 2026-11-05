/**
 * Lucifero, l'Arcangelo Caduto — second encounter (33). Principal, D18.
 *
 *  - He waits standing in the nave (flag `standing`; the Act II model reads seated/standing), wings fully open.
 *  - p2 (flag `embers`): the Cathedral turns to embers. The floor of the side aisles becomes red-hot glass in staggered
 *    patches; the central lane stays clear stone and he holds it (|x| ≤ LANE_HALF) (permanent burn zones, `lucifero2_glass`); blades of the sky fall (data: sky_blades).
 *  - p3, la Caduta (flag `wings_of_fire`): dives and the final blow `caduta_finale` — the same unavoidable attack as the first
 *    encounter, now parryable with perfect timing by any weapon (flags unavoidable + red + parry_final). A flash cue
 *    (`lucifero_caduta_flash`) marks the parry instant CADUTA_FLASH_LEAD s before the light breaks. A perfect parry breaks his
 *    Equilibrio at once (Spezzato: the Colpo di Grazia is open); unparried, it knocks you down and hurts (never a kill from
 *    full Health: damage_mult 1.9 of a typical hit). Never started while you are on the floor, never twice within
 *    CADUTA_MIN_GAP s.
 * Deterministic: no randomness here.
 */
import type { AttackDef, PhaseDef, SpawnDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export const CADUTA_ID = 'caduta_finale';
/** Seconds before the strike when the parry flash is sent (the read; the parry window itself is the balance parry_window). */
export const CADUTA_FLASH_LEAD = 0.45;
/** Minimum seconds between two Cadute. */
export const CADUTA_MIN_GAP = 18;
export const GLASS_KIND = 'lucifero2_glass';
/**
 * Red-hot glass patches in nave-local coordinates [x across, z along the nave from the arena center toward the throne, r]:
 * staggered along both side aisles, so the central lane of the duel (|x| < 11) stays clear stone.
 */
export const GLASS_PATCHES: readonly [number, number, number][] = [
  [-14.5, -30, 3.3], [-14.5, -12, 3.3], [-14.5, 6, 3.3], [-14.5, 24, 3.3],
  [14.5, -21, 3.3], [14.5, -3, 3.3], [14.5, 15, 3.3], [14.5, 33, 3.3],
];
const GLASS_DPS = 0.06;
/** Once the glass is laid he holds the central lane of the nave (|x| ≤ LANE_HALF, nave-local). */
export const LANE_HALF = 8.5;

/** Nave axis (unit vector from the gate toward the throne) and center of the arena. */
export function naveFrame(sim: Sim, arenaId: string): { cx: number; cz: number; dx: number; dz: number; floor: number } {
  const arena = sim.c.arena(arenaId);
  const cx = arena.center[0], cz = arena.center[2];
  const gx = arena.gate.pos[0], gz = arena.gate.pos[2];
  const dl = Math.hypot(cx - gx, cz - gz) || 1;
  return { cx, cz, dx: (cx - gx) / dl, dz: (cz - gz) / dl, floor: arena.floor_y };
}

/** World position of a nave-local point (x across, z along). */
export function naveToWorld(f: { cx: number; cz: number; dx: number; dz: number }, x: number, z: number): { x: number; z: number } {
  // across = the nave axis turned 90 degrees
  return { x: f.cx + f.dx * z + f.dz * x, z: f.cz + f.dz * z - f.dx * x };
}

function layGlass(a: Actor, sim: Sim): void {
  if (a.bstate.glass) return;
  a.bstate.glass = true;
  const f = naveFrame(sim, a.boss.arena);
  for (const [x, z, r] of GLASS_PATCHES) {
    const p = naveToWorld(f, x, z);
    const hz = sim.addStaticHazard(GLASS_KIND, { type: 'cylinder', c: [0, 0, 0], r, h: 0.8 }, GLASS_DPS, 'burn');
    hz.pos.x = p.x; hz.pos.y = f.floor; hz.pos.z = p.z;
    hz.tag = 'lucifero2_glass';
  }
  sim.emit({ type: 'cue', id: 'lucifero_embers', actor: a.id, pos: { ...a.pos } });
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.flags.add('standing');
    a.flags.add('wings_open');
    a.bstate.glass = false;
    a.bstate.lastCaduta = -999;
    a.bstate.flashSent = false;
    a.bstate.endedId = '';
    a.bstate.endedAt = -1;
    a.bstate.parries = 0;
  },

  update(a: Actor, sim: Sim) {
    if (a.bstate.glass && !a.airborne) {
      // he fights on the clear stone of the central lane
      const f = naveFrame(sim, a.boss.arena);
      const rx = a.pos.x - f.cx, rz = a.pos.z - f.cz;
      const across = rx * f.dz - rz * f.dx;
      if (Math.abs(across) > LANE_HALF) {
        const along = rx * f.dx + rz * f.dz;
        const p = naveToWorld(f, Math.sign(across) * LANE_HALF, along);
        a.pos.x = p.x; a.pos.z = p.z;
      }
    }
    const atk = a.attack;
    if (atk && atk.def.id === CADUTA_ID && atk.stage === 'telegraph' && !a.bstate.flashSent) {
      const left = (atk.def.telegraph - atk.time) / atk.rate;
      if (left <= CADUTA_FLASH_LEAD) {
        a.bstate.flashSent = true;
        sim.emit({ type: 'cue', id: 'lucifero_caduta_flash', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 7, z: a.pos.z } });
        sim.emit({ type: 'haptic', pattern: 'redWarning' });
      }
    }
    return false;
  },

  onPhaseEnter(a: Actor, sim: Sim, _i: number, ph: PhaseDef) {
    if (ph.id === 'p2' || ph.id === 'p3') layGlass(a, sim);
    if (ph.id === 'p3') sim.emit({ type: 'cue', id: 'lucifero_wings_of_fire', actor: a.id, pos: { ...a.pos } });
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.id === CADUTA_ID) {
      const pl = sim.player;
      if (pl.state === 'knockdown' || pl.state === 'dead') return false;
      return sim.time - (a.bstate.lastCaduta as number) >= CADUTA_MIN_GAP;
    }
    return true;
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    if (atk.def.id === CADUTA_ID) {
      a.bstate.lastCaduta = sim.time;
      a.bstate.flashSent = false;
      sim.emit({ type: 'cue', id: 'lucifero_caduta', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 6, z: a.pos.z } });
    }
  },

  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    a.bstate.endedId = atk.def.id;
    a.bstate.endedAt = sim.time;
  },

  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, _atk: AttackRuntime | null) {
    if (event !== 'caduta_strike') return;
    sim.emit({ type: 'vfx', id: 'lucifero_caduta_wave', pos: { x: a.pos.x, y: a.pos.y + 5, z: a.pos.z } });
    sim.emit({ type: 'shake', strength: 0.9, dur: 1.0 });
  },

  onParried(a: Actor, sim: Sim) {
    // the parry cancelled the attack first (onAttackEnd ran in this same instant)
    if (a.bstate.endedId !== CADUTA_ID || a.bstate.endedAt !== sim.time) return;
    a.bstate.parries = (a.bstate.parries as number) + 1;
    sim.emit({ type: 'cue', id: 'lucifero_caduta_parried', actor: a.id, pos: { x: a.pos.x, y: a.pos.y + 5, z: a.pos.z } });
    sim.emit({ type: 'hitstop', dur: 0.35 });
    if (a.bstate.parries === 1) sim.emit({ type: 'dialogue', key: 'boss.lucifero_2.parried', speaker: 'lucifero_2' });
    // the blow turned back on him: his Equilibrio breaks (Spezzato, Colpo di Grazia)
    a.poise = 0;
    sim.applyPoise(a, a.poiseMax + 1, null);
  },
}));
