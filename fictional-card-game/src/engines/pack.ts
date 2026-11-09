/**
 * Anime Pack generation: 5 cards, cards 1–4 on the standard table, card 5 guaranteed Rare or higher,
 * per-player Pity (Legendary 20 packs, Mythic 50 packs, Secret 100 packs; Omniversal has none).
 *
 * Pity rule: when a threshold is reached, the pack is rolled normally; if no card in it naturally reached the
 * guaranteed rarity, the 5th card (the pack's guaranteed slot — the "eligible card") is raised to exactly that rarity.
 * A natural roll is always kept when it is already high enough, so the Omniversal chance is never increased.
 */
import type { Rng } from '../core/rng';
import { pick } from '../core/rng';
import { type CollectorEntry, type Edition, type PityState, type Rarity, RARITIES } from '../model/types';
import { GUARANTEED_TABLE, STANDARD_TABLE, atLeast, maxRarity, rollEdition, rollRarity } from './rarity';

export const PACK_SIZE = 5;
export const PACK_PRICE = 500;
export const PITY_THRESHOLDS = { legendary: 20, mythic: 50, secret: 100 } as const;

export const emptyPity = (): PityState => ({ sinceLegendary: 0, sinceMythic: 0, sinceSecret: 0 });

/** Highest guarantee active for the next pack, or null. */
export function activePityFloor(p: PityState): Rarity | null {
  if (p.sinceSecret >= PITY_THRESHOLDS.secret) return 'secret';
  if (p.sinceMythic >= PITY_THRESHOLDS.mythic) return 'mythic';
  if (p.sinceLegendary >= PITY_THRESHOLDS.legendary) return 'legendary';
  return null;
}

/** Counters after a pack whose best card had rarity `best` (higher rarities reset lower thresholds). */
export function nextPity(p: PityState, best: Rarity): PityState {
  return {
    sinceLegendary: atLeast(best, 'legendary') ? 0 : p.sinceLegendary + 1,
    sinceMythic: atLeast(best, 'mythic') ? 0 : p.sinceMythic + 1,
    sinceSecret: atLeast(best, 'secret') ? 0 : p.sinceSecret + 1,
  };
}

export interface RolledCard {
  entry: CollectorEntry;
  rarity: Rarity;
  edition: Edition;
  pity: boolean;
}

export interface PackRoll {
  cards: RolledCard[];
  pityApplied: Rarity | null;
  pityAfter: PityState;
}

export function poolByRarity(valid: readonly CollectorEntry[]): Record<Rarity, CollectorEntry[]> {
  const out = Object.fromEntries(RARITIES.map((r) => [r, [] as CollectorEntry[]])) as Record<Rarity, CollectorEntry[]>;
  for (const e of valid) if (e.rarity) out[e.rarity].push(e);
  return out;
}

/** Rarities with no valid card. Packs can only be opened when every rarity can actually be delivered. */
export function missingRarities(valid: readonly CollectorEntry[]): Rarity[] {
  const by = poolByRarity(valid);
  return RARITIES.filter((r) => by[r].length === 0);
}

export function rollPackRarities(rng: Rng, pity: PityState): { rarities: Rarity[]; pityApplied: Rarity | null } {
  const rarities: Rarity[] = [];
  for (let i = 0; i < PACK_SIZE - 1; i++) rarities.push(rollRarity(rng, STANDARD_TABLE));
  rarities.push(rollRarity(rng, GUARANTEED_TABLE));
  const floor = activePityFloor(pity);
  let pityApplied: Rarity | null = null;
  if (floor && !atLeast(maxRarity(rarities), floor)) {
    rarities[PACK_SIZE - 1] = floor;
    pityApplied = floor;
  }
  return { rarities, pityApplied };
}

export function rollPack(rng: Rng, valid: readonly CollectorEntry[], pity: PityState): PackRoll {
  const missing = missingRarities(valid);
  if (missing.length) throw new Error(`Cannot open packs: no valid card for ${missing.join(', ')}`);
  const by = poolByRarity(valid);
  const { rarities, pityApplied } = rollPackRarities(rng, pity);
  const cards = rarities.map((rarity, i): RolledCard => {
    const entry = pick(rng, by[rarity]);
    const edition = rollEdition(rng, rarity, !!entry.altArt);
    return { entry, rarity, edition, pity: pityApplied !== null && i === PACK_SIZE - 1 };
  });
  return { cards, pityApplied, pityAfter: nextPity(pity, maxRarity(rarities)) };
}
