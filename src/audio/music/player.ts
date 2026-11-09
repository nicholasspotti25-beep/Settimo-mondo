/**
 * Generative music player: a lookahead scheduler walks a TimeGrid and renders a theme's phase layers (pad, bass, arp,
 * motif, counter, ostinato, perc, drone, swell, sparkle, portatore) with the synthesized instruments. Phase changes and
 * theme changes land on bar boundaries; layers fade with the adaptive intensity; the Portatore layer plays the seven-note
 * theme with `themeNotes` melodic notes over its heartbeat.
 *
 * Hot path (update): no allocation besides the Web Audio nodes of the notes it schedules (the step callback is bound once,
 * chord tones go to scratch arrays).
 */
import { AudioRng, hashString } from '../core/rng';
import type { NoiseBank } from '../engine/noise';
import type { Out } from '../engine/nodes';
import type { InstrumentId, LayerSpec, PortatoreSpec, ThemeSpec } from './data';
import { PERCUSSION } from './data';
import { isSustained, playNote } from './instruments';
import { portatoreEvents, type PortatoreEvent } from './portatore';
import { resolveCue, type MusicLibrary } from './resolve';
import { StepCursor, TimeGrid, quantizedSwitchTime } from './scheduler';
import {
  chordMidi, degreeToMidi, keyToPc, modeIntervals, motifDegree, motifSteps, parseMotif, parsePattern, parseProgression,
  progressionBars, type ChordStep, type MotifNote,
} from './theory';

interface LayerRt {
  spec: LayerSpec;
  pattern: Float32Array | null;
  notes: MotifNote[] | null;
  notesSteps: number;
  level: number;
  idx: number;
  perc: boolean;
}

export interface PlayOptions {
  /** Max seconds to wait for the next bar of the current theme before switching (default 1.6). */
  maxWait?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Start in this phase (0-based). */
  phase?: number;
  /** Encounter id for the Portatore family (boss themes). */
  encounter?: string | null;
  act?: number;
  gain?: number;
}

class Track {
  readonly theme: ThemeSpec;
  readonly out: GainNode;
  readonly o: Out;
  readonly rng: AudioRng;
  readonly base: string;
  readonly encounter: string | null;
  phase = 0;
  grid!: TimeGrid;
  cursor!: StepCursor;
  keyPc = 2;
  mode = 'aeolian';
  prog: ChordStep[] = [];
  progBars = 1;
  motif: MotifNote[] = [];
  motifSteps = 1;
  layers: LayerRt[] = [];
  pendingPhase = -1;
  pendingAt = Infinity;
  stopAt = Infinity;
  /** Bars played since the theme started (across phase switches). */
  barCount = 0;
  lastBar = -1;
  statements = 0;
  gain: number;

  constructor(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, theme: ThemeSpec, base: string, encounter: string | null, gain: number) {
    this.theme = theme;
    this.base = base;
    this.encounter = encounter;
    this.gain = gain;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.rng = new AudioRng(hashString(theme.id));
    this.o = { ctx, dest: this.out, srcs: null, noise, rng: this.rng };
  }

  setupPhase(i: number, start: number): void {
    const th = this.theme;
    const p = th.phases[Math.max(0, Math.min(th.phases.length - 1, i))];
    this.phase = th.phases.indexOf(p);
    this.keyPc = keyToPc(p.key ?? th.key);
    this.mode = p.mode ?? th.mode;
    this.prog = parseProgression(p.progression ?? th.progression);
    this.progBars = progressionBars(this.prog);
    this.motif = parseMotif(p.motif ?? th.motif);
    this.motifSteps = motifSteps(this.motif);
    const prevLevels = new Map<string, number>();
    for (const l of this.layers) prevLevels.set(`${l.spec.role}:${l.spec.inst}`, l.level);
    this.layers = p.layers.map((spec) => {
      const notes = spec.notes ? parseMotif(spec.notes) : null;
      return {
        spec,
        pattern: spec.pattern ? parsePattern(spec.pattern) : null,
        notes,
        notesSteps: notes ? motifSteps(notes) : 0,
        // a layer that continues across the phase keeps its level (no dip); new layers fade in
        level: prevLevels.get(`${spec.role}:${spec.inst}`) ?? (spec.min_intensity > 0 ? 0 : 1),
        idx: 0,
        perc: PERCUSSION.includes(spec.inst),
      };
    });
    this.grid = new TimeGrid(start, { tempo: th.tempo * p.tempo, meters: th.meter, subdiv: th.subdiv });
    if (this.cursor) this.cursor.reset(this.grid);
    else this.cursor = new StepCursor(this.grid);
    this.lastBar = -1;
  }
}

