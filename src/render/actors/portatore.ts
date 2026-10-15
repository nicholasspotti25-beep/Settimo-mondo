/**
 * The Portatore: the player character, built from the saved CharacterLook on the humanoid rig and animated by the
 * 'portatore' clip library (data/anim/portatore.yaml). Elegant slim silhouette, long cloak (spring chain), the seed of
 * light glowing in the chest, the active weapon in hand (buildWeapon from the weapons stream), a glass vial of light while
 * drinking. Never casts a shadow until sim.player.hasShadow (the ending).
 */
import * as THREE from 'three';
import type { Sim } from '../../sim/sim';
import type { Player } from '../../sim/player';
import type { CharacterLook } from '../../sim/gamestate';
import type { RenderCtx } from '../types';
import { pal } from '../kit/index';
import { mix, shade } from '../kit/palette';
import * as geo from '../kit/geometry';
import { spriteTexture } from '../kit/textures';
import type { Model } from '../kit/model';
import { Animator, ease, type AnimInput, type AnimStageName } from '../rigs/animator';
import { humanoidBody, humanoidSkeleton } from '../rigs/families/humanoid';
import { standardSurfaces } from '../rigs/families/common';
import { buildWeapon, type WeaponVisual } from '../weapons/index';

/** Character creator tables (index -> color). Shared with the UI preview through the same indices. */
export const SKIN_TONES = ['#f2d6c0', '#e8bf9c', '#c99872', '#a8754e', '#7d5236', '#55372a'];
export const HAIR_COLORS = ['#1e1814', '#4a3022', '#8a5a32', '#c9a064', '#e8dcc0', '#9a9aa8', '#6a2a22', '#2a2a40'];
export const EYE_COLORS = ['#5a3a22', '#3a6a8a', '#4a7a4a', '#8a7a4a', '#6a5a8a', '#2a2a2a'];
export const CLOAK_COLORS = ['#5a4a6a', '#3a4a6a', '#6a3a3a', '#3a5a4a', '#6a5a3a', '#e8e0d0'];

const _v = new THREE.Vector3();

