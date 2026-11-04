/**
 * Soglia di Dite — Cerbero's arena before the Porta di Dite (data/arenas/dite_soglia.yaml: centre z 50, r 30, fog gate
 * south at z 20; the road goes on north to the exit at z 170).
 *  - The Porta di Dite (Bible C9: "an immense arch of bones and iron set in rock") stands 18 m past the north edge: a
 *    pointed portal of seven giant ribs strapped with iron, vertebrae for voussoirs and a horned skull for keystone, set
 *    between two basalt massifs ~50 m high with ribs breaking out of the rock; two riveted iron leaves close it, an iron
 *    eye in the tympanum glows red. The leaves swing open on `dite_gate_open` (defeat sequence) and stay open once
 *    Cerbero is defeated: "la Porta si apre soltanto per le anime".
 *  - Souls (pale blue lights) drift from the dark toward the Gate and wait before the shut leaves; once it opens they
 *    pass through and the burning red of Dis glows between the leaves.
 *  - Three iron anchor rings at the Gate's foot, their chains lying broken toward the arena: Cerbero's old tethers.
 *    `cerbero_chains` (intro: "Le catene tintinnano") jolts and rattles them.
 *  - The floor: a seal of black basalt slabs in concentric rings, bone-white grout, an iron medallion with three spokes
 *    (one per head); a kerb of dark blocks rings the walkable circle (open at the fog gate and at the road north).
 *  - Six braziers of cold soul-fire, basalt teeth and heaps of bones beyond the kerb.
 *  - Phase 2 (boss flag `chains_broken`): the links of the chain across his chest burst and fall clattering on the
 *    slabs, where they lie until the fight resets.
 */
import * as THREE from 'three';
import type { ArenaDef, ZoneDef } from '../../../core/types';
import type { Sim } from '../../../sim/sim';
import type { ArenaVisual, RenderCtx } from '../../../render/types';
import { zoneEnv } from '../../../render/world/env';
import { Parts, R, blob, box, cone, cyl, disposeTree, displace, extrude, lathe, mat4, sphere, torus, tube } from '../../../render/world/geo';
import { GlowSet } from '../../../render/world/glows';
import { useWorldFog, worldMat } from '../../../render/world/materials';
import { ATMOS } from '../../../render/world/atmosphere';

const TAU = Math.PI * 2;
const BONE: [string, string] = ['#8c816c', '#d9ceb4'];
const BASALT: [string, string] = ['#141215', '#3a3237'];
const IRON = '#2a282c';
const IRON_HOT = '#4a2a22';

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

/** Matrix of a chain link at p, its long axis along d; `flat` lays the link's plane on the ground. */
function linkMatrix(p: THREE.Vector3, d: THREE.Vector3, flat: boolean, out: THREE.Matrix4): THREE.Matrix4 {
  _y.copy(d).normalize();
  if (flat) _z.set(0, 1, 0);
  else _z.crossVectors(_y, _x.set(0, 1, 0)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  return out.makeBasis(_x, _y, _z).setPosition(p);
}

function linkGeo(R0: number, r: number): THREE.BufferGeometry {
  const g = torus(R0, r, 5, 12);
  g.scale(1, 1.5, 1.2);
  return g;
}

/** Points of the pointed arch of the portal (x from +a over the apex to -a), at depth z. */
function archPoints(a: number, spring: number, z: number, n: number, down: boolean): THREE.Vector3[] {
  const Rr = 1.6 * a, c = Rr - a;
  const th = Math.acos(c / Rr);
  const pts: THREE.Vector3[] = [];
  if (down) pts.push(new THREE.Vector3(a * 1.02, 0, z), new THREE.Vector3(a, spring * 0.5, z));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * th;
    pts.push(new THREE.Vector3(-c + Rr * Math.cos(t), spring + Rr * Math.sin(t), z));
  }
  for (let i = n - 1; i >= 0; i--) {
    const t = (i / n) * th;
    pts.push(new THREE.Vector3(c - Rr * Math.cos(t), spring + Rr * Math.sin(t), z));
  }
  if (down) pts.push(new THREE.Vector3(-a, spring * 0.5, z), new THREE.Vector3(-a * 1.02, 0, z));
  return pts;
}

