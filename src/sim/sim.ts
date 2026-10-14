/**
 * The deterministic 60 Hz simulation: world, player, bosses, projectiles, hazards, Metamondo, story sequences and progression.
 * No DOM, no rendering, no audio: everything observable is exposed as state or emitted as SimEvents.
 */
import type { Content } from '../core/content';
import { bossMaxHp } from '../core/formulas';
import { DEG, clamp, dist2D, forward, localToWorld, v3, wrapAngle, yawTo, type Vec3 } from '../core/math';
import { Rng } from '../core/rng';
import { insideArena } from '../core/terrain';
import type { BalanceDef, BossDef, ColliderDef, MinionDef, ShapeDef, SpawnDef, StatusKind, SwingDef, TimeOfDay } from '../core/types';
import { Actor, nextAttackUid, resetActorIds, spawnYawSpread, type AttackRuntime, type PartRuntime } from './actor';
import type { ArtRuntime } from './arts';
import type { BehaviorRegistry } from './behavior';
import { applyDamageToActor, damagePlayer, killActor, type HitResult } from './combat';
import { isDefeated, newGameState, playerBaseScale, skyShade, themeNotes, type CharacterLook, type GameStateData } from './gamestate';
import { MetamondoController } from './metamondo';
import { Player, type SwingRuntime } from './player';
import { Pool, makeBarrier, makeHazard, makeProjectile, type Barrier, type Hazard, type Projectile } from './pools';
import { SequenceRunner } from './sequence';
import { shapeHits, type TargetVol } from './shapes';
import { Btn, emptyInput, type DamageEvent, type PlayerInput, type SimEvent } from './types';
import { ZoneRuntime, type Interactable } from './world';

export interface SimSettings {
  inputBuffer: number;
  latencyComp: number;
}

export interface FightRuntime {
  boss: string;
  arena: string;
  active: boolean;
  time: number;
  memory: boolean;
  won: boolean;
  ended: boolean;
  endTimer: number;
  ally: Actor | null;
  tod: TimeOfDay;
  intro: boolean;
}

export interface Challenges {
  noDamage: boolean;
  singleWeapon: boolean;
  noLacrime: boolean;
  noMetamondo: boolean;
}

export interface SimOptions {
  behaviors?: BehaviorRegistry;
  seed?: number;
  state?: GameStateData;
  headless?: boolean;
}

const tmp = v3();
const tmp2 = v3();
const vol: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };
const hurt: { x: number; y: number; z: number; r: number }[] = [];
const contact = v3();

export class Sim {
  readonly c: Content;
  readonly bal: BalanceDef;
  readonly dt: number;
  rng: Rng;
  time = 0;
  tick = 0;
  player = new Player();
  actors: Actor[] = [];
  boss: Actor | null = null;
  projectiles = new Pool<Projectile>(makeProjectile, 96);
  hazards = new Pool<Hazard>(makeHazard, 64);
  barriers = new Pool<Barrier>(makeBarrier, 4);
  meta = new MetamondoController();
  seq = new SequenceRunner();
  state: GameStateData;
  zone: ZoneRuntime | null = null;
  fight: FightRuntime | null = null;
  events: SimEvent[] = [];
  settings: SimSettings;
  debug = { invincible: false, showHitboxes: false, oneHitKill: false };
  challenges: Challenges = { noDamage: false, singleWeapon: false, noLacrime: false, noMetamondo: false };
  behaviors: BehaviorRegistry;
  inputLocked = false;
  fightPaused = false;
  /** Cooperative Colpo di Grazia (final fight). */
  coopGrace = false;
  /** Altar menu currently open. */
  altarOpen: string | null = null;
  prompt: Interactable | null = null;
  deadTimer = 0;
  /** Player respawn pending (handled by app fade or immediately headless). */
  respawnPending = false;
  headless: boolean;
  /** Ouranthos ally (Cthulhu fight). */
  ally: Actor | null = null;
  private projIds = 1;
  private hazIds = 1;
  private lastInput: PlayerInput = emptyInput();
  /** Interactables available during a fight (e.g. the ship's ballista), registered by boss behaviors. */
  fightInteractables: Interactable[] = [];
  /** Memory fight return point (Specchio dei Ricordi). */
  memoryReturn: { zone: string; altar: string } | null = null;
  /** Ending reached (presentation runs the sunrise). */
  endingActive = false;

  constructor(c: Content, opts: SimOptions = {}) {
    this.c = c;
    this.bal = c.balance;
    this.dt = 1 / this.bal.sim_hz;
    this.behaviors = opts.behaviors ?? {};
    this.headless = opts.headless ?? false;
    this.state = opts.state ?? newGameState(c, { name: 'Portatore', build: 0.5, height: 0.5, skin: 2, hair: 1, hairColor: 0, eyes: 0, cloak: 0 });
    this.rng = new Rng(opts.seed ?? this.state.rng ?? 1);
    this.settings = { inputBuffer: this.bal.player.input_buffer, latencyComp: 0 };
    this.applyStateToPlayer();
  }

  get ngCycle(): number {
    return this.state.ngCycle;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    if (this.events.length > 4000) this.events.splice(0, 2000);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Step                                                                                                              */
  /* ---------------------------------------------------------------------------------------------------------------- */

  step(input: PlayerInput): void {
    const dt = this.dt;
    this.lastInput = input;
    this.time += dt;
    this.tick++;
    this.state.playtime += dt;

    if (this.seq.running) this.seq.update(this, input, dt);
    this.inputLocked = this.seq.running && !this.seqAllowsControl();

    // Altar menu freezes the player in meditation
    if (this.altarOpen) {
      this.player.vel.x = 0; this.player.vel.z = 0;
    } else {
      this.player.update(this, this.inputLocked ? lockedInput(input) : input, dt);
    }

    if (this.fight?.active || this.actors.length) {
      for (let i = 0; i < this.actors.length; i++) {
        const a = this.actors[i];
        a.update(this, dt);
      }
      this.separateActors();
      // remove finished minions/decoys/clones
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i];
        if (!a.isMain && a.kind !== 'ally' && a.state === 'dead' && a.dying > 1.2) this.actors.splice(i, 1);
      }
    }
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.barriers.forEachActive((b) => {
      b.life -= dt;
      if (b.life <= 0) b.active = false;
    });
    this.meta.update(this, dt);
    this.updateFight(dt);
    this.updateWorldTriggers();

