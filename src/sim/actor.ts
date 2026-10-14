/**
 * Actor = boss, minion, decoy, clone, ally or echo. BossBase logic lives here: Health, Equilibrio, phases,
 * weighted pattern selection with constraints, attack timelines (telegraph / active / recovery), motions and spawns.
 */
import {
  DEG, angleDiff, clamp, dist2D, forward, localToWorld, turnToward, v3, wrapAngle, yawTo, type Vec3,
} from '../core/math';
import type { AttackDef, BossDef, HitFlag, MinionDef, PartDef, PhaseDef, SpawnDef, TodVariantDef } from '../core/types';
import { bossHitDamage } from '../core/formulas';
import type { BossBehavior } from './behavior';
import { shapeHits, type TargetVol } from './shapes';
import type { ActorKind, ActorStateId, AnimStage, DamageEvent, Team } from './types';
import type { Sim } from './sim';

export interface PartRuntime {
  index: number;
  def: PartDef;
  id: string;
  active: boolean;
  broken: boolean;
  hp: number;
  hpMax: number;
  poise: number;
  poiseMax: number;
  poiseIdle: number;
  spezzato: number;
  /** A Colpo di Grazia was already delivered during the current Spezzato. */
  graced: boolean;
  regrowTimer: number;
  /** Local anchor offset added to all hurt spheres (behaviors animate moving heads through this). */
  anchor: Vec3;
  /** World-space hurt spheres (recomputed every tick). */
  world: { x: number; y: number; z: number; r: number }[];
  /** World-space anchor (center of first sphere). */
  center: Vec3;
  highlight: boolean;
}

export interface HitInstanceState {
  hitTargets: Set<number>;
  lastTick: Map<number, number>;
  dodged: Set<number>;
}

export interface AttackRuntime {
  def: AttackDef;
  uid: number;
  time: number;
  stage: 'telegraph' | 'active' | 'recovery';
  activeTime: number;
  rate: number;
  windows: HitInstanceState[];
  spawnsDone: number[];
  motionStart: Map<number, { from: Vec3; to: Vec3; started: boolean }>;
  target: Vec3;
  targetId: number;
  announced: boolean;
  willHitSent: boolean;
  activeSent: boolean;
  startYaw: number;
}

let actorIds = 1;
let attackUids = 1;
export function resetActorIds(): void {
  actorIds = 1;
  attackUids = 1;
}
export function nextAttackUid(): number {
  return attackUids++;
}

const tmp = v3();
const tmp2 = v3();
const contact = v3();

export class Actor {
  readonly id: number;
  readonly defId: string;
  readonly kind: ActorKind;
  team: Team;
  def: BossDef | MinionDef;
  isMain: boolean;
  bossDef: BossDef | null;

  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3 = v3();
  yaw = 0;
  prevYaw = 0;
  radius: number;
  height: number;
  scale = 1;
  mass: 'light' | 'heavy' | 'immovable';

  hp: number;
  hpMax: number;
  poise = 0;
  poiseMax: number;
  poiseIdle = 0;
  /** A Colpo di Grazia was already delivered during the current Spezzato. */
  graced = false;

  state: ActorStateId = 'idle';
  stateTime = 0;
  stateDur = 0;
  attack: AttackRuntime | null = null;
  attacks: AttackDef[];
  attackMap = new Map<string, AttackDef>();
  phaseIndex = 0;
  phases: PhaseDef[];
  pendingPhase = -1;
  cooldowns = new Map<string, number>();
  history: string[] = [];
  idleTimer = 1.0;
  approachTime = 0;
  strafeDir = 1;
  strafeTimer = 0;
  targetId = -1;
  speedMult = 1;
  aggression = 1;
  tod: TodVariantDef = {};
  flags = new Set<string>();
  parts: PartRuntime[] = [];
  invulnerable = false;
  untargetable = false;
  hidden = false;
  noCollide = false;
  airborne = false;
  hoverHeight = 0;
  /** Behavior-private state (plain data). */
  bstate: Record<string, any> = {};
  behavior: BossBehavior | null;
  lifetime = -1;
  ownerId = -1;
  /** Shared-damage link to the main boss for minions. */
  mainShare = 0;

  // status
  bound = 0;
  slowed = 0;
  slowPower = 0;
  dots: { dps: number; time: number; element: string }[] = [];

  // animation exposure for the renderer
  anim = 'idle';
  animStage: AnimStage = 'idle';
  animTime = 0;
  animDur = 1;
  moveSpeedNow = 0;
  /** Seconds of red flash left (Colpo Rosso telegraph). */
  redFlash = 0;
  dying = 0;
  defeatedHandled = false;
  hitFlash = 0;

