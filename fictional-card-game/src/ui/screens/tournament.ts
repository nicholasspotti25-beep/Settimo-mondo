/** Tournament: automatic single-elimination bracket with animated matches, coin tosses and one-time placement rewards. */
import { h, replace } from '../dom';
import { icon } from '../icons';
import { home, type Screen } from '../router';
import { topbar, dbLink, emptyState, notice } from '../components/common';
import { attempt, btn, guard, toast } from '../overlay';
import { repo } from '../../store/repo';
import { cryptoRng } from '../../core/rng';
import { uid, fmtNum } from '../../core/util';
import {
  PLACEMENTS, PLACEMENT_LABEL, TOURNAMENT_REWARDS, TOURNAMENT_SIZES, createTournament, playerResult, reachablePlacements, roundName,
  type BracketMatch, type TournamentSize, type TournamentState,
} from '../../engines/tournament';
import { applyTournament } from '../../engines/economy';
import { fitImage } from '../components/media';
import type { PlayerId } from '../../model/types';
import { sfx } from '../sound';
import { burstAt } from '../components/fx';

type Phase = 'setup' | 'assign' | 'running' | 'results';

function rewardTable(size: TournamentSize): HTMLElement {
  const reach = new Set(reachablePlacements(size));
  return h('div', { class: 'reward-table' }, ...PLACEMENTS.map((p) => {
    const v = TOURNAMENT_REWARDS[size][p];
    const ok = reach.has(p) && v !== undefined;
    return h('div', { class: `rt-cell ${ok ? '' : 'na'} ${p}` }, h('small', null, PLACEMENT_LABEL[p]), h('b', null, ok ? `${v} FC` : '—'),
      !ok && v !== undefined ? h('em', null, 'not reachable at this size') : null);
  }));
}

