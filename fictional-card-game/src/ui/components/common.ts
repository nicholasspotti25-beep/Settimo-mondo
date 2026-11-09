/** Shared building blocks: top bar, player switch, FC chip, progress bars, empty states, number fields. */
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { back, go } from '../router';
import { repo } from '../../store/repo';
import type { PlayerId } from '../../model/types';
import { sfx } from '../sound';

export function fcChip(amount: number, cls = ''): HTMLElement {
  return h('span', { class: `fc-chip ${cls}` }, h('i', { class: 'fc-coin' }, 'FC'), h('b', null, Math.round(amount).toLocaleString()));
}

export function playerSwitch(onChange?: (p: PlayerId) => void): HTMLElement {
  const active = repo.settings.activePlayer;
  const el = h('div', { class: 'pswitch', role: 'tablist', 'aria-label': 'Active player' });
  for (const id of ['p1', 'p2'] as const) {
    const p = repo.player(id);
    const b = h('button', { class: `ps-btn ${id} ${id === active ? 'on' : ''}`, role: 'tab', 'aria-selected': String(id === active) },
      h('span', { class: 'ps-tag' }, id.toUpperCase()),
      h('span', { class: 'ps-name' }, p.name));
    b.addEventListener('click', () => {
      if (repo.settings.activePlayer === id) return;
      sfx.tap();
      void repo.updateSettings({ activePlayer: id }).then(() => onChange?.(id));
    });
    el.appendChild(b);
  }
  return el;
}

export function topbar(o: { title: string; sub?: string; back?: boolean; player?: boolean; fc?: boolean; right?: (Node | null)[]; onBack?: () => void }): HTMLElement {
  const p = repo.player(repo.settings.activePlayer);
  return h('header', { class: 'topbar' },
    o.back !== false ? h('button', { class: 'icon-btn back', 'aria-label': 'Back', on: { click: () => { sfx.tap(); o.onBack ? o.onBack() : void back(); } } }, icon('back')) : null,
    h('div', { class: 'tb-title' }, h('h1', null, o.title), o.sub ? h('small', null, o.sub) : null),
    h('div', { class: 'tb-right' },
      o.player ? playerSwitch() : null,
      o.fc ? fcChip(p.fc) : null,
      ...(o.right ?? [])));
}

export function progressBar(value: number, max: number, cls = ''): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h('div', { class: `pbar ${cls} ${pct >= 100 ? 'full' : ''}`, role: 'progressbar', 'aria-valuenow': String(value), 'aria-valuemax': String(max) },
    h('i', { style: { width: `${pct}%` } }));
}

export function emptyState(ic: IconName, title: string, text: string, action?: Node): HTMLElement {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ic' }, icon(ic)), h('h3', null, title), h('p', null, text), action ?? null);
}

export function notice(kind: 'warn' | 'info' | 'ok', text: string | Node, action?: Node): HTMLElement {
  return h('div', { class: `notice ${kind}` }, icon(kind === 'warn' ? 'warn' : kind === 'ok' ? 'check' : 'info'), h('div', { class: 'grow' }, text), action ?? null);
}

export function dbLink(label = 'Open Database'): HTMLElement {
  return h('button', { class: 'btn small', on: { click: () => go('database') } }, icon('db'), h('span', null, label));
}

export function numberField(o: { label: string; value: number | null; onChange: (v: number | null) => void; error?: string; icon?: IconName; step?: number; min?: number }): HTMLElement {
  const input = h('input', { type: 'number', inputmode: 'decimal', step: String(o.step ?? 1), value: o.value ?? '', placeholder: '—', min: o.min !== undefined ? String(o.min) : undefined }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const t = input.value.trim();
    const v = t === '' ? null : Number(t);
    o.onChange(v === null || Number.isFinite(v) ? v : null);
  });
  const step = (d: number): void => {
    const v = (Number(input.value) || 0) + d * (o.step ?? 1);
    input.value = String(Math.round(v * 100) / 100);
    o.onChange(Number(input.value));
  };
  return h('div', { class: `nfield ${o.error ? 'has-err' : ''}` },
    h('label', { class: 'lbl' }, o.icon ? icon(o.icon) : null, o.label, h('em', { class: 'req' }, ' *')),
    h('div', { class: 'nfield-row' },
      h('button', { type: 'button', class: 'step', 'aria-label': `Decrease ${o.label}`, on: { click: () => step(-1) } }, '−'),
      input,
      h('button', { type: 'button', class: 'step', 'aria-label': `Increase ${o.label}`, on: { click: () => step(1) } }, '+')),
    o.error ? h('div', { class: 'field-err' }, o.error) : null);
}

export function toggleRow(label: string, desc: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: value }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'trow' }, h('div', { class: 'grow' }, h('strong', null, label), h('small', null, desc)), h('span', { class: 'switch' }, input, h('i')));
}

export function sectionTitle(text: string, right?: Node | null): HTMLElement {
  return h('div', { class: 'sec-title' }, h('h2', null, text), right ?? null);
}
