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
import { Animator, type AnimStageName } from '../src/render/rigs/animator';
import { buildGenericVisual } from '../src/render/rigs/generic';
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

function stageKeys(s: StagePose | undefined, out: Set<string>): void {
  if (!s) return;
  for (const k of Object.keys(s.pose ?? {})) out.add(k);
  for (const k of Object.keys(s.cycle?.bones ?? {})) out.add(k);
}

function clipKeys(c: ClipDef): Set<string> {
  const out = new Set<string>();
  stageKeys(c, out);
  stageKeys(c.telegraph, out);
  stageKeys(c.active, out);
  stageKeys(c.recovery, out);
  return out;
}

function missingBones(family: string, model: Model, skipPrefix?: string): string[] {
  const lib = resolveLibrary(content, family);
  const names = model.boneList.map((b) => b.name);
  const bad: string[] = [];
  for (const name of Object.keys(lib.clips)) {
    if (skipPrefix && name.startsWith(skipPrefix)) continue;
    const c = getClip(lib, name);
    if (!c) continue;
    for (const k of clipKeys(c)) {
      if (OPTIONAL.test(k)) continue;
      const ok = k.endsWith('*') ? names.some((n) => n.startsWith(k.slice(0, -1))) : names.includes(k);
      if (!ok) bad.push(`${name}:${k}`);
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

describe('render: pose libraries', () => {
  for (const family of ['humanoid', 'quadruped', 'mounted', 'portatore']) {
    it(`${family}: every keyword resolves to a concrete clip`, () => {
      const lib = resolveLibrary(content, family);
      expect(Object.keys(lib.clips).length).toBeGreaterThan(20);
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
});
