/**
 * Pianure dell'Erba Alta — the Cavaliere Errante's clearing in the Great Plains: a circle of leaning standing stones
 * (r ~37, outside the walkable r 34) open at the fog gate (south, z 96) and at the road north (z 164 -> 195), where two
 * stones carry a lintel; a band of waist-high golden grass between the stones and the plain that the wind combs.
 * A Cercatore's lantern mark is cut in the lintel: it wakes once the knight has carried his dawn to you.
 * Cues: cavaliere_dismount (a ring of trampled grass + a dust wall where he lands), cavaliere_into_dark /
 * cavaliere_out_of_dark (night: a cold mist swallows / returns him), cavaliere_lantern (a warm glint where he falls).
 */
import * as THREE from 'three';
import type { ArenaDef, ZoneDef } from '../../../core/types';
import type { Sim } from '../../../sim/sim';
import type { ArenaVisual, RenderCtx } from '../../../render/types';
import { zoneEnv } from '../../../render/world/env';
import { Parts, R, blob, box, disposeTree, displace, mat4 } from '../../../render/world/geo';
import { GlowSet } from '../../../render/world/glows';
import { useWorldFog } from '../../../render/world/materials';
import { ATMOS } from '../../../render/world/atmosphere';

const TAU = Math.PI * 2;

/** One clump of tapered, bent grass blades (local origin on the ground), merged into the foliage slot. */
function clump(r: R, blades: number, h: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = r.range(0, TAU), lean = r.range(0.12, 0.42), w = r.range(0.07, 0.13) * (h / 1.8), bh = h * r.range(0.7, 1.05);
    const ox = r.range(-0.32, 0.32), oz = r.range(-0.32, 0.32);
    const dx = Math.sin(a), dz = Math.cos(a);
    const px = Math.cos(a), pz = -Math.sin(a); // blade width axis
    const base = pos.length / 3;
    const lv = [0, 0.55, 1];
    for (let k = 0; k < 3; k++) {
      const t = lv[k];
      const bend = lean * t * t * bh;
      const cx = ox + dx * bend, cy = bh * t * (1 - 0.12 * lean * t), cz = oz + dz * bend;
      if (k < 2) {
        const ww = w * (1 - t * 0.75);
        pos.push(cx - px * ww, cy, cz - pz * ww, cx + px * ww, cy, cz + pz * ww);
      } else pos.push(cx, cy, cz);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // blades read as lit from above: bend the normals up
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const y = Math.abs(n.getY(i)) * 0.5 + 0.6;
    const l = Math.hypot(n.getX(i) * 0.5, y, n.getZ(i) * 0.5);
    n.setXYZ(i, (n.getX(i) * 0.5) / l, y / l, (n.getZ(i) * 0.5) / l);
  }
  return g;
}

/** A transient ground effect: a vertical-gradient wall (dust or mist) that rises, widens and fades, + a ground ring. */
class Burst {
  readonly wall: THREE.Mesh;
  readonly ring: THREE.Mesh;
  private t = 9;
  private dur = 1.4;
  private r0 = 1;
  private r1 = 6;
  private hold = 0;
  private ringMat: THREE.MeshBasicMaterial;
  private wallMat: THREE.MeshBasicMaterial;

