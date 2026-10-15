/**
 * The thousand voices inside the Mostro della Palude announce every attack BEFORE it begins: when the colossus (or one of the
 * three drowned figures of phase 2) decides its next move, the voices whisper it — an sfx cue `voices_<family>` (the audio
 * stream voices it as a choir of whispers) and a whispered caption `boss.mostro_della_palude.voices.<family>.<n>` (IT/EN) —
 * and the attack starts only VOICE_LEAD seconds later. Listening is the mechanic.
 * Sim-only module (no three/DOM). Deterministic: sim.rng only.
 */
import { dist2D } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import type { BossBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Seconds between the whisper and the start of the attack's own telegraph. */
export const VOICE_LEAD = 0.7;

/** Attack id -> voice family. */
export const VOICE_FAMILY: Record<string, string> = {
  emerge: 'rise',
  double_slam: 'slam',
  mud_wave: 'wave',
  ng_double_wave: 'wave',
  mire_arms: 'arms',
  long_reach: 'reach',
  swamp_sweep: 'sweep',
  submerge_ambush: 'below',
  // the three drowned figures
  lantern_flail: 'sweep',
  lantern_slam: 'slam',
  lantern_hurl: 'throw',
  reed_flurry: 'thrust',
  reed_lunge: 'lunge',
  reed_volley: 'throw',
  bone_crush: 'slam',
  bone_charge: 'lunge',
  bone_mire: 'arms',
  ng_lantern_whirl: 'sweep',
  ng_reed_rain: 'arms',
  ng_bone_quake: 'slam',
  ng_mud_rain: 'arms',
};

/** Number of whispered variants per family (keys boss.mostro_della_palude.voices.<family>.<1..n>). */
export const VOICE_VARIANTS: Record<string, number> = {
  rise: 2, slam: 3, wave: 3, arms: 3, reach: 2, sweep: 3, below: 2, throw: 2, thrust: 2, lunge: 2,
};

export const CLUE_KEY = 'boss.mostro_della_palude.voices.clue';

export interface VoiceState {
  pending: AttackDef | null;
  pendingT: number;
  lastVariant: Record<string, number>;
}

export function newVoiceState(): VoiceState {
  return { pending: null, pendingT: 0, lastVariant: {} };
}

/** Whisper the family of an attack: sfx cue + caption (a different variant than last time). */
export function announce(a: Actor, sim: Sim, def: AttackDef, vs: VoiceState): string | null {
  const fam = VOICE_FAMILY[def.id];
  if (!fam) return null;
  const n = VOICE_VARIANTS[fam] ?? 1;
  let v = sim.rng.int(1, n);
  if (n > 1 && v === vs.lastVariant[fam]) v = (v % n) + 1;
  vs.lastVariant[fam] = v;
  const key = `boss.mostro_della_palude.voices.${fam}.${v}`;
  sim.emit({ type: 'sfx', id: `voices_${fam}`, pos: { x: a.pos.x, y: a.pos.y + a.height * a.scale * 0.7, z: a.pos.z } });
  sim.emit({ type: 'caption', key });
  sim.emit({ type: 'cue', id: `voices_${fam}`, actor: a.id });
  return key;
}

/** The default weighted selector (range filter, time-of-day weights), reproduced so the choice can be whispered first. */
export function pickAttack(a: Actor, sim: Sim, cands: AttackDef[]): AttackDef | null {
  if (!cands.length) return null;
  const d = dist2D(a.pos, sim.targetPos(a)) - a.radius * a.scale;
  let pool = cands.filter((c) => c.global || !c.range || (d >= c.range[0] - 0.5 && d <= c.range[1] + 0.5));
  if (!pool.length) {
    if (a.approachTime < 2.2) return null;
    pool = cands.filter((c) => c.global || c.spawns?.some((s) => s.type === 'projectile' || s.type === 'hazard') || c.motion?.length);
    if (!pool.length) pool = cands;
  }
  const w = pool.map((c) => (c.weight ?? 1) * (a.tod.weights?.[c.id] ?? 1));
  const i = sim.rng.weighted(w);
  return i >= 0 ? pool[i] : null;
}

/**
 * selectAttack implementation with the whisper lead: the first call picks and announces, later calls wait (null) until the
 * lead has passed, then return the announced attack (the voices never lie: it comes even if you moved).
 */
export function voicedSelect(a: Actor, sim: Sim, cands: AttackDef[], vs: VoiceState): AttackDef | null {
  if (vs.pending) {
    if (vs.pendingT > 0) return null;
    const def = vs.pending;
    vs.pending = null;
    // an attack put on cooldown meanwhile (combo, behavior) is replaced by a fresh whispered choice
    if ((a.cooldowns.get(def.id) ?? 0) > 0) return voicedSelect(a, sim, cands, vs);
    return def;
  }
  const pick = pickAttack(a, sim, cands);
  if (!pick) return null;
  if (!announce(a, sim, pick, vs)) return pick;
  vs.pending = pick;
  vs.pendingT = VOICE_LEAD;
  return null;
}

/** Tick the whisper lead (call from update). */
export function tickVoices(vs: VoiceState, dt: number): void {
  if (vs.pendingT > 0) vs.pendingT -= dt;
}

/** Behavior of the three drowned figures of phase 2: the voices still whisper each of their attacks first. */
export function figureBehavior(): BossBehavior {
  return {
    init(a: Actor, sim: Sim) {
      a.bstate = { voices: newVoiceState() };
      sim.emit({ type: 'sfx', id: 'palude_figure_rise', pos: { ...a.pos } });
    },
    update(a: Actor, _sim: Sim, dt: number) {
      tickVoices(a.bstate.voices as VoiceState, dt);
      return false;
    },
    canUseAttack(_a: Actor, sim: Sim, def: AttackDef) {
      // New Game+ attacks of the figures (listed in the boss's ng_plus.add_patterns.p2)
      return def.requires !== 'ng' || sim.ngCycle > 0;
    },
    selectAttack(a: Actor, sim: Sim, cands: AttackDef[]) {
      return voicedSelect(a, sim, cands, a.bstate.voices as VoiceState);
    },
    onDeath(a: Actor, sim: Sim) {
      sim.emit({ type: 'cue', id: 'palude_figure_falls', actor: a.id, pos: { ...a.pos } });
    },
  };
}
