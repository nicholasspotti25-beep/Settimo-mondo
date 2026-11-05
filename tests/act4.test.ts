/**
 * ACT IV encounters 23–26 (Bible C10), Little Garden at 0.1 player scale: scripted mechanics of the Re Mantide
 * (camouflage among the leaves → rustle cue behind you → he rises there and cuts an X; tight combos that end when a blow
 * lands; petal fans aimed low at the tiny player; the crown blooms in phase 2; the dawn naturalist), the Coleottero Imperiale
 * (front armor, mandibles that grab and crush once, the carapace slam only from the side, the phase 2 flight chain: take-off,
 * marked bombing run, dive and landing; the dawn salute), the data rules shared
 * by every Act IV boss (phases, music ids, weapon, NG+ patterns, fair telegraphs), IT/EN strings and the Act IV intro.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { forward } from '../src/core/math';
import type { TimeOfDay } from '../src/core/types';
import type { Actor } from '../src/sim/actor';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type SimEvent } from '../src/sim/types';
import { AMBUSH_DIST, REVEAL_LEAD } from '../src/content/bosses/re_mantide/behavior';
import { FRONT_ARMOR, FRONT_POISE, GRAB_LIFT, GRAB_REACH, GRAB_TIME } from '../src/content/bosses/coleottero_imperiale/behavior';
import type { DamageEvent } from '../src/sim/types';
import { loadContent, makeSim } from './helpers';

const c = loadContent();
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};
/** Encounters of this stream implemented so far (the list grows chunk by chunk). */
const ACT4 = ['re_mantide', 'coleottero_imperiale'] as const;

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

function until(sim: Sim, cond: (sim: Sim) => boolean, timeout = 10): number {
  const steps = Math.round(timeout / sim.dt);
  for (let i = 0; i < steps; i++) {
    if (cond(sim)) return i * sim.dt;
    sim.step(emptyInput());
  }
  throw new Error('condition not reached');
}

function place(sim: Sim, a: Actor, d: number, angle = 0): void {
  const y = a.yaw + angle;
  sim.player.pos.x = a.pos.x + Math.sin(y) * d;
  sim.player.pos.z = a.pos.z + Math.cos(y) * d;
  sim.player.pos.y = sim.groundAt(sim.player.pos.x, sim.player.pos.z);
  sim.player.yaw = Math.atan2(a.pos.x - sim.player.pos.x, a.pos.z - sim.player.pos.z);
}

function force(sim: Sim, a: Actor, id: string): void {
  a.cancelAttack(sim);
  a.setState('idle');
  a.startAttack(sim, a.attackMap.get(id)!);
}

/** Drop the boss into phase `index` and wait for the transition to end. */
function toPhase(sim: Sim, a: Actor, index: number): void {
  const p = a.bossDef!.phases[index];
  a.hp = a.hpMax * (p.hp_range[0] - 0.01);
  a.checkPhase(sim);
  until(sim, () => a.phaseIndex === index && a.state !== 'transition', 12);
}

