/**
 * Loki (16, principal) — the Trickster of the Rocca di Brina.
 *
 *  - Always flagged `casts_shadow` (the only shadow in the hall: the player has none, the copies have none) and
 *    `illusionist` (Verità Scomoda hurts him and dissolves his copies through the engine's dispelIllusions).
 *  - Phase 1, illusions: twin_illusion spawns two copies (minion loki_copy, flagged `illusion` by its own behavior; three
 *    at night through the time-of-day spawn_mult), only when no copy is left. mirror_swap shuffles the places of Loki and
 *    his copies (he always moves): the shadow tells which one is real. One blow at a time: an illusion never strikes
 *    while Loki winds up or strikes (minion_loki_copy.ts) and Loki waits while a copy does (selectAttack).
 *  - Phase 2, the labyrinth of mirrors (arena variant mirror_maze): mirror_strike — at the start of the wind-up he slips
 *    into the mirror he will exit (hidden, untargetable and immune: flag `in_mirror`), that mirror glows (cue
 *    loki_mirror_glow, pos = the exit point); at the active start he comes out of it and cuts.
 *  - Phase 3, the ice bridges (arena variant ice_bridges): the imitations. mimic_1..3 are rebuilt from the heavy swing of
 *    the weapon the player carries in each slot (buildMimic: shape scaled to his size, telegraph >= MIMIC_TELEGRAPH_MIN,
 *    damage and poise clamped, projectile swings become mirror shots); an empty slot keeps the data fallback. The NG+
 *    ng_mimic_chain imitates the last carried weapon and chains into mimic_1.
 *  - Defeated, he laughs and vanishes (cue loki_vanish here; the defeat sequence plays loki_laugh).
 * Deterministic: the swap permutation and the mirror tie-breaks use sim.rng.
 */
import { clamp, yawTo } from '../../../core/math';
import type { AttackDef, ShapeDef, SpawnDef, Vec3T } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import { killActor } from '../../../sim/combat';
import { shapeReach } from '../../../sim/shapes';
import type { Sim } from '../../../sim/sim';

/** Loki stands ~1.75x the player's height: imitated hit shapes grow by this factor. */
export const MIMIC_SCALE = 1.35;
export const MIMIC_TELEGRAPH_MIN = 0.7;
export const MIMIC_DAMAGE: readonly [number, number] = [0.8, 1.4];
export const MIMIC_IDS = ['mimic_1', 'mimic_2', 'mimic_3'] as const;
/** The exit point is this far in front of the mirror (toward the hall's center). */
export const MIRROR_FRONT = 1.6;
const MIRROR_ATTACKS = new Set(['mirror_strike', 'ng_mirror_chain']);

export interface MirrorSlot {
  x: number;
  z: number;
}

