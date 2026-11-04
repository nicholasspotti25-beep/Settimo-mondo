/**
 * Cavaliere Errante — skinned garments built as single sheets (one draw call each, merged into the cape surface):
 *  - `cloak`: a travelling cloak wrapped around the body (an arc in the plane across its bone chain, so the same code
 *    hangs it down the knight's back on foot and drapes it over the horse's rump when mounted), deep folds toward a
 *    frayed hem, weights blended along the chain so the springs swing it.
 *  - `surcoat`: a sleeveless surcoat over the plate from the collar to above the knees, split at the sides below the
 *    belt into front and back panels that follow the thighs halfway (walk, lunge, the counter stance's wide step).
 * Built in the rest (bind) pose of the model's skeleton, in model space.
 */
import * as THREE from 'three';
import type { ModelBuilder } from '../../../render/kit/model';
import { Prng } from '../../../render/kit/noise';

export interface CloakOpts {
  /** Half width of the wrap (m) along the cloak, s: 0 = top .. 1 = hem. */
  rx: (s: number) => number;
  /** Depth (m): the arc's centre sits this far inside the chain (toward the body). */
  rz: (s: number) => number;
  /** Half angle (radians) of the wrap measured from the chain's outward side. */
  wrap: (s: number) => number;
  cols: number;
  rowsPerBone: number;
  /** Extension past the last bone (m). */
  tip: number;
  color: string;
  colorEnd: string;
  hem: string;
  /** Number of vertical folds across the wrap and their depth at the hem (fraction of the radius). */
  folds: number;
  foldAmp: number;
  /** Frayed hem depth (m). */
  ragged: number;
  seed: number;
}

interface Row {
  p: THREE.Vector3;
  t: THREE.Vector3;
  s: number;
  idx: [number, number, number, number];
  w: [number, number, number, number];
}

const X = new THREE.Vector3(1, 0, 0);

function buildSheet(mb: ModelBuilder, surface: string, pos: number[], col: number[], si: number[], sw: number[], idx: number[]): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  mb.addRaw(surface, g);
}

/** Cloak hanging from `parent` along `bones` (rest positions in model space). */
export function cloak(mb: ModelBuilder, parent: string, bones: string[], surface: string, o: CloakOpts): void {
  const P = bones.map((b) => mb.restPos(b).clone());
  const bi = bones.map((b) => mb.boneIndex(b));
  const pi = mb.boneIndex(parent);
  const per = Math.max(2, mb.seg(o.rowsPerBone, 2));
  const rows: Row[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const f = k / per;
      const p = P[i].clone().lerp(P[i + 1], f);
      rows.push(i === 0
        ? { p, t: new THREE.Vector3(), s: 0, idx: [pi, bi[1], 0, 0], w: [1 - f, f, 0, 0] }
        : { p, t: new THREE.Vector3(), s: 0, idx: [bi[i], bi[i + 1], 0, 0], w: [1 - f, f, 0, 0] });
    }
  }
  const last = P.length - 1;
  const dir = P[last].clone().sub(P[last - 1]).normalize();
  const tipRows = Math.max(1, Math.round(per * 0.7));
  for (let k = 0; k <= tipRows; k++) {
    const p = P[last].clone().addScaledVector(dir, (o.tip * k) / tipRows);
    rows.push({ p, t: new THREE.Vector3(), s: 0, idx: [bi[last], 0, 0, 0], w: [1, 0, 0, 0] });
  }
  // arc length + tangents
  let len = 0;
  for (let r = 0; r < rows.length; r++) {
    if (r > 0) len += rows[r].p.distanceTo(rows[r - 1].p);
    rows[r].s = len;
    const a = rows[Math.max(0, r - 1)].p, b = rows[Math.min(rows.length - 1, r + 1)].p;
    rows[r].t.copy(b).sub(a).normalize();
  }
  for (const r of rows) r.s /= Math.max(1e-3, len);
  const cols = Math.max(8, mb.seg(o.cols, 8));
  const rng = new Prng(o.seed);
  const fray: number[] = [];
  const streak: number[] = [];
  for (let c = 0; c <= cols; c++) {
    fray.push(rng.range(-1, 1) * 0.6 + Math.sin(c * 2.3) * 0.4);
    streak.push(rng.range(0.9, 1.06));
  }
  const phase = rng.range(0, Math.PI * 2);
  const cA = new THREE.Color(o.color), cB = new THREE.Color(o.colorEnd), cH = new THREE.Color(o.hem), tmp = new THREE.Color();
  const pos: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const out = new THREE.Vector3(), centre = new THREE.Vector3(), v = new THREE.Vector3();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const s = row.s;
    out.crossVectors(X, row.t).normalize();
    const rx = o.rx(s), rz = o.rz(s), wrap = o.wrap(s);
    centre.copy(row.p).addScaledVector(out, -rz);
    const isHem = r === rows.length - 1;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const th = (u * 2 - 1) * wrap;
      // folds deepen toward the hem; the front edges curl in a little
      const fold = 1 + o.foldAmp * Math.pow(s, 1.3) * Math.sin(th * o.folds + phase) - 0.04 * Math.pow(Math.abs(u * 2 - 1), 6);
      v.copy(centre).addScaledVector(X, Math.sin(th) * rx * fold).addScaledVector(out, Math.cos(th) * rz * fold);
      if (isHem) v.addScaledVector(row.t, fray[c] * o.ragged);
      pos.push(v.x, v.y, v.z);
      tmp.copy(cA).lerp(cB, Math.pow(s, 1.2)).multiplyScalar(streak[c] * (0.92 + 0.08 * Math.cos(th * o.folds + phase)));
      if (s > 0.93) tmp.lerp(cH, 0.65);
      col.push(tmp.r, tmp.g, tmp.b);
      si.push(...row.idx);
      sw.push(...row.w);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + cols + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  buildSheet(mb, surface, pos, col, si, sw, idx);
}

