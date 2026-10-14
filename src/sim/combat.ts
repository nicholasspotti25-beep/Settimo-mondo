/**
 * Damage resolution (D7). Order for hits on the player: invulnerability frames -> perfect dodge -> perfect parry -> guard ->
 * damage and hit reaction. Player hits on actors: weak points, own-part Equilibrio, breakable parts, Spezzato, phases, death.
 */
import { DEG, angleDiff, clamp, dist2D, wrapAngle, yawTo } from '../core/math';
import { PARRY_TYPES } from '../core/types';
import type { Actor, PartRuntime } from './actor';
import type { Sim } from './sim';
import type { DamageEvent } from './types';

export type HitResult = 'miss' | 'avoided' | 'dodged' | 'parried' | 'blocked' | 'hit' | 'absorbed';

/** Resolve a hit landing on the player. */
export function damagePlayer(sim: Sim, attacker: Actor | null, dmg: DamageEvent): HitResult {
  const pl = sim.player;
  const B = sim.bal.player;
  if (pl.state === 'dead') return 'miss';
  const unavoidable = dmg.flags.includes('unavoidable');
  const red = dmg.flags.includes('red');
  const attackerPos = attacker ? attacker.pos : dmg.pos;

  // 0) Counter stance (Postura del Viandante): absorb and riposte
  if (pl.state === 'art' && pl.art?.effect === 'counter_stance' && pl.art.data.window && !unavoidable && !pl.art.data.countered) {
    pl.art.data.countered = pl.art.t;
    pl.yaw = yawTo(pl.pos, attackerPos);
    sim.emit({ type: 'parry', pos: { ...dmg.pos }, actor: attacker?.id ?? -1 });
    sim.emit({ type: 'haptic', pattern: 'parry' });
    return 'dodged';
  }

  // 1) invulnerability frames (dodge, knockdown, grace, burrow)
  if (!unavoidable && pl.invulnerable(sim)) {
    const dodging = pl.state === 'dodge';
    if (dodging) {
      const since = sim.time - pl.dodgeStart;
      const perfect = since <= B.perfect_dodge_window + sim.settings.latencyComp && !pl.perfectDodged.has(dmg.instance);
      inversione(sim, attacker, dmg);
      attacker?.behavior?.onPlayerDodge?.(attacker, sim, perfect);
      if (perfect) {
        pl.perfectDodged.add(dmg.instance);
        pl.gainEco(sim, sim.bal.eco.perfect_dodge);
        sim.meta.addPerfectDodge(sim);
        sim.onAllyPerfectDodge();
        sim.emit({ type: 'perfectDodge', pos: { ...pl.pos } });
        sim.emit({ type: 'slowmo', dur: B.perfect_dodge_slowmo, scale: B.perfect_dodge_slowmo_scale });
        sim.emit({ type: 'haptic', pattern: 'perfectDodge' });
        return 'dodged';
      }
      sim.emit({ type: 'dodgeAvoid', pos: { ...pl.pos } });
    }
    return 'avoided';
  }

  const facing = Math.abs(angleDiff(pl.yaw, yawTo(pl.pos, attackerPos))) < 75 * DEG;

  // 2) perfect parry (parry-capable weapons; any weapon for the parry_final blow)
  if (pl.state === 'parry') {
    const since = sim.time - pl.parryStart;
    const w = pl.weapon(sim);
    const capable = (!!w && (w.parry_capable || PARRY_TYPES.includes(w.type))) || dmg.flags.includes('parry_final');
    const parryable = (!red || dmg.flags.includes('parry_final')) && !dmg.flags.includes('projectile') && (!unavoidable || dmg.flags.includes('parry_final'));
    if (capable && parryable && facing && since <= B.parry_window + sim.settings.latencyComp) {
      pl.gainEco(sim, sim.bal.eco.perfect_parry);
      pl.setState('guard');
      if (attacker) {
        sim.applyPoise(attacker, sim.bal.equilibrio.perfect_parry, null);
        if (attacker.state === 'attack') {
          attacker.cancelAttack(sim);
          if (attacker.state === 'attack') attacker.setState('stagger', sim.bal.boss.parry_recoil);
        }
        attacker.behavior?.onParried?.(attacker, sim);
      }
      sim.emit({ type: 'parry', pos: { ...dmg.pos }, actor: attacker?.id ?? -1 });
      sim.emit({ type: 'hitstop', dur: 0.09 });
      sim.emit({ type: 'haptic', pattern: 'parry' });
      return 'parried';
    }
  }

  // Specchio clones and decoys handled by the caller. Debug invincibility:
  if (sim.debug.invincible) {
    sim.emit({ type: 'cue', id: 'debug_invincible', pos: { ...dmg.pos } });
    return 'absorbed';
  }

  let amount = dmg.amount;
  // 3) guard
  if ((pl.state === 'guard' || pl.state === 'parry') && facing && !red && !unavoidable && !dmg.flags.includes('unblockable')) {
    const w = pl.weapon(sim);
    const abs = guardAbsorption(sim, w?.type ?? 'spada_corta', w?.category ?? 'one_handed', w?.parry_capable ?? false);
    const absorbed = amount * abs;
    const cost = absorbed * B.guard_stamina_ratio;
    pl.fiatoIdle = 0;
    if (pl.fiato >= cost || (sim.meta.active && sim.meta.ability === 'respiro_libero')) {
      pl.spend(sim, cost);
      amount -= absorbed;
      sim.emit({ type: 'block', pos: { ...dmg.pos }, amount: absorbed });
      if (amount > 0.01) applyPlayerDamage(sim, amount, dmg, false);
      if ((pl.state as string) !== 'dead') pl.setState('guard');
      return 'blocked';
    }
    // guard break
    const covered = pl.fiato / Math.max(1e-3, B.guard_stamina_ratio);
    pl.fiato = 0;
    amount -= Math.min(absorbed, covered);
    pl.setState('guardbreak', B.guard_break_time);
    sim.emit({ type: 'guardBreak', pos: { ...pl.pos } });
    applyPlayerDamage(sim, amount, dmg, false);
    return 'hit';
  }

  // 4) damage + hit reaction
  applyPlayerDamage(sim, amount, dmg, true);
  if ((pl.state as string) !== 'dead') {
    const kd = dmg.flags.includes('knockdown') || dmg.poise >= 25;
    const push = dmg.flags.includes('knockback') ? 2.2 : kd ? 1.2 : 0.35;
    pl.hitReaction(sim, dmg.poise, kd, yawTo(attackerPos, pl.pos), push * Math.max(0.3, pl.scale));
    if (dmg.flags.includes('grab') && attacker) {
      pl.setState('grabbed', 1.4);
      pl.grabbedBy = attacker.id;
    }
  }
  return 'hit';
}

