/**
 * Entry validation. Only valid entries are used by the game modes; invalid ones stay in the database
 * (nothing is ever deleted automatically) and the manager shows exactly what is missing.
 */
import {
  ALT_RARITIES, CLASSIC_STATS, CLASSIC_STAT_LABEL, ROLES, ROLE_LABEL, RARITY_LABEL,
  type AnyEntry, type ClassicEntry, type CollectorEntry, type MediaRef, type Mode, type TeamEntry, type TournamentEntry,
  type SpecialEffect,
} from './types';

export type MediaLookup = (id: string) => { kind: 'image' | 'video' } | undefined;

export interface Issue {
  field: string;
  message: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkMedia(ref: MediaRef | null, kind: 'image' | 'video', field: string, label: string, required: boolean, media: MediaLookup, out: Issue[]): void {
  if (!ref) {
    if (required) out.push({ field, message: `${label} is required` });
    return;
  }
  const m = media(ref.id);
  if (!m) out.push({ field, message: `${label} file is missing from storage — replace it` });
  else if (m.kind !== kind) out.push({ field, message: `${label} must be ${kind === 'image' ? 'an image' : 'a video'}` });
}

function checkName(e: AnyEntry, out: Issue[]): void {
  if (!e.name || !e.name.trim()) out.push({ field: 'name', message: 'Character name is required' });
}

export function effectIssues(fx: SpecialEffect, out: Issue[] = []): Issue[] {
  if (!fx.name.trim()) out.push({ field: 'effect', message: 'Special Effect needs a name' });
  const c = fx.condition;
  if (c.type === 'allyPresent' || c.type === 'enemyPresent') {
    if (!c.entryId) out.push({ field: 'effect', message: 'Special Effect condition needs a character' });
  }
  if (c.type === 'roleValueAtLeast' && !isNum(c.value)) out.push({ field: 'effect', message: 'Special Effect threshold must be a number' });
  const i = fx.impact;
  const n = 'amount' in i ? i.amount : i.percent;
  if (!isNum(n)) out.push({ field: 'effect', message: 'Special Effect impact must be a number' });
  return out;
}

export function validateClassic(e: ClassicEntry, media: MediaLookup): Issue[] {
  const out: Issue[] = [];
  checkName(e, out);
  checkMedia(e.image, 'image', 'image', 'Character image', true, media, out);
  for (const s of CLASSIC_STATS) if (!isNum(e[s])) out.push({ field: s, message: `${CLASSIC_STAT_LABEL[s]} is required` });
  checkMedia(e.cutscene, 'video', 'cutscene', 'Cutscene', false, media, out);
  return out;
}

export function validateTournament(e: TournamentEntry, media: MediaLookup): Issue[] {
  const out: Issue[] = [];
  checkName(e, out);
  checkMedia(e.image, 'image', 'image', 'Character image', true, media, out);
  if (!isNum(e.value)) out.push({ field: 'value', message: 'Value is required' });
  return out;
}

export function validateTeam(e: TeamEntry, media: MediaLookup): Issue[] {
  const out: Issue[] = [];
  checkName(e, out);
  checkMedia(e.image, 'image', 'image', 'Character image', true, media, out);
  for (const r of ROLES) if (!isNum(e.roles[r])) out.push({ field: r, message: `${ROLE_LABEL[r]} value is required` });
  if (e.effect) effectIssues(e.effect, out);
  checkMedia(e.cutscene, 'video', 'cutscene', 'Cutscene', false, media, out);
  return out;
}

export function validateCollector(e: CollectorEntry, media: MediaLookup): Issue[] {
  const out: Issue[] = [];
  checkName(e, out);
  if (!e.rarity) out.push({ field: 'rarity', message: 'Rarity is required' });
  checkMedia(e.normalArt, 'image', 'normalArt', 'Normal Art image', true, media, out);
  if (e.altArt) {
    if (e.rarity && !ALT_RARITIES.includes(e.rarity)) {
      out.push({ field: 'altArt', message: `${RARITY_LABEL[e.rarity]} cards cannot have an Alternative Art (only Legendary, Mythic, Secret and Omniversal) — remove it` });
    } else checkMedia(e.altArt, 'image', 'altArt', 'Alternative Art image', false, media, out);
  }
  checkMedia(e.cutscene, 'video', 'cutscene', 'Cutscene', e.rarity === 'omniversal', media, out);
  if (e.rarity === 'omniversal' && !e.cutscene) {
    // message already added by checkMedia; make it explicit
    const i = out.find((x) => x.field === 'cutscene');
    if (i) i.message = 'Omniversal cards require a cutscene (for both Normal Art and Alternative Art)';
  }
  return out;
}

export function validate(mode: Mode, e: AnyEntry, media: MediaLookup): Issue[] {
  switch (mode) {
    case 'classic': return validateClassic(e as ClassicEntry, media);
    case 'tournament': return validateTournament(e as TournamentEntry, media);
    case 'team': return validateTeam(e as TeamEntry, media);
    case 'collector': return validateCollector(e as CollectorEntry, media);
  }
}

/** Minimum number of valid entries each mode needs to be playable. */
export const MIN_ENTRIES: Record<Mode, number> = { classic: 2, tournament: 2, team: 10, collector: 1 };