  constructor(name: string) {
    const wg = new THREE.CylinderGeometry(1, 1, 1, 36, 6, true);
    wg.translate(0, 0.5, 0);
    const pc = wg.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pc.count * 4);
    for (let i = 0; i < pc.count; i++) {
      const y = pc.getY(i), a = Math.atan2(pc.getX(i), pc.getZ(i));
      // billowing: soft fade-in at the ground, ragged uneven top, thicker and thinner patches around
      const top = 0.55 + 0.3 * Math.sin(a * 3 + 1.1) * Math.sin(a * 5 + 0.4) + 0.15 * Math.sin(a * 11);
      const k = Math.min(1, y / 0.12) * Math.max(0, 1 - y / Math.max(0.2, top));
      pc.setXYZ(i, pc.getX(i) * (1 + 0.14 * Math.sin(a * 7 + y * 4)), y, pc.getZ(i) * (1 + 0.14 * Math.sin(a * 7 + y * 4)));
      col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = Math.pow(k, 0.8) * (0.65 + 0.35 * Math.sin(a * 4 + 2.0));
    }
    wg.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.wallMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
    useWorldFog(this.wallMat);
    this.wall = new THREE.Mesh(wg, this.wallMat);
    this.wall.name = `${name}:wall`;
    const rg = new THREE.RingGeometry(0.55, 1, 40, 4);
    rg.rotateX(-Math.PI / 2);
    const pr = rg.attributes.position as THREE.BufferAttribute;
    const rc = new Float32Array(pr.count * 4);
    for (let i = 0; i < pr.count; i++) {
      const d = Math.hypot(pr.getX(i), pr.getZ(i)), a = Math.atan2(pr.getX(i), pr.getZ(i));
      const m = Math.sin(((d - 0.55) / 0.45) * Math.PI);
      rc[i * 4] = 1; rc[i * 4 + 1] = 1; rc[i * 4 + 2] = 1; rc[i * 4 + 3] = Math.max(0, m) * (0.7 + 0.3 * Math.sin(a * 9));
    }
    rg.setAttribute('color', new THREE.BufferAttribute(rc, 4));
    this.ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    useWorldFog(this.ringMat);
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.name = `${name}:ring`;
    this.wall.visible = this.ring.visible = false;
    this.wall.frustumCulled = this.ring.frustumCulled = false;
  }

  fire(x: number, y: number, z: number, wall: string, ring: string, r0: number, r1: number, dur: number, hold: number): void {
    this.t = 0;
    this.dur = dur;
    this.hold = hold;
    this.r0 = r0;
    this.r1 = r1;
    this.wallMat.color.set(wall);
    this.ringMat.color.set(ring);
    this.wall.position.set(x, y, z);
    this.ring.position.set(x, y + 0.04, z);
    this.wall.visible = this.ring.visible = true;
  }

  update(dt: number): void {
    if (this.t > this.dur + this.hold) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    const e = 1 - (1 - k) * (1 - k);
    const r = this.r0 + (this.r1 - this.r0) * e;
    this.wall.scale.set(r, 1.2 + 2.6 * e, r);
    this.wallMat.opacity = 0.8 * (1 - k * k) * Math.min(1, this.t * 8);
    // the trampled ring lingers, then fades
    this.ring.scale.setScalar(this.r1 * 0.75);
    const fade = this.t < this.dur ? Math.min(1, this.t * 3) : Math.max(0, 1 - (this.t - this.dur) / Math.max(0.01, this.hold));
    this.ringMat.opacity = 0.75 * fade;
    if (this.t > this.dur + this.hold) this.wall.visible = this.ring.visible = false;
    else if (k >= 1) this.wall.visible = false;
  }

  dispose(): void {
    this.wall.geometry.dispose();
    this.ring.geometry.dispose();
    this.wallMat.dispose();
    this.ringMat.dispose();
  }
}

