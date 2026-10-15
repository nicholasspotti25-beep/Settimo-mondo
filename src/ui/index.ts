/** UI factory: the full game UI (HUD, touch controls, story layer, cards, menus) lives in src/ui/**. */
import type { GameUI } from '../app/interfaces';
import { SettimoUI } from './UI';

export function createUI(): GameUI {
  return new SettimoUI();
}
