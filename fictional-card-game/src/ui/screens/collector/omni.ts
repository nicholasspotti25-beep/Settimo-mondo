/**
 * The Omniversal cinematic: the ordinary reveal pauses, a cosmic warp opens a portal, the OMNIVERSAL emblem forms,
 * the card descends and flips. Then its (mandatory) cutscene plays. Every step is skippable; the card is already saved.
 */
import { h } from '../../dom';
import { EMBLEM } from '../../icons';
import { cardView } from '../../components/card';
import { playCutscene } from '../../components/cutscene';
import { burst } from '../../components/fx';
import { sfx } from '../../sound';
import { EDITION_LABEL, type CollectorEntry, type Edition } from '../../../model/types';

const RING = (r: number, dash: string, w: number): string =>
  `<circle cx="100" cy="100" r="${r}" fill="none" stroke="url(#og)" stroke-width="${w}" stroke-dasharray="${dash}"/>`;

function warp(canvas: HTMLCanvasElement, speedRef: { v: number; on: boolean }): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const d = Math.min(2, devicePixelRatio || 1);
  const resize = (): void => { canvas.width = innerWidth * d; canvas.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  resize();
  const stars = Array.from({ length: 420 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
  const colors = ['#ffffff', '#ffe9a8', '#c8b4ff', '#9fe9ff'];
  const loop = (): void => {
    if (!speedRef.on) return;
    const w = innerWidth, hgt = innerHeight, cx = w / 2, cy = hgt / 2;
    ctx.fillStyle = 'rgba(3, 2, 12, 0.32)';
    ctx.fillRect(0, 0, w, hgt);
    for (const [i, s] of stars.entries()) {
      const pz = s.z;
      s.z -= 0.004 + speedRef.v * 0.02;
      if (s.z <= 0.02) { s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; s.z = 1; continue; }
      const k = 0.5 * Math.max(w, hgt);
      const x = cx + (s.x / s.z) * k, y = cy + (s.y / s.z) * k;
      const px = cx + (s.x / pz) * k, py = cy + (s.y / pz) * k;
      ctx.strokeStyle = colors[i % colors.length]!;
      ctx.globalAlpha = Math.min(1, (1 - s.z) * 1.4);
      ctx.lineWidth = Math.max(0.6, (1 - s.z) * 2.6);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  };
  loop();
}

export function omniversalCinematic(e: CollectorEntry, edition: Edition, speed: number): Promise<void> {
  return new Promise((resolve) => {
    sfx.cosmic();
    const ms = (x: number): number => x / speed;
    const canvas = h('canvas', { class: 'oc-warp' }) as HTMLCanvasElement;
    const speedRef = { v: 0.2, on: true };
    const portal = h('i', { class: 'oc-portal', html: `<svg viewBox="0 0 200 200"><defs><linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e8c46a"/><stop offset="1" stop-color="#8f63ff"/></linearGradient></defs>${RING(96, '2 6', 1.2)}<g class="r1">${RING(84, '30 8 4 8', 2.4)}</g><g class="r2">${RING(70, '1 4', 3)}</g><g class="r3">${RING(56, '60 14', 1.4)}</g></svg>` });
    const emblem = h('i', { class: 'oc-emblem', html: EMBLEM });
    const title = h('div', { class: 'oc-title' }, ...'OMNIVERSAL'.split('').map((c, i) => h('span', { style: { 'animation-delay': `${ms(i * 70)}ms` } }, c)));
    const card = cardView(e, edition, { size: 'xl', variant: 'full' });
    const cardWrap = h('div', { class: 'oc-card' }, card);
    const caption = h('div', { class: 'oc-caption' },
      h('b', { class: 'display' }, e.name),
      h('span', null, `Omniversal · ${EDITION_LABEL[edition]}`),
      h('small', null, 'Saved to your collection'));
    const skip = h('button', { class: 'btn cs-skip oc-skip' }, h('span', null, 'Skip'));
    const cont = h('button', { class: 'btn gold big oc-continue hidden' }, h('span', null, 'Play cutscene'));
    const wrap = h('div', { class: 'omni-cine', style: { '--spd': String(speed) } }, canvas, h('div', { class: 'oc-nebula' }), portal, emblem, title, cardWrap, caption, cont, skip);
    document.body.appendChild(wrap);
    warp(canvas, speedRef);
    const timers: number[] = [];
    const at = (t: number, fn: () => void): void => { timers.push(window.setTimeout(fn, ms(t))); };
    let done = false;
    let autoEnd = 0;
    const finishVisual = (): void => {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
      wrap.classList.add('s1', 's2', 's3', 's4', 's5', 'final');
      cont.classList.remove('hidden');
      skip.classList.add('hidden');
      // the cutscene is mandatory: it starts by itself shortly after the card is shown (or at once on "Play cutscene")
      clearTimeout(autoEnd);
      autoEnd = window.setTimeout(() => void end(), ms(2400));
    };
    const end = async (): Promise<void> => {
      if (done) return;
      done = true;
      clearTimeout(autoEnd);
      for (const t of timers) clearTimeout(t);
      wrap.classList.add('s1', 's2', 's3', 's4', 's5', 'final');
      cont.classList.add('hidden');
      if (e.cutscene) await playCutscene(e.cutscene, { title: e.name, subtitle: 'Omniversal' });
      speedRef.on = false;
      wrap.classList.add('out');
      setTimeout(() => { wrap.remove(); resolve(); }, 400);
    };
    at(200, () => { wrap.classList.add('s1'); speedRef.v = 0.6; });
    at(1300, () => { wrap.classList.add('s2'); speedRef.v = 1.4; });
    at(2500, () => {
      wrap.classList.add('s3');
      speedRef.v = 0.15;
      burst(innerWidth / 2, innerHeight / 2, { colors: ['#ffd76e', '#fff3c4', '#8f63ff', '#86e8ff'], count: 160, speed: 12, kind: 'star', size: 5, life: 90 });
    });
    at(3300, () => { wrap.classList.add('s4'); sfx.reveal('omniversal'); });
    at(4700, () => {
      wrap.classList.add('s5');
      burst(innerWidth / 2, innerHeight * 0.45, { colors: ['#ffd76e', '#ffffff', '#c7a8ff'], count: 120, speed: 9, kind: 'spark', size: 3.5, life: 80 });
    });
    at(6000, () => { finishVisual(); });
    skip.addEventListener('click', (ev) => { ev.stopPropagation(); finishVisual(); });
    cont.addEventListener('click', (ev) => { ev.stopPropagation(); void end(); });
  });
}
