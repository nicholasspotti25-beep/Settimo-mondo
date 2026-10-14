/** Bare-bones UI used during engine bring-up: title buttons, bars, subtitles, fades. Replaced by the full UI. */
import type { Game } from '../app/Game';
import type { GameMode, GameUI } from '../app/interfaces';
import type { Settings } from '../app/settings';
import type { SimEvent } from '../sim/types';
import { defaultCharacter } from '../sim/gamestate';

export class MinimalUI implements GameUI {
  private game!: Game;
  private root!: HTMLElement;
  private title!: HTMLElement;
  private hud!: HTMLElement;
  private sub!: HTMLElement;
  private fadeEl!: HTMLElement;

  mount(root: HTMLElement, game: Game): void {
    this.game = game;
    this.root = root;
    const el = (tag: string, css: string, parent: HTMLElement = root) => {
      const e = document.createElement(tag);
      e.style.cssText = css;
      parent.appendChild(e);
      return e;
    };
    this.title = el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#f4ece0;font:24px serif;');
    const t = el('div', 'font-size:48px;letter-spacing:6px', this.title);
    t.textContent = game.loc.t('ui.title');
    const b = el('button', 'font:20px serif;padding:10px 24px', this.title);
    b.textContent = 'Nuova partita';
    b.onclick = () => void game.newGame(0, defaultCharacter());
    const c = el('button', 'font:20px serif;padding:10px 24px', this.title);
    c.textContent = 'Continua';
    c.onclick = () => void game.continueGame(0);
    this.hud = el('div', 'position:absolute;left:16px;top:12px;color:#fff;font:14px monospace;pointer-events:none;white-space:pre');
    this.sub = el('div', 'position:absolute;left:10%;right:10%;bottom:8%;text-align:center;color:#fff;font:20px serif;text-shadow:0 0 6px #000;pointer-events:none');
    this.fadeEl = el('div', 'position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 0.2s');
  }

  update(): void {
    const g = this.game;
    if (g.mode !== 'game') return;
    const s = g.sim;
    const p = s.player;
    const b = s.boss;
    this.hud.textContent = `HP ${p.hp.toFixed(0)}  Fiato ${p.fiato.toFixed(0)}  Eco ${p.eco.toFixed(0)}  Lacrime ${p.lacrime}  Meta ${s.meta.meter.toFixed(0)}\n${p.state}  ${s.zone?.def.id ?? ''}` +
      (b ? `\n${g.loc.t(b.boss.name_key)} ${b.hp.toFixed(0)}/${b.hpMax.toFixed(0)}  Eq ${b.poise.toFixed(0)}/${b.poiseMax}  ${b.state} ${b.attack?.def.id ?? ''}` : '');
    const line = s.seq.view.line;
    this.sub.textContent = line ? g.loc.t(line.key) : '';
  }

  onEvent(_e: SimEvent): void {}

  onMode(m: GameMode): void {
    if (this.title) this.title.style.display = m === 'title' ? 'flex' : 'none';
  }

  fade(kind: 'out' | 'in' | 'white_out' | 'white_in', dur: number): Promise<void> {
    this.fadeEl.style.transition = `opacity ${dur}s`;
    this.fadeEl.style.background = kind.startsWith('white') ? '#fff' : '#000';
    this.fadeEl.style.opacity = kind.endsWith('out') ? '1' : '0';
    return new Promise((r) => setTimeout(r, dur * 1000));
  }

  paused(): boolean {
    return false;
  }

  applySettings(_s: Settings): void {}

  setLoading(_on: boolean): void {}
}
