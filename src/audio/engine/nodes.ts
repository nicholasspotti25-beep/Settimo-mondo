/**
 * Synthesis building blocks shared by SFX recipes and music instruments: enveloped oscillators, filtered noise bursts, FM
 * pairs and waveshapers. Every source is registered in `o.srcs` (when given) so the voice pool can stop stolen voices.
 */
import type { AudioRng } from '../core/rng';
import type { NoiseBank, NoiseColor } from './noise';

export interface Out {
  ctx: BaseAudioContext;
  dest: AudioNode;
  srcs: AudioScheduledSourceNode[] | null;
  noise: NoiseBank;
  rng: AudioRng;
}

export interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  /** Glide target frequency. */
  f1?: number;
  /** Glide duration (s) (default: whole sound). */
  g?: number;
  q?: number;
  gain?: number;
}

export interface EnvSpec {
  dur: number;
  a?: number;
  hold?: number;
  gain: number;
  /** Reverse envelope: rises over the whole duration then cuts. */
  rev?: boolean;
}

export interface ToneSpec extends EnvSpec {
  type?: OscillatorType;
  f: number;
  f1?: number;
  glide?: number;
  detune?: number;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  /** Vibrato [rate Hz, depth cents, delay s]. */
  vib?: [number, number, number?];
  dest?: AudioNode;
  delay?: number;
}

export interface NoiseSpec extends EnvSpec {
  color?: NoiseColor;
  filter?: FilterSpec;
  filter2?: FilterSpec;
  rate?: number;
  dest?: AudioNode;
  delay?: number;
}

export interface FmSpec extends EnvSpec {
  f: number;
  ratio: number;
  index: number;
  index1?: number;
  f1?: number;
  glide?: number;
  type?: OscillatorType;
  dest?: AudioNode;
  delay?: number;
  filter?: FilterSpec;
}

const SAFE = (f: number) => Math.max(1, Math.min(22000, Number.isFinite(f) ? f : 440));

export function track(o: Out, s: AudioScheduledSourceNode): void {
  if (o.srcs) o.srcs.push(s);
}

/** Envelope gain node from t; returns the node and the end time. */
export function envGain(o: Out, t: number, e: EnvSpec, dest: AudioNode): { g: GainNode; end: number } {
  const g = o.ctx.createGain();
  const a = Math.max(0.001, e.a ?? 0.005);
  const hold = Math.max(0, e.hold ?? 0);
  const end = t + Math.max(a + hold + 0.01, e.dur);
  const p = g.gain;
  const peak = Math.max(0, e.gain);
  if (e.rev) {
    p.setValueAtTime(0.0001, t);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak), end - 0.04);
    p.linearRampToValueAtTime(0, end);
  } else {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) p.setValueAtTime(peak, t + a + hold);
    const tau = Math.max(0.002, (end - (t + a + hold)) / 6);
    p.setTargetAtTime(0, t + a + hold, tau);
  }
  g.connect(dest);
  return { g, end };
}

