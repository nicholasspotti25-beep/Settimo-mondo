/**
 * The in-game menu, in two modes. ALTAR: the Altare della Quiete menu, open while `sim.altarOpen` is set (the sim keeps
 * running: GameUI.paused() stays false). PAUSE: the pause menu (GameUI.paused() true): the journey summary, Armeria, Forme
 * and Reperti read-only (the loadout changes only at altars), save export (text code) and quit to title.
 * Altar sections:
 * Sections: Medita (time of day via game.meditate), Armeria (owned weapons, 3 slots via sim.setLoadout), Forme
 * (sim.setForm), Viaggio (fast travel between visited altars), Specchio dei Ricordi (sim.startMemoryFight), Reperti, and
 * leave (sim.closeAltar). Everything reads the live sim state; panels rebuild on actions only.
 */
import type { TimeOfDay, WeaponDef, FormDef, BossDef } from '../core/types';
import { weaponDamage } from '../core/formulas';
import { isDefeated } from '../sim/gamestate';
import type { UiCtx } from './ctx';
import { clear, fmtPlaytime, h, svgIcon } from './dom';
import { ICONS, TOD_ICONS, weaponGlyph } from './icons';
import { MenuScreen, confirmDialog, listItem, pill, pips, row, toggleCtl, uiSound } from './screen';

export const TODS: readonly TimeOfDay[] = ['alba', 'giorno', 'tramonto', 'notte'];

const CHALLENGES = [
  { key: 'noDamage', id: 'no_damage' },
  { key: 'singleWeapon', id: 'single_weapon' },
  { key: 'noLacrime', id: 'no_lacrime' },
  { key: 'noMetamondo', id: 'no_metamondo' },
] as const;
type ChalKey = (typeof CHALLENGES)[number]['key'];

const REPERTO_ICONS: Record<string, string> = {
  lantern: ICONS.lantern, letter: ICONS.feather, armor: ICONS.guard, mural: ICONS.collection, grave: ICONS.relic, relic: ICONS.relic,
};

export interface AltarHost {
  /** Run a world-changing action behind a short fade (meditation, travel, memory fight). */
  transition(fn: () => void): void;
  /** Small transient confirmation at the bottom of the screen. */
  flash(text: string): void;
}

export class AltarMenu {
  readonly screen: MenuScreen;
  private altar: string | null = null;
  /** Current mode: altar menu, pause menu, or closed. */
  mode: 'altar' | 'pause' | null = null;
  private slotSel = 0;
  private weaponSel: string | null = null;
  private formSel: string | null = null;
  private memBoss: string | null = null;
  private memTod: TimeOfDay = 'notte';
  private memForm = '';
  private memChal: Record<ChalKey, boolean> = { noDamage: false, singleWeapon: false, noLacrime: false, noMetamondo: false };
  private repSel: string | null = null;

  constructor(private ctx: UiCtx, private host: AltarHost) {
    this.screen = new MenuScreen(ctx, 'altar');
    this.screen.onBack = () => this.leave();
    this.screen.onSelect = (id) => this.fill(id);
  }

  private get sim() {
    return this.ctx.game.sim;
  }

  get isOpen(): boolean {
    return this.mode !== null;
  }

  get paused(): boolean {
    return this.mode === 'pause';
  }

  /** Per frame: open/close/retitle when the sim's altar changes. Cheap when nothing changed. */
  update(altarId: string | null): void {
    if (this.mode === 'pause' || altarId === this.altar) return;
    const prev = this.altar;
    this.altar = altarId;
    if (!altarId) {
      this.mode = null;
      this.screen.show(false);
      return;
    }
    this.mode = 'altar';
    this.head();
    if (!prev) {
      const st = this.sim.state;
      this.slotSel = Math.max(0, st.activeSlot);
      this.weaponSel = null;
      this.formSel = null;
      this.screen.show(true);
      this.screen.select('meditate');
    } else {
      // fast travel re-opened the menu at another altar
      this.screen.select(this.screen.current || 'meditate');
    }
  }

  /** Open the pause menu (from the pause button, Escape, or when the app returns from the background). */
  openPause(): void {
    if (this.mode) return;
    this.mode = 'pause';
    this.slotSel = Math.max(0, this.sim.state.activeSlot);
    this.weaponSel = null;
    this.formSel = null;
    this.head();
    this.screen.show(true);
    this.screen.select('journey');
  }

