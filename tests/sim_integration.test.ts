/**
 * Integration-pass sim contracts: one blow per hazard spawn (docs/requests/act2.md #1), the debug attack-shape accessor
 * (docs/requests/ui.md #2) and the abandoned-fight event that lets presentation drop a dropped fight's captions and cards.
 */
import { describe, expect, it } from 'vitest';
import type { ShapeDef, SpawnDef } from '../src/core/types';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type SimEvent } from '../src/sim/types';
import { makeSim } from './helpers';

function fightAtGate(): Sim {
  const sim = makeSim(3);
  sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
  sim.drainEvents();
  return sim;
}

function steps(sim: Sim, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    sim.step(emptyInput());
    out.push(...sim.drainEvents());
  }
  return out;
}

describe('hazards: one spawn lands as one blow', () => {
  it('a cluster of overlapping footprints from ONE spawn hits a player standing in the overlap once', () => {
    const sim = fightAtGate();
    const boss = sim.boss!;
    boss.startAttack(sim, boss.def.attacks[0]);
    const atk = boss.attack!;
    boss.attack = null; // keep the boss's own hit windows out of the count
    boss.setState('idle');
    boss.idleTimer = 99;
    // three marks around the player 0.6 m apart + the center one: every footprint covers the player
    const spawn: SpawnDef = { t: 0, type: 'hazard', at: 'around_target', count: 3, dist: 0.6, delay: 0.1, active: 0.4, shape: { type: 'cylinder', c: [0, 0, 0], r: 2.2, h: 4 } };
    atk.targetId = -1;
    atk.target = { ...sim.player.pos };
    sim.bossSpawn(boss, atk, spawn);
    const placed = sim.hazards.items.filter((h) => h.active && h.team === 'enemy' && !h.permanent);
    expect(placed.length).toBeGreaterThanOrEqual(3);
    expect(new Set(placed.map((h) => h.group)).size).toBe(1);
    const hurt = steps(sim, 40).filter((e) => e.type === 'playerHurt');
    expect(hurt.length).toBe(1);
    for (const h of placed) expect(h.hitOnce.has(-1)).toBe(true);
  });

  it('separate spawns stay separate groups (a second wave can still land)', () => {
    const sim = fightAtGate();
    const boss = sim.boss!;
    boss.startAttack(sim, boss.def.attacks[0]);
    const atk = boss.attack!;
    const spawn: SpawnDef = { t: 0, type: 'hazard', at: 'target', count: 1, delay: 0.1, active: 0.4 };
    atk.targetId = -1;
    atk.target = { ...sim.player.pos };
    sim.bossSpawn(boss, atk, spawn);
    sim.bossSpawn(boss, atk, { ...spawn, count: 2 });
    const groups = sim.hazards.items.filter((h) => h.active && h.team === 'enemy' && !h.permanent).map((h) => h.group);
    // the single hazard has no group; the pair shares one
    expect(groups.filter((g) => g === -1).length).toBe(1);
    expect(new Set(groups.filter((g) => g >= 0)).size).toBe(1);
  });
});

describe('debug: active attack shapes', () => {
  it('forEachActiveShape reports exactly the hit windows live this tick', () => {
    const sim = fightAtGate();
    const boss = sim.boss!;
    const def = boss.def.attacks.find((a) => (a.hits ?? []).length > 0)!;
    boss.startAttack(sim, def);
    const seen: { shape: ShapeDef; progress: number }[] = [];
    const count = () => {
      let n = 0;
      boss.forEachActiveShape((shape, origin, yaw, scale, progress) => {
        expect(Number.isFinite(origin.x + origin.z + yaw + scale)).toBe(true);
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
        seen.push({ shape, progress });
        n++;
      });
      return n;
    };
    expect(count()).toBe(0); // telegraph
    let live = 0;
    for (let i = 0; i < 600 && boss.attack; i++) {
      sim.step(emptyInput());
      live += count();
    }
    expect(live).toBeGreaterThan(0);
    expect(seen.every((s) => (def.hits ?? []).some((h) => h.shape === s.shape))).toBe(true);
  });
});

describe('fights dropped unfinished', () => {
  it('a zone change or a new fight announces the old fight as abandoned, once', () => {
    const sim = fightAtGate();
    steps(sim, 10);
    sim.startFightDirect('cavaliere_errante', { skipIntro: true });
    const ev = sim.drainEvents();
    const ends = ev.filter((e) => e.type === 'fightEnd');
    expect(ends).toEqual([{ type: 'fightEnd', boss: 'guardiano_del_regno', won: false, abandoned: true }]);
    // the abandoned end comes before the new zone and fight
    const iEnd = ev.findIndex((e) => e.type === 'fightEnd');
    expect(iEnd).toBeLessThan(ev.findIndex((e) => e.type === 'zoneEnter'));
    expect(iEnd).toBeLessThan(ev.findIndex((e) => e.type === 'fightStart'));
    // leaving through travel drops the Cavaliere fight too; a fight that already ended is not announced again
    sim.travel(sim.c.boss('guardiano_del_regno').zone, 'spawn');
    expect(sim.drainEvents().filter((e) => e.type === 'fightEnd').length).toBe(1);
    sim.travel(sim.c.boss('guardiano_del_regno').zone, 'spawn');
    expect(sim.drainEvents().filter((e) => e.type === 'fightEnd').length).toBe(0);
  });

  it('a won fight is not announced again as abandoned', () => {
    const sim = fightAtGate();
    steps(sim, 5);
    const boss = sim.boss!;
    boss.hp = 0;
    sim.onBossDeath(boss);
    const first = sim.drainEvents().filter((e) => e.type === 'fightEnd');
    expect(first).toEqual([{ type: 'fightEnd', boss: 'guardiano_del_regno', won: true }]);
    sim.startFightDirect('cavaliere_errante', { skipIntro: true });
    expect(sim.drainEvents().filter((e) => e.type === 'fightEnd').length).toBe(0);
  });
});
