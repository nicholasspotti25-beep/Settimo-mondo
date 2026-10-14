/**
 * Story sequence runner: dialogue, Voce dell'Alba, captions, camera shots, fades, choices (including the 5-second Implora
 * hold), ritual gestures, flags and story events. Deterministic; the UI only renders `view`.
 */
import type { SequenceDef, SequenceStep } from '../core/types';
import { Btn, type PlayerInput } from './types';
import type { Sim } from './sim';

export interface SequenceView {
  id: string;
  line: { kind: 'say' | 'voce' | 'caption' | 'title'; key: string; speaker: string; t: number; dur: number } | null;
  choice: { options: { key: string; hold: number }[]; selected: number; holdProgress: number } | null;
  gesture: { id: string; prompt: string; index: number } | null;
  camera: string | null;
  fade: { kind: 'in' | 'out' | 'white_in' | 'white_out'; t: number; dur: number } | null;
}

export class SequenceRunner {
  seq: SequenceDef | null = null;
  pc = 0;
  t = 0;
  stepDur = 0;
  view: SequenceView = { id: '', line: null, choice: null, gesture: null, camera: null, fade: null };
  private labels = new Map<string, number>();
  private onEnd: (() => void) | null = null;
  private holdIndex = -1;
  private gestureCount = 0;
  /** Seconds per character used to time lines (UI may refine). */
  lineTime: (key: string) => number = () => 3.4;

  get running(): boolean {
    return this.seq !== null;
  }

  start(sim: Sim, def: SequenceDef, onEnd?: () => void): void {
    this.seq = def;
    this.pc = 0;
    this.t = 0;
    this.labels.clear();
    this.gestureCount = 0;
    def.steps.forEach((s, i) => {
      if ('label' in s) this.labels.set(s.label, i);
    });
    this.onEnd = onEnd ?? null;
    this.view = { id: def.id, line: null, choice: null, gesture: null, camera: null, fade: null };
    sim.emit({ type: 'sequenceStart', id: def.id });
    this.enter(sim);
  }

  stop(sim: Sim): void {
    if (!this.seq) return;
    const id = this.seq.id;
    this.seq = null;
    this.view = { id: '', line: null, choice: null, gesture: null, camera: null, fade: null };
    sim.emit({ type: 'sequenceEnd', id });
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }

  /** Skip the remainder of a skippable sequence, applying all state-changing steps. */
  skip(sim: Sim): void {
    if (!this.seq || !this.seq.skippable) return;
    let guard = 0;
    while (this.seq && guard++ < 500) {
      const st = this.seq.steps[this.pc];
      if (!st || 'choice' in st || 'gesture' in st) break;
      this.applyInstant(sim, st);
      if (!this.seq) return;
      if ('goto' in st && !('if' in st)) this.pc = this.labels.get(st.goto) ?? this.pc + 1;
      else if ('if' in st) this.pc = sim.evalCondition(st.if) ? this.labels.get(st.goto) ?? this.pc + 1 : this.pc + 1;
      else if ('end' in st) {
        this.stop(sim);
        return;
      } else this.pc++;
      if (this.pc >= this.seq.steps.length) {
        this.stop(sim);
        return;
      }
    }
    this.t = 0;
    this.enter(sim);
  }

  private applyInstant(sim: Sim, st: SequenceStep): void {
    if ('set' in st) sim.setFlags(st.set);
    else if ('give_weapon' in st) sim.giveWeapon(st.give_weapon);
    else if ('give_item' in st) sim.giveItem(st.give_item);
    else if ('unlock_form' in st) sim.unlockForm(st.unlock_form);
    else if ('event' in st) sim.storyEvent(st.event, st.params ?? {});
    else if ('music' in st) sim.emit({ type: 'music', cue: st.music });
  }

