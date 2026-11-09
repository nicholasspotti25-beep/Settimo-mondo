/** Entry editors for the four databases, with live preview and validation. Incomplete entries can be saved as drafts. */
import { h, replace } from '../../dom';
import { icon, type IconName } from '../../icons';
import { modal, btn, confirmDialog, toast, attempt } from '../../overlay';
import { repo } from '../../../store/repo';
import { mediaField } from '../../components/picker';
import { numberField } from '../../components/common';
import { fitImage, videoPoster } from '../../components/media';
import { cardView, rarityPill } from '../../components/card';
import { uid, deepClone, fmtNum } from '../../../core/util';
import { describeEffect } from '../../../engines/team';
import { playCutscene } from '../../components/cutscene';
import {
  ALT_RARITIES, CLASSIC_STATS, CLASSIC_STAT_LABEL, MODE_LABEL, RARITIES, RARITY_LABEL, ROLES, ROLE_LABEL,
  type AnyEntry, type ClassicEntry, type CollectorEntry, type EffectCondition, type EffectImpact, type EntryByMode, type Mode,
  type Rarity, type Role, type SpecialEffect, type TeamEntry, type TournamentEntry, cardKey,
} from '../../../model/types';
import type { Issue } from '../../../model/validation';

export const STAT_ICON: Record<string, IconName> = { offense: 'fist', defense: 'shield', hax: 'sparkle', iq: 'brain', value: 'star', captain: 'crown', tank: 'shield', planner: 'brain', support: 'users' };

export function blankEntry<M extends Mode>(mode: M, name = ''): EntryByMode[M] {
  const base = { id: uid(mode.slice(0, 2) + '_'), name, createdAt: Date.now(), updatedAt: Date.now() };
  switch (mode) {
    case 'classic': return { ...base, image: null, offense: null, defense: null, hax: null, iq: null, cutscene: null } as ClassicEntry as EntryByMode[M];
    case 'tournament': return { ...base, image: null, value: null } as TournamentEntry as EntryByMode[M];
    case 'team': return { ...base, image: null, roles: { captain: null, tank: null, hax: null, planner: null, support: null }, effect: null, cutscene: null } as TeamEntry as EntryByMode[M];
    default: return { ...base, rarity: null, normalArt: null, altArt: null, description: '', cutscene: null } as CollectorEntry as EntryByMode[M];
  }
}

function ownersOf(entryId: string): string[] {
  const out: string[] = [];
  for (const pid of ['p1', 'p2'] as const) {
    const p = repo.player(pid);
    const n = (p.collection[cardKey(entryId, 'normal')]?.qty ?? 0) + (p.collection[cardKey(entryId, 'alt')]?.qty ?? 0);
    if (n) out.push(`${p.name} owns ×${n}`);
  }
  return out;
}

export async function confirmDelete(mode: Mode, e: AnyEntry): Promise<boolean> {
  const owners = mode === 'collector' ? ownersOf(e.id) : [];
  const ok = await confirmDialog({
    title: `Delete “${e.name || 'Untitled'}”?`,
    message: `This removes the entry from the ${MODE_LABEL[mode]} database only. Other databases are not affected. Its images and videos stay in the Media Library.` +
      (owners.length ? `\n\n${owners.join(' · ')}. Those copies will no longer appear in their collections.` : ''),
    confirm: 'Delete', danger: true,
  });
  if (!ok) return false;
  const ok2 = await attempt(() => repo.deleteEntry(mode, e.id), 'Could not delete');
  if (ok2) toast('Entry deleted', 'ok');
  return ok2;
}

