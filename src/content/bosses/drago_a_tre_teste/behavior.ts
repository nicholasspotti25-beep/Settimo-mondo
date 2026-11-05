/**
 * Drago a Tre Teste (28, mini, D15) — I Nidi.
 *
 * - Three heads (parts testa_fuoco / testa_veleno / testa_fulmine), each with its own Equilibrio bar. They strike one at
 *   a time and in turn: a head never attacks twice in a row while another head stands (canUseAttack). The head about to
 *   strike swings forward to the center and lowers (part anchors: readable, and reachable); the others rise and draw back.
 * - A head FALLS when its Equilibrio breaks (onSpezzato): it crashes to the ground (anchor down, Colpo di Grazia on it
 *   during the Spezzato) and stays down for good when the Spezzato ends (part broken: its attacks are gone). The others
 *   become enraged and faster: rate and rhythm ×(1 + RAGE_STEP × fallen heads). The first fall starts phase 2 (fury).
 * - The last head standing does not fall: its break is an ordinary Spezzato, then its bar grows ×LAST_BAR_MULT.
 * - Lightning strikes that follow you are dropped one by one (bolt events) but count as one blow (hazard group).
 * - A landed blow of a chain ends it (endComboIfLanded); the tail answers only a player beside or behind.
 */
import type { AttackDef, SpawnDef } from '../../../core/types';
import { worldToLocal } from '../../../core/math';
import { defineBehavior } from '../../../sim/behavior';
import { nextAttackUid, type Actor, type AttackRuntime, type PartRuntime } from '../../../sim/actor';
import type { Sim } from '../../../sim/sim';
import { endComboIfLanded } from '../re_mantide/behavior';
import { groupNewHazards, newHazardGroup } from '../drago_di_ghiaccio/behavior';

export const HEADS = ['testa_fuoco', 'testa_veleno', 'testa_fulmine'] as const;
export const RAGE_STEP = 0.12;
export const LAST_BAR_MULT = 1.3;
/** Anchor offsets (local, added to the rest pose): the striking head comes to the center and lowers. */
export const STRIKE_DROP = 0.9;
export const STRIKE_FORWARD = 1.3;
export const FALLEN_DROP = 2.1;
const ANCHOR_RATE = 4;

const FROM: [number, number, number] = [0, 0, 0];
const BOLT: SpawnDef = {
  t: 0, type: 'hazard', id: 'tre_teste_bolt', at: 'self', from: FROM, delay: 0.9, active: 0.25,
  shape: { type: 'cylinder', c: [0, 0, 0], r: 1.8, h: 10 },
};
const tmp = { x: 0, y: 0, z: 0 };
const tgt = { x: 0, y: 0, z: 0 };

function runtime(a: Actor, def: AttackDef): AttackRuntime {
  return {
    def, uid: nextAttackUid(), time: 0, stage: 'active', activeTime: 0, rate: 1, windows: [], spawnsDone: [], motionStart: new Map(),
    target: { ...a.pos }, targetId: -1, announced: true, willHitSent: true, activeSent: true, startYaw: a.yaw,
  };
}

export function fallenHeads(a: Actor): string[] {
  return a.bstate.fallen as string[];
}

/** Heads still able to fight (not fallen, not broken). */
export function standingHeads(a: Actor): PartRuntime[] {
  const fallen = fallenHeads(a);
  return a.parts.filter((p) => HEADS.includes(p.id as (typeof HEADS)[number]) && !p.broken && !fallen.includes(p.id));
}

function animateHeads(a: Actor, dt: number): void {
  const k = 1 - Math.exp(-ANCHOR_RATE * dt);
  const striking = a.attack?.def.part;
  const fallen = fallenHeads(a);
  for (const p of a.parts) {
    const rest = p.def.hurt[0].c;
    if (fallen.includes(p.id) || p.broken) {
      tgt.x = 0; tgt.y = -FALLEN_DROP; tgt.z = 0.6;
    } else if (p.spezzato > 0) {
      tgt.x = 0; tgt.y = -FALLEN_DROP * 0.85; tgt.z = 0.5;
    } else if (striking === p.id) {
      tgt.x = -rest[0] * 0.75; tgt.y = -STRIKE_DROP; tgt.z = STRIKE_FORWARD;
    } else if (striking) {
      tgt.x = 0; tgt.y = 0.6; tgt.z = -0.7;
    } else {
      tgt.x = 0; tgt.y = 0; tgt.z = 0;
    }
    p.anchor.x += (tgt.x - p.anchor.x) * k;
    p.anchor.y += (tgt.y - p.anchor.y) * k;
    p.anchor.z += (tgt.z - p.anchor.z) * k;
  }
}