export class MusicPlayer {
  readonly ctx: BaseAudioContext;
  readonly output: GainNode;
  private noise: NoiseBank;
  private lib: MusicLibrary;
  private tracks: Track[] = [];
  private cur: Track | null = null;
  private lookahead: number;
  intensity = 0.5;
  themeNotes = 0;
  /** Override for the portatore layer instrument (e.g. the boss's family); null = spec family / layer inst. */
  private chord: number[] = [];
  private chord2: number[] = [];
  private active: Track | null = null;
  private portCache = new Map<number, PortatoreEvent[]>();
  private readonly stepFn: (bar: number, step: number, time: number) => void;

  constructor(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, lib: MusicLibrary, lookahead = 0.2) {
    this.ctx = ctx;
    this.noise = noise;
    this.lib = lib;
    this.lookahead = lookahead;
    this.output = ctx.createGain();
    this.output.connect(dest);
    this.stepFn = (bar, step, time) => this.onStep(bar, step, time);
  }

  get current(): { id: string; base: string; phase: number; kind: string } | null {
    const c = this.cur;
    return c ? { id: c.theme.id, base: c.base, phase: c.phase, kind: c.theme.kind } : null;
  }

  /** Seconds per bar of the current theme (0 if silent). */
  get barDuration(): number {
    return this.cur ? this.cur.grid.barDur(this.cur.cursor.bar) : 0;
  }

  get trackCount(): number {
    return this.tracks.length;
  }

  /** Start (or switch to) a cue. A phase cue of the theme already playing only switches phase on the next bar. */
  play(cueId: string, opts: PlayOptions = {}): void {
    const res = resolveCue(this.lib, cueId, opts.act ?? 1);
    const now = this.ctx.currentTime;
    const c = this.cur;
    const phase = opts.phase ?? res.phase;
    if (c && c.stopAt === Infinity && c.base === res.base && c.theme === res.theme) {
      this.setPhase(phase);
      return;
    }
    const at = quantizedSwitchTime(c && c.stopAt === Infinity ? c.grid : null, now, opts.maxWait ?? 1.6);
    const fadeOut = opts.fadeOut ?? 2.2;
    if (c && c.stopAt === Infinity) this.fadeTrack(c, at, fadeOut);
    const tr = new Track(this.ctx, this.output, this.noise, res.theme, res.base, opts.encounter ?? null, opts.gain ?? 1);
    tr.setupPhase(phase, at);
    const fadeIn = opts.fadeIn ?? 1.2;
    const g = tr.out.gain;
    g.setValueAtTime(0, now);
    g.setValueAtTime(0.0001, at);
    g.linearRampToValueAtTime(tr.gain, at + Math.max(0.02, fadeIn));
    if (res.theme.bars) {
      const end = tr.grid.barStart(res.theme.bars);
      tr.stopAt = end + 4;
      g.setValueAtTime(tr.gain, end);
      g.linearRampToValueAtTime(0, end + 4);
    }
    this.tracks.push(tr);
    this.cur = tr;
  }

  /** Switch the current theme to phase i at the next bar boundary. */
  setPhase(i: number): void {
    const c = this.cur;
    if (!c) return;
    const target = Math.max(0, Math.min(c.theme.phases.length - 1, i));
    if (target === c.phase && c.pendingPhase < 0) return;
    if (target === c.pendingPhase) return;
    const now = this.ctx.currentTime;
    c.pendingPhase = target;
    c.pendingAt = quantizedSwitchTime(c.grid, now, c.grid.barDur(c.cursor.bar) + 0.01);
  }

