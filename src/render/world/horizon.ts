/**
 * Horizon impostors: low-detail silhouettes of the regions ahead, placed far outside the zone (zone.horizon entries:
 * {builder, dir (degrees, 0 = +Z north, 90 = +X east), dist (m from the zone center), scale}). They use the 'impostor'
 * world material (fog distance shortened so they read as hazy, atmospheric shapes) and cost a handful of draw calls.
 * Builders: mountains, cliffs, castle, forest, dark_forest, ruins, plains, swamp, river, red_glow, volcano, ice_castle,
 * yggdrasil, sea_cliffs.
 */
import * as THREE from 'three';
import type { ZoneDef } from '../../core/types';
import type { RenderCtx } from '../types';
import type { ZoneEnv } from './env';
import { Parts, R, archShape, blob, box, cone, cyl, extrude, mat4, sphere, tube } from './geo';
import { hashString } from '../../core/rng';

type HorizonFn = (p: Parts, r: R, s: number) => void;

const ROCK: [string, string] = ['#3a3644', '#6a6270'];
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function ridge(p: Parts, r: R, s: number, n: number, w: number, h: number, snow: boolean, col: [string, string] = ROCK): void {
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * w * s;
    const hh = h * s * r.range(0.45, 1.0) * (1 - Math.abs(i / (n - 1) - 0.5) * 0.8);
    const rad = hh * r.range(0.55, 0.85);
    p.add(cone(rad, hh, 7), 'impostor', { color: col, cover: 0 }, mat4([x, -hh * 0.05, r.range(-0.2, 0.2) * w * s * 0.2], [0, r.range(0, 6), 0]));
    if (snow) p.add(cone(rad * 0.36, hh * 0.36, 7), 'impostor', { color: ['#c8c8d8', '#f4f4fa'], cover: 0 }, mat4([x, hh * 0.64 - hh * 0.05, 0], [0, r.range(0, 6), 0]));
  }
}

function towers(p: Parts, r: R, s: number, col: [string, string], n: number, spread: number, hMax: number): void {
  for (let i = 0; i < n; i++) {
    const x = (r.next() - 0.5) * spread * s, z = (r.next() - 0.5) * spread * 0.4 * s;
    const h = hMax * s * r.range(0.45, 1);
    const rad = s * r.range(3, 6);
    p.add(cyl(rad, rad * 1.1, h, 8), 'impostor', { color: col, cover: 0 }, mat4([x, 0, z]));
    p.add(cone(rad * 1.3, h * 0.35, 8), 'impostor', { color: ['#2a2638', '#4a4258'], cover: 0 }, mat4([x, h, z]));
    if (r.next() < 0.5) p.add(sphere(rad * 0.35, 6, 4), 'glow', { color: '#6a5020' }, mat4([x, h * 0.7, z + rad]));
  }
}

