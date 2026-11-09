/** Modals, confirmations, bottom sheets and toasts. */
import { h, append } from './dom';
import { icon, type IconName } from './icons';
import { sfx } from './sound';

let root: HTMLElement;
let toastRoot: HTMLElement;
export function initOverlay(r: HTMLElement): void {
  root = r;
  toastRoot = h('div', { class: 'toasts', 'aria-live': 'polite' });
  document.body.appendChild(toastRoot);
}
export const overlayRoot = (): HTMLElement => root;

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close(): void;
  closed: Promise<void>;
}

export function modal(opts: { title?: string; cls?: string; dismissable?: boolean; content: Node | Node[]; actions?: Node[]; onClose?: () => void }): ModalHandle {
  let resolve!: () => void;
  const closed = new Promise<void>((r) => (resolve = r));
  const body = h('div', { class: 'modal-body' });
  append(body, [opts.content as any]);
  const close = (): void => {
    if (!wrap.isConnected) return;
    wrap.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 180);
    opts.onClose?.();
    resolve();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && opts.dismissable !== false) close();
  };
  const panel = h('div', { class: `modal ${opts.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true' },
    opts.title ? h('div', { class: 'modal-head' },
      h('h2', null, opts.title),
      opts.dismissable !== false ? h('button', { class: 'icon-btn', 'aria-label': 'Close', on: { click: close } }, icon('close')) : null) : null,
    body,
    opts.actions?.length ? h('div', { class: 'modal-actions' }, ...opts.actions) : null,
  );
  const wrap = h('div', { class: 'modal-wrap' }, panel);
  wrap.addEventListener('pointerdown', (e) => {
    if (e.target === wrap && opts.dismissable !== false) close();
  });
  document.addEventListener('keydown', onKey);
  root.appendChild(wrap);
  return { el: panel, body, close, closed };
}

export function btn(label: string | Node, onClick: (ev: MouseEvent) => void, cls = '', iconName?: IconName, extra: Record<string, unknown> = {}): HTMLButtonElement {
  return h('button', {
    class: `btn ${cls}`, type: 'button', ...extra,
    on: { click: (e: MouseEvent) => { sfx.tap(); onClick(e); } },
  }, iconName ? icon(iconName) : null, typeof label === 'string' ? h('span', null, label) : label) as HTMLButtonElement;
}

export function confirmDialog(opts: { title: string; message: string | Node; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((res) => {
    let answered = false;
    const done = (v: boolean): void => {
      if (answered) return;
      answered = true;
      m.close();
      res(v);
    };
    const m = modal({
      title: opts.title,
      cls: 'modal-sm',
      content: typeof opts.message === 'string' ? h('p', { class: 'muted pre' }, opts.message) : opts.message,
      actions: [
        btn(opts.cancel ?? 'Cancel', () => done(false), 'ghost'),
        btn(opts.confirm ?? 'Confirm', () => done(true), opts.danger ? 'danger' : 'primary'),
      ],
      onClose: () => done(false),
    });
  });
}

export function alertDialog(title: string, message: string | Node, ok = 'OK'): Promise<void> {
  return new Promise((res) => {
    const m = modal({
      title, cls: 'modal-sm',
      content: typeof message === 'string' ? h('p', { class: 'muted pre' }, message) : message,
      actions: [btn(ok, () => m.close(), 'primary')],
      onClose: () => res(),
    });
  });
}

export type ToastKind = 'ok' | 'err' | 'fc' | 'info';
export function toast(message: string, kind: ToastKind = 'info', ms = 2800): void {
  const ic: IconName = kind === 'ok' ? 'check' : kind === 'err' ? 'warn' : kind === 'fc' ? 'coin' : 'info';
  const t = h('div', { class: `toast t-${kind}` }, icon(ic), h('span', null, message));
  toastRoot.appendChild(t);
  if (kind === 'fc') sfx.coin();
  if (kind === 'err') sfx.error();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Run an async action, showing errors to the user instead of failing silently. */
export async function guard<T>(fn: () => Promise<T>, failMsg = 'Something went wrong'): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast(`${failMsg}: ${(e as Error)?.message ?? e}`, 'err', 5000);
    return undefined;
  }
}

/** Like guard() for actions without a result: resolves true on success, false (after showing the error) on failure. */
export async function attempt(fn: () => Promise<unknown>, failMsg = 'Something went wrong'): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    console.error(e);
    toast(`${failMsg}: ${(e as Error)?.message ?? e}`, 'err', 5000);
    return false;
  }
}

export function busy(message: string): { close(): void; set(msg: string): void } {
  const label = h('div', { class: 'busy-label' }, message);
  const el = h('div', { class: 'busy' }, h('div', { class: 'spinner' }), label);
  root.appendChild(el);
  return { close: () => el.remove(), set: (m) => (label.textContent = m) };
}
