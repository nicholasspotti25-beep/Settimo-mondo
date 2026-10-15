/**
 * Touch controls view: draws the E7 buttons, the floating stick and the contextual interact button from the resolved layout,
 * and reflects live state (pressed, Arts lit only with enough Eco, Lacrime count, weapon glyphs on slot_1..3 with the active
 * slot and the Transizione flash, guard held, lock active, Colpo di Grazia glow). Input itself is src/input/touch.ts.
 * Semi-transparent with active / idle opacity; fades when idle (settings.controlsFade); per-control opacity from the editor.
 */
import type { SimEvent } from '../sim/types';
import { TouchController } from '../input/touch';
import { h, svgIcon, setText, toggle, StyleCache } from './dom';
import { ICONS, promptIcon, weaponGlyph } from './icons';
import { controlsOpacity, type ResolvedButton, type ResolvedLayout } from './layout';
import { replay, type UiCtx } from './ctx';

interface BtnView {
  b: ResolvedButton;
  el: HTMLElement;
  css: StyleCache;
  glyph: string | null;
  cnt: HTMLElement | null;
  pips: HTMLElement | null;
  pipN: number;
  lbl: HTMLElement | null;
}

const ICON_FOR: Record<string, string> = {
  light: ICONS.light, heavy: ICONS.heavy, dodge: ICONS.dodge, guard: ICONS.guard, jump: ICONS.jump,
  art_prima: ICONS.art_prima, art_seconda: ICONS.art_seconda, lacrime: ICONS.lacrime, lock: ICONS.lock,
};

export class ControlsView {
  readonly el: HTMLElement;
  readonly touch: TouchController;
  private ctrls: HTMLElement;
  private ctrlsCss: StyleCache;
  private views = new Map<string, BtnView>();
  private stick: HTMLElement;
  private stickCss: StyleCache;
  private knobCss: StyleCache;
  private sprintCss: StyleCache;
  private L: ResolvedLayout | null = null;
  private shown = false;
  private promptKey = '';
  /** Colpo di Grazia available (from the HUD) -> light button glow. */
  grace = false;

  constructor(private readonly ctx: UiCtx) {
    const knob = h('div', { class: 'knob' });
    const sprint = h('div', { class: 'sprint' });
    this.stick = h('div', { class: 'sm-stick' }, h('div', { class: 'base' }), sprint, knob);
    this.stickCss = new StyleCache(this.stick);
    this.knobCss = new StyleCache(knob);
    this.sprintCss = new StyleCache(sprint);
    this.ctrls = h('div', { class: 'sm-ctrls' }, this.stick);
    this.ctrlsCss = new StyleCache(this.ctrls);
    this.el = h('div', { class: 'sm-layer sm-touch' }, this.ctrls);
    const game = ctx.game;
    this.touch = new TouchController(this.el, game.input, {
      layout: () => (this.shown ? this.L : null),
      accepts: (b) => this.accepts(b),
      pickLockAt: (x, y) => this.pickLockAt(x, y),
      hasLock: () => !!game.sim.player.lock,
      tick: () => game.platform.haptic('light'),
    });
    game.input.sources.push(this.touch);
  }