/** A slab of the floor seal: an annular sector (no wedge gaps between neighbours), top at y0 + h, world space. */
function sector(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y0: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 1, 1);
  const pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const a = a0 + (pa.getX(i) + 0.5) * (a1 - a0), rr = r0 + (pa.getZ(i) + 0.5) * (r1 - r0);
    pa.setXYZ(i, cx + Math.sin(a) * rr, y0 + (pa.getY(i) + 0.5) * h, cz + Math.cos(a) * rr);
  }
  g.computeVertexNormals();
  return g;
}

/** A transient falling link (phase 2 debris). */
interface Debris { p: THREE.Vector3; v: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; rest: boolean }

export default function build(def: ArenaDef, zone: ZoneDef, ctx: RenderCtx): ArenaVisual {
  const env = zoneEnv(zone, ctx);
  const root = new THREE.Group();
  root.name = `arena:${def.id}`;
  const low = ctx.quality === 'low';
  const [cx, , cz] = def.center;
  const rad = def.radius ?? 30;
  const fy = def.floor_y ?? 0;
  const r = new R(7071);
  const p = new Parts(7072);
  const gy = (x: number, z: number) => env.heightAt(x, z);
  const gateA = Math.atan2(def.gate.pos[0] - cx, def.gate.pos[2] - cz);
  const northA = 0;
  const angGap = (a: number, c: number) => {
    let d = a - c;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return Math.abs(d);
  };
  const open = (a: number, w: number) => angGap(a, gateA) < w || angGap(a, northA) < w;

  /* --- the floor seal: concentric rings of basalt slabs, bone grout, iron medallion with three spokes --- */
  const ringW = 2.4;
  for (let rr = 3.6 + ringW / 2; rr < rad - 0.4; rr += ringW) {
    const n = Math.max(8, Math.round((TAU * rr) / (low ? 3.4 : 2.6)));
    const off = r.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU, da = TAU / n;
      const gap = 0.07 / rr;
      const tone = r.next();
      const col = tone < 0.12 ? '#3a2523' : tone < 0.5 ? '#221f24' : tone < 0.85 ? '#2b272b' : '#333034';
      const top = fy + 0.035 + r.range(-0.008, 0.004);
      p.add(sector(cx, cz, rr - ringW / 2 + 0.07, rr + ringW / 2 - 0.07, a + gap, a + da - gap, top - 0.2, 0.2), 'matte', { color: col, cover: 0.2, jitter: 0.05 });
    }
  }
  // medallion: iron disc, bone inlay ring, three iron spokes (one per head)
  p.add(cyl(3.5, 3.5, 0.16, 40), 'matte', { color: '#1a171b', cover: 0.1 }, mat4([cx, fy - 0.04, cz]));
  p.add(torus(2.7, 0.14, 4, 48), 'matte', { color: '#cfc3a8', cover: 0 }, mat4([cx, fy + 0.005, cz], [Math.PI / 2, 0, 0], [1, 1, 0.22]));
  for (let i = 0; i < 3; i++) {
    const a = gateA + Math.PI + (i - 1) * 0.62;
    p.add(box(0.36, 0.06, 2.4), 'matte', { color: '#5a2a22', cover: 0 }, mat4([cx + Math.sin(a) * 1.2, fy + 0.01, cz + Math.cos(a) * 1.2], [0, a, 0]));
  }
  // kerb: dark blocks just outside the walkable circle
  {
    const n = Math.round((TAU * (rad + 0.9)) / 2.3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      if (open(a, 0.13)) continue;
      const x = cx + Math.sin(a) * (rad + 0.95), z = cz + Math.cos(a) * (rad + 0.95);
      const g = new THREE.BoxGeometry(2.2, 0.7, 1.1, 2, 1, 1);
      displace(g, 0.08, 1.2, r.int(1, 999));
      p.add(g, 'matte', { color: ['#141216', '#2e2a2e'], aoBottom: 0.6, cover: 0.3, jitter: 0.05 }, mat4([x, fy + 0.12 + r.range(-0.08, 0.06), z], [r.range(-0.04, 0.04), a + Math.PI / 2, r.range(-0.04, 0.04)]));
    }
  }

  /* --- beyond the kerb: basalt teeth and heaps of bones --- */
  for (let i = 0; i < (low ? 14 : 24); i++) {
    const a = r.range(0, TAU);
    if (open(a, 0.32)) continue;
    const dist = rad + r.range(6, 20);
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
    if (z > cz + rad + 8) continue; // keep the Gate's forecourt clear
    const h = r.range(5, 15), w = r.range(1.6, 3.6);
    const g = cone(w, h, 7);
    displace(g, w * 0.22, 0.5, r.int(1, 999));
    p.add(g, 'matte', { color: BASALT, aoBottom: 0.5, cover: 0.5, jitter: 0.06 }, mat4([x, gy(x, z) + h / 2 - 0.6, z], [r.range(-0.12, 0.12), r.range(0, TAU), r.range(-0.12, 0.12)]));
  }
  const bonePile = (x: number, z: number, s: number) => {
    const y0 = gy(x, z);
    p.add(blob(1.3 * s, 1, 0.3, r.int(1, 999), 0.55), 'matte', { color: ['#4a4038', '#7a6e5c'], aoBottom: 0.5, cover: 0.6 }, mat4([x, y0 + 0.1, z]));
    for (let k = 0; k < 3; k++) {
      // skulls: cranium + dark sockets
      const sx = x + r.range(-1.2, 1.2) * s, sz = z + r.range(-1.2, 1.2) * s, sy = y0 + 0.5 * s + r.range(0, 0.5) * s;
      const yaw = r.range(0, TAU);
      p.add(sphere(0.42 * s, 9, 7), 'matte', { color: BONE, cover: 0.2 }, mat4([sx, sy, sz], [r.range(-0.4, 0.4), yaw, r.range(-0.4, 0.4)], [1, 0.9, 1.15]));
      for (const e of [-1, 1]) p.add(sphere(0.1 * s, 6, 5), 'matte', { color: '#120e0e' }, mat4([sx + Math.sin(yaw) * 0.36 * s + Math.cos(yaw) * e * 0.15 * s, sy + 0.05 * s, sz + Math.cos(yaw) * 0.36 * s - Math.sin(yaw) * e * 0.15 * s]));
    }
    for (let k = 0; k < 5; k++) {
      // long bones lying askew
      const a = r.range(0, TAU), L = r.range(1.4, 2.4) * s;
      const bx = x + r.range(-1.4, 1.4) * s, bz = z + r.range(-1.4, 1.4) * s;
      p.add(cyl(0.09 * s, 0.11 * s, L, 6), 'matte', { color: BONE, cover: 0.3 }, mat4([bx, y0 + 0.35 * s, bz], [Math.PI / 2 + r.range(-0.3, 0.3), a, 0]));
      for (const e of [-0.5, 0.5]) p.add(sphere(0.18 * s, 6, 5), 'matte', { color: BONE }, mat4([bx + Math.sin(a) * L * e, y0 + 0.35 * s + r.range(-0.1, 0.1), bz + Math.cos(a) * L * e]));
    }
  };
  for (let i = 0; i < (low ? 6 : 11); i++) {
    const a = (i / 11) * TAU + r.range(-0.2, 0.2);
    if (open(a, 0.3)) continue;
    const dist = rad + r.range(3, 6.5);
    bonePile(cx + Math.sin(a) * dist, cz + Math.cos(a) * dist, r.range(0.8, 1.25));
  }

  /* --- the Porta di Dite --- */
  const GZ = cz + rad + 18;
  const gBase = gy(0, GZ);
  const A = 8, SPRING = 12;
  // basalt massifs either side, ribs breaking out of the rock
  for (const s of [-1, 1]) {
    const blocks: [number, number, number, number][] = [[11.5, 8, 30, 14], [18, 9, 44, 17], [26, 11, 52, 20], [36, 13, 40, 18], [47, 13, 28, 16], [58, 14, 18, 14]];
    for (const [bx, w, h, d] of blocks) {
      const g = new THREE.BoxGeometry(w, h, d, low ? 3 : 5, low ? 6 : 10, low ? 3 : 4);
      displace(g, Math.min(w, d) * 0.24, 0.16, r.int(1, 999));
      const x = s * (bx + r.range(-0.8, 0.8)), z = GZ + r.range(-1, 2);
      p.add(g, 'matte', { color: BASALT, aoBottom: 0.45, cover: 0.35, jitter: 0.05 }, mat4([x, gy(x, z) + h / 2 - 2, z], [r.range(-0.04, 0.04), r.range(-0.15, 0.15), r.range(-0.05, 0.05)]));
    }
    for (let k = 0; k < 4; k++) {
      // giant ribs half sunk in the massif face, curving out and down
      const x0 = s * (14 + k * 8), y0 = gBase + 34 - k * 5, z0 = GZ - 7;
      const pts = [new THREE.Vector3(x0, y0, z0 + 3), new THREE.Vector3(x0 + s * 1.5, y0 - 5, z0 - 2.5), new THREE.Vector3(x0 + s * 2.5, y0 - 12, z0 - 3), new THREE.Vector3(x0 + s * 2.8, y0 - 18, z0 + 0.5)];
      p.add(tube(pts, 0.7 + 0.15 * (3 - k), 7, 14, 0.25), 'matte', { color: BONE, cover: 0.3, aoBottom: 0.8 });
    }
  }
  // the ribcage portal: seven ribs along the passage, iron straps, jamb clads
  for (let i = 0; i < 7; i++) {
    const z = GZ - 5 + i * (10 / 6);
    const pts = archPoints(A + 0.9, SPRING, z, 9, true).map((v) => v.setY(v.y + gBase));
    p.add(tube(pts, i === 0 || i === 6 ? 1.05 : 0.85, low ? 6 : 8, low ? 28 : 46), 'matte', { color: BONE, cover: 0.15, aoBottom: 0.7, jitter: 0.04 });
  }
  for (const s of [-1, 1]) {
    for (const y of [2.2, 6.4, 10.6]) p.add(box(1.0, 0.7, 11.6), 'metal', { color: IRON }, mat4([s * (A + 0.95), gBase + y, GZ]));
    for (let k = 0; k < 6; k++) p.add(sphere(0.22, 6, 5), 'metal', { color: IRON_HOT }, mat4([s * (A - 0.05), gBase + 2.2 + (k % 3) * 4.2, GZ - 5.6 + Math.floor(k / 3) * 11.2]));
  }
  // vertebrae as voussoirs on the face of the arch, a horned skull for keystone
  {
    const face = archPoints(A + 1.9, SPRING, GZ - 6.2, 7, false);
    face.forEach((v, i) => {
      if (i === 7) return; // apex: the skull
      const out = _p.set(v.x * 0.05, v.y - SPRING - 4, 0).normalize();
      const y = gBase + v.y;
      p.add(cyl(0.95, 0.95, 1.3, 10), 'matte', { color: BONE, cover: 0.2, jitter: 0.05 }, mat4([v.x, y, v.z], [Math.PI / 2, 0, 0]));
      const sp = cone(0.45, 2.4, 6);
      _q.setFromUnitVectors(_y.set(0, 1, 0), out);
      _e.setFromQuaternion(_q, 'YXZ');
      p.add(sp, 'matte', { color: BONE }, mat4([v.x + out.x * 1.6, y + out.y * 1.6, v.z - 0.2], [_e.x, _e.y, _e.z]));
    });
    const apexY = gBase + SPRING + 1.6 * (A + 1.9) * Math.sin(Math.acos((1.6 * (A + 1.9) - (A + 1.9)) / (1.6 * (A + 1.9))));
    p.add(sphere(2.6, 14, 10), 'matte', { color: BONE, jitter: 0.04 }, mat4([0, apexY + 1.2, GZ - 6.6], [0.2, 0, 0], [1.05, 0.95, 1.1]));
    p.add(box(2.6, 1.6, 2.2), 'matte', { color: BONE }, mat4([0, apexY - 0.6, GZ - 7.9], [0.15, 0, 0]));
    for (const e of [-1, 1]) {
      p.add(sphere(0.75, 8, 6), 'matte', { color: '#0e0a0a' }, mat4([e * 1.05, apexY + 1.2, GZ - 8.7]));
      const horn = [new THREE.Vector3(e * 1.8, apexY + 2.6, GZ - 6.4), new THREE.Vector3(e * 4.2, apexY + 5.2, GZ - 6.8), new THREE.Vector3(e * 5.6, apexY + 8.8, GZ - 7.6), new THREE.Vector3(e * 4.8, apexY + 11.6, GZ - 8.4)];
      p.add(tube(horn, 0.85, 7, 14, 0.08), 'matte', { color: ['#5a5040', '#b8ab90'] });
    }
  }
  // tympanum: iron plate in the point of the arch, bars, the iron eye
  {
    const sh = new THREE.Shape();
    const pts = archPoints(A, SPRING, 0, 10, false);
    sh.moveTo(A, SPRING);
    for (const v of pts) sh.lineTo(v.x, v.y);
    sh.lineTo(-A, SPRING);
    sh.lineTo(A, SPRING);
    p.add(extrude(sh, 0.6), 'metal', { color: IRON }, mat4([0, gBase, GZ + 0.4]));
    for (let k = -3; k <= 3; k++) p.add(box(0.28, 11, 0.4), 'metal', { color: IRON_HOT }, mat4([k * 2.1, gBase + SPRING + 5, GZ - 0.05]));
    p.add(torus(2.3, 0.42, 6, 28), 'metal', { color: IRON }, mat4([0, gBase + SPRING + 5.2, GZ - 0.25]));
  }
  // anchor blocks + rings at the Gate's foot (their chains are a separate mesh: they rattle)
  const anchorX = [-5.5, 0, 5.5];
  for (const ax of anchorX) {
    const az = GZ - 9;
    const g = new THREE.BoxGeometry(2.6, 1.4, 2.6, 2, 1, 2);
    displace(g, 0.12, 1, r.int(1, 999));
    p.add(g, 'matte', { color: BASALT, aoBottom: 0.5 }, mat4([ax, gy(ax, az) + 0.5, az]));
    p.add(torus(1.0, 0.24, 6, 20), 'metal', { color: IRON }, mat4([ax, gy(ax, az) + 2.0, az - 0.2]));
    p.add(box(0.5, 0.9, 0.5), 'metal', { color: IRON }, mat4([ax, gy(ax, az) + 1.35, az - 0.2]));
  }

  /* --- braziers of soul-fire --- */
  const glows = new GlowSet(`arena-glows:${def.id}`);
  const brazierA = [35, 80, 125, -35, -80, -125].map((d) => (d * Math.PI) / 180);
  const flames: number[] = [];
  for (const a of brazierA) {
    const dist = rad + 3.2;
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist, y = gy(x, z);
    for (let k = 0; k < 3; k++) {
      const la = (k / 3) * TAU;
      const foot = new THREE.Vector3(x + Math.sin(la) * 0.9, y, z + Math.cos(la) * 0.9);
      p.add(tube([foot, new THREE.Vector3(x + Math.sin(la) * 0.45, y + 1.4, z + Math.cos(la) * 0.45), new THREE.Vector3(x + Math.sin(la) * 0.55, y + 2.4, z + Math.cos(la) * 0.55)], 0.11, 5, 6), 'matte', { color: BONE });
    }
    p.add(lathe([[0.35, 0], [0.9, 0.25], [1.05, 0.65], [0.95, 0.7], [0.7, 0.35], [0.0, 0.3]], 14), 'metal', { color: IRON }, mat4([x, y + 2.3, z]));
    flames.push(glows.add({ pos: [x, y + 3.2, z], color: '#8fcaff', size: 1.9, height: 3.6, intensity: 0.9, mode: 'flame', phase: r.range(0, 6) }));
    glows.add({ pos: [x, y + 3.4, z], color: '#5a8ad8', size: 6.5, intensity: 0.2, mode: 'orb' });
  }
  // the iron eye's red glow and the anchor rings' hot rust
  const eyeGlow = glows.add({ pos: [0, gBase + SPRING + 5.2, GZ - 0.6], color: '#ff4a22', size: 4.2, intensity: 0.45, mode: 'orb' });
  glows.finish();

  root.add(p.build({ matte: { detail: 0.8, breakup: 0.35, rim: 0.3 }, metal: { detail: 1.2, breakup: 0.4 } }, !low));
  root.add(glows.mesh);

  /* --- the broken tethers lying from the anchor rings toward the arena --- */
  const pc = new Parts(7073);
  const step = 0.46;
  anchorX.forEach((ax, ci) => {
    const az = GZ - 9;
    const bend = (ci - 1) * 0.35 + r.range(-0.15, 0.15);
    const len = r.range(8, 11);
    let prev = new THREE.Vector3(ax, gy(ax, az) + 1.7, az - 0.6);
    const n = Math.round(len / step);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = ax + Math.sin(bend) * len * t + Math.sin(t * 5 + ci) * 0.5;
      const z = az - 1.0 - Math.cos(bend) * len * t;
      const y = Math.max(gy(x, z) + 0.2, gy(ax, az) + 1.7 - t * 9);
      const cur = new THREE.Vector3(x, y, z);
      const d = cur.clone().sub(prev);
      if (d.lengthSq() < 1e-4) continue;
      const g = linkGeo(0.2, 0.065);
      if (i === n - 1) g.scale(1, 0.7, 1); // the snapped last link
      pc.add(g, 'metal', { color: i % 4 === 0 ? IRON_HOT : IRON }, linkMatrix(cur, d, i % 2 === 0, new THREE.Matrix4()));
      prev = cur;
    }
  });
  const tethers = pc.build({ metal: { detail: 1.4, breakup: 0.4 } }, !low);
  root.add(tethers);

  /* --- the Gate's leaves (pivot at the jambs) --- */
  const leaves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pl = new Parts(7080 + s);
    const W = A - 0.05;
    pl.add(box(W, SPRING, 0.7), 'metal', { color: '#252327' }, mat4([-s * W / 2, SPRING / 2, 0]));
    for (const y of [1.4, 4.4, 7.4, 10.4]) pl.add(box(W, 0.55, 0.9), 'metal', { color: IRON_HOT }, mat4([-s * W / 2, y, 0]));
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 3; j++) {
        // bone studs between the straps
        pl.add(cone(0.22, 0.6, 5), 'matte', { color: BONE }, mat4([-s * (1.3 + k * 1.8), 2.9 + j * 3, -0.55], [-Math.PI / 2, 0, 0]));
      }
    }
    pl.add(torus(0.7, 0.14, 5, 16), 'metal', { color: IRON }, mat4([-s * (W - 0.9), 6.0, -0.55]));
    const g = pl.build({ metal: { detail: 1.2, breakup: 0.45 }, matte: { detail: 0.8 } }, !low);
    const pivot = new THREE.Group();
    pivot.position.set(s * A, gBase, GZ);
    pivot.add(g);
    root.add(pivot);
    leaves.push(pivot);
  }

  /* --- the red of Dis behind the leaves --- */
  const curtainGeo = new THREE.PlaneGeometry(2 * A, 22, 1, 6);
  {
    const pa = curtainGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const k = Math.max(0, 1 - (pa.getY(i) + 11) / 22);
      col[i * 3] = 1.0 * k; col[i * 3 + 1] = 0.32 * k * k; col[i * 3 + 2] = 0.12 * k * k;
    }
    curtainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const curtainMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  useWorldFog(curtainMat);
  const curtain = new THREE.Mesh(curtainGeo, curtainMat);
  curtain.position.set(0, gBase + 11, GZ + 2.5);
  curtain.name = 'dite_curtain';
  root.add(curtain);

  /* --- souls drifting to the Gate --- */
  const SOULS = low ? 14 : 26;
  const soulPos = new Float32Array(SOULS * 3), soulCol = new Float32Array(SOULS * 3);
  const souls = Array.from({ length: SOULS }, () => ({
    o: new THREE.Vector3(), t: new THREE.Vector3(), u: r.range(0, 1), sp: r.range(0.035, 0.07), ph: r.range(0, TAU), b: r.range(0.6, 1),
  }));
  const respawn = (s: (typeof souls)[number], first: boolean) => {
    const a = r.range(-2.3, 2.3) + Math.PI; // from the dark behind the arena, around the south
    const dist = r.range(rad + 10, rad + 34);
    s.o.set(cx + Math.sin(a) * dist, gy(cx + Math.sin(a) * dist, cz + Math.cos(a) * dist) + r.range(1.5, 6), cz + Math.cos(a) * dist);
    s.t.set(r.range(-5, 5), gBase + r.range(2.5, 9), GZ - r.range(2.2, 4.2));
    s.u = first ? r.range(0, 1) : 0;
  };
  for (const s of souls) respawn(s, true);
  const soulGeo = new THREE.BufferGeometry();
  soulGeo.setAttribute('position', new THREE.BufferAttribute(soulPos, 3));
  soulGeo.setAttribute('color', new THREE.BufferAttribute(soulCol, 3));
  const soulMat = new THREE.PointsMaterial({ map: ctx.kit.sprite('dot', 64), size: 1.1, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const soulPts = new THREE.Points(soulGeo, soulMat);
  soulPts.frustumCulled = false;
  soulPts.name = 'dite_souls';
  root.add(soulPts);

  /* --- phase 2 debris: links of the chest chain falling on the slabs --- */
  const DEB = 12;
  const debMat = worldMat('metal', { detail: 1.4 });
  const debGeo = linkGeo(0.2, 0.066);
  {
    const n = debGeo.attributes.position.count, c = new THREE.Color(IRON), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    debGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const debris = new THREE.InstancedMesh(debGeo, debMat, DEB);
  debris.count = 0;
  debris.frustumCulled = false;
  debris.castShadow = !low;
  debris.name = 'cerbero_chain_debris';
  root.add(debris);
  const deb: Debris[] = Array.from({ length: DEB }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), rest: false }));
  let debT = -1;
  let wasBroken = false;
  const dr = new R(7090);

  let doorK = 0, doorWant = 0;
  let rattle = -1;

  return {
    root,
    onCue(id: string) {
      if (id === 'dite_gate_open') doorWant = 1;
      else if (id === 'cerbero_chains') rattle = 0;
      else if (id === 'arena_state:default') {
        debT = -1;
        debris.count = 0;
        wasBroken = false;
      }
    },
    update(sim: Sim, dt: number) {
      const here = !!sim.fight && sim.fight.arena === def.id;
      const defeated = sim.state.defeated.includes('cerbero');
      if (defeated) doorWant = 1;
      doorK += (doorWant - doorK) * Math.min(1, dt * 0.45);
      const e = doorK * doorK * (3 - 2 * doorK);
      leaves[0].rotation.y = -e * 1.75;
      leaves[1].rotation.y = e * 1.75;
      curtainMat.opacity = (0.28 + 0.72 * e) * ATMOS.uHazeK.value;
      glows.setOn(eyeGlow, 0.55 + 0.45 * Math.sin(sim.time * 1.3) * 0.5 + 0.4 * (1 - e));
      // the tethers rattle when the intro calls them
      if (rattle >= 0) {
        rattle += dt;
        const k = Math.max(0, 1 - rattle / 1.6);
        tethers.position.y = Math.abs(Math.sin(rattle * 23)) * 0.12 * k;
        tethers.rotation.z = Math.sin(rattle * 17) * 0.004 * k;
        if (rattle > 1.6) {
          rattle = -1;
          tethers.position.y = 0;
          tethers.rotation.z = 0;
        }
      }
      // souls: drift toward the Gate, wait before shut leaves, pass through once it is open
      const tt = sim.time;
      for (let i = 0; i < SOULS; i++) {
        const s = souls[i];
        s.u = Math.min(1.35, s.u + s.sp * dt);
        const k = Math.min(1, s.u);
        const kk = k * k * (3 - 2 * k);
        let x = s.o.x + (s.t.x - s.o.x) * kk + Math.sin(tt * 0.7 + s.ph) * 0.8;
        let y = s.o.y + (s.t.y - s.o.y) * kk + Math.sin(tt * 1.3 + s.ph * 2) * 0.4;
        let z = s.o.z + (s.t.z - s.o.z) * kk;
        let a = Math.min(1, s.u * 6) * s.b;
        if (s.u >= 1) {
          if (e > 0.6) {
            // through the open Gate and gone
            const q = (s.u - 1) / 0.35;
            z += q * 14;
            a *= 1 - q;
            if (s.u >= 1.35) respawn(s, false);
          } else {
            s.u = 1;
            x += Math.sin(tt * 0.5 + s.ph) * 1.2;
            y += Math.cos(tt * 0.4 + s.ph) * 0.6;
          }
        }
        soulPos[i * 3] = x; soulPos[i * 3 + 1] = y; soulPos[i * 3 + 2] = z;
        soulCol[i * 3] = 0.55 * a; soulCol[i * 3 + 1] = 0.78 * a; soulCol[i * 3 + 2] = 1.0 * a;
      }
      (soulGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (soulGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      soulMat.opacity = 0.9 * ATMOS.uHazeK.value;
      // braziers burn brighter at night
      for (const f of flames) glows.setOn(f, 0.75 + 0.25 * ATMOS.uNight.value);
      // phase 2: the chest chain bursts and its links fall
      const b = sim.boss;
      const broken = here && !!b && b.defId === 'cerbero' && b.flags.has('chains_broken');
      if (broken && !wasBroken && b) {
        debT = 0;
        const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
        for (let i = 0; i < DEB; i++) {
          const d = deb[i];
          const lateral = (i / (DEB - 1) - 0.5) * 3.4;
          d.p.set(b.pos.x + sy * 3.6 + cy * lateral, b.pos.y + 2.6 + dr.range(0, 1.2), b.pos.z + cy * 3.6 - sy * lateral);
          d.v.set(cy * lateral * 1.2 + dr.range(-1.5, 1.5), dr.range(2, 5), dr.range(-1.5, 1.5) + cy * 2);
          d.rot.set(dr.range(0, TAU), dr.range(0, TAU), dr.range(0, TAU));
          d.spin.set(dr.range(-8, 8), dr.range(-8, 8), dr.range(-8, 8));
          d.rest = false;
        }
        debris.count = DEB;
      }
      wasBroken = broken;
      if (!here || !sim.fight?.active) {
        if (debT >= 0 && !defeated) {
          debT = -1;
          debris.count = 0;
        }
      }
      if (debT >= 0 && debris.count > 0) {
        debT += dt;
        for (let i = 0; i < DEB; i++) {
          const d = deb[i];
          if (!d.rest) {
            d.v.y -= 18 * dt;
            d.p.addScaledVector(d.v, dt);
            d.rot.x += d.spin.x * dt; d.rot.y += d.spin.y * dt; d.rot.z += d.spin.z * dt;
            const floor = fy + 0.12;
            if (d.p.y <= floor) {
              d.p.y = floor;
              if (Math.abs(d.v.y) < 2.5) {
                d.rest = true;
                d.rot.x = Math.PI / 2;
                d.rot.z = 0;
              } else {
                d.v.y *= -0.32;
                d.v.x *= 0.5;
                d.v.z *= 0.5;
              }
            }
          }
          _q.setFromEuler(d.rot);
          _m.compose(d.p, _q, _s);
          debris.setMatrixAt(i, _m);
        }
        debris.instanceMatrix.needsUpdate = true;
      }
      glows.update(dt);
    },
    dispose() {
      glows.dispose();
      curtainGeo.dispose();
      curtainMat.dispose();
      soulGeo.dispose();
      soulMat.dispose();
      debris.geometry.dispose();
      root.remove(debris);
      disposeTree(root);
    },
  };
}
