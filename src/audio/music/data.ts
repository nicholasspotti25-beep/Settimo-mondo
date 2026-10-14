/**
 * Music + ambience data contract (data/music/*.yaml -> content.bundle.music, keyed by file name) and its validation (pure).
 *
 * Files:
 * - boss_<bossId>.yaml   one ThemeSpec per encounter; phases[i] is the cue `boss_<bossId>_p<i+1>`.
 * - cues.yaml            map cueId -> ThemeSpec for story / mode cues (risveglio, alba, titoli, title, altar, explore_actN...).
 * - palettes.yaml        { acts: { "1": PaletteSpec, ... } } per-act harmonic palettes for procedural fallback music.
 * - portatore.yaml       PortatoreSpec: the seven-note theme and its instrument family per principal boss.
 * - ambience.yaml        map ambienceId -> AmbienceSpec (zone.ambience ids + 'altar').
 */
import { MODES, isValidPattern, parseMotif, parseProgression } from './theory';

export const INSTRUMENTS = [
  // sustained / melodic
  'strings', 'strings_dark', 'cello', 'contrabass', 'pizzicato', 'flute', 'reed', 'horn', 'brass', 'low_brass',
  'choir', 'choir_dark', 'choir_reverse', 'harp', 'pluck', 'harpsichord', 'music_box', 'celesta', 'bells', 'glass',
  'marimba', 'kalimba', 'organ', 'pad_cold', 'pad_warm', 'drone', 'sub', 'reverse_swell', 'growl', 'orchestra', 'whistle',
  // percussion
  'taiko', 'timpani', 'frame_drum', 'snare', 'rim', 'shaker', 'hat', 'anvil', 'gong', 'woodblock', 'heartbeat', 'chains',
  'thunder_drum', 'clock',
] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number];

export const PERCUSSION: readonly InstrumentId[] = [
  'taiko', 'timpani', 'frame_drum', 'snare', 'rim', 'shaker', 'hat', 'anvil', 'gong', 'woodblock', 'heartbeat', 'chains', 'thunder_drum', 'clock',
];

export const ROLES = ['pad', 'bass', 'arp', 'motif', 'counter', 'perc', 'ostinato', 'drone', 'portatore', 'swell', 'sparkle'] as const;
export type LayerRole = (typeof ROLES)[number];

export interface LayerSpec {
  role: LayerRole;
  inst: InstrumentId;
  gain: number;
  /** Octave (4 = middle). Defaults per role. */
  oct: number;
  /** Rhythm pattern (perc, bass, arp, ostinato). One char per grid step; cycles. */
  pattern?: string;
  /** Ostinato / counter melody in motif notation (overrides the generated one). */
  notes?: string;
  /** Motif / portatore: play every N bars (default 4 for motif, 8 for portatore). */
  every: number;
  /** Bar offset within `every`. */
  offset: number;
  /** Arp direction. */
  dir: 'up' | 'down' | 'updown' | 'random';
  /** Probability that a pattern hit sounds (humanized sparsity). */
  chance: number;
  /** Layer fades in only when the adaptive intensity is at least this. */
  min_intensity: number;
  /** Static stereo position -1..1. */
  pan: number;
  /** Semitone transpose. */
  transpose: number;
}

export interface PhaseSpec {
  id: string;
  intensity: number;
  tempo: number; // multiplier
  mode?: string;
  key?: string;
  progression?: string;
  motif?: string;
  layers: LayerSpec[];
}

export type ThemeKind = 'boss' | 'mini' | 'cue' | 'explore' | 'stinger';

export interface ThemeSpec {
  id: string;
  kind: ThemeKind;
  boss?: string;
  act: number;
  character: string;
  key: string;
  mode: string;
  tempo: number;
  meter: number[];
  subdiv: number;
  progression: string;
  motif: string;
  /** Plays N bars then rests M bars (exploration). */
  sparse?: { play: number; rest: number };
  /** Ends after N bars instead of looping (stingers / one-shot cues). */
  bars?: number;
  /** Reverb send multiplier for this theme. */
  space: number;
  phases: PhaseSpec[];
}

export interface PortatoreSpec {
  /** Exactly seven notes in motif notation (scale degrees relative to the current key/mode). */
  notes: string;
  subdiv: number;
  tempo: number;
  key: string;
  mode: string;
  /** Instrument family per principal encounter id. */
  families: Record<string, InstrumentId>;
  heartbeat: InstrumentId;
  altar: { inst: InstrumentId; gain: number; every: number };
}

