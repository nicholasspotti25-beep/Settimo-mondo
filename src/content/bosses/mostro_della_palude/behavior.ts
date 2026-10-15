/**
 * Mostro della Palude — a colossus of mud, reeds, bones and unlit lanterns: the drowned Cercatori fused together.
 *
 * - Emerges from the pool: it starts hidden under the water (flag 'submerged') and opens with `emerge`.
 * - The thousand voices whisper every attack before it begins (voices.ts: sfx `voices_<family>` + whispered caption, then the
 *   attack after VOICE_LEAD seconds).
 * - `submerge_ambush`: sinks (hidden) and erupts where the bubbles rise (the bubbles hazard marks the spot).
 * - Phase 2 (flag 'split'): the colossus collapses into the pool and three smaller drowned figures rise one after another
 *   (minions with main_share 1: the boss bar falls as they fall). The colossus itself is gone (hidden, untargetable, no AI);
 *   when the third figure falls, the Mostro dies. Its remaining Health at the split is shared equally by the three figures.
 * - Among the whispers there is a clue: the ferryman does not want coins (caption at the split).
 * Deterministic: sim.rng only.
 */
import { dist2D, yawTo } from '../../../core/math';
import { insideArena } from '../../../core/terrain';
import type { AttackDef, MinionDef } from '../../../core/types';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import { killActor } from '../../../sim/combat';
import type { Sim } from '../../../sim/sim';
import { CLUE_KEY, announce, newVoiceState, tickVoices, voicedSelect, type VoiceState } from './voices';

/** The drowned figures of phase 2, in the order they rise. */
export const FIGURES = ['annegato_lanterna', 'annegato_canne', 'annegato_ossa'] as const;
/** Seconds between one figure falling and the next rising. */
export const NEXT_FIGURE_DELAY = 1.8;
/** Hidden window of the ambush (active time, s): sinks at SINK_AT, erupts at ERUPT_AT (the bubbles turn active at ~2.1). */
export const SINK_AT = 0.25;
export const ERUPT_AT = 2.07;

interface MostroState {
  voices: VoiceState;
  opened: boolean;
  split: boolean;
  /** Index of the next figure to raise (0..3). */
  nextFigure: number;
  figureId: number;
  figureTimer: number;
  figuresDown: number;
  /** Main Health at the split (shared by the three figures). */
  splitHp: number;
  markX: number;
  markZ: number;
  hasMark: boolean;
  clueSaid: boolean;
}

function st(a: Actor): MostroState {
  return a.bstate as MostroState;
}

function setSubmerged(a: Actor, sim: Sim, under: boolean): void {
  if (a.hidden === under) return;
  a.hidden = under;
  a.untargetable = under;
  a.noCollide = under;
  if (under) a.flags.add('submerged');
  else a.flags.delete('submerged');
  sim.emit({ type: 'cue', id: under ? 'palude_sink' : 'palude_rise', actor: a.id, pos: { ...a.pos } });
}

/** A point of the pool where the next figure rises: in front of the player, inside the arena. */
function risePoint(a: Actor, sim: Sim): { x: number; y: number; z: number } {
  const pl = sim.player.pos;
  const c = sim.arenaCenter();
  const ar = sim.zone?.activeArena;
  for (let i = 0; i < 12; i++) {
    const base = yawTo(pl, c) + sim.rng.range(-0.9, 0.9);
    const d = sim.rng.range(6, 8.5);
    const x = pl.x + Math.sin(base) * d, z = pl.z + Math.cos(base) * d;
    if (!ar || insideArena(ar, x, z, 2.5)) return { x, y: c.y, z };
  }
  void a;
  return { x: c.x, y: c.y, z: c.z };
}

