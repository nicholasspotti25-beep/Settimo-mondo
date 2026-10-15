/**
 * Character creator (Bible: "name and appearance are chosen with a simple creator; there are no classes"). Edits a
 * CharacterLook: name, build, height, skin, hair style, hair color, eyes, cloak. The preview is a code-drawn SVG figure
 * that uses the very palettes the Portatore model is built from (render/actors/portatore.ts), so the swatch you pick is
 * the color you get in the world. Rebuilt on input only, never per frame.
 */
import type { CharacterLook } from '../sim/gamestate';
import { CLOAK_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES } from '../render/actors/portatore';
import type { UiCtx } from './ctx';
import { h, setText, svgIcon } from './dom';
import { ICONS } from './icons';
import { pill, rangeCtl, uiSound } from './screen';

export const HAIR_STYLES = 6;
export const NAME_MAX = 16;

/* ------------------------------------------------------------------------------------------------ color helpers (pure) */

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix two hex colors (t = 0 -> a, 1 -> b). */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function pick(list: readonly string[], i: number): string {
  return list[((Math.round(i) % list.length) + list.length) % list.length];
}

/** Wrap an index into a palette of n entries (look values come from saves and imports). */
export function wrapIndex(i: number, n: number): number {
  return ((Math.round(i) % n) + n) % n;
}

/** Sanitize a look coming from the form (name trimmed and capped, sliders clamped, indices wrapped). */
export function sanitizeLook(l: CharacterLook, fallbackName: string): CharacterLook {
  const name = l.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || fallbackName;
  const c01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);
  return {
    name,
    build: c01(l.build),
    height: c01(l.height),
    skin: wrapIndex(l.skin, SKIN_TONES.length),
    hair: wrapIndex(l.hair, HAIR_STYLES),
    hairColor: wrapIndex(l.hairColor, HAIR_COLORS.length),
    eyes: wrapIndex(l.eyes, EYE_COLORS.length),
    cloak: wrapIndex(l.cloak, CLOAK_COLORS.length),
  };
}

/* ------------------------------------------------------------------------------------------------ the figure */

/**
 * SVG markup of the Portatore, front view, in a 0 0 200 320 box, feet on y = 296. Dawn light comes from the upper left:
 * every part has a lit and a shaded tone; a warm rim and the seed of light in the chest finish it.
 */
