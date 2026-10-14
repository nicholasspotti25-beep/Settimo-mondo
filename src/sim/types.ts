/** Runtime types shared by the simulation and its consumers (render, ui, audio read these; they never write). */
import type { Vec3 } from '../core/math';
import type { Element, HitFlag, StatusKind, TimeOfDay } from '../core/types';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Input                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export const Btn = {
  Light: 1 << 0,
  Heavy: 1 << 1,
  Dodge: 1 << 2,
  Guard: 1 << 3,
  Jump: 1 << 4,
  ArtPrima: 1 << 5,
  ArtSeconda: 1 << 6,
  Slot1: 1 << 7,
  Slot2: 1 << 8,
  Slot3: 1 << 9,
  Drink: 1 << 10,
  Metamondo: 1 << 11,
  Lock: 1 << 12,
  Interact: 1 << 13,
  Advance: 1 << 14,
} as const;
export type BtnBit = (typeof Btn)[keyof typeof Btn];

/** One simulation step of player intent. Movement is already in world space (the input layer applies camera yaw). */
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  /** Stick pushed to the outer ring. */
  sprint: boolean;
  guardHeld: boolean;
  /** Generic hold (Implora kneel, hold-choices). */
  holdHeld: boolean;
  /** Vertical intent while flying (Cielo Aureo): -1..1. */
  fly: number;
  /** Edge presses this step (bitmask of Btn). */
  presses: number;
  /** Camera yaw (for lock-on selection and attack direction without lock). */
  camYaw: number;
  /** Switch lock target: -1 left, +1 right. */
  lockSwitch: number;
  /** Direct lock pick from a double-tap raycast: actor runtime id and part index (-1 = body). */
  lockPick: { actor: number; part: number } | null;
  /** Choice index chosen in a sequence menu (-1 none). */
  choice: number;
}

