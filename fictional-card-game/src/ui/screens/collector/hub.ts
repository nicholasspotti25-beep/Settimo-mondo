/** Card Collector main menu. */
import { h, replace } from '../../dom';
import { icon, type IconName } from '../../icons';
import { go, type Screen } from '../../router';
import { topbar, fcChip, progressBar, notice, dbLink } from '../../components/common';
import { repo } from '../../../store/repo';
import { dayKey } from '../../../core/time';
import { ACHIEVEMENT_IDS, achievementState, claimableCount, loginAvailable } from '../../../engines/economy';
import { PITY_THRESHOLDS } from '../../../engines/pack';
import { cardView } from '../../components/card';
import { active, animePack, loginModal, openOne } from './actions';
import { sfx } from '../../sound';

function tile(o: { ic: IconName; title: string; sub: string; onClick: () => void; badge?: string | null; cls?: string; art?: Node }): HTMLElement {
  return h('button', { class: `cc-tile ${o.cls ?? ''}`, on: { click: () => { sfx.tap(); o.onClick(); } } },
    o.art ?? h('span', { class: 'cc-ic' }, icon(o.ic)),
    h('span', { class: 'cc-text' }, h('b', null, o.title), h('small', null, o.sub)),
    o.badge ? h('span', { class: 'dot' }, o.badge) : null);
}

export function pityBars(pid = active()): HTMLElement {
  const p = repo.player(pid).pity;
  const row = (label: string, v: number, max: number, cls: string): HTMLElement => h('div', { class: `pity-row ${cls}` },
    h('span', null, label), progressBar(v, max), h('small', null, v >= max ? 'Guaranteed next pack' : `${v} / ${max} packs`));
  return h('div', { class: 'pity' },
    row('Legendary+', p.sinceLegendary, PITY_THRESHOLDS.legendary, 'r-legendary'),
    row('Mythic+', p.sinceMythic, PITY_THRESHOLDS.mythic, 'r-mythic'),
    row('Secret', p.sinceSecret, PITY_THRESHOLDS.secret, 'r-secret'),
    h('small', { class: 'dim' }, 'Omniversal has no pity — natural probability only.'));
}

export function collectorHub(): Screen {
  const el = h('div', { class: 'collector-hub' });
  const body = h('div', { class: 'wrap' });
  const prompted = new Set<string>();
  const render = (): void => {
    const pid = active();
    const p = repo.player(pid);
    const day = dayKey();
    const all = repo.collectibles();
    const owned = all.filter((c) => (p.collection[c.key]?.qty ?? 0) > 0).length;
    const totalCards = all.reduce((s, c) => s + (p.collection[c.key]?.qty ?? 0), 0);
    const rd = repo.readiness('collector');
    const claim = claimableCount(p, day);
    const missionsClaim = claim - achievementsClaimable(pid);
    const last = p.packs[0];
    el.querySelector('.topbar')?.replaceWith(topbar({ title: 'Card Collector', sub: 'Collect every card and edition', player: true }));
    replace(body,
      !rd.ok ? notice('warn', `Packs cannot be opened yet — ${rd.message}.`, dbLink('Card Collector database')) : null,
      h('div', { class: `cc-profile panel ${pid}` },
        h('div', { class: 'ccp-main' },
          h('span', { class: `ptag ${pid}` }, `${pid.toUpperCase()}`),
          h('h2', { class: 'display' }, p.name),
          fcChip(p.fc, 'big'),
          h('div', { class: 'ccp-prog' },
            h('div', { class: 'row' }, h('small', { class: 'grow muted' }, 'Collection'), h('b', null, `${owned} / ${all.length}`), h('small', { class: 'muted' }, all.length ? `${Math.round((owned / all.length) * 100)}%` : '')),
            progressBar(owned, all.length),
            h('small', { class: 'dim' }, `${totalCards} cards owned · ${p.unopenedPacks} unopened pack${p.unopenedPacks === 1 ? '' : 's'}`))),
        pityBars(pid)),
      h('div', { class: 'cc-grid' },
        tile({ ic: 'pack', title: 'Anime Pack', sub: '5 cards · 500 FC · odds & pity', onClick: () => go('pack'), cls: 'feature', art: animePack('mini') }),
        tile({ ic: 'sparkle', title: 'Open Pack', sub: p.pendingReveal ? 'Continue your reveal' : p.unopenedPacks ? `${p.unopenedPacks} ready to open` : 'Buy a pack first', onClick: () => void openOne(), badge: p.pendingReveal ? '!' : p.unopenedPacks ? String(p.unopenedPacks) : null, cls: 'glow' }),
        tile({ ic: 'book', title: 'My Collection', sub: `${owned} of ${all.length} editions`, onClick: () => go('collection') }),
        tile({ ic: 'shop', title: 'Shop', sub: 'Spend Fictional Coins', onClick: () => go('shop') }),
        tile({ ic: 'target', title: 'Missions', sub: loginAvailable(p, day) ? 'Login reward ready!' : 'Daily & weekly', onClick: () => go('missions'), badge: missionsClaim > 0 ? String(missionsClaim) : null }),
        tile({ ic: 'medal', title: 'Achievements', sub: 'One-time rewards', onClick: () => go('achievements'), badge: achievementsClaimable(pid) ? String(achievementsClaimable(pid)) : null })),
      last ? h('div', { class: 'panel' },
        h('div', { class: 'sec-title tight' }, h('h2', null, 'Last pack'), h('button', { class: 'chip', on: { click: () => go('open', { player: pid, packId: last.id, summary: true }) } }, 'View')),
        h('div', { class: 'recent-row' }, ...last.cards.map((c) => {
          const e = repo.get('collector', c.entryId);
          return e ? cardView(e, c.edition, { size: 'sm', isNew: c.isNew, onClick: () => go('card', { entryId: e.id, edition: c.edition }) }) : h('div', { class: 'tcard sz-sm missing' });
        }))) : null);
    const key = `${pid}|${day}`;
    if (loginAvailable(p, day) && !prompted.has(key)) {
      prompted.add(key);
      setTimeout(() => loginModal(pid), 350);
    }
  };
  el.append(topbar({ title: 'Card Collector', player: true }), body);
  render();
  return { el, refresh: render };
}

function achievementsClaimable(pid: ReturnType<typeof active>): number {
  const p = repo.player(pid);
  return ACHIEVEMENT_IDS.filter((a) => achievementState(p, a) === 'completed').length;
}