export function figureMarkup(look: CharacterLook): string {
  const skin = pick(SKIN_TONES, look.skin);
  const hair = pick(HAIR_COLORS, look.hairColor);
  const eye = pick(EYE_COLORS, look.eyes);
  const cloak = pick(CLOAK_COLORS, look.cloak);
  const style = wrapIndex(look.hair, HAIR_STYLES);
  const cloth = '#d8d0c2';
  const sw = 27 + Math.max(0, Math.min(1, look.build)) * 14; // half shoulder width
  const hw = sw - 7 + look.build * 3; // half waist width
  const sy = 0.93 + Math.max(0, Math.min(1, look.height)) * 0.12;
  const x = 100;
  const lit = (c: string, t = 0.22) => mixHex(c, '#fff4e0', t);
  const dark = (c: string, t = 0.42) => mixHex(c, '#160e22', t);

  const grad = (id: string, a: string, b: string, x2 = 1, y2 = 1) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const defs = `<defs>
${grad('cg-cloak', lit(cloak, 0.12), dark(cloak, 0.5), 0.6, 1)}
${grad('cg-mantle', lit(cloak, 0.3), dark(cloak, 0.25), 0.8, 1)}
${grad('cg-cloth', lit(cloth, 0.3), dark(cloth, 0.38), 0.9, 1)}
${grad('cg-skin', lit(skin, 0.18), dark(skin, 0.22), 1, 0.8)}
${grad('cg-hair', lit(hair, 0.28), dark(hair, 0.3), 0.7, 1)}
${grad('cg-boot', '#4a3a32', '#1e1612', 0.5, 1)}
<radialGradient id="cg-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2a8" stop-opacity=".55"/><stop offset=".55" stop-color="#f0a46c" stop-opacity=".16"/><stop offset="1" stop-color="#f0a46c" stop-opacity="0"/></radialGradient>
<radialGradient id="cg-ground" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".5"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>
<radialGradient id="cg-seed" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe8"/><stop offset=".35" stop-color="#ffe7a8"/><stop offset="1" stop-color="#ffc870" stop-opacity="0"/></radialGradient>
</defs>`;

  // cape behind the body: from the shoulders to a ragged hem
  const cw = sw + 20;
  const hem: string[] = [];
  const teeth = 9;
  for (let i = 0; i <= teeth; i++) {
    const tx = x + cw - (i / teeth) * cw * 2;
    const ty = 284 + (i % 2 ? -9 : 0) + Math.sin(i * 1.7) * 3;
    hem.push(`${tx.toFixed(1)} ${ty.toFixed(1)}`);
  }
  const cape = `<path d="M${x - sw + 2} 100 C ${x - sw - 10} 150, ${x - cw - 4} 220, ${x - cw} 282 L ${hem.reverse().join(' L ')} L ${x + cw} 282 C ${x + cw + 4} 220, ${x + sw + 10} 150, ${x + sw - 2} 100 Z" fill="url(#cg-cloak)"/>`;

  // legs + boots
  const legs = [-1, 1].map((s) => {
    const lx = x + s * 11;
    return `<path d="M${lx - 8} 196 L ${lx + 8} 196 L ${lx + 7} 252 L ${lx - 7} 252 Z" fill="${dark(cloth, 0.55)}"/>`
      + `<path d="M${lx - 8} 250 L ${lx + 8} 250 L ${lx + 9 + s * 2} 292 Q ${lx + s * 3} 297 ${lx - 9 + s * 2} 292 Z" fill="url(#cg-boot)"/>`;
  }).join('');

  // arms (sleeves + hands)
  const arms = [-1, 1].map((s) => {
    const ax = x + s * (sw + 1);
    const hx = x + s * (sw + 9);
    return `<path d="M${ax - 7} 102 Q ${ax + s * 9} 140 ${hx + 6} 184 L ${hx - 6} 186 Q ${ax - s * 5} 146 ${ax - s * 9 + 2} 112 Z" fill="url(#cg-cloth)"/>`
      + `<ellipse cx="${hx}" cy="${191}" rx="6" ry="7.5" fill="url(#cg-skin)"/>`;
  }).join('');

  // tunic: shoulders -> belt -> flared hem
  const tunic = `<path d="M${x - sw} 102 Q ${x} 90 ${x + sw} 102 L ${x + hw} 156 L ${x + hw + 9} 212 Q ${x} 220 ${x - hw - 9} 212 L ${x - hw} 156 Z" fill="url(#cg-cloth)"/>`
    + `<path d="M${x} 124 L ${x} 214" stroke="${dark(cloth, 0.3)}" stroke-width="1" opacity=".5"/>`
    + `<path d="M${x - hw - 1} 154 L ${x + hw + 1} 154 L ${x + hw + 1.6} 161 L ${x - hw - 1.6} 161 Z" fill="#7a5a3a"/>`
    + `<rect x="${x - 4}" y="153" width="8" height="9" rx="1.5" fill="#d8b870"/>`;

  // mantle over the shoulders in the cloak color, gold clasp
  const mantle = `<path d="M${x - sw - 7} 112 Q ${x - sw - 4} 96 ${x - 12} 90 L ${x + 12} 90 Q ${x + sw + 4} 96 ${x + sw + 7} 112 Q ${x + sw - 4} 122 ${x + 10} 108 L ${x} 116 L ${x - 10} 108 Q ${x - sw + 4} 122 ${x - sw - 7} 112 Z" fill="url(#cg-mantle)"/>`
    + `<circle cx="${x}" cy="104" r="3.4" fill="#d8b870" stroke="#fff3d2" stroke-width=".8"/>`;

  // the seed of light in the chest
  const seed = `<circle cx="${x}" cy="130" r="11" fill="url(#cg-seed)"/><circle cx="${x}" cy="130" r="2.6" fill="#fffbe8"/>`
    + `<circle cx="${x}" cy="130" r="4.6" fill="none" stroke="#d8b870" stroke-width="1.1"/>`;

  // neck + head + face
  const hy = 62;
  const neck = `<path d="M${x - 6} 74 L ${x + 6} 74 L ${x + 7} 94 L ${x - 7} 94 Z" fill="${dark(skin, 0.18)}"/>`;
  const head = `<ellipse cx="${x}" cy="${hy}" rx="14.5" ry="17.5" fill="url(#cg-skin)"/>`
    + `<ellipse cx="${x - 14}" cy="${hy + 2}" rx="2.6" ry="4.2" fill="${dark(skin, 0.12)}"/><ellipse cx="${x + 14}" cy="${hy + 2}" rx="2.6" ry="4.2" fill="${dark(skin, 0.2)}"/>`;
  const face = [-1, 1].map((s) => `<ellipse cx="${x + s * 5.6}" cy="${hy + 1}" rx="2.5" ry="1.7" fill="#f6efe2"/><circle cx="${x + s * 5.6}" cy="${hy + 1}" r="1.45" fill="${eye}"/><circle cx="${x + s * 5.6 - 0.5}" cy="${hy + 0.5}" r=".45" fill="#fff"/>`
    + `<path d="M${x + s * 3} ${hy - 4} Q ${x + s * 6} ${hy - 5.6} ${x + s * 9} ${hy - 4}" stroke="${dark(hair, 0.1)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`).join('')
    + `<path d="M${x} ${hy + 3} L ${x - 1.4} ${hy + 8} L ${x + 1} ${hy + 8.4}" stroke="${dark(skin, 0.35)}" stroke-width=".9" fill="none" stroke-linecap="round"/>`
    + `<path d="M${x - 3.6} ${hy + 11.6} Q ${x} ${hy + 13} ${x + 3.6} ${hy + 11.6}" stroke="${dark(skin, 0.45)}" stroke-width="1" fill="none" stroke-linecap="round"/>`;

  // hair: back layer (behind the head) + front layer
  let hairBack = '';
  let hairFront = '';
  const cap = (r: number) => `<path d="M${x - 15.5 * r} ${hy + 2} C ${x - 17 * r} ${hy - 22 * r}, ${x + 17 * r} ${hy - 22 * r}, ${x + 15.5 * r} ${hy + 2} Q ${x + 12} ${hy - 9} ${x + 2} ${hy - 11} Q ${x - 10} ${hy - 10} ${x - 15.5 * r} ${hy + 2} Z" fill="url(#cg-hair)"/>`;
  switch (style) {
    case 0: // cropped
      hairFront = cap(1.0);
      break;
    case 1: // short locks over the brow
      hairFront = cap(1.04) + `<path d="M${x - 12} ${hy - 9} Q ${x - 9} ${hy - 2} ${x - 4} ${hy - 4} Q ${x - 1} ${hy - 10} ${x + 4} ${hy - 7} Q ${x + 8} ${hy - 3} ${x + 12} ${hy - 6} L ${x + 10} ${hy - 13} L ${x - 10} ${hy - 14} Z" fill="url(#cg-hair)"/>`;
      break;
    case 2: // long tail falling behind the shoulders
      hairBack = `<path d="M${x - 16} ${hy - 4} Q ${x - 22} ${hy + 30} ${x - 14} ${hy + 64} L ${x + 14} ${hy + 64} Q ${x + 22} ${hy + 30} ${x + 16} ${hy - 4} Z" fill="url(#cg-hair)"/>`;
      hairFront = cap(1.06);
      break;
    case 3: // braid over the right shoulder, gold ring
      hairFront = cap(1.05) + `<path d="M${x + 13} ${hy + 4} Q ${x + 22} ${hy + 30} ${x + 18} ${hy + 70}" stroke="url(#cg-hair)" stroke-width="7" fill="none" stroke-linecap="round"/>`
        + [0, 1, 2, 3, 4].map((i) => `<path d="M${x + 14 + i * 1.2} ${hy + 12 + i * 11} l 5 4" stroke="${dark(hair, 0.35)}" stroke-width="1" fill="none"/>`).join('')
        + `<ellipse cx="${x + 18.6}" cy="${hy + 62}" rx="4.6" ry="2.2" fill="#d8b870" stroke="#fff3d2" stroke-width=".6"/>`;
      break;
    case 4: // tousled
      hairBack = `<path d="M${x - 19} ${hy + 8} Q ${x - 24} ${hy - 6} ${x - 16} ${hy - 20} Q ${x} ${hy - 32} ${x + 16} ${hy - 20} Q ${x + 24} ${hy - 6} ${x + 19} ${hy + 8} Q ${x + 12} ${hy + 18} ${x} ${hy - 4} Q ${x - 12} ${hy + 18} ${x - 19} ${hy + 8} Z" fill="url(#cg-hair)"/>`;
      hairFront = cap(1.1) + [-12, -6, 0, 6, 12].map((o, i) => `<path d="M${x + o - 3} ${hy - 12} Q ${x + o + (i % 2 ? 4 : -4)} ${hy - 3} ${x + o + 2} ${hy - 1} Q ${x + o + 1} ${hy - 8} ${x + o + 4} ${hy - 13} Z" fill="url(#cg-hair)"/>`).join('');
      break;
    default: // shaved: a faint shadow of the hairline
      hairFront = `<path d="M${x - 14.6} ${hy - 1} C ${x - 16} ${hy - 21}, ${x + 16} ${hy - 21}, ${x + 14.6} ${hy - 1} Q ${x} ${hy - 14} ${x - 14.6} ${hy - 1} Z" fill="${hair}" opacity=".22"/>`;
      break;
  }

  // warm rim light on the left edge of the silhouette
  const rim = `<path d="M${x - sw - 7} 112 Q ${x - cw - 2} 200 ${x - cw} 282" stroke="#ffd9a0" stroke-width="1.4" fill="none" opacity=".55"/>`
    + `<path d="M${x - 14.4} ${hy + 4} Q ${x - 15} ${hy - 12} ${x - 6} ${hy - 17}" stroke="#ffe6b8" stroke-width="1.1" fill="none" opacity=".6"/>`;

  const body = `<g transform="translate(0 ${(296 * (1 - sy)).toFixed(2)}) scale(1 ${sy.toFixed(3)})">${cape}${legs}${hairBack}${arms}${tunic}${mantle}${seed}${neck}${head}${face}${hairFront}${rim}</g>`;
  return `${defs}<ellipse cx="${x}" cy="296" rx="62" ry="9" fill="url(#cg-ground)"/><circle cx="${x}" cy="${(62 * sy + 296 * (1 - sy)).toFixed(1)}" r="64" fill="url(#cg-halo)"/>${body}`;
}

