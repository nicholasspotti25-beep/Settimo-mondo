/**
 * Great Devourer — a river-long serpent around the Rotten Pier (mini boss, no dialogue).
 *
 * Two postures (flag 'surfaced' / 'submerged'):
 *  - SUBMERGED: hidden and untargetable under the planks; only `requires: submerged` attacks (ripples = strikes from below,
 *    surfacing beside the pier, coils around a stilt, the tail slamming across the pier, breaches across the rafts). Each of them
 *    ends with the serpent surfaced somewhere, so every attack from below opens a punish window.
 *  - SURFACED: head and neck reared above the deck, hittable; bites, low head sweeps, logs flung by the tail. After 2–3 surfaced
 *    attacks (or a few seconds) it dives again (`dive`).
 * Phase 2 (flag 'pier_destroyed', arena variant): the pier is smashed into rafts and logs; no stilts remain.
 * Hazard placement fix-ups (stilt coils, tail across the pier) move the freshly spawned hazard after the data spawn.
 * Deterministic: sim.rng only.
 */
import { clamp, dist2D, yawTo } from '../../../core/math';
import { insideArena } from '../../../core/terrain';
import type { AttackDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Stilts of the pier in arena-local coordinates (x across, z along the pier); the arena data has matching colliders. */
export const STILTS: readonly [number, number][] = [
  [-10.8, -18], [-10.8, -6], [-10.8, 6], [-10.8, 18],
  [10.8, -18], [10.8, -6], [10.8, 6], [10.8, 18],
];
/** A coil around a stilt is only chosen when the player stands this close to one. */
export const STILT_REACH = 7.5;
/** Surfaced attacks before the serpent dives again (inclusive range). */
export const SURFACED_ATTACKS: [number, number] = [2, 3];
/** Max seconds surfaced before it prefers to dive. */
export const SURFACED_MAX_TIME = 9;

interface DevourerState {
  surfaced: boolean;
  opened: boolean;
  surfacedAttacks: number;
  surfacedLimit: number;
  surfacedTime: number;
  /** Marked eruption point (strike from below / coil). */
  markX: number;
  markZ: number;
  hasMark: boolean;
  stilt: number;
}

function st(a: Actor): DevourerState {
  return a.bstate as DevourerState;
}

/** Inside the active fight arena (with margin). */
export function insideArenaPoint(sim: Sim, x: number, z: number, margin: number): boolean {
  const ar = sim.zone?.activeArena;
  return ar ? insideArena(ar, x, z, margin) : true;
}

export function isSurfaced(a: Actor): boolean {
  return a.flags.has('surfaced');
}

function setSurfaced(a: Actor, sim: Sim, up: boolean): void {
  const s = st(a);
  if (s.surfaced === up && a.hidden === !up) return;
  s.surfaced = up;
  a.hidden = !up;
  a.untargetable = !up;
  a.noCollide = !up;
  if (up) {
    a.flags.add('surfaced');
    a.flags.delete('submerged');
    s.surfacedAttacks = 0;
    s.surfacedTime = 0;
    s.surfacedLimit = sim.rng.int(SURFACED_ATTACKS[0], SURFACED_ATTACKS[1]);
  } else {
    a.flags.add('submerged');
    a.flags.delete('surfaced');
    // drop the lock while it is under water; the player re-locks when it rises
    if (sim.player.lock?.actor === a.id) sim.player.lock = null;
  }
  sim.emit({ type: 'cue', id: up ? 'devourer_surface' : 'devourer_submerge', actor: a.id, pos: { ...a.pos } });
}

/** Arena-local -> world. */
function arenaWorld(sim: Sim, lx: number, lz: number, out: { x: number; z: number }): { x: number; z: number } {
  const c = sim.arenaCenter();
  out.x = c.x + lx;
  out.z = c.z + lz;
  return out;
}

const P = { x: 0, z: 0 };

/** Index of the stilt nearest to the player (pier intact), or -1 when none is within reach. */
export function nearestStilt(sim: Sim, reach = STILT_REACH): number {
  if (sim.boss?.flags.has('pier_destroyed')) return -1;
  let best = -1;
  let bd = reach;
  STILTS.forEach(([lx, lz], i) => {
    arenaWorld(sim, lx, lz, P);
    const d = Math.hypot(P.x - sim.player.pos.x, P.z - sim.player.pos.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Most recent enemy hazard of a kind spawned by this actor this tick (age 0) — for placement fix-ups. */
function freshHazard(sim: Sim, a: Actor, kind: string, fn: (h: { pos: { x: number; y: number; z: number }; yaw: number }) => void): boolean {
  let found = false;
  sim.hazards.forEachActive((h) => {
    if (found || h.owner !== a.id || h.kind !== kind || h.age > 1e-6) return;
    fn(h);
    found = true;
  });
  return found;
}

/** Latest hazard of a kind (any age) owned by this actor: the strike from below follows its ripples. */
function latestHazard(sim: Sim, a: Actor, kind: string): { x: number; z: number } | null {
  let best: { x: number; z: number; id: number } | null = null;
  sim.hazards.forEachActive((h) => {
    if (h.owner !== a.id || h.kind !== kind) return;
    if (!best || h.id > best.id) best = { x: h.pos.x, z: h.pos.z, id: h.id };
  });
  return best;
}

/** A point beside the pier (pier intact) or among the rafts near the player, where the serpent surfaces. */
function flankPoint(a: Actor, sim: Sim, out: { x: number; z: number }): void {
  const c = sim.arenaCenter();
  const arena = sim.zone?.activeArena;
  const pl = sim.player.pos;
  if (!a.flags.has('pier_destroyed') && arena && arena.shape === 'rect') {
    // the long edge nearest to the player, a little ahead or behind along the pier
    const side = pl.x >= c.x ? 1 : -1;
    out.x = c.x + side * (arena.hx - 1.0);
    out.z = clamp(pl.z + sim.rng.range(-4, 4), c.z - arena.hz + 3, c.z + arena.hz - 3);
    return;
  }
  for (let i = 0; i < 16; i++) {
    const ang = sim.rng.range(-Math.PI, Math.PI);
    const d = sim.rng.range(6.5, 9);
    const x = pl.x + Math.sin(ang) * d, z = pl.z + Math.cos(ang) * d;
    if (insideArenaPoint(sim, x, z, 1.5)) {
      out.x = x;
      out.z = z;
      return;
    }
  }
  out.x = c.x;
  out.z = c.z;
}

/** Start of a breach line: ~15 m from the player, on the side that leaves the longest run through them inside the arena. */
function breachStart(a: Actor, sim: Sim): void {
  const pl = sim.player.pos;
  let bestScore = -1;
  let bx = a.pos.x, bz = a.pos.z, byaw = 0;
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + sim.rng.range(-0.15, 0.15);
    const sx = pl.x + Math.sin(ang) * 15, sz = pl.z + Math.cos(ang) * 15;
    // score: how far along the line stays inside the arena (start side and far side)
    let inside = 0;
    for (let k = -15; k <= 12; k += 3) {
      const x = pl.x - Math.sin(ang) * k, z = pl.z - Math.cos(ang) * k;
      if (insideArenaPoint(sim, x, z, 0.5)) inside++;
    }
    const score = inside + (insideArenaPoint(sim, sx, sz, 1) ? 2 : 0) + sim.rng.next() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bx = sx;
      bz = sz;
      byaw = ang + Math.PI;
    }
  }
  a.pos.x = bx;
  a.pos.z = bz;
  sim.clampActor(a);
  a.yaw = byaw;
  // after clamping, aim straight through the player
  a.yaw = yawTo(a.pos, pl);
}

function attack(a: Actor, id: string): AttackDef | undefined {
  return a.attackMap.get(id);
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    const s: DevourerState = {
      surfaced: true, opened: false, surfacedAttacks: 0, surfacedLimit: 2, surfacedTime: 0, markX: 0, markZ: 0, hasMark: false, stilt: -1,
    };
    a.bstate = s;
    // starts under the water, far out in the fog
    setSurfaced(a, sim, false);
  },

  update(a: Actor, sim: Sim, dt: number) {
    const s = st(a);
    if (s.surfaced) s.surfacedTime += dt;
    if (!s.opened && a.state === 'idle') {
      s.opened = true;
      const op = attack(a, 'emerge_from_fog');
      if (op) a.startAttack(sim, op);
    }
    // Spezzato, stagger and death always happen with the serpent visible
    if ((a.state === 'spezzato' || a.state === 'stagger' || a.state === 'dead' || a.state === 'transition') && !s.surfaced) setSurfaced(a, sim, true);
    return false;
  },

  movement(a: Actor, sim: Sim, dt: number): boolean {
    const s = st(a);
    const pl = sim.player.pos;
    a.faceTarget(pl, dt, 1);
    if (s.surfaced) {
      // reared above the water: it sways but does not travel
      a.state = 'idle';
      a.anim = 'idle';
      a.animStage = 'idle';
      a.moveSpeedNow = 0;
    } else {
      // swims unseen under the planks, keeping close to its prey
      const d = dist2D(a.pos, pl);
      const want = 8;
      if (Math.abs(d - want) > 0.5) {
        const k = (d - want) / Math.max(1e-3, d);
        const sp = Math.min(a.def.move.run * dt, Math.abs(d - want));
        a.pos.x += ((pl.x - a.pos.x) / Math.max(1e-3, d)) * sp * Math.sign(k);
        a.pos.z += ((pl.z - a.pos.z) / Math.max(1e-3, d)) * sp * Math.sign(k);
      }
      a.state = 'move';
      a.anim = 'swim';
      a.animStage = 'move';
      a.moveSpeedNow = a.def.move.run;
      sim.clampActor(a);
    }
    a.animTime += dt;
    return true;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef): boolean {
    switch (def.requires) {
      case 'surfaced': return isSurfaced(a);
      case 'submerged': return !isSurfaced(a);
      case 'near_stilt': return !isSurfaced(a) && nearestStilt(sim) >= 0;
      default: return true;
    }
  },

  selectAttack(a: Actor, sim: Sim, cands: AttackDef[]): AttackDef | null | undefined {
    const s = st(a);
    if (s.surfaced && (s.surfacedAttacks >= s.surfacedLimit || s.surfacedTime > SURFACED_MAX_TIME)) {
      const dive = attack(a, 'dive');
      if (dive) return dive;
    }
    if (!s.surfaced) {
      // never stay under for long: anything that comes up is fine
      const pool = cands.filter((c) => c.requires === 'submerged' || c.requires === 'near_stilt');
      if (pool.length) {
        const w = pool.map((c) => c.weight ?? 1);
        const i = sim.rng.weighted(w);
        return i >= 0 ? pool[i] : undefined;
      }
    }
    void sim;
    return undefined;
  },

  onAttackEnd(a: Actor, _sim: Sim, atk: AttackRuntime) {
    const s = st(a);
    if (atk.def.requires === 'surfaced' && atk.def.id !== 'dive') s.surfacedAttacks++;
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    const s = st(a);
    switch (event) {
      case 'surface_far': {
        // out of the fog, at the far (north) end of the pier
        const c = sim.arenaCenter();
        const arena = sim.zone?.activeArena;
        a.pos.x = c.x + sim.rng.range(-4, 4);
        a.pos.z = c.z + (arena ? (arena.shape === 'rect' ? arena.hz : arena.radius) - 2 : 18);
        sim.clampActor(a);
        a.yaw = yawTo(a.pos, sim.player.pos);
        break;
      }
      case 'surface':
        setSurfaced(a, sim, true);
        break;
      case 'submerge':
        setSurfaced(a, sim, false);
        a.idleTimer = Math.min(a.idleTimer, 0.5);
        break;
      case 'flank_mark':
        flankPoint(a, sim, P);
        a.pos.x = P.x;
        a.pos.z = P.z;
        sim.clampActor(a);
        a.yaw = yawTo(a.pos, sim.player.pos);
        break;
      case 'mark_burst': {
        const h = latestHazard(sim, a, 'devourer_ripple');
        s.hasMark = !!h;
        if (h) {
          s.markX = h.x;
          s.markZ = h.z;
        }
        break;
      }
      case 'burst':
        if (s.hasMark) {
          a.pos.x = s.markX;
          a.pos.z = s.markZ;
          sim.clampActor(a);
        }
        a.yaw = yawTo(a.pos, sim.player.pos);
        setSurfaced(a, sim, true);
        sim.emit({ type: 'vfx', id: 'devourer_burst', pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } });
        break;
      case 'coil_stilt': {
        s.stilt = nearestStilt(sim, 99);
        break;
      }
      case 'coil_place': {
        const i = s.stilt >= 0 ? s.stilt : nearestStilt(sim, 99);
        if (i < 0) break;
        arenaWorld(sim, STILTS[i][0], STILTS[i][1], P);
        // the crush zone is centered a little inward of the stilt: the planks around it give way
        const c = sim.arenaCenter();
        const inward = STILTS[i][0] > 0 ? -1.6 : 1.6;
        freshHazard(sim, a, 'devourer_coil', (h) => {
          h.pos.x = P.x + inward;
          h.pos.z = P.z;
        });
        s.markX = P.x;
        s.markZ = P.z;
        s.hasMark = true;
        void c;
        break;
      }
      case 'mark_coil': {
        const h = latestHazard(sim, a, 'devourer_coil');
        if (h) {
          // rears at the edge of the crushed raft, on the side it came from
          const d = Math.hypot(a.pos.x - h.x, a.pos.z - h.z) || 1;
          s.markX = h.x + ((a.pos.x - h.x) / d) * 4.4;
          s.markZ = h.z + ((a.pos.z - h.z) / d) * 4.4;
          s.hasMark = true;
        }
        break;
      }
      case 'coil_rise':
        if (s.hasMark) {
          a.pos.x = s.markX;
          a.pos.z = s.markZ;
          sim.clampActor(a);
        }
        a.yaw = yawTo(a.pos, sim.player.pos);
        setSurfaced(a, sim, true);
        sim.emit({ type: 'vfx', id: 'devourer_coil_crush', pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z } });
        break;
      case 'tail_across':
        // the tail falls across the pier: the slam spans its whole width (box along the arena x axis)
        freshHazard(sim, a, 'devourer_tail', (h) => {
          h.yaw = sim.zone?.activeArena?.yaw ?? 0;
        });
        break;
      case 'breach_line':
        breachStart(a, sim);
        break;
      default:
        break;
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, _index: number, def) {
    if (def.id !== 'p2') return;
    // it rears out of the water in the middle of the pier and smashes it
    const c = sim.arenaCenter();
    const d = dist2D(a.pos, c);
    if (!st(a).surfaced || d > 9) {
      const k = d > 1e-3 ? Math.min(1, 6 / d) : 0;
      a.pos.x = c.x + (a.pos.x - c.x) * k;
      a.pos.z = c.z + (a.pos.z - c.z) * k;
    }
    setSurfaced(a, sim, true);
    sim.emit({ type: 'cue', id: 'devourer_pier_smash', actor: a.id, pos: { ...a.pos } });
  },

  onDeath(a: Actor, sim: Sim) {
    setSurfaced(a, sim, true);
    a.noCollide = true;
    sim.emit({ type: 'cue', id: 'devourer_sinks', actor: a.id, pos: { ...a.pos } });
  },
}));
