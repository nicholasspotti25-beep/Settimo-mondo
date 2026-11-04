/**
 * Gigante di Fuoco (13) — the sentinel of the Bocca del Vulcano.
 *
 *  - Grabs and throws: the `grab` hit (data flag `grab`) leaves the player `grabbed` by this actor. The behavior lifts the
 *    caught player to the giant's chest for GRAB_HOLD seconds, then hurls them THROW_DIST m to one side of the rim (always
 *    inside the arena, preferring the side with more room); the landing deals the throw damage (knockdown; burn while
 *    ablaze). The flight is invulnerable (no hazard can hit a thrown player: no stun-lock).
 *  - The head (weak point with the beard of flames) is out of reach while he stands; it comes down when he bends over his
 *    fists after the twin slam and when it hangs after a head-down charge (phase 2), and while he is Spezzato.
 *  - Frontal blows only for a player in front of him; the stomp only for whoever stands under or behind him; the rim quake
 *    (unstable rim) is never called in the first RIM_QUAKE_EARLIEST seconds of real fight.
 * Fists that ignite the ground, the ember breath, the ablaze phase and the crumbled rim (arena_state rim_broken) are data.
 * Deterministic: the throw side uses sim.rng only when both sides have the same room.
 */
import { clamp, dist2D, yawTo } from '../../../core/math';
import { insideArena } from '../../../core/terrain';
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Seconds the caught player is held at the chest before the throw. */
export const GRAB_HOLD = 0.75;
/** Seconds of flight of a thrown player. */
export const THROW_FLIGHT = 0.7;
/** Horizontal throw distance (m), shortened to stay inside the arena. */
export const THROW_DIST = 12;
/** Landing damage (x typical hit). */
export const THROW_MULT = 1.15;
/** The head hangs this low (anchor offset) when he bends or after a charge: from 14.6 m down to ~3.4 m, in front of him. */
export const HEAD_LOW_Y = -11.2;
export const HEAD_LOW_Z = 3.8;
/** The rim quake is never the first lesson. */
export const RIM_QUAKE_EARLIEST = 12;

const FRONT = new Set(['fist_slam', 'twin_slam', 'backhand', 'grab', 'ember_breath', 'ng_crater_spit']);
const BEND = new Set(['twin_slam']);
const HANG = new Set(['head_charge']);

function relYaw(a: Actor, sim: Sim): number {
  const d = yawTo(a.pos, sim.player.pos) - a.yaw;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

/** Bend target for the head anchor (0 standing .. 1 head within reach). */
export function headTarget(a: Actor): number {
  if (a.state === 'spezzato') return 1;
  const atk = a.attack;
  if (!atk) return 0;
  const id = atk.def.id;
  if (BEND.has(id)) {
    if (atk.stage === 'active') return 1;
    if (atk.stage === 'recovery') return (atk.activeTime - atk.def.active) / Math.max(0.01, atk.def.recovery) < 0.8 ? 1 : 0;
  }
  if (HANG.has(id) && atk.stage === 'recovery') {
    return (atk.activeTime - atk.def.active) / Math.max(0.01, atk.def.recovery) < 0.85 ? 1 : 0;
  }
  return 0;
}

/** Where a player caught at `from` is thrown: to the side of the giant with more room, inside the arena. */
export function throwTarget(a: Actor, sim: Sim): { x: number; z: number } {
  const arena = sim.zone?.activeArena;
  const pl = sim.player.pos;
  const fits = (x: number, z: number) => !arena || insideArena(arena, x, z, 2.5);
  const room = (side: number): { x: number; z: number; d: number } => {
    const yaw = a.yaw + side * 1.15;
    for (let d = THROW_DIST; d >= 4; d -= 1) {
      const x = pl.x + Math.sin(yaw) * d, z = pl.z + Math.cos(yaw) * d;
      if (fits(x, z)) return { x, z, d };
    }
    return { x: pl.x, z: pl.z, d: 0 };
  };
  const l = room(1), r = room(-1);
  const pick = l.d === r.d ? (sim.rng.chance(0.5) ? l : r) : l.d > r.d ? l : r;
  if (pick.d > 0) return pick;
  const c = sim.arenaCenter();
  const y = yawTo(pl, c);
  return { x: pl.x + Math.sin(y) * 6, z: pl.z + Math.cos(y) * 6 };
}

function land(a: Actor, sim: Sim, harm: boolean): void {
  const pl = sim.player;
  pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z);
  pl.vy = 0;
  sim.emit({ type: 'vfx', id: 'gigante_throw_land', pos: { ...pl.pos } });
  sim.emit({ type: 'shake', strength: 0.5, dur: 0.4 });
  if (!harm || pl.state === 'dead') return;
  if (sim.debug.invincible) {
    sim.emit({ type: 'cue', id: 'debug_invincible', pos: { ...pl.pos } });
    return;
  }
  const amount = a.hitDamage(sim, THROW_MULT);
  pl.hp = Math.max(0, pl.hp - amount);
  pl.tookDamage = true;
  pl.hurtTimer = 0.4;
  const burning = a.flags.has('ablaze');
  if (burning) {
    pl.statuses.burn = Math.max(pl.statuses.burn ?? 0, 3);
    if (pl.statusPower.burn === undefined) pl.statusPower.burn = 1;
    sim.emit({ type: 'status', kind: 'burn', dur: 3 });
  }
  sim.emit({ type: 'playerHurt', amount, pos: { ...pl.pos }, heavy: true, element: burning ? 'fire' : 'physical', knockdown: true });
  sim.emit({ type: 'haptic', pattern: 'hurt' });
  if (pl.hp <= 0) sim.onPlayerDeath();
}

