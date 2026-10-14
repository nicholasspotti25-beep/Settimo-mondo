/**
 * Pyro, il Cavaliere di Fiamme (8). Fire waves that RUN along the ground: moving hazards launched from the blade's impact
 * point in a single line, a fan of three, or a nova of eight (phase 2). Phase 2 wraps him in flames (flag 'wreathed').
 * Deterministic: no randomness.
 */
import { DEG, angleDiff, yawTo } from '../../../core/math';
import type { AttackDef, SpawnDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** A wall of fire 3.4 m wide running forward at 13 m/s; it telegraphs for 0.3 s before it burns. */
export const PYRO_WAVE: SpawnDef = {
  t: 0, type: 'hazard', id: 'pyro_fire_wave', at: 'front', dist: 3.2, speed: 13, delay: 0.3, active: 1.6, damage_mult: 0.8,
  flags: ['burn'], shape: { type: 'box', c: [0, 0.8, 0], half: [1.7, 0.8, 0.6] },
};
const NOVA_WAVE: SpawnDef = { ...PYRO_WAVE, dist: 4.5, speed: 10, active: 1.9, damage_mult: 0.7 };

const SINGLE = [0];
const FAN = [-24, 0, 24];
const NOVA = [0, 45, 90, 135, 180, 225, 270, 315];

/** Spawn the same hazard at several yaw offsets (degrees) around the boss's facing. */
export function spawnFan(a: Actor, sim: Sim, atk: AttackRuntime | null, spec: SpawnDef, offsets: readonly number[]): void {
  if (!atk) return;
  const y0 = a.yaw;
  for (const o of offsets) {
    a.yaw = y0 + o * DEG;
    sim.bossSpawn(a, atk, spec);
  }
  a.yaw = y0;
}

const FRONT = new Set(['combo_a', 'rising_slash', 'giuramento', 'fire_wave_slam', 'pillar_line', 'flame_crescent', 'pommel_strike']);

export default defineBehavior(() => ({
  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, atk: AttackRuntime | null) {
    if (event === 'fire_wave_single') spawnFan(a, sim, atk, PYRO_WAVE, SINGLE);
    else if (event === 'fire_wave_fan') spawnFan(a, sim, atk, PYRO_WAVE, FAN);
    else if (event === 'fire_wave_nova') spawnFan(a, sim, atk, NOVA_WAVE, NOVA);
  },
  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    const rel = Math.abs(angleDiff(a.yaw, yawTo(a.pos, sim.player.pos)));
    if (FRONT.has(def.id) && rel > 70 * DEG) return false;
    return true;
  },
  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase >= 1) {
      sim.emit({ type: 'vfx', id: 'pyro_wreathe', pos: { ...a.pos } });
      sim.emit({ type: 'shake', strength: 0.4, dur: 0.9 });
    }
  },
}));
