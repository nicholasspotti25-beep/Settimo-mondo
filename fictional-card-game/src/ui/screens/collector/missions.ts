/** Missions: daily login, three daily missions, weekly missions and today's match rewards. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import type { Screen } from '../../router';
import { topbar, progressBar, fcChip, sectionTitle, notice } from '../../components/common';
import { btn, guard, toast } from '../../overlay';
import { repo } from '../../../store/repo';
import { dayKey } from '../../../core/time';
import {
  DAILY_MISSION_COUNT, LOGIN_REWARDS, MATCH_PARTICIPATION, MATCH_VICTORY, MISSION_DEFS, WEEKLY_DEFS, WEEKLY_KINDS,
  claimMission, claimWeekly, loginAvailable, nextLoginDay, weeklyProgress,
} from '../../../engines/economy';
import { active, claimLoginFor, loginTrack } from './actions';

export function missionCard(o: { title: string; desc: string; progress: number; target: number; reward: number; claimed: boolean; onClaim: () => void }): HTMLElement {
  const done = o.progress >= o.target;
  const claim = btn(o.claimed ? 'Claimed' : done ? `Claim ${o.reward} FC` : `${o.reward} FC`, o.onClaim, o.claimed ? 'small ghost' : done ? 'small gold' : 'small ghost', o.claimed ? 'check' : done ? 'gift' : 'coin');
  claim.disabled = o.claimed || !done;
  return h('div', { class: `mission ${o.claimed ? 'claimed' : done ? 'done' : ''}` },
    h('div', { class: 'ms-ic' }, icon(o.claimed ? 'check' : done ? 'gift' : 'target')),
    h('div', { class: 'grow' },
      h('strong', null, o.title),
      h('small', { class: 'muted' }, o.desc),
      h('div', { class: 'ms-prog' }, progressBar(o.progress, o.target), h('small', null, `${Math.min(o.progress, o.target)} / ${o.target}`))),
    claim);
}

export function missionsScreen(): Screen {
  const el = h('div', { class: 'missions' });
  const body = h('div', { class: 'wrap' });
  const render = (): void => {
    const pid = active();
    const p = repo.player(pid);
    const day = dayKey();
    const loginReady = loginAvailable(p, day);
    const claimDaily = (id: string): void => void guard(() => repo.mutate([pid], (ps) => claimMission(ps[pid], id, Date.now())), 'Could not claim').then((r) => r && toast(`+${r} FC`, 'fc'));
    const claimW = (k: typeof WEEKLY_KINDS[number]): void => void guard(() => repo.mutate([pid], (ps) => claimWeekly(ps[pid], k, Date.now())), 'Could not claim').then((r) => r && toast(`+${r} FC`, 'fc'));
    const claimable = p.daily.missions.filter((m) => !m.claimed && m.progress >= m.target);
    const weeklyClaimable = WEEKLY_KINDS.filter((k) => !p.weekly.claimed[k] && weeklyProgress(p, k) >= WEEKLY_DEFS[k].target);
    const claimAll = async (): Promise<void> => {
      const r = await guard(() => repo.mutate([pid], (ps) => {
        let s = 0;
        for (const m of ps[pid].daily.missions) if (!m.claimed && m.progress >= m.target) s += claimMission(ps[pid], m.id, Date.now());
        for (const k of WEEKLY_KINDS) if (!ps[pid].weekly.claimed[k] && weeklyProgress(ps[pid], k) >= WEEKLY_DEFS[k].target) s += claimWeekly(ps[pid], k, Date.now());
        return s;
      }), 'Could not claim');
      if (r) toast(`+${r} FC`, 'fc');
    };
    el.querySelector('.topbar')?.replaceWith(topbar({ title: 'Missions', player: true, fc: true }));
    replace(body,
      claimable.length + weeklyClaimable.length > 1 ? h('div', { class: 'row end' }, btn('Claim all', () => void claimAll(), 'gold', 'gift')) : null,
      sectionTitle('Daily login', h('small', { class: 'muted' }, `${p.login.claims} days claimed`)),
      h('div', { class: 'panel stack' },
        loginTrack(pid),
        h('div', { class: 'row' },
          h('p', { class: 'grow muted' }, loginReady ? `Day ${nextLoginDay(p)} is ready: ${LOGIN_REWARDS[nextLoginDay(p) - 1]} FC.` : 'Today’s reward has been claimed. Come back tomorrow for the next day of the cycle.'),
          loginReady ? btn(`Claim ${LOGIN_REWARDS[nextLoginDay(p) - 1]} FC`, () => void claimLoginFor(pid), 'gold', 'gift') : null)),
      sectionTitle('Daily missions', h('small', { class: 'muted' }, 'Reset at midnight · 100 FC each')),
      h('div', { class: 'stack' },
        ...p.daily.missions.map((m) => missionCard({ title: MISSION_DEFS[m.kind].title, desc: MISSION_DEFS[m.kind].description, progress: m.progress, target: m.target, reward: m.reward, claimed: m.claimed, onClaim: () => claimDaily(m.id) })),
        p.daily.missions.length < DAILY_MISSION_COUNT ? notice('info', p.daily.missions.length === 0
          ? 'No mission can be completed with the current game content. Missions adapt to what is available: add characters/cards in the Database (or earn FC for packs) and new missions will appear today.'
          : 'More missions appear when more game content (or enough FC for a pack) is available.') : null),
      sectionTitle('Weekly missions', h('small', { class: 'muted' }, 'Reset every Monday · up to 800 FC')),
      h('div', { class: 'stack' }, ...WEEKLY_KINDS.map((k) => missionCard({ title: WEEKLY_DEFS[k].title, desc: WEEKLY_DEFS[k].description, progress: weeklyProgress(p, k), target: WEEKLY_DEFS[k].target, reward: WEEKLY_DEFS[k].reward, claimed: p.weekly.claimed[k], onClaim: () => claimW(k) }))),
      sectionTitle('Match rewards today'),
      h('div', { class: 'panel stack' },
        h('div', { class: 'mr-row' }, icon('swords'), h('span', { class: 'grow' }, `Completed matches: ${MATCH_PARTICIPATION.fc} FC each for the first ${MATCH_PARTICIPATION.perDay}`), h('b', null, `${p.daily.matchPaid} / ${MATCH_PARTICIPATION.perDay}`)),
        progressBar(p.daily.matchPaid, MATCH_PARTICIPATION.perDay),
        h('div', { class: 'mr-row' }, icon('trophy'), h('span', { class: 'grow' }, `Victories: +${MATCH_VICTORY.fc} FC each for the first ${MATCH_VICTORY.perDay}`), h('b', null, `${p.daily.winsPaid} / ${MATCH_VICTORY.perDay}`)),
        progressBar(p.daily.winsPaid, MATCH_VICTORY.perDay),
        h('small', { class: 'dim' }, 'Matches are Classic Draft and Team Draft games. Rewards are paid automatically when a match ends (maximum 130 FC per day). Tournaments pay their own placement rewards.')),
      h('div', { class: 'row center', style: 'margin-top:20px' }, h('small', { class: 'muted' }, 'Balance '), fcChip(p.fc)));
  };
  el.append(topbar({ title: 'Missions', player: true, fc: true }), body);
  render();
  return { el, refresh: render };
}