const BUILDERS: Record<string, HorizonFn> = {
  mountains: (p, r, s) => ridge(p, r, s, 9, 900, 320, true),
  cliffs: (p, r, s) => ridge(p, r, s, 12, 700, 160, false, ['#2e2a30', '#56505a']),
  castle: (p, r, s) => {
    const col: [string, string] = ['#7a7486', '#c8c0cc'];
    ridge(p, r, s, 5, 260, 120, false);
    p.add(box(160 * s, 40 * s, 40 * s), 'impostor', { color: col, cover: 0 }, mat4([0, 90 * s, 0]));
    towers(p, r, s, col, 7, 170, 120);
    const arch = archShape(30 * s, 46 * s, 16 * s, 34 * s);
    for (let i = -1; i <= 1; i++) p.add(extrude(arch, 6 * s), 'impostor', { color: col, cover: 0 }, mat4([i * 40 * s, 110 * s, 22 * s]));
  },
  forest: (p, r, s) => {
    for (let i = 0; i < 46; i++) {
      const x = (r.next() - 0.5) * 700 * s, z = (r.next() - 0.5) * 160 * s;
      const h = r.range(20, 38) * s;
      p.add(cone(h * 0.32, h, 6), 'impostor', { color: ['#141c18', '#2a3a2c'], cover: 0 }, mat4([x, -2, z]));
    }
  },
  dark_forest: (p, r, s) => {
    for (let i = 0; i < 40; i++) {
      const x = (r.next() - 0.5) * 600 * s, z = (r.next() - 0.5) * 200 * s;
      const h = r.range(40, 70) * s;
      p.add(cyl(h * 0.05, h * 0.08, h * 0.7, 5), 'impostor', { color: ['#0e0c0c', '#1e1a16'], cover: 0 }, mat4([x, -2, z]));
      p.add(blob(h * 0.3, 0, 0.3, i + 3), 'impostor', { color: ['#0e1610', '#1e2e1c'], cover: 0 }, mat4([x, h * 0.78, z], [0, 0, 0], [1.2, 0.6, 1.2]));
    }
    // the Elder Tree's shadow towering over the canopy
    p.add(cyl(14 * s, 24 * s, 150 * s, 7), 'impostor', { color: ['#0a0808', '#1a1612'], cover: 0 }, mat4([60 * s, -2, 20 * s]));
    p.add(blob(70 * s, 1, 0.35, 11), 'impostor', { color: ['#0c140e', '#1c2a1a'], cover: 0 }, mat4([60 * s, 160 * s, 20 * s], [0, 0, 0], [1.3, 0.55, 1.1]));
  },
  ruins: (p, r, s) => {
    const col: [string, string] = ['#6a6476', '#a8a0aa'];
    for (let i = 0; i < 9; i++) {
      const x = (r.next() - 0.5) * 360 * s;
      const h = r.range(12, 40) * s;
      p.add(cyl(2.4 * s, 2.8 * s, h, 6), 'impostor', { color: col, cover: 0 }, mat4([x, 0, r.range(-30, 30) * s]));
    }
    p.add(extrude(archShape(40 * s, 34 * s, 24 * s, 26 * s), 5 * s), 'impostor', { color: col, cover: 0 }, mat4([20 * s, 0, 0]));
    ridge(p, r, s, 6, 500, 60, false, ['#3a3a40', '#5a5660']);
  },
  plains: (p, r, s) => {
    for (let i = 0; i < 8; i++) p.add(blob(r.range(60, 120) * s, 1, 0.2, i), 'impostor', { color: ['#3a4430', '#6a7050'], cover: 0 }, mat4([(i / 7 - 0.5) * 900 * s, -30 * s, r.range(-60, 60) * s], [0, 0, 0], [1.6, 0.35, 1]));
    for (let i = 0; i < 4; i++) p.add(cyl(2 * s, 2.4 * s, r.range(10, 22) * s, 6), 'impostor', { color: ['#6a6476', '#a8a0aa'], cover: 0 }, mat4([(r.next() - 0.5) * 600 * s, 0, 0]));
  },
  swamp: (p, r, s) => {
    for (let i = 0; i < 26; i++) {
      const x = (r.next() - 0.5) * 700 * s, z = (r.next() - 0.5) * 120 * s, h = r.range(14, 30) * s;
      p.add(tube([V3(x, -2, z), V3(x + r.range(-4, 4) * s, h * 0.6, z), V3(x + r.range(-8, 8) * s, h, z)], 1.2 * s, 4, 4, 0.3 * s), 'impostor', { color: ['#16140f', '#2a281e'], cover: 0 });
    }
    for (let i = 0; i < 6; i++) p.add(sphere(2 * s, 6, 4), 'glow', { color: '#5a4a1a' }, mat4([(r.next() - 0.5) * 600 * s, r.range(4, 10) * s, (r.next() - 0.5) * 100 * s]));
  },
  river: (p, r, s) => {
    const g = new THREE.PlaneGeometry(900 * s, 50 * s, 1, 1);
    g.rotateX(-Math.PI / 2);
    p.add(g, 'glow', { color: '#1a2a3a' }, mat4([0, 1, 0]));
    for (let i = 0; i < 18; i++) p.add(sphere(1.6 * s, 6, 4), 'glow', { color: '#5a7a9a' }, mat4([(r.next() - 0.5) * 800 * s, 3 * s, (r.next() - 0.5) * 40 * s]));
    ridge(p, r, s, 6, 900, 50, false, ['#1e1c22', '#3a3640']);
  },
  red_glow: (p, r, s) => {
    ridge(p, r, s, 5, 500, 200, false, ['#1e1214', '#3a2024']);
    p.add(sphere(90 * s, 12, 8), 'glow', { color: '#5a1206' }, mat4([0, 140 * s, 0], [0, 0, 0], [2.2, 1, 1]));
    p.add(sphere(40 * s, 10, 6), 'glow', { color: '#8a2a0a' }, mat4([0, 170 * s, 0], [0, 0, 0], [1.8, 0.7, 1]));
  },
  volcano: (p, r, s) => {
    p.add(cone(260 * s, 300 * s, 10), 'impostor', { color: ['#1a1416', '#3a2a2a'], cover: 0 });
    p.add(sphere(50 * s, 10, 6), 'glow', { color: '#7a2a08' }, mat4([0, 300 * s, 0], [0, 0, 0], [1.4, 0.6, 1.4]));
  },
  ice_castle: (p, r, s) => {
    ridge(p, r, s, 6, 600, 260, true, ['#4a5a70', '#8aa0b8']);
    towers(p, r, s, ['#8ab0d0', '#e0f0ff'], 6, 120, 160);
  },
  yggdrasil: (p, r, s) => {
    const bark: [string, string] = ['#1e1a1a', '#3e342e'];
    p.add(cyl(45 * s, 80 * s, 900 * s, 9), 'impostor', { color: bark, cover: 0 }, mat4([0, -100 * s, 0]));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const L = r.range(260, 420) * s;
      p.add(tube([V3(0, 720 * s, 0), V3(Math.cos(a) * L * 0.5, 820 * s, Math.sin(a) * L * 0.5), V3(Math.cos(a) * L, 900 * s, Math.sin(a) * L)], 18 * s, 6, 6, 5 * s), 'impostor', { color: bark, cover: 0 });
      p.add(blob(150 * s, 1, 0.3, i), 'impostor', { color: ['#2a3a2a', '#5a7040'], cover: 0 }, mat4([Math.cos(a) * L, 940 * s, Math.sin(a) * L], [0, 0, 0], [1, 0.45, 1]));
    }
    p.add(blob(260 * s, 1, 0.3, 99), 'impostor', { color: ['#2a3a2a', '#6a8048'], cover: 0 }, mat4([0, 1000 * s, 0], [0, 0, 0], [1.2, 0.5, 1.2]));
  },
  sea_cliffs: (p, r, s) => ridge(p, r, s, 8, 800, 120, false, ['#2a2a34', '#4a4a56']),
};

