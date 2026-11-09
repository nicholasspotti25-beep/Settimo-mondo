/** Classic Draft: each round both players get a different random character and secretly pick a statistic. */
import type { Rng } from '../core/rng';
import type { ClassicEntry, ClassicStat, PlayerId } from '../model/types';

/** Two distinct characters; every character has the same probability (2/n) of being drawn in a round. */
export function drawPair<T>(rng: Rng, pool: readonly T[]): [T, T] {
  if (pool.length < 2) throw new Error('Classic Draft needs at least 2 characters');
  const i = rng.int(pool.length);
  let j = rng.int(pool.length - 1);
  if (j >= i) j++;
  return [pool[i]!, pool[j]!];
}

export type RoundWinner = PlayerId | 'tie';

export interface RoundResult {
  p1: { entryId: string; stat: ClassicStat; value: number };
  p2: { entryId: string; stat: ClassicStat; value: number };
  winner: RoundWinner;
}

export function resolveRound(a: ClassicEntry, aStat: ClassicStat, b: ClassicEntry, bStat: ClassicStat): RoundResult {
  const va = a[aStat] ?? 0;
  const vb = b[bStat] ?? 0;
  return {
    p1: { entryId: a.id, stat: aStat, value: va },
    p2: { entryId: b.id, stat: bStat, value: vb },
    winner: va > vb ? 'p1' : vb > va ? 'p2' : 'tie',
  };
}

export function matchWinner(score: Record<PlayerId, number>): RoundWinner {
  return score.p1 > score.p2 ? 'p1' : score.p2 > score.p1 ? 'p2' : 'tie';
}
