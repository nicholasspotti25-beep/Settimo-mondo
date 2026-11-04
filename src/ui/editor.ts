/**
 * Touch layout editor (Settings > Tocco > Modifica disposizione). Works on a copy of the active layout
 * (settings.touchLayout ?? the device preset): drag any control with one finger, tap it to adjust its size and opacity,
 * switch between the small-phone / standard / tablet presets, mirror for the left hand, reset to the device preset. Save
 * writes settings.touchLayout (null when the device preset is kept untouched) and settings.leftHanded through
 * game.applySettings; cancel discards. The control panel docks on the half of the screen with fewer controls, so every
 * control stays reachable, and fades while a control is being dragged. Overlapping controls are outlined in red.
 * Positions go through the same pure math as the game (resolveLayout / toFraction), so what you place is what you get.
 */
import type { TouchLayoutDef } from '../core/types';
import type { UiCtx } from './ctx';
import { h, setText, svgIcon, toggle } from './dom';
import { ICONS, weaponGlyph } from './icons';
import { ICON_FOR } from './controls';
import {
  circlesOverlap, clamp, hitButton, normalizeLayout, pickPresetId, resolveLayout, round3, toFraction,
  type Circle, type ExtButtonDef, type PresetId, type Rect, type ResolvedButton, type ResolvedLayout,
} from './layout';
import { confirmDialog, pill, rangeCtl, uiSound } from './screen';

export interface EditorHost {
  /** Current viewport and safe area (px). */
  geometry(): { view: { w: number; h: number }; safe: Rect };
  /** Small transient confirmation pill. */
  flash(text: string): void;
  /** The editor closed (saved or not). */
  closed(): void;
}

export const SIZE_MIN = 0.06;
export const SIZE_MAX = 0.18;
const PRESETS: { id: PresetId; key: string }[] = [
  { id: 'touch_small_phone', key: 'ui.editor.preset_small' },
  { id: 'touch_default', key: 'ui.editor.preset_std' },
  { id: 'touch_tablet', key: 'ui.editor.preset_tablet' },
];

/** Does an axis-aligned rect come within pad px of a circle? Pure. */
export function rectHitsCircle(x: number, y: number, w: number, hgt: number, c: Circle, pad = 0): boolean {
  const px = clamp(c.cx, x, x + w), py = clamp(c.cy, y, y + hgt);
  return Math.hypot(c.cx - px, c.cy - py) < c.r + pad;
}

/**
 * Where the control panel goes: of the spots (left / right / center) x (middle / bottom / top) inside the safe area, the
 * first one whose rect touches the fewest controls, so no control is hidden under it. Pure.
 */
