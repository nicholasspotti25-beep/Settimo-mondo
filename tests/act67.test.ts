/**
 * ACTS VI–VII encounters 33–38 (Bible C10): scripted mechanics implemented so far — Lucifero II (opening line by the first
 * encounter's choice, the defeat callback to the Piuma Nera / Cicatrice, the red-hot glass of p2, la Caduta parryable by any
 * weapon and breaking his Equilibrio, never started at a player on the floor), the Drago del Vuoto (reverse walk, tail blows
 * only behind it, gravity inverted in p2 and restored at its death), the Verme Mangiamondi (the arena shrinks at each swallow,
 * millstones in p2, one blow at a time), plus the data rules shared by every act67 boss and the IT/EN strings.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANON_MINI } from '../tools/canon/bible';
import type { Actor } from '../src/sim/actor';
import type { Sim } from '../src/sim/sim';
import { Btn, emptyInput, type PlayerInput, type SimEvent } from '../src/sim/types';
import { CADUTA_ID, GLASS_KIND, GLASS_PATCHES } from '../src/content/bosses/lucifero_2/behavior';
import { BEHIND_ANGLE, playerAngle } from '../src/content/bosses/drago_del_vuoto/behavior';
import { SEGMENTS, SWALLOW_RADIUS, segmentsOf } from '../src/content/bosses/verme_mangiamondi/behavior';
import { loadContent, makeSim } from './helpers';

const c = loadContent();
const ROOT = path.resolve(__dirname, '..');
const LOC = {
  it: JSON.parse(readFileSync(path.join(ROOT, 'locales/it.json'), 'utf8')) as Record<string, string>,
  en: JSON.parse(readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')) as Record<string, string>,
};
/** Encounters of this stream implemented so far (the list grows chunk by chunk). */
const ACT67 = ['lucifero_2', 'drago_del_vuoto', 'verme_mangiamondi'] as const;

function fight(boss: string, opts: { seed?: number; invincible?: boolean; intro?: boolean; setup?: (sim: Sim) => void } = {}): { sim: Sim; boss: Actor } {
  const sim = makeSim(opts.seed ?? 5);
  sim.debug.invincible = opts.invincible ?? true;
  opts.setup?.(sim);
  sim.startFightDirect(boss, { skipIntro: !opts.intro });
  return { sim, boss: sim.boss! };
}
function steps(sim: Sim, seconds: number, each?: (sim: Sim, events: SimEvent[]) => PlayerInput | void): void {
  const n = Math.round(seconds / sim.dt);
  let inp: PlayerInput = emptyInput();
  for (let i = 0; i < n; i++) {
    sim.step(inp);
    inp = each?.(sim, sim.drainEvents()) ?? emptyInput();
  }
}
function toHp(sim: Sim, a: Actor, frac: number): void {
  a.hp = a.hpMax * frac;
  a.checkPhase(sim);
}
function force(sim: Sim, a: Actor, id: string): void {
  a.cancelAttack(sim);
  a.setState('idle');
  a.startAttack(sim, a.attackMap.get(id)!);
}
function dialogueKeys(sim: Sim, seconds: number): string[] {
  const keys: string[] = [];
  steps(sim, seconds, (_s, ev) => {
    for (const e of ev) if (e.type === 'dialogue') keys.push(e.key);
    const i = emptyInput();
    i.presses = Btn.Advance;
    return i;
  });
  return keys;
}

