/** Anime Pack product page: contents, exact odds, Alternative Art chances, pity status, buy / open. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import type { Screen } from '../../router';
import { topbar, fcChip, notice, dbLink } from '../../components/common';
import { btn } from '../../overlay';
import { repo } from '../../../store/repo';
import { ALT_ART_CHANCE, GUARANTEED_TABLE, STANDARD_TABLE, pct } from '../../../engines/rarity';
import { PACK_PRICE } from '../../../engines/pack';
import { RARITIES, RARITY_LABEL } from '../../../model/types';
import { rarityGem } from '../../components/card';
import { active, animePack, openOne, purchase } from './actions';
import { pityBars } from './hub';

export function oddsTable(): HTMLElement {
  return h('div', { class: 'odds' },
    h('div', { class: 'odds-row head' }, h('span', null, 'Rarity'), h('span', null, 'Cards 1–4'), h('span', null, 'Card 5'), h('span', null, 'Alt Art')),
    ...RARITIES.map((r) => h('div', { class: `odds-row r-${r}` },
      h('span', { class: 'odds-r' }, rarityGem(r, 'gem sm'), RARITY_LABEL[r]),
      h('span', null, pct(STANDARD_TABLE[r])),
      h('span', null, GUARANTEED_TABLE[r] ? pct(GUARANTEED_TABLE[r]) : '—'),
      h('span', null, ALT_ART_CHANCE[r] ? pct(ALT_ART_CHANCE[r]) : '—'))));
}

export function packScreen(): Screen {
  const el = h('div', { class: 'pack-page' });
  const body = h('div', { class: 'wrap' });
  const render = (): void => {
    const p = repo.player(active());
    const rd = repo.readiness('collector');
    const can = p.fc >= PACK_PRICE;
    const buy = btn(`Buy for ${PACK_PRICE} FC`, () => void purchase(1), 'gold big', 'shop');
    buy.disabled = !can;
    const buyOpen = btn('Buy & open now', async () => { if (await purchase(1)) await openOne(); }, 'primary big', 'sparkle');
    buyOpen.disabled = !can || !rd.ok;
    const open = btn(`Open a pack (${p.unopenedPacks})`, () => void openOne(), 'primary big', 'sparkle');
    open.disabled = (!p.unopenedPacks && !p.pendingReveal) || !rd.ok;
    el.querySelector('.topbar')?.replaceWith(topbar({ title: 'Anime Pack', player: true, fc: true }));
    replace(body,
      h('div', { class: 'pack-hero' },
        h('div', { class: 'pack-stage' }, h('div', { class: 'pack-glow' }), animePack('idle')),
        h('div', { class: 'pack-info stack' },
          h('h2', { class: 'display gold-text' }, 'Anime Pack'),
          h('p', { class: 'muted' }, 'Five cards from the Card Collector database. The first four use the standard rarity table; the fifth is guaranteed Rare or higher. Then, independently, Legendary and above can be Alternative Art — only if that character has an Alternative Art image.'),
          h('div', { class: 'row' }, h('span', { class: 'price' }, fcChip(PACK_PRICE, 'big')), h('small', { class: 'muted' }, `Balance: ${p.fc.toLocaleString()} FC · ${p.unopenedPacks} unopened`)),
          !rd.ok ? notice('warn', `Packs cannot be opened yet: ${rd.message}.`, dbLink()) : null,
          !can ? notice('info', `${p.name} needs ${PACK_PRICE - p.fc} more FC. Earn FC with the daily login, missions, matches, tournaments and achievements.`) : null,
          h('div', { class: 'row' }, buy, buyOpen, open))),
      h('div', { class: 'two-col' },
        h('div', { class: 'panel' }, h('h3', { class: 'panel-h' }, icon('info'), ' Exact probabilities'), oddsTable(),
          h('p', { class: 'hint', style: 'margin-top:10px' }, 'Every table totals exactly 100%. Normal Art and Alternative Art are separate collectibles; duplicates can be converted into FC in My Collection.')),
        h('div', { class: 'panel' }, h('h3', { class: 'panel-h' }, icon('shield'), ` ${p.name}'s pity`), pityBars(),
          h('p', { class: 'hint', style: 'margin-top:10px' }, 'After 20 packs without Legendary or higher, 50 without Mythic or higher, or 100 without Secret or higher, the 5th card of the next pack is raised to that rarity if no card in the pack reached it naturally. Counters are per player and saved.'))));
  };
  el.append(topbar({ title: 'Anime Pack', player: true, fc: true }), body);
  render();
  return { el, refresh: render };
}
