/**
 * The Portatore. State machine (D6): Idle, Move, Sprint, Jump, LightAttack, HeavyAttack, Guard, Parry, Dodge, Drink,
 * WeaponSwap, Transizione, ArtCast, Staggered, GraceStrike, Kneel, Dead (+ Climb, Interact, Locked, Grabbed, Ballista).
 */
import { DEG, clamp, dist2D, forward, len2D, turnToward, v3, wrapAngle, yawTo, yawOf, type Vec3 } from '../core/math';
import type { MovesetDef, StatusKind, SwingDef, TransitionDef, WeaponDef } from '../core/types';
import { weaponDamage } from '../core/formulas';
import { shapeHits, scaleShape, shapeReach, type TargetVol } from './shapes';
import { Btn, type AttackKind, type PlayerInput, type PlayerStateId } from './types';
import type { Actor, PartRuntime } from './actor';
import type { Sim } from './sim';
import { startArt, updateArt, type ArtRuntime } from './arts';

export interface SwingRuntime {
  def: SwingDef;
  kind: AttackKind;
  uid: number;
  t: number;
  dur: number;
  hit: Set<number>;
  tickHits: Map<number, number>;
  fired: boolean;
  weapon: WeaponDef | null;
  damage: number;
  poise: number;
  eco: number;
  dir: number;
  transition?: TransitionDef;
  landed: boolean;
  scaleMul: number;
}

interface Buffered {
  btn: number;
  t: number;
}

const ATTACK_STATES: PlayerStateId[] = ['light', 'heavy', 'running', 'jumping', 'transizione', 'art', 'counter'];

const tmp = v3();
const tmp2 = v3();
const contact = v3();
let swingUid = 1_000_000;

export class Player {
  pos: Vec3 = v3();
  prevPos: Vec3 = v3();
  vel: Vec3 = v3();
  vy = 0;
  yaw = 0;
  prevYaw = 0;
  grounded = true;
  airTime = 0;

  hp = 100;
  hpMax = 100;
  fiato = 100;
  fiatoMax = 100;
  fiatoIdle = 10;
  eco = 0;
  lacrime = 3;
  lacrimeMax = 3;

  state: PlayerStateId = 'idle';
  stateTime = 0;
  stateDur = 0;

  /** Base scale from story (1, 0.1 in Little Garden, 1.12 after the Ascesa). */
  baseScale = 1;
  baseSpeed = 1;
  /** Temporary multiplier from the Gigante form. */
  formScale = 1;

  weapons: (string | null)[] = ['lama_della_culla', null, null];
  activeSlot = 0;
  /** Temporary moveset override (Metamorfosi). */
  shapeShift: { type: string; time: number } | null = null;

  comboIndex = 0;
  comboTimer = 0;
  swing: SwingRuntime | null = null;
  art: ArtRuntime | null = null;
  dodgeStart = -999;
  dodgeDir = 0;
  dodgeBack = false;
  dodgeDist = 0;
  dodgeDur = 0.4;
  iframes: [number, number] = [0.05, 0.3];
  parryStart = -999;
  drinkCommitted = false;
  swapTo = -1;
  lock: { actor: number; part: number } | null = null;
  statuses: Partial<Record<StatusKind, number>> = {};
  statusPower: Partial<Record<StatusKind, number>> = {};
  buff: { element: string; time: number; bonus: number } | null = null;
  lastHitLanded = -999;
  lastHitWeaponSlot = 0;
  invuln = 0;
  flying = false;
  ceiling = false;
  climbing = false;
  kneel = 0;
  sprinting = false;
  moveMag = 0;
  footTimer = 0;
  surface = 'stone';
  hurtTimer = 0;
  counterTime = 0;
  reflected = new Set<number>();
  perfectDodged = new Set<number>();
  buffer: Buffered[] = [];
  /** No damage taken flag for challenges. */
  tookDamage = false;
  drank = false;
  usedMetamondo = false;
  weaponsUsed = new Set<string>();
  /** Shadow visibility (canon: none until the ending). */
  hasShadow = false;
  grabbedBy = -1;
  ballista = false;

  get scale(): number {
    return this.baseScale * this.formScale;
  }
  get alive(): boolean {
    return this.state !== 'dead';
  }
  get weaponId(): string | null {
    return this.weapons[this.activeSlot] ?? null;
  }
  get ecoSegments(): number {
    return Math.floor(this.eco / 100);
  }

  /** Target volume for boss hit tests (vertical capsule). */
  volume(out: TargetVol, sim: Sim): TargetVol {
    const s = this.scale;
    out.x = this.pos.x; out.y = this.pos.y; out.z = this.pos.z;
    out.r = sim.bal.player.radius * s;
    out.h = (this.state === 'knockdown' ? 0.7 : this.state === 'dodge' ? 1.2 : sim.bal.player.height) * s;
    return out;
  }

  setState(s: PlayerStateId, dur = 0): void {
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur;
  }

  weapon(sim: Sim): WeaponDef | null {
    const id = this.weaponId;
    return id ? sim.c.weapon(id) : null;
  }

  moveset(sim: Sim): MovesetDef | null {
    const w = this.weapon(sim);
    if (!w) return null;
    if (this.shapeShift) return sim.c.moveset(this.shapeShift.type);
    return sim.c.moveset(w.type);
  }

