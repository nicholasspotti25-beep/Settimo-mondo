/**
 * Pure touch-layout math (no DOM): resolve a TouchLayoutDef (fractions of the safe area) into pixel circles and zones,
 * mirror for left-handed play, large-button scaling, stick vector, flick / tap / double-tap classification, hit testing,
 * preset selection. Unit-tested in tests/ui_layout.test.ts.
 *
 * Conventions (docs/UI.md):
 * - `pos` = button center as a fraction of the safe area (origin top-left, landscape). Layouts are stored right-handed;
 *   mirroring (x -> 1 - x) is applied at resolve time.
 * - `size` = button diameter in "layout units"; 1 unit = unitFor(safe) px, which grows with the safe-area height but is clamped
 *   so a thumb button keeps a similar physical size from small phones to tablets.
 * - stick.radius is in units; dead_zone and sprint_ring are fractions of the radius.
 */
import type { TouchButtonDef, TouchLayoutDef } from '../core/types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Circle { cx: number; cy: number; r: number }
/** Button definition with the optional per-control opacity multiplier saved by the layout editor. */
export type ExtButtonDef = TouchButtonDef & { alpha?: number };

export interface ResolvedButton extends Circle {
  id: string;
  hold: boolean;
  /** Per-control opacity multiplier (layout editor), 0.2..1. */
  alpha: number;
  /** Anchored to a HUD element instead of a free position (metamondo -> eco_ring). */
  anchor: string | null;
}

export interface ResolvedLayout {
  view: { w: number; h: number };
  safe: Rect;
  unit: number;
  mirrored: boolean;
  large: boolean;
  buttons: ResolvedButton[];
  byId: Record<string, ResolvedButton>;
  stick: { zone: Rect; radius: number; dead: number; sprint: number; mode: 'floating' | 'fixed'; home: { x: number; y: number } };
  camera: { zone: Rect; sensitivity: number };
  opacity: { active: number; idle: number };
  /** HUD Eco / Metamondo ring. */
  ring: Circle;
}

/** Canonical button ids handled by the touch layer (E7 + the contextual interact button). */
export const BUTTON_IDS = [
  'light', 'heavy', 'dodge', 'guard', 'jump', 'art_prima', 'art_seconda', 'lacrime', 'lock', 'slot_1', 'slot_2', 'slot_3', 'interact', 'metamondo',
] as const;
export type TouchButtonId = (typeof BUTTON_IDS)[number];

export const LARGE_SCALE = 1.22;
export const MIN_ALPHA = 0.2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Pixels per layout unit for a safe area. */
export function unitFor(safe: Rect): number {
  return clamp(safe.h, 300, 400) * 1.45;
}

/** HUD Eco ring geometry (top-left corner of the safe area; top-right when mirrored). Grows on tablets with the HUD scale. */
export function hudRing(safe: Rect, unit: number, mirrored: boolean): Circle {
  const r = clamp(safe.h * 0.075, 22, 46);
  const m = clamp(unit * 0.02, 8, 14);
  return { cx: mirrored ? safe.x + safe.w - m - r : safe.x + m + r, cy: safe.y + m + r, r };
}

function zoneRect(z: [number, number, number, number], safe: Rect, mirror: boolean): Rect {
  const [zx0, y0, zx1, y1] = z;
  const x0 = mirror ? 1 - zx1 : zx0;
  const x1 = mirror ? 1 - zx0 : zx1;
  return { x: safe.x + x0 * safe.w, y: safe.y + y0 * safe.h, w: (x1 - x0) * safe.w, h: (y1 - y0) * safe.h };
}

