/**
 * Tournament: single-elimination bracket of 2–64 unique characters, resolved by Value.
 * Equal values are decided by a fair coin toss.
 */
import type { Rng } from '../core/rng';
import { coin, sample, shuffle } from '../core/rng';
import type { Placement, PlayerId } from '../model/types';

export const TOURNAMENT_SIZES = [2, 4, 8, 16, 32, 64] as const;
export type TournamentSize = (typeof TOURNAMENT_SIZES)[number];

/** FC rewards per placement. `undefined` = that placement cannot happen at this size. */
export const TOURNAMENT_REWARDS: Record<TournamentSize, Partial<Record<Placement, number>>> = {
  2: { finalist: 20, champion: 60 },
  4: { early: 20, semifinal: 35, finalist: 70, champion: 110 },
  8: { early: 20, intermediate: 40, semifinal: 80, finalist: 130, champion: 200 },
  16: { early: 20, intermediate: 35, semifinal: 60, finalist: 120, champion: 220 },
  32: { early: 20, intermediate: 35, semifinal: 60, finalist: 110, champion: 260 },
  64: { early: 20, intermediate: 35, semifinal: 55, finalist: 100, champion: 350 },
};

export const PLACEMENT_LABEL: Record<Placement, string> = {
  early: 'Early elimination',
  intermediate: 'Intermediate',
  semifinal: 'Semifinal',
  finalist: 'Finalist',
  champion: 'Champion',
};
export const PLACEMENTS: readonly Placement[] = ['early', 'intermediate', 'semifinal', 'finalist', 'champion'];

export interface Participant {
  id: string;
  name: string;
  value: number;
  imageId: string | null;
}

export interface BracketMatch {
  a: number; // index into participants
  b: number;
  winner: number;
  /** Set when values were equal and a coin toss decided. */
  coin: boolean;
}

export interface TournamentState {
  id: string;
  size: TournamentSize;
  createdAt: number;
  participants: Participant[];
  /** Participant index assigned to each player. */
  assigned: Record<PlayerId, number>;
  rounds: BracketMatch[][];
  champion: number;
}

export const roundCount = (size: number): number => Math.round(Math.log2(size));

export function roundName(size: number, round: number): string {
  const fromEnd = roundCount(size) - 1 - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round of ${size >> round}`;
}

/**
 * Placement of a character eliminated in `round` (0-based), or champion.
 * Final → Finalist, Semifinal → Semifinal, Quarterfinal → Intermediate, any earlier round → Early elimination.
 */
export function placementFor(size: number, eliminatedRound: number | null): Placement {
  if (eliminatedRound === null) return 'champion';
  const fromEnd = roundCount(size) - 1 - eliminatedRound;
  if (fromEnd <= 0) return 'finalist';
  if (fromEnd === 1) return 'semifinal';
  if (fromEnd === 2) return 'intermediate';
  return 'early';
}

export function rewardFor(size: TournamentSize, p: Placement): number {
  return TOURNAMENT_REWARDS[size][p] ?? 0;
}

/** Placements that can actually occur at this size (for the rewards table). */
export function reachablePlacements(size: number): Placement[] {
  const set = new Set<Placement>(['champion']);
  for (let r = 0; r < roundCount(size); r++) set.add(placementFor(size, r));
  return PLACEMENTS.filter((p) => set.has(p));
}

/**
 * Pick participants: Player 1 and Player 2 each get a distinct random character (uniform),
 * the remaining slots are filled uniformly from the rest; then the bracket is seeded randomly.
 */
export function createTournament(rng: Rng, pool: readonly Participant[], size: TournamentSize, id: string, now: number): TournamentState {
  if (pool.length < size) throw new Error(`A ${size}-participant tournament needs ${size} characters (database has ${pool.length})`);
  const [p1, p2, ...rest] = sample(rng, pool, size);
  const seeded = shuffle(rng, [p1!, p2!, ...rest]);
  const participants = seeded.map((p) => ({ ...p }));
  const assigned = { p1: participants.findIndex((p) => p.id === p1!.id), p2: participants.findIndex((p) => p.id === p2!.id) };
  const rounds: BracketMatch[][] = [];
  let alive = participants.map((_, i) => i);
  while (alive.length > 1) {
    const round: BracketMatch[] = [];
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i]!, b = alive[i + 1]!;
      const va = participants[a]!.value, vb = participants[b]!.value;
      let winner: number;
      let tossed = false;
      if (va > vb) winner = a;
      else if (vb > va) winner = b;
      else {
        tossed = true;
        winner = coin(rng) ? a : b;
      }
      round.push({ a, b, winner, coin: tossed });
      next.push(winner);
    }
    rounds.push(round);
    alive = next;
  }
  return { id, size, createdAt: now, participants, assigned, rounds, champion: alive[0]! };
}

/** Round in which participant `idx` lost, or null if champion. */
export function eliminationRound(t: TournamentState, idx: number): number | null {
  for (let r = 0; r < t.rounds.length; r++) {
    for (const m of t.rounds[r]!) {
      if ((m.a === idx || m.b === idx) && m.winner !== idx) return r;
    }
  }
  return null;
}

export function playerResult(t: TournamentState, p: PlayerId): { participant: Participant; placement: Placement; reward: number } {
  const idx = t.assigned[p];
  const placement = placementFor(t.size, eliminationRound(t, idx));
  return { participant: t.participants[idx]!, placement, reward: rewardFor(t.size, placement) };
}
