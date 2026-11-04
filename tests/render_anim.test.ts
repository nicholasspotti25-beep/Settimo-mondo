/**
 * Render kit: pose libraries (data/anim) resolve every guaranteed keyword, reference only bones that exist on the models
 * they drive, and animate generic/Portatore models without NaNs within the triangle budget.
 */
import { describe, expect, it } from 'vitest';
import { loadContent } from './helpers';
import type { RenderCtx } from '../src/render/types';
import type { Actor } from '../src/sim/actor';
import type { BossDef } from '../src/core/types';
import { Kit } from '../src/render/kit/index';
import { KEYWORDS, getClip, resolveKeyword, resolveLibrary, type ClipDef, type StagePose } from '../src/render/rigs/clips';
import { Animator, globRe, type AnimStageName } from '../src/render/rigs/animator';
import { buildGenericVisual, familyOf } from '../src/render/rigs/generic';
import * as THREE from 'three';
import { PortatoreVisual } from '../src/render/actors/portatore';
import type { Model } from '../src/render/kit/model';

const content = loadContent();
const ctx: RenderCtx = {
  content,
  quality: 'high',
  palette: (id) => content.bundle.palettes[id] ?? content.bundle.palettes.portatore ?? {},
  kit: new Kit(),
  time: 0,
  skyShade: 0,
};
/** Bones a family builder adds only on request (a clip posing them is a no-op on models without them). */
const OPTIONAL = /(^|_)jaw$/;
const fakeActor = { pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 }, yaw: 0, prevYaw: 0, scale: 1, parts: [] } as unknown as Actor;

function fakeDef(id: string, rig: string, height: number, radius: number): BossDef {
  const base = content.boss('guardiano_del_regno');
  return { ...base, id, parts: [], model: { builder: id, rig, scale: 1, palette: 'act1_green_gold' }, body: { radius, height, mass: 'heavy' } } as BossDef;
}

function stageKeys(s: StagePose | undefined, out: Set<string>, chains?: Set<string>): void {
  if (!s) return;
  for (const k of Object.keys(s.pose ?? {})) out.add(k);
  for (const k of Object.keys(s.cycle?.bones ?? {})) out.add(k);
  for (const w of s.waves ?? []) chains?.add(w.chain);
  for (const b of s.bends ?? []) chains?.add(b.chain);
}

function clipKeys(c: ClipDef): Set<string> {
  const out = new Set<string>();
  stageKeys(c, out);
  stageKeys(c.telegraph, out);
  stageKeys(c.active, out);
  stageKeys(c.recovery, out);
  return out;
}

function clipChains(c: ClipDef): Set<string> {
  const out = new Set<string>();
  for (const s of [c, c.telegraph, c.active, c.recovery]) stageKeys(s, new Set(), out);
  return out;
}

/** Pose keys / wave+bend chains of a library that match nothing on ANY of the given models (variants of one family). */
function missingBones(family: string, model: Model | Model[], skipPrefix?: string): string[] {
  const models = Array.isArray(model) ? model : [model];
  const lib = resolveLibrary(content, family);
  const names = models.flatMap((m) => m.boneList.map((b) => b.name));
  const chains = models.flatMap((m) => [...Object.keys(m.chains), ...m.boneList.map((b) => b.name.replace(/_\d+$/, ''))]);
  const bad: string[] = [];
  for (const name of Object.keys(lib.clips)) {
    if (skipPrefix && name.startsWith(skipPrefix)) continue;
    const c = getClip(lib, name);
    if (!c) continue;
    for (const k of clipKeys(c)) {
      if (OPTIONAL.test(k)) continue;
      const ok = k.includes('*') ? names.some((n) => globRe(k).test(n)) : names.includes(k);
      if (!ok) bad.push(`${name}:${k}`);
    }
    for (const ch of clipChains(c)) {
      const ok = ch.includes('*') ? chains.some((n) => globRe(ch).test(n)) : chains.includes(ch);
      if (!ok) bad.push(`${name}:chain ${ch}`);
    }
  }
  return bad;
}