function applyPlayerDamage(sim: Sim, amount: number, dmg: DamageEvent, reaction: boolean): void {
  const pl = sim.player;
  if (amount <= 0) return;
  pl.hp = Math.max(0, pl.hp - amount);
  pl.tookDamage = true;
  pl.hurtTimer = 0.4;
  if (dmg.status) {
    pl.statuses[dmg.status.kind] = Math.max(pl.statuses[dmg.status.kind] ?? 0, dmg.status.dur);
    pl.statusPower[dmg.status.kind] = dmg.status.power ?? 0.4;
    sim.emit({ type: 'status', kind: dmg.status.kind, dur: dmg.status.dur });
  }
  for (const f of dmg.flags) {
    if (f === 'slow' || f === 'freeze' || f === 'burn' || f === 'blind' || f === 'mute' || f === 'madness' || f === 'poison') {
      const dur = f === 'freeze' ? 0.7 : f === 'slow' ? 2.5 : f === 'blind' ? 3.5 : f === 'mute' ? 4 : f === 'madness' ? 3 : 4;
      pl.statuses[f] = Math.max(pl.statuses[f] ?? 0, dur);
      if (pl.statusPower[f] === undefined) pl.statusPower[f] = f === 'slow' ? 0.4 : 1;
      sim.emit({ type: 'status', kind: f, dur });
    }
  }
  const heavy = (dmg.mult ?? 1) >= 1.4;
  sim.emit({ type: 'playerHurt', amount, pos: { ...dmg.pos }, heavy, element: dmg.element, knockdown: reaction && (dmg.poise >= 25 || dmg.flags.includes('knockdown')) });
  sim.emit({ type: 'haptic', pattern: 'hurt' });
  sim.emit({ type: 'shake', strength: heavy ? 0.45 : 0.22, dur: heavy ? 0.35 : 0.2 });
  if (pl.hp <= 0) sim.onPlayerDeath();
}

function inversione(sim: Sim, attacker: Actor | null, dmg: DamageEvent): void {
  if (!sim.meta.active || sim.meta.ability !== 'inversione' || !attacker || attacker.team !== 'enemy') return;
  const pl = sim.player;
  if (pl.reflected.has(dmg.instance)) return;
  pl.reflected.add(dmg.instance);
  const w = pl.weapon(sim);
  const k = Number(sim.meta.form?.ability.params.reflect_mult ?? 1.2);
  const amount = pl.baseDamage(sim, w) * k * sim.meta.damageMult;
  sim.emit({ type: 'vfx', id: 'inversione_reflect', pos: { ...pl.pos }, params: { tx: attacker.pos.x, ty: attacker.pos.y + attacker.height * attacker.scale * 0.5, tz: attacker.pos.z } });
  applyDamageToActor(sim, attacker, {
    source: -1, target: attacker.id, amount, poise: 0, element: 'void', flags: [], pos: { ...attacker.pos }, instance: dmg.instance, part: -1, kind: 'art',
  }, null);
}

