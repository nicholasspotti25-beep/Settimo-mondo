/**
 * Actor renderer: the Portatore (procedural humanoid, weapon in hand, no shadow until the ending), bosses/minions via the
 * content model registry, clones, decoys and the ally. Minimal implementation; replaced by the render-kit work-stream.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { SimEvent } from '../../sim/types';
import type { RenderCtx } from '../types';

export class ActorRenderer {
  readonly group = new THREE.Group();
  private player: THREE.Mesh;
  private actors = new Map<number, THREE.Mesh>();

  constructor(scene: THREE.Scene, private ctx: RenderCtx) {
    scene.add(this.group);
    this.player = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), ctx.kit.mat({ color: '#d8cfc0' }));
    this.player.castShadow = false;
    this.group.add(this.player);
  }

  onEvent(_e: SimEvent, _sim: Sim): void {}

  update(sim: Sim, alpha: number, _dt: number): void {
    const p = sim.player;
    this.player.position.set(p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha, p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha + 0.9 * p.scale, p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha);
    this.player.scale.setScalar(p.scale);
    this.player.rotation.y = p.yaw;
    const seen = new Set<number>();
    for (const a of sim.actors) {
      seen.add(a.id);
      let m = this.actors.get(a.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.CapsuleGeometry(a.radius, Math.max(0.1, a.height - 2 * a.radius), 4, 12), this.ctx.kit.mat({ color: a.team === 'enemy' ? '#7a6a8a' : '#cfe6ff' }));
        this.actors.set(a.id, m);
        this.group.add(m);
      }
      m.position.set(a.prevPos.x + (a.pos.x - a.prevPos.x) * alpha, a.pos.y + a.height / 2, a.prevPos.z + (a.pos.z - a.prevPos.z) * alpha);
      m.rotation.y = a.yaw;
      m.visible = !a.hidden;
    }
    for (const [id, m] of this.actors) {
      if (!seen.has(id)) {
        this.group.remove(m);
        m.geometry.dispose();
        this.actors.delete(id);
      }
    }
  }

  dispose(): void {
    this.group.clear();
    this.actors.clear();
  }
}
