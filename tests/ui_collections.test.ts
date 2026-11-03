/** Collections progress (pause > Collezioni): the four counters and which bosses count for hours and challenges. */
import { describe, expect, it } from 'vitest';
import contentJson from '../src/generated/content.json';
import type { ContentBundle } from '../src/core/types';
import { COLL_CHALLENGES, COLL_TODS, collectionStats, memoryCatalogue } from '../src/ui/collections';

const bundle = contentJson as unknown as ContentBundle;
const cat = {
  weapons: ['a', 'b', 'c'],
  forms: ['f1', 'f2'],
  bosses: [
    { id: 'x', order: 2 },
    { id: 's', order: 1, scripted: true },
    { id: 'y', order: 3 },
  ],
};
const empty = { weapons: [] as string[], forms: [] as string[], todDefeats: {}, challenges: {} };

describe('collections', () => {
  it('memory catalogue drops scripted bosses and sorts by order', () => {
    expect(memoryCatalogue(cat.bosses).map((b) => b.id)).toEqual(['x', 'y']);
  });

  it('totals: weapons, forms, 4 hours and 4 challenges per replayable boss', () => {
    const s = collectionStats(cat, empty);
    expect(s).toEqual({ weapons: [0, 3], forms: [0, 2], hours: [0, 8], challenges: [0, 8] });
  });

  it('counts owned entries once and ignores unknown ids, scripted bosses and bad hours', () => {
    const s = collectionStats(cat, {
      weapons: ['a', 'a', 'zzz', 'c'],
      forms: ['f2', 'nope'],
      todDefeats: { x: ['alba', 'notte', 'alba'], s: ['giorno'], y: ['tramonto', 'mezzodi' as never], gone: ['alba'] },
      challenges: { no_damage: ['x', 'x', 's'], single_weapon: ['y'], no_lacrime: [], unknown_challenge: ['x'] },
    });
    expect(s.weapons).toEqual([2, 3]);
    expect(s.forms).toEqual([1, 2]);
    expect(s.hours).toEqual([3, 8]);
    expect(s.challenges).toEqual([2, 8]);
  });

  it('a fully completed state reaches every total', () => {
    const todDefeats = Object.fromEntries(cat.bosses.map((b) => [b.id, [...COLL_TODS]]));
    const challenges = Object.fromEntries(COLL_CHALLENGES.map((c) => [c.id, cat.bosses.map((b) => b.id)]));
    const s = collectionStats(cat, { weapons: [...cat.weapons], forms: [...cat.forms], todDefeats, challenges });
    for (const [n, m] of Object.values(s)) expect(n).toBe(m);
  });

  it('real content: every weapon and Form is collectable, challenge ids match the Specchio ones', () => {
    const s = collectionStats({ weapons: bundle.weapons.map((w) => w.id), forms: bundle.forms.map((f) => f.id), bosses: bundle.bosses }, empty);
    expect(s.weapons[1]).toBe(bundle.weapons.length);
    expect(s.forms[1]).toBe(bundle.forms.length);
    expect(s.hours[1]).toBe(memoryCatalogue(bundle.bosses).length * 4);
    expect(COLL_CHALLENGES.map((c) => c.id)).toEqual(['no_damage', 'single_weapon', 'no_lacrime', 'no_metamondo']);
  });
});