function exercise(model: Model, family: string): void {
  const an = new Animator(model, content, family);
  const stages: AnimStageName[] = ['telegraph', 'active', 'recovery'];
  for (const kw of KEYWORDS) {
    for (const st of stages) {
      for (let t = 0; t < 0.6; t += 0.1) an.update({ anim: kw, stage: st, time: t, dur: 0.6, speed: 0, scale: 1 }, 1 / 60);
    }
  }
  for (let t = 0; t < 1; t += 1 / 30) an.update({ anim: 'walk', stage: 'move', time: t, dur: 1, speed: 3, scale: 1 }, 1 / 30);
  for (const b of model.boneList) {
    const q = b.quaternion;
    expect(Number.isFinite(q.x + q.y + q.z + q.w), `${family} bone ${b.name}`).toBe(true);
  }
}

const FAMILIES = ['humanoid', 'quadruped', 'mounted', 'portatore', 'colossus', 'serpent', 'dragon', 'bird', 'insect', 'tree', 'tentacled'];

describe('render: pose libraries', () => {
  for (const family of FAMILIES) {
    it(`${family}: every keyword resolves to a concrete clip`, () => {
      const lib = resolveLibrary(content, family);
      expect(Object.keys(lib.clips).length).toBeGreaterThanOrEqual(20);
      for (const kw of KEYWORDS) {
        const name = resolveKeyword(lib, kw);
        expect(getClip(lib, name), `${family}:${kw} -> ${name}`).not.toBeNull();
        // only an explicit family alias may map a keyword to idle (a steed never hovers)
        if (kw !== 'idle' && lib.aliases?.[kw] !== 'idle') expect(name, `${family}:${kw}`).not.toBe('idle');
      }
    });
  }

  it('Guardiano attack anims resolve on the mounted library', () => {
    const lib = resolveLibrary(content, 'mounted');
    const want: Record<string, string> = { charge: 'charge', thrust: 'thrust', overhead: 'overhead', sweep_r: 'sweep_r', rear_stomp: 'rear_stomp' };
    for (const a of content.boss('guardiano_del_regno').attacks) {
      const anim = a.anim ?? a.id;
      expect(resolveKeyword(lib, anim), anim).toBe(want[anim] ?? resolveKeyword(lib, anim));
      expect(['attack', 'idle']).not.toContain(resolveKeyword(lib, anim));
    }
  });
});

describe('render: keyword resolution', () => {
  it('sided compound anims keep their side', () => {
    const tree = resolveLibrary(content, 'tree');
    expect(resolveKeyword(tree, 'branch_whip_r')).toBe('sweep_r');
    expect(resolveKeyword(tree, 'branch_whip_l')).toBe('sweep_l');
    const col = resolveLibrary(content, 'colossus');
    expect(resolveKeyword(col, 'slam_r')).toBe('slam_r');
    expect(resolveKeyword(col, 'slam_l')).toBe('slam_l');
    const quad = resolveLibrary(content, 'quadruped');
    expect(resolveKeyword(quad, 'bite_l')).toBe('bite');
    expect(resolveKeyword(quad, 'howl_r')).toBe(resolveKeyword(quad, 'howl'));
  });

  it('every boss attack anim resolves to a real clip of its family library', () => {
    for (const def of content.bundle.bosses) {
      const fam = familyOf(def.model?.rig ?? 'humanoid');
      const lib = resolveLibrary(content, fam);
      for (const a of def.attacks ?? []) {
        const anim = a.anim ?? a.id;
        const name = resolveKeyword(lib, anim);
        expect(getClip(lib, name), `${def.id}:${anim} -> ${name}`).not.toBeNull();
        expect(name, `${def.id}:${anim} (${fam})`).not.toBe('idle');
      }
    }
  });
});