  constructor(kind: ActorKind, def: BossDef | MinionDef, pos: Vec3, team: Team, behavior: BossBehavior | null, hpMax: number, isMain: boolean) {
    this.id = actorIds++;
    this.kind = kind;
    this.def = def;
    this.defId = def.id;
    this.team = team;
    this.isMain = isMain;
    this.bossDef = 'order' in def ? def : null;
    this.pos = { ...pos };
    this.prevPos = { ...pos };
    this.radius = def.body.radius;
    this.height = def.body.height;
    this.mass = ('mass' in def.body ? def.body.mass : undefined) ?? (isMain ? 'heavy' : 'light');
    this.hp = hpMax;
    this.hpMax = hpMax;
    this.poiseMax = 'equilibrio_max' in def ? def.equilibrio_max : (def.equilibrio ?? 60);
    this.attacks = def.attacks;
    for (const a of def.attacks) this.attackMap.set(a.id, a);
    this.phases = 'phases' in def ? def.phases : [{ id: 'p1', hp_range: [1, 0], patterns: def.attacks.map((a) => a.id) }];
    this.behavior = behavior;
    this.hoverHeight = def.move.hover_height ?? 0;
    this.airborne = !!def.move.flying;
    const parts = 'parts' in def ? def.parts ?? [] : [];
    parts.forEach((p, i) => {
      const hpMaxP = p.hp ? Math.max(1, p.hp * hpMax) : 0;
      this.parts.push({
        index: i, def: p, id: p.id, active: p.active ?? true, broken: false, hp: hpMaxP, hpMax: hpMaxP,
        poise: 0, poiseMax: p.equilibrio ?? 0, poiseIdle: 0, spezzato: 0, graced: false, regrowTimer: 0,
        anchor: v3(), world: p.hurt.map(() => ({ x: 0, y: 0, z: 0, r: 0 })), center: v3(), highlight: false,
      });
    });
  }

  get boss(): BossDef {
    return this.def as BossDef;
  }
  get alive(): boolean {
    return this.state !== 'dead' && this.hp > 0;
  }
  get hpFrac(): number {
    return this.hpMax > 0 ? this.hp / this.hpMax : 0;
  }
  get phase(): PhaseDef {
    return this.phases[Math.min(this.phaseIndex, this.phases.length - 1)];
  }
  part(id: string): PartRuntime | undefined {
    return this.parts.find((p) => p.id === id);
  }

  setState(s: ActorStateId, dur = 0): void {
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur;
  }

  /** Main body hurt spheres in world space (def.hurtboxes or a default stack along the body). */
  bodyHurt(out: { x: number; y: number; z: number; r: number }[]): number {
    const hb = 'hurtboxes' in this.def && this.def.hurtboxes ? this.def.hurtboxes : 'hurt' in this.def && this.def.hurt ? this.def.hurt : null;
    let n = 0;
    if (hb && hb.length) {
      for (const h of hb) {
        localToWorld(this.pos, this.yaw, h.c[0], h.c[1], h.c[2], tmp, this.scale);
        const o = out[n] ?? (out[n] = { x: 0, y: 0, z: 0, r: 0 });
        o.x = tmp.x; o.y = tmp.y; o.z = tmp.z; o.r = h.r * this.scale;
        n++;
      }
    } else {
      const r = this.radius * this.scale;
      const h = this.height * this.scale;
      const count = Math.max(1, Math.ceil(h / (r * 1.6)));
      for (let i = 0; i < count; i++) {
        const o = out[n] ?? (out[n] = { x: 0, y: 0, z: 0, r: 0 });
        o.x = this.pos.x; o.z = this.pos.z; o.y = this.pos.y + r + ((h - 2 * r) * i) / Math.max(1, count - 1);
        o.r = r;
        n++;
      }
    }
    return n;
  }

  updatePartsWorld(): void {
    for (const p of this.parts) {
      p.def.hurt.forEach((h, i) => {
        localToWorld(this.pos, this.yaw, h.c[0] + p.anchor.x, h.c[1] + p.anchor.y, h.c[2] + p.anchor.z, tmp, this.scale);
        const w = p.world[i];
        w.x = tmp.x; w.y = tmp.y; w.z = tmp.z; w.r = h.r * this.scale;
      });
      if (p.world.length) {
        p.center.x = p.world[0].x; p.center.y = p.world[0].y; p.center.z = p.world[0].z;
      }
    }
  }

