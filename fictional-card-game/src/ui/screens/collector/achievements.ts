/** Achievements: one-time rewards with visible progress and locked / completed / claimed states. */
import { h, replace } from '../../dom';
import { icon } from '../../icons';
import type { Screen } from '../../router';
import { topbar, progressBar } from '../../components/common';
import { btn, guard, toast } from '../../overlay';
import { repo } from '../../../store/repo';
import { formatDate } from '../../../core/time';
import { ACHIEVEMENT_DEFS, ACHIEVEMENT_IDS, achievementProgress, achievementState, claimAchievement } from '../../../engines/economy';
import { active } from './actions';

export function achievementsScreen(): Screen {
  const el = h('div', { class: 'achievements' });
  const body = h('div', { class: 'wrap' });
  const render = (): void => {
    const pid = active();
    const p = repo.player(pid);
    const claimedN = ACHIEVEMENT_IDS.filter((a) => achievementState(p, a) === 'claimed').length;
    el.querySelector('.topbar')?.replaceWith(topbar({ title: 'Achievements', sub: `${claimedN} of ${ACHIEVEMENT_IDS.length} claimed`, player: true, fc: true }));
    replace(body, h('div', { class: 'ach-grid' }, ...ACHIEVEMENT_IDS.map((id) => {
      const d = ACHIEVEMENT_DEFS[id];
      const st = achievementState(p, id);
      const prog = achievementProgress(p, id);
      const b = btn(st === 'claimed' ? 'Claimed' : st === 'completed' ? `Claim ${d.reward} FC` : `${d.reward.toLocaleString()} FC`, async () => {
        const r = await guard(() => repo.mutate([pid], (ps) => claimAchievement(ps[pid], id, Date.now())), 'Could not claim');
        if (r) toast(`Achievement reward: +${r.toLocaleString()} FC`, 'fc');
      }, st === 'completed' ? 'gold' : 'ghost', st === 'claimed' ? 'check' : st === 'completed' ? 'gift' : 'lock');
      b.disabled = st !== 'completed';
      return h('div', { class: `ach ${st}` },
        h('div', { class: 'ach-medal' }, icon(st === 'locked' ? 'lock' : 'medal')),
        h('div', { class: 'grow' },
          h('strong', null, d.title),
          h('small', { class: 'muted' }, d.description),
          h('div', { class: 'ms-prog' }, progressBar(prog, d.target), h('small', null, `${prog} / ${d.target}`)),
          h('small', { class: 'ach-state' }, st === 'locked' ? 'Locked' : st === 'completed' ? 'Completed — reward ready' : `Claimed on ${formatDate(p.achievements[id]!)}`)),
        b);
    })));
  };
  el.append(topbar({ title: 'Achievements', player: true, fc: true }), body);
  render();
  return { el, refresh: render };
}