/* ------------------------------------------------------------------------------------------------ the creator screen */

export interface CreatorHost {
  /** Back to the title (no game started). */
  cancel(): void;
  /** Begin the journey with this look. */
  begin(look: CharacterLook): void;
}

export class CharacterCreator {
  readonly el: HTMLElement;
  private look: CharacterLook;
  private fig!: SVGSVGElement;
  private ttl: HTMLElement;
  private sub: HTMLElement;
  private body: HTMLElement;

  constructor(private ctx: UiCtx, private host: CreatorHost, initial: CharacterLook) {
    this.look = { ...initial };
    const back = h('button', { class: 'sm-iconbtn', type: 'button' }, svgIcon(ICONS.back));
    back.addEventListener('click', () => {
      uiSound(ctx, 'back');
      host.cancel();
    });
    this.ttl = h('div', { class: 'ttl' });
    this.sub = h('div', { class: 'sub' });
    this.body = h('div', { class: 'sm-creator' });
    this.el = h('div', { class: 'sm-screen clear sm-hidden' },
      h('div', { class: 'sm-head' }, back, this.ttl, this.sub),
      h('div', { class: 'sm-rule' }),
      this.body);
  }

  get visible(): boolean {
    return !this.el.classList.contains('sm-hidden');
  }

  open(initial: CharacterLook): void {
    this.look = { ...initial, name: '' };
    this.build();
    this.el.classList.remove('sm-hidden');
  }

