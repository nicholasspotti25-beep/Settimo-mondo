/**
 * Regina Formica (25) — keeper of the last gate of Little Garden. Mute.
 *
 *  - Waves of workers (`worker_wave`, hazards regina_workers): the data spawns WAVE_SEGMENTS low boxes at her feet; the
 *    `workers_place` fix-up lays them as one line, side by side, at the arena rim, travelling ACROSS the view
 *    (perpendicular to the queen → player line, side by sim.rng) along a line that passes through the player, never
 *    closer than WAVE_MIN_LEAD m behind them. Low (0.36 m): jump it, or roll through it. `workers_place_second` lays
 *    the NG+ second line WAVE_GAP m behind the first, same direction.
 *  - One threat at a time: while a wave is still coming at the player she starts no blow (selectAttack waits).
 *  - Acid fans re-aimed low at the tiny player (aimLow, shared Act IV helper).
 *  - Phase 2 (flag `tunnels`): `burrow` digs (hidden + untargetable, cue regina_dig); `tunnel_strike` marks a hole under
 *    the player (regina_hole, 1.1 s) and at `emerge` she bursts out of it (teleport to the hole, visible, cue
 *    regina_emerge), staying there for the punish window. Never stays hidden outside the tunnel chain.
 * Deterministic: sim.rng only (wave side).
 */
import { insideArena } from '../../../core/terrain';
import type { AttackDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import { act4Reveal, aimLow, endComboIfLanded } from '../re_mantide/behavior';

export const WAVE_KIND = 'regina_workers';
export const WAVE_SEGMENTS = 5;
/** Width of one worker segment (box half-width x 2), m. */
export const SEG_WIDTH = 2.4;
/** The line starts at least this far behind the player along its travel. */
export const WAVE_MIN_LEAD = 3;
/** NG+ second line, this far behind the first. */
export const WAVE_GAP = 5.5;
const TUNNEL = new Set(['burrow', 'tunnel_strike', 'ng_burrow', 'ng_tunnel_chain']);

interface ReginaState {
  waveDX: number;
  waveDZ: number;
  lastPlaced: number;
}

function st(a: Actor): ReginaState {
  return a.bstate as unknown as ReginaState;
}

/** True while one of her worker lines has not reached the player yet (or is passing over them). */
export function waveIncoming(sim: Sim, a: Actor): boolean {
  const pl = sim.player.pos;
  let coming = false;
  sim.hazards.forEachActive((h) => {
    if (coming || h.owner !== a.id || h.kind !== WAVE_KIND || h.hitOnce.has(-1)) return;
    const along = (pl.x - h.pos.x) * h.vel.x + (pl.z - h.pos.z) * h.vel.z;
    if (along > -1.0 * Math.hypot(h.vel.x, h.vel.z)) coming = true;
  });
  return coming;
}

/** Lay the freshly spawned worker boxes as one line across the arena (see header). */
export function layWave(a: Actor, sim: Sim, back: number): void {
  const s = st(a);
  const pl = sim.player.pos;
  const c = sim.arenaCenter();
  const ar = sim.zone?.activeArena;
  const R = ar && ar.shape === 'circle' ? ar.radius : 12;
  if (back === 0) {
    // across the view: perpendicular to the queen → player line
    const bx = pl.x - a.pos.x, bz = pl.z - a.pos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const side = sim.rng.chance(0.5) ? 1 : -1;
    s.waveDX = (-bz / bl) * side;
    s.waveDZ = (bx / bl) * side;
  }
  const dx = s.waveDX, dz = s.waveDZ;
  // player coordinates along the travel (u) and across it (v), from the arena center
  const px = pl.x - c.x, pz = pl.z - c.z;
  const u = px * dx + pz * dz;
  const v = px * -dz + pz * dx;
  const chord = Math.sqrt(Math.max(0, R * R - v * v));
  const u0 = Math.min(-chord, u - WAVE_MIN_LEAD) - back;
  const yaw = Math.atan2(dx, dz);
  let k = 0;
  let maxId = s.lastPlaced;
  sim.hazards.forEachActive((h) => {
    if (h.owner !== a.id || h.kind !== WAVE_KIND || h.id <= s.lastPlaced || k >= WAVE_SEGMENTS) return;
    const off = (k - (WAVE_SEGMENTS - 1) / 2) * SEG_WIDTH;
    const sp = Math.hypot(h.vel.x, h.vel.z) || 3.5;
    h.pos.x = c.x + dx * u0 + -dz * (v + off);
    h.pos.z = c.z + dz * u0 + dx * (v + off);
    h.pos.y = sim.groundAt(h.pos.x, h.pos.z);
    h.yaw = yaw;
    h.vel.x = dx * sp;
    h.vel.z = dz * sp;
    maxId = Math.max(maxId, h.id);
    k++;
  });
  s.lastPlaced = maxId;
  sim.emit({ type: 'cue', id: 'regina_workers', actor: a.id, pos: { x: c.x + dx * u0 + -dz * v, y: 0, z: c.z + dz * u0 + dx * v } });
}

/** The newest hole she marked (the one she bursts out of). */
function latestHole(sim: Sim, a: Actor): { x: number; z: number } | null {
  let best: { x: number; z: number; id: number } | null = null;
  sim.hazards.forEachActive((h) => {
    if (h.owner !== a.id || h.kind !== 'regina_hole') return;
    if (!best || h.id > best.id) best = { x: h.pos.x, z: h.pos.z, id: h.id };
  });
  return best;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    const s = st(a);
    s.waveDX = 1;
    s.waveDZ = 0;
    s.lastPlaced = -1;
  },

  update(a: Actor, sim: Sim) {
    if (a.hidden && (!a.attack || !TUNNEL.has(a.attack.def.id))) act4Reveal(a, sim, 'regina_emerge');
  },

  canUseAttack(a: Actor, _sim: Sim, def: AttackDef) {
    if (def.id === 'tunnel_strike' || def.id === 'ng_tunnel_chain') return a.hidden;
    return true;
  },

  selectAttack(a: Actor, sim: Sim) {
    // one threat at a time: no blow while her workers are still marching at the player
    if (waveIncoming(sim, a)) return null;
    return undefined;
  },

  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    endComboIfLanded(a, sim, atk);
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    switch (event) {
      case 'workers_place':
        layWave(a, sim, 0);
        break;
      case 'workers_place_second':
        layWave(a, sim, WAVE_GAP);
        break;
      case 'aim_acid':
        aimLow(sim, a, 'regina_acid');
        break;
      case 'dig':
        a.hidden = true;
        a.untargetable = true;
        sim.emit({ type: 'cue', id: 'regina_dig', actor: a.id, pos: { ...a.pos } });
        break;
      case 'emerge': {
        const h = latestHole(sim, a);
        if (h) {
          a.pos.x = h.x;
          a.pos.z = h.z;
          const ar = sim.zone?.activeArena;
          if (ar && !insideArena(ar, a.pos.x, a.pos.z, a.radius)) sim.clampActor(a);
          a.pos.y = sim.groundAt(a.pos.x, a.pos.z);
          a.yaw = Math.atan2(sim.player.pos.x - a.pos.x, sim.player.pos.z - a.pos.z);
        }
        act4Reveal(a, sim, 'regina_emerge');
        break;
      }
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    act4Reveal(a, sim, 'regina_emerge');
    if (phase === 1) sim.emit({ type: 'cue', id: 'regina_tunnels', actor: a.id });
  },

  onDeath(a: Actor, sim: Sim) {
    act4Reveal(a, sim, 'regina_emerge');
  },
}));
