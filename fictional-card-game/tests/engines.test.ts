import { describe, expect, it } from 'vitest';
import { seededRng, type Rng } from '../src/core/rng';
import { weekKey } from '../src/core/time';
import {
  ALT_ART_CHANCE, GUARANTEED_TABLE, STANDARD_TABLE, WEIGHT_TOTAL, rollEdition, rollRarity, tableTotal,
} from '../src/engines/rarity';
import { activePityFloor, emptyPity, missingRarities, nextPity, rollPack, rollPackRarities } from '../src/engines/pack';
import { drawPair, resolveRound } from '../src/engines/classic';
import {
  TOURNAMENT_SIZES, createTournament, eliminationRound, placementFor, playerResult, reachablePlacements, rewardFor, type Participant,
} from '../src/engines/tournament';
import { draftOrder, scoreTeams, type Team } from '../src/engines/team';
import {
  ACHIEVEMENT_IDS, applyMatch, applyPack, applyTournament, buyPacks, claimAchievement, claimLogin, claimMission, claimWeekly,
  convertDuplicates, duplicateValue, newPlayer, refreshPeriodic, type ContentStatus,
} from '../src/engines/economy';
import { validateCollector } from '../src/model/validation';
import { RARITIES, ROLES, type ClassicEntry, type CollectorEntry, type Rarity, type TeamEntry } from '../src/model/types';

const fixed = (values: number[]): Rng => {
  let i = 0;
  return { int: (n) => { const v = values[i++ % values.length]!; if (v >= n) throw new Error(`fixed value ${v} >= ${n}`); return v; } };
};

const card = (id: string, rarity: Rarity, alt = false): CollectorEntry => ({
  id, name: id, rarity, normalArt: { id: `img-${id}` }, altArt: alt ? { id: `alt-${id}` } : null, description: '', cutscene: rarity === 'omniversal' ? { id: `vid-${id}` } : null, createdAt: 0, updatedAt: 0,
});
const fullPool = (): CollectorEntry[] => RARITIES.flatMap((r) => [card(`${r}-a`, r, true), card(`${r}-b`, r)]);

describe('probability tables', () => {
  it('total exactly 100%', () => {
    expect(tableTotal(STANDARD_TABLE)).toBe(WEIGHT_TOTAL);
    expect(tableTotal(GUARANTEED_TABLE)).toBe(WEIGHT_TOTAL);
  });
  it('match the specification exactly', () => {
    expect(STANDARD_TABLE).toEqual({ common: 6999, rare: 2000, epic: 700, legendary: 230, mythic: 60, secret: 10, omniversal: 1 });
    expect(GUARANTEED_TABLE).toEqual({ common: 0, rare: 6995, epic: 2000, legendary: 700, mythic: 250, secret: 50, omniversal: 5 });
    expect(ALT_ART_CHANCE).toEqual({ common: 0, rare: 0, epic: 0, legendary: 800, mythic: 1200, secret: 1500, omniversal: 1500 });
  });
  it('maps every one of the 10 000 outcomes to the right rarity', () => {
    const counts: Record<string, number> = {};
    for (let x = 0; x < WEIGHT_TOTAL; x++) {
      const r = rollRarity(fixed([x]), STANDARD_TABLE);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    expect(counts).toEqual({ common: 6999, rare: 2000, epic: 700, legendary: 230, mythic: 60, secret: 10, omniversal: 1 });
    const c5: Record<string, number> = {};
    for (let x = 0; x < WEIGHT_TOTAL; x++) {
      const r = rollRarity(fixed([x]), GUARANTEED_TABLE);
      c5[r] = (c5[r] ?? 0) + 1;
    }
    expect(c5.common).toBeUndefined();
    expect(c5).toEqual({ rare: 6995, epic: 2000, legendary: 700, mythic: 250, secret: 50, omniversal: 5 });
  });
  it('fifth card is never Common over many packs', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 20000; i++) expect(rollPackRarities(rng, emptyPity()).rarities[4]).not.toBe('common');
  });
});

