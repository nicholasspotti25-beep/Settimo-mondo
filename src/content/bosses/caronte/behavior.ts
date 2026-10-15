/**
 * Caronte — the ferryman of the River of Souls.
 *
 * Stages (flags): 'boat' (fight on his black boat moored at the dock) -> 'bridge' (at 78% Health the scripted `raise_bridge`:
 * drowned souls rise into a bridge from the prow to a landing; he waits on the landing and keeps to it) -> 'current' (phase 2:
 * the boat sinks, the bridge dissolves, the duel continues on the luminous current, which drifts the player downstream).
 * `afloat` = boat or bridge. `drowning_lunge` hides him under the current (custom events sink/rise around the teleport).
 * Souls follow the time of day through data (spawn_mult / projectile_speed_mult).
 * Deterministic: sim.rng only.
 */
import { clamp, dist2D, forward, turnToward, v3, yawTo } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Health fraction at which the bridge of souls rises. */
export const BRIDGE_AT = 0.78;
/** Arena-local positions (x, z) of the boat prow and of the bridge landing. */
export const BOAT_SPOT: [number, number] = [0, -17];
export const LANDING: [number, number] = [0, 20.5];
export const LANDING_RADIUS = 6.5;
/** Drift of the luminous current (m/s, toward +z: the river runs to the Porta di Dite). */
export const CURRENT_DRIFT = 0.85;

const TMP = v3();

interface CaronteState {
  stage: 'boat' | 'bridge' | 'current';
  bridgePending: boolean;
  /** Glide from the boat to the landing during `raise_bridge`. */
  glide: { fx: number; fz: number; tx: number; tz: number } | null;
}

function st(a: Actor): CaronteState {
  return a.bstate as CaronteState;
}

function local(sim: Sim, lx: number, lz: number): { x: number; z: number } {
  const c = sim.arenaCenter();
  return { x: c.x + lx, z: c.z + lz };
}

export function stageOf(a: Actor): 'boat' | 'bridge' | 'current' {
  return st(a).stage;
}

