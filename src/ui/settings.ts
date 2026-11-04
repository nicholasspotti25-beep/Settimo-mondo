/**
 * Settings screen, reachable from the title and from the pause menu. Every change builds a new Settings object and goes
 * through game.applySettings (which persists it and pushes it to the renderer, input, audio, sim and UI). Sliders apply a
 * cheap live preview while dragging (volumes, camera) and commit on release, so the renderer is not reconfigured per
 * pixel. Sections: Generale (language, subtitles, FPS), Grafica (quality, frame rate), Audio, Controlli (camera, guard,
 * aim assist, input buffer, latency + tap test), Tocco (large buttons, left hand, fade, haptics, layout), Accessibilità
 * (shake, flashing, leniency), Salvataggio (export code in game / import from the title).
 */
import type { Settings } from '../app/settings';
import type { UiCtx } from './ctx';
import { h, setText, toggle } from './dom';
import { ICONS } from './icons';
import { DIALOG_CANCEL, MenuScreen, pill, rangeCtl, row, segCtl, toggleCtl, toggleRow, uiSound } from './screen';
import { BUFFER_MAX, BUFFER_MIN, LATENCY_MAX, estimateLatency, snap } from './calib';

export interface SettingsHost {
  /** Small transient confirmation pill. */
  flash(text: string): void;
  /** Settings closed (back to the title or the pause menu). */
  closed(): void;
  /** From the title: jump to the save-code import panel (null in game). */
  openImport: (() => void) | null;
  /** Open the touch layout editor (null when unavailable). */
  openLayoutEditor: (() => void) | null;
}

type Vol = keyof Settings['volume'];
const VOLS: Vol[] = ['master', 'music', 'sfx', 'voice', 'ambience'];

export class SettingsScreen {
  readonly screen: MenuScreen;
  private tapTest: { el: HTMLElement; raf: number } | null = null;

  constructor(private ctx: UiCtx, private host: SettingsHost) {
    this.screen = new MenuScreen(ctx, 'settings');
    this.screen.onBack = () => this.close();
    this.screen.onSelect = (id) => this.fill(id);
  }

  get visible(): boolean {
    return this.screen.visible;
  }

  private get s(): Settings {
    return this.ctx.game.settings;
  }

  open(section = 'general'): void {
    this.head();
    this.screen.show(true);
    this.screen.select(section);
  }

  close(): void {
    if (!this.visible) return;
    this.stopTapTest();
    this.screen.show(false);
    this.screen.panel.textContent = '';
    this.host.closed();
  }

  /** Re-fill the open section (after the layout editor closes). */
  refreshSection(): void {
    if (this.visible) this.screen.refresh();
  }

  relabel(): void {
    if (!this.visible) return;
    this.head();
    this.screen.refresh();
  }

  private head(): void {
    const { t } = this.ctx;
    this.screen.setTitle(t('ui.set.title'), t('ui.set.sub'));
    this.screen.setNav([
      { id: 'general', icon: ICONS.feather, label: t('ui.set.general') },
      { id: 'video', icon: ICONS.sun, label: t('ui.set.video') },
      { id: 'audio', icon: ICONS.lantern, label: t('ui.set.audio') },
      { id: 'controls', icon: ICONS.lock, label: t('ui.set.controls') },
      { id: 'touch', icon: ICONS.light, label: t('ui.set.touch') },
      { id: 'access', icon: ICONS.heart, label: t('ui.set.access') },
      { id: 'save', icon: ICONS.save, label: t('ui.set.save') },
    ]);
  }

  /** Apply a settings change (persisted by Game.applySettings). */
  private apply(patch: Partial<Settings>): void {
    this.ctx.game.applySettings({ ...this.s, ...patch });
  }

