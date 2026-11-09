/** Data model shared by every system. Each mode has its own independent database (its own IndexedDB object store). */

export type Mode = 'classic' | 'tournament' | 'team' | 'collector';
export const MODES: readonly Mode[] = ['classic', 'tournament', 'team', 'collector'];
export const MODE_LABEL: Record<Mode, string> = {
  classic: 'Classic Draft',
  tournament: 'Tournament',
  team: 'Team Draft',
  collector: 'Card Collector',
};

export type PlayerId = 'p1' | 'p2';
export const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
export const other = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');

// ---------------------------------------------------------------- media

export type MediaKind = 'image' | 'video';
export type Fit = 'contain' | 'cover';

/** Reference from a database entry to a stored media file, with how the owner wants it framed. */
export interface MediaRef {
  id: string;
  /** contain = show the whole image (default), cover = fill the frame (cropped around the focal point). */
  fit?: Fit;
  /** Focal point in percent (0–100), used when fit = cover. */
  x?: number;
  y?: number;
}

export interface MediaMeta {
  id: string;
  kind: MediaKind;
  mime: string;
  name: string;
  size: number;
  width: number;
  height: number;
  /** Seconds (videos). */
  duration: number;
  createdAt: number;
  /** A downscaled preview exists (image thumbnail or video poster frame). */
  hasThumb: boolean;
  /** Animated images (GIF/APNG/WebP) always display the original. */
  animated?: boolean;
  /** The browser that imported the file could not play/decode it. */
  playable?: boolean;
}

// ---------------------------------------------------------------- database entries

interface BaseEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClassicEntry extends BaseEntry {
  image: MediaRef | null;
  offense: number | null;
  defense: number | null;
  hax: number | null;
  iq: number | null;
  cutscene: MediaRef | null;
}
export type ClassicStat = 'offense' | 'defense' | 'hax' | 'iq';
export const CLASSIC_STATS: readonly ClassicStat[] = ['offense', 'defense', 'hax', 'iq'];
export const CLASSIC_STAT_LABEL: Record<ClassicStat, string> = { offense: 'Offense', defense: 'Defense', hax: 'Hax', iq: 'IQ' };

export interface TournamentEntry extends BaseEntry {
  image: MediaRef | null;
  value: number | null;
}

export type Role = 'captain' | 'tank' | 'hax' | 'planner' | 'support';
export const ROLES: readonly Role[] = ['captain', 'tank', 'hax', 'planner', 'support'];
export const ROLE_LABEL: Record<Role, string> = { captain: 'Captain', tank: 'Tank', hax: 'Hax User', planner: 'Planner', support: 'Support' };

export type EffectCondition =
  | { type: 'always' }
  | { type: 'role'; role: Role }
  | { type: 'allyPresent'; entryId: string }
  | { type: 'enemyPresent'; entryId: string }
  | { type: 'roleValueAtLeast'; value: number }
  | { type: 'underdog' };

export type EffectImpact =
  | { type: 'flatSelf'; amount: number }
  | { type: 'percentSelf'; percent: number }
  | { type: 'percentRole'; role: Role; percent: number }
  | { type: 'percentTeam'; percent: number }
  | { type: 'flatEnemy'; amount: number }
  | { type: 'percentEnemy'; percent: number };

export interface SpecialEffect {
  name: string;
  description: string;
  condition: EffectCondition;
  impact: EffectImpact;
}

export interface TeamEntry extends BaseEntry {
  image: MediaRef | null;
  roles: Record<Role, number | null>;
  effect: SpecialEffect | null;
  cutscene: MediaRef | null;
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret' | 'omniversal';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'secret', 'omniversal'];
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', secret: 'Secret', omniversal: 'Omniversal',
};
export const rarityRank = (r: Rarity): number => RARITIES.indexOf(r) + 1;

export type Edition = 'normal' | 'alt';
export const EDITION_LABEL: Record<Edition, string> = { normal: 'Normal Art', alt: 'Alternative Art' };
/** Rarities that can have an Alternative Art edition. */
export const ALT_RARITIES: readonly Rarity[] = ['legendary', 'mythic', 'secret', 'omniversal'];

export interface CollectorEntry extends BaseEntry {
  rarity: Rarity | null;
  normalArt: MediaRef | null;
  altArt: MediaRef | null;
  description: string;
  cutscene: MediaRef | null;
}