  closePause(): void {
    if (this.mode !== 'pause') return;
    this.mode = null;
    this.screen.show(false);
    clear(this.screen.panel);
  }

  /** Language changed or the hour changed: rebuild head + nav and the current section. */
  relabel(): void {
    if (!this.mode) return;
    this.head();
    if (this.screen.current) this.screen.select(this.screen.current);
  }

  private head(): void {
    const { t } = this.ctx;
    const sim = this.sim;
    const c = this.ctx.game.content;
    if (this.mode === 'pause') {
      const z = sim.state.zone && c.hasZone(sim.state.zone) ? t(c.zone(sim.state.zone).name_key) : '';
      this.screen.setTitle(t('ui.pause.title'), [z, t(`ui.tod.${sim.state.timeOfDay}`)].filter(Boolean).join(' · '));
      this.screen.setNav([
        { id: 'resume', icon: ICONS.continue, label: t('ui.pause.resume') },
        { id: 'journey', icon: ICONS.seed, label: t('ui.pause.journey') },
        { id: 'armory', icon: ICONS.armory, label: t('ui.altar.armory') },
        { id: 'forms', icon: ICONS.forms, label: t('ui.altar.forms') },
        { id: 'reperti', icon: ICONS.relic, label: t('ui.altar.reperti') },
        { id: 'save', icon: ICONS.save, label: t('ui.pause.save') },
        { id: 'quit', icon: ICONS.exit, label: t('ui.pause.quit') },
      ]);
      return;
    }
    if (!this.altar) return;
    const a = c.altar(this.altar);
    const zone = c.hasZone(a.zone) ? t(c.zone(a.zone).name_key) : '';
    this.screen.setTitle(t(a.name_key), [zone, t(`ui.tod.${sim.state.timeOfDay}`)].filter(Boolean).join(' · '));
    const hasMemory = this.memoryBosses().length > 0;
    this.screen.setNav([
      { id: 'meditate', icon: ICONS.meditate, label: t('ui.altar.meditate') },
      { id: 'armory', icon: ICONS.armory, label: t('ui.altar.armory') },
      { id: 'forms', icon: ICONS.forms, label: t('ui.altar.forms') },
      { id: 'travel', icon: ICONS.travel, label: t('ui.altar.travel'), disabled: !sim.canFastTravel() },
      { id: 'mirror', icon: ICONS.mirror, label: t('ui.altar.mirror'), disabled: !hasMemory },
      { id: 'reperti', icon: ICONS.relic, label: t('ui.altar.reperti') },
      { id: 'leave', icon: ICONS.exit, label: t('ui.altar.leave') },
    ]);
  }

  /** Back / Escape: leave the altar or resume from pause. */
  leave(): void {
    if (this.mode === 'pause') {
      this.closePause();
      return;
    }
    if (!this.altar) return;
    this.ctx.game.act((s) => s.closeAltar());
  }

  private get ro(): boolean {
    return this.mode === 'pause';
  }

