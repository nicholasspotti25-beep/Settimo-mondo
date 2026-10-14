/** Optional external gamepad (standard mapping). */
import type { ButtonName, InputRouter, InputSource } from './InputRouter';

// standard mapping indices
const MAP: [number, ButtonName][] = [
  [2, 'light'], // X / Square
  [3, 'heavy'], // Y / Triangle
  [1, 'dodge'], // B / Circle
  [4, 'guard'], // LB
  [0, 'jump'], // A / Cross
  [5, 'art_prima'], // RB
  [7, 'art_seconda'], // RT
  [6, 'lacrime'], // LT
  [11, 'lock'], // R3
  [10, 'metamondo'], // L3
  [8, 'interact'], // Back/View
  [9, 'advance'], // Start
  [14, 'slot_1'], // D-pad left
  [12, 'slot_2'], // D-pad up
  [15, 'slot_3'], // D-pad right
];

export class GamepadSource implements InputSource {
  private prev = new Map<number, boolean>();
  private prevSwitch = 0;
  active = false;

  poll(router: InputRouter, dt: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) {
      this.active = false;
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0);
    const rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
    if (lx || ly) {
      this.active = true;
      const m = Math.min(1, Math.hypot(lx, ly));
      router.setStick(lx, -ly, m > 0.95 && !!gp.buttons[10]?.pressed === false && (gp.buttons[1]?.pressed ?? false));
    } else if (this.active) router.setStick(0, 0, false);
    if (rx || ry) router.addCamera(-rx * 2.6 * dt, ry * 1.8 * dt);
    for (const [i, name] of MAP) {
      const on = !!gp.buttons[i]?.pressed;
      const was = this.prev.get(i) ?? false;
      if (on && !was) router.press(name);
      if (name === 'guard' || name === 'jump' || name === 'interact' || name === 'advance') router.setHeld(name, on);
      this.prev.set(i, on);
    }
    // sprint: hold dodge while moving
    if ((lx || ly) && gp.buttons[1]?.pressed) router.sprint = true;
    // right stick flick switches lock target
    const sw = rx > 0.85 ? 1 : rx < -0.85 ? -1 : 0;
    if (sw !== 0 && this.prevSwitch === 0 && (gp.buttons[11]?.pressed === false)) router.lockSwitch(sw);
    this.prevSwitch = sw;
  }
}
