/**
 * Mostro di Magma (11) — the colossus of the buried forge.
 *
 *  - The heart (weak point) sits high in the chest; after its slams the colossus stays bent over its fists and the heart
 *    comes within reach (part anchor animated here; the renderer follows).
 *  - The eruption: during the wind-up black crusts of cooled basalt rise from the floor (bstate.islands; the first one
 *    always 5–8.5 m from the player). Then magma floods the whole arena for MAGMA_FLOOD seconds: everyone standing outside
 *    a crust burns (damage ticks without stagger, dodge i-frames avoid a tick). Presentation reads bstate.flood/islands.
 *  - Phase 2: the obsidian carapace (breakable part) covers the body; hits on the body are reduced to 30% until it
 *    shatters. Shattering it staggers the colossus and exposes the heart (a far weaker point).
 * Deterministic: island placement uses sim.rng.
 */
import { clamp, dist2D, v3, yawTo } from '../../../core/math';
import { insideArena } from '../../../core/terrain';
import type { AttackDef, SpawnDef } from '../../../core/types';
import type { Actor, AttackRuntime, PartRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import type { DamageEvent } from '../../../sim/types';

export const MAGMA_FLOOD = 2.6;
export const MAGMA_FLOOD_TICK = 0.4;
/** Lava depth: a player whose feet are higher than this above the floor (jumping) is not burned. */
const FLOOD_DEPTH = 0.55;
export const CARAPACE_BODY_MULT = 0.3;

export interface MagmaIsland {
  x: number;
  z: number;
  r: number;
}

/** Attacks after which the colossus stays bent over its fists (heart within reach during the recovery). */
const BEND = new Set(['fist_slam', 'double_slam', 'lava_wave']);
const FRONT = new Set(['fist_slam', 'double_slam', 'backhand', 'magma_lob', 'obsidian_charge']);
const tmp = v3();
const LOB: SpawnDef = { t: 0, type: 'projectile', id: 'magma_rock', count: 3, spread: 30, speed: 16, pitch: 28, from: [-1.5, 7.5, 1.6] };

/** Is a point standing on one of the basalt crusts? */
export function onIsland(islands: MagmaIsland[], x: number, z: number, margin = 0): boolean {
  for (const i of islands) if (Math.hypot(x - i.x, z - i.z) <= i.r - margin) return true;
  return false;
}

/** Place the eruption's safe crusts: the first within reach of the player, the others spread across the arena. */
export function placeIslands(a: Actor, sim: Sim, n: number, r: number): MagmaIsland[] {
  const out: MagmaIsland[] = [];
  const arena = sim.zone?.activeArena;
  const pl = sim.player.pos;
  const ok = (x: number, z: number): boolean => {
    if (arena && !insideArena(arena, x, z, r + 1.5)) return false;
    if (Math.hypot(x - a.pos.x, z - a.pos.z) < a.radius * a.scale + r + 2.5) return false;
    for (const o of out) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 5) return false;
    return true;
  };
  // first: 5..8.5 m from the player
  for (let k = 0; k < 40 && !out.length; k++) {
    const ang = sim.rng.range(-Math.PI, Math.PI);
    const d = sim.rng.range(5, 8.5);
    const x = pl.x + Math.sin(ang) * d, z = pl.z + Math.cos(ang) * d;
    if (ok(x, z)) out.push({ x, z, r });
  }
  if (!out.length) {
    // fall back: toward the arena center from the player
    const c = sim.arenaCenter();
    const y = yawTo(pl, c);
    out.push({ x: pl.x + Math.sin(y) * 6, z: pl.z + Math.cos(y) * 6, r });
  }
  for (let k = 0; k < 80 && out.length < n; k++) {
    const p = sim.randomArenaPoint(8, pl);
    if (ok(p.x, p.z)) out.push({ x: p.x, z: p.z, r });
  }
  return out;
}

