// Squad building helpers: automatic line-ups by role familiarity (no rating involved) and persistence shape.
import { PLAYERS, PlayerData, familiarity } from './db';
import { Tactics, defaultTactics, formation } from './tactics';

export interface Squad { xi: string[]; bench: string[]; tac: Tactics; kit: number }
/** Fill a formation from a pool: each slot takes a random player among those most familiar with the role. */
export function autoPick(form: string, pool: PlayerData[], rnd: () => number, nBench = 7): { xi: PlayerData[]; bench: PlayerData[] } {
  const left = pool.slice(), xi: PlayerData[] = [];
  for (const s of formation(form).slots) {
    let best = -1; const c: PlayerData[] = [];
    for (const p of left) { const f = familiarity(p, s.r); if (f > best + 1e-6) { best = f; c.length = 0; c.push(p); } else if (Math.abs(f - best) < 1e-6) c.push(p); }
    const p = c[Math.floor(rnd() * c.length)]; xi.push(p); left.splice(left.indexOf(p), 1);
  }
  const bench: PlayerData[] = [], take = (f: (p: PlayerData) => boolean) => { const c = left.filter(f); if (!c.length) return; const p = c[Math.floor(rnd() * c.length)]; bench.push(p); left.splice(left.indexOf(p), 1); };
  take(p => p.gk);
  for (const g of [['DC'], ['TD', 'TS'], ['CDC', 'CC'], ['CC', 'COC'], ['AD', 'AS'], ['ATT']]) if (bench.length < nBench) take(p => g.includes(p.pos));
  while (bench.length < nBench && left.some(p => !p.gk)) take(p => !p.gk);
  return { xi, bench };
}
export function defaultSquad(): Squad {
  const ids = ['neuer', 'maldini', 'nesta', 'beckenbauer', 'cafu', 'rodri', 'xavi', 'modric', 'cruyff', 'ronaldo', 'messi'];
  const bench = ['buffon', 'baresi', 'zambrotta', 'makelele', 'zidane', 'ronaldinho', 'haaland'];
  return { xi: ids, bench, tac: defaultTactics('4-3-3'), kit: 0 };
}
export const resolve = (ids: string[]) => ids.map(id => PLAYERS.find(p => p.id === id)).filter(Boolean) as PlayerData[];
