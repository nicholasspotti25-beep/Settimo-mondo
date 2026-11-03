/**
 * Render kit: every registered boss model module (src/generated/registry.render.ts BOSS_MODELS) builds on every quality
 * preset inside the boss triangle budget (D3: <= 80k), animates through its attack keywords without NaN, and the
 * Guardiano del Regno reference model keeps its documented contract (docs/RENDER_KIT.md worked example).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadContent } from './helpers';
import type { BossModelBuilder, QualityLevel, RenderCtx } from '../src/render/types';
import type { Actor } from '../src/sim/actor';
import type { BossDef } from '../src/core/types';
import { Kit } from '../src/render/kit/index';
import { RigVisual } from '../src/render/rigs/visual';
import { BOSS_MODELS } from '../src/generated/registry.render';

const content = loadContent();

function ctxFor(quality: QualityLevel): RenderCtx {
  const kit = new Kit();
  kit.quality = quality;
  return { content, quality, palette: (id) => content.bundle.palettes[id] ?? content.bundle.palettes.portatore ?? {}, kit, time: 0, skyShade: 0 };
}

function fakeActor(def: BossDef): Actor {
  return {
    pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 }, yaw: 0, prevYaw: 0, scale: 1, parts: [], flags: new Set<string>(), def,
    anim: 'idle', animStage: 'idle', animTime: 0, animDur: 1, moveSpeedNow: 0, airborne: false, hitFlash: 0, team: 'enemy', alive: true,
  } as unknown as Actor;
}

const fakeSim = { player: { pos: { x: 0, y: 0, z: 8 }, scale: 1 }, groundAt: () => 0 } as never;

function triangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || (m.userData.surface as string | undefined)?.startsWith('aura:')) return;
    const g = m.geometry;
    n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return n;
}

async function builderOf(id: string): Promise<BossModelBuilder> {
  const mod = (await BOSS_MODELS[id]()) as { default: BossModelBuilder };
  return mod.default;
}

describe('registered boss models', () => {
  const ids = Object.keys(BOSS_MODELS).filter((id) => content.bundle.bosses.some((b) => b.id === id));
  it('has at least the reference model', () => {
    expect(ids).toContain('guardiano_del_regno');
  });
  for (const id of ids) {
    it(`${id}: builds within budget on every preset and animates its attacks`, async () => {
      const build = await builderOf(id);
      const def = content.boss(id);
      for (const q of ['low', 'medium', 'high'] as QualityLevel[]) {
        const ctx = ctxFor(q);
        const actor = fakeActor(def);
        const v = build(def, ctx, actor);
        const tris = triangles(v.root);
        expect(tris, `${id} ${q} triangles`).toBeLessThan(80_000);
        expect(v.height).toBeGreaterThan(0);
        for (const atk of def.attacks) {
          for (const stage of ['telegraph', 'active', 'recovery'] as const) {
            const a = actor as unknown as { anim: string; animStage: string; animTime: number; animDur: number };
            a.anim = atk.anim ?? atk.id;
            a.animStage = stage;
            a.animTime = 0.3;
            a.animDur = 0.6;
            v.update(actor, 1, 1 / 30, fakeSim);
          }
        }
        v.root.updateMatrixWorld(true);
        v.root.traverse((o) => {
          const e = o.matrixWorld.elements;
          for (let i = 0; i < 16; i++) expect(Number.isFinite(e[i]), `${id} ${q} ${o.name}`).toBe(true);
        });
        if (q === 'high') console.info(`[render] ${id}: ${tris} triangles on high`);
        v.dispose();
      }
    });
  }
});

describe('Guardiano del Regno reference model', () => {
  it('keeps the spectral aura on the steed only and the rider above the horse', async () => {
    const build = await builderOf('guardiano_del_regno');
    const def = content.boss('guardiano_del_regno');
    const ctx = ctxFor('high');
    const actor = fakeActor(def);
    const v = build(def, ctx, actor) as RigVisual;
    expect(v).toBeInstanceOf(RigVisual);
    const auras: string[] = [];
    v.root.traverse((o) => {
      const s = o.userData.surface as string | undefined;
      if (s?.startsWith('aura:')) auras.push(s);
    });
    expect(auras.length).toBeGreaterThan(0);
    // mounted: the rider follows the saddle once the animator runs (rest pose = dismounted beside the steed)
    for (let i = 0; i < 30; i++) v.update(actor, 1, 1 / 30, fakeSim);
    // both flag auras ('spectral_aura', 'enraged') wrap steed surfaces only
    for (const s of auras) expect(s.startsWith('aura:steed_'), s).toBe(true);
    v.root.updateMatrixWorld(true);
    const helm = v.boneWorld('rider_head', new THREE.Vector3())!;
    const chest = v.boneWorld('chest', new THREE.Vector3())!;
    // data hurtboxes: helm at y 4.0, horse chest at z +0.9 / y 1.4 (model built in the sim's local frame)
    expect(helm.y).toBeGreaterThan(3.4);
    expect(helm.y).toBeLessThan(4.6);
    expect(chest.z).toBeGreaterThan(0.2);
    expect(chest.y).toBeGreaterThan(1.0);
    expect(chest.y).toBeLessThan(2.2);
    v.dispose();
  });
});
