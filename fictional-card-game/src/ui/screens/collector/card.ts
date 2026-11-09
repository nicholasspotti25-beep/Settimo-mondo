/** Card detail: large artwork (full resolution viewer), edition switcher, ownership, description, duplicate conversion. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import { back, type Screen } from '../../router';
import { topbar, emptyState, fcChip } from '../../components/common';
import { btn, confirmDialog, guard, toast } from '../../overlay';
import { repo } from '../../../store/repo';
import { artOf, cardView, rarityPill } from '../../components/card';
import { openLightbox } from '../../components/media';
import { playCutscene } from '../../components/cutscene';
import { convertDuplicates, duplicateValue } from '../../../engines/economy';
import { formatDateTime } from '../../../core/time';
import { ALT_RARITIES, EDITION_LABEL, cardKey, type Edition } from '../../../model/types';
import { active } from './actions';

export function cardScreen(params: { entryId: string; edition: Edition }): Screen {
  const el = h('div', { class: 'card-detail' });
  const body = h('div', { class: 'wrap' });
  let edition: Edition = params.edition;
  let convertN = 1;
  const render = (): void => {
    const e = repo.get('collector', params.entryId);
    el.querySelector('.topbar')?.replaceWith(topbar({ title: e?.name ?? 'Card', sub: 'Card detail', player: true }));
    if (!e || !e.rarity) {
      replace(body, emptyState('warn', 'This card is no longer in the database', 'It may have been deleted by the owner.', btn('Back', () => void back(), 'primary')));
      return;
    }
    const pid = active();
    const p = repo.player(pid);
    const hasAlt = !!e.altArt && ALT_RARITIES.includes(e.rarity);
    if (edition === 'alt' && !hasAlt) edition = 'normal';
    const own = p.collection[cardKey(e.id, edition)];
    const qty = own?.qty ?? 0;
    const value = duplicateValue(e.rarity, edition);
    convertN = Math.min(Math.max(1, convertN), Math.max(1, qty - 1));
    const card = cardView(e, edition, { size: 'xl', owned: qty > 0, qty, variant: 'full', tilt: qty > 0, hideName: repo.settings.hideMissingNames });
    if (qty > 0) {
      card.classList.add('clickable');
      card.addEventListener('click', () => { const a = artOf(e, edition); if (a) openLightbox(a, `${e.name} — ${EDITION_LABEL[edition]}`); });
    }
    const edTabs = hasAlt ? h('div', { class: 'seg' }, ...(['normal', 'alt'] as const).map((ed) => {
      const q = p.collection[cardKey(e.id, ed)]?.qty ?? 0;
      return h('button', { class: edition === ed ? 'on' : '', on: { click: () => { edition = ed; convertN = 1; render(); } } }, EDITION_LABEL[ed], h('span', { class: `badge ${q ? 'ok' : ''}` }, q ? `×${q}` : 'missing'));
    })) : null;
    const convert = qty > 1 && value > 0 ? h('div', { class: 'panel conv' },
      h('h3', { class: 'panel-h' }, icon('coin'), ' Convert duplicates'),
      h('p', { class: 'muted' }, `Each duplicate of this edition is worth ${value.toLocaleString()} FC. You always keep at least one copy.`),
      h('div', { class: 'row' },
        h('div', { class: 'nfield-row' },
          h('button', { class: 'step', on: { click: () => { convertN = Math.max(1, convertN - 1); render(); } } }, '−'),
          h('output', { class: 'qty-out' }, String(convertN)),
          h('button', { class: 'step', on: { click: () => { convertN = Math.min(qty - 1, convertN + 1); render(); } } }, '+'),
          h('button', { class: 'chip', on: { click: () => { convertN = qty - 1; render(); } } }, `All (${qty - 1})`)),
        h('span', { class: 'grow' }),
        fcChip(convertN * value)),
      btn(`Convert ${convertN} for ${(convertN * value).toLocaleString()} FC`, async () => {
        const n = convertN;
        const ok = await confirmDialog({ title: 'Convert duplicates?', message: `${p.name} converts ${n} duplicate${n > 1 ? 's' : ''} of ${e.name} (${EDITION_LABEL[edition]}) into ${(n * value).toLocaleString()} FC. ${qty - n} cop${qty - n === 1 ? 'y' : 'ies'} will remain.`, confirm: 'Convert' });
        if (!ok) return;
        const r = await guard(() => repo.mutate([pid], (ps) => convertDuplicates(ps[pid], e.id, edition, e.rarity!, n, e.name, Date.now())), 'Conversion failed');
        if (r) { toast(`+${r.toLocaleString()} FC`, 'fc'); convertN = 1; }
      }, 'gold wide', 'coin')) : null;
    replace(body,
      h('div', { class: 'cd-layout' },
        h('div', { class: 'cd-card' }, card, qty > 0 ? h('small', { class: 'hint' }, 'Tap the card to view the artwork at full resolution') : null),
        h('div', { class: 'cd-info stack' },
          edTabs,
          h('h2', { class: 'display cd-name' }, qty > 0 || !repo.settings.hideMissingNames ? e.name : '???'),
          h('div', { class: 'row' }, rarityPill(e.rarity), h('span', { class: `badge ${edition === 'alt' ? 'gold' : 'blue'}` }, EDITION_LABEL[edition])),
          qty > 0
            ? h('div', { class: 'cd-facts' },
              h('div', null, h('small', null, 'Owned'), h('b', null, `×${qty}`)),
              h('div', null, h('small', null, 'First obtained'), h('b', null, formatDateTime(own!.firstAt))),
              h('div', null, h('small', null, 'Last obtained'), h('b', null, formatDateTime(own!.lastAt))),
              h('div', null, h('small', null, 'Times obtained'), h('b', null, String(own!.obtained))),
              h('div', null, h('small', null, 'Duplicate value'), h('b', null, `${value.toLocaleString()} FC`)))
            : h('div', { class: 'notice info' }, icon('lock'), h('span', null, `${p.name} does not own this edition yet. Each edition is a separate collectible — open Anime Packs to find it.`)),
          qty > 0 && e.description ? h('div', { class: 'panel' }, h('h3', { class: 'panel-h' }, 'Description'), h('p', { class: 'pre' }, e.description)) : null,
          h('div', { class: 'row' },
            qty > 0 ? btn('View full artwork', () => { const a = artOf(e, edition); if (a) openLightbox(a, `${e.name} — ${EDITION_LABEL[edition]}`); }, 'ghost', 'expand') : null,
            qty > 0 && e.cutscene ? btn('Play cutscene', () => void playCutscene(e.cutscene!, { title: e.name, subtitle: e.rarity === 'omniversal' ? 'Omniversal' : '' }), 'primary', 'play') : null),
          convert)));
  };
  el.append(topbar({ title: 'Card', player: true }), body);
  render();
  return { el, refresh: render };
}