function enrage(a: Actor): void {
  const n = fallenHeads(a).length;
  a.speedMult = 1 + RAGE_STEP * n;
  a.aggression = 1 + RAGE_STEP * n;
}

/** Drop one marked strike on the player's predicted spot (part of the attack's one-blow group). */
function dropBolt(a: Actor, sim: Sim, atk: AttackRuntime): void {
  const def = a.attackMap.get('bolt_drop');
  if (!def) return;
  const pl = sim.player;
  const lead = 0.55;
  const x = pl.pos.x + pl.vel.x * lead, z = pl.pos.z + pl.vel.z * lead;
  worldToLocal(a.pos, a.yaw, { x, y: a.pos.y, z }, tmp, a.scale);
  FROM[0] = tmp.x;
  FROM[2] = tmp.z;
  const rt: AttackRuntime = a.bstate.boltRt ?? (a.bstate.boltRt = runtime(a, def));
  rt.uid = nextAttackUid();
  rt.target = { ...pl.pos };
  sim.bossSpawn(a, rt, BOLT);
  groupNewHazards(sim, a, 'tre_teste_bolt', atk.uid === a.bstate.boltAtk ? a.bstate.boltGroup : (a.bstate.boltGroup = newHazardGroup()));
  a.bstate.boltAtk = atk.uid;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.bstate.fallen = [] as string[];
    a.bstate.falling = [] as string[];
    a.bstate.lastHead = '';
    a.bstate.boltAtk = -1;
    a.bstate.boltGroup = -1;
  },
  update(a: Actor, sim: Sim, dt: number) {
    animateHeads(a, dt);
    // a fallen head stays down once its Spezzato ends
    const falling = a.bstate.falling as string[];
    for (let i = falling.length - 1; i >= 0; i--) {
      const p = a.part(falling[i]);
      if (!p || p.spezzato > 0) continue;
      p.broken = true;
      p.active = false;
      p.poise = 0;
      falling.splice(i, 1);
      sim.emit({ type: 'partBroken', actor: a.id, part: p.id, pos: { ...p.center } });
    }
    return false;
  },
  onSpezzato(a: Actor, sim: Sim, part: PartRuntime | null) {
    if (!part || !HEADS.includes(part.id as (typeof HEADS)[number])) return;
    const fallen = fallenHeads(a);
    if (fallen.includes(part.id)) return;
    if (standingHeads(a).length <= 1) {
      // the last head does not fall: an ordinary Spezzato, then a sturdier bar
      part.poiseMax = Math.round(part.poiseMax * LAST_BAR_MULT);
      return;
    }
    fallen.push(part.id);
    (a.bstate.falling as string[]).push(part.id);
    a.flags.add(`fallen_${part.id}`);
    enrage(a);
    sim.emit({ type: 'cue', id: 'tre_teste_head_down', pos: { ...part.center }, actor: a.id });
    if (a.phaseIndex === 0) a.enterPhase(sim, 1);
  },
  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.part) {
      if (fallenHeads(a).includes(def.part)) return false;
      // heads strike in turn: not the same head twice while another stands
      if (def.part === a.bstate.lastHead && standingHeads(a).some((p) => p.id !== def.part)) return false;
    }
    if (def.id === 'tail_sweep') return Math.abs(a.relativeAngle(sim.player.pos)) > Math.PI * 0.4;
    return true;
  },
  onAttackStart(a: Actor, _sim: Sim, atk: AttackRuntime) {
    if (atk.def.part) a.bstate.lastHead = atk.def.part;
  },
  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    endComboIfLanded(a, sim, atk);
  },
  onCustomEvent(a: Actor, sim: Sim, event: string, _s: SpawnDef, atk: AttackRuntime | null) {
    if (event === 'bolt' && atk) dropBolt(a, sim, atk);
  },
}));
