/** Zone runtime: terrain heights, colliders, arenas, interactables. Deterministic and render-free. */
import type { Content } from '../core/content';
import { clamp, dist2D, pointInPolygon, v3, type Vec3 } from '../core/math';
import { Terrain, altarAvoid, arenaShapeFrom, clampToArena, insideArena, propColliders, type ArenaShape } from '../core/terrain';
import type { ArenaDef, ColliderDef, ZoneDef } from '../core/types';

export type InteractKind = 'altar' | 'reperto' | 'vista' | 'exit' | 'ballista' | 'gate' | 'custom';

export interface Interactable {
  kind: InteractKind;
  id: string;
  pos: Vec3;
  radius: number;
  promptKey: string;
}

export class ZoneRuntime {
  readonly def: ZoneDef;
  readonly terrain: Terrain;
  readonly arenas: ArenaDef[];
  readonly colliders: ColliderDef[];
  interactables: Interactable[] = [];
  /** Currently active fight arena (bounds enforced). */
  activeArena: ArenaShape | null = null;
  activeArenaDef: ArenaDef | null = null;
  arenaVariant: string | null = null;
  /** Extra colliders from the active arena. */
  arenaColliders: ColliderDef[] = [];
  /** Arenas whose fog gate is still sealed from outside (boss not defeated). */
  sealed = new Set<string>();
  /** Metamondo space override (circle). */
  metaSpace: ArenaShape | null = null;
  gravitySign = 1;

  constructor(c: Content, zoneId: string) {
    this.def = c.zone(zoneId);
    this.arenas = this.def.arenas.map((a) => c.arena(a));
    this.terrain = new Terrain(this.def, this.arenas);
    const altarPos = c.altarsInZone(zoneId).map((a) => a.pos);
    this.colliders = [...(this.def.colliders ?? []), ...propColliders(this.terrain, altarAvoid(this.def, altarPos))];
    for (const a of c.altarsInZone(zoneId)) {
      this.interactables.push({ kind: 'altar', id: a.id, pos: { x: a.pos[0], y: a.pos[1], z: a.pos[2] }, radius: 2.6, promptKey: 'ui.prompt.meditate' });
    }
    for (const r of this.def.reperti) {
      const rd = c.reperto(r);
      this.interactables.push({ kind: 'reperto', id: r, pos: { x: rd.pos[0], y: rd.pos[1], z: rd.pos[2] }, radius: 2.2, promptKey: 'ui.prompt.examine' });
    }
    for (const v of this.def.vistas) {
      this.interactables.push({ kind: 'vista', id: v.id, pos: { x: v.pos[0], y: v.pos[1], z: v.pos[2] }, radius: 3.0, promptKey: 'ui.prompt.look' });
    }
    this.def.exits.forEach((e, i) => {
      this.interactables.push({ kind: 'exit', id: `${i}`, pos: { x: e.at[0], y: e.at[1], z: e.at[2] }, radius: e.radius, promptKey: e.kind === 'boat' || e.kind === 'ship' ? 'ui.prompt.board' : 'ui.prompt.continue' });
    });
  }

  groundAt(x: number, z: number): number {
    if (this.metaSpace) return this.metaSpace.floor;
    if (this.activeArena && insideArena(this.activeArena, x, z, -2)) return this.activeArena.floor;
    return this.terrain.heightAt(x, z);
  }

  surfaceAt(x: number, z: number): string {
    if (this.activeArenaDef) return this.activeArenaDef.surface;
    for (const a of this.arenas) if (this.terrain.arenaAt(x, z)?.id === a.id) return a.surface;
    const w = this.terrain.waterLevel();
    if (w !== null && this.terrain.heightAt(x, z) < w + 0.1) return 'water';
    return this.def.surface;
  }

  setActiveArena(def: ArenaDef | null, variant: string | null = null): void {
    this.activeArenaDef = def;
    this.arenaVariant = variant;
    if (!def) {
      this.activeArena = null;
      this.arenaColliders = [];
      this.gravitySign = 1;
      return;
    }
    const v = variant ? def.variants?.[variant] : undefined;
    this.activeArena = arenaShapeFrom(def, v);
    this.arenaColliders = v?.obstacles ?? def.obstacles;
    if (v?.gravity !== undefined) this.gravitySign = v.gravity;
  }

