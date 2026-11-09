/** Classic Draft: random distinct characters each round, secret stat choices, simultaneous reveal. */
import { h, replace } from '../dom';
import { icon } from '../icons';
import { home, type Screen } from '../router';
import { topbar, notice, dbLink, emptyState } from '../components/common';
import { btn, confirmDialog, guard, toast } from '../overlay';
import { repo } from '../../store/repo';
import { cryptoRng } from '../../core/rng';
import { drawPair, matchWinner, resolveRound, type RoundResult } from '../../engines/classic';
import { applyMatch, type MatchRewardResult } from '../../engines/economy';
import { CLASSIC_STATS, CLASSIC_STAT_LABEL, type ClassicEntry, type ClassicStat, type PlayerId } from '../../model/types';
import { fitImage } from '../components/media';
import { fighter, handoff, rewardLines, scoreboard } from '../components/match';
import { playCutscene } from '../components/cutscene';
import { STAT_ICON } from './database/editors';
import { fmtNum } from '../../core/util';
import { sfx } from '../sound';
import { burstAt } from '../components/fx';

type Phase = 'setup' | 'handoff' | 'pick' | 'reveal' | 'final';

interface RoundState {
  chars: Record<PlayerId, ClassicEntry>;
  picks: Partial<Record<PlayerId, ClassicStat>>;
  order: PlayerId[];
  result?: RoundResult;
}

