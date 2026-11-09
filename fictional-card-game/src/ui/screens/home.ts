/** Home: logo, active player, FC, settings/database access, four modes and two owner-chosen portraits. */
import { h, replace } from '../dom';
import { icon, EMBLEM } from '../icons';
import { go, type Screen } from '../router';
import { repo } from '../../store/repo';
import { fitImage } from '../components/media';
import { pickMedia } from '../components/picker';
import { fcChip, playerSwitch } from '../components/common';
import { cardBack } from '../components/card';
import { guard } from '../overlay';
import { claimableCount, loginAvailable } from '../../engines/economy';
import { dayKey } from '../../core/time';
import type { MediaRef, Mode } from '../../model/types';
import { sfx } from '../sound';

export function logo(cls = ''): HTMLElement {
  return h('div', { class: `logo ${cls}` },
    h('i', { class: 'logo-emb', html: EMBLEM }),
    h('div', { class: 'logo-text' }, h('b', { class: 'gold-text' }, 'FICTIONAL'), h('span', null, 'CARD GAME')));
}

const MODE_ART: Record<Exclude<Mode, 'collector'>, string> = {
  classic: `<svg viewBox="0 0 120 80" fill="none"><g stroke="currentColor" stroke-width="2"><rect x="18" y="12" width="34" height="50" rx="5" transform="rotate(-10 35 37)"/><rect x="68" y="12" width="34" height="50" rx="5" transform="rotate(10 85 37)"/></g><text x="60" y="48" text-anchor="middle" font-family="Cinzel,serif" font-weight="900" font-size="20" fill="currentColor">VS</text></svg>`,
  tournament: `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10h18v12h14M8 34h18V22M8 46h18v12h14M8 70h18V58M40 16v12h18v24h14M40 52v12h18V40M72 46h14"/><path d="M90 30h20v8a10 10 0 0 1-20 0zM100 48v8M93 60h14"/></svg>`,
  team: `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2"><circle cx="60" cy="22" r="9"/><path d="M44 50c0-9 7-16 16-16s16 7 16 16"/><circle cx="28" cy="32" r="7"/><path d="M15 56c0-7 6-13 13-13 4 0 7 1.5 9.5 4"/><circle cx="92" cy="32" r="7"/><path d="M105 56c0-7-6-13-13-13-4 0-7 1.5-9.5 4"/><path d="M20 70h80" stroke-dasharray="4 5"/><path d="M60 4l2 4 4.5.6-3.3 3.1.8 4.4L60 14l-4 2.1.8-4.4-3.3-3.1 4.5-.6z" fill="currentColor"/></svg>`,
};

const MODE_INFO: Record<Mode, { title: string; sub: string; screen: string }> = {
  collector: { title: 'Card Collector', sub: 'Open Anime Packs and collect all seven rarities', screen: 'collector' },
  classic: { title: 'Classic Draft', sub: 'Secret stat duel, round by round', screen: 'classic' },
  tournament: { title: 'Tournament', sub: 'Automatic bracket from 2 to 64', screen: 'tournament' },
  team: { title: 'Team Draft', sub: 'Draft five roles, reveal the teams', screen: 'team' },
};

function portrait(side: 'left' | 'right'): HTMLElement {
  const ref = repo.settings.portraits[side];
  const change = async (): Promise<void> => {
    const r = await pickMedia('image', { title: `Home portrait — ${side}`, current: ref, aspect: 3 / 4 });
    if (r === undefined) return;
    await guard(() => repo.updateSettings({ portraits: { ...repo.settings.portraits, [side]: r } }), 'Could not save the portrait');
  };
  if (!ref) {
    return h('aside', { class: `portrait ${side} empty` },
      h('button', { class: 'portrait-add', on: { click: () => void change() } },
        icon('image', 'ic big'), h('strong', null, 'Add a portrait'), h('small', null, 'Pick any image from your device or the media library')));
  }
  const remove = (): void => void guard(() => repo.updateSettings({ portraits: { ...repo.settings.portraits, [side]: null as MediaRef | null } }), 'Could not remove the portrait');
  return h('aside', { class: `portrait ${side}` },
    h('div', { class: 'portrait-frame' }, fitImage(ref, { variant: 'full', zoomable: true, alt: 'Portrait' })),
    h('div', { class: 'portrait-tools' },
      h('button', { class: 'icon-btn', 'aria-label': 'Change portrait', on: { click: () => void change() } }, icon('swap')),
      h('button', { class: 'icon-btn', 'aria-label': 'Remove portrait', on: { click: remove } }, icon('trash'))));
}

