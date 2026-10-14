/**
 * Render-side contracts. Content modules (boss models, arena dressing, zone builders, Form environments) implement these
 * and are loaded lazily through src/generated/registry.render.ts.
 */
import type * as THREE from 'three';
import type { ArenaDef, BossDef, FormDef, MinionDef, ZoneDef } from '../core/types';
import type { Actor } from '../sim/actor';
import type { Sim } from '../sim/sim';
import type { Content } from '../core/content';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface RenderCtx {
  content: Content;
  quality: QualityLevel;
  /** Palette lookup (data/palettes). */
  palette(id: string): Record<string, string>;
  /** Shared procedural material/geometry library (src/render/kit). */
  kit: import('./kit/index').Kit;
  /** Seconds since start (for shader animation). */
  time: number;
  /** Sky brightness progress 0..1 (violet -> gold). */
  skyShade: number;
}

/** Visual for an actor (boss, minion, decoy, clone, ally). */
export interface ActorVisual {
  root: THREE.Object3D;
  /** Pose and place the visual from the sim actor. alpha = interpolation factor between the last two sim steps. */
  update(actor: Actor, alpha: number, dt: number, sim: Sim): void;
  /** World-space height of the model's visual center (for camera framing). */
  height: number;
  dispose(): void;
}

export type BossModelBuilder = (def: BossDef | MinionDef, ctx: RenderCtx, actor: Actor) => ActorVisual;

/** Arena dressing (the playable floor, walls, props, gate mist, phase variants). */
export interface ArenaVisual {
  root: THREE.Object3D;
  update(sim: Sim, dt: number): void;
  /** Called when the boss enters a phase with an arena_state keyword or on custom cues. */
  setState?(state: string): void;
  onCue?(id: string): void;
  dispose(): void;
}
export type ArenaBuilder = (def: ArenaDef, zone: ZoneDef, ctx: RenderCtx) => ArenaVisual;

/** Whole-zone visual (terrain, landmarks, props, water, particles, horizon vistas). */
export interface ZoneVisual {
  root: THREE.Object3D;
  update(sim: Sim, dt: number, camera: THREE.Camera): void;
  onCue?(id: string): void;
  dispose(): void;
}
export type ZoneBuilder = (def: ZoneDef, ctx: RenderCtx) => ZoneVisual | Promise<ZoneVisual>;

/** Metamondo diorama environment for a Form. */
export interface FormEnvironment {
  root: THREE.Object3D;
  update(sim: Sim, dt: number): void;
  dispose(): void;
}
export type FormEnvironmentBuilder = (def: FormDef, ctx: RenderCtx) => FormEnvironment;
