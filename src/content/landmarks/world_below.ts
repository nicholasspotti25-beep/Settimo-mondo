/**
 * world_below: the panorama seen from a summit — a vast land far below (depth) spreading to the horizon, with the
 * regions of the journey placed by direction (degrees, 0 = local +Z): the golden plains and the descending road, the
 * dark forest with the Elder Tree's shadow, the swamp with its seeker lights, the black river of souls glinting, the
 * red glow on the far horizon; a ring of great peaks rising out of a sea of clouds that wraps the mountain. Hazy
 * impostor shading (shortened fog distance), a handful of draw calls.
 *
 * params: depth (-240), preset ('act1'), clouds (1 = density factor), seed. Place it at the zone center.
 */
import * as THREE from 'three';
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { blob, cone, cyl, displace, disposeTree, lathe, mat4, sphere, tube } from '../../render/world/geo';
import { Parts, R, num } from './_kit';
import { fbm2 } from '../../core/math';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (dirDeg: number, dist: number): [number, number] => {
  const a = (dirDeg * Math.PI) / 180;
  return [Math.sin(a) * dist, Math.cos(a) * dist];
};

export default function build(def: LandmarkDef, _zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const D = num(def, 'depth', -240);
  const seed = num(def, 'seed', 7);
  const cloudK = num(def, 'clouds', 1);
  const r = new R(seed);
  const p = new Parts(seed);
  const low = ctx.quality === 'low';

  // the land: a displaced ring far below
  const landH = (x: number, z: number) => {
    const d = Math.hypot(x, z);
    // the far land curves away (like a horizon) so its silhouette sits where the haze is soft, never a fogged sliver
    return fbm2(x / 520, z / 520, 4, seed) * 70 + fbm2(x / 140, z / 140, 2, seed + 3) * 14 - 60 * Math.max(0, 1 - (d - 260) / 500) - Math.max(0, d - 2300) * 0.55;
  };
  const land = new THREE.RingGeometry(260, 3400, low ? 40 : 72, low ? 8 : 14);
  land.rotateX(-Math.PI / 2);
  const P = land.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    P.setY(i, landH(x, z));
  }
  land.computeVertexNormals();
  p.add(land, 'impostor', { color: ['#3a3c30', '#76725a'], cover: 0, yRange: [D - 80, D + 60] }, mat4([0, D, 0]));

  // plains (north) + the road winding down to them
  for (let i = 0; i < 9; i++) {
    const [x, z] = at(r.range(-30, 30), r.range(520, 1300));
    p.add(blob(r.range(110, 220), 2, 0.12, i + 11), 'impostor', { color: ['#4e5232', '#8a8458'], cover: 0 }, mat4([x, D + landH(x, z) - 2, z], [0, r.range(0, 6), 0], [1.7, 0.05, 1]));
  }
  const road: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const [x, z] = at(4 + Math.sin(i * 1.3) * 9, 330 + i * 95);
    road.push(V3(x, D + landH(x, z) + 1.5, z));
  }
  p.add(tube(road, 2.6, 4, 50), 'impostor', { color: ['#6e6650', '#8a8064'], cover: 0 });
  for (let i = 0; i < 5; i++) {
    const [x, z] = at(r.range(-25, 25), r.range(700, 1200));
    p.add(cyl(3, 3.6, r.range(14, 30), 6), 'impostor', { color: ['#6a6476', '#aaa2ac'], cover: 0 }, mat4([x, D + 5, z]));
  }

  // dark forest (north-east) and the Elder Tree's shadow
  for (let i = 0; i < (low ? 70 : 150); i++) {
    const [x, z] = at(r.range(25, 70), r.range(700, 1700));
    const h = r.range(40, 75);
    p.add(cone(h * 0.36, h, 6), 'impostor', { color: ['#0c120c', '#22301e'], cover: 0 }, mat4([x, D, z]));
  }
  {
    const [x, z] = at(46, 1250);
    p.add(cyl(12, 22, 150, 7), 'impostor', { color: ['#0a0808', '#1c1814'], cover: 0 }, mat4([x, D, z]));
    for (let k = 0; k < 5; k++) p.add(blob(r.range(45, 70), 1, 0.35, 21 + k), 'impostor', { color: ['#0c140e', '#1e2c1a'], cover: 0 }, mat4([x + r.range(-60, 60), D + r.range(140, 175), z + r.range(-60, 60)], [0, r.range(0, 6), 0], [1.4, 0.5, 1.2]));
  }

  // swamp (east): dark flats, pools and seeker lanterns
  for (let i = 0; i < 6; i++) {
    const [x, z] = at(r.range(80, 108), r.range(700, 1400));
    p.add(blob(r.range(90, 160), 1, 0.15, i + 31), 'impostor', { color: ['#1e2018', '#36382a'], cover: 0 }, mat4([x, D + 3, z], [0, r.range(0, 6), 0], [1.5, 0.05, 1]));
    p.add(blob(r.range(40, 70), 0, 0.1, i + 41), 'glow', { color: '#1e2a2c' }, mat4([x + r.range(-50, 50), D + 6, z + r.range(-50, 50)], [0, r.range(0, 6), 0], [1.6, 0.02, 1]));
  }
  for (let i = 0; i < 14; i++) {
    const [x, z] = at(r.range(80, 108), r.range(700, 1400));
    p.add(sphere(3.2, 5, 4), 'glow', { color: '#c8862e' }, mat4([x, D + 12, z]));
  }

  // river of souls (south-east to east): a black ribbon with drifting lights
  const river: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const [x, z] = at(108 + i * 6 + Math.sin(i) * 3, 900 + i * 90);
    river.push(V3(x, D + 5, z));
  }
  p.add(tube(river, 22, 5, 50), 'glow', { color: '#101828' }, mat4([0, 0, 0], [0, 0, 0], [1, 0.12, 1]));
  for (let i = 0; i < 22; i++) {
    const q = river[r.int(0, river.length - 1)];
    p.add(sphere(2.2, 5, 4), 'glow', { color: '#8ab0ff' }, mat4([q.x + r.range(-20, 20), D + 9, q.z + r.range(-20, 20)]));
  }

  // the red glow far beyond the plains
  {
    const [x, z] = at(-12, 3000);
    for (let i = 0; i < 5; i++) p.add(cone(r.range(150, 260), r.range(120, 260), 7), 'impostor', { color: ['#1a1012', '#3a2024'], cover: 0 }, mat4([x + r.range(-500, 500), D, z + r.range(-100, 100)]));
    p.add(sphere(320, 12, 8), 'glow', { color: '#4a1006' }, mat4([x, D + 160, z], [0, 0, 0], [2.4, 0.7, 1]));
    p.add(sphere(150, 10, 6), 'glow', { color: '#7a240a' }, mat4([x, D + 190, z], [0, 0, 0], [2.0, 0.5, 1]));
  }

  // great peaks around (mostly west, south, east), rising out of the cloud sea: lumpy lathe profiles, light tops
  for (let i = 0; i < (low ? 9 : 16); i++) {
    const dir = r.range(120, 340);
    const [x, z] = at(dir, r.range(700, 1800));
    const h = r.range(200, 380);
    const rad = h * r.range(0.5, 0.75);
    const y0 = D - 40;
    const prof: [number, number][] = [[rad, 0], [rad * 0.72, h * 0.28], [rad * 0.46, h * 0.52], [rad * 0.24, h * 0.76], [rad * 0.08, h * 0.94], [0.01, h]];
    const g = displace(lathe(prof, 9), 0.16, 2.2 / rad, r.int(1, 999));
    p.add(g, 'impostor', { color: ['#34303e', '#d8d4e4'], cover: 0, yRange: [y0 + h * 0.45, y0 + h] }, mat4([x, y0, z], [0, r.range(0, 6), 0], [1, 1, r.range(0.7, 1.2)]));
    if (r.next() < 0.6) {
      const sh = h * r.range(0.45, 0.7);
      const g2 = displace(lathe(prof.map(([a, b]) => [a * 0.6, b * (sh / h)] as [number, number]), 8), 0.18, 3 / rad, r.int(1, 999));
      p.add(g2, 'impostor', { color: ['#34303e', '#c8c4d6'], cover: 0, yRange: [y0 + sh * 0.5, y0 + sh] }, mat4([x + r.range(-1, 1) * rad, y0, z + r.range(-1, 1) * rad]));
    }
  }

  // the sea of clouds wrapping the mountain, thinner toward the plains so the road stays visible
  const nCloud = Math.round((low ? 26 : 48) * cloudK);
  for (let i = 0; i < nCloud; i++) {
    const dir = r.range(0, 360);
    const north = Math.cos((dir * Math.PI) / 180) > 0.75;
    if (north && r.next() < 0.75) continue;
    const [x, z] = at(dir, r.range(280, 1100));
    const rad = r.range(70, 150);
    p.add(blob(rad, 2, 0.14, i + 51), 'impostor', { color: ['#8e88a6', '#d6cee0'], cover: 0 }, mat4([x, D + r.range(90, 150), z], [0, r.range(0, 6), 0], [1.6, 0.14, 1.3]));
  }

  const group = p.build({ impostor: { fogScale: 0.2, rim: 0 }, glow: { rim: 0 } }, false);
  group.name = 'world_below';
  group.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return { object: group, dispose: () => disposeTree(group) };
}