  private fill(id: string): void {
    const p = this.screen.panel;
    switch (id) {
      case 'meditate': this.meditate(p); break;
      case 'armory': this.armory(p); break;
      case 'forms': this.forms(p); break;
      case 'travel': this.travel(p); break;
      case 'mirror': this.mirror(p); break;
      case 'reperti': this.reperti(p); break;
      case 'journey': this.journey(p); break;
      case 'save': this.save(p); break;
      case 'leave':
      case 'resume':
        uiSound(this.ctx, 'back');
        this.leave();
        break;
      case 'quit':
        this.screen.select('journey');
        void confirmDialog(this.ctx, this.screen.el, this.ctx.t('ui.pause.quit_q'), this.ctx.t('ui.pause.quit_d'), this.ctx.t('ui.pause.quit_yes'), this.ctx.t('ui.pause.cancel')).then((ok) => {
          if (!ok) return;
          this.closePause();
          this.ctx.game.quitToTitle();
        });
        break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------------------------------------ Medita */

  private meditate(p: HTMLElement): void {
    const { t, tOpt } = this.ctx;
    const game = this.ctx.game;
    const st = this.sim.state;
    const cards = h('div', { class: 'sm-cards four' });
    for (const tod of TODS) {
      const b = h('button', { class: `sm-todc ${tod}${st.timeOfDay === tod ? ' sel' : ''}`, type: 'button' },
        h('i', null, svgIcon(TOD_ICONS[tod])), h('div', { class: 'n' }, t(`ui.tod.${tod}`)), h('div', { class: 'd' }, t(`ui.tod_d.${tod}`)));
      b.addEventListener('click', () => {
        uiSound(this.ctx, 'confirm');
        this.host.transition(() => {
          game.meditate(tod);
          this.relabel();
        });
      });
      cards.appendChild(b);
    }
    p.append(h('div', { class: 'sm-p it' }, t('ui.altar.meditate_hint')), cards);
    // the guardian beyond the mist changes with the hour
    const a = game.content.altar(this.altar!);
    const boss = a.before_boss && game.content.hasBoss(a.before_boss) ? game.content.boss(a.before_boss) : null;
    if (boss && !isDefeated(st, boss.id)) {
      const note = boss.time_of_day_variants[st.timeOfDay]?.note_key;
      const txt = note ? tOpt(note) : '';
      if (txt) p.append(h('div', { class: 'sm-h3' }, t('ui.altar.beyond')), h('div', { class: 'sm-p it' }, txt));
    }
  }

  /* ------------------------------------------------------------------------------------------------ Armeria */

  private ownedWeapons(): WeaponDef[] {
    const c = this.ctx.game.content;
    const order = (w: WeaponDef) => (w.starter ? -1 : w.source_boss && c.hasBoss(w.source_boss) ? c.boss(w.source_boss).order : 999);
    return this.sim.state.weapons.filter((id) => c.hasWeapon(id)).map((id) => c.weapon(id)).sort((a, b) => order(a) - order(b));
  }

  private weaponLocked(w: WeaponDef): boolean {
    return !!w.ng_plus_only && this.sim.state.ngCycle < 1;
  }

  private equip(slot: number, id: string | null): void {
    const eq = [...this.sim.state.equipped];
    while (eq.length < 3) eq.push(null);
    if (id) {
      const at = eq.indexOf(id);
      if (at >= 0) eq[at] = eq[slot];
    }
    eq[slot] = id;
    uiSound(this.ctx, 'equip');
    this.ctx.game.act((s) => s.setLoadout(eq));
    this.screen.refresh();
  }

  private armory(p: HTMLElement): void {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const st = this.sim.state;
    const owned = this.ownedWeapons();
    // slots
    const slots = h('div', { class: 'sm-slots' });
    for (let i = 0; i < 3; i++) {
      const id = st.equipped[i];
      const w = id && c.hasWeapon(id) ? c.weapon(id) : null;
      const b = h('button', { class: `sm-slotc${i === this.slotSel ? ' sel' : ''}`, type: 'button' },
        h('i', { class: 'g' }, svgIcon(w ? weaponGlyph(w.type) : ICONS.armory)),
        h('div', { class: 'n' }, h('small', null, t('ui.touch.slot', { n: i + 1 })), w ? t(w.name_key) : t('ui.altar.empty')));
      if (!w) b.classList.add('empty');
      b.addEventListener('click', () => {
        uiSound(this.ctx, 'move');
        this.slotSel = i;
        this.weaponSel = st.equipped[i] ?? this.weaponSel;
        this.screen.refresh();
      });
      slots.appendChild(b);
    }
    if (!this.weaponSel || !owned.some((w) => w.id === this.weaponSel)) this.weaponSel = st.equipped[this.slotSel] ?? owned[0]?.id ?? null;

    // grid
    const grid = h('div', { class: 'sm-grid' });
    for (const w of owned) {
      const slot = st.equipped.indexOf(w.id);
      const tile = h('button', {
        class: `sm-tile${w.id === this.weaponSel ? ' sel' : ''}${slot >= 0 ? ' eq' : ''}${this.weaponLocked(w) ? ' locked' : ''}`,
        type: 'button', 'data-slot': slot >= 0 ? String(slot + 1) : null, 'aria-label': t(w.name_key),
      }, svgIcon(weaponGlyph(w.type)), h('span', { class: 'tn' }, t(w.name_key)));
      tile.addEventListener('click', () => {
        if (!this.ro && this.weaponSel === w.id && !this.weaponLocked(w) && st.equipped[this.slotSel] !== w.id) {
          this.equip(this.slotSel, w.id);
          return;
        }
        uiSound(this.ctx, 'move');
        this.weaponSel = w.id;
        this.screen.refresh();
      });
      grid.appendChild(tile);
    }
    const left = h('div', { class: 'a' }, h('div', { class: 'sm-h3' }, t('ui.altar.owned', { n: owned.length })), grid,
      h('div', { class: 'sm-note' }, t(this.ro ? 'ui.pause.loadout_note' : 'ui.altar.armory_hint')));
    const right = h('div', { class: 'b' });
    const sel = this.weaponSel && c.hasWeapon(this.weaponSel) ? c.weapon(this.weaponSel) : null;
    if (sel) right.appendChild(this.weaponDetail(sel));
    p.append(slots, h('div', { class: 'sm-split' }, left, right));
  }

  private weaponDetail(w: WeaponDef): HTMLElement {
    const { t, tOpt } = this.ctx;
    const game = this.ctx.game;
    const st = this.sim.state;
    const locked = this.weaponLocked(w);
    const inSlot = st.equipped.indexOf(w.id);
    const dmg = weaponDamage(game.content.balance, w);
    const stats = h('div', { class: 'sm-stats' },
      t('ui.altar.type'), h('b', null, t(`ui.wtype.${w.type}`)),
      t('ui.altar.damage'), h('b', null, String(dmg)),
      t('ui.altar.parry'), h('b', null, t(w.parry_capable ? 'ui.altar.yes' : 'ui.altar.no')),
      t('ui.altar.stamina'), h('b', null, t('ui.altar.stamina_v', { l: w.stamina_cost.light, h: w.stamina_cost.heavy })));
    const art = (label: string, a: WeaponDef['arts']['prima']) => {
      const name = tOpt(a.name_key ?? `art.${a.id}.name`);
      const desc = tOpt(a.desc_key ?? `art.${a.id}.desc`);
      return h('div', { class: 'sm-art' }, h('div', { class: 'ac' }, label, ' ', pips(Math.max(0, Math.round(a.eco_cost / 100)))), h('div', { class: 'an' }, name), desc ? h('div', { class: 'sm-p' }, desc) : null);
    };
    const flavor = w.flavor_key ? tOpt(w.flavor_key) : '';
    const acts = h('div', { class: 'sm-pills' });
    if (this.ro) {
      if (locked) acts.appendChild(h('div', { class: 'sm-note' }, svgIcon(ICONS.lockClosed, 'sm-ico sm-inl'), ' ', t('ui.altar.ng_locked')));
      else if (inSlot >= 0) acts.appendChild(h('span', { class: 'sm-note' }, t('ui.altar.in_slot', { n: inSlot + 1 })));
    } else if (locked) acts.appendChild(h('div', { class: 'sm-note' }, svgIcon(ICONS.lockClosed, 'sm-ico sm-inl'), ' ', t('ui.altar.ng_locked')));
    else if (inSlot === this.slotSel) acts.appendChild(pill(t('ui.altar.unequip'), () => this.equip(this.slotSel, null), { icon: ICONS.close }));
    else acts.appendChild(pill(t('ui.altar.equip', { n: this.slotSel + 1 }), () => this.equip(this.slotSel, w.id), { icon: ICONS.check, cls: 'gold' }));
    if (!this.ro && !locked && inSlot >= 0 && inSlot !== this.slotSel) acts.appendChild(h('span', { class: 'sm-small' }, t('ui.altar.in_slot', { n: inSlot + 1 })));
    return h('div', { class: 'sm-detail' },
      h('div', { class: 'big' }, h('i', null, svgIcon(weaponGlyph(w.type))), h('div', null, h('div', { class: 'sm-h2' }, t(w.name_key)), h('div', { class: 'sm-small' }, tOpt(w.desc_key)))),
      stats, art(t('ui.altar.art1'), w.arts.prima), art(t('ui.altar.art2'), w.arts.seconda),
      flavor ? h('div', { class: 'sm-p it' }, flavor) : null, acts);
  }

  /* ------------------------------------------------------------------------------------------------ Forme */

  private forms(p: HTMLElement): void {
    const { t } = this.ctx;
    const st = this.sim.state;
    const all = [...this.ctx.game.content.forms].sort((a, b) => a.order - b.order);
    if (!this.formSel || !st.forms.includes(this.formSel)) this.formSel = st.equippedForm;
    const list = h('div', { class: 'a' });
    for (const f of all) {
      const owned = st.forms.includes(f.id);
      const eq = st.equippedForm === f.id;
      const li = listItem(owned ? ICONS.forms : ICONS.lockClosed, owned ? t(f.name_key) : t('ui.altar.form_locked'), owned ? t(f.ability.name_key) : '',
        eq ? t('ui.altar.form_equipped') : '', owned ? () => {
          uiSound(this.ctx, 'move');
          this.formSel = f.id;
          this.screen.refresh();
        } : null, `${f.id === this.formSel ? 'sel' : ''}${owned ? '' : ' dis'}`);
      list.appendChild(li);
    }
    const right = h('div', { class: 'b' });
    const f = all.find((x) => x.id === this.formSel);
    if (f) right.appendChild(this.formDetail(f));
    p.append(h('div', { class: 'sm-p it' }, t(this.ro ? 'ui.pause.loadout_note' : 'ui.altar.forms_hint')), h('div', { class: 'sm-split' }, list, right));
  }

  private formDetail(f: FormDef): HTMLElement {
    const { t } = this.ctx;
    const st = this.sim.state;
    const eq = st.equippedForm === f.id;
    const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;
    const dmgMult = typeof f.ability.params.damage_mult === 'number' ? f.ability.params.damage_mult : f.base.damage_mult;
    return h('div', { class: 'sm-detail' },
      h('div', { class: 'big' }, h('i', null, svgIcon(ICONS.forms)), h('div', null, h('div', { class: 'sm-h2' }, t(f.name_key)), h('div', { class: 'sm-p it' }, t(f.desc_key)))),
      h('div', { class: 'sm-stats' },
        t('ui.altar.form_duration'), h('b', null, t('ui.altar.seconds', { n: f.base.duration })),
        t('ui.altar.damage'), h('b', null, pct(dmgMult)),
        t('ui.altar.form_eco'), h('b', null, `×${f.base.eco_regen_mult}`)),
      h('div', { class: 'sm-art' }, h('div', { class: 'ac' }, t('ui.altar.form_ability')), h('div', { class: 'an' }, t(f.ability.name_key)), h('div', { class: 'sm-p' }, t(f.ability.desc_key))),
      h('div', { class: 'sm-pills' }, eq || this.ro
        ? (eq ? h('span', { class: 'sm-note' }, t('ui.altar.form_equipped')) : null)
        : pill(t('ui.altar.form_equip'), () => {
          uiSound(this.ctx, 'equip');
          this.ctx.game.act((s) => s.setForm(f.id));
          this.screen.refresh();
        }, { icon: ICONS.check, cls: 'gold' })));
  }

  /* ------------------------------------------------------------------------------------------------ Viaggio */

  private travel(p: HTMLElement): void {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const sim = this.sim;
    if (!sim.canFastTravel()) {
      p.append(h('div', { class: 'sm-empty' }, t('ui.altar.travel_off')));
      return;
    }
    p.append(h('div', { class: 'sm-p it' }, t('ui.altar.travel_hint')));
    const route = c.bundle.progression.acts.flatMap((a) => a.zones);
    const zoneOrder = (z: string) => {
      const i = route.indexOf(z);
      return i < 0 ? 999 : i;
    };
    const targets = sim.fastTravelTargets().map((id) => c.altar(id)).sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone));
    let lastZone = '';
    for (const a of targets) {
      if (a.zone !== lastZone) {
        lastZone = a.zone;
        p.append(h('div', { class: 'sm-h3' }, c.hasZone(a.zone) ? t(c.zone(a.zone).name_key) : ''));
      }
      const here = a.id === this.altar;
      p.append(listItem(ICONS.travel, t(a.name_key), '', here ? t('ui.altar.here') : '', here ? null : () => {
        uiSound(this.ctx, 'confirm');
        this.host.transition(() => this.ctx.game.act((s) => s.fastTravel(a.id)));
      }, here ? 'sel' : ''));
    }
  }

