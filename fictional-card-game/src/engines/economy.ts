/**
 * Fictional Coins economy and progression for one player: purchases, pack results, duplicates, daily/weekly missions,
 * daily login, match rewards and achievements. All functions mutate the profile passed in (callers pass a clone and
 * persist it in a single write, so a change is either fully saved or not at all).
 */
import type { Rng } from '../core/rng';
import { pick } from '../core/rng';
import { uid } from '../core/util';
import {
  type AchievementId, type Counters, type Edition, type MatchMode, type MatchRecord, type Mission, type MissionKind, type Outcome,
  type PackRecord, type PlayerId, type PlayerProfile, type PulledCard, type Rarity, type TournamentRecord, type WeeklyKind,
  cardKey,
} from '../model/types';
import { PACK_PRICE, type PackRoll, emptyPity } from './pack';
import { atLeast } from './rarity';

export const PROFILE_VERSION = 1;
const CAP = { ledger: 400, packs: 1000, matches: 300, tournaments: 300 };

// ---------------------------------------------------------------- tables

export const DUPLICATE_VALUE: Record<Edition, Partial<Record<Rarity, number>>> = {
  normal: { common: 10, rare: 20, epic: 50, legendary: 150, mythic: 400, secret: 1000, omniversal: 10000 },
  alt: { legendary: 450, mythic: 1200, secret: 3000, omniversal: 10000 },
};

export function duplicateValue(rarity: Rarity, edition: Edition): number {
  return DUPLICATE_VALUE[edition][rarity] ?? 0;
}

export const LOGIN_REWARDS = [50, 75, 75, 100, 100, 150, 250] as const;
export const DAILY_MISSION_REWARD = 100;
export const DAILY_MISSION_COUNT = 3;
export const MATCH_PARTICIPATION = { fc: 20, perDay: 5 } as const;
export const MATCH_VICTORY = { fc: 10, perDay: 3 } as const;

export const MISSION_DEFS: Record<MissionKind, { title: string; description: string; target: number }> = {
  openPack: { title: 'Open an Anime Pack', description: 'Open 1 Anime Pack in Card Collector.', target: 1 },
  completeMatches: { title: 'Complete two matches', description: 'Finish 2 Classic Draft or Team Draft matches.', target: 2 },
  newCards: { title: 'Obtain three new cards', description: 'Get 3 card editions you did not own before.', target: 3 },
  winMatch: { title: 'Win a match', description: 'Win 1 Classic Draft or Team Draft match.', target: 1 },
  completeTournament: { title: 'Complete a tournament', description: 'Run a Tournament to the end.', target: 1 },
  classicMatch: { title: 'Play Classic Draft', description: 'Finish 1 Classic Draft match.', target: 1 },
  teamMatch: { title: 'Play Team Draft', description: 'Finish 1 Team Draft match.', target: 1 },
};
export const MISSION_KINDS = Object.keys(MISSION_DEFS) as MissionKind[];

export const WEEKLY_DEFS: Record<WeeklyKind, { title: string; description: string; target: number; reward: number }> = {
  matches: { title: 'Complete 10 matches', description: 'Classic Draft or Team Draft matches this week.', target: 10, reward: 200 },
  packs: { title: 'Open 10 packs', description: 'Anime Packs opened this week.', target: 10, reward: 200 },
  cards: { title: 'Obtain 15 cards', description: 'Cards obtained from packs this week (duplicates included).', target: 15, reward: 200 },
  bonus: { title: 'Complete all weekly missions', description: 'Bonus for completing the three weekly missions.', target: 3, reward: 200 },
};
export const WEEKLY_KINDS: readonly WeeklyKind[] = ['matches', 'packs', 'cards', 'bonus'];