export function classicScreen(): Screen {
  const el = h('div', { class: 'classic mode-screen' });
  const body = h('div', { class: 'wrap' });
  let phase: Phase = 'setup';
  let rounds = repo.settings.classicRounds;
  let roundNo = 0;
  let score: Record<PlayerId, number> = { p1: 0, p2: 0 };
  let history: { round: RoundState; result: RoundResult }[] = [];
  let cur: RoundState | null = null;
  let turn = 0;
  let selected: ClassicStat | null = null;
  let rewards: Record<PlayerId, MatchRewardResult> | null = null;

  const pool = (): ClassicEntry[] => repo.valid('classic');

  const startMatch = (): void => {
    if (pool().length < 2) return;
    rounds = repo.settings.classicRounds;
    roundNo = 0;
    score = { p1: 0, p2: 0 };
    history = [];
    rewards = null;
    nextRound();
  };

  const nextRound = (): void => {
    roundNo++;
    const [a, b] = drawPair(cryptoRng, pool());
    const first: PlayerId = roundNo % 2 === 1 ? 'p1' : 'p2';
    cur = { chars: { p1: a, p2: b }, picks: {}, order: [first, first === 'p1' ? 'p2' : 'p1'] };
    turn = 0;
    selected = null;
    phase = 'handoff';
    render();
  };

  const confirmPick = (): void => {
    if (!cur || !selected) return;
    const p = cur.order[turn]!;
    cur.picks[p] = selected;
    selected = null;
    sfx.flip();
    if (turn === 0) {
      turn = 1;
      phase = 'handoff';
    } else {
      cur.result = resolveRound(cur.chars.p1, cur.picks.p1!, cur.chars.p2, cur.picks.p2!);
      if (cur.result.winner !== 'tie') score[cur.result.winner]++;
      history.push({ round: cur, result: cur.result });
      phase = 'reveal';
    }
    render();
  };

  const finishMatch = async (): Promise<void> => {
    const w = matchWinner(score);
    const outcome = (p: PlayerId) => (w === 'tie' ? 'draw' : w === p ? 'win' : 'loss') as 'win' | 'loss' | 'draw';
    const r = await guard(() => repo.mutate(['p1', 'p2'], (ps) => ({
      p1: applyMatch(ps.p1, 'classic', outcome('p1'), `${score.p1}–${score.p2}`, ps.p2.name, Date.now()),
      p2: applyMatch(ps.p2, 'classic', outcome('p2'), `${score.p2}–${score.p1}`, ps.p1.name, Date.now()),
    })), 'Could not save the match result');
    rewards = r ?? { p1: { participation: 0, victory: 0 }, p2: { participation: 0, victory: 0 } };
    if (r) {
      const total = r.p1.participation + r.p1.victory + r.p2.participation + r.p2.victory;
      if (total) toast(`Match saved · ${repo.player('p1').name} +${r.p1.participation + r.p1.victory} FC · ${repo.player('p2').name} +${r.p2.participation + r.p2.victory} FC`, 'fc', 4000);
    }
    phase = 'final';
    render();
    if (w !== 'tie') sfx.win(); else sfx.tie();
  };

  // ---------------------------------------------------------------- views
  const setupView = (): HTMLElement => {
    const n = pool().length;
    if (n < 2) {
      return h('div', { class: 'panel' }, emptyState('swords', 'Classic Draft needs at least 2 characters',
        `The Classic Draft database has ${n} valid character${n === 1 ? '' : 's'}. Add characters with an image and all four statistics.`, dbLink('Open the Classic Draft database')));
    }
    const roundsSeg = h('div', { class: 'seg' }, ...[1, 3, 5, 7, 10].map((k) => h('button', { class: repo.settings.classicRounds === k ? 'on' : '', on: { click: () => void repo.updateSettings({ classicRounds: k }) } }, `${k} round${k > 1 ? 's' : ''}`)));
    return h('div', { class: 'setup stack' },
      h('div', { class: 'panel hero-panel' },
        h('div', { class: 'hp-icon' }, icon('swords', 'ic big')),
        h('h2', { class: 'display' }, 'Classic Draft'),
        h('p', { class: 'muted' }, 'Each round both players receive a different random character. Each player secretly picks Offense, Defense, Hax or IQ — choices stay hidden until both have confirmed. The higher chosen value wins the round. Ties award no point.'),
        h('div', { class: 'setup-row' }, h('label', { class: 'lbl' }, 'Rounds'), roundsSeg),
        h('p', { class: 'hint' }, repo.settings.classicShowOwnStats
          ? 'Each player sees their own character’s statistics while choosing (change in Settings).'
          : 'Blind mode: players choose without seeing any statistics (change in Settings).'),
        h('p', { class: 'hint' }, `${n} characters in the pool · every character has the same chance each round.`),
        btn('Start match', startMatch, 'primary big', 'play')));
  };

  const handoffView = (): HTMLElement => {
    const p = cur!.order[turn]!;
    return h('div', { class: 'stack center' },
      scoreboard(score, `Round ${roundNo} / ${rounds}`),
      handoff(p, turn === 0 ? 'Your turn to choose' : 'Your turn — the other choice is locked and hidden',
        'Make sure {other} is not looking at the screen.', 'Reveal my character', () => { phase = 'pick'; render(); }));
  };

  const pickView = (): HTMLElement => {
    const p = cur!.order[turn]!;
    const c = cur!.chars[p];
    const show = repo.settings.classicShowOwnStats;
    const confirmBtn = btn(selected ? `Confirm ${CLASSIC_STAT_LABEL[selected]}` : 'Choose a statistic', confirmPick, 'primary big wide', 'lock');
    confirmBtn.disabled = !selected;
    return h('div', { class: 'stack' },
      scoreboard(score, `Round ${roundNo} / ${rounds}`),
      h('div', { class: `pick-layout ${p}` },
        h('div', { class: 'pick-char' },
          h('div', { class: 'f-frame big' }, fitImage(c.image, { variant: 'full', alt: c.name, zoomable: true })),
          h('div', { class: 'pick-name' }, h('span', { class: `ptag ${p}` }, `${p.toUpperCase()} · ${repo.player(p).name}`), h('h2', { class: 'display' }, c.name))),
        h('div', { class: 'pick-side' },
          h('h3', null, 'Choose your statistic'),
          h('p', { class: 'muted' }, 'Your choice is locked once confirmed and stays hidden until both players have chosen.'),
          h('div', { class: 'stat-pick' }, ...CLASSIC_STATS.map((s) => h('button', {
            class: `stat-btn ${selected === s ? 'on' : ''}`,
            on: { click: () => { selected = s; sfx.tap(); render(); } },
          }, icon(STAT_ICON[s]!), h('span', null, CLASSIC_STAT_LABEL[s]), show ? h('b', null, fmtNum(c[s] ?? 0)) : h('b', { class: 'dim' }, '?')))),
          confirmBtn)));
  };

  const revealView = (): HTMLElement => {
    const r = cur!.result!;
    const w = r.winner;
    const side = (p: PlayerId): HTMLElement => {
      const c = cur!.chars[p];
      const pick = r[p];
      return fighter({
        image: c.image, name: c.name, p, cutscene: c.cutscene,
        cls: w === 'tie' ? 'tie' : w === p ? 'winner' : 'loser',
        extra: h('div', { class: 'reveal-stat' }, icon(STAT_ICON[pick.stat]!), h('span', null, CLASSIC_STAT_LABEL[pick.stat]), h('b', { class: 'count', dataset: { to: String(pick.value) } }, '0')),
      });
    };
    const last = roundNo >= rounds;
    const banner = w === 'tie'
      ? h('div', { class: 'round-banner tie' }, h('b', null, 'Tie'), h('span', null, `${fmtNum(r.p1.value)} = ${fmtNum(r.p2.value)} · no point awarded`))
      : h('div', { class: `round-banner ${w}` }, h('b', null, `${repo.player(w).name} wins the round`), h('span', null, `${fmtNum(r[w].value)} vs ${fmtNum(r[w === 'p1' ? 'p2' : 'p1'].value)} · +1 point`));
    const view = h('div', { class: 'stack' },
      scoreboard(score, `Round ${roundNo} / ${rounds}`),
      h('div', { class: 'vs-stage' }, side('p1'), h('div', { class: 'vs-badge' }, 'VS'), side('p2')),
      banner,
      h('div', { class: 'row center' }, btn(last ? 'See final result' : 'Next round', () => { last ? void finishMatch() : nextRound(); }, 'primary big', last ? 'trophy' : 'play')));
    // animate counts and winner
    requestAnimationFrame(() => {
      view.querySelectorAll<HTMLElement>('.count').forEach((n) => {
        const to = Number(n.dataset.to);
        const start = performance.now();
        const step = (t: number): void => {
          const k = Math.min(1, (t - start) / 900);
          n.textContent = fmtNum(to * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      setTimeout(() => {
        view.classList.add('decided');
        if (w !== 'tie') {
          sfx.win();
          const wEl = view.querySelector('.fighter.winner .f-frame');
          if (wEl) burstAt(wEl, { colors: w === 'p1' ? ['#4fa8ff', '#bfe0ff', '#fff'] : ['#ff6fae', '#ffd0e6', '#fff'], count: 50, speed: 7, kind: 'star', size: 5 });
          const cs = cur!.chars[w].cutscene;
          if (repo.settings.autoplayCutscenes && cs) setTimeout(() => void playCutscene(cs, { title: cur!.chars[w].name, subtitle: 'Round winner' }), 900);
        } else sfx.tie();
      }, 950);
    });
    return view;
  };

  const finalView = (): HTMLElement => {
    const w = matchWinner(score);
    return h('div', { class: 'stack' },
      h('div', { class: `final-banner ${w}` },
        icon(w === 'tie' ? 'swap' : 'trophy', 'ic big'),
        h('h2', { class: 'display' }, w === 'tie' ? 'Draw' : `${repo.player(w).name} wins!`),
        h('p', { class: 'final-score' }, h('span', { class: 'p1c' }, String(score.p1)), ' – ', h('span', { class: 'p2c' }, String(score.p2)))),
      rewards ? rewardLines(rewards) : null,
      h('div', { class: 'panel' },
        h('h3', { class: 'panel-h' }, 'Match summary'),
        h('div', { class: 'summary' }, ...history.map((x, i) => h('div', { class: `sum-row ${x.result.winner}` },
          h('span', { class: 'sum-n' }, `R${i + 1}`),
          h('div', { class: 'sum-p p1' }, h('strong', null, x.round.chars.p1.name), h('small', null, `${CLASSIC_STAT_LABEL[x.result.p1.stat]} ${fmtNum(x.result.p1.value)}`)),
          h('span', { class: 'sum-res' }, x.result.winner === 'tie' ? 'TIE' : x.result.winner.toUpperCase()),
          h('div', { class: 'sum-p p2' }, h('strong', null, x.round.chars.p2.name), h('small', null, `${CLASSIC_STAT_LABEL[x.result.p2.stat]} ${fmtNum(x.result.p2.value)}`)))))),
      h('div', { class: 'row center' },
        btn('Play again', startMatch, 'primary big', 'refresh'),
        btn('Main menu', () => void home(), 'ghost big', 'back')));
  };

  const render = (): void => {
    const views: Record<Phase, () => HTMLElement> = { setup: setupView, handoff: handoffView, pick: pickView, reveal: revealView, final: finalView };
    replace(body, views[phase]());
    el.scrollTop = 0;
  };

  el.append(topbar({ title: 'Classic Draft', sub: 'Two players · one device' }), body);
  render();
  return {
    el,
    refresh: () => { if (phase === 'setup') render(); },
    canLeave: async () => (phase === 'setup' || phase === 'final') ||
      confirmDialog({ title: 'Leave the match?', message: 'The match in progress will be abandoned and will not count.', confirm: 'Leave', danger: true }),
  };
}

export { notice };
