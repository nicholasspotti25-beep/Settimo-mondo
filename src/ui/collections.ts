/**
 * Collections (Bible C12), a pause-menu section: the full catalogue of the 38 weapons, the seven Forms, the time-of-day
 * variants of every boss that can be relived (state.todDefeats) and the four Specchio dei Ricordi challenges per boss
 * (state.challenges). The four progress counters double as the section's tabs. Undiscovered entries stay veiled (no names
 * of weapons or foes not yet met), so the catalogue never spoils the road ahead.
 */
import type { BossDef, FormDef, TimeOfDay, WeaponDef } from '../core/types';
import type { GameStateData } from '../sim/gamestate';
import type { UiCtx } from './ctx';
import { h, svgIcon } from './dom';
import { ICONS, TOD_ICONS, weaponGlyph } from './icons';
import { uiSound } from './screen';

export const COLL_TODS: readonly TimeOfDay[] = ['alba', 'giorno', 'tramonto', 'notte'];

/** Specchio dei Ricordi challenges: locale key suffix, state id, mark icon. */
export const COLL_CHALLENGES = [
  { key: 'noDamage', id: 'no_damage', icon: ICONS.heart },
  { key: 'singleWeapon', id: 'single_weapon', icon: ICONS.armory },
  { key: 'noLacrime', id: 'no_lacrime', icon: ICONS.lacrime },
  { key: 'noMetamondo', id: 'no_metamondo', icon: ICONS.forms },
] as const;

export type CollTab = 'weapons' | 'forms' | 'hours' | 'challenges';

export interface CollStats {
  weapons: [number, number];
  forms: [number, number];
  hours: [number, number];
  challenges: [number, number];
}

type StateLike = Pick<GameStateData, 'weapons' | 'forms' | 'todDefeats' | 'challenges'>;

/** Bosses that count for the hour and challenge collections: the ones the Specchio dei Ricordi can replay. */
export function memoryCatalogue<B extends { id: string; scripted?: boolean; order: number }>(bosses: readonly B[]): B[] {
  return bosses.filter((b) => !b.scripted).sort((a, b) => a.order - b.order);
}