  swingFor(sim: Sim, kind: 'light' | 'heavy' | 'running' | 'jumping'): SwingDef | null {
    const w = this.weapon(sim);
    if (!w) return null;
    if (this.shapeShift) {
      const ms = sim.c.moveset(this.shapeShift.type);
      const key = Object.keys(ms.swings).find((k) => k.endsWith(kind === 'light' ? '_light' : `_${kind === 'running' ? 'run' : kind === 'jumping' ? 'jump' : 'heavy'}`));
      if (key) {
        const list = sim.c.swingList(key);
        return kind === 'light' ? list[this.comboIndex % list.length] : list[0];
      }
    }
    const list = sim.c.swingList(w.moveset[kind]);
    return kind === 'light' ? list[this.comboIndex % list.length] : list[0];
  }

  /* ---------------------------------------------------------------------------------------------------------------- */

  spend(sim: Sim, cost: number): void {
    if (sim.meta.active && sim.meta.ability === 'respiro_libero') return;
    this.fiato = Math.max(0, this.fiato - cost);
    this.fiatoIdle = 0;
  }

  gainEco(sim: Sim, amount: number): void {
    const mult = sim.meta.active ? sim.meta.ecoMult : 1;
    this.eco = clamp(this.eco + amount * mult, 0, sim.bal.eco.max);
  }

  isAttacking(): boolean {
    return ATTACK_STATES.includes(this.state);
  }

  /** i-frames currently active? */
  invulnerable(sim: Sim): boolean {
    if (this.invuln > 0) return true;
    if (this.state === 'grace' || this.state === 'locked' || this.state === 'dead') return true;
    if (this.state === 'dodge') return this.stateTime >= this.iframes[0] && this.stateTime <= this.iframes[1];
    if (this.state === 'knockdown') return this.stateTime >= 0.25;
    if (this.art?.invulnerable) return true;
    return false;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Update                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  update(sim: Sim, input: PlayerInput, dt: number): void {
    const B = sim.bal.player;
    this.prevPos.x = this.pos.x; this.prevPos.y = this.pos.y; this.prevPos.z = this.pos.z;
    this.prevYaw = this.yaw;
    this.stateTime += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboIndex = 0;
    }
    if (this.shapeShift) {
      this.shapeShift.time -= dt;
      if (this.shapeShift.time <= 0) this.shapeShift = null;
    }
    if (this.buff) {
      this.buff.time -= dt;
      if (this.buff.time <= 0) this.buff = null;
    }
    this.updateStatuses(sim, dt);

    // Fiato regeneration (only when not spending)
    this.fiatoIdle += dt;
    if (this.fiatoIdle >= B.fiato_regen_delay && !this.sprinting) this.fiato = Math.min(this.fiatoMax, this.fiato + B.fiato_regen * dt);

    // input buffering
    if (input.presses) {
      for (let bit = 1; bit <= Btn.Advance; bit <<= 1) if (input.presses & bit) this.buffer.push({ btn: bit, t: sim.time });
    }
    const window = sim.settings.inputBuffer;
    while (this.buffer.length && sim.time - this.buffer[0].t > window) this.buffer.shift();

    // lock-on management
    this.updateLock(sim, input);

    if (this.state === 'dead') {
      this.vel.x = 0; this.vel.z = 0;
      this.applyGravity(sim, dt);
      return;
    }

    if (sim.inputLocked || this.state === 'locked' || this.state === 'kneel') {
      this.buffer.length = 0;
      this.vel.x *= 0.8; this.vel.z *= 0.8;
      this.applyGravity(sim, dt);
      if (this.state === 'kneel') this.kneel = input.holdHeld ? this.kneel + dt : Math.max(0, this.kneel - dt * 2);
      return;
    }

    this.stepState(sim, input, dt);
    this.processBuffer(sim, input);
    this.applyMovement(sim, input, dt);
  }

  private updateStatuses(sim: Sim, dt: number): void {
    for (const k of Object.keys(this.statuses) as StatusKind[]) {
      const v = (this.statuses[k] ?? 0) - dt;
      if (v <= 0) {
        delete this.statuses[k];
        delete this.statusPower[k];
      } else this.statuses[k] = v;
    }
    const burn = this.statuses.burn ? 1.5 : 0;
    const poison = this.statuses.poison ? 1.2 : 0;
    const voidDot = this.statuses.void ? 1.8 : 0;
    const dot = (burn + poison + voidDot) * (this.statusPower.burn ?? this.statusPower.poison ?? this.statusPower.void ?? 1);
    if (dot > 0 && this.state !== 'dead' && !sim.debug.invincible) {
      this.hp = Math.max(1, this.hp - dot * dt);
      this.tookDamage = true;
    }
    // Patto di Sangue: lose 2% Health per second, never below 1 point
    if (sim.meta.active && sim.meta.ability === 'patto_di_sangue' && this.state !== 'dead') {
      const drain = Number(sim.meta.form?.ability.params.drain ?? 0.02) * this.hpMax * dt;
      this.hp = Math.max(1, this.hp - drain);
    }
  }

