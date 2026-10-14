/**
 * Voice pool: a fixed set of persistent channels (input gain -> stereo panner -> bus) reused for every one-shot sound.
 * The pool size is the per-quality voice limit; when full, the lowest-priority / oldest voice is stolen with a short fade.
 */

export class VoiceChannel {
  readonly input: GainNode;
  readonly panner: StereoPannerNode | null;
  busyUntil = 0;
  prio = 0;
  started = 0;
  id = '';
  /** Scheduled sources of the current sound (stopped when stolen). Reused array. */
  readonly sources: AudioScheduledSourceNode[] = [];

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.input = ctx.createGain();
    if (typeof (ctx as AudioContext).createStereoPanner === 'function') {
      this.panner = ctx.createStereoPanner();
      this.input.connect(this.panner);
      this.panner.connect(dest);
    } else {
      this.panner = null;
      this.input.connect(dest);
    }
  }
}

export class VoicePool {
  readonly channels: VoiceChannel[] = [];
  private ctx: BaseAudioContext;
  private dest: AudioNode;
  stolen = 0;

  constructor(ctx: BaseAudioContext, dest: AudioNode, size: number) {
    this.ctx = ctx;
    this.dest = dest;
    this.resize(size);
  }

  resize(size: number): void {
    while (this.channels.length < size) this.channels.push(new VoiceChannel(this.ctx, this.dest));
    // shrinking keeps the channels alive but limits use
    this.limit = Math.max(1, size);
  }
  limit = 1;

  active(now: number): number {
    let n = 0;
    for (let i = 0; i < this.limit; i++) if (this.channels[i].busyUntil > now) n++;
    return n;
  }

  /**
   * Get a channel for a sound starting now with priority `prio` (higher wins). Returns the channel and the earliest start
   * time (later by ~20 ms if a voice was stolen), or null if every voice is busy with higher-priority sounds.
   */
  acquire(now: number, prio: number): { ch: VoiceChannel; start: number } | null {
    let best: VoiceChannel | null = null;
    for (let i = 0; i < this.limit; i++) {
      const c = this.channels[i];
      if (c.busyUntil <= now) {
        best = c;
        break;
      }
    }
    if (best) {
      best.sources.length = 0;
      best.input.gain.cancelScheduledValues(now);
      best.input.gain.setValueAtTime(1, now);
      return { ch: best, start: now };
    }
    // steal: lowest priority, then oldest
    let victim: VoiceChannel | null = null;
    for (let i = 0; i < this.limit; i++) {
      const c = this.channels[i];
      if (c.prio > prio) continue;
      if (!victim || c.prio < victim.prio || (c.prio === victim.prio && c.started < victim.started)) victim = c;
    }
    if (!victim) return null;
    this.stolen++;
    const g = victim.input.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.018);
    for (const s of victim.sources) {
      try {
        s.stop(now + 0.02);
      } catch {
        /* already stopped */
      }
    }
    victim.sources.length = 0;
    g.setValueAtTime(1, now + 0.022);
    return { ch: victim, start: now + 0.024 };
  }
}