/** Collection progress (pure): owned / total for each of the four collections. Unknown ids in the save are ignored. */
export function collectionStats(cat: { weapons: readonly string[]; forms: readonly string[]; bosses: readonly { id: string; scripted?: boolean; order: number }[] }, st: StateLike): CollStats {
  const wset = new Set(cat.weapons), fset = new Set(cat.forms);
  const mem = memoryCatalogue(cat.bosses);
  const mset = new Set(mem.map((b) => b.id));
  let hours = 0;
  for (const b of mem) hours += new Set((st.todDefeats[b.id] ?? []).filter((t) => COLL_TODS.includes(t))).size;
  let chal = 0;
  for (const c of COLL_CHALLENGES) chal += new Set((st.challenges[c.id] ?? []).filter((id) => mset.has(id))).size;
  return {
    weapons: [new Set(st.weapons.filter((id) => wset.has(id))).size, cat.weapons.length],
    forms: [new Set(st.forms.filter((id) => fset.has(id))).size, cat.forms.length],
    hours: [hours, mem.length * COLL_TODS.length],
    challenges: [chal, mem.length * COLL_CHALLENGES.length],
  };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface CollectionsHost {
  /** Read-only weapon detail (the pause Armeria one). */
  weaponDetail(w: WeaponDef): HTMLElement;
  /** Read-only Form detail. */
  formDetail(f: FormDef): HTMLElement;
  /** Rebuild the section keeping the scroll position. */
  refresh(): void;
}

export class CollectionsView {
  private tab: CollTab = 'weapons';
  private weaponSel: string | null = null;
  private formSel: string | null = null;
  private bossSel: string | null = null;

  constructor(private ctx: UiCtx, private host: CollectionsHost) {}

  private get st(): GameStateData {
    return this.ctx.game.sim.state;
  }

  /** New session: forget the selection. */
  reset(): void {
    this.tab = 'weapons';
    this.weaponSel = this.formSel = this.bossSel = null;
  }

  fill(p: HTMLElement): void {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const stats = collectionStats({ weapons: c.weapons.map((w) => w.id), forms: c.forms.map((f) => f.id), bosses: c.bosses }, this.st);
    const tabs = h('div', { class: 'sm-sum sm-colltabs' });
    const cell = (id: CollTab, [n, m]: [number, number]) => {
      const b = h('button', { class: `${id === this.tab ? 'sel' : ''}${n >= m && m > 0 ? ' full' : ''}`, type: 'button', 'data-tab': id },
        h('b', null, `${n}`, h('small', null, `/${m}`)), h('span', null, t(`ui.coll.${id}`)),
        h('i', { class: 'bar' }, h('i', { style: `width:${m ? Math.round((n / m) * 100) : 0}%` })));
      b.addEventListener('click', () => {
        if (this.tab === id) return;
        uiSound(this.ctx, 'move');
        this.tab = id;
        this.host.refresh();
      });
      tabs.appendChild(b);
    };
    cell('weapons', stats.weapons);
    cell('forms', stats.forms);
    cell('hours', stats.hours);
    cell('challenges', stats.challenges);
    p.appendChild(tabs);
    switch (this.tab) {
      case 'weapons': this.weapons(p); break;
      case 'forms': this.forms(p); break;
      case 'hours': this.bosses(p, 'hours'); break;
      case 'challenges': this.bosses(p, 'challenges'); break;
    }
  }

  /* ------------------------------------------------------------------------------------------------ weapons */

  private weapons(p: HTMLElement): void {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const owned = new Set(this.st.weapons);
    const order = (w: WeaponDef) => (w.starter ? -1 : w.source_boss && c.hasBoss(w.source_boss) ? c.boss(w.source_boss).order : 999);
    const all = [...c.weapons].sort((a, b) => order(a) - order(b));
    if (!this.weaponSel || !all.some((w) => w.id === this.weaponSel)) this.weaponSel = all.find((w) => owned.has(w.id))?.id ?? all[0]?.id ?? null;
    const grid = h('div', { class: 'sm-grid coll' });
    all.forEach((w, i) => {
      const has = owned.has(w.id);
      const locked = has && !!w.ng_plus_only && this.st.ngCycle < 1;
      const tile = h('button', {
        class: `sm-tile${w.id === this.weaponSel ? ' sel' : ''}${has ? '' : ' unknown'}${locked ? ' ngl' : ''}`, type: 'button',
        'aria-label': has ? t(w.name_key) : t('ui.coll.unknown_weapon'),
      }, svgIcon(weaponGlyph(w.type)), h('span', { class: 'tn' }, has ? t(w.name_key) : `${i + 1}`));
      tile.addEventListener('click', () => {
        if (this.weaponSel === w.id) return;
        uiSound(this.ctx, 'move');
        this.weaponSel = w.id;
        this.host.refresh();
      });
      grid.appendChild(tile);
    });
    const sel = all.find((w) => w.id === this.weaponSel);
    const right = h('div', { class: 'b' });
    if (sel && owned.has(sel.id)) right.appendChild(this.host.weaponDetail(sel));
    else if (sel) right.appendChild(this.veiled(weaponGlyph(sel.type), t('ui.coll.unknown_weapon'), t(`ui.wtype.${sel.type}`), t(sel.starter ? 'ui.coll.weapon_hint_start' : 'ui.coll.weapon_hint')));
    p.append(h('div', { class: 'sm-split coll' }, h('div', { class: 'a' }, grid), right));
  }

  /* ------------------------------------------------------------------------------------------------ forms */

  private forms(p: HTMLElement): void {
    const { t } = this.ctx;
    const all = [...this.ctx.game.content.forms].sort((a, b) => a.order - b.order);
    const owned = new Set(this.st.forms);
    if (!this.formSel || !all.some((f) => f.id === this.formSel)) this.formSel = this.st.equippedForm;
    const grid = h('div', { class: 'sm-grid forms' });
    all.forEach((f, i) => {
      const has = owned.has(f.id);
      const tile = h('button', { class: `sm-tile roman${f.id === this.formSel ? ' sel' : ''}${has ? '' : ' unknown'}`, type: 'button', 'aria-label': has ? t(f.name_key) : t('ui.altar.form_locked') },
        h('em', null, ROMAN[i] ?? String(i + 1)), h('span', { class: 'tn' }, has ? t(f.name_key) : t('ui.coll.dormant')));
      tile.addEventListener('click', () => {
        if (this.formSel === f.id) return;
        uiSound(this.ctx, 'move');
        this.formSel = f.id;
        this.host.refresh();
      });
      grid.appendChild(tile);
    });
    const sel = all.find((f) => f.id === this.formSel);
    const right = h('div', { class: 'b' });
    if (sel && owned.has(sel.id)) right.appendChild(this.host.formDetail(sel));
    else if (sel) right.appendChild(this.veiled(ICONS.forms, t('ui.altar.form_locked'), '', t('ui.coll.form_hint')));
    p.append(h('div', { class: 'sm-split coll' }, h('div', { class: 'a' }, grid), right));
  }

  /* ------------------------------------------------------------------------------------------------ hours + challenges */

  private bosses(p: HTMLElement, kind: 'hours' | 'challenges'): void {
    const { t, tOpt } = this.ctx;
    const st = this.st;
    const mem = memoryCatalogue(this.ctx.game.content.bosses);
    if (!mem.length) {
      p.append(h('div', { class: 'sm-empty' }, t('ui.coll.no_bosses')));
      return;
    }
    const known = (b: BossDef) => st.defeated.includes(b.id) || (st.todDefeats[b.id]?.length ?? 0) > 0;
    if (!this.bossSel || !mem.some((b) => b.id === this.bossSel)) this.bossSel = [...mem].reverse().find(known)?.id ?? mem[0].id;
    const list = h('div', { class: 'a' });
    mem.forEach((b, i) => {
      const k = known(b);
      const marks = h('span', { class: 'mk' });
      if (kind === 'hours') {
        const seen = st.todDefeats[b.id] ?? [];
        for (const tod of COLL_TODS) marks.appendChild(h('i', { class: seen.includes(tod) ? 'on' : '' }, svgIcon(TOD_ICONS[tod])));
      } else {
        for (const ch of COLL_CHALLENGES) marks.appendChild(h('i', { class: st.challenges[ch.id]?.includes(b.id) ? 'on' : '' }, svgIcon(ch.icon)));
      }
      const li = h('button', { class: `sm-li sm-collrow${b.id === this.bossSel ? ' sel' : ''}${k ? '' : ' unknown'}`, type: 'button' },
        h('em', null, String(i + 1)),
        h('div', { class: 'tx' }, h('div', { class: 'n' }, k ? t(b.name_key) : t('ui.coll.unknown_boss')), k && b.title_key ? h('div', { class: 'd' }, tOpt(b.title_key)) : null),
        marks);
      li.addEventListener('click', () => {
        if (this.bossSel === b.id) return;
        uiSound(this.ctx, 'move');
        this.bossSel = b.id;
        this.host.refresh();
      });
      list.appendChild(li);
    });
    const sel = mem.find((b) => b.id === this.bossSel)!;
    p.append(h('div', { class: 'sm-p it' }, t(kind === 'hours' ? 'ui.coll.hours_hint' : 'ui.coll.challenges_hint')),
      h('div', { class: 'sm-split coll' }, list, h('div', { class: 'b' }, known(sel) ? this.bossDetail(sel, kind) : this.veiled(ICONS.mirror, t('ui.coll.unknown_boss'), '', t('ui.coll.boss_hint')))));
  }

  private bossDetail(b: BossDef, kind: 'hours' | 'challenges'): HTMLElement {
    const { t, tOpt } = this.ctx;
    const st = this.st;
    const d = h('div', { class: 'sm-detail' }, h('div', { class: 'sm-h2' }, t(b.name_key)), b.title_key ? h('div', { class: 'sm-small' }, tOpt(b.title_key)) : null);
    if (kind === 'hours') {
      const seen = st.todDefeats[b.id] ?? [];
      for (const tod of COLL_TODS) {
        const on = seen.includes(tod);
        const note = b.time_of_day_variants[tod]?.note_key;
        d.appendChild(h('div', { class: `sm-collline${on ? ' on' : ''}` }, h('i', null, svgIcon(TOD_ICONS[tod])),
          h('div', null, h('b', null, t(`ui.tod.${tod}`), on ? h('i', { class: 'ck' }, svgIcon(ICONS.check)) : null), h('span', null, (note ? tOpt(note) : '') || t(on ? 'ui.coll.tod_done' : 'ui.coll.tod_open')))));
      }
    } else {
      for (const ch of COLL_CHALLENGES) {
        const on = st.challenges[ch.id]?.includes(b.id) ?? false;
        d.appendChild(h('div', { class: `sm-collline${on ? ' on' : ''}` }, h('i', null, svgIcon(ch.icon)),
          h('div', null, h('b', null, t(`ui.hud.challenge.${ch.key}`), on ? h('i', { class: 'ck' }, svgIcon(ICONS.check)) : null), h('span', null, t(`ui.altar.chal_d.${ch.key}`)))));
      }
    }
    return d;
  }

  private veiled(icon: string, name: string, sub: string, hint: string): HTMLElement {
    return h('div', { class: 'sm-detail veiled' },
      h('div', { class: 'big' }, h('i', null, svgIcon(icon)), h('div', null, h('div', { class: 'sm-h2' }, name), sub ? h('div', { class: 'sm-small' }, sub) : null)),
      h('div', { class: 'sm-p it' }, hint));
  }
}
