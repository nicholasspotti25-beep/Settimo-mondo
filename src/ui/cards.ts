/**
 * Title cards and notifications: zone name card on zoneEnter, act card when a new act begins, boss name card on fightStart,
 * the "dawn advances" banner on bossDefeated, toasts (weapon obtained + its Arts, Form unlocked, key item, altar discovered,
 * reperto, vista), the gentle death screen and the zone-streaming spinner. Timed in UI seconds (paused menus freeze them).
 */
import type { SimEvent } from '../sim/types';
import { h, svgIcon, setText, toggle } from './dom';
import { ICONS, itemIcon, weaponGlyph } from './icons';
import type { UiCtx } from './ctx';

interface Toast { ic: string; k: string; n: string; d: string }

function ornament(): HTMLElement {
  const el = h('i', { class: 'sm-orn' });
  el.innerHTML =
    '<svg viewBox="0 0 380 10" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible"><path d="M0 5H170M210 5H380" stroke="rgba(234,208,154,.55)" stroke-width="1"/>' +
    '<path d="M190 0.5 194.5 5 190 9.5 185.5 5z" fill="#ead09a"/><circle cx="176" cy="5" r="1.4" fill="#ead09a"/><circle cx="204" cy="5" r="1.4" fill="#ead09a"/></svg>';
  return el;
}

class Card {
  readonly el: HTMLElement;
  readonly t: HTMLElement;
  readonly s: HTMLElement;
  left = 0;
  constructor(cls: string, orn: 'between' | 'none') {
    this.t = h('div', { class: 't' });
    this.s = h('div', { class: 's' });
    this.el = h('div', { class: `sm-card ${cls}` }, ...(cls === 'act' ? [this.s, orn === 'between' ? ornament() : null, this.t] : [this.t, orn === 'between' ? ornament() : null, this.s]));
  }
  show(t: string, s: string, dur: number): void {
    setText(this.t, t);
    setText(this.s, s);
    toggle(this.s, 'sm-hidden', !s);
    this.left = dur;
    toggle(this.el, 'on', true);
  }
  tick(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) toggle(this.el, 'on', false);
  }
  hide(): void {
    this.left = 0;
    toggle(this.el, 'on', false);
  }
}

export class Cards {
  readonly el: HTMLElement;
  private zone = new Card('zone', 'between');
  private act = new Card('act', 'between');
  private boss = new Card('boss', 'between');
  private banner = new Card('banner', 'none');
  private toasts: HTMLElement;
  private queue: Toast[] = [];
  private toastEl: HTMLElement | null = null;
  private toastLeft = 0;
  private death: HTMLElement;
  private deathT: HTMLElement;
  private deathS: HTMLElement;
  private loading: HTMLElement;
  /** Pending zone card shown after an act card. */
  private pendingZone: { t: string; s: string; delay: number } | null = null;
  private lastAct = -1;

  constructor(private readonly ctx: UiCtx) {
    this.toasts = h('div', { class: 'sm-toasts' });
    this.deathT = h('div', { class: 't' });
    this.deathS = h('div', { class: 's' });
    this.death = h('div', { class: 'sm-death' }, this.deathT, this.deathS);
    this.loading = h('div', { class: 'sm-loading' }, svgIcon(ICONS.seed));
    this.el = h('div', { class: 'sm-layer sm-cardlayer' }, this.death, this.zone.el, this.act.el, this.boss.el, this.banner.el, this.toasts, this.loading);
  }

  /** New session (title -> game): the current act does not get a card again. */
  reset(): void {
    const sim = this.ctx.game.sim;
    this.lastAct = sim.zone ? sim.zone.def.act : -1;
    for (const c of [this.zone, this.act, this.boss, this.banner]) c.hide();
    this.queue.length = 0;
    this.toastEl?.remove();
    this.toastEl = null;
    this.pendingZone = null;
    toggle(this.death, 'on', false);
  }

  setLoading(on: boolean): void {
    toggle(this.loading, 'on', on);
  }

