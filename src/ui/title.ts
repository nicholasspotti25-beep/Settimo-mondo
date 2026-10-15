/**
 * Title screen: the dawn horizon, the logo and the main menu (Continua = most recent save, Carica, Nuova partita, Importa
 * codice, Impostazioni, Riconoscimenti), plus its sub-screens: the journeys screen (three save slots with name, zone, hour,
 * playtime and bosses: load / new / delete, and the import of a text save code), the character creator and the credits.
 * Slots are read from game.store; everything else goes through Game (newGame / continueGame / loadState / importSave).
 */
import { defaultCharacter, importCode, type CharacterLook, type GameStateData } from '../sim/gamestate';
import type { UiCtx } from './ctx';
import { clear, fmtPlaytime, h, svgIcon, toggle } from './dom';
import { ICONS } from './icons';
import { MenuScreen, confirmDialog, pill, uiSound } from './screen';
import { CharacterCreator } from './creator';
import { CreditsView } from './credits';

export const SLOT_COUNT = 3;

export interface TitleHost {
  /** Fade out, run the session start, fade back in. */
  startSession(run: () => Promise<unknown>): void;
  /** Small transient confirmation pill. */
  flash(text: string): void;
  /** Open the settings screen over the title (null when it is not available). */
  openSettings: (() => void) | null;
}

/** The slot to continue: the most recently updated save, or -1. */
export function latestSlot(slots: readonly (GameStateData | null)[]): number {
  let best = -1;
  let t = -Infinity;
  slots.forEach((s, i) => {
    if (s && (s.updated ?? 0) > t) {
      t = s.updated ?? 0;
      best = i;
    }
  });
  return best;
}

export class TitleScreen {
  readonly el: HTMLElement;
  private h1: HTMLElement;
  private tag: HTMLElement;
  private menu: HTMLElement;
  private front: HTMLElement;
  private games: MenuScreen;
  private creator: CharacterCreator;
  private credits: CreditsView;
  private slots: (GameStateData | null)[] = [null, null, null];
  private loaded = false;
  private newSlot = 0;
  private importSlot = 0;
  private importText = '';
  private importErr = '';
  private busy = false;

  constructor(private ctx: UiCtx, private host: TitleHost) {
    this.h1 = h('h1');
    this.tag = h('div', { class: 'tag' });
    this.menu = h('div', { class: 'menu' });
    this.front = h('div', { class: 'front' },
      h('div', { class: 'logo' }, h('i', { class: 'seal' }, svgIcon(ICONS.seed)), this.h1, this.tag),
      this.menu);
    this.games = new MenuScreen(ctx, 'clear');
    this.games.onBack = () => this.home();
    this.games.onSelect = (id) => this.fill(id);
    this.creator = new CharacterCreator(ctx, {
      cancel: () => {
        this.creator.close();
        this.openGames('new');
      },
      begin: (look) => this.begin(look),
    }, defaultCharacter());
    this.credits = new CreditsView(ctx);
    this.el = h('div', { class: 'sm-title sm-hidden' },
      h('div', { class: 'sky' }), h('div', { class: 'hz' }), h('div', { class: 'mist' }),
      this.front, this.games.el, this.creator.el, this.credits.el);
    this.front.append(h('div', { class: 'ver' }, `v${ctx.game.content.bundle.version}`));
    this.relabel();
  }

  get visible(): boolean {
    return !this.el.classList.contains('sm-hidden');
  }

  /** Any sub-screen (journeys, creator, credits) is open over the front page. */
  get subOpen(): boolean {
    return this.games.visible || this.creator.visible || this.credits.visible;
  }

  show(on: boolean): void {
    toggle(this.el, 'sm-hidden', !on);
    if (on) {
      this.busy = false;
      this.home();
      void this.refresh();
    } else {
      this.games.show(false);
      this.creator.close();
      this.credits.hide();
    }
  }