  /* ------------------------------------------------------------------------------------------------ Specchio dei Ricordi */

  private memoryBosses(): BossDef[] {
    const st = this.sim.state;
    return this.ctx.game.content.bosses.filter((b) => !b.scripted && isDefeated(st, b.id)).sort((a, b) => a.order - b.order);
  }

  private mirror(p: HTMLElement): void {
    const { t } = this.ctx;
    const st = this.sim.state;
    const bosses = this.memoryBosses();
    if (!bosses.length) {
      p.append(h('div', { class: 'sm-empty' }, t('ui.altar.mirror_empty')));
      return;
    }
    if (!this.memBoss || !bosses.some((b) => b.id === this.memBoss)) this.memBoss = bosses[bosses.length - 1].id;
    if (!this.memForm || !st.forms.includes(this.memForm)) this.memForm = st.equippedForm;
    const list = h('div', { class: 'a' });
    for (const b of bosses) {
      const seen = st.todDefeats[b.id]?.length ?? 0;
      list.appendChild(listItem(ICONS.mirror, t(b.name_key), b.title_key ? this.ctx.tOpt(b.title_key) : '', t('ui.altar.seen', { n: seen }), () => {
        uiSound(this.ctx, 'move');
        this.memBoss = b.id;
        this.screen.refresh();
      }, b.id === this.memBoss ? 'sel' : ''));
    }
    const boss = bosses.find((b) => b.id === this.memBoss)!;
    p.append(h('div', { class: 'sm-p it' }, t('ui.altar.mirror_hint')), h('div', { class: 'sm-split' }, list, h('div', { class: 'b' }, this.memoryDetail(boss))));
  }

