/** Keyboard + mouse (desktop debugging convenience). WASD move, Shift sprint, mouse drag camera, J/K light/heavy, Space dodge,
 * L guard (hold), F jump, 1/2/3 weapon slots, Q Arte Prima, E Arte Seconda, R Lacrime, V Metamondo, Tab lock, X interact,
 * Enter advance, Z/C switch lock target, numbers 7/8/9 choice. */
import type { InputRouter, InputSource } from './InputRouter';

export class KeyboardSource implements InputSource {
  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private router: InputRouter, target: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('mousedown', (e) => {
      if ((e as MouseEvent).button === 2 || (e as MouseEvent).button === 0) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging || (e as PointerEvent).pointerType === 'touch') return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.router.addCamera(-dx * 0.006, dy * 0.004);
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    const k = e.code;
    if (down && this.keys.has(k)) return;
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    const r = this.router;
    if (!down) {
      if (k === 'KeyL') r.setHeld('guard', false);
      if (k === 'KeyF') r.setHeld('jump', false);
      if (k === 'KeyX') r.setHeld('interact', false);
      if (k === 'Enter') r.setHeld('advance', false);
      return;
    }
    const map: Record<string, Parameters<InputRouter['press']>[0]> = {
      KeyJ: 'light', KeyK: 'heavy', Space: 'dodge', KeyL: 'guard', KeyF: 'jump', Digit1: 'slot_1', Digit2: 'slot_2', Digit3: 'slot_3', KeyQ: 'art_prima',
      KeyE: 'art_seconda', KeyR: 'lacrime', KeyV: 'metamondo', Tab: 'lock', KeyX: 'interact', Enter: 'advance',
    };
    const b = map[k];
    if (b) {
      r.press(b);
      if (b === 'guard' || b === 'jump' || b === 'interact' || b === 'advance') r.setHeld(b, true);
      if (k === 'Tab' || k === 'Space') e.preventDefault();
    }
    if (k === 'KeyZ') r.lockSwitch(-1);
    if (k === 'KeyC') r.lockSwitch(1);
    if (k === 'Digit7') r.choose(0);
    if (k === 'Digit8') r.choose(1);
    if (k === 'Digit9') r.choose(2);
  }

  poll(router: InputRouter): void {
    const x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const y = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const arrowsX = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const arrowsY = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    if (arrowsX || arrowsY) router.addCamera(-arrowsX * 0.035, arrowsY * 0.02);
    if (x || y) {
      const m = Math.hypot(x, y);
      router.setStick(x / m, y / m, this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
    } else if (!this.touchActive()) router.setStick(0, 0, false);
  }

  private touchActive(): boolean {
    return (globalThis as any).__smTouchStickActive === true;
  }
}