  /** World position of a part anchor (or the chest when no part). */
  anchorWorld(partId: string | undefined, out: Vec3): Vec3 {
    if (partId) {
      const p = this.part(partId);
      if (p && p.world.length) {
        out.x = p.center.x; out.y = p.center.y; out.z = p.center.z;
        return out;
      }
    }
    out.x = this.pos.x; out.y = this.pos.y + this.height * this.scale * 0.6; out.z = this.pos.z;
    return out;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* AI                                                                                                                */
  /* ---------------------------------------------------------------------------------------------------------------- */

  rate(sim: Sim): number {
    let r = (this.phase.speed_mult ?? 1) * (this.tod.speed_mult ?? 1) * this.speedMult;
    if (sim.meta.active && sim.meta.ability === 'tempo_stellare' && this.team === 'enemy') r *= Number(sim.meta.form?.ability.params.boss_speed ?? 0.6);
    if (this.slowed > 0) r *= 1 - clamp(this.slowPower, 0, 0.6);
    if (sim.ngCycle > 0 && this.bossDef?.ng_plus?.speed_mult) r *= this.bossDef.ng_plus.speed_mult;
    return r;
  }

  update(sim: Sim, dt: number): void {
    this.prevPos.x = this.pos.x; this.prevPos.y = this.pos.y; this.prevPos.z = this.pos.z;
    this.prevYaw = this.yaw;
    this.stateTime += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.redFlash = Math.max(0, this.redFlash - dt);
    if (this.lifetime > 0) {
      this.lifetime -= dt;
      if (this.lifetime <= 0) {
        this.hp = 0;
        this.setState('dead');
        this.dying = 0.01;
      }
    }

    // statuses
    if (this.bound > 0) this.bound -= dt;
    if (this.slowed > 0) this.slowed -= dt;
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.time -= dt;
      if (this.alive && !this.invulnerable) {
        this.hp = Math.max(this.canDie(sim) ? 0 : 1, this.hp - d.dps * dt);
        if (this.mainShare > 0 && sim.boss && sim.boss !== this) sim.boss.hp = Math.max(1, sim.boss.hp - d.dps * dt * this.mainShare);
      }
      if (d.time <= 0) this.dots.splice(i, 1);
    }

    // Equilibrio decay
    this.poiseIdle += dt;
    if (this.state !== 'spezzato' && this.poiseIdle > sim.bal.equilibrio.decay_delay) this.poise = Math.max(0, this.poise - sim.bal.equilibrio.decay * dt);
    for (const p of this.parts) {
      p.poiseIdle += dt;
      if (p.spezzato > 0) {
        p.spezzato -= dt;
        if (p.spezzato <= 0) p.poise = 0;
      } else if (p.poiseIdle > sim.bal.equilibrio.decay_delay) p.poise = Math.max(0, p.poise - sim.bal.equilibrio.decay * dt);
      if (p.broken && p.def.regrow && p.regrowTimer > 0) {
        p.regrowTimer -= dt;
        if (p.regrowTimer <= 0 && !(sim.meta.active && sim.meta.noBossHeal)) {
          p.broken = false;
          p.active = true;
          p.hp = p.hpMax;
          p.poise = 0;
          sim.emit({ type: 'partRegrown', actor: this.id, part: p.id });
        } else if (p.regrowTimer <= 0) p.regrowTimer = 1;
      }
    }

    for (const [k, v] of this.cooldowns) if (v > 0) this.cooldowns.set(k, v - dt);

    const handled = this.behavior?.update?.(this, sim, dt) === true;
    if (!handled) this.think(sim, dt);

    if (this.state === 'dead') {
      this.dying += dt;
    }
    this.updatePartsWorld();
  }

