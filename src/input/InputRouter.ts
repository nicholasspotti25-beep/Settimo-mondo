/**
 * Collects input from touch controls, keyboard (desktop debugging) and gamepad into one frame state, and converts it into a
 * PlayerInput per sim step. Touch never loses presses: presses are queued and delivered to the next sim step, where the
 * sim's 0.20 s input buffer takes over.
 */
import { Btn, emptyInput, type PlayerInput } from '../sim/types';

export type ButtonName =
  | 'light' | 'heavy' | 'dodge' | 'guard' | 'jump' | 'art_prima' | 'art_seconda' | 'slot_1' | 'slot_2' | 'slot_3' | 'lacrime'
  | 'metamondo' | 'lock' | 'interact' | 'advance';

export const BUTTON_BITS: Record<ButtonName, number> = {
  light: Btn.Light, heavy: Btn.Heavy, dodge: Btn.Dodge, guard: Btn.Guard, jump: Btn.Jump, art_prima: Btn.ArtPrima, art_seconda: Btn.ArtSeconda,
  slot_1: Btn.Slot1, slot_2: Btn.Slot2, slot_3: Btn.Slot3, lacrime: Btn.Drink, metamondo: Btn.Metamondo, lock: Btn.Lock, interact: Btn.Interact,
  advance: Btn.Advance,
};

export interface InputSource {
  /** Called once per rendered frame before the router produces sim input. */
  poll?(router: InputRouter, dt: number): void;
}

export class InputRouter {
  /** Stick in screen space: x right, y forward (up), magnitude 0..1. */
  stickX = 0;
  stickY = 0;
  sprint = false;
  /** Camera orbit deltas accumulated since last read (radians). */
  camDX = 0;
  camDY = 0;
  held = new Set<ButtonName>();
  private queue = 0;
  private lockSwitchQ = 0;
  private lockPickQ: { actor: number; part: number } | null = null;
  private choiceQ = -1;
  flyAxis = 0;
  sources: InputSource[] = [];
  /** True when any input happened recently (for fading touch controls). */
  lastActivity = 0;
  enabled = true;
  /** Toggle-guard accessibility. */
  toggleGuard = false;
  private guardToggled = false;

  press(b: ButtonName): void {
    if (!this.enabled) return;
    if (b === 'guard' && this.toggleGuard) {
      this.guardToggled = !this.guardToggled;
      if (!this.guardToggled) return;
    }
    this.queue |= BUTTON_BITS[b];
    this.lastActivity = performance.now();
  }
  setHeld(b: ButtonName, on: boolean): void {
    if (on) this.held.add(b);
    else this.held.delete(b);
    this.lastActivity = performance.now();
  }
  setStick(x: number, y: number, sprint: boolean): void {
    this.stickX = x;
    this.stickY = y;
    this.sprint = sprint;
    if (x || y) this.lastActivity = performance.now();
  }
  addCamera(dx: number, dy: number): void {
    this.camDX += dx;
    this.camDY += dy;
  }
  takeCamera(): { dx: number; dy: number } {
    const r = { dx: this.camDX, dy: this.camDY };
    this.camDX = 0;
    this.camDY = 0;
    return r;
  }
  lockSwitch(dir: number): void {
    this.lockSwitchQ = dir;
  }
  pickLock(actor: number, part: number): void {
    this.lockPickQ = { actor, part };
  }
  choose(i: number): void {
    this.choiceQ = i;
  }
  clear(): void {
    this.queue = 0;
    this.held.clear();
    this.stickX = 0;
    this.stickY = 0;
    this.sprint = false;
    this.guardToggled = false;
    this.camDX = 0;
    this.camDY = 0;
  }

  poll(dt: number): void {
    for (const s of this.sources) s.poll?.(this, dt);
  }

  /** Build the PlayerInput for one sim step. `first` = first sim step of this frame (presses are delivered once). */
  build(camYaw: number, first: boolean): PlayerInput {
    const inp = emptyInput();
    // stick (screen) -> world using camera yaw: forward = (sin yaw, cos yaw); screen right = -localX
    const sx = this.stickX, sy = this.stickY;
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    inp.moveX = sy * s - sx * c;
    inp.moveZ = sy * c + sx * s;
    const mag = Math.hypot(inp.moveX, inp.moveZ);
    if (mag > 1) {
      inp.moveX /= mag;
      inp.moveZ /= mag;
    }
    inp.sprint = this.sprint;
    inp.guardHeld = this.held.has('guard') || this.guardToggled;
    inp.holdHeld = this.held.has('interact') || this.held.has('advance') || this.held.has('light');
    inp.fly = (this.held.has('jump') ? 1 : 0) - (this.held.has('dodge') ? 0 : 0) + this.flyAxis;
    inp.camYaw = camYaw;
    if (first) {
      inp.presses = this.queue;
      this.queue = 0;
      inp.lockSwitch = this.lockSwitchQ;
      this.lockSwitchQ = 0;
      inp.lockPick = this.lockPickQ;
      this.lockPickQ = null;
      inp.choice = this.choiceQ;
      this.choiceQ = -1;
    }
    return inp;
  }
}
