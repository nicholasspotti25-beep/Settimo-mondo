/**
 * Story presentation: subtitles for the running sequence (`sim.seq.view.line`) and for standalone 'dialogue' / 'caption' /
 * 'voce' events (speaker colors from data/speakers, size + background from settings), centered captions and title cards,
 * sequence fades, choices (Implora = HOLD: router.choose(i) then the interact hold until holdProgress reaches 1, with the
 * kneel ring), ritual gestures (tap or trace -> router.press('advance')), tap-to-advance and the hold-to-skip button for
 * skippable sequences.
 */
import type { SimEvent } from '../sim/types';
import type { SequenceView } from '../sim/sequence';
import { h, s, setText, toggle, StyleCache, clear } from './dom';
import { speakerColor, speakerName, type UiCtx } from './ctx';

const KNEEL_C = 2 * Math.PI * 21;
const SKIP_C = 2 * Math.PI * 9;
const SKIP_HOLD = 0.9;

/** Guide paths for traced ritual gestures (viewBox 0..100). Unknown ids are tap gestures. */
const GESTURE_PATHS: Record<string, string> = {
  circle: 'M50 14a36 36 0 1 1-0.01 0',
  sun: 'M50 22a28 28 0 1 1-0.01 0',
  line_up: 'M50 86V14',
  line_down: 'M50 14V86',
  line: 'M14 50H86',
  cross: 'M50 12V88M18 40H82',
  wave: 'M10 50C24 26 36 26 50 50S76 74 90 50',
  spiral: 'M50 50m0-4a4 4 0 1 1-0.01 0M50 50m0-16a16 16 0 1 1-0.01 0M50 50m0-32a32 32 0 1 1-0.01 0',
};

function gesturePath(id: string): string | null {
  for (const k of Object.keys(GESTURE_PATHS)) if (id === k || id.endsWith(`_${k}`) || id.startsWith(`${k}_`)) return GESTURE_PATHS[k];
  return null;
}

interface Transient { key: string; speaker: string; kind: 'say' | 'caption' | 'voce'; left: number }

export class StoryLayer {
  readonly el: HTMLElement;
  private subs: HTMLElement;
  private seqSub: HTMLElement;
  private seqWho: HTMLElement;
  private seqText: HTMLElement;
  private trSub: HTMLElement;
  private trWho: HTMLElement;
  private trText: HTMLElement;
  private capCenter: HTMLElement;
  private titleCard: HTMLElement;
  private titleText: HTMLElement;
  private seqFade: HTMLElement;
  private seqFadeCss: StyleCache;
  private tapCatch: HTMLElement;
  private choices: HTMLElement;
  private choiceEls: { el: HTMLElement; prog: SVGCircleElement; hold: boolean }[] = [];
  private choiceSig = '';
  private holding = -1;
  private gesture: HTMLElement;
  private gestureSvg: SVGSVGElement;
  private gestureGuide: SVGPathElement;
  private gestureTrace: SVGPolylineElement;
  private gestureStart: SVGCircleElement;
  private gestureText: HTMLElement;
  private gestureAlt: HTMLElement;
  private gestureIndex = -1;
  private gestureLen = 0;
  private gesturePts: number[] = [];
  private gestureDone = false;
  private skip: HTMLElement;
  private skipArc: SVGCircleElement;
  private skipHeld = false;
  private skipT = 0;
  private lineSig = '';
  private queue: Transient[] = [];
  private cur: Transient | null = null;