  /** Back / Escape on the title: close the open sub-screen. Returns false when already on the front page. */
  back(): boolean {
    if (this.creator.visible) {
      uiSound(this.ctx, 'back');
      this.creator.close();
      this.openGames('new');
      return true;
    }
    if (this.games.visible || this.credits.visible) {
      uiSound(this.ctx, 'back');
      this.home();
      return true;
    }
    return false;
  }

  /** Re-read the three slots from storage and rebuild the menu. */
  async refresh(): Promise<void> {
    this.slots = await this.ctx.game.store.list();
    this.loaded = true;
    this.buildMenu();
    if (this.games.visible) this.games.refresh();
  }

  relabel(): void {
    const { t } = this.ctx;
    this.h1.textContent = t('ui.title');
    this.tag.textContent = t('ui.menu.tagline');
    this.buildMenu();
    if (this.games.visible) this.headGames(this.games.current);
    this.creator.relabel();
    if (this.credits.visible) this.openCredits();
  }

  /* ------------------------------------------------------------------------------------------------ front page */

  private home(): void {
    this.games.show(false);
    this.creator.close();
    this.credits.hide();
    toggle(this.front, 'sm-hidden', false);
  }

  private buildMenu(): void {
    const { t } = this.ctx;
    clear(this.menu);
    const any = this.slots.some(Boolean);
    const btn = (label: string, fn: () => void, first = false) => {
      const b = h('button', { class: `sm-tbtn${first ? ' first' : ''}`, type: 'button' }, label);
      b.addEventListener('click', () => {
        if (this.busy) return;
        fn();
      });
      return b;
    };
    if (!this.loaded) return;
    if (any) {
      this.menu.append(
        btn(t('ui.menu.continue'), () => this.continueSlot(latestSlot(this.slots)), true),
        btn(t('ui.menu.load'), () => {
          uiSound(this.ctx, 'confirm');
          this.openGames('load');
        }),
        btn(t('ui.menu.new_game'), () => {
          uiSound(this.ctx, 'confirm');
          this.openGames('new');
        }));
    } else {
      this.menu.append(btn(t('ui.menu.new_game'), () => {
        uiSound(this.ctx, 'confirm');
        this.newSlot = 0;
        this.openCreator();
      }, true));
    }
    const row2 = h('div', { class: 'row2' },
      btn(t('ui.menu.import'), () => {
        uiSound(this.ctx, 'confirm');
        this.openGames('import');
      }));
    if (this.host.openSettings) {
      const open = this.host.openSettings;
      row2.append(btn(t('ui.menu.settings'), () => {
        uiSound(this.ctx, 'confirm');
        open();
      }));
    }
    row2.append(btn(t('ui.menu.credits'), () => {
      uiSound(this.ctx, 'confirm');
      this.openCredits();
    }));
    this.menu.append(row2);
  }

  private openCredits(): void {
    toggle(this.front, 'sm-hidden', true);
    this.games.show(false);
    this.credits.show([{ label: this.ctx.t('ui.menu.back_title'), icon: ICONS.back, run: () => this.home() }]);
  }

  /* ------------------------------------------------------------------------------------------------ journeys screen */

  private openGames(section: 'load' | 'new' | 'import'): void {
    toggle(this.front, 'sm-hidden', true);
    this.credits.hide();
    this.importErr = '';
    this.headGames(section);
    this.games.show(true);
    this.games.select(section);
  }

  private headGames(section: string): void {
    const { t } = this.ctx;
    const any = this.slots.some(Boolean);
    this.games.setTitle(t('ui.slots.title'), t('ui.slots.sub'));
    this.games.setNav([
      { id: 'load', icon: ICONS.continue, label: t('ui.menu.load'), disabled: !any },
      { id: 'new', icon: ICONS.seed, label: t('ui.menu.new_game') },
      { id: 'import', icon: ICONS.paste, label: t('ui.menu.import') },
    ]);
    if (section && this.games.visible) this.games.select(section);
  }

