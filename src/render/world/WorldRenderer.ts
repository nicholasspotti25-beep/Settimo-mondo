/**
 * World renderer: sky (Lungo Crepuscolo shader), fog, lights, time of day, zone visuals (terrain, landmarks, props, water),
 * arena dressing and Metamondo environments. This minimal implementation is replaced by the world work-stream.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { SimEvent } from '../../sim/types';
import type { RenderCtx } from '../types';

export class WorldRenderer {
  readonly group = new THREE.Group();
  private hemi = new THREE.HemisphereLight(0xb9a6d8, 0x3b3442, 1.2);
  private sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
  private ground: THREE.Mesh | null = null;
  private zoneId = '';

  constructor(private scene: THREE.Scene, private ctx: RenderCtx) {
    scene.add(this.group);
    scene.add(this.hemi);
    this.sun.position.set(-30, 40, 60);
    scene.add(this.sun);
    scene.background = new THREE.Color('#3a2a55');
    scene.fog = new THREE.FogExp2('#6a4a6a', 0.006);
  }

  async loadZone(sim: Sim): Promise<void> {
    const z = sim.zone;
    if (!z || z.def.id === this.zoneId) return;
    this.zoneId = z.def.id;
    if (this.ground) {
      this.group.remove(this.ground);
      this.ground.geometry.dispose();
    }
    const [w, d] = z.def.size;
    const seg = 96;
    const geo = new THREE.PlaneGeometry(w, d, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, z.terrain.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, this.ctx.kit.mat({ color: '#6a6a5a', roughness: 0.95 }));
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  onEvent(_e: SimEvent, _sim: Sim): void {}

  update(sim: Sim, _dt: number, _camera: THREE.Camera): void {
    if (sim.zone && sim.zone.def.id !== this.zoneId) void this.loadZone(sim);
  }

  dispose(): void {
    this.group.clear();
  }
}