function angleLerp(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function pick<T>(list: T[], i: number): T {
  return list[((Math.round(i) % list.length) + list.length) % list.length];
}

export class PortatoreVisual {
  /** Placed at the interpolated player transform (yaw only). */
  readonly root = new THREE.Group();
  /** Roll pivot at the body center (dodge rolls, knockdowns). */
  private readonly pivot = new THREE.Group();
  readonly model: Model;
  readonly animator: Animator;
  weapon: WeaponVisual | null = null;
  private weaponId: string | null = null;
  private readonly vial: THREE.Group;
  private readonly seedHalo: THREE.Sprite;
  private readonly input: AnimInput = { anim: 'idle', stage: 'idle', time: 0, dur: 1, speed: 0, scale: 1, flags: undefined, airborne: false, hitFlash: 0 };
  private visScale = 1;
  private shadow = false;
  private lookAt = new THREE.Vector3();
  private time = 0;
  private readonly center: number;
  readonly height: number;

  constructor(readonly ctx: RenderCtx, look: CharacterLook) {
    const P = pal(ctx, 'portatore');
    const H = 1.8 * (0.96 + 0.08 * (look.height ?? 0.5));
    this.height = H;
    const mb = ctx.kit.model('portatore', ctx.quality);
    const hairStyle = Math.max(0, Math.min(5, Math.round(look.hair ?? 0)));
    const d = humanoidSkeleton(mb, { height: H, build: 0.2 + (look.build ?? 0.5) * 0.5, cape: 6, hair: hairStyle === 2 || hairStyle === 3 ? 4 : 0 });
    const S = standardSurfaces(mb, '', { rim: 1.05 });
    const cloak = pick(CLOAK_COLORS, look.cloak ?? 0);
    const skin = pick(SKIN_TONES, look.skin ?? 2);
    humanoidBody(mb, d, {
      skin, cloth: mix(P.secondary, '#e8e0d4', 0.18), clothDark: shade(P.secondary, 0.55), metal: P.metal, trim: P.accent, glow: P.glow,
      armor: 'tunic', head: 'human', hairStyle, hairColor: pick(HAIR_COLORS, look.hairColor ?? 0), eyeColor: pick(EYE_COLORS, look.eyes ?? 0),
      cape: { color: mix(cloak, '#f4ece0', 0.12), colorEnd: shade(cloak, 0.78), ragged: 0.4, width: 0.2 }, boots: '#3a2e28', gloves: '#4a3a30', surfaces: S,
    });
    // the seed of light in the chest: a small glowing gem set in a gold clasp
    mb.part('chest', geo.ellipsoid(0.028 * H, 0.034 * H, 0.016 * H, 10, 8), S.glow, { pos: [0, 0.01 * H, 0.075 * H * (0.9 + d.build * 0.2)], color: P.glow });
    mb.part('chest', geo.torus(0.034 * H, 0.006 * H, 6, 18), S.metal, { pos: [0, 0.01 * H, 0.072 * H * (0.9 + d.build * 0.2)], color: P.accent });
    this.model = mb.build();
    this.model.setShadow(false);
    this.animator = new Animator(this.model, ctx.content, 'portatore');
    this.center = d.hipY;
    this.pivot.position.y = this.center;
    this.model.root.position.y = -this.center;
    this.pivot.add(this.model.root);
    this.root.add(this.pivot);
    // seed halo (additive sprite, pulses with the seed)
    const halo = new THREE.SpriteMaterial({ map: spriteTexture('dot', 64), color: new THREE.Color(P.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    this.seedHalo = new THREE.Sprite(halo);
    this.seedHalo.scale.setScalar(0.32);
    this.model.attach('seed', this.seedHalo);
    // glass vial of light (drink)
    this.vial = new THREE.Group();
    const glass = new THREE.Mesh(geo.lathe([[0.0, -0.06], [0.03, -0.055], [0.034, -0.02], [0.026, 0.03], [0.012, 0.045], [0.012, 0.07], [0.0, 0.07]], 14), ctx.kit.fresnel('#e8f4ff', { strength: 1.1, power: 1.6 }));
    const light = new THREE.Mesh(geo.ellipsoid(0.024, 0.032, 0.024, 10, 8).translate(0, -0.025, 0), ctx.kit.glow('#fff1c0'));
    const vialHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTexture('dot', 64), color: new THREE.Color('#ffe6a8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    vialHalo.scale.setScalar(0.3);
    vialHalo.position.y = -0.02;
    this.vial.add(glass, light, vialHalo);
    this.vial.rotation.x = -Math.PI / 2;
    this.vial.visible = false;
    this.model.attach('grip_l', this.vial);
    this.root.userData.smFx = this.model.fx;
  }

  /** Equip the visual for a weapon id (null = bare hands). */
  setWeapon(id: string | null): void {
    if (id === this.weaponId) return;
    this.weaponId = id;
    if (this.weapon) {
      this.weapon.root.removeFromParent();
      this.weapon.offhand?.removeFromParent();
      this.weapon.dispose();
      this.weapon = null;
    }
    if (!id || !this.ctx.content.hasWeapon(id)) return;
    const w = buildWeapon(this.ctx.content.weapon(id), this.ctx);
    const r = this.model.sockets.grip_r ?? this.model.bones.hand_r;
    const l = this.model.sockets.grip_l ?? this.model.bones.hand_l;
    if (w.grip === 'bow') l?.add(w.root);
    else r?.add(w.root);
    if (w.offhand) l?.add(w.offhand);
    this.weapon = w;
  }

  /** World-space weapon blade line (for trails). Returns false without a weapon. */
  bladeLine(base: THREE.Vector3, tip: THREE.Vector3): boolean {
    const w = this.weapon;
    if (!w) return false;
    w.root.updateWorldMatrix(true, false);
    base.copy(w.base).applyMatrix4(w.root.matrixWorld);
    tip.copy(w.tip).applyMatrix4(w.root.matrixWorld);
    return true;
  }

  /** Map the player's state to the animator input. */
  private drive(p: Player, sim: Sim, speed: number): void {
    const inp = this.input;
    const st = p.state;
    const t = p.stateTime, dur = Math.max(0.05, p.stateDur || 0.5);
    let stage: AnimStageName = speed > 0.08 ? 'move' : 'idle';
    let anim = 'idle';
    let time = t, d = dur;
    const sw = p.swing;
    if (sw && (st === 'light' || st === 'heavy' || st === 'running' || st === 'jumping' || st === 'transizione' || st === 'counter')) {
      const def = sw.def;
      const sum = Math.max(0.05, def.startup + def.active + def.recovery);
      const k = Math.max(0.05, sw.dur) / sum;
      const s0 = def.startup * k, s1 = (def.startup + def.active) * k;
      anim = st === 'transizione' && !def.anim ? 'transizione' : def.anim;
      if (sw.t < s0) { stage = 'telegraph'; time = sw.t; d = s0; }
      else if (sw.t < s1) { stage = 'active'; time = sw.t - s0; d = s1 - s0; }
      else { stage = 'recovery'; time = sw.t - s1; d = Math.max(0.05, sw.dur - s1); }
    } else {
      switch (st) {
        case 'idle': case 'move': break;
        case 'jump': stage = 'scripted'; anim = 'jump'; break;
        case 'guard': case 'ballista': stage = 'scripted'; anim = 'guard'; break;
        case 'parry': stage = 'action'; anim = 'parry'; break;
        case 'counter': stage = 'action'; anim = 'counter'; break;
        case 'dodge': stage = 'action'; anim = p.dodgeBack ? 'backstep' : 'dodge_roll'; d = Math.max(0.1, p.dodgeDur); break;
        case 'drink': stage = 'action'; anim = 'drink'; break;
        case 'swap': stage = 'action'; anim = 'swap'; break;
        case 'transizione': stage = 'action'; anim = 'transizione'; break;
        case 'art': stage = 'action'; anim = p.art?.def.anim ?? 'art'; time = p.art?.t ?? t; d = Math.max(0.1, p.art?.dur ?? dur); break;
        case 'stagger': stage = 'stagger'; anim = 'stagger'; break;
        case 'knockdown': stage = 'action'; anim = 'knockdown'; break;
        case 'guardbreak': stage = 'action'; anim = 'guardbreak'; break;
        case 'grace': stage = 'action'; anim = 'grace'; break;
        case 'kneel': case 'interact': stage = 'scripted'; anim = 'kneel'; break;
        case 'dead': stage = 'dead'; anim = 'death'; break;
        case 'climb': stage = 'scripted'; anim = 'climb'; break;
        case 'locked': case 'grabbed': stage = 'scripted'; anim = 'locked'; break;
        default: break;
      }
    }
    if (p.kneel > 0 && stage !== 'action') { stage = 'scripted'; anim = 'kneel'; }
    if (!p.grounded && stage === 'idle' || (!p.grounded && stage === 'move')) { stage = 'scripted'; anim = p.flying ? 'flying' : 'jump'; }
    inp.anim = anim;
    inp.stage = stage;
    inp.time = time;
    inp.dur = d;
    inp.speed = speed;
    inp.scale = this.visScale;
    inp.airborne = p.flying;
    inp.hitFlash = p.hurtTimer;
    void sim;
  }

  update(sim: Sim, alpha: number, dt: number): void {
    const p = sim.player;
    this.time += dt;
    // transform
    const px = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
    const py = p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha;
    const pz = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;
    this.root.position.set(px, py, pz);
    this.root.rotation.set(0, angleLerp(p.prevYaw, p.yaw, alpha), 0);
    const target = p.scale;
    this.visScale += (target - this.visScale) * Math.min(1, dt * (Math.abs(target - this.visScale) > 1 ? 2.2 : 4.5));
    if (Math.abs(this.visScale - target) < 1e-3) this.visScale = target;
    this.root.scale.setScalar(this.visScale);
    // shadow only once the Portatore has one (the ending)
    if (p.hasShadow !== this.shadow) {
      this.shadow = p.hasShadow;
      this.model.setShadow(this.shadow);
    }
    this.setWeapon(p.weaponId);
    const speed = Math.hypot(p.pos.x - p.prevPos.x, p.pos.z - p.prevPos.z) * 60;
    this.drive(p, sim, speed);
    // look toward the lock target
    if (p.lock) {
      const lp = sim.lockPointPos(p.lock.actor, p.lock.part, _v);
      if (lp) {
        this.lookAt.set(lp.x, lp.y, lp.z);
        this.animator.lookTarget = this.lookAt;
      } else this.animator.lookTarget = null;
    } else this.animator.lookTarget = null;
    // dodge roll: whole-body pitch around the hips during the roll window
    let roll = 0;
    if (p.state === 'dodge' && !p.dodgeBack) {
      const k = p.stateTime / Math.max(0.1, p.dodgeDur);
      roll = ease('inout', (k - 0.08) / 0.7) * Math.PI * 2;
    }
    this.pivot.rotation.x = roll;
    this.root.updateMatrixWorld(true);
    this.animator.update(this.input, dt);
    // vial of light
    this.vial.visible = p.state === 'drink';
    // seed pulse
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.1);
    this.seedHalo.scale.setScalar(0.22 + pulse * 0.08);
    (this.seedHalo.material as THREE.SpriteMaterial).opacity = 0.35 + pulse * 0.25;
    this.weapon?.update?.(dt, this.ctx.time);
    // hit flash
    const fl = this.model.fx.flash.value;
    fl.set(1, 0.92, 0.85, Math.min(0.7, p.hurtTimer * 3));
  }

  dispose(): void {
    this.setWeapon(null);
    this.model.dispose();
    this.root.removeFromParent();
  }
}
