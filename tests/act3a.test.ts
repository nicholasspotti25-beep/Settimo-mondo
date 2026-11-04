/**
 * ACT III-A encounters 13–16 (Bible C10): scripted mechanics of the Gigante di Fuoco (grab and throw, head within reach,
 * unstable rim, ablaze phase 2), the Yeti (blizzard, the painting he defends, phase 2 that never stops), the
 * Guardiano della Rocca di Brina (tower shield, light-spam punish, Equilibrio gap, orbiting blades, "Finalmente"), Loki
 * (illusions and the only shadow, the mirror labyrinth, ice bridges and the imitation of the player's weapons), their time-of-day variants, New Game+ patterns and IT/EN strings.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dist2D } from '../src/core/math';
import { insideArena } from '../src/core/terrain';
import type { TimeOfDay } from '../src/core/types';
import type { Actor, PartRuntime } from '../src/sim/actor';
import { applyDamageToActor } from '../src/sim/combat';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type AttackKind, type SimEvent } from '../src/sim/types';
import { GRAB_HOLD, RIM_QUAKE_EARLIEST, THROW_FLIGHT } from '../src/content/bosses/gigante_di_fuoco/behavior';
import { BACK_MULT, BLADE_SPIN, SHIELD_FRONT_MULT, SHIELD_LIGHT_POISE, SPAM_HITS, SPAM_WINDOW } from '../src/content/bosses/guardiano_rocca_di_brina/behavior';
import { MIMIC_DAMAGE, MIMIC_TELEGRAPH_MIN, buildMimic, copiesOf, mirrorExits } from '../src/content/bosses/loki/behavior';
import { BLIZZARD_DUR, BLIZZARD_SIGHT, FURY_CHAIN, FURY_GAP, FURY_PANT, GAZE_TIME, PAINTING_GUARD, paintingPos } from '../src/content/bosses/yeti/behavior';
import { loadContent, makeSim } from './helpers';

const c = loadContent();
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};
/** Bosses of this stream implemented so far (the list grows chunk by chunk). */
const ACT3A = ['gigante_di_fuoco', 'yeti', 'guardiano_rocca_di_brina', 'loki'] as const;

function fight(boss: string, opts: { seed?: number; tod?: TimeOfDay; ng?: number; invincible?: boolean } = {}): { sim: Sim; boss: Actor } {
  const sim = makeSim(opts.seed ?? 3);
  if (opts.tod) sim.state.timeOfDay = opts.tod;
  if (opts.ng) sim.state.ngCycle = opts.ng;
  sim.debug.invincible = opts.invincible ?? true;
  sim.startFightDirect(boss, { skipIntro: true });
  return { sim, boss: sim.boss! };
}

function record(sim: Sim, seconds: number, each?: (sim: Sim) => void): { t: number; e: SimEvent }[] {
  const out: { t: number; e: SimEvent }[] = [];
  sim.drainEvents();
  const steps = Math.round(seconds / sim.dt);
  for (let i = 0; i < steps; i++) {
    each?.(sim);
    sim.step(emptyInput());
    for (const e of sim.drainEvents()) out.push({ t: (i + 1) * sim.dt, e });
  }
  return out;
}

function until(sim: Sim, cond: (sim: Sim) => boolean, timeout = 10): void {
  const steps = Math.round(timeout / sim.dt);
  for (let i = 0; i < steps; i++) {
    if (cond(sim)) return;
    sim.step(emptyInput());
  }
  throw new Error('condition not reached');
}

function placeFront(sim: Sim, a: Actor, d: number): void {
  sim.player.pos.x = a.pos.x + Math.sin(a.yaw) * d;
  sim.player.pos.z = a.pos.z + Math.cos(a.yaw) * d;
  sim.player.pos.y = sim.groundAt(sim.player.pos.x, sim.player.pos.z);
}

