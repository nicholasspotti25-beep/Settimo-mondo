/**
 * Synthesized orchestra: one note-playing recipe per InstrumentId (data/music instruments). Every instrument is subtractive,
 * FM or noise synthesis scheduled from the node helpers; levels are balanced so a layer `gain` of ~0.4 sits well in the mix
 * and nothing builds harsh energy above 5 kHz on phone speakers (gentle lowpasses, soft attacks on sustained voices).
 */
import { fm, noise, tone, amp, type Out } from '../engine/nodes';
import type { InstrumentId } from './data';
import { midiToFreq } from './theory';

/** Formant centres (Hz) for choir vowels: a, o, u (dark), e. */
const VOWEL_A = [730, 1090, 2440];
const VOWEL_O = [450, 800, 2830];
const VOWEL_U = [325, 700, 2530];

function vowelVoice(o: Out, t: number, f: number, dur: number, g: number, vowel: readonly number[], a: number, rev = false): number {
  const ctx = o.ctx;
  const end = t + dur;
  const sum = ctx.createGain();
  sum.gain.value = 1;
  sum.connect(o.dest);
  const split = ctx.createGain();
  for (let i = 0; i < vowel.length; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = vowel[i];
    bp.Q.value = 5 + i * 3;
    const fg = ctx.createGain();
    fg.gain.value = 2.2 / (1 + i * 1.6);
    split.connect(bp);
    bp.connect(fg);
    fg.connect(sum);
  }
  // three slightly detuned singers per voice part
  const dets = [-9, 0, 8];
  let e = end;
  for (let i = 0; i < 3; i++)
    e = tone(o, t, { type: 'sawtooth', f, dur, a, hold: rev ? 0 : dur * 0.4, gain: g / 3, detune: dets[i], vib: [4.6 + i * 0.4, 14, 0.25], rev, dest: split });
  noise(o, t, { color: 'pink', dur, a, gain: g * 0.05, rev, dest: split });
  return e;
}

function pluck(o: Out, t: number, f: number, dur: number, g: number, type: OscillatorType, cutoff: number, decay: number): number {
  const d = Math.min(dur + decay, decay * 1.4);
  return tone(o, t, { type, f, dur: d, a: 0.003, gain: g, filter: { type: 'lowpass', f: Math.min(9000, cutoff), f1: Math.max(200, f * 1.5), g: d * 0.6, q: 0.8 } });
}

/**
 * Play one note. `midi` is ignored by unpitched percussion; `dur` is the notated length (s); `vel` 0..1.
 * Returns the end time of the sound.
 */
