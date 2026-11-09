/** Team Draft: snake draft of five roles each (stats hidden), then a full breakdown with deterministic Special Effects. */
import { h, replace } from '../dom';
import { icon } from '../icons';
import { home, type Screen } from '../router';
import { topbar, dbLink, emptyState } from '../components/common';
import { btn, confirmDialog, guard, toast } from '../overlay';
import { repo } from '../../store/repo';
import { coin, cryptoRng, pick } from '../../core/rng';
import { draftOrder, scoreTeams, type Team, type TeamResult } from '../../engines/team';
import { applyMatch, type MatchRewardResult } from '../../engines/economy';
import { ROLES, ROLE_LABEL, type PlayerId, type Role, type TeamEntry } from '../../model/types';
import { fitImage } from '../components/media';
import { rewardLines } from '../components/match';
import { playCutscene } from '../components/cutscene';
import { STAT_ICON } from './database/editors';
import { fmtNum } from '../../core/util';
import { sfx } from '../sound';
import { burstAt } from '../components/fx';

type Phase = 'setup' | 'toss' | 'draft' | 'results';
type Slots = Record<PlayerId, Partial<Record<Role, TeamEntry>>>;

const ROLE_ICON: Record<Role, Parameters<typeof icon>[0]> = { captain: 'crown', tank: 'shield', hax: 'sparkle', planner: 'brain', support: 'users' };