  /** Fade out everything (at the next beat when `quantize`). */
  stop(fade = 2.5, quantize = false): void {
    const now = this.ctx.currentTime;
    for (const t of this.tracks) if (t.stopAt === Infinity) this.fadeTrack(t, quantize ? quantizedSwitchTime(t.grid, now, 0.8) : now + 0.02, fade);
    this.cur = null;
  }

  private fadeTrack(t: Track, at: number, fade: number): void {
    const g = t.out.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setValueAtTime(g.value, Math.max(now, at - 0.001));
    g.linearRampToValueAtTime(0, at + Math.max(0.05, fade));
    t.stopAt = at + Math.max(0.05, fade);
  }

  /** Per-frame scheduling (call with the context running). */
  update(): void {
    const now = this.ctx.currentTime;
    const until = now + this.lookahead;
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const t = this.tracks[i];
      if (now > t.stopAt + 0.5) {
        // tails are silent: release the track
        try {
          t.out.disconnect();
        } catch {
          /* already disconnected */
        }
        this.tracks.splice(i, 1);
        if (this.cur === t) this.cur = null;
        continue;
      }
      // fell behind (context suspended / tab hidden): jump to now instead of bursting the backlog
      if (t.cursor.time < now - 0.25) t.cursor.seek(now);
      this.active = t;
      const limit = Math.min(until, t.stopAt);
      // apply a pending phase switch exactly at its bar
      if (t.pendingPhase >= 0 && t.pendingAt <= until) {
        t.cursor.advance(Math.min(limit, t.pendingAt), this.stepFn);
        if (t.cursor.time >= t.pendingAt - 1e-4 || t.pendingAt <= now) {
          const at = Math.max(t.pendingAt, now);
          t.setupPhase(t.pendingPhase, at);
          t.pendingPhase = -1;
          t.pendingAt = Infinity;
        }
      }
      t.cursor.advance(limit, this.stepFn);
    }
    this.active = null;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */

