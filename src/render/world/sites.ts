/**
 * Zone sites: the diegetic interactables of a zone, built for every zone (generic or custom builder) by the WorldRenderer.
 *  - Altari della Quiete: worn pale-stone dais, pedestal with a bowl of dawn light, stele carved with a seven-rayed
 *    rising sun, a light beam and ground pool; an iron hook beside it where the Cavaliere's lantern hangs, lit, once
 *    state.items has 'lanterna_del_cavaliere'.
 *  - Nebbia dell'Alba: luminous mist wall at every arena gate while the arena is sealed or its fight is running.
 *  - Reperti dei Cercatori by kind (lantern, letter, armor, mural, grave, relic) with a pulsing glint; the takeable part
 *    and the glint disappear once collected (armor, graves and murals stay as part of the place, their light goes out).
 *  - Exits by kind, no markers: lit stone doorway (walk), stairs (stair), pier and moored boat/ship (boat/ship), giant
 *    root arch (root), stone ring with dawn mist (portal), circle of seven stones (ritual), broken edge (fall). Their
 *    lights are lit only once the exit is open (requires all defeated).
 *  - Vista points: a cairn with a pale streamer; a faint glint until the vista has been looked at.
 * Static stone/wood/iron is merged into one mesh per material slot; every light is one GlowSet draw call.
 */
import * as THREE from 'three';
import type { AltarDef, ArenaDef, RepertoDef, VistaDef, ZoneExitDef } from '../../core/types';
import type { Sim } from '../../sim/sim';
import { isDefeated } from '../../sim/gamestate';
import type { ZoneEnv } from './env';
import { Parts, R, archShape, blob, box, cone, cyl, displace, extrude, lathe, mat4, sphere, torus, tube, disposeTree } from './geo';
import { rockPiece, sword } from './props/kinds';
import { GlowSet, type GlowSpec } from './glows';
import { DawnMist } from './mist';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const STONE: [string, string] = ['#6a645a', '#b9b1a0'];
const STONE_PALE: [string, string] = ['#8a8274', '#d2c9b6'];
const STONE_DARK: [string, string] = ['#3e3a34', '#6e675c'];
const IRON: [string, string] = ['#24221f', '#4a4640'];
const WOOD: [string, string] = ['#2e2219', '#5a4432'];
const DAWN = '#ffc98a';
const FLAME = '#ffd690';

/** Local-space helper: adds pieces to a shared Parts through a site transform. */
class Site {
  readonly m: THREE.Matrix4;
  constructor(readonly p: Parts, x: number, y: number, z: number, readonly yaw: number) {
    this.m = mat4([x, y, z], [0, yaw, 0]);
  }
  add(geo: THREE.BufferGeometry, slot: Parameters<Parts['add']>[1], o: Parameters<Parts['add']>[2], local?: THREE.Matrix4): this {
    this.p.add(geo, slot, o, local ? this.m.clone().multiply(local) : this.m.clone());
    return this;
  }
  /** World position of a local point. */
  w(x: number, y: number, z: number): [number, number, number] {
    const v = V(x, y, z).applyMatrix4(this.m);
    return [v.x, v.y, v.z];
  }
}

