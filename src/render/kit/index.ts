/**
 * Procedural art kit: shared materials, geometry helpers and builders used by every model, arena and zone.
 * Owned by the render-kit work-stream; extend freely but keep these entry points stable.
 */
import * as THREE from 'three';

export interface MaterialOpts {
  color: string | number;
  emissive?: string | number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

export class Kit {
  private matCache = new Map<string, THREE.Material>();

  /** Stylized lit material (cached by parameters). */
  mat(o: MaterialOpts): THREE.MeshStandardMaterial {
    const key = JSON.stringify(o);
    let m = this.matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.color),
        emissive: o.emissive !== undefined ? new THREE.Color(o.emissive) : new THREE.Color(0),
        emissiveIntensity: o.emissiveIntensity ?? 1,
        roughness: o.roughness ?? 0.8,
        metalness: o.metalness ?? 0.05,
        flatShading: o.flat ?? false,
        transparent: o.transparent ?? false,
        opacity: o.opacity ?? 1,
        side: o.side ?? THREE.FrontSide,
      });
      this.matCache.set(key, m);
    }
    return m;
  }

  /** Unlit glowing material for emissive details. */
  glow(color: string | number, opacity = 1): THREE.MeshBasicMaterial {
    const key = `glow:${color}:${opacity}`;
    let m = this.matCache.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending });
      this.matCache.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.matCache.values()) m.dispose();
    this.matCache.clear();
  }
}