describe('alternative art', () => {
  it('never for Common/Rare/Epic', () => {
    for (let x = 0; x < WEIGHT_TOTAL; x += 37) for (const r of ['common', 'rare', 'epic'] as const) expect(rollEdition(fixed([x]), r, true)).toBe('normal');
  });
  it('exact chances for Legendary/Mythic/Secret/Omniversal', () => {
    for (const [r, c] of [['legendary', 800], ['mythic', 1200], ['secret', 1500], ['omniversal', 1500]] as const) {
      let alts = 0;
      for (let x = 0; x < WEIGHT_TOTAL; x++) if (rollEdition(fixed([x]), r, true) === 'alt') alts++;
      expect(alts).toBe(c);
    }
  });
  it('falls back to Normal Art when the character has no Alternative Art', () => {
    for (let x = 0; x < WEIGHT_TOTAL; x += 13) expect(rollEdition(fixed([x]), 'omniversal', false)).toBe('normal');
  });
  it('Omniversal can be both editions (85/15)', () => {
    const rng = seededRng(3);
    let alt = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) if (rollEdition(rng, 'omniversal', true) === 'alt') alt++;
    expect(alt / n).toBeGreaterThan(0.14);
    expect(alt / n).toBeLessThan(0.16);
  });
});

describe('pity', () => {
  it('thresholds activate at 20 / 50 / 100 packs', () => {
    expect(activePityFloor({ sinceLegendary: 19, sinceMythic: 0, sinceSecret: 0 })).toBeNull();
    expect(activePityFloor({ sinceLegendary: 20, sinceMythic: 0, sinceSecret: 0 })).toBe('legendary');
    expect(activePityFloor({ sinceLegendary: 20, sinceMythic: 50, sinceSecret: 0 })).toBe('mythic');
    expect(activePityFloor({ sinceLegendary: 20, sinceMythic: 50, sinceSecret: 100 })).toBe('secret');
  });
  it('raises the 5th card when nothing in the pack reached the floor', () => {
    const all0 = fixed([0]); // every roll = first bucket → commons + rare
    const r = rollPackRarities(all0, { sinceLegendary: 20, sinceMythic: 0, sinceSecret: 0 });
    expect(r.rarities).toEqual(['common', 'common', 'common', 'common', 'legendary']);
    expect(r.pityApplied).toBe('legendary');
    const s = rollPackRarities(fixed([0]), { sinceLegendary: 99, sinceMythic: 99, sinceSecret: 100 });
    expect(s.rarities[4]).toBe('secret');
  });
  it('keeps a natural roll that already satisfies the floor (no extra Omniversal chance)', () => {
    // card 2 natural legendary (x = 9700 → legendary bucket in standard table)
    const r = rollPackRarities(fixed([0, 9700, 0, 0, 0]), { sinceLegendary: 25, sinceMythic: 0, sinceSecret: 0 });
    expect(r.rarities).toEqual(['common', 'legendary', 'common', 'common', 'rare']);
    expect(r.pityApplied).toBeNull();
  });
  it('resets counters by actual rarity, higher resets lower; Omniversal has no counter', () => {
    const p = { sinceLegendary: 5, sinceMythic: 7, sinceSecret: 9 };
    expect(nextPity(p, 'rare')).toEqual({ sinceLegendary: 6, sinceMythic: 8, sinceSecret: 10 });
    expect(nextPity(p, 'legendary')).toEqual({ sinceLegendary: 0, sinceMythic: 8, sinceSecret: 10 });
    expect(nextPity(p, 'mythic')).toEqual({ sinceLegendary: 0, sinceMythic: 0, sinceSecret: 10 });
    expect(nextPity(p, 'secret')).toEqual({ sinceLegendary: 0, sinceMythic: 0, sinceSecret: 0 });
    expect(nextPity(p, 'omniversal')).toEqual({ sinceLegendary: 0, sinceMythic: 0, sinceSecret: 0 });
    expect(Object.keys(emptyPity())).not.toContain('sinceOmniversal');
  });
  it('a player never goes more than 20 packs without a Legendary+', () => {
    const rng = seededRng(11);
    let pity = emptyPity();
    let dry = 0, maxDry = 0;
    for (let i = 0; i < 5000; i++) {
      const roll = rollPack(rng, fullPool(), pity);
      pity = roll.pityAfter;
      const hit = roll.cards.some((c) => ['legendary', 'mythic', 'secret', 'omniversal'].includes(c.rarity));
      dry = hit ? 0 : dry + 1;
      maxDry = Math.max(maxDry, dry);
    }
    expect(maxDry).toBeLessThanOrEqual(20);
  });
});