export const ACHIEVEMENT_DEFS: Record<AchievementId, { title: string; description: string; target: number; reward: number; counter: keyof Counters }> = {
  firstPack: { title: 'Open your first pack', description: 'Open 1 Anime Pack.', target: 1, reward: 100, counter: 'packsOpened' },
  collect50: { title: 'Collect 50 cards', description: 'Obtain 50 cards from packs (duplicates included).', target: 50, reward: 250, counter: 'cardsObtained' },
  collect100: { title: 'Collect 100 cards', description: 'Obtain 100 cards from packs (duplicates included).', target: 100, reward: 500, counter: 'cardsObtained' },
  firstLegendary: { title: 'Obtain your first Legendary', description: 'Obtain a Legendary card (or any higher rarity).', target: 1, reward: 300, counter: 'legendaryPlus' },
  matches10: { title: 'Complete 10 matches', description: 'Finish 10 Classic Draft or Team Draft matches.', target: 10, reward: 150, counter: 'matchesCompleted' },
  firstSecret: { title: 'Obtain a Secret card', description: 'Obtain a Secret card (or an Omniversal).', target: 1, reward: 1000, counter: 'secretPlus' },
};
export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENT_DEFS) as AchievementId[];

// ---------------------------------------------------------------- profile

export function emptyCounters(): Counters {
  return {
    packsOpened: 0, packsBought: 0, cardsObtained: 0, newCards: 0, legendaryPlus: 0, secretPlus: 0, omniversal: 0,
    matchesCompleted: 0, classicMatches: 0, teamMatches: 0, wins: 0, losses: 0, draws: 0, tournaments: 0, tournamentWins: 0,
    fcEarned: 0, fcSpent: 0, duplicatesConverted: 0,
  };
}

export function newPlayer(id: PlayerId, name: string): PlayerProfile {
  return {
    id, name, fc: 0, unopenedPacks: 0, collection: {}, packs: [], pendingReveal: null, pity: emptyPity(),
    daily: { day: '', missions: [], usedKinds: [], matchPaid: 0, winsPaid: 0 },
    weekly: { week: '', matches: 0, packs: 0, cards: 0, claimed: { matches: false, packs: false, cards: false, bonus: false } },
    login: { lastDay: null, cycleDay: 0, claims: 0 },
    achievements: {}, counters: emptyCounters(), matches: [], tournaments: [], ledger: [], version: PROFILE_VERSION,
  };
}

/** Fill in fields missing from older saves without touching existing data. */
export function normalizePlayer(raw: Partial<PlayerProfile> & { id: PlayerId }): PlayerProfile {
  const base = newPlayer(raw.id, raw.name ?? (raw.id === 'p1' ? 'Player 1' : 'Player 2'));
  const p = { ...base, ...raw } as PlayerProfile;
  p.counters = { ...emptyCounters(), ...(raw.counters ?? {}) };
  p.pity = { ...emptyPity(), ...(raw.pity ?? {}) };
  p.daily = { ...base.daily, ...(raw.daily ?? {}) };
  p.weekly = { ...base.weekly, ...(raw.weekly ?? {}), claimed: { ...base.weekly.claimed, ...(raw.weekly?.claimed ?? {}) } };
  p.login = { ...base.login, ...(raw.login ?? {}) };
  for (const k of ['packs', 'matches', 'tournaments', 'ledger'] as const) if (!Array.isArray(p[k])) (p as any)[k] = [];
  if (!p.collection || typeof p.collection !== 'object') p.collection = {};
  if (!p.achievements || typeof p.achievements !== 'object') p.achievements = {};
  return p;
}

function pushCapped<T>(arr: T[], item: T, cap: number): void {
  arr.unshift(item);
  if (arr.length > cap) arr.length = cap;
}

export function credit(p: PlayerProfile, amount: number, reason: string, now: number): void {
  if (amount <= 0) return;
  p.fc += amount;
  p.counters.fcEarned += amount;
  pushCapped(p.ledger, { at: now, amount, reason, balance: p.fc }, CAP.ledger);
}

export function debit(p: PlayerProfile, amount: number, reason: string, now: number): void {
  if (amount > p.fc) throw new EconomyError(`Not enough FC: ${reason} costs ${amount} FC, balance is ${p.fc} FC`);
  p.fc -= amount;
  p.counters.fcSpent += amount;
  pushCapped(p.ledger, { at: now, amount: -amount, reason, balance: p.fc }, CAP.ledger);
}

export class EconomyError extends Error {}