  private onStep(bar: number, step: number, time: number): void {
    const t = this.active;
    if (!t) return;
    const th = t.theme;
    const grid = t.grid;
    const barSteps = grid.barSteps(bar);
    if (step === 0 && bar !== t.lastBar) {
      t.lastBar = bar;
      t.barCount++;
      // intensity-driven layer fades (half a level per bar)
      for (const l of t.layers) {
        const target = this.intensity + 1e-6 >= l.spec.min_intensity ? 1 : 0;
        l.level += Math.max(-0.5, Math.min(0.5, target - l.level));
      }
    }
    if (th.sparse) {
      const cyc = th.sparse.play + th.sparse.rest;
      if (cyc > 0 && bar % cyc >= th.sparse.play) return;
    }
    if (th.bars && bar >= th.bars && t.phase === 0 && t.pendingPhase < 0) return;
    const o = t.o;
    const r = t.rng;
    const stepDur = grid.stepDur;
    const barDur = grid.barDur(bar);
    const chordStep = this.chordAt(t, bar);
    const ch = chordStep.chord;
    const globalStep = grid.barBeatOffset(bar) * grid.subdiv + step;
    for (let li = 0; li < t.layers.length; li++) {
      const l = t.layers[li];
      if (l.level <= 0.001) continue;
      const s = l.spec;
      const g = s.gain * l.level;
      const tr = s.transpose;
      const jitter = (r.next() - 0.5) * 0.008;
      const at = Math.max(this.ctx.currentTime + 0.005, time + jitter);
      switch (s.role) {
        case 'pad': {
          if (step !== 0 || !chordStep.first) break;
          const notes = chordMidi(t.keyPc, t.mode, ch, s.oct, this.chord);
          const dur = chordStep.bars * barDur;
          for (let k = 0; k < notes.length && k < 4; k++) playNote(o, s.inst, at + k * 0.012, notes[k] + tr, dur, g * (k === 0 ? 1 : 0.8));
          break;
        }
        case 'bass': {
          const v = l.pattern ? l.pattern[globalStep % l.pattern.length] : step === 0 ? 1 : 0;
          if (v <= 0 || (s.chance < 1 && !r.chance(s.chance))) break;
          const root = chordMidi(t.keyPc, t.mode, ch, s.oct, this.chord)[0];
          const len = l.pattern ? this.runLength(l.pattern, globalStep) : barSteps;
          const fifth = l.pattern && v < 0.6 && r.chance(0.3) ? 7 : 0;
          playNote(o, s.inst, at, root + tr + fifth, Math.min(len, barSteps) * stepDur * 0.92, g * v);
          break;
        }
        case 'arp': {
          const v = l.pattern ? l.pattern[globalStep % l.pattern.length] : step % 2 === 0 ? 0.8 : 0;
          if (v <= 0 || (s.chance < 1 && !r.chance(s.chance))) break;
          const tones = this.arpTones(t, ch, s.oct);
          const n = tones.length;
          let k: number;
          if (s.dir === 'random') k = r.int(0, n - 1);
          else if (s.dir === 'down') k = n - 1 - (l.idx % n);
          else if (s.dir === 'updown') {
            const p = l.idx % Math.max(1, 2 * n - 2);
            k = p < n ? p : 2 * n - 2 - p;
          } else k = l.idx % n;
          l.idx++;
          playNote(o, s.inst, at, tones[k] + tr, stepDur * 1.6, g * v);
          break;
        }
        case 'motif':
        case 'counter':
        case 'ostinato': {
          if (l.notes || s.role === 'motif') {
            const notes = l.notes ?? t.motif;
            const steps = l.notes ? l.notesSteps : t.motifSteps;
            const phraseBars = Math.max(1, Math.ceil(steps / barSteps));
            const every = s.role === 'ostinato' ? phraseBars : Math.max(s.every, phraseBars);
            if (step !== 0 || ((bar - s.offset) % every + every) % every !== 0) break;
            if (s.chance < 1 && !r.chance(s.chance)) break;
            this.phrase(t, s, notes, at, stepDur, g);
            break;
          }
          if (s.role === 'counter') {
            // generated counter line: chord third / fifth on the strong half-bars
            const half = Math.max(1, Math.floor(barSteps / 2));
            if (step % half !== 0) break;
            const notes = chordMidi(t.keyPc, t.mode, ch, s.oct, this.chord);
            const k = (l.idx++ % 2) + 1;
            playNote(o, s.inst, at, notes[Math.min(k, notes.length - 1)] + tr, half * stepDur * 0.95, g * 0.85);
          } else {
            const v = l.pattern ? l.pattern[globalStep % l.pattern.length] : step % 2 === 0 ? 0.8 : 0;
            if (v <= 0) break;
            const notes = chordMidi(t.keyPc, t.mode, ch, s.oct, this.chord);
            const cyc = l.idx++ % 4;
            const m = cyc === 0 ? notes[0] : cyc === 2 ? notes[0] + 12 : notes[Math.min(2, notes.length - 1)];
            playNote(o, s.inst, at, m + tr, stepDur * 0.9, g * v);
          }
          break;
        }
        case 'perc': {
          const v = l.pattern ? l.pattern[globalStep % l.pattern.length] : step === 0 ? 1 : 0;
          if (v <= 0 || (s.chance < 1 && !r.chance(s.chance))) break;
          const root = chordMidi(t.keyPc, t.mode, ch, 2, this.chord)[0];
          playNote(o, s.inst, at, root + tr, stepDur, g * v * r.range(0.88, 1));
          break;
        }
        case 'drone': {
          const every = Math.max(1, s.every > 1 ? s.every : 4);
          if (step !== 0 || ((bar - s.offset) % every + every) % every !== 0) break;
          const m = degreeToMidi(t.keyPc, t.mode, 0, s.oct) + tr;
          playNote(o, s.inst, at, m, every * barDur, g);
          break;
        }
        case 'swell': {
          const every = Math.max(1, s.every);
          if (step !== 0 || ((bar + 1 - s.offset) % every + every) % every !== 0) break;
          const next = this.chordAt(t, bar + 1).chord;
          const m = chordMidi(t.keyPc, t.mode, next, s.oct, this.chord)[0] + tr;
          playNote(o, s.inst === 'reverse_swell' || isSustained(s.inst) ? s.inst : 'reverse_swell', at, m, barDur, g);
          break;
        }
        case 'sparkle': {
          if (!r.chance(0.11 * s.chance)) break;
          const notes = chordMidi(t.keyPc, t.mode, ch, s.oct, this.chord);
          const m = notes[r.int(0, notes.length - 1)] + (r.chance(0.3) ? 12 : 0) + tr;
          playNote(o, s.inst, at, m, stepDur * 2, g * r.range(0.4, 0.9));
          break;
        }
        case 'portatore': {
          const every = Math.max(1, s.every);
          if (step !== 0 || ((bar - s.offset) % every + every) % every !== 0) break;
          this.portatore(t, s, at, stepDur, g);
          break;
        }
      }
    }
  }