function textField(label: string, value: string, onInput: (v: string) => void, o: { required?: boolean; multiline?: boolean; placeholder?: string; max?: number } = {}): { el: HTMLElement; setError(msg?: string): void } {
  const input = (o.multiline ? h('textarea', { placeholder: o.placeholder ?? '', maxlength: String(o.max ?? 2000) }) : h('input', { type: 'text', placeholder: o.placeholder ?? '', maxlength: String(o.max ?? 120) })) as HTMLInputElement;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  const err = h('div', { class: 'field-err hidden' });
  const el = h('div', { class: 'field' }, h('label', { class: 'lbl' }, label, o.required ? h('em', { class: 'req' }, ' *') : h('span', { class: 'opt' }, ' optional')), input, err);
  return {
    el,
    setError(msg) {
      el.classList.toggle('has-err', !!msg);
      err.classList.toggle('hidden', !msg);
      err.textContent = msg ?? '';
    },
  };
}

function issuesBox(issues: Issue[]): HTMLElement {
  if (!issues.length) return h('div', { class: 'notice ok' }, icon('check'), h('span', null, 'Complete — this entry is available in the game.'));
  return h('div', { class: 'notice warn' }, icon('warn'), h('div', null,
    h('strong', null, `Not available in the game yet (${issues.length} issue${issues.length > 1 ? 's' : ''}):`),
    h('ul', { class: 'issues' }, ...issues.map((i) => h('li', null, i.message)))));
}