  private memoryDetail(b: BossDef): HTMLElement {
    const { t, tOpt } = this.ctx;
    const st = this.sim.state;
    const c = this.ctx.game.content;
    const d = h('div', { class: 'sm-detail' }, h('div', { class: 'sm-h2' }, t(b.name_key)));
    const lore = b.lore_key ? tOpt(b.lore_key) : '';
    if (lore) d.appendChild(h('div', { class: 'sm-p it' }, lore));
    // hour
    const seen = st.todDefeats[b.id] ?? [];
    const tods = h('div', { class: 'sm-chips' });
    for (const tod of TODS) {
      const ch = h('button', { class: `sm-chip${tod === this.memTod ? ' sel' : ''}`, type: 'button' }, h('i', null, svgIcon(TOD_ICONS[tod])), t(`ui.tod.${tod}`),
        seen.includes(tod) ? h('i', null, svgIcon(ICONS.check)) : null);
      ch.addEventListener('click', () => {
        uiSound(this.ctx, 'move');
        this.memTod = tod;
        this.screen.refresh();
      });
      tods.appendChild(ch);
    }
    d.append(h('div', { class: 'sm-h3' }, t('ui.altar.hour')), tods);
    const note = b.time_of_day_variants[this.memTod]?.note_key;
    const noteTxt = note ? tOpt(note) : '';
    if (noteTxt) d.appendChild(h('div', { class: 'sm-note' }, noteTxt));
    // form
    const forms = h('div', { class: 'sm-chips' });
    for (const f of [...c.forms].sort((x, y) => x.order - y.order)) {
      if (!st.forms.includes(f.id)) continue;
      const ch = h('button', { class: `sm-chip${f.id === this.memForm ? ' sel' : ''}`, type: 'button' }, t(f.name_key));
      ch.addEventListener('click', () => {
        uiSound(this.ctx, 'move');
        this.memForm = f.id;
        this.screen.refresh();
      });
      forms.appendChild(ch);
    }
    d.append(h('div', { class: 'sm-h3' }, t('ui.altar.form')), forms);
    // challenges
    d.appendChild(h('div', { class: 'sm-h3' }, t('ui.altar.challenges')));
    for (const ch of CHALLENGES) {
      const done = st.challenges[ch.id]?.includes(b.id) ?? false;
      d.appendChild(row(t(`ui.hud.challenge.${ch.key}`), done ? t('ui.altar.done') : t(`ui.altar.chal_d.${ch.key}`),
        toggleCtl(this.ctx, this.memChal[ch.key], (v) => { this.memChal[ch.key] = v; })));
    }
    d.appendChild(h('div', { class: 'sm-pills' }, pill(t('ui.altar.relive'), () => {
      uiSound(this.ctx, 'confirm');
      const chal = { ...this.memChal };
      const tod = this.memTod, form = this.memForm;
      this.host.transition(() => this.ctx.game.act((s) => s.startMemoryFight(b.id, tod, form, chal)));
    }, { icon: ICONS.mirror, cls: 'gold' })));
    return d;
  }

