/**
 * Sciamano (19) — binder of the Tre Spiriti della Taiga, at the Cerchio dei Tamburi.
 *
 *  - The drum: a rhythm (lupo | orso | corvo) decides the pattern set. Only attacks whose `requires` names the current
 *    rhythm are chosen (plus the rhythm-free staff sweep and spirit step). The beat is audible and visible: one cue
 *    `sciamano_beat` per beat (fast for the wolf, slow and heavy for the bear, broken for the raven) and a flag
 *    `rhythm_<name>` for the drum's glow. Every RHYTHM_TIME s he plays a drum roll (drum_change: cue sciamano_rhythm,
 *    pos.x = rhythm index) and the rhythm changes to one of the other two (sim.rng). The rhythm also sets his tempo
 *    (RHYTHM_AGGRESSION: the wolf presses, the bear waits). Dawn starts on the wolf, night on the raven, else the bear.
 *  - Phase 2 (flag `raven_fused`): fused with the raven he flies above the arena (take_wing → hover FLY_HEIGHT, flag
 *    `flying`). From the air he casts only the sky attacks of the rhythm; after AIR_CASTS of them (or AIR_MAX s) he swoops on you
 *    (raven_swoop) and lands, grounded for LAND_TIME s (cue sciamano_land: the punish window, he fights on foot and may
 *    drum), then takes wing again. He never drums in the air.
 * Deterministic: sim.rng only (next rhythm).
 */
import type { AttackDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

export const RHYTHMS = ['lupo', 'orso', 'corvo'] as const;
export type Rhythm = (typeof RHYTHMS)[number];
export const RHYTHM_TIME = 13;
/** Seconds between beats per rhythm (the raven's is a broken pattern, cycled). */
export const BEATS: Record<Rhythm, readonly number[]> = { lupo: [0.42], orso: [0.95], corvo: [0.28, 0.28, 0.85] };
export const RHYTHM_AGGRESSION: Record<Rhythm, number> = { lupo: 1.15, orso: 0.88, corvo: 1.0 };
export const FLY_HEIGHT = 7.5;
export const AIR_CASTS = 2;
/** Never longer than this aloft: he swoops even if a cast was held back by its cooldown. */
export const AIR_MAX = 10;
export const LAND_TIME = 5.5;
/** Attacks cast from the air (phase 2). Everything else is cast on foot. */
export const AIR = new Set(['sky_wolves', 'sky_bear', 'sky_ravens', 'raven_swoop', 'ng_raven_cage']);

export function rhythmOf(a: Actor): Rhythm {
  return RHYTHMS[a.bstate.rhythm ?? 1];
}

function setRhythm(a: Actor, sim: Sim, i: number): void {
  for (const r of RHYTHMS) a.flags.delete(`rhythm_${r}`);
  a.bstate.rhythm = i;
  a.bstate.rhythmT = 0;
  a.bstate.beat = 0;
  a.bstate.beatT = 0;
  a.flags.add(`rhythm_${RHYTHMS[i]}`);
  a.aggression = RHYTHM_AGGRESSION[RHYTHMS[i]];
  sim.emit({ type: 'cue', id: 'sciamano_rhythm', actor: a.id, pos: { x: i, y: 0, z: 0 } });
}

function land(a: Actor, sim: Sim): void {
  a.bstate.aloft = false;
  a.bstate.landT = 0;
  a.hoverHeight = 0;
  a.flags.delete('flying');
  sim.emit({ type: 'cue', id: 'sciamano_land', actor: a.id, pos: { ...a.pos } });
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    a.bstate.aloft = false;
    a.bstate.airCasts = 0;
    a.bstate.airT = 0;
    a.bstate.landT = 0;
    a.hoverHeight = 0;
    const start = a.flags.has('rhythm_lupo') ? 0 : a.flags.has('rhythm_corvo') ? 2 : 1;
    setRhythm(a, sim, start);
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    // a caster keeps his distance: never past the stones of the circle (locomotion itself does not clamp)
    sim.clampActor(a);
    const live = !!sim.fight?.active && !sim.fight.intro && !sim.seq.running && a.alive;
    if (!live) return false;
    g.rhythmT += dt;
    if (!g.aloft) g.landT += dt;
    else g.airT += dt;
    // the beat of the drum (or of the raven's wings)
    const pat = BEATS[rhythmOf(a)];
    g.beatT += dt;
    const gap = pat[g.beat % pat.length];
    if (g.beatT >= gap) {
      g.beatT -= gap;
      g.beat++;
      sim.emit({ type: 'cue', id: 'sciamano_beat', actor: a.id, pos: { x: g.rhythm, y: g.beat % pat.length, z: 0 } });
    }
    return false;
  },

  canUseAttack(a: Actor, _sim: Sim, def: AttackDef) {
    const g = a.bstate;
    const p2 = a.phaseIndex >= 1;
    if (def.id === 'drum_change') return !g.aloft && g.rhythmT >= RHYTHM_TIME;
    if (def.id === 'take_wing') return p2 && !g.aloft && g.landT >= LAND_TIME;
    if (def.id === 'raven_swoop') return g.aloft && (g.airCasts >= AIR_CASTS || g.airT >= AIR_MAX);
    if (g.aloft !== AIR.has(def.id)) return false;
    if (def.requires) return def.requires === rhythmOf(a);
    return true;
  },

  selectAttack(a: Actor, _sim: Sim, cands: AttackDef[]) {
    const g = a.bstate;
    const pick = (id: string) => cands.find((d) => d.id === id);
    if (g.aloft && (g.airCasts >= AIR_CASTS || g.airT >= AIR_MAX)) return pick('raven_swoop');
    if (!g.aloft && a.phaseIndex >= 1 && g.landT >= LAND_TIME) return pick('take_wing');
    if (!g.aloft && g.rhythmT >= RHYTHM_TIME) return pick('drum_change');
    return undefined;
  },

  onAttackEnd(a: Actor, sim: Sim, atk: AttackRuntime) {
    const g = a.bstate;
    if (atk.def.id === 'raven_swoop') land(a, sim);
    else if (g.aloft && AIR.has(atk.def.id)) g.airCasts++;
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    const g = a.bstate;
    if (event === 'rhythm') {
      const others = [0, 1, 2].filter((i) => i !== g.rhythm);
      setRhythm(a, sim, others[sim.rng.int(0, others.length - 1)]);
    } else if (event === 'fly') {
      g.aloft = true;
      g.airCasts = 0;
      g.airT = 0;
      a.hoverHeight = FLY_HEIGHT;
      a.flags.add('flying');
      sim.emit({ type: 'cue', id: 'sciamano_take_wing', actor: a.id, pos: { ...a.pos } });
    } else if (event === 'swoop') {
      // he falls with the dive; on the ground once it ends
      a.hoverHeight = 0;
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    a.bstate.landT = LAND_TIME;
    sim.emit({ type: 'cue', id: 'sciamano_raven_fuse', actor: a.id, pos: { ...a.pos } });
  },

  onDeath(a: Actor, sim: Sim) {
    // struck down from the air, he falls into the circle
    if (a.bstate.aloft) land(a, sim);
    a.pos.y = sim.groundAt(a.pos.x, a.pos.z);
  },
}));
