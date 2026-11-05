/**
 * Verme Mangiamondi (35), mini boss. It does not walk: it dives (`burrow`: hidden, untargetable, invulnerable) and erupts
 * (`emerge`) at the spot its data hazard marked. It eats the rim of the arena at SWALLOW_AT Health fractions (swallow_1/2/3:
 * the band is marked for 1.6 s, then sim.setArenaVariant shrinks the circle and it re-emerges at the new rim, away from
 * you). Phase 2 splits the body into SEGMENTS millstones (minions `macina`); one blow at a time between head and stones.
 * Deterministic: no randomness here.
 */
import type { AttackDef, PhaseDef, SpawnDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export const SWALLOW_AT = [0.82, 0.62, 0.3];
export const SWALLOW_RADIUS = [29, 25, 21];
export const SEGMENT_ID = 'macina';
export const SEGMENTS = 3;

/** Living millstones of this worm. */
export function segmentsOf(a: Actor, sim: Sim): Actor[] {
  return sim.actors.filter((o) => o !== a && o.alive && o.ownerId === a.id && o.defId === SEGMENT_ID);
}

/** True while any enemy other than `self` is winding up or striking (one blow at a time). */
export function otherEnemyStriking(sim: Sim, self: Actor): boolean {
  for (const o of sim.actors) {
    if (o === self || !o.alive || o.team !== 'enemy') continue;
    if (o.attack && o.attack.stage !== 'recovery') return true;
  }
  return false;
}

function surface(a: Actor, sim: Sim, x: number, z: number): void {
  a.pos.x = x; a.pos.z = z;
  a.pos.y = sim.groundAt(x, z);
  a.prevPos.x = x; a.prevPos.y = a.pos.y; a.prevPos.z = z;
  a.hidden = false;
  a.untargetable = false;
  a.invulnerable = false;
  a.flags.delete('burrowed');
  sim.clampActor(a);
  sim.emit({ type: 'cue', id: 'verme_emerge', actor: a.id, pos: { ...a.pos } });
  sim.emit({ type: 'shake', strength: 0.45, dur: 0.6 });
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.swallowed = 0;
    a.bstate.split = false;
  },

  update(a: Actor, sim: Sim) {
    const n = a.bstate.swallowed as number;
    if (n < SWALLOW_AT.length && a.hpFrac <= SWALLOW_AT[n] && (a.state === 'idle' || a.state === 'move') && !otherEnemyStriking(sim, a)) {
      const def = a.attackMap.get(`swallow_${n + 1}`);
      if (def) {
        a.bstate.swallowed = n + 1;
        a.startAttack(sim, def);
      }
    }
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.id.startsWith('swallow_')) return false;
    return !otherEnemyStriking(sim, a);
  },

  onPhaseEnter(a: Actor, sim: Sim, _i: number, ph: PhaseDef) {
    if (ph.id !== 'p2' || a.bstate.split) return;
    a.bstate.split = true;
    const md = a.boss.minions?.find((m) => m.id === SEGMENT_ID);
    if (!md) return;
    for (let i = 0; i < SEGMENTS; i++) {
      const ang = a.yaw + Math.PI + ((i - 1) * Math.PI) / 3;
      const m = sim.spawnMinion(md, { x: a.pos.x + Math.sin(ang) * 8, y: a.pos.y, z: a.pos.z + Math.cos(ang) * 8 }, a, -1);
      m.idleTimer = 2.2 + i * 1.6;
    }
    sim.emit({ type: 'cue', id: 'verme_split', actor: a.id, pos: { ...a.pos } });
  },

  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, _atk: AttackRuntime | null) {
    if (event === 'burrow') {
      a.hidden = true;
      a.untargetable = true;
      a.invulnerable = true;
      a.flags.add('burrowed');
      sim.emit({ type: 'cue', id: 'verme_burrow', actor: a.id, pos: { ...a.pos } });
      return;
    }
    if (event === 'emerge') {
      // erupt at the newest eruption mark this worm laid
      let best = -1, bx = a.pos.x, bz = a.pos.z;
      sim.hazards.forEachActive((h) => {
        if (h.owner === a.id && h.kind === 'verme_erupt' && h.id > best) {
          best = h.id; bx = h.pos.x; bz = h.pos.z;
        }
      });
      surface(a, sim, bx, bz);
      return;
    }
    if (event === 'swallow') {
      const n = a.bstate.swallowed as number;
      sim.setArenaVariant(`swallow_${n}`);
      sim.emit({ type: 'cue', id: 'verme_swallow', actor: a.id, pos: { ...a.pos } });
      // re-emerge at the new rim, on the far side from the player
      const ar = sim.c.arena(a.boss.arena);
      const cx = ar.center[0], cz = ar.center[2];
      const px = sim.player.pos.x - cx, pz = sim.player.pos.z - cz;
      const pl = Math.hypot(px, pz) || 1;
      const r = Math.max(6, (SWALLOW_RADIUS[n - 1] ?? 21) - 6);
      surface(a, sim, cx - (px / pl) * r, cz - (pz / pl) * r);
    }
  },

  onAttackEnd(a: Actor, sim: Sim) {
    // an interrupted dive never leaves it underground
    if (a.hidden) surface(a, sim, a.pos.x, a.pos.z);
  },
}));