/** Release a held or flying player (death, scripted stop). */
function release(a: Actor, sim: Sim): void {
  const pl = sim.player;
  if (pl.grabbedBy === a.id) pl.grabbedBy = -1;
  if (a.bstate.throwT >= 0 || a.bstate.holdT >= 0) land(a, sim, false);
  a.bstate.throwT = -1;
  a.bstate.holdT = -1;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.fightT = 0;
    a.bstate.head = 0;
    a.bstate.holdT = -1;
    a.bstate.throwT = -1;
    a.bstate.from = { x: 0, y: 0, z: 0 };
    a.bstate.to = { x: 0, z: 0 };
    a.bstate.throws = 0;
  },

  update(a: Actor, sim: Sim, dt: number) {
    if (sim.fight?.active && !sim.fight.intro && !sim.seq.running) a.bstate.fightT += dt;
    // the head comes down when he bends over his fists / hangs it after a charge
    const target = headTarget(a);
    a.bstate.head += (target - a.bstate.head) * (1 - Math.exp(-(target > a.bstate.head ? 6 : 2.2) * dt));
    const h = a.bstate.head as number;
    const head = a.part('head');
    if (head) {
      head.anchor.x = 0;
      head.anchor.y = HEAD_LOW_Y * h;
      head.anchor.z = HEAD_LOW_Z * h;
    }
    if (h > 0.6) a.flags.add('head_low');
    else a.flags.delete('head_low');

    const pl = sim.player;
    const g = a.bstate;
    // grabbed: carry the player up to the chest, then throw
    if (g.throwT < 0 && pl.state === 'grabbed' && pl.grabbedBy === a.id) {
      if (g.holdT < 0) {
        g.holdT = 0;
        a.flags.add('holding');
        sim.emit({ type: 'cue', id: 'gigante_grab_caught', actor: a.id });
      }
      g.holdT += dt;
      const k = clamp(g.holdT / GRAB_HOLD, 0, 1);
      const reach = 5.4 - 1.4 * k;
      pl.pos.x = a.pos.x + Math.sin(a.yaw) * reach;
      pl.pos.z = a.pos.z + Math.cos(a.yaw) * reach;
      pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) + 6.5 * k;
      pl.vy = 0;
      pl.invuln = Math.max(pl.invuln, 0.15);
      if (g.holdT >= GRAB_HOLD) {
        const to = throwTarget(a, sim);
        g.from = { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z };
        g.to = to;
        g.throwT = 0;
        g.holdT = -1;
        g.throws++;
        a.flags.delete('holding');
        pl.grabbedBy = -1;
        pl.setState('knockdown', THROW_FLIGHT + sim.bal.player.knockdown_time);
        pl.invuln = Math.max(pl.invuln, THROW_FLIGHT + 0.1);
        sim.emit({ type: 'cue', id: 'gigante_throw', actor: a.id, pos: { ...pl.pos } });
        sim.emit({ type: 'sfx', id: 'gigante_throw', pos: { ...pl.pos } });
      }
    } else if (g.holdT >= 0 && g.throwT < 0) {
      // slipped out (state changed elsewhere)
      g.holdT = -1;
      a.flags.delete('holding');
    }
    if (g.throwT >= 0) {
      g.throwT += dt;
      const k = clamp(g.throwT / THROW_FLIGHT, 0, 1);
      const f = g.from as { x: number; y: number; z: number };
      const t = g.to as { x: number; z: number };
      pl.pos.x = f.x + (t.x - f.x) * k;
      pl.pos.z = f.z + (t.z - f.z) * k;
      const ground = sim.groundAt(pl.pos.x, pl.pos.z);
      pl.pos.y = ground + (f.y - ground) * (1 - k) + Math.sin(k * Math.PI) * 3.5;
      pl.vy = 0;
      if (k >= 1) {
        g.throwT = -1;
        land(a, sim, true);
      }
    }
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.id === 'rim_quake' && a.bstate.fightT < RIM_QUAKE_EARLIEST) return false;
    const rel = relYaw(a, sim);
    if (FRONT.has(def.id) && rel > 1.3) return false;
    if (def.id === 'stomp') return dist2D(a.pos, sim.player.pos) < a.radius + 3 || rel > 1.6;
    // never reach for a player already on the ground
    if (def.id === 'grab' && (sim.player.state === 'knockdown' || sim.player.state === 'grabbed')) return false;
    return true;
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    release(a, sim);
    sim.emit({ type: 'vfx', id: 'gigante_ablaze', pos: { x: a.pos.x, y: a.pos.y + 8, z: a.pos.z } });
    sim.emit({ type: 'cue', id: 'gigante_ablaze', actor: a.id });
    sim.emit({ type: 'shake', strength: 0.5, dur: 1.6 });
  },

  onDeath(a: Actor, sim: Sim) {
    release(a, sim);
  },
}));
