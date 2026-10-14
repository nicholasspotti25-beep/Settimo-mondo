/**
 * The seven-note Portatore theme (C13, pure logic). sim.themeNotes() = principal bosses defeated (Lucifero I excluded), 0..7.
 * The theme always keeps its full heartbeat rhythm (C8: "a call like a heartbeat"): the first `count` positions sound as
 * melodic notes, the remaining ones as heartbeat pulses. 0 = heartbeat only; 7 (full melody) only in the final fight.
 */
import { parseMotif, type MotifNote } from './theory';
import type { InstrumentId, PortatoreSpec } from './data';

export interface PortatoreEvent {
  /** 0-based degree in 7-degree space (octave shifts already folded in as +-7). */
  deg: number;
  alter: number;
  steps: number;
  /** True = melodic note; false = heartbeat pulse. */
  melodic: boolean;
  /** Heartbeat accent: 'lub' (short) ~0.6, 'dub' (long) 1.0. */
  strength: number;
}

export const PORTATORE_LENGTH = 7;

export function clampThemeNotes(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(PORTATORE_LENGTH, Math.floor(n)));
}

/** Events for one statement of the theme with `count` melodic notes. Always seven events. */
export function portatoreEvents(notes: string | readonly MotifNote[], count: number): PortatoreEvent[] {
  const m = typeof notes === 'string' ? parseMotif(notes) : notes;
  const k = clampThemeNotes(count);
  const out: PortatoreEvent[] = [];
  const melodic = m.filter((n) => !n.rest);
  for (let i = 0; i < PORTATORE_LENGTH; i++) {
    const n = melodic[i % Math.max(1, melodic.length)];
    out.push({ deg: n.deg, alter: n.alter, steps: n.steps, melodic: i < k, strength: n.steps >= 3 ? 1 : 0.62 });
  }
  return out;
}

/** Total grid steps of one statement. */
export function portatoreSteps(ev: readonly PortatoreEvent[]): number {
  let s = 0;
  for (const e of ev) s += e.steps;
  return s;
}

/** Instrument family for an encounter's reprise (fallback: choir). */
export function portatoreFamily(spec: PortatoreSpec | null, encounterId: string | null | undefined, fallback: InstrumentId = 'choir'): InstrumentId {
  if (!spec || !encounterId) return fallback;
  return spec.families[encounterId] ?? fallback;
}

/** How many melodic notes a reprise after defeating a principal boss should sound (the newly gained note included). */
export function notesAfterVictory(notesBefore: number, wasPrincipal: boolean, isLuciferoOne: boolean): number {
  return clampThemeNotes(notesBefore + (wasPrincipal && !isLuciferoOne ? 1 : 0));
}
