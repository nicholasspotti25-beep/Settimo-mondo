/**
 * Drago di Ghiaccio (27, mini, D14) — Altipiano delle Ossa.
 *
 * - Frost breath → icy patches: each `ice_trail` event of a breath lays a patch of ice on the ground along the breath's
 *   line (distance grows with the breath's progress). Patches are drawn as static `ghiaccio_ice` hazards that NEVER deal
 *   damage; on them the footing slides: the player's ground velocity only slowly follows the stick (SLIDE_GRIP), so you
 *   keep drifting where you were going. At most MAX_PATCHES live at once (the oldest melts first), each melts after
 *   PATCH_LIFE s. (The engine's own ice footing reads the whole arena surface; see docs/requests/act5.md.)
 * - Phase 2 storm (flag `storm`): telegraphed gusts (cue `ghiaccio_gust`, pos = wind unit vector, GUST_WARN s before the
 *   push), ambient stalactites marked on you every STALACTITE_EVERY s, only while the dragon is not
 *   winding up or striking, and its next blow waits until the stalactite has fallen; `stalactite_rain` (one on you, four
 *   elsewhere ≥ 5 m away); `wing_gale` pushes you away for its active window.
 * - NG+ `ng_ice_cage`: seven stalactites in a ring around you with one gap on the side away from the dragon + one on you.
 * - A landed claw ends the claw chain (endComboIfLanded, Act IV helper).
 */
import type { AttackDef, SpawnDef } from '../../../core/types';
import { worldToLocal } from '../../../core/math';
import { defineBehavior } from '../../../sim/behavior';
import { nextAttackUid, type Actor, type AttackRuntime } from '../../../sim/actor';
import type { Sim } from '../../../sim/sim';
import type { Hazard } from '../../../sim/pools';
import { endComboIfLanded } from '../re_mantide/behavior';

export const PATCH_LIFE = 16;
export const MAX_PATCHES = 8;
export const PATCH_R = 2.6;
export const PATCH_R_STORM = 3.1;
/** Ground grip on ice (1/s): how fast the sliding velocity follows the player's intended velocity (normal ground ≈ 22). */
export const SLIDE_GRIP = 2.6;
export const GUST_WARN = 1.0;
export const GUST_TIME = 2.4;
export const GUST_SPEED = 1.3;
export const GUST_EVERY: [number, number] = [9, 12];
export const STALACTITE_EVERY: [number, number] = [8.5, 11];
export const STALACTITE_DELAY = 1.7;
export const GALE_SPEED = 4.2;
export const GALE_RANGE = 20;

const SLIDE_STATES = new Set(['idle', 'move', 'light', 'heavy', 'running', 'drink', 'swap']);
const FROM: [number, number, number] = [0, 0, 0];
const DROP: SpawnDef = {
  t: 0, type: 'hazard', id: 'ghiaccio_stalactite', at: 'self', from: FROM, delay: STALACTITE_DELAY, active: 0.2,
  damage_mult: 1.1, flags: ['knockdown'], element: 'ice', shape: { type: 'cylinder', c: [0, 0, 0], r: 1.8, h: 8 },
};
const tmp = { x: 0, y: 0, z: 0 };

interface Patch { h: Hazard; x: number; z: number; r: number; life: number }

/** Seconds before a breath starts when the head stops turning (the aim is locked: run out of the cone). */
export const AIM_LOCK = 0.45;

/**
 * Breath aim lock: during the last AIM_LOCK s of the wind-up of the listed tick attacks the boss stops turning, so the cone
 * starts where the head pointed at the lock (then follows only a little, track_active).
 */
export function breathAimLock(a: Actor, ids: ReadonlySet<string>): void {
  const atk = a.attack;
  if (!atk || !ids.has(atk.def.id) || atk.stage !== 'telegraph') {
    a.bstate.aimLockUid = -1;
    return;
  }
  if (atk.time < atk.def.telegraph - AIM_LOCK) return;
  if (a.bstate.aimLockUid !== atk.uid) {
    a.bstate.aimLockUid = atk.uid;
    a.bstate.aimLockYaw = a.yaw;
  }
  a.yaw = a.bstate.aimLockYaw;
}

/**
 * No flinch-lock from damage over time: a tick of a breath or of a venom puddle must not chain flinches (each tick would
 * restart the 0.4 s flinch and pin the player inside the cone/puddle). The engine flinches on every hit (request in
 * docs/requests/act5.md); until then, a flinch that started this tick while only tick damage could have landed (`tickOnly`)
 * is cancelled (the damage stays). Knockdowns are never touched. Call at the top of update() every tick.
 */
export function noTickFlinch(a: Actor, sim: Sim, tickOnly: boolean): void {
  const pl = sim.player;
  const hp = pl.hp;
  const was = a.bstate.flinchHp as number | undefined;
  a.bstate.flinchHp = hp;
  if (was === undefined || hp >= was || !tickOnly) return;
  if (pl.state === 'stagger' && pl.stateTime <= sim.dt * 1.5) pl.setState('idle');
}