let instance = 1;
/** A player hit on an actor through the real damage pipeline; returns the damage dealt. */
function playerHit(sim: Sim, a: Actor, amount: number, poise: number, kind: AttackKind, part: PartRuntime | null = null): number {
  return applyDamageToActor(sim, a, {
    source: -1, target: a.id, amount, poise, element: 'physical', flags: [], pos: { ...a.pos }, instance: instance++, part: part?.index ?? -1, kind,
  }, part);
}

function force(sim: Sim, a: Actor, id: string): void {
  a.cancelAttack(sim);
  a.setState('idle');
  a.startAttack(sim, a.attackMap.get(id)!);
}

describe('act3a data', () => {
  it('every boss has its phases, music ids, Bible weapon and NG+ patterns per phase', () => {
    for (const id of ACT3A) {
      const b = c.boss(id);
      expect(b.music).toBe(`boss_${id}`);
      b.phases.forEach((p, i) => expect(p.music).toBe(`boss_${id}_p${i + 1}`));
      const ids = new Set(b.attacks.map((a) => a.id));
      for (const p of b.phases) {
        for (const a of p.patterns) expect(ids.has(a), `${id}.${p.id}: ${a}`).toBe(true);
        const ng = b.ng_plus?.add_patterns?.[p.id] ?? [];
        expect(ng.length, `${id}.${p.id} NG+`).toBeGreaterThan(0);
        for (const a of ng) {
          expect(ids.has(a)).toBe(true);
          expect(b.phases.some((q) => q.patterns.includes(a)), `${a} only in NG+`).toBe(false);
        }
      }
      for (const a of b.attacks) {
        expect(a.telegraph).toBeGreaterThanOrEqual(0.35);
        expect(a.damage_mult).toBeLessThanOrEqual(2);
        expect(a.track_active ?? 0).toBeLessThanOrEqual(0.35);
        if (a.flags.includes('red')) expect(a.telegraph).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it('NG+ attacks are never used at ngCycle 0 and available at ngCycle 1', () => {
    for (const id of ACT3A) {
      const b = c.boss(id);
      const ng = new Set(Object.values(b.ng_plus?.add_patterns ?? {}).flat());
      const base = fight(id, { seed: 5 });
      const used = new Set<string>();
      record(base.sim, 60, (s) => { if (s.boss?.attack) used.add(s.boss.attack.def.id); });
      for (const a of ng) expect(used.has(a), `${a} used at ngCycle 0`).toBe(false);
      const plus = fight(id, { seed: 5, ng: 1 });
      plus.boss.bstate.fightT = 99;
      const avail = plus.boss.availableAttacks(plus.sim).map((a) => a.id);
      const p1 = b.ng_plus!.add_patterns!.p1;
      expect(p1.some((a) => avail.includes(a) || (plus.boss.cooldowns.get(a) ?? 0) > 0)).toBe(true);
    }
  });

  it('every string referenced by the act3a data exists in Italian and English', () => {
    const keys = new Set<string>();
    for (const id of ACT3A) {
      const b = c.boss(id);
      for (const k of [b.name_key, b.title_key, b.lore_key, ...b.dialogue_keys]) if (k) keys.add(k);
      for (const p of b.parts ?? []) if (p.name_key) keys.add(p.name_key);
      for (const v of Object.values(b.time_of_day_variants)) if (v?.note_key) keys.add(v.note_key);
      for (const p of b.phases) if (p.dialogue) keys.add(p.dialogue);
      for (const s of [b.intro_sequence, b.defeat_sequence]) {
        if (!s) continue;
        for (const st of c.sequence(s).steps) {
          const x = st as Record<string, unknown>;
          for (const f of ['say', 'voce', 'caption', 'title']) if (typeof x[f] === 'string') keys.add(x[f] as string);
        }
      }
    }
    for (const st of c.sequence('act3_intro').steps) {
      const x = st as Record<string, unknown>;
      for (const f of ['say', 'voce', 'caption', 'title']) if (typeof x[f] === 'string') keys.add(x[f] as string);
    }
    for (const k of keys) {
      expect(LOC.it[k], `it: ${k}`).toBeTruthy();
      expect(LOC.en[k], `en: ${k}`).toBeTruthy();
    }
  });
});

describe('Gigante di Fuoco', () => {
  it('grabs, lifts and throws the player across the rim; the landing hurts once and the flight is invulnerable', () => {
    const { sim, boss } = fight('gigante_di_fuoco', { invincible: false });
    run1(sim);
    placeFront(sim, boss, 6.2);
    force(sim, boss, 'grab');
    until(sim, (s) => s.player.state === 'grabbed', 3);
    expect(sim.player.grabbedBy).toBe(boss.id);
    const ground = sim.groundAt(sim.player.pos.x, sim.player.pos.z);
    const ev = record(sim, GRAB_HOLD - 0.05);
    expect(sim.player.pos.y - ground).toBeGreaterThan(4);
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'gigante_grab_caught')).toBe(true);
    const from = { ...sim.player.pos };
    const flight = record(sim, 0.2);
    expect(flight.some((x) => x.e.type === 'cue' && x.e.id === 'gigante_throw')).toBe(true);
    expect(sim.player.state).toBe('knockdown');
    expect(sim.player.invulnerable(sim)).toBe(true);
    const hp0 = sim.player.hp;
    const rest = record(sim, THROW_FLIGHT + 0.3);
    const hurts = rest.filter((x) => x.e.type === 'playerHurt');
    expect(hurts.length).toBe(1);
    expect(sim.player.hp).toBeLessThan(hp0);
    expect(dist2D(from, sim.player.pos)).toBeGreaterThan(6);
    expect(insideArena(sim.zone!.activeArena!, sim.player.pos.x, sim.player.pos.z, 1)).toBe(true);
    expect(sim.player.pos.y - sim.groundAt(sim.player.pos.x, sim.player.pos.z)).toBeLessThan(0.5);
  });

  it('a dodged grab catches nobody', () => {
    const { sim, boss } = fight('gigante_di_fuoco', { invincible: false });
    run1(sim);
    placeFront(sim, boss, 6.2);
    force(sim, boss, 'grab');
    const ev = record(sim, 3, (s) => { s.player.invuln = 0.5; });
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'gigante_throw')).toBe(false);
    expect(sim.player.grabbedBy).toBe(-1);
  });

  it('the head comes within reach when he bends over the twin slam, and stays out of reach while he stands', () => {
    const { sim, boss } = fight('gigante_di_fuoco');
    const head = boss.part('head')!;
    run1(sim);
    expect(head.center.y).toBeGreaterThan(12);
    placeFront(sim, boss, 8);
    force(sim, boss, 'twin_slam');
    until(sim, (s) => s.boss!.attack?.stage === 'recovery', 4);
    record(sim, 0.5);
    expect(head.center.y).toBeLessThan(5.5);
    expect(boss.flags.has('head_low')).toBe(true);
    record(sim, 4);
    expect(head.center.y).toBeGreaterThan(10);
  });

  it('the stomp is only for whoever stands under or behind him; the rim quake waits for the first exchanges', () => {
    const { sim, boss } = fight('gigante_di_fuoco');
    const stomp = boss.attackMap.get('stomp')!;
    const quake = boss.attackMap.get('rim_quake')!;
    placeFront(sim, boss, 12);
    expect(boss.behavior!.canUseAttack!(boss, sim, stomp)).toBe(false);
    placeFront(sim, boss, -7);
    expect(boss.behavior!.canUseAttack!(boss, sim, stomp)).toBe(true);
    boss.bstate.fightT = RIM_QUAKE_EARLIEST - 1;
    expect(boss.behavior!.canUseAttack!(boss, sim, quake)).toBe(false);
    boss.bstate.fightT = RIM_QUAKE_EARLIEST + 1;
    expect(boss.behavior!.canUseAttack!(boss, sim, quake)).toBe(true);
  });

  it('phase 2: covered in fire, the rim crumbles (narrower arena), head-down charges open with the head hanging low', () => {
    const { sim, boss } = fight('gigante_di_fuoco');
    expect(sim.surfaceAt(boss.pos.x, boss.pos.z)).toBe('ice');
    boss.hp = boss.hpMax * 0.49;
    sim.drainEvents();
    boss.checkPhase(sim);
    const now = sim.drainEvents().map((e) => ({ t: 0, e }));
    const ev = [...now, ...record(sim, 3.5)];
    expect(boss.phase.id).toBe('p2');
    expect(boss.flags.has('ablaze')).toBe(true);
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'arena_state:rim_broken')).toBe(true);
    expect(insideArena(sim.zone!.activeArena!, sim.arenaCenter().x + 27.5, sim.arenaCenter().z, 0)).toBe(false);
    boss.setState('idle');
    placeFront(sim, boss, 20);
    force(sim, boss, 'head_charge');
    until(sim, (s) => s.boss!.attack?.stage === 'recovery', 5);
    record(sim, 0.6);
    expect(boss.part('head')!.center.y).toBeLessThan(5.5);
  });

  it('time of day: night opens with the ember breath; dawn makes the rim give way more often', () => {
    const night = fight('gigante_di_fuoco', { tod: 'notte' });
    expect(night.boss.attack?.def.id).toBe('ember_breath');
    const dawn = fight('gigante_di_fuoco', { tod: 'alba' });
    expect(dawn.boss.tod.weights?.rim_quake).toBeGreaterThan(1);
  });
});

