/** Contracts between the Game orchestrator and the UI / audio layers. */
import type { Sim } from '../sim/sim';
import type { SimEvent } from '../sim/types';
import type { Settings } from './settings';
import type { Game } from './Game';

export type GameMode = 'boot' | 'title' | 'creator' | 'game' | 'ending' | 'credits';

export interface GameUI {
  mount(root: HTMLElement, game: Game): void;
  /** Called every rendered frame. */
  update(dt: number): void;
  onEvent(e: SimEvent): void;
  /** Mode changed (title, game, ending...). */
  onMode(mode: GameMode): void;
  /** Full-screen fade overlay; resolves when finished. */
  fade(kind: 'out' | 'in' | 'white_out' | 'white_in', dur: number): Promise<void>;
  /** True while a pause-type menu is open (the sim does not advance). */
  paused(): boolean;
  /** Settings changed (layout, subtitles, language...). */
  applySettings(s: Settings): void;
  /** Loading indicator for zone streaming. */
  setLoading(on: boolean): void;
}

export interface AudioDirector {
  /** Must be called from a user gesture (first touch) to start the AudioContext. */
  unlock(): void;
  suspend(): void;
  resume(): void;
  setVolumes(v: Settings['volume']): void;
  onEvent(e: SimEvent, sim: Sim): void;
  update(dt: number, sim: Sim | null, mode: GameMode): void;
  /** UI sounds (menu move/confirm/back, etc.). */
  playUi(id: string): void;
}