describe('act4 data', () => {
  it('every act4 boss is complete: phases, music ids, weapon, NG+ patterns, fair telegraphs', () => {
    for (const id of ACT4) {
      const b = c.boss(id);
      expect(b.act).toBe(4);
      expect(b.zone === 'little_garden' || b.zone === 'serra_giardiniere').toBe(true);
      expect(b.model.palette).toBe('act4_vivid');
      expect(b.phases.length).toBeGreaterThanOrEqual(2);
      expect(b.music).toBe(`boss_${id}`);
      b.phases.forEach((p, i) => expect(p.music).toBe(`boss_${id}_p${i + 1}`));
      expect(b.drops_weapon).toBeTruthy();
      expect(b.time_of_day_variants.alba).toBeTruthy();
      expect(b.time_of_day_variants.notte).toBeTruthy();
      for (const p of b.phases) {
        const add = b.ng_plus?.add_patterns?.[p.id] ?? [];
        expect(add.length).toBeGreaterThan(0);
        for (const a of add) {
          expect(b.attacks.some((x) => x.id === a)).toBe(true);
          expect(b.phases.some((q) => q.patterns.includes(a))).toBe(false);
        }
      }
      for (const a of b.attacks) {
        expect(a.telegraph, a.id).toBeGreaterThanOrEqual(0.35);
        expect(a.track_active ?? 0).toBeLessThanOrEqual(0.35);
        expect(a.damage_mult).toBeLessThanOrEqual(2);
      }
    }
  });

  it('every string of the act4 bosses, sequences and Voce lines exists in Italian and English', () => {
    const keys = new Set<string>();
    const seqs: string[] = ['act4_intro'];
    for (const id of ACT4) {
      const b = c.boss(id);
      [b.name_key, b.title_key, b.lore_key, ...b.dialogue_keys, ...b.phases.map((p) => p.dialogue)].forEach((k) => k && keys.add(k));
      for (const v of Object.values(b.time_of_day_variants)) if (v?.note_key) keys.add(v.note_key);
      for (const m of b.minions ?? []) if (m.name_key) keys.add(m.name_key);
      if (b.intro_sequence) seqs.push(b.intro_sequence);
      if (b.defeat_sequence) seqs.push(b.defeat_sequence);
    }
    for (const sid of seqs) {
      for (const st of c.sequence(sid).steps) for (const k of ['say', 'caption', 'voce', 'title'] as const) if (k in st) keys.add((st as Record<string, string>)[k]);
    }
    for (const v of c.bundle.voce.filter((l) => l.key.startsWith('voce.atto4.'))) keys.add(v.key);
    for (const k of keys) {
      expect(LOC.it[k], `it ${k}`).toBeTruthy();
      expect(LOC.en[k], `en ${k}`).toBeTruthy();
    }
  });

  it('the Act IV intro shrinks you: the Gardener\'s Gaze cue and the garden scale', () => {
    const steps = c.sequence('act4_intro').steps as Record<string, unknown>[];
    expect(steps.some((s) => s.event === 'cue' && (s.params as Record<string, string>).id === 'sguardo_giardiniere')).toBe(true);
    expect(steps.some((s) => s.event === 'set_scale' && (s.params as Record<string, number>).scale === c.balance.scale.garden)).toBe(true);
    const { sim } = fight('re_mantide');
    expect(sim.player.scale).toBeCloseTo(0.1, 5);
  });
});