function setStage(a: Actor, stage: CaronteState['stage']): void {
  st(a).stage = stage;
  a.flags.delete('boat');
  a.flags.delete('bridge');
  a.flags.delete('current');
  a.flags.add(stage);
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    a.bstate = { stage: 'boat', bridgePending: false, glide: null } satisfies CaronteState;
    setStage(a, 'boat');
    // he waits at the prow of his boat, facing the dock
    const p = local(sim, BOAT_SPOT[0], BOAT_SPOT[1]);
    a.pos.x = p.x;
    a.pos.z = p.z;
    a.yaw = yawTo(a.pos, sim.player.pos);
  },

  update(a: Actor, sim: Sim, dt: number) {
    const s = st(a);
    // the bridge rises once he is below 78% (as soon as he is free to act)
    if (s.stage === 'boat' && !s.bridgePending && a.hpFrac <= BRIDGE_AT && a.phaseIndex === 0 && a.alive) s.bridgePending = true;
    if (s.bridgePending && (a.state === 'idle' || a.state === 'move' || (a.state === 'attack' && a.attack?.stage === 'recovery'))) {
      s.bridgePending = false;
      const def = a.attackMap.get('raise_bridge');
      if (def) {
        a.cancelAttack(sim);
        a.startAttack(sim, def);
      }
    }
    // glide to the landing while the bridge forms
    if (s.glide && a.attack?.def.id === 'raise_bridge') {
      const k = clamp((a.attack.activeTime - 0.3) / 1.6, 0, 1);
      const e = k * k * (3 - 2 * k);
      a.pos.x = s.glide.fx + (s.glide.tx - s.glide.fx) * e;
      a.pos.z = s.glide.fz + (s.glide.tz - s.glide.fz) * e;
      a.moveSpeedNow = k > 0 && k < 1 ? 8 : 0;
      if (k >= 1) s.glide = null;
    } else if (s.glide && a.attack?.def.id !== 'raise_bridge') {
      a.pos.x = s.glide.tx;
      a.pos.z = s.glide.tz;
      s.glide = null;
    }
    // the luminous current drifts the player downstream
    if (s.stage === 'current' && a.alive && sim.fight?.active && !sim.seq.running) {
      const pl = sim.player;
      if (pl.state !== 'dead' && pl.state !== 'grace' && pl.grounded) sim.pushPlayer(0, CURRENT_DRIFT * dt);
    }
    return false;
  },

  movement(a: Actor, sim: Sim, dt: number): boolean {
    const s = st(a);
    if (s.stage !== 'bridge') return false;
    // on the bridge stage he keeps to the landing, turning to face whoever crosses
    const t = sim.player.pos;
    const L = local(sim, LANDING[0], LANDING[1]);
    a.strafeTimer -= dt;
    if (a.strafeTimer <= 0) {
      a.strafeDir = sim.rng.chance(0.5) ? 1 : -1;
      a.strafeTimer = sim.rng.range(1.6, 3.2);
    }
    const d = dist2D(a.pos, t);
    // drift toward the bridge mouth when the player is far, back to the middle when close
    const ahead = clamp((d - 6) / 10, 0, 1);
    const toP = yawTo(L as never, t);
    const wantX = L.x + Math.sin(toP) * LANDING_RADIUS * 0.75 * ahead;
    const wantZ = L.z + Math.cos(toP) * LANDING_RADIUS * 0.75 * ahead;
    let mx = wantX - a.pos.x, mz = wantZ - a.pos.z;
    const md = Math.hypot(mx, mz);
    let speed = 0;
    if (md > 0.6) {
      mx /= md;
      mz /= md;
      speed = Math.min(a.def.move.walk * a.rate(sim), md / dt);
    } else if (d < 9) {
      // close duel on the landing: circle warily
      forward(yawTo(a.pos, t) + (a.strafeDir * Math.PI) / 2, TMP);
      mx = TMP.x;
      mz = TMP.z;
      speed = a.def.move.walk * 0.45 * a.rate(sim);
    }
    a.pos.x += mx * speed * dt;
    a.pos.z += mz * speed * dt;
    // never leave the landing
    const ox = a.pos.x - L.x, oz = a.pos.z - L.z;
    const od = Math.hypot(ox, oz);
    if (od > LANDING_RADIUS) {
      a.pos.x = L.x + (ox / od) * LANDING_RADIUS;
      a.pos.z = L.z + (oz / od) * LANDING_RADIUS;
    }
    a.yaw = turnToward(a.yaw, yawTo(a.pos, t), a.def.move.turn * dt);
    a.moveSpeedNow = speed;
    a.state = speed > 0.05 ? 'move' : 'idle';
    a.anim = speed > 0.05 ? 'walk' : 'idle';
    a.animStage = a.state === 'move' ? 'move' : 'idle';
    a.animTime += dt;
    a.updateHover(sim, dt);
    sim.clampActor(a);
    return true;
  },

  canUseAttack(a: Actor, _sim: Sim, def: AttackDef): boolean {
    const s = st(a).stage;
    switch (def.requires) {
      case 'boat': return s === 'boat';
      case 'bridge': return s === 'bridge';
      case 'current': return s === 'current';
      case 'afloat': return s === 'boat' || s === 'bridge';
      default: return true;
    }
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    const s = st(a);
    switch (event) {
      case 'raise_bridge': {
        sim.setArenaVariant('soul_bridge');
        setStage(a, 'bridge');
        const L = local(sim, LANDING[0], LANDING[1]);
        s.glide = { fx: a.pos.x, fz: a.pos.z, tx: L.x, tz: L.z };
        a.noCollide = true;
        sim.emit({ type: 'cue', id: 'caronte_bridge_rises', actor: a.id, pos: { ...a.pos } });
        break;
      }
      case 'sink':
        a.hidden = true;
        a.untargetable = true;
        sim.emit({ type: 'cue', id: 'caronte_sinks', actor: a.id, pos: { ...a.pos } });
        break;
      case 'rise':
        a.hidden = false;
        a.untargetable = false;
        sim.emit({ type: 'cue', id: 'caronte_rises', actor: a.id, pos: { ...a.pos } });
        break;
      default:
        break;
    }
  },

  onAttackEnd(a: Actor) {
    // safety: never stay hidden or ghostly after an attack (cancelled lunges, Spezzato, phase changes)
    a.hidden = false;
    a.untargetable = false;
    a.noCollide = false;
  },

  onPhaseEnter(a: Actor, sim: Sim, _index: number, def) {
    if (def.id !== 'p2') return;
    const s = st(a);
    s.bridgePending = false;
    s.glide = null;
    a.hidden = false;
    a.untargetable = false;
    a.noCollide = false;
    setStage(a, 'current');
    sim.emit({ type: 'cue', id: 'caronte_boat_sinks', actor: a.id, pos: { ...a.pos } });
  },

  onDeath(a: Actor, sim: Sim) {
    a.hidden = false;
    sim.emit({ type: 'cue', id: 'caronte_lantern_dims', actor: a.id, pos: { ...a.pos } });
  },
}));
