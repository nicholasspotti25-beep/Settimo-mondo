import { describe, expect, it } from 'vitest';
import { bossHitDamage, bossMaxHp, ttkTarget, weaponDamage } from '../src/core/formulas';
import { Rng } from '../src/core/rng';
import { exportCode, importCode, newGameState, newGamePlus, skyShade, themeNotes } from '../src/sim/gamestate';
import { Btn, emptyInput } from '../src/sim/types';
import { loadContent, makeSim, press, run } from './helpers';

const c = loadContent();
const B = c.balance;

describe('formulas (C4)', () => {
  it('weapon damage = 18 + 4 x D', () => {
    const w = c.weapon('lancia_del_custode');
    expect(weaponDamage(B, w)).toBe(18 + 4 * 2);
    expect(weaponDamage(B, c.weapon('lama_della_culla'))).toBe(B.weapon.starter_damage);
  });
  it('time-to-kill target = 120 + 20 x D', () => {
    expect(ttkTarget(B, 2)).toBe(160);
    expect(ttkTarget(B, 20)).toBe(520);
  });
  it('typical boss hit = (10% + 1.2% x D) of Health, heavy capped at double', () => {
    expect(bossHitDamage(B, 2, 1)).toBeCloseTo(12.4, 5);
    expect(bossHitDamage(B, 20, 1)).toBeCloseTo(34, 5);
    expect(bossHitDamage(B, 20, 5)).toBeCloseTo(68, 5);
    // at D = 20 three typical hits can kill
    expect(3 * bossHitDamage(B, 20, 1)).toBeGreaterThanOrEqual(100);
  });
  it('boss HP derives from TTK and the reference weapon', () => {
    const g = c.boss('guardiano_del_regno');
    expect(bossMaxHp(c, g)).toBe(Math.round(ttkTarget(B, 2) * B.weapon.starter_damage * B.boss.ref_hit_rate));
  });
});

describe('seeded RNG', () => {
  it('is deterministic and weighted picks respect zero weights', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) expect(r.weighted([0, 1, 0])).toBe(1);
  });
});

describe('player resources', () => {
  it('dodge costs 18 Fiato and gives i-frames 0.05-0.30 s', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    sim.boss!.idleTimer = 99;
    const f0 = sim.player.fiato;
    sim.step(press(Btn.Dodge, { ...emptyInput(), moveX: 1 }));
    expect(sim.player.state).toBe('dodge');
    expect(f0 - sim.player.fiato).toBeCloseTo(B.player.dodge_cost, 5);
    run(sim, 0.03);
    expect(sim.player.invulnerable(sim)).toBe(false);
    run(sim, 0.1);
    expect(sim.player.invulnerable(sim)).toBe(true);
    run(sim, 0.25);
    expect(sim.player.invulnerable(sim)).toBe(false);
  });

  it('Fiato regenerates 30/s only after 0.7 s without spending', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    sim.boss!.idleTimer = 99;
    sim.player.fiato = 50;
    sim.player.fiatoIdle = 0;
    run(sim, 0.5);
    expect(sim.player.fiato).toBeCloseTo(50, 5);
    run(sim, 1.2);
    expect(sim.player.fiato).toBeGreaterThan(50 + 30 * 0.9);
  });

  it('Lacrime: 1.2 s drink, heals 100%, cancelable before 0.4 s without consuming', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    sim.boss!.idleTimer = 99;
    sim.player.hp = 20;
    sim.step(press(Btn.Drink));
    run(sim, 0.2);
    sim.step(press(Btn.Dodge, { ...emptyInput(), moveX: 1 }));
    expect(sim.player.lacrime).toBe(3);
    run(sim, 0.6);
    sim.step(press(Btn.Drink));
    run(sim, 1.3);
    expect(sim.player.lacrime).toBe(2);
    expect(sim.player.hp).toBe(sim.player.hpMax);
  });

  it('Eco: light hit +6; Arts cost 100 / 200', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    const boss = sim.boss!;
    boss.idleTimer = 99;
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 2.6 };
    sim.player.yaw = 0;
    sim.step(press(Btn.Light));
    run(sim, 0.6);
    expect(sim.player.eco).toBe(B.eco.light_hit);
    sim.player.eco = 150;
    sim.step(press(Btn.ArtSeconda));
    expect(sim.player.eco).toBe(150);
    sim.step(press(Btn.ArtPrima));
    run(sim, 0.1);
    expect(sim.player.eco).toBe(50);
  });
});

