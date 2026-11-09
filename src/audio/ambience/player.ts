/**
 * Zone ambience: looping filtered-noise beds with slow LFOs (wind, surf, fire roar), sustained tones (hums, drones) and a
 * Poisson stream of synthesized one-shot events (birds, crickets, drips, distant bells, gulls, ice cracks...) placed at random
 * stereo positions. Time of day tints the whole bed (brightness + level) and gates day/night events. Zone changes crossfade.
 */
import { AudioRng, hashString } from '../core/rng';
import { fm, noise, tone, type Out } from '../engine/nodes';
import type { NoiseBank } from '../engine/noise';
import { bell, chime, click, crunch, rumble, whoosh } from '../sfx/kit';
import type { AmbEventKind, AmbienceEvent, AmbienceSpec } from '../music/data';

export type Tod = 'alba' | 'giorno' | 'tramonto' | 'notte';

/** Brightness (lowpass Hz) and level per time of day. */
export const TOD_TINT: Record<Tod, { lp: number; gain: number }> = {
  alba: { lp: 9000, gain: 0.95 },
  giorno: { lp: 14000, gain: 1 },
  tramonto: { lp: 6500, gain: 0.92 },
  notte: { lp: 4200, gain: 0.85 },
};

interface Layer {
  id: string;
  spec: AmbienceSpec;
  out: GainNode;
  tint: BiquadFilterNode;
  sources: AudioScheduledSourceNode[];
  /** Next fire time per event (context seconds). */
  next: number[];
  stopAt: number;
}

