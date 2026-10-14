/**
 * Synthesized SFX recipes. Every recipe schedules nodes from time t into `o.dest` and returns its end time.
 * Nothing is sampled: noise shaping, FM, filtered impacts, formant voices and granular-ish click clouds.
 */
import { fm, noise, panNode, shaper, tone, amp, mtof, type Out } from '../engine/nodes';
import { bell, chime, click, crunch, elementLayer, impact, rumble, sparkle, swell, thump, voiceRoar, whoosh, type SfxParams } from './kit';
import type { SwingFamily, Surface, VoiceFamily } from './families';

export type Recipe = (o: Out, t: number, p: SfxParams) => number;

/* ------------------------------------------------------------------------------------------------------------------ */
/* UI                                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const ui: Record<string, Recipe> = {
  ui_move: (o, t) => tone(o, t, { f: 2093, dur: 0.06, a: 0.002, gain: 0.08, filter: { type: 'lowpass', f: 5000 } }),
  ui_confirm: (o, t) => {
    chime(o, t, 1318.5, 0.45, 0.14);
    return chime(o, t, 1975.5, 0.6, 0.12, 0.06);
  },
  ui_back: (o, t) => {
    chime(o, t, 1568, 0.3, 0.1);
    return chime(o, t, 1174.7, 0.4, 0.09, 0.05);
  },
  ui_error: (o, t) => {
    tone(o, t, { type: 'triangle', f: 196, dur: 0.12, gain: 0.14, filter: { type: 'lowpass', f: 900 } });
    return tone(o, t, { type: 'triangle', f: 185, dur: 0.14, gain: 0.14, delay: 0.11, filter: { type: 'lowpass', f: 900 } });
  },
  ui_open: (o, t) => {
    whoosh(o, t, 600, 3000, 0.25, 0.06, 0.8, 'pink');
    return chime(o, t, 1760, 0.6, 0.08, 0.08);
  },
  ui_close: (o, t) => {
    whoosh(o, t, 3000, 600, 0.22, 0.05, 0.8, 'pink');
    return chime(o, t, 1318.5, 0.4, 0.06, 0.04);
  },
  ui_toggle: (o, t) => {
    click(o, t, 3200, 0.12, 0.015, 3);
    return tone(o, t, { f: 1568, dur: 0.08, gain: 0.07, delay: 0.02 });
  },
  ui_slider: (o, t) => click(o, t, 4000, 0.06, 0.01, 4),
  ui_tab: (o, t) => {
    click(o, t, 2500, 0.1, 0.015, 3);
    return chime(o, t, 2349, 0.3, 0.06, 0.02);
  },
  ui_start: (o, t) => {
    swell(o, t, 0.9, 0.12, 400, 4000);
    sparkle(o, t + 0.85, 784, 5, 0.07, 0.1, [1, 1.5, 2, 2.5, 3]);
    return t + 2.2;
  },
  ui_equip: (o, t) => {
    click(o, t, 1800, 0.14, 0.02, 2);
    noise(o, t, { dur: 0.12, a: 0.01, gain: 0.06, filter: { type: 'bandpass', f: 4000, f1: 6000, q: 3 } });
    return chime(o, t, 1568, 0.4, 0.07, 0.05);
  },
};
ui.ui_select = ui.ui_confirm;
ui.ui_cancel = ui.ui_back;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Footsteps                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

interface StepDef {
  thud: [number, number];
  color: 'white' | 'pink' | 'brown';
  ft: BiquadFilterType;
  f: number;
  f1?: number;
  q: number;
  dur: number;
  g: number;
  a?: number;
  extra?: (o: Out, t: number, g: number, pm: number) => void;
}

const STEPS: Record<Surface, StepDef> = {
  stone: { thud: [110, 0.22], color: 'white', ft: 'bandpass', f: 2200, q: 1.2, dur: 0.05, g: 0.3, extra: (o, t, g, pm) => click(o, t, 4200 * pm, g * 0.3, 0.012, 2, 0.012) },
  grass: { thud: [90, 0.1], color: 'pink', ft: 'highpass', f: 2400, q: 0.7, dur: 0.14, g: 0.3, a: 0.025 },
  moss: { thud: [80, 0.16], color: 'pink', ft: 'lowpass', f: 900, q: 0.7, dur: 0.08, g: 0.3 },
  mud: { thud: [70, 0.22], color: 'brown', ft: 'bandpass', f: 450, f1: 1300, q: 4, dur: 0.16, g: 0.5 },
  water: {
    thud: [0, 0], color: 'white', ft: 'bandpass', f: 900, f1: 2500, q: 2, dur: 0.2, g: 0.3,
    extra: (o, t, g, pm) => {
      for (let i = 0; i < 3; i++) tone(o, t, { f: o.rng.range(900, 2400) * pm, f1: o.rng.range(1500, 3200) * pm, dur: 0.05, gain: g * 0.12, delay: 0.04 + i * 0.05 });
    },
  },
  wood: { thud: [165, 0.32], color: 'white', ft: 'bandpass', f: 1100, q: 3, dur: 0.045, g: 0.25, extra: (o, t, g) => thump(o, t, 240, 200, 0.12, g * 0.2, 0.004) },
  ash: { thud: [80, 0.12], color: 'pink', ft: 'lowpass', f: 2500, q: 0.7, dur: 0.1, g: 0.22, extra: (o, t, g, pm) => crunch(o, t, 3500 * pm, g * 0.15, 3, 0.05) },
  snow: { thud: [70, 0.1], color: 'white', ft: 'bandpass', f: 3000, q: 0.8, dur: 0.06, g: 0.12, extra: (o, t, g, pm) => crunch(o, t, 2600 * pm, g * 0.4, 6, 0.09) },
  ice: { thud: [140, 0.14], color: 'white', ft: 'highpass', f: 4000, q: 0.7, dur: 0.03, g: 0.28, extra: (o, t, g, pm) => tone(o, t, { f: 2600 * pm * o.rng.range(0.95, 1.05), dur: 0.14, gain: g * 0.035 }) },
  sand: { thud: [60, 0.08], color: 'white', ft: 'highpass', f: 3200, q: 0.7, dur: 0.13, g: 0.18, a: 0.02 },
  marble: { thud: [130, 0.2], color: 'white', ft: 'bandpass', f: 3600, q: 1.5, dur: 0.03, g: 0.32 },
  bone: { thud: [120, 0.12], color: 'white', ft: 'bandpass', f: 1600, q: 5, dur: 0.04, g: 0.32, extra: (o, t, g, pm) => click(o, t, 2200 * pm, g * 0.4, 0.02, 6, 0.03) },
  obsidian: { thud: [120, 0.16], color: 'white', ft: 'bandpass', f: 5000, q: 2, dur: 0.03, g: 0.28, extra: (o, t, g, pm) => tone(o, t, { f: 3800 * pm, dur: 0.1, gain: g * 0.04 }) },
  soil: { thud: [70, 0.24], color: 'brown', ft: 'lowpass', f: 700, q: 0.7, dur: 0.07, g: 0.3 },
  bark: { thud: [140, 0.28], color: 'pink', ft: 'bandpass', f: 700, q: 2, dur: 0.05, g: 0.25 },
  void: { thud: [50, 0.28], color: 'pink', ft: 'lowpass', f: 400, q: 0.7, dur: 0.06, g: 0.1, extra: (o, t, g) => tone(o, t, { f: 1200, f1: 900, dur: 0.22, gain: g * 0.035 }) },
  cloud: { thud: [0, 0], color: 'pink', ft: 'lowpass', f: 650, q: 0.7, dur: 0.2, g: 0.2, a: 0.04 },
};

/** kind = surface; size = listener scale (0.1 tiny, 3 Gigante); flag = sprint. */
export function footstep(o: Out, t: number, p: SfxParams, surface: Surface): number {
  const d = STEPS[surface];
  const sc = p.size;
  const pm = (sc < 0.5 ? 1.45 : sc > 2 ? 0.55 : 1) * o.rng.range(0.92, 1.08);
  const gm = (sc < 0.5 ? 0.7 : sc > 2 ? 1.6 : 1) * (p.flag ? 1.25 : 1) * o.rng.range(0.8, 1);
  let end = t;
  if (d.thud[1] > 0) end = thump(o, t, d.thud[0] * pm, d.thud[0] * 0.6 * pm, 0.09 * (sc > 2 ? 2.5 : 1), d.thud[1] * gm);
  end = Math.max(end, noise(o, t, { color: d.color, dur: d.dur * (p.flag ? 0.85 : 1), a: d.a ?? 0.002, gain: d.g * gm, filter: { type: d.ft, f: d.f * pm, f1: d.f1 ? d.f1 * pm : undefined, q: d.q } }));
  d.extra?.(o, t, gm, pm);
  if (sc > 2) end = Math.max(end, rumble(o, t, 0.45, 0.25, 90));
  return end + 0.1;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Weapons                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

function rattle(o: Out, t: number, g: number, n = 5, spread = 0.14): number {
  let e = t;
  for (let i = 0; i < n; i++) e = Math.max(e, fm(o, t, { f: o.rng.range(2200, 4200), ratio: 1.73, index: 1.5, dur: 0.05, gain: g * o.rng.range(0.4, 1), delay: o.rng.next() * spread }));
  return e;
}

export function swing(o: Out, t: number, p: SfxParams, fam: SwingFamily): number {
  const h = p.heavy;
  const hm = h ? 1.35 : 1;
  const pv = o.rng.range(0.94, 1.06) * p.pitch;
  const thrust = p.flag;
  switch (fam) {
    case 'blade':
      whoosh(o, t, (h ? 900 : 1400) * pv, (h ? 2600 : 3800) * pv, thrust ? 0.12 : 0.17 * hm, 0.32 * hm, 1.6);
      if (!h) tone(o, t, { f: 5200 * pv, f1: 4700 * pv, dur: 0.14, gain: 0.018, delay: 0.03 });
      return t + 0.35;
    case 'heavy_blade':
      whoosh(o, t, 500 * pv, 1700 * pv, 0.32 * hm, 0.4 * hm, 1, 'pink');
      return whoosh(o, t, 250 * pv, 600 * pv, 0.36 * hm, 0.22 * hm, 0.8, 'pink');
    case 'thin':
      whoosh(o, t, 3000 * pv, 6000 * pv, 0.1, 0.22, 4);
      return tone(o, t, { f: 4200 * pv, f1: 3600 * pv, dur: 0.1, gain: 0.02, delay: 0.02 });
    case 'dagger':
      return whoosh(o, t, 2400 * pv, 5200 * pv, 0.085 * hm, 0.24 * hm, 2);
    case 'shears':
      whoosh(o, t, 1300 * pv, 3500 * pv, 0.16 * hm, 0.28 * hm, 1.5);
      fm(o, t, { f: 3600 * pv, ratio: 1.41, index: 2, dur: 0.12, gain: 0.07, delay: 0.1 });
      return click(o, t, 5000, 0.2, 0.02, 6, 0.1);
    case 'axe':
      whoosh(o, t, 450 * pv, 1500 * pv, 0.28 * hm, 0.38 * hm, 1.1);
      return whoosh(o, t, 200 * pv, 500 * pv, 0.3 * hm, 0.18 * hm, 0.8, 'pink');
    case 'blunt':
      whoosh(o, t, 300 * pv, 900 * pv, 0.32 * hm, 0.42 * hm, 0.9, 'pink');
      return tone(o, t, { type: 'triangle', f: 70 * pv, f1: 55, dur: 0.3 * hm, a: 0.1, gain: 0.1 * hm });
    case 'polearm':
      if (thrust) return whoosh(o, t, 1500 * pv, 3600 * pv, 0.13 * hm, 0.32 * hm, 1.8);
      whoosh(o, t, 800 * pv, 2400 * pv, 0.25 * hm, 0.34 * hm, 1.3);
      return whoosh(o, t, 400 * pv, 900 * pv, 0.3 * hm, 0.12, 0.8, 'pink', 0.05);
    case 'harpoon':
      whoosh(o, t, 1200 * pv, 3000 * pv, 0.18 * hm, 0.3 * hm, 1.6);
      return rattle(o, t + 0.05, 0.06, 6, 0.2);
    case 'drill': {
      const end = t + 0.35 * hm;
      const d = amp(o, t, end, 38, 0.6);
      whoosh(o, t, 600 * pv, 1800 * pv, 0.35 * hm, 0.3, 1, 'pink');
      tone(o, t, { type: 'sawtooth', f: 95 * pv, f1: 130 * pv, dur: 0.35 * hm, a: 0.03, gain: 0.08, dest: d, filter: { type: 'lowpass', f: 900 } });
      return end;
    }
    case 'scythe':
      whoosh(o, t, 700 * pv, 2600 * pv, 0.38 * hm, 0.36 * hm, 1.2);
      return tone(o, t, { f: 880 * pv, f1: 660 * pv, dur: 0.45, a: 0.08, gain: 0.025, vib: [9, 30] });
    case 'whip':
      whoosh(o, t, 800 * pv, 3200 * pv, 0.17 * hm, 0.24 * hm, 1.3);
      noise(o, t, { dur: 0.03, a: 0.001, gain: 0.5 * hm, delay: 0.15 * hm, filter: { type: 'highpass', f: 2500 } });
      return click(o, t, 3500, 0.4 * hm, 0.02, 0.7, 0.15 * hm);
    case 'chain':
      whoosh(o, t, 600 * pv, 2200 * pv, 0.24 * hm, 0.3 * hm, 1.1);
      return rattle(o, t, 0.09 * hm, 7, 0.22);
    case 'flail': {
      const end = t + 0.42 * hm;
      const d = amp(o, t, end, 9, 0.7);
      noise(o, t, { dur: 0.42 * hm, a: 0.12, gain: 0.4 * hm, dest: d, filter: { type: 'bandpass', f: 500 * pv, f1: 1400 * pv, q: 1 } });
      rattle(o, t, 0.06, 5, 0.3);
      return end;
    }
    case 'bow':
      tone(o, t, { type: 'triangle', f: 220 * pv, f1: 180 * pv, dur: 0.28, a: 0.001, gain: 0.16, filter: { type: 'lowpass', f: 2500 } });
      click(o, t, 3000, 0.25, 0.02, 1.5);
      return whoosh(o, t, 2200, 4200, 0.22, 0.12, 3, 'white', 0.02);
    case 'crossbow':
      click(o, t, 1800, 0.45, 0.03, 3);
      thump(o, t, 220, 90, 0.12, 0.3);
      return whoosh(o, t, 2500, 5000, 0.18, 0.12, 3, 'white', 0.02);
    case 'disc': {
      const end = t + 0.4;
      const d = amp(o, t, end, 17, 0.7);
      noise(o, t, { dur: 0.4, a: 0.05, gain: 0.35, dest: d, filter: { type: 'bandpass', f: 1800 * pv, q: 2 } });
      fm(o, t, { f: 2900 * pv, ratio: 1.6, index: 1, dur: 0.35, gain: 0.03 });
      return end;
    }
    case 'catalyst':
      noise(o, t, { color: 'pink', dur: 0.3, a: 0.08, gain: 0.12 * hm, filter: { type: 'highpass', f: 1800 } });
      return sparkle(o, t, (h ? 523 : 784) * pv, h ? 4 : 3, 0.045, 0.05);
    case 'fist':
      return whoosh(o, t, 600 * pv, 1400 * pv, (h ? 0.16 : 0.1), 0.3 * hm, 1);
    case 'claw':
      whoosh(o, t, 2000 * pv, 4500 * pv, 0.12 * hm, 0.26 * hm, 1.6);
      return noise(o, t, { dur: 0.1, a: 0.01, gain: 0.08, delay: 0.06, filter: { type: 'bandpass', f: 3200, f1: 2000, q: 6 } });
    case 'shield':
      whoosh(o, t, 380 * pv, 900 * pv, 0.22 * hm, 0.32 * hm, 0.8, 'pink');
      return fm(o, t, { f: 420 * pv, ratio: 2.4, index: 1.5, dur: 0.25, gain: 0.04, delay: 0.12 });
    case 'shapeshift':
      fm(o, t, { f: 300 * pv, f1: 900 * pv, ratio: 1.5, index: 2, dur: 0.25, gain: 0.05 });
      return whoosh(o, t, 900 * pv, 3000 * pv, 0.22, 0.3, 1.3);
    default:
      return whoosh(o, t, 900, 2600, 0.2, 0.3);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Arts (by effect type)                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export function art(o: Out, t: number, p: SfxParams): number {
  const el = p.element;
  const g = p.flag ? 1.15 : 1; // seconda = bigger
  // Eco release shimmer shared by every Art
  chime(o, t, 1046.5, 0.5, 0.05 * g);
  chime(o, t, 1568, 0.5, 0.04 * g, 0.03);
  switch (p.kind) {
    case 'dash_strike':
      whoosh(o, t, 300, 4000, 0.45, 0.45 * g, 1);
      return tone(o, t, { type: 'sawtooth', f: 110, f1: 330, dur: 0.4, gain: 0.05, filter: { type: 'lowpass', f: 1500 } });
    case 'spin': {
      const end = t + 0.75;
      const d = amp(o, t, end, 7, 0.65);
      noise(o, t, { dur: 0.75, a: 0.08, gain: 0.5 * g, dest: d, filter: { type: 'bandpass', f: 900, f1: 2200, q: 1.2 } });
      fm(o, t, { f: 1500, ratio: 2.41, index: 1.2, dur: 0.6, gain: 0.03 });
      return end;
    }
    case 'multi_strike': {
      let e = t;
      for (let i = 0; i < 5; i++) e = whoosh(o, t, 1500, 3800, 0.1, 0.25 * g, 1.5, 'white', i * 0.085);
      return e;
    }
    case 'counter_stance':
      fm(o, t, { f: 880, ratio: 2.0, index: 0.8, dur: 1.2, a: 0.02, gain: 0.07 });
      return tone(o, t, { type: 'triangle', f: 220, dur: 1.0, a: 0.1, gain: 0.06, vib: [5, 10] });
    case 'projectile':
      tone(o, t, { type: 'triangle', f: 400, f1: 1300, dur: 0.25, gain: 0.08 });
      whoosh(o, t, 800, 3000, 0.3, 0.3 * g, 1.2);
      return elementLayer(o, t, el, false, 0.3 * g);
    case 'rain':
      sparkle(o, t, 880, 5, 0.06, 0.05);
      return crunch(o, t + 0.5, 3000, 0.12, 14, 1.0);
    case 'ground_wave':
      noise(o, t, { color: 'brown', dur: 0.9, a: 0.05, gain: 0.6 * g, filter: { type: 'lowpass', f: 200, f1: 900 } });
      crunch(o, t, 1800, 0.2, 8, 0.7);
      return elementLayer(o, t, el, true, 0.3 * g);
    case 'slam':
      impact(o, t + 0.12, true, 0.7 * g, 0.8);
      rumble(o, t + 0.12, 0.9, 0.35 * g);
      return elementLayer(o, t + 0.12, el, true, 0.35 * g);
    case 'grab_pull':
      rattle(o, t, 0.08, 8, 0.4);
      return noise(o, t, { dur: 0.5, gain: 0.3, rev: true, filter: { type: 'bandpass', f: 2500, f1: 600, q: 1 } });
    case 'buff_self':
      swell(o, t, 0.5, 0.25 * g, 300, 3000);
      elementLayer(o, t + 0.5, el, false, 0.4);
      return sparkle(o, t + 0.5, 659, 4, 0.05, 0.05);
    case 'bind':
      tone(o, t, { type: 'sawtooth', f: 70, dur: 0.9, a: 0.05, gain: 0.12, filter: { type: 'bandpass', f: 300, f1: 900, q: 12 } });
      return crunch(o, t, 1200, 0.25, 8, 0.6);
    case 'hazard_zone': {
      let e = t;
      for (let i = 0; i < 8; i++) e = tone(o, t, { f: o.rng.range(200, 500), f1: o.rng.range(700, 1300), dur: 0.08, gain: 0.08, delay: i * 0.07 });
      return Math.max(e, elementLayer(o, t, el, false, 0.3));
    }
    case 'barrier':
      for (const f of [1318, 1661, 1976, 2637]) chime(o, t, f, 1.2, 0.04, o.rng.next() * 0.05);
      return tone(o, t, { type: 'triangle', f: 110, dur: 1.0, a: 0.05, gain: 0.08 });
    case 'decoy':
      for (const f of [1046, 1052, 1568, 1575]) chime(o, t, f, 0.9, 0.04);
      return whoosh(o, t, 3000, 800, 0.4, 0.2, 1.2, 'pink');
    case 'beam':
      tone(o, t, { type: 'sawtooth', f: 110, f1: 220, dur: 0.5, gain: 0.08, rev: true, filter: { type: 'lowpass', f: 400, f1: 3000 } });
      noise(o, t + 0.45, { dur: 0.9, a: 0.02, hold: 0.5, gain: 0.25 * g, filter: { type: 'bandpass', f: 2600, q: 0.8 } });
      return elementLayer(o, t + 0.45, el === 'physical' ? 'light' : el, true, 0.3);
    case 'chain_lightning':
      for (let i = 0; i < 3; i++) elementLayer(o, t + i * 0.12, 'lightning', false, 0.35);
      return t + 0.8;
    case 'black_hole':
      noise(o, t, { color: 'pink', dur: 1.2, gain: 0.4 * g, rev: true, filter: { type: 'lowpass', f: 4000, f1: 150 } });
      return tone(o, t, { type: 'sine', f: 60, f1: 32, dur: 1.6, a: 0.2, gain: 0.35 });
    case 'throw_return': {
      const end = t + 0.9;
      const d = amp(o, t, end, 14, 0.7);
      noise(o, t, { dur: 0.9, a: 0.1, gain: 0.3, dest: d, filter: { type: 'bandpass', f: 1600, f1: 900, q: 2 } });
      return end;
    }
    case 'burrow':
      rumble(o, t, 0.8, 0.4, 150);
      return crunch(o, t, 900, 0.3, 10, 0.6);
    case 'dot_stab':
      whoosh(o, t, 2500, 5000, 0.1, 0.3, 2);
      return noise(o, t, { dur: 0.6, a: 0.05, gain: 0.08, delay: 0.1, filter: { type: 'highpass', f: 4000 } });
    case 'shape_shift':
      fm(o, t, { f: 200, f1: 1200, ratio: 1.5, index: 3, dur: 0.5, gain: 0.08 });
      return sparkle(o, t + 0.2, 523, 4, 0.05, 0.05);
    case 'cone_breath': {
      const e = noise(o, t, { color: 'pink', dur: 1.1, a: 0.12, hold: 0.5, gain: 0.45 * g, filter: { type: 'bandpass', f: 700, f1: 1500, q: 0.7 } });
      return Math.max(e, elementLayer(o, t + 0.1, el === 'physical' ? 'light' : el, true, 0.3));
    }
    case 'tentacle_ring':
      noise(o, t, { color: 'pink', dur: 0.7, a: 0.05, gain: 0.35, filter: { type: 'bandpass', f: 350, f1: 900, q: 6 } });
      return elementLayer(o, t, 'light', false, 0.3);
    case 'waves':
      for (let i = 0; i < 3; i++) swell(o, t + i * 0.32, 0.3, 0.2, 400, 2500 + i * 800);
      return elementLayer(o, t + 0.96, el === 'physical' ? 'light' : el, true, 0.35);
    default:
      whoosh(o, t, 600, 3000, 0.4, 0.35);
      return elementLayer(o, t, el, false, 0.3);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Projectiles + hazards                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export function projectileLaunch(o: Out, t: number, p: SfxParams): number {
  const enemy = p.flag;
  const gm = enemy ? 1 : 0.8;
  switch (p.kind) {
    case 'arrow': return swing(o, t, p, 'bow');
    case 'bolt': return whoosh(o, t, 2500, 5500, 0.18, 0.3 * gm, 3);
    case 'soul': return tone(o, t, { type: 'triangle', f: 700, f1: 420, dur: 0.6, a: 0.06, gain: 0.07 * gm, vib: [7, 50], filter: { type: 'bandpass', f: 900, q: 1.5 } });
    case 'feather': {
      const end = t + 0.35;
      noise(o, t, { dur: 0.35, a: 0.03, gain: 0.2 * gm, dest: amp(o, t, end, 22, 0.6), filter: { type: 'highpass', f: 2500 } });
      return whoosh(o, t, 2000, 5000, 0.25, 0.2 * gm, 2);
    }
    case 'petal': return whoosh(o, t, 3000, 6000, 0.25, 0.12 * gm, 1.2, 'pink');
    case 'shard': return tone(o, t, { f: 3200, f1: 2400, dur: 0.3, gain: 0.05 * gm }) && whoosh(o, t, 3000, 6000, 0.2, 0.2 * gm, 3);
    case 'spirit': case 'raven': {
      if (p.kind === 'raven') fm(o, t, { f: 900, f1: 600, ratio: 1.02, index: 4, dur: 0.25, gain: 0.08 * gm, filter: { type: 'bandpass', f: 1400, q: 2 } });
      return whoosh(o, t, 600, 2000, 0.4, 0.3 * gm, 1, 'pink');
    }
    case 'fireball':
      whoosh(o, t, 300, 1200, 0.5, 0.5 * gm, 0.8, 'pink');
      return elementLayer(o, t, 'fire', false, 0.3 * gm);
    case 'comet':
      whoosh(o, t, 400, 3000, 0.7, 0.45 * gm, 1);
      return sparkle(o, t, 1046, 4, 0.06, 0.05);
    case 'star': return chime(o, t, 2637 * o.rng.range(0.9, 1.1), 0.5, 0.06 * gm);
    case 'disc': return swing(o, t, p, 'disc');
    case 'crescent': return whoosh(o, t, 1500, 4000, 0.3, 0.35 * gm, 1.6);
    case 'acid': return noise(o, t, { color: 'pink', dur: 0.25, gain: 0.3 * gm, filter: { type: 'bandpass', f: 700, f1: 1500, q: 5 } });
    case 'drop': return tone(o, t, { f: 300, f1: 900, dur: 0.15, gain: 0.08 * gm });
    case 'chain': return rattle(o, t, 0.08, 8, 0.3);
    case 'harpoon': return swing(o, t, p, 'harpoon');
    case 'tentacle': return noise(o, t, { color: 'pink', dur: 0.4, a: 0.05, gain: 0.3 * gm, filter: { type: 'bandpass', f: 300, f1: 800, q: 5 } });
    case 'wave': return whoosh(o, t, 300, 1500, 0.6, 0.45 * gm, 0.8, 'pink');
    case 'rock': return whoosh(o, t, 200, 700, 0.5, 0.45 * gm, 0.8, 'pink');
    case 'seed': return click(o, t, 1400, 0.25 * gm, 0.03, 3);
    case 'ball': return swing(o, t, p, 'flail');
    default:
      tone(o, t, { type: 'triangle', f: 500, f1: 1100, dur: 0.25, gain: 0.05 * gm });
      return whoosh(o, t, 800, 2400, 0.3, 0.25 * gm, 1.2);
  }
}

export function projectileHit(o: Out, t: number, p: SfxParams): number {
  switch (p.kind) {
    case 'arrow': case 'bolt': case 'harpoon': click(o, t, 1400, 0.4, 0.03, 2); return thump(o, t, 260, 120, 0.08, 0.25);
    case 'shard': case 'star': return elementLayer(o, t, 'ice', false, 0.4);
    case 'soul': case 'spirit': case 'raven': return elementLayer(o, t, 'spirit', false, 0.5);
    case 'acid': case 'drop': return elementLayer(o, t, p.kind === 'acid' ? 'poison' : 'water', false, 0.45);
    case 'feather': case 'petal': case 'seed': return click(o, t, 2500, 0.25, 0.04, 1.5);
    default:
      impact(o, t, false, 0.4);
      return elementLayer(o, t, p.element, false, 0.4);
  }
}

export function explosion(o: Out, t: number, p: SfxParams): number {
  const s = Math.max(0.2, Math.min(1, p.size));
  thump(o, t, 110, 28, 0.5 + s * 0.8, 0.7 + s * 0.4);
  noise(o, t, { color: 'brown', dur: 0.8 + s, a: 0.003, gain: 0.7 * (0.6 + s * 0.6), filter: { type: 'lowpass', f: 1400, f1: 140 } });
  noise(o, t, { dur: 0.25, a: 0.001, gain: 0.4, filter: { type: 'highpass', f: 1800 } });
  crunch(o, t, 2000, 0.25, 8, 0.4 + s * 0.4);
  return Math.max(t + 1 + s, elementLayer(o, t, p.element, true, 0.5));
}

export function shockwave(o: Out, t: number, p: SfxParams): number {
  const s = Math.max(0.2, Math.min(1, p.size));
  thump(o, t, 80, 30, 0.6 + s * 0.6, 0.6 + s * 0.3);
  whoosh(o, t, 200, 2200, 0.5 + s * 0.4, 0.35 + s * 0.2, 0.7, 'pink');
  return Math.max(t + 1.1, elementLayer(o, t, p.element, true, 0.35));
}

/** Hazard telegraph (kind = visual, size = telegraph seconds). */
export function hazardTelegraph(o: Out, t: number, p: SfxParams): number {
  const d = Math.max(0.35, Math.min(2.5, p.size));
  switch (p.kind) {
    case 'crack': case 'roots': case 'spikes':
      noise(o, t, { color: 'brown', dur: d, gain: 0.45, rev: true, filter: { type: 'lowpass', f: 110, f1: 260 } });
      return crunch(o, t + d * 0.3, p.kind === 'roots' ? 900 : 1600, 0.18, 8, d * 0.7);
    case 'lightning':
      tone(o, t, { type: 'sawtooth', f: 60, f1: 140, dur: d, gain: 0.08, rev: true, filter: { type: 'lowpass', f: 800 } });
      return crunch(o, t + d * 0.4, 5000, 0.12, 10, d * 0.6);
    case 'fire': case 'lava': case 'embers':
      return noise(o, t, { color: 'pink', dur: d, gain: 0.4, rev: true, filter: { type: 'bandpass', f: 250, f1: 900, q: 0.8 } });
    case 'ice': case 'glass':
      tone(o, t, { f: 1800, f1: 2600, dur: d, gain: 0.04, rev: true });
      return crunch(o, t + d * 0.3, 4500, 0.1, 8, d * 0.7);
    case 'void': case 'shadow':
      return noise(o, t, { color: 'pink', dur: d, gain: 0.35, rev: true, filter: { type: 'lowpass', f: 3000, f1: 180 } });
    case 'water': case 'whirlpool': case 'mud': case 'acid': {
      let e = t;
      for (let i = 0; i < Math.round(d * 8); i++) e = tone(o, t, { f: o.rng.range(150, 400), f1: o.rng.range(500, 900), dur: 0.07, gain: 0.07, delay: (i / 8) });
      return e;
    }
    case 'pollen': case 'flowers': case 'fog':
      return noise(o, t, { color: 'pink', dur: d, gain: 0.15, rev: true, filter: { type: 'highpass', f: 1500 } });
    default:
      tone(o, t, { type: 'triangle', f: 220, f1: 440, dur: d, gain: 0.06, rev: true });
      return noise(o, t, { dur: d, gain: 0.1, rev: true, filter: { type: 'bandpass', f: 1500, q: 2 } });
  }
}

export function hazardErupt(o: Out, t: number, p: SfxParams): number {
  switch (p.kind) {
    case 'crack': case 'spikes': impact(o, t, true, 0.5, 0.7); return crunch(o, t, 1400, 0.3, 10, 0.25);
    case 'roots': click(o, t, 700, 0.5, 0.06, 3); return crunch(o, t, 900, 0.3, 10, 0.3);
    case 'lightning': return elementLayer(o, t, 'lightning', true, 0.7) && thump(o, t, 120, 40, 0.5, 0.5);
    case 'fire': case 'lava': case 'embers': whoosh(o, t, 300, 1200, 0.6, 0.6, 0.7, 'pink'); return elementLayer(o, t, 'fire', true, 0.5);
    case 'ice': case 'glass': return elementLayer(o, t, 'ice', true, 0.6);
    case 'void': case 'shadow': return elementLayer(o, t, 'void', true, 0.6);
    case 'water': case 'whirlpool': case 'mud': case 'acid': return elementLayer(o, t, p.kind === 'acid' ? 'poison' : 'water', true, 0.6);
    case 'light': case 'star': case 'circle': thump(o, t, 160, 60, 0.4, 0.4); return elementLayer(o, t, 'light', true, 0.5);
    default: return impact(o, t, false, 0.4);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Boss voices                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** kind: roar (intro / phase), attack (short effort), hurt (stagger), death. size 0..1. */
export function bossVoiceSfx(o: Out, t: number, fam: VoiceFamily, size: number, kind: 'roar' | 'attack' | 'hurt' | 'death', dark = false): number {
  const pf = (1.55 - size * 0.9) * o.rng.range(0.94, 1.06) * (dark ? 0.85 : 1);
  const dm = kind === 'roar' ? 1 : kind === 'death' ? 1.6 : kind === 'attack' ? 0.45 : 0.4;
  const gm = kind === 'attack' ? 0.6 : 1;
  switch (fam) {
    case 'knight':
      voiceRoar(o, t, { f0: 150 * pf, f1: 105 * pf, dur: 0.75 * dm, gain: 0.35 * gm, formants: [650, 1050, 2500], rough: 0.25 });
      return Math.max(t + 0.8 * dm, rattle(o, t, 0.06, 6, 0.3));
    case 'humanoid':
      return voiceRoar(o, t, { f0: 190 * pf, f1: 140 * pf, dur: 0.6 * dm, gain: 0.3 * gm, formants: [700, 1200, 2600], rough: 0.12 });
    case 'spectral': {
      const e = voiceRoar(o, t, { f0: 160 * pf, f1: 120 * pf, dur: 1.1 * dm, gain: 0.18 * gm, formants: [500, 900, 2400], rough: 0.1, wave: 'triangle', detune: 30 });
      for (let i = 0; i < 4; i++) noise(o, t, { color: 'pink', dur: 0.4, a: 0.1, gain: 0.12 * gm, delay: i * 0.15 * dm + o.rng.next() * 0.1, filter: { type: 'bandpass', f: o.rng.range(1500, 3500), q: 5 } });
      return e;
    }
    case 'colossus':
      voiceRoar(o, t, { f0: 58 * pf, f1: 40 * pf, dur: 1.8 * dm, gain: 0.45 * gm, formants: [300, 620, 1250], rough: 0.5, dist: true });
      rumble(o, t, 1.8 * dm, 0.35 * gm, 140);
      return t + 1.9 * dm;
    case 'beast':
      voiceRoar(o, t, { f0: 95 * pf, f1: 70 * pf, dur: 1.2 * dm, gain: 0.4 * gm, formants: [520, 950, 2100], rough: 0.6, dist: true });
      return noise(o, t, { dur: 0.8 * dm, a: 0.05, gain: 0.12 * gm, filter: { type: 'bandpass', f: 1600, q: 3 } });
    case 'serpent': {
      noise(o, t, { dur: 1.3 * dm, a: 0.2 * dm, gain: 0.3 * gm, filter: { type: 'highpass', f: 3500 } });
      const end = t + 1.2 * dm;
      noise(o, t, { color: 'brown', dur: 1.2 * dm, a: 0.1, gain: 0.35 * gm, dest: amp(o, t, end, 31, 0.8), filter: { type: 'lowpass', f: 260 } });
      return Math.max(end, voiceRoar(o, t, { f0: 72 * pf, f1: 58 * pf, dur: 1.0 * dm, gain: 0.22 * gm, formants: [400, 800], rough: 0.5 }));
    }
    case 'dragon':
      voiceRoar(o, t, { f0: 85 * pf, f1: 62 * pf, dur: 2.0 * dm, gain: 0.45 * gm, formants: [420, 850, 1700, 3000], rough: 0.45, dist: true, detune: 14 });
      noise(o, t, { color: 'pink', dur: 2.0 * dm, a: 0.3, gain: 0.18 * gm, filter: { type: 'bandpass', f: 900, q: 0.6 } });
      return tone(o, t, { f: 45 * pf, dur: 2.0 * dm, a: 0.2, gain: 0.3 * gm });
    case 'bird':
      fm(o, t, { f: 1900 * pf, f1: 1100 * pf, ratio: 1.5, index: 3, dur: 0.8 * dm, a: 0.02, gain: 0.14 * gm, filter: { type: 'bandpass', f: 2200, q: 1.2 } });
      noise(o, t, { dur: 0.7 * dm, a: 0.03, gain: 0.12 * gm, filter: { type: 'highpass', f: 3000 } });
      return fm(o, t, { f: 1700 * pf, f1: 1300 * pf, ratio: 1.5, index: 2.5, dur: 0.35, gain: 0.08 * gm, delay: 0.9 * dm });
    case 'insect': {
      const end = t + 0.9 * dm;
      tone(o, t, { type: 'sawtooth', f: 140 * pf, dur: 0.9 * dm, a: 0.05, gain: 0.18 * gm, dest: amp(o, t, end, 42, 0.8), filter: { type: 'bandpass', f: 1200, q: 2 } });
      crunch(o, t, 3800, 0.25 * gm, 14, 0.7 * dm);
      return end;
    }
    case 'tree':
      tone(o, t, { type: 'sawtooth', f: 52 * pf, f1: 40 * pf, dur: 2.0 * dm, a: 0.3, gain: 0.3 * gm, filter: { type: 'bandpass', f: 280, f1: 720, q: 12 } });
      crunch(o, t + 0.3, 700, 0.3 * gm, 6, 1.4 * dm);
      return noise(o, t, { color: 'pink', dur: 1.6 * dm, a: 0.4, gain: 0.12 * gm, filter: { type: 'highpass', f: 3000 } });
    case 'tentacled': {
      const end = t + 2.2 * dm;
      noise(o, t, { color: 'pink', dur: 2.0 * dm, a: 0.2, gain: 0.35 * gm, dest: amp(o, t, end, 11, 0.7), filter: { type: 'bandpass', f: 320, q: 7 } });
      for (const f of [40, 42.4, 60, 63.6, 85]) tone(o, t, { type: 'sawtooth', f: f * pf, dur: 2.2 * dm, a: 0.4, gain: 0.07 * gm, filter: { type: 'lowpass', f: 500 } });
      for (const f of [880, 932, 1245]) tone(o, t, { type: 'sine', f: f * pf, dur: 1.8 * dm, a: 0.6, gain: 0.025 * gm, vib: [4.5, 35], delay: 0.2 });
      return end;
    }
    case 'divine': {
      const base = dark ? 110 : 220;
      const chord = dark ? [1, 1.189, 1.498, 1.888] : [1, 1.26, 1.498, 2];
      let e = t;
      for (const r of chord) e = Math.max(e, voiceRoar(o, t, { f0: base * r * pf, f1: base * r * pf * (dark ? 0.94 : 1.0), dur: 1.6 * dm, gain: 0.1 * gm, formants: [700, 1150, 2800], rough: 0, wave: 'sawtooth' }));
      bell(o, t, base * 2, 2.5, 0.08 * gm, dark ? 1.41 : 3.5, 2);
      return e;
    }
    default:
      return t;
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Combat feedback                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export const combat: Record<string, Recipe> = {
  hit: (o, t, p) => {
    impact(o, t, p.heavy, p.heavy ? 0.75 : 0.55, p.pitch);
    const e = elementLayer(o, t, p.element, p.heavy, 0.45);
    if (p.flag) chime(o, t, 2349, 0.4, 0.06); // weak point
    return Math.max(e, t + 0.5);
  },
  player_hurt: (o, t, p) => {
    impact(o, t, p.heavy, p.heavy ? 0.6 : 0.42, 0.85);
    elementLayer(o, t, p.element, p.heavy, 0.3);
    // short breathy grunt (not a scream)
    noise(o, t + 0.02, { color: 'pink', dur: 0.16, a: 0.01, gain: 0.08, filter: { type: 'bandpass', f: 700, q: 2 } });
    tone(o, t + 0.02, { type: 'triangle', f: 175 * o.rng.range(0.95, 1.05), f1: 130, dur: 0.16, a: 0.01, gain: 0.06, filter: { type: 'bandpass', f: 600, q: 1.5 } });
    if (p.flag) thump(o, t, 90, 50, 0.3, 0.3, 0.35); // knockdown body fall
    return t + 0.7;
  },
  parry: (o, t) => {
    fm(o, t, { f: 1760, ratio: 2.41, index: 3, index1: 0.05, dur: 1.4, a: 0.001, gain: 0.22 });
    fm(o, t, { f: 2637, ratio: 1.5, index: 1.5, index1: 0.05, dur: 1.0, a: 0.001, gain: 0.12 });
    click(o, t, 5000, 0.5, 0.02, 1);
    thump(o, t, 200, 90, 0.12, 0.3);
    return sparkle(o, t + 0.05, 2093, 3, 0.04, 0.04, [1, 1.5, 2]);
  },
  perfect_dodge: (o, t) => {
    // time-slow whoosh: falling filtered air + tape-slow tone, then a clear chime
    noise(o, t, { dur: 0.6, a: 0.04, gain: 0.32, filter: { type: 'bandpass', f: 3000, f1: 350, q: 1.3 } });
    tone(o, t, { type: 'sine', f: 900, f1: 280, dur: 0.5, a: 0.01, gain: 0.08 });
    chime(o, t + 0.08, 1568, 1.4, 0.12);
    return chime(o, t + 0.14, 2349, 1.3, 0.08);
  },
  dodge_avoid: (o, t) => whoosh(o, t, 1800, 700, 0.2, 0.12, 1.2),
  block: (o, t, p) => {
    thump(o, t, 210, 95, 0.12, 0.45);
    noise(o, t, { dur: 0.08, a: 0.001, gain: 0.45, filter: { type: 'bandpass', f: 1300, q: 2.5 } });
    return fm(o, t, { f: 820 * p.pitch, ratio: 2.76, index: 1.6, dur: 0.45, gain: 0.07 });
  },
  guard_break: (o, t) => {
    combat.block(o, t, { heavy: true, element: 'physical', size: 1, pitch: 0.8, kind: '', intensity: 1, flag: false });
    fm(o, t + 0.03, { f: 1400, f1: 300, ratio: 3.1, index: 5, dur: 0.6, gain: 0.12 });
    crunch(o, t + 0.03, 2200, 0.35, 12, 0.25);
    return thump(o, t + 0.05, 120, 40, 0.5, 0.5);
  },
  deflect: (o, t) => {
    click(o, t, 3000, 0.4, 0.02, 2);
    return fm(o, t, { f: 3100, f1: 2500, ratio: 1.41, index: 1.2, dur: 0.35, gain: 0.08 });
  },
  immune: (o, t) => {
    thump(o, t, 160, 120, 0.08, 0.3);
    return fm(o, t, { f: 600, ratio: 1.41, index: 1, dur: 0.25, gain: 0.07, filter: { type: 'lowpass', f: 1500 } });
  },
  counter: (o, t) => {
    fm(o, t, { f: 1318, ratio: 2, index: 2, dur: 0.6, gain: 0.12 });
    return whoosh(o, t, 1200, 4000, 0.2, 0.35, 1.4);
  },
  red_warning: (o, t) => {
    // Colpo Rosso: always identical, distinct from every other sound (colorblind-safe cue): bright metallic shing over a
    // low dissonant swelling cluster with a fast tremolo.
    fm(o, t, { f: 2093, ratio: 1.41, index: 2.5, index1: 0.1, dur: 0.9, a: 0.001, gain: 0.16 });
    tone(o, t, { type: 'square', f: 1046.5, dur: 0.12, a: 0.001, gain: 0.04, filter: { type: 'bandpass', f: 1500, q: 3 } });
    const end = t + 0.85;
    const trem = amp(o, t, end, 13, 0.55);
    const ds = shaper(o, 'soft', trem, 1.6);
    for (const f of [55, 58.27, 82.41]) tone(o, t, { type: 'sawtooth', f, dur: 0.85, a: 0.03, hold: 0.25, gain: 0.12, dest: ds, filter: { type: 'lowpass', f: 300, f1: 1400, g: 0.25 } });
    return end;
  },
  spezzato: (o, t) => {
    // Equilibrio breaks: a crack + glassy shatter + low boom
    click(o, t, 2500, 0.7, 0.03, 0.8);
    fm(o, t, { f: 1800, f1: 400, ratio: 3.17, index: 6, dur: 0.7, gain: 0.14 });
    crunch(o, t, 3000, 0.4, 14, 0.35);
    thump(o, t, 120, 35, 0.9, 0.7);
    return elementLayer(o, t + 0.05, 'ice', true, 0.35);
  },
  grace: (o, t) => {
    // cinematic swell into the Colpo di Grazia
    swell(o, t, 1.0, 0.35, 200, 5000, 110);
    tone(o, t, { type: 'sine', f: 55, f1: 110, dur: 1.0, gain: 0.25, rev: true });
    return t + 1.05;
  },
  grace_hit: (o, t) => {
    impact(o, t, true, 1.0, 0.7);
    rumble(o, t, 1.6, 0.5, 100);
    for (const f of [220, 277.2, 329.6, 440]) tone(o, t, { type: 'sawtooth', f, dur: 1.6, a: 0.01, gain: 0.05, filter: { type: 'lowpass', f: 3000, f1: 400 } });
    bell(o, t, 110, 3.5, 0.18, 1.41, 3);
    return sparkle(o, t + 0.1, 1046, 6, 0.05, 0.06);
  },
  boss_phase: (o, t) => {
    swell(o, t, 1.4, 0.3, 150, 3000, 55);
    bell(o, t + 1.35, 65.4, 4, 0.25, 1.41, 3); // gong
    return rumble(o, t + 1.35, 1.6, 0.35, 90);
  },
  boss_defeat: (o, t, p) => {
    impact(o, t, true, 0.8, 0.6);
    bell(o, t, 55, 6, 0.3, 1.41, 3);
    const dark = p.flag;
    const chord = dark ? [220, 261.6, 329.6, 392] : [220, 277.2, 329.6, 415.3];
    chord.forEach((f, i) => tone(o, t + 0.3, { type: 'sawtooth', f, f1: f * 0.5, glide: 3, dur: 3.5, a: 0.4, gain: 0.04, delay: i * 0.05, filter: { type: 'lowpass', f: 1800, f1: 300 } }));
    noise(o, t + 0.3, { color: 'pink', dur: 3, a: 0.6, gain: 0.15, filter: { type: 'bandpass', f: 4000, f1: 1500, q: 0.8 } });
    return sparkle(o, t + 1.5, 523.3, 7, 0.12, 0.05);
  },
  part_broken: (o, t) => {
    crunch(o, t, 1500, 0.5, 12, 0.3);
    thump(o, t, 140, 45, 0.6, 0.6);
    return fm(o, t, { f: 900, f1: 250, ratio: 2.9, index: 4, dur: 0.6, gain: 0.1 });
  },
  part_regrown: (o, t) => {
    noise(o, t, { color: 'pink', dur: 0.9, gain: 0.3, rev: true, filter: { type: 'bandpass', f: 300, f1: 1200, q: 3 } });
    return tone(o, t, { type: 'sawtooth', f: 60, f1: 90, dur: 0.9, gain: 0.08, rev: true, filter: { type: 'lowpass', f: 500 } });
  },
  boss_step: (o, t, p) => {
    const s = p.size;
    thump(o, t, 70 - s * 30, 30, 0.3 + s * 0.4, 0.35 + s * 0.35);
    return noise(o, t, { color: 'brown', dur: 0.3 + s * 0.4, a: 0.004, gain: 0.25 + s * 0.2, filter: { type: 'lowpass', f: 220 } });
  },
  boss_whoosh: (o, t, p) => {
    const s = p.size;
    whoosh(o, t, 250 - s * 120, 1100 - s * 500, 0.45 + s * 0.4, 0.4, 0.8, 'pink');
    return whoosh(o, t, 120, 400, 0.5 + s * 0.4, 0.25, 0.7, 'pink', 0.05);
  },
  windup: (o, t, p) => noise(o, t, { color: 'pink', dur: Math.max(0.3, Math.min(1.5, p.size)), gain: 0.18, rev: true, filter: { type: 'bandpass', f: 300, f1: 1400, q: 1 } }),
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Player actions + world + story                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

export const world: Record<string, Recipe> = {
  dodge: (o, t, p) => {
    whoosh(o, t, 450, 1300, p.flag ? 0.18 : 0.3, 0.22, 0.9, 'pink');
    noise(o, t, { color: 'pink', dur: 0.2, a: 0.03, gain: 0.08, filter: { type: 'highpass', f: 2500 } }); // cloth
    return thump(o, t, 120, 70, 0.12, p.flag ? 0.1 : 0.2, p.flag ? 0.12 : 0.26);
  },
  jump: (o, t) => {
    noise(o, t, { color: 'pink', dur: 0.15, a: 0.02, gain: 0.08, filter: { type: 'bandpass', f: 800, q: 1 } });
    return whoosh(o, t, 600, 1500, 0.18, 0.1, 1, 'pink');
  },
  land: (o, t, p) => {
    thump(o, t, 110, 50, p.heavy ? 0.3 : 0.15, p.heavy ? 0.55 : 0.3);
    return noise(o, t, { color: 'brown', dur: p.heavy ? 0.25 : 0.12, a: 0.002, gain: p.heavy ? 0.35 : 0.18, filter: { type: 'lowpass', f: 900 } });
  },
  drink_start: (o, t) => {
    chime(o, t, 2793, 0.12, 0.06);
    chime(o, t, 3520, 0.1, 0.04, 0.05);
    return click(o, t, 900, 0.2, 0.03, 3, 0.12); // cork
  },
  drink: (o, t) => {
    tone(o, t, { f: 300, f1: 520, dur: 0.12, gain: 0.08 });
    tone(o, t, { f: 320, f1: 560, dur: 0.12, gain: 0.07, delay: 0.18 });
    swell(o, t + 0.1, 0.5, 0.08, 800, 5000);
    for (const [f, d] of [[1046.5, 0.6], [1318.5, 0.7], [1568, 0.8], [2093, 0.9]] as const) chime(o, t + d, f, 1.2, 0.05);
    return t + 2.2;
  },
  vial_empty: (o, t) => {
    tone(o, t, { type: 'triangle', f: 1200, dur: 0.08, gain: 0.06, filter: { type: 'lowpass', f: 1500 } });
    return thump(o, t, 200, 150, 0.08, 0.1, 0.05);
  },
  weapon_swap: (o, t) => {
    noise(o, t, { dur: 0.16, a: 0.02, gain: 0.14, filter: { type: 'bandpass', f: 3000, f1: 6500, q: 3 } });
    click(o, t, 2000, 0.25, 0.02, 3, 0.14);
    return fm(o, t, { f: 1500, ratio: 2.4, index: 1, dur: 0.2, gain: 0.03, delay: 0.14 });
  },
  transizione: (o, t) => {
    whoosh(o, t, 600, 4000, 0.35, 0.4, 1);
    chime(o, t + 0.15, 1318.5, 0.6, 0.07);
    chime(o, t + 0.2, 1975.5, 0.6, 0.06);
    return impact(o, t + 0.3, false, 0.35);
  },
  art_unavailable: (o, t) => tone(o, t, { type: 'triangle', f: 330, f1: 300, dur: 0.12, gain: 0.08, filter: { type: 'lowpass', f: 800 } }),
  eco_refund: (o, t) => {
    chime(o, t, 1568, 0.5, 0.06);
    return chime(o, t, 2093, 0.6, 0.06, 0.07);
  },
  parry_attempt: (o, t) => whoosh(o, t, 1500, 3000, 0.1, 0.08, 1.5),
  player_death: (o, t) => {
    // soft, never mocking: a breath out, two slowing heartbeats, a falling minor third on glass
    noise(o, t, { color: 'pink', dur: 1.4, a: 0.1, gain: 0.12, filter: { type: 'lowpass', f: 1500, f1: 200 } });
    thump(o, t + 0.5, 62, 40, 0.25, 0.35);
    thump(o, t + 0.75, 58, 38, 0.3, 0.42);
    thump(o, t + 1.9, 52, 36, 0.35, 0.25);
    tone(o, t + 0.4, { type: 'sine', f: 659.3, dur: 2.2, a: 0.3, gain: 0.06 });
    tone(o, t + 1.2, { type: 'sine', f: 554.4, dur: 2.8, a: 0.4, gain: 0.06 });
    return t + 4.2;
  },
  respawn: (o, t) => {
    noise(o, t, { color: 'pink', dur: 1.0, gain: 0.08, rev: true, filter: { type: 'lowpass', f: 400, f1: 3000 } }); // breath in
    for (const [f, d] of [[293.7, 0], [440, 0.12], [587.3, 0.24], [740, 0.36], [880, 0.5]] as const) tone(o, t + 0.6, { type: 'triangle', f, dur: 2.5, a: 0.25, gain: 0.035, delay: d });
    return sparkle(o, t + 0.9, 1174.7, 5, 0.09, 0.04);
  },
  altar_rest: (o, t) => {
    bell(o, t, 523.3, 3.5, 0.1, 2.0, 1.2);
    bell(o, t + 0.02, 784, 3.0, 0.05, 2.0, 1);
    for (const f of [261.6, 392, 523.3, 659.3]) tone(o, t, { type: 'triangle', f, dur: 3.2, a: 0.6, gain: 0.025, filter: { type: 'lowpass', f: 2000 } });
    return crunch(o, t + 0.2, 3500, 0.05, 8, 1.6); // the lantern flame
  },
  altar_discovered: (o, t) => {
    whoosh(o, t, 300, 2500, 0.8, 0.12, 0.8, 'pink');
    return sparkle(o, t + 0.3, 587.3, 6, 0.09, 0.06, [1, 1.5, 2, 2.25, 3, 4]);
  },
  tod_change: (o, t, p) => {
    switch (p.kind) {
      case 'alba': return sparkle(o, t, 587.3, 6, 0.1, 0.06, [1, 1.25, 1.5, 2, 2.5, 3]);
      case 'giorno': for (const f of [523.3, 659.3, 784, 1046.5]) chime(o, t, f, 2, 0.05); return t + 2;
      case 'tramonto': return sparkle(o, t, 880, 5, 0.12, 0.05, [2, 1.5, 1.25, 1, 0.75]);
      default:
        chime(o, t, 392, 3, 0.05);
        chime(o, t + 0.4, 466.2, 3, 0.04);
        return chime(o, t + 0.8, 587.3, 3, 0.035);
    }
  },
  meta_ready: (o, t) => {
    // the glass sphere chime
    const end = t + 1.6;
    const d = amp(o, t, end, 5.5, 0.35);
    tone(o, t, { f: 1568, dur: 1.6, a: 0.01, gain: 0.07, dest: d });
    tone(o, t + 0.12, { f: 2093, dur: 1.5, a: 0.01, gain: 0.06, dest: d });
    return tone(o, t + 0.24, { f: 3136, dur: 1.2, a: 0.01, gain: 0.03, dest: d });
  },
  meta_start: (o, t, p) => {
    swell(o, t, 0.8, 0.3, 300, 6000);
    tone(o, t + 0.8, { f: 50, f1: 32, dur: 1.2, a: 0.005, gain: 0.5 });
    for (const f of [523.3, 784, 1046.5, 1568, 2093]) bell(o, t + 0.8, f, 2.6, 0.04, 3.5, 1.5);
    const form = p.kind;
    if (form === 'prato_lunare') sparkle(o, t + 1, 1174.7, 5, 0.12, 0.04);
    else if (form === 'specchio') for (const f of [1318, 1325, 1976, 1985]) chime(o, t + 0.9, f, 1.5, 0.04);
    else if (form === 'gigante') thump(o, t + 0.9, 60, 25, 1.5, 0.5);
    else if (form === 'firmamento') sparkle(o, t + 0.9, 1568, 7, 0.08, 0.035);
    else if (form === 'cielo_aureo') for (const f of [293.7, 370, 440, 587.3]) tone(o, t + 0.9, { type: 'sawtooth', f, dur: 2, a: 0.3, gain: 0.03, filter: { type: 'lowpass', f: 2200 } });
    else if (form === 'abisso_rosso') { tone(o, t + 0.9, { type: 'sawtooth', f: 55, dur: 2, a: 0.1, gain: 0.08, filter: { type: 'lowpass', f: 500 } }); elementLayer(o, t + 0.9, 'fire', true, 0.3); }
    else if (form === 'rovescio') swell(o, t + 0.9, 1.2, 0.2, 4000, 300);
    else if (form === 'settimo_mondo') for (const f of [293.7, 440, 587.3, 740, 880, 1174.7]) tone(o, t + 0.9, { type: 'triangle', f, dur: 4, a: 0.8, gain: 0.04 });
    return t + 3;
  },
  meta_end: (o, t) => {
    for (const f of [2093, 1568, 1046.5, 784]) bell(o, t + (2093 - f) / 4000, f, 1.6, 0.04, 3.5, 1.2);
    return whoosh(o, t, 5000, 400, 0.7, 0.2, 0.8, 'pink');
  },
  meta_shatter: (o, t) => {
    // Lucifero shatters the sphere with one finger
    click(o, t, 6000, 0.4, 0.01, 1);
    for (let i = 0; i < 18; i++) chime(o, t + 0.02 + o.rng.next() * 0.5, o.rng.range(2000, 7000), 0.4, 0.04);
    crunch(o, t, 5000, 0.4, 20, 0.4);
    return thump(o, t, 80, 30, 1.2, 0.6);
  },
  meta_rewrite: (o, t) => {
    // Reina rewrites the sky: a constellation arpeggio runs backwards, then forwards again in another mode
    sparkle(o, t, 1568, 6, 0.06, 0.05, [3, 2.5, 2, 1.5, 1.25, 1]);
    fm(o, t + 0.4, { f: 400, f1: 1600, ratio: 1.5, index: 3, dur: 0.6, gain: 0.06 });
    return sparkle(o, t + 0.9, 1396.9, 6, 0.06, 0.05, [1, 1.122, 1.335, 1.498, 1.782, 2]);
  },
  meta_devour: (o, t) => {
    noise(o, t, { color: 'pink', dur: 1.5, gain: 0.45, rev: true, filter: { type: 'lowpass', f: 5000, f1: 120 } });
    tone(o, t, { f: 70, f1: 28, dur: 2.0, a: 0.1, gain: 0.5 });
    return noise(o, t + 1.2, { color: 'brown', dur: 0.8, a: 0.05, gain: 0.4, filter: { type: 'bandpass', f: 250, q: 6 } });
  },
  meta_spit: (o, t) => {
    impact(o, t, true, 0.6, 0.6);
    whoosh(o, t, 200, 3000, 0.5, 0.4, 0.8, 'pink');
    return combat.spezzato(o, t + 0.1, { heavy: true, element: 'void', size: 1, pitch: 1, kind: '', intensity: 1, flag: false });
  },
  weapon_obtained: (o, t) => {
    for (const f of [146.8, 220, 293.7, 370, 440]) tone(o, t, { type: 'sawtooth', f, dur: 2.6, a: 0.5, hold: 0.6, gain: 0.03, filter: { type: 'lowpass', f: 900, f1: 2600, g: 1 } });
    bell(o, t + 0.5, 587.3, 3, 0.08, 3.5, 2);
    return sparkle(o, t + 0.6, 880, 6, 0.08, 0.05);
  },
  form_unlocked: (o, t) => {
    swell(o, t, 1.2, 0.25, 300, 5000);
    for (const f of [146.8, 220, 293.7, 370, 440, 587.3]) tone(o, t + 1.2, { type: 'triangle', f, dur: 4, a: 0.2, gain: 0.04 });
    for (const f of [1174.7, 1760, 2349]) bell(o, t + 1.2, f, 3, 0.05, 3.5, 1.5);
    return t + 5.2;
  },
  item_obtained: (o, t) => {
    chime(o, t, 1174.7, 1.2, 0.07);
    chime(o, t + 0.1, 1480, 1.2, 0.06);
    return chime(o, t + 0.2, 1760, 1.4, 0.06);
  },
  reperto: (o, t) => {
    noise(o, t, { color: 'pink', dur: 0.4, a: 0.05, gain: 0.08, filter: { type: 'bandpass', f: 3000, q: 1 } }); // paper / cloth
    chime(o, t + 0.3, 880, 1.8, 0.06);
    chime(o, t + 0.7, 1046.5, 1.8, 0.05);
    return chime(o, t + 1.1, 783.99, 2.4, 0.05);
  },
  vista: (o, t) => {
    swell(o, t, 1.5, 0.12, 200, 2500);
    for (const [f, d] of [[293.7, 0], [440, 0.15], [587.3, 0.3], [659.3, 0.45], [880, 0.6], [1174.7, 0.8]] as const) tone(o, t + 1.2 + d, { type: 'triangle', f, dur: 3, a: 0.01, gain: 0.04 });
    return t + 4.5;
  },
  gate_lock: (o, t) => {
    noise(o, t, { color: 'pink', dur: 0.9, a: 0.3, gain: 0.25, filter: { type: 'bandpass', f: 2500, f1: 500, q: 0.7 } });
    thump(o, t + 0.5, 70, 35, 0.8, 0.45);
    return bell(o, t + 0.5, 110, 2.5, 0.08, 1.41, 2);
  },
  gate_open: (o, t) => {
    noise(o, t, { color: 'pink', dur: 1.6, a: 0.2, gain: 0.22, filter: { type: 'bandpass', f: 500, f1: 3500, q: 0.7 } });
    return sparkle(o, t + 0.5, 783.99, 5, 0.1, 0.05);
  },
  zone_enter: (o, t) => whoosh(o, t, 250, 1500, 1.4, 0.14, 0.7, 'pink'),
  sky_brighten: (o, t) => {
    swell(o, t, 1.6, 0.15, 400, 6000);
    for (const f of [293.7, 440, 554.4, 659.3, 880]) tone(o, t + 1.5, { type: 'triangle', f, dur: 4, a: 0.5, gain: 0.04 });
    return t + 5.5;
  },
  gravity_flip: (o, t) => {
    noise(o, t, { color: 'pink', dur: 0.7, gain: 0.3, rev: true, filter: { type: 'lowpass', f: 300, f1: 4000 } });
    return thump(o, t + 0.68, 60, 30, 0.8, 0.5);
  },
  scale_change: (o, t, p) => {
    const up = p.flag;
    fm(o, t, { f: up ? 200 : 1200, f1: up ? 60 : 3000, ratio: 1.5, index: 2, dur: 1.2, gain: 0.08 });
    return sparkle(o, t + 0.6, up ? 392 : 1568, 5, 0.08, 0.04, up ? [2, 1.5, 1.25, 1, 0.75] : [1, 1.25, 1.5, 2, 3]);
  },
  echo: (o, t) => noise(o, t, { color: 'pink', dur: 1.2, gain: 0.15, rev: true, filter: { type: 'bandpass', f: 1500, q: 4 } }),
  status: (o, t, p) => {
    switch (p.kind) {
      case 'burn': return elementLayer(o, t, 'fire', false, 0.35);
      case 'freeze': return elementLayer(o, t, 'ice', true, 0.4);
      case 'poison': return elementLayer(o, t, 'poison', false, 0.35);
      case 'slow': return tone(o, t, { f: 300, f1: 120, dur: 0.5, gain: 0.08 });
      case 'blind': return tone(o, t, { f: 5000, dur: 0.8, a: 0.05, gain: 0.03 });
      case 'madness': return combat.boss_phase(o, t, p) && t + 1.5;
      case 'void': return elementLayer(o, t, 'void', false, 0.4);
      case 'root': return art(o, t, { ...p, kind: 'bind' });
      default: return t;
    }
  },
  story: (o, t) => sparkle(o, t, 880, 4, 0.1, 0.04),
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Ending + ritual cues                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

function lokiLaugh(o: Out, t: number): number {
  // a laugh carried by the wind: breathy formant syllables, descending, accelerating then trailing, drifting across
  const ctx = o.ctx;
  const pan = typeof (ctx as AudioContext).createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  const dest: AudioNode = pan ?? o.dest;
  if (pan) {
    pan.pan.setValueAtTime(-0.8, t);
    pan.pan.linearRampToValueAtTime(0.8, t + 3.2);
    pan.connect(o.dest);
  }
  const sub: Out = { ...o, dest };
  noise(sub, t, { color: 'pink', dur: 3.6, a: 0.8, gain: 0.12, filter: { type: 'bandpass', f: 600, f1: 1400, q: 0.8 } }); // wind
  let at = t + 0.5;
  let f = 330;
  const gaps = [0.17, 0.15, 0.14, 0.13, 0.13, 0.16, 0.2, 0.26];
  for (let i = 0; i < gaps.length; i++) {
    const g = 0.07 * (1 - i / 11);
    voiceRoar(sub, at, { f0: f, f1: f * 0.9, dur: 0.11, gain: g, formants: [800, 1250, 2700], rough: 0, wave: 'sawtooth' });
    noise(sub, at, { color: 'white', dur: 0.1, a: 0.005, gain: g * 0.8, filter: { type: 'bandpass', f: 1300, q: 1.5 } });
    at += gaps[i];
    f *= 0.955;
  }
  const echo: Out = { ...sub, dest: gainNode2(o, 0.4, dest) };
  let at2 = at + 0.2;
  for (let i = 0; i < 3; i++) {
    voiceRoar(echo, at2, { f0: f * 0.95, f1: f * 0.85, dur: 0.12, gain: 0.025, formants: [800, 1250, 2700], rough: 0 });
    at2 += 0.22;
  }
  return at2 + 0.5;
}

function gainNode2(o: Out, v: number, dest: AudioNode): GainNode {
  const g = o.ctx.createGain();
  g.gain.value = v;
  g.connect(dest);
  return g;
}

export const story: Record<string, Recipe> = {
  ending_shadow: (o, t) => {
    for (const f of [73.4, 110, 146.8, 185, 220]) tone(o, t, { type: 'triangle', f, dur: 5, a: 1.5, gain: 0.05, filter: { type: 'lowpass', f: 1200 } });
    return chime(o, t + 1.2, 587.3, 4, 0.05);
  },
  ending_feather: (o, t) => {
    const end = t + 2.5;
    noise(o, t, { dur: 2.5, a: 0.3, gain: 0.08, dest: amp(o, t, end, 14, 0.7), filter: { type: 'highpass', f: 3000 } });
    chime(o, t + 0.4, 1318.5, 3, 0.05);
    chime(o, t + 0.9, 1568, 3, 0.05); // minor third -> major
    return chime(o, t + 1.4, 1661.2, 3.5, 0.05);
  },
  ending_laugh: (o, t) => lokiLaugh(o, t),
  ending_lantern: (o, t) => {
    whoosh(o, t, 300, 1500, 0.5, 0.2, 0.8, 'pink');
    crunch(o, t + 0.3, 3500, 0.06, 14, 2.5);
    bell(o, t + 0.4, 659.3, 3.5, 0.06, 2, 1);
    return t + 3.5;
  },
  ending_cave: (o, t) => {
    tone(o, t, { f: 1800, f1: 2400, dur: 0.06, gain: 0.04 }); // a drip in the far cave
    chime(o, t + 0.8, 880, 4, 0.05);
    return chime(o, t + 1.6, 1108.7, 4.5, 0.045); // the painted dawn finds a companion: a second voice in harmony
  },
  gesture: (o, t, p) => {
    // ritual gestures: each adds a tone of a widening chord (index from kind hash -> size)
    const idx = Math.max(0, Math.min(5, Math.round(p.size * 5)));
    const base = [146.8, 220, 293.7, 370, 440, 587.3];
    for (let i = 0; i <= idx; i++) tone(o, t, { type: 'triangle', f: base[i], dur: 3.2, a: 0.6, gain: 0.035 });
    swell(o, t, 0.6, 0.12, 400, 4000);
    return bell(o, t + 0.6, base[idx] * 4, 3, 0.05, 3.5, 1.4);
  },
};

export function noteFreq(m: number): number {
  return mtof(m);
}

export { panNode };
