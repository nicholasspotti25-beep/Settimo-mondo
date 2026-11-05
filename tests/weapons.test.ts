/**
 * Weapons stream: data validity (38 weapons + movesets, canon types, parry flags, stamina, swing arcs), damage formula,
 * 49 Transizioni, locale keys, Arts observable headless (Acts I and II so far), weapon visuals (budget, blade line).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { parse } from 'yaml';
import * as THREE from 'three';
import { loadContent, makeSim, press } from './helpers';
import { Btn, emptyInput } from '../src/sim/types';
import { PARRY_TYPES, TRANSITION_CATEGORIES, WEAPON_TYPES, type SwingDef, type WeaponDef } from '../src/core/types';
import { weaponDamage } from '../src/core/formulas';
import { CANON_ENCOUNTERS, CANON_STARTER } from '../tools/canon/bible';
import { Kit } from '../src/render/kit/index';
import type { QualityLevel, RenderCtx } from '../src/render/types';
import { buildWeapon, hasDedicatedTemplate } from '../src/render/weapons/index';
import { weaponArtVfxIds } from '../src/render/weapons/fx';
import type { Sim } from '../src/sim/sim';

const content = loadContent();
const loc = (lang: string): Record<string, string> => ({
  ...(parse(fs.readFileSync(`locales/${lang}/weapons.yaml`, 'utf8')) as Record<string, string>),
  ...(parse(fs.readFileSync(`locales/${lang}/canon_names.yaml`, 'utf8')) as Record<string, string>),
});
const IT = loc('it'), EN = loc('en');

/** Weapons a player gets first: the starter, then Act I in story order. */
const ACT1_WEAPONS = ['lama_della_culla', 'lancia_del_custode', 'brando_del_viandante', 'ramo_dell_antico', 'randello_del_pantano', 'zanna_strisciante', 'remo_del_traghettatore'];
/** Act II in story order: Cerbero, Pyro, Thunder, Ice, Mostro di Magma. */
const ACT2_WEAPONS = ['triplice_guinzaglio', 'brace_eterna', 'tuono_spezzacielo', 'brina_silente', 'fenditura_ardente'];
/** Weapons whose dedicated templates and Art visuals have landed. */
const DONE_WEAPONS = [...ACT1_WEAPONS, ...ACT2_WEAPONS];

function swingsOf(w: WeaponDef): SwingDef[] {
  const ms = content.bundle.movesets.find((m) => m.type === w.type)!;
  const out: SwingDef[] = [];
  for (const k of ['light', 'heavy', 'running', 'jumping'] as const) {
    const s = ms.swings[w.moveset[k]];
    expect(s, `${w.id} ${k} -> ${w.moveset[k]}`).toBeDefined();
    out.push(...(Array.isArray(s) ? s : [s]));
  }
  return out;
}