function scaleV(v: Vec3T, k: number): Vec3T {
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** A player-local swing shape grown to Loki's size. */
export function scaleShape(s: ShapeDef, k: number): ShapeDef {
  switch (s.type) {
    case 'sphere': return { type: 'sphere', c: scaleV(s.c, k), r: s.r * k };
    case 'capsule': return { type: 'capsule', a: scaleV(s.a, k), b: scaleV(s.b, k), r: s.r * k };
    case 'arc': return { type: 'arc', r: s.r * k, r_in: s.r_in !== undefined ? s.r_in * k : undefined, angle: s.angle, yaw: s.yaw, y: s.y ? [s.y[0] * k, s.y[1] * k] : undefined, c: s.c ? scaleV(s.c, k) : undefined };
    case 'box': return { type: 'box', c: scaleV(s.c, k), half: scaleV(s.half, k), yaw: s.yaw };
    case 'ring': return { type: 'ring', r0: s.r0 * k, r1: s.r1 * k, width: s.width * k, height: s.height, c: s.c ? scaleV(s.c, k) : undefined };
    case 'cylinder': return { type: 'cylinder', c: scaleV(s.c, k), r: s.r * k, h: s.h * k };
  }
}

/**
 * Loki's imitation of a weapon: its heavy swing, retimed for fairness (a readable wind-up, a punish window, damage and
 * poise clamped). Returns null for a weapon without a usable swing.
 */
export function buildMimic(sim: Sim, weaponId: string, id: string): AttackDef | null {
  const w = sim.c.weapons.find((x) => x.id === weaponId);
  if (!w) return null;
  const sw = sim.c.swingList(w.moveset.heavy)[0];
  if (!sw) return null;
  const def: AttackDef = {
    id,
    anim: `mimic_${sw.anim}`,
    telegraph: clamp(sw.startup * 2.2, MIMIC_TELEGRAPH_MIN, 1.3),
    active: clamp(sw.active, 0.2, 0.45),
    recovery: clamp(sw.recovery * 1.6, 1.0, 1.6),
    damage_mult: clamp(sw.damage_mult * 0.85, MIMIC_DAMAGE[0], MIMIC_DAMAGE[1]),
    poise: clamp(sw.poise, 18, 28),
    flags: [],
    element: sw.element ?? w.element ?? 'physical',
    weight: 1,
    cooldown: 3,
    track: 1.2,
    track_active: 0.15,
    sfx: 'loki_mimic',
  };
  if (sw.shape) {
    const shape = scaleShape(sw.shape, MIMIC_SCALE);
    def.hits = [{ t: 0.02, dur: Math.max(0.1, Math.min(def.active - 0.02, 0.3)), shape }];
    def.range = [0, Math.max(2.5, shapeReach(shape) - 0.4)];
    if (sw.move) def.motion = [{ t: -0.05, dur: Math.min(0.4, sw.move.dur), type: 'forward', speed: Math.min(9, sw.move.speed * 1.2) }];
  } else if (sw.projectile) {
    const p = sw.projectile;
    const shot: SpawnDef = { t: 0.02, type: 'projectile', id: 'loki_mimic_shot', count: Math.min(3, p.count ?? 1), spread: p.spread ?? 14, speed: Math.min(22, p.speed), from: [0, 2.2, 0.6] };
    def.spawns = [shot];
    def.range = [4, 30];
    def.track = 1.3;
  } else return null;
  if (def.poise >= 25) def.flags.push('knockdown');
  return def;
}

/** Alive copies of this Loki. */
export function copiesOf(a: Actor, sim: Sim): Actor[] {
  return sim.actors.filter((m) => m.alive && m.ownerId === a.id && m.flags.has('illusion'));
}

/** Exit points of the mirrors of the labyrinth (from the arena variant's colliders). */
export function mirrorExits(sim: Sim): MirrorSlot[] {
  const def = sim.zone?.activeArenaDef ?? sim.c.arena('rocca_sala_trono');
  const obs = def.variants?.mirror_maze?.obstacles ?? [];
  const cx = def.center[0], cz = def.center[2];
  return obs.map((o) => {
    const dx = cx - o.c[0], dz = cz - o.c[2];
    const l = Math.hypot(dx, dz) || 1;
    return { x: o.c[0] + (dx / l) * MIRROR_FRONT, z: o.c[2] + (dz / l) * MIRROR_FRONT };
  });
}

/** The mirror he will come out of: 4–14 m from the player, preferring the player's side or back. */
export function pickMirror(sim: Sim, exits: MirrorSlot[]): number {
  const pl = sim.player;
  let best = -1, bs = -Infinity;
  exits.forEach((m, i) => {
    const d = Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z);
    const rel = Math.abs(Math.atan2(Math.sin(yawTo(pl.pos, { x: m.x, y: 0, z: m.z }) - pl.yaw), Math.cos(yawTo(pl.pos, { x: m.x, y: 0, z: m.z }) - pl.yaw)));
    const score = (d >= 4 && d <= 14 ? 10 : 0) + rel - Math.abs(d - 8) * 0.1 + sim.rng.range(0, 0.05);
    if (score > bs) { bs = score; best = i; }
  });
  return best;
}

function leaveMirror(a: Actor, sim: Sim): void {
  if (!a.flags.has('in_mirror')) return;
  a.flags.delete('in_mirror');
  a.hidden = false;
  a.untargetable = false;
  a.invulnerable = false;
  sim.emit({ type: 'cue', id: 'loki_mirror_out', actor: a.id, pos: { ...a.pos } });
  sim.emit({ type: 'vfx', id: 'mirror_burst', pos: { x: a.pos.x, y: a.pos.y + 1.6, z: a.pos.z } });
}

function shatterCopies(a: Actor, sim: Sim): void {
  for (const m of copiesOf(a, sim)) {
    sim.emit({ type: 'vfx', id: 'illusion_shatter', pos: { ...m.pos } });
    killActor(sim, m);
  }
}

/** Rebuild the imitations from the player's loadout (phase 3). */
export function rebuildMimics(a: Actor, sim: Sim): string[] {
  const used: string[] = [];
  const ws = sim.player.weapons;
  MIMIC_IDS.forEach((id, i) => {
    const w = ws[i];
    const def = w ? buildMimic(sim, w, id) : null;
    if (def) {
      a.attackMap.set(id, def);
      used.push(w!);
    } else used.push('');
  });
  const last = [...ws].reverse().find((w): w is string => !!w);
  const chain = last ? buildMimic(sim, last, 'ng_mimic_chain') : null;
  if (chain) {
    chain.recovery = 0.45;
    chain.cooldown = 12;
    chain.weight = 0.8;
    chain.combo_next = 'mimic_1';
    chain.combo_chance = 1;
    a.attackMap.set('ng_mimic_chain', chain);
  }
  a.bstate.mimic = used;
  return used;
}