export interface PaletteSpec {
  name: string;
  modes: string[];
  keys: string[];
  tempo: [number, number];
  meters: number[];
  subdivs: number[];
  progressions: string[];
  space: number;
  inst: { pad: InstrumentId[]; bass: InstrumentId[]; arp: InstrumentId[]; motif: InstrumentId[]; counter: InstrumentId[]; perc: InstrumentId[]; sparkle: InstrumentId[] };
  perc_patterns: string[];
  arp_patterns: string[];
}

export const AMB_EVENTS = [
  'bird', 'cricket', 'owl', 'frog', 'drip', 'crackle', 'ember', 'thunder', 'bell_far', 'creak', 'water_lap', 'wave', 'gust', 'howl',
  'whisper', 'chain', 'anvil', 'ice_crack', 'chime', 'bubble', 'buzz', 'rustle', 'rumble', 'choir_far', 'whistle', 'knock', 'gull',
  'twinkle', 'dragon_far', 'wing_flap', 'shimmer', 'tick', 'glass_ring', 'moan', 'flame_roar', 'sail_flap', 'rope_creak', 'pollen',
  'stone_fall', 'reverse', 'heartbeat', 'lava_burst', 'wolf_far', 'raven',
] as const;
export type AmbEventKind = (typeof AMB_EVENTS)[number];

export const REVERB_ENVS = ['plains', 'cave', 'cathedral', 'glass', 'void', 'forest', 'hall'] as const;
export type ReverbEnv = (typeof REVERB_ENVS)[number];

export interface AmbienceBed {
  noise: 'white' | 'pink' | 'brown';
  filter: 'lowpass' | 'bandpass' | 'highpass';
  freq: number;
  q: number;
  gain: number;
  /** Slow gain/filter modulation (gusts, surf). rate Hz, depth 0..1. */
  lfo?: { rate: number; depth: number };
  /** Slow stereo drift rate (Hz). */
  drift?: number;
}

export interface AmbienceTone {
  /** MIDI note. */
  midi: number;
  wave: OscillatorType;
  gain: number;
  detune?: number;
  lfo?: { rate: number; depth: number };
}

export interface AmbienceEvent {
  kind: AmbEventKind;
  /** Average events per minute. */
  rate: number;
  gain: number;
  /** Only at night / only in daylight (alba, giorno). */
  night?: boolean;
  day?: boolean;
  /** Pitch multiplier. */
  pitch?: number;
}

export interface AmbienceSpec {
  env: ReverbEnv;
  beds: AmbienceBed[];
  tones: AmbienceTone[];
  events: AmbienceEvent[];
  /** Overall gain multiplier at night (default 0.85). */
  night: number;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Validation                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);

const ROLE_OCT: Record<LayerRole, number> = { pad: 4, bass: 2, arp: 4, motif: 5, counter: 4, perc: 4, ostinato: 3, drone: 2, portatore: 5, swell: 4, sparkle: 6 };

export function isInstrument(s: unknown): s is InstrumentId {
  return typeof s === 'string' && (INSTRUMENTS as readonly string[]).includes(s);
}

function checkMotif(src: string, where: string, errors: string[]): void {
  try {
    if (!parseMotif(src).some((n) => !n.rest)) errors.push(`${where}: motif has no notes`);
  } catch (e) {
    errors.push(`${where}: ${(e as Error).message}`);
  }
}
function checkProg(src: string, where: string, errors: string[]): void {
  try {
    parseProgression(src);
  } catch (e) {
    errors.push(`${where}: ${(e as Error).message}`);
  }
}