  private think(sim: Sim, dt: number): void {
    const target = sim.targetPos(this);
    switch (this.state) {
      case 'intro':
      case 'scripted':
      case 'hidden':
        this.animStage = this.state;
        this.animTime = this.stateTime;
        return;
      case 'dead':
        this.anim = 'death';
        this.animStage = 'dead';
        this.animTime = this.stateTime;
        return;
      case 'transition':
        this.anim = 'roar';
        this.animStage = 'transition';
        this.animTime = this.stateTime;
        this.animDur = this.stateDur;
        this.faceTarget(target, dt, 0.5);
        if (this.stateTime >= this.stateDur) {
          this.invulnerable = false;
          this.setState('idle');
          const op = this.phase.opener;
          if (op && this.attackMap.has(op)) this.startAttack(sim, this.attackMap.get(op)!);
          else this.idleTimer = 0.4;
        }
        return;
      case 'stagger':
        this.anim = 'stagger';
        this.animStage = 'stagger';
        this.animTime = this.stateTime;
        this.animDur = this.stateDur;
        if (this.stateTime >= this.stateDur) {
          this.setState('idle');
          this.idleTimer = 0.3;
        }
        return;
      case 'spezzato':
        this.anim = 'spezzato';
        this.animStage = 'spezzato';
        this.animTime = this.stateTime;
        this.animDur = this.stateDur;
        if (this.stateTime >= this.stateDur) {
          this.poise = 0;
          this.setState('idle');
          this.idleTimer = 0.6;
          if (this.pendingPhase >= 0) this.enterPhase(sim, this.pendingPhase);
        }
        return;
      case 'attack':
        this.updateAttack(sim, dt);
        return;
      case 'idle':
      case 'move':
      default:
        this.locomotion(sim, dt, target);
        this.idleTimer -= dt * (this.aggression * (this.tod.aggression ?? 1) * (this.phase.aggression ?? 1));
        if (this.idleTimer <= 0 && this.bound <= 0 && !sim.fightPaused) {
          const atk = this.chooseAttack(sim, target);
          if (atk) this.startAttack(sim, atk);
          else this.idleTimer = 0.25;
        }
    }
  }

  faceTarget(target: Vec3, dt: number, mult: number): void {
    if (this.bound > 0) return;
    const desired = yawTo(this.pos, target);
    this.yaw = turnToward(this.yaw, desired, this.def.move.turn * mult * dt);
  }