export function tournamentScreen(): Screen {
  const el = h('div', { class: 'tournament mode-screen' });
  const body = h('div', { class: 'wrap' });
  let phase: Phase = 'setup';
  let size: TournamentSize = 8;
  let t: TournamentState | null = repo.pendingTournament;
  let step = 0; // index into flattened matches
  let speed = 1;
  let paused = false;
  let timer = 0;
  let finalized: Record<PlayerId, { placement: string; reward: number }> | null = null;

  const flat = (): { round: number; idx: number; m: BracketMatch }[] => t ? t.rounds.flatMap((r, round) => r.map((m, idx) => ({ round, idx, m }))) : [];

  const start = async (): Promise<void> => {
    const pool = repo.valid('tournament').map((e) => ({ id: e.id, name: e.name, value: e.value ?? 0, imageId: e.image?.id ?? null }));
    if (pool.length < size) { toast(`A ${size}-participant tournament needs ${size} characters`, 'err'); return; }
    const nt = createTournament(cryptoRng, pool, size, uid('tr'), Date.now());
    if (!(await attempt(() => repo.savePendingTournament(nt), 'Could not start the tournament'))) return;
    t = nt;
    step = 0;
    finalized = null;
    phase = 'assign';
    render();
  };

  const finalize = async (): Promise<void> => {
    if (!t) return;
    clearTimeout(timer);
    const tt = t;
    const champ = tt.participants[tt.champion]!.name;
    const res = { p1: playerResult(tt, 'p1'), p2: playerResult(tt, 'p2') };
    const todo = (['p1', 'p2'] as const).filter((p) => !repo.player(p).tournaments.some((x) => x.id === tt.id));
    if (todo.length) {
      const ok = await attempt(() => repo.mutate([...todo], (ps) => {
        for (const p of todo) {
          applyTournament(ps[p], { id: tt.id, at: Date.now(), size: tt.size, character: res[p].participant.name, placement: res[p].placement, reward: res[p].reward, champion: champ }, Date.now());
        }
      }, [repo.setPendingTournamentOp(null)], () => repo.setPendingTournamentLocal(null)), 'Could not save the tournament result');
      if (!ok) return;
      toast(`Tournament rewards: ${repo.player('p1').name} +${res.p1.reward} FC · ${repo.player('p2').name} +${res.p2.reward} FC`, 'fc', 4500);
    } else {
      await guard(() => repo.savePendingTournament(null), 'Could not clear the tournament');
    }
    finalized = { p1: { placement: res.p1.placement, reward: res.p1.reward }, p2: { placement: res.p2.placement, reward: res.p2.reward } };
    phase = 'results';
    step = flat().length;
    render();
    sfx.win();
  };

  // ---------------------------------------------------------------- bracket
  const tagFor = (idx: number): HTMLElement | null => {
    if (!t) return null;
    if (t.assigned.p1 === idx) return h('span', { class: 'ptag p1' }, 'P1');
    if (t.assigned.p2 === idx) return h('span', { class: 'ptag p2' }, 'P2');
    return null;
  };
  const bracket = (revealedUpTo: number): HTMLElement => {
    if (!t) return h('div');
    const offsets: number[] = [];
    let acc = 0;
    for (const r of t.rounds) { offsets.push(acc); acc += r.length; }
    const isDecided = (r: number, j: number): boolean => offsets[r]! + j < revealedUpTo;
    const cols = t.rounds.map((round, r) => h('div', { class: 'br-col' },
      h('div', { class: 'br-round' }, roundName(t!.size, r)),
      h('div', { class: 'br-matches' }, ...round.map((m, j) => {
        const i = offsets[r]! + j;
        const decided = i < revealedUpTo;
        const current = i === revealedUpTo && phase === 'running';
        const slot = (idx: number, feeder: number): HTMLElement => {
          const known = r === 0 || isDecided(r - 1, feeder);
          const p = t!.participants[idx]!;
          return h('div', { class: `br-slot ${decided ? (m.winner === idx ? 'win' : 'lose') : ''} ${known && t!.assigned.p1 === idx ? 'is-p1' : ''} ${known && t!.assigned.p2 === idx ? 'is-p2' : ''}` },
            known ? tagFor(idx) : null, h('span', { class: 'br-name' }, known ? p.name : 'TBD'), h('b', null, known ? fmtNum(p.value) : ''));
        };
        return h('div', { class: `br-match ${decided ? 'done' : ''} ${current ? 'current' : ''}` }, slot(m.a, 2 * j), slot(m.b, 2 * j + 1), m.coin && decided ? h('span', { class: 'br-coin', title: 'Decided by coin toss' }, 'coin') : null);
      }))));
    cols.push(h('div', { class: 'br-col champ' }, h('div', { class: 'br-round' }, 'Champion'),
      h('div', { class: 'br-matches' }, h('div', { class: `br-champ ${revealedUpTo >= acc ? 'on' : ''}` },
        icon('crown'), revealedUpTo >= acc ? h('span', null, t.participants[t.champion]!.name) : h('span', { class: 'dim' }, '?')))));
    return h('div', { class: `bracket size-${t.size}` }, ...cols);
  };

  const participantCard = (idx: number, cls = ''): HTMLElement => {
    const p = t!.participants[idx]!;
    return h('div', { class: `t-part ${cls} ${t!.assigned.p1 === idx ? 'is-p1' : ''} ${t!.assigned.p2 === idx ? 'is-p2' : ''}` },
      h('div', { class: 'f-frame' }, fitImage(p.imageId ? { id: p.imageId } : null, { variant: 'full', alt: p.name })),
      h('div', { class: 't-part-meta' }, tagFor(idx), h('strong', null, p.name), h('span', { class: 't-val' }, h('small', null, 'Value'), h('b', { class: 'val' }, '?'))));
  };

  // ---------------------------------------------------------------- views
  const setupView = (): HTMLElement => {
    const n = repo.valid('tournament').length;
    if (n < 2) {
      return h('div', { class: 'panel' }, emptyState('trophy', 'Tournament needs at least 2 characters',
        `The Tournament database has ${n} valid character${n === 1 ? '' : 's'}. Add characters with an image and a Value.`, dbLink('Open the Tournament database')));
    }
    if (n < size) size = ([...TOURNAMENT_SIZES].reverse().find((s) => s <= n) ?? 2) as TournamentSize;
    return h('div', { class: 'stack' },
      h('div', { class: 'panel hero-panel' },
        h('div', { class: 'hp-icon gold' }, icon('trophy', 'ic big')),
        h('h2', { class: 'display' }, 'Tournament'),
        h('p', { class: 'muted' }, 'Player 1 and Player 2 each receive a different random character; the other slots are filled at random from the Tournament database, with no duplicates. Matches run automatically: the higher Value wins, equal Values are settled by a fair coin toss.'),
        h('div', { class: 'setup-row' }, h('label', { class: 'lbl' }, 'Participants'),
          h('div', { class: 'chips' }, ...TOURNAMENT_SIZES.map((s) => {
            const b = h('button', { class: `chip big-chip ${size === s ? 'on' : ''}`, on: { click: () => { size = s; render(); } } }, String(s),
              s > n ? h('small', null, `needs ${s}`) : null) as HTMLButtonElement;
            b.disabled = s > n;
            return b;
          }))),
        h('p', { class: 'hint' }, `${n} characters available.`),
        h('label', { class: 'lbl' }, `Rewards for a ${size}-participant tournament (per player, by their character’s placement)`),
        rewardTable(size),
        btn(`Start ${size}-participant tournament`, () => void start(), 'gold big', 'play')));
  };

  const assignView = (): HTMLElement => {
    const card = (p: PlayerId): HTMLElement => {
      const idx = t!.assigned[p];
      const x = t!.participants[idx]!;
      return h('div', { class: `assign-card ${p}` },
        h('span', { class: `ptag ${p}` }, `${p.toUpperCase()} · ${repo.player(p).name}`),
        h('div', { class: 'f-frame' }, fitImage(x.imageId ? { id: x.imageId } : null, { variant: 'full', alt: x.name, zoomable: true })),
        h('h3', { class: 'display' }, x.name),
        h('span', { class: 'badge gold' }, `Value ${fmtNum(x.value)}`));
    };
    return h('div', { class: 'stack' },
      h('h2', { class: 'display center-text' }, 'Your champions'),
      h('div', { class: 'assign' }, card('p1'), h('div', { class: 'vs-badge' }, 'VS'), card('p2')),
      h('p', { class: 'muted center-text' }, `${t!.size} participants · ${t!.rounds.length} round${t!.rounds.length > 1 ? 's' : ''}. The bracket was seeded at random.`),
      h('div', { class: 'row center' }, btn('Start the tournament', () => { phase = 'running'; paused = false; render(); runStep(); }, 'gold big', 'play'),
        btn('Skip to results', () => void finalize(), 'ghost big', 'skip')));
  };

  const stage = h('div', { class: 't-stage' });
  const bracketHolder = h('div', { class: 'bracket-scroll' });
  const runningView = (): HTMLElement => {
    const controls = h('div', { class: 'run-controls' },
      h('button', { class: 'icon-btn', 'aria-label': paused ? 'Play' : 'Pause', on: { click: () => { paused = !paused; render(); if (!paused) runStep(); } } }, icon(paused ? 'play' : 'pause')),
      h('div', { class: 'seg small' }, ...[1, 2, 4, 8].map((s) => h('button', { class: speed === s ? 'on' : '', on: { click: () => { speed = s; render(); } } }, `${s}×`))),
      h('span', { class: 'grow muted run-progress' }, `Match ${Math.min(step + 1, flat().length)} of ${flat().length}`),
      btn('Skip to results', () => void finalize(), 'ghost small', 'skip'));
    replace(bracketHolder, bracket(step));
    return h('div', { class: 'stack' }, controls, stage, h('div', { class: 'panel tight' }, bracketHolder));
  };

  const runStep = (): void => {
    clearTimeout(timer);
    if (phase !== 'running' || paused || !t) return;
    const all = flat();
    if (step >= all.length) { void finalize(); return; }
    const { round, m } = all[step]!;
    const ms = (x: number): number => x / speed;
    const a = participantCard(m.a, 'left'), b = participantCard(m.b, 'right');
    const result = h('div', { class: 't-result' });
    replace(stage, h('div', { class: 't-round-name' }, roundName(t.size, round)), h('div', { class: 't-duel' }, a, h('div', { class: 'vs-badge small' }, 'VS'), b), result);
    const pa = t.participants[m.a]!, pb = t.participants[m.b]!;
    timer = window.setTimeout(() => {
      (a.querySelector('.val') as HTMLElement).textContent = fmtNum(pa.value);
      (b.querySelector('.val') as HTMLElement).textContent = fmtNum(pb.value);
      sfx.flip();
      timer = window.setTimeout(() => {
        const winEl = m.winner === m.a ? a : b;
        const loseEl = m.winner === m.a ? b : a;
        const conclude = (): void => {
          winEl.classList.add('winner');
          loseEl.classList.add('loser');
          const wName = t!.participants[m.winner]!.name;
          const involves = t!.assigned.p1 === m.a || t!.assigned.p1 === m.b || t!.assigned.p2 === m.a || t!.assigned.p2 === m.b;
          result.replaceChildren(h('b', null, `${wName} advances`), ...(m.coin ? [h('small', null, 'Equal Values — decided by coin toss')] : []));
          if (involves) { sfx.win(); burstAt(winEl, { colors: ['#ffd76e', '#fff', '#86e8ff'], count: 30, speed: 5, kind: 'star' }); } else sfx.tap();
          step++;
          replace(bracketHolder, bracket(step));
          const prog = el.querySelector('.run-progress');
          if (prog) prog.textContent = `Match ${Math.min(step + 1, all.length)} of ${all.length}`;
          const curEl = bracketHolder.querySelector<HTMLElement>('.br-match.current');
          if (curEl) {
            // scroll only the bracket panel, never the page
            const box = bracketHolder.getBoundingClientRect(), r = curEl.getBoundingClientRect();
            bracketHolder.scrollTo({
              left: bracketHolder.scrollLeft + (r.left - box.left) - box.width / 2 + r.width / 2,
              top: bracketHolder.scrollTop + (r.top - box.top) - box.height / 2 + r.height / 2,
              behavior: speed > 2 ? 'auto' : 'smooth',
            });
          }
          timer = window.setTimeout(runStep, ms(900));
        };
        if (m.coin) {
          const coin = h('div', { class: 'coin-toss' }, h('div', { class: 'coin' }, h('i', { class: 'heads' }, pa.name.slice(0, 1)), h('i', { class: 'tails' }, pb.name.slice(0, 1))));
          result.replaceChildren(h('small', null, 'Equal Values — coin toss!'), coin);
          coin.classList.add(m.winner === m.a ? 'land-heads' : 'land-tails');
          sfx.coin();
          timer = window.setTimeout(conclude, ms(1600));
        } else conclude();
      }, ms(700));
    }, ms(650));
  };

  const resultsView = (): HTMLElement => {
    if (!t || !finalized) return h('div');
    const champ = t.participants[t.champion]!;
    const line = (p: PlayerId): HTMLElement => {
      const x = t!.participants[t!.assigned[p]]!;
      const f = finalized![p];
      return h('div', { class: `t-final ${p}` },
        h('div', { class: 'f-frame' }, fitImage(x.imageId ? { id: x.imageId } : null, { variant: 'thumb', alt: x.name })),
        h('div', { class: 'grow' }, h('span', { class: `ptag ${p}` }, `${p.toUpperCase()} · ${repo.player(p).name}`), h('h3', null, x.name),
          h('span', { class: `badge ${f.placement === 'champion' ? 'gold' : 'blue'}` }, PLACEMENT_LABEL[f.placement as keyof typeof PLACEMENT_LABEL])),
        h('div', { class: 'rw-fc big' }, `+${f.reward} FC`));
    };
    const view = h('div', { class: 'stack' },
      h('div', { class: 'champion-banner' },
        h('div', { class: 'f-frame' }, fitImage(champ.imageId ? { id: champ.imageId } : null, { variant: 'full', alt: champ.name, zoomable: true })),
        h('div', null, h('span', { class: 'kicker' }, icon('crown'), ' Champion'), h('h2', { class: 'display' }, champ.name), tagFor(t.champion), h('p', { class: 'muted' }, `Value ${fmtNum(champ.value)} · ${t.size} participants`))),
      h('div', { class: 'panel stack' }, h('h3', { class: 'panel-h' }, icon('coin'), ' Rewards (granted once, saved to each player’s tournament history)'), line('p1'), line('p2')),
      h('div', { class: 'panel tight' }, h('div', { class: 'bracket-scroll' }, bracket(flat().length))),
      h('div', { class: 'row center' },
        btn('New tournament', () => { t = null; phase = 'setup'; render(); }, 'gold big', 'refresh'),
        btn('Main menu', () => void home(), 'ghost big', 'back')));
    requestAnimationFrame(() => { const b = view.querySelector('.champion-banner .f-frame'); if (b) burstAt(b, { colors: ['#ffd76e', '#fff3c4', '#8f63ff'], count: 70, speed: 8, kind: 'star', size: 5 }); });
    return view;
  };

  const resumeView = (): HTMLElement => h('div', { class: 'panel stack' },
    notice('info', 'A tournament was started earlier and has not been completed. Its results were decided when it started; rewards are granted once when it finishes.'),
    h('div', { class: 'row' },
      btn('Watch it', () => { phase = 'assign'; step = 0; render(); }, 'gold', 'play'),
      btn('Skip to results', () => void finalize(), 'ghost', 'skip')));

  const render = (): void => {
    if (phase === 'setup' && t && repo.pendingTournament?.id === t.id) {
      replace(body, resumeView());
      return;
    }
    const v: Record<Phase, () => HTMLElement> = { setup: setupView, assign: assignView, running: runningView, results: resultsView };
    replace(body, v[phase]());
  };

  el.append(topbar({ title: 'Tournament', sub: 'Automatic bracket · 2 to 64 participants' }), body);
  render();
  return {
    el,
    refresh: () => { if (phase === 'setup') render(); },
    dispose: () => clearTimeout(timer),
    canLeave: () => {
      if (phase === 'running' || phase === 'assign') paused = true;
      clearTimeout(timer);
      if (phase === 'running' || phase === 'assign') toast('The tournament is saved — resume it any time from Tournament', 'info', 3500);
      return true;
    },
  };
}
