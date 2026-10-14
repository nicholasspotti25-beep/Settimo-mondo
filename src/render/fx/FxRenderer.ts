/**
 * FX renderer: projectiles, hazard telegraphs and effects, hit sparks, Art VFX, trails, telegraph glints, Colpo Rosso flash.
 * Other work-streams plug in through `registerHandler` (e.g. weapon Art VFX from src/render/weapons) and
 * `registerProjectileVisual` / `registerHazardVisual`. Minimal implementation; replaced by the render-kit work-stream.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { SimEvent, SimEventType } from '../../sim/types';
import type { RenderCtx } from '../types';

export type FxHandler = (e: SimEvent, sim: Sim, fx: FxRenderer) => void;
export interface FxUpdatable {
  update(dt: number, sim: Sim): boolean; // return false when finished
  dispose(): void;
}

export class FxRenderer {
  readonly group = new THREE.Group();
  private handlers = new Map<SimEventType, FxHandler[]>();
  private live: FxUpdatable[] = [];
  private proj: THREE.InstancedMesh;
  private haz: THREE.InstancedMesh;
  private m = new THREE.Matrix4();

  constructor(scene: THREE.Scene, readonly ctx: RenderCtx) {
    scene.add(this.group);
    this.proj = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), ctx.kit.glow('#ffe0a0'), 256);
    this.haz = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), ctx.kit.glow('#ff9a5a', 0.4), 128);
    this.proj.frustumCulled = false;
    this.haz.frustumCulled = false;
    this.group.add(this.proj, this.haz);
  }

  /** Subscribe a visual handler to a sim event type. */
  registerHandler(type: SimEventType, fn: FxHandler): void {
    const l = this.handlers.get(type) ?? [];
    l.push(fn);
    this.handlers.set(type, l);
  }

  /** Add a self-updating effect (removed when update returns false). */
  spawn(fx: FxUpdatable): void {
    this.live.push(fx);
  }

  onEvent(e: SimEvent, sim: Sim): void {
    for (const h of this.handlers.get(e.type) ?? []) h(e, sim, this);
  }

  update(sim: Sim, _alpha: number, dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (!this.live[i].update(dt, sim)) {
        this.live[i].dispose();
        this.live.splice(i, 1);
      }
    }
    let n = 0;
    sim.projectiles.forEachActive((p) => {
      if (n >= 256) return;
      this.m.makeScale(p.radius, p.radius, p.radius).setPosition(p.pos.x, p.pos.y, p.pos.z);
      this.proj.setMatrixAt(n++, this.m);
    });
    this.proj.count = n;
    this.proj.instanceMatrix.needsUpdate = true;
    n = 0;
    sim.hazards.forEachActive((h) => {
      if (n >= 128) return;
      const r = h.shape.type === 'cylinder' ? h.shape.r : h.shape.type === 'ring' ? h.shape.r1 : 2;
      this.m.makeScale(r, 1, r).setPosition(h.pos.x, h.pos.y + 0.05, h.pos.z);
      this.haz.setMatrixAt(n++, this.m);
    });
    this.haz.count = n;
    this.haz.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const f of this.live) f.dispose();
    this.live = [];
    this.group.clear();
  }
}
