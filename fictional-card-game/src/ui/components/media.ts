/**
 * Image display for ANY image size or aspect ratio.
 * Default framing is "contain": the whole image is always visible, centred over a blurred, darkened copy of itself
 * that fills the frame (no black bars, nothing cropped). Owners can switch an image to "cover" with a focal point.
 * Every displayed image can be opened full screen at its original resolution with zoom and pan.
 */
import { h, clear } from '../dom';
import { icon } from '../icons';
import { repo } from '../../store/repo';
import { mediaUrl } from '../../store/media';
import type { MediaRef } from '../../model/types';
import { fmtBytes } from '../../core/util';

export interface FitOpts {
  variant?: 'thumb' | 'full';
  cls?: string;
  alt?: string;
  zoomable?: boolean;
  /** Force a framing regardless of the ref (e.g. editor preview). */
  fit?: 'contain' | 'cover';
  empty?: () => Node;
}

export function fitImage(ref: MediaRef | null | undefined, o: FitOpts = {}): HTMLElement {
  const el = h('div', { class: `fimg loading ${o.cls ?? ''}` });
  const meta = ref ? repo.mediaMeta(ref.id) : undefined;
  if (!ref) {
    el.classList.remove('loading');
    el.classList.add('empty');
    el.appendChild(o.empty ? o.empty() : h('div', { class: 'fimg-empty' }, icon('image')));
    return el;
  }
  if (!meta) {
    el.classList.remove('loading');
    el.classList.add('missing');
    el.appendChild(h('div', { class: 'fimg-empty' }, icon('warn'), h('small', null, 'Image missing — replace it in the Database')));
    return el;
  }
  const fit = o.fit ?? ref.fit ?? 'contain';
  el.style.setProperty('--fx', `${ref.x ?? 50}%`);
  el.style.setProperty('--fy', `${ref.y ?? 50}%`);
  el.classList.add(`fit-${fit}`);
  const fg = h('img', { class: 'fimg-fg', alt: o.alt ?? '', draggable: 'false', decoding: 'async' }) as HTMLImageElement;
  const bg = fit === 'contain' ? (h('img', { class: 'fimg-bg', alt: '', 'aria-hidden': 'true', draggable: 'false', decoding: 'async' }) as HTMLImageElement) : null;
  if (bg) el.appendChild(bg);
  el.appendChild(fg);
  const variant = o.variant ?? 'thumb';
  fg.onload = () => el.classList.remove('loading');
  fg.onerror = () => {
    el.classList.remove('loading');
    el.classList.add('missing');
    clear(el);
    el.appendChild(h('div', { class: 'fimg-empty' }, icon('warn'), h('small', null, 'This image cannot be displayed — replace it in the Database')));
  };
  void mediaUrl(meta, variant).then((u) => {
    if (!u) {
      fg.onerror?.(new Event('error'));
      return;
    }
    fg.src = u;
  });
  if (bg) void mediaUrl(meta, 'thumb').then((u) => { if (u) bg.src = u; });
  if (o.zoomable) {
    el.classList.add('zoomable');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'View full image');
    el.tabIndex = 0;
    const open = (e: Event): void => {
      e.stopPropagation();
      openLightbox(ref, o.alt ?? meta.name);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
    el.appendChild(h('span', { class: 'fimg-zoom' }, icon('expand')));
  }
  return el;
}

/** Poster frame for a video (or a film icon when the browser could not extract one). */
export function videoPoster(ref: MediaRef | null | undefined, cls = ''): HTMLElement {
  const el = h('div', { class: `fimg vposter fit-contain ${cls}` });
  const meta = ref ? repo.mediaMeta(ref.id) : undefined;
  if (!ref || !meta) {
    el.appendChild(h('div', { class: 'fimg-empty' }, icon(ref ? 'warn' : 'video'), ref ? h('small', null, 'Video missing') : null));
    return el;
  }
  if (meta.hasThumb) {
    const img = h('img', { class: 'fimg-fg', alt: '' }) as HTMLImageElement;
    el.appendChild(img);
    void mediaUrl(meta, 'thumb').then((u) => { if (u) img.src = u; });
  } else el.appendChild(h('div', { class: 'fimg-empty' }, icon('video')));
  el.appendChild(h('span', { class: 'vposter-play' }, icon('play')));
  return el;
}

// ---------------------------------------------------------------- full-screen viewer