describe('perfect dodge and parry', () => {
  it('a dodge started within 0.12 s of impact is perfect: +40 Eco, +3% Metamondo, slow-mo', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    const boss = sim.boss!;
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 3.2 };
    boss.yaw = Math.PI;
    sim.player.yaw = 0;
    boss.startAttack(sim, boss.attackMap.get('heavy_overhead')!);
    const atk = boss.attack!;
    const impact = (atk.def.telegraph + atk.def.hits![0].t) / atk.rate;
    run(sim, impact - 0.09);
    const meter0 = sim.meta.meter;
    sim.step(press(Btn.Dodge, { ...emptyInput(), moveX: 1 }));
    const ev: string[] = [];
    for (let i = 0; i < 30; i++) {
      sim.step(emptyInput());
      for (const e of sim.drainEvents()) ev.push(e.type);
    }
    expect(ev).toContain('perfectDodge');
    expect(ev).toContain('slowmo');
    expect(sim.player.eco).toBeGreaterThanOrEqual(B.eco.perfect_dodge);
    expect(sim.meta.meter).toBeGreaterThanOrEqual(meter0 + B.metamondo.perfect_dodge_bonus - 1e-6);
    expect(sim.player.hp).toBe(sim.player.hpMax);
  });

  it('Colpi Rossi cannot be parried; normal hits can with a parry-capable weapon', () => {
    const sim = makeSim();
    sim.giveWeapon('lancia_del_custode');
    // a parry-capable weapon is needed: temporarily mark the starter as parry-capable via a copy
    const w = sim.c.weapon('lama_della_culla');
    const old = w.parry_capable;
    w.parry_capable = true;
    try {
      sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
      const boss = sim.boss!;
      sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 3 };
      boss.yaw = Math.PI;
      sim.player.yaw = 0;
      boss.startAttack(sim, boss.attackMap.get('lance_sweep')!);
      const atk = boss.attack!;
      run(sim, (atk.def.telegraph + atk.def.hits![0].t) / atk.rate - 0.06);
      sim.step(press(Btn.Guard, { ...emptyInput(), guardHeld: true }));
      const ev: string[] = [];
      for (let i = 0; i < 20; i++) {
        sim.step({ ...emptyInput(), guardHeld: true });
        for (const e of sim.drainEvents()) ev.push(e.type);
      }
      expect(ev).toContain('parry');
      expect(sim.player.eco).toBeGreaterThanOrEqual(B.eco.perfect_parry);
      // red overhead: parry attempt fails, damage taken
      run(sim, 2);
      boss.setState('idle');
      boss.startAttack(sim, boss.attackMap.get('heavy_overhead')!);
      const a2 = boss.attack!;
      sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 3 };
      sim.player.hp = 100;
      run(sim, (a2.def.telegraph + a2.def.hits![0].t) / a2.rate - 0.06);
      sim.step(press(Btn.Guard, { ...emptyInput(), guardHeld: true }));
      const ev2: string[] = [];
      for (let i = 0; i < 20; i++) {
        sim.step({ ...emptyInput(), guardHeld: true });
        for (const e of sim.drainEvents()) ev2.push(e.type);
      }
      expect(ev2).not.toContain('parry');
      expect(sim.player.hp).toBeLessThan(100);
    } finally {
      w.parry_capable = old;
    }
  });
});

describe('Equilibrio, Spezzato and Colpo di Grazia', () => {
  it('heavy hits fill Equilibrio by 20; breaking it gives 6 s Spezzato; one Colpo di Grazia for 3x weapon damage', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    const boss = sim.boss!;
    boss.idleTimer = 999;
    sim.applyPoise(boss, B.equilibrio.heavy_hit, null);
    expect(boss.poise).toBe(20);
    sim.applyPoise(boss, boss.poiseMax, null);
    expect(boss.state).toBe('spezzato');
    expect(boss.stateDur).toBe(B.equilibrio.spezzato_time);
    sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - 3 };
    const hp0 = boss.hp;
    sim.step(press(Btn.Light));
    expect(sim.player.state).toBe('grace');
    expect(sim.player.invulnerable(sim)).toBe(true);
    run(sim, B.equilibrio.grace_time + 0.1);
    expect(hp0 - boss.hp).toBeCloseTo(B.weapon.starter_damage * B.equilibrio.grace_mult, 3);
    // second grace in the same Spezzato is not offered
    expect(sim.player.findGraceTarget(sim)).toBeNull();
  });

  it('Equilibrio decays 8/s after 4 s without hits', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    const boss = sim.boss!;
    boss.idleTimer = 999;
    boss.state = 'scripted';
    sim.applyPoise(boss, 50, null);
    run(sim, 3.9);
    expect(boss.poise).toBeCloseTo(50, 3);
    run(sim, 1.0);
    expect(boss.poise).toBeLessThan(50);
    expect(boss.poise).toBeGreaterThan(50 - 8 * 1.1);
  });
});

