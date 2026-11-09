/** Trading-card rendering: one frame design per rarity, an exclusive cosmic frame for Omniversal, card backs and silhouettes. */
import { h, svg } from '../dom';
import { EMBLEM } from '../icons';
import { fitImage } from './media';
import { EDITION_LABEL, RARITY_LABEL, type CollectorEntry, type Edition, type Rarity } from '../../model/types';

const GEM: Record<Rarity, string> = {
  common: '<circle cx="12" cy="12" r="6"/>',
  rare: '<path d="M12 4l7 8-7 8-7-8z"/>',
  epic: '<path d="M12 3.5l7.4 4.3v8.4L12 20.5l-7.4-4.3V7.8z"/>',
  legendary: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
  mythic: '<path d="M12 2.5c1.5 3.5 6 5.6 6 10.5a6 6 0 0 1-12 0c0-2.6 1.4-4 2.6-5.3.3 1.7 1 2.8 2.2 3.3C10 8.5 10.8 5.2 12 2.5z"/>',
  secret: '<path d="M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',
  omniversal: '<circle cx="12" cy="12" r="8.5" fill="none" stroke-width="1.6"/><path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3-7.3-2.2 7.3-2.2z"/>',
};

export function rarityGem(r: Rarity, cls = 'gem'): SVGSVGElement {
  return svg(`<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0.6">${GEM[r]}</svg>`, `${cls} gem-${r}`);
}

export function rarityPill(r: Rarity): HTMLElement {
  return h('span', { class: `rpill r-${r}` }, rarityGem(r, 'gem sm'), RARITY_LABEL[r]);
}

const SILHOUETTE = `<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMax meet"><defs><linearGradient id="silg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2550"/><stop offset="1" stop-color="#0b0e24"/></linearGradient></defs><path fill="url(#silg)" d="M50 20c11 0 19 9 19 21 0 9-4 16-10 19 15 4 27 15 31 30l6 50H4l6-50c4-15 16-26 31-30-6-3-10-10-10-19 0-12 8-21 19-21z"/><text x="50" y="52" text-anchor="middle" font-size="22" font-family="serif" fill="#3a4282">?</text></svg>`;

const OMNI_CORNER = `<svg viewBox="0 0 40 40" fill="none"><path d="M2 38V14C2 7 7 2 14 2h24" stroke="url(#ocg)" stroke-width="2.2"/><path d="M7 38V17c0-5.5 4.5-10 10-10h21" stroke="url(#ocg)" stroke-width="1" opacity=".7"/><circle cx="14" cy="14" r="3.2" fill="url(#ocg)"/><path d="M14 6.5l1.2 4.3 4.3 1.2-4.3 1.2L14 21.5l-1.2-4.3L8.5 16l4.3-1.2z" fill="#fff6d8" opacity=".9" transform="translate(0 -2) scale(.75) translate(4.6 4.6)"/><defs><linearGradient id="ocg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e8c46a"/><stop offset="1" stop-color="#8f6420"/></linearGradient></defs></svg>`;

export interface CardOpts {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  owned?: boolean;
  qty?: number;
  isNew?: boolean;
  hideName?: boolean;
  variant?: 'thumb' | 'full';
  zoomable?: boolean;
  tilt?: boolean;
  onClick?: () => void;
}

export function artOf(e: CollectorEntry, edition: Edition) {
  return edition === 'alt' && e.altArt ? e.altArt : e.normalArt;
}

export function cardView(e: CollectorEntry, edition: Edition, o: CardOpts = {}): HTMLElement {
  const r: Rarity = e.rarity ?? 'common';
  const owned = o.owned !== false;
  const art = owned
    ? fitImage(artOf(e, edition), { variant: o.variant ?? 'thumb', alt: e.name, zoomable: o.zoomable, cls: 'tc-img' })
    : h('div', { class: 'tc-sil', html: SILHOUETTE });
  const name = owned || !o.hideName ? e.name : '???';
  const omni = r === 'omniversal';
  const el = h('div', {
    class: `tcard r-${r} ed-${edition} sz-${o.size ?? 'md'} ${owned ? 'owned' : 'missing'} ${o.onClick ? 'clickable' : ''}`,
    role: o.onClick ? 'button' : undefined,
    tabIndex: o.onClick ? 0 : undefined,
    'aria-label': `${name}, ${RARITY_LABEL[r]}, ${EDITION_LABEL[edition]}${owned ? '' : ', not owned'}`,
  },
    h('div', { class: 'tc-frame' },
      omni ? h('div', { class: 'tc-cosmos' }, h('i', { class: 'stars s1' }), h('i', { class: 'stars s2' }), h('i', { class: 'nebula' })) : null,
      h('div', { class: 'tc-inner' },
        h('div', { class: 'tc-art' }, art),
        owned && (r === 'legendary' || r === 'mythic' || r === 'secret' || omni || edition === 'alt') ? h('div', { class: 'tc-foil' }) : null,
        h('div', { class: 'tc-top' },
          rarityGem(r),
          edition === 'alt' ? h('span', { class: 'tc-ed' }, 'ALT ART') : null),
        h('div', { class: 'tc-plate' },
          h('div', { class: 'tc-name' }, name),
          h('div', { class: 'tc-rar' }, RARITY_LABEL[r].toUpperCase()))),
      omni ? h('div', { class: 'tc-omni' },
        ...['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: `oc oc-${p}`, html: OMNI_CORNER })),
        h('i', { class: 'oemb', html: EMBLEM })) : null),
    o.qty && o.qty > 1 ? h('span', { class: 'tc-qty' }, `×${o.qty}`) : null,
    o.isNew ? h('span', { class: 'tc-new' }, 'NEW') : null);
  if (o.onClick) {
    el.addEventListener('click', o.onClick);
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') o.onClick!(); });
  }
  if (o.tilt) attachTilt(el);
  return el;
}

/** Pointer-driven 3D tilt and moving foil highlight. */
export function attachTilt(el: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.add('tilt');
  const move = (e: PointerEvent): void => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - py) * 16}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 20}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', () => {
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '30%');
  });
}

export function cardBack(cls = ''): HTMLElement {
  return h('div', { class: `tback ${cls}` },
    h('div', { class: 'tb-pattern' }),
    h('div', { class: 'tb-ring' }),
    h('i', { class: 'tb-emblem', html: EMBLEM }),
    h('div', { class: 'tb-word' }, 'FICTIONAL'));
}
