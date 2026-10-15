/**
 * Touch controls input (Pointer Events). Every pointer owns exactly one control for its whole life (a button, the stick or
 * the camera), so thumbs never steal each other's touches. Presses fire on pointerdown (no tap delay); holds last until that
 * pointer lifts. The floating stick appears under the thumb inside the stick zone (dead zone, smoothing, outer ring =
 * sprint); the rest of the screen orbits the camera; a short horizontal flick on the right half switches the lock; a double
 * tap on a boss locks the lock point under the finger (projection done by the host).
 *
 * The geometry comes from the pure math in src/ui/layout.ts; the view (src/ui/controls.ts) only reads this controller's state.
 */
import type { ButtonName, InputRouter, InputSource } from './InputRouter';
import {
  classifyFlick, clampBase, followBase, hitButton, inRect, isDoubleTap, isTap, stickVector,
  type ResolvedButton, type ResolvedLayout, type StickOut, type TapRecord,
} from '../ui/layout';

export interface TouchHost {
  /** Current resolved layout (null while the controls are hidden). */
  layout(): ResolvedLayout | null;
  /** Whether a button can be pressed right now (contextual interact, Metamondo ring only when shown...). */
  accepts(b: ResolvedButton): boolean;
  /** Double tap on the free area: lock the lock point under (x, y). Returns true when something was picked. */
  pickLockAt(x: number, y: number): boolean;
  /** The player currently has a lock (flicks switch it). */
  hasLock(): boolean;
  /** Light haptic tick on a button press. */
  tick(): void;
}

type Track =
  | { kind: 'button'; id: ButtonName; held: boolean }
  | { kind: 'stick' }
  | { kind: 'camera'; x0: number; y0: number; t0: number; lx: number; ly: number; right: boolean };

/** Exponential smoothing rate of the stick output (1/s): ~25 ms time constant, enough to hide finger jitter. */
const STICK_SMOOTH = 40;
/** Camera radians per layout unit of finger travel. */
const CAM_YAW_PER_UNIT = 2.7;
const CAM_PITCH_PER_UNIT = 1.6;

const BUTTON_NAMES: Record<string, ButtonName> = {
  light: 'light', heavy: 'heavy', dodge: 'dodge', guard: 'guard', jump: 'jump', art_prima: 'art_prima', art_seconda: 'art_seconda',
  lacrime: 'lacrime', lock: 'lock', slot_1: 'slot_1', slot_2: 'slot_2', slot_3: 'slot_3', interact: 'interact', metamondo: 'metamondo',
};
/** Buttons whose hold matters to the sim (guard, Implora / ballista hold, ritual hold, flight). */
const HOLDABLE = new Set<ButtonName>(['guard', 'interact', 'light', 'jump']);

