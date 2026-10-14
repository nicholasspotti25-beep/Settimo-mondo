/** Canonical formulas from the Bible (C4 / D8 / D9). All tunables come from the Balance def. */
import type { Content } from './content';
import type { BalanceDef, BossDef, WeaponDef } from './types';

/** weapon_damage = 18 + 4 * D (starter uses its own fixed value). */
export function weaponDamage(b: BalanceDef, w: WeaponDef): number {
  if (w.starter) return b.weapon.starter_damage;
  return b.weapon.base + b.weapon.per_difficulty * w.source_difficulty;
}

/** Time-to-kill target for a competent player: 120 + 20 * D seconds. */
export function ttkTarget(b: BalanceDef, difficulty: number): number {
  return b.boss.ttk_base + b.boss.ttk_per_d * difficulty;
}

/** A typical boss hit removes (10% + 1.2% * D) of player Health; heavy hits up to `heavy_cap` times that. */
export function bossHitDamage(b: BalanceDef, difficulty: number, mult: number): number {
  const typical = b.player.health * (b.boss.hit_base + b.boss.hit_per_d * difficulty);
  return typical * Math.min(Math.max(mult, 0), b.boss.heavy_cap);
}

/** Best weapon damage a player can own before facing the given boss (story order). */
export function referenceWeaponDamage(c: Content, boss: BossDef): number {
  const b = c.balance;
  let best = b.weapon.starter_damage;
  for (const other of c.bosses) {
    if (other.order >= boss.order) continue;
    const w = c.bundle.weapons.find((x) => x.source_boss === other.id && !x.ng_plus_only && !x.delivered_by);
    if (w) best = Math.max(best, weaponDamage(b, w));
  }
  return best;
}

/** Boss max HP from the time-to-kill target and the reference DPS of a suitable weapon. */
export function bossMaxHp(c: Content, boss: BossDef): number {
  if (boss.hp_override) return boss.hp_override;
  const b = c.balance;
  const dps = referenceWeaponDamage(c, boss) * b.boss.ref_hit_rate;
  return Math.max(b.boss.min_hp, Math.round(ttkTarget(b, boss.difficulty) * dps));
}
