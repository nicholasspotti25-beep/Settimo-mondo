/** Pooled projectiles, hazards and barriers (no per-frame allocation in hot paths). */
import { v3, type Vec3 } from '../core/math';
import type { Element, HitFlag, ShapeDef, StatusKind } from '../core/types';
import type { Team } from './types';

export interface Projectile {
  active: boolean;
  id: number;
  kind: string;
  visual: string;
  color: string;
  team: Team;
  owner: number;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  radius: number;
  damage: number;
  poise: number;
  flags: HitFlag[];
  element: Element;
  life: number;
  age: number;
  homing: number;
  gravity: number;
  accel: number;
  target: number; // actor id, -1 player, -99 none
  targetPart: number;
  pierce: boolean;
  hit: Set<number>;
  explode: number;
  status: { kind: StatusKind; dur: number; power?: number } | undefined;
  instance: number;
  returns: boolean;
  returning: boolean;
  maxDist: number;
  origin: Vec3;
  mult: number;
  /** Behavior-defined tag (e.g. 'soul', 'ballista'). */
  tag: string;
  /** Equilibrio contribution (player projectiles). */
  eco: number;
  art: string;
  scale: number;
}

export interface Hazard {
  active: boolean;
  id: number;
  kind: string;
  visual: string;
  color: string;
  team: Team;
  owner: number;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  shape: ShapeDef;
  delay: number;
  activeDur: number;
  age: number;
  damage: number;
  poise: number;
  flags: HitFlag[];
  element: Element;
  status: { kind: StatusKind; dur: number; power?: number } | undefined;
  /** Re-hit interval (s); 0 = single hit per target. */
  tick: number;
  lastHit: Map<number, number>;
  hitOnce: Set<number>;
  instance: number;
  mult: number;
  /** Player-team hazards: bind enemies inside for this long. */
  bind: number;
  pull: number;
  art: string;
  eco: number;
  /** Static arena hazard (never expires). */
  permanent: boolean;
  tag: string;
}

export interface Barrier {
  active: boolean;
  pos: Vec3;
  yaw: number;
  half: number;
  height: number;
  life: number;
  team: Team;
}

export class Pool<T extends { active: boolean }> {
  items: T[] = [];
  constructor(private make: () => T, initial: number) {
    for (let i = 0; i < initial; i++) this.items.push(make());
  }
  alloc(): T {
    for (const it of this.items) if (!it.active) return it;
    const it = this.make();
    this.items.push(it);
    return it;
  }
  forEachActive(fn: (it: T) => void): void {
    for (const it of this.items) if (it.active) fn(it);
  }
  clear(): void {
    for (const it of this.items) it.active = false;
  }
  countActive(): number {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }
}

export function makeProjectile(): Projectile {
  return {
    active: false, id: 0, kind: '', visual: 'orb', color: '#ffffff', team: 'enemy', owner: 0, pos: v3(), prevPos: v3(), vel: v3(), radius: 0.3,
    damage: 0, poise: 0, flags: [], element: 'physical', life: 1, age: 0, homing: 0, gravity: 0, accel: 0, target: -99, targetPart: -1,
    pierce: false, hit: new Set(), explode: 0, status: undefined, instance: 0, returns: false, returning: false, maxDist: 0, origin: v3(), mult: 1,
    tag: '', eco: 0, art: '', scale: 1,
  };
}

export function makeHazard(): Hazard {
  return {
    active: false, id: 0, kind: '', visual: 'circle', color: '#ffffff', team: 'enemy', owner: 0, pos: v3(), vel: v3(), yaw: 0,
    shape: { type: 'cylinder', c: [0, 0, 0], r: 1, h: 2 }, delay: 0, activeDur: 0, age: 0, damage: 0, poise: 0, flags: [], element: 'physical',
    status: undefined, tick: 0, lastHit: new Map(), hitOnce: new Set(), instance: 0, mult: 1, bind: 0, pull: 0, art: '', eco: 0, permanent: false, tag: '',
  };
}

export function makeBarrier(): Barrier {
  return { active: false, pos: v3(), yaw: 0, half: 2, height: 3, life: 0, team: 'player' };
}
