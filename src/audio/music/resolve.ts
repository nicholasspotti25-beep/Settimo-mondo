/**
 * Music library: normalizes content.bundle.music once and resolves cue ids to (theme, phase). Unknown cue ids still get
 * fitting music: a procedural theme seeded by the id and shaped by the act palette (pure, deterministic).
 */
import { AudioRng, hashString } from '../core/rng';
import {
  normalizeAmbience, normalizePalette, normalizePortatore, normalizeTheme, type AmbienceSpec, type InstrumentId, type LayerSpec,
  type PaletteSpec, type PhaseSpec, type PortatoreSpec, type ThemeKind, type ThemeSpec,
} from './data';
import { MODES } from './theory';

export interface MusicLibrary {
  themes: Map<string, ThemeSpec>;
  palettes: Map<number, PaletteSpec>;
  portatore: PortatoreSpec | null;
  ambience: Map<string, AmbienceSpec>;
  errors: string[];
  /** Generated themes are cached so repeated cues are identical and cheap. */
  generated: Map<string, ThemeSpec>;
}

export function buildLibrary(music: Record<string, unknown> | undefined): MusicLibrary {
  const lib: MusicLibrary = { themes: new Map(), palettes: new Map(), portatore: null, ambience: new Map(), errors: [], generated: new Map() };
  const m = music ?? {};
  for (const [k, v] of Object.entries(m)) {
    if (k.startsWith('boss_')) {
      const t = normalizeTheme(v, k, lib.errors);
      if (t) lib.themes.set(k, t);
    } else if (k === 'cues' && v && typeof v === 'object') {
      for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
        const t = normalizeTheme(raw, id, lib.errors);
        if (t) lib.themes.set(id, t);
      }
    } else if (k === 'portatore') lib.portatore = normalizePortatore(v, lib.errors);
    else if (k === 'palettes' && v && typeof v === 'object') {
      const acts = (v as Record<string, unknown>).acts as Record<string, unknown> | undefined;
      for (const [n, p] of Object.entries(acts ?? {})) {
        const pal = normalizePalette(p, `palettes.acts.${n}`, lib.errors);
        if (pal) lib.palettes.set(Number(n), pal);
      }
    } else if (k === 'ambience' && v && typeof v === 'object') {
      for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
        const a = normalizeAmbience(raw, id, lib.errors);
        if (a) lib.ambience.set(id, a);
      }
    }
  }
  return lib;
}

export interface ResolvedCue {
  theme: ThemeSpec;
  phase: number;
  generated: boolean;
  /** Base cue id (phase suffix removed). */
  base: string;
}

const PHASE_RE = /^(.+)_p(\d+)$/;

/** Split `boss_x_p2` into base `boss_x` and phase index 1. */
export function splitCue(id: string): { base: string; phase: number } {
  const m = PHASE_RE.exec(id);
  if (m) return { base: m[1], phase: Math.max(0, Number(m[2]) - 1) };
  return { base: id, phase: 0 };
}

