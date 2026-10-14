/**
 * Boss behavior hooks. One optional module per boss in src/content/bosses/<id>/behavior.ts exports
 * `export default defineBehavior({...})`. Everything not overridden falls back to the data-driven BossBase logic.
 */
import type { AttackDef, PhaseDef, SpawnDef } from '../core/types';
import type { Actor, AttackRuntime, PartRuntime } from './actor';
import type { DamageEvent } from './types';
import type { Sim } from './sim';

export type MetamondoReaction = 'normal' | 'shatter' | 'rewrite' | 'devour';

export interface BossBehavior {
  /** Called once when the actor is spawned. */
  init?(a: Actor, sim: Sim): void;
  /** Called every tick before the default AI. Return true to skip the default AI this tick (fully scripted). */
  update?(a: Actor, sim: Sim, dt: number): boolean | void;
  /** Custom locomotion while idle/moving. Return true if handled. */
  movement?(a: Actor, sim: Sim, dt: number): boolean;
  onPhaseEnter?(a: Actor, sim: Sim, phase: number, def: PhaseDef): void;
  onAttackStart?(a: Actor, sim: Sim, atk: AttackRuntime): void;
  onAttackEnd?(a: Actor, sim: Sim, atk: AttackRuntime): void;
  /** Spawn of type 'custom' (or any spawn with an `event`). */
  onCustomEvent?(a: Actor, sim: Sim, event: string, spawn: SpawnDef, atk: AttackRuntime | null): void;
  /** Extra availability rules (e.g. 'requires: mounted'). */
  canUseAttack?(a: Actor, sim: Sim, def: AttackDef): boolean;
  /** Override pattern selection. Return undefined to use the default weighted selector, null to wait. */
  selectAttack?(a: Actor, sim: Sim, candidates: AttackDef[]): AttackDef | null | undefined;
  /** Adjust or cancel incoming damage (set dmg.amount = 0 and dmg.poise = 0 to block). */
  modifyIncoming?(a: Actor, sim: Sim, dmg: DamageEvent, part: PartRuntime | null, fromFront: boolean): void;
  onDamaged?(a: Actor, sim: Sim, dmg: DamageEvent, part: PartRuntime | null): void;
  onPartBroken?(a: Actor, sim: Sim, part: PartRuntime): void;
  onSpezzato?(a: Actor, sim: Sim, part: PartRuntime | null): void;
  onGraceStrike?(a: Actor, sim: Sim, part: PartRuntime | null): void;
  onParried?(a: Actor, sim: Sim): void;
  /** Player dodged one of this actor's hits (perfect = perfect dodge). */
  onPlayerDodge?(a: Actor, sim: Sim, perfect: boolean): void;
  /** Return false to prevent death (scripted fights). */
  canDie?(a: Actor, sim: Sim): boolean;
  onDeath?(a: Actor, sim: Sim): void;
  onMetamondoStart?(a: Actor, sim: Sim): MetamondoReaction;
  onMetamondoEnd?(a: Actor, sim: Sim): void;
  /** The player used an in-fight interactable registered with sim.addFightInteractable (e.g. the ship's ballista). */
  onInteract?(a: Actor, sim: Sim, id: string): void;
}

export type BehaviorFactory = () => BossBehavior;
export type BehaviorRegistry = Record<string, BehaviorFactory>;

export function defineBehavior(b: BossBehavior | BehaviorFactory): BehaviorFactory {
  return typeof b === 'function' ? b : () => ({ ...b });
}
