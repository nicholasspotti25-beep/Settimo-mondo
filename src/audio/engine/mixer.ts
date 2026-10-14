/**
 * Mixer: buses (music, sfx, voice, ambience, ui) with user volumes and ducking, per-bus reverb sends into the environment
 * reverb, the 'madness' wobble/distortion insert, the 'mute' gate (Regina Drago's Silenzio: everything muted except a soft
 * tinnitus tone), master compressor + limiter + soft clipper.
 */
import { NoiseBank } from './noise';
import { ReverbUnit } from './reverb';
import type { ReverbEnv } from '../music/data';

export type BusId = 'music' | 'sfx' | 'voice' | 'ambience' | 'ui';
export const BUS_IDS: readonly BusId[] = ['music', 'sfx', 'voice', 'ambience', 'ui'];

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  voice: number;
  ambience: number;
}

interface Bus {
  input: GainNode;
  duck: GainNode;
  send: GainNode;
  duckTarget: number;
  duckApplied: number;
  sendBase: number;
}

const SEND: Record<BusId, number> = { music: 0.5, sfx: 0.42, voice: 0.55, ambience: 0.22, ui: 0.08 };

/** Perceptual slider curve. */
export function volumeCurve(v: number): number {
  const x = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  return x * x;
}

export class Mixer {
  readonly ctx: BaseAudioContext;
  readonly noise: NoiseBank;
  readonly reverb: ReverbUnit;
  readonly buses: Record<BusId, Bus>;
  private preFx: GainNode;
  private dry: GainNode;
  private gate: GainNode;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private clip: WaveShaperNode;
  private madDelay: DelayNode;
  private madShaper: WaveShaperNode;
  private madWet: GainNode;
  private madLfo: OscillatorNode | null = null;
  private madLfoGain: GainNode;
  private madConnected = false;
  private madness = 0;
  private tinnitus: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  muted = false;
  private volumes: Volumes = { master: 0.9, music: 0.75, sfx: 0.9, voice: 0.85, ambience: 0.7 };
  /** Dialogue duck (0..1 amount) and impact duck (decays). */
  private dialogueDuck = 0;
  private impactDuck = 0;
  private impactHold = 0;
  /** Extra music duck requested by the director (death, menus). */
  musicDuckExtra = 0;

  constructor(ctx: BaseAudioContext, opts: { reverbMax: number }) {
    this.ctx = ctx;
    this.noise = new NoiseBank(ctx);
    this.reverb = new ReverbUnit(ctx, opts.reverbMax);
    this.preFx = ctx.createGain();
    this.dry = ctx.createGain();
    this.gate = ctx.createGain();
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 16;
    this.comp.ratio.value = 3.2;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.25;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.0015;
    this.limiter.release.value = 0.09;
    this.clip = ctx.createWaveShaper();
    this.clip.curve = this.noise.curve('clip');
    this.preFx.connect(this.dry);
    this.dry.connect(this.gate);
    this.gate.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(this.clip);
    this.clip.connect(ctx.destination);
    this.reverb.output.connect(this.preFx);
    // madness insert (connected on demand)
    this.madDelay = ctx.createDelay(0.1);
    this.madDelay.delayTime.value = 0.014;
    this.madShaper = ctx.createWaveShaper();
    this.madShaper.curve = this.noise.curve('fold');
    this.madWet = ctx.createGain();
    this.madWet.gain.value = 0;
    this.madLfoGain = ctx.createGain();
    this.madLfoGain.gain.value = 0.009;
    this.madDelay.connect(this.madShaper);
    this.madShaper.connect(this.madWet);
    this.madWet.connect(this.gate);
    this.madLfoGain.connect(this.madDelay.delayTime);

    const mk = (id: BusId): Bus => {
      const input = ctx.createGain();
      const duck = ctx.createGain();
      const send = ctx.createGain();
      send.gain.value = SEND[id];
      input.connect(duck);
      duck.connect(this.preFx);
      duck.connect(send);
      send.connect(this.reverb.input);
      return { input, duck, send, duckTarget: 1, duckApplied: 1, sendBase: SEND[id] };
    };
    this.buses = { music: mk('music'), sfx: mk('sfx'), voice: mk('voice'), ambience: mk('ambience'), ui: mk('ui') };
    this.applyVolumes();
  }

  input(bus: BusId): GainNode {
    return this.buses[bus].input;
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const v = this.volumes;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(volumeCurve(v.master) * 0.9, now, 0.05);
    this.buses.music.input.gain.setTargetAtTime(volumeCurve(v.music) * 0.8, now, 0.05);
    this.buses.sfx.input.gain.setTargetAtTime(volumeCurve(v.sfx), now, 0.05);
    this.buses.voice.input.gain.setTargetAtTime(volumeCurve(v.voice), now, 0.05);
    this.buses.ambience.input.gain.setTargetAtTime(volumeCurve(v.ambience) * 0.9, now, 0.05);
    this.buses.ui.input.gain.setTargetAtTime(volumeCurve(v.sfx) * 0.8, now, 0.05);
  }