export function normalizeLayer(raw: unknown, where: string, errors: string[]): LayerSpec | null {
  if (!isObj(raw)) {
    errors.push(`${where}: layer must be an object`);
    return null;
  }
  const role = raw.role as LayerRole;
  if (!(ROLES as readonly string[]).includes(String(role))) {
    errors.push(`${where}: unknown role "${String(raw.role)}"`);
    return null;
  }
  if (!isInstrument(raw.inst)) {
    errors.push(`${where}: unknown instrument "${String(raw.inst)}"`);
    return null;
  }
  const l: LayerSpec = {
    role,
    inst: raw.inst,
    gain: num(raw.gain, 0.5),
    oct: num(raw.oct, ROLE_OCT[role]),
    every: num(raw.every, role === 'portatore' ? 8 : role === 'motif' ? 4 : 1),
    offset: num(raw.offset, 0),
    dir: (['up', 'down', 'updown', 'random'] as const).includes(raw.dir as 'up') ? (raw.dir as LayerSpec['dir']) : 'up',
    chance: num(raw.chance, 1),
    min_intensity: num(raw.min_intensity, 0),
    pan: num(raw.pan, 0),
    transpose: num(raw.transpose, 0),
  };
  if (typeof raw.pattern === 'string') {
    if (!isValidPattern(raw.pattern)) errors.push(`${where}: bad pattern "${raw.pattern}"`);
    l.pattern = raw.pattern;
  } else if (raw.pattern !== undefined) errors.push(`${where}: pattern must be a string`);
  if (typeof raw.notes === 'string') {
    checkMotif(raw.notes, `${where}.notes`, errors);
    l.notes = raw.notes;
  }
  if ((role === 'perc') && !l.pattern) errors.push(`${where}: perc layer needs a pattern`);
  if (l.gain < 0 || l.gain > 1.5) errors.push(`${where}: gain out of range`);
  if (l.every < 1) errors.push(`${where}: every must be >= 1`);
  if (l.pan < -1 || l.pan > 1) errors.push(`${where}: pan out of range`);
  return l;
}

