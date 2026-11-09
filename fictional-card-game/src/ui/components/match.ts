/** Pieces shared by the competitive modes: hand-off screens, scoreboards, reward summaries. */
import { h } from '../dom';
import { icon } from '../icons';
import { repo } from '../../store/repo';
import type { MatchRewardResult } from '../../engines/economy';
import type { PlayerId } from '../../model/types';
import { fitImage } from './media';
import type { MediaRef } from '../../model/types';
import { playCutscene } from './cutscene';

export function handoff(p: PlayerId, title: string, text: string, action: string, onGo: () => void): HTMLElement {
  const other = repo.player(p === 'p1' ? 'p2' : 'p1');
  return h('div', { class: `handoff ${p}` },
    h('div', { class: 'ho-badge' }, p.toUpperCase()),
    h('h2', null, repo.player(p).name),
    h('p', { class: 'ho-title' }, title),
    h('p', { class: 'muted' }, text.replace('{other}', other.name)),
    h('button', { class: `btn big ${p === 'p1' ? 'primary' : 'pink'}`, on: { click: onGo } }, icon('eye'), h('span', null, action)));
}

export function scoreboard(score: Record<PlayerId, number>, label: string): HTMLElement {
  return h('div', { class: 'scoreboard' },
    h('div', { class: 'sb-side p1' }, h('span', { class: 'ptag p1' }, 'P1'), h('span', { class: 'sb-name' }, repo.player('p1').name), h('b', null, String(score.p1))),
    h('div', { class: 'sb-mid' }, label),
    h('div', { class: 'sb-side p2' }, h('b', null, String(score.p2)), h('span', { class: 'sb-name' }, repo.player('p2').name), h('span', { class: 'ptag p2' }, 'P2')));
}

export function rewardLines(r: Record<PlayerId, MatchRewardResult>): HTMLElement {
  const line = (p: PlayerId): HTMLElement => {
    const x = r[p];
    const total = x.participation + x.victory;
    return h('div', { class: `rw-line ${p}` }, h('span', { class: `ptag ${p}` }, p.toUpperCase()), h('span', { class: 'grow' }, repo.player(p).name),
      total ? h('span', { class: 'rw-fc' }, `+${total} FC`) : h('small', { class: 'muted' }, 'Daily match rewards already collected'),
      x.participation ? h('small', { class: 'muted' }, `match ${x.participation}${x.victory ? ` + victory ${x.victory}` : ''}`) : null);
  };
  return h('div', { class: 'rewards' }, h('h3', null, icon('coin'), ' Match rewards'), line('p1'), line('p2'));
}

export function fighter(o: { image: MediaRef | null; name: string; p: PlayerId; cutscene?: MediaRef | null; cls?: string; extra?: Node | null }): HTMLElement {
  return h('div', { class: `fighter ${o.p} ${o.cls ?? ''}` },
    h('div', { class: 'f-frame' }, fitImage(o.image, { variant: 'full', alt: o.name, zoomable: true })),
    h('div', { class: 'f-meta' },
      h('span', { class: `ptag ${o.p}` }, `${o.p.toUpperCase()} · ${repo.player(o.p).name}`),
      h('h3', null, o.name),
      o.extra ?? null,
      o.cutscene ? h('button', { class: 'btn small ghost', on: { click: () => void playCutscene(o.cutscene!, { title: o.name }) } }, icon('play'), h('span', null, 'Cutscene')) : null));
}
