/**
 * ACT V encounters 27–32 (Bible C10), the Dragon Realm: scripted mechanics of the Drago di Ghiaccio (frost breath that
 * leaves non-damaging icy patches you slide on, the aim lock before the breath, no flinch-lock from breath ticks, the
 * phase 2 storm with telegraphed gusts and marked stalactites that never fall while it winds up a blow), the Drago a Tre
 * Teste (three heads with their own Equilibrio striking in turn, a head falls for good at its break and the others enrage,
 * phase 2 at the first fall, the last head never falls, the strikes that follow you are one blow), the data rules shared
 * by every Act V boss (phases, music ids, weapon, NG+ patterns, fair telegraphs), IT/EN strings and the Act V intro.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON_MINI } from '../tools/canon/bible';
import type { Actor } from '../src/sim/actor';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type SimEvent } from '../src/sim/types';
import { angleDiff } from '../src/core/math';
import { AIM_LOCK, PATCH_LIFE, STALACTITE_DELAY, onIce } from '../src/content/bosses/drago_di_ghiaccio/behavior';
import { HEADS, LAST_BAR_MULT, RAGE_STEP, fallenHeads } from '../src/content/bosses/drago_a_tre_teste/behavior';
import { loadContent, makeSim } from './helpers';

const c = loadContent();
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};
/** Encounters of this stream implemented so far (the list grows chunk by chunk). */
const ACT5 = ['drago_di_ghiaccio', 'drago_a_tre_teste'] as const;

function fight(boss: string, opts: { seed?: number; ng?: number; invincible?: boolean } = {}): { sim: Sim; boss: Actor } {
  const sim = makeSim(opts.seed ?? 3);
  if (opts.ng) sim.state.ngCycle = opts.ng;
  sim.debug.invincible = opts.invincible ?? true;
  sim.startFightDirect(boss, { skipIntro: true });
  return { sim, boss: sim.boss! };
}

function place(sim: Sim, a: Actor, d: number, angle = 0): void {
  const y = a.yaw + angle;
  sim.player.pos.x = a.pos.x + Math.sin(y) * d;
  sim.player.pos.z = a.pos.z + Math.cos(y) * d;
  sim.player.pos.y = sim.groundAt(sim.player.pos.x, sim.player.pos.z);
}

function force(sim: Sim, a: Actor, id: string): void {
  a.cancelAttack(sim);
  a.setState('idle');
  a.startAttack(sim, a.attackMap.get(id)!);
}

function steps(sim: Sim, seconds: number, each?: (sim: Sim, events: SimEvent[]) => void): void {
  const n = Math.round(seconds / sim.dt);
  for (let i = 0; i < n; i++) {
    sim.step(emptyInput());
    const ev = sim.drainEvents();
    each?.(sim, ev);
  }
}

function toPhase2(sim: Sim, a: Actor): void {
  a.hp = a.hpMax * 0.49;
  a.checkPhase(sim);
  steps(sim, 3.2);
}