describe('re_mantide', () => {
  it('camouflage: he vanishes, the leaves rustle behind you, and REVEAL_LEAD s later he rises there with a readable wind-up', () => {
    const { sim, boss } = fight('re_mantide');
    place(sim, boss, 2.5);
    force(sim, boss, 'camouflage');
    const ev = record(sim, 1.4);
    const rustle = ev.find(({ e }) => e.type === 'cue' && e.id === 'mantide_rustle');
    expect(rustle).toBeTruthy();
    expect(boss.hidden).toBe(true);
    expect(boss.untargetable).toBe(true);
    const pos = (rustle!.e as { pos: { x: number; z: number } }).pos;
    const pl = sim.player;
    const f = forward(pl.yaw, { x: 0, y: 0, z: 0 });
    // behind the player relative to the way they face, AMBUSH_DIST away
    expect((pos.x - pl.pos.x) * f.x + (pos.z - pl.pos.z) * f.z).toBeLessThan(0);
    expect(Math.hypot(pos.x - pl.pos.x, pos.z - pl.pos.z)).toBeCloseTo(AMBUSH_DIST, 1);
    const more = record(sim, 1.2);
    const reveal = more.find(({ e }) => e.type === 'cue' && e.id === 'mantide_reveal');
    expect(reveal).toBeTruthy();
    expect(reveal!.t + 1.4 - rustle!.t).toBeGreaterThan(REVEAL_LEAD - 0.1);
    expect(boss.hidden).toBe(false);
    expect(boss.attack?.def.id).toBe('ambush_cross');
    expect(Math.hypot(boss.pos.x - pos.x, boss.pos.z - pos.z)).toBeLessThan(0.3);
    expect(boss.attack!.def.telegraph).toBeGreaterThanOrEqual(0.7);
    expect(boss.attack!.stage).toBe('telegraph');
  });

  it('never stays hidden outside the camouflage, and ambush_cross is never picked on its own', () => {
    const { sim, boss } = fight('re_mantide');
    place(sim, boss, 2.5);
    force(sim, boss, 'camouflage');
    record(sim, 0.8);
    expect(boss.hidden).toBe(true);
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('ambush_cross')!)).toBe(true);
    boss.cancelAttack(sim);
    boss.setState('idle');
    record(sim, 0.1);
    expect(boss.hidden).toBe(false);
    expect(boss.untargetable).toBe(false);
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('ambush_cross')!)).toBe(false);
  });

  it('tight combo: a landed blow ends the chain; a missed one goes on to the next cut', () => {
    const hitRun = fight('re_mantide', { invincible: false });
    hitRun.sim.player.hpMax = 1e6;
    hitRun.sim.player.hp = 1e6;
    place(hitRun.sim, hitRun.boss, 1.1);
    force(hitRun.sim, hitRun.boss, 'combo_a');
    const ev = record(hitRun.sim, 1.0);
    expect(ev.some(({ e }) => e.type === 'playerHurt')).toBe(true);
    expect(ev.some(({ e }) => e.type === 'attackTelegraph' && e.attack === 'combo_b')).toBe(false);

    const missRun = fight('re_mantide');
    place(missRun.sim, missRun.boss, 6);
    force(missRun.sim, missRun.boss, 'combo_a');
    const ev2 = record(missRun.sim, 1.0);
    expect(ev2.some(({ e }) => e.type === 'attackTelegraph' && e.attack === 'combo_b')).toBe(true);
  });

  it('phase 2: the crown blooms and its petal fans are aimed low at the tiny player', () => {
    const { sim, boss } = fight('re_mantide');
    toPhase(sim, boss, 1);
    expect(boss.flags.has('crown_bloom')).toBe(true);
    place(sim, boss, 5);
    force(sim, boss, 'petal_burst');
    until(sim, () => {
      let n = 0;
      sim.projectiles.forEachActive((p) => { if (p.kind === 'mantide_petal') n++; });
      return n > 0;
    }, 2);
    const pl = sim.player.pos;
    let checked = 0;
    sim.projectiles.forEachActive((p) => {
      if (p.kind !== 'mantide_petal') return;
      const hs = Math.hypot(p.vel.x, p.vel.z);
      const dh = Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z);
      const yAt = p.pos.y + (p.vel.y * dh) / hs;
      expect(yAt).toBeGreaterThan(pl.y - 0.05);
      expect(yAt).toBeLessThan(pl.y + 0.25);
      checked++;
    });
    expect(checked).toBe(5);
  });

  it('dawn: the naturalist opens by studying you; night: he opens from the leaves', () => {
    const dawn = fight('re_mantide', { tod: 'alba' });
    expect(dawn.boss.flags.has('curious')).toBe(true);
    place(dawn.sim, dawn.boss, 4);
    until(dawn.sim, () => !!dawn.boss.attack, 6);
    expect(dawn.boss.attack!.def.id).toBe('study');
    until(dawn.sim, () => dawn.boss.flags.has('studying'), 1);
    expect(dawn.boss.attack?.def.id).toBe('study');
    const night = fight('re_mantide', { tod: 'notte' });
    place(night.sim, night.boss, 4);
    until(night.sim, () => !!night.boss.attack, 6);
    expect(night.boss.attack!.def.id).toBe('camouflage');
  });
});

