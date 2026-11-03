/**
 * FX renderer: everything the fight draws besides actors and the world.
 *  - attack warnings: ground decals of the hit shapes of every enemy attack in its wind-up (bright edge + dark outline,
 *    fill growing toward impact, red attacks hatched), charge lanes stretched along the charge, leaps marked at the
 *    landing point (`attackWarnings`: 'all' | 'red' | 'off');
 *  - hazards: telegraph decal during `delay`, then the active look of their HazardKindDef.visual + pillars, flames,
 *    shards, debris, mist; shockwave rings as expanding walls (jump over them) + ground ring;
 *  - projectiles with trails for every ProjectileKindDef.visual (src/render/fx/projectiles.ts);
 *  - combat FX: hit sparks by element, player hurt, perfect dodge flash + afterimage, dodge wisps, parry spark, block,
 *    guard break, Spezzato burst, Colpo di Grazia flash + light pillar, part broken, explosions, counters, boss defeat;
 *  - vfx ids (attack/spawn `vfx:`): teleport, summon / minion spawn, bind, 'collider_add:<id>' growth,
 *    'ally_wing_shield', and a generic fallback for unknown ids; Metamondo spherical warp + reactions;
 *  - debug hitboxes when sim.debug.showHitboxes.
 * Everything is pooled / instanced (about 8 draw calls in a busy fight) with zero allocation per frame.
 * Other work-streams plug in with `registerHandler(type, fn)`, `registerVfx(idOrPrefix, fn)` and `spawn(effect)`, and can
 * use the presets (`sparks`, `flash`, `ring`, `puff`, `motes`, `shards`) and the raw systems `particles` / `smoke`.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { Actor } from '../../sim/actor';
import type { Hazard } from '../../sim/pools';
import type { SimEvent, SimEventType } from '../../sim/types';
import type { ShapeDef } from '../../core/types';
import type { RenderCtx } from '../types';
import type { Model } from '../kit/model';
import { elementColor } from '../kit/palette';
import { CELL, ParticleSystem } from './particles';
import { BandBatch, DecalBatch, DFLAG, SHAPE, STYLE, styleOf } from './decals';
import { ProjectileFx, jit, rnd } from './projectiles';

export type FxHandler = (e: SimEvent, sim: Sim, fx: FxRenderer) => void;
export type VfxHandler = (e: Extract<SimEvent, { type: 'vfx' }>, sim: Sim, fx: FxRenderer) => void;
export interface FxUpdatable {
  update(dt: number, sim: Sim): boolean; // return false when finished
  dispose(): void;
}

const DEG = Math.PI / 180;
const ATTACK_COLOR = '#ffa424';
const RED_COLOR = '#ff2a14';

interface Ring {
  active: boolean;
  x: number; y: number; z: number;
  r0: number; r1: number;
  age: number; life: number;
  color: THREE.Color;
  height: number;
  /** 0 expanding wall (+ ground ring decal), 1 pillar. */
  kind: number;
}

interface Ghost {
  meshes: THREE.SkinnedMesh[];
  bones: THREE.Bone[];
  mat: THREE.ShaderMaterial;
  t: number;
  life: number;
}

const _v = { x: 0, y: 0, z: 0 };
const _w = { x: 0, y: 0, z: 0 };
const _cam = new THREE.Vector3();
const _col = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _vol = { x: 0, y: 0, z: 0, r: 0, h: 0 };

function l2w(ox: number, oy: number, oz: number, yaw: number, lx: number, ly: number, lz: number, scale: number, out: { x: number; y: number; z: number }): void {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  out.x = ox + (lx * c + lz * s) * scale;
  out.y = oy + ly * scale;
  out.z = oz + (-lx * s + lz * c) * scale;
}

export class FxRenderer {
  readonly group = new THREE.Group();
  /** Additive GPU particles (sparks, glows, embers, motes). */
  readonly particles: ParticleSystem;
  /** Alpha-blended GPU particles (smoke, dust, debris, petals). */
  readonly smoke: ParticleSystem;
  /** Attack-warning decals: every enemy attack, only Colpi Rossi, or none (settings may bind this). */
  attackWarnings: 'all' | 'red' | 'off' = 'all';
  /** Set by the Renderer: active camera and the Portatore's model (afterimages). */
  camera: (() => THREE.Camera) | null = null;
  playerModel: (() => Model | null) | null = null;
  private readonly decals: DecalBatch;
  private readonly bands: BandBatch;
  private readonly proj: ProjectileFx;
  private handlers = new Map<SimEventType, FxHandler[]>();
  private vfx: { id: string; prefix: boolean; fn: VfxHandler }[] = [];
  private live: FxUpdatable[] = [];
  private rings: Ring[] = [];
  private hazId: Int32Array;
  private hazFired: Uint8Array;
  private hazAcc: Float32Array;
  private ghosts: Ghost[] = [];
  private ghostModel: Model | null = null;
  private readonly meta: THREE.Mesh;
  private metaT = -1;
  private metaDir = 1;
  private readonly debugMesh: THREE.InstancedMesh;
  private colors = new Map<string, THREE.Color>();
  private time = 0;