  close(): void {
    this.el.classList.add('sm-hidden');
  }

  relabel(): void {
    if (this.visible) this.build();
  }

  private paint(): void {
    this.fig.innerHTML = figureMarkup(this.look);
  }

  private build(): void {
    const { t } = this.ctx;
    const L = this.look;
    setText(this.ttl, t('ui.creator.title'));
    setText(this.sub, t('ui.creator.sub'));
    this.body.textContent = '';
    const changed = () => this.paint();

    const name = h('input', { class: 'sm-input', type: 'text', maxlength: NAME_MAX, placeholder: t('ui.creator.name_default'), autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done' }) as HTMLInputElement;
    name.value = L.name;
    name.addEventListener('input', () => {
      L.name = name.value;
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') name.blur();
    });

    const word = (v: number, k: string) => t(`ui.creator.${k}_${v < 0.34 ? 'a' : v < 0.67 ? 'b' : 'c'}`);
    const build = rangeCtl(0, 1, 0.05, L.build, (v) => word(v, 'build'), (v) => {
      L.build = v;
      changed();
    });
    const height = rangeCtl(0, 1, 0.05, L.height, (v) => word(v, 'height'), (v) => {
      L.height = v;
      changed();
    });

    const swatches = (list: readonly string[], get: () => number, set: (i: number) => void, label: string): HTMLElement => {
      const el = h('div', { class: 'sm-swatches', role: 'radiogroup', 'aria-label': label });
      list.forEach((c, i) => {
        const b = h('button', { class: `sm-sw${i === get() ? ' sel' : ''}`, type: 'button', style: `background:radial-gradient(circle at 35% 30%, ${mixHex(c, '#ffffff', 0.25)}, ${c} 60%, ${mixHex(c, '#000000', 0.3)})`, 'aria-label': `${label} ${i + 1}` });
        b.addEventListener('click', () => {
          for (const s of Array.from(el.children)) s.classList.toggle('sel', s === b);
          uiSound(this.ctx, 'move');
          set(i);
          changed();
        });
        el.appendChild(b);
      });
      return el;
    };

    const chips = h('div', { class: 'sm-chips' });
    for (let i = 0; i < HAIR_STYLES; i++) {
      const b = h('button', { class: `sm-chip${i === L.hair ? ' sel' : ''}`, type: 'button' }, t(`ui.creator.hair_${i}`));
      b.addEventListener('click', () => {
        for (const s of Array.from(chips.children)) s.classList.toggle('sel', s === b);
        uiSound(this.ctx, 'move');
        L.hair = i;
        changed();
      });
      chips.appendChild(b);
    }

    const field = (label: string, ctl: HTMLElement, val?: HTMLElement) =>
      h('div', { class: 'sm-cfield' }, h('div', { class: 'lab' }, label, val ?? null), ctl);

    const form = h('div', { class: 'form' },
      field(t('ui.creator.name'), name),
      h('div', { class: 'sm-cpair' }, field(t('ui.creator.build'), build.el, build.val), field(t('ui.creator.height'), height.el, height.val)),
      field(t('ui.creator.skin'), swatches(SKIN_TONES, () => L.skin, (i) => { L.skin = i; }, t('ui.creator.skin'))),
      field(t('ui.creator.hair'), chips),
      field(t('ui.creator.hair_color'), swatches(HAIR_COLORS, () => L.hairColor, (i) => { L.hairColor = i; }, t('ui.creator.hair_color'))),
      field(t('ui.creator.eyes'), swatches(EYE_COLORS, () => L.eyes, (i) => { L.eyes = i; }, t('ui.creator.eyes'))),
      field(t('ui.creator.cloak'), swatches(CLOAK_COLORS, () => L.cloak, (i) => { L.cloak = i; }, t('ui.creator.cloak'))));

    this.fig = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.fig.setAttribute('viewBox', '0 0 200 310');
    this.fig.setAttribute('aria-hidden', 'true');
    const begin = pill(t('ui.creator.begin'), () => {
      name.blur();
      uiSound(this.ctx, 'confirm');
      this.host.begin(sanitizeLook(this.look, t('ui.creator.name_default')));
    }, { icon: ICONS.seed, cls: 'gold' });
    const prev = h('div', { class: 'prev' }, this.fig, h('div', { class: 'pt' }, t('ui.creator.note')), h('div', { class: 'sm-pills' }, begin));
    this.body.append(form, prev);
    this.paint();
  }
}