export interface SurcoatRow {
  /** Height (m, model space) and half width / half depth of the cross-section. */
  y: number;
  rx: number;
  rz: number;
}

export interface SurcoatOpts {
  /** Bone name prefix ('' on foot, 'rider_' mounted). */
  p: string;
  rows: SurcoatRow[];
  /** Below this height the sides are open (front and back panels). */
  splitY: number;
  color: string;
  colorDark: string;
  hem: string;
  /** Faded patches: centre angle (rad, 0 = front), height, half sizes (rad, m), colour. */
  patches: { a: number; y: number; ha: number; hy: number; color: string }[];
  ragged: number;
  seed: number;
}

/** Sleeveless surcoat over the torso, open at the sides below `splitY`. */
export function surcoat(mb: ModelBuilder, surface: string, o: SurcoatOpts): void {
  const B = (n: string) => `${o.p}${n}`;
  const ix = { hips: mb.boneIndex(B('hips')), spine: mb.boneIndex(B('spine')), chest: mb.boneIndex(B('chest')), tl: mb.boneIndex(B('thigh_l')), tr: mb.boneIndex(B('thigh_r')) };
  const hipsY = mb.restPos(B('hips')).y, spineY = mb.restPos(B('spine')).y, chestY = mb.restPos(B('chest')).y;
  const ox = mb.restPos(B('hips')).x, oz = mb.restPos(B('hips')).z;
  const hemY = o.rows[o.rows.length - 1].y;
  // resample the profile: 3 rings per given row span
  const ring: SurcoatRow[] = [];
  for (let i = 0; i < o.rows.length - 1; i++) {
    const a = o.rows[i], b = o.rows[i + 1];
    const n = Math.max(1, mb.seg(3, 2));
    for (let k = 0; k < n; k++) {
      const f = k / n, e = f * f * (3 - 2 * f);
      ring.push({ y: a.y + (b.y - a.y) * f, rx: a.rx + (b.rx - a.rx) * e, rz: a.rz + (b.rz - a.rz) * e });
    }
  }
  ring.push(o.rows[o.rows.length - 1]);
  const cols = Math.max(20, Math.round(mb.seg(28, 20) / 4) * 4);
  const panel = Math.round(cols * 0.15); // columns each side of the panel centres (~54 deg)
  const front = cols / 2;
  const rng = new Prng(o.seed);
  const fray: number[] = [];
  for (let c = 0; c <= cols; c++) fray.push(rng.range(0, 1));
  const cA = new THREE.Color(o.color), cD = new THREE.Color(o.colorDark), cH = new THREE.Color(o.hem), tmp = new THREE.Color();
  const pcol = o.patches.map((q) => new THREE.Color(q.color));
  const pos: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  for (let r = 0; r < ring.length; r++) {
    const R = ring[r];
    const isHem = r === ring.length - 1;
    for (let c = 0; c <= cols; c++) {
      const phi = -Math.PI + (c / cols) * Math.PI * 2; // 0 at the front (+Z), +X = left
      const sx = Math.sin(phi), cz = Math.cos(phi);
      // a slight forward flare on the panels, soft vertical folds below the belt
      const below = THREE.MathUtils.clamp((o.splitY - R.y) / Math.max(1e-3, o.splitY - hemY), 0, 1);
      const fold = 1 + 0.05 * below * Math.sin(phi * 9 + 0.7);
      let y = R.y;
      if (isHem) y += (fray[c] - 0.5) * o.ragged;
      pos.push(ox + sx * R.rx * fold, y, oz + cz * R.rz * fold);
      // colour: faded cloth darker toward the hem and in the fold hollows, a dark hem band, patches
      tmp.copy(cA).lerp(cD, below * 0.45 + (1 - fold) * 2.5);
      if (R.y < hemY + 0.04 * (o.splitY - hemY) + 0.02) tmp.lerp(cH, 0.7);
      for (let k = 0; k < o.patches.length; k++) {
        const q = o.patches[k];
        let da = phi - q.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < q.ha && Math.abs(R.y - q.y) < q.hy) tmp.copy(pcol[k]);
      }
      col.push(tmp.r, tmp.g, tmp.b);
      // skin weights by height; below the hips the panels follow the thighs halfway
      if (R.y >= chestY) {
        si.push(ix.chest, 0, 0, 0); sw.push(1, 0, 0, 0);
      } else if (R.y >= spineY) {
        const f = (R.y - spineY) / (chestY - spineY);
        si.push(ix.spine, ix.chest, 0, 0); sw.push(1 - f, f, 0, 0);
      } else if (R.y >= hipsY) {
        const f = (R.y - hipsY) / (spineY - hipsY);
        si.push(ix.hips, ix.spine, 0, 0); sw.push(1 - f, f, 0, 0);
      } else {
        const k = THREE.MathUtils.clamp((hipsY - R.y) / Math.max(1e-3, hipsY - hemY), 0, 1) * 0.62;
        const l = THREE.MathUtils.clamp(0.5 + sx * 0.9, 0, 1);
        si.push(ix.hips, ix.tl, ix.tr, 0); sw.push(1 - k, k * l, k * (1 - l), 0);
      }
    }
  }
  const inPanel = (c: number) => Math.abs(c - front) <= panel || c <= panel || c >= cols - panel;
  for (let r = 0; r < ring.length - 1; r++) {
    const open = ring[r + 1].y < o.splitY - 1e-4;
    for (let c = 0; c < cols; c++) {
      if (open && !(inPanel(c) && inPanel(c + 1))) continue;
      const a = r * (cols + 1) + c, b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  buildSheet(mb, surface, pos, col, si, sw, idx);
}
