/**
 * Speaker voice tones: a short synthesized murmur per dialogue line (no words; a melodic, breathy "speech" contour) built from
 * SpeakerDef.voice = { base Hz, formant Hz, wave, vibrato cents, breath 0..1 }. Unknown speakers derive a stable voice from
 * their id. The Voce dell'Alba is ethereal: an octave shimmer, slow attacks and a long airy tail.
 */
import { AudioRng, hashString } from '../core/rng';
import { noise, tone, type Out } from '../engine/nodes';

export interface VoiceTone {
  base: number;
  formant: number;
  wave: OscillatorType;
  vibrato: number;
  breath: number;
}

/** Deterministic voice for a speaker id without data. */
export function deriveVoice(id: string): VoiceTone {
  const r = new AudioRng(hashString(`voice:${id}`));
  const low = r.chance(0.5);
  return {
    base: low ? r.range(95, 150) : r.range(170, 260),
    formant: r.range(600, 1300),
    wave: r.pick(['sawtooth', 'triangle', 'square'] as const),
    vibrato: r.range(8, 30),
    breath: r.range(0.1, 0.45),
  };
}

/** Number of syllables for a line of text (~1 per 3.2 letters, 3..14). */
export function syllablesFor(text: string): number {
  let letters = 0;
  for (let i = 0; i < text.length; i++) if (/\p{L}/u.test(text[i])) letters++;
  return Math.max(3, Math.min(14, Math.round(letters / 3.2)));
}

/**
 * Schedule a murmur into o.dest. `seed` varies the contour per line; `ethereal` = Voce dell'Alba. Returns the end time.
 */
export function murmur(o: Out, t: number, v: VoiceTone, syllables: number, seed: number, ethereal = false): number {
  const r = new AudioRng(seed);
  const ctx = o.ctx;
  // two formant bands shared by every syllable of the line
  const sum = ctx.createGain();
  sum.gain.value = 1;
  sum.connect(o.dest);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = Math.max(200, v.formant);
  f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = Math.max(400, v.formant * 2.3);
  f2.Q.value = 5;
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  f1.connect(sum);
  f2.connect(g2);
  g2.connect(sum);
  lp.connect(f1);
  lp.connect(f2);
  // a low direct path keeps the voice warm on small speakers
  const body = ctx.createGain();
  body.gain.value = 0.35;
  lp.connect(body);
  body.connect(sum);
  const so: Out = { ...o, dest: lp };
  let at = t;
  const n = Math.max(1, syllables);
  const fall = 0.82 + r.next() * 0.08;
  const question = r.chance(0.18);
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    // phrase contour: gentle rise, then fall (or rise at the end for a question)
    let contour = 1 + 0.12 * Math.sin(k * Math.PI) - (1 - fall) * k;
    if (question && i >= n - 2) contour += 0.12;
    const f = v.base * contour * r.range(0.95, 1.07);
    const dur = (ethereal ? 0.16 : 0.1) + r.next() * (ethereal ? 0.12 : 0.08);
    const gain = (0.07 + r.next() * 0.03) * (i === 0 ? 1.1 : 1);
    tone(so, at, { type: v.wave, f, f1: f * r.range(0.94, 1.04), dur, a: ethereal ? 0.05 : 0.018, gain, vib: v.vibrato > 0 ? [5.5, v.vibrato] : undefined });
    if (v.breath > 0.02) noise(so, at, { color: 'pink', dur: dur * 0.9, a: 0.02, gain: gain * v.breath * 0.8, filter: { type: 'bandpass', f: v.formant * 1.8, q: 1.5 } });
    if (ethereal) tone(o, at, { type: 'sine', f: f * 2, dur: dur * 2.2, a: 0.06, gain: gain * 0.35, vib: [4, 12] });
    at += dur + (r.chance(0.18) ? 0.12 : 0.03) + r.next() * 0.03;
  }
  return at + (ethereal ? 1.2 : 0.2);
}