export function guardAbsorption(sim: Sim, type: string, category: string, parry: boolean): number {
  const g = sim.bal.guard_absorption;
  if (type === 'scudo') return g.scudo ?? 1;
  if (parry) return g.parry_sword ?? 0.8;
  return g[category] ?? 0.6;
}

/**
 * Apply player-side damage to an actor. Returns the damage actually dealt (0 if immune).
 * `part` = part hit (weak points multiply damage; own-Equilibrio parts take the poise).
 */
export function applyDamageToActor(sim: Sim, a: Actor, dmg: DamageEvent, part: PartRuntime | null): number {
  if (!a.alive || a.state === 'dead') return 0;
  if (a.kind === 'clone' || a.kind === 'ally') return 0;
  if (a.kind === 'decoy') return 0;
  const fromFront = Math.abs(angleDiff(a.yaw, yawTo(a.pos, sim.player.pos))) < 70 * DEG;
  if (a.invulnerable) {
    sim.emit({ type: 'cue', id: 'immune', pos: { ...dmg.pos }, actor: a.id });
    return 0;
  }
  if (part) {
    dmg.amount *= part.def.damage_mult ?? 1;
    dmg.poise *= part.def.poise_mult ?? 1;
    if (part.highlight && sim.meta.active && sim.meta.ability === 'tempo_stellare') dmg.amount *= Number(sim.meta.form?.ability.params.weak_mult ?? 1.25);
  }
  a.behavior?.modifyIncoming?.(a, sim, dmg, part, fromFront);
  if (dmg.amount <= 0 && dmg.poise <= 0) {
    sim.emit({ type: 'cue', id: 'deflect', pos: { ...dmg.pos }, actor: a.id });
    return 0;
  }
  const amount = Math.max(0, dmg.amount);
  const share = part?.def.main_share ?? 1;
  const minHp = a.canDie(sim) ? 0 : 1;
  if (part && part.hpMax > 0 && !part.broken) {
    part.hp -= amount;
    if (part.hp <= 0) breakPart(sim, a, part);
  }
  a.hp = Math.max(minHp, a.hp - amount * share);
  if (a.mainShare > 0 && sim.boss && sim.boss !== a && sim.boss.alive) {
    const mb = sim.boss;
    mb.hp = Math.max(mb.canDie(sim) ? 0 : 1, mb.hp - amount * a.mainShare);
    mb.checkPhase(sim);
    if (mb.hp <= 0) killActor(sim, mb);
  }
  a.hitFlash = 0.12;
  if (dmg.poise > 0) sim.applyPoise(a, dmg.poise, part && part.poiseMax > 0 ? part : null);
  if (dmg.status) {
    if (dmg.status.kind === 'slow' || dmg.status.kind === 'freeze') {
      a.slowed = Math.max(a.slowed, dmg.status.dur);
      a.slowPower = dmg.status.kind === 'freeze' ? 0.6 : dmg.status.power ?? 0.35;
    }
  }
  sim.emit({
    type: 'hit', target: a.id, source: dmg.source, amount, pos: { ...dmg.pos }, heavy: dmg.kind === 'heavy' || dmg.kind === 'jumping' || dmg.kind === 'art' || dmg.kind === 'grace',
    part: part?.index ?? -1, element: dmg.element, kind: dmg.kind, weak: (part?.def.damage_mult ?? 1) > 1,
  });
  a.behavior?.onDamaged?.(a, sim, dmg, part);
  if (a.isMain) a.checkPhase(sim);
  if (a.hp <= 0) killActor(sim, a);
  return amount;
}

export function breakPart(sim: Sim, a: Actor, part: PartRuntime): void {
  if (part.broken) return;
  part.broken = true;
  part.active = false;
  part.spezzato = 0;
  if (part.def.regrow) part.regrowTimer = part.def.regrow;
  sim.emit({ type: 'partBroken', actor: a.id, part: part.id, pos: { ...part.center } });
  a.behavior?.onPartBroken?.(a, sim, part);
  if (a.attack?.def.part === part.id) {
    a.cancelAttack(sim);
    a.setState('stagger', 0.8);
  }
}

export function killActor(sim: Sim, a: Actor): void {
  if (a.state === 'dead') return;
  if (!a.canDie(sim)) {
    a.hp = Math.max(1, a.hp);
    return;
  }
  a.cancelAttack(sim);
  a.setState('dead');
  a.hp = 0;
  a.dying = 0;
  a.behavior?.onDeath?.(a, sim);
  if (a.isMain) sim.onBossDeath(a);
}

/** Distance from the player to the surface of an actor (for range checks). */
export function surfaceDistance(sim: Sim, a: Actor): number {
  return Math.max(0, dist2D(sim.player.pos, a.pos) - a.radius * a.scale);
}

export function wrapYaw(y: number): number {
  return wrapAngle(y);
}

export function clampHp(v: number, max: number): number {
  return clamp(v, 0, max);
}