describe('Act V data', () => {
  it('every Act V boss so far follows the card and the fairness rules', () => {
    for (const id of ACT5) {
      const b = c.boss(id);
      expect(b.act).toBe(5);
      expect(b.music).toBe(`boss_${id}`);
      b.phases.forEach((p, i) => expect(p.music).toBe(`boss_${id}_p${i + 1}`));
      expect(b.drops_weapon).toBeTruthy();
      expect(CANON_MINI).toContain(id);
      expect(b.dialogue_keys).toEqual([]);
      expect(b.lore_key).toBeUndefined();
      const ng = b.ng_plus?.add_patterns ?? {};
      for (const p of b.phases) expect((ng[p.id] ?? []).length).toBeGreaterThan(0);
      for (const ids of Object.values(ng)) for (const a of ids) expect(b.attacks.some((x) => x.id === a)).toBe(true);
      for (const a of b.attacks) {
        if ((a.weight ?? 1) === 0) continue;
        expect(a.telegraph).toBeGreaterThanOrEqual(0.5);
        expect(a.track_active ?? 0).toBeLessThanOrEqual(0.35);
        if (a.flags.includes('red') || a.flags.includes('knockdown')) expect(a.telegraph).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it('IT and EN strings exist for every Act V key, and the intro returns you to 112%', () => {
    const keys = ['story.atto5.titolo', 'story.atto5.intro.01', 'story.atto5.intro.02', 'story.atto5.intro.03', 'voce.atto5.intro',
      'voce.atto5.ossa_altare', 'voce.atto5.nidi_altare', 'voce.atto5.osservatorio_altare',
      ...HEADS.map((h) => `boss.drago_a_tre_teste.part.${h.replace('testa_', '')}`)];
    for (const k of keys) {
      expect(LOC.it[k], k).toBeTruthy();
      expect(LOC.en[k], k).toBeTruthy();
    }
    const seq = c.sequence('act5_intro');
    expect(seq.steps.some((s) => 'event' in s && s.event === 'set_scale' && s.params?.scale === 1.12)).toBe(true);
    expect(seq.steps.some((s) => 'say' in s)).toBe(false);
  });
});

describe('Drago di Ghiaccio', () => {
  it('the frost breath leaves icy patches along its line that never damage and melt in time', () => {
    const { sim, boss } = fight('drago_di_ghiaccio');
    place(sim, boss, 30, Math.PI);
    force(sim, boss, 'frost_breath');
    steps(sim, 3.2);
    const ice: { damage: number }[] = [];
    sim.hazards.forEachActive((h) => { if (h.kind === 'ghiaccio_ice') ice.push(h); });
    expect(ice.length).toBe(3);
    expect(ice.every((h) => h.damage === 0)).toBe(true);
    const p0 = (boss.bstate.patches as { x: number; z: number }[])[0];
    sim.player.pos.x = p0.x; sim.player.pos.z = p0.z;
    expect(onIce(boss, sim)).toBe(true);
    const hp = sim.player.hp;
    sim.debug.invincible = false;
    boss.setState('scripted');
    steps(sim, 1.5);
    expect(sim.player.hp).toBe(hp);
    steps(sim, PATCH_LIFE);
    expect((boss.bstate.patches as unknown[]).length).toBe(0);
  });

  it('the head stops turning before the breath, and its ticks never chain flinches', () => {
    const { sim, boss } = fight('drago_di_ghiaccio', { invincible: false });
    place(sim, boss, 8);
    force(sim, boss, 'frost_breath');
    const def = boss.attackMap.get('frost_breath')!;
    let lockYaw: number | null = null;
    let run = 0, worst = 0;
    steps(sim, def.telegraph + def.active, (s) => {
      const atk = boss.attack;
      if (atk?.stage === 'telegraph' && atk.time >= def.telegraph - AIM_LOCK + 0.05) {
        lockYaw ??= boss.yaw;
        // reset to the locked aim every tick (at most one tick of turning in between: < 2°)
        expect(Math.abs(angleDiff(lockYaw, boss.yaw))).toBeLessThan(0.035);
        sim.player.pos.x += 0.05; // the player runs sideways: the head no longer follows
      }
      run = s.player.state === 'stagger' ? run + 1 : 0;
      worst = Math.max(worst, run);
    });
    expect(lockYaw).not.toBeNull();
    expect(sim.player.hp).toBeLessThan(sim.player.hpMax);
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('phase 2 storm: gusts are announced with a unit wind vector, stalactites are marked on you and wait for the dragon', () => {
    const { sim, boss } = fight('drago_di_ghiaccio');
    toPhase2(sim, boss);
    expect(boss.flags.has('storm')).toBe(true);
    let gust: SimEvent | null = null;
    const marks: { delay: number; bossAttacking: boolean }[] = [];
    const seen = new Set<number>();
    steps(sim, 40, (s, ev) => {
      for (const e of ev) if (e.type === 'cue' && e.id === 'ghiaccio_gust') gust ??= e;
      s.hazards.forEachActive((h) => {
        if (h.kind !== 'ghiaccio_stalactite' || seen.has(h.id)) return;
        seen.add(h.id);
        marks.push({ delay: h.delay, bossAttacking: boss.state === 'attack' && boss.attack?.def.id !== 'stalactite_rain' && boss.attack?.def.id !== 'ng_ice_cage' });
      });
    });
    expect(gust).not.toBeNull();
    const g = gust as unknown as { pos: { x: number; z: number } };
    expect(Math.hypot(g.pos.x, g.pos.z)).toBeCloseTo(1, 5);
    expect(marks.length).toBeGreaterThan(2);
    for (const m of marks) expect(m.delay).toBeGreaterThanOrEqual(STALACTITE_DELAY - 1e-6);
    expect(marks.some((m) => m.bossAttacking)).toBe(false);
  });
});

describe('Drago a Tre Teste', () => {
  it('the heads strike one at a time and in turn', () => {
    const { sim, boss } = fight('drago_a_tre_teste', { seed: 5 });
    const order: string[] = [];
    let last = -1;
    steps(sim, 90, () => {
      const atk = boss.attack;
      if (atk && atk.uid !== last) {
        last = atk.uid;
        if (atk.def.part) order.push(atk.def.part);
      }
      place(sim, boss, 6);
    });
    expect(new Set(order).size).toBe(3);
    for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
  });

  it('a head falls for good at its break, the others enrage, phase 2 starts; the last head never falls', () => {
    const { sim, boss } = fight('drago_a_tre_teste');
    const head = (id: string) => boss.parts.find((p) => p.id === id)!;
    sim.applyPoise(boss, 999, head('testa_veleno'));
    expect(fallenHeads(boss)).toEqual(['testa_veleno']);
    expect(boss.phaseIndex).toBe(1);
    expect(boss.flags.has('fury')).toBe(true);
    expect(boss.speedMult).toBeCloseTo(1 + RAGE_STEP, 6);
    steps(sim, sim.bal.equilibrio.spezzato_time + 0.5);
    expect(head('testa_veleno').broken).toBe(true);
    expect(boss.availableAttacks(sim).some((a) => a.part === 'testa_veleno')).toBe(false);
    sim.applyPoise(boss, 999, head('testa_fuoco'));
    expect(boss.speedMult).toBeCloseTo(1 + 2 * RAGE_STEP, 6);
    const bar = head('testa_fulmine').poiseMax;
    sim.applyPoise(boss, 999, head('testa_fulmine'));
    expect(fallenHeads(boss)).toEqual(['testa_veleno', 'testa_fuoco']);
    expect(head('testa_fulmine').poiseMax).toBe(Math.round(bar * LAST_BAR_MULT));
    steps(sim, sim.bal.equilibrio.spezzato_time + 0.5);
    expect(head('testa_fulmine').broken).toBe(false);
  });

  it('the lightning strikes that follow you are one blow', () => {
    const { sim, boss } = fight('drago_a_tre_teste');
    place(sim, boss, 10);
    force(sim, boss, 'bolt_strikes');
    const groups = new Set<number>();
    steps(sim, 2.0, (s) => s.hazards.forEachActive((h) => { if (h.kind === 'tre_teste_bolt') groups.add(h.group); }));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toBeGreaterThanOrEqual(0);
  });
});
