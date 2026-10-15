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
import { AltarMenu } from './altar';
import { TitleScreen } from './title';

export class SettimoUI implements GameUI {
  private game!: Game;
  private ctx!: UiCtx;
  private root!: HTMLElement;
  private hud!: Hud;
  private story!: StoryLayer;
  private cards!: Cards;
  private controls!: ControlsView;
  private altar!: AltarMenu;
  private loading = false;
  private pendingFadeIn = false;
  private transitioning = false;
  private pauseBtn!: HTMLElement;
  private flashEl: HTMLElement | null = null;
  private flashTimer = 0;
  private title!: TitleScreen;
  private fadeEl!: HTMLElement;
  private probe!: HTMLElement;
  private mounted = false;
  private mode: GameMode = 'boot';
  private layoutRes: ResolvedLayout | null = null;
  private touchOn = false;
  private lang = '';
  private fadeTimer = 0;
  private fadeDone: (() => void) | null = null;

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
    this.altar = new AltarMenu(this.ctx, { transition: (fn) => this.transition(fn), flash: (t) => this.flash(t) });
    this.pauseBtn = h('button', { class: 'sm-topbtn sm-pausebtn sm-hidden', type: 'button' }, svgIcon(ICONS.pause));
    this.pauseBtn.addEventListener('click', () => this.openPause());
    this.title = new TitleScreen(this.ctx, { startSession: (run) => this.startSession(run), flash: (t) => this.flash(t), openSettings: null });
    this.fadeEl = h('div', { class: 'sm-fade' });
    this.root.append(this.probe, this.hud.el, this.controls.el, this.cards.el, this.pauseBtn, this.altar.screen.el, this.story.el, this.title.el, this.fadeEl);
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
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (this.root.querySelector('.sm-dialog')) return;
      if (this.mode === 'title') {
        if (!this.transitioning) this.title.back();
        return;
      }
      if (this.altar.isOpen) {
        if (!this.transitioning) this.altar.leave();
      } else this.openPause();
    });
    // pause overlay after the app comes back from the background (the Game already freezes the sim while hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.openPause();
    });
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
    toggle(this.pauseBtn, 'mir', s.leftHanded);
    this.controls.layout(L);
  }

  /* ------------------------------------------------------------------------------------------------ pause */

  /** Open the pause menu when the game is actually playable (not in title, altar, ending or a transition). */
  private openPause(): void {
    const sim = this.game.sim;
    if (this.mode !== 'game' || this.altar.isOpen || this.transitioning || sim.endingActive) return;
    this.controls.touch.releaseAll();
    this.game.input.clear();
    this.game.audio?.playUi('confirm');
    this.altar.openPause();
  }

  /** Small transient confirmation pill (copy, save). */
  private flash(text: string): void {
    this.flashEl?.remove();
    const el = h('div', { class: 'sm-toastmini' }, text);
    this.flashEl = el;
    this.root.appendChild(el);
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => el.remove(), 1800);
  }

  /* ------------------------------------------------------------------------------------------------ transitions */

  /** Fade out, run a world-changing action (meditation, fast travel, memory fight), fade back in once streaming ends. */
  private transition(fn: () => void): void {
    if (this.transitioning) return;
    this.transitioning = true;
    void this.fade('out', 0.38).then(() => {
      try {
        fn();
      } finally {
        this.pendingFadeIn = true;
      }
    });
  }

  /** Start or resume a session from the title: fade out, run it, fade in once the zone is built and streaming ends. */
  private startSession(run: () => Promise<unknown>): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.controls.touch.releaseAll();
    void this.fade('out', 0.45).then(async () => {
      try {
        await run();
      } finally {
        this.pendingFadeIn = true;
      }
    });
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
    this.altar.update(inGame && !story && !sim.endingActive ? sim.altarOpen : null);
    toggle(this.root, 'inmenu', this.altar.isOpen);
    toggle(this.pauseBtn, 'sm-hidden', !(this.mode === 'game' && hudOn && !this.altar.isOpen && sim.player.alive));
    if (this.pendingFadeIn && !this.loading && !game.renderer.world.busy) {
      this.pendingFadeIn = false;
      void this.fade('in', 0.7).then(() => {
        this.transitioning = false;
      });
    }
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
    if ((m === 'title') !== this.title.visible) this.title.show(m === 'title');
    if (m === 'game') {
      this.story.reset();
      this.cards.reset();
      this.altar.reset();
      this.relayout();
    }
    if (m === 'title') {
      this.story.reset();
      this.altar.reset();
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
    this.fadeDone?.();
    return new Promise((r) => {
      this.fadeDone = r;
      this.fadeTimer = window.setTimeout(() => {
        this.fadeDone = null;
        r();
      }, dur * 1000);
    });
  }

  paused(): boolean {
    return this.mounted && this.altar.paused;
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
      this.altar.relabel();
      this.title.relabel();
    }
    this.relayout();
  }

  setLoading(on: boolean): void {
    this.loading = on;
    if (this.mounted) this.cards.setLoading(on);
  }

  /** Current resolved layout (debug / tests). */
  get layout(): ResolvedLayout | null {
    return this.layoutRes;
  }
}