/** One ambience event recipe (o.dest already panned). Returns the end time. */
export function ambEvent(o: Out, t: number, kind: AmbEventKind, gain: number, pitch: number): number {
  const r = o.rng;
  const g = gain;
  const p = pitch;
  switch (kind) {
    case 'bird': {
      const n = r.int(2, 5);
      const base = r.range(2600, 4200) * p;
      let e = t;
      for (let i = 0; i < n; i++) e = tone(o, t, { f: base * r.range(0.9, 1.15), f1: base * r.range(1.1, 1.5), dur: r.range(0.05, 0.11), a: 0.008, gain: g * 0.1, delay: i * r.range(0.09, 0.16) });
      return e;
    }
    case 'cricket': {
      let e = t;
      for (let i = 0; i < 3; i++) e = tone(o, t, { f: 4300 * p, dur: 0.04, a: 0.004, gain: g * 0.04, delay: i * 0.06, vib: [60, 120] });
      return e;
    }
    case 'owl':
      tone(o, t, { f: 390 * p, f1: 360 * p, dur: 0.35, a: 0.06, gain: g * 0.12, filter: { type: 'lowpass', f: 1200 } });
      return tone(o, t, { f: 380 * p, f1: 330 * p, dur: 0.6, a: 0.08, gain: g * 0.1, delay: 0.5, filter: { type: 'lowpass', f: 1200 } });
    case 'frog': {
      let e = t;
      const n = r.int(2, 4);
      for (let i = 0; i < n; i++) e = fm(o, t, { f: 180 * p, ratio: 2.01, index: 3, dur: 0.09, a: 0.01, gain: g * 0.1, delay: i * 0.14, filter: { type: 'lowpass', f: 1400 } });
      return e;
    }
    case 'drip':
      return tone(o, t, { f: r.range(1300, 2200) * p, f1: r.range(2400, 3200) * p, dur: 0.07, a: 0.002, gain: g * 0.12 });
    case 'crackle':
    case 'ember':
      return crunch(o, t, (kind === 'ember' ? 4200 : 2600) * p, g * 0.25, kind === 'ember' ? 3 : 6, 0.25);
    case 'thunder':
      return rumble(o, t, r.range(2.5, 4.5), g * 0.6, 140);
    case 'bell_far':
      return bell(o, t, r.pick([392, 440, 523.3, 293.7]) * p, 4.5, g * 0.12, 3.5, 2);
    case 'creak':
    case 'rope_creak':
      return tone(o, t, { type: 'sawtooth', f: r.range(140, 260) * p, f1: r.range(180, 320) * p, dur: r.range(0.3, 0.7), a: 0.08, gain: g * 0.05, filter: { type: 'bandpass', f: 900, q: 6 } });
    case 'water_lap':
      return noise(o, t, { color: 'pink', dur: r.range(0.4, 0.8), a: 0.12, gain: g * 0.22, filter: { type: 'bandpass', f: 600 * p, f1: 1300 * p, q: 1.5 } });
    case 'wave':
      return noise(o, t, { color: 'pink', dur: r.range(2.5, 4), a: 1.2, gain: g * 0.35, filter: { type: 'lowpass', f: 1800 * p, f1: 500, q: 0.6 } });
    case 'gust':
      return whoosh(o, t, 200 * p, 900 * p, r.range(1.8, 3.2), g * 0.3, 0.7, 'pink');
    case 'howl':
    case 'wolf_far':
      return tone(o, t, { type: 'triangle', f: 420 * p, f1: 560 * p, glide: 0.8, dur: r.range(1.6, 2.4), a: 0.4, gain: g * 0.06, vib: [5, 25, 0.3], filter: { type: 'lowpass', f: 1500 } });
    case 'whisper':
      return noise(o, t, { color: 'pink', dur: r.range(0.6, 1.2), a: 0.15, gain: g * 0.12, filter: { type: 'bandpass', f: r.range(1500, 3200) * p, q: 5 }, filter2: { type: 'bandpass', f: r.range(700, 1100), q: 1 } });
    case 'chain':
      return crunch(o, t, 3000 * p, g * 0.15, 5, 0.3);
    case 'anvil':
      return fm(o, t, { f: 1200 * p, ratio: 1.41, index: 2, dur: 1.2, a: 0.001, gain: g * 0.06, filter: { type: 'lowpass', f: 4000 } });
    case 'ice_crack':
      return crunch(o, t, 3800 * p, g * 0.25, 7, 0.12);
    case 'chime':
      return chime(o, t, r.pick([1318.5, 1568, 1760, 2093]) * p, 2, g * 0.06);
    case 'bubble':
      return tone(o, t, { f: r.range(250, 500) * p, f1: r.range(700, 1100) * p, dur: 0.08, a: 0.005, gain: g * 0.12 });
    case 'buzz':
      return tone(o, t, { type: 'sawtooth', f: r.range(180, 240) * p, dur: r.range(0.6, 1.4), a: 0.2, gain: g * 0.02, vib: [9, 40], filter: { type: 'bandpass', f: 600, q: 2 } });
    case 'rustle':
      return noise(o, t, { color: 'pink', dur: r.range(0.4, 0.9), a: 0.1, gain: g * 0.14, filter: { type: 'highpass', f: 2500 * p } });
    case 'rumble':
      return rumble(o, t, r.range(1.5, 3), g * 0.35, 110);
    case 'choir_far': {
      const f = r.pick([220, 246.9, 293.7]) * p;
      tone(o, t, { type: 'triangle', f, dur: 3, a: 1, gain: g * 0.03, vib: [5, 10], filter: { type: 'bandpass', f: 800, q: 2 } });
      return tone(o, t, { type: 'triangle', f: f * 1.5, dur: 3, a: 1.2, gain: g * 0.02, vib: [4.5, 10], filter: { type: 'bandpass', f: 1100, q: 2 } });
    }
    case 'whistle':
      return tone(o, t, { f: r.range(1200, 1800) * p, f1: r.range(900, 1300) * p, dur: 0.9, a: 0.2, gain: g * 0.03 });
    case 'knock':
      return click(o, t, 900 * p, g * 0.2, 0.04, 4);
    case 'gull': {
      tone(o, t, { type: 'sawtooth', f: 1300 * p, f1: 900 * p, dur: 0.25, a: 0.02, gain: g * 0.035, filter: { type: 'bandpass', f: 1800, q: 3 } });
      return tone(o, t, { type: 'sawtooth', f: 1250 * p, f1: 850 * p, dur: 0.3, a: 0.02, gain: g * 0.03, delay: 0.3, filter: { type: 'bandpass', f: 1800, q: 3 } });
    }
    case 'twinkle':
    case 'shimmer':
      return chime(o, t, r.range(2400, 4200) * p, 1.2, g * 0.04);
    case 'dragon_far':
      return tone(o, t, { type: 'sawtooth', f: 110 * p, f1: 70 * p, dur: 2.2, a: 0.4, gain: g * 0.05, filter: { type: 'lowpass', f: 500 } });
    case 'wing_flap': {
      let e = t;
      for (let i = 0; i < 3; i++) e = whoosh(o, t, 200, 600, 0.25, g * 0.2, 0.8, 'pink', i * 0.3);
      return e;
    }
    case 'tick':
      return click(o, t, 3500 * p, g * 0.06, 0.01, 6);
    case 'glass_ring':
      return tone(o, t, { f: r.range(1700, 2600) * p, dur: 2.5, a: 0.3, gain: g * 0.03 });
    case 'moan':
      return tone(o, t, { type: 'triangle', f: r.range(150, 220) * p, f1: r.range(110, 160) * p, dur: 2.2, a: 0.6, gain: g * 0.05, vib: [3, 30], filter: { type: 'lowpass', f: 700 } });
    case 'flame_roar':
      return noise(o, t, { color: 'brown', dur: r.range(1.5, 2.5), a: 0.5, gain: g * 0.3, filter: { type: 'lowpass', f: 600 * p } });
    case 'sail_flap':
      return crunch(o, t, 700 * p, g * 0.2, 4, 0.2);
    case 'pollen':
      return chime(o, t, r.range(3000, 5000) * p, 0.8, g * 0.025);
    case 'stone_fall':
      return crunch(o, t, 1200 * p, g * 0.25, 8, 0.6);
    case 'reverse':
      return noise(o, t, { color: 'pink', dur: 1.2, gain: g * 0.12, rev: true, filter: { type: 'bandpass', f: 900 * p, q: 2 } });
    case 'heartbeat':
      tone(o, t, { f: 60, f1: 45, dur: 0.2, a: 0.006, gain: g * 0.2 });
      return tone(o, t, { f: 58, f1: 42, dur: 0.25, a: 0.006, gain: g * 0.25, delay: 0.28 });
    case 'lava_burst':
      noise(o, t, { color: 'brown', dur: 0.7, a: 0.02, gain: g * 0.35, filter: { type: 'lowpass', f: 400 } });
      return crunch(o, t + 0.05, 2500 * p, g * 0.2, 5, 0.4);
    case 'raven':
      return fm(o, t, { f: 700 * p, f1: 520 * p, ratio: 1.02, index: 3.5, dur: 0.28, a: 0.01, gain: g * 0.05, filter: { type: 'bandpass', f: 1300, q: 1.2 } });
    default:
      return t;
  }
}