describe('Yeti', () => {
  it('the blizzard hides him beyond sight range, enables the rushes out of the storm (eyes glint first) and ends on time', () => {
    const { sim, boss } = fight('yeti');
    run1(sim);
    const rush = boss.attackMap.get('storm_rush')!;
    expect(boss.behavior!.canUseAttack!(boss, sim, rush)).toBe(false);
    placeFront(sim, boss, 6);
    force(sim, boss, 'blizzard');
    const ev = record(sim, 2.0);
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'yeti_blizzard_start')).toBe(true);
    expect(boss.flags.has('blizzard')).toBe(true);
    expect(boss.behavior!.canUseAttack!(boss, sim, rush)).toBe(true);
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('blizzard')!)).toBe(false);
    if (boss.attack) boss.cancelAttack(sim);
    boss.setState('idle');
    boss.idleTimer = 99;
    placeFront(sim, boss, BLIZZARD_SIGHT + 4);
    record(sim, 0.1);
    expect(boss.untargetable).toBe(true);
    placeFront(sim, boss, 4);
    record(sim, 0.1);
    expect(boss.untargetable).toBe(false);
    placeFront(sim, boss, 12);
    sim.drainEvents();
    force(sim, boss, 'storm_rush');
    expect(sim.drainEvents().some((e) => e.type === 'cue' && e.id === 'yeti_eyes')).toBe(true);
    const end = record(sim, BLIZZARD_DUR);
    expect(end.some((x) => x.e.type === 'cue' && x.e.id === 'yeti_blizzard_end')).toBe(true);
    expect(boss.flags.has('blizzard')).toBe(false);
    expect(boss.untargetable).toBe(false);
  });

  it('he defends the painting: near it, the guard leap comes first and lands between you and the wall', () => {
    const { sim, boss } = fight('yeti');
    run1(sim);
    const p = paintingPos(sim);
    sim.player.pos.x = p.x + 5;
    sim.player.pos.z = p.z - 4;
    boss.pos.x = p.x - 6; boss.pos.z = p.z - 12;
    const pick = boss.chooseAttack(sim, sim.player.pos);
    expect(pick?.id).toBe('painting_guard');
    force(sim, boss, 'painting_guard');
    until(sim, (s) => s.boss!.attack?.stage === 'recovery', 4);
    const dp = Math.hypot(sim.player.pos.x - p.x, sim.player.pos.z - p.z);
    const db = Math.hypot(boss.pos.x - p.x, boss.pos.z - p.z);
    expect(db).toBeLessThan(dp);
    // far from the painting the guard is never chosen
    sim.player.pos.x = p.x; sim.player.pos.z = p.z - PAINTING_GUARD - 8;
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('painting_guard')!)).toBe(false);
  });

  it('phase 2: furious, he never stops — short gaps, and a pant every few attacks', () => {
    const { sim, boss } = fight('yeti');
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    until(sim, (s) => s.boss!.phase.id === 'p2' && s.boss!.state !== 'transition', 6);
    expect(boss.flags.has('furious')).toBe(true);
    const gaps: number[] = [];
    let prev = boss.state;
    let since = -1;
    let pants = 0;
    record(sim, 30, (s) => {
      const b = s.boss!;
      // stay in front of him, within claw reach (and away from the painting)
      if (b.state !== 'attack') placeFront(s, b, b.radius + 2.5);
      // the behavior sets the gap on the tick after the attack ends: read it one tick later
      if (since === 1) gaps.push(b.idleTimer);
      since = prev === 'attack' && b.state === 'idle' ? 1 : -1;
      if (b.flags.has('panting')) pants++;
      prev = b.state;
    });
    const filled = gaps.filter((g) => g >= 0);
    expect(filled.length).toBeGreaterThanOrEqual(FURY_CHAIN + 1);
    expect(filled.filter((g) => g <= FURY_GAP + 0.05).length).toBeGreaterThanOrEqual(FURY_CHAIN);
    expect(filled.some((g) => g >= FURY_PANT - 0.2)).toBe(true);
    expect(pants).toBeGreaterThan(0);
  });

  it('time of day: at dawn he gazes at the painting before fighting (unless struck); at night he opens in the blizzard', () => {
    const dawn = fight('yeti', { tod: 'alba' });
    expect(dawn.boss.flags.has('gazing')).toBe(true);
    let attacked = false;
    record(dawn.sim, GAZE_TIME - 0.4, (s) => { if (s.boss!.attack) attacked = true; });
    expect(attacked).toBe(false);
    const night = fight('yeti', { tod: 'notte' });
    expect(night.boss.attack?.def.id).toBe('blizzard');
  });
});