export function openEditor<M extends Mode>(mode: M, existing?: EntryByMode[M]): void {
  const draft = deepClone(existing ?? blankEntry(mode)) as EntryByMode[M];
  const isNew = !existing;
  let dirty = false;
  const form = h('div', { class: 'ed-form' });
  const side = h('div', { class: 'ed-side' });
  const issuesEl = h('div');
  const nameField = textField('Character name', draft.name, (v) => { draft.name = v; touch(); }, { required: true, placeholder: 'e.g. Beatrice' });
  const mediaSlots: Record<string, HTMLElement> = {};
  const numberSlots: Record<string, HTMLElement> = {};

  const issues = (): Issue[] => repo.issues(mode, draft);
  const errOf = (field: string): string | undefined => issues().find((i) => i.field === field)?.message;

  const touch = (): void => {
    dirty = true;
    refreshSide();
  };
  const refreshSide = (): void => {
    const list = issues();
    nameField.setError(list.find((i) => i.field === 'name') && draft.name.trim() === '' && dirty ? 'Character name is required' : undefined);
    replace(issuesEl, issuesBox(list));
    replace(side, preview());
    for (const [field, el] of Object.entries(numberSlots)) {
      const msg = list.find((i) => i.field === field)?.message;
      el.classList.toggle('has-err', !!msg && dirty);
    }
  };

  const mediaSlot = (key: string, build: () => HTMLElement): HTMLElement => {
    const holder = h('div');
    const render = (): void => { replace(holder, build()); };
    render();
    mediaSlots[key] = holder;
    (holder as any).rerender = render;
    return holder;
  };
  const rerenderMedia = (key: string): void => (mediaSlots[key] as any)?.rerender?.();

  const imageField = (key: 'image' | 'normalArt' | 'altArt', label: string, required: boolean, aspect: number, extra: { disabled?: boolean; disabledReason?: string; hint?: string } = {}): HTMLElement =>
    mediaSlot(key, () => mediaField({
      label, kind: 'image', required, aspect, value: (draft as any)[key] ?? null, error: (draft as any)[key] ? errOf(key) : undefined, ...extra,
      onChange: (v) => { (draft as any)[key] = v; rerenderMedia(key); touch(); },
    }));
  const cutsceneField = (required: boolean, hint: string): HTMLElement =>
    mediaSlot('cutscene', () => mediaField({
      label: 'Cutscene / video', kind: 'video', required, value: (draft as any).cutscene ?? null, hint,
      error: (draft as any).cutscene ? errOf('cutscene') : undefined,
      onChange: (v) => { (draft as any).cutscene = v; rerenderMedia('cutscene'); touch(); },
    }));
  const statField = (key: string, label: string, get: () => number | null, set: (v: number | null) => void): HTMLElement => {
    const el = numberField({ label, value: get(), icon: STAT_ICON[key], onChange: (v) => { set(v); touch(); } });
    numberSlots[key] = el;
    return el;
  };

  // ---------------------------------------------------------------- per-mode forms
  if (mode === 'classic') {
    const d = draft as ClassicEntry;
    form.append(nameField.el, imageField('image', 'Character image', true, 3 / 4),
      h('div', { class: 'stat-grid' }, ...CLASSIC_STATS.map((s) => statField(s, CLASSIC_STAT_LABEL[s], () => d[s], (v) => { d[s] = v; }))),
      cutsceneField(false, 'Optional. Can be played from the Classic Draft reveal screen.'));
  } else if (mode === 'tournament') {
    const d = draft as TournamentEntry;
    form.append(nameField.el, imageField('image', 'Character image', true, 3 / 4),
      h('div', { class: 'stat-grid one' }, statField('value', 'Value', () => d.value, (v) => { d.value = v; })),
      h('p', { class: 'hint' }, 'Tournament matches are won by the higher Value. Equal values are decided by a fair coin toss.'));
  } else if (mode === 'team') {
    const d = draft as TeamEntry;
    const fxHolder = h('div');
    const renderFx = (): void => { replace(fxHolder, effectEditor(d, () => { renderFx(); touch(); }, touch)); };
    renderFx();
    form.append(nameField.el, imageField('image', 'Character image', true, 3 / 4),
      h('label', { class: 'lbl', style: 'margin-top:6px' }, 'Role values (one for every role)'),
      h('div', { class: 'stat-grid five' }, ...ROLES.map((r) => statField(r, ROLE_LABEL[r], () => d.roles[r], (v) => { d.roles[r] = v; }))),
      fxHolder,
      cutsceneField(false, 'Optional. Can be played from the Team Draft results.'));
  } else {
    const d = draft as CollectorEntry;
    const rarityRow = h('div', { class: 'chips rarity-chips' });
    const altHolder = h('div');
    const cutHolder = h('div');
    const renderRarity = (): void => {
      replace(rarityRow, ...RARITIES.map((r) => h('button', {
        class: `chip rchip r-${r} ${d.rarity === r ? 'on' : ''}`, type: 'button',
        on: { click: () => { d.rarity = r; renderRarity(); renderAlt(); renderCut(); touch(); } },
      }, RARITY_LABEL[r])));
    };
    const renderAlt = (): void => {
      const allowed = !d.rarity || ALT_RARITIES.includes(d.rarity);
      replace(altHolder, imageField('altArt', 'Alternative Art image', false, 5 / 7, {
        disabled: !allowed && !d.altArt,
        disabledReason: allowed ? undefined : 'Alternative Art exists only for Legendary, Mythic, Secret and Omniversal cards.',
        hint: allowed ? 'Optional. A separate collectible edition; only obtainable if this image exists.' : undefined,
      }));
    };
    const renderCut = (): void => {
      replace(cutHolder, cutsceneField(d.rarity === 'omniversal', d.rarity === 'omniversal'
        ? 'Required for Omniversal (both editions). Plays after the Omniversal reveal.'
        : 'Optional for this rarity.'));
    };
    renderRarity();
    renderAlt();
    renderCut();
    const desc = textField('Description', d.description, (v) => { d.description = v; touch(); }, { multiline: true, placeholder: 'Shown on the card detail screen' });
    form.append(nameField.el,
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Rarity', h('em', { class: 'req' }, ' *')), rarityRow),
      h('div', { class: 'two-col' }, imageField('normalArt', 'Normal Art image', true, 5 / 7), altHolder),
      cutHolder, desc.el);
  }

  // ---------------------------------------------------------------- preview
  function preview(): HTMLElement {
    if (mode === 'collector') {
      const d = draft as CollectorEntry;
      const ok = !!d.rarity;
      return h('div', { class: 'ed-preview' },
        h('label', { class: 'lbl' }, 'Card preview'),
        ok ? h('div', { class: 'ed-cards' },
          h('figure', null, cardView({ ...d, name: d.name || 'Untitled' }, 'normal', { size: 'md', variant: 'thumb' }), h('figcaption', null, 'Normal Art')),
          d.altArt && ALT_RARITIES.includes(d.rarity!) ? h('figure', null, cardView({ ...d, name: d.name || 'Untitled' }, 'alt', { size: 'md', variant: 'thumb' }), h('figcaption', null, 'Alternative Art')) : null)
          : h('p', { class: 'muted' }, 'Choose a rarity to preview the card frame.'),
        d.rarity ? rarityPill(d.rarity) : null,
        issuesEl);
    }
    const d = draft as ClassicEntry & TournamentEntry & TeamEntry;
    const stats: [string, string, number | null][] = mode === 'classic'
      ? CLASSIC_STATS.map((s) => [s, CLASSIC_STAT_LABEL[s], d[s]])
      : mode === 'tournament' ? [['value', 'Value', d.value]] : ROLES.map((r) => [r, ROLE_LABEL[r], d.roles[r]]);
    return h('div', { class: 'ed-preview' },
      h('label', { class: 'lbl' }, 'Preview'),
      h('div', { class: 'char-card' },
        fitImage(d.image, { variant: 'full', cls: 'cc-img', zoomable: !!d.image }),
        h('div', { class: 'cc-body' },
          h('h3', null, d.name || 'Untitled'),
          h('div', { class: 'cc-stats' }, ...stats.map(([k, l, v]) => h('div', { class: 'cc-stat' }, icon(STAT_ICON[k] ?? 'star'), h('span', null, l), h('b', null, v === null ? '—' : fmtNum(v))))),
          mode === 'team' && d.effect ? h('div', { class: 'fx-chip' }, icon('sparkle'), h('div', null, h('b', null, d.effect.name || 'Special Effect'), h('small', null, describeEffect(d.effect, (id) => repo.get('team', id)?.name ?? 'a character')))) : null,
          (d as any).cutscene ? h('button', { class: 'btn small', on: { click: () => void playCutscene((d as any).cutscene, { title: d.name }) } }, icon('play'), h('span', null, 'Play cutscene')) : null)),
      issuesEl);
  }

  // ---------------------------------------------------------------- actions
  const save = async (): Promise<void> => {
    if (!draft.name.trim()) {
      nameField.setError('Character name is required');
      toast('Give the character a name first', 'err');
      return;
    }
    const list = issues();
    if (!(await attempt(() => repo.saveEntry(mode, draft), 'Could not save'))) return;
    dirty = false;
    toast(list.length ? `Saved as incomplete — fix ${list.length} issue${list.length > 1 ? 's' : ''} to use it in the game` : `Saved “${draft.name.trim()}”`, list.length ? 'info' : 'ok', 3800);
    m.close();
  };
  const cancel = async (): Promise<void> => {
    if (dirty && !(await confirmDialog({ title: 'Discard changes?', message: 'Your unsaved changes to this entry will be lost.', confirm: 'Discard', danger: true }))) return;
    dirty = false;
    m.close();
  };
  const del = existing ? btn('Delete', async () => { if (await confirmDelete(mode, existing)) { dirty = false; m.close(); } }, 'ghost danger-text', 'trash') : null;
  const m = modal({
    title: `${isNew ? 'New' : 'Edit'} ${MODE_LABEL[mode]} entry`,
    cls: 'modal-xl editor',
    dismissable: false,
    content: h('div', { class: 'ed-layout' }, form, side),
    actions: [del, h('span', { class: 'grow' }), btn('Cancel', () => void cancel(), 'ghost'), btn('Save', () => void save(), 'primary', 'check')].filter(Boolean) as Node[],
  });
  m.el.querySelector('.modal-head')?.appendChild(h('button', { class: 'icon-btn', 'aria-label': 'Close', on: { click: () => void cancel() } }, icon('close')));
  refreshSide();
}

