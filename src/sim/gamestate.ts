/** Persistent progression state (D12) + pure (de)serialization and the export/import text code. */
import type { Content } from '../core/content';
import type { TimeOfDay } from '../core/types';

export interface CharacterLook {
  name: string;
  build: number; // 0..1 slender..broad
  height: number; // 0..1
  skin: number; // palette index
  hair: number; // style index
  hairColor: number;
  eyes: number;
  cloak: number;
}

export interface GameStateData {
  version: number;
  slot: number;
  created: number;
  updated: number;
  playtime: number;
  character: CharacterLook;
  /** Encounter ids completed (lucifero_1 counts once either branch is taken). */
  defeated: string[];
  weapons: string[];
  equipped: (string | null)[];
  activeSlot: number;
  forms: string[];
  equippedForm: string;
  lastAltar: string;
  visitedAltars: string[];
  zone: string;
  timeOfDay: TimeOfDay;
  luciferoChoice: 'fought' | 'begged' | null;
  items: string[];
  reperti: string[];
  voceHeard: string[];
  vistas: string[];
  ngCycle: number;
  flags: Record<string, string | number | boolean>;
  /** Boss id -> times of day it was defeated at (collections). */
  todDefeats: Record<string, TimeOfDay[]>;
  /** Challenge id -> boss ids completed in the Specchio dei Ricordi. */
  challenges: Record<string, string[]>;
  gameCompleted: boolean;
  deaths: number;
  rng: number;
}

export const SAVE_VERSION = 1;

export function defaultCharacter(): CharacterLook {
  return { name: 'Portatore', build: 0.45, height: 0.5, skin: 2, hair: 1, hairColor: 0, eyes: 0, cloak: 0 };
}

export function newGameState(c: Content, character: CharacterLook, slot = 0): GameStateData {
  const p = c.bundle.progression;
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    slot,
    created: now,
    updated: now,
    playtime: 0,
    character,
    defeated: [],
    weapons: ['lama_della_culla'],
    equipped: ['lama_della_culla', null, null],
    activeSlot: 0,
    forms: ['prato_lunare'],
    equippedForm: 'prato_lunare',
    lastAltar: p.start_altar,
    visitedAltars: [p.start_altar],
    zone: p.start_zone,
    timeOfDay: 'tramonto',
    luciferoChoice: null,
    items: [],
    reperti: [],
    voceHeard: [],
    vistas: [],
    ngCycle: 0,
    flags: {},
    todDefeats: {},
    challenges: {},
    gameCompleted: false,
    deaths: 0,
    rng: (now ^ 0x5eed) >>> 0,
  };
}

/** Start the Ciclo dell'Alba (New Game+): weapons and Forms carry over; story restarts. */
export function newGamePlus(c: Content, prev: GameStateData): GameStateData {
  const s = newGameState(c, prev.character, prev.slot);
  s.ngCycle = prev.ngCycle + 1;
  s.weapons = [...prev.weapons];
  s.forms = [...prev.forms];
  s.equippedForm = prev.equippedForm;
  s.equipped = [...prev.equipped];
  s.todDefeats = prev.todDefeats;
  s.challenges = prev.challenges;
  s.reperti = [...prev.reperti];
  s.vistas = [...prev.vistas];
  s.created = prev.created;
  s.playtime = prev.playtime;
  s.flags = { ng_previous_choice: prev.luciferoChoice ?? '' };
  s.timeOfDay = 'alba';
  return s;
}

export function isDefeated(s: GameStateData, id: string): boolean {
  return s.defeated.includes(id);
}

/** Next encounter in the fixed order that is not completed. */
export function nextEncounter(c: Content, s: GameStateData): string | null {
  for (const b of c.bosses) if (!s.defeated.includes(b.id)) return b.id;
  return null;
}

/** Sky shades gained: one per principal boss defeated (Lucifero I is a narrative defeat and does not count).
 * In the Ciclo dell'Alba (New Game+) the sky already starts golden. */
export function skyShade(c: Content, s: GameStateData): number {
  let n = 0;
  for (const b of c.bosses) if (b.brightens_sky && s.defeated.includes(b.id)) n++;
  if (s.ngCycle > 0) n = 7;
  return Math.min(7, n);
}

/**
 * Portatore theme melodic notes: one per principal boss defeated (Lucifero I excluded), so the seven notes are heard in full
 * only in the final fight (after Ouranthos's trial). Before the first note the theme exists as its heartbeat rhythm.
 */
export function themeNotes(c: Content, s: GameStateData): number {
  let n = 0;
  for (const b of c.bosses) if (b.class === 'principal' && b.id !== 'lucifero_1' && s.defeated.includes(b.id)) n++;
  return Math.min(7, n);
}

export function playerBaseScale(c: Content, s: GameStateData, zoneId: string): { scale: number; speed: number } {
  const b = c.balance.scale;
  const z = c.zone(zoneId);
  const ascended = s.defeated.includes('uruk');
  if (z.player_scale && !ascended) return { scale: z.player_scale, speed: z.player_speed_mult ?? b.garden_speed };
  return { scale: ascended ? b.ascended : 1, speed: 1 };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Serialization + text code                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

export function serialize(s: GameStateData): string {
  return JSON.stringify(s);
}

export function deserialize(text: string): GameStateData {
  const raw = JSON.parse(text) as Partial<GameStateData>;
  return migrate(raw);
}

export function migrate(raw: Partial<GameStateData>): GameStateData {
  if (typeof raw !== 'object' || raw === null) throw new Error('save: not an object');
  if (!Array.isArray(raw.defeated) || !Array.isArray(raw.weapons)) throw new Error('save: missing fields');
  const base: GameStateData = {
    version: SAVE_VERSION, slot: 0, created: 0, updated: 0, playtime: 0, character: defaultCharacter(), defeated: [], weapons: ['lama_della_culla'],
    equipped: ['lama_della_culla', null, null], activeSlot: 0, forms: ['prato_lunare'], equippedForm: 'prato_lunare', lastAltar: '', visitedAltars: [],
    zone: '', timeOfDay: 'tramonto', luciferoChoice: null, items: [], reperti: [], voceHeard: [], vistas: [], ngCycle: 0, flags: {}, todDefeats: {},
    challenges: {}, gameCompleted: false, deaths: 0, rng: 1,
  };
  const s = { ...base, ...raw, character: { ...base.character, ...(raw.character ?? {}) } } as GameStateData;
  while (s.equipped.length < 3) s.equipped.push(null);
  s.version = SAVE_VERSION;
  return s;
}

function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Copyable save code: SM1.<checksum>.<base64 json> */
export function exportCode(s: GameStateData): string {
  const json = serialize(s);
  return `SM1.${checksum(json)}.${toBase64(json)}`;
}

export function importCode(code: string): GameStateData {
  const clean = code.trim().replace(/\s+/g, '');
  const parts = clean.split('.');
  if (parts.length !== 3 || parts[0] !== 'SM1') throw new Error('save code: bad format');
  const json = fromBase64(parts[2]);
  if (checksum(json) !== parts[1]) throw new Error('save code: checksum mismatch');
  return deserialize(json);
}