describe('coleottero_imperiale', () => {
  const dmg = (): DamageEvent => ({ source: -1, target: 1, amount: 100, poise: 10, element: 'physical', flags: [], pos: { x: 0, y: 0, z: 0 }, instance: 1, part: -1 });

  it('armored front: blows from the front lose FRONT_ARMOR of their damage; flanks, back and Spezzato take them whole', () => {
    const { sim, boss } = fight('coleottero_imperiale');
    const front = dmg();
    boss.behavior!.modifyIncoming!(boss, sim, front, null, true);
    expect(front.amount).toBeCloseTo(100 * FRONT_ARMOR, 5);
    expect(front.poise).toBeCloseTo(10 * FRONT_POISE, 5);
    const back = dmg();
    boss.behavior!.modifyIncoming!(boss, sim, back, null, false);
    expect(back.amount).toBe(100);
    boss.setState('spezzato', 4);
    const down = dmg();
    boss.behavior!.modifyIncoming!(boss, sim, down, null, true);
    expect(down.amount).toBe(100);
  });

  it('the mandibles grab: held in front of his head for GRAB_TIME s, crushed once, dropped down with i-frames', () => {
    const { sim, boss } = fight('coleottero_imperiale', { invincible: false });
    sim.player.hpMax = 1e6;
    sim.player.hp = 1e6;
    place(sim, boss, 1.6);
    force(sim, boss, 'mandible_grab');
    const ev = record(sim, 1.5);
    expect(sim.player.state).toBe('grabbed');
    expect(ev.filter(({ e }) => e.type === 'playerHurt').length).toBe(1);
    expect(boss.flags.has('gripping')).toBe(true);
    const pl = sim.player.pos;
    expect(Math.hypot(pl.x - boss.pos.x, pl.z - boss.pos.z)).toBeCloseTo(GRAB_REACH, 1);
    expect(pl.y - sim.groundAt(pl.x, pl.z)).toBeCloseTo(GRAB_LIFT, 2);
    const after = record(sim, GRAB_TIME);
    expect(after.some(({ e }) => e.type === 'cue' && e.id === 'coleottero_release')).toBe(true);
    expect(after.filter(({ e }) => e.type === 'playerHurt').length).toBe(0);
    expect(sim.player.state).toBe('knockdown');
    expect(sim.player.invuln).toBeGreaterThan(0.3);
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('mandible_grab')!)).toBe(false);
  });

  it('the carapace slam only answers a player beside or behind him', () => {
    const { sim, boss } = fight('coleottero_imperiale');
    const slam = boss.attackMap.get('carapace_slam')!;
    place(sim, boss, 2, 0);
    expect(boss.behavior!.canUseAttack!(boss, sim, slam)).toBe(false);
    place(sim, boss, 2, Math.PI);
    expect(boss.behavior!.canUseAttack!(boss, sim, slam)).toBe(true);
    place(sim, boss, 2, Math.PI / 2);
    expect(boss.behavior!.canUseAttack!(boss, sim, slam)).toBe(true);
  });

  it('phase 2: wings open; take-off → marked bombing run → dive → landing in a punish window', () => {
    const { sim, boss } = fight('coleottero_imperiale');
    toPhase(sim, boss, 1);
    expect(boss.flags.has('wings_open')).toBe(true);
    place(sim, boss, 4);
    expect(boss.behavior!.canUseAttack!(boss, sim, boss.attackMap.get('dive_bomb')!)).toBe(false);
    force(sim, boss, 'take_off');
    until(sim, () => boss.attack?.def.id === 'bombing_run', 3);
    expect(boss.flags.has('flying')).toBe(true);
    expect(boss.pos.y - sim.groundAt(boss.pos.x, boss.pos.z)).toBeGreaterThan(2.5);
    until(sim, () => boss.attack?.def.id === 'bombing_run' && boss.attack.stage === 'active', 2);
    record(sim, 0.1);
    let clods = 0;
    sim.hazards.forEachActive((h) => { if (h.kind === 'coleottero_clod') { clods++; expect(h.delay).toBeGreaterThanOrEqual(1.0); } });
    expect(clods).toBe(5);
    until(sim, () => boss.attack?.def.id === 'dive_bomb', 4);
    const ev = record(sim, 2.0);
    expect(ev.some(({ e }) => e.type === 'cue' && e.id === 'coleottero_dive_mark')).toBe(true);
    expect(ev.some(({ e }) => e.type === 'cue' && e.id === 'coleottero_land')).toBe(true);
    expect(boss.flags.has('flying')).toBe(false);
    expect(boss.pos.y - sim.groundAt(boss.pos.x, boss.pos.z)).toBeLessThan(0.05);
    expect(boss.attack?.def.id).toBe('dive_bomb');
    expect(boss.attack!.def.recovery).toBeGreaterThanOrEqual(1.5);
  });

  it('dawn: the general salutes first, once; night: he opens with a charge', () => {
    const dawn = fight('coleottero_imperiale', { tod: 'alba' });
    place(dawn.sim, dawn.boss, 5);
    until(dawn.sim, () => !!dawn.boss.attack, 6);
    expect(dawn.boss.attack!.def.id).toBe('salute');
    record(dawn.sim, 2.5);
    expect(dawn.boss.behavior!.canUseAttack!(dawn.boss, dawn.sim, dawn.boss.attackMap.get('salute')!)).toBe(false);
    const night = fight('coleottero_imperiale', { tod: 'notte' });
    place(night.sim, night.boss, 5);
    until(night.sim, () => !!night.boss.attack, 6);
    expect(night.boss.attack!.def.id).toBe('head_charge');
  });
});