  private fill(id: string): void {
    const p = this.games.panel;
    if (id === 'load') this.slotList(p, 'load');
    else if (id === 'new') this.slotList(p, 'new');
    else if (id === 'import') this.importPanel(p);
  }

  /** One-line description of a save: zone · hour · playtime · bosses (· cycle). */
  private slotDesc(s: GameStateData): string {
    const { t } = this.ctx;
    const c = this.ctx.game.content;
    const zone = c.hasZone(s.zone) ? t(c.zone(s.zone).name_key) : '';
    const foes = c.bosses.filter((b) => s.defeated.includes(b.id)).length;
    return [zone, t(`ui.tod.${s.timeOfDay}`), fmtPlaytime(s.playtime), t('ui.slots.bosses', { n: foes, m: c.bosses.length })]
      .filter(Boolean).join(' · ');
  }

  private slotCard(i: number, s: GameStateData | null, onClick: (() => void) | null, acts: HTMLElement | null): HTMLElement {
    const { t } = this.ctx;
    const lang = this.ctx.game.settings.language;
    const when = s ? new Date(s.updated || s.created).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const name = s ? [s.character.name || t('ui.creator.name_default'), s.ngCycle > 0 ? t('ui.pause.cycle', { n: s.ngCycle }) : '', s.gameCompleted && s.ngCycle === 0 ? t('ui.slots.completed') : ''].filter(Boolean).join(' · ') : t('ui.slots.empty');
    // a div with role=button: the card may hold its own action buttons (no nested <button>)
    const el = h('div', { class: `sm-slot${s ? '' : ' empty'}${onClick ? ' tap' : ' dis'}`, role: onClick ? 'button' : null, tabindex: onClick ? 0 : null },
      h('span', { class: 'no' }, String(i + 1)),
      h('span', { class: 'tx' }, h('span', { class: 'n' }, name), h('span', { class: 'd' }, s ? this.slotDesc(s) : t('ui.slots.empty_d')), s ? h('span', { class: 'd w' }, t('ui.slots.updated', { d: when })) : null),
      acts);
    if (onClick) {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.acts')) return;
        onClick();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      });
    }
    return el;
  }

  private slotList(p: HTMLElement, mode: 'load' | 'new'): void {
    const { t } = this.ctx;
    p.append(h('div', { class: 'sm-p it' }, t(mode === 'load' ? 'ui.slots.load_hint' : 'ui.slots.new_hint')));
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = this.slots[i] ?? null;
      if (mode === 'load') {
        let acts: HTMLElement | null = null;
        if (s) {
          const del = h('button', { class: 'sm-iconbtn small', type: 'button', 'aria-label': t('ui.slots.delete') }, svgIcon(ICONS.close));
          del.addEventListener('click', () => this.deleteSlot(i));
          acts = h('span', { class: 'acts' }, del);
        }
        p.append(this.slotCard(i, s, s ? () => this.continueSlot(i) : null, acts));
      } else {
        p.append(this.slotCard(i, s, () => {
          if (!s) {
            uiSound(this.ctx, 'confirm');
            this.newSlot = i;
            this.openCreator();
            return;
          }
          void confirmDialog(this.ctx, this.games.el, t('ui.slots.overwrite_q'), t('ui.slots.overwrite_d', { n: i + 1 }), t('ui.slots.overwrite_yes'), t('ui.pause.cancel'), true).then((ok) => {
            if (!ok) return;
            this.newSlot = i;
            this.openCreator();
          });
        }, null));
      }
    }
  }

  private deleteSlot(i: number): void {
    const { t } = this.ctx;
    uiSound(this.ctx, 'move');
    void confirmDialog(this.ctx, this.games.el, t('ui.slots.delete_q'), t('ui.slots.delete_d', { n: i + 1 }), t('ui.slots.delete'), t('ui.pause.cancel'), true).then(async (ok) => {
      if (!ok) return;
      await this.ctx.game.store.remove(i);
      this.host.flash(t('ui.slots.deleted'));
      await this.refresh();
      if (!this.slots.some(Boolean)) this.openGames('new');
      else this.headGames('load');
    });
  }

  private continueSlot(i: number): void {
    if (i < 0 || this.busy) return;
    this.busy = true;
    uiSound(this.ctx, 'confirm');
    const game = this.ctx.game;
    this.host.startSession(async () => {
      const ok = await game.continueGame(i);
      if (!ok) {
        this.busy = false;
        this.host.flash(this.ctx.t('ui.slots.load_failed'));
        void this.refresh();
      }
    });
  }

  /* ------------------------------------------------------------------------------------------------ import */

  private importPanel(p: HTMLElement): void {
    const { t } = this.ctx;
    const ta = h('textarea', { class: 'sm-text', rows: 4, spellcheck: 'false', autocomplete: 'off', placeholder: t('ui.import.placeholder') }) as HTMLTextAreaElement;
    ta.value = this.importText;
    ta.addEventListener('input', () => {
      this.importText = ta.value;
    });
    const err = h('div', { class: 'sm-note err' }, this.importErr);
    toggle(err, 'sm-hidden', !this.importErr);
    const seg = h('div', { class: 'sm-seg' });
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = this.slots[i];
      const b = h('button', { class: i === this.importSlot ? 'sel' : '', type: 'button' }, `${i + 1}${s ? ' ·' : ''}`);
      b.title = s ? s.character.name : t('ui.slots.empty');
      b.addEventListener('click', () => {
        uiSound(this.ctx, 'move');
        this.importSlot = i;
        for (const c of Array.from(seg.children)) toggle(c, 'sel', c === b);
      });
      seg.appendChild(b);
    }
    const paste = async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (txt) {
          ta.value = txt;
          this.importText = txt;
          uiSound(this.ctx, 'move');
        }
      } catch {
        ta.focus();
      }
    };
    p.append(
      h('div', { class: 'sm-p it' }, t('ui.import.hint')),
      ta, err,
      h('div', { class: 'sm-row' }, h('div', { class: 'lab' }, t('ui.import.slot'), h('small', null, t('ui.import.slot_d'))), seg),
      h('div', { class: 'sm-pills' },
        pill(t('ui.import.paste'), () => void paste(), { icon: ICONS.paste }),
        pill(t('ui.import.go'), () => this.doImport(), { icon: ICONS.check, cls: 'gold' })));
  }

  private doImport(): void {
    const { t } = this.ctx;
    const code = this.importText.trim();
    try {
      if (!code) throw new Error('empty');
      importCode(code);
    } catch {
      uiSound(this.ctx, 'deny');
      this.importErr = t(code ? 'ui.import.bad' : 'ui.import.empty');
      this.games.refresh();
      return;
    }
    const slot = this.importSlot;
    const go = async () => {
      const game = this.ctx.game;
      game.importSave(code, slot);
      this.importText = '';
      this.importErr = '';
      uiSound(this.ctx, 'confirm');
      this.host.flash(t('ui.import.done', { n: slot + 1 }));
      // the store write is queued; give it a tick before listing
      await new Promise((r) => setTimeout(r, 60));
      await this.refresh();
      this.headGames('load');
    };
    if (this.slots[slot]) {
      void confirmDialog(this.ctx, this.games.el, t('ui.slots.overwrite_q'), t('ui.slots.overwrite_d', { n: slot + 1 }), t('ui.slots.overwrite_yes'), t('ui.pause.cancel'), true).then((ok) => {
        if (ok) void go();
      });
    } else void go();
  }

  /* ------------------------------------------------------------------------------------------------ creator */

  private openCreator(): void {
    toggle(this.front, 'sm-hidden', true);
    this.games.show(false);
    this.creator.open(defaultCharacter());
  }

  private begin(look: CharacterLook): void {
    if (this.busy) return;
    this.busy = true;
    const slot = this.newSlot;
    const game = this.ctx.game;
    this.host.startSession(() => game.newGame(slot, look));
  }
}