  private stepState(sim: Sim, input: PlayerInput, dt: number): void {
    const B = sim.bal.player;
    switch (this.state) {
      case 'light':
      case 'heavy':
      case 'running':
      case 'jumping':
      case 'transizione':
      case 'counter':
        this.updateSwing(sim, dt);
        break;
      case 'art':
        if (this.art) {
          const done = updateArt(sim, this, this.art, dt);
          if (done) {
            this.art = null;
            this.setState('idle');
          }
        } else this.setState('idle');
        break;
      case 'dodge': {
        const k = this.stateTime / this.dodgeDur;
        if (k >= 1) {
          this.setState(this.grounded ? 'idle' : 'jump');
        }
        break;
      }
      case 'guard':
        if (!input.guardHeld) this.setState('idle');
        break;
      case 'parry': {
        const win = B.parry_window + sim.settings.latencyComp;
        if (this.stateTime > win) {
          if (input.guardHeld) this.setState('guard');
          else if (this.stateTime > win + B.parry_recovery) this.setState('idle');
        }
        break;
      }
      case 'drink': {
        if (!this.drinkCommitted && this.stateTime >= B.drink_cancel) {
          this.drinkCommitted = true;
          this.lacrime--;
          this.hp = Math.min(this.hpMax, this.hp + this.hpMax * B.drink_heal);
          this.drank = true;
          sim.emit({ type: 'drink', healed: true, left: this.lacrime });
        }
        if (this.stateTime >= B.drink_time) this.setState('idle');
        break;
      }
      case 'swap':
        if (this.stateTime >= B.swap_time) {
          this.finishSwap(sim);
          this.setState('idle');
        }
        break;
      case 'stagger':
      case 'guardbreak':
        if (this.stateTime >= this.stateDur) this.setState('idle');
        break;
      case 'knockdown':
        if (this.stateTime >= this.stateDur) {
          this.invuln = 0.25;
          this.setState('idle');
        }
        break;
      case 'grace':
        this.updateGrace(sim, dt);
        break;
      case 'grabbed':
        if (this.stateTime >= this.stateDur && this.stateDur > 0) {
          this.grabbedBy = -1;
          this.setState('knockdown', B.knockdown_time * 0.6);
        }
        break;
      case 'interact':
        if (this.stateTime >= this.stateDur) this.setState('idle');
        break;
      case 'climb':
        break;
      case 'jump':
        if (this.grounded && this.stateTime > 0.05) this.setState('idle');
        break;
      default:
        break;
    }
    // guard hold from idle/move
    if ((this.state === 'idle' || this.state === 'move') && input.guardHeld && this.grounded) this.setState('guard');
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Buffered actions                                                                                                  */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private canAct(sim: Sim, btn: number): boolean {
    const s = this.state;
    const B = sim.bal.player;
    if (s === 'idle' || s === 'move' || s === 'guard') return true;
    if (s === 'jump') return btn === Btn.Light || btn === Btn.Heavy || btn === Btn.Slot1 || btn === Btn.Slot2 || btn === Btn.Slot3 || (this.flying && btn === Btn.Dodge) || btn === Btn.Metamondo || btn === Btn.Lock;
    if (s === 'parry') return this.stateTime > B.parry_window + sim.settings.latencyComp;
    if (s === 'dodge') return this.stateTime >= this.iframes[1] + 0.02 && btn !== Btn.Drink ? true : btn === Btn.Lock || btn === Btn.Metamondo;
    if (s === 'drink') return !this.drinkCommitted && (btn === Btn.Dodge || btn === Btn.Light || btn === Btn.Heavy || btn === Btn.Guard);
    if (s === 'light' || s === 'heavy' || s === 'running' || s === 'jumping' || s === 'transizione' || s === 'counter') {
      const sw = this.swing;
      if (!sw) return true;
      const d = sw.def;
      const endActive = d.startup + d.active;
      const isSlot = btn === Btn.Slot1 || btn === Btn.Slot2 || btn === Btn.Slot3;
      if (isSlot && sim.time - this.lastHitLanded <= B.transizione_window && sw.t >= d.startup) return true;
      if (btn === Btn.Dodge) return sw.t >= endActive;
      if (btn === Btn.Lock || btn === Btn.Metamondo) return true;
      const cancel = endActive + (d.cancel ?? d.recovery * 0.45);
      return sw.t >= cancel;
    }
    if (s === 'art') return btn === Btn.Lock || btn === Btn.Metamondo || (this.art?.cancelable ?? false);
    if (s === 'swap') return btn === Btn.Dodge || btn === Btn.Lock;
    return btn === Btn.Lock || btn === Btn.Metamondo;
  }

  private processBuffer(sim: Sim, input: PlayerInput): void {
    for (let i = 0; i < this.buffer.length; i++) {
      const b = this.buffer[i];
      // Advance and Interact are handled by the sim/sequence layer
      if (b.btn === Btn.Advance) {
        this.buffer.splice(i, 1);
        i--;
        continue;
      }
      if (!this.canAct(sim, b.btn)) continue;
      const consumed = this.tryAction(sim, b.btn, input);
      if (consumed) {
        this.buffer.splice(0, i + 1);
        return;
      }
    }
  }

  private tryAction(sim: Sim, btn: number, input: PlayerInput): boolean {
    const B = sim.bal.player;
    switch (btn) {
      case Btn.Lock:
        this.toggleLock(sim, input);
        return true;
      case Btn.Metamondo:
        return sim.meta.tryActivate(sim);
      case Btn.Interact:
        return sim.interact();
      case Btn.Dodge: {
        if (this.state === 'drink') {
          this.setState('idle');
        }
        if (this.fiato <= 0 && !(sim.meta.active && sim.meta.ability === 'respiro_libero')) return false;
        if (this.state === 'climb') {
          this.climbWall = null;
          this.grounded = false;
          this.setState('jump');
          return true;
        }
        if (!this.grounded && !this.flying) return false;
        this.startDodge(sim, input);
        return true;
      }
      case Btn.Light:
      case Btn.Heavy: {
        if (this.state === 'drink') this.setState('idle');
        const graceTarget = this.findGraceTarget(sim);
        if (graceTarget) {
          this.startGrace(sim, graceTarget.actor, graceTarget.part);
          return true;
        }
        if (this.fiato <= 0 && !(sim.meta.active && sim.meta.ability === 'respiro_libero')) return false;
        const airborne = !this.grounded && !this.flying;
        let kind: 'light' | 'heavy' | 'running' | 'jumping' = btn === Btn.Light ? 'light' : 'heavy';
        if (airborne) kind = 'jumping';
        else if (this.sprinting && btn === Btn.Light && this.state !== 'light') kind = 'running';
        if (kind === 'light' && this.state !== 'light') {
          if (this.comboTimer <= 0) this.comboIndex = 0;
        }
        const sw = this.swingFor(sim, kind);
        if (!sw) return false;
        this.startSwing(sim, kind, sw, input);
        return true;
      }
      case Btn.Guard: {
        if (this.state === 'drink') this.setState('idle');
        const w = this.weapon(sim);
        const parryable = !!w && w.parry_capable;
        if (parryable || sim.parryFinalPending()) {
          this.parryStart = sim.time;
          this.setState('parry');
          sim.emit({ type: 'cue', id: 'parry_attempt' });
        } else this.setState('guard');
        return true;
      }
      case Btn.Jump: {
        if (this.flying) {
          this.vy = 6;
          return true;
        }
        if (!this.grounded) return false;
        if (this.state !== 'idle' && this.state !== 'move' && this.state !== 'dodge') return false;
        const g = B.gravity;
        this.vy = Math.sqrt(2 * g * B.jump_height * Math.max(0.6, Math.sqrt(this.scale))) ;
        this.grounded = false;
        this.spend(sim, B.jump_cost);
        this.setState('jump');
        sim.emit({ type: 'jump' });
        return true;
      }
      case Btn.Drink: {
        if (sim.challenges.noLacrime) return true;
        if (this.lacrime <= 0) {
          sim.emit({ type: 'cue', id: 'vial_empty' });
          return true;
        }
        if (!this.grounded) return false;
        this.drinkCommitted = false;
        this.setState('drink', B.drink_time);
        sim.emit({ type: 'cue', id: 'drink_start' });
        return true;
      }
      case Btn.Slot1:
      case Btn.Slot2:
      case Btn.Slot3: {
        const slot = btn === Btn.Slot1 ? 0 : btn === Btn.Slot2 ? 1 : 2;
        if (slot === this.activeSlot || !this.weapons[slot]) return true;
        if (sim.challenges.singleWeapon) return true;
        const newW = sim.c.weapon(this.weapons[slot]!);
        if (newW.ng_plus_only && sim.ngCycle <= 0) return true;
        const oldW = this.weapon(sim);
        const recentHit = sim.time - this.lastHitLanded <= B.transizione_window;
        if (recentHit && oldW && (this.isAttacking() || this.state === 'idle' || this.state === 'move')) {
          const tr = sim.c.transition(oldW.category, newW.category);
          if (tr) {
            this.startTransizione(sim, tr, oldW, newW, slot, input);
            return true;
          }
        }
        this.swapTo = slot;
        this.setState('swap', B.swap_time);
        sim.emit({ type: 'cue', id: 'swap_start' });
        return true;
      }
      case Btn.ArtPrima:
      case Btn.ArtSeconda: {
        const w = this.weapon(sim);
        if (!w) return false;
        const which = btn === Btn.ArtPrima ? 'prima' : 'seconda';
        const def = w.arts[which];
        if (this.eco < def.eco_cost) {
          sim.emit({ type: 'cue', id: 'art_unavailable' });
          return true;
        }
        if (!this.grounded && !this.flying) return false;
        this.eco -= def.eco_cost;
        this.faceForAction(sim, input, true);
        this.art = startArt(sim, this, w, def, which);
        this.setState('art', this.art.dur);
        sim.emit({ type: 'art', weapon: w.id, art: def.id, effect: def.effect, which, vfx: def.vfx });
        return true;
      }
      default:
        return false;
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Movement                                                                                                          */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private speedFactor(sim: Sim): number {
    let f = this.baseSpeed;
    if (this.formScale > 1) f *= sim.bal.scale.gigante_speed;
    if (this.statuses.slow) f *= 1 - clamp(this.statusPower.slow ?? 0.4, 0, 0.7);
    return f;
  }

  private applyMovement(sim: Sim, input: PlayerInput, dt: number): void {
    const B = sim.bal.player;
    const mag = Math.min(1, Math.hypot(input.moveX, input.moveZ));
    this.moveMag = mag;
    let desiredSpeed = 0;
    let dirYaw = this.yaw;
    if (mag > 0.05) dirYaw = yawOf(input.moveX, input.moveZ);
    const sf = this.speedFactor(sim);
    const rooted = !!this.statuses.freeze || !!this.statuses.root || this.state === 'grabbed';
    this.sprinting = false;

    const s = this.state;
    if (s === 'dodge') {
      const k = clamp(this.stateTime / this.dodgeDur, 0, 1);
      // ease-out velocity profile integrating to dodgeDist
      const v = (this.dodgeDist / this.dodgeDur) * 2 * (1 - k);
      forward(this.dodgeDir, tmp);
      this.pos.x += tmp.x * v * dt;
      this.pos.z += tmp.z * v * dt;
      if (this.dodgeBack) this.yaw = turnToward(this.yaw, wrapAngle(this.dodgeDir + Math.PI), 20 * dt);
      else this.yaw = turnToward(this.yaw, this.dodgeDir, 30 * dt);
    } else if (this.isAttacking() || s === 'grace') {
      // lunge handled by swing/art
    } else if (rooted || s === 'stagger' || s === 'knockdown' || s === 'guardbreak' || s === 'interact' || s === 'grabbed') {
      // no movement
    } else if (s === 'climb') {
      this.updateClimb(sim, input, dt);
      return;
    } else {
      if (mag > 0.05) {
        if (s === 'guard' || s === 'parry' || s === 'drink' || s === 'swap') desiredSpeed = B.walk * (s === 'drink' ? 0.6 : 1);
        else if (input.sprint && (this.fiato > 0 || (sim.meta.active && sim.meta.ability === 'respiro_libero')) && mag > 0.5) {
          desiredSpeed = B.sprint;
          this.sprinting = true;
          this.spend(sim, B.sprint_cost * dt);
        } else if (mag > 0.55) desiredSpeed = B.run * Math.min(1, mag * 1.15);
        else desiredSpeed = B.walk * (mag / 0.55);
        desiredSpeed *= sf;
      }
      if (!this.grounded && !this.flying) desiredSpeed *= 1; // air control applied through acceleration
      // ice (Cocito, frozen arenas) makes footing slide: much lower acceleration on the ground
      const icy = this.grounded && !this.flying && sim.surfaceAt(this.pos.x, this.pos.z) === 'ice';
      const accel = this.grounded || this.flying ? (icy ? 3.2 : 22) : 22 * B.air_control;
      forward(dirYaw, tmp);
      const tvx = tmp.x * desiredSpeed, tvz = tmp.z * desiredSpeed;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (tvx - this.vel.x) * k;
      this.vel.z += (tvz - this.vel.z) * k;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      // facing: locked-on strafing faces the target unless sprinting
      const lockPos = this.lockPos(sim, tmp2);
      if (lockPos && !this.sprinting && s !== 'jump') {
        this.yaw = turnToward(this.yaw, yawTo(this.pos, lockPos), B.turn_rate * dt);
      } else if (mag > 0.05) {
        this.yaw = turnToward(this.yaw, dirYaw, B.turn_rate * dt);
      }
      if (s === 'idle' || s === 'move') this.state = mag > 0.05 ? 'move' : 'idle';
      if ((s === 'idle' || s === 'move') && this.grounded && mag > 0.5 && sim.zone?.def.climb?.length && !sim.fight) this.tryClimb(sim, dirYaw);
      // footsteps
      const spd = len2D(this.vel);
      if (this.grounded && spd > 0.5) {
        this.footTimer -= dt * spd / (1.4 * Math.max(0.3, this.scale));
        if (this.footTimer <= 0) {
          this.footTimer = 1;
          sim.emit({ type: 'footstep', surface: sim.surfaceAt(this.pos.x, this.pos.z), pos: { ...this.pos }, sprint: this.sprinting });
        }
      }
    }
    if (this.isAttacking() || s === 'dodge' || s === 'grace') {
      this.vel.x = (this.pos.x - this.prevPos.x) / Math.max(dt, 1e-6);
      this.vel.z = (this.pos.z - this.prevPos.z) / Math.max(dt, 1e-6);
    }

    if (this.flying) this.applyFlight(sim, input, dt);
    else this.applyGravity(sim, dt);
    sim.collidePlayer(this);
  }

  private applyFlight(sim: Sim, input: PlayerInput, dt: number): void {
    const ground = sim.groundAt(this.pos.x, this.pos.z);
    // auto-altitude toward the locked target's center, plus explicit fly input
    const lp = this.lockPos(sim, tmp2);
    let target = this.pos.y + input.fly * 6 * dt + this.vy * dt;
    if (lp && Math.abs(input.fly) < 0.1 && this.vy <= 0.01) target += (lp.y - 1 - this.pos.y) * Math.min(1, dt * 1.5);
    this.vy = Math.max(0, this.vy - 12 * dt);
    this.pos.y = clamp(target, ground + 0.2, ground + 40);
    this.grounded = this.pos.y <= ground + 0.25;
  }

  /** Marked climbable wall currently held: segment a->b on XZ, top height. */
  climbWall: { ax: number; az: number; bx: number; bz: number; top: number; nx: number; nz: number } | null = null;

  private tryClimb(sim: Sim, dirYaw: number): void {
    const walls = sim.zone?.def.climb ?? [];
    const fx = Math.sin(dirYaw), fz = Math.cos(dirYaw);
    for (const w of walls) {
      const ax = w.a[0], az = w.a[2], bx = w.b[0], bz = w.b[2];
      const vx = bx - ax, vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = clamp(((this.pos.x - ax) * vx + (this.pos.z - az) * vz) / l2, 0, 1);
      const qx = ax + vx * t, qz = az + vz * t;
      const dx = qx - this.pos.x, dz = qz - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.9 * Math.max(0.5, this.scale) || d < 1e-4) continue;
      if ((dx * fx + dz * fz) / d < 0.6) continue;
      if (this.pos.y >= w.top - 0.3) continue;
      this.climbWall = { ax, az, bx, bz, top: w.top, nx: -dx / d, nz: -dz / d };
      this.yaw = Math.atan2(dx, dz);
      this.vel.x = 0; this.vel.z = 0;
      this.setState('climb');
      return;
    }
  }

  private updateClimb(sim: Sim, input: PlayerInput, dt: number): void {
    const w = this.climbWall;
    if (!w) {
      this.setState('idle');
      return;
    }
    // stick forward (toward the wall) climbs, back descends
    const fwd = -(input.moveX * w.nx + input.moveZ * w.nz);
    const speed = 1.7 * Math.max(0.5, this.scale);
    this.pos.y += clamp(fwd, -1, 1) * speed * dt;
    const ground = sim.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground && fwd < 0) {
      this.pos.y = ground;
      this.climbWall = null;
      this.setState('idle');
      return;
    }
    if (this.pos.y >= w.top - 0.15) {
      // mantle over the top
      this.pos.x -= w.nx * 0.9 * Math.max(0.5, this.scale);
      this.pos.z -= w.nz * 0.9 * Math.max(0.5, this.scale);
      this.pos.y = Math.max(w.top, sim.groundAt(this.pos.x, this.pos.z));
      this.climbWall = null;
      this.grounded = true;
      this.setState('idle');
      sim.emit({ type: 'land', pos: { ...this.pos }, hard: false });
    }
  }

  applyGravity(sim: Sim, dt: number): void {
    const B = sim.bal.player;
    const ground = sim.groundAt(this.pos.x, this.pos.z);
    if (this.state === 'climb') return;
    if (this.grounded) {
      if (this.pos.y - ground > 0.6 * Math.max(0.5, this.scale)) {
        this.grounded = false;
        this.vy = 0;
      } else {
        this.pos.y = ground;
        this.vy = 0;
        return;
      }
    }
    this.vy -= B.gravity * Math.max(0.35, Math.sqrt(this.scale)) * dt;
    this.pos.y += this.vy * dt;
    this.airTime += dt;
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      const hard = this.vy < -12;
      this.vy = 0;
      this.grounded = true;
      this.airTime = 0;
      sim.emit({ type: 'land', pos: { ...this.pos }, hard });
      if (this.state === 'jumping' && this.swing) {
        // plunge lands: let the swing finish its recovery
      }
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Dodge                                                                                                             */
  /* ---------------------------------------------------------------------------------------------------------------- */

  startDodge(sim: Sim, input: PlayerInput): void {
    const B = sim.bal.player;
    const mag = Math.hypot(input.moveX, input.moveZ);
    this.cancelSwing();
    if (this.art) {
      this.art = null;
    }
    this.dodgeBack = mag < 0.2;
    this.dodgeDir = this.dodgeBack ? wrapAngle(this.yaw + Math.PI) : yawOf(input.moveX, input.moveZ);
    const sizeK = Math.max(0.25, this.scale) * this.baseSpeed / Math.max(0.25, this.baseScale);
    const giant = this.formScale > 1 ? 1.5 : 1;
    this.dodgeDist = (this.dodgeBack ? B.backstep_distance : B.dodge_distance) * sizeK * giant;
    if (this.baseScale < 0.5) this.dodgeDist = (this.dodgeBack ? B.backstep_distance : B.dodge_distance) * this.baseSpeed;
    this.dodgeDur = this.dodgeBack ? B.backstep_duration : B.dodge_duration;
    const ratio = this.dodgeDur / B.dodge_duration;
    this.iframes = [B.dodge_iframes[0] * ratio, B.dodge_iframes[1] * ratio];
    this.dodgeStart = sim.time;
    this.spend(sim, B.dodge_cost);
    this.setState('dodge', this.dodgeDur);
    sim.emit({ type: 'dodge', backstep: this.dodgeBack });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Attacks                                                                                                           */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Face the lock target, else the stick direction. */
  faceForAction(sim: Sim, input: PlayerInput, snap: boolean): void {
    const lp = this.lockPos(sim, tmp2);
    if (lp) this.yaw = yawTo(this.pos, lp);
    else if (Math.hypot(input.moveX, input.moveZ) > 0.2) this.yaw = yawOf(input.moveX, input.moveZ);
    else if (snap) {
      // soft auto-aim toward the nearest enemy in front (within 60 degrees, 1.3x reach)
      const t = sim.nearestEnemy(this.pos, 12 * Math.max(0.3, this.scale), this.yaw, 60 * DEG);
      if (t) this.yaw = yawTo(this.pos, t.pos);
    }
  }

  baseDamage(sim: Sim, w: WeaponDef | null): number {
    if (!w) return sim.bal.weapon.starter_damage;
    return weaponDamage(sim.bal, w);
  }

  /** Outgoing damage multiplier (Metamondo, buffs). */
  outgoingMult(sim: Sim): number {
    let m = 1;
    if (sim.meta.active) m *= sim.meta.damageMult;
    if (this.buff) m *= 1 + this.buff.bonus;
    return m;
  }

  startSwing(sim: Sim, kind: 'light' | 'heavy' | 'running' | 'jumping', sw: SwingDef, input: PlayerInput): void {
    const w = this.weapon(sim);
    const E = sim.bal.equilibrio;
    const cost = sw.stamina ?? (kind === 'heavy' || kind === 'jumping' ? w?.stamina_cost.heavy ?? 28 : w?.stamina_cost.light ?? 14);
    this.spend(sim, cost);
    this.faceForAction(sim, input, true);
    const poise = kind === 'heavy' ? E.heavy_hit : kind === 'jumping' ? E.jump_hit : kind === 'light' || kind === 'running' ? E.light_hit : sw.poise;
    const eco = kind === 'heavy' || kind === 'jumping' ? sim.bal.eco.heavy_hit : sim.bal.eco.light_hit;
    this.swing = {
      def: sw, kind, uid: swingUid++, t: 0, dur: sw.startup + sw.active + sw.recovery, hit: new Set(), tickHits: new Map(), fired: false,
      weapon: w, damage: this.baseDamage(sim, w) * sw.damage_mult, poise: Math.max(poise, sw.poise), eco, dir: this.yaw, landed: false,
      scaleMul: 1,
    };
    if (kind === 'light') {
      this.comboIndex++;
      this.comboTimer = 0.9 + sw.recovery;
    }
    if (w) this.weaponsUsed.add(w.id);
    this.setState(kind, this.swing.dur);
    sim.emit({ type: 'swing', weapon: w?.id ?? '', swing: sw.id, kind, anim: sw.anim });
    sim.mirrorClones(this.swing);
  }

  startTransizione(sim: Sim, tr: TransitionDef, oldW: WeaponDef, newW: WeaponDef, slot: number, input: PlayerInput): void {
    this.cancelSwing();
    this.activeSlot = slot;
    this.faceForAction(sim, input, true);
    const sw: SwingDef = {
      id: tr.id, anim: tr.anim, startup: tr.duration * 0.3, active: tr.duration * 0.3, recovery: tr.duration * 0.4, damage_mult: tr.damage_mult,
      poise: tr.poise, shape: tr.shape, move: tr.move, projectile: tr.projectile,
    };
    const dmg = ((this.baseDamage(sim, oldW) + this.baseDamage(sim, newW)) / 2) * tr.damage_mult;
    this.swing = {
      def: sw, kind: 'transizione', uid: swingUid++, t: 0, dur: tr.duration, hit: new Set(), tickHits: new Map(), fired: false, weapon: newW,
      damage: dmg, poise: sim.bal.equilibrio.transizione, eco: sim.bal.eco.transizione_hit, dir: this.yaw, landed: false, scaleMul: 1, transition: tr,
    };
    this.weaponsUsed.add(newW.id);
    this.setState('transizione', tr.duration);
    sim.emit({ type: 'transizione', from: oldW.category, to: newW.category, id: tr.id, anim: tr.anim });
    sim.emit({ type: 'weaponSwap', slot, weapon: newW.id });
    sim.mirrorClones(this.swing);
  }

  cancelSwing(): void {
    this.swing = null;
  }

  private updateSwing(sim: Sim, dt: number): void {
    const sw = this.swing;
    if (!sw) {
      this.setState('idle');
      return;
    }
    sw.t += dt;
    const d = sw.def;
    // lunge
    if (d.move && sw.t <= d.move.dur) {
      forward(this.yaw, tmp);
      const lp = this.lockPos(sim, tmp2);
      let sp = d.move.speed * Math.max(0.3, this.baseSpeed) * Math.max(0.6, Math.min(1.6, this.scale));
      if (lp) {
        const dd = dist2D(this.pos, lp) - sim.lockRadius(this);
        if (dd < 0.8) sp *= 0.15; // don't run through the boss
      }
      this.pos.x += tmp.x * sp * dt;
      this.pos.z += tmp.z * sp * dt;
    }
    // slight tracking during startup
    if (sw.t < d.startup) {
      const lp = this.lockPos(sim, tmp2);
      if (lp) this.yaw = turnToward(this.yaw, yawTo(this.pos, lp), 6 * dt);
    }
    // projectile
    if (d.projectile && !sw.fired && sw.t >= d.startup) {
      sw.fired = true;
      sim.firePlayerProjectile(this, sw, d.projectile);
    }
    // ali di luce: aerial golden shockwaves on swings
    if (this.flying && !sw.fired && sw.t >= d.startup && !d.projectile) {
      sw.fired = true;
      sim.firePlayerProjectile(this, sw, { kind: 'golden_wave', speed: 26, radius: 0.9, life: 1.2 });
    }
    // melee hits
    if (d.shape && sw.t >= d.startup && sw.t <= d.startup + d.active) {
      const hits = Math.max(1, d.hits ?? 1);
      const interval = d.active / hits;
      const shape = this.scale !== 1 || sw.scaleMul !== 1 ? scaleShape(d.shape, this.scale * sw.scaleMul * (this.formScale > 1 && (sw.kind === 'heavy' || sw.kind === 'jumping') ? 1.6 : 1)) : d.shape;
      sim.playerMeleeHits(this, sw, shape, interval, hits > 1);
    }
    if (sw.t >= sw.dur) {
      this.swing = null;
      this.setState(this.grounded || this.flying ? 'idle' : 'jump');
      if (this.state === 'idle' && this.swapTo >= 0) this.swapTo = -1;
    }
  }

  /** Called by the sim when a player attack connects. */
  onHitLanded(sim: Sim, sw: SwingRuntime | null): void {
    this.lastHitLanded = sim.time;
    if (sw) sw.landed = true;
  }

  private finishSwap(sim: Sim): void {
    if (this.swapTo >= 0 && this.weapons[this.swapTo]) {
      this.activeSlot = this.swapTo;
      const w = this.weaponId;
      if (w) this.weaponsUsed.add(w);
      sim.emit({ type: 'weaponSwap', slot: this.activeSlot, weapon: w });
    }
    this.swapTo = -1;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Colpo di Grazia                                                                                                   */
  /* ---------------------------------------------------------------------------------------------------------------- */

  graceTarget: { actor: number; part: number; hitDone: boolean; coop: boolean } | null = null;

  findGraceTarget(sim: Sim): { actor: Actor; part: PartRuntime | null } | null {
    const range = sim.bal.equilibrio.grace_range;
    let best: { actor: Actor; part: PartRuntime | null } | null = null;
    let bestD = Infinity;
    for (const a of sim.actors) {
      if (a.team !== 'enemy' || !a.alive || a.untargetable) continue;
      const reach = range * Math.max(0.6, this.scale) + a.radius * a.scale;
      if (a.state === 'spezzato' && !a.graced) {
        const d = dist2D(this.pos, a.pos);
        if (d <= reach && d < bestD) {
          best = { actor: a, part: null };
          bestD = d;
        }
      }
      for (const p of a.parts) {
        if (p.spezzato <= 0 || p.graced || !p.active || p.broken) continue;
        const d = Math.hypot(this.pos.x - p.center.x, this.pos.z - p.center.z);
        if (d <= range * Math.max(0.6, this.scale) + 3 && d < bestD) {
          best = { actor: a, part: p };
          bestD = d;
        }
      }
    }
    return best;
  }

  startGrace(sim: Sim, a: Actor, part: PartRuntime | null): void {
    this.cancelSwing();
    this.graceTarget = { actor: a.id, part: part ? part.index : -1, hitDone: false, coop: sim.coopGrace };
    if (part) part.graced = true;
    else a.graced = true;
    const tp = part ? part.center : a.pos;
    this.yaw = yawTo(this.pos, tp);
    this.setState('grace', sim.bal.equilibrio.grace_time);
    sim.emit({ type: 'grace', actor: a.id, pos: { ...tp }, coop: sim.coopGrace });
    sim.emit({ type: 'haptic', pattern: 'grace' });
    a.behavior?.onGraceStrike?.(a, sim, part);
  }

  private updateGrace(sim: Sim, dt: number): void {
    const g = this.graceTarget;
    const T = sim.bal.equilibrio.grace_time;
    if (g && !g.hitDone && this.stateTime >= T * 0.56) {
      g.hitDone = true;
      const a = sim.actorById(g.actor);
      if (a) {
        const w = this.weapon(sim);
        const amount = this.baseDamage(sim, w) * sim.bal.equilibrio.grace_mult * this.outgoingMult(sim);
        sim.applyGraceDamage(this, a, g.part, amount);
      }
    }
    if (this.stateTime >= T) {
      this.graceTarget = null;
      this.setState('idle');
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Lock-on                                                                                                           */
  /* ---------------------------------------------------------------------------------------------------------------- */

  lockPos(sim: Sim, out: Vec3): Vec3 | null {
    if (!this.lock) return null;
    return sim.lockPointPos(this.lock.actor, this.lock.part, out);
  }

  private updateLock(sim: Sim, input: PlayerInput): void {
    if (input.lockPick) {
      const a = sim.actorById(input.lockPick.actor);
      if (a && a.alive && !a.untargetable) this.lock = { ...input.lockPick };
    }
    if (this.lock) {
      const a = sim.actorById(this.lock.actor);
      const p = this.lock.part >= 0 ? a?.parts[this.lock.part] : null;
      if (!a || !a.alive || a.untargetable || a.hidden || (p && (!p.active || p.broken))) {
        // fall back to the body if the part died, else drop the lock
        if (a && a.alive && !a.untargetable && !a.hidden && p) this.lock = { actor: a.id, part: -1 };
        else this.lock = sim.autoRelock(this);
      } else if (dist2D(this.pos, a.pos) > 70 * Math.max(1, a.scale)) this.lock = null;
    }
    if (input.lockSwitch !== 0 && this.lock) this.lock = sim.switchLock(this, input.lockSwitch, input.camYaw) ?? this.lock;
  }

  toggleLock(sim: Sim, input: PlayerInput): void {
    if (this.lock) {
      this.lock = null;
      return;
    }
    this.lock = sim.pickLock(this, input.camYaw);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Receiving hits                                                                                                    */
  /* ---------------------------------------------------------------------------------------------------------------- */

  hitReaction(sim: Sim, poise: number, knockdown: boolean, fromYaw: number, push: number): void {
    const B = sim.bal.player;
    this.cancelSwing();
    this.art = null;
    if (this.state === 'drink' && !this.drinkCommitted) this.drinkCommitted = false;
    if (this.state === 'swap') this.swapTo = -1;
    if (knockdown || poise >= 25) {
      this.setState('knockdown', B.knockdown_time);
    } else {
      this.setState('stagger', B.flinch_time);
    }
    // push away from attacker
    forward(fromYaw, tmp);
    this.pos.x += tmp.x * push;
    this.pos.z += tmp.z * push;
  }

  /** Reach of the current weapon's light swing (bot and aim assist). */
  reach(sim: Sim): number {
    const ms = this.moveset(sim);
    if (!ms) return 2;
    const sw = this.swingFor(sim, 'light');
    if (sw?.shape) return shapeReach(sw.shape) * this.scale;
    return ms.reach * this.scale;
  }
}