  /* ------------------------------------------------------------------------------------------------ Pause: journey, save */

  private journey(p: HTMLElement): void {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const st = this.sim.state;
    const foes = c.bosses.filter((b) => isDefeated(st, b.id)).length;
    const weapons = st.weapons.filter((id) => c.hasWeapon(id)).length;
    const cell = (label: string, v: string) => h('div', null, h('b', null, v), h('span', null, label));
    const f = c.hasZone(st.zone) ? c.zone(st.zone) : null;
    p.append(
      h('div', { class: 'sm-h2' }, st.character.name || ''),
      h('div', { class: 'sm-p it' }, [f ? t(f.name_key) : '', st.ngCycle > 0 ? t('ui.pause.cycle', { n: st.ngCycle }) : ''].filter(Boolean).join(' · ')),
      h('div', { class: 'sm-sum' },
        cell(t('ui.pause.playtime'), fmtPlaytime(st.playtime)),
        cell(t('ui.pause.bosses'), `${foes}/${c.bosses.length}`),
        cell(t('ui.pause.weapons'), `${weapons}/${c.weapons.length}`),
        cell(t('ui.pause.forms'), `${st.forms.length}/${c.forms.length}`),
        cell(t('ui.pause.reperti'), `${st.reperti.length}/${c.bundle.reperti.length}`),
        cell(t('ui.pause.deaths'), String(st.deaths))),
      h('div', { class: 'sm-pills' }, pill(t('ui.pause.resume'), () => {
        uiSound(this.ctx, 'confirm');
        this.closePause();
      }, { icon: ICONS.continue, cls: 'gold' })));
  }