function floodTick(a: Actor, sim: Sim): void {
  const pl = sim.player;
  if (pl.state === 'dead' || sim.fight?.intro || sim.seq.running) return;
  const floor = sim.zone?.activeArena?.floor ?? 0;
  if (pl.pos.y > floor + FLOOD_DEPTH) return;
  if (onIsland(a.bstate.islands as MagmaIsland[], pl.pos.x, pl.pos.z, -0.35)) return;
  if (pl.invulnerable(sim)) return;
  if (sim.debug.invincible) {
    sim.emit({ type: 'cue', id: 'debug_invincible', pos: { ...pl.pos } });
    return;
  }
  const amount = a.hitDamage(sim, 0.55);
  pl.hp = Math.max(0, pl.hp - amount);
  pl.tookDamage = true;
  pl.hurtTimer = 0.4;
  pl.statuses.burn = Math.max(pl.statuses.burn ?? 0, 2.5);
  if (pl.statusPower.burn === undefined) pl.statusPower.burn = 1;
  sim.emit({ type: 'playerHurt', amount, pos: { ...pl.pos }, heavy: false, element: 'fire', knockdown: false });
  sim.emit({ type: 'status', kind: 'burn', dur: 2.5 });
  sim.emit({ type: 'haptic', pattern: 'hurt' });
  if (pl.hp <= 0) sim.onPlayerDeath();
}

