/**
 * Rarity and Alternative Art probability tables.
 * Weights are exact integers in units of 0.01% (10 000 = 100%), so no value is ever rounded.
 */
import type { Rng } from '../core/rng';
import { ALT_RARITIES, RARITIES, type Edition, type Rarity, rarityRank } from '../model/types';

export const WEIGHT_TOTAL = 10_000;

/** Cards 1–4 of an Anime Pack. */
export const STANDARD_TABLE: Readonly<Record<Rarity, number>> = {
  common: 6999, // 69.99%
  rare: 2000, // 20%
  epic: 700, // 7%
  legendary: 230, // 2.3%
  mythic: 60, // 0.6%
  secret: 10, // 0.1%
  omniversal: 1, // 0.01%
};

/** Card 5: guaranteed Rare or higher (never Common). */
export const GUARANTEED_TABLE: Readonly<Record<Rarity, number>> = {
  common: 0,
  rare: 6995, // 69.95%
  epic: 2000, // 20%
  legendary: 700, // 7%
  mythic: 250, // 2.5%
  secret: 50, // 0.5%
  omniversal: 5, // 0.05%
};

/** Chance that a card of this rarity is Alternative Art (if the character has one). */
export const ALT_ART_CHANCE: Readonly<Record<Rarity, number>> = {
  common: 0,
  rare: 0,
  epic: 0,
  legendary: 800, // 8%
  mythic: 1200, // 12%
  secret: 1500, // 15%
  omniversal: 1500, // 15%
};

export function tableTotal(t: Readonly<Record<Rarity, number>>): number {
  return RARITIES.reduce((s, r) => s + t[r], 0);
}

export function rollRarity(rng: Rng, table: Readonly<Record<Rarity, number>>): Rarity {
  const total = tableTotal(table);
  if (total !== WEIGHT_TOTAL) throw new Error(`Rarity table must total 100% (got ${total / 100}%)`);
  let x = rng.int(WEIGHT_TOTAL);
  for (const r of RARITIES) {
    if (x < table[r]) return r;
    x -= table[r];
  }
  throw new Error('unreachable');
}

/**
 * Edition roll, done after the rarity and the character are chosen.
 * Alternative Art is only possible when the character actually has an Alternative Art image.
 */
export function rollEdition(rng: Rng, rarity: Rarity, hasAltArt: boolean): Edition {
  const chance = ALT_ART_CHANCE[rarity];
  if (chance <= 0 || !hasAltArt || !ALT_RARITIES.includes(rarity)) return 'normal';
  return rng.int(WEIGHT_TOTAL) < chance ? 'alt' : 'normal';
}

export const atLeast = (r: Rarity, floor: Rarity): boolean => rarityRank(r) >= rarityRank(floor);
export const maxRarity = (list: readonly Rarity[]): Rarity =>
  list.reduce((m, r) => (rarityRank(r) > rarityRank(m) ? r : m), 'common' as Rarity);

export function pct(weight: number): string {
  return `${(weight / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}