  private save(p: HTMLElement): void {
    const { t } = this.ctx;
    const game = this.ctx.game;
    const code = game.exportSave();
    const ta = h('textarea', { class: 'sm-text', readonly: true, rows: 4, spellcheck: 'false' }) as HTMLTextAreaElement;
    ta.value = code;
    const copy = async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(code);
        ok = true;
      } catch {
        ta.focus();
        ta.select();
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
      }
      if (ok) {
        uiSound(this.ctx, 'confirm');
        this.host.flash(t('ui.pause.copied'));
      }
    };
    p.append(h('div', { class: 'sm-p it' }, t('ui.pause.save_hint')), ta,
      h('div', { class: 'sm-pills' },
        pill(t('ui.pause.copy'), () => void copy(), { icon: ICONS.copy, cls: 'gold' }),
        pill(t('ui.pause.save_now'), () => {
          uiSound(this.ctx, 'confirm');
          void game.saveNow('manual').then(() => this.host.flash(t('ui.pause.saved')));
        }, { icon: ICONS.save })));
  }

  /* ------------------------------------------------------------------------------------------------ Reperti */

  private reperti(p: HTMLElement): void {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const st = this.sim.state;
    const found = st.reperti.filter((id) => c.bundle.reperti.some((r) => r.id === id)).map((id) => c.reperto(id));
    p.append(h('div', { class: 'sm-h3' }, `${t('ui.altar.reperti_title')} · ${t('ui.altar.reperti_count', { n: found.length, m: c.bundle.reperti.length })}`));
    if (!found.length) {
      p.append(h('div', { class: 'sm-empty' }, t('ui.altar.reperti_empty')));
      return;
    }
    if (!this.repSel || !found.some((r) => r.id === this.repSel)) this.repSel = found[found.length - 1].id;
    const list = h('div', { class: 'a' });
    for (const r of found) {
      list.appendChild(listItem(REPERTO_ICONS[r.kind] ?? ICONS.relic, t(r.title_key), c.hasZone(r.zone) ? t(c.zone(r.zone).name_key) : '', '', () => {
        uiSound(this.ctx, 'move');
        this.repSel = r.id;
        this.screen.refresh();
      }, r.id === this.repSel ? 'sel' : ''));
    }
    const sel = c.reperto(this.repSel);
    const right = h('div', { class: 'b' }, h('div', { class: 'sm-detail' },
      h('div', { class: 'big' }, h('i', null, svgIcon(REPERTO_ICONS[sel.kind] ?? ICONS.relic)), h('div', { class: 'sm-h2' }, t(sel.title_key))),
      h('div', { class: 'sm-p it sm-read' }, t(sel.text_key))));
    p.append(h('div', { class: 'sm-split' }, list, right));
  }

  /** Drop all cached selection (new session). */
  reset(): void {
    this.altar = null;
    this.mode = null;
    this.memBoss = null;
    this.repSel = null;
    this.screen.show(false);
    clear(this.screen.panel);
  }
}
