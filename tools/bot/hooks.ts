/**
 * Per-boss bot hooks for scripted mechanics. Each Act adds its hooks in tools/bot/hooks/<boss>.ts and registers them here
 * through the generated index (tools/bot/hooks/index.ts lists every file).
 */
import type { Vec3 } from '../../src/core/math';
import type { Sim } from '../../src/sim/sim';
import type { PlayerInput } from '../../src/sim/types';
import type { Bot } from './bot';
import { BOT_HOOKS } from './hooks/index';

export interface BotHook {
  /** Choose a loadout (weapon ids) for this fight. */
  loadout?(sim: Sim): (string | null)[];
  form?(sim: Sim): string;
  before?(sim: Sim, bot: Bot): void;
  /** Return a full input to override the generic logic this tick (or null to continue). */
  input?(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null;
  /** Which choice to pick in sequence menus (index). */
  choice?(sim: Sim, keys: string[]): number;
  /** Custom target point (e.g. weak point). */
  target?(sim: Sim, bot: Bot): { pos: Vec3; radius: number } | null;
  /** Encounter considered complete (scripted fights). */
  done?(sim: Sim): boolean;
  countsAsWin?(sim: Sim): boolean;
}

export const HOOKS: Record<string, BotHook> = BOT_HOOKS;