export function normalizeTheme(raw: unknown, id: string, errors: string[]): ThemeSpec | null {
  if (!isObj(raw)) {
    errors.push(`${id}: theme must be an object`);
    return null;
  }
  const meterRaw = raw.meter;
  const meter = Array.isArray(meterRaw) ? meterRaw.map((m) => num(m, 4)) : [num(meterRaw, 4)];
  const kind = str(raw.kind, 'boss') as ThemeKind;
  const t: ThemeSpec = {
    id: str(raw.id, id),
    kind,
    boss: typeof raw.boss === 'string' ? raw.boss : undefined,
    act: num(raw.act, 1),
    character: str(raw.character, ''),
    key: str(raw.key, 'D'),
    mode: str(raw.mode, 'aeolian'),
    tempo: num(raw.tempo, 80),
    meter,
    subdiv: num(raw.subdiv, 2),
    progression: str(raw.progression, '1'),
    motif: str(raw.motif, '1:4'),
    space: num(raw.space, 1),
    phases: [],
  };
  if (isObj(raw.sparse)) t.sparse = { play: num(raw.sparse.play, 8), rest: num(raw.sparse.rest, 8) };
  if (raw.bars !== undefined) t.bars = num(raw.bars, 8);
  if (!['boss', 'mini', 'cue', 'explore', 'stinger'].includes(kind)) errors.push(`${id}: bad kind "${kind}"`);
  if (!(t.key in { C: 1, 'C#': 1, Db: 1, D: 1, 'D#': 1, Eb: 1, E: 1, F: 1, 'F#': 1, Gb: 1, G: 1, 'G#': 1, Ab: 1, A: 1, 'A#': 1, Bb: 1, B: 1 })) errors.push(`${id}: bad key "${t.key}"`);
  if (!(t.mode in MODES)) errors.push(`${id}: bad mode "${t.mode}"`);
  if (t.tempo < 20 || t.tempo > 240) errors.push(`${id}: tempo out of range`);
  if (meter.some((m) => m < 1 || m > 16)) errors.push(`${id}: bad meter`);
  if (t.subdiv < 1 || t.subdiv > 6) errors.push(`${id}: bad subdiv`);
  if (t.act < 1 || t.act > 7) errors.push(`${id}: act out of range`);
  if (!t.character) errors.push(`${id}: missing character description`);
  checkProg(t.progression, `${id}.progression`, errors);
  checkMotif(t.motif, `${id}.motif`, errors);
  if (!Array.isArray(raw.phases) || !raw.phases.length) {
    errors.push(`${id}: needs at least one phase`);
    return t;
  }
  raw.phases.forEach((p, i) => {
    const where = `${id}.phases[${i}]`;
    if (!isObj(p)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const ph: PhaseSpec = {
      id: str(p.id, `p${i + 1}`),
      intensity: num(p.intensity, 0.5),
      tempo: num(p.tempo, 1),
      mode: typeof p.mode === 'string' ? p.mode : undefined,
      key: typeof p.key === 'string' ? p.key : undefined,
      progression: typeof p.progression === 'string' ? p.progression : undefined,
      motif: typeof p.motif === 'string' ? p.motif : undefined,
      layers: [],
    };
    if (ph.mode && !(ph.mode in MODES)) errors.push(`${where}: bad mode "${ph.mode}"`);
    if (ph.progression) checkProg(ph.progression, `${where}.progression`, errors);
    if (ph.motif) checkMotif(ph.motif, `${where}.motif`, errors);
    if (ph.intensity < 0 || ph.intensity > 1) errors.push(`${where}: intensity out of range`);
    if (ph.tempo < 0.5 || ph.tempo > 2) errors.push(`${where}: tempo multiplier out of range`);
    if (!Array.isArray(p.layers) || !p.layers.length) errors.push(`${where}: needs layers`);
    else
      p.layers.forEach((l, j) => {
        const n = normalizeLayer(l, `${where}.layers[${j}]`, errors);
        if (n) ph.layers.push(n);
      });
    t.phases.push(ph);
  });
  return t;
}

export function normalizePortatore(raw: unknown, errors: string[]): PortatoreSpec | null {
  if (!isObj(raw)) {
    errors.push('portatore: must be an object');
    return null;
  }
  const notes = str(raw.notes, '');
  try {
    const m = parseMotif(notes);
    if (m.filter((n) => !n.rest).length !== 7 || m.some((n) => n.rest)) errors.push('portatore: notes must be exactly seven notes (no rests)');
  } catch (e) {
    errors.push(`portatore: ${(e as Error).message}`);
  }
  const fam: Record<string, InstrumentId> = {};
  if (isObj(raw.families))
    for (const [k, v] of Object.entries(raw.families)) {
      if (isInstrument(v)) fam[k] = v;
      else errors.push(`portatore.families.${k}: unknown instrument "${String(v)}"`);
    }
  const alt = isObj(raw.altar) ? raw.altar : {};
  const p: PortatoreSpec = {
    notes,
    subdiv: num(raw.subdiv, 2),
    tempo: num(raw.tempo, 66),
    key: str(raw.key, 'D'),
    mode: str(raw.mode, 'aeolian'),
    families: fam,
    heartbeat: isInstrument(raw.heartbeat) ? raw.heartbeat : 'heartbeat',
    altar: { inst: isInstrument(alt.inst) ? alt.inst : 'glass', gain: num(alt.gain, 0.3), every: num(alt.every, 8) },
  };
  if (!(p.mode in MODES)) errors.push(`portatore: bad mode "${p.mode}"`);
  return p;
}

export function normalizePalette(raw: unknown, where: string, errors: string[]): PaletteSpec | null {
  if (!isObj(raw)) {
    errors.push(`${where}: must be an object`);
    return null;
  }
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  const instRaw = isObj(raw.inst) ? raw.inst : {};
  const insts = (k: string): InstrumentId[] => {
    const a = arr(instRaw[k]);
    for (const x of a) if (!isInstrument(x)) errors.push(`${where}.inst.${k}: unknown instrument "${x}"`);
    if (!a.length) errors.push(`${where}.inst.${k}: empty`);
    return a.filter(isInstrument);
  };
  const p: PaletteSpec = {
    name: str(raw.name, where),
    modes: arr(raw.modes),
    keys: arr(raw.keys),
    tempo: Array.isArray(raw.tempo) && raw.tempo.length === 2 ? [num(raw.tempo[0], 60), num(raw.tempo[1], 90)] : [60, 90],
    meters: Array.isArray(raw.meters) ? raw.meters.map((m) => num(m, 4)) : [4],
    subdivs: Array.isArray(raw.subdivs) ? raw.subdivs.map((m) => num(m, 2)) : [2],
    progressions: arr(raw.progressions),
    space: num(raw.space, 1),
    inst: { pad: insts('pad'), bass: insts('bass'), arp: insts('arp'), motif: insts('motif'), counter: insts('counter'), perc: insts('perc'), sparkle: insts('sparkle') },
    perc_patterns: arr(raw.perc_patterns),
    arp_patterns: arr(raw.arp_patterns),
  };
  for (const m of p.modes) if (!(m in MODES)) errors.push(`${where}: bad mode "${m}"`);
  for (const pr of p.progressions) checkProg(pr, `${where}.progressions`, errors);
  for (const pt of [...p.perc_patterns, ...p.arp_patterns]) if (!isValidPattern(pt)) errors.push(`${where}: bad pattern "${pt}"`);
  if (!p.modes.length || !p.keys.length || !p.progressions.length || !p.perc_patterns.length || !p.arp_patterns.length) errors.push(`${where}: palette lists must not be empty`);
  return p;
}

export function normalizeAmbience(raw: unknown, id: string, errors: string[]): AmbienceSpec | null {
  if (!isObj(raw)) {
    errors.push(`ambience.${id}: must be an object`);
    return null;
  }
  const env = str(raw.env, 'plains') as ReverbEnv;
  if (!(REVERB_ENVS as readonly string[]).includes(env)) errors.push(`ambience.${id}: bad env "${env}"`);
  const beds: AmbienceBed[] = [];
  if (Array.isArray(raw.beds))
    raw.beds.forEach((b, i) => {
      if (!isObj(b)) return;
      const noise = str(b.noise, 'pink') as AmbienceBed['noise'];
      const filter = str(b.filter, 'lowpass') as AmbienceBed['filter'];
      if (!['white', 'pink', 'brown'].includes(noise)) errors.push(`ambience.${id}.beds[${i}]: bad noise`);
      if (!['lowpass', 'bandpass', 'highpass'].includes(filter)) errors.push(`ambience.${id}.beds[${i}]: bad filter`);
      const bed: AmbienceBed = { noise, filter, freq: num(b.freq, 800), q: num(b.q, 0.7), gain: num(b.gain, 0.2) };
      if (isObj(b.lfo)) bed.lfo = { rate: num(b.lfo.rate, 0.1), depth: num(b.lfo.depth, 0.4) };
      if (b.drift !== undefined) bed.drift = num(b.drift, 0.05);
      beds.push(bed);
    });
  const tones: AmbienceTone[] = [];
  if (Array.isArray(raw.tones))
    raw.tones.forEach((t) => {
      if (!isObj(t)) return;
      const tone: AmbienceTone = { midi: num(t.midi, 38), wave: str(t.wave, 'sine') as OscillatorType, gain: num(t.gain, 0.05) };
      if (t.detune !== undefined) tone.detune = num(t.detune, 0);
      if (isObj(t.lfo)) tone.lfo = { rate: num(t.lfo.rate, 0.1), depth: num(t.lfo.depth, 0.4) };
      tones.push(tone);
    });
  const events: AmbienceEvent[] = [];
  if (Array.isArray(raw.events))
    raw.events.forEach((e, i) => {
      if (!isObj(e)) return;
      const kind = e.kind as AmbEventKind;
      if (!(AMB_EVENTS as readonly string[]).includes(String(kind))) {
        errors.push(`ambience.${id}.events[${i}]: unknown kind "${String(e.kind)}"`);
        return;
      }
      const ev: AmbienceEvent = { kind, rate: num(e.rate, 4), gain: num(e.gain, 0.2) };
      if (e.night) ev.night = true;
      if (e.day) ev.day = true;
      if (e.pitch !== undefined) ev.pitch = num(e.pitch, 1);
      events.push(ev);
    });
  if (!beds.length && !tones.length) errors.push(`ambience.${id}: needs at least one bed or tone`);
  return { env, beds, tones, events, night: num(raw.night, 0.85) };
}

/** Full validation of a content.bundle.music object; returns error strings (empty = valid). */
export function validateMusicBundle(music: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [k, v] of Object.entries(music)) {
    if (k.startsWith('boss_')) {
      const t = normalizeTheme(v, k, errors);
      if (t && t.id !== k) errors.push(`${k}: id must equal file name`);
    } else if (k === 'cues') {
      if (!isObj(v)) errors.push('cues: must be a map');
      else for (const [id, th] of Object.entries(v)) normalizeTheme(th, id, errors);
    } else if (k === 'portatore') normalizePortatore(v, errors);
    else if (k === 'palettes') {
      const acts = isObj(v) && isObj(v.acts) ? v.acts : null;
      if (!acts) errors.push('palettes: needs acts map');
      else for (const [n, p] of Object.entries(acts)) normalizePalette(p, `palettes.acts.${n}`, errors);
    } else if (k === 'ambience') {
      if (!isObj(v)) errors.push('ambience: must be a map');
      else for (const [id, a] of Object.entries(v)) normalizeAmbience(a, id, errors);
    } else errors.push(`music: unknown file "${k}"`);
  }
  return errors;
}