export class TouchController implements InputSource {
  /** Stick visual state (read by the view). */
  readonly stick = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, sprint: false };
  /** Buttons currently held by a finger -> number of fingers (read by the view for the pressed state). */
  readonly down = new Map<string, number>();
  /** The controls are on screen and accept touches (in game, no menu open). */
  enabled = false;
  private tracks = new Map<number, Track>();
  private out: StickOut = { x: 0, y: 0, mag: 0, sprint: false };
  private sx = 0;
  private sy = 0;
  private lastTap: TapRecord | null = null;
  private stickPointer = -1;
  private base = { x: 0, y: 0 };

  constructor(
    private readonly el: HTMLElement,
    private readonly router: InputRouter,
    private readonly host: TouchHost,
  ) {
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    el.addEventListener('pointermove', (e) => this.onMove(e), opts);
    el.addEventListener('pointerup', (e) => this.onUp(e, false), opts);
    el.addEventListener('pointercancel', (e) => this.onUp(e, true), opts);
    el.addEventListener('lostpointercapture', (e) => {
      if (this.tracks.has(e.pointerId)) this.onUp(e, true);
    });
    // no long-press menu, selection or gesture zoom on the control surface
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    el.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    el.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
  }

  /** Number of fingers currently on the controls. */
  get touches(): number {
    return this.tracks.size;
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    const L = this.host.layout();
    if (!this.enabled || !L) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers cannot always be captured */
    }
    const x = e.clientX, y = e.clientY;
    const slop = Math.max(4, L.unit * 0.012);
    const b = hitButton(L.buttons, x, y, slop, (bb) => this.host.accepts(bb));
    if (b) {
      const id = BUTTON_NAMES[b.id];
      if (!id) return;
      const held = HOLDABLE.has(id) && !(id === 'guard' && this.router.toggleGuard);
      this.tracks.set(e.pointerId, { kind: 'button', id, held });
      this.router.press(id);
      if (held) this.router.setHeld(id, true);
      this.down.set(b.id, (this.down.get(b.id) ?? 0) + 1);
      this.host.tick();
      return;
    }
    if (this.stickPointer < 0 && inRect(L.stick.zone, x, y)) {
      this.stickPointer = e.pointerId;
      this.tracks.set(e.pointerId, { kind: 'stick' });
      const r = L.stick.radius;
      const start = L.stick.mode === 'fixed' ? L.stick.home : clampBase(x, y, r, L.safe);
      this.base.x = start.x;
      this.base.y = start.y;
      this.stick.active = true;
      this.updateStick(x, y, L);
      return;
    }
    this.tracks.set(e.pointerId, { kind: 'camera', x0: x, y0: y, t0: e.timeStamp, lx: x, ly: y, right: x > L.view.w * 0.5 });
  }

  private onMove(e: PointerEvent): void {
    const tr = this.tracks.get(e.pointerId);
    if (!tr) return;
    e.preventDefault();
    const L = this.host.layout();
    if (!L) return;
    if (tr.kind === 'stick') {
      this.updateStick(e.clientX, e.clientY, L);
    } else if (tr.kind === 'camera') {
      // coalesced events give the full finger path on fast swipes
      const dx = e.clientX - tr.lx, dy = e.clientY - tr.ly;
      tr.lx = e.clientX;
      tr.ly = e.clientY;
      const k = L.camera.sensitivity / L.unit;
      this.router.addCamera(-dx * CAM_YAW_PER_UNIT * k, dy * CAM_PITCH_PER_UNIT * k);
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    const tr = this.tracks.get(e.pointerId);
    if (!tr) return;
    this.tracks.delete(e.pointerId);
    if (tr.kind === 'button') {
      if (tr.held) this.router.setHeld(tr.id, false);
      const key = tr.id as string;
      const n = (this.down.get(key) ?? 1) - 1;
      if (n <= 0) this.down.delete(key);
      else this.down.set(key, n);
      return;
    }
    if (tr.kind === 'stick') {
      this.stickPointer = -1;
      this.stick.active = false;
      this.stick.sprint = false;
      this.out.x = 0; this.out.y = 0; this.out.mag = 0; this.out.sprint = false;
      return;
    }
    if (cancelled) return;
    const L = this.host.layout();
    if (!L) return;
    const dx = e.clientX - tr.x0, dy = e.clientY - tr.y0, dt = e.timeStamp - tr.t0;
    if (tr.right && this.host.hasLock()) {
      const flick = classifyFlick(dx, dy, dt, L.view.w);
      if (flick !== 0) {
        this.router.lockSwitch(flick);
        this.lastTap = null;
        return;
      }
    }
    if (isTap(dx, dy, dt)) {
      const rec: TapRecord = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (isDoubleTap(this.lastTap, rec)) {
        this.lastTap = null;
        if (this.host.pickLockAt(rec.x, rec.y)) this.host.tick();
      } else {
        this.lastTap = rec;
      }
    }
  }

  private updateStick(x: number, y: number, L: ResolvedLayout): void {
    const r = L.stick.radius;
    if (L.stick.mode === 'floating') followBase(this.base, x, y, r);
    const dx = x - this.base.x, dy = y - this.base.y;
    stickVector(dx, dy, L.stick.dead, L.stick.sprint, this.out);
    const d = Math.hypot(dx, dy);
    const k = d > r ? r / d : 1;
    this.stick.baseX = this.base.x;
    this.stick.baseY = this.base.y;
    this.stick.knobX = this.base.x + dx * k;
    this.stick.knobY = this.base.y + dy * k;
    this.stick.sprint = this.out.sprint;
  }

  /** InputSource: push the smoothed stick into the router once per frame. */
  poll(router: InputRouter, dt: number): void {
    const a = 1 - Math.exp(-STICK_SMOOTH * dt);
    this.sx += (this.out.x - this.sx) * a;
    this.sy += (this.out.y - this.sy) * a;
    if (!this.stick.active && Math.abs(this.sx) < 0.02 && Math.abs(this.sy) < 0.02) {
      if (this.sx !== 0 || this.sy !== 0) router.setStick(0, 0, false);
      this.sx = 0;
      this.sy = 0;
    } else {
      router.setStick(this.sx, this.sy, this.out.sprint);
    }
    (globalThis as { __smTouchStickActive?: boolean }).__smTouchStickActive = this.stick.active || this.sx !== 0 || this.sy !== 0;
  }

  /** Release every finger (mode change, menu opened, app backgrounded). */
  releaseAll(): void {
    for (const [pid, tr] of this.tracks) {
      if (tr.kind === 'button' && tr.held) this.router.setHeld(tr.id, false);
      try {
        this.el.releasePointerCapture(pid);
      } catch {
        /* already released */
      }
    }
    this.tracks.clear();
    this.down.clear();
    this.stickPointer = -1;
    this.stick.active = false;
    this.stick.sprint = false;
    this.out.x = 0; this.out.y = 0; this.out.mag = 0; this.out.sprint = false;
    this.lastTap = null;
  }
}