/** Generic-model variants per family (bones / chains must match at least one variant; each variant must animate). */
const VARIANTS: Record<string, { rig: string; h: number; r: number; heads?: number }[]> = {
  colossus: [{ rig: 'colossus_rock', h: 12, r: 3 }, { rig: 'colossus_mud', h: 9, r: 3 }],
  serpent: [{ rig: 'serpent', h: 5, r: 1.6 }, { rig: 'hydra', h: 6, r: 2, heads: 3 }, { rig: 'worm', h: 4, r: 2, heads: 2 }],
  dragon: [{ rig: 'dragon', h: 8, r: 4 }, { rig: 'dragon_three', h: 9, r: 4, heads: 3 }],
  bird: [{ rig: 'bird_eagle', h: 6, r: 2 }, { rig: 'griffin', h: 6, r: 2.5 }],
  insect: ['mantis', 'beetle', 'ant', 'wasp', 'spider'].map((k) => ({ rig: `insect_${k}`, h: 4, r: 2.5 })),
  tree: [{ rig: 'tree', h: 10, r: 2 }],
  tentacled: [{ rig: 'kraken', h: 10, r: 4 }, { rig: 'cthulhu', h: 16, r: 4 }],
};

function variantDef(fam: string, v: { rig: string; h: number; r: number; heads?: number }): BossDef {
  const d = fakeDef(`t_${fam}_${v.rig}`, v.rig, v.h, v.r);
  const heads = v.heads ?? 0;
  return { ...d, parts: Array.from({ length: heads }, (_, i) => ({ id: `head_${i}`, hurt: [{ c: [0, v.h, 0], r: 1 }] })) } as unknown as BossDef;
}

describe('render: every rig family animates its generic model', () => {
  for (const [fam, vars] of Object.entries(VARIANTS)) {
    it(`${fam}: bones and chains exist, animates without NaN, within budget`, () => {
      const visuals = vars.map((v) => buildGenericVisual(variantDef(fam, v), ctx, fakeActor));
      for (const v of visuals) expect(v.animator.lib.family).toBe(fam);
      expect(missingBones(fam, visuals.map((v) => v.model))).toEqual([]);
      for (const v of visuals) {
        exercise(v.model, fam);
        expect(v.model.triangles, v.model.root.name).toBeLessThan(80000);
        v.dispose();
      }
    });
  }

  it('strikes travel: serpent bite lunges the head forward; dragon idle folds the wings', () => {
    const sv = buildGenericVisual(variantDef('serpent', VARIANTS.serpent[0]), ctx, fakeActor);
    const an = new Animator(sv.model, content, 'serpent');
    const p = new THREE.Vector3();
    const headZ = (anim: string, stage: AnimStageName, dur: number): number => {
      for (let t = 0; t <= dur; t += 1 / 30) an.update({ anim, stage, time: t, dur, speed: 0, scale: 1 }, 1 / 30);
      sv.model.root.updateMatrixWorld(true);
      return an.boneWorld('head', p)!.z;
    };
    const zt = headZ('bite', 'telegraph', 0.9), za = headZ('bite', 'active', 0.35);
    expect(za - zt).toBeGreaterThan(1.5);
    sv.dispose();
    const dv = buildGenericVisual(variantDef('dragon', VARIANTS.dragon[0]), ctx, fakeActor);
    dv.model.root.updateMatrixWorld(true);
    const tip = dv.model.bones.wing_l_f1_1;
    const restX = new THREE.Vector3().setFromMatrixPosition(tip.matrixWorld).x;
    const da = new Animator(dv.model, content, 'dragon');
    for (let i = 0; i < 90; i++) da.update({ anim: 'idle', stage: 'idle', time: i / 30, dur: 1, speed: 0, scale: 1 }, 1 / 30);
    dv.model.root.updateMatrixWorld(true);
    const foldX = new THREE.Vector3().setFromMatrixPosition(tip.matrixWorld).x;
    expect(Math.abs(foldX)).toBeLessThan(Math.abs(restX) * 0.5);
    dv.dispose();
  });
});

