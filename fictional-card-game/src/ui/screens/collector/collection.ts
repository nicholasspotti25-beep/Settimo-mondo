/** My Collection: every collectible edition as a vertical trading card; missing ones as silhouettes. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import { go, type Screen } from '../../router';
import { topbar, emptyState, dbLink } from '../../components/common';
import { btn, confirmDialog, guard, toast } from '../../overlay';
import { repo, type Collectible } from '../../../store/repo';
import { cardView, rarityGem } from '../../components/card';
import { convertDuplicates, duplicateValue } from '../../../engines/economy';
import { RARITIES, RARITY_LABEL, rarityRank, type Edition, type Rarity } from '../../../model/types';
import { active } from './actions';

type Own = 'all' | 'owned' | 'missing' | 'dupes';
type SortKey = 'rarity' | 'name' | 'date';
interface State { q: string; rarities: Rarity[]; edition: Edition | 'all'; own: Own; sort: SortKey; desc: boolean }

const PREF_KEY = 'fcg.collection.view';
function loadPrefs(): State {
  const d: State = { q: '', rarities: [], edition: 'all', own: 'all', sort: 'rarity', desc: true };
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...d, ...JSON.parse(raw), q: '' };
  } catch { /* storage unavailable */ }
  return d;
}
function savePrefs(s: State): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...s, q: '' })); } catch { /* ignore */ }
}

export async function convertAll(): Promise<void> {
  const pid = active();
  const p = repo.player(pid);
  const items = repo.collectibles().map((c) => ({ c, qty: p.collection[c.key]?.qty ?? 0 })).filter((x) => x.qty > 1);
  if (!items.length) { toast('No duplicates to convert', 'info'); return; }
  const total = items.reduce((s, x) => s + (x.qty - 1) * duplicateValue(x.c.entry.rarity!, x.c.edition), 0);
  const count = items.reduce((s, x) => s + x.qty - 1, 0);
  const ok = await confirmDialog({
    title: 'Convert all duplicates?',
    message: h('div', { class: 'stack' },
      h('p', null, `${p.name} converts ${count} duplicate${count > 1 ? 's' : ''} into `, h('b', { class: 'gold-text' }, `${total.toLocaleString()} FC`), '. One copy of every card is always kept.'),
      h('div', { class: 'conv-list' }, ...items.map((x) => h('div', { class: 'conv-row' },
        h('span', { class: 'grow' }, `${x.c.entry.name} · ${x.c.edition === 'alt' ? 'Alt Art' : 'Normal'}`),
        h('small', { class: 'muted' }, `${x.qty - 1} × ${duplicateValue(x.c.entry.rarity!, x.c.edition)}`),
        h('b', null, `${((x.qty - 1) * duplicateValue(x.c.entry.rarity!, x.c.edition)).toLocaleString()} FC`))))),
    confirm: `Convert for ${total.toLocaleString()} FC`,
  });
  if (!ok) return;
  const r = await guard(() => repo.mutate([pid], (ps) => {
    let sum = 0;
    for (const x of items) {
      const q = ps[pid].collection[x.c.key]?.qty ?? 0;
      if (q > 1) sum += convertDuplicates(ps[pid], x.c.entry.id, x.c.edition, x.c.entry.rarity!, q - 1, x.c.entry.name, Date.now());
    }
    return sum;
  }), 'Conversion failed');
  if (r) toast(`+${r.toLocaleString()} FC from duplicates`, 'fc');
}