describe('packs', () => {
  it('require every rarity to have a valid card', () => {
    expect(missingRarities(fullPool())).toEqual([]);
    expect(missingRarities(fullPool().filter((c) => c.rarity !== 'secret'))).toEqual(['secret']);
    expect(() => rollPack(seededRng(1), fullPool().filter((c) => c.rarity !== 'omniversal'), emptyPity())).toThrow();
  });
  it('alt art only for characters that have one', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 3000; i++) {
      for (const c of rollPack(rng, fullPool(), emptyPity()).cards) if (c.edition === 'alt') expect(c.entry.altArt).not.toBeNull();
    }
  });
  it('saves all five cards into the collection, editions separately, duplicates counted', () => {
    const p = newPlayer('p1', 'A');
    p.fc = 1000;
    buyPacks(p, 2, 1);
    expect(p.fc).toBe(0);
    expect(p.unopenedPacks).toBe(2);
    const e = card('legendary-a', 'legendary', true);
    const roll = { cards: [0, 1, 2, 3, 4].map((i) => ({ entry: e, rarity: 'legendary' as Rarity, edition: (i === 4 ? 'alt' : 'normal') as 'alt' | 'normal', pity: false })), pityApplied: null, pityAfter: emptyPity() };
    const rec = applyPack(p, roll, 2);
    expect(rec.cards.map((c) => c.isNew)).toEqual([true, false, false, false, true]);
    expect(p.collection['legendary-a|normal']!.qty).toBe(4);
    expect(p.collection['legendary-a|alt']!.qty).toBe(1);
    expect(p.unopenedPacks).toBe(1);
    expect(p.pendingReveal).toBe(rec.id);
    expect(() => buyPacks(p, 1, 3)).toThrow();
  });
});

describe('duplicates', () => {
  it('values match the tables', () => {
    expect([...RARITIES].map((r) => duplicateValue(r, 'normal'))).toEqual([10, 20, 50, 150, 400, 1000, 10000]);
    expect(['legendary', 'mythic', 'secret', 'omniversal'].map((r) => duplicateValue(r as Rarity, 'alt'))).toEqual([450, 1200, 3000, 10000]);
    expect(duplicateValue('epic', 'alt')).toBe(0);
  });
  it('keeps at least one copy and converts the exact edition', () => {
    const p = newPlayer('p1', 'A');
    p.collection['x|alt'] = { qty: 3, firstAt: 0, lastAt: 0, obtained: 3 };
    p.collection['x|normal'] = { qty: 1, firstAt: 0, lastAt: 0, obtained: 1 };
    expect(() => convertDuplicates(p, 'x', 'alt', 'mythic', 3, 'X', 1)).toThrow();
    expect(convertDuplicates(p, 'x', 'alt', 'mythic', 2, 'X', 1)).toBe(2400);
    expect(p.collection['x|alt']!.qty).toBe(1);
    expect(p.collection['x|normal']!.qty).toBe(1);
    expect(p.fc).toBe(2400);
    expect(() => convertDuplicates(p, 'x', 'normal', 'mythic', 1, 'X', 1)).toThrow();
  });
});

describe('classic draft', () => {
  const pool = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  it('always draws two different characters, uniformly', () => {
    const rng = seededRng(9);
    const counts: Record<string, number> = {};
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const [x, y] = drawPair(rng, pool);
      expect(x.id).not.toBe(y.id);
      counts[x.id] = (counts[x.id] ?? 0) + 1;
      counts[y.id] = (counts[y.id] ?? 0) + 1;
    }
    for (const id of ['a', 'b', 'c', 'd']) expect(Math.abs(counts[id]! / (2 * n) - 0.25)).toBeLessThan(0.01);
  });
  it('compares chosen stats; ties give no point', () => {
    const e = (id: string, o: number, d: number): ClassicEntry => ({ id, name: id, image: null, cutscene: null, offense: o, defense: d, hax: 1, iq: 1, createdAt: 0, updatedAt: 0 });
    expect(resolveRound(e('a', 90, 10), 'offense', e('b', 10, 80), 'defense').winner).toBe('p1');
    expect(resolveRound(e('a', 50, 10), 'offense', e('b', 10, 50), 'defense').winner).toBe('tie');
  });
});