function raiseFigure(a: Actor, sim: Sim): void {
  const s = st(a);
  const id = FIGURES[s.nextFigure];
  const md = (a.bossDef?.minions ?? []).find((m: MinionDef) => m.id === id);
  if (!md) return;
  const pos = risePoint(a, sim);
  const m = sim.spawnMinion(md, pos, a, -1);
  // the colossus's remaining Health is shared equally by the three figures
  const share = Math.max(1, s.splitHp / FIGURES.length);
  m.hp = share;
  m.hpMax = share;
  m.yaw = yawTo(m.pos, sim.player.pos);
  m.idleTimer = 1.2;
  s.figureId = m.id;
  s.nextFigure++;
  // the camera follows the figure that rises
  sim.player.lock = { actor: m.id, part: -1 };
  sim.emit({ type: 'cue', id: `palude_figure_${s.nextFigure}`, actor: m.id, pos: { ...m.pos } });
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    const s: MostroState = {
      voices: newVoiceState(), opened: false, split: false, nextFigure: 0, figureId: -1, figureTimer: 0, figuresDown: 0, splitHp: 0,
      markX: 0, markZ: 0, hasMark: false, clueSaid: false,
    };
    a.bstate = s;
    setSubmerged(a, sim, true);
  },

  update(a: Actor, sim: Sim, dt: number) {
    const s = st(a);
    tickVoices(s.voices, dt);

    // opener: the colossus rises from the pool (the voices announce it)
    if (!s.opened && a.state === 'idle' && !sim.fightPaused) {
      s.opened = true;
      const em = a.attackMap.get('emerge');
      if (em) {
        announce(a, sim, em, s.voices);
        a.startAttack(sim, em);
      }
    }
    const atk = a.attack;
    if (atk?.def.id === 'emerge' && atk.activeTime >= -0.05 && a.hidden) setSubmerged(a, sim, false);
    if (atk?.def.id === 'submerge_ambush') {
      if (atk.activeTime >= SINK_AT && atk.activeTime < ERUPT_AT && !a.hidden) setSubmerged(a, sim, true);
      if (atk.activeTime >= ERUPT_AT && a.hidden) {
        if (s.hasMark) {
          a.pos.x = s.markX;
          a.pos.z = s.markZ;
          sim.clampActor(a);
        }
        a.yaw = yawTo(a.pos, sim.player.pos);
        setSubmerged(a, sim, false);
        sim.emit({ type: 'vfx', id: 'palude_erupt', pos: { ...a.pos } });
      }
    } else if (!s.split && a.hidden && atk?.def.id !== 'emerge' && s.opened) {
      setSubmerged(a, sim, false);
    }

    // phase 2: the three drowned figures, one after another
    if (s.split) {
      if (a.state === 'transition') return false; // the collapse (invulnerable roar) plays out first
      if (a.state !== 'hidden' && a.state !== 'dead') a.setState('hidden');
      a.invulnerable = true;
      a.hidden = true;
      a.untargetable = true;
      a.noCollide = true;
      const fig = s.figureId >= 0 ? sim.actorById(s.figureId) : undefined;
      if (s.figureId >= 0 && (!fig || !fig.alive)) {
        s.figureId = -1;
        s.figuresDown++;
        s.figureTimer = NEXT_FIGURE_DELAY;
        if (s.figuresDown >= FIGURES.length) {
          a.invulnerable = false;
          a.hp = 0;
          killActor(sim, a);
          return true;
        }
      }
      if (s.figureId < 0 && s.nextFigure < FIGURES.length) {
        s.figureTimer -= dt;
        if (s.figureTimer <= 0) raiseFigure(a, sim);
      }
      a.anim = 'collapsed';
      a.animStage = 'hidden';
      a.animTime += dt;
      return true;
    }
    return false;
  },

  movement(a: Actor, sim: Sim, dt: number): boolean {
    // under the water it does not wade around; otherwise default heavy locomotion
    if (a.hidden) {
      a.anim = 'submerged';
      a.animStage = 'hidden';
      a.animTime += dt;
      return true;
    }
    void sim;
    return false;
  },

  selectAttack(a: Actor, sim: Sim, cands: AttackDef[]): AttackDef | null | undefined {
    const s = st(a);
    if (s.split || a.hidden) return null;
    return voicedSelect(a, sim, cands.filter((c) => c.id !== 'emerge'), s.voices);
  },

  onCustomEvent(a: Actor, sim: Sim, event: string, _spawn, _atk: AttackRuntime | null) {
    const s = st(a);
    if (event === 'erupt_mark') {
      let best: { x: number; z: number; id: number } | null = null;
      sim.hazards.forEachActive((h) => {
        if (h.owner !== a.id || h.kind !== 'palude_bubbles') return;
        if (!best || h.id > best.id) best = { x: h.pos.x, z: h.pos.z, id: h.id };
      });
      s.hasMark = !!best;
      if (best) {
        s.markX = (best as { x: number }).x;
        s.markZ = (best as { z: number }).z;
      }
    }
  },

  canDie(a: Actor): boolean {
    const s = st(a);
    return !s.split || s.figuresDown >= FIGURES.length;
  },

  onPhaseEnter(a: Actor, sim: Sim, _index: number, def) {
    if (def.id !== 'p2') return;
    const s = st(a);
    s.split = true;
    s.voices.pending = null;
    s.splitHp = Math.max(FIGURES.length, a.hp);
    s.nextFigure = 0;
    s.figureId = -1;
    s.figuresDown = 0;
    s.figureTimer = 0.4;
    setSubmerged(a, sim, false);
    sim.emit({ type: 'cue', id: 'palude_split', actor: a.id, pos: { ...a.pos } });
    if (!s.clueSaid) {
      s.clueSaid = true;
      sim.emit({ type: 'caption', key: CLUE_KEY });
      sim.emit({ type: 'sfx', id: 'voices_clue', pos: { ...a.pos } });
    }
  },

  onDeath(a: Actor, sim: Sim) {
    a.hidden = false;
    sim.emit({ type: 'cue', id: 'palude_voices_fade', actor: a.id, pos: { ...a.pos } });
  },
}));

/** Distance helper for tests and the bot: the active drowned figure, if any. */
export function activeFigure(a: Actor, sim: Sim): Actor | undefined {
  const s = st(a);
  if (s.figureId < 0) return undefined;
  const f = sim.actorById(s.figureId);
  return f && f.alive ? f : undefined;
}

export function figureDistance(a: Actor, sim: Sim): number {
  const f = activeFigure(a, sim);
  return f ? dist2D(f.pos, sim.player.pos) : Infinity;
}
