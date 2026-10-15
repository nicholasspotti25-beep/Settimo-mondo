/**
 * Credits view: the `credits.NN` lines (story_core locale) revealed one after another over a dawn horizon, then a row of
 * end actions. Used from the title (Riconoscimenti); the end-of-game credits mode reuses it with its own actions.
 */
import type { UiCtx } from './ctx';
import { h } from './dom';
import { pill, uiSound } from './screen';

export interface CreditsAction {
  label: string;
  icon?: string;
  gold?: boolean;
  run(): void;
}

export class CreditsView {
  readonly el: HTMLElement;
  private timers: number[] = [];

  constructor(private ctx: UiCtx) {
    this.el = h('div', { class: 'sm-credits sm-hidden' });
  }

  get visible(): boolean {
    return !this.el.classList.contains('sm-hidden');
  }

  /** Keys credits.01, credits.02... that exist in the current language. */
  private lines(): string[] {
    const out: string[] = [];
    for (let i = 1; i < 40; i++) {
      const k = `credits.${String(i).padStart(2, '0')}`;
      const s = this.ctx.tOpt(k);
      if (!s) break;
      out.push(s);
    }
    return out;
  }

  /** Show the credits; `step` is the delay between lines (s); actions appear after the last line. Tap skips ahead. */
  show(actions: CreditsAction[], step = 1.1): void {
    this.hide();
    const lines = this.lines();
    const els = lines.map((s, i) => h('div', { class: `ln${i === 0 ? ' title' : ''}` }, s));
    const end = h('div', { class: 'end' }, h('div', { class: 'sm-pills' }, ...actions.map((a) => pill(a.label, () => {
      uiSound(this.ctx, a.gold ? 'confirm' : 'back');
      a.run();
    }, { icon: a.icon, cls: a.gold ? 'gold' : '' }))));
    this.el.textContent = '';
    this.el.append(h('div', { class: 'body' }, ...els), end);
    this.el.classList.remove('sm-hidden');
    const reveal = (n: number) => {
      els.forEach((e, i) => e.classList.toggle('on', i < n));
      end.classList.toggle('on', n >= els.length);
    };
    let shown = 0;
    const next = () => {
      shown++;
      reveal(shown);
      if (shown < els.length) this.timers.push(window.setTimeout(next, step * 1000));
    };
    this.timers.push(window.setTimeout(next, 250));
    this.el.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.sm-pill')) return;
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
      shown = els.length;
      reveal(shown);
    };
  }

  hide(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.el.classList.add('sm-hidden');
    this.el.textContent = '';
  }
}