/** True while the player stands in an active damage-over-time hazard of this actor. */
export function inOwnDot(a: Actor, sim: Sim): boolean {
  const p = sim.player.pos;
  let inside = false;
  sim.hazards.forEachActive((h) => {
    if (inside || h.owner !== a.id || h.tick <= 0 || h.permanent || h.age < h.delay) return;
    const r = sim.hazardRadius(h);
    if (Math.hypot(p.x - h.pos.x, p.z - h.pos.z) < r + 0.8) inside = true;
  });
  return inside;
}

const BREATHS = new Set(['frost_breath', 'blizzard_breath']);

function runtime(a: Actor, def: AttackDef): AttackRuntime {
  return {
    def, uid: nextAttackUid(), time: 0, stage: 'active', activeTime: 0, rate: 1, windows: [], spawnsDone: [], motionStart: new Map(),
    target: { ...a.pos }, targetId: -1, announced: true, willHitSent: true, activeSent: true, startYaw: a.yaw,
  };
}

/**
 * One attack, one blow for hazards a behavior drops one by one: tag the hazards of `kind` this actor spawned this tick with
 * `group` (the sim spends a whole group on the player once one of its hazards resolved against them).
 */
export function groupNewHazards(sim: Sim, a: Actor, kind: string, group: number): void {
  sim.hazards.forEachActive((h) => {
    if (h.owner === a.id && h.kind === kind && h.age === 0 && h.team === 'enemy') h.group = group;
  });
}

let groupSeq = 0;
/** A fresh hazard group id (kept far above the sim's own ids). */
export function newHazardGroup(): number {
  groupSeq = (groupSeq + 1) % 1_000_000;
  return 50_000_000 + groupSeq;
}

/** Drop one marked stalactite on a world point (delay = mark time); `group` makes several drops one blow. */
export function dropStalactite(a: Actor, sim: Sim, x: number, z: number, delay = STALACTITE_DELAY, group = -1): void {
  const def = a.attackMap.get('stalactite_drop');
  if (!def) return;
  worldToLocal(a.pos, a.yaw, { x, y: a.pos.y, z }, tmp, a.scale);
  FROM[0] = tmp.x;
  FROM[2] = tmp.z;
  DROP.delay = delay;
  const rt: AttackRuntime = a.bstate.dropRt ?? (a.bstate.dropRt = runtime(a, def));
  rt.uid = nextAttackUid();
  rt.target = { ...sim.player.pos };
  sim.bossSpawn(a, rt, DROP);
  if (group >= 0) groupNewHazards(sim, a, 'ghiaccio_stalactite', group);
}

/** Lay one icy patch (non-damaging static hazard) at a world point. */
export function layIce(a: Actor, sim: Sim, x: number, z: number, r: number): void {
  const patches = a.bstate.patches as Patch[];
  while (patches.length >= MAX_PATCHES) melt(patches.shift()!);
  const y = sim.groundAt(x, z);
  const h = sim.addStaticHazard('ghiaccio_ice', { type: 'cylinder', c: [x, y - 0.1, z], r, h: 0.4 }, 0);
  // drawn as ground ice, never deals damage (and the bot's threat model ignores it: it has no active window)
  h.hitOnce.add(-1);
  h.lastHit.set(-1, Number.POSITIVE_INFINITY);
  h.damage = 0;
  patches.push({ h, x, z, r, life: PATCH_LIFE });
}

function melt(p: Patch): void {
  p.h.active = false;
}

/** Is the player standing on ice? */
export function onIce(a: Actor, sim: Sim): boolean {
  const pl = sim.player.pos;
  for (const p of a.bstate.patches as Patch[]) if (Math.hypot(pl.x - p.x, pl.z - p.z) < p.r + 0.15) return true;
  return false;
}

function slide(a: Actor, sim: Sim, dt: number): void {
  const pl = sim.player;
  const sv = a.bstate.slide as { x: number; z: number };
  if (pl.grounded && SLIDE_STATES.has(pl.state) && onIce(a, sim)) {
    const k = 1 - Math.exp(-SLIDE_GRIP * dt);
    sv.x += (pl.vel.x - sv.x) * k;
    sv.z += (pl.vel.z - sv.z) * k;
    sim.pushPlayer((sv.x - pl.vel.x) * dt, (sv.z - pl.vel.z) * dt);
    a.bstate.sliding = true;
  } else {
    sv.x = pl.vel.x;
    sv.z = pl.vel.z;
    a.bstate.sliding = false;
  }
}

function busy(a: Actor): boolean {
  return a.state === 'attack' || a.state === 'transition' || a.state === 'spezzato' || a.state === 'dead' || a.state === 'intro';
}