export function makeFilter(o: Out, t: number, fs: FilterSpec, dur: number): BiquadFilterNode {
  const f = o.ctx.createBiquadFilter();
  f.type = fs.type;
  f.frequency.setValueAtTime(SAFE(fs.f), t);
  if (fs.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(SAFE(fs.f1), t + Math.max(0.005, fs.g ?? dur));
  f.Q.value = fs.q ?? 0.7;
  if (fs.gain !== undefined) f.gain.value = fs.gain;
  return f;
}

/** Chain optional filters in front of `dest`; returns the node sources should connect to. */
function chain(o: Out, t: number, dur: number, dest: AudioNode, f1?: FilterSpec, f2?: FilterSpec): AudioNode {
  let head = dest;
  if (f2) {
    const n = makeFilter(o, t, f2, dur);
    n.connect(head);
    head = n;
  }
  if (f1) {
    const n = makeFilter(o, t, f1, dur);
    n.connect(head);
    head = n;
  }
  return head;
}

export function tone(o: Out, t0: number, s: ToneSpec): number {
  const t = t0 + (s.delay ?? 0);
  const { g, end } = envGain(o, t, s, s.dest ?? o.dest);
  const head = chain(o, t, end - t, g, s.filter, s.filter2);
  const osc = o.ctx.createOscillator();
  osc.type = s.type ?? 'sine';
  osc.frequency.setValueAtTime(SAFE(s.f), t);
  if (s.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(SAFE(s.f1), t + Math.max(0.005, s.glide ?? end - t));
  if (s.detune) osc.detune.value = s.detune;
  if (s.vib && s.vib[1] > 0) {
    const lfo = o.ctx.createOscillator();
    lfo.frequency.value = s.vib[0];
    const lg = o.ctx.createGain();
    const d0 = s.vib[2] ?? 0;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(s.vib[1], t + d0 + 0.15);
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t);
    lfo.stop(end + 0.02);
    track(o, lfo);
  }
  osc.connect(head);
  osc.start(t);
  osc.stop(end + 0.02);
  track(o, osc);
  return end;
}

export function noise(o: Out, t0: number, s: NoiseSpec): number {
  const t = t0 + (s.delay ?? 0);
  const { g, end } = envGain(o, t, s, s.dest ?? o.dest);
  const head = chain(o, t, end - t, g, s.filter, s.filter2);
  const src = o.ctx.createBufferSource();
  const buf = o.noise.get(s.color ?? 'white');
  src.buffer = buf;
  src.loop = true;
  if (s.rate) src.playbackRate.value = s.rate;
  src.connect(head);
  src.start(t, o.rng.next() * (buf.duration - 0.5));
  src.stop(end + 0.02);
  track(o, src);
  return end;
}

export function fm(o: Out, t0: number, s: FmSpec): number {
  const t = t0 + (s.delay ?? 0);
  const { g, end } = envGain(o, t, s, s.dest ?? o.dest);
  const head = s.filter ? chain(o, t, end - t, g, s.filter) : g;
  const car = o.ctx.createOscillator();
  car.type = s.type ?? 'sine';
  const mod = o.ctx.createOscillator();
  const mg = o.ctx.createGain();
  const f = SAFE(s.f);
  car.frequency.setValueAtTime(f, t);
  mod.frequency.setValueAtTime(SAFE(f * s.ratio), t);
  if (s.f1 !== undefined) {
    const gt = t + Math.max(0.005, s.glide ?? end - t);
    car.frequency.exponentialRampToValueAtTime(SAFE(s.f1), gt);
    mod.frequency.exponentialRampToValueAtTime(SAFE(s.f1 * s.ratio), gt);
  }
  mg.gain.setValueAtTime(f * s.index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * (s.index1 ?? s.index * 0.05)), end);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(head);
  car.start(t);
  mod.start(t);
  car.stop(end + 0.02);
  mod.stop(end + 0.02);
  track(o, car);
  track(o, mod);
  return end;
}

/** A waveshaper feeding `dest` (returns it as a new destination). */
export function shaper(o: Out, curve: 'soft' | 'hard' | 'fold' | 'asym', dest: AudioNode = o.dest, drive = 1): AudioNode {
  const ws = o.ctx.createWaveShaper();
  ws.curve = o.noise.curve(curve);
  ws.connect(dest);
  if (drive === 1) return ws;
  const pre = o.ctx.createGain();
  pre.gain.value = drive;
  pre.connect(ws);
  return pre;
}

/** Static gain stage into dest. */
export function gainNode(o: Out, v: number, dest: AudioNode = o.dest): GainNode {
  const g = o.ctx.createGain();
  g.gain.value = v;
  g.connect(dest);
  return g;
}

/** Amplitude modulation (tremolo / growl roughness): returns a node whose output is modulated at `rate` Hz by `depth`. */
export function amp(o: Out, t: number, end: number, rate: number, depth: number, dest: AudioNode = o.dest): GainNode {
  const g = o.ctx.createGain();
  g.gain.value = 1 - depth;
  const lfo = o.ctx.createOscillator();
  lfo.frequency.value = rate;
  const lg = o.ctx.createGain();
  lg.gain.value = depth;
  lfo.connect(lg);
  lg.connect(g.gain);
  lfo.start(t);
  lfo.stop(end + 0.02);
  track(o, lfo);
  g.connect(dest);
  return g;
}

/** Linear-ish pan inside a recipe (independent of the channel panner). */
export function panNode(o: Out, pan: number, dest: AudioNode = o.dest): AudioNode {
  if (typeof (o.ctx as AudioContext).createStereoPanner !== 'function') return dest;
  const p = o.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  return p;
}

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