export function playNote(o: Out, inst: InstrumentId, t: number, midi: number, dur: number, vel: number): number {
  const f = midiToFreq(midi);
  const v = Math.max(0, Math.min(1.2, vel));
  const r = o.rng;
  switch (inst) {
    /* ---------------------------------------------------------------- strings */
    case 'strings':
    case 'strings_dark': {
      const lp = inst === 'strings' ? Math.min(4200, f * 6) : Math.min(1700, f * 3.5);
      const a = Math.min(0.35, dur * 0.3);
      const d = dur + 0.35;
      tone(o, t, { type: 'sawtooth', f, dur: d, a, hold: dur * 0.6, gain: 0.05 * v, detune: -7, vib: [5.2, 9, 0.3], filter: { type: 'lowpass', f: lp, q: 0.6 } });
      return tone(o, t, { type: 'sawtooth', f, dur: d, a: a * 1.2, hold: dur * 0.6, gain: 0.05 * v, detune: 6, vib: [4.7, 8, 0.35], filter: { type: 'lowpass', f: lp * 0.9, q: 0.6 } });
    }
    case 'cello':
      return tone(o, t, { type: 'sawtooth', f, dur: dur + 0.3, a: Math.min(0.18, dur * 0.25), hold: dur * 0.6, gain: 0.09 * v, vib: [5, 12, 0.25], filter: { type: 'lowpass', f: Math.min(2000, f * 5), q: 0.9 }, filter2: { type: 'highpass', f: 50 } });
    case 'contrabass':
      tone(o, t, { type: 'sawtooth', f, dur: dur + 0.25, a: 0.06, hold: dur * 0.5, gain: 0.07 * v, filter: { type: 'lowpass', f: Math.min(700, f * 4) } });
      return tone(o, t, { type: 'triangle', f, dur: dur + 0.25, a: 0.04, hold: dur * 0.5, gain: 0.1 * v });
    case 'pizzicato':
      return pluck(o, t, f, dur, 0.16 * v, 'triangle', f * 5, 0.35);
    case 'orchestra': {
      playNote(o, 'strings', t, midi, dur, v * 0.8);
      playNote(o, 'horn', t, midi - 12, dur, v * 0.6);
      return playNote(o, 'choir', t, midi, dur, v * 0.35);
    }
    /* ---------------------------------------------------------------- winds */
    case 'flute':
      noise(o, t, { color: 'pink', dur: dur + 0.1, a: 0.05, hold: dur * 0.5, gain: 0.018 * v, filter: { type: 'bandpass', f: f * 2, q: 3 } });
      return tone(o, t, { type: 'sine', f, dur: dur + 0.15, a: 0.07, hold: dur * 0.55, gain: 0.12 * v, vib: [5.4, 11, 0.2], filter: { type: 'lowpass', f: 5000 } });
    case 'whistle':
      return tone(o, t, { type: 'sine', f: f * 2, dur: dur + 0.1, a: 0.05, hold: dur * 0.5, gain: 0.06 * v, vib: [6, 18, 0.1] });
    case 'reed':
      return tone(o, t, { type: 'square', f, dur: dur + 0.12, a: 0.05, hold: dur * 0.55, gain: 0.05 * v, vib: [5, 8, 0.25], filter: { type: 'bandpass', f: Math.min(2400, f * 2.5), q: 1.1 }, filter2: { type: 'lowpass', f: 3500 } });
    case 'horn':
      return tone(o, t, { type: 'sawtooth', f, dur: dur + 0.25, a: 0.09, hold: dur * 0.55, gain: 0.08 * v, vib: [4.8, 6, 0.3], filter: { type: 'lowpass', f: Math.min(1500, f * 3), q: 0.7 } });
    case 'brass': {
      const ctx = o.ctx;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.2;
      const peak = Math.min(3600, f * 7);
      lp.frequency.setValueAtTime(Math.max(200, f * 1.2), t);
      lp.frequency.linearRampToValueAtTime(peak, t + 0.07);
      lp.frequency.setTargetAtTime(Math.min(2200, f * 4), t + 0.08, 0.2);
      lp.connect(o.dest);
      const sub: Out = { ...o, dest: lp };
      tone(sub, t, { type: 'sawtooth', f, dur: dur + 0.2, a: 0.03, hold: dur * 0.6, gain: 0.07 * v, detune: -4, vib: [5, 7, 0.3] });
      return tone(sub, t, { type: 'sawtooth', f, dur: dur + 0.2, a: 0.04, hold: dur * 0.6, gain: 0.06 * v, detune: 5 });
    }
    case 'low_brass':
      return tone(o, t, { type: 'sawtooth', f, dur: dur + 0.25, a: 0.07, hold: dur * 0.6, gain: 0.1 * v, filter: { type: 'lowpass', f: Math.min(800, f * 4), f1: Math.min(600, f * 3), q: 1 } });
    /* ---------------------------------------------------------------- voices */
    case 'choir':
      return vowelVoice(o, t, f, dur + 0.5, 0.11 * v, VOWEL_A, Math.min(0.5, dur * 0.4));
    case 'choir_dark':
      return vowelVoice(o, t, f, dur + 0.6, 0.12 * v, f < 200 ? VOWEL_U : VOWEL_O, Math.min(0.6, dur * 0.45));
    case 'choir_reverse':
      return vowelVoice(o, t, f, Math.max(0.6, dur), 0.12 * v, VOWEL_O, 0.01, true);
    case 'growl': {
      const end = t + dur + 0.2;
      const rough = amp(o, t, end, 31 + r.next() * 9, 0.5);
      return tone({ ...o, dest: rough }, t, { type: 'sawtooth', f, dur: dur + 0.2, a: 0.05, hold: dur * 0.5, gain: 0.1 * v, filter: { type: 'lowpass', f: Math.min(900, f * 5), q: 2 } });
    }
    /* ---------------------------------------------------------------- plucked / struck pitched */
    case 'harp':
      tone(o, t, { type: 'sine', f: f * 2, dur: 0.9, a: 0.002, gain: 0.025 * v });
      return pluck(o, t, f, dur, 0.14 * v, 'triangle', f * 8, 1.6);
    case 'pluck':
      return pluck(o, t, f, dur, 0.13 * v, 'triangle', f * 6, 0.6);
    case 'harpsichord':
      tone(o, t, { type: 'square', f, dur: 0.7, a: 0.001, gain: 0.03 * v, filter: { type: 'highpass', f: f * 1.5 }, filter2: { type: 'lowpass', f: 5000, f1: 1500, g: 0.5 } });
      return pluck(o, t, f, dur, 0.06 * v, 'sawtooth', f * 10, 0.8);
    case 'music_box':
      fm(o, t, { f, ratio: 5.0, index: 0.9, index1: 0.02, dur: 1.3, a: 0.001, gain: 0.09 * v });
      return tone(o, t, { type: 'sine', f: f * 4.0, dur: 0.35, a: 0.001, gain: 0.018 * v });
    case 'celesta':
      return fm(o, t, { f, ratio: 4.0, index: 1.2, index1: 0.03, dur: 1.4, a: 0.001, gain: 0.09 * v });
    case 'bells':
      fm(o, t, { f, ratio: 3.5, index: 2.4, index1: 0.05, dur: 3.2, a: 0.001, gain: 0.07 * v });
      return tone(o, t, { type: 'sine', f: f * 0.5, dur: 2.5, a: 0.002, gain: 0.03 * v });
    case 'glass':
      tone(o, t, { type: 'sine', f, dur: dur + 1.4, a: 0.04, gain: 0.08 * v, vib: [3, 5, 0.2] });
      return tone(o, t, { type: 'sine', f: f * 2.756, dur: dur + 0.8, a: 0.03, gain: 0.018 * v });
    case 'marimba':
      click(o, t, Math.min(6000, f * 4), 0.04 * v);
      tone(o, t, { type: 'sine', f: f * 4, dur: 0.12, a: 0.001, gain: 0.03 * v });
      return tone(o, t, { type: 'sine', f, dur: Math.min(0.9, 0.35 + 120 / f), a: 0.002, gain: 0.17 * v });
    case 'kalimba':
      tone(o, t, { type: 'sine', f: f * 5.4, dur: 0.15, a: 0.001, gain: 0.025 * v });
      return tone(o, t, { type: 'sine', f, dur: 0.8, a: 0.002, gain: 0.14 * v });
    /* ---------------------------------------------------------------- keys / pads */
    case 'organ': {
      const d = dur + 0.12;
      const end = t + d;
      const trem = amp(o, t, end, 5.5, 0.12);
      const so: Out = { ...o, dest: trem };
      tone(so, t, { type: 'sine', f, dur: d, a: 0.02, hold: dur * 0.85, gain: 0.07 * v });
      tone(so, t, { type: 'sine', f: f * 2, dur: d, a: 0.02, hold: dur * 0.85, gain: 0.04 * v });
      tone(so, t, { type: 'sine', f: f * 3, dur: d, a: 0.02, hold: dur * 0.85, gain: 0.022 * v });
      return tone(so, t, { type: 'sine', f: f * 0.5, dur: d, a: 0.03, hold: dur * 0.85, gain: 0.05 * v });
    }
    case 'pad_cold':
      tone(o, t, { type: 'triangle', f, dur: dur + 1.2, a: Math.min(1.2, dur * 0.5), hold: dur * 0.4, gain: 0.06 * v, detune: -6, vib: [0.3, 6] });
      tone(o, t, { type: 'triangle', f: f * 2, dur: dur + 1.2, a: Math.min(1.5, dur * 0.6), hold: dur * 0.3, gain: 0.02 * v, detune: 7 });
      return tone(o, t, { type: 'sine', f: f * 3.01, dur: dur + 1, a: Math.min(1.5, dur * 0.6), gain: 0.008 * v });
    case 'pad_warm':
      tone(o, t, { type: 'sawtooth', f, dur: dur + 1, a: Math.min(0.9, dur * 0.45), hold: dur * 0.45, gain: 0.04 * v, detune: -8, filter: { type: 'lowpass', f: Math.min(1100, f * 3), q: 0.5 } });
      return tone(o, t, { type: 'sawtooth', f, dur: dur + 1, a: Math.min(1, dur * 0.5), hold: dur * 0.45, gain: 0.04 * v, detune: 8, filter: { type: 'lowpass', f: Math.min(1000, f * 2.8), q: 0.5 } });
    case 'drone':
      tone(o, t, { type: 'sawtooth', f, dur: dur + 1.5, a: Math.min(1.5, dur * 0.4), hold: dur * 0.5, gain: 0.05 * v, filter: { type: 'lowpass', f: Math.min(450, f * 3), q: 1.5 }, vib: [0.2, 6] });
      return tone(o, t, { type: 'sine', f, dur: dur + 1.5, a: Math.min(1.5, dur * 0.4), hold: dur * 0.5, gain: 0.07 * v });
    case 'sub':
      return tone(o, t, { type: 'sine', f: Math.max(41, f), dur: dur + 0.2, a: 0.02, hold: dur * 0.6, gain: 0.16 * v });
    case 'reverse_swell': {
      const d = Math.max(0.5, dur);
      noise(o, t, { color: 'pink', dur: d, gain: 0.06 * v, rev: true, filter: { type: 'bandpass', f: 300, f1: 2600, q: 0.8 } });
      return tone(o, t, { type: 'sawtooth', f, dur: d, gain: 0.04 * v, rev: true, filter: { type: 'lowpass', f: f * 2, f1: Math.min(4000, f * 10) } });
    }
    /* ---------------------------------------------------------------- percussion */
    case 'taiko':
      noise(o, t, { color: 'brown', dur: 0.35, a: 0.001, gain: 0.2 * v, filter: { type: 'lowpass', f: 300 } });
      return tone(o, t, { type: 'sine', f: 95, f1: 48, glide: 0.25, dur: 0.6, a: 0.001, gain: 0.32 * v });
    case 'timpani':
      noise(o, t, { color: 'brown', dur: 0.12, a: 0.001, gain: 0.08 * v, filter: { type: 'lowpass', f: 400 } });
      return tone(o, t, { type: 'sine', f: Math.max(55, Math.min(180, f)), f1: Math.max(50, Math.min(170, f * 0.97)), dur: 1.3, a: 0.002, gain: 0.26 * v });
    case 'frame_drum':
      noise(o, t, { color: 'pink', dur: 0.08, a: 0.001, gain: 0.08 * v, filter: { type: 'bandpass', f: 350, q: 1.2 } });
      return tone(o, t, { type: 'sine', f: 130, f1: 82, glide: 0.1, dur: 0.3, a: 0.001, gain: 0.2 * v });
    case 'thunder_drum':
      noise(o, t, { color: 'brown', dur: 1.2, a: 0.004, gain: 0.18 * v, filter: { type: 'lowpass', f: 220, f1: 90 } });
      return tone(o, t, { type: 'sine', f: 70, f1: 36, glide: 0.5, dur: 1.0, a: 0.002, gain: 0.28 * v });
    case 'snare':
      noise(o, t, { dur: 0.14, a: 0.001, gain: 0.12 * v, filter: { type: 'bandpass', f: 2000, q: 0.8 }, filter2: { type: 'lowpass', f: 6500 } });
      return tone(o, t, { type: 'triangle', f: 190, f1: 150, dur: 0.08, a: 0.001, gain: 0.08 * v });
    case 'rim':
      return click(o, t, 2200, 0.12 * v, 0.03);
    case 'shaker':
      return noise(o, t, { dur: 0.06, a: 0.012, gain: 0.04 * v, filter: { type: 'bandpass', f: 6000, q: 1.2 }, filter2: { type: 'lowpass', f: 8000 } });
    case 'hat':
      return noise(o, t, { dur: 0.035, a: 0.001, gain: 0.035 * v, filter: { type: 'highpass', f: 7000 }, filter2: { type: 'lowpass', f: 10000 } });
    case 'anvil':
      return fm(o, t, { f: 1250 * r.range(0.98, 1.02), ratio: 1.41, index: 2.2, index1: 0.05, dur: 0.7, a: 0.001, gain: 0.05 * v, filter: { type: 'lowpass', f: 5000 } });
    case 'gong':
      fm(o, t, { f: 82, ratio: 1.41, index: 3, index1: 0.4, dur: 4, a: 0.01, gain: 0.12 * v });
      return noise(o, t, { color: 'pink', dur: 2.5, a: 0.3, gain: 0.025 * v, filter: { type: 'bandpass', f: 900, q: 2 } });
    case 'woodblock':
      click(o, t, 1800, 0.05 * v, 0.02, 4);
      return tone(o, t, { type: 'sine', f: Math.max(500, Math.min(1400, f)), dur: 0.09, a: 0.001, gain: 0.1 * v });
    case 'heartbeat':
      // one pulse of the Portatore heartbeat: low, padded, felt more than heard (vel ~0.6 lub, 1 dub)
      noise(o, t, { color: 'brown', dur: 0.14, a: 0.004, gain: 0.08 * v, filter: { type: 'lowpass', f: 160 } });
      return tone(o, t, { type: 'sine', f: 62, f1: 44, glide: 0.12, dur: 0.24, a: 0.006, gain: 0.32 * v, filter: { type: 'lowpass', f: 200 } });
    case 'chains': {
      let e = t;
      for (let i = 0; i < 4; i++) e = Math.max(e, fm(o, t, { f: r.range(1900, 3600), ratio: 1.73, index: 1.4, dur: 0.07, gain: 0.025 * v, delay: r.next() * 0.09 }));
      return e;
    }
    case 'clock':
      click(o, t, 3200, 0.05 * v, 0.012, 6);
      return tone(o, t, { type: 'sine', f: 2400, dur: 0.03, a: 0.001, gain: 0.025 * v });
    default:
      return tone(o, t, { type: 'triangle', f, dur: dur + 0.2, a: 0.02, gain: 0.08 * v });
  }
}

function click(o: Out, t: number, f: number, gain: number, dur = 0.02, q = 2): number {
  return noise(o, t, { dur, a: 0.001, gain, filter: { type: 'bandpass', f, q } });
}

/** True for instruments whose notes sustain (used to decide note overlap / legato length). */
export function isSustained(inst: InstrumentId): boolean {
  switch (inst) {
    case 'strings': case 'strings_dark': case 'cello': case 'contrabass': case 'flute': case 'reed': case 'horn': case 'brass':
    case 'low_brass': case 'choir': case 'choir_dark': case 'choir_reverse': case 'organ': case 'pad_cold': case 'pad_warm':
    case 'drone': case 'sub': case 'growl': case 'orchestra': case 'whistle': case 'glass':
      return true;
    default:
      return false;
  }
}