// ---------------------------------------------------------------- content-aware missions

export interface ContentStatus {
  classic: boolean;
  tournament: boolean;
  team: boolean;
  /** Packs can be opened (every rarity has at least one valid card). */
  collector: boolean;
  /** Collectible editions in the database (normal + available alternative arts). */
  collectibleKeys: readonly string[];
}

export function missingCount(p: PlayerProfile, content: ContentStatus): number {
  let n = 0;
  for (const k of content.collectibleKeys) if (!p.collection[k]) n++;
  return n;
}

/** Content-only validity: could this mission be completed with the current game content? */
export function missionPossible(kind: MissionKind, p: PlayerProfile, c: ContentStatus): boolean {
  switch (kind) {
    case 'openPack': return c.collector;
    case 'newCards': return c.collector && missingCount(p, c) >= 3;
    case 'completeMatches':
    case 'winMatch': return c.classic || c.team;
    case 'completeTournament': return c.tournament;
    case 'classicMatch': return c.classic;
    case 'teamMatch': return c.team;
  }
}

/** Validity for assigning a new mission: possible, and pack missions only when the player can open a pack now. */
export function missionAssignable(kind: MissionKind, p: PlayerProfile, c: ContentStatus): boolean {
  if (!missionPossible(kind, p, c)) return false;
  if (kind === 'openPack' || kind === 'newCards') return p.unopenedPacks > 0 || p.fc >= PACK_PRICE;
  return true;
}

/** Roll the daily/weekly periods over and keep the 3 daily missions valid. Returns true if anything changed. */
export function refreshPeriodic(p: PlayerProfile, day: string, week: string, content: ContentStatus, rng: Rng): boolean {
  let changed = false;
  if (p.daily.day !== day) {
    p.daily = { day, missions: [], usedKinds: [], matchPaid: 0, winsPaid: 0 };
    changed = true;
  }
  if (p.weekly.week !== week) {
    p.weekly = { week, matches: 0, packs: 0, cards: 0, claimed: { matches: false, packs: false, cards: false, bonus: false } };
    changed = true;
  }
  // replace missions that became impossible (content removed); completed ones stay claimable
  const before = p.daily.missions.length;
  p.daily.missions = p.daily.missions.filter((m) => m.claimed || m.progress >= m.target || missionPossible(m.kind, p, content));
  if (p.daily.missions.length !== before) changed = true;
  while (p.daily.missions.length < DAILY_MISSION_COUNT) {
    const options = MISSION_KINDS.filter((k) => !p.daily.usedKinds.includes(k) && missionAssignable(k, p, content));
    if (!options.length) break;
    const kind = pick(rng, options);
    p.daily.usedKinds.push(kind);
    p.daily.missions.push({ id: uid('m'), kind, target: MISSION_DEFS[kind].target, progress: 0, reward: DAILY_MISSION_REWARD, claimed: false });
    changed = true;
  }
  return changed;
}

function progressMission(p: PlayerProfile, kind: MissionKind, by: number): void {
  for (const m of p.daily.missions) if (m.kind === kind && !m.claimed) m.progress = Math.min(m.target, m.progress + by);
}

export function claimMission(p: PlayerProfile, id: string, now: number): number {
  const m = p.daily.missions.find((x) => x.id === id);
  if (!m) throw new EconomyError('Mission not found');
  if (m.claimed) throw new EconomyError('Reward already claimed');
  if (m.progress < m.target) throw new EconomyError('Mission not completed yet');
  m.claimed = true;
  credit(p, m.reward, `Daily mission: ${MISSION_DEFS[m.kind].title}`, now);
  return m.reward;
}

export function weeklyProgress(p: PlayerProfile, kind: WeeklyKind): number {
  if (kind === 'bonus') return (['matches', 'packs', 'cards'] as const).filter((k) => weeklyProgress(p, k) >= WEEKLY_DEFS[k].target).length;
  return Math.min(WEEKLY_DEFS[kind].target, p.weekly[kind]);
}