export function emptyInput(): PlayerInput {
  return { moveX: 0, moveZ: 0, sprint: false, guardHeld: false, holdHeld: false, fly: 0, presses: 0, camYaw: 0, lockSwitch: 0, lockPick: null, choice: -1 };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Player                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export type PlayerStateId =
  | 'idle' | 'move' | 'jump' | 'light' | 'heavy' | 'running' | 'jumping' | 'guard' | 'parry' | 'dodge' | 'drink' | 'swap'
  | 'transizione' | 'art' | 'stagger' | 'knockdown' | 'guardbreak' | 'grace' | 'kneel' | 'dead' | 'climb' | 'interact' | 'locked'
  | 'grabbed' | 'ballista' | 'counter';

export type AttackKind = 'light' | 'heavy' | 'running' | 'jumping' | 'transizione' | 'grace' | 'art' | 'counter' | 'clone';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actors                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export type ActorKind = 'boss' | 'minion' | 'decoy' | 'clone' | 'ally' | 'echo';
export type Team = 'enemy' | 'player';
export type ActorStateId = 'idle' | 'move' | 'attack' | 'stagger' | 'spezzato' | 'transition' | 'dead' | 'scripted' | 'hidden' | 'intro';
export type AnimStage = 'idle' | 'move' | 'telegraph' | 'active' | 'recovery' | 'stagger' | 'spezzato' | 'transition' | 'dead' | 'scripted' | 'hidden' | 'intro';

/* ------------------------------------------------------------------------------------------------------------------ */
/* Damage                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface DamageEvent {
  source: number; // actor id, -1 = player, -2 = environment
  target: number; // actor id, -1 = player
  amount: number;
  poise: number;
  element: Element;
  flags: HitFlag[];
  pos: Vec3;
  /** Unique id of the hit instance (attack uid * 64 + window index) for one-hit-per-swing and perfect-dodge bookkeeping. */
  instance: number;
  part: number;
  kind?: AttackKind;
  status?: { kind: StatusKind; dur: number; power?: number };
  /** Raw boss damage multiplier (for Inversione reflection). */
  mult?: number;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Events (sim -> presentation)                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export type SimEvent =
  | { type: 'hit'; target: number; source: number; amount: number; pos: Vec3; heavy: boolean; part: number; element: Element; kind?: AttackKind; weak?: boolean }
  | { type: 'playerHurt'; amount: number; pos: Vec3; heavy: boolean; element: Element; knockdown: boolean }
  | { type: 'perfectDodge'; pos: Vec3 }
  | { type: 'dodgeAvoid'; pos: Vec3 }
  | { type: 'parry'; pos: Vec3; actor: number }
  | { type: 'block'; pos: Vec3; amount: number }
  | { type: 'guardBreak'; pos: Vec3 }
  | { type: 'swing'; weapon: string; swing: string; kind: AttackKind; anim: string }
  | { type: 'attackTelegraph'; actor: number; attack: string; red: boolean; duration: number }
  | { type: 'attackWillHit'; actor: number; attack: string; timeToImpact: number; red: boolean }
  | { type: 'attackActive'; actor: number; attack: string }
  | { type: 'bossPhase'; actor: number; boss: string; phase: number; phaseId: string; music?: string }
  | { type: 'spezzato'; actor: number; part: number; pos: Vec3 }
  | { type: 'grace'; actor: number; pos: Vec3; coop?: boolean }
  | { type: 'graceHit'; actor: number; amount: number; pos: Vec3 }
  | { type: 'bossDefeated'; boss: string; actor: number }
  | { type: 'partBroken'; actor: number; part: string; pos: Vec3 }
  | { type: 'partRegrown'; actor: number; part: string }
  | { type: 'playerDied' }
  | { type: 'respawn'; altar: string }
  | { type: 'drink'; healed: boolean; left: number }
  | { type: 'art'; weapon: string; art: string; effect: string; which: 'prima' | 'seconda'; vfx?: string }
  | { type: 'artHit'; art: string; pos: Vec3 }
  | { type: 'transizione'; from: string; to: string; id: string; anim: string }
  | { type: 'weaponSwap'; slot: number; weapon: string | null }
  | { type: 'metamondoStart'; form: string; forced: boolean }
  | { type: 'metamondoEnd'; form: string }
  | { type: 'metamondoReaction'; reaction: 'shatter' | 'rewrite' | 'devour' | 'spit' }
  | { type: 'metamondoReady' }
  | { type: 'projectile'; id: number; kind: string; team: Team }
  | { type: 'projectileHit'; kind: string; pos: Vec3 }
  | { type: 'explosion'; pos: Vec3; radius: number; element: Element }
  | { type: 'hazard'; id: number; kind: string }
  | { type: 'shockwave'; pos: Vec3; radius: number; element: Element }
  | { type: 'cue'; id: string; pos?: Vec3; actor?: number }
  | { type: 'sfx'; id: string; pos?: Vec3 }
  | { type: 'vfx'; id: string; pos: Vec3; params?: Record<string, number | string> }
  | { type: 'dialogue'; key: string; speaker: string }
  | { type: 'voce'; key: string }
  | { type: 'caption'; key: string }
  | { type: 'sequenceStart'; id: string }
  | { type: 'sequenceEnd'; id: string }
  | { type: 'gateLock'; arena: string }
  | { type: 'gateOpen'; arena: string }
  | { type: 'fightStart'; boss: string; arena: string }
  | { type: 'fightEnd'; boss: string; won: boolean }
  | { type: 'altarRest'; altar: string }
  | { type: 'altarDiscovered'; altar: string }
  | { type: 'footstep'; surface: string; pos: Vec3; sprint: boolean }
  | { type: 'jump' }
  | { type: 'land'; pos: Vec3; hard: boolean }
  | { type: 'dodge'; backstep: boolean }
  | { type: 'weaponObtained'; weapon: string }
  | { type: 'formUnlocked'; form: string }
  | { type: 'itemObtained'; item: string }
  | { type: 'reperto'; id: string }
  | { type: 'vista'; id: string }
  | { type: 'zoneEnter'; zone: string }
  | { type: 'zoneExit'; from: string; to: string; kind: string }
  | { type: 'skyBrighten'; level: number }
  | { type: 'music'; cue: string }
  | { type: 'timeOfDay'; tod: TimeOfDay }
  | { type: 'scale'; scale: number }
  | { type: 'gravityFlip'; sign: number }
  | { type: 'status'; kind: StatusKind; dur: number }
  | { type: 'autosave'; reason: string }
  | { type: 'ending' }
  | { type: 'credits' }
  | { type: 'interactPrompt'; key: string | null }
  | { type: 'counter'; pos: Vec3 }
  | { type: 'echo'; active: boolean }
  | { type: 'shake'; strength: number; dur: number }
  | { type: 'hitstop'; dur: number }
  | { type: 'slowmo'; dur: number; scale: number }
  | { type: 'haptic'; pattern: 'hit' | 'parry' | 'perfectDodge' | 'redWarning' | 'grace' | 'bossDefeat' | 'hurt' | 'light' };

export type SimEventType = SimEvent['type'];