export default defineBehavior(() => ({
  init(a: Actor) {
    a.flags.add('casts_shadow');
    a.flags.add('illusionist');
    a.bstate.mirror = -1;
    a.bstate.swaps = 0;
    a.bstate.illusions = 0;
    a.bstate.mimic = [] as string[];
    a.bstate.mimicNow = '';
  },

  update(a: Actor, sim: Sim) {
    // never stay inside a mirror outside of a mirror strike's wind-up
    if (a.flags.has('in_mirror') && (!a.attack || !MIRROR_ATTACKS.has(a.attack.def.id) || a.attack.stage !== 'telegraph')) leaveMirror(a, sim);
    return false;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef) {
    if (def.id === 'flourish') return false;
    if (def.id === 'twin_illusion') return copiesOf(a, sim).length === 0;
    if (def.id === 'mirror_swap') return copiesOf(a, sim).length > 0;
    if (MIRROR_ATTACKS.has(def.id)) return mirrorExits(sim).length > 0;
    return true;
  },

  selectAttack(a: Actor, sim: Sim, cands: AttackDef[]) {
    // one blow at a time: he waits while one of his copies is winding up or striking
    for (const m of copiesOf(a, sim)) if (m.attack && m.attack.stage !== 'recovery') return null;
    // the duel with illusions opens with the illusions
    if (a.phaseIndex === 0 && !a.bstate.illusions) {
      const twin = cands.find((d) => d.id === 'twin_illusion');
      if (twin) return twin;
    }
    return undefined;
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    const id = atk.def.id;
    if (id === 'twin_illusion') a.bstate.illusions = (a.bstate.illusions ?? 0) + 1;
    if (MIRROR_ATTACKS.has(id)) {
      const exits = mirrorExits(sim);
      const i = pickMirror(sim, exits);
      if (i < 0) return;
      const m = exits[i];
      a.bstate.mirror = i;
      sim.emit({ type: 'vfx', id: 'mirror_enter', pos: { x: a.pos.x, y: a.pos.y + 1.6, z: a.pos.z } });
      a.pos.x = m.x;
      a.pos.z = m.z;
      a.pos.y = sim.groundAt(m.x, m.z);
      a.yaw = yawTo(a.pos, sim.player.pos);
      a.flags.add('in_mirror');
      a.hidden = true;
      a.untargetable = true;
      a.invulnerable = true;
      sim.emit({ type: 'cue', id: 'loki_mirror_glow', actor: a.id, pos: { x: m.x, y: a.pos.y + 1.6, z: m.z } });
    } else if (id.startsWith('mimic_') || id === 'ng_mimic_chain') {
      const slot = id === 'ng_mimic_chain' ? -1 : Number(id.slice(6)) - 1;
      const used = a.bstate.mimic as string[];
      const w = slot >= 0 ? used[slot] ?? '' : [...sim.player.weapons].reverse().find((x) => !!x) ?? '';
      a.bstate.mimicNow = w;
      sim.emit({ type: 'cue', id: `loki_mimic:${w || 'mirror_blade'}`, actor: a.id });
    }
  },

  onAttackEnd(a: Actor, sim: Sim) {
    leaveMirror(a, sim);
    a.bstate.mimicNow = '';
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    if (event === 'loki_mirror_exit') {
      leaveMirror(a, sim);
    } else if (event === 'loki_swap') {
      const copies = copiesOf(a, sim);
      if (!copies.length) return;
      const all = [a, ...copies];
      const spots = all.map((x) => ({ x: x.pos.x, z: x.pos.z }));
      // a permutation in which Loki always changes place
      const order = spots.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(sim.rng.range(0, i + 1 - 1e-9));
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
      if (order[0] === 0) { const t = order[0]; order[0] = order[1]; order[1] = t; }
      all.forEach((x, i) => {
        const s = spots[order[i]];
        sim.emit({ type: 'vfx', id: 'loki_swap', pos: { ...x.pos } });
        x.pos.x = s.x;
        x.pos.z = s.z;
        x.pos.y = sim.groundAt(s.x, s.z);
        x.yaw = yawTo(x.pos, sim.player.pos);
      });
      a.bstate.swaps++;
      sim.emit({ type: 'cue', id: 'loki_swap', actor: a.id });
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    shatterCopies(a, sim);
    leaveMirror(a, sim);
    if (phase === 1) sim.emit({ type: 'cue', id: 'loki_mirror_maze', actor: a.id });
    if (phase >= 2) {
      rebuildMimics(a, sim);
      sim.emit({ type: 'cue', id: 'loki_hall_collapse', actor: a.id });
      sim.emit({ type: 'shake', strength: 0.7, dur: 2.0 });
    }
  },

  onDeath(a: Actor, sim: Sim) {
    shatterCopies(a, sim);
    leaveMirror(a, sim);
    sim.emit({ type: 'cue', id: 'loki_vanish', actor: a.id, pos: { ...a.pos } });
    sim.emit({ type: 'vfx', id: 'loki_vanish', pos: { x: a.pos.x, y: a.pos.y + 1.6, z: a.pos.z } });
  },
}));