// ---------------------------------------------------------------- Special Effect editor

const COND_LABEL: Record<EffectCondition['type'], string> = {
  always: 'Always active',
  role: 'Assigned to a specific role',
  allyPresent: 'A specific character is on the same team',
  enemyPresent: 'A specific character is on the opposing team',
  roleValueAtLeast: "This character's assigned role value is at least…",
  underdog: "This team's base total is lower than the opponent's",
};
const IMPACT_LABEL: Record<EffectImpact['type'], string> = {
  flatSelf: '+ points to this team',
  percentSelf: "+ % of this character's role value",
  percentRole: "+ % of this team's value in a role",
  percentTeam: "+ % of this team's base total",
  flatEnemy: '− points to the opposing team',
  percentEnemy: "− % of the opposing team's base total",
};

function defaultCondition(t: EffectCondition['type']): EffectCondition {
  switch (t) {
    case 'role': return { type: 'role', role: 'captain' };
    case 'allyPresent': return { type: 'allyPresent', entryId: '' };
    case 'enemyPresent': return { type: 'enemyPresent', entryId: '' };
    case 'roleValueAtLeast': return { type: 'roleValueAtLeast', value: 80 };
    default: return { type: t } as EffectCondition;
  }
}
function defaultImpact(t: EffectImpact['type']): EffectImpact {
  switch (t) {
    case 'flatSelf': return { type: t, amount: 10 };
    case 'flatEnemy': return { type: t, amount: 10 };
    case 'percentRole': return { type: t, role: 'captain', percent: 10 };
    default: return { type: t, percent: 10 } as EffectImpact;
  }
}

