/**
 * Procedural weapon builder: one template per weapon type, parameterized per weapon (colors, glow, motif) plus swing trails and
 * Art VFX. Owned by the weapons work-stream. Contract used by the actor renderer:
 *   buildWeapon(def, ctx) -> WeaponVisual (attach `root` to the hand socket; `tip`/`base` give the blade line for trails)
 *   installWeaponFx(fx)    -> registers Art / Transizione / swing visuals on the FxRenderer
 */
import * as THREE from 'three';
import type { WeaponDef } from '../../core/types';
import type { RenderCtx } from '../types';
import type { FxRenderer } from '../fx/FxRenderer';

export interface WeaponVisual {
  root: THREE.Object3D;
  /** Local-space points along the striking edge (for trails). */
  base: THREE.Vector3;
  tip: THREE.Vector3;
  /** Grip: 'r' right hand, 'both' two hands, 'dual' one per hand (second copy in `offhand`). */
  grip: 'r' | 'both' | 'dual' | 'bow' | 'fist';
  offhand?: THREE.Object3D;
  /** Per-frame animation (rotating rings, flames...). */
  update?(dt: number, time: number): void;
  dispose(): void;
}

export function buildWeapon(def: WeaponDef, ctx: RenderCtx): WeaponVisual {
  const c = def.model.colors ?? { primary: '#cccccc', secondary: '#666666', accent: '#ffffff' };
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0).translate(0, 0, 0.6), ctx.kit.mat({ color: c.primary, metalness: 0.6, roughness: 0.4 }));
  g.add(blade);
  return { root: g, base: new THREE.Vector3(0, 0, 0.15), tip: new THREE.Vector3(0, 0, 1.1), grip: 'r', dispose: () => blade.geometry.dispose() };
}

export function installWeaponFx(_fx: FxRenderer): void {}