export type AnyEntry = ClassicEntry | TournamentEntry | TeamEntry | CollectorEntry;
export interface EntryByMode {
  classic: ClassicEntry;
  tournament: TournamentEntry;
  team: TeamEntry;
  collector: CollectorEntry;
}

// ---------------------------------------------------------------- players

export interface OwnedCard {
  qty: number;
  firstAt: number;
  lastAt: number;
  /** Copies ever obtained (never decreases with conversions). */
  obtained: number;
}

export interface PulledCard {
  entryId: string;
  name: string;
  rarity: Rarity;
  edition: Edition;
  isNew: boolean;
  /** This card's rarity was raised by the Pity System. */
  pity: boolean;
  /** Copies owned right after this card was added. */
  qtyAfter: number;
}

export interface PackRecord {
  id: string;
  at: number;
  cards: PulledCard[];
  pityApplied: Rarity | null;
}

export type MissionKind = 'openPack' | 'completeMatches' | 'newCards' | 'winMatch' | 'completeTournament' | 'classicMatch' | 'teamMatch';

export interface Mission {
  id: string;
  kind: MissionKind;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface PityState {
  sinceLegendary: number;
  sinceMythic: number;
  sinceSecret: number;
}

export type WeeklyKind = 'matches' | 'packs' | 'cards' | 'bonus';

export interface LedgerEntry {
  at: number;
  amount: number;
  reason: string;
  balance: number;
}

export type MatchMode = 'classic' | 'team';
export type Outcome = 'win' | 'loss' | 'draw';

export interface MatchRecord {
  id: string;
  at: number;
  mode: MatchMode;
  outcome: Outcome;
  score: string;
  opponent: string;
  fc: number;
}

export type Placement = 'champion' | 'finalist' | 'semifinal' | 'intermediate' | 'early';

export interface TournamentRecord {
  id: string;
  at: number;
  size: number;
  character: string;
  placement: Placement;
  reward: number;
  champion: string;
}

export type AchievementId = 'firstPack' | 'collect50' | 'collect100' | 'firstLegendary' | 'matches10' | 'firstSecret';

export interface Counters {
  packsOpened: number;
  packsBought: number;
  cardsObtained: number;
  newCards: number;
  legendaryPlus: number;
  secretPlus: number;
  omniversal: number;
  matchesCompleted: number;
  classicMatches: number;
  teamMatches: number;
  wins: number;
  losses: number;
  draws: number;
  tournaments: number;
  tournamentWins: number;
  fcEarned: number;
  fcSpent: number;
  duplicatesConverted: number;
}

export interface PlayerProfile {
  id: PlayerId;
  name: string;
  fc: number;
  unopenedPacks: number;
  /** Key: `${entryId}|${edition}` — Normal Art and Alternative Art are separate collectibles. */
  collection: Record<string, OwnedCard>;
  packs: PackRecord[];
  /** Pack whose reveal animation has not been completed (its cards are already saved). */
  pendingReveal: string | null;
  pity: PityState;
  daily: { day: string; missions: Mission[]; usedKinds: MissionKind[]; matchPaid: number; winsPaid: number };
  weekly: { week: string; matches: number; packs: number; cards: number; claimed: Record<WeeklyKind, boolean> };
  login: { lastDay: string | null; cycleDay: number; claims: number };
  achievements: Partial<Record<AchievementId, number>>;
  counters: Counters;
  matches: MatchRecord[];
  tournaments: TournamentRecord[];
  ledger: LedgerEntry[];
  version: number;
}

export const cardKey = (entryId: string, edition: Edition): string => `${entryId}|${edition}`;

// ---------------------------------------------------------------- settings

export interface Settings {
  classicRounds: number;
  classicShowOwnStats: boolean;
  autoplayCutscenes: boolean;
  hideMissingNames: boolean;
  revealSpeed: number;
  sound: boolean;
  reduceMotion: boolean;
  portraits: { left: MediaRef | null; right: MediaRef | null };
  activePlayer: PlayerId;
}

export const DEFAULT_SETTINGS: Settings = {
  classicRounds: 5,
  classicShowOwnStats: true,
  autoplayCutscenes: false,
  hideMissingNames: false,
  revealSpeed: 1,
  sound: true,
  reduceMotion: false,
  portraits: { left: null, right: null },
  activePlayer: 'p1',
};