describe('tournament', () => {
  const pool = (n: number): Participant[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `C${i}`, value: i % 7, imageId: null }));
  it('uses exactly the selected size with unique participants and a correct bracket', () => {
    for (const size of TOURNAMENT_SIZES) {
      const t = createTournament(seededRng(size), pool(80), size, 't', 0);
      expect(t.participants.length).toBe(size);
      expect(new Set(t.participants.map((p) => p.id)).size).toBe(size);
      expect(t.assigned.p1).not.toBe(t.assigned.p2);
      expect(t.rounds.length).toBe(Math.log2(size));
      t.rounds.forEach((r, i) => expect(r.length).toBe(size / 2 ** (i + 1)));
      for (const r of t.rounds) for (const m of r) {
        const va = t.participants[m.a]!.value, vb = t.participants[m.b]!.value;
        if (va !== vb) expect(m.winner).toBe(va > vb ? m.a : m.b);
        else expect(m.coin).toBe(true);
      }
      expect(eliminationRound(t, t.champion)).toBeNull();
    }
  });
  it('refuses to start without enough characters', () => {
    expect(() => createTournament(seededRng(1), pool(7), 8, 't', 0)).toThrow();
  });
  it('maps eliminations to placements and rewards', () => {
    expect(placementFor(2, 0)).toBe('finalist');
    expect(placementFor(4, 0)).toBe('semifinal');
    expect(placementFor(8, 0)).toBe('intermediate');
    expect(placementFor(16, 0)).toBe('early');
    expect(placementFor(64, 2)).toBe('early');
    expect(placementFor(64, 3)).toBe('intermediate');
    expect(rewardFor(64, 'champion')).toBe(350);
    expect(rewardFor(2, 'finalist')).toBe(20);
    expect(rewardFor(8, 'intermediate')).toBe(40);
    expect(reachablePlacements(2)).toEqual(['finalist', 'champion']);
    expect(reachablePlacements(16)).toEqual(['early', 'intermediate', 'semifinal', 'finalist', 'champion']);
  });
  it('coin toss is fair', () => {
    const tied = Array.from({ length: 2 }, (_, i) => ({ id: `t${i}`, name: '', value: 5, imageId: null }));
    const rng = seededRng(42);
    let firstWins = 0;
    for (let i = 0; i < 20000; i++) {
      const t = createTournament(rng, tied, 2, 't', 0);
      if (t.participants[t.champion]!.id === 't0') firstWins++;
    }
    expect(Math.abs(firstWins / 20000 - 0.5)).toBeLessThan(0.02);
  });
  it('grants each player one reward per tournament', () => {
    const t = createTournament(seededRng(2), pool(16), 16, 'T1', 0);
    const p = newPlayer('p1', 'A');
    const r = playerResult(t, 'p1');
    applyTournament(p, { id: 'T1', at: 0, size: 16, character: r.participant.name, placement: r.placement, reward: r.reward, champion: '' }, 0);
    expect(p.fc).toBe(r.reward);
    expect(() => applyTournament(p, { id: 'T1', at: 0, size: 16, character: '', placement: r.placement, reward: r.reward, champion: '' }, 0)).toThrow();
    expect(p.fc).toBe(r.reward);
  });
});

describe('team draft', () => {
  const te = (id: string, v: number, effect: TeamEntry['effect'] = null): TeamEntry => ({
    id, name: id, image: null, cutscene: null, effect, createdAt: 0, updatedAt: 0,
    roles: { captain: v, tank: v, hax: v, planner: v, support: v },
  });
  const team = (prefix: string, v: number, fxAt?: TeamEntry): Team => Object.fromEntries(ROLES.map((r, i) => [r, i === 0 && fxAt ? fxAt : te(`${prefix}${i}`, v)])) as Team;
  it('snake order gives 5 picks each', () => {
    const o = draftOrder('p2');
    expect(o.filter((x) => x === 'p1').length).toBe(5);
    expect(o[0]).toBe('p2');
  });
  it('sums role values and applies deterministic effects', () => {
    const cap = te('cap', 10, { name: 'Leader', description: '', condition: { type: 'role', role: 'captain' }, impact: { type: 'percentTeam', percent: 10 } });
    const res = scoreTeams({ p1: team('a', 10, cap), p2: team('b', 11) });
    expect(res.p1.base).toBe(50);
    expect(res.p1.effectBonus).toBe(5);
    expect(res.p1.total).toBe(55);
    expect(res.p2.total).toBe(55);
    expect(res.winner).toBe('tie');
    const res2 = scoreTeams({ p1: team('a', 10, cap), p2: team('b', 11) });
    expect(res2).toEqual(res);
  });
  it('enemy penalties and inactive conditions', () => {
    const sab = te('sab', 10, { name: 'Sabotage', description: '', condition: { type: 'role', role: 'tank' }, impact: { type: 'flatEnemy', amount: 7 } });
    const res = scoreTeams({ p1: team('a', 10, sab), p2: team('b', 10) });
    expect(res.effects[0]!.active).toBe(false);
    expect(res.p2.total).toBe(50);
    const under = te('u', 1, { name: 'Underdog', description: '', condition: { type: 'underdog' }, impact: { type: 'flatEnemy', amount: 7 } });
    const r2 = scoreTeams({ p1: team('a', 1, under), p2: team('b', 10) });
    expect(r2.p2.penaltyTaken).toBe(7);
    expect(r2.p2.total).toBe(43);
  });
});

