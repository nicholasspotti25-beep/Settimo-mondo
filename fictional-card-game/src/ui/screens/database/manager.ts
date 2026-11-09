/** Database management: one tab per independent mode database plus the media library. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import type { Screen } from '../../router';
import { topbar, emptyState, notice } from '../../components/common';
import { btn, busy, toast, confirmDialog, guard } from '../../overlay';
import { repo } from '../../../store/repo';
import { guessMime, importImage, importMedia, kindOf, mediaUrl } from '../../../store/media';
import { chooseFiles } from '../../components/picker';
import { fitImage, openLightbox } from '../../components/media';
import { playCutscene } from '../../components/cutscene';
import { rarityGem } from '../../components/card';
import { blankEntry, confirmDelete, entrySummary, entryThumb, openEditor } from './editors';
import { missingRarities, poolByRarity } from '../../../engines/pack';
import { fmtBytes, fmtDuration } from '../../../core/util';
import { describeError } from '../../../store/idb';
import {
  MODES, MODE_LABEL, RARITIES, RARITY_LABEL, type AnyEntry, type CollectorEntry, type Mode, type Rarity,
} from '../../../model/types';

type Tab = Mode | 'media';
type Status = 'all' | 'ready' | 'incomplete';
type Sort = 'name' | 'updated' | 'created';

const MODE_DESC: Record<Mode, string> = {
  classic: 'Name, image, Offense, Defense, Hax, IQ and an optional cutscene.',
  tournament: 'Name, image and Value.',
  team: 'Name, image, a value for each of the five roles, an optional Special Effect and cutscene.',
  collector: 'Name, rarity, Normal Art, optional Alternative Art, description and cutscene (required for Omniversal).',
};

function nameFromFile(f: File): string {
  return f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
}

async function quickAdd(mode: Mode): Promise<void> {
  const files = await chooseFiles('image/*', true);
  if (!files.length) return;
  const b = busy(`Importing 0 / ${files.length}…`);
  let ok = 0;
  const failed: string[] = [];
  try {
    for (const [i, f] of files.entries()) {
      b.set(`Importing ${i + 1} / ${files.length}…`);
      try {
        const imp = await importImage(f);
        const meta = await repo.addMedia(imp);
        const e = blankEntry(mode, nameFromFile(f)) as any;
        if (mode === 'collector') e.normalArt = { id: meta.id, fit: 'contain' };
        else e.image = { id: meta.id, fit: 'contain' };
        await repo.saveEntry(mode, e);
        ok++;
      } catch (err) {
        failed.push(`${f.name}: ${describeError((err as any)?.cause ?? err)}`);
      }
    }
  } finally {
    b.close();
  }
  if (ok) toast(`Created ${ok} draft${ok > 1 ? 's' : ''} — fill in the missing values to make them playable`, 'ok', 5000);
  if (failed.length) toast(`Skipped ${failed.length} file(s): ${failed.slice(0, 2).join('; ')}`, 'err', 7000);
}

function readinessPanel(mode: Mode): HTMLElement {
  const rd = repo.readiness(mode);
  const head = h('div', { class: 'rd-head' },
    h('div', { class: 'grow' },
      h('h3', null, MODE_LABEL[mode], ' database'),
      h('p', { class: 'muted' }, MODE_DESC[mode])),
    h('div', { class: 'rd-nums' },
      h('div', null, h('b', null, String(rd.valid)), h('small', null, 'ready')),
      h('div', null, h('b', null, String(rd.total - rd.valid)), h('small', null, 'incomplete')),
      h('div', null, h('b', null, String(rd.total)), h('small', null, 'total'))));
  const status = rd.ok ? notice('ok', `${MODE_LABEL[mode]} is playable — ${rd.message}.`) : notice('warn', `${MODE_LABEL[mode]} is not playable yet: ${rd.message}.`);
  if (mode !== 'collector') return h('div', { class: 'panel rd' }, head, status);
  const valid = repo.valid('collector');
  const by = poolByRarity(valid);
  const miss = new Set(missingRarities(valid));
  const alts = valid.filter((e) => e.altArt && e.rarity && ['legendary', 'mythic', 'secret', 'omniversal'].includes(e.rarity)).length;
  return h('div', { class: 'panel rd' }, head,
    h('div', { class: 'rd-rarities' }, ...RARITIES.map((r) => h('div', { class: `rd-r r-${r} ${miss.has(r) ? 'miss' : ''}` },
      rarityGem(r), h('span', null, RARITY_LABEL[r]), h('b', null, String(by[r].length))))),
    h('p', { class: 'hint' }, `${alts} Alternative Art edition${alts === 1 ? '' : 's'} available. Packs can be opened when every rarity has at least one valid card (so the exact probabilities can always be honoured).`),
    status);
}

function modeTab(mode: Mode, state: { q: string; status: Status; sort: Sort; rarity: Rarity | 'all' }, rerender: () => void): HTMLElement {
  const all = repo.list(mode) as AnyEntry[];
  const q = state.q.trim().toLowerCase();
  let list = all.filter((e) => !q || e.name.toLowerCase().includes(q));
  const valid = new Set(repo.valid(mode).map((e) => e.id));
  if (state.status === 'ready') list = list.filter((e) => valid.has(e.id));
  if (state.status === 'incomplete') list = list.filter((e) => !valid.has(e.id));
  if (mode === 'collector' && state.rarity !== 'all') list = list.filter((e) => (e as CollectorEntry).rarity === state.rarity);
  if (state.sort === 'updated') list.sort((a, b) => b.updatedAt - a.updatedAt);
  else if (state.sort === 'created') list.sort((a, b) => b.createdAt - a.createdAt);

  const search = h('input', { type: 'search', placeholder: `Search ${MODE_LABEL[mode]} by name…`, value: state.q }) as HTMLInputElement;
  search.addEventListener('input', () => {
    state.q = search.value;
    const pos = search.selectionStart;
    rerender();
    const s = document.querySelector<HTMLInputElement>('.db-toolbar input[type=search]');
    if (s) { s.focus(); s.setSelectionRange(pos, pos); }
  });
  const sortSel = h('select', { 'aria-label': 'Sort' },
    h('option', { value: 'name' }, 'Sort: Name'), h('option', { value: 'updated' }, 'Sort: Recently edited'), h('option', { value: 'created' }, 'Sort: Recently added')) as HTMLSelectElement;
  sortSel.value = state.sort;
  sortSel.addEventListener('change', () => { state.sort = sortSel.value as Sort; rerender(); });
  const statusChips = h('div', { class: 'chips' }, ...(['all', 'ready', 'incomplete'] as Status[]).map((s) =>
    h('button', { class: `chip ${state.status === s ? 'on' : ''}`, on: { click: () => { state.status = s; rerender(); } } },
      s === 'all' ? `All (${all.length})` : s === 'ready' ? `Ready (${valid.size})` : `Incomplete (${all.length - valid.size})`)));
  const rarityChips = mode === 'collector' ? h('div', { class: 'chips' },
    h('button', { class: `chip ${state.rarity === 'all' ? 'on' : ''}`, on: { click: () => { state.rarity = 'all'; rerender(); } } }, 'All rarities'),
    ...RARITIES.map((r) => h('button', { class: `chip rchip r-${r} ${state.rarity === r ? 'on' : ''}`, on: { click: () => { state.rarity = r; rerender(); } } }, rarityGem(r, 'gem sm'), RARITY_LABEL[r]))) : null;

  const rows = list.map((e) => {
    const issues = repo.issues(mode, e);
    const row = h('div', { class: `db-row ${issues.length ? 'bad' : ''}`, role: 'button', tabIndex: 0 },
      entryThumb(mode, e),
      h('div', { class: 'db-row-main' },
        h('div', { class: 'db-row-name' }, h('strong', null, e.name || 'Untitled'),
          issues.length ? h('span', { class: 'badge warn', title: issues.map((i) => i.message).join('\n') }, icon('warn'), `${issues.length} missing`) : h('span', { class: 'badge ok' }, icon('check'), 'Ready')),
        entrySummary(mode, e),
        issues.length ? h('small', { class: 'warn-text db-issue' }, issues[0]!.message) : null),
      h('div', { class: 'db-row-actions' },
        h('button', { class: 'icon-btn', 'aria-label': `Edit ${e.name}`, on: { click: (ev: Event) => { ev.stopPropagation(); openEditor(mode, e as any); } } }, icon('edit')),
        h('button', { class: 'icon-btn', 'aria-label': `Delete ${e.name}`, on: { click: (ev: Event) => { ev.stopPropagation(); void confirmDelete(mode, e); } } }, icon('trash'))));
    row.addEventListener('click', () => openEditor(mode, e as any));
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') openEditor(mode, e as any); });
    return row;
  });

  return h('div', { class: 'stack' },
    readinessPanel(mode),
    h('div', { class: 'db-toolbar' },
      h('div', { class: 'search' }, icon('search'), search),
      sortSel,
      btn('Quick add from images', () => void quickAdd(mode), 'ghost', 'library'),
      btn('Add entry', () => openEditor(mode), 'primary', 'plus')),
    h('div', { class: 'db-filters' }, statusChips, rarityChips),
    all.length === 0
      ? emptyState('db', `The ${MODE_LABEL[mode]} database is empty`, 'Add characters with their images and values. Entries added here appear only in this mode.', btn('Add the first entry', () => openEditor(mode), 'primary', 'plus'))
      : list.length === 0 ? emptyState('search', 'No matching entries', 'Try another search or filter.') : h('div', { class: 'db-list' }, ...rows));
}

function mediaTab(state: { mediaFilter: 'all' | 'image' | 'video' | 'unused' }, rerender: () => void): HTMLElement {
  const est = h('div', { class: 'storage-est muted' }, 'Checking storage…');
  void (async () => {
    if (repo.storageKind === 'cloud') {
      const u = await repo.storageUsage();
      est.textContent = `Saved to your Claude account${u ? `: ${fmtBytes(u.bytes)} of ${fmtBytes(u.maxBytes)} used` : ''}. Files stay when you close the app.`;
      return;
    }
    try {
      const e = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      if (e) est.textContent = `Using ${fmtBytes(e.usage ?? 0)} of about ${fmtBytes(e.quota ?? 0)} available on this device.${persisted ? ' Storage is protected from automatic clean-up.' : ''}`;
      else est.textContent = 'Storage usage is not reported by this browser.';
    } catch {
      est.textContent = 'Storage usage is not reported by this browser.';
    }
  })();
  const items = [...repo.media.values()].sort((a, b) => b.createdAt - a.createdAt);
  const used = new Map(items.map((m) => [m.id, repo.mediaUsage(m.id)]));
  const unused = items.filter((m) => used.get(m.id)!.length === 0);
  const filtered = items.filter((m) => state.mediaFilter === 'all' || (state.mediaFilter === 'unused' ? used.get(m.id)!.length === 0 : m.kind === state.mediaFilter));
  const addFiles = async (): Promise<void> => {
    const files = await chooseFiles('image/*,video/*', true);
    if (!files.length) return;
    const b = busy('Importing…');
    let n = 0;
    try {
      for (const f of files) {
        const kind = kindOf(guessMime(f));
        if (!kind) continue;
        try {
          const imp = await importMedia(f, kind);
          await repo.addMedia(imp);
          n++;
          if (imp.warning) toast(`${f.name}: ${imp.warning}`, 'err', 7000);
        } catch (e) {
          toast(`${f.name}: ${(e as Error).message}`, 'err', 6000);
        }
      }
    } finally {
      b.close();
    }
    if (n) toast(`Added ${n} file${n > 1 ? 's' : ''} to the library`, 'ok');
  };
  const cleanup = async (): Promise<void> => {
    const bytes = unused.reduce((s, m) => s + m.size, 0);
    if (!(await confirmDialog({ title: 'Delete unused media?', message: `${unused.length} file(s) are not used by any database entry or portrait (${fmtBytes(bytes)}). They will be permanently deleted.`, confirm: 'Delete unused', danger: true }))) return;
    await guard(() => repo.deleteMedia(unused.map((m) => m.id)), 'Could not delete');
    toast('Unused media deleted', 'ok');
  };
  const cells = filtered.map((m) => {
    const u = used.get(m.id)!;
    const thumb = m.kind === 'image' ? fitImage({ id: m.id }, { variant: 'thumb' }) : h('div', { class: 'fimg fit-contain' });
    if (m.kind === 'video') {
      if (m.hasThumb) {
        const img = h('img', { class: 'fimg-fg', alt: '' }) as HTMLImageElement;
        thumb.appendChild(img);
        void mediaUrl(m, 'thumb').then((x) => { if (x) img.src = x; });
      } else thumb.appendChild(h('div', { class: 'fimg-empty' }, icon('video')));
      thumb.appendChild(h('span', { class: 'vposter-play' }, icon('play')));
    }
    const open = (): void => { m.kind === 'image' ? openLightbox({ id: m.id }, m.name) : void playCutscene({ id: m.id }, { title: m.name }); };
    thumb.addEventListener('click', open);
    thumb.classList.add('zoomable');
    return h('div', { class: 'media-cell' }, thumb,
      h('div', { class: 'media-info' },
        h('strong', { title: m.name }, m.name),
        h('small', null, [m.width && m.height ? `${m.width}×${m.height}` : null, fmtBytes(m.size), m.kind === 'video' ? fmtDuration(m.duration) : null].filter(Boolean).join(' · ')),
        m.kind === 'video' && m.playable === false ? h('small', { class: 'warn-text' }, 'Not playable in this browser') : null,
        u.length ? h('small', { class: 'muted', title: u.join('\n') }, `Used by ${u.length}: ${u[0]}${u.length > 1 ? '…' : ''}`) : h('small', { class: 'dim' }, 'Unused'),
        !u.length ? h('button', { class: 'chip', on: { click: async () => {
          if (await confirmDialog({ title: 'Delete this file?', message: `“${m.name}” (${fmtBytes(m.size)}) will be permanently deleted.`, confirm: 'Delete', danger: true })) await guard(() => repo.deleteMedia([m.id]), 'Could not delete');
        } } }, icon('trash'), 'Delete') : null));
  });
  return h('div', { class: 'stack' },
    h('div', { class: 'panel' },
      h('div', { class: 'rd-head' }, h('div', { class: 'grow' }, h('h3', null, 'Media library'),
        h('p', { class: 'muted' }, repo.storageKind === 'cloud' ? 'Every image and video imported into the game, saved to your Claude account and included in backups.' : 'Every image and video imported into the game, stored on this device and included in backups.')),
        h('div', { class: 'rd-nums' },
          h('div', null, h('b', null, String(items.filter((m) => m.kind === 'image').length)), h('small', null, 'images')),
          h('div', null, h('b', null, String(items.filter((m) => m.kind === 'video').length)), h('small', null, 'videos')),
          h('div', null, h('b', null, fmtBytes(items.reduce((s, m) => s + m.size, 0))), h('small', null, 'total')))),
      est),
    h('div', { class: 'db-toolbar' },
      h('div', { class: 'chips grow' }, ...(['all', 'image', 'video', 'unused'] as const).map((f) =>
        h('button', { class: `chip ${state.mediaFilter === f ? 'on' : ''}`, on: { click: () => { state.mediaFilter = f; rerender(); } } },
          f === 'all' ? `All (${items.length})` : f === 'image' ? 'Images' : f === 'video' ? 'Videos' : `Unused (${unused.length})`))),
      unused.length ? btn('Delete unused', () => void cleanup(), 'ghost', 'trash') : null,
      btn('Add media', () => void addFiles(), 'primary', 'upload')),
    filtered.length ? h('div', { class: 'media-grid' }, ...cells) : emptyState('library', 'No media here', 'Images and videos you add to entries or portraits appear here and can be reused.'));
}

export function databaseScreen(params: { tab?: Tab } = {}): Screen {
  const el = h('div', { class: 'db' });
  const state = { tab: (params.tab ?? 'classic') as Tab, q: '', status: 'all' as Status, sort: 'name' as Sort, rarity: 'all' as Rarity | 'all', mediaFilter: 'all' as 'all' | 'image' | 'video' | 'unused' };
  const body = h('div', { class: 'db-body' });
  const tabs = h('div', { class: 'seg db-tabs' });
  const render = (): void => {
    replace(tabs, ...[...MODES, 'media' as const].map((t) => {
      const rd = t === 'media' ? null : repo.readiness(t);
      return h('button', { class: state.tab === t ? 'on' : '', on: { click: () => { state.tab = t; state.q = ''; state.status = 'all'; state.rarity = 'all'; render(); } } },
        icon(t === 'media' ? 'library' : t === 'classic' ? 'swords' : t === 'tournament' ? 'trophy' : t === 'team' ? 'users' : 'cards'),
        t === 'media' ? 'Media' : MODE_LABEL[t],
        rd ? h('span', { class: `tab-dot ${rd.ok ? 'ok' : 'warn'}` }) : null);
    }));
    replace(body, state.tab === 'media' ? mediaTab(state, render) : modeTab(state.tab, state, render));
  };
  el.append(topbar({ title: 'Database', sub: 'Four independent databases — entries never cross between modes' }), h('div', { class: 'wrap' }, tabs, body));
  render();
  return { el, refresh: render };
}