/** Hanging iron lantern (cage + glass + flame bulb); local origin at the hanging ring. */
function lanternModel(s: Site, at: [number, number, number], scale = 1, glassEmissive = 1.1): void {
  const [x, y, z] = at;
  const k = scale;
  s.add(torus(0.05 * k, 0.012 * k, 4, 8), 'metal', { color: IRON[1] }, mat4([x, y, z], [0, 0, 0]));
  s.add(cone(0.13 * k, 0.12 * k, 6), 'metal', { color: IRON }, mat4([x, y - 0.1 * k, z]));
  s.add(cyl(0.1 * k, 0.1 * k, 0.26 * k, 6), 'matte', { color: ['#ffdca0', '#ffe8c0'], emissive: glassEmissive, cover: 0 }, mat4([x, y - 0.3 * k, z]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    s.add(cyl(0.012 * k, 0.012 * k, 0.3 * k, 4), 'metal', { color: IRON[0] }, mat4([x + Math.cos(a) * 0.115 * k, y - 0.3 * k, z + Math.sin(a) * 0.115 * k]));
  }
  s.add(cyl(0.13 * k, 0.11 * k, 0.04 * k, 6), 'metal', { color: IRON }, mat4([x, y - 0.45 * k, z]));
}

/** Iron post with a hook arm toward local +X; returns the hanging point. */
function hookPost(s: Site, x: number, y: number, z: number, h: number, arm = 0.5): [number, number, number] {
  s.add(cyl(0.045, 0.07, h, 6), 'metal', { color: IRON, cover: 0.3 }, mat4([x, y + h / 2 - 0.2, z]));
  s.add(tube([V(x, y + h - 0.25, z), V(x + arm * 0.5, y + h - 0.02, z), V(x + arm, y + h - 0.12, z), V(x + arm, y + h - 0.3, z)], 0.028, 5, 10), 'metal', { color: IRON[1], cover: 0 });
  return [x + arm, y + h - 0.32, z];
}

/* ------------------------------------------------------------------------------------------------------------------ */

interface AltarSite { def: AltarDef }
interface GateSite { arena: ArenaDef; mist: DawnMist; glows: number[] }
interface RepertoSite { id: string; item: THREE.Object3D | null; glows: number[] }
interface ExitSite { def: ZoneExitDef; glows: number[]; mist: DawnMist | null; open: number }
interface VistaSite { id: string; glows: number[] }
interface Bobber { obj: THREE.Object3D; y: number; phase: number; amp: number }

export class ZoneSites {
  readonly group = new THREE.Group();
  private parts: Parts;
  private glows = new GlowSet('site-glows');
  private altars: AltarSite[] = [];
  private lanternParts: Parts;
  private lanternGroup: THREE.Group | null = null;
  private lanternGlows: number[] = [];
  private gates: GateSite[] = [];
  private reperti: RepertoSite[] = [];
  private exits: ExitSite[] = [];
  private vistas: VistaSite[] = [];
  private bobbers: Bobber[] = [];
  private first = true;
  private time = 0;
  private lanternOn = -1;

  constructor(private env: ZoneEnv) {
    this.group.name = `sites:${env.def.id}`;
    const seed = hashId(env.def.id);
    this.parts = new Parts(seed);
    this.lanternParts = new Parts(seed + 7);
    const c = env.ctx.content;
    const def = env.def;
    for (const a of c.altarsInZone(def.id)) this.buildAltar(a);
    for (const id of def.arenas) {
      const a = c.arena(id);
      if (a) this.buildGate(a);
    }
    for (const id of def.reperti) {
      let r: RepertoDef | null = null;
      try {
        r = c.reperto(id);
      } catch {
        r = null;
      }
      if (r) this.buildReperto(r);
    }
    def.exits.forEach((e, i) => this.buildExit(e, i));
    for (const v of def.vistas) this.buildVista(v);

    if (!this.parts.empty) this.group.add(this.parts.build({ matte: { detail: 0.9, breakup: 0.3 } }, env.ctx.quality !== 'low'));
    if (!this.lanternParts.empty) {
      this.lanternGroup = this.lanternParts.build({}, false);
      this.lanternGroup.name = 'cavaliere-lanterns';
      this.lanternGroup.visible = false;
      this.group.add(this.lanternGroup);
    }
    this.glows.finish();
    this.group.add(this.glows.mesh);
    for (const g of this.gates) this.group.add(g.mist.mesh);
    for (const e of this.exits) if (e.mist) this.group.add(e.mist.mesh);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */

  private ground(x: number, z: number): number {
    return this.env.heightAt(x, z);
  }

  /** Lowest ground in a disk (for foundations that must not float on slopes). */
  private minGround(x: number, z: number, r: number): number {
    let m = this.ground(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m = Math.min(m, this.ground(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return m;
  }

  private glow(s: GlowSpec): number {
    return this.glows.add(s);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Altare della Quiete                                                                                              */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private buildAltar(a: AltarDef): void {
    const [x, , z] = a.pos;
    const y = this.ground(x, z);
    const depth = Math.max(0, y - this.minGround(x, z, 2.9)) + 0.5;
    const yaw = a.yaw ?? 0;
    const s = new Site(this.parts, x, y, z, yaw);
    const r = new R(hashId(a.id));
    // dais: two worn tiers, footing sunk into slopes
    const h0 = 0.32 + depth;
    s.add(displace(cyl(2.75, 2.95, h0, 14), 0.07, 1.2, r.int(1, 999)), 'matte', { color: STONE_DARK, cover: 0.8, aoBottom: 0.5 }, mat4([0, 0.32 - h0 / 2, 0]));
    s.add(displace(cyl(1.95, 2.1, 0.26, 14), 0.05, 1.4, r.int(1, 999)), 'matte', { color: STONE, cover: 0.6 }, mat4([0, 0.45, 0]));
    // flagstone ring on the lower tier
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + r.range(-0.05, 0.05);
      s.add(box(0.95, 0.06, 0.62), 'matte', { color: STONE_PALE, cover: 1 }, mat4([Math.sin(ang) * 2.42, 0.33 + r.range(-0.02, 0.01), Math.cos(ang) * 2.42], [r.range(-0.03, 0.03), ang, r.range(-0.03, 0.03)]));
    }
    // pedestal + bowl of dawn light
    s.add(lathe([[0, 0], [0.64, 0], [0.64, 0.12], [0.5, 0.2], [0.42, 0.72], [0.56, 0.84], [0.72, 0.94], [0.72, 1.04], [0, 1.04]], 8), 'matte', { color: STONE_PALE, cover: 0.4, aoBottom: 0.7 }, mat4([0, 0.58, 0], [0, Math.PI / 8, 0]));
    s.add(lathe([[0.001, 0], [0.4, 0.02], [0.56, 0.16], [0.52, 0.2], [0.4, 0.09], [0.001, 0.07]], 12), 'matte', { color: STONE, cover: 0 }, mat4([0, 1.62, 0]));
    s.add(sphere(0.2, 10, 8), 'matte', { color: ['#ffd9a0', '#fff1d8'], emissive: 1.8, cover: 0 }, mat4([0, 1.74, 0], [0, 0, 0], [1, 0.55, 1]));
    // stele with the seven-rayed rising sun, behind the pedestal
    const st = new THREE.Shape();
    st.moveTo(-0.68, 0);
    st.lineTo(0.68, 0);
    st.lineTo(0.62, 2.35);
    st.quadraticCurveTo(0.55, 3.0, 0, 3.15);
    st.quadraticCurveTo(-0.55, 3.0, -0.62, 2.35);
    st.lineTo(-0.68, 0);
    s.add(displace(extrude(st, 0.36, 0.04, 8), 0.035, 1.6, r.int(1, 999)), 'matte', { color: STONE, cover: 0.9, aoBottom: 0.6 }, mat4([0, 0.5, -1.45], [-0.04, 0, 0]));
    const sunY = 0.5 + 2.05, sunZ = -1.45 + 0.37;
    s.add(torus(0.36, 0.045, 4, 18, Math.PI), 'matte', { color: ['#e8b070', '#ffd9a0'], emissive: 0.75, cover: 0 }, mat4([0, sunY, sunZ]));
    for (let i = 0; i < 7; i++) {
      const ang = (i / 6) * Math.PI;
      const rr = 0.52;
      s.add(box(0.035, 0.26, 0.03), 'matte', { color: '#f0c080', emissive: 0.6, cover: 0 }, mat4([Math.cos(ang) * rr, sunY + Math.sin(ang) * rr, sunZ], [0, 0, ang - Math.PI / 2]));
    }
    s.add(box(1.0, 0.04, 0.03), 'matte', { color: '#e0a868', emissive: 0.5, cover: 0 }, mat4([0, sunY - 0.02, sunZ]));
    // broken standing stones around the back half
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI * (0.62 + i * 0.19) + r.range(-0.06, 0.06);
      const hh = r.range(0.6, 1.7) * (i === 2 ? 0 : 1);
      if (hh <= 0) continue;
      s.add(displace(box(0.46, hh, 0.36), 0.05, 2, r.int(1, 999)), 'matte', { color: STONE, cover: 1, aoBottom: 0.55 }, mat4([Math.sin(ang) * 3.35, hh / 2 - 0.15, Math.cos(ang) * 3.35], [r.range(-0.12, 0.12), ang, r.range(-0.1, 0.1)]));
    }
    for (let i = 0; i < 4; i++) rockPiece(this.parts, r, r.range(0.12, 0.3), STONE, s.w(r.range(-3.6, 3.6), -0.05, r.range(-3.4, -2.2)), 0.6, 0);
    // iron hook for the Cavaliere's lantern (empty until the lantern is carried)
    const hang = hookPost(s, 1.35, 0.5, -0.75, 2.5, 0.48);
    const ls = new Site(this.lanternParts, x, y, z, yaw);
    lanternModel(ls, hang, 1.25, 1.4);
    const lw = s.w(hang[0], hang[1] - 0.38, hang[2]);
    this.lanternGlows.push(
      this.glow({ pos: lw, color: FLAME, size: 0.34, height: 0.55, intensity: 1.25, mode: 'flame', on: 0 }),
      this.glow({ pos: lw, color: '#ffae5a', size: 2.0, intensity: 0.42, mode: 'orb', on: 0 }),
      this.glow({ pos: s.w(hang[0], 0.52, hang[2]), color: '#ffb468', size: 3.2, intensity: 0.22, mode: 'pool', on: 0 }),
    );
    // dawn light
    this.glow({ pos: s.w(0, 1.86, 0), color: DAWN, size: 1.7, intensity: 0.85, mode: 'orb' });
    this.glow({ pos: s.w(0, 1.8, 0), color: '#fff0d6', size: 0.55, intensity: 0.9, mode: 'orb', phase: 2 });
    this.glow({ pos: s.w(0, 1.7, 0), color: '#ffd8a8', size: 1.25, height: a.vista ? 22 : 15, intensity: 0.2, mode: 'beam' });
    this.glow({ pos: s.w(0, 0.6, 0), color: '#ffbf84', size: 7.5, intensity: 0.26, mode: 'pool' });
    this.glow({ pos: s.w(0, sunY, sunZ + 0.05), color: '#ffc27a', size: 1.6, intensity: 0.25, mode: 'orb', phase: 4 });
    this.altars.push({ def: a });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Nebbia dell'Alba                                                                                                 */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private buildGate(a: ArenaDef): void {
    const w = a.gate.width;
    const mist = DawnMist.wall([a.center[0], a.center[2]], [a.gate.pos[0], a.gate.pos[2]], a.gate.yaw, w, a.shape === 'circle' ? a.radius ?? 0 : 0, Math.max(6.5, w * 1.05), (x, z) => this.ground(x, z));
    const gx = a.gate.pos[0], gz = a.gate.pos[2];
    const gy = this.ground(gx, gz);
    const glows = [
      this.glow({ pos: [gx, gy + 0.08, gz], color: '#ffd2a0', size: w * 2.2, intensity: 0.35, mode: 'pool', on: 0 }),
      this.glow({ pos: [gx, gy + 1.6, gz], color: '#ffe2b8', size: w * 1.6, intensity: 0.16, mode: 'orb', on: 0 }),
    ];
    this.gates.push({ arena: a, mist, glows });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Reperti dei Cercatori                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private buildReperto(rd: RepertoDef): void {
    const [x, , z] = rd.pos;
    const y = this.ground(x, z);
    const r = new R(hashId(rd.id));
    const yaw = this.faceYaw(x, z) + r.range(-0.35, 0.35);
    const base = new Site(this.parts, x, y, z, yaw);
    const ip = new Parts(hashId(rd.id) + 3);
    const item = new Site(ip, x, y, z, yaw);
    const glows: number[] = [];
    let glintY = 1.1;
    switch (rd.kind) {
      case 'lantern': {
        // a seeker's staff planted in the ground, the lantern still hanging from it
        const lean = 0.22;
        item.add(cyl(0.03, 0.04, 1.9, 6), 'matte', { color: WOOD, cover: 0.3 }, mat4([0, 0.85, 0], [0, 0, lean]));
        const top: [number, number, number] = [-Math.sin(lean) * 1.75, Math.cos(lean) * 1.75, 0];
        item.add(tube([V(top[0], top[1], 0), V(top[0] - 0.22, top[1] + 0.08, 0), V(top[0] - 0.34, top[1] - 0.04, 0)], 0.02, 4, 6), 'matte', { color: WOOD[1] });
        lanternModel(item, [top[0] - 0.34, top[1] - 0.06, 0], 0.9, 0.8);
        const lw = item.w(top[0] - 0.34, top[1] - 0.36, 0);
        glows.push(this.glow({ pos: lw, color: FLAME, size: 0.24, height: 0.4, intensity: 0.9, mode: 'flame' }));
        glows.push(this.glow({ pos: lw, color: '#ffa850', size: 1.4, intensity: 0.3, mode: 'orb' }));
        rockPiece(this.parts, r, 0.25, STONE, base.w(0.4, -0.05, 0.3), 0.6, 0);
        glintY = top[1] + 0.35;
        break;
      }
      case 'letter': {
        base.add(displace(box(1.1, 0.34, 0.8), 0.06, 1.5, r.int(1, 999)), 'matte', { color: STONE, cover: 1, aoBottom: 0.6 }, mat4([0, 0.1, 0], [0.04, 0, -0.03]));
        item.add(displace(box(0.42, 0.22, 0.3), 0.025, 3, r.int(1, 999)), 'matte', { color: ['#3a2618', '#6a4a30'], cover: 0 }, mat4([-0.18, 0.38, 0], [0, 0.3, 0]));
        item.add(cyl(0.045, 0.045, 0.42, 8), 'matte', { color: ['#d8c8a4', '#f0e4c8'], cover: 0, emissive: 0.15 }, mat4([0.24, 0.32, 0.05], [Math.PI / 2, 0.5, 0]));
        item.add(torus(0.05, 0.01, 4, 8), 'matte', { color: '#8a2a22', cover: 0 }, mat4([0.24, 0.32, 0.05], [0, 0.5, 0]));
        glintY = 0.75;
        break;
      }
      case 'armor': {
        // a seeker slumped against a stone, sword planted beside
        rockPiece(this.parts, r, 0.75, STONE, base.w(0, -0.1, -0.7), 0.9, 1);
        const m: [string, string] = ['#33343a', '#767884'];
        base.add(lathe([[0, 0], [0.3, 0.04], [0.34, 0.38], [0.24, 0.6], [0, 0.64]], 10), 'metal', { color: m }, mat4([0, 0.12, -0.12], [-0.35, 0, 0]));
        base.add(sphere(0.17, 10, 8), 'metal', { color: m }, mat4([0.05, 0.78, -0.3], [0.5, 0, 0.35], [1, 1.1, 1.15]));
        base.add(box(0.2, 0.1, 0.02), 'metal', { color: '#18181c' }, mat4([0.08, 0.8, -0.15], [0.5, 0, 0.35]));
        base.add(cyl(0.08, 0.07, 0.62, 6), 'metal', { color: m }, mat4([-0.18, 0.12, 0.32], [Math.PI / 2 - 0.1, 0, 0.1]));
        base.add(cyl(0.08, 0.07, 0.62, 6), 'metal', { color: m }, mat4([0.2, 0.12, 0.3], [Math.PI / 2 - 0.15, 0, -0.08]));
        sword(this.parts, r, base.w(0.75, -0.25, 0.1), [0.15, yaw, -0.12], 1.25);
        // the pale ribbon of the seekers, tied to the hilt (taken with the Reperto)
        item.add(box(0.05, 0.42, 0.01), 'foliage', { color: ['#d8d0c0', '#efe8dc'], wind: 0.9, cover: 0 }, mat4([0.82, 0.78, 0.1], [0, 0, 0.18]));
        glintY = 1.35;
        break;
      }
      case 'mural': {
        // a carved slab: a figure carrying a small light toward a rising sun; the carving glows until it has been read
        const sh = new THREE.Shape();
        sh.moveTo(-1.1, 0);
        sh.lineTo(1.15, 0);
        sh.lineTo(1.0, 2.1);
        sh.lineTo(0.2, 2.45);
        sh.lineTo(-0.9, 2.2);
        sh.lineTo(-1.1, 0);
        const slab = mat4([0, -0.2, 0], [-0.12, 0, 0]);
        base.add(displace(extrude(sh, 0.4, 0.04, 6), 0.04, 1.2, r.int(1, 999)), 'matte', { color: STONE, cover: 0.7, aoBottom: 0.6 }, slab.clone());
        const fz = 0.24;
        const L = (x0: number, y0: number, x1: number, y1: number) => {
          const len = Math.hypot(x1 - x0, y1 - y0);
          const ang = Math.atan2(y1 - y0, x1 - x0);
          item.add(box(len + 0.03, 0.04, 0.025), 'matte', { color: '#ffd59a', emissive: 0.9, cover: 0 }, slab.clone().multiply(mat4([(x0 + x1) / 2, (y0 + y1) / 2, fz], [0, 0, ang])));
        };
        L(-0.55, 0.45, -0.55, 1.05);
        L(-0.55, 1.05, -0.4, 1.35);
        L(-0.55, 0.85, -0.25, 1.0);
        L(-0.25, 1.0, -0.15, 1.12);
        L(-0.55, 0.45, -0.7, 0.2);
        L(-0.55, 0.45, -0.4, 0.2);
        item.add(torus(0.34, 0.025, 4, 14, Math.PI), 'matte', { color: '#ffd59a', emissive: 0.9, cover: 0 }, slab.clone().multiply(mat4([0.5, 1.2, fz])));
        for (let i = 0; i < 7; i++) {
          const ang = (i / 6) * Math.PI;
          L(0.5 + Math.cos(ang) * 0.45, 1.2 + Math.sin(ang) * 0.45, 0.5 + Math.cos(ang) * 0.62, 1.2 + Math.sin(ang) * 0.62);
        }
        glows.push(this.glow({ pos: base.w(0, 1.0, 0.7), color: '#ffcf90', size: 2.4, intensity: 0.2, mode: 'orb' }));
        glintY = 2.6;
        break;
      }
      case 'grave': {
        base.add(blob(0.9, 1, 0.2, r.int(1, 999), 0.6), 'matte', { color: ['#3a3226', '#5a4a36'], cover: 1, aoBottom: 0.6 }, mat4([0, -0.2, 0], [0, 0, 0], [1, 0.45, 1.6]));
        base.add(box(0.1, 1.3, 0.08), 'matte', { color: WOOD }, mat4([0, 0.5, -1.2], [0.08, 0, 0.05]));
        base.add(box(0.7, 0.09, 0.08), 'matte', { color: WOOD }, mat4([0, 0.85, -1.2], [0.08, 0, 0.05]));
        for (let i = 0; i < 9; i++) rockPiece(this.parts, r, r.range(0.1, 0.18), STONE, base.w(Math.cos(i * 0.7) * 1.0, -0.05, Math.sin(i * 0.7) * 1.5), 0.6, 0);
        // a small votive candle in a stone cup and a pale cloth on the marker
        item.add(cyl(0.08, 0.06, 0.14, 8), 'matte', { color: STONE_PALE, cover: 0 }, mat4([0.25, 0.32, -0.95]));
        item.add(cyl(0.03, 0.03, 0.08, 6), 'matte', { color: '#efe4cc', emissive: 0.3, cover: 0 }, mat4([0.25, 0.42, -0.95]));
        item.add(box(0.3, 0.5, 0.012), 'foliage', { color: ['#cfc6b4', '#e8e0d0'], wind: 0.7, cover: 0 }, mat4([0.12, 0.58, -1.14], [0.08, 0, 0.1]));
        glows.push(this.glow({ pos: base.w(0.25, 0.55, -0.95), color: FLAME, size: 0.12, height: 0.22, intensity: 0.9, mode: 'flame' }));
        glows.push(this.glow({ pos: base.w(0.25, 0.55, -0.95), color: '#ffa850', size: 0.9, intensity: 0.25, mode: 'orb' }));
        glintY = 1.25;
        break;
      }
      default: {
        // relic: a broken pedestal with a pale crystal shard wrapped in cloth
        base.add(displace(cyl(0.38, 0.46, 0.85, 8), 0.04, 2, r.int(1, 999)), 'matte', { color: STONE_PALE, cover: 0.8, aoBottom: 0.6 }, mat4([0, 0.3, 0]));
        base.add(displace(box(0.9, 0.12, 0.9), 0.03, 2, r.int(1, 999)), 'matte', { color: STONE, cover: 0.6 }, mat4([0, 0.76, 0], [0.05, 0.4, -0.04]));
        item.add(box(0.5, 0.03, 0.5), 'matte', { color: ['#6a5a6e', '#8a7a90'], cover: 0 }, mat4([0, 0.84, 0], [0, 0.8, 0]));
        item.add(new THREE.OctahedronGeometry(0.14, 0), 'matte', { color: ['#a8d8ff', '#e8f6ff'], emissive: 1.3, cover: 0 }, mat4([0, 1.0, 0], [0.3, 0.5, 0.2], [0.8, 1.6, 0.8]));
        glows.push(this.glow({ pos: base.w(0, 1.02, 0), color: '#bfe2ff', size: 1.3, intensity: 0.45, mode: 'orb' }));
        glintY = 1.45;
        break;
      }
    }
    glows.push(this.glow({ pos: base.w(0, glintY, 0), color: '#fff1d8', size: 0.95, intensity: 0.95, mode: 'glint', phase: r.range(0, 6) }));
    let itemObj: THREE.Object3D | null = null;
    if (!ip.empty) {
      itemObj = ip.build({}, false);
      itemObj.name = `reperto:${rd.id}`;
      this.group.add(itemObj);
    }
    this.reperti.push({ id: rd.id, item: itemObj, glows });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Exits                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Facing of an exit: along the main path where the exit sits at a path end, else away from the path/zone center. */
  private exitYaw(e: ZoneExitDef): number {
    const p = this.env.def.path;
    const ex = e.at[0], ez = e.at[2];
    let bi = -1, bd = Infinity;
    for (let i = 0; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - ex, p[i][2] - ez);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    let dx = ex, dz = ez;
    if (bi >= 0 && p.length > 1) {
      if (bd < 3) {
        if (bi === p.length - 1) {
          dx = p[bi][0] - p[bi - 1][0];
          dz = p[bi][2] - p[bi - 1][2];
        } else if (bi === 0) {
          dx = p[0][0] - p[1][0];
          dz = p[0][2] - p[1][2];
        }
      } else {
        dx = ex - p[bi][0];
        dz = ez - p[bi][2];
      }
    }
    if (Math.hypot(dx, dz) < 1e-3) dz = 1;
    return Math.atan2(dx, dz);
  }

  /** Yaw that faces local +Z toward the nearest point of the main path (where the player comes from). */
  private faceYaw(x: number, z: number): number {
    const p = this.env.def.path;
    let bx = 0, bz = 0, bd = Infinity;
    for (let i = 0; i + 1 < p.length; i++) {
      const ax = p[i][0], az = p[i][2], dx = p[i + 1][0] - ax, dz = p[i + 1][2] - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t;
      const d = Math.hypot(qx - x, qz - z);
      if (d < bd) {
        bd = d; bx = qx; bz = qz;
      }
    }
    if (bd < 0.5 || bd === Infinity) return Math.atan2(-x, -z);
    return Math.atan2(bx - x, bz - z);
  }

  private buildExit(e: ZoneExitDef, index: number): void {
    const [x, , z] = e.at;
    const y = this.ground(x, z);
    const yaw = this.exitYaw(e);
    const s = new Site(this.parts, x, y, z, yaw);
    const r = new R(hashId(`${this.env.def.id}:exit:${index}`));
    const glows: number[] = [];
    let mist: DawnMist | null = null;
    const kind = e.kind ?? 'walk';
    const lanternPair = (hx: number, hy: number, hz: number, scale = 1) => {
      for (const sx of [-1, 1]) {
        const hp: [number, number, number] = [sx * hx, hy, hz];
        lanternModel(s, hp, scale, 1.2);
        const lw = s.w(hp[0], hp[1] - 0.3 * scale, hp[2]);
        glows.push(this.glow({ pos: lw, color: FLAME, size: 0.3 * scale, height: 0.5 * scale, intensity: 1.2, mode: 'flame', on: 0 }));
        glows.push(this.glow({ pos: lw, color: '#ffaa58', size: 2.2 * scale, intensity: 0.38, mode: 'orb', on: 0 }));
      }
    };
    switch (kind) {
      case 'stair': {
        // a broad flight of worn steps with stepped parapets, a landing and lantern pillars at the foot
        const w = Math.min(8, Math.max(4.5, e.radius * 1.1));
        const n = 9;
        for (let i = 0; i < n; i++) {
          const top = 0.22 + i * 0.32;
          s.add(displace(box(w, top + 0.8, 0.95), 0.02, 2, r.int(1, 999)), 'matte', { color: STONE_PALE, cover: 0.8, aoBottom: 0.5 }, mat4([0, top / 2 - 0.4, 1 + i * 0.9], [0, r.range(-0.01, 0.01), 0]));
          for (const sx of [-1, 1]) s.add(displace(box(0.6, top + 1.5, 0.92), 0.02, 2, r.int(1, 999)), 'matte', { color: STONE, cover: 1, aoBottom: 0.5 }, mat4([sx * (w / 2 + 0.3), (top + 1.5) / 2 - 0.8, 1 + i * 0.9]));
        }
        const landY = 0.22 + (n - 1) * 0.32;
        s.add(displace(box(w + 1.2, landY + 0.8, 3), 0.02, 2, r.int(1, 999)), 'matte', { color: STONE_PALE, cover: 0.8, aoBottom: 0.5 }, mat4([0, landY / 2 - 0.4, 1 + n * 0.9 + 1.0]));
        for (const sx of [-1, 1]) {
          s.add(displace(box(0.75, 3.0, 0.75), 0.03, 2, r.int(1, 999)), 'matte', { color: STONE, cover: 0.8, aoBottom: 0.6 }, mat4([sx * (w / 2 + 0.35), 1.1, 0.25]));
          s.add(box(0.95, 0.18, 0.95), 'matte', { color: STONE_PALE, cover: 1 }, mat4([sx * (w / 2 + 0.35), 2.65, 0.25]));
          s.add(displace(box(0.75, 2.6, 0.75), 0.03, 2, r.int(1, 999)), 'matte', { color: STONE, cover: 0.8 }, mat4([sx * (w / 2 + 0.35), landY + 1.2, 1 + n * 0.9 + 2.2]));
        }
        lanternPair(w / 2 + 0.35, 2.75 + 0.42, 0.25, 1.1);
        glows.push(this.glow({ pos: s.w(0, 0.15, 0.4), color: '#ffc28a', size: w * 1.5, intensity: 0.22, mode: 'pool', on: 0 }));
        break;
      }
      case 'boat':
      case 'ship': {
        const ship = kind === 'ship';
        const water = this.env.field.water ?? this.env.def.water?.level ?? y - 0.6;
        const deck = Math.max(water + 0.6, y + 0.1);
        const len = ship ? 9 : 7;
        // pier on stilts
        for (let i = 0; i < Math.round(len / 0.55); i++) {
          s.add(box(2.6, 0.08, 0.48), 'matte', { color: WOOD, cover: 0.3 }, mat4([r.range(-0.05, 0.05), deck - y + r.range(-0.03, 0.02), 0.3 + i * 0.55], [0, r.range(-0.03, 0.03), r.range(-0.02, 0.02)]));
        }
        for (let i = 0; i <= 2; i++) {
          for (const sx of [-1, 1]) {
            const zz = 0.4 + i * (len / 2 - 0.3);
            const sw = s.w(sx * 1.2, 0, zz);
            const gy = Math.min(this.ground(sw[0], sw[2]), water) - 1.2;
            const hh = deck - y - (gy - y) + (i === 2 ? 0.9 : 0.1);
            s.add(cyl(0.12, 0.14, hh, 6), 'matte', { color: WOOD, cover: 0.2 }, mat4([sx * 1.2, gy - y + hh / 2, zz]));
          }
        }
        const endZ = 0.4 + len - 0.6;
        const post = hookPost(s, 1.2, deck - y, endZ, 2.3, -0.45);
        lanternModel(s, post, 1, 1.2);
        const lw = s.w(post[0], post[1] - 0.3, post[2]);
        glows.push(this.glow({ pos: lw, color: FLAME, size: 0.3, height: 0.5, intensity: 1.2, mode: 'flame', on: 0 }));
        glows.push(this.glow({ pos: lw, color: '#ffaa58', size: 2.6, intensity: 0.4, mode: 'orb', on: 0 }));
        glows.push(this.glow({ pos: s.w(post[0], water + 0.05, post[2] + 0.5), color: '#ffb86a', size: 4, intensity: 0.2, mode: 'pool', on: 0 }));
        // the boat moored alongside the pier end (bobs on the water)
        const bp = new Parts(r.int(1, 9999));
        const bs = new Site(bp, 0, 0, 0, 0);
        boatModel(bs, r, ship);
        const boat = bp.build({}, this.env.ctx.quality !== 'low');
        const bw = s.w(ship ? -4.2 : -2.6, 0, endZ - (ship ? 1.5 : 0.8));
        boat.position.set(bw[0], water, bw[2]);
        boat.rotation.y = yaw + (ship ? 0 : 0.12);
        boat.name = `exit-${kind}`;
        this.group.add(boat);
        this.bobbers.push({ obj: boat, y: water, phase: r.range(0, 6), amp: ship ? 0.05 : 0.08 });
        break;
      }
      case 'root': {
        // a giant root arching over the way into a hollow
        const w = Math.max(5, e.radius * 1.3);
        const bark0: [string, string] = ['#33271e', '#6a5442'];
        const pts = [V(-w * 0.75, -0.6, -0.4), V(-w * 0.62, 2.6, 0), V(-w * 0.3, 5.4, 0.3), V(w * 0.15, 6.2, 0.2), V(w * 0.55, 4.2, -0.1), V(w * 0.72, 1.0, 0.2), V(w * 0.85, -0.6, 0.6)];
        s.add(bark(tube(pts, 1.05, 14, 30, 0.75), 14, 0.13), 'matte', { color: bark0, cover: 1, aoBottom: 0.6 });
        const pts2 = [V(-w * 0.95, -0.4, 1.4), V(-w * 0.7, 1.8, 1.8), V(-w * 0.2, 3.4, 2.2), V(w * 0.35, 2.4, 2.4), V(w * 0.6, -0.4, 2.0)];
        s.add(bark(tube(pts2, 0.55, 10, 22, 0.35), 10, 0.08), 'matte', { color: bark0, cover: 1 });
        // an earthen mound grown through with roots, its dark mouth facing the approach
        s.add(blob(w * 0.62, 2, 0.12, r.int(1, 999), 0.5), 'matte', { color: ['#2a221a', '#4a3e2e'], cover: 1, aoBottom: 0.5 }, mat4([0, -0.3, w * 0.62], [0, 0, 0], [1.05, 0.78, 0.9]));
        s.add(new THREE.CircleGeometry(w * 0.34, 20, 0, Math.PI), 'matte', { color: '#040303', cover: 0, jitter: 0 }, mat4([0, -0.15, w * 0.62 - w * 0.62 * 0.9 + 0.35], [0, Math.PI, 0], [1, 1.25, 1]));
        for (let i = 0; i < 9; i++) {
          const t = r.range(0.1, 0.9);
          const ci = Math.floor(t * (pts.length - 1));
          const pp = pts[ci].clone().lerp(pts[ci + 1], t * (pts.length - 1) - ci);
          s.add(sphere(r.range(0.1, 0.2), 6, 5), 'matte', { color: '#8ad8c0', emissive: 1.1, cover: 0 }, mat4([pp.x + r.range(-0.6, 0.6), pp.y + r.range(0.5, 0.9), pp.z + r.range(-0.6, 0.6)]));
          if (i < 5) glows.push(this.glow({ pos: s.w(pp.x, pp.y + 0.9, pp.z), color: '#7ad8b8', size: 1.4, intensity: 0.32, mode: 'orb', on: 0 }));
        }
        glows.push(this.glow({ pos: s.w(0, 1.5, w * 0.4), color: '#9ae0c8', size: w * 1.2, intensity: 0.1, mode: 'orb', on: 0 }));
        break;
      }
      case 'portal': {
        const rad = Math.max(2.2, e.radius * 0.6);
        s.add(displace(torus(rad, 0.36, 8, 32), 0.05, 1.4, r.int(1, 999)), 'matte', { color: STONE_PALE, cover: 0.6 }, mat4([0, rad + 0.6, 0]));
        s.add(displace(box(rad * 2.4, 0.8, 1.6), 0.05, 1.4, r.int(1, 999)), 'matte', { color: STONE_DARK, cover: 0.8, aoBottom: 0.5 }, mat4([0, 0.1, 0]));
        for (let i = 0; i < 7; i++) {
          const ang = Math.PI / 2 + ((i - 3) / 7) * Math.PI * 1.6;
          s.add(box(0.12, 0.3, 0.1), 'matte', { color: '#ffd59a', emissive: 0.8, cover: 0 }, mat4([Math.cos(ang) * (rad + 0.4), rad + 0.6 + Math.sin(ang) * (rad + 0.4), 0.3], [0, 0, ang - Math.PI / 2]));
        }
        mist = DawnMist.disk(s.w(0, rad + 0.6, 0), yaw, rad - 0.1, { core: '#ffe0b0', edge: '#8a74d8' });
        glows.push(this.glow({ pos: s.w(0, 0.55, 0), color: '#e0c0ff', size: rad * 4, intensity: 0.22, mode: 'pool', on: 0 }));
        break;
      }
      case 'ritual': {
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2;
          const hh = 1.6 + (i % 2) * 0.5;
          const px = Math.sin(ang) * 4.2, pz = Math.cos(ang) * 4.2;
          s.add(displace(box(0.6, hh + 0.4, 0.45), 0.06, 1.6, r.int(1, 999)), 'matte', { color: STONE, cover: 1, aoBottom: 0.5 }, mat4([px, hh / 2 - 0.2, pz], [0, ang, r.range(-0.05, 0.05)]));
          glows.push(this.glow({ pos: s.w(px, hh + 0.5, pz), color: '#ffe0b0', size: 0.9, intensity: 0.8, mode: 'glint', phase: i, on: 0 }));
        }
        glows.push(this.glow({ pos: s.w(0, 0.1, 0), color: '#ffd8a8', size: 10, intensity: 0.2, mode: 'pool', on: 0 }));
        break;
      }
      case 'fall': {
        for (let i = 0; i < 6; i++) s.add(displace(box(r.range(0.8, 1.4), 0.25, r.range(0.6, 1.1)), 0.05, 2, r.int(1, 999)), 'matte', { color: STONE, cover: 0.8 }, mat4([r.range(-2, 2), 0.02, r.range(-1.5, 1)], [r.range(-0.15, 0.15), r.range(0, 3), r.range(-0.15, 0.15)]));
        s.add(cyl(0.05, 0.06, 3.2, 6), 'matte', { color: WOOD }, mat4([2.2, 1.4, -0.6], [0.1, 0, -0.08]));
        s.add(box(0.03, 1.4, 0.7), 'foliage', { color: ['#b8aca0', '#ddd2c4'], wind: 1, cover: 0 }, mat4([2.25, 2.4, -0.2], [0, 0, 0.06]));
        glows.push(this.glow({ pos: s.w(0, 0.3, 2.5), color: '#c8b8ff', size: 6, intensity: 0.14, mode: 'orb', on: 0 }));
        break;
      }
      default: {
        // walk: a weathered stone doorway with two lanterns, light spilling through once the way is open
        const iw = Math.min(9, Math.max(4.6, e.radius * 1.25));
        const ih = iw * 0.5 + 3.3;
        const ow = iw + 2.6, oh = ih + 1.5;
        const sink = Math.max(0, y - Math.min(this.minGround(x, z, ow / 2), y)) + 0.8;
        const sh = archShape(ow, oh + sink, iw, ih + sink, true);
        s.add(displace(extrude(sh, 1.2, 0.06, 10), 0.022, 0.9, r.int(1, 999)), 'matte', { color: STONE, cover: 0.9, aoBottom: 0.55 }, mat4([0, -sink, -0.6]));
        // capstone and crumbled top
        s.add(displace(box(ow + 0.5, 0.45, 1.6), 0.06, 1.2, r.int(1, 999)), 'matte', { color: STONE_PALE, cover: 1 }, mat4([0, oh + 0.2, 0], [0, 0, r.range(-0.02, 0.02)]));
        for (let i = 0; i < 4; i++) rockPiece(this.parts, r, r.range(0.25, 0.5), STONE, s.w(r.sign() * r.range(ow / 2 + 0.4, ow / 2 + 2), -0.1, r.range(-1.5, 1.5)), 0.7, 1);
        // plinths, keystone, iron brackets with lanterns on the approach face
        for (const sx of [-1, 1]) {
          s.add(displace(box(1.5, 1.2 + sink, 1.7), 0.03, 1.5, r.int(1, 999)), 'matte', { color: STONE_DARK, cover: 1, aoBottom: 0.5 }, mat4([sx * (iw / 2 + 0.65), 0.6 - sink / 2, -0.6]));
          s.add(box(0.08, 0.08, 0.75), 'metal', { color: IRON }, mat4([sx * (iw / 2 - 0.25), ih - 1.15, -1.5]));
        }
        s.add(displace(box(0.9, 1.1, 1.45), 0.03, 2, r.int(1, 999)), 'matte', { color: STONE_PALE, cover: 0.5 }, mat4([0, ih + iw * 0.15 + 0.15, -0.6]));
        lanternPair(iw / 2 - 0.25, ih - 1.12, -1.85, 1.1);
        glows.push(this.glow({ pos: s.w(0, 0.12, -0.6), color: '#ffc890', size: iw * 1.7, intensity: 0.26, mode: 'pool', on: 0 }));
        glows.push(this.glow({ pos: s.w(0, ih * 0.45, -0.6), color: '#ffe0b8', size: iw * 1.05, intensity: 0.12, mode: 'orb', on: 0 }));
        break;
      }
    }
    this.exits.push({ def: e, glows, mist, open: -1 });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Vistas                                                                                                           */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private buildVista(v: VistaDef): void {
    const [x, , z] = v.pos;
    const y = this.ground(x, z);
    const yaw = Math.atan2(v.look[0] - x, v.look[2] - z);
    const s = new Site(this.parts, x, y, z, yaw);
    const r = new R(hashId(v.id));
    // cairn of flat stones, a seeker's pole with a long pale streamer
    let h = -0.1;
    for (let i = 0; i < 6; i++) {
      const rad = 0.62 - i * 0.085;
      const th = 0.2 + r.range(0, 0.06);
      s.add(blob(rad, 1, 0.22, r.int(1, 999), 0.5), 'matte', { color: STONE_PALE, cover: 0.8, aoBottom: 0.7 }, mat4([r.range(-0.05, 0.05), h + th / 2, -1.2 + r.range(-0.05, 0.05)], [r.range(-0.08, 0.08), r.range(0, 6), r.range(-0.08, 0.08)], [1, th / rad, 1]));
      h += th * 0.85;
    }
    s.add(cyl(0.04, 0.055, 3.3, 6), 'matte', { color: WOOD }, mat4([0.55, 1.45, -1.25], [0, 0, -0.06]));
    for (let i = 0; i < 3; i++) {
      const len = 1.7 - i * 0.35;
      const ang = 0.55 + i * 0.18;
      s.add(box(0.035, len, 0.14), 'foliage', { color: ['#e6dccb', '#bdb2a2'], wind: 1, cover: 0 }, mat4([0.48 + Math.sin(ang) * len * 0.5, 3.0 - i * 0.1 - Math.cos(ang) * len * 0.5, -1.25 + i * 0.1], [0, 0, ang]));
    }
    // a worn sitting stone facing the view
    s.add(displace(box(1.5, 0.5, 0.6), 0.05, 1.5, r.int(1, 999)), 'matte', { color: STONE, cover: 1, aoBottom: 0.6 }, mat4([-0.8, 0.15, -0.3], [0, 0.15, 0]));
    const glows = [this.glow({ pos: s.w(0, h + 0.55, -1.2), color: '#fff1d8', size: 0.8, intensity: 0.7, mode: 'glint', phase: r.range(0, 6) })];
    this.vistas.push({ id: v.id, glows });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Frame                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  update(sim: Sim, dt: number): void {
    const st = sim.state;
    const instant = this.first;
    this.first = false;
    this.time += dt;
    // Cavaliere's lantern at every altar
    const lantern = st.items.includes('lanterna_del_cavaliere') ? 1 : 0;
    if (lantern !== this.lanternOn) {
      this.lanternOn = lantern;
      if (this.lanternGroup) this.lanternGroup.visible = lantern === 1;
      for (const g of this.lanternGlows) this.glows.setOn(g, lantern, instant);
    }
    // Nebbia dell'Alba
    const z = sim.zone;
    for (const g of this.gates) {
      const id = g.arena.id;
      const f = sim.fight;
      const on = (z?.sealed.has(id) ?? false) || (!!f && f.active && f.arena === id && !f.won) ? 1 : 0;
      g.mist.set(on, instant);
      g.mist.update(dt);
      for (const i of g.glows) this.glows.setOn(i, on, instant);
    }
    // Reperti
    for (const r of this.reperti) {
      const taken = st.reperti.includes(r.id);
      if (r.item) r.item.visible = !taken;
      for (const i of r.glows) this.glows.setOn(i, taken ? 0 : 1, instant);
    }
    // exits: lit once open
    for (const e of this.exits) {
      let open = 1;
      for (const req of e.def.requires) if (!isDefeated(st, req)) open = 0;
      if (open !== e.open) {
        e.open = open;
        for (const i of e.glows) this.glows.setOn(i, open, instant);
        e.mist?.set(open, instant);
      }
      e.mist?.update(dt);
    }
    // vistas: glint until looked at
    for (const v of this.vistas) {
      const seen = st.vistas.includes(v.id) ? 0 : 1;
      for (const i of v.glows) this.glows.setOn(i, seen, instant);
    }
    for (const b of this.bobbers) {
      b.obj.position.y = b.y + Math.sin(this.time * 0.9 + b.phase) * b.amp;
      b.obj.rotation.z = Math.sin(this.time * 0.7 + b.phase) * b.amp * 0.5;
      b.obj.rotation.x = Math.sin(this.time * 0.55 + b.phase * 1.3) * b.amp * 0.3;
    }
    this.glows.update(instant ? 1 : dt);
  }

  dispose(): void {
    for (const g of this.gates) g.mist.dispose();
    for (const e of this.exits) e.mist?.dispose();
    this.glows.dispose();
    disposeTree(this.group);
    this.group.clear();
  }
}

/** Wooden boat (or a small ship with mast and furled sail) along local +Z, waterline at y = 0. */
function boatModel(s: Site, r: R, ship: boolean): void {
  const L = ship ? 11 : 4.6, W = ship ? 3.6 : 1.5, H = ship ? 1.8 : 0.75;
  const g = new THREE.BoxGeometry(W, H, L, 6, 3, 14);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const zz = p.getZ(i);
    const t = Math.abs(zz) / (L / 2);
    const taper = 1 - Math.pow(t, 2.2) * 0.92;
    x *= taper;
    const yn = (y + H / 2) / H; // 0 bottom .. 1 top
    // keel: the bottom narrows to a V
    if (yn < 0.5) x *= 0.45 + yn * 1.1;
    // sheer: bow and stern rise
    y += Math.pow(t, 2) * H * 0.45;
    // hollow: inner top vertices sink to make the hull open
    if (yn > 0.99 && Math.abs(p.getX(i)) < W / 2 - 1e-3 && t < 0.97) y -= H * 0.62;
    p.setXYZ(i, x, y, zz);
  }
  g.computeVertexNormals();
  s.add(g, 'matte', { color: ['#1e1612', '#4e3a2a'], cover: 0, aoBottom: 0.6 }, mat4([0, H * 0.18, 0]));
  // thwarts and gunwale strips
  const n = ship ? 4 : 2;
  for (let i = 0; i < n; i++) s.add(box(W * 0.78, 0.07, 0.3), 'matte', { color: WOOD[1], cover: 0 }, mat4([0, H * 0.45, (i - (n - 1) / 2) * (L / (n + 1))]));
  // bow post with a little lantern
  s.add(cyl(0.04, 0.05, ship ? 2.4 : 1.3, 6), 'matte', { color: WOOD }, mat4([0, H * 0.9 + (ship ? 1.0 : 0.5), L / 2 - (ship ? 0.6 : 0.25)], [0.25, 0, 0]));
  // oar
  if (!ship) s.add(cyl(0.035, 0.035, 2.6, 5), 'matte', { color: WOOD[1], cover: 0 }, mat4([W * 0.35, H * 0.6, -0.2], [Math.PI / 2 - 0.15, 0.25, 0]));
  if (ship) {
    s.add(cyl(0.12, 0.16, 9, 8), 'matte', { color: WOOD }, mat4([0, H + 4.2, 0.4]));
    s.add(cyl(0.07, 0.07, 4.6, 6), 'matte', { color: WOOD }, mat4([0, H + 6.6, 0.4], [0, 0, Math.PI / 2]));
    s.add(cyl(0.26, 0.26, 4.2, 8), 'foliage', { color: ['#a89a84', '#cfc2aa'], cover: 0, wind: 0.3 }, mat4([0, H + 6.35, 0.4], [0, 0, Math.PI / 2]));
    s.add(box(W * 0.9, 0.1, L * 0.2), 'matte', { color: WOOD[1], cover: 0 }, mat4([0, H * 0.75, -L * 0.36]));
  }
  void r;
}

/** Bark ridges on a TubeGeometry (ring-major vertex order): `ridges` grooves around, wavering along the length. */
function bark(g: THREE.BufferGeometry, radial: number, amp: number): THREE.BufferGeometry {
  g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const ring = radial + 1;
  const ridges = Math.max(4, Math.round(radial / 2));
  for (let i = 0; i < p.count; i++) {
    const j = i % ring, k = Math.floor(i / ring);
    const a = (j / radial) * Math.PI * 2;
    const h = Math.pow(Math.abs(Math.sin(a * ridges * 0.5 + Math.sin(k * 0.45) * 0.6)), 0.6) - 0.5 + Math.sin(k * 1.7 + j) * 0.15;
    p.setXYZ(i, p.getX(i) + n.getX(i) * h * amp, p.getY(i) + n.getY(i) * h * amp, p.getZ(i) + n.getZ(i) * h * amp);
  }
  g.computeVertexNormals();
  return g;
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000 + 1;
}