  private fill(id: string): void {
    this.stopTapTest();
    const p = this.screen.panel;
    switch (id) {
      case 'general': this.general(p); break;
      case 'video': this.video(p); break;
      case 'audio': this.audio(p); break;
      case 'controls': this.controls(p); break;
      case 'touch': this.touch(p); break;
      case 'access': this.access(p); break;
      case 'save': this.save(p); break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------------------------------------ helpers */

  /** Toggle row: the whole row is the touch target (the switch alone is small for a thumb). */
  private tog(label: string, sub: string, on: boolean, set: (v: boolean) => void): HTMLElement {
    return toggleRow(this.ctx, label, sub, on, set);
  }

  /** Slider row: `live` runs while dragging, `commit` on release. */
  private slider(label: string, sub: string, min: number, max: number, step: number, cur: number, fmt: (v: number) => string,
    commit: (v: number) => void, live?: (v: number) => void): HTMLElement {
    const r = rangeCtl(min, max, step, cur, fmt, (v) => live?.(snap(v, min, max, step)));
    r.el.addEventListener('change', () => commit(snap(parseFloat(r.el.value), min, max, step)));
    return row(label, sub, r.el, r.val);
  }

  private pct = (v: number) => `${Math.round(v * 100)}%`;
  private ms = (v: number) => `${Math.round(v * 1000)} ms`;

  /* ------------------------------------------------------------------------------------------------ sections */

  private general(p: HTMLElement): void {
    const { t } = this.ctx;
    const s = this.s;
    p.append(
      row(t('ui.set.language'), t('ui.set.language_d'), segCtl(this.ctx, [{ v: 'it', label: 'Italiano' }, { v: 'en', label: 'English' }], s.language, (v) => this.apply({ language: v }))),
      h('div', { class: 'sm-h3' }, t('ui.set.subtitles')),
      row(t('ui.set.sub_size'), '', segCtl(this.ctx, (['s', 'm', 'l', 'xl'] as const).map((v) => ({ v, label: v.toUpperCase() })), s.subtitles.size, (v) => {
        this.apply({ subtitles: { ...this.s.subtitles, size: v } });
        this.paintSubPreview();
      })),
      this.tog(t('ui.set.sub_bg'), t('ui.set.sub_bg_d'), s.subtitles.background, (v) => {
        this.apply({ subtitles: { ...this.s.subtitles, background: v } });
        this.paintSubPreview();
      }),
      h('div', { class: 'sm-subprev' }, h('span', null, t('ui.set.sub_sample'))),
      h('div', { class: 'sm-h3' }, t('ui.set.info')),
      this.tog(t('ui.set.fps_show'), t('ui.set.fps_show_d'), s.showFps, (v) => this.apply({ showFps: v })));
    this.paintSubPreview();
  }

  /** The sample subtitle line follows the size/background options. */
  private paintSubPreview(): void {
    const el = this.screen.panel.querySelector('.sm-subprev') as HTMLElement | null;
    if (!el) return;
    const sub = { s: 0.84, m: 1, l: 1.2, xl: 1.42 }[this.s.subtitles.size] ?? 1;
    el.style.setProperty('--sub', String(sub));
    toggle(el, 'bg', this.s.subtitles.background);
  }

  private video(p: HTMLElement): void {
    const { t } = this.ctx;
    const s = this.s;
    const r = this.ctx.game.renderer;
    const autoNote = h('div', { class: 'sm-note' }, s.quality === 'auto' ? t('ui.set.quality_auto', { q: t(`ui.set.q_${r.quality}`) }) : '');
    p.append(
      row(t('ui.set.quality'), t('ui.set.quality_d'), segCtl(this.ctx, (['low', 'medium', 'high', 'auto'] as const).map((v) => ({ v, label: t(`ui.set.q_${v}`) })), s.quality, (v) => {
        this.apply({ quality: v });
        setText(autoNote, v === 'auto' ? t('ui.set.quality_auto', { q: t(`ui.set.q_${r.quality}`) }) : '');
      })),
      autoNote,
      row(t('ui.set.fps'), t('ui.set.fps_d'), segCtl(this.ctx, [{ v: 30, label: '30' }, { v: 60, label: '60' }], s.fps, (v) => this.apply({ fps: v }))));
  }

  private audio(p: HTMLElement): void {
    const { t } = this.ctx;
    const game = this.ctx.game;
    for (const k of VOLS) {
      p.append(this.slider(t(`ui.set.vol_${k}`), '', 0, 1, 0.05, this.s.volume[k], this.pct,
        (v) => {
          this.apply({ volume: { ...this.s.volume, [k]: v } });
          uiSound(this.ctx, 'move');
        },
        (v) => game.audio?.setVolumes({ ...this.s.volume, [k]: v })));
    }
  }

  private controls(p: HTMLElement): void {
    const { t } = this.ctx;
    const s = this.s;
    const rig = this.ctx.game.renderer.rig;
    p.append(
      h('div', { class: 'sm-h3' }, t('ui.set.camera')),
      this.slider(t('ui.set.cam_sens'), '', 0.3, 2.5, 0.05, s.cameraSensitivity, (v) => `${v.toFixed(2)}×`, (v) => this.apply({ cameraSensitivity: v }), (v) => {
        rig.sensitivity = v;
      }),
      this.tog(t('ui.set.invert_y'), '', s.invertY, (v) => this.apply({ invertY: v })),
      h('div', { class: 'sm-h3' }, t('ui.set.combat')),
      this.tog(t('ui.set.toggle_guard'), t('ui.set.toggle_guard_d'), s.toggleGuard, (v) => this.apply({ toggleGuard: v })),
      this.tog(t('ui.set.aim_assist'), t('ui.set.aim_assist_d'), s.aimAssist, (v) => this.apply({ aimAssist: v })),
      this.slider(t('ui.set.buffer'), t('ui.set.buffer_d'), BUFFER_MIN, BUFFER_MAX, 0.01, Math.max(BUFFER_MIN, Math.min(BUFFER_MAX, s.inputBuffer)), this.ms, (v) => this.apply({ inputBuffer: v })));
    const lat = this.slider(t('ui.set.latency'), t('ui.set.latency_d'), 0, LATENCY_MAX, 0.005, s.latencyComp, this.ms, (v) => this.apply({ latencyComp: v, latencyAuto: false }));
    p.append(lat, h('div', { class: 'sm-pills' }, pill(t('ui.set.tap_test'), () => this.startTapTest(), { icon: ICONS.examine })));
  }

  private touch(p: HTMLElement): void {
    const { t } = this.ctx;
    const s = this.s;
    p.append(
      this.tog(t('ui.set.large'), t('ui.set.large_d'), s.largeButtons, (v) => this.apply({ largeButtons: v })),
      this.tog(t('ui.set.left'), t('ui.set.left_d'), s.leftHanded, (v) => this.apply({ leftHanded: v })),
      this.tog(t('ui.set.fade'), t('ui.set.fade_d'), s.controlsFade, (v) => this.apply({ controlsFade: v })),
      h('div', { class: 'sm-h3' }, t('ui.set.haptics')),
      this.tog(t('ui.set.haptics_on'), t('ui.set.haptics_d'), s.haptics, (v) => {
        this.apply({ haptics: v });
        if (v) this.ctx.game.platform.haptic('light');
      }),
      this.slider(t('ui.set.haptics_str'), '', 0.25, 1.5, 0.05, s.hapticStrength, this.pct, (v) => {
        this.apply({ hapticStrength: v });
        this.ctx.game.platform.haptic('light');
      }),
      h('div', { class: 'sm-h3' }, t('ui.set.layout')),
      h('div', { class: 'sm-p it' }, t(s.touchLayout ? 'ui.set.layout_custom' : 'ui.set.layout_preset')));
    const pills = h('div', { class: 'sm-pills' });
    if (this.host.openLayoutEditor) {
      const open = this.host.openLayoutEditor;
      pills.append(pill(t('ui.set.layout_edit'), () => {
        uiSound(this.ctx, 'confirm');
        open();
      }, { icon: ICONS.collection, cls: 'gold' }));
    }
    pills.append(pill(t('ui.set.layout_reset'), () => {
      uiSound(this.ctx, 'confirm');
      this.apply({ touchLayout: null });
      this.host.flash(t('ui.set.layout_reset_done'));
      this.screen.refresh();
    }, { icon: ICONS.back, disabled: !s.touchLayout }));
    p.append(pills);
  }

  private access(p: HTMLElement): void {
    const { t } = this.ctx;
    const s = this.s;
    p.append(
      this.tog(t('ui.set.shake'), t('ui.set.shake_d'), s.reduceShake, (v) => this.apply({ reduceShake: v })),
      this.tog(t('ui.set.flash'), t('ui.set.flash_d'), s.reduceFlashing, (v) => this.apply({ reduceFlashing: v })),
      h('div', { class: 'sm-h3' }, t('ui.set.leniency')),
      h('div', { class: 'sm-p it' }, t('ui.set.leniency_note')),
      this.tog(t('ui.set.lenient'), t('ui.set.lenient_d'), s.lenientWindows, (v) => this.apply({ lenientWindows: v })));
  }

  private save(p: HTMLElement): void {
    const { t } = this.ctx;
    const game = this.ctx.game;
    const inGame = game.mode === 'game' || game.mode === 'ending';
    if (inGame) {
      const code = game.exportSave();
      const ta = h('textarea', { class: 'sm-text', readonly: true, rows: 4, spellcheck: 'false' }) as HTMLTextAreaElement;
      ta.value = code;
      p.append(h('div', { class: 'sm-p it' }, t('ui.pause.save_hint')), ta, h('div', { class: 'sm-pills' },
        pill(t('ui.pause.copy'), () => {
          void navigator.clipboard.writeText(code).then(() => {
            uiSound(this.ctx, 'confirm');
            this.host.flash(t('ui.pause.copied'));
          }, () => {
            ta.focus();
            ta.select();
          });
        }, { icon: ICONS.copy, cls: 'gold' }),
        pill(t('ui.pause.save_now'), () => {
          uiSound(this.ctx, 'confirm');
          void game.saveNow('manual').then(() => this.host.flash(t('ui.pause.saved')));
        }, { icon: ICONS.save })));
    } else {
      p.append(h('div', { class: 'sm-p it' }, t('ui.set.save_title')));
    }
    p.append(h('div', { class: 'sm-h3' }, t('ui.menu.import')), h('div', { class: 'sm-p it' }, t(inGame ? 'ui.set.import_game' : 'ui.import.hint')));
    if (!inGame && this.host.openImport) {
      const go = this.host.openImport;
      p.append(h('div', { class: 'sm-pills' }, pill(t('ui.menu.import'), () => {
        uiSound(this.ctx, 'confirm');
        this.screen.show(false);
        this.host.closed();
        go();
      }, { icon: ICONS.paste })));
    }
  }

  /* ------------------------------------------------------------------------------------------------ latency tap test */

  private startTapTest(): void {
    const { t } = this.ctx;
    this.stopTapTest();
    const period = 0.75;
    const beats = 10;
    const ring = h('div', { class: 'ring' });
    const info = h('div', { class: 'sm-p it' }, t('ui.set.tap_go'));
    const count = h('div', { class: 'cnt' }, '');
    const box = h('div', { class: 'box' }, h('div', { class: 'sm-h2' }, t('ui.set.tap_test')), info, h('div', { class: 'pad' }, ring, count));
    const el = h('div', { class: 'sm-dialog sm-taptest' }, box);
    const taps: number[] = [];
    const t0 = performance.now() / 1000 + 1.2;
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.sm-pill')) return;
      taps.push(e.timeStamp / 1000);
      ring.classList.remove('hit');
      void ring.offsetWidth;
      ring.classList.add('hit');
    });
    el.addEventListener(DIALOG_CANCEL, () => this.stopTapTest());
    this.screen.el.appendChild(el);
    let last = -1;
    const finish = () => {
      const est = estimateLatency(taps, t0, period);
      ring.classList.add('done');
      const pills = h('div', { class: 'sm-pills' });
      if (est === null) {
        setText(info, t('ui.set.tap_fail'));
        pills.append(pill(t('ui.pause.cancel'), () => this.stopTapTest()), pill(t('ui.set.tap_again'), () => this.startTapTest(), { cls: 'gold' }));
      } else {
        setText(info, t('ui.set.tap_result', { ms: Math.round(est * 1000) }));
        pills.append(pill(t('ui.pause.cancel'), () => this.stopTapTest()), pill(t('ui.set.tap_use'), () => {
          this.apply({ latencyComp: est, latencyAuto: true });
          uiSound(this.ctx, 'confirm');
          this.stopTapTest();
          this.screen.refresh();
        }, { cls: 'gold' }));
      }
      box.appendChild(pills);
    };
    const tick = () => {
      const now = performance.now() / 1000;
      const k = Math.floor((now - t0) / period);
      if (k >= beats) {
        if (this.tapTest) this.tapTest.raf = 0;
        finish();
        return;
      }
      const phase = now < t0 ? 1 : ((now - t0) / period) % 1;
      ring.style.setProperty('--ph', phase.toFixed(3));
      if (k !== last && k >= 0) {
        last = k;
        setText(count, `${beats - k}`);
        uiSound(this.ctx, 'move');
        ring.classList.remove('beat');
        void ring.offsetWidth;
        ring.classList.add('beat');
      }
      if (this.tapTest) this.tapTest.raf = requestAnimationFrame(tick);
    };
    this.tapTest = { el, raf: requestAnimationFrame(tick) };
  }

  private stopTapTest(): void {
    if (!this.tapTest) return;
    if (this.tapTest.raf) cancelAnimationFrame(this.tapTest.raf);
    this.tapTest.el.remove();
    this.tapTest = null;
  }
}
