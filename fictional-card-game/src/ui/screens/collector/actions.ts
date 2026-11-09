/** Card Collector actions shared by several screens. */
import { h } from '../../dom';
import { icon, EMBLEM } from '../../icons';
import { go } from '../../router';
import { attempt, btn, guard, modal, toast } from '../../overlay';
import { repo } from '../../../store/repo';
import { cryptoRng } from '../../../core/rng';
import { dayKey } from '../../../core/time';
import { applyPack, buyPacks, claimLogin, loginAvailable, nextLoginDay, LOGIN_REWARDS } from '../../../engines/economy';
import { PACK_PRICE, rollPack } from '../../../engines/pack';
import type { PlayerId } from '../../../model/types';

export const active = (): PlayerId => repo.settings.activePlayer;

export function animePack(cls = ''): HTMLElement {
  return h('div', { class: `apack ${cls}` },
    h('div', { class: 'ap-body' },
      h('i', { class: 'ap-crimp top' }), h('i', { class: 'ap-crimp bot' }),
      h('i', { class: 'ap-logo', html: EMBLEM }),
      h('div', { class: 'ap-title' }, h('b', { class: 'gold-text' }, 'ANIME PACK'), h('span', null, 'FICTIONAL CARD GAME')),
      h('div', { class: 'ap-count' }, '5 CARDS')));
}

export async function purchase(count: number): Promise<boolean> {
  const p = repo.player(active());
  const cost = PACK_PRICE * count;
  if (p.fc < cost) {
    toast(`Not enough FC: ${count > 1 ? `${count} packs cost` : 'a pack costs'} ${cost} FC and ${p.name} has ${p.fc} FC`, 'err', 4500);
    return false;
  }
  if (!(await attempt(() => repo.mutate([active()], (ps) => buyPacks(ps[active()], count, Date.now())), 'Purchase failed'))) return false;
  toast(`${p.name} bought ${count} Anime Pack${count > 1 ? 's' : ''} (−${cost} FC)`, 'ok');
  return true;
}

/** Opens one unopened pack: all 5 cards are written to the collection before any animation plays. */
export async function openOne(): Promise<void> {
  const pid = active();
  const p = repo.player(pid);
  if (p.pendingReveal) { go('open', { player: pid, packId: p.pendingReveal }); return; }
  const rd = repo.readiness('collector');
  if (!rd.ok) { toast(`Packs cannot be opened yet: ${rd.message}`, 'err', 5000); return; }
  if (p.unopenedPacks < 1) { toast('No unopened packs — buy one in the Shop', 'err'); go('shop'); return; }
  const valid = repo.valid('collector');
  const rec = await guard(() => repo.mutate([pid], (ps) => {
    const roll = rollPack(cryptoRng, valid, ps[pid].pity);
    return applyPack(ps[pid], roll, Date.now());
  }), 'The pack could not be opened');
  if (rec) go('open', { player: pid, packId: rec.id });
}


export function loginTrack(pid: PlayerId): HTMLElement {
  const p = repo.player(pid);
  const ready = loginAvailable(p, dayKey());
  const next = nextLoginDay(p);
  const claimedThisCycle = ready ? next - 1 : p.login.cycleDay;
  return h('div', { class: 'login-track' }, ...LOGIN_REWARDS.map((fc, i) => {
    const day = i + 1;
    const state = day <= claimedThisCycle ? 'claimed' : ready && day === next ? 'ready' : 'future';
    return h('div', { class: `lt-day ${state} ${day === 7 ? 'big' : ''}` },
      h('small', null, `Day ${day}`),
      state === 'claimed' ? icon('check') : h('i', { class: 'fc-coin' }, 'FC'),
      h('b', null, `${fc}`));
  }));
}

export async function claimLoginFor(pid: PlayerId): Promise<void> {
  const r = await guard(() => repo.mutate([pid], (ps) => claimLogin(ps[pid], dayKey(), Date.now())), 'Could not claim');
  if (r) toast(`${repo.player(pid).name}: +${r} FC daily login reward`, 'fc');
}

export function loginModal(pid: PlayerId): void {
  const p = repo.player(pid);
  const m = modal({
    title: 'Daily login reward',
    content: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `${p.name}, welcome back! Day ${nextLoginDay(p)} of the 7-day cycle is ready.`),
      loginTrack(pid)),
    actions: [btn('Later', () => m.close(), 'ghost'), btn(`Claim ${LOGIN_REWARDS[nextLoginDay(p) - 1]} FC`, async () => { await claimLoginFor(pid); m.close(); }, 'gold', 'gift')],
  });
}
