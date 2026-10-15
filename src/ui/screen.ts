/**
 * Shared menu scaffolding: a full-screen `.sm-screen` with a head (back button, title, subtitle), a gold rule and a body
 * with a left nav and a scrolling panel, plus the small widget builders every menu uses (pills, toggles, segmented
 * choices, sliders, list items, confirm dialogs). Menus rebuild their panel on actions only, never per frame.
 */
import type { UiCtx } from './ctx';
import { clear, h, setText, svgIcon, toggle, type Child } from './dom';
import { ICONS } from './icons';

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  disabled?: boolean;
}

export function uiSound(ctx: UiCtx, id: 'move' | 'confirm' | 'back' | 'deny' | 'equip'): void {
  ctx.game.audio?.playUi(id);
}

export class MenuScreen {
  readonly el: HTMLElement;
  readonly panel: HTMLElement;
  private nav: HTMLElement;
  private ttl: HTMLElement;
  private sub: HTMLElement;
  private navEls = new Map<string, HTMLElement>();
  current = '';
  onSelect: (id: string) => void = () => undefined;
  onBack: () => void = () => undefined;

  constructor(private ctx: UiCtx, cls = '') {
    const back = h('button', { class: 'sm-iconbtn', type: 'button' }, svgIcon(ICONS.back));
    back.addEventListener('click', () => {
      uiSound(this.ctx, 'back');
      this.onBack();
    });
    this.backBtn = back;
    this.ttl = h('div', { class: 'ttl' });
    this.sub = h('div', { class: 'sub' });
    this.nav = h('div', { class: 'sm-nav' });
    this.panel = h('div', { class: 'sm-panel' });
    this.el = h('div', { class: `sm-screen ${cls} sm-hidden` },
      h('div', { class: 'sm-head' }, back, this.ttl, this.sub),
      h('div', { class: 'sm-rule' }),
      h('div', { class: 'sm-body' }, this.nav, this.panel));
  }

  readonly backBtn: HTMLElement;

  get visible(): boolean {
    return !this.el.classList.contains('sm-hidden');
  }

  show(on: boolean): void {
    toggle(this.el, 'sm-hidden', !on);
  }

  setTitle(title: string, sub = ''): void {
    setText(this.ttl, title);
    setText(this.sub, sub);
  }

  setNav(items: NavItem[]): void {
    clear(this.nav);
    this.navEls.clear();
    for (const it of items) {
      const b = h('button', { class: `sm-navi${it.disabled ? ' dis' : ''}`, type: 'button', 'data-id': it.id }, h('i', null, svgIcon(it.icon)), it.label);
      b.addEventListener('click', () => {
        if (it.disabled) {
          uiSound(this.ctx, 'deny');
          return;
        }
        if (this.current !== it.id) uiSound(this.ctx, 'move');
        this.select(it.id);
      });
      this.navEls.set(it.id, b);
      this.nav.appendChild(b);
    }
  }

  /** Select a nav section: marks it and asks the owner to fill the panel. */
  select(id: string): void {
    this.current = id;
    for (const [k, el] of this.navEls) toggle(el, 'sel', k === id);
    this.panel.scrollTop = 0;
    clear(this.panel);
    this.onSelect(id);
  }

  /** Rebuild the current section, keeping the scroll position. */
  refresh(): void {
    const top = this.panel.scrollTop;
    clear(this.panel);
    this.onSelect(this.current);
    this.panel.scrollTop = top;
  }
}

/* ------------------------------------------------------------------------------------------------ widgets */

export function pill(label: string, onClick: () => void, opts: { icon?: string; cls?: string; disabled?: boolean } = {}): HTMLButtonElement {
  const b = h('button', { class: `sm-pill${opts.cls ? ` ${opts.cls}` : ''}${opts.disabled ? ' dis' : ''}`, type: 'button' },
    opts.icon ? h('i', null, svgIcon(opts.icon)) : null, label);
  b.addEventListener('click', onClick);
  return b;
}

export function row(label: string, sub: string, control: Child, val?: HTMLElement): HTMLElement {
  return h('div', { class: 'sm-row' }, h('div', { class: 'lab' }, label, sub ? h('small', null, sub) : null), val ?? null, control);
}

export function toggleCtl(ctx: UiCtx, on: boolean, set: (v: boolean) => void): HTMLButtonElement {
  const b = h('button', { class: `sm-tog${on ? ' on' : ''}`, type: 'button', role: 'switch', 'aria-checked': String(on) });
  b.addEventListener('click', () => {
    const v = !b.classList.contains('on');
    toggle(b, 'on', v);
    b.setAttribute('aria-checked', String(v));
    uiSound(ctx, 'move');
    set(v);
  });
  return b;
}

export function segCtl<T extends string | number>(ctx: UiCtx, options: { v: T; label: string }[], cur: T, set: (v: T) => void): HTMLElement {
  const el = h('div', { class: 'sm-seg' });
  for (const o of options) {
    const b = h('button', { class: o.v === cur ? 'sel' : '', type: 'button' }, o.label);
    b.addEventListener('click', () => {
      for (const c of Array.from(el.children)) toggle(c, 'sel', c === b);
      uiSound(ctx, 'move');
      set(o.v);
    });
    el.appendChild(b);
  }
  return el;
}

/** Slider; `fmt` renders the value label, `set` fires on input (live) and `commit` on release. */
export function rangeCtl(min: number, max: number, step: number, cur: number, fmt: (v: number) => string, set: (v: number) => void): { el: HTMLInputElement; val: HTMLElement } {
  const el = h('input', { class: 'sm-range', type: 'range', min, max, step, value: cur }) as HTMLInputElement;
  const val = h('span', { class: 'val' }, fmt(cur));
  const paint = (v: number) => el.style.setProperty('--p', `${((v - min) / (max - min || 1)) * 100}%`);
  paint(cur);
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    paint(v);
    setText(val, fmt(v));
    set(v);
  });
  return { el, val };
}

export function listItem(icon: string, name: string, desc: string, right: string, onClick: (() => void) | null, cls = ''): HTMLElement {
  const b = h(onClick ? 'button' : 'div', { class: `sm-li${cls ? ` ${cls}` : ''}`, type: onClick ? 'button' : null },
    h('i', null, svgIcon(icon)), h('div', { class: 'tx' }, h('div', { class: 'n' }, name), desc ? h('div', { class: 'd' }, desc) : null),
    right ? h('span', { class: 'r' }, right) : null);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Modal confirm dialog inside `host`; resolves true on confirm. */
export function confirmDialog(ctx: UiCtx, host: HTMLElement, title: string, text: string, yes: string, no: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      dlg.remove();
      uiSound(ctx, v ? 'confirm' : 'back');
      resolve(v);
    };
    const dlg = h('div', { class: 'sm-dialog' },
      h('div', { class: 'box' }, h('div', { class: 'sm-h2' }, title), text ? h('div', { class: 'sm-p' }, text) : null,
        h('div', { class: 'sm-pills' }, pill(no, () => done(false)), pill(yes, () => done(true), { cls: danger ? 'danger' : 'gold' }))));
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) done(false);
    });
    host.appendChild(dlg);
  });
}

/** Row of 1..max small filled/empty pips, e.g. an Art's Eco cost. */
export function pips(n: number, max = 3): HTMLElement {
  const el = h('span', { class: 'sm-pipsrow' });
  for (let i = 0; i < max; i++) el.appendChild(h('i', { class: i < n ? 'on' : '' }));
  return el;
}
