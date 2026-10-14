/**
 * ZoneEnv: everything a zone/arena/landmark builder needs to agree with the sim — the shared core Terrain (same heights
 * and scatter as the sim), the baked field texture, the biome, the prop "avoid" list and the backdrop height function.
 * One env per loaded zone (cached; created by the WorldRenderer before the zone builder runs).
 */
import { Terrain, altarAvoid } from '../../core/terrain';
import type { ZoneDef } from '../../core/types';
import type { RenderCtx } from '../types';
import { biomeOf, type BiomeDef } from './biomes';
import { backdropHeightAt, buildField, type BackdropKind, type ZoneField } from './terrain';

export interface ZoneEnv {
  def: ZoneDef;
  ctx: RenderCtx;
  terrain: Terrain;
  field: ZoneField;
  biome: BiomeDef;
  /** Same avoid list the sim uses for prop colliders (spawn, exits, vistas, altars). */
  avoid: { x: number; z: number; r: number }[];
  backdrop: BackdropKind;
  backdropHeight: number;
  /** Render height anywhere: exact terrain inside the bounds, backdrop outside. */
  heightAt(x: number, z: number): number;
  /** Density multiplier for the current quality (props, cover). */
  density: number;
}

let current: ZoneEnv | null = null;

export function createZoneEnv(def: ZoneDef, ctx: RenderCtx): ZoneEnv {
  if (current && current.def.id === def.id && current.ctx.quality === ctx.quality) return current;
  current?.field.dispose();
  const arenas = def.arenas.map((a) => ctx.content.arena(a));
  const terrain = new Terrain(def, arenas);
  const field = buildField(def, ctx, terrain);
  const biome = biomeOf(def.biome);
  const altarPos = ctx.content.altarsInZone(def.id).map((a) => a.pos);
  const type = def.terrain.type ?? 'heightfield';
  const backdrop: BackdropKind = type === 'interior' || type === 'deck' || type === 'void' ? 'none' : biome.backdrop ?? 'hills';
  const bh = biome.backdropHeight ?? 40;
  const env: ZoneEnv = {
    def, ctx, terrain, field, biome,
    avoid: altarAvoid(def, altarPos),
    backdrop,
    backdropHeight: bh,
    heightAt: (x, z) => backdropHeightAt(field, backdrop, bh, x, z),
    density: ctx.quality === 'low' ? 0.45 : ctx.quality === 'medium' ? 0.75 : 1,
  };
  current = env;
  return env;
}

/** The env of the zone being built/shown (zone.ts, arena.ts and landmark builders may call this). */
export function zoneEnv(def: ZoneDef, ctx: RenderCtx): ZoneEnv {
  return createZoneEnv(def, ctx);
}

export function currentZoneEnv(): ZoneEnv | null {
  return current;
}

export function releaseZoneEnv(): void {
  current?.field.dispose();
  current = null;
}