export function collectionScreen(): Screen {
  const el = h('div', { class: 'collection' });
  const body = h('div', { class: 'wrap wide' });
  const st = loadPrefs();
  const render = (): void => {
    const pid = active();
    const p = repo.player(pid);
    const all = repo.collectibles();
    const qty = (c: Collectible): number => p.collection[c.key]?.qty ?? 0;
    const ownedList = all.filter((c) => qty(c) > 0);
    const totalOwned = ownedList.reduce((s, c) => s + qty(c), 0);
    const dupes = ownedList.reduce((s, c) => s + qty(c) - 1, 0);
    const dupeValue = ownedList.reduce((s, c) => s + (qty(c) - 1) * duplicateValue(c.entry.rarity!, c.edition), 0);
    const q = st.q.trim().toLowerCase();
    let list = all.filter((c) =>
      (!q || c.entry.name.toLowerCase().includes(q)) &&
      (!st.rarities.length || st.rarities.includes(c.entry.rarity!)) &&
      (st.edition === 'all' || c.edition === st.edition) &&
      (st.own === 'all' || (st.own === 'owned' ? qty(c) > 0 : st.own === 'missing' ? qty(c) === 0 : qty(c) > 1)));
    const dir = st.desc ? -1 : 1;
    list = list.sort((a, b) => {
      if (st.sort === 'name') return dir * -1 * a.entry.name.localeCompare(b.entry.name) || (a.edition === 'normal' ? -1 : 1);
      if (st.sort === 'date') {
        const da = p.collection[a.key]?.lastAt ?? 0, db = p.collection[b.key]?.lastAt ?? 0;
        if (!da !== !db) return da ? -1 : 1;
        return dir * (da - db);
      }
      return dir * (rarityRank(a.entry.rarity!) - rarityRank(b.entry.rarity!)) || a.entry.name.localeCompare(b.entry.name) || (a.edition === 'normal' ? -1 : 1);
    });
    const set = (patch: Partial<State>): void => { Object.assign(st, patch); savePrefs(st); render(); };
    const search = h('input', { type: 'search', placeholder: 'Search by character name…', value: st.q }) as HTMLInputElement;
    search.addEventListener('input', () => {
      st.q = search.value;
      const pos = search.selectionStart;
      render();
      const s = el.querySelector<HTMLInputElement>('.col-tools input[type=search]');
      if (s) { s.focus(); s.setSelectionRange(pos, pos); }
    });
    const sortSel = h('select', { 'aria-label': 'Sort by' }, h('option', { value: 'rarity' }, 'Sort: Rarity'), h('option', { value: 'name' }, 'Sort: Name'), h('option', { value: 'date' }, 'Sort: Acquisition date')) as HTMLSelectElement;
    sortSel.value = st.sort;
    sortSel.addEventListener('change', () => set({ sort: sortSel.value as SortKey }));
    const stat = (label: string, v: string | number, cls = ''): HTMLElement => h('div', { class: `cstat ${cls}` }, h('b', null, String(v)), h('small', null, label));
    el.querySelector('.topbar')?.replaceWith(topbar({ title: 'My Collection', player: true }));
    replace(body,
      h('div', { class: 'cstats' },
        stat('cards owned', totalOwned.toLocaleString()),
        stat('different cards', ownedList.length),
        stat('possible cards', all.length),
        stat('missing', all.length - ownedList.length, 'warn'),
        stat('duplicates', dupes, 'gold'),
        h('div', { class: 'cstat prog' }, h('b', null, all.length ? `${Math.round((ownedList.length / all.length) * 100)}%` : '—'), h('small', null, 'complete'),
          h('div', { class: 'pbar' }, h('i', { style: { width: `${all.length ? (ownedList.length / all.length) * 100 : 0}%` } })))),
      h('div', { class: 'col-tools' },
        h('div', { class: 'search' }, icon('search'), search),
        sortSel,
        h('button', { class: 'icon-btn', 'aria-label': st.desc ? 'Descending' : 'Ascending', title: st.desc ? 'Descending' : 'Ascending', on: { click: () => set({ desc: !st.desc }) } }, icon('sort')),
        dupes ? btn(`Convert duplicates (${dupeValue.toLocaleString()} FC)`, () => void convertAll(), 'gold small', 'coin') : null),
      h('div', { class: 'col-filters' },
        h('div', { class: 'chips' },
          h('button', { class: `chip ${!st.rarities.length ? 'on' : ''}`, on: { click: () => set({ rarities: [] }) } }, 'All'),
          ...RARITIES.map((r) => h('button', { class: `chip rchip r-${r} ${st.rarities.includes(r) ? 'on' : ''}`, on: { click: () => set({ rarities: st.rarities.includes(r) ? st.rarities.filter((x) => x !== r) : [...st.rarities, r] }) } }, rarityGem(r, 'gem sm'), RARITY_LABEL[r]))),
        h('div', { class: 'chips' },
          ...(['all', 'normal', 'alt'] as const).map((e) => h('button', { class: `chip ${st.edition === e ? 'on' : ''}`, on: { click: () => set({ edition: e }) } }, e === 'all' ? 'All editions' : e === 'normal' ? 'Normal Art' : 'Alternative Art')),
          h('span', { class: 'chip-sep' }),
          ...(['all', 'owned', 'missing', 'dupes'] as const).map((o) => h('button', { class: `chip ${st.own === o ? 'on' : ''}`, on: { click: () => set({ own: o }) } }, o === 'all' ? 'Owned & missing' : o === 'owned' ? 'Owned' : o === 'missing' ? 'Missing' : 'Duplicates')))),
      all.length === 0
        ? emptyState('book', 'No cards in the game yet', 'The Card Collector database has no complete cards. Add cards with a name, rarity and Normal Art image.', dbLink('Card Collector database'))
        : list.length === 0 ? emptyState('search', 'No cards match these filters', 'Change the search or filters to see more cards.')
          : h('div', { class: 'col-grid' }, ...list.map((c) => {
            const n = qty(c);
            const card = cardView(c.entry, c.edition, { size: 'md', owned: n > 0, qty: n, hideName: repo.settings.hideMissingNames, onClick: () => go('card', { entryId: c.entry.id, edition: c.edition }) });
            card.classList.add('fluid');
            return card;
          })));
  };
  el.append(topbar({ title: 'My Collection', player: true }), body);
  render();
  return { el, refresh: render };
}