function storm(a: Actor, sim: Sim, dt: number): void {
  const st = a.bstate;
  const pl = sim.player;
  // gusts: warn (cue with the wind direction), then push
  st.gustT -= dt;
  if (st.gustPhase === 'idle' && st.gustT <= 0) {
    const ang = sim.rng.range(-Math.PI, Math.PI);
    st.gustX = Math.sin(ang);
    st.gustZ = Math.cos(ang);
    st.gustPhase = 'warn';
    st.gustT = GUST_WARN;
    sim.emit({ type: 'cue', id: 'ghiaccio_gust', pos: { x: st.gustX, y: 0, z: st.gustZ }, actor: a.id });
  } else if (st.gustPhase === 'warn' && st.gustT <= 0) {
    st.gustPhase = 'blow';
    st.gustT = GUST_TIME;
  } else if (st.gustPhase === 'blow') {
    if (pl.state !== 'dead' && pl.state !== 'grace') sim.pushPlayer(st.gustX * GUST_SPEED * dt, st.gustZ * GUST_SPEED * dt);
    if (st.gustT <= 0) {
      st.gustPhase = 'idle';
      st.gustT = sim.rng.range(GUST_EVERY[0], GUST_EVERY[1]);
    }
  }
  // ambient stalactite on the player, never while the dragon winds up or strikes; its next blow waits for the fall
  st.dropT -= dt;
  if (st.dropT <= 0 && !busy(a) && pl.state !== 'dead') {
    dropStalactite(a, sim, pl.pos.x, pl.pos.z);
    a.idleTimer = Math.max(a.idleTimer, STALACTITE_DELAY + 0.3);
    st.dropT = sim.rng.range(STALACTITE_EVERY[0], STALACTITE_EVERY[1]);
  }
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.patches = [] as Patch[];
    a.bstate.slide = { x: 0, z: 0 };
    a.bstate.sliding = false;
    a.bstate.gustPhase = 'idle';
    a.bstate.gustT = 4;
    a.bstate.dropT = 5;
    a.bstate.galeT = 0;
  },
  update(a: Actor, sim: Sim, dt: number) {
    const st = a.bstate;
    const patches = st.patches as Patch[];
    for (let i = patches.length - 1; i >= 0; i--) {
      patches[i].life -= dt;
      if (patches[i].life <= 0 || !patches[i].h.active) {
        melt(patches[i]);
        patches.splice(i, 1);
      }
    }
    if (!a.alive || !sim.fight?.active || sim.fight.intro) return false;
    const atk = a.attack;
    noTickFlinch(a, sim, !!atk && BREATHS.has(atk.def.id) && atk.stage === 'active');
    breathAimLock(a, BREATHS);
    slide(a, sim, dt);
    if (st.galeT > 0) {
      st.galeT -= dt;
      const pl = sim.player;
      const dx = pl.pos.x - a.pos.x, dz = pl.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1 && d < GALE_RANGE && pl.state !== 'dead' && pl.state !== 'grace') {
        const k = GALE_SPEED * (1 - d / GALE_RANGE) * dt;
        sim.pushPlayer((dx / d) * k, (dz / d) * k);
      }
    }
    if (a.flags.has('storm') && a.state !== 'transition') storm(a, sim, dt);
    return false;
  },
  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase !== 1) return;
    a.bstate.gustT = 3.5;
    a.bstate.dropT = 6;
    sim.emit({ type: 'cue', id: 'ghiaccio_storm', pos: { ...a.pos }, actor: a.id });
  },
  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, atk: AttackRuntime | null) {
    const pl = sim.player.pos;
    if (event === 'ice_trail' && atk) {
      const k = Math.min(1, atk.activeTime / Math.max(0.1, atk.def.active));
      const d = 5 + k * 9;
      const r = a.flags.has('storm') ? PATCH_R_STORM : PATCH_R;
      layIce(a, sim, a.pos.x + Math.sin(a.yaw) * d, a.pos.z + Math.cos(a.yaw) * d, r);
    } else if (event === 'stalactites') {
      const g = newHazardGroup();
      dropStalactite(a, sim, pl.x, pl.z, STALACTITE_DELAY, g);
      for (let i = 0; i < 4; i++) {
        const p = sim.randomArenaPoint(5, sim.player.pos);
        if (Math.hypot(p.x - pl.x, p.z - pl.z) < 5) continue;
        dropStalactite(a, sim, p.x, p.z, STALACTITE_DELAY + 0.2 * i, g);
      }
    } else if (event === 'gale' && atk) {
      a.bstate.galeT = atk.def.active;
    } else if (event === 'ice_cage') {
      // gap on the side away from the dragon
      const away = Math.atan2(pl.x - a.pos.x, pl.z - a.pos.z);
      const g = newHazardGroup();
      for (let i = 1; i < 8; i++) {
        const ang = away + (i / 8) * Math.PI * 2;
        dropStalactite(a, sim, pl.x + Math.sin(ang) * 4.4, pl.z + Math.cos(ang) * 4.4, 1.6, g);
      }
      dropStalactite(a, sim, pl.x, pl.z, 1.6, g);
    }
  },
  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    a.bstate.galeT = 0;
    // a landed claw (or the NG+ tail return) ends the chain: no stun-lock
    endComboIfLanded(a, sim, atk);
  },
  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    // the tail sweeps only answer a player beside or behind it
    if (def.id === 'tail_sweep' || def.id === 'ng_tail_return') return Math.abs(a.relativeAngle(sim.player.pos)) > Math.PI * 0.4;
    return true;
  },
  onDeath(a: Actor) {
    for (const p of a.bstate.patches as Patch[]) melt(p);
    (a.bstate.patches as Patch[]).length = 0;
  },
}));

