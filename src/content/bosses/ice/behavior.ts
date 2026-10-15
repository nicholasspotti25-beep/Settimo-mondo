/**
 * Ice, il Cavaliere di Ghiaccio (10) — the precision duelist.
 *
 *  - Light-attack spam is punished: light hits landing in a quick chain (each within ICE_CHAIN_GAP of the previous one) are
 *    counted per swing; the ICE_SPAM-th hit of a chain is turned aside (no damage, no Equilibrio) and answered by a riposte.
 *    After two chained light hits his blade glints (flag 'riposte_ready') so the player can read the danger. Heavy blows,
 *    jumping and running attacks and Transizioni reset the chain; Arts and projectiles are never parried.
 *  - En Garde: while the stance is active any melee blow from the front is parried and answered.
 *  - Phase 2: four ice mirrors rise around the lake (arena colliders + presentation state in bstate.mirrors). He steps into
 *    his reflection (hidden, untargetable) and re-emerges from the mirror nearest to the player, which glows first; the
 *    mirrors also throw shards of ice from their own angles.
 * Deterministic: positions come from sim state and sim.rng only.
 */
import { DEG, angleDiff, dist2D, v3, worldToLocal, yawTo } from '../../../core/math';
import type { AttackDef, SpawnDef } from '../../../core/types';
import type { Actor, AttackRuntime, PartRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';
import type { DamageEvent } from '../../../sim/types';

/** Seconds between two light hits that still count as the same chain. */
export const ICE_CHAIN_GAP = 1.45;
/** The light hit of a chain that gets parried. */
export const ICE_SPAM = 4;
/** Mirror ring radius from the arena center (m). */
export const ICE_MIRROR_RING = 13.5;
export const ICE_MIRROR_COUNT = 4;

export interface IceMirror {
  x: number;
  z: number;
  yaw: number;
  /** Seconds of glow left (the exit mirror or a volley). */
  glow: number;
}

const MELEE = new Set(['light', 'heavy', 'running', 'jumping', 'transizione', 'counter']);
const FRONT = new Set(['lunge', 'flurry', 'cut_sweep', 'frost_breath', 'en_garde']);
const MIRROR_ATTACKS = new Set(['mirror_step', 'mirror_step_again', 'mirror_volley', 'ng_mirror_storm']);
const tmp = v3();
const SHARD_FROM: [number, number, number] = [0, 2.6, 0];
const SHARD: SpawnDef = { t: 0, type: 'projectile', id: 'ice_crystal', count: 1, speed: 24, from: SHARD_FROM, damage_mult: 0.75 };

function canParry(a: Actor): boolean {
  if (!a.alive || a.hidden) return false;
  switch (a.state) {
    case 'idle':
    case 'move':
      return true;
    case 'attack': {
      const atk = a.attack;
      if (!atk) return true;
      if (atk.def.id === 'riposte') return false;
      if (atk.def.id === 'en_garde') return atk.stage !== 'recovery';
      if (atk.stage === 'telegraph') return true;
      if (atk.stage === 'recovery') {
        // early recovery is the punish window: only the late part can turn a blade aside
        const k = (atk.activeTime - atk.def.active) / Math.max(0.01, atk.def.recovery);
        return k > 0.4;
      }
      return false;
    }
    default:
      return false;
  }
}

function parry(a: Actor, sim: Sim, dmg: DamageEvent): void {
  dmg.amount = 0;
  dmg.poise = 0;
  a.bstate.pendingParry = true;
  a.bstate.chain = 0;
  a.bstate.parries = (a.bstate.parries ?? 0) + 1;
  sim.emit({ type: 'cue', id: 'ice_parry', pos: { ...dmg.pos }, actor: a.id });
  sim.emit({ type: 'vfx', id: 'ice_parry_spark', pos: { ...dmg.pos } });
  sim.emit({ type: 'sfx', id: 'rapier_parry', pos: { ...dmg.pos } });
  sim.emit({ type: 'hitstop', dur: 0.08 });
}

/** Raise the four mirrors around the lake (once per fight). */
export function raiseMirrors(a: Actor, sim: Sim): void {
  const mirrors: IceMirror[] = a.bstate.mirrors ?? (a.bstate.mirrors = []);
  if (mirrors.length) return;
  const c = sim.arenaCenter();
  const base = yawTo(c, sim.player.pos) + 45 * DEG;
  for (let i = 0; i < ICE_MIRROR_COUNT; i++) {
    const ang = base + (i / ICE_MIRROR_COUNT) * Math.PI * 2;
    const x = c.x + Math.sin(ang) * ICE_MIRROR_RING;
    const z = c.z + Math.cos(ang) * ICE_MIRROR_RING;
    const m: IceMirror = { x, z, yaw: ang + Math.PI, glow: 0.8 };
    mirrors.push(m);
    sim.addArenaCollider(`ice_mirror_${i}`, { type: 'cylinder', c: [x, c.y, z], r: 1.15, h: 5.5 });
    sim.emit({ type: 'vfx', id: 'ice_mirror_rise', pos: { x, y: c.y, z }, params: { index: i } });
  }
  sim.emit({ type: 'cue', id: 'ice_mirrors', actor: a.id });
  sim.emit({ type: 'shake', strength: 0.35, dur: 0.8 });
}

/** Index of the mirror he will step out of: the one nearest to the player, at least 4.5 m from the player. */
export function exitMirror(mirrors: IceMirror[], px: number, pz: number): number {
  let best = -1, bd = Infinity, far = -1, fd = -1;
  mirrors.forEach((m, i) => {
    const d = Math.hypot(m.x - px, m.z - pz);
    if (d >= 4.5 && d < bd) {
      bd = d;
      best = i;
    }
    if (d > fd) {
      fd = d;
      far = i;
    }
  });
  return best >= 0 ? best : far;
}

function unhide(a: Actor): void {
  a.hidden = false;
  a.untargetable = false;
  a.noCollide = false;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.chain = 0;
    a.bstate.lastLight = -99;
    a.bstate.lastInstance = -1;
    a.bstate.pendingParry = false;
    a.bstate.parries = 0;
    a.bstate.mirrors = [];
    a.bstate.exit = -1;
  },

  update(a: Actor, sim: Sim, dt: number) {
    const pl = sim.player;
    if (a.bstate.pendingParry) {
      a.bstate.pendingParry = false;
      const def = a.attackMap.get('riposte');
      if (def && a.alive && a.state !== 'spezzato' && a.state !== 'transition' && a.state !== 'stagger') {
        if (pl.state !== 'dead' && pl.state !== 'knockdown' && pl.state !== 'grace') {
          pl.cancelSwing();
          pl.setState('stagger', 0.22);
        }
        if (a.attack) a.cancelAttack(sim);
        a.setState('idle');
        a.yaw = yawTo(a.pos, pl.pos);
        a.startAttack(sim, def);
      }
    }
    // presentation: the blade glints once a chain is dangerous; the guard shines while En Garde is up
    const chainLive = sim.time - a.bstate.lastLight <= ICE_CHAIN_GAP;
    if (!chainLive) a.bstate.chain = 0;
    if (a.bstate.chain >= ICE_SPAM - 2 && chainLive) a.flags.add('riposte_ready');
    else a.flags.delete('riposte_ready');
    if (a.attack?.def.id === 'en_garde' && a.attack.stage === 'active') a.flags.add('en_garde');
    else a.flags.delete('en_garde');
    const mirrors: IceMirror[] = a.bstate.mirrors;
    for (const m of mirrors) if (m.glow > 0) m.glow = Math.max(0, m.glow - dt);
    return false;
  },

  modifyIncoming(a: Actor, sim: Sim, dmg: DamageEvent, _part: PartRuntime | null, fromFront: boolean) {
    if (dmg.source !== -1 || !dmg.kind || !MELEE.has(dmg.kind)) return;
    const can = canParry(a) && fromFront;
    // En Garde turns aside any melee blow from the front
    if (can && a.attack?.def.id === 'en_garde' && a.attack.stage === 'active') {
      parry(a, sim, dmg);
      return;
    }
    if (dmg.kind !== 'light') {
      // varied play breaks the rhythm he is waiting for
      if (dmg.instance !== a.bstate.lastInstance) a.bstate.chain = 0;
      a.bstate.lastInstance = dmg.instance;
      return;
    }
    if (dmg.instance === a.bstate.lastInstance) return; // same swing (multi-hit weapons count once)
    a.bstate.lastInstance = dmg.instance;
    a.bstate.chain = sim.time - a.bstate.lastLight <= ICE_CHAIN_GAP ? a.bstate.chain + 1 : 1;
    a.bstate.lastLight = sim.time;
    if (a.bstate.chain >= ICE_SPAM && can) parry(a, sim, dmg);
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (MIRROR_ATTACKS.has(def.id)) return (a.bstate.mirrors as IceMirror[]).length > 0;
    if (def.id === 'mirror_summon') return (a.bstate.mirrors as IceMirror[]).length === 0;
    if (FRONT.has(def.id)) return Math.abs(angleDiff(a.yaw, yawTo(a.pos, sim.player.pos))) < 75 * DEG;
    return true;
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase >= 1) {
      sim.emit({ type: 'vfx', id: 'ice_breath_cloud', pos: { x: a.pos.x, y: a.pos.y + 4, z: a.pos.z } });
      sim.emit({ type: 'cue', id: 'ice_phase2', actor: a.id });
    }
  },

  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, atk: AttackRuntime | null) {
    const mirrors: IceMirror[] = a.bstate.mirrors;
    const pl = sim.player;
    if (event === 'raise_mirrors') {
      raiseMirrors(a, sim);
    } else if (event === 'mirror_enter') {
      if (!mirrors.length) return;
      const i = exitMirror(mirrors, pl.pos.x, pl.pos.z);
      a.bstate.exit = i;
      const m = mirrors[i];
      m.glow = 1.0;
      sim.emit({ type: 'vfx', id: 'ice_shatter_out', pos: { x: a.pos.x, y: a.pos.y + 2.4, z: a.pos.z } });
      sim.emit({ type: 'cue', id: `ice_mirror_glow:${i}`, pos: { x: m.x, y: a.pos.y, z: m.z }, actor: a.id });
      a.hidden = true;
      a.untargetable = true;
      a.noCollide = true;
      // wait inside the exit mirror, already facing the player (the hit is predicted from here)
      const d = Math.max(1e-3, Math.hypot(pl.pos.x - m.x, pl.pos.z - m.z));
      a.pos.x = m.x + ((pl.pos.x - m.x) / d) * 1.7;
      a.pos.z = m.z + ((pl.pos.z - m.z) / d) * 1.7;
      a.pos.y = sim.groundAt(a.pos.x, a.pos.z);
      a.prevPos.x = a.pos.x; a.prevPos.y = a.pos.y; a.prevPos.z = a.pos.z;
      a.yaw = yawTo(a.pos, pl.pos);
    } else if (event === 'mirror_exit') {
      unhide(a);
      a.yaw = yawTo(a.pos, pl.pos);
      const i = a.bstate.exit as number;
      const m = mirrors[i];
      if (m) sim.emit({ type: 'vfx', id: 'ice_mirror_burst', pos: { x: m.x, y: a.pos.y + 2.4, z: m.z } });
      sim.emit({ type: 'sfx', id: 'ice_emerge', pos: { ...a.pos } });
    } else if (event === 'mirror_volley' && atk) {
      mirrors.forEach((m) => {
        // a mirror right next to the player stays silent: every shard must travel far enough to be read
        if (Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z) < 6) return;
        m.glow = 0.6;
        tmp.x = m.x; tmp.y = a.pos.y; tmp.z = m.z;
        worldToLocal(a.pos, a.yaw, tmp, tmp);
        // spawn just in front of the mirror surface, toward the player
        SHARD_FROM[0] = tmp.x;
        SHARD_FROM[2] = tmp.z;
        sim.bossSpawn(a, atk, SHARD);
      });
    }
  },

  onAttackEnd(a: Actor) {
    if (a.hidden) unhide(a);
  },

  onDeath(a: Actor, sim: Sim) {
    const mirrors: IceMirror[] = a.bstate.mirrors;
    mirrors.forEach((m, i) => {
      sim.removeArenaCollider(`ice_mirror_${i}`);
      sim.emit({ type: 'vfx', id: 'ice_mirror_shatter', pos: { x: m.x, y: a.pos.y + 2, z: m.z } });
    });
    a.bstate.mirrors = [];
  },
}));

/** Distance helper for tests/bot: is the player near enough to be struck by a mirror exit? */
export function nearestMirrorDistance(a: Actor, sim: Sim): number {
  const mirrors: IceMirror[] = a.bstate.mirrors ?? [];
  let best = Infinity;
  for (const m of mirrors) best = Math.min(best, dist2D(sim.player.pos, { x: m.x, y: 0, z: m.z }));
  return best;
}
