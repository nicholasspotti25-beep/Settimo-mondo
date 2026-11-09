/** Pack opening: tear the pack, reveal five cards one at a time with rarity-escalating effects, then a summary. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import { back, go, type Screen } from '../../router';
import { topbar, emptyState } from '../../components/common';
import { btn, guard } from '../../overlay';
import { repo } from '../../../store/repo';
import { cardBack, cardView } from '../../components/card';
import { playCutscene } from '../../components/cutscene';
import { burst, burstAt } from '../../components/fx';
import { sfx } from '../../sound';
import { PACK_PRICE } from '../../../engines/pack';
import { atLeast, maxRarity } from '../../../engines/rarity';
import { EDITION_LABEL, RARITY_LABEL, type PackRecord, type PlayerId, type PulledCard, type Rarity } from '../../../model/types';
import { animePack, openOne, purchase } from './actions';
import { omniversalCinematic } from './omni';

const COLORS: Record<Rarity, string[]> = {
  common: ['#ffffff', '#cfd6e4'],
  rare: ['#3e9cff', '#a8d6ff', '#ffffff'],
  epic: ['#ad69ff', '#e4c6ff', '#ffffff'],
  legendary: ['#f4b941', '#fff1bd', '#ffffff'],
  mythic: ['#ff4f6e', '#ffb36b', '#ffd1a6'],
  secret: ['#ff86e4', '#86e8ff', '#fff27a', '#7dffb0', '#c7a8ff'],
  omniversal: ['#ffd76e', '#8f63ff', '#86e8ff', '#ffffff'],
};

export function openScreen(params: { player: PlayerId; packId: string; summary?: boolean }): Screen {
  const el = h('div', { class: 'opening' });
  const pid = params.player;
  const pack: PackRecord | undefined = repo.player(pid).packs.find((p) => p.id === params.packId);
  let speed = repo.settings.revealSpeed || 1;
  let idx = 0;
  let revealed = false;
  let busyAnim = false;
  let phase: 'pack' | 'reveal' | 'summary' = params.summary ? 'summary' : 'pack';
  const stage = h('div', { class: 'op-stage' });
  const tray = h('div', { class: 'op-tray' });
  const controls = h('div', { class: 'op-controls' });
  const body = h('div', { class: 'op-body' });
  const ms = (x: number): number => x / speed;
  const wait = (x: number): Promise<void> => new Promise((r) => setTimeout(r, ms(x)));

  const markDone = (): void => {
    if (repo.player(pid).pendingReveal === params.packId) {
      void guard(() => repo.mutate([pid], (ps) => { if (ps[pid].pendingReveal === params.packId) ps[pid].pendingReveal = null; }), 'Could not update');
    }
  };

  const renderControls = (): void => {
    replace(controls,
      h('div', { class: 'seg small', 'aria-label': 'Animation speed' }, ...[1, 2, 4].map((s) => h('button', { class: speed === s ? 'on' : '', on: { click: () => { speed = s; el.style.setProperty('--spd', String(s)); renderControls(); } } }, `${s}×`))),
      phase === 'reveal' ? btn('Reveal all', () => void revealAll(), 'small ghost', 'ff') : null,
      phase !== 'summary' ? btn('Skip', () => toSummary(), 'small ghost', 'skip') : null);
  };

  const renderTray = (): void => {
    if (!pack) return;
    replace(tray, ...pack.cards.map((c, i) => {
      const e = repo.get('collector', c.entryId);
      if (i < idx || (i === idx && revealed)) return h('div', { class: `op-slot filled r-${c.rarity}` }, e ? cardView(e, c.edition, { size: 'xs' }) : h('div', { class: 'tcard sz-xs missing' }));
      return h('div', { class: `op-slot ${i === idx ? 'now' : ''}` }, h('div', { class: 'tcard sz-xs' }, cardBack()));
    }));
  };

  // ---------------------------------------------------------------- sealed pack
  const packView = (): void => {
    const pk = animePack('idle big');
    const hint = h('p', { class: 'op-hint' }, 'Tap or swipe across the pack to tear it open');
    const wrap = h('div', { class: 'op-pack', role: 'button', tabIndex: 0, 'aria-label': 'Open the pack' }, h('div', { class: 'pack-glow' }), pk);
    let sx = 0, dragging = false, torn = false;
    const tear = async (): Promise<void> => {
      if (torn) return;
      torn = true;
      sfx.tear();
      wrap.classList.add('tearing');
      burstAt(pk, { colors: ['#fff3c4', '#86e8ff', '#c7a8ff'], count: 60, speed: 8, kind: 'spark' });
      await wait(900);
      phase = 'reveal';
      idx = 0;
      revealed = false;
      renderControls();
      showCard();
    };
    wrap.addEventListener('pointerdown', (e) => { sx = e.clientX; dragging = true; wrap.setPointerCapture(e.pointerId); });
    wrap.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = Math.abs(e.clientX - sx);
      wrap.style.setProperty('--tear', String(Math.min(1, d / 160)));
      if (d > 120) { dragging = false; void tear(); }
    });
    wrap.addEventListener('pointerup', (e) => { if (dragging && Math.abs(e.clientX - sx) < 12) void tear(); dragging = false; wrap.style.setProperty('--tear', '0'); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') void tear(); });
    replace(stage, wrap, hint);
  };

  // ---------------------------------------------------------------- one card
  const showCard = (): void => {
    if (!pack) return;
    if (idx >= pack.cards.length) { toSummary(); return; }
    const c = pack.cards[idx]!;
    const e = repo.get('collector', c.entryId);
    revealed = false;
    renderTray();
    const back = h('div', { class: `op-face back hint-${c.rarity}` }, h('div', { class: 'tcard sz-xl op-back' }, cardBack()));
    const holder = h('div', { class: 'op-card' }, back);
    const rays = h('div', { class: `op-rays r-${c.rarity}` });
    const info = h('div', { class: 'op-info' });
    const hint = h('p', { class: 'op-hint' }, `Card ${idx + 1} of ${pack.cards.length} · tap to reveal`);
    const area = h('div', { class: `op-area rr-${c.rarity}` }, rays, holder);
    replace(stage, h('div', { class: 'op-count' }, `${idx + 1} / ${pack.cards.length}`), area, info, hint);
    if (atLeast(c.rarity, 'rare')) sfx.hint(c.rarity);
    const flip = async (): Promise<void> => {
      if (busyAnim) return;
      if (revealed) { idx++; showCard(); return; }
      busyAnim = true;
      try {
        if (c.rarity === 'omniversal' && e) {
          holder.classList.add('omni-shake');
          await wait(900);
          await omniversalCinematic(e, c.edition, speed);
        } else if (atLeast(c.rarity, 'secret')) {
          el.classList.add('darken');
          holder.classList.add('charge');
          await wait(900);
        } else if (atLeast(c.rarity, 'legendary')) {
          holder.classList.add('charge');
          await wait(550);
        }
        if (c.rarity !== 'omniversal') {
          holder.classList.add('flip-out');
          sfx.flip();
          await wait(220);
        }
        holder.classList.remove('charge', 'omni-shake', 'flip-out');
        const front = h('div', { class: 'op-face front' }, e ? cardView(e, c.edition, { size: 'xl', variant: 'full', tilt: true }) : h('div', { class: 'tcard sz-xl missing' }));
        replace(holder, front);
        holder.classList.add('flip-in');
        area.classList.add('revealed');
        revealed = true;
        effects(c, holder);
        replace(info,
          h('div', { class: `op-banner r-${c.rarity}` }, RARITY_LABEL[c.rarity].toUpperCase()),
          h('h2', { class: 'display' }, c.name),
          h('div', { class: 'row center' },
            h('span', { class: `badge ${c.edition === 'alt' ? 'gold' : 'blue'}` }, EDITION_LABEL[c.edition]),
            c.isNew ? h('span', { class: 'badge ok' }, icon('sparkle'), 'NEW') : h('span', { class: 'badge' }, `Duplicate · ×${c.qtyAfter}`),
            c.pity ? h('span', { class: 'badge warn' }, icon('shield'), 'Pity guarantee') : null));
        hint.textContent = idx + 1 < pack.cards.length ? 'Tap to continue' : 'Tap to see your pack';
        renderTray();
        await wait(420);
        holder.classList.remove('flip-in');
      } finally {
        busyAnim = false;
        el.classList.remove('darken');
      }
    };
    area.addEventListener('click', () => void flip());
    hint.addEventListener('click', () => void flip());
  };

  const effects = (c: PulledCard, target: HTMLElement): void => {
    sfx.reveal(c.rarity);
    const col = COLORS[c.rarity];
    const r = c.rarity;
    if (r === 'common') burstAt(target, { colors: col, count: 14, speed: 3, size: 2 });
    else if (r === 'rare') burstAt(target, { colors: col, count: 30, speed: 5, size: 2.5 });
    else if (r === 'epic') { burstAt(target, { colors: col, count: 50, speed: 6.5, size: 3 }); flash('epic'); }
    else if (r === 'legendary') { burstAt(target, { colors: col, count: 80, speed: 8, kind: 'star', size: 4.5 }); flash('legendary'); }
    else if (r === 'mythic') {
      burstAt(target, { colors: col, count: 90, speed: 8, size: 3.5 });
      const rr = target.getBoundingClientRect();
      for (let i = 0; i < 4; i++) setTimeout(() => burst(rr.left + Math.random() * rr.width, rr.bottom, { colors: col, count: 18, speed: 2.5, kind: 'ember', size: 3, life: 110 }), i * 160);
      flash('mythic');
      shake();
    } else if (r === 'secret') {
      burstAt(target, { colors: col, count: 140, speed: 10, kind: 'star', size: 4.5, life: 90 });
      flash('secret');
      shake();
    } else {
      burstAt(target, { colors: col, count: 120, speed: 9, kind: 'star', size: 5, life: 90 });
    }
  };
  const flash = (r: Rarity): void => {
    const f = h('div', { class: `op-flash f-${r}` });
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  };
  const shake = (): void => {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  };

  const revealAll = async (): Promise<void> => {
    if (!pack) return;
    const prev = speed;
    speed = Math.max(speed, 4);
    el.style.setProperty('--spd', String(speed));
    while (phase === 'reveal' && idx < pack.cards.length) {
      if (busyAnim) { await new Promise((r) => setTimeout(r, 60)); continue; }
      if (!revealed) {
        (stage.querySelector('.op-area') as HTMLElement | null)?.click();
        await new Promise((r) => setTimeout(r, 30));
        while (busyAnim) await new Promise((r) => setTimeout(r, 60));
        await wait(1200);
      } else {
        idx++;
        if (idx < pack.cards.length) showCard();
      }
    }
    speed = prev;
    el.style.setProperty('--spd', String(speed));
    if (phase === 'reveal') toSummary();
  };

  // ---------------------------------------------------------------- summary
  const toSummary = (): void => {
    phase = 'summary';
    markDone();
    renderControls();
    summaryView();
  };

  const summaryView = (): void => {
    if (!pack) return;
    const p = repo.player(pid);
    const best = maxRarity(pack.cards.map((c) => c.rarity));
    const newCount = pack.cards.filter((c) => c.isNew).length;
    const omnis = pack.cards.filter((c) => c.rarity === 'omniversal');
    const canOpenAnother = p.unopenedPacks > 0;
    const canBuy = p.fc >= PACK_PRICE;
    replace(stage,
      h('div', { class: 'op-summary' },
        h('h2', { class: 'display' }, 'Your pack'),
        h('p', { class: 'muted' }, `${newCount} new · best: `, h('b', { class: `rtext r-${best}` }, RARITY_LABEL[best]), pack.pityApplied ? ` · pity guaranteed a ${RARITY_LABEL[pack.pityApplied]}` : ''),
        h('div', { class: 'sum-cards' }, ...pack.cards.map((c) => {
          const e = repo.get('collector', c.entryId);
          return h('div', { class: 'sum-card' },
            e ? cardView(e, c.edition, { size: 'md', isNew: c.isNew, qty: c.qtyAfter, onClick: () => go('card', { entryId: e.id, edition: c.edition }) }) : h('div', { class: 'tcard sz-md missing' }),
            h('small', { class: `rtext r-${c.rarity}` }, `${RARITY_LABEL[c.rarity]}${c.edition === 'alt' ? ' · Alt Art' : ''}`),
            c.rarity === 'omniversal' && e?.cutscene ? h('button', { class: 'chip', on: { click: () => void playCutscene(e.cutscene!, { title: e.name, subtitle: 'Omniversal' }) } }, icon('play'), 'Cutscene') : null);
        })),
        h('p', { class: 'hint' }, 'All cards were saved to your collection the moment the pack was opened. Duplicates can be converted into FC in My Collection.'),
        omnis.length ? h('p', { class: 'gold-text center-text' }, 'An Omniversal card! The rarest card in the game.') : null,
        h('div', { class: 'row center' },
          canOpenAnother ? btn(`Open another (${p.unopenedPacks})`, () => void openOne(), 'primary big', 'sparkle')
            : btn(`Buy & open (${PACK_PRICE} FC)`, async () => { if (await purchase(1)) await openOne(); }, 'gold big', 'shop', canBuy ? {} : { disabled: true }),
          btn('My Collection', () => go('collection'), 'ghost big', 'book'),
          btn('Done', () => void back(), 'ghost big', 'check'))));
    replace(tray);
  };

  const start = (): void => {
    el.style.setProperty('--spd', String(speed));
    if (!pack) {
      replace(body, emptyState('pack', 'Pack not found', 'This pack is no longer in the pack history.', btn('Back', () => void back(), 'primary')));
      return;
    }
    renderControls();
    if (phase === 'summary') summaryView();
    else packView();
  };

  el.append(topbar({ title: 'Anime Pack', sub: pack ? `${repo.player(pid).name} · cards already saved` : '', right: [controls] }), body);
  body.append(stage, tray);
  start();
  return {
    el,
    dispose: () => { if (phase !== 'summary' && pack) { /* reveal can be resumed from Card Collector → Open Pack */ } },
  };
}
