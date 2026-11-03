/**
 * ACT I encounters 2–6: scripted mechanics of the Cavaliere Errante, the Elder Tree, the Mostro della Palude, the Great
 * Devourer and Caronte (Bible C10), their time-of-day variants and the New Game+ patterns.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dist2D, yawTo } from '../src/core/math';
import type { AttackDef, TimeOfDay } from '../src/core/types';
import type { Actor, PartRuntime } from '../src/sim/actor';
import { applyDamageToActor } from '../src/sim/combat';
import type { Sim } from '../src/sim/sim';
import { emptyInput, type AttackKind, type SimEvent } from '../src/sim/types';
import { FOOT_RADIUS, GUARD_PUNISH_AFTER, isMounted } from '../src/content/bosses/cavaliere_errante/behavior';
import { BARK_POISE_MULT, playerInFront } from '../src/content/bosses/elder_tree/behavior';
import { FIGURES, NEXT_FIGURE_DELAY, activeFigure } from '../src/content/bosses/mostro_della_palude/behavior';
import { CLUE_KEY, VOICE_FAMILY, VOICE_LEAD, VOICE_VARIANTS } from '../src/content/bosses/mostro_della_palude/voices';
import { SURFACED_ATTACKS, nearestStilt } from '../src/content/bosses/great_devourer/behavior';
import { BRIDGE_AT, CURRENT_DRIFT, LANDING, LANDING_RADIUS, stageOf } from '../src/content/bosses/caronte/behavior';
import { loadContent, makeSim, run } from './helpers';

const c = loadContent();
const ACT1 = ['cavaliere_errante', 'elder_tree', 'mostro_della_palude', 'great_devourer', 'caronte'] as const;
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};

let instance = 1;
/** A player hit on an actor (or one of its parts), through the real damage pipeline. */
function playerHit(sim: Sim, a: Actor, amount: number, poise: number, kind: AttackKind = 'heavy', part: PartRuntime | null = null): number {
  return applyDamageToActor(sim, a, {
    source: -1, target: a.id, amount, poise, element: 'physical', flags: [], pos: { ...a.pos }, instance: instance++, part: part?.index ?? -1, kind,
  }, part);
}

/** Start a fight for a boss with an untouchable player, at a time of day / New Game+ cycle. */
function fight(boss: string, opts: { seed?: number; tod?: TimeOfDay; ng?: number } = {}): { sim: Sim; boss: Actor } {
  const sim = makeSim(opts.seed ?? 3);
  if (opts.tod) sim.state.timeOfDay = opts.tod;
  if (opts.ng) sim.state.ngCycle = opts.ng;
  sim.debug.invincible = true;
  sim.startFightDirect(boss, { skipIntro: true });
  return { sim, boss: sim.boss! };
}

/** Step the sim, collecting events with their time (s since the call). */
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

/** Step until a condition holds (or fail after a timeout). */
function until(sim: Sim, cond: (sim: Sim) => boolean, timeout = 10): void {
  const steps = Math.round(timeout / sim.dt);
  for (let i = 0; i < steps; i++) {
    if (cond(sim)) return;
    sim.step(emptyInput());
  }
  throw new Error('condition not reached');
}

/** Put the player in front of an actor at a surface distance, facing it. */
function placeFront(sim: Sim, a: Actor, d: number): void {
  const r = a.radius * a.scale + d;
  sim.player.pos.x = a.pos.x + Math.sin(a.yaw) * r;
  sim.player.pos.z = a.pos.z + Math.cos(a.yaw) * r;
  sim.player.yaw = yawTo(sim.player.pos, a.pos);
}

function telegraphs(ev: { t: number; e: SimEvent }[], actor?: number): { t: number; id: string }[] {
  const out: { t: number; id: string }[] = [];
  for (const { t, e } of ev) if (e.type === 'attackTelegraph' && (actor === undefined || e.actor === actor)) out.push({ t, id: e.attack });
  return out;
}

function hasCue(ev: { e: SimEvent }[], id: string): boolean {
  return ev.some(({ e }) => e.type === 'cue' && e.id === id);
}

