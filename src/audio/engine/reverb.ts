/**
 * Procedural reverb: impulse responses synthesized per environment (plains, forest, cave, hall, cathedral, glass, void),
 * rendered once and cached; environment switches crossfade between two ConvolverNodes.
 */
import { AudioRng } from '../core/rng';
import type { ReverbEnv } from '../music/data';

interface IrParams {
  dur: number;
  /** Early reflections: count and spread (s). */
  early: number;
  spread: number;
  /** Damping cutoff start/end (Hz). */
  bright: number;
  dark: number;
  predelay: number;
  /** Slow onset (cathedral bloom) 0..1. */
  bloom: number;
  /** Metallic ringing partials (glass). */
  ring: number[];
  /** Output wet level. */
  wet: number;
}

export const REVERB_PARAMS: Record<ReverbEnv, IrParams> = {
  plains: { dur: 1.3, early: 3, spread: 0.08, bright: 6000, dark: 2500, predelay: 0.012, bloom: 0, ring: [], wet: 0.16 },
  forest: { dur: 1.9, early: 9, spread: 0.06, bright: 5000, dark: 1500, predelay: 0.008, bloom: 0.1, ring: [], wet: 0.22 },
  cave: { dur: 2.8, early: 7, spread: 0.05, bright: 3000, dark: 700, predelay: 0.018, bloom: 0.15, ring: [], wet: 0.34 },
  hall: { dur: 2.5, early: 6, spread: 0.07, bright: 5000, dark: 1600, predelay: 0.02, bloom: 0.2, ring: [], wet: 0.28 },
  cathedral: { dur: 5.2, early: 8, spread: 0.11, bright: 5200, dark: 1400, predelay: 0.035, bloom: 0.45, ring: [], wet: 0.36 },
  glass: { dur: 2.4, early: 5, spread: 0.04, bright: 9000, dark: 4000, predelay: 0.01, bloom: 0.1, ring: [2210, 3320, 5170, 7480], wet: 0.3 },
  void: { dur: 7.0, early: 0, spread: 0.2, bright: 3200, dark: 500, predelay: 0.06, bloom: 0.6, ring: [], wet: 0.44 },
};

export function renderImpulse(ctx: BaseAudioContext, env: ReverbEnv, maxDur: number): AudioBuffer {
  const p = REVERB_PARAMS[env];
  const sr = ctx.sampleRate;
  const dur = Math.min(p.dur, maxDur);
  const n = Math.max(1, Math.floor(sr * (dur + p.predelay)));
  const buf = ctx.createBuffer(2, n, sr);
  const rng = new AudioRng(0x1e5 + env.length * 7919 + Math.round(dur * 100));
  const k = Math.log(1000) / dur; // -60 dB at dur
  const pre = Math.floor(p.predelay * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    let energy = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const fc = p.dark + (p.bright - p.dark) * Math.exp(-t * 3 / dur);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      const x = rng.next() * 2 - 1;
      y += a * (x - y);
      let e = Math.exp(-k * t);
      if (p.bloom > 0) e *= 1 - p.bloom * Math.exp(-t / (0.08 + p.bloom * 0.25));
      let s = y * e;
      if (p.ring.length) {
        let r = 0;
        for (let j = 0; j < p.ring.length; j++) r += Math.sin(2 * Math.PI * p.ring[j] * (1 + ch * 0.003) * t + j) * Math.exp(-t * (2.2 + j));
        s += r * 0.05 * e;
      }
      d[i] = s;
    }
    // early reflections (scaled relative to the diffuse tail level)
    let peak = 0;
    for (let i = pre; i < Math.min(n, pre + Math.floor(0.05 * sr)); i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let r = 0; r < p.early; r++) {
      const at = pre + Math.floor((0.004 + rng.next() * p.spread) * sr);
      if (at < n) d[at] += (rng.next() > 0.5 ? 1 : -1) * peak * (2.5 - r * 0.2) * (0.6 + 0.4 * rng.next());
    }
    for (let i = 0; i < n; i++) energy += d[i] * d[i];
    const norm = 1 / Math.sqrt(Math.max(1e-12, energy));
    for (let i = 0; i < n; i++) d[i] *= norm;
  }
  return buf;
}

export class ReverbUnit {
  readonly input: GainNode;
  readonly output: GainNode;
  private cache = new Map<ReverbEnv, AudioBuffer>();
  private cur: { conv: ConvolverNode; gain: GainNode } | null = null;
  env: ReverbEnv | null = null;
  maxDur: number;

  constructor(private ctx: BaseAudioContext, maxDur: number) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.maxDur = maxDur;
  }

  ir(env: ReverbEnv): AudioBuffer {
    let b = this.cache.get(env);
    if (!b) {
      b = renderImpulse(this.ctx, env, this.maxDur);
      this.cache.set(env, b);
    }
    return b;
  }

  setEnv(env: ReverbEnv, fade = 1.2): void {
    if (env === this.env) return;
    this.env = env;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = this.ir(env);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(REVERB_PARAMS[env].wet * 2.2, now + fade);
    this.input.connect(conv);
    conv.connect(gain);
    gain.connect(this.output);
    const old = this.cur;
    this.cur = { conv, gain };
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + fade);
      const kill = () => {
        try {
          this.input.disconnect(old.conv);
        } catch {
          /* already gone */
        }
        old.conv.disconnect();
        old.gain.disconnect();
      };
      if (typeof setTimeout === 'function' && 'resume' in ctx) setTimeout(kill, (fade + REVERB_PARAMS[env].dur + 0.5) * 1000);
    }
  }
}