function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = h('select', null, ...options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))) as HTMLSelectElement;
  s.value = value;
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}

function effectEditor(d: TeamEntry, rerender: () => void, touch: () => void): HTMLElement {
  if (!d.effect) {
    return h('div', { class: 'fx-box off' },
      h('div', { class: 'grow' }, h('strong', null, 'Special Effect'), h('small', { class: 'muted' }, ' optional — an explicit, deterministic bonus or penalty')),
      btn('Add Special Effect', () => {
        d.effect = { name: '', description: '', condition: { type: 'always' }, impact: { type: 'flatSelf', amount: 10 } };
        rerender();
      }, 'small', 'plus'));
  }
  const fx: SpecialEffect = d.effect;
  const roleOpts = ROLES.map((r) => [r, ROLE_LABEL[r]] as [Role, string]);
  const chars = repo.list('team').filter((e) => e.id !== d.id).map((e) => [e.id, e.name || 'Untitled'] as [string, string]);
  const ruleEl = h('div', { class: 'fx-rule' });
  const updateRule = (): void => {
    ruleEl.replaceChildren(icon('info'), h('span', null, describeEffect(fx, (id) => repo.get('team', id)?.name ?? '(choose a character)')));
  };
  const condExtra = h('div', { class: 'fx-extra' });
  const renderCondExtra = (): void => {
    const c = fx.condition;
    if (c.type === 'role') replace(condExtra, select(roleOpts, c.role, (v) => { c.role = v; updateRule(); touch(); }));
    else if (c.type === 'allyPresent' || c.type === 'enemyPresent') {
      replace(condExtra, chars.length
        ? select([['', '— choose a character —'], ...chars], c.entryId, (v) => { c.entryId = v; updateRule(); touch(); })
        : h('small', { class: 'warn-text' }, 'Add other Team Draft characters first.'));
    } else if (c.type === 'roleValueAtLeast') {
      replace(condExtra, numberField({ label: 'Threshold', value: c.value, onChange: (v) => { c.value = v as number; updateRule(); touch(); } }));
    } else replace(condExtra);
  };
  const impExtra = h('div', { class: 'fx-extra' });
  const renderImpExtra = (): void => {
    const i = fx.impact;
    const parts: HTMLElement[] = [];
    if (i.type === 'percentRole') parts.push(select(roleOpts, i.role, (v) => { i.role = v; updateRule(); touch(); }));
    if ('amount' in i) parts.push(numberField({ label: 'Points', value: i.amount, min: 0, onChange: (v) => { i.amount = v as number; updateRule(); touch(); } }));
    else parts.push(numberField({ label: 'Percent', value: i.percent, min: 0, onChange: (v) => { i.percent = v as number; updateRule(); touch(); } }));
    replace(impExtra, ...parts);
  };
  const name = textField('Effect name', fx.name, (v) => { fx.name = v; touch(); }, { required: true, placeholder: 'e.g. Inspiring Leader' });
  const desc = textField('Effect description', fx.description, (v) => { fx.description = v; touch(); }, { multiline: true, placeholder: 'Flavour text shown on the results screen' });
  renderCondExtra();
  renderImpExtra();
  updateRule();
  return h('div', { class: 'fx-box' },
    h('div', { class: 'row' }, h('strong', { class: 'grow' }, icon('sparkle'), ' Special Effect'),
      btn('Remove effect', () => { d.effect = null; rerender(); }, 'small ghost', 'trash')),
    name.el,
    h('div', { class: 'two-col' },
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Activation condition'),
        select(Object.entries(COND_LABEL) as [EffectCondition['type'], string][], fx.condition.type, (v) => { fx.condition = defaultCondition(v); renderCondExtra(); updateRule(); touch(); }), condExtra),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Impact on the team result'),
        select(Object.entries(IMPACT_LABEL) as [EffectImpact['type'], string][], fx.impact.type, (v) => { fx.impact = defaultImpact(v); renderImpExtra(); updateRule(); touch(); }), impExtra)),
    ruleEl,
    desc.el,
    h('p', { class: 'hint' }, 'Effects are evaluated on the base role values only, so they never depend on each other or on order. Contributions are rounded to 2 decimals.'));
}

