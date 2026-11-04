/**
 * Forge: assembles a procedural weapon from kit geometry into a handful of merged meshes (one per surface: metal,
 * matte, glow, plus optional named movable pieces), all colors in vertex colors. Weapon frame: origin in the fist,
 * +Z along the blade / shaft out of the fist, the edge plane is the YZ plane (edges face +Y / -Y), +X is the flat.
 */
import * as THREE from 'three';
import * as geo from '../kit/geometry';
import type { V3 } from '../kit/geometry';
import type { DetailKind } from '../kit/textures';
import type { RenderCtx } from '../types';

export type SurfaceKind = 'metal' | 'matte' | 'glow';

export interface ForgeStyle {
  metalRough?: number;
  metalness?: number;
  matteRough?: number;
  matteDetail?: DetailKind | null;
  matteDetailScale?: number;
  metalDetail?: DetailKind | null;
  glowIntensity?: number;
  rim?: number;
}

export interface Forged {
  root: THREE.Group;
  materials: Record<SurfaceKind, THREE.MeshStandardMaterial | null>;
  triangles: number;
  /** Extra disposables (geometries / materials of pieces). */
  disposables: { dispose(): void }[];
}

const DEG = Math.PI / 180;

export class Forge {
  private lists: Record<SurfaceKind, THREE.BufferGeometry[]> = { metal: [], matte: [], glow: [] };
  private pieces: { obj: THREE.Object3D; kind: SurfaceKind; geos: THREE.BufferGeometry[]; instances: number }[] = [];
  readonly q: number;

  constructor(readonly ctx: RenderCtx, readonly style: ForgeStyle = {}) {
    this.q = ctx.quality === 'high' ? 1 : ctx.quality === 'medium' ? 0.8 : 0.6;
  }

  /** Quality-scaled segment count. */
  seg(base: number, min = 3): number {
    return Math.max(min, Math.round(base * this.q));
  }

  /** Add a geometry to a surface: transform (pos, rot degrees XYZ, scale) then paint. */
  add(kind: SurfaceKind, g: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, pos?: V3, rot?: V3, scale?: V3 | number): THREE.BufferGeometry {
    geo.xform(g, pos, rot, scale);
    if (color !== null) geo.paint(g, color);
    this.lists[kind].push(stripUv(g));
    return g;
  }

  /** Add with a color gradient along an axis of the (transformed) geometry. */
  grad(kind: SurfaceKind, g: THREE.BufferGeometry, axis: 0 | 1 | 2, c0: THREE.ColorRepresentation, c1: THREE.ColorRepresentation, pos?: V3, rot?: V3, scale?: V3 | number): THREE.BufferGeometry {
    geo.xform(g, pos, rot, scale);
    geo.gradient(g, axis, c0, c1);
    this.lists[kind].push(stripUv(g));
    return g;
  }

  /** A separately transformable piece (pendulum lanterns, rings, segments): its own mesh on its own Object3D. */
  piece(kind: SurfaceKind, geos: THREE.BufferGeometry[], parent: THREE.Object3D | null = null, pos?: V3): THREE.Object3D {
    const obj = new THREE.Group();
    if (pos) obj.position.set(pos[0], pos[1], pos[2]);
    this.pieces.push({ obj, kind, geos: geos.map(stripUv), instances: 0 });
    (obj.userData as { parentPiece?: THREE.Object3D | null }).parentPiece = parent;
    return obj;
  }

  /** Instanced copies of one geometry (segments, scales); returns the InstancedMesh after build via `onBuilt`. */
  instanced(kind: SurfaceKind, g: THREE.BufferGeometry, count: number): { obj: THREE.Object3D; mesh: () => THREE.InstancedMesh | null } {
    const obj = new THREE.Group();
    const entry = { obj, kind, geos: [stripUv(g)], instances: count };
    this.pieces.push(entry);
    return { obj, mesh: () => (obj.children[0] as THREE.InstancedMesh | undefined) ?? null };
  }

