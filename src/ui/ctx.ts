/** Shared context handed to every UI part (game access, translation, haptics, restartable CSS animations). */
import type { Game } from '../app/Game';

export interface UiCtx {
  readonly game: Game;
  t(key: string, vars?: Record<string, string | number>): string;
  /** Translation that returns '' when the key does not exist (optional content strings). */
  tOpt(key: string, vars?: Record<string, string | number>): string;
}

export function makeCtx(game: Game): UiCtx {
  return {
    game,
    t: (k, v) => game.loc.t(k, v),
    tOpt: (k, v) => (game.loc.has(k) || game.loc.has(k, 'it') ? game.loc.t(k, v) : ''),
  };
}

/** Restart a one-shot CSS animation class (forces a style flush; only on events, never per frame). */
export function replay(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** Speaker color for subtitles (data/speakers), ivory by default. */
export function speakerColor(game: Game, speaker: string): string {
  return game.content.speaker(speaker)?.color ?? '#f4ece0';
}

export function speakerName(ctx: UiCtx, speaker: string): string {
  const s = ctx.game.content.speaker(speaker);
  return s ? ctx.t(s.name_key) : '';
}
