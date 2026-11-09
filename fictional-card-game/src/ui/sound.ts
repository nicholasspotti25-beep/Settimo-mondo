/** Small synthesized sound effects (Web Audio) — no audio files needed. */
import { repo } from '../store/repo';
import type { Rarity } from '../model/types';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!repo.settings.sound) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0, slide = 0): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol = 0.08, delay = 0, hp = 1200): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource();
  s.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(t);
}

const CHORDS: Record<Rarity, number[]> = {
  common: [523],
  rare: [587, 880],
  epic: [523, 659, 988],
  legendary: [523, 659, 784, 1047],
  mythic: [440, 554, 659, 880, 1109],
  secret: [392, 494, 587, 784, 988, 1175],
  omniversal: [262, 392, 523, 659, 784, 1047, 1319],
};

export const sfx = {
  tap(): void { tone(660, 0.06, 'triangle', 0.05); },
  flip(): void { noise(0.12, 0.06, 0, 2500); tone(420, 0.09, 'triangle', 0.04, 0, 1.6); },
  tear(): void { noise(0.45, 0.14, 0, 800); tone(180, 0.3, 'sawtooth', 0.03, 0, 2.5); },
  coin(): void { tone(1318, 0.08, 'square', 0.04); tone(1760, 0.18, 'square', 0.04, 0.07); },
  error(): void { tone(220, 0.18, 'sawtooth', 0.05, 0, 0.7); },
  win(): void { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.07, i * 0.09)); },
  tie(): void { tone(440, 0.25, 'sine', 0.06); tone(440, 0.25, 'sine', 0.06, 0.2); },
  hint(r: Rarity): void { tone(220 + 60 * CHORDS[r].length, 0.25, 'sine', 0.04, 0, 1.5); },
  reveal(r: Rarity): void {
    const notes = CHORDS[r];
    const big = notes.length >= 4;
    notes.forEach((f, i) => tone(f, big ? 0.9 : 0.4, big ? 'triangle' : 'sine', 0.06, i * (big ? 0.07 : 0.04)));
    if (big) noise(0.5, 0.05, 0, 4000);
  },
  cosmic(): void {
    tone(55, 3.2, 'sawtooth', 0.05, 0, 4);
    tone(110, 3, 'sine', 0.06, 0.4, 3);
    noise(2.5, 0.04, 0.3, 300);
  },
};
