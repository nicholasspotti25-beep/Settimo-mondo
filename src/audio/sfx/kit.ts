/** Reusable SFX gestures built from the node helpers: whooshes, thumps, cracks, chimes, rumbles, element layers. */
import { fm, noise, shaper, tone, amp, type Out } from '../engine/nodes';

export interface SfxParams {
  heavy: boolean;
  element: string;
  /** 0..1 size (boss scale, explosion radius...). */
  size: number;
  pitch: number;
  /** Sub-variant: family, surface, visual, effect, form, tod... */
  kind: string;
  intensity: number;
  flag: boolean;
}

export function defaultParams(): SfxParams {
  return { heavy: false, element: 'physical', size: 0.5, pitch: 1, kind: '', intensity: 0.5, flag: false };
}

export function whoosh(o: Out, t: number, f0: number, f1: number, dur: number, gain: number, q = 1.2, color: 'white' | 'pink' = 'white', delay = 0): number {
  return noise(o, t, { color, dur, a: dur * 0.35, gain, delay, filter: { type: 'bandpass', f: f0, f1, q } });
}

export function thump(o: Out, t: number, f0: number, f1: number, dur: number, gain: number, delay = 0): number {
  return tone(o, t, { type: 'sine', f: f0, f1, glide: dur * 0.7, dur, a: 0.002, gain, delay });
}

export function click(o: Out, t: number, f: number, gain: number, dur = 0.03, q = 2, delay = 0): number {
  return noise(o, t, { dur, a: 0.001, gain, delay, filter: { type: 'bandpass', f, q } });
}

export function crunch(o: Out, t: number, f: number, gain: number, n: number, spread: number): number {
  let end = t;
  for (let i = 0; i < n; i++) end = Math.max(end, click(o, t, f * o.rng.range(0.7, 1.4), gain * o.rng.range(0.5, 1), 0.012 + o.rng.next() * 0.02, 1.5, o.rng.next() * spread));
  return end;
}

export function rumble(o: Out, t: number, dur: number, gain: number, f = 120, a = 0.05): number {
  noise(o, t, { color: 'brown', dur, a, gain, filter: { type: 'lowpass', f, q: 0.6 } });
  return tone(o, t, { type: 'sine', f: f * 0.38, f1: f * 0.3, dur, a, gain: gain * 0.5 });
}

/** Bell-like FM chime. */
export function bell(o: Out, t: number, f: number, dur: number, gain: number, ratio = 3.5, index = 2, delay = 0): number {
  return fm(o, t, { f, ratio, index, index1: index * 0.04, dur, a: 0.002, gain, delay });
}

/** Glassy sine chime with octave partial. */
export function chime(o: Out, t: number, f: number, dur: number, gain: number, delay = 0): number {
  tone(o, t, { type: 'sine', f, dur, a: 0.003, gain, delay });
  return tone(o, t, { type: 'sine', f: f * 2.756, dur: dur * 0.5, a: 0.002, gain: gain * 0.25, delay });
}

/** Rising sparkle arpeggio. */
export function sparkle(o: Out, t: number, base: number, n: number, step: number, gain: number, ratios = [1, 1.25, 1.5, 2, 2.5, 3, 4]): number {
  let end = t;
  for (let i = 0; i < n; i++) end = Math.max(end, chime(o, t, base * ratios[i % ratios.length] * (i >= ratios.length ? 2 : 1), 0.6 + i * 0.05, gain * (1 - i / (n * 1.6)), i * step));
  return end;
}

/** Reverse swell (noise + tone rising then cut). */
export function swell(o: Out, t: number, dur: number, gain: number, f0 = 300, f1 = 3000, toneF = 0): number {
  noise(o, t, { color: 'pink', dur, gain, rev: true, filter: { type: 'bandpass', f: f0, f1, q: 0.9 } });
  if (toneF > 0) tone(o, t, { type: 'sawtooth', f: toneF, dur, gain: gain * 0.25, rev: true, filter: { type: 'lowpass', f: toneF * 2, f1: toneF * 8 } });
  return t + dur;
}