describe('render: models driven by the libraries', () => {
  it('generic humanoid: bones exist, animates, within budget', () => {
    const v = buildGenericVisual(fakeDef('t_humanoid', 'humanoid', 4, 1), ctx, fakeActor);
    expect(missingBones('humanoid', v.model)).toEqual([]);
    exercise(v.model, 'humanoid');
    expect(v.model.triangles).toBeLessThan(80000);
    v.dispose();
  });

  it('generic quadruped: bones exist, animates, within budget', () => {
    const v = buildGenericVisual(fakeDef('t_quad', 'quadruped', 3, 1.6), ctx, fakeActor);
    expect(missingBones('quadruped', v.model)).toEqual([]);
    exercise(v.model, 'quadruped');
    expect(v.model.triangles).toBeLessThan(80000);
    v.dispose();
  });

  it('generic mounted (Guardiano data): bones exist, animates, within budget', () => {
    const v = buildGenericVisual(content.boss('guardiano_del_regno'), ctx, fakeActor);
    expect(v.animator.lib.family).toBe('mounted');
    expect(missingBones('mounted', v.model)).toEqual([]);
    exercise(v.model, 'mounted');
    expect(v.model.triangles).toBeLessThan(80000);
    v.dispose();
  });

  it('Portatore: bones exist, animates, never casts a shadow by default', () => {
    const p = new PortatoreVisual(ctx, { name: 'T', build: 0.5, height: 0.5, skin: 2, hair: 2, hairColor: 1, eyes: 0, cloak: 0 });
    expect(missingBones('portatore', p.model)).toEqual([]);
    exercise(p.model, 'portatore');
    for (const m of p.model.meshes) expect(m.castShadow).toBe(false);
    expect(p.model.triangles).toBeLessThan(40000);
    p.dispose();
  });

  it('Portatore: polearm grip selects the polearm_ clip variants (weapons request #7)', () => {
    const p = new PortatoreVisual(ctx, { name: 'T', build: 0.5, height: 0.5, skin: 2, hair: 0, hairColor: 1, eyes: 0, cloak: 3 });
    const an = new Animator(p.model, content, 'portatore');
    const pole = new Set(['polearm']);
    // exact, resolved keyword (thrust_high -> thrust), compound (charge_thrust -> charge), mirrored side, locomotion
    expect(an.resolve('thrust', pole)?.name).toBe('polearm_thrust');
    expect(an.resolve('thrust_high', pole)?.name).toBe('polearm_thrust');
    expect(an.resolve('charge_thrust', pole)?.name).toBe('polearm_charge');
    expect(an.resolve('sweep_rl', pole)?.name).toBe('polearm_sweep_r');
    expect(an.resolve('idle', pole)?.name).toBe('polearm_idle');
    expect(an.resolve('walk', pole)?.name).toBe('polearm_walk');
    // no polearm variant: the plain clip; no flag: the plain clips
    expect(an.resolve('throw', pole)?.name).toBe('throw');
    expect(an.resolve('thrust')?.name).toBe('thrust');
    // every polearm_ pose key is a real bone of the Portatore
    const lib = resolveLibrary(content, 'portatore');
    const bones = new Set(p.model.boneList.map((b) => b.name));
    for (const [name, c] of Object.entries(lib.clips)) {
      if (!name.startsWith('polearm_')) continue;
      const cl = getClip(lib, name) as ClipDef;
      for (const st of [cl, cl.telegraph, cl.active, cl.recovery] as (StagePose | undefined)[]) for (const k of Object.keys(st?.pose ?? {})) expect(bones.has(k), `${name}: ${k}`).toBe(true);
    }
    // the hero light accepts the scene lights and keeps finite, banded values
    const cam = new THREE.PerspectiveCamera();
    cam.updateMatrixWorld();
    const sun = new THREE.DirectionalLight('#ffd0a0', 8);
    sun.position.set(0, 3, 10);
    sun.updateMatrixWorld();
    p.light(cam, sun, new THREE.HemisphereLight('#a0b0ff', '#302020', 2), 0.9);
    const f = p.hero.fill.value, r = p.hero.rim.value;
    for (const v of [f.r, f.g, f.b, r.r, r.g, r.b]) expect(Number.isFinite(v) && v >= 0).toBe(true);
    expect(0.2126 * f.r + 0.7152 * f.g + 0.0722 * f.b).toBeLessThan(0.3);
    p.dispose();
  });
});