function modeTile(mode: Exclude<Mode, 'collector'>): HTMLElement {
  const info = MODE_INFO[mode];
  const rd = repo.readiness(mode);
  return h('button', { class: `mode-tile m-${mode}`, on: { click: () => { sfx.tap(); go(info.screen); } } },
    h('i', { class: 'mt-art', html: MODE_ART[mode] }),
    h('div', { class: 'mt-text' },
      h('h3', null, info.title),
      h('p', null, info.sub),
      h('span', { class: `mt-status ${rd.ok ? 'ok' : 'warn'}` }, icon(rd.ok ? 'check' : 'warn'), rd.message)),
    h('span', { class: 'mt-go' }, icon('back')));
}

function collectorTile(): HTMLElement {
  const p = repo.player(repo.settings.activePlayer);
  const rd = repo.readiness('collector');
  const claim = claimableCount(p, dayKey());
  const owned = Object.values(p.collection).filter((c) => c.qty > 0).length;
  const total = repo.collectibles().length;
  return h('button', { class: 'mode-tile m-collector feature', on: { click: () => { sfx.tap(); go('collector'); } } },
    h('div', { class: 'mc-fan' }, cardBack('f1'), cardBack('f2'), cardBack('f3')),
    h('div', { class: 'mt-text' },
      h('span', { class: 'mc-kicker' }, icon('sparkle'), 'Main collection'),
      h('h3', null, 'Card Collector'),
      h('p', null, MODE_INFO.collector.sub),
      h('div', { class: 'mc-stats' },
        fcChip(p.fc),
        h('span', { class: 'badge blue' }, icon('pack'), `${p.unopenedPacks} unopened`),
        h('span', { class: 'badge gold' }, icon('book'), `${owned}/${total} collected`),
        claim ? h('span', { class: 'badge ok' }, icon('gift'), `${claim} reward${claim > 1 ? 's' : ''} to claim`) : null),
      h('span', { class: `mt-status ${rd.ok ? 'ok' : 'warn'}` }, icon(rd.ok ? 'check' : 'warn'), rd.ok ? 'Packs available' : rd.message)),
    h('span', { class: 'mt-go' }, icon('back')));
}

export function homeScreen(): Screen {
  const el = h('div', { class: 'home' });
  const render = (): void => {
    const p = repo.player(repo.settings.activePlayer);
    const loginReady = loginAvailable(p, dayKey());
    replace(el,
      h('header', { class: 'home-top' },
        logo(),
        h('div', { class: 'home-actions' },
          h('div', { class: 'home-profile' }, playerSwitch(), fcChip(p.fc)),
          h('button', { class: 'icon-btn', 'aria-label': 'Database management', title: 'Database', on: { click: () => go('database') } }, icon('db')),
          h('button', { class: 'icon-btn', 'aria-label': 'Profiles and settings', title: 'Profiles & settings', on: { click: () => go('settings') } }, icon('gear')))),
      repo.loadWarnings.length ? h('div', { class: 'notice warn', style: 'margin-bottom:12px' }, icon('warn'), h('div', null, ...repo.loadWarnings.map((w) => h('div', null, w)))) : null,
      h('div', { class: 'home-main' },
        portrait('left'),
        h('section', { class: 'modes' },
          collectorTile(),
          h('div', { class: 'mode-grid' }, modeTile('classic'), modeTile('tournament'), modeTile('team'))),
        portrait('right')),
      loginReady ? h('button', { class: 'home-login', on: { click: () => go('missions') } },
        icon('gift'), h('span', null, `${p.name}: your daily login reward is ready`), h('b', null, 'Claim')) : null);
  };
  render();
  return { el, refresh: render };
}