  /** Steps until the next hit of a cycling pattern (note length for bass lines). */
  private runLength(p: Float32Array, from: number): number {
    for (let k = 1; k < p.length; k++) if (p[(from + k) % p.length] > 0) return k;
    return p.length;
  }

  private chordInfo = { chord: null as unknown as ChordStep, first: false, bars: 1 };
  private chordAt(t: Track, bar: number): { chord: ChordStep; first: boolean; bars: number } {
    let b = ((bar % t.progBars) + t.progBars) % t.progBars;
    const out = this.chordInfo;
    for (const c of t.prog) {
      if (b < c.bars) {
        out.chord = c;
        out.first = b === 0;
        out.bars = c.bars;
        return out;
      }
      b -= c.bars;
    }
    out.chord = t.prog[0];
    out.first = true;
    out.bars = t.prog[0].bars;
    return out;
  }

  private arpTones(t: Track, ch: ChordStep, oct: number): number[] {
    const a = chordMidi(t.keyPc, t.mode, ch, oct, this.chord);
    const out = this.chord2;
    out.length = 0;
    for (const m of a) out.push(m);
    for (const m of a) out.push(m + 12);
    return out;
  }

  private phrase(t: Track, s: LayerSpec, notes: readonly MotifNote[], t0: number, stepDur: number, g: number): void {
    const len = modeIntervals(t.mode).length;
    const sustained = isSustained(s.inst);
    let at = t0;
    t.statements++;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      let steps = n.steps;
      if (n.rest) {
        at += steps * stepDur;
        continue;
      }
      // ties merge into the following note of the same pitch
      while (n.tie && i + 1 < notes.length && notes[i + 1].deg === n.deg && !notes[i + 1].rest) {
        i++;
        steps += notes[i].steps;
      }
      const d = motifDegree(n, len);
      const m = degreeToMidi(t.keyPc, t.mode, d.deg, s.oct + d.octave, n.alter) + s.transpose;
      const dur = steps * stepDur * (sustained ? 0.96 : 0.85);
      const accent = i === 0 ? 1 : 0.86 + 0.1 * t.rng.next();
      playNote(t.o, s.inst, at + (t.rng.next() - 0.5) * 0.01, m, dur, g * accent);
      at += steps * stepDur;
    }
  }

  private portatore(t: Track, s: LayerSpec, t0: number, stepDur: number, g: number): void {
    const spec: PortatoreSpec | null = this.lib.portatore;
    const notesSrc = spec?.notes ?? '1:2 3:1 5:3 4:1 3:2 2:1 1:4';
    const count = Math.max(0, Math.min(7, Math.floor(this.themeNotes)));
    let ev = this.portCache.get(count);
    if (!ev) {
      ev = portatoreEvents(notesSrc, count);
      this.portCache.set(count, ev);
    }
    const ratio = (t.theme.subdiv || 2) / (spec?.subdiv || 2);
    const inst: InstrumentId = (t.encounter && spec?.families[t.encounter]) || s.inst;
    const beat: InstrumentId = spec?.heartbeat ?? 'heartbeat';
    const len = modeIntervals(t.mode).length;
    let at = t0;
    for (const e of ev) {
      const dur = e.steps * ratio * stepDur;
      if (e.melodic) {
        const d = motifDegree({ deg: e.deg, alter: e.alter, steps: e.steps, rest: false, tie: false }, len);
        const m = degreeToMidi(t.keyPc, t.mode, d.deg, s.oct + d.octave, e.alter) + s.transpose;
        playNote(t.o, inst, at, m, dur * 0.95, g);
      } else {
        playNote(t.o, beat, at, 36, dur, g * e.strength * 1.4);
      }
      at += dur;
    }
  }
}