describe('pattern selection', () => {
  it('never picks the same pattern more than twice in a row, respects cooldowns and range', () => {
    const sim = makeSim(9);
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    const boss = sim.boss!;
    const seq: string[] = [];
    for (let i = 0; i < 400; i++) {
      // alternate between close and far range so every pattern can qualify
      sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - (i % 3 === 0 ? 9 : 3.5) };
      boss.approachTime = 5;
      const d = boss.chooseAttack(sim, sim.player.pos);
      if (!d) continue;
      boss.history.push(d.id);
      if (d.cooldown) boss.cooldowns.set(d.id, d.cooldown);
      seq.push(d.id);
      for (const [k, v] of boss.cooldowns) boss.cooldowns.set(k, v - 0.5);
    }
    for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
    expect(seq.length).toBeGreaterThan(50);
  });

  it('phase 2 starts at 50% HP with an invulnerable transition', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    const boss = sim.boss!;
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    expect(boss.phaseIndex).toBe(1);
    expect(boss.state).toBe('transition');
    expect(boss.invulnerable).toBe(true);
    expect(boss.flags.has('spectral_aura')).toBe(true);
  });
});

describe('Metamondo (C6)', () => {
  it('starts at 50%, fills in 150 s, lasts 30 s with +50% damage', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    sim.boss!.idleTimer = 9999;
    sim.boss!.state = 'scripted';
    expect(sim.meta.meter).toBe(50);
    run(sim, 74);
    expect(sim.meta.ready).toBe(false);
    run(sim, 1.5);
    expect(sim.meta.ready).toBe(true);
    sim.step(press(Btn.Metamondo));
    expect(sim.meta.active).toBe(true);
    expect(sim.meta.damageMult).toBe(1.5);
    expect(sim.player.outgoingMult(sim)).toBe(1.5);
    // Respiro Libero: unlimited Fiato
    const f = sim.player.fiato;
    sim.step(press(Btn.Dodge, { ...emptyInput(), moveX: 1 }));
    expect(sim.player.fiato).toBe(f);
    run(sim, 30.2);
    expect(sim.meta.active).toBe(false);
    expect(sim.meta.meter).toBeLessThan(1);
  });
});

describe('death and respawn', () => {
  it('wakes at the last altar with full Health and Lacrime, boss reset, no item loss', () => {
    const sim = makeSim();
    sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
    sim.player.lacrime = 0;
    sim.player.hp = 1;
    sim.onPlayerDeath();
    run(sim, 4);
    expect(sim.player.state).not.toBe('dead');
    expect(sim.player.hp).toBe(sim.player.hpMax);
    expect(sim.player.lacrime).toBe(3);
    expect(sim.fight).toBeNull();
    expect(sim.state.weapons).toContain('lama_della_culla');
  });
});

describe('save system', () => {
  it('export/import text code round-trips and rejects tampering', () => {
    const s = newGameState(c, { name: 'Ada', build: 0.3, height: 0.6, skin: 1, hair: 2, hairColor: 3, eyes: 1, cloak: 2 });
    s.defeated.push('guardiano_del_regno');
    s.weapons.push('lancia_del_custode');
    s.luciferoChoice = 'begged';
    const code = exportCode(s);
    const back = importCode(code);
    expect(back).toEqual(s);
    const parts = code.split('.');
    expect(() => importCode(`${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAAA`)).toThrow();
  });

  it('New Game+ keeps weapons and Forms, starts golden', () => {
    const s = newGameState(c, { name: 'Ada', build: 0.3, height: 0.6, skin: 1, hair: 2, hairColor: 3, eyes: 1, cloak: 2 });
    s.weapons.push('lancia_del_custode');
    s.forms.push('specchio');
    const ng = newGamePlus(c, s);
    expect(ng.ngCycle).toBe(1);
    expect(ng.weapons).toContain('lancia_del_custode');
    expect(ng.forms).toContain('specchio');
    expect(ng.defeated).toEqual([]);
    expect(skyShade(c, ng)).toBe(7);
    expect(themeNotes(c, s)).toBe(0);
  });
});