  build(): Forged {
    const ctx = this.ctx, st = this.style;
    const root = new THREE.Group();
    root.name = 'weapon';
    const used = (k: SurfaceKind): boolean => this.lists[k].length > 0 || this.pieces.some((p) => p.kind === k);
    const materials: Record<SurfaceKind, THREE.MeshStandardMaterial | null> = {
      metal: used('metal')
        ? ctx.kit.surface({ vertexColors: true, metalness: st.metalness ?? 0.78, roughness: st.metalRough ?? 0.3, detail: st.metalDetail === undefined ? 'metal' : st.metalDetail, detailScale: 9, detailStrength: 0.3, rim: st.rim ?? 1.15, rimPower: 2.6 })
        : null,
      matte: used('matte')
        ? ctx.kit.surface({ vertexColors: true, metalness: 0.04, roughness: st.matteRough ?? 0.72, detail: st.matteDetail === undefined ? 'leather' : st.matteDetail, detailScale: st.matteDetailScale ?? 14, detailStrength: 0.45, rim: st.rim ?? 1.0 })
        : null,
      glow: used('glow')
        ? ctx.kit.surface({ vertexColors: true, color: '#ffffff', emissive: '#ffffff', emissiveIntensity: st.glowIntensity ?? 1.8, emissiveVertexColor: true, roughness: 0.5, metalness: 0, detail: null, rim: 0.4 })
        : null,
    };
    const disposables: { dispose(): void }[] = [];
    let triangles = 0;
    for (const k of ['matte', 'metal', 'glow'] as SurfaceKind[]) {
      const l = this.lists[k];
      if (!l.length) continue;
      const g = geo.mergeGeometries(l);
      for (const x of l) x.dispose();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, materials[k]!);
      m.frustumCulled = false;
      m.name = `weapon-${k}`;
      root.add(m);
      triangles += geo.triCount(g);
      disposables.push(g);
    }
    for (const p of this.pieces) {
      const g = p.geos.length > 1 ? geo.mergeGeometries(p.geos) : p.geos[0];
      if (p.geos.length > 1) for (const x of p.geos) x.dispose();
      let mesh: THREE.Mesh;
      if (p.instances > 0) {
        const im = new THREE.InstancedMesh(g, materials[p.kind]!, p.instances);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh = im;
        triangles += geo.triCount(g) * p.instances;
      } else {
        mesh = new THREE.Mesh(g, materials[p.kind]!);
        triangles += geo.triCount(g);
      }
      mesh.frustumCulled = false;
      p.obj.add(mesh);
      const parent = (p.obj.userData as { parentPiece?: THREE.Object3D | null }).parentPiece ?? root;
      parent.add(p.obj);
      disposables.push(g);
    }
    for (const k of ['metal', 'matte', 'glow'] as SurfaceKind[]) if (materials[k]) disposables.push(materials[k]!);
    return { root, materials, triangles, disposables };
  }
}

/** Kit geometries carry uvs; weapons never use them (merging needs matching attribute sets). */
function stripUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.attributes.color) geo.paint(g, '#ffffff');
  return g;
}

/* ---------------------------------------------------------------------------------------------------------------- */
/* Shape helpers (all in the weapon frame: +Z along the weapon)                                                     */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Lathe around +Z from [radius, z] pairs (handles, shafts, pommels, ferrules). */
export function latheZ(profile: [number, number][], segs: number): THREE.BufferGeometry {
  const g = geo.lathe(profile, segs);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Straight cylinder along +Z from z0 to z1. */
export function rodZ(r0: number, r1: number, z0: number, z1: number, segs: number, rings = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, Math.max(1e-4, z1 - z0), segs, rings, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/**
 * Flat blade along +Z from a half-width profile [[t, halfWidth], ...] (t 0 base .. 1 tip), length L, thickness th.
 * Edges face +-Y, flats face +-X. Optional `offset(t)` bends the centre line along Y (curved blades).
 */
export function bladeZ(L: number, profile: [number, number][], th: number, steps: number, offset?: (t: number) => number): THREE.BufferGeometry {
  const right: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = sampleProfile(profile, t);
    right.push([w + (offset ? offset(t) : 0), t * L]);
  }
  const left: [number, number][] = [];
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const w = sampleProfile(profile, t);
    if (w < 1e-4 && (i === steps || i === 0)) continue;
    left.push([-w + (offset ? offset(t) : 0), t * L]);
  }
  const g = geo.blade([...right, ...left], th, th * 0.42, 2);
  // blade(): x across, y along, z thickness -> edges on +-Y, along +Z, flats +-X
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function sampleProfile(p: [number, number][], t: number): number {
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const k = (t - p[i - 1][0]) / Math.max(1e-6, p[i][0] - p[i - 1][0]);
      return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k;
    }
  }
  return p[p.length - 1][1];
}

/** Thin engraved line (tube) through points, for inlays and engravings. */
export function inlay(points: V3[], r: number, radial = 4): THREE.BufferGeometry {
  return geo.tube(points, r, { radial, perSeg: 2 });
}

/** Spiral wrap (leather / cord) around the Z axis between z0 and z1. */
export function wrapZ(radius: number, z0: number, z1: number, turns: number, r: number, radial = 4, steps = 36): THREE.BufferGeometry {
  const pts: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = t * turns * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius, z0 + (z1 - z0) * t]);
  }
  return geo.tube(pts, r, { radial, perSeg: 1 });
}

export const deg = DEG;
