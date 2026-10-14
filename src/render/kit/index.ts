/**
 * Procedural art kit: shared materials, textures, geometry helpers and the skinned ModelBuilder used by every model,
 * arena and zone. Owned by the render-kit work-stream. Stable entry points: `Kit.mat`, `Kit.glow`, `Kit.surface`,
 * `Kit.model`, `Kit.fresnel`, `Kit.globals`, plus the re-exported modules (`geo`, `tex`, palette helpers).
 * See docs/RENDER_KIT.md.
 */
import * as THREE from 'three';
import type { QualityLevel, RenderCtx } from '../types';
import { createFresnel, createStylized, type ColorLike, type KitGlobals, type ActorFx, type SurfaceOpts, createActorFx } from './materials';
import { ModelBuilder } from './model';
import { Palette } from './palette';
import { detailTexture, spriteTexture, type DetailKind, type SpriteKind } from './textures';
import * as geo from './geometry';
import * as tex from './textures';

export * from './materials';
export * from './model';
export * from './palette';
export { BlobShadows } from './shadow';
export { Prng, seedOf, fbm2, fbm3, vnoise2, vnoise3 } from './noise';
export { geo, tex };
export type { V3, RadiusFn } from './geometry';
export type { DetailKind, SpriteKind } from './textures';

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
  /** Stylized detail map (default 'noise'; null = none). */
  detail?: DetailKind | null;
  detailScale?: number;
  detailStrength?: number;
  rim?: number;
  toon?: boolean;
  vertexColors?: boolean;
}

export class Kit {
  private matCache = new Map<string, THREE.Material>();
  /** Scene-wide shader uniforms (driven by the renderer: time, rim color/strength from the sky, wrap lighting). */
  readonly globals: KitGlobals = {
    time: { value: 0 },
    rimColor: { value: new THREE.Color('#ffcf9a') },
    rimStrength: { value: 0.55 },
    wrap: { value: 0.35 },
  };
  /** Current quality preset (set by the renderer). Builders read it for segment counts. */
  quality: QualityLevel = 'high';

  /** Stylized lit material (cached by parameters). Static props, arenas, zones. */
  mat(o: MaterialOpts): THREE.MeshStandardMaterial {
    const key = JSON.stringify(o);
    let m = this.matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = createStylized(
        {
          color: o.color,
          emissive: o.emissive,
          emissiveIntensity: o.emissiveIntensity,
          roughness: o.roughness ?? 0.8,
          metalness: o.metalness ?? 0.05,
          flatShading: o.flat ?? false,
          transparent: o.transparent ?? false,
          opacity: o.opacity ?? 1,
          side: o.side ?? THREE.FrontSide,
          detail: o.detail === undefined ? 'noise' : o.detail,
          detailScale: o.detailScale,
          detailStrength: o.detailStrength,
          rim: o.rim ?? 0.6,
          toon: o.toon,
          vertexColors: o.vertexColors ?? false,
        },
        this.globals,
        null,
      );
      m.userData.smShared = true;
      this.matCache.set(key, m);
    }
    return m;
  }

  /** Unlit glowing material for emissive details (cached). Additive when opacity < 1. */
  glow(color: string | number, opacity = 1): THREE.MeshBasicMaterial {
    const key = `glow:${color}:${opacity}`;
    let m = this.matCache.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending });
      m.userData.smShared = true;
      this.matCache.set(key, m);
    }
    return m;
  }

  /** Uncached stylized material, optionally bound to per-actor FX uniforms (hit flash, dissolve, cracks, aura). */
  surface(o: SurfaceOpts, fx: ActorFx | null = null): THREE.MeshStandardMaterial {
    return createStylized(o, this.globals, fx);
  }

  /** Additive fresnel shell (auras, ghosts, spectral wraps, glass spheres). Works on skinned and instanced meshes. */
  fresnel(color: ColorLike, opts: Parameters<typeof createFresnel>[1] = {}): THREE.ShaderMaterial {
    return createFresnel(color, { time: this.globals.time, ...opts });
  }

  /** New skinned ModelBuilder (one per actor visual). */
  model(name = 'model', quality: QualityLevel = this.quality): ModelBuilder {
    return new ModelBuilder(this.globals, quality, name);
  }

  /** Fresh per-actor FX uniform set (for visuals not built with ModelBuilder). */
  actorFx(): ActorFx {
    return createActorFx();
  }

  detail(kind: DetailKind): THREE.DataTexture {
    return detailTexture(kind);
  }

  sprite(kind: SpriteKind, size = 64, seed = 0): THREE.DataTexture {
    return spriteTexture(kind, size, seed);
  }

  /** Quality-scaled segment count. */
  seg(base: number, min = 3): number {
    return geo.seg(base, this.quality, min);
  }

  dispose(): void {
    for (const m of this.matCache.values()) m.dispose();
    this.matCache.clear();
    tex.disposeTextures();
  }
}

/** Palette accessor with fallbacks: `pal(ctx, def.model.palette).primary`. */
export function pal(ctx: RenderCtx, id: string): Palette {
  return new Palette(id, ctx.palette(id));
}
