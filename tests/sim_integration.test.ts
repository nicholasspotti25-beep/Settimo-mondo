/**
 * Integration-pass sim contracts: one blow per hazard spawn (docs/requests/act2.md #1), the debug attack-shape accessor
 * (docs/requests/ui.md #2), the abandoned-fight event that lets presentation drop a dropped fight's captions and cards,
 * the Aim assist setting (docs/requests/ui.md #3) and the Specchio dei Ricordi in the Ciclo dell'Alba (ui.md #4).
 */
import { describe, expect, it } from 'vitest';
import { DEG, wrapAngle, yawTo } from '../src/core/math';
import type { ShapeDef, SpawnDef } from '../src/core/types';
import { everDefeated, isDefeated, newGamePlus } from '../src/sim/gamestate';
import { Sim } from '../src/sim/sim';
import { Btn, emptyInput, type SimEvent } from '../src/sim/types';
import { BEHAVIORS } from '../src/generated/registry.sim';
import { makeSim, press } from './helpers';

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

describe('aim assist setting', () => {
  /** The boss frozen 4 m beyond its body, 30 degrees to the player's right; no lock. Returns the player's yaw error to it. */
  function swingBeside(aimAssist: boolean): { before: number; after: number; turned: number } {
    const sim = fightAtGate();
    sim.settings.aimAssist = aimAssist;
    sim.debug.invincible = true;
    const boss = sim.boss!;
    boss.attack = null;
    boss.setState('idle');
    boss.idleTimer = 99;
    const pl = sim.player;
    pl.lock = null;
    const d = boss.radius * boss.scale + 4;
    pl.pos.x = boss.pos.x;
    pl.pos.z = boss.pos.z - d;
    pl.yaw = yawTo(pl.pos, boss.pos) + 30 * DEG;
    const yaw0 = pl.yaw;
    const before = Math.abs(wrapAngle(pl.yaw - yawTo(pl.pos, boss.pos)));
    sim.step(press(Btn.Light));
    for (let i = 0; i < 3; i++) sim.step(emptyInput());
    expect(pl.lock).toBeNull();
    return { before, after: Math.abs(wrapAngle(pl.yaw - yawTo(pl.pos, boss.pos))), turned: Math.abs(wrapAngle(pl.yaw - yaw0)) };
  }

  it('on (default): an unlocked light attack turns toward the foe in front', () => {
    expect(makeSim(1).settings.aimAssist).toBe(true);
    const r = swingBeside(true);
    expect(r.before).toBeCloseTo(30 * DEG, 3);
    expect(r.after).toBeLessThan(2 * DEG);
  });

  it('off: an unlocked light attack keeps the player\'s facing', () => {
    const r = swingBeside(false);
    expect(r.turned).toBeLessThan(1e-6);
    expect(r.after).toBeGreaterThan(25 * DEG);
  });
});

describe('Specchio dei Ricordi in the Ciclo dell\'Alba', () => {
  it('a boss defeated in the previous cycle can be replayed although NG+ resets the story', () => {
    const first = makeSim(4);
    first.startFightDirect('guardiano_del_regno', { skipIntro: true });
    first.drainEvents();
    const boss = first.boss!;
    boss.hp = 0;
    first.onBossDeath(boss);
    for (let i = 0; i < 600 && first.fight; i++) first.step(emptyInput());
    expect(isDefeated(first.state, 'guardiano_del_regno')).toBe(true);
    const ng = newGamePlus(first.c, first.state);
    expect(isDefeated(ng, 'guardiano_del_regno')).toBe(false);
    expect(everDefeated(ng, 'guardiano_del_regno')).toBe(true);
    expect(everDefeated(ng, 'cavaliere_errante')).toBe(false);
    const sim = new Sim(first.c, { behaviors: BEHAVIORS, seed: 9, headless: true, state: ng });
    sim.startMemoryFight('cavaliere_errante', 'notte', ng.equippedForm, {});
    expect(sim.fight).toBeNull();
    sim.startMemoryFight('guardiano_del_regno', 'notte', ng.equippedForm, {});
    expect(sim.fight?.boss).toBe('guardiano_del_regno');
    expect(sim.fight?.memory).toBe(true);
    // a memory win does not advance this cycle's story
    sim.drainEvents();
    sim.boss!.hp = 0;
    sim.onBossDeath(sim.boss!);
    for (let i = 0; i < 600 && sim.fight; i++) sim.step(emptyInput());
    expect(isDefeated(sim.state, 'guardiano_del_regno')).toBe(false);
  });
});

describe('one_blow attacks (integration #3: promoted from act3b guardMultiHit)', () => {
  function twoWindowHurts(oneBlow: boolean): number {
    const sim = fightAtGate();
    const boss = sim.boss!;
    sim.debug.invincible = false;
    // the player 2 m in front of the boss, both windows cover them, 0.35 s apart (a second cut of the same blow)
    sim.player.pos.x = boss.pos.x + Math.sin(boss.yaw) * 2;
    sim.player.pos.z = boss.pos.z + Math.cos(boss.yaw) * 2;
    const base = boss.def.attacks[0];
    const shape: ShapeDef = { type: 'sphere', c: [0, 1, 2], r: 3 };
    const def = {
      ...base, id: 'test_two_cuts', telegraph: 0.2, active: 0.8, recovery: 0.5, motion: undefined, spawns: undefined, flags: [],
      hits: [{ t: 0, dur: 0.1, shape }, { t: 0.45, dur: 0.1, shape }], one_blow: oneBlow, track: 0, track_active: 0,
    };
    boss.startAttack(sim, def);
    let hurt = 0;
    for (let i = 0; i < 90; i++) {
      sim.step(emptyInput());
      // keep the player in place, upright and unable to act (no dodge, no input)
      sim.player.pos.x = boss.pos.x + Math.sin(boss.yaw) * 2;
      sim.player.pos.z = boss.pos.z + Math.cos(boss.yaw) * 2;
      hurt += sim.drainEvents().filter((e) => e.type === 'playerHurt').length;
    }
    return hurt;
  }

  it('without the flag each window can land; with it the attack lands once', () => {
    expect(twoWindowHurts(false)).toBe(2);
    expect(twoWindowHurts(true)).toBe(1);
  });
});

describe('enemy projectile aim follows the player scale (integration #3)', () => {
  it('aims at 1 m at scale 1 and at 0.1 m for the Little Garden player', () => {
    const sim = fightAtGate();
    expect(sim.aimLift(-1)).toBeCloseTo(1, 5);
    sim.player.baseScale = 0.1;
    expect(sim.aimLift(-1)).toBeCloseTo(0.1, 5);
    // an actor target keeps the 1 m aim
    expect(sim.aimLift(sim.boss!.id)).toBe(1);
  });
});
