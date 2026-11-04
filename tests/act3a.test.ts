/**
 * ACT III-A encounters 13–16 (Bible C10): scripted mechanics of the Gigante di Fuoco (grab and throw, head within reach,
 * unstable rim, ablaze phase 2), the Yeti (blizzard, the painting he defends, phase 2 that never stops), their time-of-day variants, New Game+ patterns and IT/EN strings.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dist2D } from '../src/core/math';
import { insideArena } from '../src/core/terrain';
import type { TimeOfDay } from '../src/core/types';
import type { Actor } from '../src/sim/actor';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type SimEvent } from '../src/sim/types';
import { GRAB_HOLD, RIM_QUAKE_EARLIEST, THROW_FLIGHT } from '../src/content/bosses/gigante_di_fuoco/behavior';
import { BLIZZARD_DUR, BLIZZARD_SIGHT, FURY_CHAIN, FURY_GAP, FURY_PANT, GAZE_TIME, PAINTING_GUARD, paintingPos } from '../src/content/bosses/yeti/behavior';
import { loadContent, makeSim } from './helpers';

const c = loadContent();
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};
/** Bosses of this stream implemented so far (the list grows chunk by chunk). */
const ACT3A = ['gigante_di_fuoco', 'yeti'] as const;

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

/** Let the fight settle one second (boss turns to the player). */
function run1(sim: Sim): void {
  record(sim, 1);
  if (sim.boss!.attack) sim.boss!.cancelAttack(sim);
  sim.boss!.setState('idle');
}