/** Bend target for the heart anchor (0 upright .. 1 bent over the fists). */
function bendTarget(a: Actor): number {
  const atk = a.attack;
  if (a.state === 'spezzato') return 1;
  if (!atk || !BEND.has(atk.def.id)) return 0;
  if (atk.stage === 'active') return 1;
  if (atk.stage === 'recovery') {
    const k = (atk.activeTime - atk.def.active) / Math.max(0.01, atk.def.recovery);
    return k < 0.8 ? 1 : 0;
  }
  return 0;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.islands = [];
    a.bstate.flood = 0;
    a.bstate.floodTick = 0;
    a.bstate.warn = 0;
    a.bstate.bend = 0;
  },

  update(a: Actor, sim: Sim, dt: number) {
    // the heart lowers as the colossus bends over its fists
    const target = bendTarget(a);
    a.bstate.bend += (target - a.bstate.bend) * (1 - Math.exp(-(target > a.bstate.bend ? 7 : 2.5) * dt));
    const b = a.bstate.bend as number;
    for (const p of a.parts) {
      if (p.id === 'heart' || p.id === 'heart_exposed') {
        p.anchor.x = 0;
        p.anchor.y = -3.9 * b;
        p.anchor.z = 1.5 * b;
      }
    }
    if (a.bstate.warn > 0) a.bstate.warn = Math.max(0, a.bstate.warn - dt);
    if (a.bstate.flood > 0) {
      a.bstate.flood = Math.max(0, a.bstate.flood - dt);
      a.bstate.floodTick -= dt;
      if (a.bstate.floodTick <= 0) {
        a.bstate.floodTick += MAGMA_FLOOD_TICK;
        floodTick(a, sim);
      }
      if (a.bstate.flood <= 0) {
        a.bstate.islands = [];
        sim.emit({ type: 'cue', id: 'eruption_end', actor: a.id });
      }
    }
    if (a.bstate.flood > 0) a.flags.add('flooding');
    else a.flags.delete('flooding');
    return false;
  },

  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, atk: AttackRuntime | null) {
    if (event === 'eruption_mark') {
      const p2 = a.phaseIndex >= 1;
      const islands = placeIslands(a, sim, p2 ? 2 : 3, p2 ? 3.0 : 3.4);
      a.bstate.islands = islands;
      a.bstate.warn = 2.3;
      for (const i of islands) sim.emit({ type: 'vfx', id: 'magma_island', pos: { x: i.x, y: sim.groundAt(i.x, i.z), z: i.z }, params: { r: i.r } });
      sim.emit({ type: 'cue', id: 'eruption_warn', actor: a.id });
      sim.emit({ type: 'shake', strength: 0.25, dur: 2.2 });
    } else if (event === 'eruption_flood') {
      a.bstate.flood = MAGMA_FLOOD;
      a.bstate.floodTick = 0.05;
      sim.emit({ type: 'cue', id: 'eruption_flood', actor: a.id });
      sim.emit({ type: 'shake', strength: 0.6, dur: 1.2 });
      sim.emit({ type: 'vfx', id: 'magma_eruption', pos: { ...a.pos } });
    } else if (event === 'magma_lob' && atk) {
      // aim the arc at the player's distance (ballistic speed for a fixed launch angle)
      const pl = sim.player.pos;
      const d = clamp(dist2D(a.pos, pl) - 1.0, 6, 40);
      const theta = (LOB.pitch ?? 28) * (Math.PI / 180);
      const h0 = 7.5 - 1.0;
      const g = sim.c.projectile('magma_rock')?.gravity ?? 14;
      const den = 2 * Math.cos(theta) ** 2 * (d * Math.tan(theta) + h0);
      LOB.speed = Math.sqrt((g * d * d) / Math.max(0.1, den));
      sim.bossSpawn(a, atk, LOB);
    }
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (FRONT.has(def.id)) {
      const rel = Math.abs(Math.atan2(Math.sin(yawTo(a.pos, sim.player.pos) - a.yaw), Math.cos(yawTo(a.pos, sim.player.pos) - a.yaw)));
      if (rel > 1.3) return false;
    }
    if (def.id === 'stomp') {
      // only for whoever stands under or behind it
      const rel = Math.abs(Math.atan2(Math.sin(yawTo(a.pos, sim.player.pos) - a.yaw), Math.cos(yawTo(a.pos, sim.player.pos) - a.yaw)));
      return dist2D(a.pos, sim.player.pos) < a.radius + 3 || rel > 1.6;
    }
    return true;
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    const carapace = a.part('carapace');
    const heart = a.part('heart');
    if (carapace && !carapace.broken) {
      carapace.active = true;
      carapace.hp = carapace.hpMax;
    }
    if (heart) heart.active = false;
    sim.emit({ type: 'vfx', id: 'obsidian_form', pos: { x: a.pos.x, y: a.pos.y + 5, z: a.pos.z } });
    sim.emit({ type: 'cue', id: 'magma_obsidian', actor: a.id });
  },

  modifyIncoming(a: Actor, sim: Sim, dmg: DamageEvent, part: PartRuntime | null) {
    const carapace = a.part('carapace');
    if (!carapace || !carapace.active || carapace.broken) return;
    if (part === null && dmg.source === -1) {
      dmg.amount *= CARAPACE_BODY_MULT;
      dmg.poise *= 0.5;
      sim.emit({ type: 'cue', id: 'obsidian_deflect', pos: { ...dmg.pos }, actor: a.id });
    }
  },

  onPartBroken(a: Actor, sim: Sim, part: PartRuntime) {
    if (part.id !== 'carapace') return;
    const heart = a.part('heart_exposed');
    if (heart) heart.active = true;
    a.flags.add('carapace_broken');
    tmp.x = a.pos.x; tmp.y = a.pos.y + 5.5; tmp.z = a.pos.z;
    sim.emit({ type: 'vfx', id: 'obsidian_shatter', pos: { ...tmp } });
    sim.emit({ type: 'cue', id: 'magma_heart_exposed', pos: { ...tmp }, actor: a.id });
    sim.emit({ type: 'shake', strength: 0.7, dur: 0.9 });
    sim.emit({ type: 'hitstop', dur: 0.12 });
    if (a.state !== 'spezzato' && a.state !== 'transition' && a.state !== 'dead') {
      a.cancelAttack(sim);
      a.setState('stagger', 2.4);
    }
  },

  onDeath(a: Actor) {
    a.bstate.flood = 0;
    a.bstate.islands = [];
  },
}));
