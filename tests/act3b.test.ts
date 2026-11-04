/**
 * ACT III-B encounters 17–22 (Bible C10): scripted mechanics of the Grande Lupo (howl → snowstorm with wind and gusts,
 * tail only from behind, phase 2 split into a spirit that fights alongside him one blow at a time, pack leap, recall of a
 * dispersed spirit, dawn circling), the Grande Orso (the hug: held, crushed once, dropped; back kick; phase 2 standing,
 * the shaken forest drops marked trees on a fixed rhythm), their time-of-day variants, New Game+ patterns and IT/EN strings.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TimeOfDay } from '../src/core/types';
import type { Actor } from '../src/sim/actor';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type SimEvent } from '../src/sim/types';
import { CIRCLE_TIME, PACK_DELAY, RESPLIT_DELAY, STORM_DUR, STORM_EARLIEST, WIND_SPEED, guardMultiHit, spiritOf } from '../src/content/bosses/grande_lupo/behavior';
import { HUG_TIME, TREE_INTERVAL, TREE_MIN } from '../src/content/bosses/grande_orso/behavior';
import { loadContent, makeSim } from './helpers';

const c = loadContent();
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};
/** Encounters of this stream implemented so far (the list grows chunk by chunk). */
const ACT3B = ['grande_lupo', 'grande_orso'] as const;