  onEvent(e: SimEvent): void {
    const { game, t, tOpt } = this.ctx;
    const c = game.content;
    switch (e.type) {
      case 'zoneEnter': {
        if (!c.hasZone(e.zone)) break;
        const z = c.zone(e.zone);
        const act = c.bundle.progression.acts.find((a) => a.n === z.act);
        const actName = act ? tOpt(act.name_key) : '';
        const zoneName = t(z.name_key);
        if (act && z.act !== this.lastAct && this.lastAct !== -1) {
          this.act.show(actName, t('ui.card.act', { n: roman(z.act) }), 4.2);
          this.pendingZone = { t: zoneName, s: '', delay: 4.6 };
        } else {
          this.zone.show(zoneName, actName, 3.6);
        }
        this.lastAct = z.act;
        break;
      }
      case 'fightStart': {
        if (!c.hasBoss(e.boss)) break;
        const b = c.boss(e.boss);
        this.zone.hide();
        const mem = game.sim.fight?.memory;
        this.boss.show(t(b.name_key), (b.title_key ? tOpt(b.title_key) : '') || (mem ? t('ui.card.memory') : ''), 3.8);
        break;
      }
      case 'bossDefeated': {
        if (!c.hasBoss(e.boss)) break;
        const b = c.boss(e.boss);
        this.boss.hide();
        this.banner.show(t('ui.card.defeated'), t(b.name_key), 5);
        break;
      }
      case 'weaponObtained': {
        if (!c.hasWeapon(e.weapon)) break;
        const w = c.weapon(e.weapon);
        const prima = tOpt(w.arts.prima.name_key ?? `art.${w.arts.prima.id}.name`);
        const seconda = tOpt(w.arts.seconda.name_key ?? `art.${w.arts.seconda.id}.name`);
        this.toast({ ic: weaponGlyph(w.type), k: t('ui.note.weapon'), n: t(w.name_key), d: prima && seconda ? t('ui.note.arts', { prima, seconda }) : '' });
        break;
      }
      case 'formUnlocked': {
        const f = c.bundle.forms.find((x) => x.id === e.form);
        if (f) this.toast({ ic: ICONS.forms, k: t('ui.note.form'), n: t(f.name_key), d: tOpt(f.ability.name_key) });
        break;
      }
      case 'itemObtained':
        this.toast({ ic: itemIcon(e.item), k: t('ui.note.item'), n: tOpt(`item.${e.item}.name`) || e.item, d: '' });
        break;
      case 'altarDiscovered':
        if (c.hasAltar(e.altar)) this.toast({ ic: ICONS.meditate, k: t('ui.note.altar'), n: t(c.altar(e.altar).name_key), d: '' });
        break;
      case 'reperto': {
        const r = c.bundle.reperti.find((x) => x.id === e.id);
        if (r) this.toast({ ic: ICONS.relic, k: t('ui.note.reperto'), n: t(r.title_key), d: '' });
        break;
      }
      case 'vista': {
        const z = game.sim.zone?.def;
        const v = z?.vistas.find((x) => x.id === e.id);
        if (v) this.toast({ ic: ICONS.look, k: t('ui.note.vista'), n: t(v.name_key), d: '' });
        break;
      }
      case 'playerDied':
        setText(this.deathT, t('ui.death.line'));
        setText(this.deathS, t('ui.death.sub'));
        toggle(this.death, 'on', true);
        this.boss.hide();
        break;
      case 'respawn':
        toggle(this.death, 'on', false);
        break;
      default:
        break;
    }
  }

  private bigCardOn(): boolean {
    return this.zone.left > 0 || this.act.left > 0 || this.boss.left > 0 || this.banner.left > 0 || this.pendingZone !== null;
  }

  private toast(n: Toast): void {
    if (this.queue.length > 5) this.queue.shift();
    this.queue.push(n);
  }

  update(dt: number): void {
    this.zone.tick(dt);
    this.act.tick(dt);
    this.boss.tick(dt);
    this.banner.tick(dt);
    if (this.pendingZone) {
      this.pendingZone.delay -= dt;
      if (this.pendingZone.delay <= 0) {
        this.zone.show(this.pendingZone.t, this.pendingZone.s, 3.2);
        this.pendingZone = null;
      }
    }
    if (this.toastEl) {
      this.toastLeft -= dt;
      if (this.toastLeft <= 0.5 && this.toastEl.classList.contains('on')) this.toastEl.classList.remove('on');
      if (this.toastLeft <= 0) {
        this.toastEl.remove();
        this.toastEl = null;
      }
    } else if (this.queue.length && !this.bigCardOn()) {
      // toasts wait for the zone / act / boss cards and the dawn banner, which share the upper-center of the screen
      const n = this.queue.shift()!;
      const el = h('div', { class: 'sm-toast' },
        h('div', { class: 'ic' }, svgIcon(n.ic)),
        h('div', { class: 'tx' }, h('div', { class: 'k' }, n.k), h('div', { class: 'n' }, n.n), n.d ? h('div', { class: 'd' }, n.d) : null));
      this.toasts.appendChild(el);
      this.toastEl = el;
      this.toastLeft = 4.2;
      requestAnimationFrame(() => el.classList.add('on'));
    }
  }
}

export function roman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