export function horizonBuilders(): string[] {
  return Object.keys(BUILDERS);
}

export interface HorizonVisual {
  group: THREE.Group;
  update(camera: THREE.Camera, dt: number): void;
  dispose(): void;
}

/** Build the zone's horizon silhouettes. Base height follows the backdrop (regions below a summit sit far down). */
export async function buildHorizon(def: ZoneDef, _ctx: RenderCtx, env: ZoneEnv): Promise<HorizonVisual> {
  const group = new THREE.Group();
  group.name = 'horizon';
  const baseY = env.backdrop === 'drop' ? -env.backdropHeight * 2.2 : env.backdrop === 'peaks' ? 20 : -6;
  for (const h of def.horizon ?? []) {
    const fn = BUILDERS[h.builder] ?? BUILDERS.mountains;
    if (!BUILDERS[h.builder]) console.warn(`[world] unknown horizon builder '${h.builder}'`);
    const p = new Parts(hashString(`${def.id}:${h.builder}:${h.dir}`));
    const r = new R(hashString(`${def.id}:hz:${h.builder}:${h.dir}`));
    fn(p, r, h.scale ?? 1);
    const g = p.build({}, false);
    const a = (h.dir * Math.PI) / 180;
    g.position.set(Math.sin(a) * h.dist, baseY, Math.cos(a) * h.dist);
    g.rotation.y = a + Math.PI; // face the zone
    g.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      o.matrixAutoUpdate = false;
      o.updateMatrix();
    });
    group.add(g);
  }
  group.updateMatrixWorld(true);
  return {
    group,
    update() {
      /* static silhouettes */
    },
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