function fight(boss: string, opts: { seed?: number; tod?: TimeOfDay; ng?: number } = {}): { sim: Sim; boss: Actor } {
  const sim = makeSim(opts.seed ?? 3);
  if (opts.tod) sim.state.timeOfDay = opts.tod;
  if (opts.ng) sim.state.ngCycle = opts.ng;
  sim.debug.invincible = true;
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

const can = (sim: Sim, a: Actor, id: string): boolean => a.behavior!.canUseAttack!(a, sim, a.attackMap.get(id)!);

/** Drop the boss into phase 2 and wait for the transition to end. */
function toPhase2(sim: Sim, a: Actor): void {
  a.hp = a.hpMax * 0.49;
  a.checkPhase(sim);
  until(sim, () => a.phaseIndex === 1 && a.state !== 'transition', 12);
}

describe('act3b data', () => {
  it('every act3b boss is complete: phases, music ids, weapon, NG+ patterns defined', () => {
    for (const id of ACT3B) {
      const b = c.boss(id);
      expect(b.phases.length).toBeGreaterThanOrEqual(2);
      expect(b.music).toBe(`boss_${id}`);
      b.phases.forEach((p, i) => expect(p.music).toBe(`boss_${id}_p${i + 1}`));
      expect(b.drops_weapon).toBeTruthy();
      for (const p of b.phases) {
        const add = b.ng_plus?.add_patterns?.[p.id] ?? [];
        expect(add.length).toBeGreaterThan(0);
        for (const a of add) expect(b.attacks.some((x) => x.id === a)).toBe(true);
      }
      for (const a of b.attacks) {
        expect(a.telegraph).toBeGreaterThanOrEqual(0.35);
        expect(a.track_active ?? 0).toBeLessThanOrEqual(0.35);
        expect(a.damage_mult).toBeLessThanOrEqual(2);
      }
    }
  });

  it('every string of the act3b bosses and sequences exists in Italian and English', () => {
    const keys = new Set<string>();
    for (const id of ACT3B) {
      const b = c.boss(id);
      [b.name_key, b.title_key, b.lore_key, ...b.dialogue_keys, ...b.phases.map((p) => p.dialogue)].forEach((k) => k && keys.add(k));
      for (const v of Object.values(b.time_of_day_variants)) if (v?.note_key) keys.add(v.note_key);
      for (const m of b.minions ?? []) if (m.name_key) keys.add(m.name_key);
      for (const sid of [b.intro_sequence, b.defeat_sequence]) {
        const seq = sid ? c.sequence(sid) : undefined;
        for (const st of seq?.steps ?? []) for (const k of ['say', 'caption', 'voce'] as const) if (k in st) keys.add((st as Record<string, string>)[k]);
      }
    }
    for (const v of c.bundle.voce.filter((l) => l.key.startsWith('voce.atto3.'))) keys.add(v.key);
    for (const k of keys) {
      expect(LOC.it[k], `it ${k}`).toBeTruthy();
      expect(LOC.en[k], `en ${k}`).toBeTruthy();
    }
  });
});

describe('grande_lupo', () => {
  it('the howl is never called in the first seconds; then it raises the storm for STORM_DUR s', () => {
    const { sim, boss } = fight('grande_lupo');
    expect(can(sim, boss, 'howl')).toBe(false);
    expect(can(sim, boss, 'storm_gust')).toBe(false);
    expect(can(sim, boss, 'storm_lunge')).toBe(false);
    boss.bstate.fightT = STORM_EARLIEST + 0.1;
    expect(can(sim, boss, 'howl')).toBe(true);
    force(sim, boss, 'howl');
    const ev = record(sim, 2.4);
    expect(ev.some(({ e }) => e.type === 'cue' && e.id === 'lupo_storm_start')).toBe(true);
    expect(boss.flags.has('snowstorm')).toBe(true);
    expect(can(sim, boss, 'storm_gust')).toBe(true);
    expect(can(sim, boss, 'storm_lunge')).toBe(true);
    expect(can(sim, boss, 'howl')).toBe(false);
    const end = record(sim, STORM_DUR);
    expect(end.some(({ e }) => e.type === 'cue' && e.id === 'lupo_storm_end')).toBe(true);
    expect(boss.flags.has('snowstorm')).toBe(false);
  });

  it('the storm wind drifts the player at WIND_SPEED (slower than a walk)', () => {
    const { sim, boss } = fight('grande_lupo');
    boss.behavior!.onCustomEvent!(boss, sim, 'storm_start', { t: 0, type: 'custom' }, null);
    boss.setState('scripted');
    const ctr = sim.arenaCenter();
    sim.player.pos.x = ctr.x; sim.player.pos.z = ctr.z;
    const x0 = sim.player.pos.x, z0 = sim.player.pos.z;
    record(sim, 1.0, (s) => { s.boss!.setState('scripted'); });
    const moved = Math.hypot(sim.player.pos.x - x0, sim.player.pos.z - z0);
    expect(moved).toBeGreaterThan(WIND_SPEED * 0.8);
    expect(moved).toBeLessThan(WIND_SPEED * 1.2);
    const dir = (sim.player.pos.x - x0) * boss.bstate.windX + (sim.player.pos.z - z0) * boss.bstate.windZ;
    expect(dir / moved).toBeGreaterThan(0.95);
    expect(WIND_SPEED).toBeLessThan(sim.bal.player.walk);
  });

  it('the tail sweeps only whoever is behind him', () => {
    const { sim, boss } = fight('grande_lupo');
    place(sim, boss, 4, 0);
    expect(can(sim, boss, 'tail_sweep')).toBe(false);
    place(sim, boss, 4, Math.PI);
    expect(can(sim, boss, 'tail_sweep')).toBe(true);
  });

  it('phase 2 splits him into a spirit that fights alongside him, one blow at a time', () => {
    const { sim, boss } = fight('grande_lupo');
    toPhase2(sim, boss);
    expect(boss.flags.has('split')).toBe(true);
    const sp = spiritOf(boss, sim)!;
    expect(sp).toBeTruthy();
    expect(sp.flags.has('spirit')).toBe(true);
    // he strikes: the spirit waits
    force(sim, boss, 'bite');
    expect(sp.behavior!.canUseAttack!(sp, sim, sp.attacks[0])).toBe(false);
    // the spirit strikes: he waits (and drops a combo follow-up)
    boss.cancelAttack(sim);
    boss.setState('idle');
    sp.setState('idle');
    sp.startAttack(sim, sp.attacks[0]);
    expect(boss.behavior!.selectAttack!(boss, sim, [boss.attackMap.get('bite')!])).toBeNull();
  });

  it('pack_lunge sends the spirit leap PACK_DELAY s after his own, never on a downed player', () => {
    const { sim, boss } = fight('grande_lupo');
    toPhase2(sim, boss);
    const sp = spiritOf(boss, sim)!;
    sp.cancelAttack(sim);
    sp.setState('idle');
    sp.idleTimer = 99;
    boss.behavior!.onCustomEvent!(boss, sim, 'pack', { t: 0, type: 'custom' }, null);
    record(sim, PACK_DELAY - 0.1, (s) => { s.boss!.setState('scripted'); });
    expect(sp.attack).toBeNull();
    record(sim, 0.2, (s) => { s.boss!.setState('scripted'); });
    expect(sp.attack?.def.id).toBe('spirit_leap');
    // the player is down: no follow-up
    sp.cancelAttack(sim);
    sp.setState('idle');
    boss.behavior!.onCustomEvent!(boss, sim, 'pack', { t: 0, type: 'custom' }, null);
    record(sim, PACK_DELAY + 0.1, (s) => { s.boss!.setState('scripted'); s.player.setState('knockdown', 2); });
    expect(sp.attack).toBeNull();
  });

  it('a dispersed spirit is howled back only after RESPLIT_DELAY s; it fades when he falls', () => {
    const { sim, boss } = fight('grande_lupo');
    toPhase2(sim, boss);
    const sp = spiritOf(boss, sim)!;
    sp.lifetime = 0.01;
    record(sim, 0.5, (s) => { s.boss!.setState('scripted'); });
    expect(spiritOf(boss, sim)).toBeUndefined();
    expect(can(sim, boss, 'spirit_call')).toBe(false);
    expect(can(sim, boss, 'pack_lunge')).toBe(false);
    boss.bstate.spiritGone = RESPLIT_DELAY + 0.1;
    expect(can(sim, boss, 'spirit_call')).toBe(true);
    boss.setState('idle');
    boss.behavior!.onCustomEvent!(boss, sim, 'split', { t: 0, type: 'custom' }, null);
    const back = spiritOf(boss, sim)!;
    expect(back).toBeTruthy();
    boss.behavior!.onDeath!(boss, sim);
    record(sim, 0.3, (s) => { s.boss!.setState('scripted'); });
    expect(back.alive).toBe(false);
  });

  it('no stun-lock: after one window of a multi-hit blow lands, the later windows skip the player', () => {
    const { sim, boss } = fight('grande_lupo', { ng: 1 });
    boss.attackMap.set('probe', { id: 'probe', telegraph: 0.5, active: 1, recovery: 1, damage_mult: 1, poise: 10, flags: [], hits: [
      { t: 0, dur: 0.1, shape: { type: 'sphere', c: [0, 0, 0], r: 1 } }, { t: 0.5, dur: 0.1, shape: { type: 'sphere', c: [0, 0, 0], r: 1 } }] });
    force(sim, boss, 'probe');
    boss.attack!.windows[0].hitTargets.add(-1);
    guardMultiHit(boss);
    expect(boss.attack!.windows[1].hitTargets.has(-1)).toBe(true);
  });

  it('time of day: at dawn he circles first, at night the storm comes with the first howl; NG+ adds the bite chain', () => {
    const dawn = fight('grande_lupo', { tod: 'alba' });
    expect(dawn.boss.flags.has('circling')).toBe(true);
    const ev = record(dawn.sim, CIRCLE_TIME - 0.3);
    expect(ev.some(({ e }) => e.type === 'attackTelegraph')).toBe(false);
    const night = fight('grande_lupo', { tod: 'notte' });
    const nev = record(night.sim, 3);
    expect(nev.some(({ e }) => e.type === 'cue' && e.id === 'lupo_storm_start')).toBe(true);
    const ng = fight('grande_lupo', { ng: 1 });
    expect(ng.boss.availableAttacks(ng.sim).some((a) => a.id === 'ng_triple_bite')).toBe(true);
    expect(ng.boss.attackMap.get('ng_triple_bite')!.combo_next).toBe('ng_bite_b');
  });
});

describe('grande_orso', () => {
  it('the hug holds the player against his chest for HUG_TIME s, then drops them with i-frames (one hit only)', () => {
    const { sim, boss } = fight('grande_orso');
    sim.debug.invincible = false;
    place(sim, boss, 3.6, 0);
    force(sim, boss, 'hug');
    let hurt = 0;
    const ev = record(sim, 2.6, (s) => { if (s.boss!.state === 'idle') s.boss!.setState('scripted'); });
    for (const { e } of ev) if (e.type === 'playerHurt') hurt++;
    const caught = ev.find(({ e }) => e.type === 'cue' && e.id === 'orso_hug_caught');
    const rel = ev.find(({ e }) => e.type === 'cue' && e.id === 'orso_hug_release');
    expect(caught && rel).toBeTruthy();
    expect(rel!.t - caught!.t).toBeGreaterThan(HUG_TIME - 0.05);
    expect(rel!.t - caught!.t).toBeLessThan(HUG_TIME + 0.1);
    expect(hurt).toBe(1);
    expect(sim.player.grabbedBy).toBe(-1);
    expect(boss.flags.has('hugging')).toBe(false);
    // never on a player who is down
    sim.player.setState('knockdown', 1);
    expect(can(sim, boss, 'hug')).toBe(false);
  });

  it('the back kick only meets whoever stands behind him, and comes first there', () => {
    const { sim, boss } = fight('grande_orso');
    place(sim, boss, 4, 0);
    expect(can(sim, boss, 'rear_kick')).toBe(false);
    place(sim, boss, 4, Math.PI);
    expect(can(sim, boss, 'rear_kick')).toBe(true);
    const pick = boss.behavior!.selectAttack!(boss, sim, [boss.attackMap.get('paw_swipe')!, boss.attackMap.get('rear_kick')!]);
    expect(pick?.id).toBe('rear_kick');
  });

  it('phase 2: he stands and shakes the forest at once, then trees fall every TREE_INTERVAL s (never sooner than TREE_MIN)', () => {
    const { sim, boss } = fight('grande_orso');
    expect(can(sim, boss, 'forest_shake')).toBe(false);
    toPhase2(sim, boss);
    expect(boss.flags.has('standing')).toBe(true);
    const ev = record(sim, 3);
    expect(ev.some(({ e }) => e.type === 'cue' && e.id === 'orso_forest_shake')).toBe(true);
    let trees = 0;
    sim.hazards.forEachActive((h) => { if (h.kind === 'orso_tree') trees++; });
    expect(trees).toBeGreaterThan(0);
    expect(boss.bstate.sinceShake).toBeLessThan(3.1);
    expect(can(sim, boss, 'forest_shake')).toBe(false);
    boss.bstate.sinceShake = TREE_MIN + 0.1;
    expect(can(sim, boss, 'forest_shake')).toBe(true);
    const cands = [boss.attackMap.get('paw_swipe')!, boss.attackMap.get('forest_shake')!];
    expect(boss.behavior!.selectAttack!(boss, sim, cands)).toBeUndefined();
    boss.bstate.sinceShake = TREE_INTERVAL + 0.1;
    expect(boss.behavior!.selectAttack!(boss, sim, cands)?.id).toBe('forest_shake');
  });

  it('time of day and NG+: dawn grabs more and charges less, night opens head-down; NG+ adds the double charge and the timber', () => {
    const b = c.boss('grande_orso');
    expect(b.time_of_day_variants.alba?.weights?.hug).toBeGreaterThan(1);
    expect(b.time_of_day_variants.alba?.weights?.head_charge).toBeLessThan(1);
    const night = fight('grande_orso', { tod: 'notte' });
    const opened = night.boss.attack?.def.id ?? (record(night.sim, 1.0), night.boss.attack?.def.id);
    expect(opened).toBe('head_charge');
    const ng = fight('grande_orso', { ng: 1 });
    expect(ng.boss.availableAttacks(ng.sim).some((a) => a.id === 'ng_double_charge')).toBe(true);
    expect(b.ng_plus?.add_patterns?.p2).toContain('ng_timber');
  });
});
