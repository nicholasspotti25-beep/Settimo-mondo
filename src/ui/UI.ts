/**
 * The game UI (GameUI): one #sm-ui root over the canvas holding the HUD, touch controls, story layer, cards, menus and the
 * fade. Resolves the touch layout (settings.touchLayout ?? device preset ?? touch_default) against the viewport and the
 * safe-area insets, scales the HUD (--k), applies settings live (language, subtitles, reduce flashing, handedness...).
 */
import type { Game } from '../app/Game';
import type { GameMode, GameUI } from '../app/interfaces';
import type { Settings } from '../app/settings';
import type { SimEvent } from '../sim/types';
import type { TouchLayoutDef } from '../core/types';
import { injectStyle } from './style';
import { h, svgIcon, toggle } from './dom';
import { ICONS } from './icons';
import { clamp, normalizeLayout, pickPresetId, resolveLayout, type Rect, type ResolvedLayout } from './layout';
import { makeCtx, type UiCtx } from './ctx';
import { Hud } from './hud';
import { StoryLayer } from './story';
import { Cards } from './cards';
import { ControlsView } from './controls';
import { defaultCharacter } from '../sim/gamestate';

export class SettimoUI implements GameUI {
  private game!: Game;
  private ctx!: UiCtx;
  private root!: HTMLElement;
  private hud!: Hud;
  private story!: StoryLayer;
  private cards!: Cards;
  private controls!: ControlsView;
  private title!: HTMLElement;
  private fadeEl!: HTMLElement;
  private probe!: HTMLElement;
  private mounted = false;
  private mode: GameMode = 'boot';
  private layoutRes: ResolvedLayout | null = null;
  private touchOn = false;
  private lang = '';
  private fadeTimer = 0;
  private titleLabel: () => void = () => undefined;