    if (this.player.state === 'dead') {
      this.deadTimer += dt;
      if (this.deadTimer > 3.2 && !this.respawnPending) {
        this.respawnPending = true;
        if (this.headless) this.respawn();
      }
    }
  }

  private seqAllowsControl(): boolean {
    return false;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* State <-> player                                                                                                  */
  /* ---------------------------------------------------------------------------------------------------------------- */

  applyStateToPlayer(): void {
    const s = this.state;
    const p = this.player;
    p.weapons = [...s.equipped];
    p.activeSlot = s.equipped[s.activeSlot] ? s.activeSlot : Math.max(0, s.equipped.findIndex((w) => !!w));
    p.hpMax = this.bal.player.health;
    p.hp = p.hpMax;
    p.fiatoMax = this.bal.player.fiato;
    p.fiato = p.fiatoMax;
    p.lacrimeMax = this.bal.player.lacrime;
    p.lacrime = p.lacrimeMax;
    p.eco = 0;
    p.hasShadow = false;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Zones                                                                                                             */
  /* ---------------------------------------------------------------------------------------------------------------- */

  loadZone(zoneId: string, altarId?: string): void {
    this.clearCombat();
    this.zone = new ZoneRuntime(this.c, zoneId);
    for (const a of this.zone.arenas) {
      const bosses = this.c.bossForArena(a.id);
      if (bosses.some((b) => !isDefeated(this.state, b.id) && !b.scripted)) this.zone.sealed.add(a.id);
    }
    this.state.zone = zoneId;
    const sc = playerBaseScale(this.c, this.state, zoneId);
    this.player.baseScale = sc.scale;
    this.player.baseSpeed = sc.speed;
    this.player.formScale = 1;
    const altar = altarId && this.c.hasAltar(altarId) ? this.c.altar(altarId) : null;
    if (altar && altar.zone === zoneId) {
      const fwd = forward(altar.yaw ?? 0, tmp);
      this.player.pos.x = altar.pos[0] + fwd.x * 2.2;
      this.player.pos.z = altar.pos[2] + fwd.z * 2.2;
      this.player.yaw = altar.yaw ?? 0;
      if (!this.state.visitedAltars.includes(altar.id)) this.state.visitedAltars.push(altar.id);
    } else {
      const z = this.zone.def;
      this.player.pos.x = z.spawn[0];
      this.player.pos.z = z.spawn[2];
      this.player.yaw = z.spawn_yaw ?? 0;
    }
    this.player.pos.y = this.groundAt(this.player.pos.x, this.player.pos.z);
    this.player.prevPos = { ...this.player.pos };
    this.player.vel = v3();
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.lock = null;
    this.emit({ type: 'zoneEnter', zone: zoneId });
    this.emit({ type: 'scale', scale: this.player.scale });
  }

  groundAt(x: number, z: number): number {
    return this.zone ? this.zone.groundAt(x, z) : 0;
  }

  surfaceAt(x: number, z: number): string {
    return this.zone ? this.zone.surfaceAt(x, z) : 'stone';
  }

  private allowSealedEntry = (arenaId: string, x: number, z: number): boolean => {
    const a = this.c.arena(arenaId);
    const gx = a.gate.pos[0], gz = a.gate.pos[2];
    return Math.hypot(x - gx, z - gz) <= a.gate.width * 0.6 + 1.2;
  };

  collidePlayer(p: Player): void {
    if (!this.zone) return;
    const r = this.bal.player.radius * p.scale;
    const inFight = !!this.fight?.active;
    this.zone.collideStatic(p.pos, r, this.bal.player.height * p.scale);
    // actors
    {
      for (const a of this.actors) {
        if (!a.alive || a.noCollide || a.hidden || a.team !== 'enemy' || a.airborne) continue;
        const rr = a.radius * a.scale + r;
        const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && p.pos.y < a.pos.y + a.height * a.scale) {
          const d = Math.sqrt(d2) || 1e-3;
          p.pos.x = a.pos.x + (dx / d) * rr;
          p.pos.z = a.pos.z + (dz / d) * rr;
        }
      }
    }
    const before = { x: p.pos.x, z: p.pos.z };
    this.zone.clampPoint(p.pos, r, inFight, this.allowSealedEntry);
    // deep water: revert horizontal move
    const w = this.zone.terrain.waterLevel();
    if (w !== null && !inFight && this.zone.def.terrain.type !== 'deck' && this.zone.terrain.heightAt(p.pos.x, p.pos.z) < w - 0.7 && !this.zone.terrain.arenaAt(p.pos.x, p.pos.z)) {
      p.pos.x = p.prevPos.x;
      p.pos.z = p.prevPos.z;
    }
    void before;
  }

  clampActor(a: Actor): void {
    if (!this.zone) return;
    const margin = Math.min(a.radius * a.scale * 0.6, 4);
    this.zone.clampPoint(a.pos, margin, true, () => true);
  }

  private separateActors(): void {
    // keep bosses from overlapping each other (minions vs boss)
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.alive || a.noCollide || a.airborne || a.team !== 'enemy') continue;
      for (let j = i + 1; j < this.actors.length; j++) {
        const b = this.actors[j];
        if (!b.alive || b.noCollide || b.airborne || b.team !== 'enemy') continue;
        const rr = a.radius * a.scale + b.radius * b.scale;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / 2;
          const wa = a.mass === 'immovable' ? 0 : b.mass === 'immovable' ? 2 : 1;
          const wb = 2 - wa;
          a.pos.x -= (dx / d) * push * wa;
          a.pos.z -= (dz / d) * push * wa;
          b.pos.x += (dx / d) * push * wb;
          b.pos.z += (dz / d) * push * wb;
        }
      }
    }
  }

  arenaCenter(): Vec3 {
    const a = this.zone?.metaSpace ?? this.zone?.activeArena;
    if (!a) return { x: 0, y: 0, z: 0 };
    return { x: a.cx, y: a.floor, z: a.cz };
  }

  randomArenaPoint(minDistFrom: number, from: Vec3): Vec3 {
    const a = this.zone?.metaSpace ?? this.zone?.activeArena;
    if (!a) return { ...from };
    const R = a.shape === 'circle' ? a.radius : Math.min(a.hx, a.hz);
    for (let i = 0; i < 30; i++) {
      const ang = this.rng.range(-Math.PI, Math.PI);
      const r = Math.sqrt(this.rng.next()) * R * 0.85;
      const x = a.cx + Math.sin(ang) * r, z = a.cz + Math.cos(ang) * r;
      if (!insideArena(a, x, z, 1)) continue;
      if (Math.hypot(x - from.x, z - from.z) < minDistFrom) continue;
      return { x, y: a.floor, z };
    }
    return { x: a.cx, y: a.floor, z: a.cz };
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Fights                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Start the fight with a boss (player must already be in its zone). */
  startFight(bossId: string, opts: { memory?: boolean; skipIntro?: boolean } = {}): void {
    if (!this.zone) this.loadZone(this.c.boss(bossId).zone);
    const def = this.c.boss(bossId);
    const arena = this.c.arena(def.arena);
    this.clearCombat();
    this.zone!.setActiveArena(arena);
    resetActorIds();
    const hp = bossMaxHp(this.c, def) * (this.ngCycle > 0 ? 1.15 : 1);
    const behaviorF = this.behaviors[def.behavior ?? def.id];
    const behavior = behaviorF ? behaviorF() : null;
    const center = arena.center;
    const gate = arena.gate;
    // boss starts on the far side of the arena from the gate
    const gx = gate.pos[0] - center[0], gz = gate.pos[2] - center[2];
    const gl = Math.hypot(gx, gz) || 1;
    const R = arena.shape === 'circle' ? arena.radius ?? 20 : Math.min(...(arena.half ?? [20, 20]));
    const spawnDist = Math.min(R * 0.45, 14);
    const pos = { x: center[0] - (gx / gl) * spawnDist, y: arena.floor_y, z: center[2] - (gz / gl) * spawnDist };
    const boss = new Actor('boss', def, pos, 'enemy', behavior, hp, true);
    boss.yaw = yawTo(pos, this.player.pos);
    boss.tod = def.time_of_day_variants[this.state.timeOfDay] ?? {};
    for (const f of boss.tod.flags ?? []) boss.flags.add(f);
    this.boss = boss;
    this.actors = [boss];
    this.fight = { boss: bossId, arena: arena.id, active: true, time: 0, memory: !!opts.memory, won: false, ended: false, endTimer: 0, ally: null, tod: this.state.timeOfDay, intro: false };
    this.zone!.sealed.delete(arena.id);
    this.meta.reset(this.bal.metamondo.start);
    this.player.eco = 0;
    this.player.tookDamage = false;
    this.player.drank = false;
    this.player.usedMetamondo = false;
    this.player.weaponsUsed.clear();
    this.player.reflected.clear();
    this.player.perfectDodged.clear();
    const w = this.player.weaponId;
    if (w) this.player.weaponsUsed.add(w);
    // place the player just inside the gate
    const inward = { x: -gx / gl, z: -gz / gl };
    if (!insideArena(this.zone!.activeArena!, this.player.pos.x, this.player.pos.z, 1)) {
      this.player.pos.x = gate.pos[0] + inward.x * 2.5;
      this.player.pos.z = gate.pos[2] + inward.z * 2.5;
    }
    this.player.pos.y = this.groundAt(this.player.pos.x, this.player.pos.z);
    this.player.yaw = yawTo(this.player.pos, boss.pos);
    boss.yaw = yawTo(boss.pos, this.player.pos);
    boss.updatePartsWorld();
    behavior?.init?.(boss, this);
    this.spawnArenaHazards(null);
    boss.enterPhase(this, 0);
    const tOpener = boss.tod.opener;
    this.emit({ type: 'gateLock', arena: arena.id });
    this.emit({ type: 'fightStart', boss: bossId, arena: arena.id });
    this.emit({ type: 'music', cue: def.music });
    const introId = def.intro_sequence;
    if (introId && !opts.skipIntro && this.c.hasSequence(introId)) {
      this.fight.intro = true;
      boss.setState('intro');
      this.seq.start(this, this.c.sequence(introId), () => {
        if (this.fight) this.fight.intro = false;
        if (boss.state === 'intro') {
          boss.setState('idle');
          boss.idleTimer = 1.0;
        }
        if (tOpener && boss.attackMap.has(tOpener)) boss.startAttack(this, boss.attackMap.get(tOpener)!);
      });
    } else {
      boss.idleTimer = 1.2;
      if (tOpener && boss.attackMap.has(tOpener)) boss.startAttack(this, boss.attackMap.get(tOpener)!);
    }
    this.player.lock = { actor: boss.id, part: -1 };
  }

  /** Load the boss's zone, put the player at the gate and start (bot, debug, Specchio dei Ricordi). */
  startFightDirect(bossId: string, opts: { memory?: boolean; skipIntro?: boolean } = {}): void {
    const def = this.c.boss(bossId);
    const altar = this.c.bundle.altars.find((a) => a.before_boss === bossId);
    this.loadZone(def.zone, altar?.id);
    const arena = this.c.arena(def.arena);
    const cx = arena.center[0], cz = arena.center[2];
    const gx = arena.gate.pos[0], gz = arena.gate.pos[2];
    const gl = Math.hypot(gx - cx, gz - cz) || 1;
    this.player.pos.x = gx + ((cx - gx) / gl) * 2.5;
    this.player.pos.z = gz + ((cz - gz) / gl) * 2.5;
    this.player.pos.y = arena.floor_y;
    this.startFight(bossId, opts);
  }

  private clearCombat(): void {
    if (this.meta.active) this.meta.end(this, 0);
    this.actors = [];
    this.boss = null;
    this.ally = null;
    this.fight = null;
    this.projectiles.clear();
    this.hazards.clear();
    this.barriers.clear();
    this.coopGrace = false;
    this.fightPaused = false;
    this.fightInteractables = [];
    this.dynamicColliders.clear();
    if (this.zone) {
      this.zone.setActiveArena(null);
      this.zone.metaSpace = null;
    }
    this.player.flying = false;
    this.player.formScale = 1;
  }

  private updateFight(dt: number): void {
    const f = this.fight;
    if (!f) return;
    f.time += dt;
    // Specchio dei Ricordi: fail no-damage challenge immediately
    if (f.ended) {
      f.endTimer += dt;
      return;
    }
  }

  /** Called when the main boss dies. */
  onBossDeath(a: Actor): void {
    const f = this.fight;
    if (!f || f.ended) return;
    f.won = true;
    f.ended = true;
    if (this.meta.active && !this.meta.forced) this.meta.end(this, 0);
    for (const o of this.actors) if (o !== a && o.team === 'enemy' && o.alive) killActor(this, o);
    this.projectiles.forEachActive((p) => {
      if (p.team === 'enemy') p.active = false;
    });
    this.hazards.forEachActive((h) => {
      if (h.team === 'enemy' && !h.permanent) h.active = false;
    });
    this.emit({ type: 'haptic', pattern: 'bossDefeat' });
    this.emit({ type: 'hitstop', dur: 0.25 });
    this.completeEncounter(a.boss, true);
  }

  /** Mark an encounter complete and grant its rewards. Used by normal deaths and by scripted endings. */
  completeEncounter(def: BossDef, won: boolean): void {
    const f = this.fight;
    const memory = f?.memory ?? false;
    const s = this.state;
    if (!memory) {
      if (!s.defeated.includes(def.id)) s.defeated.push(def.id);
      if (def.drops_weapon) {
        const w = this.c.weapon(def.drops_weapon);
        if (!w.delivered_by) this.giveWeapon(w.id);
      }
      if (def.unlocks_form) this.unlockForm(def.unlocks_form);
      for (const it of def.grants ?? []) this.giveItem(it);
      if (def.brightens_sky) this.emit({ type: 'skyBrighten', level: skyShade(this.c, s) });
      for (const w of this.c.weapons) if (w.delivered_by === def.id) this.giveWeapon(w.id);
    }
    if (won) {
      const tods = (s.todDefeats[def.id] ??= []);
      if (f && !tods.includes(f.tod)) tods.push(f.tod);
      if (memory) this.recordChallenges(def.id);
    }
    this.emit({ type: 'fightEnd', boss: def.id, won });
    this.emit({ type: 'bossDefeated', boss: def.id, actor: this.boss?.id ?? -1 });
    const defeatSeq = def.defeat_sequence;
    const finish = () => this.finishFight(def);
    if (defeatSeq && this.c.hasSequence(defeatSeq) && !memory) {
      // let the death animation breathe before the dialogue
      this.seq.start(this, this.c.sequence(defeatSeq), finish);
    } else finish();
  }

  private recordChallenges(bossId: string): void {
    const s = this.state;
    const pl = this.player;
    const add = (k: string) => {
      const l = (s.challenges[k] ??= []);
      if (!l.includes(bossId)) l.push(bossId);
    };
    if (this.challenges.noDamage && !pl.tookDamage) add('no_damage');
    if (this.challenges.singleWeapon && pl.weaponsUsed.size <= 1) add('single_weapon');
    if (this.challenges.noLacrime && !pl.drank) add('no_lacrime');
    if (this.challenges.noMetamondo && !pl.usedMetamondo) add('no_metamondo');
  }

  private finishFight(def: BossDef): void {
    const f = this.fight;
    const arena = f?.arena;
    if (arena) this.emit({ type: 'gateOpen', arena });
    const memory = f?.memory ?? false;
    this.clearCombat();
    if (arena && this.zone) this.zone.sealed.delete(arena);
    this.emit({ type: 'autosave', reason: 'boss' });
    if (memory && this.memoryReturn) {
      const r = this.memoryReturn;
      this.memoryReturn = null;
      this.challenges = { noDamage: false, singleWeapon: false, noLacrime: false, noMetamondo: false };
      this.loadZone(r.zone, r.altar);
      this.restAt(r.altar);
    }
    void def;
  }

  onPlayerDeath(): void {
    if (this.player.state === 'dead') return;
    this.player.cancelSwing();
    this.player.art = null;
    this.player.setState('dead');
    this.player.lock = null;
    this.deadTimer = 0;
    this.respawnPending = false;
    this.state.deaths++;
    if (this.meta.active) this.meta.end(this, 0);
    this.emit({ type: 'playerDied' });
  }

  /** Wake at the last altar: full Health, refilled Lacrime, boss reset. */
  respawn(): void {
    this.respawnPending = false;
    if (this.seq.running) this.seq.stop(this);
    const memory = this.fight?.memory && this.memoryReturn;
    this.clearCombat();
    if (memory && this.memoryReturn) {
      const r = this.memoryReturn;
      this.memoryReturn = null;
      this.challenges = { noDamage: false, singleWeapon: false, noLacrime: false, noMetamondo: false };
      this.loadZone(r.zone, r.altar);
    } else {
      const altar = this.c.altar(this.state.lastAltar);
      this.loadZone(altar.zone, altar.id);
    }
    this.player.setState('idle');
    this.player.hp = this.player.hpMax;
    this.player.lacrime = this.player.lacrimeMax;
    this.player.fiato = this.player.fiatoMax;
    this.player.eco = 0;
    this.player.statuses = {};
    this.player.buff = null;
    this.player.shapeShift = null;
    this.emit({ type: 'respawn', altar: this.state.lastAltar });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Targets                                                                                                           */
  /* ---------------------------------------------------------------------------------------------------------------- */

  actorById(id: number): Actor | undefined {
    for (const a of this.actors) if (a.id === id) return a;
    return undefined;
  }

  /** Who an enemy actor attacks: decoys first, then (randomly) Specchio clones or the player; allies attack the boss. */
  targetOf(a: Actor): { id: number; pos: Vec3 } {
    if (a.team === 'player') {
      const b = this.boss;
      return b ? { id: b.id, pos: b.pos } : { id: -1, pos: this.player.pos };
    }
    const decoy = this.actors.find((x) => x.kind === 'decoy' && x.alive);
    if (decoy) return { id: decoy.id, pos: decoy.pos };
    const clones = this.actors.filter((x) => x.kind === 'clone' && x.alive);
    if (clones.length && this.rng.chance(clones.length / (clones.length + 1.5))) {
      const c = this.rng.pick(clones);
      return { id: c.id, pos: c.pos };
    }
    return { id: -1, pos: this.player.pos };
  }

  targetPos(a: Actor): Vec3 {
    if (a.targetId >= 0) {
      const t = this.actorById(a.targetId);
      if (t && t.alive) return t.pos;
    }
    if (a.team === 'player') return this.boss?.pos ?? this.player.pos;
    return this.player.pos;
  }

  actorTargetPos(id: number, fallback: Vec3): Vec3 {
    if (id === -1) return this.player.pos;
    const t = this.actorById(id);
    return t && t.alive ? t.pos : this.player.pos ?? fallback;
  }

  actorTargetVel(id: number): Vec3 {
    if (id === -1) return this.player.vel;
    const t = this.actorById(id);
    if (!t) return this.player.vel;
    tmp2.x = (t.pos.x - t.prevPos.x) / this.dt;
    tmp2.z = (t.pos.z - t.prevPos.z) / this.dt;
    tmp2.y = 0;
    return tmp2;
  }

  actorTargetYaw(id: number): number {
    if (id === -1) return this.player.yaw;
    return this.actorById(id)?.yaw ?? this.player.yaw;
  }

  /** Enumerate hittable targets of an actor's attacks (player-team: player, clones, decoys, ally; enemy-team: enemies). */
  forEachTargetOf(a: Actor, fn: (id: number, v: TargetVol) => void): void {
    if (a.team === 'enemy') {
      if (this.player.state !== 'dead') fn(-1, this.player.volume(vol, this));
      for (const o of this.actors) {
        if (o.team !== 'player' || !o.alive || o.kind === 'ally') continue;
        vol.x = o.pos.x; vol.y = o.pos.y; vol.z = o.pos.z; vol.r = o.radius * o.scale; vol.h = o.height * o.scale;
        fn(o.id, vol);
      }
    } else {
      for (const o of this.actors) {
        if (o.team !== 'enemy' || !o.alive || o.hidden) continue;
        const n = o.bodyHurt(hurt);
        for (let i = 0; i < n; i++) {
          vol.x = hurt[i].x; vol.y = hurt[i].y; vol.z = hurt[i].z; vol.r = hurt[i].r; vol.h = 0;
          fn(o.id, vol);
        }
      }
    }
  }

  /** Apply an enemy (or ally) hit to a target id. */
  damageTarget(attacker: Actor, dmg: DamageEvent): HitResult {
    if (attacker.team === 'player') {
      const t = this.actorById(dmg.target);
      if (!t) return 'miss';
      // the ally (Ouranthos) hits with the strength of a difficulty-19 weapon
      dmg.amount = (this.bal.weapon.base + this.bal.weapon.per_difficulty * 19) * (dmg.mult ?? 1) * 0.6;
      applyDamageToActor(this, t, dmg, null);
      return 'hit';
    }
    if (dmg.target === -1) {
      if (this.fight?.intro) return 'miss';
      return damagePlayer(this, attacker, dmg);
    }
    const t = this.actorById(dmg.target);
    if (!t) return 'miss';
    if (t.kind === 'decoy') {
      t.hp = 0;
      t.setState('dead');
      this.emit({ type: 'vfx', id: 'decoy_shatter', pos: { ...t.pos } });
      return 'hit';
    }
    if (t.kind === 'clone') {
      t.hitFlash = 0.3;
      this.emit({ type: 'vfx', id: 'clone_flicker', pos: { ...t.pos } });
      return 'hit';
    }
    return 'miss';
  }

  /** Equilibrio damage to the whole boss or to a part with its own bar. */
  applyPoise(a: Actor, amount: number, part: PartRuntime | null): void {
    if (amount <= 0 || !a.alive) return;
    if (this.meta.active && this.meta.ability === 'statura') amount *= Number(this.meta.form?.ability.params.poise_mult ?? 1.5);
    if (part && part.poiseMax > 0) {
      if (part.spezzato > 0) return;
      part.poise += amount;
      part.poiseIdle = 0;
      if (part.poise >= part.poiseMax) {
        part.poise = part.poiseMax;
        part.spezzato = this.bal.equilibrio.spezzato_time;
        part.graced = false;
        if (a.attack?.def.part === part.id) a.cancelAttack(this), a.setState('stagger', 0.6);
        this.emit({ type: 'spezzato', actor: a.id, part: part.index, pos: { ...part.center } });
        a.behavior?.onSpezzato?.(a, this, part);
      }
      return;
    }
    if (a.state === 'spezzato' || a.state === 'transition' || a.state === 'dead' || a.state === 'intro') return;
    a.poise += amount;
    a.poiseIdle = 0;
    if (a.poise >= a.poiseMax) {
      a.poise = a.poiseMax;
      a.cancelAttack(this);
      a.setState('spezzato', this.bal.equilibrio.spezzato_time);
      a.graced = false;
      a.airborne = false;
      a.pos.y = this.groundAt(a.pos.x, a.pos.z);
      this.emit({ type: 'spezzato', actor: a.id, part: -1, pos: { ...a.pos } });
      this.emit({ type: 'haptic', pattern: 'parry' });
      a.behavior?.onSpezzato?.(a, this, null);
    }
  }

  applyGraceDamage(pl: Player, a: Actor, partIdx: number, amount: number): void {
    const part = partIdx >= 0 ? a.parts[partIdx] : null;
    const pos = part ? { ...part.center } : { x: a.pos.x, y: a.pos.y + a.height * a.scale * 0.5, z: a.pos.z };
    const dealt = applyDamageToActor(this, a, { source: -1, target: a.id, amount, poise: 0, element: 'light', flags: [], pos, instance: -1, part: partIdx, kind: 'grace' }, part);
    this.emit({ type: 'graceHit', actor: a.id, amount: dealt, pos });
    this.emit({ type: 'hitstop', dur: 0.12 });
    this.emit({ type: 'shake', strength: 0.6, dur: 0.5 });
    pl.onHitLanded(this, null);
    if (part && part.def.regrow) {
      // Idra: a head finished with the Colpo di Grazia does not regrow
      if (!part.broken) {
        part.hp = 0;
        part.broken = true;
        part.active = false;
        this.emit({ type: 'partBroken', actor: a.id, part: part.id, pos });
        a.behavior?.onPartBroken?.(a, this, part);
      }
      part.regrowTimer = 0;
      part.spezzato = 0;
    }
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Player attacks                                                                                                    */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private hitActorWithShape(
    origin: Vec3, yaw: number, scale: number, shape: ShapeDef, progress: number,
    already: (actorId: number) => boolean, onHit: (a: Actor, part: PartRuntime | null, pos: Vec3) => void,
  ): number {
    let n = 0;
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive || a.hidden || already(a.id)) continue;
      // parts first (weak points), preferring higher damage multipliers
      let bestPart: PartRuntime | null = null;
      let bestMult = -1;
      for (const p of a.parts) {
        if (!p.active || p.broken) continue;
        for (const w of p.world) {
          vol.x = w.x; vol.y = w.y; vol.z = w.z; vol.r = w.r; vol.h = 0;
          if (shapeHits(shape, origin, yaw, scale, progress, vol, contact)) {
            const m = p.def.damage_mult ?? 1;
            if (m > bestMult) {
              bestMult = m;
              bestPart = p;
              tmp.x = contact.x; tmp.y = contact.y; tmp.z = contact.z;
            }
          }
        }
      }
      if (bestPart) {
        onHit(a, bestPart, { ...tmp });
        n++;
        continue;
      }
      const cnt = a.bodyHurt(hurt);
      for (let i = 0; i < cnt; i++) {
        vol.x = hurt[i].x; vol.y = hurt[i].y; vol.z = hurt[i].z; vol.r = hurt[i].r; vol.h = 0;
        if (shapeHits(shape, origin, yaw, scale, progress, vol, contact)) {
          onHit(a, null, { ...contact });
          n++;
          break;
        }
      }
    }
    return n;
  }

  playerMeleeHits(pl: Player, sw: SwingRuntime, shape: ShapeDef, interval: number, multi: boolean): void {
    const t = sw.t - sw.def.startup;
    const tickIdx = multi ? Math.floor(t / Math.max(1e-3, interval)) : 0;
    const origins: { pos: Vec3; yaw: number; mult: number; clone: boolean }[] = [{ pos: pl.pos, yaw: pl.yaw, mult: 1, clone: false }];
    for (const a of this.actors) if (a.kind === 'clone' && a.alive) origins.push({ pos: a.pos, yaw: a.yaw, mult: Number(this.meta.form?.ability.params.clone_damage_mult ?? 0.5), clone: true });
    for (const o of origins) {
      this.hitActorWithShape(o.pos, o.yaw, 1, shape, 0, (id) => {
        const key = id * 4 + (o.clone ? 1 + origins.indexOf(o) : 0);
        if (multi) return sw.tickHits.get(key) === tickIdx;
        return sw.hit.has(key);
      }, (a, part, pos) => {
        const key = a.id * 4 + (o.clone ? 1 + origins.indexOf(o) : 0);
        if (multi) sw.tickHits.set(key, tickIdx);
        else sw.hit.add(key);
        const amount = (sw.damage / (multi ? Math.max(1, sw.def.hits ?? 1) * 0.6 : 1)) * pl.outgoingMult(this) * o.mult;
        const dealt = applyDamageToActor(this, a, {
          source: -1, target: a.id, amount, poise: o.clone ? 0 : sw.poise / (multi ? Math.max(1, sw.def.hits ?? 1) : 1), element: pl.buff ? (pl.buff.element as any) : sw.def.element ?? 'physical',
          flags: [], pos, instance: sw.uid, part: part?.index ?? -1, kind: sw.kind,
        }, part);
        if (!o.clone) {
          if (dealt > 0 || a.invulnerable === false) {
            pl.gainEco(this, sw.eco / (multi ? Math.max(1, sw.def.hits ?? 1) : 1));
            pl.onHitLanded(this, sw);
          }
          this.emit({ type: 'hitstop', dur: sw.kind === 'heavy' || sw.kind === 'jumping' ? 0.075 : 0.045 });
          this.emit({ type: 'haptic', pattern: 'hit' });
        }
      });
    }
  }

  /** Art hit test (player Arts). Returns number of actors hit this call. */
  playerArtHit(pl: Player, art: ArtRuntime, shape: ShapeDef, origin: Vec3, yaw: number, scale: number, progress: number, damage: number, tick: number): number {
    return this.hitActorWithShape(origin, yaw, scale, shape, progress, (id) => {
      if (tick > 0) return art.t - (art.ticks.get(id) ?? -999) < tick;
      return art.hit.has(id);
    }, (a, part, pos) => {
      if (tick > 0) art.ticks.set(a.id, art.t);
      else art.hit.add(a.id);
      const poise = art.poiseLeft;
      art.poiseLeft = 0;
      applyDamageToActor(this, a, { source: -1, target: a.id, amount: damage, poise, element: (art.def.params.element as any) ?? 'physical', flags: [], pos, instance: art.uid, part: part?.index ?? -1, kind: 'art' }, part);
      pl.onHitLanded(this, null);
      this.emit({ type: 'artHit', art: art.def.id, pos });
      this.emit({ type: 'hitstop', dur: 0.06 });
      this.emit({ type: 'haptic', pattern: 'hit' });
    });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Lock-on                                                                                                           */
  /* ---------------------------------------------------------------------------------------------------------------- */

  lockPointPos(actorId: number, part: number, out: Vec3): Vec3 | null {
    const a = this.actorById(actorId);
    if (!a || !a.alive) return null;
    if (part >= 0 && a.parts[part]) {
      const p = a.parts[part];
      out.x = p.center.x; out.y = p.center.y; out.z = p.center.z;
      return out;
    }
    out.x = a.pos.x; out.z = a.pos.z; out.y = a.pos.y + a.height * a.scale * 0.55;
    return out;
  }

  lockRadius(pl: Player): number {
    if (!pl.lock) return 0;
    const a = this.actorById(pl.lock.actor);
    if (!a) return 0;
    if (pl.lock.part >= 0) return 0.5;
    return a.radius * a.scale;
  }

  private lockPoints(): { actor: number; part: number; pos: Vec3 }[] {
    const out: { actor: number; part: number; pos: Vec3 }[] = [];
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive || a.untargetable || a.hidden) continue;
      const lockableParts = a.parts.filter((p) => p.def.lockable && p.active && !p.broken);
      if (!lockableParts.length || !a.flags.has('parts_only')) out.push({ actor: a.id, part: -1, pos: this.lockPointPos(a.id, -1, v3())! });
      for (const p of lockableParts) out.push({ actor: a.id, part: p.index, pos: { ...p.center } });
    }
    return out;
  }

  pickLock(pl: Player, camYaw: number): { actor: number; part: number } | null {
    let best: { actor: number; part: number } | null = null;
    let bestScore = Infinity;
    for (const lp of this.lockPoints()) {
      const d = dist2D(pl.pos, lp.pos);
      if (d > 80) continue;
      const ang = Math.abs(wrapAngle(yawTo(pl.pos, lp.pos) - camYaw));
      const score = ang * 3 + d * 0.02 + (lp.part >= 0 ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { actor: lp.actor, part: lp.part };
      }
    }
    return best;
  }

  switchLock(pl: Player, dir: number, camYaw: number): { actor: number; part: number } | null {
    const pts = this.lockPoints();
    if (pts.length <= 1 || !pl.lock) return pl.lock;
    const cur = pts.find((p) => p.actor === pl.lock!.actor && p.part === pl.lock!.part);
    const curAng = cur ? wrapAngle(yawTo(pl.pos, cur.pos) - camYaw) : 0;
    let best: { actor: number; part: number } | null = null;
    let bestD = Infinity;
    for (const p of pts) {
      if (cur && p.actor === cur.actor && p.part === cur.part) continue;
      const a = wrapAngle(yawTo(pl.pos, p.pos) - camYaw);
      // dir +1 = to the right (negative yaw delta in this frame since +X is left)
      const delta = wrapAngle(curAng - a) * dir;
      const dd = delta > 0 ? delta : delta + Math.PI * 2;
      if (dd < bestD) {
        bestD = dd;
        best = { actor: p.actor, part: p.part };
      }
    }
    return best;
  }

  autoRelock(pl: Player): { actor: number; part: number } | null {
    if (!this.fight?.active) return null;
    const b = this.boss;
    if (b && b.alive && !b.hidden && !b.untargetable) return { actor: b.id, part: -1 };
    void pl;
    return null;
  }

  nearestEnemy(pos: Vec3, range: number, yaw: number, cone: number): Actor | null {
    let best: Actor | null = null;
    let bd = Infinity;
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive || a.hidden) continue;
      const d = dist2D(pos, a.pos) - a.radius * a.scale;
      if (d > range) continue;
      if (Math.abs(wrapAngle(yawTo(pos, a.pos) - yaw)) > cone && d > 1.5) continue;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Spawns                                                                                                            */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Execute a boss attack spawn entry. */
  bossSpawn(a: Actor, atk: AttackRuntime, s: SpawnDef): void {
    if (s.event) a.behavior?.onCustomEvent?.(a, this, s.event, s, atk);
    const origin = v3();
    if (s.part) a.anchorWorld(s.part, origin);
    else {
      origin.x = a.pos.x; origin.y = a.pos.y + a.height * a.scale * 0.55; origin.z = a.pos.z;
    }
    if (s.from) localToWorld(s.part ? origin : a.pos, a.yaw, s.from[0], s.from[1], s.from[2], origin, a.scale);
    const target = this.actorTargetPos(atk.targetId, atk.target);
    const flags = s.flags ?? [];
    const dmg = a.hitDamage(this, s.damage_mult ?? atk.def.damage_mult);
    switch (s.type) {
      case 'projectile': {
        const kind = this.c.projectile(s.id ?? 'orb');
        let count = Math.max(1, Math.round((s.count ?? 1) * (a.tod.spawn_mult ?? 1)));
        if (count < 1) count = 1;
        const speed = (s.speed ?? kind?.speed ?? 14) * (a.tod.projectile_speed_mult ?? 1);
        const baseYaw = s.at === 'ring_self' ? a.yaw : yawTo(origin, target);
        for (let i = 0; i < count; i++) {
          const yaw = s.at === 'ring_self' ? a.yaw + (i / count) * Math.PI * 2 : spawnYawSpread(baseYaw, i, count, s.spread ?? 0);
          const p = this.allocProjectile('enemy', a.id, s.id ?? 'orb');
          p.pos.x = origin.x; p.pos.y = origin.y; p.pos.z = origin.z;
          if (s.at === 'sky_above_target') {
            p.pos.x = target.x + this.rng.range(-3, 3); p.pos.z = target.z + this.rng.range(-3, 3); p.pos.y = target.y + 18;
          }
          const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
          const dh = Math.hypot(dx, dz);
          let pitch = s.pitch !== undefined ? s.pitch * DEG : Math.atan2(target.y + 1 - p.pos.y, Math.max(1, dh));
          if (s.gravity ?? kind?.gravity) pitch = s.pitch !== undefined ? s.pitch * DEG : 0.35;
          if (s.at === 'sky_above_target') pitch = -Math.PI / 2;
          const cp = Math.cos(pitch);
          p.vel.x = Math.sin(yaw) * cp * speed;
          p.vel.z = Math.cos(yaw) * cp * speed;
          p.vel.y = Math.sin(pitch) * speed;
          p.radius = s.radius ?? kind?.radius ?? 0.4;
          p.damage = dmg;
          p.mult = s.damage_mult ?? atk.def.damage_mult;
          p.poise = atk.def.poise;
          p.flags = ['projectile', ...flags];
          p.element = s.element ?? kind?.element ?? atk.def.element ?? 'physical';
          p.life = s.life ?? kind?.life ?? 4;
          p.homing = s.homing ?? kind?.homing ?? 0;
          p.gravity = s.gravity ?? kind?.gravity ?? 0;
          p.accel = s.accel ?? 0;
          p.target = atk.targetId;
          p.status = s.status;
          p.instance = atk.uid * 64 + 32 + (i % 31);
          p.explode = kind?.explode_radius ?? 0;
        }
        break;
      }
      case 'hazard':
      case 'beam':
      case 'shockwave': {
        const positions = this.spawnPositions(a, s, origin, target);
        const kind = s.id ? this.c.hazard(s.id) : undefined;
        positions.forEach((pp, i) => {
          const h = this.hazards.alloc();
          resetHazard(h);
          h.active = true;
          h.id = this.hazIds++;
          h.kind = s.id ?? (s.type === 'shockwave' ? 'shockwave' : s.type === 'beam' ? 'beam' : 'crack');
          h.visual = kind?.visual ?? (s.type === 'shockwave' ? 'circle' : 'crack');
          h.color = kind?.color ?? '#ff9a5a';
          h.element = s.element ?? kind?.element ?? atk.def.element ?? 'physical';
          h.team = 'enemy';
          h.owner = a.id;
          h.pos.x = pp.x; h.pos.y = this.groundAt(pp.x, pp.z); h.pos.z = pp.z;
          h.yaw = pp.yaw;
          h.shape = s.shape ?? (s.type === 'shockwave' ? { type: 'ring', r0: 0.5, r1: s.radius ?? 10, width: 1.4, height: 0.8 } : { type: 'cylinder', c: [0, 0, 0], r: s.radius ?? 2, h: 4 });
          h.delay = s.delay ?? (s.type === 'shockwave' ? 0 : 0.8);
          h.activeDur = s.active ?? (s.type === 'shockwave' ? 0.9 : 0.4);
          h.damage = dmg;
          h.mult = s.damage_mult ?? atk.def.damage_mult;
          h.poise = atk.def.poise;
          h.flags = [...flags];
          h.status = s.status;
          h.tick = flags.includes('dot') ? 0.5 : 0;
          h.pull = s.pull ?? 0;
          h.instance = atk.uid * 64 + 16 + (i % 15);
          if (s.speed) {
            forward(pp.yaw, tmp);
            h.vel.x = tmp.x * s.speed; h.vel.z = tmp.z * s.speed;
          }
          this.emit({ type: 'hazard', id: h.id, kind: h.kind });
          if (s.type === 'shockwave') this.emit({ type: 'shockwave', pos: { ...h.pos }, radius: (h.shape as any).r1 ?? 8, element: h.element });
        });
        break;
      }
      case 'minion': {
        const md = (a.bossDef?.minions ?? []).find((m) => m.id === s.id);
        if (!md) break;
        if (this.meta.active && this.meta.noBossHeal) break;
        const count = Math.max(1, Math.round((s.count ?? 1) * (a.tod.spawn_mult ?? 1)));
        for (let i = 0; i < count; i++) {
          const ang = a.yaw + (i - (count - 1) / 2) * 0.9;
          const d = s.dist ?? a.radius * a.scale + 2;
          this.spawnMinion(md, { x: a.pos.x + Math.sin(ang) * d, y: a.pos.y, z: a.pos.z + Math.cos(ang) * d }, a, s.life ?? -1);
        }
        break;
      }
      case 'vfx':
        this.emit({ type: 'vfx', id: s.vfx ?? s.id ?? 'generic', pos: { ...origin } });
        break;
      case 'sfx':
        this.emit({ type: 'sfx', id: s.sfx ?? s.id ?? 'generic', pos: { ...origin } });
        break;
      case 'custom':
        if (!s.event && s.id) a.behavior?.onCustomEvent?.(a, this, s.id, s, atk);
        break;
    }
    if (s.vfx && s.type !== 'vfx') this.emit({ type: 'vfx', id: s.vfx, pos: { ...origin } });
    if (s.sfx && s.type !== 'sfx') this.emit({ type: 'sfx', id: s.sfx, pos: { ...origin } });
  }

  private spawnPositions(a: Actor, s: SpawnDef, origin: Vec3, target: Vec3): { x: number; z: number; yaw: number }[] {
    const count = Math.max(1, Math.round((s.count ?? 1) * (s.type === 'hazard' ? 1 : 1)));
    const out: { x: number; z: number; yaw: number }[] = [];
    const yawToT = yawTo(a.pos, target);
    const at = s.at ?? (s.type === 'shockwave' ? 'self' : s.type === 'beam' ? 'self' : 'target');
    const dist = s.dist ?? 3;
    switch (at) {
      case 'self':
      case 'part':
        for (let i = 0; i < count; i++) out.push({ x: s.part || s.from ? origin.x : a.pos.x, z: s.part || s.from ? origin.z : a.pos.z, yaw: a.yaw });
        break;
      case 'front': {
        forward(a.yaw, tmp);
        for (let i = 0; i < count; i++) out.push({ x: a.pos.x + tmp.x * (dist + i * dist), z: a.pos.z + tmp.z * (dist + i * dist), yaw: a.yaw });
        break;
      }
      case 'target':
        for (let i = 0; i < count; i++) out.push({ x: target.x, z: target.z, yaw: yawToT });
        break;
      case 'target_predict': {
        const v = this.actorTargetVel(a.targetId);
        const lead = s.delay ?? 0.8;
        for (let i = 0; i < count; i++) out.push({ x: target.x + v.x * lead * 0.6, z: target.z + v.z * lead * 0.6, yaw: yawToT });
        break;
      }
      case 'around_target': {
        const r = dist;
        const off = this.rng.range(0, Math.PI * 2);
        for (let i = 0; i < count; i++) {
          const ang = off + (i / count) * Math.PI * 2;
          out.push({ x: target.x + Math.sin(ang) * r, z: target.z + Math.cos(ang) * r, yaw: ang });
        }
        if (count > 1 && s.radius === undefined) out.push({ x: target.x, z: target.z, yaw: 0 });
        break;
      }
      case 'line_to_target': {
        const d = dist2D(a.pos, target);
        for (let i = 0; i < count; i++) {
          const k = (i + 1) / count;
          const dd = Math.min(d + 4, (s.dist ?? (d + 4) / count) * (i + 1));
          void k;
          out.push({ x: a.pos.x + Math.sin(yawToT) * dd, z: a.pos.z + Math.cos(yawToT) * dd, yaw: yawToT });
        }
        break;
      }
      case 'random_arena':
        for (let i = 0; i < count; i++) {
          const p = i === 0 && count > 2 ? { ...target } : this.randomArenaPoint(0, target);
          out.push({ x: p.x, z: p.z, yaw: this.rng.range(-Math.PI, Math.PI) });
        }
        break;
      case 'ring_self':
        for (let i = 0; i < count; i++) {
          const ang = a.yaw + (i / count) * Math.PI * 2;
          out.push({ x: a.pos.x + Math.sin(ang) * dist, z: a.pos.z + Math.cos(ang) * dist, yaw: ang });
        }
        break;
      case 'grid': {
        const c = this.arenaCenter();
        const n = Math.max(1, Math.round(Math.sqrt(count)));
        const sp = dist;
        const shift = this.rng.chance(0.5) ? sp / 2 : 0;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ x: c.x + (i - (n - 1) / 2) * sp + shift, z: c.z + (j - (n - 1) / 2) * sp + shift, yaw: 0 });
        break;
      }
      case 'sky_above_target':
        for (let i = 0; i < count; i++) out.push({ x: target.x + this.rng.range(-2, 2) * (i > 0 ? 2 : 0), z: target.z + this.rng.range(-2, 2) * (i > 0 ? 2 : 0), yaw: 0 });
        break;
      case 'arena_center': {
        const c = this.arenaCenter();
        for (let i = 0; i < count; i++) out.push({ x: c.x, z: c.z, yaw: 0 });
        break;
      }
    }
    return out;
  }

  spawnMinion(md: MinionDef, pos: Vec3, owner: Actor, life: number): Actor {
    const behaviorF = this.behaviors[`${owner.defId}:${md.id}`];
    const m = new Actor('minion', md, pos, 'enemy', behaviorF ? behaviorF() : null, Math.max(1, md.hp * owner.hpMax), false);
    m.yaw = yawTo(pos, this.player.pos);
    m.ownerId = owner.id;
    m.mainShare = md.main_share ?? 0;
    m.lifetime = life;
    m.idleTimer = 0.8;
    m.pos.y = this.groundAt(pos.x, pos.z);
    m.behavior?.init?.(m, this);
    this.actors.push(m);
    this.emit({ type: 'vfx', id: 'minion_spawn', pos: { ...pos } });
    return m;
  }

  allocProjectile(team: 'enemy' | 'player', owner: number, kind: string): Projectile {
    const p = this.projectiles.alloc();
    const k = this.c.projectile(kind);
    p.active = true;
    p.id = this.projIds++;
    p.kind = kind;
    p.visual = k?.visual ?? 'orb';
    p.color = k?.color ?? '#ffffff';
    p.team = team;
    p.owner = owner;
    p.age = 0;
    p.hit.clear();
    p.returns = false;
    p.returning = false;
    p.pierce = false;
    p.explode = 0;
    p.status = undefined;
    p.tag = '';
    p.eco = 0;
    p.art = '';
    p.scale = 1;
    p.accel = 0;
    p.gravity = 0;
    p.homing = 0;
    p.targetPart = -1;
    this.emit({ type: 'projectile', id: p.id, kind, team });
    return p;
  }

  firePlayerProjectile(pl: Player, sw: SwingRuntime, spec: NonNullable<SwingDef['projectile']>): void {
    const count = spec.count ?? 1;
    const origin = { x: pl.pos.x, y: pl.pos.y + 1.3 * pl.scale, z: pl.pos.z };
    const lock = pl.lock ? this.lockPointPos(pl.lock.actor, pl.lock.part, v3()) : null;
    // aim assist: locked target, else nearest enemy in a 35-degree cone
    let aim = lock;
    if (!aim) {
      const t = this.nearestEnemy(pl.pos, 60, pl.yaw, 35 * DEG);
      if (t) aim = this.lockPointPos(t.id, -1, v3());
    }
    const baseYaw = aim ? yawTo(origin, aim) : pl.yaw;
    if (aim) pl.yaw = baseYaw;
    for (let i = 0; i < count; i++) {
      const p = this.allocProjectile('player', -1, spec.kind);
      const yaw = spawnYawSpread(baseYaw, i, count, spec.spread ?? 0);
      p.pos.x = origin.x; p.pos.y = origin.y; p.pos.z = origin.z;
      const dh = aim ? Math.hypot(aim.x - origin.x, aim.z - origin.z) : 10;
      const pitch = aim ? Math.atan2(aim.y - origin.y, Math.max(0.5, dh)) + (spec.gravity ? 0.12 : 0) : 0;
      p.vel.x = Math.sin(yaw) * Math.cos(pitch) * spec.speed;
      p.vel.z = Math.cos(yaw) * Math.cos(pitch) * spec.speed;
      p.vel.y = Math.sin(pitch) * spec.speed;
      p.radius = spec.radius * Math.max(0.5, pl.scale);
      p.damage = (sw.damage / count) * pl.outgoingMult(this) * (count > 1 ? 1.4 : 1);
      p.poise = sw.poise / count;
      p.flags = ['projectile'];
      p.element = sw.def.element ?? this.c.projectile(spec.kind)?.element ?? 'physical';
      p.life = spec.life;
      p.gravity = spec.gravity ?? 0;
      p.homing = spec.homing ?? (aim ? 1.2 : 0);
      p.target = pl.lock?.actor ?? -99;
      p.targetPart = pl.lock?.part ?? -1;
      p.pierce = !!spec.pierce;
      p.explode = spec.explode_radius ?? 0;
      p.instance = sw.uid;
      p.eco = sw.eco / count;
      p.returns = !!spec.returns;
      p.maxDist = spec.returns ? spec.speed * spec.life * 0.4 : 0;
      p.origin = { ...origin };
      p.scale = pl.scale;
    }
  }

  firePlayerArtProjectile(pl: Player, art: ArtRuntime, kind: string, o: { count: number; spread: number; speed: number; accel?: number; explode?: number; pierce?: boolean; homing?: number; status?: string; mult: number; life?: number; returns?: boolean; maxDist?: number; sequential?: number }): void {
    const k = this.c.projectile(kind);
    const origin = { x: pl.pos.x, y: pl.pos.y + 1.2 * Math.max(0.3, pl.scale), z: pl.pos.z };
    const lock = pl.lock ? this.lockPointPos(pl.lock.actor, pl.lock.part, v3()) : null;
    const baseYaw = lock ? yawTo(origin, lock) : pl.yaw;
    const count = Math.max(1, Math.round(o.count));
    for (let i = 0; i < count; i++) {
      const p = this.allocProjectile('player', -1, kind);
      const yaw = spawnYawSpread(baseYaw, i, count, o.spread);
      p.pos.x = origin.x; p.pos.y = origin.y; p.pos.z = origin.z;
      const dh = lock ? Math.hypot(lock.x - origin.x, lock.z - origin.z) : 10;
      const pitch = lock ? Math.atan2(lock.y - origin.y, Math.max(0.5, dh)) : 0;
      p.vel.x = Math.sin(yaw) * Math.cos(pitch) * o.speed;
      p.vel.z = Math.cos(yaw) * Math.cos(pitch) * o.speed;
      p.vel.y = Math.sin(pitch) * o.speed;
      p.radius = (k?.radius ?? 0.5) * Math.max(0.5, pl.scale);
      p.damage = art.damage * o.mult / (count > 1 ? count * 0.55 : 1);
      p.poise = i === 0 ? art.poiseLeft : 0;
      if (i === 0) art.poiseLeft = 0;
      p.flags = ['projectile'];
      p.element = k?.element ?? 'physical';
      p.life = o.life ?? k?.life ?? 2.5;
      p.accel = o.accel ?? 0;
      p.homing = o.homing ?? (lock ? 1.5 : 0);
      p.target = pl.lock?.actor ?? -99;
      p.targetPart = pl.lock?.part ?? -1;
      p.pierce = !!o.pierce;
      p.explode = o.explode ?? k?.explode_radius ?? 0;
      p.instance = art.uid;
      p.art = art.def.id;
      p.returns = !!o.returns;
      p.maxDist = o.maxDist ?? 0;
      p.origin = { ...origin };
      p.status = o.status ? { kind: o.status as StatusKind, dur: 3, power: 0.4 } : undefined;
      p.scale = pl.scale;
      if (o.sequential) p.age = -i * o.sequential;
    }
  }

  private playerHazard(pl: Player, art: ArtRuntime, pos: Vec3, shape: ShapeDef, delay: number, active: number, damage: number, visual: string, tick: number): Hazard {
    const h = this.hazards.alloc();
    resetHazard(h);
    h.active = true;
    h.id = this.hazIds++;
    h.kind = `art_${visual}`;
    h.visual = visual;
    h.color = '#ffd27a';
    h.team = 'player';
    h.owner = -1;
    h.pos.x = pos.x; h.pos.z = pos.z; h.pos.y = this.groundAt(pos.x, pos.z);
    h.yaw = pl.yaw;
    h.shape = shape;
    h.delay = delay;
    h.activeDur = active;
    h.damage = damage;
    h.tick = tick;
    h.instance = art.uid;
    h.art = art.def.id;
    h.element = (art.def.params.element as any) ?? 'physical';
    h.poise = art.poiseLeft;
    art.poiseLeft = 0;
    this.emit({ type: 'hazard', id: h.id, kind: h.kind });
    return h;
  }

  spawnPlayerRain(pl: Player, art: ArtRuntime, center: Vec3, count: number, radius: number, delay: number, visual: string): void {
    for (let i = 0; i < count; i++) {
      const ang = this.rng.range(0, Math.PI * 2), r = Math.sqrt(this.rng.next()) * radius;
      this.playerHazard(pl, art, { x: center.x + Math.sin(ang) * r, y: 0, z: center.z + Math.cos(ang) * r }, { type: 'cylinder', c: [0, 0, 0], r: 0.9, h: 30 }, delay + i * 0.04, 0.15, art.damage / Math.max(1, count * 0.5), visual, 0);
    }
  }

  spawnPlayerWave(pl: Player, art: ArtRuntime, o: { kind: string; length: number; width: number; speed: number; visual: string; status: string; radius: number }): void {
    if (o.kind === 'ring') {
      const h = this.playerHazard(pl, art, pl.pos, { type: 'ring', r0: 0.5, r1: o.radius, width: o.width, height: 1.5 }, 0, 0.6, art.damage, o.visual, 0);
      if (o.status) h.status = { kind: o.status as StatusKind, dur: 3, power: 0.4 };
      return;
    }
    forward(pl.yaw, tmp);
    const h = this.playerHazard(pl, art, { x: pl.pos.x + tmp.x * 1.2, y: 0, z: pl.pos.z + tmp.z * 1.2 }, { type: 'box', c: [0, 0.5, 0], half: [o.width / 2, 1.2, 0.8] }, 0, o.length / o.speed, art.damage, o.visual, 0);
    h.vel.x = tmp.x * o.speed;
    h.vel.z = tmp.z * o.speed;
    if (o.status) h.status = { kind: o.status as StatusKind, dur: 3, power: 0.4 };
    if (o.kind === 'fissure') h.tag = 'fissure';
  }

  spawnPlayerZone(pl: Player, art: ArtRuntime, pos: Vec3, radius: number, time: number, visual: string, dpsMult: number, status: string): void {
    const h = this.playerHazard(pl, art, pos, { type: 'cylinder', c: [0, -0.5, 0], r: radius, h: 3 }, 0.1, time, art.damage * dpsMult * 0.5, visual, 0.5);
    if (status) h.status = { kind: status as StatusKind, dur: 1.2, power: 0.4 };
  }

  spawnPlayerBind(pl: Player, art: ArtRuntime, pos: Vec3, radius: number, delay: number, bindTime: number, visual: string): void {
    const h = this.playerHazard(pl, art, pos, { type: 'cylinder', c: [0, -0.5, 0], r: radius, h: 6 }, delay, 0.5, art.damage, visual, 0);
    h.bind = bindTime;
  }

  spawnPlayerVortex(pl: Player, art: ArtRuntime, pos: Vec3, radius: number, time: number, pull: number, dpsMult: number, visual: string): void {
    const h = this.playerHazard(pl, art, pos, { type: 'cylinder', c: [0, -1, 0], r: radius, h: 8 }, 0.05, time, art.damage * dpsMult * 0.4, visual, 0.4);
    h.pull = pull;
  }

  addBarrier(pos: Vec3, yaw: number, width: number, time: number): void {
    const b = this.barriers.alloc();
    b.active = true;
    b.pos = { ...pos };
    b.yaw = yaw;
    b.half = width / 2;
    b.height = 3.5;
    b.life = time;
    b.team = 'player';
    this.emit({ type: 'vfx', id: 'barrier', pos: { ...pos } });
  }

  spawnDecoy(pos: Vec3, yaw: number, time: number): void {
    const def: MinionDef = {
      id: 'decoy', hp: 0.01, body: { radius: 0.4, height: 1.8 }, move: { walk: 0, run: 0, turn: 0, preferred_range: [0, 0] }, attacks: [], idle_gap: [99, 99],
      model: { builder: 'decoy', rig: 'humanoid', scale: 1, palette: 'mirror' },
    };
    const d = new Actor('decoy', def, pos, 'player', null, 1, false);
    d.yaw = yaw;
    d.lifetime = time;
    d.state = 'scripted';
    this.actors.push(d);
    this.emit({ type: 'vfx', id: 'decoy_spawn', pos: { ...pos } });
  }

  spawnPlayerClones(n: number): void {
    for (let i = 0; i < n; i++) {
      const def: MinionDef = {
        id: 'clone', hp: 0.01, body: { radius: 0.4, height: 1.8 }, move: { walk: 0, run: 0, turn: 0, preferred_range: [0, 0] }, attacks: [], idle_gap: [99, 99],
        model: { builder: 'clone', rig: 'humanoid', scale: 1, palette: 'mirror' },
      };
      const c = new Actor('clone', def, this.player.pos, 'player', null, 1, false);
      c.bstate.side = i === 0 ? 1 : -1;
      c.state = 'scripted';
      this.actors.push(c);
    }
  }

  removePlayerClones(): void {
    this.actors = this.actors.filter((a) => a.kind !== 'clone');
  }

  /** Clones mirror the player's swing (position offset left/right). */
  mirrorClones(sw: SwingRuntime): void {
    void sw;
  }

  private updateClones(): void {
    for (const c of this.actors) {
      if (c.kind !== 'clone') continue;
      const side = c.bstate.side as number;
      const off = 1.8 * Math.max(0.6, this.player.scale);
      c.prevPos = { ...c.pos };
      localToWorld(this.player.pos, this.player.yaw, side * off, 0, -0.4, c.pos);
      c.pos.y = this.player.pos.y;
      c.yaw = this.player.yaw;
      c.anim = this.player.state;
    }
  }

  dispelIllusions(pl: Player, art: ArtRuntime): void {
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive) continue;
      if (a.flags.has('illusion')) {
        killActor(this, a);
        this.emit({ type: 'vfx', id: 'dispel', pos: { ...a.pos } });
      } else if (a.flags.has('illusionist')) {
        applyDamageToActor(this, a, { source: -1, target: a.id, amount: art.damage * 0.8, poise: 15, element: 'light', flags: [], pos: { ...a.pos }, instance: art.uid + 7, part: -1, kind: 'art' }, null);
        this.emit({ type: 'vfx', id: 'dispel', pos: { ...a.pos } });
      }
    }
    void pl;
  }

  chainLightning(pl: Player, art: ArtRuntime, bounces: number, range: number): void {
    const targets: { a: Actor; part: PartRuntime | null; pos: Vec3 }[] = [];
    const first = pl.lock ? this.actorById(pl.lock.actor) : this.nearestEnemy(pl.pos, range, pl.yaw, Math.PI);
    if (!first) return;
    let from = { x: pl.pos.x, y: pl.pos.y + 1.2, z: pl.pos.z };
    const pool: { a: Actor; part: PartRuntime | null }[] = [];
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive || a.hidden) continue;
      pool.push({ a, part: null });
      for (const p of a.parts) if (p.active && !p.broken) pool.push({ a, part: p });
    }
    let cur: { a: Actor; part: PartRuntime | null } = { a: first, part: null };
    for (let i = 0; i <= bounces; i++) {
      const pos = cur.part ? { ...cur.part.center } : { x: cur.a.pos.x, y: cur.a.pos.y + cur.a.height * cur.a.scale * 0.5, z: cur.a.pos.z };
      targets.push({ a: cur.a, part: cur.part, pos });
      this.emit({ type: 'vfx', id: 'lightning_arc', pos: from, params: { tx: pos.x, ty: pos.y, tz: pos.z } });
      from = pos;
      const next = pool.filter((p) => !(p.a === cur.a && p.part === cur.part));
      if (!next.length) {
        // single target: the bolt re-strikes it
        continue;
      }
      cur = next[(i * 7 + 3) % next.length];
    }
    targets.forEach((t, i) => {
      applyDamageToActor(this, t.a, { source: -1, target: t.a.id, amount: art.damage / (1 + i * 0.15) / Math.max(1, (bounces + 1) * 0.6), poise: i === 0 ? art.poiseLeft : 0, element: 'lightning', flags: [], pos: t.pos, instance: art.uid + i, part: t.part?.index ?? -1, kind: 'art' }, t.part);
      if (i === 0) art.poiseLeft = 0;
    });
    pl.onHitLanded(this, null);
  }

  pushEnemies(pos: Vec3, radius: number, strength: number): void {
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive) continue;
      const d = dist2D(pos, a.pos);
      if (d > radius + a.radius * a.scale) continue;
      const k = a.mass === 'light' ? 1 : a.mass === 'heavy' ? 0.15 : 0;
      if (k <= 0 || d < 1e-3) continue;
      a.pos.x += ((a.pos.x - pos.x) / d) * strength * k;
      a.pos.z += ((a.pos.z - pos.z) / d) * strength * k;
      this.clampActor(a);
    }
  }

  slowEnemies(pos: Vec3, radius: number, time: number, power: number): void {
    for (const a of this.actors) {
      if (a.team !== 'enemy' || !a.alive) continue;
      if (dist2D(pos, a.pos) > radius + a.radius * a.scale) continue;
      a.slowed = Math.max(a.slowed, time);
      a.slowPower = power;
    }
  }

  pullEnemyToward(pl: Player, targetId: number, pull: number, hold: number): void {
    const a = (targetId >= 0 ? this.actorById(targetId) : null) ?? this.nearestEnemy(pl.pos, 14, pl.yaw, 40 * DEG);
    if (!a) return;
    const k = a.mass === 'light' ? 1 : a.mass === 'heavy' ? 0.35 : 0;
    const d = dist2D(pl.pos, a.pos) - a.radius * a.scale - 1;
    const mv = Math.max(0, Math.min(pull * k, d));
    if (mv > 0) {
      const y = yawTo(a.pos, pl.pos);
      a.pos.x += Math.sin(y) * mv;
      a.pos.z += Math.cos(y) * mv;
      this.clampActor(a);
    }
    if (hold > 0) a.bound = Math.max(a.bound, hold * (a.mass === 'light' ? 1 : 0.6));
    else a.bound = Math.max(a.bound, 0.35);
  }

  applyDotToTarget(pl: Player, targetId: number, dps: number, time: number, element: string): void {
    const a = (targetId >= 0 ? this.actorById(targetId) : null) ?? this.nearestEnemy(pl.pos, 6, pl.yaw, Math.PI);
    if (!a) return;
    a.dots.push({ dps, time, element });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Projectiles & hazards                                                                                             */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private updateProjectiles(dt: number): void {
    this.updateClones();
    this.projectiles.forEachActive((p) => {
      p.age += dt;
      if (p.age < 0) return; // sequential volleys
      p.prevPos.x = p.pos.x; p.prevPos.y = p.pos.y; p.prevPos.z = p.pos.z;
      if (p.age > p.life) {
        if (p.explode > 0) this.explode(p);
        p.active = false;
        return;
      }
      // returning (chakram, trident, harpoon)
      if (p.returns) {
        const traveled = Math.hypot(p.pos.x - p.origin.x, p.pos.z - p.origin.z);
        if (!p.returning && (traveled >= p.maxDist || p.age > p.life * 0.45)) {
          p.returning = true;
          p.hit.clear();
        }
        if (p.returning) {
          const tgt = p.team === 'player' ? this.player.pos : this.actorById(p.owner)?.pos ?? p.origin;
          const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 20;
          const dx = tgt.x - p.pos.x, dy = tgt.y + 1.2 - p.pos.y, dz = tgt.z - p.pos.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < 1.2) {
            p.active = false;
            return;
          }
          p.vel.x = (dx / d) * sp; p.vel.y = (dy / d) * sp; p.vel.z = (dz / d) * sp;
        }
      }
      // homing toward target
      if (p.homing > 0 && !p.returning) {
        let tgt: Vec3 | null = null;
        if (p.team === 'enemy') tgt = p.target === -1 ? { x: this.player.pos.x, y: this.player.pos.y + 1, z: this.player.pos.z } : this.actorById(p.target)?.pos ?? null;
        else if (p.target >= 0) tgt = this.lockPointPos(p.target, p.targetPart, v3());
        if (tgt) {
          const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
          const dx = tgt.x - p.pos.x, dy = tgt.y - p.pos.y, dz = tgt.z - p.pos.z;
          const d = Math.hypot(dx, dy, dz) || 1;
          const k = Math.min(1, p.homing * dt);
          p.vel.x += ((dx / d) * sp - p.vel.x) * k;
          p.vel.y += ((dy / d) * sp - p.vel.y) * k;
          p.vel.z += ((dz / d) * sp - p.vel.z) * k;
        }
      }
      if (p.accel) {
        const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
        const ns = sp + p.accel * dt;
        p.vel.x *= ns / sp; p.vel.y *= ns / sp; p.vel.z *= ns / sp;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      // ground / arena bounds
      const g = this.groundAt(p.pos.x, p.pos.z);
      if (p.pos.y < g - 0.2 && !p.returns) {
        if (p.explode > 0) this.explode(p);
        else this.emit({ type: 'projectileHit', kind: p.kind, pos: { ...p.pos } });
        p.active = false;
        return;
      }
      const arena = this.zone?.metaSpace ?? this.zone?.activeArena;
      if (arena && !insideArena(arena, p.pos.x, p.pos.z, -6)) {
        p.active = false;
        return;
      }
      // barriers stop enemy projectiles
      if (p.team === 'enemy') {
        let blocked = false;
        this.barriers.forEachActive((b) => {
          if (blocked) return;
          const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
          const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          if (Math.abs(lx) <= b.half && Math.abs(lz) <= 0.6 + p.radius && p.pos.y < b.pos.y + b.height) blocked = true;
        });
        if (blocked) {
          this.emit({ type: 'projectileHit', kind: p.kind, pos: { ...p.pos } });
          this.emit({ type: 'block', pos: { ...p.pos }, amount: 0 });
          p.active = false;
          return;
        }
        this.projectileVsPlayerSide(p);
      } else {
        this.projectileVsEnemies(p);
      }
    });
  }

  private projectileVsPlayerSide(p: Projectile): void {
    // swept sphere vs the player capsule
    const pv = this.player.volume(vol, this);
    const shape: ShapeDef = { type: 'capsule', a: [p.prevPos.x, p.prevPos.y, p.prevPos.z], b: [p.pos.x, p.pos.y, p.pos.z], r: p.radius };
    const origin = { x: 0, y: 0, z: 0 };
    if (this.player.state !== 'dead' && !p.hit.has(-1) && shapeHits(shape, origin, 0, 1, 0, pv, contact)) {
      const attacker = this.actorById(p.owner) ?? null;
      const res = damagePlayer(this, attacker, {
        source: p.owner, target: -1, amount: p.damage, poise: p.poise, element: p.element, flags: p.flags, pos: { ...contact }, instance: p.instance, part: -1,
        status: p.status, mult: p.mult,
      });
      if (res === 'avoided' || res === 'dodged') {
        p.hit.add(-1);
        return;
      }
      this.emit({ type: 'projectileHit', kind: p.kind, pos: { ...contact } });
      if (p.explode > 0) this.explode(p);
      if (!p.pierce) p.active = false;
      else p.hit.add(-1);
      return;
    }
    for (const o of this.actors) {
      if (o.team !== 'player' || !o.alive || o.kind === 'ally' || p.hit.has(o.id)) continue;
      vol.x = o.pos.x; vol.y = o.pos.y; vol.z = o.pos.z; vol.r = o.radius; vol.h = o.height;
      if (shapeHits(shape, origin, 0, 1, 0, vol, contact)) {
        const attacker = this.actorById(p.owner);
        if (attacker) this.damageTarget(attacker, { source: p.owner, target: o.id, amount: p.damage, poise: p.poise, element: p.element, flags: p.flags, pos: { ...contact }, instance: p.instance, part: -1 });
        p.hit.add(o.id);
        if (!p.pierce) p.active = false;
        return;
      }
    }
  }

  private projectileVsEnemies(p: Projectile): void {
    const shape: ShapeDef = { type: 'capsule', a: [p.prevPos.x, p.prevPos.y, p.prevPos.z], b: [p.pos.x, p.pos.y, p.pos.z], r: p.radius };
    const origin = { x: 0, y: 0, z: 0 };
    const n = this.hitActorWithShape(origin, 0, 1, shape, 0, (id) => p.hit.has(id), (a, part, pos) => {
      p.hit.add(a.id);
      const dealt = applyDamageToActor(this, a, { source: -1, target: a.id, amount: p.damage, poise: p.poise, element: p.element, flags: [], pos, instance: p.instance, part: part?.index ?? -1, kind: p.art ? 'art' : 'light', status: p.status }, part);
      p.poise = 0;
      if (p.eco > 0 && dealt > 0) this.player.gainEco(this, p.eco);
      this.player.onHitLanded(this, null);
      this.emit({ type: 'projectileHit', kind: p.kind, pos });
      this.emit({ type: 'haptic', pattern: 'hit' });
    });
    if (n > 0) {
      if (p.explode > 0) this.explode(p);
      if (!p.pierce) p.active = false;
    }
  }

  private explode(p: Projectile): void {
    const r = p.explode * Math.max(0.5, p.scale);
    this.emit({ type: 'explosion', pos: { ...p.pos }, radius: r, element: p.element });
    const shape: ShapeDef = { type: 'sphere', c: [p.pos.x, p.pos.y, p.pos.z], r };
    const origin = { x: 0, y: 0, z: 0 };
    if (p.team === 'player') {
      this.hitActorWithShape(origin, 0, 1, shape, 0, (id) => p.hit.has(id + 100000), (a, part, pos) => {
        p.hit.add(a.id + 100000);
        applyDamageToActor(this, a, { source: -1, target: a.id, amount: p.damage * 0.6, poise: 0, element: p.element, flags: [], pos, instance: p.instance + 1, part: part?.index ?? -1, kind: 'art' }, part);
      });
    } else {
      const pv = this.player.volume(vol, this);
      if (shapeHits(shape, origin, 0, 1, 0, pv, contact) && !p.hit.has(-1)) {
        damagePlayer(this, this.actorById(p.owner) ?? null, { source: p.owner, target: -1, amount: p.damage * 0.7, poise: p.poise, element: p.element, flags: p.flags.filter((f) => f !== 'projectile'), pos: { ...contact }, instance: p.instance + 1, part: -1, mult: p.mult });
      }
    }
  }

  private updateHazards(dt: number): void {
    this.hazards.forEachActive((h) => {
      h.age += dt;
      if (h.vel.x || h.vel.z) {
        h.pos.x += h.vel.x * dt;
        h.pos.z += h.vel.z * dt;
        h.pos.y = this.groundAt(h.pos.x, h.pos.z);
      }
      if (!h.permanent && h.age > h.delay + h.activeDur) {
        h.active = false;
        return;
      }
      if (h.age < h.delay) return;
      const progress = (h.age - h.delay) / Math.max(1e-3, h.activeDur);
      if (h.team === 'enemy') {
        if (this.player.state === 'dead' || this.fight?.intro) return;
        if (this.zone?.metaSpace && h.permanent) return;
        if (h.pull > 0) this.pullPlayerToward(h.pos, h.pull, this.hazardRadius(h) + 4, dt);
        const pv = this.player.volume(vol, this);
        if (h.tick > 0) {
          const last = h.lastHit.get(-1) ?? -999;
          if (h.age - last < h.tick) return;
        } else if (h.hitOnce.has(-1)) return;
        if (!shapeHits(h.shape, h.pos, h.yaw, 1, progress, pv, contact)) return;
        const attacker = this.actorById(h.owner) ?? null;
        const res = damagePlayer(this, attacker, {
          source: h.owner, target: -1, amount: h.tick > 0 ? h.damage * h.tick : h.damage, poise: h.tick > 0 ? 0 : h.poise, element: h.element,
          flags: h.flags, pos: { ...contact }, instance: h.instance, part: -1, status: h.status, mult: h.mult,
        });
        if (h.tick > 0) h.lastHit.set(-1, h.age);
        else if (res === 'dodged' || res === 'hit' || res === 'blocked' || res === 'parried' || res === 'absorbed') h.hitOnce.add(-1);
      } else {
        this.hitActorWithShape(h.pos, h.yaw, 1, h.shape, progress, (id) => {
          if (h.tick > 0) return h.age - (h.lastHit.get(id) ?? -999) < h.tick;
          return h.hitOnce.has(id);
        }, (a, part, pos) => {
          if (h.tick > 0) h.lastHit.set(a.id, h.age);
          else h.hitOnce.add(a.id);
          applyDamageToActor(this, a, { source: -1, target: a.id, amount: h.damage, poise: h.poise, element: h.element, flags: [], pos, instance: h.instance, part: part?.index ?? -1, kind: 'art', status: h.status }, part);
          h.poise = 0;
          if (h.bind > 0) {
            a.bound = Math.max(a.bound, h.bind * (a.mass === 'light' ? 1 : a.mass === 'heavy' ? 0.7 : 0.45));
            this.emit({ type: 'vfx', id: 'bind', pos: { ...a.pos } });
          }
          if (h.pull > 0) {
            const d = dist2D(h.pos, a.pos);
            if (d > 0.5 && a.mass === 'light') {
              a.pos.x += ((h.pos.x - a.pos.x) / d) * h.pull * 0.1;
              a.pos.z += ((h.pos.z - a.pos.z) / d) * h.pull * 0.1;
            }
            a.slowed = Math.max(a.slowed, 0.6);
            a.slowPower = 0.4;
          }
          this.player.onHitLanded(this, null);
        });
      }
    });
  }

  /** Static arena hazards (lava pools etc.) — spawned at fight start or phase change by behaviors. */
  addStaticHazard(kind: string, shape: ShapeDef, dpsMult: number, status?: StatusKind): Hazard {
    const h = this.hazards.alloc();
    resetHazard(h);
    const k = this.c.hazard(kind);
    h.active = true;
    h.id = this.hazIds++;
    h.kind = kind;
    h.visual = k?.visual ?? 'lava';
    h.color = k?.color ?? '#ff6a2a';
    h.team = 'enemy';
    h.owner = this.boss?.id ?? -2;
    h.pos.x = 0; h.pos.y = 0; h.pos.z = 0;
    h.shape = shape;
    h.permanent = true;
    h.tick = 0.5;
    h.damage = (this.boss ? this.boss.hitDamage(this, 1) : 10) * dpsMult;
    h.status = status ? { kind: status, dur: 1.5, power: 0.4 } : undefined;
    h.element = k?.element ?? 'fire';
    h.instance = nextAttackUid() * 64;
    this.emit({ type: 'hazard', id: h.id, kind });
    return h;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Metamondo space                                                                                                   */
  /* ---------------------------------------------------------------------------------------------------------------- */

  enterMetamondoSpace(): void {
    if (!this.zone) return;
    const pl = this.player;
    const b = this.boss;
    const cx = b ? (pl.pos.x + b.pos.x) / 2 : pl.pos.x;
    const cz = b ? (pl.pos.z + b.pos.z) / 2 : pl.pos.z;
    const floor = this.zone.activeArena?.floor ?? pl.pos.y;
    const R = Math.max(16, b ? b.radius * b.scale * 3 + 10 : 16);
    this.zone.metaSpace = { id: 'metamondo', cx, cz, floor, shape: 'circle', radius: R, hx: R, hz: R, yaw: 0, poly: [] };
    pl.pos.y = floor;
    if (b && !b.airborne) b.pos.y = floor;
  }

  exitMetamondoSpace(): void {
    if (!this.zone) return;
    this.zone.metaSpace = null;
    const pl = this.player;
    pl.pos = { ...this.meta.savedPlayer };
    pl.prevPos = { ...pl.pos };
    if (this.boss && this.boss.alive) {
      this.boss.pos = { ...this.meta.savedBoss };
      this.boss.prevPos = { ...this.boss.pos };
    }
    pl.pos.y = this.groundAt(pl.pos.x, pl.pos.z);
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Ally (Ouranthos in the last fight)                                                                                */
  /* ---------------------------------------------------------------------------------------------------------------- */

  /** Approximate horizontal radius of a hazard shape (for pull zones). */
  hazardRadius(h: Hazard): number {
    const sh = h.shape;
    return sh.type === 'cylinder' || sh.type === 'sphere' ? sh.r : sh.type === 'ring' ? sh.r1 : sh.type === 'arc' ? sh.r : sh.type === 'box' ? Math.max(sh.half[0], sh.half[2]) : 3;
  }

  /** Pull the player toward a point (gravity holes, whirlpools); strength in m/s at the center, fading to 0 at `radius`. */
  pullPlayerToward(p: Vec3, strength: number, radius: number, dt: number): void {
    const pl = this.player;
    if (pl.state === 'dead' || pl.invulnerable(this) && pl.state === 'grace') return;
    const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2 || d > radius) return;
    const k = strength * (1 - d / radius) * dt;
    this.pushPlayer((dx / d) * k, (dz / d) * k);
  }

  /** Displace the player (wind, currents, whirlpools) with collision and bounds. */
  pushPlayer(dx: number, dz: number): void {
    const pl = this.player;
    pl.pos.x += dx;
    pl.pos.z += dz;
    this.collidePlayer(pl);
  }

  /** Dynamic arena colliders (e.g. flowers that grow into barricades). Presentation gets cue 'collider_add:<id>'. */
  addArenaCollider(id: string, c: ColliderDef): void {
    if (!this.zone) return;
    this.zone.arenaColliders = [...this.zone.arenaColliders, { ...c }];
    this.dynamicColliders.set(id, this.zone.arenaColliders[this.zone.arenaColliders.length - 1]);
    this.emit({ type: 'vfx', id: `collider_add:${id}`, pos: { x: c.c[0], y: c.c[1], z: c.c[2] }, params: { r: c.r ?? 1, h: c.h ?? 2 } });
  }

  removeArenaCollider(id: string): void {
    const c = this.dynamicColliders.get(id);
    if (!c || !this.zone) return;
    this.zone.arenaColliders = this.zone.arenaColliders.filter((x) => x !== c);
    this.dynamicColliders.delete(id);
    this.emit({ type: 'vfx', id: `collider_remove:${id}`, pos: { x: c.c[0], y: c.c[1], z: c.c[2] } });
  }

  dynamicColliders = new Map<string, ColliderDef>();

  /** Ouranthos's wing shields one heavy mistake per stored charge (charges come from perfect dodges). */
  allyShield(dmg: DamageEvent): boolean {
    const a = this.ally;
    if (!a || !a.alive || (a.bstate.charge ?? 0) <= 0) return false;
    if ((dmg.mult ?? 1) < 1.2 && this.player.hp > dmg.amount * 1.5) return false;
    a.bstate.charge = (a.bstate.charge ?? 0) - 1;
    this.emit({ type: 'vfx', id: 'ally_wing_shield', pos: { ...this.player.pos } });
    this.emit({ type: 'cue', id: 'ally_shield', actor: a.id });
    return true;
  }

  onAllyPerfectDodge(): void {
    if (this.ally) this.ally.bstate.charge = Math.min(3, (this.ally.bstate.charge ?? 0) + 1);
  }

  /** True while an enemy attack with the parry_final flag is in its telegraph/active window (allows any weapon to parry). */
  parryFinalPending(): boolean {
    const b = this.boss;
    return !!b?.attack && b.attack.def.flags.includes('parry_final');
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* World triggers, interactables                                                                                     */
  /* ---------------------------------------------------------------------------------------------------------------- */

  private updateWorldTriggers(): void {
    const z = this.zone;
    if (!z || this.player.state === 'dead') {
      this.prompt = null;
      return;
    }
    const pl = this.player;
    // fog gate: crossing into a sealed arena starts its fight
    if (!this.fight && !this.seq.running) {
      for (const a of z.terrain.arenas) {
        if (insideArena(a, pl.pos.x, pl.pos.z, 0.5)) {
          const next = this.c.bossForArena(a.id).find((b) => !isDefeated(this.state, b.id) && this.prereqsMet(b));
          if (next) {
            this.startFight(next.id);
            return;
          }
        }
      }
    }
    if (this.fight || this.seq.running) {
      let fi: Interactable | null = null;
      if (this.fight?.active && !this.seq.running) {
        let bd = Infinity;
        for (const it of this.fightInteractables) {
          const d = dist2D(pl.pos, it.pos);
          if (d <= it.radius && d < bd) {
            bd = d;
            fi = it;
          }
        }
      }
      if (fi?.id !== this.prompt?.id) this.emit({ type: 'interactPrompt', key: fi?.promptKey ?? null });
      this.prompt = fi;
      return;
    }
    const it = z.nearestInteractable(pl.pos, (i) => {
      if (i.kind === 'reperto') return !this.state.reperti.includes(i.id);
      if (i.kind === 'exit') {
        const e = z.def.exits[Number(i.id)];
        return e.requires.every((r) => isDefeated(this.state, r));
      }
      return true;
    });
    if (it?.id !== this.prompt?.id || it?.kind !== this.prompt?.kind) this.emit({ type: 'interactPrompt', key: it?.promptKey ?? null });
    this.prompt = it;
    // altars are discovered on approach
    if (it && it.kind === 'altar' && !this.state.visitedAltars.includes(it.id)) {
      this.state.visitedAltars.push(it.id);
      this.emit({ type: 'altarDiscovered', altar: it.id });
    }
  }

  /** Encounters in the same arena are fought in order; a boss is available only once all earlier encounters are done. */
  prereqsMet(b: BossDef): boolean {
    for (const o of this.c.bosses) {
      if (o.order >= b.order) break;
      if (!isDefeated(this.state, o.id)) return false;
    }
    return true;
  }

  interact(): boolean {
    const it = this.prompt;
    if (!it) return false;
    if (this.fight) {
      if (!this.fightInteractables.includes(it) || !this.boss) return false;
      this.boss.behavior?.onInteract?.(this.boss, this, it.id);
      return true;
    }
    switch (it.kind) {
      case 'altar':
        this.openAltar(it.id);
        return true;
      case 'reperto':
        if (!this.state.reperti.includes(it.id)) this.state.reperti.push(it.id);
        this.emit({ type: 'reperto', id: it.id });
        this.player.setState('interact', 0.8);
        return true;
      case 'vista':
        if (!this.state.vistas.includes(it.id)) this.state.vistas.push(it.id);
        this.emit({ type: 'vista', id: it.id });
        this.player.setState('interact', 0.5);
        return true;
      case 'exit': {
        const e = this.zone!.def.exits[Number(it.id)];
        this.emit({ type: 'zoneExit', from: this.zone!.def.id, to: e.to, kind: e.kind ?? 'walk' });
        this.travel(e.to, e.arrive);
        return true;
      }
      default:
        return false;
    }
  }

  /** Move to another zone (exits, fast travel). Presentation fades around the zoneEnter event. */
  travel(zoneId: string, altarId: string): void {
    this.loadZone(zoneId, altarId);
    const act = this.c.bundle.progression.acts.find((a) => a.zones[0] === zoneId);
    if (act?.intro_sequence && !this.state.flags[`act${act.n}_intro`] && this.c.hasSequence(act.intro_sequence)) {
      this.state.flags[`act${act.n}_intro`] = true;
      this.seq.start(this, this.c.sequence(act.intro_sequence));
    }
    this.emit({ type: 'autosave', reason: 'travel' });
  }

  openAltar(altarId: string): void {
    this.altarOpen = altarId;
    this.restAt(altarId);
    this.player.setState('locked');
    // Voce dell'Alba line if new progress allows
    const line = this.pickVoceLine(altarId);
    if (line) {
      this.state.voceHeard.push(line);
      this.emit({ type: 'voce', key: line });
    }
  }

  closeAltar(): void {
    this.altarOpen = null;
    if (this.player.state === 'locked') this.player.setState('idle');
  }

  /** Rest: full Health and Lacrime, Fiato, last altar. */
  restAt(altarId: string): void {
    this.state.lastAltar = altarId;
    if (!this.state.visitedAltars.includes(altarId)) this.state.visitedAltars.push(altarId);
    const p = this.player;
    p.hp = p.hpMax;
    p.lacrime = p.lacrimeMax;
    p.fiato = p.fiatoMax;
    p.statuses = {};
    this.emit({ type: 'altarRest', altar: altarId });
    this.emit({ type: 'autosave', reason: 'altar' });
  }

  pickVoceLine(altarId: string): string | null {
    const s = this.state;
    const cands = this.c.bundle.voce.filter((v) => !s.voceHeard.includes(v.key) && (!v.altar || v.altar === altarId) && (v.after ?? []).every((b) => isDefeated(s, b)));
    if (!cands.length) {
      const altar = this.c.altar(altarId);
      if (altar.voice_line_key && !s.voceHeard.includes(altar.voice_line_key)) return altar.voice_line_key;
      return null;
    }
    cands.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (b.after?.length ?? 0) - (a.after?.length ?? 0));
    return cands[0].key;
  }

  /** Meditation: choose time of day (also heals and refills at the altar). */
  meditate(tod: TimeOfDay): void {
    this.state.timeOfDay = tod;
    this.emit({ type: 'timeOfDay', tod });
    if (this.altarOpen) this.restAt(this.altarOpen);
  }

  setLoadout(weapons: (string | null)[]): void {
    const owned = new Set(this.state.weapons);
    const eq = weapons.slice(0, 3).map((w) => (w && owned.has(w) ? w : null));
    while (eq.length < 3) eq.push(null);
    if (!eq.some((w) => !!w)) eq[0] = 'lama_della_culla';
    this.state.equipped = eq;
    this.state.activeSlot = eq.findIndex((w) => !!w);
    this.player.weapons = [...eq];
    this.player.activeSlot = this.state.activeSlot;
    this.player.shapeShift = null;
  }

  setForm(id: string): void {
    if (this.state.forms.includes(id)) this.state.equippedForm = id;
  }

  fastTravelTargets(): string[] {
    return this.state.visitedAltars.filter((a) => {
      const def = this.c.altar(a);
      const z = this.c.zone(def.zone);
      return def.fast_travel !== false && !z.no_fast_travel;
    });
  }

  canFastTravel(): boolean {
    if (!this.zone) return false;
    if (this.zone.def.no_fast_travel) return false;
    const a = this.altarOpen ? this.c.altar(this.altarOpen) : null;
    return !!a && a.fast_travel !== false && !this.fight;
  }

  fastTravel(altarId: string): void {
    if (!this.canFastTravel()) return;
    const a = this.c.altar(altarId);
    this.closeAltar();
    this.travel(a.zone, a.id);
    this.openAltar(a.id);
  }

  /** Specchio dei Ricordi: replay a defeated boss from an altar with a chosen time of day, Form and challenges. */
  startMemoryFight(bossId: string, tod: TimeOfDay, form: string, challenges: Partial<Challenges>): void {
    if (!isDefeated(this.state, bossId) || this.c.boss(bossId).scripted) return;
    this.memoryReturn = { zone: this.state.zone, altar: this.altarOpen ?? this.state.lastAltar };
    this.closeAltar();
    this.state.timeOfDay = tod;
    this.setForm(form);
    this.challenges = { noDamage: !!challenges.noDamage, singleWeapon: !!challenges.singleWeapon, noLacrime: !!challenges.noLacrime, noMetamondo: !!challenges.noMetamondo };
    this.startFightDirect(bossId, { memory: true, skipIntro: true });
  }

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Story API (used by sequences and behaviors)                                                                       */
  /* ---------------------------------------------------------------------------------------------------------------- */

  giveWeapon(id: string): void {
    if (!this.c.hasWeapon(id)) return;
    if (!this.state.weapons.includes(id)) {
      this.state.weapons.push(id);
      this.emit({ type: 'weaponObtained', weapon: id });
    }
  }

  giveItem(id: string): void {
    if (!this.state.items.includes(id)) {
      this.state.items.push(id);
      this.emit({ type: 'itemObtained', item: id });
    }
  }

  unlockForm(id: string): void {
    if (!this.state.forms.includes(id)) {
      this.state.forms.push(id);
      this.emit({ type: 'formUnlocked', form: id });
    }
  }

  setFlags(set: Record<string, string | number | boolean>): void {
    for (const [k, v] of Object.entries(set)) {
      if (k === 'lucifero_choice') this.state.luciferoChoice = v === 'begged' ? 'begged' : 'fought';
      else this.state.flags[k] = v;
    }
  }

  /** Conditions: "flag", "!flag", "key == value", "defeated:<boss>", "item:<id>", "ng". */
  evalCondition(cond: string): boolean {
    const c = cond.trim();
    if (c.startsWith('!')) return !this.evalCondition(c.slice(1));
    if (c === 'ng') return this.ngCycle > 0;
    if (c.startsWith('defeated:')) return isDefeated(this.state, c.slice(9));
    if (c.startsWith('item:')) return this.state.items.includes(c.slice(5));
    const m = /^(\w+)\s*==\s*(\w+)$/.exec(c);
    if (m) {
      const v = m[1] === 'lucifero_choice' ? this.state.luciferoChoice : this.state.flags[m[1]];
      return String(v) === m[2];
    }
    return !!this.state.flags[c];
  }

  /** Named story events callable from sequences. Behaviors may register more via storyHandlers. */
  storyHandlers: Record<string, (params: Record<string, string | number | boolean>) => void> = {};

  storyEvent(name: string, params: Record<string, string | number | boolean>): void {
    const h = this.storyHandlers[name];
    if (h) {
      h(params);
      return;
    }
    switch (name) {
      case 'start_fight':
        if (this.boss && this.boss.state === 'intro') {
          this.boss.setState('idle');
          this.boss.idleTimer = 1;
        }
        if (this.fight) this.fight.intro = false;
        break;
      case 'end_fight_scripted': {
        // narrative defeat / no fight: complete the encounter without a kill
        const b = this.fight ? this.c.boss(this.fight.boss) : params.boss ? this.c.boss(String(params.boss)) : null;
        if (b) {
          if (!this.state.defeated.includes(b.id)) this.state.defeated.push(b.id);
          const arena = this.fight?.arena;
          this.clearCombat();
          if (arena) this.emit({ type: 'gateOpen', arena });
          this.emit({ type: 'fightEnd', boss: b.id, won: false });
        }
        break;
      }
      case 'start_fight_direct':
        this.startFightDirect(String(params.boss), { skipIntro: params.skip_intro === true });
        break;
      case 'arena_state':
        this.setArenaVariant(params.state ? String(params.state) : null);
        break;
      case 'gravity':
        this.setGravity(Number(params.sign) < 0 ? -1 : 1);
        break;
      case 'give_item':
        this.giveItem(String(params.item));
        break;
      case 'boss_scripted':
        if (this.boss) this.boss.setState('scripted');
        break;
      case 'boss_resume':
        if (this.boss && (this.boss.state === 'scripted' || this.boss.state === 'intro')) {
          this.boss.setState('idle');
          this.boss.idleTimer = 0.8;
        }
        break;
      case 'kneel':
        this.player.setState('kneel');
        break;
      case 'player_free':
        if (this.player.state === 'kneel' || this.player.state === 'locked') this.player.setState('idle');
        break;
      case 'rest':
        this.restAt(String(params.altar ?? this.state.lastAltar));
        break;
      case 'travel':
        this.travel(String(params.zone), String(params.altar));
        break;
      case 'teleport_altar': {
        const a = this.c.altar(String(params.altar));
        this.loadZone(a.zone, a.id);
        this.restAt(a.id);
        break;
      }
      case 'sky_brighten':
        this.emit({ type: 'skyBrighten', level: skyShade(this.c, this.state) });
        break;
      case 'set_scale':
        this.player.baseScale = Number(params.scale ?? 1);
        this.emit({ type: 'scale', scale: this.player.scale });
        break;
      case 'shadow':
        this.player.hasShadow = true;
        break;
      case 'ending':
        this.endingActive = true;
        this.player.hasShadow = true;
        this.state.gameCompleted = true;
        this.emit({ type: 'ending' });
        this.emit({ type: 'autosave', reason: 'ending' });
        break;
      case 'credits':
        this.emit({ type: 'credits' });
        break;
      case 'autosave':
        this.emit({ type: 'autosave', reason: String(params.reason ?? 'story') });
        break;
      case 'cue':
        this.emit({ type: 'cue', id: String(params.id ?? '') });
        break;
      case 'ritual_gesture':
        this.emit({ type: 'vfx', id: `ritual_${params.id}`, pos: { ...this.player.pos } });
        break;
      default:
        this.emit({ type: 'cue', id: `story_${name}` });
    }
  }

  /** Theme notes for audio (Portatore theme progression). */
  themeNotes(): number {
    return themeNotes(this.c, this.state);
  }

  skyShade(): number {
    return skyShade(this.c, this.state);
  }

  /** Switch the active arena to a variant (data: arena.variants[state]); presentation gets an 'arena_state:<state>' cue. */
  setArenaVariant(state: string | null): void {
    const z = this.zone;
    if (!z || !z.activeArenaDef) return;
    if (state && !z.activeArenaDef.variants?.[state]) {
      // a phase keyword without a geometry change is still forwarded to the arena dressing
      this.emit({ type: 'cue', id: `arena_state:${state}` });
      return;
    }
    z.setActiveArena(z.activeArenaDef, state);
    for (const a of this.actors) this.clampActor(a);
    this.collidePlayer(this.player);
    this.emit({ type: 'cue', id: `arena_state:${state ?? 'default'}` });
    if (z.gravitySign < 0) this.emit({ type: 'gravityFlip', sign: -1 });
  }

  /** Spawn the arena's static hazards for a phase (data: arena.hazards with optional from_phase). */
  spawnArenaHazards(phaseId: string | null): void {
    const def = this.zone?.activeArenaDef;
    if (!def?.hazards) return;
    for (const h of def.hazards) {
      // at fight start (phaseId null) spawn the always-on hazards; on a phase change spawn those tied to that phase
      if ((h.from_phase ?? null) !== phaseId) continue;
      // static hazard shapes are authored relative to the arena center
      const hz = this.addStaticHazard(h.kind, h.shape, h.dps_mult, h.status);
      hz.pos.x = def.center[0]; hz.pos.y = def.floor_y; hz.pos.z = def.center[2];
      hz.yaw = def.yaw ?? 0;
    }
  }

  addFightInteractable(id: string, pos: Vec3, radius: number, promptKey: string): Interactable {
    const it: Interactable = { kind: 'custom', id, pos: { ...pos }, radius, promptKey };
    this.fightInteractables.push(it);
    return it;
  }

  removeFightInteractable(id: string): void {
    this.fightInteractables = this.fightInteractables.filter((i) => i.id !== id);
    if (this.prompt?.id === id) this.prompt = null;
  }

  /** Spawn the AI ally (Ouranthos in the last fight): a player-team actor that attacks the boss and cannot be hurt. */
  spawnAlly(md: MinionDef, pos: Vec3, behaviorKey?: string): Actor {
    const f = behaviorKey ? this.behaviors[behaviorKey] : undefined;
    const a = new Actor('ally', md, pos, 'player', f ? f() : null, 1e9, false);
    a.invulnerable = true;
    a.yaw = this.boss ? yawTo(pos, this.boss.pos) : 0;
    a.idleTimer = 1.5;
    a.behavior?.init?.(a, this);
    this.actors.push(a);
    this.ally = a;
    if (this.fight) this.fight.ally = a;
    return a;
  }

  /** Flip arena gravity (Rovescio): the presentation rotates the world; positions stay on the same plane. */
  setGravity(sign: 1 | -1): void {
    if (!this.zone || this.zone.gravitySign === sign) return;
    this.zone.gravitySign = sign;
    this.player.ceiling = sign < 0;
    this.emit({ type: 'gravityFlip', sign });
  }

  /** Debug: kill the current boss. */
  debugKillBoss(): void {
    const b = this.boss;
    if (!b || !b.alive) return;
    if (b.bossDef?.scripted) {
      this.storyEvent('end_fight_scripted', {});
      return;
    }
    b.invulnerable = false;
    b.hp = 0;
    killActor(this, b);
  }
}

function resetHazard(h: Hazard): void {
  h.vel.x = 0; h.vel.y = 0; h.vel.z = 0;
  h.age = 0;
  h.lastHit.clear();
  h.hitOnce.clear();
  h.bind = 0;
  h.pull = 0;
  h.art = '';
  h.eco = 0;
  h.permanent = false;
  h.tag = '';
  h.poise = 0;
  h.status = undefined;
  h.tick = 0;
  h.flags = [];
  h.mult = 1;
}

function lockedInput(i: PlayerInput): PlayerInput {
  return { ...emptyInput(), camYaw: i.camYaw, holdHeld: i.holdHeld, choice: i.choice, presses: i.presses & Btn.Advance };
}

export { clamp };
export type { CharacterLook };
