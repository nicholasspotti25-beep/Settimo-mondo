/** Weapon visual contract (render side). Built by buildWeapon (index.ts), driven by installWeaponFx (fx.ts). */
import type * as THREE from 'three';
import type { WeaponDef } from '../../core/types';
import type { RenderCtx } from '../types';

export interface WeaponTrail {
  /** Core color of the swing ribbon (near the edge). */
  color: string;
  /** Outer glow color (fades toward the hilt). */
  glow: string;
  /** Ribbon brightness multiplier (0.6 subtle .. 1.4 vivid). */
  width: number;
}

/** Per-frame morph input computed from the sim by installWeaponFx (no allocation: one shared object). */
export interface WeaponMorph {
  /** 0 rest .. 1 fully extended (snake-sword, chains, whips). */
  extend: number;
  /** 0..1 Art intensity (blade glows, lanterns flare). */
  art: number;
  /** 0..1 swing intensity (active window). */
  swing: number;
  /** 0..1 elemental imbue on the Portatore (Lama Rovente's flames, buff_* Arts), fading out over its last second. */
  buff?: number;
}

/** Ambient particles the equipped weapon sheds along its blade line (emitted by installWeaponFx, player only). */
export interface WeaponAura {
  /** mist: cold breath (alpha, drifting down); ember: rising sparks; spark: crackling arcs; drip: falling lava drops. */
  kind: 'mist' | 'ember' | 'spark' | 'drip';
  color: string;
  /** Particles per second at rest (x3 while swinging, x4 under an Art or imbue). */
  rate: number;
  /** 0 hilt .. 1 tip: the part of the blade line that sheds (default 0.3 .. 1). */
  from?: number;
}

export interface WeaponVisual {
  root: THREE.Object3D;
  /** Local-space points along the striking edge (for trails). Morphing weapons move `tip` in place. */
  base: THREE.Vector3;
  tip: THREE.Vector3;
  /** Grip: 'r' right hand, 'both' two hands, 'dual' one per hand (second copy in `offhand`). */
  grip: 'r' | 'both' | 'dual' | 'bow' | 'fist';
  offhand?: THREE.Object3D;
  /** Off-hand blade line (dual weapons). */
  offBase?: THREE.Vector3;
  offTip?: THREE.Vector3;
  /** Swing-trail colors. */
  trail?: WeaponTrail;
  /** Ambient particles shed along the blade line. */
  aura?: WeaponAura;
  /** Triangle count (budget check: <= ~3k). */
  triangles?: number;
  /** The weapon definition this visual was built from. */
  def?: WeaponDef;
  /** Per-frame animation (rotating rings, flames...). */
  update?(dt: number, time: number): void;
  /** Sim-driven morph (extension, Art glow), called by installWeaponFx before update. */
  morph?(m: WeaponMorph): void;
  dispose(): void;
}

export type WeaponTemplate = (def: WeaponDef, ctx: RenderCtx) => WeaponVisual;

export interface WeaponColors {
  primary: string;
  secondary: string;
  accent: string;
}

export function colorsOf(def: WeaponDef): WeaponColors {
  const c = def.model?.colors as Partial<WeaponColors> | undefined;
  return { primary: c?.primary ?? '#c8c4bc', secondary: c?.secondary ?? '#5a4a3a', accent: c?.accent ?? '#ffe6b0' };
}

export function num(def: WeaponDef, key: string, d: number): number {
  const v = (def.model?.params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' ? v : d;
}

export function str(def: WeaponDef, key: string, d: string): string {
  const v = (def.model?.params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' ? v : d;
}

export function flag(def: WeaponDef, key: string): boolean {
  return (def.model?.params as Record<string, unknown> | undefined)?.[key] === true;
}