export function resolveCue(lib: MusicLibrary, id: string, act: number, hint?: { kind?: ThemeKind }): ResolvedCue {
  const direct = lib.themes.get(id);
  if (direct) return { theme: direct, phase: 0, generated: false, base: id };
  const { base, phase } = splitCue(id);
  const t = lib.themes.get(base);
  if (t) return { theme: t, phase: Math.min(phase, t.phases.length - 1), generated: false, base };
  const kind: ThemeKind = hint?.kind ?? (base.startsWith('boss_') ? 'boss' : base.startsWith('explore') ? 'explore' : 'cue');
  const g = generateTheme(lib, base, act, kind);
  return { theme: g, phase: Math.min(phase, g.phases.length - 1), generated: true, base };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Procedural fallback                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const DEFAULT_PALETTE: PaletteSpec = {
  name: 'default',
  modes: ['aeolian', 'dorian'],
  keys: ['D', 'A', 'E'],
  tempo: [62, 84],
  meters: [4, 3],
  subdivs: [2],
  progressions: ['1 6 4 5', '1 7 6 7', '1 4 6 5'],
  space: 1,
  inst: { pad: ['strings'], bass: ['cello'], arp: ['harp'], motif: ['flute', 'horn'], counter: ['reed'], perc: ['frame_drum', 'timpani'], sparkle: ['celesta'] },
  perc_patterns: ['X.......o.......', 'x...o...x...o...'],
  arp_patterns: ['x.x.x.x.', 'x..x..x.'],
};

function layer(role: LayerSpec['role'], inst: InstrumentId, gain: number, extra: Partial<LayerSpec> = {}): LayerSpec {
  const oct: Record<LayerSpec['role'], number> = { pad: 4, bass: 2, arp: 4, motif: 5, counter: 4, perc: 4, ostinato: 3, drone: 2, portatore: 5, swell: 4, sparkle: 6 };
  return {
    role, inst, gain, oct: oct[role], every: role === 'motif' ? 4 : role === 'portatore' ? 8 : 1, offset: 0, dir: 'up', chance: 1, min_intensity: 0, pan: 0, transpose: 0,
    ...extra,
  };
}

function genMotif(rng: AudioRng, steps: number, subdiv: number): string {
  const lens = subdiv === 3 ? [1, 2, 3, 3, 6] : [1, 2, 2, 3, 4];
  let deg = rng.pick([1, 3, 5, 5, 8]);
  let left = steps;
  const toks: string[] = [];
  let i = 0;
  while (left > 0 && i < 12) {
    let l = Math.min(left, rng.pick(lens));
    if (left - l < 1) l = left;
    const shown = deg <= 7 ? `${deg}` : `${deg - 7}+`;
    toks.push(rng.chance(0.08) && i > 0 ? `r:${l}` : `${shown}:${l}`);
    left -= l;
    // stepwise motion, with an occasional leap
    deg += rng.chance(0.25) ? rng.pick([-3, 3, 4, -4]) : rng.pick([-1, 1, 1, -1, 2, -2]);
    deg = Math.max(1, Math.min(10, deg));
    i++;
  }
  if (!toks.some((t) => !t.startsWith('r:'))) toks[0] = `1:${steps}`;
  return toks.join(' ');
}

/** Deterministic theme for any cue id, shaped by the act palette. */
export function generateTheme(lib: MusicLibrary, id: string, act: number, kind: ThemeKind): ThemeSpec {
  const a = Math.max(1, Math.min(7, Math.round(act) || 1));
  const cacheKey = `${id}@${a}:${kind}`;
  const cached = lib.generated.get(cacheKey);
  if (cached) return cached;
  const pal = lib.palettes.get(a) ?? DEFAULT_PALETTE;
  const rng = new AudioRng(hashString(id) ^ Math.imul(a, 0x9e3779b1));
  const mini = kind === 'mini';
  const explore = kind === 'explore';
  const meter = rng.pick(pal.meters);
  const subdiv = rng.pick(pal.subdivs);
  const mode = rng.pick(pal.modes.filter((m) => m in MODES).length ? pal.modes : DEFAULT_PALETTE.modes);
  let tempo = Math.round(rng.range(pal.tempo[0], pal.tempo[1]));
  if (mini) tempo = Math.round(tempo * 1.15);
  if (explore) tempo = Math.round(tempo * 0.85);
  const theme: ThemeSpec = {
    id,
    kind,
    act: a,
    character: `generated (${pal.name})`,
    key: rng.pick(pal.keys),
    mode,
    tempo,
    meter: [meter],
    subdiv,
    progression: rng.pick(pal.progressions),
    motif: genMotif(rng, meter * subdiv * 2, subdiv),
    space: pal.space,
    phases: [],
  };
  if (explore) theme.sparse = { play: 8, rest: 12 };
  const pad = rng.pick(pal.inst.pad);
  const bass = rng.pick(pal.inst.bass);
  const arp = rng.pick(pal.inst.arp);
  const motif = rng.pick(pal.inst.motif);
  const counter = rng.pick(pal.inst.counter);
  const perc = rng.pick(pal.inst.perc);
  const perc2 = rng.pick(pal.inst.perc);
  const sparkle = rng.pick(pal.inst.sparkle);
  const pp = rng.pick(pal.perc_patterns);
  const ap = rng.pick(pal.arp_patterns);
  const nPhases = kind === 'boss' || mini ? 4 : 1;
  for (let i = 0; i < nPhases; i++) {
    const layers: LayerSpec[] = [];
    if (explore) {
      layers.push(layer('pad', pad, 0.35), layer('motif', motif, 0.32, { every: 8, chance: 0.9 }), layer('sparkle', sparkle, 0.16, { chance: 0.3 }));
    } else if (kind === 'cue' || kind === 'stinger') {
      layers.push(layer('pad', pad, 0.45), layer('bass', bass, 0.35, { pattern: 'x' + '.'.repeat(meter * subdiv - 1) }), layer('motif', motif, 0.42, { every: 2 }), layer('sparkle', sparkle, 0.18, { chance: 0.4 }));
    } else {
      layers.push(layer('pad', pad, mini ? 0.3 : 0.42));
      layers.push(layer('bass', bass, 0.42, { pattern: mini ? 'x.x.' : 'x' + '.'.repeat(Math.max(0, meter * subdiv / 2 - 1)) }));
      layers.push(layer('perc', perc, mini ? 0.55 : 0.4, { pattern: pp, min_intensity: mini ? 0 : 0.3 }));
      if (mini || i >= 1) layers.push(layer('perc', perc2, 0.32, { pattern: mini ? 'x.o.x.o.' : 'o.o.o.o.', chance: 0.85 }));
      layers.push(layer('motif', motif, 0.48, { every: mini ? 2 : 4 }));
      if (i >= 1) layers.push(layer('arp', arp, 0.3, { pattern: ap, dir: rng.pick(['up', 'updown', 'down'] as const) }));
      if (i >= 2) layers.push(layer('counter', counter, 0.3));
      if (i >= 2) layers.push(layer('swell', 'reverse_swell', 0.25, { every: 4 }));
    }
    const ph: PhaseSpec = { id: `p${i + 1}`, intensity: Math.min(1, (mini ? 0.55 : 0.35) + i * 0.2), tempo: 1 + i * (mini ? 0.06 : 0.05), layers };
    theme.phases.push(ph);
  }
  lib.generated.set(cacheKey, theme);
  return theme;
}

/** Fallback ambience for an unknown ambience id: a wind bed shaped by act. */
export function generateAmbience(id: string, act: number): AmbienceSpec {
  const rng = new AudioRng(hashString(`amb:${id}`));
  const dark = act === 2 || act === 6;
  return {
    env: act === 7 ? 'void' : dark ? 'cave' : 'plains',
    beds: [
      { noise: 'pink', filter: 'bandpass', freq: rng.range(300, 900), q: 0.6, gain: 0.22, lfo: { rate: rng.range(0.04, 0.12), depth: 0.5 }, drift: 0.03 },
      { noise: 'brown', filter: 'lowpass', freq: dark ? 180 : 260, q: 0.5, gain: 0.18 },
    ],
    tones: dark ? [{ midi: 33, wave: 'sine', gain: 0.03, lfo: { rate: 0.05, depth: 0.5 } }] : [],
    events: [{ kind: 'gust', rate: 3, gain: 0.25 }, { kind: dark ? 'rumble' : 'rustle', rate: 4, gain: 0.18 }],
    night: 0.85,
  };
}