/** Element-specific layer for hits, explosions, projectiles. */
export function elementLayer(o: Out, t: number, el: string, heavy: boolean, gain: number): number {
  const h = heavy ? 1.4 : 1;
  const r = o.rng;
  switch (el) {
    case 'fire': {
      whoosh(o, t, 500, 1400, 0.35 * h, gain * 0.7, 0.8, 'pink');
      let e = t;
      for (let i = 0; i < 6; i++) e = Math.max(e, click(o, t, r.range(1500, 4500), gain * r.range(0.2, 0.5), 0.01, 3, 0.03 + r.next() * 0.3 * h));
      return e;
    }
    case 'ice': {
      noise(o, t, { dur: 0.25 * h, a: 0.001, gain: gain * 0.5, filter: { type: 'highpass', f: 5000 } });
      let e = t;
      for (let i = 0; i < 4; i++) e = Math.max(e, chime(o, t, r.range(2400, 5200), 0.3, gain * 0.18, i * 0.025 + r.next() * 0.02));
      return e;
    }
    case 'lightning': {
      tone(o, t, { type: 'sawtooth', f: 2200, f1: 90, glide: 0.12, dur: 0.18 * h, a: 0.001, gain: gain * 0.45, filter: { type: 'highpass', f: 400 } });
      noise(o, t, { dur: 0.3 * h, a: 0.001, gain: gain * 0.55, filter: { type: 'highpass', f: 2500 } });
      return crunch(o, t, 5000, gain * 0.4, 6, 0.2);
    }
    case 'void': {
      noise(o, t, { color: 'pink', dur: 0.5 * h, gain: gain * 0.6, rev: true, filter: { type: 'lowpass', f: 3000, f1: 200 } });
      return tone(o, t, { type: 'sine', f: 90, f1: 30, dur: 0.6 * h, a: 0.01, gain: gain * 0.6 });
    }
    case 'light': {
      chime(o, t, 1760, 0.8, gain * 0.25);
      chime(o, t, 2637, 0.7, gain * 0.18, 0.02);
      return chime(o, t, 3520, 0.6, gain * 0.12, 0.04);
    }
    case 'poison': {
      noise(o, t, { color: 'pink', dur: 0.35, gain: gain * 0.5, filter: { type: 'bandpass', f: 600, f1: 1400, q: 6 } });
      let e = t;
      for (let i = 0; i < 4; i++) e = Math.max(e, tone(o, t, { f: r.range(300, 700), f1: r.range(900, 1600), dur: 0.06, gain: gain * 0.2, delay: 0.05 + i * 0.06 }));
      return e;
    }
    case 'water':
      noise(o, t, { dur: 0.4 * h, a: 0.005, gain: gain * 0.6, filter: { type: 'bandpass', f: 700, f1: 2600, q: 1.4 } });
      return tone(o, t, { f: 400, f1: 1200, dur: 0.08, gain: gain * 0.2, delay: 0.05 });
    case 'nature':
      click(o, t, 900, gain * 0.5, 0.05, 4);
      return noise(o, t, { color: 'pink', dur: 0.3, a: 0.02, gain: gain * 0.3, filter: { type: 'highpass', f: 3000 } });
    case 'spirit':
      return tone(o, t, { type: 'triangle', f: 520 * r.range(0.9, 1.1), f1: 260, dur: 0.6 * h, a: 0.04, gain: gain * 0.3, vib: [6, 40], filter: { type: 'bandpass', f: 800, q: 2 } });
    case 'chaos': {
      let e = t;
      for (const m of [1, 1.06, 1.41, 1.5]) e = Math.max(e, tone(o, t, { type: 'sawtooth', f: 110 * m, dur: 0.5 * h, a: 0.005, gain: gain * 0.12, filter: { type: 'lowpass', f: 1600, f1: 200 } }));
      noise(o, t, { dur: 0.2, gain: gain * 0.4, filter: { type: 'bandpass', f: 1200, q: 0.5 } });
      return e;
    }
    case 'blood':
      noise(o, t, { color: 'brown', dur: 0.25, gain: gain * 0.6, filter: { type: 'bandpass', f: 400, f1: 900, q: 3 } });
      return tone(o, t, { f: 70, f1: 45, dur: 0.4, gain: gain * 0.5, delay: 0.08 });
    default:
      return t;
  }
}

/** Base physical impact. */
export function impact(o: Out, t: number, heavy: boolean, gain: number, pitch = 1): number {
  const h = heavy ? 1 : 0;
  thump(o, t, 150 * pitch, 45 * pitch, 0.18 + h * 0.2, gain * (0.8 + h * 0.4));
  noise(o, t, { dur: 0.07 + h * 0.08, a: 0.001, gain: gain * 0.7, filter: { type: 'bandpass', f: 1600 * pitch, f1: 500 * pitch, q: 0.9 } });
  if (heavy) {
    noise(o, t, { color: 'brown', dur: 0.4, a: 0.002, gain: gain * 0.6, filter: { type: 'lowpass', f: 300 } });
    crunch(o, t, 2500 * pitch, gain * 0.25, 4, 0.05);
  }
  return t + 0.45;
}

/** Growl / roar voice: a buzzy source through vowel formants with AM roughness and optional distortion. */
export function voiceRoar(o: Out, t: number, p: { f0: number; f1: number; dur: number; gain: number; formants: number[]; rough: number; dist?: boolean; wave?: OscillatorType; detune?: number }): number {
  const end = t + p.dur;
  let dest: AudioNode = o.dest;
  if (p.rough > 0) dest = amp(o, t, end, 28 + o.rng.next() * 18, p.rough, dest);
  if (p.dist) dest = shaper(o, 'asym', dest, 2.5);
  const ctx = o.ctx;
  const sum = ctx.createGain();
  sum.gain.value = 1;
  sum.connect(dest);
  // formant bank
  const heads: AudioNode[] = [];
  p.formants.forEach((f, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.linearRampToValueAtTime(f * 0.85, end);
    bp.Q.value = 4 + i * 2;
    const g = ctx.createGain();
    g.gain.value = 1 / (1 + i * 0.7);
    bp.connect(g);
    g.connect(sum);
    heads.push(bp);
  });
  const splitter = ctx.createGain();
  for (const h of heads) splitter.connect(h);
  const dets = p.detune ? [-p.detune, 0, p.detune] : [0];
  for (const d of dets)
    tone(o, t, {
      type: p.wave ?? 'sawtooth', f: p.f0, f1: p.f1, glide: p.dur * 0.9, dur: p.dur, a: p.dur * 0.15, hold: p.dur * 0.35, gain: p.gain / dets.length, detune: d,
      vib: [5 + o.rng.next() * 3, 25], dest: splitter,
    });
  noise(o, t, { color: 'pink', dur: p.dur * 0.9, a: p.dur * 0.2, gain: p.gain * 0.35, dest: splitter });
  return end;
}