export function resolveLayout(def: TouchLayoutDef, view: { w: number; h: number }, safe: Rect, opts: { mirror: boolean; large: boolean }): ResolvedLayout {
  const unit = unitFor(safe);
  const mirror = opts.mirror;
  const ring = hudRing(safe, unit, mirror);
  const k = opts.large ? LARGE_SCALE : 1;
  const buttons: ResolvedButton[] = [];
  for (const [id, b] of Object.entries(def.buttons)) {
    if ('anchor' in b) {
      if (b.anchor === 'eco_ring') buttons.push({ id, cx: ring.cx, cy: ring.cy, r: ring.r + 4, hold: false, alpha: 1, anchor: b.anchor });
      continue;
    }
    const eb = b as ExtButtonDef;
    const r = (eb.size * unit * k) / 2;
    const fx = mirror ? 1 - eb.pos[0] : eb.pos[0];
    const cx = clamp(safe.x + fx * safe.w, safe.x + r, safe.x + safe.w - r);
    const cy = clamp(safe.y + eb.pos[1] * safe.h, safe.y + r, safe.y + safe.h - r);
    buttons.push({ id, cx, cy, r, hold: !!eb.hold, alpha: clamp(eb.alpha ?? 1, MIN_ALPHA, 1), anchor: null });
  }
  const byId: Record<string, ResolvedButton> = {};
  for (const b of buttons) byId[b.id] = b;
  const zone = zoneRect(def.stick.zone, safe, mirror);
  const radius = def.stick.radius * unit * (opts.large ? 1.1 : 1);
  const home = {
    x: clamp(zone.x + zone.w * (mirror ? 0.65 : 0.35), safe.x + radius * 1.2, safe.x + safe.w - radius * 1.2),
    y: clamp(zone.y + zone.h * 0.62, safe.y + radius * 1.2, safe.y + safe.h - radius * 1.2),
  };
  return {
    view,
    safe,
    unit,
    mirrored: mirror,
    large: opts.large,
    buttons,
    byId,
    stick: { zone, radius, dead: def.stick.dead_zone * radius, sprint: def.stick.sprint_ring * radius, mode: def.stick.mode, home },
    camera: { zone: zoneRect(def.camera_drag.zone, safe, mirror), sensitivity: def.camera_drag.sensitivity },
    opacity: { active: clamp(def.opacity.active, 0.1, 1), idle: clamp(def.opacity.idle, 0, 1) },
    ring,
  };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Hit-test buttons. A touch hits a button within its radius x 1.12 + slop; when several overlap, the one whose center is
 * relatively closest wins. `accept` filters out hidden/disabled controls.
 */
export function hitButton(buttons: readonly ResolvedButton[], x: number, y: number, slop: number, accept?: (b: ResolvedButton) => boolean): ResolvedButton | null {
  let best: ResolvedButton | null = null;
  let bestScore = Infinity;
  for (const b of buttons) {
    if (accept && !accept(b)) continue;
    const d = Math.hypot(x - b.cx, y - b.cy);
    const reach = b.r * 1.12 + slop;
    if (d > reach) continue;
    const score = d / reach;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

export interface StickOut {
  x: number;
  /** Forward (screen up) positive. */
  y: number;
  mag: number;
  sprint: boolean;
}

/**
 * Stick vector from the thumb offset (screen px, y down). Dead zone -> 0; magnitude ramps from the dead zone to the sprint
 * ring (walk below ~55%, run above); at or beyond the sprint ring the stick sprints.
 */
export function stickVector(dx: number, dy: number, dead: number, sprintAt: number, out: StickOut = { x: 0, y: 0, mag: 0, sprint: false }): StickOut {
  const d = Math.hypot(dx, dy);
  if (d <= dead || d === 0) {
    out.x = 0; out.y = 0; out.mag = 0; out.sprint = false;
    return out;
  }
  const mag = clamp((d - dead) / Math.max(1, sprintAt - dead), 0, 1);
  out.x = (dx / d) * mag;
  out.y = (-dy / d) * mag;
  out.mag = mag;
  out.sprint = d >= sprintAt;
  return out;
}

/** Floating stick: when the thumb travels beyond maxDist from the base, drag the base along. Mutates and returns base. */
export function followBase(base: { x: number; y: number }, tx: number, ty: number, maxDist: number): { x: number; y: number } {
  const dx = tx - base.x, dy = ty - base.y;
  const d = Math.hypot(dx, dy);
  if (d > maxDist && d > 0) {
    const k = (d - maxDist) / d;
    base.x += dx * k;
    base.y += dy * k;
  }
  return base;
}

/** Keep a floating stick base fully inside the safe area. */
export function clampBase(x: number, y: number, radius: number, safe: Rect): { x: number; y: number } {
  return { x: clamp(x, safe.x + radius, safe.x + safe.w - radius), y: clamp(y, safe.y + radius, safe.y + safe.h - radius) };
}

/** Short horizontal flick on the camera side: -1 left, +1 right, 0 none. */
export function classifyFlick(dx: number, dy: number, dtMs: number, viewW: number): -1 | 0 | 1 {
  if (dtMs > 280 || dtMs <= 0) return 0;
  const min = Math.max(34, viewW * 0.045);
  if (Math.abs(dx) < min) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx > 0 ? 1 : -1;
}

export function isTap(dx: number, dy: number, dtMs: number): boolean {
  return dtMs < 320 && Math.hypot(dx, dy) < 16;
}

export interface TapRecord { t: number; x: number; y: number }
export function isDoubleTap(prev: TapRecord | null, cur: TapRecord, maxMs = 330, maxDist = 56): boolean {
  if (!prev) return false;
  return cur.t - prev.t <= maxMs && cur.t - prev.t > 30 && Math.hypot(cur.x - prev.x, cur.y - prev.y) <= maxDist;
}

export function circlesOverlap(a: Circle, b: Circle, pad = 0): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r + pad;
}

/** Preset choice for a device when the player has no custom layout. */
export type PresetId = 'touch_default' | 'touch_small_phone' | 'touch_tablet';
export function pickPresetId(viewW: number, viewH: number): PresetId {
  const w = Math.max(viewW, viewH), hgt = Math.min(viewW, viewH);
  if (hgt >= 600) return 'touch_tablet';
  if (w < 720 || hgt < 350) return 'touch_small_phone';
  return 'touch_default';
}

/** Convert a pixel center back to stored (right-handed) fractions, clamped inside the safe area. */
export function toFraction(cx: number, cy: number, safe: Rect, mirrored: boolean): [number, number] {
  let fx = (cx - safe.x) / safe.w;
  const fy = (cy - safe.y) / safe.h;
  if (mirrored) fx = 1 - fx;
  return [round3(clamp(fx, 0.02, 0.98)), round3(clamp(fy, 0.02, 0.98))];
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Deep copy and fill missing buttons from a fallback layout (older saved layouts, new controls). */
export function normalizeLayout(def: TouchLayoutDef, fallback: TouchLayoutDef): TouchLayoutDef {
  const out = JSON.parse(JSON.stringify(def)) as TouchLayoutDef;
  for (const [id, b] of Object.entries(fallback.buttons)) if (!(id in out.buttons)) out.buttons[id] = JSON.parse(JSON.stringify(b));
  out.stick = { ...fallback.stick, ...out.stick };
  out.camera_drag = { ...fallback.camera_drag, ...out.camera_drag };
  out.opacity = { ...fallback.opacity, ...out.opacity };
  return out;
}

/** Opacity of the controls given idle time (fade when idle). */
export function controlsOpacity(idleSec: number, op: { active: number; idle: number }, fade: boolean): number {
  if (!fade) return op.active;
  const t = clamp((idleSec - 2.5) / 1.2, 0, 1);
  return op.active + (op.idle - op.active) * t;
}