export function panelSpot(circles: readonly Circle[], safe: Rect, pw: number, ph: number, margin = 10): { x: number; y: number } {
  const xs = [safe.x + margin, safe.x + safe.w - pw - margin, safe.x + (safe.w - pw) / 2];
  // preferred heights first (middle, bottom, top), then every 12 px in between
  const ys: number[] = ph + margin * 2 >= safe.h ? [safe.y + margin] : [safe.y + (safe.h - ph) / 2, safe.y + safe.h - ph - margin, safe.y + margin];
  for (let y = safe.y + margin + 12; y < safe.y + safe.h - ph - margin; y += 12) ys.push(y);
  let best = { x: xs[0], y: ys[0] };
  let bestN = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      let n = 0;
      for (const c of circles) if (rectHitsCircle(x, y, pw, ph, c, 6)) n++;
      if (n < bestN) {
        bestN = n;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Ids of the controls that overlap another control or the HUD ring (pad px of clearance). Pure. */
export function overlapping(L: ResolvedLayout, pad = 2): Set<string> {
  const out = new Set<string>();
  const bs = L.buttons.filter((b) => !b.anchor);
  for (let i = 0; i < bs.length; i++) {
    if (circlesOverlap(bs[i], L.ring, pad)) out.add(bs[i].id);
    for (let j = i + 1; j < bs.length; j++) {
      if (circlesOverlap(bs[i], bs[j], pad)) {
        out.add(bs[i].id);
        out.add(bs[j].id);
      }
    }
  }
  return out;
}

export class LayoutEditor {
  readonly el: HTMLElement;
  private def!: TouchLayoutDef;
  private mirror = false;
  /** True while the layout is the untouched device preset (saved as null, so it keeps following the device). */
  private pristine = true;
  private L: ResolvedLayout | null = null;
  private sel: string | null = null;
  private drag: { id: string; pointer: number; dx: number; dy: number } | null = null;
  private views = new Map<string, HTMLElement>();
  private stage: HTMLElement;
  private zoneStick: HTMLElement;
  private zoneCam: HTMLElement;
  private ring: HTMLElement;
  private pnl: HTMLElement;
  private presetSeg: HTMLElement;
  private mirrorBtn: HTMLElement;
  private insp: HTMLElement;
  private warn: HTMLElement;
  private ttl: HTMLElement = h('div');
  private globals: HTMLElement = h('div');
  private hintEl: HTMLElement = h('div');
  /** The how-to line is shown until the first control is selected. */
  private hinted = false;

  constructor(private readonly ctx: UiCtx, private readonly host: EditorHost) {
    this.zoneStick = h('div', { class: 'zone' });
    this.zoneCam = h('div', { class: 'zone' });
    this.ring = h('div', { class: 'ringg' });
    this.stage = h('div', { class: 'stage' }, this.zoneStick, this.zoneCam, this.ring);
    this.presetSeg = h('div', { class: 'sm-seg' });
    this.mirrorBtn = h('div');
    this.insp = h('div', { class: 'insp' });
    this.warn = h('div', { class: 'warn sm-hidden' });
    this.pnl = h('div', { class: 'pnl' });
    this.el = h('div', { class: 'sm-editor sm-hidden' }, this.stage, this.pnl);
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get visible(): boolean {
    return !this.el.classList.contains('sm-hidden');
  }

  private get bundle() {
    return this.ctx.game.content.bundle.touch_layouts;
  }

  private preset(id: PresetId): TouchLayoutDef {
    const base = this.bundle.touch_default ?? Object.values(this.bundle)[0];
    return normalizeLayout(this.bundle[id] ?? base, base);
  }

  private devicePreset(): PresetId {
    const { view } = this.host.geometry();
    return pickPresetId(view.w, view.h);
  }

  open(): void {
    const s = this.ctx.game.settings;
    const base = this.bundle.touch_default ?? Object.values(this.bundle)[0];
    this.def = s.touchLayout ? normalizeLayout(s.touchLayout, base) : this.preset(this.devicePreset());
    this.pristine = !s.touchLayout;
    this.mirror = s.leftHanded;
    this.sel = null;
    this.drag = null;
    this.hinted = false;
    toggle(this.el, 'sm-hidden', false); // visible first: the panel is measured to be placed
    this.buildPanel();
    this.rebuild();
  }

  close(): void {
    if (!this.visible) return;
    toggle(this.el, 'sm-hidden', true);
    this.drag = null;
    this.host.closed();
  }

  relabel(): void {
    if (!this.visible) return;
    this.buildPanel();
    this.rebuild();
  }

  /** Window resized / rotated while editing. */
  relayout(): void {
    if (this.visible) this.rebuild();
  }

  /* ------------------------------------------------------------------------------------------------ drawing */

  private resolve(): ResolvedLayout {
    const { view, safe } = this.host.geometry();
    return resolveLayout(this.def, view, safe, { mirror: this.mirror, large: this.ctx.game.settings.largeButtons });
  }

  /** Recreate the control views (preset change, mirror, open). */
  private rebuild(): void {
    for (const v of this.views.values()) v.remove();
    this.views.clear();
    const { t } = this.ctx;
    const L = this.resolve();
    for (const b of L.buttons) {
      if (b.anchor) continue;
      const cls = b.id.startsWith('slot_') ? 'slot' : b.id.startsWith('art_') ? 'art' : '';
      const el = h('div', { class: `sm-b ${b.id} ${cls}` });
      if (cls === 'slot') {
        // the weapon equipped in that slot, as in game; an empty slot shows its number
        const w = this.ctx.game.sim.state.equipped[Number(b.id.slice(5)) - 1] ?? null;
        const def = w && this.ctx.game.content.hasWeapon(w) ? this.ctx.game.content.weapon(w) : null;
        el.appendChild(def ? svgIcon(weaponGlyph(def.type)) : h('div', { class: 'numc' }, b.id.slice(5)));
      } else el.appendChild(svgIcon(ICON_FOR[b.id] ?? ICONS.examine));
      el.appendChild(h('div', { class: 'cap' }, this.name(b.id)));
      el.setAttribute('aria-label', this.name(b.id));
      this.stage.appendChild(el);
      this.views.set(b.id, el);
    }
    setText(this.zoneStick, t('ui.editor.zone_stick'));
    setText(this.zoneCam, t('ui.editor.zone_camera'));
    this.ring.setAttribute('aria-label', t('ui.touch.metamondo'));
    this.paint(L);
    this.paintPanel();
  }

  /** Move / size every view to the resolved layout and mark overlaps. Called on every drag move (13 elements). */
  private paint(L = this.resolve()): void {
    this.L = L;
    const bad = overlapping(L);
    const op = L.opacity.active;
    for (const b of L.buttons) {
      const el = this.views.get(b.id);
      if (!el) continue;
      const st = el.style;
      st.left = `${b.cx}px`;
      st.top = `${b.cy}px`;
      st.width = `${b.r * 2}px`;
      st.height = `${b.r * 2}px`;
      st.opacity = String(clamp(op * b.alpha + 0.12, 0.25, 1));
      toggle(el, 'sel', b.id === this.sel);
      toggle(el, 'bad', bad.has(b.id));
    }
    const z = (el: HTMLElement, r: Rect) => {
      el.style.left = `${r.x}px`;
      el.style.top = `${r.y}px`;
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
    };
    z(this.zoneStick, L.stick.zone);
    z(this.zoneCam, L.camera.zone);
    // zone names sit on the edge facing the screen center, clear of the HUD corner and Lacrime
    toggle(this.zoneStick, 'inner-r', !L.mirrored);
    toggle(this.zoneCam, 'inner-r', L.mirrored);
    const rs = this.ring.style;
    rs.left = `${L.ring.cx}px`;
    rs.top = `${L.ring.cy}px`;
    rs.width = rs.height = `${L.ring.r * 2}px`;
    toggle(this.warn, 'sm-hidden', bad.size === 0);
    if (!this.drag) this.place(L);
  }

  /** Put the panel where it hides no control (re-placed on open, after each drop and on inspector changes). */
  private place(L: ResolvedLayout): void {
    const circles: Circle[] = L.buttons.filter((b) => !b.anchor);
    circles.push(L.ring);
    const spot = panelSpot(circles, L.safe, this.pnl.offsetWidth, this.pnl.offsetHeight);
    this.pnl.style.left = `${Math.round(spot.x)}px`;
    this.pnl.style.top = `${Math.round(spot.y)}px`;
  }

  private name(id: string): string {
    return this.ctx.t(id.startsWith('slot_') ? 'ui.touch.slot' : `ui.touch.${id}`, { n: id.slice(5) });
  }

  /* ------------------------------------------------------------------------------------------------ panel */

  private buildPanel(): void {
    const { t } = this.ctx;
    this.pnl.textContent = '';
    this.presetSeg = h('div', { class: 'sm-seg' });
    for (const p of PRESETS) {
      const b = h('button', { type: 'button', 'data-id': p.id }, t(p.key));
      b.addEventListener('click', () => {
        uiSound(this.ctx, 'move');
        this.def = this.preset(p.id);
        this.pristine = p.id === this.devicePreset();
        this.sel = null;
        this.rebuild();
      });
      this.presetSeg.appendChild(b);
    }
    this.mirrorBtn = pill(t('ui.editor.mirror'), () => {
      this.mirror = !this.mirror;
      this.rebuild();
    }, { icon: ICONS.rotate });
    const reset = pill(t('ui.editor.reset'), () => {
      this.def = this.preset(this.devicePreset());
      this.pristine = true;
      this.sel = null;
      this.rebuild();
      this.host.flash(t('ui.set.layout_reset_done'));
    }, { icon: ICONS.back });
    const cancel = pill(t('ui.pause.cancel'), () => {
      uiSound(this.ctx, 'back');
      this.close();
    });
    const save = pill(t('ui.editor.save'), () => this.save(), { icon: ICONS.check, cls: 'gold' });
    setText(this.warn, t('ui.editor.overlap'));
    // two states keep the panel short enough for a 375 px tall phone: globals (presets, mirror, reset) when nothing is
    // selected, the inspector (size, opacity) of the selected control otherwise
    this.ttl = h('div', { class: 'ttl' }, t('ui.set.layout_edit'));
    this.hintEl = h('div', { class: 'hint' }, t('ui.editor.hint'));
    this.globals = h('div', { class: 'globals' },
      this.hintEl,
      this.presetSeg,
      h('div', { class: 'sm-pills' }, this.mirrorBtn, reset));
    this.pnl.append(this.ttl, this.globals, this.insp, this.warn, h('div', { class: 'sm-pills acts' }, cancel, save));
  }

  /** Preset highlight, mirror state and the inspector of the selected control. */
  private paintPanel(): void {
    const { t } = this.ctx;
    const devId = this.devicePreset();
    for (const c of Array.from(this.presetSeg.children)) {
      const id = (c as HTMLElement).dataset.id as PresetId;
      toggle(c, 'sel', this.pristine ? id === devId : JSON.stringify(this.preset(id).buttons) === JSON.stringify(this.def.buttons));
    }
    toggle(this.mirrorBtn, 'on', this.mirror);
    this.mirrorBtn.setAttribute('aria-pressed', String(this.mirror));
    this.insp.textContent = '';
    const b = this.sel ? (this.def.buttons[this.sel] as ExtButtonDef | undefined) : undefined;
    const selected = !!this.sel && !!b && !('anchor' in b);
    toggle(this.globals, 'sm-hidden', selected);
    if (selected) this.hinted = true;
    toggle(this.hintEl, 'sm-hidden', this.hinted);
    toggle(this.insp, 'sm-hidden', !selected);
    setText(this.ttl, selected && this.sel ? this.name(this.sel) : t('ui.set.layout_edit'));
    if (!selected || !this.sel || !b || 'anchor' in b) {
      if (this.L) this.place(this.L);
      return;
    }
    const id = this.sel;
    const size = rangeCtl(SIZE_MIN, SIZE_MAX, 0.005, clamp(b.size, SIZE_MIN, SIZE_MAX), (v) => `${Math.round((v / 0.1) * 100)}%`, (v) => {
      b.size = round3(v);
      this.touched();
      this.paint();
    });
    const alpha = rangeCtl(0.2, 1, 0.05, clamp(b.alpha ?? 1, 0.2, 1), (v) => `${Math.round(v * 100)}%`, (v) => {
      b.alpha = round3(v);
      this.touched();
      this.paint();
    });
    requestAnimationFrame(() => {
      if (this.visible && !this.drag && this.L) this.place(this.L);
    });
    this.insp.append(
      h('label', null, h('span', null, t('ui.editor.size')), size.el, size.val),
      h('label', null, h('span', null, t('ui.editor.opacity')), alpha.el, alpha.val));
  }

  private touched(): void {
    if (!this.pristine) return;
    this.pristine = false;
    for (const c of Array.from(this.presetSeg.children)) toggle(c, 'sel', false);
  }

  private save(): void {
    const { t } = this.ctx;
    // an edited layout with overlapping controls is only saved after an explicit confirmation (the preset is always valid)
    if (!this.pristine && this.L && overlapping(this.L).size > 0) {
      if (this.el.querySelector('.sm-dialog')) return;
      void confirmDialog(this.ctx, this.el, t('ui.editor.overlap_title'), t('ui.editor.overlap_text'), t('ui.editor.overlap_save'), t('ui.editor.overlap_edit'))
        .then((yes) => {
          if (yes && this.visible) this.commit();
        });
      return;
    }
    uiSound(this.ctx, 'confirm');
    this.commit();
  }

  private commit(): void {
    const { t } = this.ctx;
    const game = this.ctx.game;
    game.applySettings({ ...game.settings, touchLayout: this.pristine ? null : JSON.parse(JSON.stringify(this.def)) as TouchLayoutDef, leftHanded: this.mirror });
    this.host.flash(t('ui.editor.saved'));
    this.close();
  }

  /* ------------------------------------------------------------------------------------------------ dragging */

  private down(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('.pnl, .sm-dialog') || !this.L) return;
    e.preventDefault();
    if (this.drag) return; // one control at a time
    const hit: ResolvedButton | null = hitButton(this.L.buttons, e.clientX, e.clientY, 6, (b) => !b.anchor);
    if (!hit) {
      if (this.sel) {
        this.sel = null;
        this.paint();
        this.paintPanel();
      }
      return;
    }
    if (this.sel !== hit.id) {
      this.sel = hit.id;
      uiSound(this.ctx, 'move');
      this.ctx.game.platform.haptic('light');
      this.paintPanel();
    }
    this.drag = { id: hit.id, pointer: e.pointerId, dx: e.clientX - hit.cx, dy: e.clientY - hit.cy };
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
    toggle(this.el, 'dragging', true);
    this.paint();
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointer || !this.L) return;
    const b = this.def.buttons[d.id] as ExtButtonDef | undefined;
    if (!b || 'anchor' in b) return;
    b.pos = toFraction(e.clientX - d.dx, e.clientY - d.dy, this.L.safe, this.mirror);
    this.touched();
    this.paint();
  }

  private up(e: PointerEvent): void {
    if (!this.drag || e.pointerId !== this.drag.pointer) return;
    this.drag = null;
    toggle(this.el, 'dragging', false);
    this.paint();
  }
}