/** Read-only detail used in lists. */
export function entrySummary(mode: Mode, e: AnyEntry): HTMLElement {
  if (mode === 'classic') {
    const d = e as ClassicEntry;
    return h('div', { class: 'es-stats' }, ...CLASSIC_STATS.map((s) => h('span', null, h('small', null, CLASSIC_STAT_LABEL[s]), h('b', null, d[s] === null ? '—' : fmtNum(d[s]!)))));
  }
  if (mode === 'tournament') {
    const d = e as TournamentEntry;
    return h('div', { class: 'es-stats' }, h('span', null, h('small', null, 'Value'), h('b', null, d.value === null ? '—' : fmtNum(d.value))));
  }
  if (mode === 'team') {
    const d = e as TeamEntry;
    return h('div', { class: 'es-stats' }, ...ROLES.map((r) => h('span', null, h('small', null, ROLE_LABEL[r].split(' ')[0]!), h('b', null, d.roles[r] === null ? '—' : fmtNum(d.roles[r]!)))),
      d.effect ? h('span', { class: 'badge gold' }, icon('sparkle'), d.effect.name || 'Effect') : null);
  }
  const d = e as CollectorEntry;
  return h('div', { class: 'es-stats' }, d.rarity ? rarityPill(d.rarity as Rarity) : h('span', { class: 'badge warn' }, 'No rarity'),
    d.altArt ? h('span', { class: 'badge gold' }, 'Alt Art') : null,
    d.cutscene ? h('span', { class: 'badge blue' }, icon('video'), 'Cutscene') : null);
}

export function entryThumb(mode: Mode, e: AnyEntry): HTMLElement {
  if (mode === 'collector') {
    const d = e as CollectorEntry;
    return fitImage(d.normalArt, { variant: 'thumb', cls: 'es-thumb' });
  }
  return fitImage((e as ClassicEntry).image, { variant: 'thumb', cls: 'es-thumb' });
}

export { videoPoster };