export function claimWeekly(p: PlayerProfile, kind: WeeklyKind, now: number): number {
  const def = WEEKLY_DEFS[kind];
  if (p.weekly.claimed[kind]) throw new EconomyError('Reward already claimed');
  if (weeklyProgress(p, kind) < def.target) throw new EconomyError('Weekly mission not completed yet');
  p.weekly.claimed[kind] = true;
  credit(p, def.reward, `Weekly mission: ${def.title}`, now);
  return def.reward;
}

// ---------------------------------------------------------------- login

export function loginAvailable(p: PlayerProfile, day: string): boolean {
  return p.login.lastDay !== day;
}

/** Day (1–7) of the cycle the next claim pays. */
export function nextLoginDay(p: PlayerProfile): number {
  return (p.login.claims % LOGIN_REWARDS.length) + 1;
}

export function claimLogin(p: PlayerProfile, day: string, now: number): number {
  if (!loginAvailable(p, day)) throw new EconomyError("Today's login reward was already claimed");
  const d = nextLoginDay(p);
  const reward = LOGIN_REWARDS[d - 1]!;
  p.login = { lastDay: day, cycleDay: d, claims: p.login.claims + 1 };
  credit(p, reward, `Daily login — day ${d}`, now);
  return reward;
}

// ---------------------------------------------------------------- achievements

export function achievementProgress(p: PlayerProfile, id: AchievementId): number {
  const d = ACHIEVEMENT_DEFS[id];
  return Math.min(d.target, p.counters[d.counter]);
}

export type AchievementState = 'locked' | 'completed' | 'claimed';
export function achievementState(p: PlayerProfile, id: AchievementId): AchievementState {
  if (p.achievements[id] !== undefined) return 'claimed';
  return achievementProgress(p, id) >= ACHIEVEMENT_DEFS[id].target ? 'completed' : 'locked';
}

export function claimAchievement(p: PlayerProfile, id: AchievementId, now: number): number {
  const st = achievementState(p, id);
  if (st === 'claimed') throw new EconomyError('Achievement reward already claimed');
  if (st === 'locked') throw new EconomyError('Achievement not completed yet');
  p.achievements[id] = now;
  credit(p, ACHIEVEMENT_DEFS[id].reward, `Achievement: ${ACHIEVEMENT_DEFS[id].title}`, now);
  return ACHIEVEMENT_DEFS[id].reward;
}

export function claimableCount(p: PlayerProfile, day: string): number {
  let n = loginAvailable(p, day) ? 1 : 0;
  n += p.daily.missions.filter((m) => !m.claimed && m.progress >= m.target).length;
  n += WEEKLY_KINDS.filter((k) => !p.weekly.claimed[k] && weeklyProgress(p, k) >= WEEKLY_DEFS[k].target).length;
  n += ACHIEVEMENT_IDS.filter((a) => achievementState(p, a) === 'completed').length;
  return n;
}

// ---------------------------------------------------------------- packs

export function buyPacks(p: PlayerProfile, count: number, now: number): void {
  if (!Number.isInteger(count) || count < 1) throw new EconomyError('Invalid quantity');
  debit(p, PACK_PRICE * count, count === 1 ? 'Shop: Anime Pack' : `Shop: ${count} Anime Packs`, now);
  p.unopenedPacks += count;
  p.counters.packsBought += count;
}

/**
 * Apply an opened pack: every card goes into the collection immediately, with the pity counters, history,
 * counters and mission progress — all in the same profile write.
 */