  constructor(scene: THREE.Scene, readonly ctx: RenderCtx) {
    scene.add(this.group);
    this.group.name = 'fx';
    const q = ctx.quality;
    this.particles = new ParticleSystem(q === 'high' ? 6144 : q === 'medium' ? 4096 : 2048, true, 'fx-particles');
    this.smoke = new ParticleSystem(q === 'high' ? 2560 : q === 'medium' ? 2048 : 1024, false, 'fx-smoke');
    this.decals = new DecalBatch(96);
    this.bands = new BandBatch(32, q === 'low' ? 32 : 56);
    this.proj = new ProjectileFx(ctx.kit, this.particles, this.smoke);
    this.group.add(this.decals.mesh, this.smoke.mesh, this.particles.mesh, this.bands.mesh, this.proj.group);
    for (let i = 0; i < 32; i++) this.rings.push({ active: false, x: 0, y: 0, z: 0, r0: 0, r1: 1, age: 0, life: 1, color: new THREE.Color(), height: 1, kind: 0 });
    this.hazId = new Int32Array(192).fill(-1);
    this.hazFired = new Uint8Array(192);
    this.hazAcc = new Float32Array(192);
    const metaMat = ctx.kit.fresnel('#d6c8ff', { power: 1.4, strength: 1.3, flow: 0.8 });
    metaMat.side = THREE.DoubleSide;
    this.meta = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), metaMat);
    this.meta.visible = false;
    this.meta.frustumCulled = false;
    this.meta.renderOrder = 15;
    this.group.add(this.meta);
    this.debugMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ wireframe: true, depthTest: false, transparent: true, opacity: 0.8 }), 256);
    this.debugMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    this.debugMesh.frustumCulled = false;
    this.debugMesh.count = 0;
    this.debugMesh.visible = false;
    this.debugMesh.renderOrder = 30;
    this.group.add(this.debugMesh);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Public API                                                                                                        */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Subscribe a visual handler to a sim event type. */
  registerHandler(type: SimEventType, fn: FxHandler): void {
    const l = this.handlers.get(type) ?? [];
    l.push(fn);
    this.handlers.set(type, l);
  }

  /** Claim a vfx id (exact) or prefix ('myboss_*'): the handler replaces the built-in look for those ids. */
  registerVfx(idOrPrefix: string, fn: VfxHandler): void {
    const prefix = idOrPrefix.endsWith('*');
    this.vfx.push({ id: prefix ? idOrPrefix.slice(0, -1) : idOrPrefix, prefix, fn });
  }

  /** Add a self-updating effect (removed when update returns false). */
  spawn(fx: FxUpdatable): void {
    this.live.push(fx);
  }

  /** Cached THREE.Color for a hex string (no per-frame parsing). */
  color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  private get density(): number {
    return this.ctx.quality === 'high' ? 1 : this.ctx.quality === 'medium' ? 0.75 : 0.5;
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.density));
  }

  /** Burst of velocity-stretched sparks. */
  sparks(x: number, y: number, z: number, color: THREE.Color, count: number, speed = 7, size = 0.16, gravity = 9): void {
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const u = jit(), th = rnd() * Math.PI * 2, sp = speed * (0.4 + rnd() * 0.8);
      const ch = Math.sqrt(1 - u * u);
      this.particles.emitRaw(x, y, z, Math.cos(th) * ch * sp, u * sp * 0.8 + speed * 0.25, Math.sin(th) * ch * sp, 0.25 + rnd() * 0.35, size, size * 0.3,
        color.r, color.g, color.b, 1, CELL.spark, gravity, 2.5, 0, 0.06, 0.02);
    }
  }

  /** One bright sprite (dot / star / rays / ring) that pops and fades. */
  flash(x: number, y: number, z: number, color: THREE.Color, size: number, life = 0.25, cell: number = CELL.star, spin = 0): void {
    this.particles.emitRaw(x, y, z, 0, 0, 0, life, size, size * 1.35, color.r, color.g, color.b, 1, cell, 0, 0, spin, 0, 0.04);
  }

  /** Expanding ground ring wall (kind 0) or light pillar (kind 1). */
  ring(x: number, y: number, z: number, radius: number, color: THREE.Color, life = 0.6, height = 0.9, kind = 0, r0 = 0.3): void {
    let best: Ring | null = null;
    for (const r of this.rings) if (!r.active) { best = r; break; }
    if (!best) {
      best = this.rings[0];
      for (const r of this.rings) if (r.age / r.life > best.age / best.life) best = r;
    }
    best.active = true;
    best.x = x; best.y = y; best.z = z; best.r0 = r0; best.r1 = radius; best.age = 0; best.life = life; best.height = height; best.kind = kind;
    best.color.copy(color);
  }

  /** Smoke / dust puff (alpha particles). */
  puff(x: number, y: number, z: number, color: THREE.Color, count: number, size = 1, spread = 1, rise = 0.8): void {
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, r = rnd() * spread;
      this.smoke.emitRaw(x + Math.cos(th) * r, y + rnd() * 0.3, z + Math.sin(th) * r, Math.cos(th) * spread * 0.9, rise * (0.5 + rnd()), Math.sin(th) * spread * 0.9,
        0.8 + rnd() * 0.7, size * (0.6 + rnd() * 0.4), size * (1.8 + rnd()), color.r, color.g, color.b, 0.5, CELL.smoke, -0.3, 1.6, jit() * 1.5, 0, 0.12);
    }
  }

  /** Slow luminous motes rising (grace, souls, summons, death). */
  motes(x: number, y: number, z: number, color: THREE.Color, count: number, radius = 1, rise = 1.2, size = 0.22, cell: number = CELL.dot): void {
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
      this.particles.emitRaw(x + Math.cos(th) * r, y + rnd() * 0.6, z + Math.sin(th) * r, jit() * 0.3, rise * (0.5 + rnd()), jit() * 0.3,
        1.0 + rnd() * 1.2, size, size * 0.3, color.r, color.g, color.b, 0.9, cell, -0.15, 0.4, jit() * 2, 0, 0.2);
    }
  }

  /** Spinning shards (guard break, ice, glass, shatter). */
  shards(x: number, y: number, z: number, color: THREE.Color, count: number, speed = 6, size = 0.3): void {
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, u = rnd();
      this.particles.emitRaw(x, y, z, Math.cos(th) * speed * (0.5 + u), speed * (0.4 + rnd() * 0.7), Math.sin(th) * speed * (0.5 + u), 0.5 + rnd() * 0.4, size, size * 0.6,
        color.r, color.g, color.b, 1, CELL.shard, 12, 1.2, jit() * 12, 0, 0.02);
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Events                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  onEvent(e: SimEvent, sim: Sim): void {
    const hs = this.handlers.get(e.type);
    if (hs) for (const h of hs) h(e, sim, this);
    switch (e.type) {
      case 'hit': {
        const c = this.color(elementColor(e.element));
        const p = e.pos;
        this.sparks(p.x, p.y, p.z, c, e.heavy ? 22 : 12, e.heavy ? 9 : 6.5);
        this.flash(p.x, p.y, p.z, c, e.heavy ? 1.7 : 1.1, 0.16);
        if (e.weak) {
          this.flash(p.x, p.y, p.z, this.color('#ffd86a'), 2.6, 0.3, CELL.rays, 3);
          this.sparks(p.x, p.y, p.z, this.color('#ffe9a8'), 12, 10);
        }
        break;
      }
      case 'playerHurt': {
        const p = e.pos;
        const c = this.color(e.element === 'physical' ? '#ff6a4a' : elementColor(e.element));
        this.sparks(p.x, p.y, p.z, c, e.heavy ? 16 : 9, 6);
        this.flash(p.x, p.y, p.z, c, e.heavy ? 1.4 : 0.9, 0.15, CELL.dot);
        if (e.knockdown) this.puff(p.x, sim.groundAt(p.x, p.z), p.z, this.color('#8a8070'), 6, 0.9, 1.2, 0.4);
        break;
      }
      case 'perfectDodge': {
        const p = e.pos;
        const c = this.color('#bfeaff');
        this.flash(p.x, p.y + 1, p.z, c, 3.2, 0.35, CELL.rays, 2);
        this.ring(p.x, sim.groundAt(p.x, p.z), p.z, 3.2, c, 0.45, 0.6, 0, 0.4);
        this.motes(p.x, p.y + 0.4, p.z, c, 18, 0.8, 1.6, 0.16);
        this.afterimage();
        break;
      }
      case 'dodgeAvoid': {
        const p = e.pos;
        this.motes(p.x, p.y + 0.6, p.z, this.color('#dff4ff'), 6, 0.5, 0.8, 0.12);
        break;
      }
      case 'parry':
      case 'counter': {
        const p = e.pos;
        const c = this.color('#ffd77a');
        const big = e.type === 'parry';
        this.flash(p.x, p.y, p.z, this.color('#fff4d0'), big ? 2.8 : 2.0, 0.22, CELL.star, 4);
        this.flash(p.x, p.y, p.z, c, big ? 4.2 : 3, 0.3, CELL.rays, -2);
        this.sparks(p.x, p.y, p.z, c, big ? 28 : 18, 11, 0.14, 12);
        if (big) this.ring(p.x, sim.groundAt(p.x, p.z), p.z, 2.4, c, 0.35, 0.5);
        break;
      }
      case 'block': {
        const p = e.pos;
        const c = this.color('#cfe6ff');
        this.sparks(p.x, p.y, p.z, c, 10, 5, 0.12);
        this.flash(p.x, p.y, p.z, c, 1.2, 0.14, CELL.ring);
        break;
      }
      case 'guardBreak': {
        const p = e.pos;
        const c = this.color('#ff9a5a');
        this.shards(p.x, p.y + 0.8, p.z, this.color('#dfe8ff'), 18, 6, 0.28);
        this.flash(p.x, p.y + 0.8, p.z, c, 2.6, 0.3, CELL.rays);
        this.ring(p.x, sim.groundAt(p.x, p.z), p.z, 2.6, c, 0.4, 0.5);
        break;
      }
      case 'spezzato': {
        const a = sim.actorById(e.actor);
        const s = a ? a.scale * (a.def.model?.scale ?? 1) : 1;
        const h = a ? a.height * s : 3;
        const p = e.pos;
        const c = this.color('#ffd27a');
        this.flash(p.x, p.y, p.z, this.color('#fff2c8'), 2 + h * 0.6, 0.45, CELL.rays, 1.5);
        this.flash(p.x, p.y, p.z, c, 1.5 + h * 0.4, 0.3, CELL.star);
        this.sparks(p.x, p.y, p.z, c, 40, 12, 0.18, 10);
        this.shards(p.x, p.y, p.z, this.color('#ffe6b0'), 14, 7, 0.3);
        if (a) this.ring(a.pos.x, sim.groundAt(a.pos.x, a.pos.z), a.pos.z, a.radius * s * 2.6 + 2, c, 0.7, 1.0);
        break;
      }
      case 'grace': {
        const p = e.pos;
        const c = this.color('#fff0c0');
        const gy = sim.groundAt(p.x, p.z);
        this.flash(p.x, p.y + 1, p.z, this.color('#ffffff'), 7, 0.5, CELL.rays, 0.8);
        this.ring(p.x, gy, p.z, 1.1, c, 1.5, 16, 1, 1.1);
        this.ring(p.x, gy, p.z, 7, c, 0.9, 0.8);
        this.motes(p.x, gy + 0.2, p.z, c, 60, 2.2, 3.5, 0.24);
        break;
      }
      case 'graceHit': {
        const p = e.pos;
        const c = this.color('#ffe6a0');
        this.flash(p.x, p.y, p.z, this.color('#ffffff'), 6, 0.4, CELL.star, 2);
        this.flash(p.x, p.y, p.z, c, 9, 0.55, CELL.rays, -1);
        this.sparks(p.x, p.y, p.z, c, 60, 15, 0.2, 8);
        this.shards(p.x, p.y, p.z, this.color('#fff4d8'), 20, 9, 0.35);
        this.ring(p.x, sim.groundAt(p.x, p.z), p.z, 9, c, 0.8, 1.2);
        break;
      }
      case 'partBroken': {
        const p = e.pos;
        this.shards(p.x, p.y, p.z, this.color('#cfc8bc'), 18, 7, 0.35);
        this.sparks(p.x, p.y, p.z, this.color('#ffd27a'), 20, 9);
        this.puff(p.x, p.y, p.z, this.color('#6a645a'), 10, 1.2, 1.4, 0.6);
        break;
      }
      case 'explosion': {
        const p = e.pos;
        const c = this.color(elementColor(e.element));
        const r = Math.max(1, e.radius);
        this.flash(p.x, p.y + 0.4, p.z, this.color('#ffffff'), r * 1.2, 0.18, CELL.dot);
        this.flash(p.x, p.y + 0.4, p.z, c, r * 2.2, 0.4, CELL.rays, 1);
        this.sparks(p.x, p.y + 0.3, p.z, c, 14 + r * 6, 6 + r * 2.5);
        this.puff(p.x, p.y, p.z, this.color(e.element === 'fire' ? '#3a2a22' : '#5a5650'), 6 + r * 2, r * 0.7, r * 0.6, 1.2);
        this.ring(p.x, sim.groundAt(p.x, p.z), p.z, r * 1.2, c, 0.45, 0.6);
        break;
      }
      case 'projectileHit': {
        const p = e.pos;
        const def = sim.c.projectile(e.kind);
        const c = this.color(def?.color ?? '#ffe0a0');
        this.sparks(p.x, p.y, p.z, c, 10, 5);
        this.flash(p.x, p.y, p.z, c, 1.4, 0.18, CELL.dot);
        break;
      }
      case 'shockwave': {
        // hazard shockwaves draw their own wall; cosmetic ring only for those without a hazard (player Arts)
        let owned = false;
        sim.hazards.forEachActive((h) => {
          if (!owned && h.shape.type === 'ring' && h.age < 0.1 && Math.abs(h.pos.x - e.pos.x) < 0.6 && Math.abs(h.pos.z - e.pos.z) < 0.6) owned = true;
        });
        if (!owned) this.ring(e.pos.x, e.pos.y, e.pos.z, e.radius, this.color(elementColor(e.element)), 0.6, 0.9);
        break;
      }
      case 'bossDefeated': {
        const a = sim.actorById(e.actor);
        if (a) {
          const s = a.scale * (a.def.model?.scale ?? 1);
          let t = 0;
          const x = a.pos.x, y = a.pos.y, z = a.pos.z, rad = a.radius * s, h = a.height * s;
          const c = this.color('#fff1c0');
          this.spawn({
            update: (dt) => {
              t += dt;
              if (t > 1.0 && t < 4.4) this.motes(x, y + rnd() * h, z, c, 3, rad, 1.8, 0.28);
              return t < 4.6;
            },
            dispose: () => undefined,
          });
        }
        break;
      }
      case 'metamondoStart':
        this.metaStart(sim, 1);
        break;
      case 'metamondoEnd':
        this.metaStart(sim, -1);
        break;
      case 'metamondoReaction':
        this.metaReaction(sim, e.reaction);
        break;
      case 'vfx':
        this.onVfx(e, sim);
        break;
      case 'zoneEnter':
        this.particles.clear();
        this.smoke.clear();
        for (const r of this.rings) r.active = false;
        break;
      default:
        break;
    }
  }

  private onVfx(e: Extract<SimEvent, { type: 'vfx' }>, sim: Sim): void {
    for (const v of this.vfx) {
      if (v.prefix ? e.id.startsWith(v.id) : e.id === v.id) {
        v.fn(e, sim, this);
        return;
      }
    }
    const p = e.pos;
    const pc = e.params?.color;
    const radius = Number(e.params?.radius ?? 0) || 0;
    const gy = sim.groundAt(p.x, p.z);
    const id = e.id;
    if (id.startsWith('collider_add:')) {
      // something grows out of the ground (roots, pillars, walls): debris, dust ring, rising shards
      const c = this.color(typeof pc === 'string' ? pc : '#8a7a62');
      const r = radius || 2.5;
      this.puff(p.x, gy, p.z, c, 14, 1.2, r, 1.0);
      this.shards(p.x, gy + 0.3, p.z, c, 12, 5, 0.35);
      this.ring(p.x, gy, p.z, r + 1, c, 0.6, 0.5);
      return;
    }
    switch (id) {
      case 'teleport':
      case 'blink':
      case 'vanish':
      case 'appear': {
        const c = this.color(typeof pc === 'string' ? pc : '#cdb8ff');
        for (let i = 0, n = this.n(26); i < n; i++) {
          const th = rnd() * Math.PI * 2, r = 1.5 + rnd() * 1.5, y = p.y + rnd() * 3;
          this.particles.emitRaw(p.x + Math.cos(th) * r, y, p.z + Math.sin(th) * r, -Math.cos(th) * r * 2.2, (p.y + 1.2 - y) * 2, -Math.sin(th) * r * 2.2, 0.45, 0.26, 0.05, c.r, c.g, c.b, 1, CELL.spark, 0, 0, 0, 0.05, 0.1);
        }
        this.flash(p.x, p.y + 1.2, p.z, c, 3, 0.35, CELL.rays, 2);
        return;
      }
      case 'minion_spawn':
      case 'summon':
      case 'spawn': {
        const c = this.color(typeof pc === 'string' ? pc : '#ffd89a');
        this.ring(p.x, gy, p.z, radius || 2.2, c, 0.6, 0.6);
        this.motes(p.x, gy, p.z, c, 22, 1.2, 2.2, 0.2);
        this.flash(p.x, gy + 0.6, p.z, c, 2.2, 0.3, CELL.ring);
        return;
      }
      case 'bind': {
        const c = this.color(typeof pc === 'string' ? pc : '#ffe08a');
        this.motes(p.x, p.y + 0.5, p.z, c, 14, 1.4, 0.6, 0.3, CELL.glyph + Math.floor(rnd() * 4));
        this.ring(p.x, gy, p.z, 2, c, 0.5, 0.4);
        return;
      }
      case 'ally_wing_shield': {
        const c = this.color(typeof pc === 'string' ? pc : '#fff4d8');
        const r = radius || 2.2;
        for (let i = 0, n = this.n(28); i < n; i++) {
          const th = (i / n) * Math.PI * 2;
          this.particles.emitRaw(p.x + Math.cos(th) * r, p.y + 0.3 + rnd() * 2.4, p.z + Math.sin(th) * r, -Math.sin(th) * 1.5, 0.6, Math.cos(th) * 1.5, 1.1, 0.5, 0.2, c.r, c.g, c.b, 0.9, CELL.feather, -0.2, 1, jit() * 2, 0, 0.15);
        }
        this.ring(p.x, gy, p.z, r, c, 1.0, 2.6, 1, r);
        return;
      }
      default: {
        // generic fallback: color from params or an element named in the id, sparkle burst + motes
        let hex = typeof pc === 'string' ? pc : '#ffe6b0';
        if (typeof pc !== 'string') {
          for (const el of ['fire', 'ice', 'lightning', 'void', 'light', 'poison', 'water', 'nature', 'spirit', 'blood']) {
            if (id.includes(el)) { hex = elementColor(el); break; }
          }
        }
        const c = this.color(hex);
        const r = radius || 1.5;
        this.flash(p.x, p.y, p.z, c, 1.6 + r, 0.3, CELL.star, 1);
        this.sparks(p.x, p.y, p.z, c, 14, 4 + r);
        this.motes(p.x, p.y, p.z, c, 10, r, 1.2, 0.18);
      }
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Afterimage (perfect dodge) and Metamondo                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private buildGhosts(model: Model): void {
    for (const g of this.ghosts) {
      for (const m of g.meshes) m.removeFromParent();
      g.mat.dispose();
    }
    this.ghosts = [];
    this.ghostModel = model;
    for (let k = 0; k < 3; k++) {
      const bones = model.boneList.map(() => {
        const b = new THREE.Bone();
        b.matrixAutoUpdate = false;
        b.matrixWorldAutoUpdate = false;
        return b;
      });
      const sk = new THREE.Skeleton(bones, model.skeleton.boneInverses.map((m) => m.clone()));
      const mat = this.ctx.kit.fresnel('#bfe6ff', { power: 1.7, strength: 1.4, flow: 1.4 });
      const meshes = model.meshes.map((m) => {
        const s = new THREE.SkinnedMesh(m.geometry, mat);
        s.bind(sk, new THREE.Matrix4());
        s.frustumCulled = false;
        s.visible = false;
        s.renderOrder = 9;
        this.group.add(s);
        return s;
      });
      this.ghosts.push({ meshes, bones, mat, t: 1, life: 1 });
    }
  }

  private afterimage(): void {
    const model = this.playerModel?.() ?? null;
    if (!model) return;
    if (model !== this.ghostModel) this.buildGhosts(model);
    let g = this.ghosts[0];
    for (const x of this.ghosts) if (x.t / x.life > g.t / g.life) g = x;
    model.root.updateMatrixWorld(true);
    for (let i = 0; i < g.bones.length; i++) g.bones[i].matrixWorld.copy(model.boneList[i].matrixWorld);
    g.t = 0;
    g.life = 0.6;
    for (const m of g.meshes) m.visible = true;
  }

  private metaStart(sim: Sim, dir: number): void {
    this.metaT = 0;
    this.metaDir = dir;
    const p = sim.player.pos;
    this.meta.position.set(p.x, p.y + 1, p.z);
    this.motes(p.x, p.y, p.z, this.color('#d6c8ff'), 40, 3, 2.5, 0.25);
    this.flash(p.x, p.y + 1, p.z, this.color('#f0e8ff'), 6, 0.5, CELL.rays, 1);
  }

  private metaReaction(sim: Sim, reaction: 'shatter' | 'rewrite' | 'devour' | 'spit'): void {
    const b = sim.boss;
    const x = b ? b.pos.x : sim.player.pos.x, z = b ? b.pos.z : sim.player.pos.z;
    const y = (b ? b.pos.y + b.height * b.scale * 0.5 : sim.player.pos.y + 1);
    const c = this.color('#d6c8ff');
    switch (reaction) {
      case 'shatter':
        this.shards(x, y, z, this.color('#e8f0ff'), 46, 12, 0.5);
        this.flash(x, y, z, c, 10, 0.4, CELL.rays);
        break;
      case 'rewrite':
        for (let i = 0, n = this.n(40); i < n; i++) {
          const th = rnd() * Math.PI * 2, r = 2 + rnd() * 4;
          this.particles.emitRaw(x + Math.cos(th) * r, y + jit() * 3, z + Math.sin(th) * r, -Math.sin(th) * 2, 0.4, Math.cos(th) * 2, 1.6, 0.5, 0.3, c.r, c.g, c.b, 1, CELL.glyph + (i % 4), 0, 0.3, jit() * 2, 0, 0.15);
        }
        break;
      case 'devour':
        for (let i = 0, n = this.n(60); i < n; i++) {
          const th = rnd() * Math.PI * 2, r = 6 + rnd() * 6, yy = y + jit() * 4;
          this.particles.emitRaw(x + Math.cos(th) * r, yy, z + Math.sin(th) * r, -Math.cos(th) * r * 1.4, (y - yy) * 1.4, -Math.sin(th) * r * 1.4, 0.7, 0.3, 0.05, c.r, c.g, c.b, 1, CELL.spark, 0, 0, 0, 0.05, 0.1);
        }
        break;
      case 'spit':
        this.sparks(x, y, z, c, 60, 16, 0.25, 4);
        this.flash(x, y, z, c, 8, 0.4, CELL.star);
        break;
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Per-frame                                                                                                         */
  /* ---------------------------------------------------------------------------------------------------------------- */

  update(sim: Sim, alpha: number, dt: number): void {
    this.time += dt;
    const t = this.time;
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (!this.live[i].update(dt, sim)) {
        this.live[i].dispose();
        this.live.splice(i, 1);
      }
    }
    this.decals.begin();
    this.bands.begin();
    if (this.attackWarnings !== 'off') for (const a of sim.actors) this.attackDecals(a, sim, t);
    this.hazardsFx(sim, dt, t);
    this.ringsFx(dt, t);
    this.debugFx(sim);
    const cam = this.camera?.();
    if (cam) _cam.setFromMatrixPosition(cam.matrixWorld);
    this.proj.density = this.density;
    this.proj.update(sim, alpha, dt, _cam);
    // afterimages
    for (const g of this.ghosts) {
      if (g.t >= g.life) continue;
      g.t += dt;
      const k = Math.max(0, 1 - g.t / g.life);
      const u = g.mat.uniforms;
      if (u.uFade) u.uFade.value = k * k * 0.9;
      if (g.t >= g.life) for (const m of g.meshes) m.visible = false;
    }
    // Metamondo spherical warp: expands from the player on start, collapses on end
    if (this.metaT >= 0) {
      this.metaT += dt;
      const dur = this.metaDir > 0 ? 1.2 : 0.9;
      const k = Math.min(1, this.metaT / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const r = this.metaDir > 0 ? 0.5 + e * 48 : 48 * (1 - e) + 0.5;
      this.meta.scale.setScalar(r);
      this.meta.visible = k < 1;
      const u = (this.meta.material as THREE.ShaderMaterial).uniforms;
      if (u.uFade) u.uFade.value = Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) this.metaT = -1;
    }
    this.decals.end();
    this.bands.end();
    this.particles.update(dt);
    this.smoke.update(dt);
  }

  /** Ground warning of an enemy attack's hit shapes during its wind-up (and a short flash at impact). */
  private attackDecals(a: Actor, sim: Sim, t: number): void {
    if (a.team !== 'enemy' || !a.alive || a.hidden) return;
    const atk = a.attack;
    if (!atk || !atk.def.hits || !atk.def.hits.length) return;
    const tele = a.animStage === 'telegraph';
    const flashIn = a.animStage === 'active' && a.animTime < 0.16;
    if (!tele && !flashIn) return;
    const def = atk.def;
    const red = def.flags.includes('red');
    if (this.attackWarnings === 'red' && !red) return;
    const k = tele ? Math.min(1, a.animTime / Math.max(0.05, a.animDur)) : 1;
    const alpha = tele ? Math.min(1, k * 5) * (red ? 1 : 0.85) : (1 - a.animTime / 0.16);
    const flags = DFLAG.attack | (red ? DFLAG.red : 0);
    const color = red ? RED_COLOR : ATTACK_COLOR;
    // root motion: charges stretch the footprint along +Z, leaps/dives land at the target
    let fwd = 0, atTarget = false;
    if (def.motion) {
      for (const m of def.motion) {
        if ((m.type === 'forward' || m.type === 'charge_through') && m.speed) fwd += m.speed * m.dur;
        else if (m.type === 'leap_to_target' || m.type === 'dive_to_target') atTarget = true;
      }
    }
    const s = a.scale;
    let shown = 0;
    for (const h of def.hits ?? []) {
      if (h.t > 0.75 || shown >= 3) continue;
      let ox = a.pos.x, oy = a.pos.y, oz = a.pos.z;
      if (h.part) {
        a.partOrigin(h.part, _w);
        ox = _w.x; oy = _w.y; oz = _w.z;
      } else if (atTarget) {
        ox = atk.target.x; oz = atk.target.z;
      }
      const gy = sim.groundAt(ox, oz);
      this.shapeDecal(h.shape, ox, gy, oz, a.yaw, s, color, alpha, k, 0, flags, STYLE.flash, atTarget ? 0 : fwd / Math.max(0.05, s), 1, t, sim);
      shown++;
    }
  }

  /**
   * Draw a sim ShapeDef as a ground decal. Owner frame (ox, oy, oz, yaw, scale) as in sim/shapes.ts; `extend` stretches
   * capsule/box/sphere footprints forward (charges, local units); `ringK` = expanding-ring progress.
   */
  private shapeDecal(shape: ShapeDef, ox: number, oy: number, oz: number, yaw: number, scale: number, color: THREE.ColorRepresentation, alpha: number,
    fill: number, act: number, flags: number, style: number, extend: number, ringK: number, t: number, sim: Sim): void {
    const M = 0.45; // quad margin (edge outline)
    const y = oy + 0.05;
    switch (shape.type) {
      case 'sphere':
      case 'cylinder': {
        if (extend > 0.5) {
          // a sphere carried forward by a charge sweeps a lane
          l2w(ox, oy, oz, yaw, shape.c[0], 0, shape.c[2] + extend / 2, scale, _v);
          const r = shape.r * scale, hl = (extend * scale) / 2;
          this.decals.add(SHAPE.stadium, _v.x, y, _v.z, yaw, r + M, hl + r + M, r, hl, 0, 0, style, color, alpha, fill, act, t, flags);
          return;
        }
        l2w(ox, oy, oz, yaw, shape.c[0], shape.c[1], shape.c[2], scale, _v);
        const r = shape.r * scale;
        if (shape.type === 'sphere' && _v.y - r > oy + 2.6) return; // purely aerial: no ground footprint
        this.decals.add(SHAPE.disc, _v.x, y, _v.z, 0, r + M, r + M, r, 0, 0, 0, style, color, alpha, fill, act, t, flags);
        return;
      }
      case 'capsule': {
        const az = shape.a[2], bz = shape.b[2] + (shape.b[2] >= shape.a[2] ? extend : 0);
        const aze = shape.b[2] >= shape.a[2] ? az : az + extend;
        l2w(ox, oy, oz, yaw, shape.a[0], 0, aze, scale, _v);
        l2w(ox, oy, oz, yaw, shape.b[0], 0, bz, scale, _w);
        const dx = _w.x - _v.x, dz = _w.z - _v.z;
        const len = Math.hypot(dx, dz), r = shape.r * scale;
        const cy = Math.atan2(dx, dz);
        const hl = len / 2;
        this.decals.add(SHAPE.stadium, (_v.x + _w.x) / 2, y, (_v.z + _w.z) / 2, len > 1e-3 ? cy : yaw, r + M, hl + r + M, r, hl, 0, 0, style, color, alpha, fill, act, t, flags);
        return;
      }
      case 'arc': {
        const c = shape.c;
        if (c) l2w(ox, oy, oz, yaw, c[0], c[1], c[2], scale, _v);
        else { _v.x = ox; _v.y = oy; _v.z = oz; }
        const r = shape.r * scale, rin = (shape.r_in ?? 0) * scale;
        if (shape.angle >= 359) this.decals.add(SHAPE.disc, _v.x, y, _v.z, 0, r + M, r + M, r, rin, 0, 0, style, color, alpha, fill, act, t, flags);
        else this.decals.add(SHAPE.sector, _v.x, y, _v.z, yaw + (shape.yaw ?? 0) * DEG, r + M, r + M, r, rin, (shape.angle * DEG) / 2, 0, style, color, alpha, fill, act, t, flags);
        return;
      }
      case 'box': {
        const ext = extend > 0.5 ? extend : 0;
        l2w(ox, oy, oz, yaw, shape.c[0], shape.c[1], shape.c[2] + ext / 2, scale, _v);
        if (_v.y - shape.half[1] * scale > oy + 2.6) return;
        const hx = shape.half[0] * scale, hz = shape.half[2] * scale + (ext * scale) / 2;
        this.decals.add(SHAPE.box, _v.x, y, _v.z, yaw + (shape.yaw ?? 0) * DEG, hx + M, hz + M, hx, hz, 0, 0, style, color, alpha, fill, act, t, flags);
        return;
      }
      case 'ring': {
        if (shape.c) l2w(ox, oy, oz, yaw, shape.c[0], shape.c[1], shape.c[2], scale, _v);
        else { _v.x = ox; _v.y = oy; _v.z = oz; }
        const r1 = shape.r1 * scale, w = Math.max(0.3, shape.width * scale);
        if (act > 0) {
          const rc = (shape.r0 + (shape.r1 - shape.r0) * Math.min(1, Math.max(0, ringK))) * scale;
          this.decals.add(SHAPE.ring, _v.x, y, _v.z, 0, r1 + w + M, r1 + w + M, r1, 0, rc, w, style, color, alpha, fill, act, t, flags);
        } else {
          // wind-up: the annulus the wave will sweep, filling outward
          this.decals.add(SHAPE.disc, _v.x, y, _v.z, 0, r1 + w + M, r1 + w + M, r1 + w / 2, shape.r0 * scale, 0, 0, style, color, alpha, fill, act, t, flags);
        }
        void sim;
        return;
      }
    }
  }

  private hazardsFx(sim: Sim, dt: number, t: number): void {
    const items = sim.hazards.items;
    const n = Math.min(items.length, this.hazId.length);
    for (let i = 0; i < n; i++) {
      const h = items[i];
      if (!h.active) continue;
      if (this.hazId[i] !== h.id) {
        this.hazId[i] = h.id;
        this.hazFired[i] = 0;
        this.hazAcc[i] = 0;
      }
      this.hazard(i, h, sim, dt, t);
    }
  }

  private hazard(i: number, h: Hazard, sim: Sim, dt: number, t: number): void {
    const style = styleOf(h.visual);
    const c = this.color(h.color || '#ff9a5a');
    const player = h.team === 'player';
    const flags = player ? DFLAG.player : 0;
    const ring = h.shape.type === 'ring';
    if (h.age < h.delay) {
      // TELEGRAPH: fill grows toward impact
      if (player) return;
      const k = h.age / Math.max(1e-3, h.delay);
      const alpha = Math.min(1, h.age / 0.15);
      this.shapeDecal(h.shape, h.pos.x, h.pos.y, h.pos.z, h.yaw, 1, c, alpha, k, 0, flags, style, 0, 0, t, sim);
      return;
    }
    const at = h.age - h.delay;
    const k = h.permanent ? 0.5 : Math.min(1, at / Math.max(1e-3, h.activeDur));
    const act = h.permanent ? 0.5 : Math.max(0.001, 1 - k);
    this.shapeDecal(h.shape, h.pos.x, h.pos.y, h.pos.z, h.yaw, 1, c, 1, 1, act, flags, style, 0, k, t, sim);
    const r = sim.hazardRadius(h);
    // shockwave wall (the player jumps over it): height of the hit band, expanding with the ring
    if (ring && h.shape.type === 'ring') {
      const sh = h.shape;
      const rc = sh.r0 + (sh.r1 - sh.r0) * k;
      let cx = h.pos.x, cz = h.pos.z;
      if (sh.c) {
        l2w(h.pos.x, h.pos.y, h.pos.z, h.yaw, sh.c[0], sh.c[1], sh.c[2], 1, _v);
        cx = _v.x; cz = _v.z;
      }
      this.bands.add(cx, h.pos.y, cz, rc, (sh.height ?? 0.9) * 1.25, c, 0.9 * (1 - k * k), t, 0);
      if (rnd() < this.density * 0.8) {
        const th = rnd() * Math.PI * 2;
        this.smoke.emitRaw(cx + Math.cos(th) * rc, h.pos.y + 0.1, cz + Math.sin(th) * rc, Math.cos(th) * 2, 0.6, Math.sin(th) * 2, 0.7, 0.8, 1.8, 0.45, 0.42, 0.38, 0.35, CELL.smoke, -0.2, 1.5, jit(), 0, 0.1);
      }
    }
    const cyl = h.shape.type === 'cylinder' ? h.shape : null;
    // impact burst once
    if (!this.hazFired[i]) {
      this.hazFired[i] = 1;
      const x = h.pos.x, y = h.pos.y, z = h.pos.z;
      if (!h.permanent) {
        switch (style) {
          case STYLE.fire:
            this.flash(x, y + 0.5, z, c, r * 1.6, 0.3, CELL.dot);
            this.sparks(x, y + 0.3, z, c, 10 + r * 4, 5 + r);
            break;
          case STYLE.ice:
            this.shards(x, y + 0.2, z, this.color('#e8f6ff'), 10 + r * 4, 5, 0.35);
            this.flash(x, y + 0.5, z, c, r * 1.4, 0.25, CELL.star);
            break;
          case STYLE.light:
            this.flash(x, y + 0.6, z, this.color('#ffffff'), r * 1.8, 0.3, CELL.rays, 1);
            if (h.visual === 'lightning') {
              this.ring(x, y, z, Math.max(0.4, r * 0.35), this.color('#eaf6ff'), 0.28, 22, 1, Math.max(0.4, r * 0.35));
              this.sparks(x, y + 0.2, z, c, 24, 9);
            }
            break;
          case STYLE.crack:
            this.puff(x, y, z, this.color(h.visual === 'mud' ? '#4a3c28' : '#6e665a'), 6 + r * 2, r * 0.5, r * 0.7, 1);
            this.shards(x, y + 0.2, z, this.color(h.visual === 'roots' ? '#5a3e22' : '#7a7266'), 6 + r * 2, 5, 0.3);
            break;
          case STYLE.swirl:
            this.puff(x, y, z, c, 4 + r, r * 0.5, r * 0.6, 0.4);
            break;
          default:
            this.flash(x, y + 0.4, z, c, r * 1.4, 0.22, CELL.ring);
            break;
        }
      }
    }
    // continuous emission while active (rate-limited per hazard)
    const area = Math.min(60, r * r);
    let rate = 0;
    if (style === STYLE.fire) rate = 6 + area * 1.6;
    else if (style === STYLE.dots) rate = 4 + area * 0.6;
    else if (style === STYLE.swirl && (h.visual === 'fog' || h.visual === 'void' || h.visual === 'shadow')) rate = 3 + area * 0.3;
    else if (style === STYLE.light) rate = 3 + area * 0.4;
    if (h.permanent) rate *= 0.35;
    this.hazAcc[i] += dt * rate * this.density * (h.permanent ? 1 : Math.max(0.2, 1 - k));
    let budget = 8;
    while (this.hazAcc[i] >= 1 && budget-- > 0) {
      this.hazAcc[i] -= 1;
      const th = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * 0.9;
      let x = h.pos.x + Math.cos(th) * rr, z = h.pos.z + Math.sin(th) * rr;
      if (h.shape.type === 'box' || h.shape.type === 'capsule' || (h.shape.type !== 'ring' && 'c' in h.shape && h.shape.c)) {
        // shapes not centred on the hazard origin: sample around the shape centre
        const sc = h.shape.type === 'capsule' ? h.shape.b : h.shape.type === 'box' ? h.shape.c : (h.shape as { c?: [number, number, number] }).c;
        if (sc) {
          l2w(h.pos.x, h.pos.y, h.pos.z, h.yaw, sc[0] * 0.5, 0, sc[2] * 0.5, 1, _v);
          x = _v.x + Math.cos(th) * rr * 0.6; z = _v.z + Math.sin(th) * rr * 0.6;
        }
      }
      const y = h.pos.y + 0.05;
      if (style === STYLE.fire) {
        this.particles.emitRaw(x, y, z, jit() * 0.4, 1.6 + rnd() * 1.8, jit() * 0.4, 0.5 + rnd() * 0.5, 0.5 + rnd() * 0.5, 0.15, c.r, c.g * 0.85, c.b * 0.6, 0.9, CELL.flame, -1.5, 0.8, jit(), 0, 0.15);
        if (rnd() < 0.2) this.smoke.emitRaw(x, y + 1, z, jit() * 0.3, 1.2, jit() * 0.3, 1.2, 0.6, 2.2, 0.12, 0.1, 0.1, 0.3, CELL.smoke, -0.3, 1, jit(), 0, 0.2);
      } else if (style === STYLE.dots) {
        this.particles.emitRaw(x, y + rnd() * 0.5, z, jit() * 0.3, 0.4 + rnd() * 0.6, jit() * 0.3, 1.2 + rnd(), 0.16, 0.06, c.r, c.g, c.b, 0.85, CELL.dot, -0.2, 0.6, 0, 0, 0.2);
      } else if (style === STYLE.swirl) {
        this.smoke.emitRaw(x, y + 0.2, z, jit() * 0.4, 0.15, jit() * 0.4, 1.6, 1.0, 2.6, c.r * 0.7, c.g * 0.7, c.b * 0.7, 0.35, CELL.smoke, 0, 0.8, jit() * 0.5, 0, 0.3);
      } else {
        this.particles.emitRaw(x, y, z, jit() * 0.2, 1 + rnd() * 1.5, jit() * 0.2, 1 + rnd() * 0.6, 0.2, 0.05, c.r, c.g, c.b, 0.9, CELL.dot, -0.3, 0.4, 0, 0, 0.2);
      }
    }
    // pillars: tall cylinders of fire / light / lightning
    if (cyl && cyl.h >= 3 && (style === STYLE.fire || style === STYLE.light)) {
      l2w(h.pos.x, h.pos.y, h.pos.z, h.yaw, cyl.c[0], cyl.c[1], cyl.c[2], 1, _v);
      this.bands.add(_v.x, h.pos.y, _v.z, cyl.r * 0.85, cyl.h, c, h.permanent ? 0.5 : 0.85 * Math.min(1, act * 3), t, 1);
    }
  }

  private ringsFx(dt: number, t: number): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.active = false;
        continue;
      }
      if (r.kind === 1) {
        // pillar: snaps in, holds, fades
        const a = Math.min(1, k * 8) * (1 - k * k);
        this.bands.add(r.x, r.y, r.z, r.r1 * (0.8 + 0.2 * Math.min(1, k * 4)), r.height, r.color, a, t, 1);
      } else {
        const e = 1 - Math.pow(1 - k, 2.2);
        const rad = r.r0 + (r.r1 - r.r0) * e;
        this.bands.add(r.x, r.y, r.z, rad, r.height, r.color, 0.9 * (1 - k), t, 0);
        _col.copy(r.color);
        this.decals.add(SHAPE.ring, r.x, r.y + 0.05, r.z, 0, rad + 1, rad + 1, r.r1, 0, rad, 0.35 + r.r1 * 0.04, STYLE.flash, _col, 1 - k, 1, Math.max(0.001, 1 - k), t, 0);
      }
    }
  }

  private debugFx(sim: Sim): void {
    const on = sim.debug.showHitboxes;
    const dm = this.debugMesh;
    dm.visible = on;
    if (!on) return;
    let n = 0;
    const put = (x: number, y: number, z: number, r: number, hex: string) => {
      if (n >= 256) return;
      _p.set(x, y, z);
      _s.setScalar(Math.max(0.05, r));
      _m.compose(_p, _q.identity(), _s);
      dm.setMatrixAt(n, _m);
      const c = this.color(hex);
      dm.instanceColor!.setXYZ(n, c.r, c.g, c.b);
      n++;
    };
    for (const a of sim.actors) {
      if (!a.alive) continue;
      const hb = ('order' in a.def ? (a.def as { hurtboxes?: { c: [number, number, number]; r: number }[] }).hurtboxes : (a.def as { hurt?: { c: [number, number, number]; r: number }[] }).hurt) ?? [];
      for (const h of hb) {
        l2w(a.pos.x, a.pos.y, a.pos.z, a.yaw, h.c[0], h.c[1], h.c[2], a.scale, _v);
        put(_v.x, _v.y, _v.z, h.r * a.scale, '#4aff6a');
      }
      for (const p of a.parts) for (const w of p.world) put(w.x, w.y, w.z, w.r, p.broken ? '#777777' : p.active ? '#4ae8ff' : '#2a6a7a');
      const atk = a.attack;
      if (atk && a.animStage === 'active' && atk.def.hits) {
        for (const h of atk.def.hits) {
          if (atk.activeTime < h.t || atk.activeTime > h.t + h.dur) continue;
          const sh = h.shape;
          let ox = a.pos.x, oy = a.pos.y, oz = a.pos.z;
          if (h.part) {
            a.partOrigin(h.part, _w);
            ox = _w.x; oy = _w.y; oz = _w.z;
          }
          if (sh.type === 'sphere') {
            l2w(ox, oy, oz, a.yaw, sh.c[0], sh.c[1], sh.c[2], a.scale, _v);
            put(_v.x, _v.y, _v.z, sh.r * a.scale, '#ff3a2a');
          } else if (sh.type === 'capsule') {
            for (let k = 0; k <= 4; k++) {
              const f = k / 4;
              l2w(ox, oy, oz, a.yaw, sh.a[0] + (sh.b[0] - sh.a[0]) * f, sh.a[1] + (sh.b[1] - sh.a[1]) * f, sh.a[2] + (sh.b[2] - sh.a[2]) * f, a.scale, _v);
              put(_v.x, _v.y, _v.z, sh.r * a.scale, '#ff3a2a');
            }
          } else {
            const prog = (atk.activeTime - h.t) / Math.max(1e-3, h.dur);
            this.shapeDecal(sh, ox, sim.groundAt(ox, oz), oz, a.yaw, a.scale, '#ff3a2a', 1, 1, 0, DFLAG.debug, STYLE.flash, 0, prog, this.time, sim);
          }
        }
      }
    }
    const pv = sim.player.volume(_vol, sim);
    put(pv.x, pv.y + pv.r, pv.z, pv.r, '#5a9aff');
    if (pv.h > 0) put(pv.x, pv.y + Math.max(pv.r, pv.h - pv.r), pv.z, pv.r, '#5a9aff');
    sim.projectiles.forEachActive((p) => put(p.pos.x, p.pos.y, p.pos.z, p.radius, p.team === 'enemy' ? '#ff5aff' : '#ffe65a'));
    dm.count = n;
    dm.instanceMatrix.needsUpdate = true;
    dm.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    for (const f of this.live) f.dispose();
    this.live = [];
    this.particles.dispose();
    this.smoke.dispose();
    this.decals.dispose();
    this.bands.dispose();
    this.proj.dispose();
    for (const g of this.ghosts) g.mat.dispose();
    this.meta.geometry.dispose();
    (this.meta.material as THREE.Material).dispose();
    this.debugMesh.geometry.dispose();
    (this.debugMesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
