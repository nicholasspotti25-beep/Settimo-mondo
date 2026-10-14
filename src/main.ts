/** Entry point: load content + strings, build the game, mount UI and audio, register the service worker. */
import contentJson from './generated/content.json';
import it from '../locales/it.json';
import en from '../locales/en.json';
import { setContent } from './core/content';
import { Loc, setLoc } from './core/loc';
import type { ContentBundle } from './core/types';
import { BEHAVIORS } from './generated/registry.sim';
import { Game } from './app/Game';
import { createUI } from './ui/index';
import { createAudio } from './audio/index';
import { Platform } from './app/platform';

const content = setContent(contentJson as unknown as ContentBundle);
const loc = setLoc(new Loc(it as Record<string, string>, en as Record<string, string>));
const root = document.getElementById('app')!;
const game = new Game(root, content, loc, BEHAVIORS);
const ui = createUI();
const audio = createAudio();
game.attach(ui, audio);
ui.mount(root, game);
(window as any).__game = game;

// unlock audio + fullscreen on first touch
const unlock = () => {
  audio.unlock();
  void new Platform().nativeSetup();
  window.removeEventListener('pointerdown', unlock);
};
window.addEventListener('pointerdown', unlock);

game.start();
document.getElementById('boot')?.remove();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !import.meta.env.DEV) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