export class AmbiencePlayer {
  readonly ctx: BaseAudioContext;
  readonly output: GainNode;
  private noiseBank: NoiseBank;
  private layers: Layer[] = [];
  private cur: Layer | null = null;
  private rng = new AudioRng(0xa3b1);
  private o: Out;
  private panners: StereoPannerNode[] = [];
  private panIdx = 0;
  tod: Tod = 'giorno';
  /** Event density multiplier (quality). */
  density = 1;

  constructor(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank) {
    this.ctx = ctx;
    this.noiseBank = noise;
    this.output = ctx.createGain();
    this.output.connect(dest);
    this.o = { ctx, dest: this.output, srcs: null, noise, rng: this.rng };
    // a small ring of persistent panners for event placement (no per-event panner allocation)
    if (typeof (ctx as AudioContext).createStereoPanner === 'function')
      for (const p of [-0.7, 0.4, -0.25, 0.75, 0.1, -0.55]) {
        const n = ctx.createStereoPanner();
        n.pan.value = p;
        n.connect(this.output);
        this.panners.push(n);
      }
  }

  get currentId(): string | null {
    return this.cur?.id ?? null;
  }

  /** Crossfade to an ambience (null = silence). */
  set(id: string | null, spec: AmbienceSpec | null, fade = 3): void {
    if (this.cur && this.cur.id === id) return;
    const now = this.ctx.currentTime;
    if (this.cur) this.fadeOut(this.cur, now, fade);
    this.cur = null;
    if (!id || !spec) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(TOD_TINT[this.tod].gain * (this.tod === 'notte' ? spec.night : 1), now + fade);
    const tint = ctx.createBiquadFilter();
    tint.type = 'lowpass';
    tint.frequency.value = TOD_TINT[this.tod].lp;
    tint.Q.value = 0.5;
    out.connect(tint);
    tint.connect(this.output);
    const layer: Layer = { id, spec, out, tint, sources: [], next: [], stopAt: Infinity };
    const rng = new AudioRng(hashString(id));
    for (const b of spec.beds) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBank.get(b.noise);
      src.loop = true;
      src.playbackRate.value = 0.97 + rng.next() * 0.06;
      const f = ctx.createBiquadFilter();
      f.type = b.filter;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      const g = ctx.createGain();
      g.gain.value = b.gain * (b.lfo ? 1 - b.lfo.depth * 0.5 : 1);
      src.connect(f);
      f.connect(g);
      let tail: AudioNode = g;
      if (b.lfo) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = b.lfo.rate;
        const lg = ctx.createGain();
        lg.gain.value = b.gain * b.lfo.depth * 0.5;
        lfo.connect(lg);
        lg.connect(g.gain);
        const fg = ctx.createGain();
        fg.gain.value = b.freq * 0.35 * b.lfo.depth;
        lfo.connect(fg);
        fg.connect(f.frequency);
        lfo.start(now + rng.next() * 0.5);
        layer.sources.push(lfo);
      }
      if (b.drift && typeof (ctx as AudioContext).createStereoPanner === 'function') {
        const pan = ctx.createStereoPanner();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = b.drift;
        const lg = ctx.createGain();
        lg.gain.value = 0.6;
        lfo.connect(lg);
        lg.connect(pan.pan);
        lfo.start(now);
        layer.sources.push(lfo);
        tail.connect(pan);
        tail = pan;
      }
      tail.connect(out);
      src.start(now, rng.next() * 2);
      layer.sources.push(src);
    }
    for (const tn of spec.tones) {
      const osc = ctx.createOscillator();
      osc.type = tn.wave;
      osc.frequency.value = 440 * Math.pow(2, (tn.midi - 69) / 12);
      if (tn.detune) osc.detune.value = tn.detune;
      const g = ctx.createGain();
      g.gain.value = tn.gain * (tn.lfo ? 1 - tn.lfo.depth * 0.5 : 1);
      osc.connect(g);
      g.connect(out);
      if (tn.lfo) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = tn.lfo.rate;
        const lg = ctx.createGain();
        lg.gain.value = tn.gain * tn.lfo.depth * 0.5;
        lfo.connect(lg);
        lg.connect(g.gain);
        lfo.start(now);
        layer.sources.push(lfo);
      }
      osc.start(now);
      layer.sources.push(osc);
    }
    for (const e of spec.events) layer.next.push(now + 1 + this.interval(e) * rng.next());
    this.layers.push(layer);
    this.cur = layer;
  }

  setTod(tod: Tod, fade = 4): void {
    if (tod === this.tod) return;
    this.tod = tod;
    const c = this.cur;
    if (!c) return;
    const now = this.ctx.currentTime;
    c.tint.frequency.setTargetAtTime(TOD_TINT[tod].lp, now, fade / 3);
    c.out.gain.setTargetAtTime(TOD_TINT[tod].gain * (tod === 'notte' ? c.spec.night : 1), now, fade / 3);
  }

  stop(fade = 2): void {
    if (this.cur) this.fadeOut(this.cur, this.ctx.currentTime, fade);
    this.cur = null;
  }

  private fadeOut(l: Layer, now: number, fade: number): void {
    const g = l.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    l.stopAt = now + fade;
    for (const s of l.sources) {
      try {
        s.stop(now + fade + 0.05);
      } catch {
        /* already stopped */
      }
    }
  }

  private interval(e: AmbienceEvent): number {
    return 60 / Math.max(0.05, e.rate * this.density);
  }

  /** Per-frame: fire due events, release faded layers. Allocation-free besides the nodes of fired events. */
  update(): void {
    const now = this.ctx.currentTime;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      if (now > l.stopAt + 0.2) {
        try {
          l.tint.disconnect();
        } catch {
          /* gone */
        }
        this.layers.splice(i, 1);
      }
    }
    const c = this.cur;
    if (!c) return;
    const night = this.tod === 'notte' || this.tod === 'tramonto';
    const evs = c.spec.events;
    for (let i = 0; i < evs.length; i++) {
      if (c.next[i] > now + 0.1) continue;
      const e = evs[i];
      // exponential inter-arrival (Poisson process)
      c.next[i] = now + Math.max(0.15, -Math.log(1 - this.rng.next() * 0.999) * this.interval(e));
      if ((e.night && !night) || (e.day && night)) continue;
      const pan = this.panners.length ? this.panners[this.panIdx++ % this.panners.length] : null;
      // route through the tinted layer when no panner exists
      this.o.dest = pan ?? c.out;
      const dist = 0.45 + this.rng.next() * 0.55;
      ambEvent(this.o, now + 0.05, e.kind, e.gain * dist, (e.pitch ?? 1) * this.rng.range(0.94, 1.06));
    }
  }
}