  /** Rebuild the buttons for a new layout (resize, settings, editor). */
  layout(L: ResolvedLayout): void {
    this.L = L;
    for (const v of this.views.values()) v.el.remove();
    this.views.clear();
    for (const b of L.buttons) {
      if (b.anchor) {
        // the Metamondo button is the HUD ring itself: hit-tested by the layout math, drawn by the HUD
        this.views.set(b.id, { b, el: h('div', { class: 'sm-hidden' }), css: new StyleCache(h('div')), glyph: null, cnt: null, pips: null, pipN: 0, lbl: null });
        continue;
      }
      const cls = b.id.startsWith('slot_') ? 'slot' : b.id.startsWith('art_') ? 'art' : '';
      const el = h('div', { class: `sm-b ${b.id} ${cls}`, 'aria-label': this.ctx.t(b.id.startsWith('slot_') ? 'ui.touch.slot' : `ui.touch.${b.id}`, { n: b.id.slice(5) }) });
      const css = new StyleCache(el);
      css.set('left', `${b.cx}px`);
      css.set('top', `${b.cy}px`);
      css.set('width', `${b.r * 2}px`);
      css.set('height', `${b.r * 2}px`);
      if (ICON_FOR[b.id]) el.appendChild(svgIcon(ICON_FOR[b.id]));
      let cnt: HTMLElement | null = null;
      let pips: HTMLElement | null = null;
      let lbl: HTMLElement | null = null;
      if (b.id === 'lacrime') {
        cnt = h('div', { class: 'cnt' });
        el.appendChild(cnt);
      }
      if (cls === 'art') {
        pips = h('div', { class: 'pips' });
        el.appendChild(pips);
      }
      if (cls === 'slot') el.appendChild(h('div', { class: 'num' }, b.id.slice(5)));
      if (b.id === 'interact') {
        lbl = h('div', { class: 'lbl' });
        el.appendChild(lbl);
      }
      this.ctrls.appendChild(el);
      this.views.set(b.id, { b, el, css, glyph: null, cnt, pips, pipN: -1, lbl });
    }
    const r = L.stick.radius;
    this.stickCss.set('width', `${r * 2}px`);
    this.stickCss.set('height', `${r * 2}px`);
    const sp = L.stick.sprint * 2;
    this.sprintCss.set('width', `${sp}px`);
    this.sprintCss.set('height', `${sp}px`);
    this.sprintCss.set('left', `${r - L.stick.sprint}px`);
    this.sprintCss.set('top', `${r - L.stick.sprint}px`);
    const k = Math.max(28, r * 0.84);
    this.knobCss.set('width', `${k}px`);
    this.knobCss.set('height', `${k}px`);
    this.promptKey = '\u0000';
  }

  /** Whether the controls are on screen this frame (game running, no sequence / menu). */
  private visible(id: string): boolean {
    const sim = this.ctx.game.sim;
    if (id === 'interact') return !!sim.prompt && !sim.altarOpen;
    if (id === 'metamondo') return sim.meta.ready && !!sim.fight?.active && !sim.challenges.noMetamondo;
    return true;
  }

  private accepts(b: ResolvedButton): boolean {
    return this.visible(b.id);
  }

  /** Double tap: lock the enemy lock point nearest to the finger on screen. */
  private pickLockAt(x: number, y: number): boolean {
    const game = this.ctx.game;
    const sim = game.sim;
    const cam = game.renderer.rig.camera;
    const L = this.L;
    if (!L) return false;
    const reach = Math.max(60, L.unit * 0.16);
    let best: { actor: number; part: number } | null = null;
    let bestD = reach;
    const v = this.tmp;
    const test = (actor: number, part: number) => {
      if (!sim.lockPointPos(actor, part, this.tmpP)) return;
      v.set(this.tmpP.x, this.tmpP.y, this.tmpP.z).project(cam);
      if (v.z > 1 || v.z < -1) return;
      const sx = (v.x * 0.5 + 0.5) * L.view.w;
      const sy = (0.5 - v.y * 0.5) * L.view.h;
      const d = Math.hypot(sx - x, sy - y) - (part >= 0 ? 0 : 8);
      if (d < bestD) {
        bestD = d;
        best = { actor, part };
      }
    };
    for (const a of sim.actors) {
      if (a.team !== 'enemy' || !a.alive || a.untargetable || a.hidden) continue;
      let lockable = 0;
      for (const p of a.parts) {
        if (!p.def.lockable || !p.active || p.broken) continue;
        lockable++;
        test(a.id, p.index);
      }
      if (!lockable || !a.flags.has('parts_only')) test(a.id, -1);
    }
    if (!best) return false;
    const pick = best as { actor: number; part: number };
    game.input.pickLock(pick.actor, pick.part);
    return true;
  }

  private tmp = new ProjVec();
  private tmpP = { x: 0, y: 0, z: 0 };

  onEvent(e: SimEvent): void {
    if (e.type === 'transizione' || e.type === 'weaponSwap') {
      const slot = e.type === 'weaponSwap' ? e.slot : this.ctx.game.sim.player.activeSlot;
      const v = this.views.get(`slot_${slot + 1}`);
      if (v && e.type === 'transizione') replay(v.el, 'flash');
    }
  }