export function openLightbox(ref: MediaRef, title: string): void {
  const meta = repo.mediaMeta(ref.id);
  if (!meta) return;
  let scale = 1, tx = 0, ty = 0, natural = { w: meta.width, h: meta.height };
  const img = h('img', { class: 'lb-img', alt: title, draggable: 'false' }) as HTMLImageElement;
  const stage = h('div', { class: 'lb-stage' }, img);
  const info = h('span', { class: 'lb-info' }, `${meta.width} × ${meta.height}px · ${fmtBytes(meta.size)}`);
  const zoomLabel = h('span', { class: 'lb-zoom' }, '100%');
  const apply = (): void => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    const base = baseScale();
    zoomLabel.textContent = `${Math.round(scale * base * 100)}%`;
  };
  const baseScale = (): number => {
    const r = stage.getBoundingClientRect();
    return Math.min(1, r.width / natural.w, r.height / natural.h) || 1;
  };
  const clampPan = (): void => {
    const r = stage.getBoundingClientRect();
    const b = baseScale();
    const w = natural.w * b * scale, hh = natural.h * b * scale;
    const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (hh - r.height) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  };
  const zoomTo = (s: number, cx = 0, cy = 0): void => {
    const ns = Math.max(1, Math.min(12, s));
    tx = cx - ((cx - tx) * ns) / scale;
    ty = cy - ((cy - ty) * ns) / scale;
    scale = ns;
    clampPan();
    apply();
  };
  const fitBtn = h('button', { class: 'icon-btn', 'aria-label': 'Fit to screen', on: { click: () => { scale = 1; tx = ty = 0; apply(); } } }, icon('expand'));
  const oneBtn = h('button', { class: 'chip', on: { click: () => { const b = baseScale(); zoomTo(1 / b); } } }, '1:1');
  const wrap = h('div', { class: 'lightbox' },
    h('div', { class: 'lb-bar' },
      h('div', { class: 'lb-title' }, h('strong', null, title), info),
      h('div', { class: 'lb-tools' },
        h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', on: { click: () => zoomTo(scale / 1.5) } }, icon('zoomOut')),
        zoomLabel,
        h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', on: { click: () => zoomTo(scale * 1.5) } }, icon('zoomIn')),
        oneBtn, fitBtn,
        h('button', { class: 'icon-btn', 'aria-label': 'Close', on: { click: () => close() } }, icon('close')))),
    stage,
    h('div', { class: 'lb-hint' }, 'Pinch, scroll or double-tap to zoom · drag to pan'));
  const close = (): void => {
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 200);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
    if (e.key === '+' || e.key === '=') zoomTo(scale * 1.4);
    if (e.key === '-') zoomTo(scale / 1.4);
  };
  document.addEventListener('keydown', onKey);
  // pointer gestures
  const pts = new Map<number, { x: number; y: number }>();
  let lastDist = 0, lastTap = 0, moved = false;
  const center = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      lastDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      if (Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 2) moved = true;
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      clampPan();
      apply();
    }
    pts.set(e.pointerId, cur);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (lastDist > 0) {
        const mid = center({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 });
        zoomTo(scale * (d / lastDist), mid.x, mid.y);
      }
      lastDist = d;
      moved = true;
    }
  });
  const up = (e: PointerEvent): void => {
    pts.delete(e.pointerId);
    if (pts.size < 2) lastDist = 0;
    if (!moved && pts.size === 0) {
      const now = Date.now();
      if (now - lastTap < 320) {
        const c = center(e);
        scale > 1.2 ? (scale = 1, tx = ty = 0, apply()) : zoomTo(2.5, c.x, c.y);
        lastTap = 0;
      } else lastTap = now;
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const c = center(e);
    zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), c.x, c.y);
  }, { passive: false });
  img.onload = () => {
    natural = { w: img.naturalWidth || meta.width, h: img.naturalHeight || meta.height };
    img.style.width = `${natural.w}px`;
    img.style.height = `${natural.h}px`;
    const fitNow = (): void => {
      const b = baseScale();
      img.style.width = `${natural.w * b}px`;
      img.style.height = `${natural.h * b}px`;
      apply();
    };
    fitNow();
    new ResizeObserver(fitNow).observe(stage);
  };
  img.onerror = () => {
    stage.replaceChildren(h('div', { class: 'fimg-empty' }, icon('warn'), h('p', null, 'This image cannot be displayed by this browser.')));
  };
  void mediaUrl(meta, 'full').then((u) => { if (u) img.src = u; });
  document.body.appendChild(wrap);
}