  mount(root: HTMLElement, game: Game): void {
    this.game = game;
    this.ctx = makeCtx(game);
    injectStyle();
    this.root = h('div', { id: 'sm-ui' });
    this.probe = h('div', { style: 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)' });
    this.hud = new Hud(this.ctx);
    this.controls = new ControlsView(this.ctx);
    this.story = new StoryLayer(this.ctx);
    this.cards = new Cards(this.ctx);
    this.title = this.buildTitle();
    this.fadeEl = h('div', { class: 'sm-fade' });
    this.root.append(this.probe, this.hud.el, this.controls.el, this.cards.el, this.story.el, this.title, this.fadeEl);
    root.appendChild(this.root);
    this.mounted = true;

    this.touchOn = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !this.touchOn) {
        this.touchOn = true;
        this.relayout();
      }
    }, { capture: true, passive: true });
    window.addEventListener('resize', () => this.relayout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.relayout(), 250));
    window.addEventListener('blur', () => this.controls.touch.releaseAll());
    this.applySettings(game.settings);
  }

  /* ------------------------------------------------------------------------------------------------ layout */

  private safeArea(view: { w: number; h: number }): Rect {
    const cs = getComputedStyle(this.probe);
    const t = parseFloat(cs.paddingTop) || 0, r = parseFloat(cs.paddingRight) || 0;
    const b = parseFloat(cs.paddingBottom) || 0, l = parseFloat(cs.paddingLeft) || 0;
    return { x: l, y: t, w: Math.max(1, view.w - l - r), h: Math.max(1, view.h - t - b) };
  }

  private layoutDef(view: { w: number; h: number }): TouchLayoutDef {
    const all = this.game.content.bundle.touch_layouts;
    const base = all.touch_default ?? Object.values(all)[0];
    const s = this.game.settings;
    const def = s.touchLayout ?? all[pickPresetId(view.w, view.h)] ?? base;
    return normalizeLayout(def, base);
  }

  relayout(): void {
    if (!this.mounted) return;
    const view = { w: window.innerWidth, h: window.innerHeight };
    const safe = this.safeArea(view);
    const s = this.game.settings;
    const L = resolveLayout(this.layoutDef(view), view, safe, { mirror: s.leftHanded, large: s.largeButtons });
    this.layoutRes = L;
    const k = clamp(0.94 + (Math.min(view.w, view.h) - 390) * 0.0008, 0.92, 1.28);
    this.root.style.setProperty('--k', k.toFixed(3));
    this.hud.layout(L, this.touchOn);
    this.controls.layout(L);
  }

  /* ------------------------------------------------------------------------------------------------ title */

  private buildTitle(): HTMLElement {
    const g = this.ctx;
    const cont = h('button', { class: 'sm-tbtn first', type: 'button' });
    const fresh = h('button', { class: 'sm-tbtn', type: 'button' });
    cont.addEventListener('click', () => {
      this.game.audio?.playUi('confirm');
      void this.game.continueGame(this.game.slot).then((ok) => {
        if (!ok) void this.game.newGame(this.game.slot, defaultCharacter());
      });
    });
    fresh.addEventListener('click', () => {
      this.game.audio?.playUi('confirm');
      void this.game.newGame(this.game.slot, defaultCharacter());
    });
    const h1 = h('h1');
    const tag = h('div', { class: 'tag' });
    const el = h('div', { class: 'sm-title sm-hidden' },
      h('div', { class: 'hz' }),
      h('div', { class: 'logo' }, h('i', { class: 'seal' }, svgIcon(ICONS.seed)), h1, tag),
      h('div', { class: 'menu' }, cont, fresh),
      h('div', { class: 'ver' }, `v${g.game.content.bundle.version}`));
    const label = () => {
      h1.textContent = g.t('ui.title');
      tag.textContent = g.t('ui.menu.tagline');
      cont.textContent = g.t('ui.menu.continue');
      fresh.textContent = g.t('ui.menu.new_game');
    };
    label();
    this.titleLabel = label;
    return el;
  }

  /* ------------------------------------------------------------------------------------------------ GameUI */

  update(dt: number): void {
    if (!this.mounted) return;
    const game = this.game;
    const inGame = this.mode === 'game' || this.mode === 'ending';
    const sim = game.sim;
    const story = inGame && sim.seq.running;
    const hudOn = inGame && !story && !sim.altarOpen && !sim.endingActive;
    this.hud.update(dt, hudOn);
    const controlsOn = this.mode === 'game' && this.touchOn && hudOn && !sim.inputLocked && sim.player.alive;
    this.controls.grace = this.hud.graceLevel === 2;
    this.controls.update(dt, controlsOn);
    this.story.update(dt, inGame);
    this.cards.update(dt);
  }

  onEvent(e: SimEvent): void {
    if (!this.mounted) return;
    this.hud.onEvent(e);
    this.story.onEvent(e);
    this.cards.onEvent(e);
    this.controls.onEvent(e);
  }

  onMode(m: GameMode): void {
    this.mode = m;
    if (!this.mounted) return;
    toggle(this.title, 'sm-hidden', m !== 'title');
    if (m === 'game') {
      this.story.reset();
      this.cards.reset();
      this.relayout();
    }
    if (m === 'title') {
      this.story.reset();
      this.controls.touch.releaseAll();
    }
  }

  fade(kind: 'out' | 'in' | 'white_out' | 'white_in', dur: number): Promise<void> {
    if (!this.mounted) return Promise.resolve();
    const el = this.fadeEl;
    toggle(el, 'white', kind.startsWith('white'));
    el.style.transition = `opacity ${dur}s ease`;
    void el.offsetWidth;
    el.style.opacity = kind.endsWith('out') ? '1' : '0';
    clearTimeout(this.fadeTimer);
    return new Promise((r) => {
      this.fadeTimer = window.setTimeout(r, dur * 1000);
    });
  }

  paused(): boolean {
    return false;
  }

  applySettings(s: Settings): void {
    if (!this.mounted) return;
    toggle(this.root, 'subbg', s.subtitles.background);
    toggle(this.root, 'rflash', s.reduceFlashing);
    toggle(this.root, 'lowfx', s.quality === 'low');
    const sub = { s: 0.84, m: 1, l: 1.2, xl: 1.42 }[s.subtitles.size] ?? 1;
    this.root.style.setProperty('--sub', String(sub));
    document.documentElement.lang = s.language;
    if (s.language !== this.lang) {
      this.lang = s.language;
      this.hud.relabel();
      this.story.relabel();
      this.controls.relabel();
      this.titleLabel();
    }
    this.relayout();
  }

  setLoading(on: boolean): void {
    if (this.mounted) this.cards.setLoading(on);
  }

  /** Current resolved layout (debug / tests). */
  get layout(): ResolvedLayout | null {
    return this.layoutRes;
  }
}
