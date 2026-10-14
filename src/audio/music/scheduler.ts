/**
 * Musical time math (pure): a TimeGrid maps bars/steps to audio-context seconds for a tempo, a cycling list of meters
 * (shifting meters for Loki) and a step subdivision; a StepCursor walks the grid for a lookahead scheduler.
 */

export interface GridSpec {
  /** Beats per minute. */
  tempo: number;
  /** Beats per bar; cycles (e.g. [7, 5, 6] for a shifting meter). */
  meters: readonly number[];
  /** Grid steps per beat (2 = eighths, 3 = triplets / compound meter). */
  subdiv: number;
}

export class TimeGrid {
  readonly start: number;
  readonly tempo: number;
  readonly meters: number[];
  readonly subdiv: number;
  readonly beatDur: number;
  readonly stepDur: number;
  readonly cycleBeats: number;
  private prefix: number[];

  constructor(start: number, spec: GridSpec) {
    this.start = start;
    this.tempo = Math.max(10, Math.min(400, spec.tempo));
    this.meters = spec.meters.length ? spec.meters.map((m) => Math.max(1, Math.round(m))) : [4];
    this.subdiv = Math.max(1, Math.round(spec.subdiv));
    this.beatDur = 60 / this.tempo;
    this.stepDur = this.beatDur / this.subdiv;
    this.prefix = [];
    let acc = 0;
    for (const m of this.meters) {
      this.prefix.push(acc);
      acc += m;
    }
    this.cycleBeats = acc;
  }

  barBeats(bar: number): number {
    const n = this.meters.length;
    return this.meters[((bar % n) + n) % n];
  }
  barSteps(bar: number): number {
    return this.barBeats(bar) * this.subdiv;
  }
  barDur(bar: number): number {
    return this.barBeats(bar) * this.beatDur;
  }
  /** Beat offset of a bar from the grid start. */
  barBeatOffset(bar: number): number {
    const n = this.meters.length;
    const cyc = Math.floor(bar / n);
    const i = bar - cyc * n;
    return cyc * this.cycleBeats + this.prefix[i];
  }
  barStart(bar: number): number {
    return this.start + this.barBeatOffset(bar) * this.beatDur;
  }
  stepTime(bar: number, step: number): number {
    return this.barStart(bar) + step * this.stepDur;
  }
  /** Bar index containing time t (bars before the start are negative). */
  barAt(t: number): number {
    const beats = (t - this.start) / this.beatDur;
    const cyc = Math.floor(beats / this.cycleBeats);
    let rem = beats - cyc * this.cycleBeats;
    let i = 0;
    while (i < this.meters.length - 1 && rem >= this.meters[i] - 1e-9) {
      rem -= this.meters[i];
      i++;
    }
    return cyc * this.meters.length + i;
  }
  /** Earliest bar boundary at or after t (with a small tolerance). */
  nextBarTime(t: number, eps = 1e-4): number {
    const b = this.barAt(t);
    const s = this.barStart(b);
    if (Math.abs(s - t) <= eps) return s;
    return this.barStart(b + 1);
  }
  nextBeatTime(t: number, eps = 1e-4): number {
    const beats = (t - this.start) / this.beatDur;
    const k = Math.ceil(beats - eps / this.beatDur);
    return this.start + k * this.beatDur;
  }
}

/**
 * Musical switch point: the next bar boundary when it is no further than maxWait seconds away, otherwise the next beat,
 * otherwise `now` (never earlier than now + minLead so nodes can be scheduled).
 */
export function quantizedSwitchTime(grid: TimeGrid | null, now: number, maxWait: number, minLead = 0.05): number {
  const t0 = now + minLead;
  if (!grid || t0 < grid.start) return t0;
  const bar = grid.nextBarTime(t0);
  if (bar - t0 <= maxWait) return bar;
  const beat = grid.nextBeatTime(t0);
  if (beat - t0 <= maxWait) return beat;
  return t0;
}

/** Walks a grid step by step; `advance` emits every step whose time is before `until`. Allocation-free. */
export class StepCursor {
  bar = 0;
  step = 0;
  constructor(public grid: TimeGrid) {}

  reset(grid: TimeGrid, bar = 0, step = 0): void {
    this.grid = grid;
    this.bar = bar;
    this.step = step;
  }

  /** Move the cursor to the first step at or after time t. */
  seek(t: number): void {
    const g = this.grid;
    if (t <= g.start) {
      this.bar = 0;
      this.step = 0;
      return;
    }
    this.bar = g.barAt(t);
    const s = (t - g.barStart(this.bar)) / g.stepDur;
    this.step = Math.ceil(s - 1e-6);
    if (this.step >= g.barSteps(this.bar)) {
      this.bar++;
      this.step = 0;
    }
  }

  get time(): number {
    return this.grid.stepTime(this.bar, this.step);
  }

  advance(until: number, cb: (bar: number, step: number, time: number) => void, maxSteps = 512): number {
    let n = 0;
    while (n < maxSteps) {
      const t = this.grid.stepTime(this.bar, this.step);
      if (t >= until) break;
      cb(this.bar, this.step, t);
      n++;
      this.step++;
      if (this.step >= this.grid.barSteps(this.bar)) {
        this.step = 0;
        this.bar++;
      }
    }
    return n;
  }
}