export function applyPack(p: PlayerProfile, roll: PackRoll, now: number): PackRecord {
  if (p.unopenedPacks < 1) throw new EconomyError('No unopened Anime Pack');
  p.unopenedPacks -= 1;
  const cards: PulledCard[] = [];
  let newCount = 0;
  for (const c of roll.cards) {
    const key = cardKey(c.entry.id, c.edition);
    const owned = p.collection[key];
    const isNew = !owned;
    if (owned) {
      owned.qty += 1;
      owned.obtained += 1;
      owned.lastAt = now;
    } else {
      p.collection[key] = { qty: 1, firstAt: now, lastAt: now, obtained: 1 };
      newCount++;
    }
    p.counters.cardsObtained++;
    if (atLeast(c.rarity, 'legendary')) p.counters.legendaryPlus++;
    if (atLeast(c.rarity, 'secret')) p.counters.secretPlus++;
    if (c.rarity === 'omniversal') p.counters.omniversal++;
    cards.push({ entryId: c.entry.id, name: c.entry.name, rarity: c.rarity, edition: c.edition, isNew, pity: c.pity, qtyAfter: p.collection[key]!.qty });
  }
  p.counters.packsOpened++;
  p.counters.newCards += newCount;
  p.pity = { ...roll.pityAfter };
  const rec: PackRecord = { id: uid('pk'), at: now, cards, pityApplied: roll.pityApplied };
  pushCapped(p.packs, rec, CAP.packs);
  p.pendingReveal = rec.id;
  progressMission(p, 'openPack', 1);
  progressMission(p, 'newCards', newCount);
  p.weekly.packs += 1;
  p.weekly.cards += cards.length;
  return rec;
}

export function convertDuplicates(p: PlayerProfile, entryId: string, edition: Edition, rarity: Rarity, count: number, cardName: string, now: number): number {
  const key = cardKey(entryId, edition);
  const owned = p.collection[key];
  if (!owned) throw new EconomyError('You do not own this card');
  if (!Number.isInteger(count) || count < 1) throw new EconomyError('Invalid quantity');
  if (owned.qty - count < 1) throw new EconomyError('You must keep at least one copy');
  const value = duplicateValue(rarity, edition);
  if (value <= 0) throw new EconomyError('This edition has no conversion value');
  owned.qty -= count;
  p.counters.duplicatesConverted += count;
  const total = value * count;
  credit(p, total, `Converted ${count}× ${cardName} (${edition === 'alt' ? 'Alt Art' : 'Normal Art'})`, now);
  return total;
}

// ---------------------------------------------------------------- matches & tournaments

export interface MatchRewardResult {
  participation: number;
  victory: number;
}

/** Records a completed Classic/Team Draft match for one player and pays the daily match rewards. */
export function applyMatch(p: PlayerProfile, mode: MatchMode, outcome: Outcome, score: string, opponent: string, now: number): MatchRewardResult {
  const r: MatchRewardResult = { participation: 0, victory: 0 };
  if (p.daily.matchPaid < MATCH_PARTICIPATION.perDay) {
    p.daily.matchPaid++;
    r.participation = MATCH_PARTICIPATION.fc;
    credit(p, r.participation, `${mode === 'classic' ? 'Classic Draft' : 'Team Draft'} match completed`, now);
  }
  if (outcome === 'win' && p.daily.winsPaid < MATCH_VICTORY.perDay) {
    p.daily.winsPaid++;
    r.victory = MATCH_VICTORY.fc;
    credit(p, r.victory, `${mode === 'classic' ? 'Classic Draft' : 'Team Draft'} victory bonus`, now);
  }
  p.counters.matchesCompleted++;
  if (mode === 'classic') p.counters.classicMatches++;
  else p.counters.teamMatches++;
  if (outcome === 'win') p.counters.wins++;
  else if (outcome === 'loss') p.counters.losses++;
  else p.counters.draws++;
  progressMission(p, 'completeMatches', 1);
  if (outcome === 'win') progressMission(p, 'winMatch', 1);
  progressMission(p, mode === 'classic' ? 'classicMatch' : 'teamMatch', 1);
  p.weekly.matches += 1;
  const rec: MatchRecord = { id: uid('mt'), at: now, mode, outcome, score, opponent, fc: r.participation + r.victory };
  pushCapped(p.matches, rec, CAP.matches);
  return r;
}

export function applyTournament(p: PlayerProfile, rec: TournamentRecord, now: number): void {
  if (p.tournaments.some((t) => t.id === rec.id)) throw new EconomyError('Tournament reward already granted');
  pushCapped(p.tournaments, rec, CAP.tournaments);
  p.counters.tournaments++;
  if (rec.placement === 'champion') p.counters.tournamentWins++;
  progressMission(p, 'completeTournament', 1);
  credit(p, rec.reward, `Tournament (${rec.size}) — ${rec.character}: ${rec.placement}`, now);
}
