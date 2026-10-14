/**
 * Music theory helpers (pure): pitch classes, modes, scale degrees -> MIDI, motif / progression / rhythm pattern parsing.
 *
 * Notation used in data/music/*.yaml:
 * - Motif: space-separated tokens `<deg>[#|b][+|-...]:<steps>` where deg is the 1-based scale degree, `+`/`-` shift an octave,
 *   `#`/`b` alter by a semitone, steps = length in grid steps (beat / subdiv). `r:<steps>` is a rest. `~` after steps = tie/legato.
 *   Example: "5-:1 1:3 2:1 3:3 5:2 4:2 1+:4".
 * - Progression: tokens `<deg>[:quality][*bars]`, quality in tri|7|9|sus2|sus4|5|add9|dim|aug (default tri).
 *   Example: "1 6 4:sus2 5:7*2".
 * - Rhythm pattern: one char per grid step: `X` accent (1.0), `x` hit (0.8), `o` soft (0.5), `.` rest, `g` ghost (0.25).
 */

export const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

export const MODES: Record<string, readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
  hungarian_minor: [0, 2, 3, 6, 7, 8, 11],
  lydian_dominant: [0, 2, 4, 6, 7, 9, 10],
  dorian_b2: [0, 1, 3, 5, 7, 9, 10],
  whole_tone: [0, 2, 4, 6, 8, 10],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
  hirajoshi: [0, 2, 3, 7, 8],
};

export const MODE_NAMES = Object.keys(MODES);

export function modeIntervals(mode: string): readonly number[] {
  return MODES[mode] ?? MODES.aeolian;
}

export function keyToPc(key: string): number {
  const pc = PITCH_CLASS[key];
  return pc === undefined ? 2 : pc;
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** 0-based scale degree (may be negative or beyond the mode length) -> MIDI. `octave` 4 = middle octave (C4 = 60). */
export function degreeToMidi(keyPc: number, mode: string, deg: number, octave = 4, alter = 0): number {
  const iv = modeIntervals(mode);
  const n = iv.length;
  const o = Math.floor(deg / n);
  const d = ((deg % n) + n) % n;
  return 12 * (octave + 1) + keyPc + iv[d] + 12 * o + alter;
}

export interface MotifNote {
  /** 0-based degree (relative to octave 0 of the motif), NaN for rests. */
  deg: number;
  alter: number;
  steps: number;
  rest: boolean;
  tie: boolean;
}

const MOTIF_RE = /^(r|\d+)([#b]?)([+-]*):(\d+(?:\.\d+)?)(~?)$/;

export function parseMotif(src: string): MotifNote[] {
  const out: MotifNote[] = [];
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = MOTIF_RE.exec(tok);
    if (!m) throw new Error(`bad motif token "${tok}"`);
    const steps = Number(m[4]);
    if (!(steps > 0)) throw new Error(`bad motif length "${tok}"`);
    if (m[1] === 'r') {
      out.push({ deg: NaN, alter: 0, steps, rest: true, tie: false });
      continue;
    }
    const d = Number(m[1]);
    if (d < 1 || d > 9) throw new Error(`bad motif degree "${tok}"`);
    let oct = 0;
    for (const ch of m[3]) oct += ch === '+' ? 1 : -1;
    out.push({ deg: d - 1 + oct * 7, alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, steps, rest: false, tie: m[5] === '~' });
  }
  return out;
}

/** Octave shifts in motifs are encoded as 7-degree jumps; convert to the mode's own length. */
export function motifDegree(n: MotifNote, modeLen: number): { deg: number; octave: number } {
  const oct = Math.floor(n.deg / 7);
  const d = n.deg - oct * 7;
  if (modeLen === 7) return { deg: d, octave: oct };
  // map a 7-degree index onto shorter/longer modes proportionally
  return { deg: Math.round((d * modeLen) / 7), octave: oct };
}

export function motifSteps(m: readonly MotifNote[]): number {
  let s = 0;
  for (const n of m) s += n.steps;
  return s;
}

export type ChordQuality = 'tri' | '7' | '9' | 'sus2' | 'sus4' | '5' | 'add9' | 'dim' | 'aug';
export const CHORD_QUALITIES: readonly ChordQuality[] = ['tri', '7', '9', 'sus2', 'sus4', '5', 'add9', 'dim', 'aug'];

export interface ChordStep {
  /** 0-based root degree. */
  root: number;
  alter: number;
  quality: ChordQuality;
  bars: number;
}

const CHORD_RE = /^(\d)([#b]?)(?::(\w+))?(?:\*(\d+))?$/;

export function parseProgression(src: string): ChordStep[] {
  const out: ChordStep[] = [];
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    const m = CHORD_RE.exec(tok);
    if (!m) throw new Error(`bad chord token "${tok}"`);
    const q = (m[3] ?? 'tri') as ChordQuality;
    if (!CHORD_QUALITIES.includes(q)) throw new Error(`bad chord quality "${tok}"`);
    const d = Number(m[1]);
    if (d < 1 || d > 7) throw new Error(`bad chord degree "${tok}"`);
    out.push({ root: d - 1, alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, quality: q, bars: m[4] ? Number(m[4]) : 1 });
  }
  if (!out.length) throw new Error('empty progression');
  return out;
}

/** Chord tones as 0-based scale degrees above the root degree (diatonic stacking), plus semitone alterations for dim/aug. */
export function chordDegrees(q: ChordQuality): readonly number[] {
  switch (q) {
    case '7': return [0, 2, 4, 6];
    case '9': return [0, 2, 4, 6, 8];
    case 'sus2': return [0, 1, 4];
    case 'sus4': return [0, 3, 4];
    case '5': return [0, 4, 7];
    case 'add9': return [0, 2, 4, 8];
    default: return [0, 2, 4];
  }
}

/** MIDI notes of a chord in a key/mode at a given octave (root position). */
export function chordMidi(keyPc: number, mode: string, ch: ChordStep, octave: number, out: number[]): number[] {
  out.length = 0;
  const degs = chordDegrees(ch.quality);
  for (const d of degs) out.push(degreeToMidi(keyPc, mode, ch.root + d, octave, ch.alter));
  if (ch.quality === 'dim' && out.length >= 3) {
    out[1] = out[0] + 3;
    out[2] = out[0] + 6;
  } else if (ch.quality === 'aug' && out.length >= 3) {
    out[1] = out[0] + 4;
    out[2] = out[0] + 8;
  }
  return out;
}

export function progressionBars(p: readonly ChordStep[]): number {
  let n = 0;
  for (const c of p) n += c.bars;
  return n;
}

/** Chord for a bar index (cycling the progression). */
export function chordAtBar(p: readonly ChordStep[], bar: number): ChordStep {
  const total = progressionBars(p);
  let b = ((bar % total) + total) % total;
  for (const c of p) {
    if (b < c.bars) return c;
    b -= c.bars;
  }
  return p[0];
}

export function parsePattern(src: string): Float32Array {
  const s = src.replace(/[\s|]+/g, '');
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    out[i] = ch === 'X' ? 1 : ch === 'x' ? 0.8 : ch === 'o' ? 0.5 : ch === 'g' ? 0.25 : 0;
  }
  return out;
}

export function isValidPattern(src: string): boolean {
  return /^[Xxog.\s|]+$/.test(src) && src.replace(/[\s|]/g, '').length > 0;
}