describe('Guardiano della Rocca di Brina', () => {
  it('the tower shield blocks almost everything from the front; heavy blows still break Equilibrio, light ones barely', () => {
    const { sim, boss } = fight('guardiano_rocca_di_brina');
    run1(sim);
    boss.idleTimer = 99;
    placeFront(sim, boss, 5);
    expect(boss.flags.has('shield_up')).toBe(true);
    const light = playerHit(sim, boss, 100, 20, 'light');
    expect(light).toBeCloseTo(100 * SHIELD_FRONT_MULT, 3);
    expect(boss.poise).toBeCloseTo(20 * SHIELD_LIGHT_POISE, 3);
    boss.poise = 0;
    playerHit(sim, boss, 100, 20, 'heavy');
    expect(boss.poise).toBeCloseTo(20, 3);
    boss.poise = 0;
    placeFront(sim, boss, -5);
    expect(playerHit(sim, boss, 100, 20, 'light')).toBeCloseTo(100 * BACK_MULT, 3);
  });

  it('breaking Equilibrio opens the gap: Spezzato, the shield drops and blows land in full', () => {
    const { sim, boss } = fight('guardiano_rocca_di_brina');
    run1(sim);
    placeFront(sim, boss, 5);
    let n = 0;
    while (boss.state !== 'spezzato' && n++ < 40) playerHit(sim, boss, 10, 30, 'heavy');
    expect(boss.state).toBe('spezzato');
    expect(n).toBeLessThan(12);
    record(sim, 0.1);
    expect(boss.flags.has('shield_up')).toBe(false);
    expect(playerHit(sim, boss, 100, 0, 'light')).toBeCloseTo(100, 3);
  });

  it(`light spam on the shield (${SPAM_HITS} blows within ${SPAM_WINDOW} s) brings the punishing bash; spaced blows do not`, () => {
    const a = fight('guardiano_rocca_di_brina');
    run1(a.sim);
    a.boss.idleTimer = 99;
    placeFront(a.sim, a.boss, 5);
    a.sim.drainEvents();
    for (let i = 0; i < SPAM_HITS; i++) {
      playerHit(a.sim, a.boss, 10, 5, 'light');
      record(a.sim, 0.3);
      placeFront(a.sim, a.boss, 5);
    }
    expect(a.boss.attack?.def.id).toBe('shield_punish');
    expect(a.boss.bstate.punishes).toBe(1);
    const b = fight('guardiano_rocca_di_brina');
    run1(b.sim);
    b.boss.idleTimer = 99;
    for (let i = 0; i < SPAM_HITS + 1; i++) {
      placeFront(b.sim, b.boss, 5);
      playerHit(b.sim, b.boss, 10, 5, 'light');
      record(b.sim, SPAM_WINDOW / (SPAM_HITS - 1) + 0.2, (s) => { s.boss!.idleTimer = 99; });
    }
    expect(b.boss.bstate.punishes).toBe(0);
    expect(b.boss.behavior!.canUseAttack!(b.boss, b.sim, b.boss.attackMap.get('shield_punish')!)).toBe(false);
  });

  it('the back sweep is only for whoever camps behind him', () => {
    const { sim, boss } = fight('guardiano_rocca_di_brina');
    const sweep = boss.attackMap.get('back_sweep')!;
    placeFront(sim, boss, 5);
    expect(boss.behavior!.canUseAttack!(boss, sim, sweep)).toBe(false);
    placeFront(sim, boss, -5);
    expect(boss.behavior!.canUseAttack!(boss, sim, sweep)).toBe(true);
  });

  it('phase 2: the shield shatters into orbiting blades and no longer blocks', () => {
    const { sim, boss } = fight('guardiano_rocca_di_brina');
    boss.hp = boss.hpMax * 0.49;
    sim.drainEvents();
    boss.checkPhase(sim);
    const ev = [...sim.drainEvents().map((e) => ({ t: 0, e })), ...record(sim, 3.5)];
    expect(boss.phase.id).toBe('p2');
    expect(boss.flags.has('shield_broken') && boss.flags.has('blades_orbit')).toBe(true);
    expect(boss.flags.has('shield_up')).toBe(false);
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'guardiano_shield_shatter')).toBe(true);
    const a0 = boss.bstate.bladeAngle as number;
    record(sim, 0.5);
    const da = ((boss.bstate.bladeAngle as number) - a0 + Math.PI * 2) % (Math.PI * 2);
    expect(da).toBeCloseTo(BLADE_SPIN * 0.5, 1);
    boss.setState('idle');
    boss.idleTimer = 99;
    placeFront(sim, boss, 5);
    expect(playerHit(sim, boss, 100, 0, 'light')).toBeCloseTo(100, 3);
  });

  it('falling he says "Finalmente" (verbatim) and crumbles; at night he opens with the frost', () => {
    const def = c.boss('guardiano_rocca_di_brina');
    const steps = c.sequence(def.defeat_sequence!).steps as Record<string, unknown>[];
    const say = steps.find((st) => st.say === 'boss.guardiano_rocca_di_brina.defeat');
    expect(say?.speaker).toBe('guardiano_rocca_di_brina');
    expect(LOC.it['boss.guardiano_rocca_di_brina.defeat']).toContain('Finalmente');
    const { sim, boss } = fight('guardiano_rocca_di_brina');
    sim.drainEvents();
    boss.hp = 1;
    playerHit(sim, boss, 10, 0, 'heavy');
    expect(boss.alive).toBe(false);
    const ev = [...sim.drainEvents().map((e) => ({ t: 0, e })), ...record(sim, 1)];
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'guardiano_crumble')).toBe(true);
    expect(fight('guardiano_rocca_di_brina', { tod: 'notte' }).boss.attack?.def.id).toBe('frost_slam');
  });
});