  private locomotion(sim: Sim, dt: number, target: Vec3): void {
    if (this.behavior?.movement?.(this, sim, dt)) return;
    const d = dist2D(this.pos, target);
    const [pmin, pmax] = this.def.move.preferred_range;
    const r = this.rate(sim);
    let speed = 0;
    let dirYaw = yawTo(this.pos, target);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir = sim.rng.chance(0.5) ? 1 : -1;
      this.strafeTimer = sim.rng.range(1.6, 3.4);
    }
    if (this.bound > 0) speed = 0;
    else if (d > pmax + 0.5) {
      speed = d > pmax + 7 ? this.def.move.run : this.def.move.walk;
      this.approachTime += dt;
    } else if (d < pmin) {
      speed = -this.def.move.walk * 0.8;
      this.approachTime = 0;
    } else {
      speed = this.def.move.walk * 0.55;
      dirYaw += this.strafeDir * Math.PI / 2;
      this.approachTime = 0;
    }
    speed *= r;
    forward(dirYaw, tmp);
    const mv = speed;
    this.pos.x += tmp.x * mv * dt;
    this.pos.z += tmp.z * mv * dt;
    this.moveSpeedNow = Math.abs(mv);
    this.faceTarget(target, dt, 1);
    this.state = Math.abs(mv) > 0.05 ? 'move' : 'idle';
    this.anim = Math.abs(mv) > this.def.move.walk * 1.2 ? 'run' : Math.abs(mv) > 0.05 ? 'walk' : 'idle';
    this.animStage = this.state === 'move' ? 'move' : 'idle';
    this.animTime += dt;
    this.updateHover(sim, dt);
  }

  updateHover(sim: Sim, dt: number): void {
    const ground = sim.groundAt(this.pos.x, this.pos.z);
    if (this.def.move.flying && this.hoverHeight > 0) {
      const desired = ground + this.hoverHeight;
      this.pos.y += (desired - this.pos.y) * Math.min(1, dt * 2.5);
      this.airborne = true;
    } else if (!this.airborne) {
      this.pos.y = ground;
    } else {
      // falling back to ground
      this.pos.y = Math.max(ground, this.pos.y - 9 * dt);
      if (this.pos.y <= ground + 0.01) this.airborne = false;
    }
  }

  /** Candidate attacks for the current phase (+ New Game+ additions), filtered by availability. */
  availableAttacks(sim: Sim): AttackDef[] {
    const ids = [...this.phase.patterns];
    const ng = this.bossDef?.ng_plus?.add_patterns?.[this.phase.id];
    if (sim.ngCycle > 0 && ng) ids.push(...ng);
    const out: AttackDef[] = [];
    for (const id of ids) {
      const a = this.attackMap.get(id);
      if (!a) continue;
      if ((this.cooldowns.get(id) ?? 0) > 0) continue;
      if (this.history.length >= 2 && this.history[this.history.length - 1] === id && this.history[this.history.length - 2] === id) continue;
      if (a.part) {
        const p = this.part(a.part);
        if (!p || !p.active || p.broken || p.spezzato > 0) continue;
      }
      if (this.behavior?.canUseAttack && !this.behavior.canUseAttack(this, sim, a)) continue;
      if (sim.meta.active && sim.meta.noBossHeal && a.spawns?.some((s) => s.type === 'minion')) continue;
      out.push(a);
    }
    return out;
  }

  chooseAttack(sim: Sim, target: Vec3): AttackDef | null {
    const cands = this.availableAttacks(sim);
    if (this.behavior?.selectAttack) {
      const r = this.behavior.selectAttack(this, sim, cands);
      if (r !== undefined) return r;
    }
    if (!cands.length) return null;
    const d = dist2D(this.pos, target) - (this.radius * this.scale);
    let pool = cands.filter((a) => a.global || !a.range || (d >= a.range[0] - 0.5 && d <= a.range[1] + 0.5));
    if (!pool.length) {
      if (this.approachTime < 2.2) return null;
      pool = cands.filter((a) => a.global || a.motion?.some((m) => ['leap_to_target', 'toward_target', 'charge_through', 'teleport_behind', 'dive_to_target', 'teleport_random', 'teleport_far'].includes(m.type)) || a.spawns?.some((s) => s.type === 'projectile' || s.type === 'hazard'));
      if (!pool.length) pool = cands;
    }
    const weights = pool.map((a) => (a.weight ?? 1) * (this.tod.weights?.[a.id] ?? 1));
    const i = sim.rng.weighted(weights);
    return i >= 0 ? pool[i] : null;
  }

  startAttack(sim: Sim, def: AttackDef): void {
    const tgt = sim.targetOf(this);
    this.targetId = tgt.id;
    this.attack = {
      def,
      uid: nextAttackUid(),
      time: 0,
      stage: 'telegraph',
      activeTime: -def.telegraph,
      rate: this.rate(sim),
      windows: (def.hits ?? []).map(() => ({ hitTargets: new Set(), lastTick: new Map(), dodged: new Set() })),
      spawnsDone: (def.spawns ?? []).map(() => 0),
      motionStart: new Map(),
      target: { ...tgt.pos },
      targetId: tgt.id,
      announced: false,
      willHitSent: false,
      activeSent: false,
      startYaw: this.yaw,
    };
    this.approachTime = 0;
    this.setState('attack');
    this.history.push(def.id);
    if (this.history.length > 6) this.history.shift();
    if (def.cooldown) this.cooldowns.set(def.id, def.cooldown);
    this.anim = def.anim ?? def.id;
    this.behavior?.onAttackStart?.(this, sim, this.attack);
    const red = def.flags.includes('red');
    sim.emit({ type: 'attackTelegraph', actor: this.id, attack: def.id, red, duration: def.telegraph / this.attack.rate });
    if (red) {
      this.redFlash = Math.min(0.6, def.telegraph / this.attack.rate);
      sim.emit({ type: 'haptic', pattern: 'redWarning' });
    }
  }

  cancelAttack(sim: Sim): void {
    if (this.attack) this.behavior?.onAttackEnd?.(this, sim, this.attack);
    this.attack = null;
  }

  private updateAttack(sim: Sim, dt: number): void {
    const atk = this.attack;
    if (!atk) {
      this.setState('idle');
      return;
    }
    const def = atk.def;
    const step = dt * atk.rate;
    atk.time += step;
    atk.activeTime = atk.time - def.telegraph;
    const tgtPos = sim.actorTargetPos(atk.targetId, atk.target);
    // keep a live snapshot for tracking; motions snapshot at their own start
    if (atk.time < def.telegraph) {
      atk.stage = 'telegraph';
      this.faceTarget(tgtPos, dt, def.track ?? 1);
      atk.target.x = tgtPos.x; atk.target.y = tgtPos.y; atk.target.z = tgtPos.z;
    } else if (atk.time < def.telegraph + def.active) {
      if (atk.stage === 'telegraph') {
        atk.stage = 'active';
      }
      if (def.track_active) this.faceTarget(tgtPos, dt, def.track_active);
    } else {
      atk.stage = 'recovery';
    }
    if (!atk.willHitSent && atk.time >= def.telegraph - 0.0001) {
      atk.willHitSent = true;
      const first = (def.hits ?? []).reduce((m, h) => Math.min(m, h.t), Infinity);
      sim.emit({ type: 'attackWillHit', actor: this.id, attack: def.id, timeToImpact: Number.isFinite(first) ? first / atk.rate : 0, red: def.flags.includes('red') });
    }
    if (!atk.activeSent && atk.stage === 'active') {
      atk.activeSent = true;
      sim.emit({ type: 'attackActive', actor: this.id, attack: def.id });
    }

    // animation exposure
    this.anim = def.anim ?? def.id;
    this.animStage = atk.stage;
    if (atk.stage === 'telegraph') {
      this.animTime = atk.time;
      this.animDur = def.telegraph;
    } else if (atk.stage === 'active') {
      this.animTime = atk.activeTime;
      this.animDur = def.active;
    } else {
      this.animTime = atk.activeTime - def.active;
      this.animDur = def.recovery;
    }

    // motions
    this.moveSpeedNow = 0;
    def.motion?.forEach((m, i) => this.runMotion(sim, atk, i, m, step, dt));
    if (!def.motion?.some((m) => m.type === 'rise' || m.type === 'hover' || m.type === 'leap_to_target' || m.type === 'dive_to_target') || !def.motion) this.updateHover(sim, dt);

    // spawns
    def.spawns?.forEach((s, i) => {
      const reps = Math.max(1, s.repeat ?? 1);
      while (atk.spawnsDone[i] < reps && atk.activeTime >= s.t + (s.interval ?? 0) * atk.spawnsDone[i]) {
        atk.spawnsDone[i]++;
        sim.bossSpawn(this, atk, s);
      }
    });

    // hit windows
    def.hits?.forEach((h, wi) => {
      if (atk.activeTime < h.t || atk.activeTime > h.t + h.dur) return;
      if (h.part) {
        const p = this.part(h.part);
        if (!p || !p.active || p.broken) return;
      }
      const progress = (atk.activeTime - h.t) / Math.max(1e-3, h.dur);
      const origin = h.part ? this.partOrigin(h.part, tmp2) : this.pos;
      sim.forEachTargetOf(this, (tid, vol) => {
        const st = atk.windows[wi];
        if (h.tick) {
          const last = st.lastTick.get(tid) ?? -999;
          if (atk.activeTime - last < h.tick) return;
        } else if (st.hitTargets.has(tid) || st.dodged.has(tid)) return;
        if (!shapeHits(h.shape, origin, this.yaw, this.scale, progress, vol, contact)) return;
        const mult = h.damage_mult ?? def.damage_mult;
        const flags: HitFlag[] = h.flags ? [...def.flags, ...h.flags] : def.flags;
        const dmg: DamageEvent = {
          source: this.id, target: tid, amount: this.hitDamage(sim, mult), poise: def.poise, element: h.element ?? def.element ?? 'physical',
          flags, pos: { ...contact }, instance: atk.uid * 64 + wi, part: -1, status: h.status, mult,
        };
        const res = sim.damageTarget(this, dmg);
        if (h.tick) st.lastTick.set(tid, atk.activeTime);
        if (res === 'dodged') st.dodged.add(tid);
        else if (res !== 'miss') st.hitTargets.add(tid);
      });
    });

    if (atk.time >= def.telegraph + def.active + def.recovery) {
      this.behavior?.onAttackEnd?.(this, sim, atk);
      this.attack = null;
      if (this.state !== 'attack') return; // behavior changed state
      if (def.combo_next && this.attackMap.has(def.combo_next) && sim.rng.chance(def.combo_chance ?? 1)) {
        this.startAttack(sim, this.attackMap.get(def.combo_next)!);
        return;
      }
      this.setState('idle');
      const [g0, g1] = this.def.idle_gap;
      const idleMult = sim.ngCycle > 0 ? this.bossDef?.ng_plus?.idle_mult ?? 0.85 : 1;
      this.idleTimer = sim.rng.range(g0, g1) * idleMult;
    }
  }

  partOrigin(partId: string, out: Vec3): Vec3 {
    const p = this.part(partId);
    if (!p) return this.pos;
    // part-local shapes are relative to the part anchor at ground height of the root
    localToWorld(this.pos, this.yaw, p.anchor.x, p.anchor.y, p.anchor.z, out, this.scale);
    return out;
  }

  hitDamage(sim: Sim, mult: number): number {
    const D = this.bossDef?.difficulty ?? sim.boss?.bossDef?.difficulty ?? 1;
    return bossHitDamage(sim.bal, D, mult);
  }

  private runMotion(sim: Sim, atk: AttackRuntime, i: number, m: NonNullable<AttackDef['motion']>[number], step: number, dt: number): void {
    const t0 = m.t, t1 = m.t + m.dur;
    if (atk.activeTime < t0 || atk.activeTime > t1 + step) return;
    let ms = atk.motionStart.get(i);
    const target = sim.actorTargetPos(atk.targetId, atk.target);
    if (!ms) {
      ms = { from: { ...this.pos }, to: { ...target }, started: true };
      atk.motionStart.set(i, ms);
      if (m.type === 'leap_to_target' || m.type === 'dive_to_target') {
        // predict a little ahead but never further than the target's current position + 2 m
        const pv = sim.actorTargetVel(atk.targetId);
        const lead = clamp(m.dur * 0.35, 0, 0.6);
        ms.to.x = target.x + pv.x * lead;
        ms.to.z = target.z + pv.z * lead;
        // stop short by body radius so we land in front of the target, not on top of it
        const d = Math.hypot(ms.to.x - ms.from.x, ms.to.z - ms.from.z);
        const stop = Math.min(d * 0.5, this.radius * this.scale * 0.8);
        if (d > 1e-3) {
          ms.to.x -= ((ms.to.x - ms.from.x) / d) * stop;
          ms.to.z -= ((ms.to.z - ms.from.z) / d) * stop;
        }
        if (m.dist && d > m.dist) {
          ms.to.x = ms.from.x + ((ms.to.x - ms.from.x) / d) * m.dist;
          ms.to.z = ms.from.z + ((ms.to.z - ms.from.z) / d) * m.dist;
        }
      } else if (m.type === 'teleport_behind') {
        const tyaw = sim.actorTargetYaw(atk.targetId);
        const dd = m.dist ?? 3;
        this.pos.x = target.x - Math.sin(tyaw) * dd;
        this.pos.z = target.z - Math.cos(tyaw) * dd;
        this.yaw = yawTo(this.pos, target);
        sim.clampActor(this);
        sim.emit({ type: 'vfx', id: 'teleport', pos: { ...this.pos } });
      } else if (m.type === 'teleport_random' || m.type === 'teleport_far') {
        const p = sim.randomArenaPoint(m.type === 'teleport_far' ? (m.dist ?? 12) : 0, target);
        this.pos.x = p.x; this.pos.z = p.z;
        this.yaw = yawTo(this.pos, target);
        sim.emit({ type: 'vfx', id: 'teleport', pos: { ...this.pos } });
      }
    }
    const k = clamp((atk.activeTime - t0) / Math.max(1e-3, m.dur), 0, 1);
    const sp = (m.speed ?? 6) * atk.rate;
    switch (m.type) {
      case 'forward':
      case 'charge_through': {
        forward(this.yaw, tmp);
        if (m.track) this.faceTarget(target, dt, m.track / Math.max(0.1, this.def.move.turn));
        this.pos.x += tmp.x * sp * dt;
        this.pos.z += tmp.z * sp * dt;
        this.moveSpeedNow = sp;
        this.noCollide = m.type === 'charge_through';
        break;
      }
      case 'toward_target': {
        const d = dist2D(this.pos, target);
        const stop = this.radius * this.scale + 1.0;
        if (d > stop) {
          const y = yawTo(this.pos, target);
          if (m.track) this.yaw = turnToward(this.yaw, y, m.track * dt);
          forward(this.yaw, tmp);
          const mv = Math.min(sp * dt, d - stop);
          this.pos.x += tmp.x * mv;
          this.pos.z += tmp.z * mv;
          this.moveSpeedNow = sp;
        }
        break;
      }
      case 'retreat': {
        forward(this.yaw, tmp);
        this.pos.x -= tmp.x * sp * dt;
        this.pos.z -= tmp.z * sp * dt;
        this.moveSpeedNow = sp;
        break;
      }
      case 'strafe_left':
      case 'strafe_right': {
        const yy = this.yaw + (m.type === 'strafe_left' ? Math.PI / 2 : -Math.PI / 2);
        forward(yy, tmp);
        this.pos.x += tmp.x * sp * dt;
        this.pos.z += tmp.z * sp * dt;
        this.moveSpeedNow = sp;
        break;
      }
      case 'leap_to_target':
      case 'dive_to_target': {
        const e = k;
        this.pos.x = ms.from.x + (ms.to.x - ms.from.x) * e;
        this.pos.z = ms.from.z + (ms.to.z - ms.from.z) * e;
        const ground = sim.groundAt(this.pos.x, this.pos.z);
        const startY = ms.from.y;
        const h = m.height ?? 3;
        if (m.type === 'leap_to_target') this.pos.y = ground + (startY - sim.groundAt(ms.from.x, ms.from.z)) * (1 - e) + 4 * h * e * (1 - e);
        else this.pos.y = startY + (ground - startY) * e;
        this.airborne = e < 1;
        this.yaw = turnToward(this.yaw, yawTo(ms.from, ms.to), 8 * dt);
        this.moveSpeedNow = sp;
        break;
      }
      case 'rise': {
        const ground = sim.groundAt(this.pos.x, this.pos.z);
        const h = m.height ?? 8;
        this.pos.y = Math.max(this.pos.y, ground + h * k);
        this.airborne = true;
        break;
      }
      case 'descend':
      case 'land': {
        const ground = sim.groundAt(this.pos.x, this.pos.z);
        this.pos.y = this.pos.y + (ground - this.pos.y) * Math.min(1, k + dt * 3);
        if (k >= 1) this.airborne = !!this.def.move.flying && m.type !== 'land';
        break;
      }
      case 'hover': {
        const ground = sim.groundAt(this.pos.x, this.pos.z);
        const h = m.height ?? this.hoverHeight ?? 6;
        this.pos.y += (ground + h - this.pos.y) * Math.min(1, dt * 3);
        this.airborne = true;
        break;
      }
      case 'orbit': {
        const d = Math.max(3, m.dist ?? dist2D(this.pos, target));
        const ang = Math.atan2(this.pos.x - target.x, this.pos.z - target.z) + (sp / d) * dt;
        this.pos.x = target.x + Math.sin(ang) * d;
        this.pos.z = target.z + Math.cos(ang) * d;
        this.yaw = yawTo(this.pos, target);
        this.moveSpeedNow = sp;
        break;
      }
      case 'to_center': {
        const c = sim.arenaCenter();
        const d = dist2D(this.pos, c);
        if (d > 0.5) {
          const y = yawTo(this.pos, c);
          forward(y, tmp);
          const mv = Math.min(sp * dt, d);
          this.pos.x += tmp.x * mv;
          this.pos.z += tmp.z * mv;
        }
        break;
      }
      default:
        break;
    }
    if (atk.activeTime >= t1) this.noCollide = false;
    sim.clampActor(this);
  }

  canDie(sim: Sim): boolean {
    return this.behavior?.canDie ? this.behavior.canDie(this, sim) : true;
  }

  /** Enter a phase (with invulnerable transition unless it is the first). */
  enterPhase(sim: Sim, index: number): void {
    if (index <= this.phaseIndex && this.phaseIndex !== 0) return;
    if (this.state === 'spezzato') {
      this.pendingPhase = index;
      return;
    }
    this.pendingPhase = -1;
    this.phaseIndex = index;
    const ph = this.phase;
    this.cancelAttack(sim);
    const dur = ph.transition ?? (index === 0 ? 0 : sim.bal.boss.phase_transition);
    for (const f of ph.on_enter ?? []) this.flags.add(f);
    if (dur > 0) {
      this.invulnerable = true;
      this.setState('transition', dur);
    } else {
      this.setState('idle');
      this.idleTimer = 0.6;
    }
    this.history.length = 0;
    sim.emit({ type: 'bossPhase', actor: this.id, boss: this.defId, phase: index, phaseId: ph.id, music: ph.music });
    if (ph.dialogue) sim.emit({ type: 'dialogue', key: ph.dialogue, speaker: this.defId });
    this.behavior?.onPhaseEnter?.(this, sim, index, ph);
  }

  checkPhase(sim: Sim): void {
    if (!this.isMain) return;
    const f = this.hpFrac;
    for (let i = this.phases.length - 1; i > this.phaseIndex; i--) {
      if (f <= this.phases[i].hp_range[0] + 1e-9) {
        if (this.pendingPhase !== i) this.enterPhase(sim, i);
        return;
      }
    }
  }

  /** Forward yaw-relative direction from this actor to a point (radians, signed). */
  relativeAngle(p: Vec3): number {
    return angleDiff(this.yaw, yawTo(this.pos, p));
  }
}

export function spawnYawSpread(baseYaw: number, i: number, count: number, spreadDeg: number): number {
  if (count <= 1) return baseYaw;
  const s = spreadDeg * DEG;
  return wrapAngle(baseYaw - s / 2 + (s * i) / (count - 1));
}

export type { SpawnDef };