function attack(a: Actor, id: string): AttackDef {
  const d = a.attackMap.get(id);
  if (!d) throw new Error(`missing attack ${id}`);
  return d;
}

/* ------------------------------------------------------------------------------------------------------------------ */

describe('Cavaliere Errante — mounted duel, dismount, counter stance', () => {
  it('starts mounted and dismounts at 50%: the horse leaves, the knight duels on foot and opens with a lunge', () => {
    const { sim, boss } = fight('cavaliere_errante');
    expect(isMounted(boss)).toBe(true);
    expect(boss.parts.every((p) => p.active)).toBe(true);
    sim.drainEvents();
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    const ev = sim.drainEvents().map((e) => ({ e }));
    expect(boss.phase.id).toBe('p2');
    expect(boss.state).toBe('transition');
    expect(isMounted(boss)).toBe(false);
    expect(boss.flags.has('dismounted')).toBe(true);
    expect(boss.parts.some((p) => p.active)).toBe(false);
    expect(boss.radius).toBe(FOOT_RADIUS);
    expect(hasCue(ev, 'cavaliere_dismount')).toBe(true);
    const after = record(sim, 4);
    expect(telegraphs(after, boss.id)[0]?.id).toBe('lunge_thrust');
  });

  it('holding guard against the rider opens the unblockable guard dive', () => {
    const { sim, boss } = fight('cavaliere_errante');
    const dive = attack(boss, 'guard_dive');
    expect(dive.flags).toContain('unblockable');
    placeFront(sim, boss, dive.range ? (dive.range[0] + dive.range[1]) / 2 : 3);
    boss.bstate.guardT = 0;
    expect(boss.availableAttacks(sim).some((d) => d.id === 'guard_dive')).toBe(false);
    boss.bstate.guardT = GUARD_PUNISH_AFTER + 0.1;
    const cands = boss.availableAttacks(sim);
    expect(cands.some((d) => d.id === 'guard_dive')).toBe(true);
    expect(boss.behavior!.selectAttack!(boss, sim, cands)?.id).toBe('guard_dive');
  });

  it('counter stance on foot: frontal hits are parried and answered with the riposte, a hit on his back breaks it', () => {
    const { sim, boss } = fight('cavaliere_errante');
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    run(sim, 3.4);
    const stance = attack(boss, 'riposte_stance');
    // frontal hit: parried, no damage, riposte
    boss.cancelAttack(sim);
    placeFront(sim, boss, 2);
    boss.yaw = yawTo(boss.pos, sim.player.pos);
    boss.startAttack(sim, stance);
    until(sim, () => boss.attack?.def.id === 'riposte_stance' && boss.attack.stage === 'active');
    placeFront(sim, boss, 2);
    sim.drainEvents();
    const hp0 = boss.hp;
    expect(playerHit(sim, boss, 30, 20, 'light')).toBe(0);
    expect(boss.hp).toBe(hp0);
    expect(boss.attack?.def.id).toBe('riposte');
    expect(hasCue(sim.drainEvents().map((e) => ({ e })), 'cavaliere_parry')).toBe(true);
    // hit on the back: the stance breaks (stagger) and the blow lands
    boss.cancelAttack(sim);
    boss.setState('idle');
    placeFront(sim, boss, 2);
    boss.yaw = yawTo(boss.pos, sim.player.pos);
    boss.startAttack(sim, stance);
    until(sim, () => boss.attack?.def.id === 'riposte_stance' && boss.attack.stage === 'active');
    // the player slips behind him
    sim.player.pos.x = boss.pos.x - Math.sin(boss.yaw) * 2.5;
    sim.player.pos.z = boss.pos.z - Math.cos(boss.yaw) * 2.5;
    sim.drainEvents();
    expect(playerHit(sim, boss, 30, 20, 'light')).toBeGreaterThan(0);
    expect(boss.state).toBe('stagger');
    expect(hasCue(sim.drainEvents().map((e) => ({ e })), 'cavaliere_stance_broken')).toBe(true);
  });

  it('notte: opens by riding into the dark (hidden, untargetable) and charges out of it', () => {
    const { sim, boss } = fight('cavaliere_errante', { tod: 'notte' });
    expect(boss.flags.has('night_rider')).toBe(true);
    expect(boss.attack?.def.id).toBe('dark_charge');
    let hidden = false;
    const ev = record(sim, 3, () => {
      if (boss.attack?.def.id === 'dark_charge' && boss.hidden) {
        hidden = true;
        expect(boss.untargetable).toBe(true);
      }
      // he is back in sight before the charge hits
      if (boss.attack?.def.id === 'dark_charge' && boss.attack.stage === 'active') expect(boss.hidden).toBe(false);
    });
    expect(hidden).toBe(true);
    expect(hasCue(ev, 'cavaliere_into_dark')).toBe(true);
    expect(hasCue(ev, 'cavaliere_out_of_dark')).toBe(true);
  });

  it('alba: a chivalrous salute opener and a fair duel (never strikes a drinking or fallen player)', () => {
    const { sim, boss } = fight('cavaliere_errante', { tod: 'alba' });
    expect(boss.flags.has('chivalrous')).toBe(true);
    expect(boss.attack?.def.id).toBe('salute');
    expect(boss.availableAttacks(sim).length).toBeGreaterThan(0);
    sim.player.state = 'drink';
    expect(boss.availableAttacks(sim)).toHaveLength(0);
    sim.player.state = 'knockdown';
    expect(boss.availableAttacks(sim)).toHaveLength(0);
  });

  it('grants the Lanterna del Cavaliere and says the canon line before falling', () => {
    const def = c.boss('cavaliere_errante');
    expect(def.grants).toContain('lanterna_del_cavaliere');
    expect(def.mounted).toBe(true);
    expect(LOC.it['boss.cavaliere_errante.defeat']).toContain("L'alba non si trova. Si porta");
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe('Elder Tree — front cone, heart of light, first light', () => {
  it('branch attacks need the player in front of the bark face; behind it only roots answer', () => {
    const { sim, boss } = fight('elder_tree');
    placeFront(sim, boss, 4);
    expect(playerInFront(boss, sim)).toBe(true);
    expect(boss.availableAttacks(sim).some((d) => d.requires === 'front')).toBe(true);
    sim.player.pos.x = boss.pos.x - Math.sin(boss.yaw) * 8;
    sim.player.pos.z = boss.pos.z - Math.cos(boss.yaw) * 8;
    expect(playerInFront(boss, sim)).toBe(false);
    const behind = boss.availableAttacks(sim);
    expect(behind.length).toBeGreaterThan(0);
    expect(behind.some((d) => d.requires === 'front')).toBe(false);
  });

  it('the heart is closed in phase 1 and opens in phase 2 as a weak point that breaks Equilibrio', () => {
    const { sim, boss } = fight('elder_tree');
    const heart = boss.part('heart')!;
    expect(heart.active).toBe(false);
    expect(boss.availableAttacks(sim).some((d) => d.requires === 'heart_open')).toBe(false);
    sim.drainEvents();
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    expect(boss.flags.has('heart_open')).toBe(true);
    expect(heart.active).toBe(true);
    expect(hasCue(sim.drainEvents().map((e) => ({ e })), 'elder_heart_open')).toBe(true);
    run(sim, 3.2);
    expect(boss.invulnerable).toBe(false);
    // same heavy blow: bark x0.5, heart x poise_mult
    boss.poise = 0;
    playerHit(sim, boss, 10, 8, 'heavy', null);
    const bark = boss.poise;
    boss.poise = 0;
    playerHit(sim, boss, 10, 8, 'heavy', heart);
    const onHeart = boss.poise;
    expect(bark).toBeCloseTo(8 * BARK_POISE_MULT, 5);
    expect(onHeart).toBeCloseTo(8 * (heart.def.poise_mult ?? 1), 5);
    expect(onHeart).toBeGreaterThanOrEqual(bark * 4);
  });

  it('heavy hits on the heart reach Spezzato in far fewer blows than on the bark', () => {
    const count = (onHeart: boolean): number => {
      const { sim, boss } = fight('elder_tree');
      boss.hp = boss.hpMax * 0.49;
      boss.checkPhase(sim);
      run(sim, 3.2);
      boss.poise = 0;
      for (let n = 1; n <= 40; n++) {
        boss.cancelAttack(sim);
        if (boss.state !== 'spezzato') boss.setState('idle');
        boss.idleTimer = 99;
        playerHit(sim, boss, 5, 20, 'heavy', onHeart ? boss.part('heart')! : null);
        if (boss.state === 'spezzato') return n;
      }
      return 99;
    };
    const heart = count(true), bark = count(false);
    // Equilibrio 160: four heavy blows on the heart (x2.5), sixteen on the bark (x0.5)
    expect(heart).toBeLessThanOrEqual(4);
    expect(bark).toBeGreaterThanOrEqual(heart * 4);
  });

  it('dying, it lets the first ray of light through (cue first_light)', () => {
    const { sim, boss } = fight('elder_tree');
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    run(sim, 3.2);
    sim.drainEvents();
    boss.hp = 1;
    playerHit(sim, boss, 50, 0, 'light');
    expect(boss.alive).toBe(false);
    expect(hasCue(sim.drainEvents().map((e) => ({ e })), 'first_light')).toBe(true);
    expect(c.boss('elder_tree').lore_key).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe('Mostro della Palude — the thousand voices and the three drowned figures', () => {
  it('every voice family and the clue have whispered lines in both locales', () => {
    for (const [fam, n] of Object.entries(VOICE_VARIANTS)) {
      for (let v = 1; v <= n; v++) {
        const key = `boss.mostro_della_palude.voices.${fam}.${v}`;
        expect(LOC.it[key], key).toBeTruthy();
        expect(LOC.en[key], key).toBeTruthy();
      }
    }
    for (const fam of Object.values(VOICE_FAMILY)) expect(VOICE_VARIANTS[fam], fam).toBeGreaterThan(0);
    expect(LOC.it[CLUE_KEY]).toBeTruthy();
    expect(LOC.en[CLUE_KEY]).toBeTruthy();
    // the clue: the ferryman does not want coins
    expect(LOC.it[CLUE_KEY].toLowerCase()).toMatch(/monet/);
    // every attack of the colossus and of the figures has a voice family
    const def = c.boss('mostro_della_palude');
    for (const a of def.attacks) expect(VOICE_FAMILY[a.id], a.id).toBeTruthy();
    for (const m of def.minions ?? []) for (const a of m.attacks) expect(VOICE_FAMILY[a.id], a.id).toBeTruthy();
  });

  it('emerges from the pool and the voices whisper every attack before its telegraph', () => {
    const { sim, boss } = fight('mostro_della_palude', { seed: 5 });
    expect(boss.hidden).toBe(true);
    expect(boss.flags.has('submerged')).toBe(true);
    const ev = record(sim, 45, (s) => {
      // stay in reach so it keeps attacking
      if (dist2D(s.player.pos, boss.pos) > boss.radius * boss.scale + 6) placeFront(s, boss, 4);
    });
    const tg = telegraphs(ev, boss.id);
    expect(tg[0]?.id).toBe('emerge');
    expect(boss.hidden).toBe(false);
    expect(tg.length).toBeGreaterThanOrEqual(5);
    const whispers = ev.filter(({ e }) => e.type === 'sfx' && e.id.startsWith('voices_'));
    const captions = ev.filter(({ e }) => e.type === 'caption' && e.key.startsWith('boss.mostro_della_palude.voices.'));
    for (const { t, id } of tg) {
      const fam = VOICE_FAMILY[id];
      // the whisper of this family came first: VOICE_LEAD seconds before (emerge: on the same tick)
      const lead = id === 'emerge' ? 0 : VOICE_LEAD - 2 * sim.dt;
      const w = whispers.filter((x) => x.e.type === 'sfx' && x.e.id === `voices_${fam}` && x.t <= t - lead && x.t >= t - VOICE_LEAD - 1);
      expect(w.length, `${id} at ${t.toFixed(2)}`).toBeGreaterThan(0);
      const cap = captions.filter((x) => x.e.type === 'caption' && x.e.key.startsWith(`boss.mostro_della_palude.voices.${fam}.`) && x.t <= t - lead && x.t >= t - VOICE_LEAD - 1);
      expect(cap.length, `${id} caption`).toBeGreaterThan(0);
      for (const x of cap) if (x.e.type === 'caption') expect(LOC.en[x.e.key], x.e.key).toBeTruthy();
    }
  });

  it('phase 2 splits into three drowned figures fighting one after another; the third falling ends it', () => {
    const { sim, boss } = fight('mostro_della_palude', { seed: 2 });
    run(sim, 6);
    sim.drainEvents();
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    const split = sim.drainEvents();
    expect(boss.flags.has('split')).toBe(true);
    expect(split.some((e) => e.type === 'caption' && e.key === CLUE_KEY)).toBe(true);
    expect(split.some((e) => e.type === 'cue' && e.id === 'palude_split')).toBe(true);
    const hpAtSplit = boss.hp;
    run(sim, 3.0 + 0.6);
    for (let i = 0; i < FIGURES.length; i++) {
      const fig = activeFigure(boss, sim);
      expect(fig, `figure ${i + 1}`).toBeDefined();
      expect(fig!.defId).toBe(FIGURES[i]);
      expect(sim.actors.filter((a) => a.kind === 'minion' && a.alive)).toHaveLength(1);
      // the colossus is gone while the figures fight
      expect(boss.hidden && boss.untargetable && boss.invulnerable).toBe(true);
      expect(fig!.hpMax).toBeCloseTo(hpAtSplit / FIGURES.length, 3);
      const before = boss.hp;
      playerHit(sim, fig!, fig!.hp + 1, 0, 'heavy');
      expect(fig!.alive).toBe(false);
      if (i < FIGURES.length - 1) {
        expect(boss.hp).toBeLessThan(before);
        expect(boss.alive).toBe(true);
        run(sim, 0.5);
        expect(activeFigure(boss, sim)).toBeUndefined();
        run(sim, NEXT_FIGURE_DELAY);
      } else {
        run(sim, 0.2);
      }
    }
    expect(boss.alive).toBe(false);
  });

  it('a heap of drowned Cercatori and a lore line belong to it', () => {
    const def = c.boss('mostro_della_palude');
    expect(def.lore_key).toBeTruthy();
    expect(LOC.it[def.lore_key!]).toBeTruthy();
    expect(LOC.en[def.lore_key!]).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe('Great Devourer — from below, stilts, the pier destroyed', () => {
  it('surfaces and dives in streaks: hidden and untargetable while submerged, at most a few attacks surfaced', () => {
    const { sim, boss } = fight('great_devourer', { seed: 4 });
    const ev = record(sim, 120, (s) => {
      if (boss.flags.has('submerged')) {
        expect(boss.hidden).toBe(true);
        expect(boss.untargetable).toBe(true);
      }
      if (boss.flags.has('surfaced') && boss.state !== 'attack') expect(boss.hidden).toBe(false);
      void s;
    });
    const tg = telegraphs(ev, boss.id).map((x) => x.id);
    const dives = tg.filter((id) => id === 'dive').length;
    expect(dives).toBeGreaterThanOrEqual(2);
    // surfaced attacks between two dives never exceed the streak
    let streak = 0;
    for (const id of tg) {
      if (id === 'dive') {
        expect(streak).toBeLessThanOrEqual(SURFACED_ATTACKS[1]);
        streak = 0;
      } else if (boss.attackMap.get(id)?.requires === 'surfaced') streak++;
    }
    expect(hasCue(ev, 'devourer_submerge')).toBe(true);
    expect(hasCue(ev, 'devourer_surface')).toBe(true);
  });

  it('coils need a stilt nearby; phase 2 destroys the pier (rafts and logs) and the stilts are gone', () => {
    const { sim, boss } = fight('great_devourer');
    expect(nearestStilt(sim, 1e9)).toBeGreaterThanOrEqual(0);
    sim.drainEvents();
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    const ev = sim.drainEvents().map((e) => ({ e }));
    expect(boss.flags.has('pier_destroyed')).toBe(true);
    expect(sim.zone!.arenaVariant).toBe('pier_destroyed');
    expect(hasCue(ev, 'arena_state:pier_destroyed')).toBe(true);
    expect(nearestStilt(sim, 1e9)).toBe(-1);
    run(sim, 3.4);
    expect(boss.availableAttacks(sim).some((d) => d.requires === 'near_stilt')).toBe(false);
  });

  it('is a mini boss: no dialogue, no lore', () => {
    const def = c.boss('great_devourer');
    expect(def.dialogue_keys).toHaveLength(0);
    expect(def.lore_key ?? null).toBeNull();
    expect(def.intro_sequence ?? null).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe('Caronte — boat, bridge of souls, luminous current', () => {
  it('at 78% the bridge of souls rises and he waits on the landing', () => {
    const { sim, boss } = fight('caronte');
    expect(stageOf(boss)).toBe('boat');
    boss.hp = boss.hpMax * (BRIDGE_AT - 0.01);
    until(sim, () => stageOf(boss) === 'bridge', 12);
    expect(sim.zone!.arenaVariant).toBe('soul_bridge');
    expect(boss.flags.has('bridge')).toBe(true);
    until(sim, () => boss.attack?.def.id !== 'raise_bridge', 6);
    run(sim, 2);
    const cc = sim.arenaCenter();
    expect(Math.hypot(boss.pos.x - (cc.x + LANDING[0]), boss.pos.z - (cc.z + LANDING[1]))).toBeLessThanOrEqual(LANDING_RADIUS + 0.05);
    // the oar sweeps the bridge
    expect(boss.availableAttacks(sim).some((d) => d.requires === 'bridge')).toBe(true);
  });

  it('phase 2 sinks the boat: the duel continues on the luminous current, which drifts the player downstream', () => {
    const { sim, boss } = fight('caronte');
    boss.hp = boss.hpMax * 0.49;
    boss.checkPhase(sim);
    expect(stageOf(boss)).toBe('current');
    expect(sim.zone!.arenaVariant).toBe('current');
    expect(boss.flags.has('boat_sunk')).toBe(true);
    run(sim, 3.6);
    const cc = sim.arenaCenter();
    sim.player.pos.x = cc.x - 6;
    sim.player.pos.z = cc.z - 4;
    sim.player.pos.y = sim.groundAt(sim.player.pos.x, sim.player.pos.z);
    run(sim, 0.2, (s) => {
      s.boss!.idleTimer = 99;
      return emptyInput();
    });
    const z0 = sim.player.pos.z;
    run(sim, 2, (s) => {
      s.boss!.cancelAttack(s);
      s.boss!.idleTimer = 99;
      return emptyInput();
    });
    expect(sim.player.pos.z - z0).toBeGreaterThan(CURRENT_DRIFT * 2 * 0.8);
    expect(sim.player.pos.z - z0).toBeLessThan(CURRENT_DRIFT * 2 * 1.2);
  });

  it('souls follow the time of day: few but fast by day, many but slow by night', () => {
    const volley = (tod: TimeOfDay): { count: number; speed: number } => {
      const { sim, boss } = fight('caronte', { tod });
      run(sim, 0.1);
      boss.cancelAttack(sim);
      placeFront(sim, boss, 10);
      boss.startAttack(sim, attack(boss, 'soul_volley'));
      const ids = new Set<number>();
      let speed = 0;
      until(sim, () => {
        sim.projectiles.forEachActive((p) => {
          if (p.owner !== boss.id || p.kind !== 'caronte_soul' || ids.has(p.id)) return;
          ids.add(p.id);
          speed = Math.max(speed, Math.hypot(p.vel.x, p.vel.y, p.vel.z));
        });
        return ids.size > 0 && boss.attack?.stage === 'recovery';
      }, 4);
      return { count: ids.size, speed };
    };
    const base = volley('tramonto'), day = volley('giorno'), night = volley('notte');
    const tv = c.boss('caronte').time_of_day_variants;
    expect(day.count).toBe(Math.round(base.count * (tv.giorno!.spawn_mult ?? 1)));
    expect(night.count).toBe(Math.round(base.count * (tv.notte!.spawn_mult ?? 1)));
    expect(day.count).toBeLessThan(base.count);
    expect(night.count).toBeGreaterThan(base.count);
    expect(day.speed).toBeCloseTo(base.speed * (tv.giorno!.projectile_speed_mult ?? 1), 1);
    expect(night.speed).toBeCloseTo(base.speed * (tv.notte!.projectile_speed_mult ?? 1), 1);
    expect(day.speed).toBeGreaterThan(night.speed);
  });

  it('says the canon line and wants a memory, not a coin; the defeat ferries the Portatore to the Porta di Dite', () => {
    expect(LOC.it['boss.caronte.intro2']).toContain('Non hai ombra, Portatore. Né passato.');
    const def = c.boss('caronte');
    const seq = c.sequence(def.defeat_sequence!);
    expect(JSON.stringify(seq)).toMatch(/travel/);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe('ACT I New Game+ (Ciclo dell\'Alba)', () => {
  for (const id of ACT1) {
    it(`${id}: new attacks per phase exist only in NG+ and are used there`, () => {
      const def = c.boss(id);
      const add = def.ng_plus?.add_patterns ?? {};
      const ngIds = new Set(Object.values(add).flat());
      expect(Object.keys(add).sort()).toEqual(def.phases.map((p) => p.id).sort());
      const all = new Set([...def.attacks.map((a) => a.id), ...(def.minions ?? []).flatMap((m) => m.attacks.map((a) => a.id))]);
      for (const p of def.phases) {
        for (const a of add[p.id] ?? []) {
          expect(all.has(a), `${a} defined`).toBe(true);
          expect(p.patterns.includes(a), `${a} not in base ${p.id}`).toBe(false);
        }
      }
      const p1New = add.p1 ?? [];
      const sample = (ng: number): { avail: Set<string>; used: Set<string> } => {
        const { sim, boss } = fight(id, { ng, seed: 7 });
        const avail = new Set<string>();
        let i = 0;
        const ev = record(sim, 90, (s) => {
          // stay near so the whole repertoire qualifies; never let it reach phase 2
          if (dist2D(s.player.pos, boss.pos) > boss.radius * boss.scale + 7) placeFront(s, boss, 4);
          boss.hp = Math.max(boss.hp, boss.hpMax * 0.9);
          if (i++ % 15 === 0) for (const d of boss.availableAttacks(s)) avail.add(d.id);
        });
        return { avail, used: new Set(telegraphs(ev, boss.id).map((x) => x.id)) };
      };
      const base = sample(0);
      for (const a of ngIds) {
        expect(base.avail.has(a), `${a} available without NG+`).toBe(false);
        expect(base.used.has(a), `${a} used without NG+`).toBe(false);
      }
      const ng = sample(1);
      expect(p1New.some((a) => ng.avail.has(a)), `NG+ p1 available: ${[...ng.avail].join(',')}`).toBe(true);
      expect(p1New.some((a) => ng.used.has(a)), `NG+ p1 used: ${[...ng.used].join(',')}`).toBe(true);
    });
  }

  it('mostro_della_palude: each drowned figure gains its NG+ attack only in New Game+', () => {
    const figureNg = (ng: number): string[] => {
      const { sim, boss } = fight('mostro_della_palude', { ng });
      run(sim, 6);
      boss.hp = boss.hpMax * 0.49;
      boss.checkPhase(sim);
      run(sim, 3.6);
      const fig = activeFigure(boss, sim)!;
      return fig.availableAttacks(sim).filter((d) => d.requires === 'ng').map((d) => d.id);
    };
    expect(figureNg(0)).toHaveLength(0);
    expect(figureNg(1)).toEqual(['ng_lantern_whirl']);
  });
});
