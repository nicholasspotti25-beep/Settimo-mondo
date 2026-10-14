/** Tiny DOM helpers for the code-drawn UI (no framework). */

export type Child = Node | string | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an HTML element. Attributes starting with "on" are event listeners; `class` / `style` / `data-*` are set as-is. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) setAttrs(el, attrs);
  for (const c of children) append(el, c);
  return el;
}

/** Create an SVG element. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) setAttrs(el, attrs);
  for (const c of children) append(el, c);
  return el;
}

function setAttrs(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

export function append(el: Element, c: Child): void {
  if (c === null || c === undefined || c === false) return;
  el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Parse an SVG markup fragment (inner content of a 24x24 viewBox) into an <svg> element. */
export function svgIcon(inner: string, cls = 'sm-ico', viewBox = '0 0 24 24'): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
}

/** Set text only when it changed (avoids layout work in per-frame updates). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** Toggle a class only when the state changed. */
export function toggle(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Cached style writer: writes a style property only when the value changed. */
export class StyleCache {
  private last = new Map<string, string>();
  constructor(private el: HTMLElement | SVGElement) {}
  set(prop: string, value: string): void {
    if (this.last.get(prop) === value) return;
    this.last.set(prop, value);
    (this.el.style as any).setProperty(prop, value);
  }
}

export function fmtPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