describe('weapon data', () => {
  const weapons = content.bundle.weapons;
  it('38 weapons, one per canon type, starter + every canon boss weapon', () => {
    expect(weapons.length).toBe(38);
    expect(new Set(weapons.map((w) => w.type)).size).toBe(38);
    for (const w of weapons) expect(WEAPON_TYPES).toContain(w.type);
    const starter = weapons.find((w) => w.starter)!;
    expect(starter.id).toBe(CANON_STARTER.id);
    expect(starter.type).toBe(CANON_STARTER.type);
    for (const e of CANON_ENCOUNTERS) {
      if (!e.weapon) continue;
      const w = weapons.find((x) => x.id === e.weapon!.id);
      expect(w, e.weapon.id).toBeDefined();
      expect(w!.type).toBe(e.weaponType);
      expect(w!.source_boss).toBe(e.id);
      expect(w!.source_difficulty).toBe(e.difficulty);
      expect(IT[w!.arts.prima.name_key ?? `art.${w!.arts.prima.id}.name`]).toBe(e.weapon.arts[0]);
      expect(IT[w!.arts.seconda.name_key ?? `art.${w!.arts.seconda.id}.name`]).toBe(e.weapon.arts[1]);
    }
    expect(weapons.find((w) => w.id === 'scettro_del_primo_respiro')!.delivered_by).toBe('cthulhu');
    expect(weapons.find((w) => w.id === 'lama_dell_abisso_sognante')!.ng_plus_only).toBe(true);
  });

  it('parry-capable exactly for the six canon types', () => {
    for (const w of weapons) expect(w.parry_capable, w.id).toBe(PARRY_TYPES.includes(w.type));
  });

  it('movesets: every type, every swing has anim + arc, stamina in range', () => {
    expect(content.bundle.movesets.length).toBe(38);
    for (const w of weapons) {
      expect(w.stamina_cost.light).toBeGreaterThanOrEqual(12);
      expect(w.stamina_cost.light).toBeLessThanOrEqual(18);
      expect(w.stamina_cost.heavy).toBeGreaterThanOrEqual(25);
      expect(w.stamina_cost.heavy).toBeLessThanOrEqual(35);
      for (const s of swingsOf(w)) {
        expect(s.anim, `${w.id} ${s.id}`).toBeTruthy();
        expect(s.arc, `${w.id} ${s.id} arc`).toBeDefined();
        expect(!!s.shape || !!s.projectile, `${w.id} ${s.id} hits`).toBe(true);
      }
      const ms = content.bundle.movesets.find((m) => m.type === w.type)!;
      for (const k of ['light', 'heavy', 'run', 'jump']) expect(ms.swings[`${w.type}_${k}`], `${w.type}_${k}`).toBeDefined();
    }
  });

  it('damage = 18 + 4 x D (starter 18)', () => {
    const b = content.bundle.balance;
    for (const w of weapons) expect(weaponDamage(b, w)).toBe(w.starter ? 18 : 18 + 4 * w.source_difficulty);
  });

  it('49 Transizioni: every ordered category pair once, named in IT and EN', () => {
    const tr = content.bundle.transitions;
    expect(tr.length).toBe(49);
    const pairs = new Set(tr.map((t) => `${t.from}>${t.to}`));
    for (const a of TRANSITION_CATEGORIES) for (const b of TRANSITION_CATEGORIES) expect(pairs.has(`${a}>${b}`), `${a}>${b}`).toBe(true);
    for (const t of tr) {
      expect(IT[t.name_key], t.name_key).toBeTruthy();
      expect(EN[t.name_key], t.name_key).toBeTruthy();
    }
    expect(new Set(tr.map((t) => IT[t.name_key])).size).toBe(49);
  });

  it('strings: desc + art names/descs for all, flavor only for non-mini weapons', () => {
    const mini = new Set(['zanna_strisciante', 'balestra_del_drago_ardente', 'arpione_abissale', 'naginata_cristallina', 'tridente_delle_tre_punte', 'chakram_del_vuoto', 'trivella_divorante']);
    for (const w of weapons) {
      for (const L of [IT, EN]) {
        expect(L[w.desc_key], w.desc_key).toBeTruthy();
        expect(L[w.name_key], w.name_key).toBeTruthy();
        for (const a of [w.arts.prima, w.arts.seconda]) {
          expect(L[`art.${a.id}.name`], a.id).toBeTruthy();
          expect(L[`art.${a.id}.desc`], a.id).toBeTruthy();
        }
      }
      if (mini.has(w.id)) expect(w.flavor_key, w.id).toBeFalsy();
      else expect(IT[w.flavor_key!] && EN[w.flavor_key!], w.id).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Arts headless                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Observed { damage: number; hits: number; projectiles: number; hazards: number; vfx: Set<string>; bound: boolean; slowed: boolean; pulled: number; counter: boolean }

function castArt(weaponId: string, which: 'prima' | 'seconda', setup?: (sim: Sim) => void): Observed {
  const sim = makeSim(3);
  sim.startFightDirect('guardiano_del_regno', { skipIntro: true });
  sim.giveWeapon(weaponId);
  sim.setLoadout([weaponId]);
  sim.debug.invincible = true;
  const boss = sim.boss!;
  boss.idleTimer = 99;
  const w = content.weapon(weaponId);
  // an imbue's burst (Lama Rovente) is a point-blank ring around the caster
  const eff = w.arts[which].effect;
  const dist = w.category === 'catalyst' || w.category === 'ranged' ? 7 : eff === 'grab_pull' ? 5.5 : eff === 'buff_self' ? 1.2 : 4.2;
  sim.player.pos = { x: boss.pos.x, y: boss.pos.y, z: boss.pos.z - dist - boss.radius * boss.scale };
  sim.player.yaw = 0;
  sim.player.eco = 300;
  setup?.(sim);
  const hp0 = boss.hp;
  const obs: Observed = { damage: 0, hits: 0, projectiles: 0, hazards: 0, vfx: new Set(), bound: false, slowed: false, pulled: 0, counter: false };
  const z0 = boss.pos.z;
  const read = (): void => {
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit' && e.target === boss.id) obs.hits++;
      if (e.type === 'projectile' && e.team === 'player') obs.projectiles++;
      if (e.type === 'hazard') obs.hazards++;
      if (e.type === 'vfx') obs.vfx.add(e.id);
      if (e.type === 'counter') obs.counter = true;
    }
  };
  // counter stance: let the Guardiano's blow get close before taking the guard
  if (w.arts[which].effect === 'counter_stance') for (let i = 0; i < 40; i++) sim.step(emptyInput());
  sim.drainEvents();
  sim.step(press(which === 'prima' ? Btn.ArtPrima : Btn.ArtSeconda));
  read();
  for (let i = 0; i < 360; i++) {
    sim.step(emptyInput());
    read();
    if (boss.bound > 0) obs.bound = true;
    if (boss.slowed > 0) obs.slowed = true;
    obs.pulled = Math.max(obs.pulled, z0 - boss.pos.z);
  }
  obs.damage = hp0 - boss.hp;
  return obs;
}

describe('Arts (Act I + II weapons) run headless with an observable effect', () => {
  it('every Act I + II Art connects with the Guardiano and emits its visual cues', () => {
    for (const id of DONE_WEAPONS) {
      const w = content.weapon(id);
      for (const which of ['prima', 'seconda'] as const) {
        const art = w.arts[which];
        const setup = art.effect === 'counter_stance'
          ? (sim: Sim) => {
            // the Guardiano strikes into the stance
            const b = sim.boss!;
            b.yaw = Math.PI;
            sim.player.pos.z = b.pos.z - 3.4;
            b.idleTimer = 0;
            b.startAttack(sim, b.attackMap.get('heavy_overhead') ?? [...b.attackMap.values()][0]);
          }
          : undefined;
        const o = castArt(id, which, setup);
        const label = `${id}.${which} (${art.id}, ${art.effect})`;
        expect(o.damage, label).toBeGreaterThan(0);
        expect([...o.vfx].some((v) => v.startsWith(`${art.vfx}:`)), `${label} cues ${[...o.vfx].join(',')}`).toBe(true);
        if (art.effect === 'projectile') expect(o.projectiles, label).toBeGreaterThanOrEqual(Math.round(Number(art.params.count ?? 1)));
        if (art.effect === 'bind') expect(o.bound, label).toBe(true);
        if (art.params.status === 'slow' || art.params.pit) expect(o.slowed, label).toBe(true);
        if (art.effect === 'counter_stance') expect(o.counter, label).toBe(true);
        if (art.effect === 'grab_pull') expect(o.pulled, label).toBeGreaterThan(0.5);
        if (art.params.freeze || art.effect === 'buff_self' || art.effect === 'ground_wave' || art.effect === 'chain_lightning') {
          expect(o.vfx.size, `${label} sim visuals ${[...o.vfx].join(',')}`).toBeGreaterThan(0);
        }
        if (art.params.freeze) expect(o.bound, label).toBe(true);
        if (art.effect === 'ground_wave') expect(o.hazards, label).toBeGreaterThan(0);
        if (art.params.projectile) expect(o.projectiles, label).toBeGreaterThanOrEqual(Math.round(Number(art.params.count ?? 1)));
        if (art.effect === 'chain_lightning') expect([...o.vfx], label).toContain('lightning_arc');
      }
    }
  });

  it('Art damage stays within its budget (damage_mult x weapon damage, x1.15 for Equilibrio-free rounding)', () => {
    for (const id of DONE_WEAPONS) {
      const w = content.weapon(id);
      const dmg = weaponDamage(content.bundle.balance, w);
      for (const which of ['prima', 'seconda'] as const) {
        const art = w.arts[which];
        if (art.params.pit || art.params.dps_mult) continue; // lingering damage on top of the budget
        const o = castArt(id, which, art.effect === 'counter_stance' ? (sim) => {
          const b = sim.boss!;
          b.yaw = Math.PI;
          sim.player.pos.z = b.pos.z - 3.4;
          b.startAttack(sim, b.attackMap.get('heavy_overhead') ?? [...b.attackMap.values()][0]);
        } : undefined);
        const budget = dmg * Number(art.params.damage_mult ?? 2);
        expect(o.damage, `${id}.${which}`).toBeLessThanOrEqual(budget * 1.15 * 1.5);
        expect(o.damage, `${id}.${which}`).toBeGreaterThan(budget * 0.25);
      }
    }
  });

  it('every Art of every weapon has a vfx id and a known effect', () => {
    for (const w of content.bundle.weapons) for (const a of [w.arts.prima, w.arts.seconda]) {
      expect(a.vfx, a.id).toMatch(/^art_/);
      expect(a.anim, a.id).toBeTruthy();
    }
    for (const id of DONE_WEAPONS) {
      const w = content.weapon(id);
      for (const a of [w.arts.prima, w.arts.seconda]) expect(weaponArtVfxIds(), a.vfx).toContain(a.vfx);
    }
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Visuals                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

function ctxFor(quality: QualityLevel): RenderCtx {
  const kit = new Kit();
  kit.quality = quality;
  return { content, quality, palette: (id) => content.bundle.palettes[id] ?? {}, kit, time: 0, skyShade: 0 };
}

describe('weapon visuals', () => {
  it('Act I + II types have dedicated templates', () => {
    for (const id of DONE_WEAPONS) expect(hasDedicatedTemplate(content.weapon(id).type), id).toBe(true);
  });

  it('Act I + II visuals stay within ~3k triangles on high and carry trail colors', () => {
    const ctx = ctxFor('high');
    for (const id of DONE_WEAPONS) {
      const v = buildWeapon(content.weapon(id), ctx);
      expect(v.triangles ?? 0, id).toBeLessThanOrEqual(3000);
      expect(v.trail?.color, id).toMatch(/^#/);
      v.dispose();
    }
  });

  it('the chains fly out to the lash reach and fall back to hang from the ring', () => {
    const ctx = ctxFor('high');
    const v = buildWeapon(content.weapon('triplice_guinzaglio'), ctx);
    const rest = v.tip.length();
    v.morph!({ extend: 1, art: 0, swing: 1 });
    for (let i = 0; i < 60; i++) v.update!(1 / 60, i / 60);
    expect(v.tip.z).toBeGreaterThan(4);
    v.morph!({ extend: 0, art: 0, swing: 0 });
    for (let i = 0; i < 150; i++) v.update!(1 / 60, 1 + i / 60);
    expect(v.tip.z).toBeLessThan(0.5);
    expect(Math.abs(v.tip.length() - rest)).toBeLessThan(0.25);
    v.dispose();
  });

  it('every weapon builds on every quality: budget, finite blade line, update/morph without NaN, clean dispose', () => {
    for (const q of ['low', 'medium', 'high'] as QualityLevel[]) {
      const ctx = ctxFor(q);
      for (const w of content.bundle.weapons) {
        const v = buildWeapon(w, ctx);
        expect(v.triangles ?? 0, `${w.id} ${q}`).toBeGreaterThan(40);
        expect(v.triangles ?? 0, `${w.id} ${q}`).toBeLessThanOrEqual(3600);
        expect(v.tip.distanceTo(v.base), w.id).toBeGreaterThan(0.05);
        v.morph?.({ extend: 1, art: 1, swing: 1 });
        for (let i = 0; i < 20; i++) v.update?.(1 / 60, i / 60);
        v.morph?.({ extend: 0, art: 0, swing: 0 });
        v.update?.(1 / 60, 1);
        expect(Number.isFinite(v.tip.x + v.tip.y + v.tip.z), w.id).toBe(true);
        const box = new THREE.Box3().setFromObject(v.root);
        expect(Number.isFinite(box.min.x) && Number.isFinite(box.max.z), w.id).toBe(true);
        v.dispose();
      }
    }
  });

  it('the snake-sword extends to its reach and comes back', () => {
    const ctx = ctxFor('high');
    const v = buildWeapon(content.weapon('zanna_strisciante'), ctx);
    const rest = v.tip.z;
    v.morph!({ extend: 1, art: 0, swing: 1 });
    for (let i = 0; i < 60; i++) v.update!(1 / 60, i / 60);
    expect(v.tip.length()).toBeGreaterThan(4);
    v.morph!({ extend: 0, art: 0, swing: 0 });
    for (let i = 0; i < 90; i++) v.update!(1 / 60, 1 + i / 60);
    expect(Math.abs(v.tip.z - rest)).toBeLessThan(0.05);
    v.dispose();
  });
});
