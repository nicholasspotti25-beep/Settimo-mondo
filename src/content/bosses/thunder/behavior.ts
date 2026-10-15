/**
 * Thunder, il Cavaliere di Fulmini (9). Phase 2 "dance among discharges": besides his own attacks, the storm he called keeps
 * striking marked ground around the arena every couple of seconds. Ambient strikes always telegraph (1.25 s mark) and are
 * never placed within 5 m of the player when they are called, so they shape the movement instead of ambushing it.
 * Deterministic: positions and rhythm come from sim.rng.
 */
import { DEG, angleDiff, worldToLocal, v3, yawTo } from '../../../core/math';
import type { AttackDef, SpawnDef } from '../../../core/types';
import { nextAttackUid, type Actor, type AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

const STRIKE_FROM: [number, number, number] = [0, 0, 0];
const STRIKE: SpawnDef = {
  t: 0, type: 'hazard', id: 'thunder_storm', at: 'self', from: STRIKE_FROM, delay: 1.25, active: 0.2, damage_mult: 0.8,
  shape: { type: 'cylinder', c: [0, 0, 0], r: 2.2, h: 30 },
};
const FRONT = new Set(['hammer_sweep', 'overhead_smash', 'chain_bolts']);
const tmp = v3();

function ambientRuntime(a: Actor, def: AttackDef): AttackRuntime {
  return {
    def, uid: nextAttackUid(), time: 0, stage: 'active', activeTime: 0, rate: 1, windows: [], spawnsDone: [], motionStart: new Map(),
    target: { ...a.pos }, targetId: -1, announced: true, willHitSent: true, activeSent: true, startYaw: a.yaw,
  };
}

/** Call one ambient strike on a random arena point at least `minDist` from the player. */
export function thunderAmbientStrike(a: Actor, sim: Sim): boolean {
  const def = a.attackMap.get('storm_ambient');
  if (!def) return false;
  const p = sim.randomArenaPoint(5, sim.player.pos);
  if (Math.hypot(p.x - sim.player.pos.x, p.z - sim.player.pos.z) < 5) return false;
  worldToLocal(a.pos, a.yaw, p, tmp);
  STRIKE_FROM[0] = tmp.x;
  STRIKE_FROM[2] = tmp.z;
  const rt: AttackRuntime = a.bstate.ambient ?? (a.bstate.ambient = ambientRuntime(a, def));
  rt.uid = nextAttackUid();
  sim.bossSpawn(a, rt, STRIKE);
  return true;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.stormT = 0;
  },
  update(a: Actor, sim: Sim, dt: number) {
    if (!a.flags.has('storm') || !a.alive || a.state === 'transition' || a.state === 'dead' || !sim.fight?.active || sim.fight.intro) return false;
    a.bstate.stormT -= dt;
    if (a.bstate.stormT <= 0) {
      // one or two strikes, every 1.9-3.0 s
      const n = sim.rng.chance(0.4) ? 2 : 1;
      for (let i = 0; i < n; i++) thunderAmbientStrike(a, sim);
      a.bstate.stormT = sim.rng.range(1.9, 3.0);
    }
    return false;
  },
  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase >= 1) {
      a.bstate.stormT = 3.5;
      sim.emit({ type: 'cue', id: 'storm_rain', actor: a.id });
      sim.emit({ type: 'shake', strength: 0.45, dur: 1.0 });
    }
  },
  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (FRONT.has(def.id)) return Math.abs(angleDiff(a.yaw, yawTo(a.pos, sim.player.pos))) < 80 * DEG;
    return true;
  },
}));