describe('act67 data rules', () => {
  for (const id of ACT67) {
    const b = c.boss(id);
    it(`${id}: phases, music ids, NG+ patterns, fair telegraphs`, () => {
      expect(b.music).toBe(`boss_${id}`);
      b.phases.forEach((p, i) => expect(p.music).toBe(`boss_${id}_p${i + 1}`));
      const ng = Object.values(b.ng_plus?.add_patterns ?? {}).flat();
      expect(ng.length).toBeGreaterThanOrEqual(b.phases.length);
      for (const pid of ng) expect(b.attacks.some((a) => a.id === pid)).toBe(true);
      for (const a of [...b.attacks, ...(b.minions ?? []).flatMap((m) => m.attacks)]) {
        expect(a.telegraph, `${id}.${a.id} telegraph`).toBeGreaterThanOrEqual(0.75);
        if (a.flags.includes('red')) expect(a.telegraph).toBeGreaterThanOrEqual(0.8);
        expect(a.track_active ?? 0, `${id}.${a.id} track_active`).toBeLessThanOrEqual(0.35);
        expect(a.damage_mult).toBeLessThanOrEqual(2.0);
        const multi = (a.hits ?? []).filter((h) => !h.tick).length > 1;
        if (multi && a.poise >= 25) expect(a.one_blow, `${id}.${a.id} one_blow`).toBe(true);
      }
      if (CANON_MINI.includes(id)) {
        expect(b.dialogue_keys).toEqual([]);
        expect(b.lore_key).toBeUndefined();
      } else {
        for (const k of b.dialogue_keys) {
          expect(LOC.it[k], k).toBeTruthy();
          expect(LOC.en[k], k).toBeTruthy();
        }
      }
    });
  }
  it('canonical Italian quotes are verbatim', () => {
    expect(LOC.it['boss.lucifero_2.fought']).toBe('Sei tornato a prendere il resto del colpo.');
    expect(LOC.it['boss.lucifero_2.begged']).toBe('Sei tornato in piedi. Mi piace di più.');
    expect(LOC.it['boss.lucifero_2.no']).toBe('Io ho perso il cielo per aver detto no. Dimostrami che il tuo sì valga.');
    expect(LOC.it['boss.lucifero_2.porta']).toBe('Il cielo, ora, è sotto di noi.');
  });
});

describe('Lucifero II', () => {
  it('opens with the line of the first encounter: fought / begged', () => {
    for (const [choice, key] of [['fought', 'boss.lucifero_2.fought'], ['begged', 'boss.lucifero_2.begged']] as const) {
      const { sim } = fight('lucifero_2', { intro: true, setup: (s) => (s.state.luciferoChoice = choice) });
      const keys = dialogueKeys(sim, 25);
      expect(keys[0]).toBe(key);
      expect(keys).toContain('boss.lucifero_2.no');
      expect(keys).not.toContain(choice === 'fought' ? 'boss.lucifero_2.begged' : 'boss.lucifero_2.fought');
    }
  });

  it('defeat recalls the feather or the scar, opens the Porta Rovesciata and grants Abisso Rosso', () => {
    for (const [item, key] of [['piuma_nera', 'boss.lucifero_2.piuma'], ['cicatrice_del_rifiuto', 'boss.lucifero_2.cicatrice']] as const) {
      const { sim } = fight('lucifero_2', { setup: (s) => s.giveItem(item) });
      sim.debugKillBoss();
      const keys = dialogueKeys(sim, 30);
      expect(keys).toContain(key);
      expect(keys[keys.length - 1]).toBe('boss.lucifero_2.porta');
      expect(sim.state.defeated).toContain('lucifero_2');
      expect(sim.state.forms).toContain('abisso_rosso');
    }
  });

  it('phase 2 lays the red-hot glass patches once', () => {
    const { sim, boss } = fight('lucifero_2');
    steps(sim, 1);
    toHp(sim, boss, 0.6);
    steps(sim, 4);
    toHp(sim, boss, 0.3);
    steps(sim, 4);
    let n = 0;
    sim.hazards.forEachActive((h) => { if (h.kind === GLASS_KIND) n++; });
    expect(n).toBe(GLASS_PATCHES.length);
    expect(boss.flags.has('embers')).toBe(true);
    expect(boss.flags.has('wings_of_fire')).toBe(true);
  });

  it('la Caduta: unavoidable, parryable by any weapon at the instant; a parry breaks his Equilibrio', () => {
    const def = c.boss('lucifero_2').attacks.find((a) => a.id === CADUTA_ID)!;
    expect(def.flags).toEqual(expect.arrayContaining(['unavoidable', 'red', 'parry_final']));
    const { sim, boss } = fight('lucifero_2', { invincible: false });
    toHp(sim, boss, 0.3);
    steps(sim, 4);
    // a weapon that cannot normally parry
    const w = sim.player.weapon(sim);
    expect(w?.parry_capable ?? false).toBe(false);
    const pl = sim.player;
    pl.pos.x = boss.pos.x; pl.pos.z = boss.pos.z + 8; pl.yaw = Math.PI;
    boss.yaw = 0;
    force(sim, boss, CADUTA_ID);
    let pressed = false;
    steps(sim, 3.6, (s) => {
      const atk = boss.attack;
      const i = emptyInput();
      if (atk && atk.def.id === CADUTA_ID && atk.stage === 'telegraph' && !pressed) {
        pl.yaw = Math.atan2(boss.pos.x - pl.pos.x, boss.pos.z - pl.pos.z);
        const left = (atk.def.telegraph - atk.time) / atk.rate;
        if (left <= 0.05 + s.dt) { i.presses = Btn.Guard; pressed = true; }
      }
      return i;
    });
    expect(pressed).toBe(true);
    expect(boss.state).toBe('spezzato');
    expect(sim.player.hp).toBe(sim.player.hpMax);
  });

  it('la Caduta unparried hurts but never kills from full Health, and is never started at a player on the floor', () => {
    const { sim, boss } = fight('lucifero_2', { invincible: false });
    toHp(sim, boss, 0.3);
    steps(sim, 4);
    const pl = sim.player;
    force(sim, boss, CADUTA_ID);
    steps(sim, 3.4);
    expect(pl.hp).toBeGreaterThan(0);
    expect(pl.hp).toBeLessThan(pl.hpMax);
    const def = boss.attackMap.get(CADUTA_ID)!;
    boss.bstate.lastCaduta = -999;
    pl.setState('knockdown', 2);
    expect(boss.behavior!.canUseAttack!(boss, sim, def)).toBe(false);
  });
});