export function teamScreen(): Screen {
  const el = h('div', { class: 'team mode-screen' });
  const body = h('div', { class: 'wrap wide' });
  let phase: Phase = 'setup';
  let order: PlayerId[] = [];
  let pickNo = 0;
  let slots: Slots = { p1: {}, p2: {} };
  let selected: TeamEntry | null = null;
  let selectedRole: Role | null = null;
  let query = '';
  let result: TeamResult | null = null;
  let rewards: Record<PlayerId, MatchRewardResult> | null = null;

  const pool = (): TeamEntry[] => repo.valid('team');
  const takenBy = (id: string): PlayerId | null => (['p1', 'p2'] as const).find((p) => ROLES.some((r) => slots[p][r]?.id === id)) ?? null;
  const current = (): PlayerId => order[pickNo]!;

  const start = (): void => {
    slots = { p1: {}, p2: {} };
    pickNo = 0;
    selected = null;
    selectedRole = null;
    result = null;
    rewards = null;
    const first: PlayerId = coin(cryptoRng) ? 'p1' : 'p2';
    order = draftOrder(first);
    phase = 'toss';
    render();
  };

  const lockIn = (): void => {
    if (!selected || !selectedRole) return;
    const p = current();
    if (slots[p][selectedRole] || takenBy(selected.id)) return;
    slots[p][selectedRole] = selected;
    sfx.flip();
    selected = null;
    selectedRole = null;
    pickNo++;
    if (pickNo >= order.length) {
      void finish();
      return;
    }
    render();
  };

  const finish = async (): Promise<void> => {
    result = scoreTeams({ p1: slots.p1 as Team, p2: slots.p2 as Team });
    const w = result.winner;
    const outcome = (p: PlayerId) => (w === 'tie' ? 'draw' : w === p ? 'win' : 'loss') as 'win' | 'loss' | 'draw';
    const s1 = fmtNum(result.p1.total), s2 = fmtNum(result.p2.total);
    const r = await guard(() => repo.mutate(['p1', 'p2'], (ps) => ({
      p1: applyMatch(ps.p1, 'team', outcome('p1'), `${s1}–${s2}`, ps.p2.name, Date.now()),
      p2: applyMatch(ps.p2, 'team', outcome('p2'), `${s2}–${s1}`, ps.p1.name, Date.now()),
    })), 'Could not save the match result');
    rewards = r ?? null;
    phase = 'results';
    render();
  };

  // ---------------------------------------------------------------- views
  const setupView = (): HTMLElement => {
    const n = pool().length;
    if (n < 10) {
      return h('div', { class: 'panel' }, emptyState('users', 'Team Draft needs at least 10 characters',
        `Two teams of five different characters are drafted, so the Team Draft database needs 10 valid characters (${n} ready). Each needs an image and a value for every role.`, dbLink('Open the Team Draft database')));
    }
    return h('div', { class: 'stack' },
      h('div', { class: 'panel hero-panel' },
        h('div', { class: 'hp-icon violet' }, icon('users', 'ic big')),
        h('h2', { class: 'display' }, 'Team Draft'),
        h('p', { class: 'muted' }, 'Draft a team of five: Captain, Tank, Hax User, Planner and Support. Statistics are hidden during the draft — pick by what you know about each character. A character taken by one player cannot be taken by the other, and every pick is final.'),
        h('div', { class: 'role-strip' }, ...ROLES.map((r) => h('span', { class: 'role-chip' }, icon(ROLE_ICON[r]), ROLE_LABEL[r]))),
        h('p', { class: 'hint' }, 'A coin toss decides who picks first; the draft then snakes (A, B, B, A, A, B, B, A, A, B) so both players get the same number of early picks. Each character scores its value for the role it is assigned to, plus any Special Effects.'),
        btn('Start draft', start, 'primary big', 'play')));
  };

  const tossView = (): HTMLElement => {
    const first = order[0]!;
    const v = h('div', { class: 'stack center' },
      h('div', { class: `coin-toss big ${first === 'p1' ? 'land-heads' : 'land-tails'}` }, h('div', { class: 'coin' }, h('i', { class: 'heads' }, 'P1'), h('i', { class: 'tails' }, 'P2'))),
      h('h2', { class: 'display toss-result' }, `${repo.player(first).name} picks first`),
      h('p', { class: 'muted' }, 'Draft order: ' + order.map((p) => p.toUpperCase()).join(' · ')),
      btn('Begin the draft', () => { phase = 'draft'; render(); }, 'primary big', 'play'));
    sfx.coin();
    return v;
  };

  const teamPanel = (p: PlayerId): HTMLElement => {
    const active = phase === 'draft' && current() === p;
    return h('div', { class: `team-panel ${p} ${active ? 'active' : ''}` },
      h('div', { class: 'tp-head' }, h('span', { class: `ptag ${p}` }, p.toUpperCase()), h('strong', null, repo.player(p).name), active ? h('span', { class: 'badge blue' }, 'Picking') : null),
      h('div', { class: 'tp-slots' }, ...ROLES.map((r) => {
        const c = slots[p][r];
        const choosable = active && !c && !!selected;
        const b = h('button', {
          class: `slot ${c ? 'filled' : ''} ${choosable ? 'choosable' : ''} ${active && selectedRole === r ? 'on' : ''}`,
          disabled: !choosable && !c ? true : undefined,
          on: { click: () => { if (choosable) { selectedRole = r; sfx.tap(); render(); } } },
        },
          h('span', { class: 'slot-role' }, icon(ROLE_ICON[r]), ROLE_LABEL[r]),
          c ? h('div', { class: 'slot-char' }, fitImage(c.image, { variant: 'thumb', alt: c.name }), h('span', null, c.name), icon('lock', 'ic lockic')) : h('div', { class: 'slot-empty' }, choosable ? 'Assign here' : '—'));
        return b;
      })));
  };

  const draftView = (): HTMLElement => {
    const p = current();
    const q = query.trim().toLowerCase();
    const list = pool().filter((e) => !q || e.name.toLowerCase().includes(q));
    const search = h('input', { type: 'search', placeholder: 'Search characters…', value: query }) as HTMLInputElement;
    search.addEventListener('input', () => {
      query = search.value;
      const pos = search.selectionStart;
      render();
      const s = el.querySelector<HTMLInputElement>('.pool-tools input');
      if (s) { s.focus(); s.setSelectionRange(pos, pos); }
    });
    const available = pool().filter((e) => !takenBy(e.id));
    const grid = h('div', { class: 'pool-grid' }, ...list.map((e) => {
      const tb = takenBy(e.id);
      const b = h('button', { class: `pool-card ${tb ? `taken ${tb}` : ''} ${selected?.id === e.id ? 'on' : ''}`, disabled: tb ? true : undefined,
        on: { click: () => { selected = e; sfx.tap(); if (selectedRole && slots[p][selectedRole]) selectedRole = null; render(); } } },
        fitImage(e.image, { variant: 'thumb', alt: e.name }),
        h('span', { class: 'pc-name' }, e.name),
        tb ? h('span', { class: `pc-taken ptag ${tb}` }, `${tb.toUpperCase()}`) : null);
      return b;
    }));
    const free = ROLES.filter((r) => !slots[p][r]);
    const lock = btn(selected && selectedRole ? `Lock in ${selected.name} as ${ROLE_LABEL[selectedRole]}` : selected ? 'Choose a role slot for this character' : 'Choose a character', lockIn, 'primary big wide', 'lock');
    lock.disabled = !(selected && selectedRole);
    return h('div', { class: 'stack' },
      h('div', { class: `draft-banner ${p}` },
        h('span', { class: `ptag ${p}` }, p.toUpperCase()),
        h('div', { class: 'grow' }, h('strong', null, `${repo.player(p).name}, choose a character`), h('small', null, `Pick ${pickNo + 1} of 10 · next: ${order[pickNo + 1] ? repo.player(order[pickNo + 1]!).name : '—'}`)),
        h('div', { class: 'draft-dots' }, ...order.map((o, i) => h('i', { class: `${o} ${i < pickNo ? 'done' : ''} ${i === pickNo ? 'now' : ''}` })))),
      h('div', { class: 'draft-layout' },
        teamPanel('p1'),
        h('div', { class: 'pool' },
          h('div', { class: 'pool-tools' }, h('div', { class: 'search' }, icon('search'), search),
            btn('Random', () => { selected = pick(cryptoRng, available); render(); }, 'ghost small', 'dice')),
          selected ? h('div', { class: 'role-pick' }, h('small', { class: 'muted' }, `Assign ${selected.name} to:`),
            h('div', { class: 'chips' }, ...free.map((r) => h('button', { class: `chip ${selectedRole === r ? 'on' : ''}`, on: { click: () => { selectedRole = r; sfx.tap(); render(); } } }, icon(ROLE_ICON[r]), ROLE_LABEL[r])))) : null,
          lock,
          grid),
        teamPanel('p2')));
  };

  const resultsView = (): HTMLElement => {
    const r = result!;
    const w = r.winner;
    const row = (role: Role): HTMLElement => {
      const cell = (p: PlayerId): HTMLElement => {
        const m = r[p].members.find((x) => x.role === role)!;
        const c = slots[p][role]!;
        return h('div', { class: `tr-cell ${p}` },
          fitImage(c.image, { variant: 'thumb', alt: c.name, zoomable: true }),
          h('div', { class: 'grow' }, h('strong', null, c.name),
            c.cutscene ? h('button', { class: 'chip', on: { click: () => void playCutscene(c.cutscene!, { title: c.name }) } }, icon('play'), 'Cutscene') : null),
          h('b', { class: 'tr-val' }, fmtNum(m.value)));
      };
      return h('div', { class: 'tr-row' }, cell('p1'), h('div', { class: 'tr-role' }, icon(ROLE_ICON[role]), h('span', null, ROLE_LABEL[role])), cell('p2'));
    };
    const fxList = r.effects.length ? h('div', { class: 'panel stack' }, h('h3', { class: 'panel-h' }, icon('sparkle'), ' Special Effects'),
      ...r.effects.map((e) => h('div', { class: `fx-res ${e.active ? 'on' : 'off'} ${e.owner}` },
        h('span', { class: `ptag ${e.owner}` }, e.owner.toUpperCase()),
        h('div', { class: 'grow' },
          h('strong', null, `${e.name || 'Special Effect'} `, h('small', { class: 'muted' }, `— ${e.sourceName}`)),
          e.description ? h('p', { class: 'muted' }, e.description) : null,
          h('small', { class: 'fx-rule-text' }, e.rule),
          h('small', { class: e.active ? 'ok-text' : 'dim' }, e.active ? `Activated: ${e.explanation}` : 'Not activated: condition not met')),
        h('b', { class: 'fx-delta' }, e.active ? (e.selfDelta ? `+${fmtNum(e.selfDelta)}` : `−${fmtNum(e.enemyDelta)}`) : '0')))) : h('p', { class: 'muted center-text' }, 'No Special Effects in this match.');
    const total = (p: PlayerId): HTMLElement => h('div', { class: `tr-total ${p} ${w === p ? 'win' : ''}` },
      h('span', { class: `ptag ${p}` }, `${p.toUpperCase()} · ${repo.player(p).name}`),
      h('b', { class: 'count', dataset: { to: String(r[p].total) } }, '0'),
      h('small', null, `base ${fmtNum(r[p].base)}${r[p].effectBonus ? ` + effects ${fmtNum(r[p].effectBonus)}` : ''}${r[p].penaltyTaken ? ` − penalties ${fmtNum(r[p].penaltyTaken)}` : ''}`));
    const view = h('div', { class: 'stack' },
      h('div', { class: `final-banner ${w}` }, icon(w === 'tie' ? 'swap' : 'trophy', 'ic big'),
        h('h2', { class: 'display' }, w === 'tie' ? 'Draw — equal team totals' : `${repo.player(w).name} wins the Team Draft!`)),
      h('div', { class: 'tr-totals' }, total('p1'), h('div', { class: 'vs-badge small' }, 'VS'), total('p2')),
      h('div', { class: 'panel team-results' }, ...ROLES.map(row)),
      fxList,
      rewards ? rewardLines(rewards) : null,
      h('div', { class: 'row center' }, btn('Draft again', start, 'primary big', 'refresh'), btn('Main menu', () => void home(), 'ghost big', 'back')));
    requestAnimationFrame(() => {
      view.querySelectorAll<HTMLElement>('.count').forEach((n) => {
        const to = Number(n.dataset.to);
        const t0 = performance.now();
        const stepF = (t: number): void => {
          const k = Math.min(1, (t - t0) / 1200);
          n.textContent = fmtNum(to * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(stepF);
        };
        requestAnimationFrame(stepF);
      });
      setTimeout(() => {
        if (w === 'tie') { sfx.tie(); return; }
        sfx.win();
        const t = view.querySelector(`.tr-total.${w}`);
        if (t) burstAt(t, { colors: ['#ffd76e', '#fff', w === 'p1' ? '#4fa8ff' : '#ff6fae'], count: 60, speed: 7, kind: 'star', size: 5 });
        if (repo.settings.autoplayCutscenes) {
          const mvp = r[w].members.map((m) => ({ m, c: slots[w][m.role]! })).filter((x) => x.c.cutscene).sort((a, b) => b.m.value - a.m.value)[0];
          if (mvp) setTimeout(() => void playCutscene(mvp.c.cutscene!, { title: mvp.c.name, subtitle: 'Team MVP' }), 1200);
        }
      }, 1250);
    });
    return view;
  };

  const render = (): void => {
    const v: Record<Phase, () => HTMLElement> = { setup: setupView, toss: tossView, draft: draftView, results: resultsView };
    replace(body, v[phase]());
  };

  el.append(topbar({ title: 'Team Draft', sub: 'Five roles · hidden statistics' }), body);
  render();
  return {
    el,
    refresh: () => { if (phase === 'setup') render(); },
    canLeave: async () => phase === 'setup' || phase === 'results' ||
      confirmDialog({ title: 'Leave the draft?', message: 'The draft in progress will be abandoned and will not count.', confirm: 'Leave', danger: true }),
  };
}

export { toast, STAT_ICON };
