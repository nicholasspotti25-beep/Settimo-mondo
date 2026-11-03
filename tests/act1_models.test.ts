/**
 * Act I boss models (src/content/bosses/<id>/model.ts): built in the sim's local frame, the visible body lines up with the
 * data hurtboxes / part spheres, flags drive the scripted looks (Cavaliere dismount: the knight on foot appears, the horse
 * gallops away and is hidden), and every model stays inside the boss budget.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadContent } from './helpers';
import type { ActorVisual, BossModelBuilder, QualityLevel, RenderCtx } from '../src/render/types';
import type { Actor } from '../src/sim/actor';
import type { BossDef } from '../src/core/types';
import { Kit } from '../src/render/kit/index';

const content = loadContent();

function ctxFor(quality: QualityLevel): RenderCtx {
  const kit = new Kit();
  kit.quality = quality;
  return { content, quality, palette: (id) => content.bundle.palettes[id] ?? {}, kit, time: 0, skyShade: 0 };
}

function fakeActor(def: BossDef, flags: string[] = []): Actor {
  return {
    pos: { x: 0, y: 0, z: 0 }, prevPos: { x: 0, y: 0, z: 0 }, yaw: 0, prevYaw: 0, scale: 1, parts: [], flags: new Set<string>(flags), def,
    anim: 'idle', animStage: 'idle', animTime: 0, animDur: 1, moveSpeedNow: 0, airborne: false, hitFlash: 0, team: 'enemy', alive: true,
  } as unknown as Actor;
}

const fakeSim = { player: { pos: { x: 0, y: 0, z: 9 }, scale: 1 }, groundAt: () => 0 } as never;

async function build(id: string, actor: Actor, q: QualityLevel = 'high'): Promise<ActorVisual> {
  const mod = (await import(`../src/content/bosses/${id}/model.ts`)) as { default: BossModelBuilder };
  return mod.default(content.boss(id), ctxFor(q), actor);
}

function step(v: ActorVisual, actor: Actor, frames: number): void {
  for (let i = 0; i < frames; i++) v.update(actor, 1, 1 / 30, fakeSim);
  v.root.updateMatrixWorld(true);
}

/** World position of the first bone with this name whose model root is visible. */
function bone(v: ActorVisual, name: string, sub?: number): THREE.Vector3 | null {
  let out: THREE.Vector3 | null = null;
  (sub === undefined ? v.root : v.root.children[sub]).traverse((o) => {
    if (out || o.name !== name || !(o as THREE.Bone).isBone) return;
    let vis = true;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) vis = false;
    if (vis) out = o.getWorldPosition(new THREE.Vector3());
  });
  return out;
}

function triangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m.userData.surface as string | undefined)?.startsWith('aura:')) return;
    n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
  });
  return n;
}

function near(p: THREE.Vector3 | null, c: [number, number, number], tol: number): number {
  expect(p).not.toBeNull();
  return p!.distanceTo(new THREE.Vector3(...c)) - tol;
}

describe('Cavaliere Errante model', () => {
  const def = content.boss('cavaliere_errante');
  const part = (id: string) => (def.parts ?? []).find((p) => p.id === id)!;

  it('stays inside the boss budget on every preset', async () => {
    for (const q of ['low', 'medium', 'high'] as QualityLevel[]) {
      const v = await build('cavaliere_errante', fakeActor(def, ['mounted']), q);
      const tris = triangles(v.root);
      if (q === 'high') console.info(`[act1] cavaliere_errante: ${tris} triangles (mounted + on foot) on high`);
      expect(tris).toBeLessThan(80_000);
      v.dispose();
    }
  });

  it('mounted: steed chest/head and the seated rider sit on their part spheres', async () => {
    const a = fakeActor(def, ['mounted']);
    const v = await build('cavaliere_errante', a);
    step(v, a, 20);
    const steed = part('steed').hurt, rider = part('rider').hurt;
    expect(near(bone(v, 'chest'), steed[0].c, steed[0].r)).toBeLessThan(0.15);
    expect(near(bone(v, 'body'), steed[1].c, steed[1].r)).toBeLessThan(0.15);
    expect(near(bone(v, 'head'), steed[2].c, steed[2].r)).toBeLessThan(0.3);
    expect(near(bone(v, 'rider_chest'), rider[0].c, rider[0].r)).toBeLessThan(0);
    expect(near(bone(v, 'rider_head'), rider[1].c, rider[1].r)).toBeLessThan(0.1);
    v.dispose();
  });

  it('dismounted: the knight on foot fills the body hurtboxes and the horse rides away, then is hidden', async () => {
    const a = fakeActor(def, ['mounted']);
    const v = await build('cavaliere_errante', a);
    step(v, a, 5);
    a.flags.delete('mounted');
    a.flags.add('dismounted');
    step(v, a, 30);
    const hb = def.hurtboxes ?? [];
    // children[0] = the mounted model (horse), children[1] = the knight on foot
    expect(near(bone(v, 'head', 1), hb[2].c, hb[2].r)).toBeLessThan(0.1);
    expect(near(bone(v, 'chest', 1), hb[1].c, hb[1].r)).toBeLessThan(0);
    expect(near(bone(v, 'hips', 1), hb[0].c, hb[0].r + 0.3)).toBeLessThan(0);
    // the steed is drawn at a distance and moving away (galloping off), not under the knight
    const steedNow = bone(v, 'body', 0);
    expect(steedNow).not.toBeNull();
    const d0 = Math.hypot(steedNow!.x, steedNow!.z);
    step(v, a, 45);
    const later = bone(v, 'body', 0);
    expect(later && Math.hypot(later.x, later.z)).toBeGreaterThan(d0);
    step(v, a, 200);
    expect(bone(v, 'body', 0)).toBeNull();
    // retry: a fresh mounted state brings the horse and the rider back
    a.flags.delete('dismounted');
    a.flags.add('mounted');
    step(v, a, 10);
    expect(near(bone(v, 'rider_head'), part('rider').hurt[1].c, part('rider').hurt[1].r)).toBeLessThan(0.1);
    v.dispose();
  });
});