describe('Drago del Vuoto', () => {
  it('walks backward toward a far player; tail blows only toward who is behind it', () => {
    const { sim, boss } = fight('drago_del_vuoto');
    steps(sim, 0.5);
    boss.cancelAttack(sim);
    boss.setState('idle');
    boss.idleTimer = 99;
    sim.player.pos.x = boss.pos.x; sim.player.pos.z = boss.pos.z + 30;
    const d0 = Math.hypot(sim.player.pos.x - boss.pos.x, sim.player.pos.z - boss.pos.z);
    steps(sim, 1.5);
    const d1 = Math.hypot(sim.player.pos.x - boss.pos.x, sim.player.pos.z - boss.pos.z);
    expect(d1).toBeLessThan(d0);
    expect(Math.abs(playerAngle(boss, sim))).toBeGreaterThan(BEHIND_ANGLE);
    const tail = boss.attackMap.get('tail_lash')!;
    expect(boss.behavior!.canUseAttack!(boss, sim, tail)).toBe(true);
    boss.yaw = Math.atan2(sim.player.pos.x - boss.pos.x, sim.player.pos.z - boss.pos.z);
    expect(boss.behavior!.canUseAttack!(boss, sim, tail)).toBe(false);
  });

  it('phase 2 inverts the gravity of the arena; its death restores it', () => {
    const { sim, boss } = fight('drago_del_vuoto');
    steps(sim, 1);
    expect(sim.zone!.gravitySign).toBe(1);
    toHp(sim, boss, 0.45);
    steps(sim, 0.5);
    expect(sim.zone!.gravitySign).toBe(-1);
    expect(sim.player.ceiling).toBe(true);
    sim.debugKillBoss();
    steps(sim, 1);
    expect(sim.zone!.gravitySign).toBe(1);
  });
});

describe('Verme Mangiamondi', () => {
  it('swallows the rim three times: the arena shrinks 34 → 29 → 25 → 21', () => {
    const { sim, boss } = fight('verme_mangiamondi');
    expect(sim.zone!.activeArena!.radius).toBe(34);
    const fracs = [0.8, 0.6, 0.28];
    fracs.forEach((f, i) => {
      toHp(sim, boss, f);
      steps(sim, 12);
      expect(sim.zone!.activeArena!.radius).toBe(SWALLOW_RADIUS[i]);
      expect(boss.hidden).toBe(false);
    });
  });

  it('phase 2 splits the body into millstones; never two blows wound up at once', () => {
    const { sim, boss } = fight('verme_mangiamondi', { seed: 9 });
    steps(sim, 1);
    toHp(sim, boss, 0.48);
    steps(sim, 4);
    expect(segmentsOf(boss, sim).length).toBe(SEGMENTS);
    let overlap = 0, stoneRolls = 0;
    steps(sim, 70, (s) => {
      let striking = 0;
      for (const o of s.actors) if (o.alive && o.team === 'enemy' && o.attack && o.attack.stage === 'telegraph') striking++;
      if (striking > 1) overlap++;
      for (const m of segmentsOf(boss, s)) if (m.attack?.stage === 'active') stoneRolls++;
    });
    expect(overlap).toBe(0);
    expect(stoneRolls).toBeGreaterThan(0);
  });
});