describe('Loki', () => {
  it('phase 1: two copies (illusions, no shadow); only Loki casts the shadow; one blow shatters a copy', () => {
    const { sim, boss } = fight('loki');
    expect(boss.flags.has('casts_shadow') && boss.flags.has('illusionist')).toBe(true);
    until(sim, (s) => copiesOf(s.boss!, s).length > 0, 5);
    expect(boss.history[0]).toBe('twin_illusion');
    const copies = copiesOf(boss, sim);
    expect(copies.length).toBe(2);
    for (const m of copies) {
      expect(m.flags.has('illusion')).toBe(true);
      expect(m.flags.has('casts_shadow')).toBe(false);
    }
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('twin_illusion')!)).toBe(false);
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('mirror_swap')!)).toBe(true);
    const hp0 = boss.hp;
    playerHit(sim, copies[0], 25, 10, 'light');
    expect(copies[0].alive).toBe(false);
    expect(boss.hp).toBe(hp0);
    expect(copiesOf(boss, sim).length).toBe(1);
    const night = fight('loki', { tod: 'notte' });
    until(night.sim, (s) => copiesOf(s.boss!, s).length > 0, 5);
    expect(copiesOf(night.boss, night.sim).length).toBe(3);
  });

  it('the swap: Loki always changes place with one of his copies', () => {
    const { sim, boss } = fight('loki', { seed: 11 });
    until(sim, (s) => copiesOf(s.boss!, s).length > 0, 5);
    for (let k = 0; k < 4; k++) {
      const spots = [boss, ...copiesOf(boss, sim)].map((x) => ({ x: x.pos.x, z: x.pos.z }));
      const before = { x: boss.pos.x, z: boss.pos.z };
      force(sim, boss, 'mirror_swap');
      record(sim, 0.4);
      expect(Math.hypot(boss.pos.x - before.x, boss.pos.z - before.z)).toBeGreaterThan(0.5);
      expect(spots.some((p) => Math.hypot(p.x - boss.pos.x, p.z - boss.pos.z) < 0.5)).toBe(true);
      record(sim, 1.2);
    }
    expect(boss.bstate.swaps).toBe(4);
  });

  it('one blow at a time: copies never strike while Loki winds up, and Loki waits while a copy strikes', () => {
    const { sim, boss } = fight('loki');
    until(sim, (s) => copiesOf(s.boss!, s).length > 0, 5);
    const [m] = copiesOf(boss, sim);
    force(sim, boss, 'dagger_lunge');
    expect(m.behavior!.canUseAttack!(m, sim, m.attacks[0])).toBe(false);
    boss.cancelAttack(sim);
    boss.setState('idle');
    m.startAttack(sim, m.attacks[0]);
    expect(boss.behavior!.selectAttack!(boss, sim, boss.availableAttacks(sim))).toBeNull();
  });

  it('phase 2: the labyrinth of mirrors; he hides in a mirror that glows, then comes out of it to strike', () => {
    const { sim, boss } = fight('loki');
    boss.hp = boss.hpMax * 0.6;
    sim.drainEvents();
    boss.checkPhase(sim);
    const ev = [...sim.drainEvents().map((e) => ({ t: 0, e })), ...record(sim, 3.5)];
    expect(boss.phase.id).toBe('p2');
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'arena_state:mirror_maze')).toBe(true);
    expect(sim.zone!.arenaColliders.length).toBe(6);
    expect(copiesOf(boss, sim).length).toBe(0);
    boss.setState('idle');
    sim.drainEvents();
    force(sim, boss, 'mirror_strike');
    const glow = sim.drainEvents().find((e) => e.type === 'cue' && e.id === 'loki_mirror_glow');
    expect(glow).toBeTruthy();
    const exits = mirrorExits(sim);
    expect(exits.some((x) => Math.hypot(x.x - boss.pos.x, x.z - boss.pos.z) < 0.01)).toBe(true);
    expect(boss.hidden && boss.untargetable && boss.invulnerable).toBe(true);
    expect(playerHit(sim, boss, 50, 10, 'heavy')).toBe(0);
    until(sim, (s) => s.boss!.attack?.stage === 'active', 3);
    record(sim, 0.05);
    expect(boss.hidden || boss.untargetable || boss.invulnerable).toBe(false);
  });

  it('phase 3: the ice bridges, and the imitation of the three weapons the player has equipped', () => {
    const { sim, boss } = fight('loki');
    const ws = sim.c.weapons.filter((w) => !w.ng_plus_only).slice(0, 3).map((w) => w.id);
    for (const w of ws) sim.giveWeapon(w);
    sim.setLoadout(ws);
    expect(sim.player.weapons).toEqual(ws);
    boss.hp = boss.hpMax * 0.3;
    sim.drainEvents();
    boss.checkPhase(sim);
    boss.checkPhase(sim);
    const ev = [...sim.drainEvents().map((e) => ({ t: 0, e })), ...record(sim, 4)];
    expect(boss.phase.id).toBe('p3');
    expect(ev.some((x) => x.e.type === 'cue' && x.e.id === 'arena_state:ice_bridges')).toBe(true);
    expect(sim.zone!.activeArena!.shape).toBe('polygon');
    expect(sim.zone!.arenaColliders.length).toBe(0);
    expect(boss.bstate.mimic).toEqual(ws);
    ['mimic_1', 'mimic_2', 'mimic_3'].forEach((id, i) => {
      const def = boss.attackMap.get(id)!;
      expect(def).toEqual(buildMimic(sim, ws[i], id));
      expect(def.anim!.startsWith('mimic_')).toBe(true);
    });
    boss.setState('idle');
    sim.drainEvents();
    force(sim, boss, 'mimic_2');
    expect(sim.drainEvents().some((e) => e.type === 'cue' && e.id === `loki_mimic:${ws[1]}`)).toBe(true);
    expect(boss.bstate.mimicNow).toBe(ws[1]);
  });

  it('every weapon of the game can be imitated, always within the fairness rules', () => {
    const sim = makeSim(2);
    for (const w of sim.c.weapons) {
      const def = buildMimic(sim, w.id, 'mimic_1');
      expect(def, w.id).not.toBeNull();
      expect(def!.telegraph).toBeGreaterThanOrEqual(MIMIC_TELEGRAPH_MIN);
      expect(def!.recovery).toBeGreaterThanOrEqual(1.0);
      expect(def!.damage_mult).toBeGreaterThanOrEqual(MIMIC_DAMAGE[0]);
      expect(def!.damage_mult).toBeLessThanOrEqual(MIMIC_DAMAGE[1]);
      expect(def!.track_active ?? 0).toBeLessThanOrEqual(0.35);
      expect((def!.hits?.length ?? 0) + (def!.spawns?.length ?? 0), w.id).toBeGreaterThan(0);
    }
  });

  it('defeated he laughs and vanishes; he grants the Specchio Form and brightens the sky; dawn opens with a bow', () => {
    const def = c.boss('loki');
    expect(def.class).toBe('principal');
    expect(def.unlocks_form).toBe('specchio');
    expect(def.brightens_sky).toBe(true);
    expect(def.drops_weapon).toBe('grimorio_delle_menzogne');
    const steps = c.sequence(def.defeat_sequence!).steps as Record<string, unknown>[];
    expect(steps.some((st) => st.event === 'cue' && (st.params as Record<string, unknown>).id === 'loki_laugh')).toBe(true);
    expect(LOC.it['boss.loki.mid']).toContain('prigione');
    expect(LOC.it['boss.loki.mid2']).toContain('Ouranthos è morto');
    const { sim, boss } = fight('loki');
    until(sim, (s) => copiesOf(s.boss!, s).length > 0, 5);
    sim.drainEvents();
    boss.hp = 1;
    playerHit(sim, boss, 10, 0, 'heavy');
    expect(boss.alive).toBe(false);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.type === 'cue' && e.id === 'loki_vanish')).toBe(true);
    expect(copiesOf(boss, sim).length).toBe(0);
    expect(fight('loki', { tod: 'alba' }).boss.attack?.def.id).toBe('flourish');
  });
});

/** Let the fight settle one second (boss turns to the player). */
function run1(sim: Sim): void {
  record(sim, 1);
  if (sim.boss!.attack) sim.boss!.cancelAttack(sim);
  sim.boss!.setState('idle');
}