  setEnv(env: ReverbEnv, fade = 1.2): void {
    this.reverb.setEnv(env, fade);
  }

  /** Per-theme music reverb amount. */
  setMusicSpace(mult: number): void {
    const b = this.buses.music;
    b.send.gain.setTargetAtTime(b.sendBase * Math.max(0, Math.min(2, mult)), this.ctx.currentTime, 0.5);
  }

  setDialogue(active: boolean): void {
    this.dialogueDuck = active ? 1 : 0;
  }

  /** Brief duck of music/ambience under a big impact (0..1 strength). */
  impact(strength: number, hold = 0.25): void {
    this.impactDuck = Math.max(this.impactDuck, Math.min(1, strength));
    this.impactHold = Math.max(this.impactHold, hold);
  }

  /** Called every frame (allocation-free). */
  update(dt: number): void {
    if (this.impactHold > 0) this.impactHold -= dt;
    else this.impactDuck = Math.max(0, this.impactDuck - dt * 1.6);
    const musicT = Math.min(1 - this.dialogueDuck * 0.5, 1 - this.impactDuck * 0.45) * (1 - this.musicDuckExtra);
    const ambT = Math.min(1 - this.dialogueDuck * 0.3, 1 - this.impactDuck * 0.35);
    const sfxT = 1 - this.dialogueDuck * 0.15;
    this.setDuck('music', musicT, this.dialogueDuck > 0 ? 0.12 : 0.25);
    this.setDuck('ambience', ambT, 0.2);
    this.setDuck('sfx', sfxT, 0.2);
  }

  private setDuck(id: BusId, target: number, tc: number): void {
    const b = this.buses[id];
    if (Math.abs(target - b.duckApplied) < 0.01) return;
    b.duckApplied = target;
    b.duck.gain.setTargetAtTime(Math.max(0, target), this.ctx.currentTime, tc);
  }

  /** Mute status: silence everything except a soft tinnitus tone. */
  setMute(on: boolean): void {
    if (on === this.muted) return;
    this.muted = on;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.gate.gain.cancelScheduledValues(now);
    this.gate.gain.setValueAtTime(this.gate.gain.value, now);
    if (on) {
      this.gate.gain.linearRampToValueAtTime(0.0, now + 0.12);
      if (!this.tinnitus) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.022, now + 0.6);
        const oscs: OscillatorNode[] = [];
        for (const f of [6150, 6187, 3075]) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = f;
          const g = ctx.createGain();
          g.gain.value = f < 4000 ? 0.25 : 0.6;
          o.connect(g);
          g.connect(gain);
          o.start(now);
          oscs.push(o);
        }
        gain.connect(this.master);
        this.tinnitus = { oscs, gain };
      }
    } else {
      this.gate.gain.linearRampToValueAtTime(1, now + 0.9);
      const t = this.tinnitus;
      if (t) {
        t.gain.gain.cancelScheduledValues(now);
        t.gain.gain.setValueAtTime(t.gain.gain.value, now);
        t.gain.gain.linearRampToValueAtTime(0, now + 0.8);
        for (const o of t.oscs) o.stop(now + 0.85);
        this.tinnitus = null;
      }
    }
  }

  /** Madness amount 0..1: modulated delay wobble + folding distortion blended in. */
  setMadness(amount: number): void {
    const a = Math.max(0, Math.min(1, amount));
    if (Math.abs(a - this.madness) < 0.02) return;
    this.madness = a;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (a > 0 && !this.madConnected) {
      this.preFx.connect(this.madDelay);
      this.madConnected = true;
    }
    if (a > 0 && !this.madLfo) {
      this.madLfo = ctx.createOscillator();
      this.madLfo.type = 'sine';
      this.madLfo.frequency.value = 0.9;
      this.madLfo.connect(this.madLfoGain);
      this.madLfo.start(now);
    }
    this.madWet.gain.setTargetAtTime(a * 0.55, now, 0.2);
    this.dry.gain.setTargetAtTime(1 - a * 0.35, now, 0.2);
    this.madLfoGain.gain.setTargetAtTime(0.004 + a * 0.01, now, 0.2);
    if (a === 0 && this.madConnected) {
      // let the wet path fade, then disconnect to save CPU
      const lfo = this.madLfo;
      this.madLfo = null;
      lfo?.stop(now + 0.8);
      if (typeof setTimeout === 'function')
        setTimeout(() => {
          if (this.madness === 0 && this.madConnected) {
            try {
              this.preFx.disconnect(this.madDelay);
            } catch {
              /* ignore */
            }
            this.madConnected = false;
          }
        }, 900);
    }
  }
}
