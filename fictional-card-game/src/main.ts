import '../styles/base.css';
import '../styles/cards.css';
import '../styles/screens.css';
import '../styles/modes.css';
import '../styles/collector.css';
import { repo } from './store/repo';
import { h } from './ui/dom';
import { icon } from './ui/icons';
import { initOverlay } from './ui/overlay';
import { go, initRouter, register } from './ui/router';
import { unlockMedia } from './ui/components/cutscene';
import { initSavePill } from './ui/components/savepill';
import { homeScreen } from './ui/screens/home';
import { settingsScreen } from './ui/screens/settings';
import { databaseScreen } from './ui/screens/database/manager';
import { classicScreen } from './ui/screens/classic';
import { tournamentScreen } from './ui/screens/tournament';
import { teamScreen } from './ui/screens/team';
import { collectorHub } from './ui/screens/collector/hub';
import { packScreen } from './ui/screens/collector/pack';
import { shopScreen } from './ui/screens/collector/shop';
import { openScreen } from './ui/screens/collector/opening';
import { collectionScreen } from './ui/screens/collector/collection';
import { cardScreen } from './ui/screens/collector/card';
import { missionsScreen } from './ui/screens/collector/missions';
import { achievementsScreen } from './ui/screens/collector/achievements';

function fatal(root: HTMLElement, message: string): void {
  root.replaceChildren(h('div', { class: 'fatal' },
    icon('warn', 'ic big'),
    h('h1', null, 'The game data could not be opened'),
    h('p', null, message),
    h('p', { class: 'muted' }, 'Nothing has been deleted. Your saved data is left exactly as it was.'),
    h('button', { class: 'btn primary', on: { click: () => location.reload() } }, h('span', null, 'Try again'))));
}

async function main(): Promise<void> {
  const screens = document.getElementById('screens')!;
  initOverlay(document.getElementById('overlays')!);
  const bootMsg = document.getElementById('boot-msg');
  try {
    await repo.init((m) => { if (bootMsg) bootMsg.textContent = m; });
  } catch (e) {
    console.error(e);
    fatal(screens, (e as Error)?.message ?? String(e));
    return;
  }
  const applyPrefs = (): void => {
    document.documentElement.classList.toggle('reduce-motion', repo.settings.reduceMotion);
  };
  applyPrefs();
  repo.subscribe(applyPrefs);
  screens.replaceChildren();
  initSavePill();
  initRouter(screens);
  register('home', homeScreen);
  register('settings', settingsScreen);
  register('database', databaseScreen);
  register('classic', classicScreen);
  register('tournament', tournamentScreen);
  register('team', teamScreen);
  register('collector', collectorHub);
  register('pack', packScreen);
  register('shop', shopScreen);
  register('open', openScreen);
  register('collection', collectionScreen);
  register('card', cardScreen);
  register('missions', missionsScreen);
  register('achievements', achievementsScreen);
  await repo.refreshPeriodic().catch((e) => console.error(e));
  go('home');
  if (import.meta.env.DEV) (window as any).__fcg = { repo, go, importMedia: (await import('./store/media')).importMedia };

  const firstGesture = (): void => {
    unlockMedia();
    try { navigator.storage?.persist?.().catch(() => undefined); } catch { /* not supported */ }
  };
  document.addEventListener('click', firstGesture, { once: true, capture: true });
  document.addEventListener('touchend', firstGesture, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void repo.refreshPeriodic().catch(() => undefined);
  });
  setInterval(() => void repo.refreshPeriodic().catch(() => undefined), 60_000);
}

void main();