  /** Bound a point for the player or an actor. margin = body radius. Returns true if clamped. */
  clampPoint(p: Vec3, margin: number, inFight: boolean, allowSealedEntry: (arenaId: string, x: number, z: number) => boolean): boolean {
    const out: [number, number] = [p.x, p.z];
    if (this.metaSpace) {
      const moved = clampToArena(this.metaSpace, p.x, p.z, margin, out);
      p.x = out[0]; p.z = out[1];
      return moved;
    }
    if (inFight && this.activeArena) {
      const moved = clampToArena(this.activeArena, p.x, p.z, margin, out);
      p.x = out[0]; p.z = out[1];
      return moved;
    }
    let moved = false;
    // zone edge
    if (!this.terrain.inBounds(p.x, p.z, margin)) {
      moved = true;
      this.pushInsideZone(p, margin);
    }
    // sealed arenas behave as solid except through their fog gate
    for (const a of this.terrain.arenas) {
      if (!this.sealed.has(a.id)) continue;
      if (insideArena(a, p.x, p.z, -margin) && !allowSealedEntry(a.id, p.x, p.z)) {
        // push out radially
        const dx = p.x - a.cx, dz = p.z - a.cz;
        const d = Math.hypot(dx, dz) || 1;
        const r = (a.shape === 'circle' ? a.radius : Math.max(a.hx, a.hz)) + margin + 0.05;
        if (a.shape === 'circle') {
          p.x = a.cx + (dx / d) * r;
          p.z = a.cz + (dz / d) * r;
        } else {
          p.x = a.cx + (dx / d) * r;
          p.z = a.cz + (dz / d) * r;
        }
        moved = true;
      }
    }
    // deep water is not walkable
    const w = this.terrain.waterLevel();
    if (w !== null && this.terrain.zone.terrain.type !== 'deck' && this.terrain.heightAt(p.x, p.z) < w - 0.7 && !this.terrain.arenaAt(p.x, p.z)) {
      moved = true;
    }
    return moved;
  }

  private pushInsideZone(p: Vec3, margin: number): void {
    const z = this.def;
    if (z.bounds && z.bounds.length >= 6) {
      if (!pointInPolygon(p.x, p.z, z.bounds) || this.terrain.edgeDistance(p.x, p.z) < margin) {
        // move toward the nearest path point
        let best = Infinity, bx = p.x, bz = p.z;
        for (const q of z.path) {
          const d = Math.hypot(q[0] - p.x, q[2] - p.z);
          if (d < best) {
            best = d; bx = q[0]; bz = q[2];
          }
        }
        const k = Math.min(1, 0.6 / Math.max(0.6, best));
        p.x += (bx - p.x) * k;
        p.z += (bz - p.z) * k;
      }
      return;
    }
    const hw = z.size[0] / 2 - margin, hd = z.size[1] / 2 - margin;
    p.x = clamp(p.x, -hw, hw);
    p.z = clamp(p.z, -hd, hd);
  }

  /** Push a cylinder (player/actor) out of static colliders. */
  collideStatic(p: Vec3, r: number, height: number): void {
    const list = this.metaSpace ? [] : this.activeArena ? this.arenaColliders : this.colliders;
    for (const c of list) pushOut(c, p, r, height);
    if (!this.activeArena && !this.metaSpace) for (const a of this.arenas) for (const c of a.obstacles) pushOut(c, p, r, height);
  }

  nearestInteractable(p: Vec3, filter: (i: Interactable) => boolean): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      if (!filter(it)) continue;
      const d = dist2D(p, it.pos);
      if (d <= it.radius && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }
}

const tmp = v3();
export function pushOut(c: ColliderDef, p: Vec3, r: number, height: number): void {
  if (c.type === 'cylinder') {
    const cr = (c.r ?? 1) + r;
    const dx = p.x - c.c[0], dz = p.z - c.c[2];
    const top = c.c[1] + (c.h ?? 100);
    if (p.y > top - 0.05 || p.y + height < c.c[1]) return;
    const d2 = dx * dx + dz * dz;
    if (d2 < cr * cr) {
      const d = Math.sqrt(d2) || 1e-3;
      p.x = c.c[0] + (dx / d) * cr;
      p.z = c.c[2] + (dz / d) * cr;
    }
    return;
  }
  const half = c.half ?? [1, 1, 1];
  const yaw = c.yaw ?? 0;
  const s = Math.sin(yaw), co = Math.cos(yaw);
  const dx = p.x - c.c[0], dz = p.z - c.c[2];
  if (p.y > c.c[1] + half[1] - 0.05 || p.y + height < c.c[1] - half[1]) return;
  const lx = dx * co - dz * s, lz = dx * s + dz * co;
  const hx = half[0] + r, hz = half[2] + r;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return;
  // push along the axis of least penetration
  const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
  let nx = lx, nz = lz;
  if (px < pz) nx = Math.sign(lx || 1) * hx;
  else nz = Math.sign(lz || 1) * hz;
  tmp.x = c.c[0] + nx * co + nz * s;
  tmp.z = c.c[2] - nx * s + nz * co;
  p.x = tmp.x;
  p.z = tmp.z;
}
