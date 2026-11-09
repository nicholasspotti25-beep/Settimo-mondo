/** Screen stack with browser/Android back-button support. Screens below the top stay alive (scroll and state kept). */
import { repo } from '../store/repo';

export interface Screen {
  el: HTMLElement;
  /** Re-render after data changes or when returning to this screen. */
  refresh?(): void;
  /** Called when the screen is removed from the stack. */
  dispose?(): void;
  /** Return false to block leaving (e.g. ask for confirmation). */
  canLeave?(): Promise<boolean> | boolean;
}

export type ScreenFactory = (params: any) => Screen;
const registry = new Map<string, ScreenFactory>();
export function register(name: string, f: ScreenFactory): void {
  registry.set(name, f);
}

interface Frame { name: string; params: unknown; screen: Screen; scroll: number }
let rootEl: HTMLElement;
const stack: Frame[] = [];
let ignorePop = 0;
let pending = false;

export function initRouter(root: HTMLElement): void {
  rootEl = root;
  try { history.replaceState({ fcg: 0 }, ''); } catch { /* sandboxed */ }
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) {
      ignorePop--;
      return;
    }
    void back(true);
  });
  repo.subscribe(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      top()?.screen.refresh?.();
    });
  });
}

const top = (): Frame | undefined => stack[stack.length - 1];

function mount(f: Frame, dir: 'fwd' | 'back'): void {
  const prev = rootEl.querySelector(':scope > .screen.live');
  if (prev) {
    prev.classList.remove('live');
    prev.remove();
  }
  f.screen.el.classList.add('screen', 'live');
  f.screen.el.classList.remove('enter-fwd', 'enter-back');
  void f.screen.el.offsetWidth;
  f.screen.el.classList.add(dir === 'fwd' ? 'enter-fwd' : 'enter-back');
  rootEl.appendChild(f.screen.el);
  f.screen.el.scrollTop = f.scroll;
}

export function go(name: string, params: unknown = {}): void {
  const f = registry.get(name);
  if (!f) throw new Error(`Unknown screen ${name}`);
  const cur = top();
  if (cur) cur.scroll = cur.screen.el.scrollTop;
  const frame: Frame = { name, params, screen: f(params), scroll: 0 };
  stack.push(frame);
  try { history.pushState({ fcg: stack.length }, ''); } catch { /* sandboxed */ }
  mount(frame, 'fwd');
  window.scrollTo(0, 0);
}

/** Replace the current screen (no new history entry). */
export function replace(name: string, params: unknown = {}): void {
  const f = registry.get(name);
  if (!f) throw new Error(`Unknown screen ${name}`);
  const old = stack.pop();
  old?.screen.dispose?.();
  const frame: Frame = { name, params, screen: f(params), scroll: 0 };
  stack.push(frame);
  mount(frame, 'fwd');
}

export async function back(fromBrowser = false): Promise<void> {
  const cur = top();
  if (!cur || stack.length <= 1) {
    if (fromBrowser) try { history.pushState({ fcg: stack.length }, ''); } catch { /* ignore */ }
    return;
  }
  if (cur.screen.canLeave && !(await cur.screen.canLeave())) {
    if (fromBrowser) try { history.pushState({ fcg: stack.length }, ''); } catch { /* ignore */ }
    return;
  }
  stack.pop();
  cur.screen.dispose?.();
  if (!fromBrowser) {
    ignorePop++;
    try { history.back(); } catch { ignorePop--; }
    setTimeout(() => { if (ignorePop > 0) ignorePop = 0; }, 400);
  }
  const t = top()!;
  mount(t, 'back');
  t.screen.refresh?.();
}

/** Back to the home screen, disposing everything above it. */
export async function home(): Promise<void> {
  let popped = 0;
  while (stack.length > 1) {
    const cur = top()!;
    if (cur.screen.canLeave && !(await cur.screen.canLeave())) break;
    stack.pop();
    cur.screen.dispose?.();
    popped++;
  }
  if (!popped) return;
  ignorePop++;
  try { history.go(-popped); } catch { ignorePop--; }
  setTimeout(() => { ignorePop = 0; }, 600);
  const t = top()!;
  mount(t, 'back');
  t.screen.refresh?.();
}

export function currentName(): string | undefined {
  return top()?.name;
}
