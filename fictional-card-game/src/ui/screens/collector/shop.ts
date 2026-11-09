/** Shop: FC only, no real money. The Anime Pack is the only product. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import type { Screen } from '../../router';
import { go } from '../../router';
import { topbar, fcChip, notice } from '../../components/common';
import { btn, modal } from '../../overlay';
import { repo } from '../../../store/repo';
import { PACK_PRICE } from '../../../engines/pack';
import { active, animePack, openOne, purchase } from './actions';

export function shopScreen(): Screen {
  const el = h('div', { class: 'shop' });
  const body = h('div', { class: 'wrap' });
  let qty = 1;
  const render = (): void => {
    const p = repo.player(active());
    const cost = qty * PACK_PRICE;
    const can = p.fc >= cost;
    const max = Math.max(1, Math.floor(p.fc / PACK_PRICE));
    const buyBtn = btn(can ? `Buy ${qty} for ${cost.toLocaleString()} FC` : `Not enough FC (${cost.toLocaleString()} needed)`, () => confirmBuy(), 'gold big wide', 'shop');
    buyBtn.disabled = !can;
    el.querySelector('.topbar')?.replaceWith(topbar({ title: 'Shop', sub: 'Fictional Coins only — no real-money purchases', player: true }));
    replace(body,
      h('div', { class: 'shop-balance panel' }, h('div', { class: 'grow' }, h('small', { class: 'muted' }, `${p.name}'s balance`), fcChip(p.fc, 'big')),
        h('div', null, h('small', { class: 'muted' }, 'Unopened packs'), h('b', { class: 'big-num' }, String(p.unopenedPacks)))),
      h('div', { class: 'product panel' },
        h('div', { class: 'product-art' }, animePack('idle')),
        h('div', { class: 'product-info stack' },
          h('h2', { class: 'display' }, 'Anime Pack'),
          h('p', { class: 'muted' }, '5 cards · 5th card guaranteed Rare or higher · eligible for Alternative Art and pity.'),
          h('div', { class: 'row' }, fcChip(PACK_PRICE), h('small', { class: 'muted' }, 'per pack')),
          h('div', { class: 'qty' },
            h('label', { class: 'lbl' }, 'Quantity'),
            h('div', { class: 'nfield-row' },
              h('button', { class: 'step', 'aria-label': 'Fewer', on: { click: () => { qty = Math.max(1, qty - 1); render(); } } }, '−'),
              h('output', { class: 'qty-out' }, String(qty)),
              h('button', { class: 'step', 'aria-label': 'More', on: { click: () => { qty = Math.min(99, qty + 1); render(); } } }, '+'),
              h('button', { class: 'chip', on: { click: () => { qty = max; render(); } } }, `Max (${max})`))),
          !can ? notice('info', `${p.name} needs ${(cost - p.fc).toLocaleString()} more FC for this purchase.`) : null,
          buyBtn,
          h('button', { class: 'link-btn', on: { click: () => go('pack') } }, icon('info'), ' View odds and pity'))));
  };
  const confirmBuy = (): void => {
    const p = repo.player(active());
    const cost = qty * PACK_PRICE;
    const n = qty;
    const m = modal({
      title: 'Confirm purchase',
      cls: 'modal-sm',
      content: h('div', { class: 'stack' },
        h('p', null, `${p.name} buys ${n} Anime Pack${n > 1 ? 's' : ''} for `, h('b', { class: 'gold-text' }, `${cost.toLocaleString()} FC`), '.'),
        h('p', { class: 'muted' }, `Balance after purchase: ${(p.fc - cost).toLocaleString()} FC.`)),
      actions: [btn('Cancel', () => m.close(), 'ghost'), btn('Buy', async () => {
        m.close();
        if (await purchase(n)) {
          qty = 1;
          const r = modal({
            title: 'Purchase complete', cls: 'modal-sm',
            content: h('div', { class: 'stack center' }, animePack('idle mini2'), h('p', null, `${n} Anime Pack${n > 1 ? 's were' : ' was'} added to ${repo.player(active()).name}'s unopened packs.`)),
            actions: [btn('Keep shopping', () => r.close(), 'ghost'), btn('Open now', () => { r.close(); void openOne(); }, 'primary', 'sparkle')],
          });
        }
      }, 'gold', 'check')],
    });
  };
  el.append(topbar({ title: 'Shop', player: true }), body);
  render();
  return { el, refresh: render };
}