  update(_dt: number, show: boolean): void {
    const L = this.L;
    const game = this.ctx.game;
    if (show !== this.shown) {
      this.shown = show;
      this.touch.enabled = show;
      if (!show) this.touch.releaseAll();
      toggle(this.el, 'on', show);
      toggle(this.ctrls, 'gone', !show);
    }
    if (!show || !L) return;
    const sim = game.sim;
    const p = sim.player;
    const now = performance.now();
    const idle = this.touch.touches > 0 ? 0 : (now - game.input.lastActivity) / 1000;
    this.ctrlsCss.set('opacity', controlsOpacity(idle, L.opacity, game.settings.controlsFade).toFixed(3));

    for (const v of this.views.values()) {
      const id = v.b.id;
      if (v.b.anchor) continue;
      const vis = this.visible(id);
      toggle(v.el, 'sm-hidden', !vis);
      if (!vis) continue;
      toggle(v.el, 'on', this.touch.down.has(id));
      if (v.b.alpha < 1) v.css.set('opacity', v.b.alpha.toFixed(2));
      if (id.startsWith('slot_')) {
        const i = Number(id.slice(5)) - 1;
        const w = p.weapons[i] ?? null;
        const def = w && game.content.hasWeapon(w) ? game.content.weapon(w) : null;
        const glyph = def ? def.type : '';
        if (glyph !== v.glyph) {
          v.glyph = glyph;
          v.el.querySelector('svg')?.remove();
          v.el.insertBefore(svgIcon(glyph ? weaponGlyph(glyph) : ICONS.armory), v.el.firstChild);
        }
        toggle(v.el, 'cur', i === p.activeSlot);
        toggle(v.el, 'empty', !def);
      } else if (id === 'art_prima' || id === 'art_seconda') {
        const w = p.weapon(sim);
        const art = w ? (id === 'art_prima' ? w.arts.prima : w.arts.seconda) : null;
        const cost = art ? art.eco_cost : 0;
        toggle(v.el, 'lit', !!art && p.eco >= cost);
        const n = Math.max(0, Math.round(cost / 100));
        if (n !== v.pipN && v.pips) {
          v.pipN = n;
          v.pips.textContent = '';
          for (let k = 0; k < n; k++) v.pips.appendChild(h('i'));
        }
      } else if (id === 'lacrime' && v.cnt) {
        setText(v.cnt, String(p.lacrime));
        toggle(v.el, 'off', p.lacrime <= 0 || sim.challenges.noLacrime);
      } else if (id === 'guard') {
        toggle(v.el, 'held', p.state === 'guard' || game.input.held.has('guard'));
      } else if (id === 'lock') {
        toggle(v.el, 'act', !!p.lock);
      } else if (id === 'light') {
        toggle(v.el, 'grace', this.grace);
      } else if (id === 'interact' && v.lbl) {
        const key = sim.prompt?.promptKey ?? '';
        if (key !== this.promptKey) {
          this.promptKey = key;
          v.el.querySelector('svg')?.remove();
          v.el.insertBefore(svgIcon(promptIcon(key)), v.el.firstChild);
          setText(v.lbl, key ? this.ctx.t(key) : '');
        }
      }
    }

    // stick: live under the thumb, or a faint ghost at its home position
    const st = this.touch.stick;
    if (st.active) {
      this.stickCss.set('left', `${st.baseX}px`);
      this.stickCss.set('top', `${st.baseY}px`);
      this.knobCss.set('transform', `translate(calc(-50% + ${(st.knobX - st.baseX).toFixed(1)}px), calc(-50% + ${(st.knobY - st.baseY).toFixed(1)}px))`);
    } else {
      this.stickCss.set('left', `${L.stick.home.x}px`);
      this.stickCss.set('top', `${L.stick.home.y}px`);
      this.knobCss.set('transform', 'translate(-50%,-50%)');
    }
    toggle(this.stick, 'ghost', !st.active);
    toggle(this.stick, 'sprinting', st.active && st.sprint);
  }

  /** Language changed. */
  relabel(): void {
    this.promptKey = '\u0000';
    if (this.L) this.layout(this.L);
  }
}

/** Minimal projection vector (avoids importing three into the UI just for Vector3). */
class ProjVec {
  x = 0;
  y = 0;
  z = 0;
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  project(cam: { matrixWorldInverse: { elements: ArrayLike<number> }; projectionMatrix: { elements: ArrayLike<number> } }): this {
    this.apply(cam.matrixWorldInverse.elements);
    this.apply(cam.projectionMatrix.elements, true);
    return this;
  }
  private apply(e: ArrayLike<number>, persp = false): void {
    const x = this.x, y = this.y, z = this.z;
    const w = persp ? 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]) : 1;
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  }
}