describe('economy', () => {
  const content: ContentStatus = { classic: true, tournament: true, team: false, collector: true, collectibleKeys: ['a|normal', 'b|normal', 'c|normal', 'd|normal'] };
  it('assigns three valid daily missions, never impossible ones', () => {
    const p = newPlayer('p1', 'A');
    refreshPeriodic(p, '2026-11-09', weekKey(new Date(2026, 10, 9)), content, seededRng(1));
    expect(p.daily.missions.length).toBe(3);
    for (const m of p.daily.missions) {
      expect(m.reward).toBe(100);
      expect(['teamMatch', 'openPack', 'newCards']).not.toContain(m.kind); // team unavailable; no FC for a pack
    }
    const empty: ContentStatus = { classic: false, tournament: false, team: false, collector: false, collectibleKeys: [] };
    const q = newPlayer('p2', 'B');
    refreshPeriodic(q, '2026-11-09', 'w', empty, seededRng(1));
    expect(q.daily.missions.length).toBe(0);
  });
  it('mission claims pay once', () => {
    const p = newPlayer('p1', 'A');
    refreshPeriodic(p, 'd1', 'w1', content, seededRng(2));
    const m = p.daily.missions[0]!;
    expect(() => claimMission(p, m.id, 0)).toThrow();
    m.progress = m.target;
    expect(claimMission(p, m.id, 0)).toBe(100);
    expect(() => claimMission(p, m.id, 0)).toThrow();
    expect(p.fc).toBe(100);
  });
  it('login cycle 50/75/75/100/100/150/250, once per day, restarts after day 7', () => {
    const p = newPlayer('p1', 'A');
    const got: number[] = [];
    for (let d = 1; d <= 8; d++) {
      got.push(claimLogin(p, `day${d}`, d));
      expect(() => claimLogin(p, `day${d}`, d)).toThrow();
    }
    expect(got).toEqual([50, 75, 75, 100, 100, 150, 250, 50]);
  });
  it('match rewards: 5 participations and 3 victories per day (max 130)', () => {
    const p = newPlayer('p1', 'A');
    refreshPeriodic(p, 'd', 'w', content, seededRng(3));
    for (let i = 0; i < 8; i++) applyMatch(p, 'classic', 'win', '3-1', 'B', i);
    const missionFc = p.ledger.filter((l) => l.reason.startsWith('Daily mission')).reduce((s, l) => s + l.amount, 0);
    expect(p.fc - missionFc).toBe(130);
    const q = newPlayer('p2', 'B');
    refreshPeriodic(q, 'd', 'w', content, seededRng(3));
    applyMatch(q, 'classic', 'draw', '2-2', 'A', 0);
    applyMatch(q, 'classic', 'loss', '1-2', 'A', 0);
    expect(q.fc).toBe(40);
  });
  it('weekly missions total 800 FC and pay once', () => {
    const p = newPlayer('p1', 'A');
    refreshPeriodic(p, 'd', 'w', content, seededRng(4));
    p.weekly.matches = 10; p.weekly.packs = 10; p.weekly.cards = 50;
    let total = 0;
    for (const k of ['matches', 'packs', 'cards', 'bonus'] as const) total += claimWeekly(p, k, 0);
    expect(total).toBe(800);
    expect(() => claimWeekly(p, 'bonus', 0)).toThrow();
  });
  it('achievements pay once', () => {
    const p = newPlayer('p1', 'A');
    expect(ACHIEVEMENT_IDS.length).toBe(6);
    expect(() => claimAchievement(p, 'firstSecret', 0)).toThrow();
    p.counters.secretPlus = 1;
    expect(claimAchievement(p, 'firstSecret', 0)).toBe(1000);
    expect(() => claimAchievement(p, 'firstSecret', 0)).toThrow();
  });
});

describe('validation', () => {
  const media = (id: string) => (id.startsWith('vid') ? { kind: 'video' as const } : { kind: 'image' as const });
  it('Omniversal requires a cutscene; Alternative Art is optional', () => {
    const o = card('o', 'omniversal');
    expect(validateCollector(o, media)).toEqual([]);
    expect(validateCollector({ ...o, cutscene: null }, media).map((i) => i.field)).toContain('cutscene');
    expect(validateCollector({ ...o, altArt: { id: 'alt' } }, media)).toEqual([]);
  });
  it('Common/Rare/Epic cannot have Alternative Art', () => {
    expect(validateCollector({ ...card('c', 'epic'), altArt: { id: 'alt' } }, media).map((i) => i.field)).toContain('altArt');
  });
  it('missing media is reported', () => {
    expect(validateCollector(card('c', 'rare'), () => undefined).map((i) => i.field)).toContain('normalArt');
  });
});
