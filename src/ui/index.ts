/** UI factory. The full UI (HUD, touch controls, menus, layout editor, debug menu) lives in src/ui/**. */
import type { GameUI } from '../app/interfaces';
import { MinimalUI } from './MinimalUI';

export function createUI(): GameUI {
  return new MinimalUI();
}