  private enter(sim: Sim): void {
    if (!this.seq) return;
    // run instant steps until a timed one
    let guard = 0;
    while (this.seq && guard++ < 500) {
      if (this.pc >= this.seq.steps.length) {
        this.stop(sim);
        return;
      }
      const st = this.seq.steps[this.pc];
      this.t = 0;
      this.view.line = null;
      this.view.choice = null;
      this.view.gesture = null;
      if ('label' in st) {
        this.pc++;
        continue;
      }
      if ('goto' in st && !('if' in st)) {
        this.pc = this.labels.get(st.goto) ?? this.pc + 1;
        continue;
      }
      if ('if' in st) {
        this.pc = sim.evalCondition(st.if) ? this.labels.get(st.goto) ?? this.pc + 1 : this.pc + 1;
        continue;
      }
      if ('end' in st) {
        this.stop(sim);
        return;
      }
      if ('set' in st || 'give_weapon' in st || 'give_item' in st || 'unlock_form' in st || 'event' in st || 'music' in st) {
        this.applyInstant(sim, st);
        if (!this.seq) return;
        this.pc++;
        continue;
      }
      if ('camera' in st) {
        this.view.camera = st.camera;
        if (!st.dur) {
          this.pc++;
          continue;
        }
        this.stepDur = st.dur;
        return;
      }
      if ('say' in st) {
        this.stepDur = st.dur ?? this.lineTime(st.say);
        this.view.line = { kind: 'say', key: st.say, speaker: st.speaker, t: 0, dur: this.stepDur };
        sim.emit({ type: 'dialogue', key: st.say, speaker: st.speaker });
        return;
      }
      if ('voce' in st) {
        this.stepDur = st.dur ?? this.lineTime(st.voce);
        this.view.line = { kind: 'voce', key: st.voce, speaker: 'voce', t: 0, dur: this.stepDur };
        sim.emit({ type: 'voce', key: st.voce });
        return;
      }
      if ('caption' in st) {
        this.stepDur = st.dur ?? this.lineTime(st.caption);
        this.view.line = { kind: 'caption', key: st.caption, speaker: '', t: 0, dur: this.stepDur };
        sim.emit({ type: 'caption', key: st.caption });
        return;
      }
      if ('title' in st) {
        this.stepDur = st.dur ?? 5;
        this.view.line = { kind: 'title', key: st.title, speaker: '', t: 0, dur: this.stepDur };
        return;
      }
      if ('wait' in st) {
        this.stepDur = st.wait;
        return;
      }
      if ('fade' in st) {
        this.stepDur = st.dur ?? 1;
        this.view.fade = { kind: st.fade, t: 0, dur: this.stepDur };
        return;
      }
      if ('choice' in st) {
        this.view.choice = { options: st.choice.map((c) => ({ key: c.key, hold: c.hold ?? 0 })), selected: -1, holdProgress: 0 };
        this.holdIndex = -1;
        this.stepDur = Infinity;
        return;
      }
      if ('gesture' in st) {
        this.view.gesture = { id: st.gesture, prompt: st.prompt_key, index: this.gestureCount++ };
        this.stepDur = Infinity;
        return;
      }
      this.pc++;
    }
  }

  update(sim: Sim, input: PlayerInput, dt: number): void {
    if (!this.seq) return;
    const st = this.seq.steps[this.pc];
    this.t += dt;
    if (this.view.line) this.view.line.t = this.t;
    if (this.view.fade) this.view.fade.t = Math.min(this.view.fade.dur, this.view.fade.t + dt);
    if (!st) {
      this.stop(sim);
      return;
    }
    if ('choice' in st) {
      const ch = this.view.choice!;
      if (input.choice >= 0 && input.choice < st.choice.length && this.holdIndex < 0) {
        const opt = st.choice[input.choice];
        ch.selected = input.choice;
        if (opt.hold && opt.hold > 0) {
          this.holdIndex = input.choice;
          sim.player.setState('kneel');
          sim.player.kneel = 0;
        } else {
          this.choose(sim, opt);
          return;
        }
      }
      if (this.holdIndex >= 0) {
        const opt = st.choice[this.holdIndex];
        if (input.holdHeld) ch.holdProgress = Math.min(1, ch.holdProgress + dt / (opt.hold ?? 1));
        else {
          ch.holdProgress = Math.max(0, ch.holdProgress - dt / 1.5);
          if (ch.holdProgress <= 0 && input.choice !== this.holdIndex) {
            this.holdIndex = -1;
            ch.selected = -1;
            sim.player.setState('locked');
          }
        }
        if (ch.holdProgress >= 1) this.choose(sim, opt);
      }
      return;
    }
    if ('gesture' in st) {
      if (input.presses & (Btn.Advance | Btn.Interact | Btn.Light)) {
        sim.emit({ type: 'cue', id: `gesture_${st.gesture}` });
        sim.storyEvent('ritual_gesture', { id: st.gesture, index: this.view.gesture?.index ?? 0 });
        this.pc++;
        this.enter(sim);
      }
      return;
    }
    const advance = (input.presses & Btn.Advance) !== 0 && ('say' in st || 'voce' in st || 'caption' in st) && this.t > 0.45;
    if (this.t >= this.stepDur || advance) {
      this.pc++;
      this.enter(sim);
    }
  }

  private choose(sim: Sim, opt: { key: string; goto: string; set?: Record<string, string | number | boolean> }): void {
    if (opt.set) sim.setFlags(opt.set);
    this.pc = this.labels.get(opt.goto) ?? this.pc + 1;
    this.holdIndex = -1;
    this.enter(sim);
  }
}
