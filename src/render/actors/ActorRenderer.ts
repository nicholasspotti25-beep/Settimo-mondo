/**
 * Actor renderer: the Portatore (src/render/actors/portatore.ts) and every sim actor — bosses and minions through their
 * content model module (BOSS_MODELS, loaded lazily) or the generic family model built from data (never a capsule),
 * clones (icy mirror shells), decoys and allies (luminous shells). Drives the per-actor FX uniforms generically: hit flash,
 * Colpo Rosso red flash + a distinct red warning icon above the attacker (shape + color, colorblind-safe), Spezzato
 * cracks, phase-transition aura, death dissolving into light; hides hidden actors; blob shadows on Low.
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { Actor } from '../../sim/actor';
import type { SimEvent } from '../../sim/types';
import type { ActorVisual, BossModelBuilder, RenderCtx } from '../types';
import type { ActorFx } from '../kit/materials';
import { BlobShadows } from '../kit/shadow';
import { spriteTexture } from '../kit/textures';
import { pal } from '../kit/index';
import { buildGenericVisual } from '../rigs/generic';
import { BOSS_MODELS } from '../../generated/registry.render';
import { PortatoreVisual } from './portatore';

interface Entry {
  actor: Actor;
  visual: ActorVisual | null;
  fx: ActorFx | null;
  failed: boolean;
  warn: THREE.Sprite;
  warnK: number;
  crack: number;
  aura: number;
  auraColor: THREE.Color;
  tint: THREE.Vector4 | null;
}

const _c = new THREE.Color();

function lookSig(l: { build: number; height: number; skin: number; hair: number; hairColor: number; eyes: number; cloak: number }): string {
  return `${l.build}|${l.height}|${l.skin}|${l.hair}|${l.hairColor}|${l.eyes}|${l.cloak}`;
}

export class ActorRenderer {
  readonly group = new THREE.Group();
  player: PortatoreVisual | null = null;
  private lookRef: object | null = null;
  private lookSig = '';
  private entries = new Map<number, Entry>();
  private builders = new Map<string, Promise<BossModelBuilder | null>>();
  private resolved = new Map<string, BossModelBuilder | null>();
  private readonly blobs = new BlobShadows(48);
  private readonly warnMat: THREE.SpriteMaterial;
  private seen = new Set<number>();
  private time = 0;

  constructor(scene: THREE.Scene, private ctx: RenderCtx) {
    scene.add(this.group);
    this.group.add(this.blobs.mesh);
    this.warnMat = new THREE.SpriteMaterial({ map: spriteTexture('warning', 64), color: new THREE.Color('#ff2a1a'), transparent: true, depthTest: false, depthWrite: false });
  }

  onEvent(_e: SimEvent, _sim: Sim): void {}

  /** Start loading a content model module (idempotent). */
  private loadBuilder(defId: string): void {
    if (this.builders.has(defId)) return;
    const loader = BOSS_MODELS[defId];
    if (!loader) {
      this.resolved.set(defId, null);
      this.builders.set(defId, Promise.resolve(null));
      return;
    }
    const pr = loader()
      .then((m: { default?: BossModelBuilder }) => m?.default ?? null)
      .catch((err: unknown) => {
        console.warn(`[render] model module for ${defId} failed to load, using the generic model`, err);
        return null;
      })
      .then((b: BossModelBuilder | null) => {
        this.resolved.set(defId, b);
        return b;
      });
    this.builders.set(defId, pr);
  }

  private createVisual(a: Actor): ActorVisual | null {
    // clones of the boss use the boss's model; decoys/allies use their own def's model
    const defId = a.defId;
    this.loadBuilder(defId);
    if (!this.resolved.has(defId)) return null; // still loading: appears next frames
    const b = this.resolved.get(defId) ?? null;
    if (b) {
      try {
        return b(a.def, this.ctx, a);
      } catch (err) {
        console.warn(`[render] model builder for ${defId} threw, using the generic model`, err);
      }
    }
    return buildGenericVisual(a.def, this.ctx, a);
  }

  private safeCreate(e: Entry, a: Actor): ActorVisual | null {
    try {
      return this.createVisual(a);
    } catch (err) {
      e.failed = true;
      console.error(`[render] could not build a visual for ${a.defId}`, err);
      return null;
    }
  }

  private entryFor(a: Actor): Entry | null {
    let e = this.entries.get(a.id);
    if (!e) {
      const warn = new THREE.Sprite(this.warnMat);
      warn.renderOrder = 20;
      warn.visible = false;
      this.group.add(warn);
      e = { actor: a, visual: null, fx: null, failed: false, warn, warnK: 0, crack: 0, aura: 0, auraColor: new THREE.Color('#ffe6b0'), tint: null };
      const P = pal(this.ctx, a.def.model?.palette ?? 'portatore');
      e.auraColor.set(P.glow);
      if (a.kind === 'clone') e.tint = new THREE.Vector4(0.72, 0.9, 1.0, 0.85);
      else if (a.kind === 'decoy') e.tint = new THREE.Vector4(1.0, 0.92, 0.7, 0.9);
      else if (a.kind === 'ally') e.tint = new THREE.Vector4(0.85, 0.93, 1.0, 0.7);
      else if (a.kind === 'echo') e.tint = new THREE.Vector4(0.82, 0.76, 1.0, 0.8);
      this.entries.set(a.id, e);
    }
    if (!e.visual && !e.failed) {
      const v = this.safeCreate(e, a);
      if (v) {
        e.visual = v;
        e.fx = (v.root.userData.smFx as ActorFx | undefined) ?? null;
        this.group.add(v.root);
      }
    }
    return e;
  }

  update(sim: Sim, alpha: number, dt: number): void {
    this.time += dt;
    // --- the Portatore ---
    const look = sim.state.character ?? null;
    // rebuild only when the look object (or, rarely, its fields after an edit) changes: no per-frame allocation
    if (look !== this.lookRef || (look && (this.time % 1) < dt && lookSig(look) !== this.lookSig)) {
      const sig = look ? lookSig(look) : '';
      if (sig !== this.lookSig || !this.player !== !look) {
        this.player?.dispose();
        this.player = look ? new PortatoreVisual(this.ctx, look) : null;
        if (this.player) this.group.add(this.player.root);
        this.lookSig = sig;
      }
      this.lookRef = look;
    }
    if (this.player) this.player.update(sim, alpha, dt);
    // --- actors ---
    const seen = this.seen;
    seen.clear();
    const blobs = this.ctx.quality === 'low';
    this.blobs.begin();
    for (const a of sim.actors) {
      seen.add(a.id);
      const e = this.entryFor(a);
      if (!e || !e.visual) continue;
      const v = e.visual;
      const gone = a.hidden || (a.dying > 0 && a.dying > 4.2);
      v.root.visible = !gone;
      if (gone) {
        e.warn.visible = false;
        continue;
      }
      v.update(a, alpha, dt, sim);
      this.drive(e, a, dt);
      if (blobs && a.dying <= 0) {
        const s = a.scale * (a.def.model?.scale ?? 1);
        const gy = sim.groundAt(a.pos.x, a.pos.z);
        const lift = Math.max(0, a.pos.y - gy);
        this.blobs.add(a.pos.x, gy, a.pos.z, a.radius * s * 1.25 * (1 + lift * 0.05), 0.5 / (1 + lift * 0.15));
      }
    }
    this.blobs.end();
    this.blobs.mesh.visible = blobs;
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      if (e.visual) e.visual.dispose();
      e.visual?.root.removeFromParent();
      e.warn.removeFromParent();
      this.entries.delete(id);
    }
  }

  /** Generic FX uniforms + warning icon for one actor. */
  private drive(e: Entry, a: Actor, dt: number): void {
    const fx = e.fx;
    const v = e.visual!;
    if (fx) {
      // hit flash (white) / Colpo Rosso wind-up (pulsing red)
      const f = fx.flash.value;
      if (a.hitFlash > 0) f.set(1, 0.96, 0.9, Math.min(0.85, a.hitFlash * 7));
      else if (a.redFlash > 0) f.set(1, 0.1, 0.06, 0.28 + 0.2 * Math.sin(this.time * 26));
      else f.w = 0;
      // Spezzato cracks
      const wantCrack = a.state === 'spezzato' ? 1 : 0;
      e.crack += (wantCrack - e.crack) * Math.min(1, dt * (wantCrack ? 6 : 1.5));
      fx.crack.value = e.crack;
      // phase transition aura / clone & ally tints
      const wantAura = a.animStage === 'transition' ? 1 : 0;
      e.aura += (wantAura - e.aura) * Math.min(1, dt * (wantAura ? 4 : 1.2));
      const av = fx.aura.value;
      if (e.tint) av.set(e.tint.x, e.tint.y, e.tint.z, Math.max(e.tint.w, e.aura));
      else {
        _c.copy(e.auraColor);
        av.set(_c.r, _c.g, _c.b, e.aura * (0.8 + 0.2 * Math.sin(this.time * 9)));
      }
      // death: dissolve into light
      fx.dissolve.value = a.dying > 0 ? Math.min(1, Math.max(0, (a.dying - 0.9) / 3)) : 0;
    }
    // red warning icon above the attacker (shape + color)
    const want = a.redFlash > 0 && a.alive ? 1 : 0;
    e.warnK += (want - e.warnK) * Math.min(1, dt * (want ? 18 : 6));
    const w = e.warn;
    w.visible = e.warnK > 0.02;
    if (w.visible) {
      const s = a.scale * (a.def.model?.scale ?? 1);
      const top = v.root.position.y + Math.max(a.height * s, v.height * 1.6) + 0.8 + a.height * s * 0.08;
      w.position.set(v.root.position.x, top, v.root.position.z);
      const size = (1.0 + Math.min(4, a.height * s * 0.12)) * (0.85 + 0.15 * Math.sin(this.time * 18)) * e.warnK;
      w.scale.set(size, size, 1);
      this.warnMat.opacity = Math.min(1, e.warnK * 1.2);
    }
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      e.visual?.dispose();
      e.warn.removeFromParent();
    }
    this.entries.clear();
    this.player?.dispose();
    this.player = null;
    this.blobs.dispose();
    this.warnMat.dispose();
    this.group.clear();
  }
}