export default function build(def: ArenaDef, zone: ZoneDef, ctx: RenderCtx): ArenaVisual {
  const env = zoneEnv(zone, ctx);
  const root = new THREE.Group();
  root.name = `arena:${def.id}`;
  const [cx, , cz] = def.center;
  const rad = def.radius ?? 34;
  const low = ctx.quality === 'low';
  const r = new R(2207);
  const p = new Parts(2208);
  const gy = (x: number, z: number) => env.heightAt(x, z);
  // openings: the fog gate (south) and the road north to the Foresta Oscura
  const gateA = Math.atan2(def.gate.pos[0] - cx, def.gate.pos[2] - cz);
  const roadA = 0;
  const angGap = (a: number, c: number) => {
    let d = a - c;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return Math.abs(d);
  };
  const open = (a: number, w: number) => angGap(a, gateA) < w || angGap(a, roadA) < w;
  const stones: [number, number, number][] = []; // x, z, radius (grass keeps off)

  const stone = (a: number, dist: number, h: number, w: number, d: number, lean: number, tone: number) => {
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
    const geo2 = new THREE.BoxGeometry(w, h, d, 2, 5, 2);
    displace(geo2, Math.min(w, d) * 0.16, 1.1 / Math.max(0.6, w), r.int(1, 999));
    // taper the top: old menhirs narrow and round off upward
    const pa = geo2.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const t = (pa.getY(i) + h / 2) / h;
      const k = 1 - 0.32 * t * t;
      pa.setX(i, pa.getX(i) * k);
      pa.setZ(i, pa.getZ(i) * k);
    }
    geo2.computeVertexNormals();
    const yaw = a + r.range(-0.25, 0.25);
    const base = gy(x, z);
    p.add(geo2, 'matte', { color: [tone > 0.5 ? '#4f4d46' : '#56524a', tone > 0.5 ? '#a49f90' : '#928c7c'], aoBottom: 0.55, cover: 0.9, jitter: 0.06 },
      mat4([x, base + h / 2 - 0.35, z], [lean * Math.cos(yaw) * 0.5, yaw, lean], 1));
    stones.push([x, z, Math.max(w, d) * 0.8 + 0.6]);
    // a few smaller stones at its foot
    for (let k = 0; k < 2; k++) {
      const sa = a + r.range(-0.08, 0.08), sd = dist + r.range(-1.6, 1.8);
      const sx = cx + Math.sin(sa) * sd, sz = cz + Math.cos(sa) * sd;
      if (Math.hypot(sx - cx, sz - cz) < rad + 0.8) continue;
      const s = r.range(0.25, 0.6);
      p.add(blob(s, 1, 0.3, r.int(1, 999), 0.35), 'matte', { color: ['#55524a', '#8e897b'], aoBottom: 0.6, cover: 1 }, mat4([sx, gy(sx, sz) + s * 0.2, sz], [0, r.range(0, TAU), 0]));
    }
    return { x, z, base, yaw };
  };

  // --- the circle of standing stones ---
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + r.range(-0.05, 0.05);
    if (open(a, 0.36)) continue;
    if (r.next() < 0.12) {
      // one fallen, half sunk in the grass
      const dist = rad + r.range(3.2, 5);
      const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
      const g = new THREE.BoxGeometry(1.7, 4.6, 1.0, 2, 4, 2);
      displace(g, 0.18, 0.9, r.int(1, 999));
      g.computeVertexNormals();
      p.add(g, 'matte', { color: ['#4c4a43', '#8f8a7c'], aoBottom: 0.5, cover: 1, jitter: 0.06 }, mat4([x, gy(x, z) + 0.25, z], [Math.PI / 2 - 0.08, a + Math.PI / 2 + r.range(-0.4, 0.4), 0.1]));
      stones.push([x, z, 2.6]);
      continue;
    }
    stone(a, rad + r.range(2.4, 4.2), r.range(3.4, 6.6), r.range(1.3, 2.2), r.range(0.75, 1.1), r.range(-0.12, 0.12), r.next());
  }
  // the north doorway: two tall stones and a lintel over the road to the forest (the road runs between them)
  const doorA = 0.15;
  const dl = stone(roadA + doorA, rad + 3.2, 6.8, 1.7, 1.1, 0.02, 0.3);
  const dr = stone(roadA - doorA, rad + 3.2, 7.0, 1.8, 1.1, -0.02, 0.8);
  const ly = Math.max(dl.base, dr.base) + 6.55;
  const lx = (dl.x + dr.x) / 2, lz = (dl.z + dr.z) / 2;
  const span = Math.hypot(dl.x - dr.x, dl.z - dr.z) + 2.0;
  const lintel = new THREE.BoxGeometry(span, 1.0, 1.2, 6, 2, 2);
  displace(lintel, 0.14, 0.8, 41);
  lintel.computeVertexNormals();
  p.add(lintel, 'matte', { color: ['#5a564d', '#9d978a'], aoBottom: 0.8, cover: 1, jitter: 0.05 }, mat4([lx, ly, lz], [0.03, Math.atan2(dl.x - dr.x, dl.z - dr.z) + Math.PI / 2, -0.04]));
  // the Cercatori mark cut in the lintel (facing the arena): a lantern in a ring of rays
  const markZ = lz - 0.62;
  p.add(new THREE.TorusGeometry(0.34, 0.045, 4, 18), 'matte', { color: '#2e2c28' }, mat4([lx, ly, markZ], [0, 0, 0]));
  for (let k = 0; k < 8; k++) {
    const ra = (k / 8) * TAU;
    p.add(box(0.05, 0.16, 0.04), 'matte', { color: '#2e2c28' }, mat4([lx + Math.sin(ra) * 0.48, ly + Math.cos(ra) * 0.48, markZ], [0, 0, -ra]));
  }
  // flanking stones at the gate (no lintel: the Nebbia dell'Alba stands there)
  stone(gateA + 0.3, rad + 2.6, 4.6, 1.6, 0.9, 0.06, 0.6);
  stone(gateA - 0.3, rad + 2.6, 4.2, 1.5, 0.9, -0.05, 0.2);

  // --- the tall golden grass band between the stones and the plain ---
  const grassN = Math.round((low ? 700 : ctx.quality === 'medium' ? 1250 : 1700) * Math.min(1, env.density + 0.2));
  const variants = [clump(new R(11), low ? 4 : 7, 2.0), clump(new R(12), low ? 4 : 8, 2.4), clump(new R(13), low ? 3 : 6, 1.7)];
  let placed = 0;
  for (let i = 0; i < grassN * 3 && placed < grassN; i++) {
    const a = r.range(0, TAU);
    const t = Math.sqrt(r.next());
    const dist = rad + 1.2 + t * 8 + r.range(-0.4, 0.4);
    if (open(a, 0.04 + 4 / dist)) continue;
    const x = cx + Math.sin(a) * dist, z = cz + Math.cos(a) * dist;
    let blocked = false;
    for (const s of stones) if (Math.hypot(x - s[0], z - s[1]) < s[2]) { blocked = true; break; }
    if (blocked) continue;
    // taller toward the middle of the band, shorter at the walkable edge
    const edge = THREE.MathUtils.smoothstep(dist - rad, 1, 4);
    const sc = (0.6 + 0.5 * edge) * r.range(0.85, 1.2);
    const v = variants[placed % 3].clone();
    const ripe = r.next();
    p.add(v, 'foliage', { color: [ripe > 0.5 ? '#5d6428' : '#6a6a2c', ripe > 0.35 ? '#e6c46e' : '#cdb35a'], wind: 1, windByHeight: true, jitter: 0.08, aoBottom: 0.45 },
      mat4([x, gy(x, z) - 0.05, z], [0, r.range(0, TAU), 0], [sc, sc * r.range(0.85, 1.15), sc]));
    placed++;
  }
  for (const v of variants) v.dispose();
  root.add(p.build({ matte: { detail: 0.9, breakup: 0.35 }, foliage: { rim: 0.6 } }, !low));

  // --- glows: the lantern mark (lit after the knight's defeat), a warm glint where he falls ---
  const glows = new GlowSet(`arena-glows:${def.id}`);
  const mark = glows.add({ pos: [lx, ly, markZ - 0.08], color: '#ffc46a', size: 1.6, intensity: 0.55, mode: 'glint', on: 0 });
  glows.finish();
  root.add(glows.mesh);
  const glintMat = new THREE.MeshBasicMaterial({ color: '#ffc878', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glint = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), glintMat);
  glint.name = 'cavaliere_lantern_glint';
  glint.visible = false;
  root.add(glint);
  let glintT = -1;

  // --- transient effects: dust (dismount), mist (night) ---
  const dust = new Burst('cavaliere_dust');
  const mist = new Burst('cavaliere_mist');
  root.add(dust.wall, dust.ring, mist.wall, mist.ring);
  let pending: string | null = null;

  return {
    root,
    onCue(id: string) {
      if (id === 'cavaliere_dismount' || id === 'cavaliere_into_dark' || id === 'cavaliere_out_of_dark' || id === 'cavaliere_lantern') pending = id;
      if (id === 'arena_state:default') {
        glintT = -1;
        glint.visible = false;
      }
    },
    update(sim: Sim, dt: number) {
      const b = sim.boss;
      const here = !!sim.fight && sim.fight.arena === def.id;
      if (pending && b && here) {
        const x = b.pos.x, z = b.pos.z, y = gy(x, z);
        if (pending === 'cavaliere_dismount') dust.fire(x, y, z, '#c9b07a', '#6b5a36', 1.5, 6.5, 1.6, 9);
        else if (pending === 'cavaliere_into_dark') mist.fire(x, y, z, '#1c2430', '#141a22', 1.2, 4.2, 1.1, 0.6);
        else if (pending === 'cavaliere_out_of_dark') mist.fire(x, y, z, '#26303c', '#141a22', 3.5, 1.4, 0.8, 0.4);
        else if (pending === 'cavaliere_lantern') {
          glintT = 0;
          // at the lantern on his belt (left hip)
          glint.position.set(x + Math.cos(b.yaw) * 0.55, y + 1.45, z - Math.sin(b.yaw) * 0.55);
        }
      }
      pending = null;
      dust.update(dt);
      mist.update(dt);
      if (glintT >= 0) {
        glintT += dt;
        const k = Math.min(1, glintT / 1.2) * Math.max(0, 1 - Math.max(0, glintT - 7) / 3);
        glint.visible = k > 0.01;
        glint.scale.setScalar((0.5 + 0.5 * k) * (1 + 0.08 * Math.sin(glintT * 9)));
        glintMat.opacity = 0.7 * k * ATMOS.uHazeK.value;
        if (glintT > 10) glintT = -1;
      }
      glows.setOn(mark, sim.state.defeated.includes('cavaliere_errante') ? 0.55 + 0.45 * ATMOS.uNight.value : 0);
      glows.update(dt);
    },
    dispose() {
      dust.dispose();
      mist.dispose();
      glint.geometry.dispose();
      glintMat.dispose();
      glows.dispose();
      disposeTree(root);
    },
  };
}
