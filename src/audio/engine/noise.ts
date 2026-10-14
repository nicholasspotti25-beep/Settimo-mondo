/** Noise buffers pre-rendered once per AudioContext (white, pink, brown) + cached waveshaper curves. */
import { AudioRng } from '../core/rng';

export type NoiseColor = 'white' | 'pink' | 'brown';

export class NoiseBank {
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly brown: AudioBuffer;
  private curves = new Map<string, Float32Array<ArrayBuffer>>();

  constructor(ctx: BaseAudioContext, seconds = 3) {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const rng = new AudioRng(0x5e77);
    this.white = ctx.createBuffer(1, n, sr);
    this.pink = ctx.createBuffer(1, n, sr);
    this.brown = ctx.createBuffer(1, n, sr);
    const w = this.white.getChannelData(0);
    const p = this.pink.getChannelData(0);
    const b = this.brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let br = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.next() * 2 - 1;
      w[i] = x * 0.7;
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + x * 0.0555179;
      b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522;
      b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
      br = (br + 0.02 * x) / 1.02;
      b[i] = br * 3.2;
    }
    // smooth the loop seam (short crossfade) so looping beds do not click
    const fade = Math.min(2048, n >> 4);
    for (const d of [w, p, b]) {
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[n - fade + i] = d[n - fade + i] * (1 - k) + d[i] * k;
      }
    }
  }

  get(c: NoiseColor): AudioBuffer {
    return c === 'pink' ? this.pink : c === 'brown' ? this.brown : this.white;
  }

  /** Waveshaper curves: soft (gentle saturation), hard (growl), fold (madness), clip (master safety). */
  curve(name: 'soft' | 'hard' | 'fold' | 'clip' | 'asym'): Float32Array<ArrayBuffer> {
    const c = this.curves.get(name);
    if (c) return c;
    const n = 2048;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      let y: number;
      switch (name) {
        case 'soft': y = Math.tanh(1.6 * x) / Math.tanh(1.6); break;
        case 'hard': y = Math.tanh(5 * x) / Math.tanh(5); break;
        case 'fold': y = Math.sin(x * Math.PI * 1.5) * 0.85; break;
        case 'asym': y = x >= 0 ? Math.tanh(3 * x) : Math.tanh(1.2 * x) * 0.8; break;
        default: {
          // transparent below 0.75, soft knee to +-1
          const a = Math.abs(x);
          y = a < 0.75 ? x : Math.sign(x) * (0.75 + 0.25 * Math.tanh((a - 0.75) / 0.25));
        }
      }
      out[i] = y;
    }
    this.curves.set(name, out);
    return out;
  }
}