  constructor(private readonly ctx: UiCtx) {
    this.seqWho = h('span', { class: 'who' });
    this.seqText = h('span');
    this.seqSub = h('div', { class: 'sm-sub' }, this.seqWho, this.seqText);
    this.trWho = h('span', { class: 'who' });
    this.trText = h('span');
    this.trSub = h('div', { class: 'sm-sub' }, this.trWho, this.trText);
    this.subs = h('div', { class: 'sm-subs' }, this.trSub, this.seqSub);
    this.capCenter = h('div', { class: 'sm-capcenter' });
    this.titleText = h('div', { class: 't' });
    this.titleCard = h('div', { class: 'sm-card title' }, this.titleText);
    this.seqFade = h('div', { class: 'sm-fade' });
    this.seqFadeCss = new StyleCache(this.seqFade);

    // tap anywhere advances lines while a sequence runs (below choices, gestures and the skip button)
    this.tapCatch = h('div', { class: 'sm-tapcatch sm-hidden' });
    this.tapCatch.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.ctx.game.input.press('advance');
    });

    this.choices = h('div', { class: 'sm-choices sm-hidden' });

    this.gestureGuide = s('path', { class: 'guide', d: '' });
    this.gestureTrace = s('polyline', { class: 'trace', points: '' });
    this.gestureStart = s('circle', { class: 'start', r: 5, cx: 50, cy: 50 });
    this.gestureSvg = s('svg', { viewBox: '0 0 100 100' }, this.gestureGuide, this.gestureTrace, this.gestureStart);
    this.gestureText = h('div', { class: 'ptxt' });
    this.gestureAlt = h('div', { class: 'alt' });
    this.gesture = h('div', { class: 'sm-gesture sm-hidden' }, this.gestureSvg, this.gestureText, this.gestureAlt);
    this.gesture.addEventListener('pointerdown', (e) => this.gestureDown(e));
    this.gesture.addEventListener('pointermove', (e) => this.gestureMove(e));
    this.gesture.addEventListener('pointerup', (e) => this.gestureUp(e));

    this.skipArc = s('circle', { class: 'p', cx: 11, cy: 11, r: 9, 'stroke-dasharray': `${SKIP_C} ${SKIP_C}`, 'stroke-dashoffset': SKIP_C });
    const ring = s('svg', { class: 'ring', viewBox: '0 0 22 22' }, s('circle', { class: 't', cx: 11, cy: 11, r: 9 }), this.skipArc);
    this.skip = h('button', { class: 'sm-skip sm-hidden', type: 'button' }, ring, h('span'));
    const skipOn = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.skipHeld = true;
    };
    const skipOff = () => {
      this.skipHeld = false;
    };
    this.skip.addEventListener('pointerdown', skipOn);
    this.skip.addEventListener('pointerup', skipOff);
    this.skip.addEventListener('pointercancel', skipOff);
    this.skip.addEventListener('pointerleave', skipOff);

    this.el = h('div', { class: 'sm-layer sm-story' },
      this.seqFade, this.titleCard, this.capCenter, this.tapCatch, this.subs, this.choices, this.gesture, this.skip);
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'dialogue':
        this.push({ key: e.key, speaker: e.speaker, kind: e.speaker === 'voce' ? 'voce' : 'say', left: 0 });
        break;
      case 'caption':
        this.push({ key: e.key, speaker: '', kind: 'caption', left: 0 });
        break;
      case 'voce':
        this.push({ key: e.key, speaker: 'voce', kind: 'voce', left: 0 });
        break;
      case 'fightEnd':
      case 'respawn':
        this.queue.length = 0;
        break;
      default:
        break;
    }
  }

  private push(tr: Transient): void {
    const text = this.ctx.t(tr.key);
    tr.left = Math.min(9, 2.4 + text.length * 0.055);
    // the same line twice in a row (re-emitted by a behavior) is not queued again
    if (this.cur?.key === tr.key || this.queue.some((q) => q.key === tr.key)) return;
    if (this.queue.length > 3) this.queue.shift();
    this.queue.push(tr);
  }

  /** Clear everything (title screen, new session). */
  reset(): void {
    this.queue.length = 0;
    this.cur = null;
    this.lineSig = '';
    this.choiceSig = '';
    this.gestureIndex = -1;
    this.releaseHold();
    toggle(this.trSub, 'on', false);
    toggle(this.seqSub, 'on', false);
  }

  /** Language changed. */
  relabel(): void {
    this.lineSig = '';
    this.choiceSig = '';
    this.gestureIndex = -1;
    if (this.cur) this.showTransient(this.cur);
  }

  update(dt: number, active: boolean): void {
    const sim = this.ctx.game.sim;
    const v = sim.seq.view;
    const running = active && sim.seq.running;

    // --- sequence line
    const line = running ? v.line : null;
    const sig = line ? `${line.kind}|${line.key}|${line.speaker}` : '';
    if (sig !== this.lineSig) {
      this.lineSig = sig;
      toggle(this.seqSub, 'on', false);
      toggle(this.capCenter, 'on', false);
      toggle(this.titleCard, 'on', false);
      if (line) {
        if (line.kind === 'title') {
          setText(this.titleText, this.ctx.t(line.key));
          toggle(this.titleCard, 'on', true);
        } else if (line.kind === 'caption') {
          setText(this.capCenter, this.ctx.t(line.key));
          toggle(this.capCenter, 'on', true);
        } else {
          this.fillSub(this.seqSub, this.seqWho, this.seqText, line.kind, line.speaker, line.key);
          toggle(this.seqSub, 'on', true);
        }
      }
    }

    // --- transient lines (one at a time, queued)
    if (this.cur) {
      this.cur.left -= dt;
      if (this.cur.left <= 0 || !active) {
        this.cur = null;
        toggle(this.trSub, 'on', false);
      }
    }
    if (!this.cur && active && this.queue.length) {
      this.cur = this.queue.shift()!;
      this.showTransient(this.cur);
    }
    toggle(this.trSub, 'small', !!this.cur && !!line && line.kind !== 'title' && line.kind !== 'caption');

    // --- sequence fade
    const f = running ? v.fade : null;
    let op = 0;
    if (f) {
      const k = f.dur > 0 ? Math.min(1, f.t / f.dur) : 1;
      op = f.kind === 'out' || f.kind === 'white_out' ? k : 1 - k;
      toggle(this.seqFade, 'white', f.kind.startsWith('white'));
    }
    this.seqFadeCss.set('opacity', op.toFixed(3));

    // --- choices
    this.updateChoices(running ? v.choice : null);

    // --- gestures
    this.updateGesture(running ? v.gesture : null);

    // --- tap to advance + skip
    toggle(this.tapCatch, 'sm-hidden', !running || !!v.choice || !!v.gesture);
    const skippable = running && !!sim.seq.seq?.skippable;
    toggle(this.skip, 'sm-hidden', !skippable);
    if (skippable) {
      setText(this.skip.lastChild as HTMLElement, this.ctx.t('ui.story.skip'));
      this.skipT = this.skipHeld ? this.skipT + dt : Math.max(0, this.skipT - dt * 2);
      this.skipArc.setAttribute('stroke-dashoffset', (SKIP_C * (1 - Math.min(1, this.skipT / SKIP_HOLD))).toFixed(2));
      if (this.skipT >= SKIP_HOLD) {
        this.skipT = 0;
        this.skipHeld = false;
        this.ctx.game.act((sm) => sm.seq.skip(sm));
      }
    } else {
      this.skipT = 0;
      this.skipHeld = false;
    }
  }

  private showTransient(tr: Transient): void {
    this.fillSub(this.trSub, this.trWho, this.trText, tr.kind, tr.speaker, tr.key);
    toggle(this.trSub, 'on', true);
  }

  private fillSub(el: HTMLElement, who: HTMLElement, text: HTMLElement, kind: string, speaker: string, key: string): void {
    toggle(el, 'voce', kind === 'voce');
    toggle(el, 'caption', kind === 'caption');
    const name = kind === 'say' || kind === 'voce' ? speakerName(this.ctx, speaker) : '';
    setText(who, name);
    toggle(who, 'sm-hidden', !name);
    who.style.color = speakerColor(this.ctx.game, speaker);
    setText(text, this.ctx.t(key));
  }

  /* ------------------------------------------------------------------------------------------------ choices */

  private updateChoices(ch: SequenceView['choice']): void {
    const sig = ch ? ch.options.map((o) => `${o.key}:${o.hold}`).join('|') : '';
    if (sig !== this.choiceSig) {
      this.choiceSig = sig;
      this.releaseHold();
      clear(this.choices);
      this.choiceEls = [];
      if (ch) {
        ch.options.forEach((o, i) => {
          const prog = s('circle', { class: 'p', cx: 24, cy: 24, r: 21, 'stroke-dasharray': `${KNEEL_C} ${KNEEL_C}`, 'stroke-dashoffset': KNEEL_C });
          const kneel = s('svg', { class: 'kneel', viewBox: '0 0 48 48' }, s('circle', { class: 't', cx: 24, cy: 24, r: 21 }), prog);
          const hold = o.hold > 0;
          const el = h('button', { class: 'sm-choice', type: 'button' }, kneel, this.ctx.t(o.key), hold ? h('span', { class: 'hold' }, this.ctx.t('ui.story.hold')) : null);
          el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.ctx.game.input.choose(i);
            if (hold) {
              this.holding = i;
              el.classList.add('held');
              this.ctx.game.input.setHeld('interact', true);
              try {
                el.setPointerCapture(e.pointerId);
              } catch {
                /* synthetic pointer */
              }
            }
          });
          const up = () => {
            if (this.holding === i) this.releaseHold();
          };
          el.addEventListener('pointerup', up);
          el.addEventListener('pointercancel', up);
          this.choiceEls.push({ el, prog, hold });
          this.choices.appendChild(el);
        });
      }
    }
    toggle(this.choices, 'sm-hidden', !ch);
    if (!ch) return;
    for (let i = 0; i < this.choiceEls.length; i++) {
      const c = this.choiceEls[i];
      const p = ch.selected === i ? ch.holdProgress : 0;
      toggle(c.el, 'prog', p > 0);
      c.prog.setAttribute('stroke-dashoffset', (KNEEL_C * (1 - p)).toFixed(2));
    }
  }

  private releaseHold(): void {
    if (this.holding >= 0) {
      this.ctx.game.input.setHeld('interact', false);
      this.choiceEls[this.holding]?.el.classList.remove('held');
    }
    this.holding = -1;
  }

  /* ------------------------------------------------------------------------------------------------ gestures */

  private updateGesture(g: SequenceView['gesture']): void {
    toggle(this.gesture, 'sm-hidden', !g);
    if (!g) {
      this.gestureIndex = -1;
      return;
    }
    if (g.index === this.gestureIndex) return;
    this.gestureIndex = g.index;
    this.gestureDone = false;
    this.gesturePts.length = 0;
    this.gestureTrace.setAttribute('points', '');
    const d = gesturePath(g.id);
    this.gestureGuide.setAttribute('d', d ?? '');
    this.gestureLen = d ? this.gestureGuide.getTotalLength?.() ?? 200 : 0;
    if (d && this.gestureLen > 0) {
      const p0 = this.gestureGuide.getPointAtLength(0);
      this.gestureStart.setAttribute('cx', p0.x.toFixed(1));
      this.gestureStart.setAttribute('cy', p0.y.toFixed(1));
      this.gestureStart.setAttribute('r', '5');
    } else {
      this.gestureStart.setAttribute('cx', '50');
      this.gestureStart.setAttribute('cy', '50');
      this.gestureStart.setAttribute('r', '9');
    }
    setText(this.gestureText, this.ctx.t(g.prompt));
    setText(this.gestureAlt, this.ctx.t(d ? 'ui.story.trace_gesture' : 'ui.story.tap_gesture'));
  }

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const r = this.gestureSvg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / Math.max(1, r.width)) * 100, y: ((e.clientY - r.top) / Math.max(1, r.height)) * 100 };
  }

  private gestureDown(e: PointerEvent): void {
    e.preventDefault();
    if (this.gestureDone) return;
    try {
      this.gesture.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    const p = this.toLocal(e);
    this.gesturePts.length = 0;
    this.gesturePts.push(p.x, p.y);
  }

  private gestureMove(e: PointerEvent): void {
    if (this.gestureDone || !this.gesturePts.length || !this.gestureLen) return;
    const p = this.toLocal(e);
    const n = this.gesturePts.length;
    if (Math.hypot(p.x - this.gesturePts[n - 2], p.y - this.gesturePts[n - 1]) < 1.5) return;
    this.gesturePts.push(p.x, p.y);
    let pts = '';
    for (let i = 0; i < this.gesturePts.length; i += 2) pts += `${this.gesturePts[i].toFixed(1)},${this.gesturePts[i + 1].toFixed(1)} `;
    this.gestureTrace.setAttribute('points', pts);
    if (this.traceCoverage() >= 0.72) this.completeGesture();
  }

  private gestureUp(e: PointerEvent): void {
    if (this.gestureDone || !this.gesturePts.length) return;
    const p = this.toLocal(e);
    const moved = Math.hypot(p.x - this.gesturePts[0], p.y - this.gesturePts[1]);
    // a tap is always accepted (accessibility); a partial trace is forgiven above 50% coverage
    if (moved < 6 || !this.gestureLen || this.traceCoverage() >= 0.5) this.completeGesture();
    else {
      this.gesturePts.length = 0;
      this.gestureTrace.setAttribute('points', '');
    }
  }

  /** Fraction of guide samples that the traced polyline passed near. */
  private traceCoverage(): number {
    const N = 24;
    let hit = 0;
    for (let k = 0; k <= N; k++) {
      const q = this.gestureGuide.getPointAtLength((this.gestureLen * k) / N);
      for (let i = 0; i < this.gesturePts.length; i += 2) {
        if (Math.hypot(q.x - this.gesturePts[i], q.y - this.gesturePts[i + 1]) < 11) {
          hit++;
          break;
        }
      }
    }
    return hit / (N + 1);
  }

  private completeGesture(): void {
    this.gestureDone = true;
    this.gestureTrace.setAttribute('points', '');
    this.gestureStart.setAttribute('r', '0');
    this.ctx.game.input.press('advance');
    this.ctx.game.platform.haptic('light');
  }
}

