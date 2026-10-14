/**
 * Headless balance bot. Plays a fight through the real sim with scripted timing:
 *  - "perfect": dodges every incoming hit window / hazard / projectile ~0.08 s before impact (perfect-dodge timing),
 *    punishes recoveries and Spezzato (Colpo di Grazia), uses Arts, Metamondo and Lacrime sensibly.
 *  - "sloppy": reacts late and randomly, attacks greedily; used to check that fights are not trivial.
 * Per-boss hooks (tools/bot/hooks.ts) handle scripted mechanics (ballista, Implora, gestures...).
 */
import { DEG, dist2D, forward, localToWorld, v3, wrapAngle, yawTo, type Vec3 } from '../../src/core/math';
import type { HitWindowDef } from '../../src/core/types';
import type { Actor } from '../../src/sim/actor';
import type { Sim } from '../../src/sim/sim';
import { shapeHits, shapeReach, type TargetVol } from '../../src/sim/shapes';
import { Btn, emptyInput, type PlayerInput } from '../../src/sim/types';
import { HOOKS, type BotHook } from './hooks';

export type BotProfile = 'perfect' | 'sloppy';

export interface BotResult {
  boss: string;
  won: boolean;
  time: number;
  target: number;
  deaths: number;
  hitsTaken: number;
  perfectDodges: number;
  parries: number;
  graces: number;
  damageDealt: number;
  playerHpEnd: number;
  bossHpFrac: number;
  phaseReached: number;
  notes: string[];
}

const vol: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };
const tmp = v3();

interface Threat {
  t: number; // seconds until impact
  from: Vec3;
  kind: 'melee' | 'hazard' | 'projectile' | 'ring';
  red: boolean;
  jumpable: boolean;
}

export class Bot {
  profile: BotProfile;
  lastDodgeTime = -9;
  lastAttackPress = -9;
  hook: BotHook | null;
  rngState = 12345;
  reactionJitter = 0;
  notes: string[] = [];

  constructor(profile: BotProfile, bossId: string) {
    this.profile = profile;
    this.hook = HOOKS[bossId] ?? null;
  }

  private rand(): number {
    this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
    return this.rngState / 0x7fffffff;
  }

  /** Earliest predicted impact on the player within the horizon. */
  threats(sim: Sim, horizon: number): Threat[] {
    const out: Threat[] = [];
    const pl = sim.player;
    const pv = pl.volume(vol, sim);
    // inflate slightly for safety
    const base: TargetVol = { ...pv, r: pv.r + 0.35 };
    for (const a of sim.actors) {
      if (a.team !== 'enemy' || !a.alive || !a.attack) continue;
      const atk = a.attack;
      const def = atk.def;
      const rate = atk.rate;
      (def.hits ?? []).forEach((h: HitWindowDef, wi) => {
        if (atk.windows[wi]?.hitTargets.has(-1) || atk.windows[wi]?.dodged.has(-1)) return;
        const until = (h.t - atk.activeTime) / rate;
        const end = (h.t + h.dur - atk.activeTime) / rate;
        if (end < 0 || until > horizon) return;
        // predict boss position at impact for forward motions
        const origin = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
        const lead = Math.max(0, until);
        for (const m of def.motion ?? []) {
          if (m.type === 'forward' || m.type === 'charge_through') {
            const tStart = Math.max(atk.activeTime, m.t);
            const tEnd = Math.min(atk.activeTime + lead * rate, m.t + m.dur);
            if (tEnd > tStart) {
              forward(a.yaw, tmp);
              origin.x += tmp.x * (m.speed ?? 6) * (tEnd - tStart);
              origin.z += tmp.z * (m.speed ?? 6) * (tEnd - tStart);
            }
          }
          if (m.type === 'leap_to_target' || m.type === 'dive_to_target' || m.type === 'toward_target') {
            const ms = atk.motionStart.get(def.motion!.indexOf(m));
            if (ms) {
              origin.x = ms.to.x;
              origin.z = ms.to.z;
            } else {
              origin.x = pl.pos.x;
              origin.z = pl.pos.z;
            }
          }
          if (m.type === 'teleport_behind') {
            origin.x = pl.pos.x;
            origin.z = pl.pos.z;
          }
        }
        const o = h.part ? a.partOrigin(h.part, v3()) : origin;
        if (h.part) {
          o.x += origin.x - a.pos.x;
          o.z += origin.z - a.pos.z;
        }
        const ringProgress = h.shape.type === 'ring' ? progressWhenRingReaches(h, o, a, pl.pos) : 0;
        const hit = h.shape.type === 'ring' ? ringProgress >= 0 : shapeHits(h.shape, o, a.yaw, a.scale, 0.5, base) || (h.shape.type === 'arc' && shapeHits(h.shape, o, wrapAngle(a.yaw), a.scale, 0.5, base));
        if (!hit) return;
        const impact = h.shape.type === 'ring' ? (h.t + ringProgress * h.dur - atk.activeTime) / rate : Math.max(0, until);
        out.push({ t: impact, from: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, kind: h.shape.type === 'ring' ? 'ring' : 'melee', red: def.flags.includes('red'), jumpable: h.shape.type === 'ring' });
      });
    }
    sim.hazards.forEachActive((h) => {
      if (h.team !== 'enemy') return;
      if (h.hitOnce.has(-1)) return;
      const until = h.delay - h.age;
      if (until > horizon || h.age > h.delay + h.activeDur) return;
      let impact = Math.max(0, until);
      if (h.shape.type === 'ring') {
        const d = Math.hypot(pl.pos.x - h.pos.x, pl.pos.z - h.pos.z);
        const r0 = h.shape.r0, r1 = h.shape.r1;
        if (d < r0 - 1 || d > r1 + 1.5) return;
        const k = Math.min(1, Math.max(0, (d - r0) / Math.max(0.01, r1 - r0)));
        impact = h.delay + k * h.activeDur - h.age;
        if (impact < -0.05 || impact > horizon) return;
        out.push({ t: Math.max(0, impact), from: { ...h.pos }, kind: 'ring', red: h.flags.includes('red'), jumpable: true });
        return;
      }
      const moving = h.vel.x !== 0 || h.vel.z !== 0;
      const hp = moving ? { x: h.pos.x + h.vel.x * impact, y: h.pos.y, z: h.pos.z + h.vel.z * impact } : h.pos;
      if (!shapeHits(h.shape, hp, h.yaw, 1, 0, base)) return;
      out.push({ t: impact, from: { ...h.pos }, kind: 'hazard', red: h.flags.includes('red'), jumpable: false });
    });
    sim.projectiles.forEachActive((p) => {
      if (p.team !== 'enemy' || p.age < 0 || p.hit.has(-1)) return;
      const dx = pl.pos.x - p.pos.x, dy = pl.pos.y + 1 - p.pos.y, dz = pl.pos.z - p.pos.z;
      const vx = p.vel.x, vy = p.vel.y, vz = p.vel.z;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 < 1e-6) return;
      const tc = (dx * vx + dy * vy + dz * vz) / v2;
      if (tc < -0.05 || tc > horizon) return;
      const cx = dx - vx * tc, cy = dy - vy * tc, cz = dz - vz * tc;
      const miss = Math.hypot(cx, cy * 0.6, cz);
      if (miss > p.radius + pv.r + 0.9 + (p.homing > 0 ? 1.2 : 0)) return;
      out.push({ t: Math.max(0, tc - (p.radius + pv.r) / Math.sqrt(v2)), from: { ...p.pos }, kind: 'projectile', red: p.flags.includes('red'), jumpable: false });
    });
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  decide(sim: Sim): PlayerInput {
    const input = emptyInput();
    const pl = sim.player;
    const boss = sim.boss;
    input.camYaw = boss ? yawTo(pl.pos, boss.pos) : pl.yaw;
    if (this.hook?.input) {
      const r = this.hook.input(sim, this, input);
      if (r) return r;
    }
    if (sim.seq.running) {
      const ch = sim.seq.view.choice;
      if (ch) {
        const want = this.hook?.choice ? this.hook.choice(sim, ch.options.map((o) => o.key)) : 0;
        input.choice = want;
        input.holdHeld = true;
      }
      if (sim.seq.view.gesture) input.presses |= Btn.Advance;
      else if (sim.seq.view.line && sim.seq.t > 0.5) input.presses |= Btn.Advance;
      return input;
    }
    if (!boss || !boss.alive || pl.state === 'dead') return input;
    if (!pl.lock) input.presses |= Btn.Lock;

    const target = this.pickTarget(sim, boss);
    const tpos = target.pos;
    const dist = dist2D(pl.pos, tpos) - target.radius;
    const reach = pl.reach(sim);
    const perfect = this.profile === 'perfect';

    // --- defense ---
    const horizon = perfect ? 0.6 : 0.4;
    const threats = this.threats(sim, horizon);
    const dodgeLead = perfect ? 0.085 : 0.03 + this.rand() * 0.25;
    const t0 = threats[0];
    const canDodge = pl.fiato > 1 && (pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.isAttacking() && pl.swing && pl.swing.t >= pl.swing.def.startup + pl.swing.def.active) || pl.state === 'dodge' && pl.stateTime > 0.32);
    if (t0 && t0.t <= dodgeLead + (perfect ? 0.012 : 0) && sim.time - this.lastDodgeTime > (perfect ? 0.34 : 0.55)) {
      if (!perfect && this.rand() < 0.28) {
        // sloppy: sometimes simply fails to react
      } else if (canDodge || pl.state === 'drink') {
        const away = yawTo(t0.from, pl.pos);
        // lateral for melee/charges, straight away for hazards
        let dir = away;
        if (t0.kind === 'melee' || t0.kind === 'projectile') {
          const side = wrapAngle(yawTo(tpos, pl.pos) - (boss.yaw)) > 0 ? 1 : -1;
          dir = wrapAngle(yawTo(pl.pos, tpos) + side * 100 * DEG);
          // keep inside the arena: prefer the side closer to the center
          const c = sim.arenaCenter();
          const dirToC = yawTo(pl.pos, c);
          const alt = wrapAngle(yawTo(pl.pos, tpos) - side * 100 * DEG);
          if (dist2D(pl.pos, c) > 0.65 * this.arenaRadius(sim) && Math.abs(wrapAngle(alt - dirToC)) < Math.abs(wrapAngle(dir - dirToC))) dir = alt;
        }
        input.moveX = Math.sin(dir);
        input.moveZ = Math.cos(dir);
        input.presses |= Btn.Dodge;
        this.lastDodgeTime = sim.time;
        return input;
      }
    }
    const danger = threats.some((t) => t.t < 0.5);

    // --- heal ---
    if (pl.hp < pl.hpMax * (perfect ? 0.45 : 0.3) && pl.lacrime > 0 && !danger && (boss.state !== 'attack' || boss.attack?.stage === 'recovery' || dist > 8)) {
      if (pl.state === 'idle' || pl.state === 'move') {
        input.presses |= Btn.Drink;
        return input;
      }
    }

    // --- Metamondo ---
    if (sim.meta.ready && !danger && boss.state !== 'transition') input.presses |= Btn.Metamondo;

    // --- offense ---
    const window = this.openWindow(sim, boss, dist);
    const wantRange = Math.max(0.6, reach - 0.6);
    const graceTarget = pl.findGraceTarget(sim);
    if (graceTarget && (pl.state === 'idle' || pl.state === 'move')) {
      input.presses |= Btn.Heavy;
      return input;
    }
    // ranged weapons attack from range
    const ranged = reach > 12;
    if (dist > wantRange && !ranged) {
      const y = yawTo(pl.pos, tpos);
      input.moveX = Math.sin(y);
      input.moveZ = Math.cos(y);
      input.sprint = dist > 7 && !danger;
    } else if (ranged && dist < 6 && !window) {
      const y = yawTo(tpos, pl.pos);
      input.moveX = Math.sin(y) * 0.8;
      input.moveZ = Math.cos(y) * 0.8;
    }
    if (window && (dist <= reach + 0.2 || ranged) && sim.time - this.lastAttackPress > 0.12) {
      const ecoArt = pl.eco >= 200 && window > 1.1 ? Btn.ArtSeconda : pl.eco >= 100 && window > 0.9 ? Btn.ArtPrima : 0;
      const greedy = !perfect && this.rand() < 0.35;
      if (ecoArt && !greedy) input.presses |= ecoArt;
      else if (window > 1.4 && pl.fiato > 45) input.presses |= Btn.Heavy;
      else if (pl.fiato > (perfect ? 30 : 5) || greedy) input.presses |= Btn.Light;
      this.lastAttackPress = sim.time;
    }
    return input;
  }

  arenaRadius(sim: Sim): number {
    const a = sim.zone?.metaSpace ?? sim.zone?.activeArena;
    if (!a) return 20;
    return a.shape === 'circle' ? a.radius : Math.min(a.hx, a.hz);
  }

  pickTarget(sim: Sim, boss: Actor): { pos: Vec3; radius: number } {
    const pl = sim.player;
    if (this.hook?.target) {
      const t = this.hook.target(sim, this);
      if (t) return t;
    }
    if (pl.lock && pl.lock.part >= 0) {
      const p = boss.parts[pl.lock.part];
      if (p && p.active) return { pos: p.center, radius: 0.8 };
    }
    return { pos: boss.pos, radius: boss.radius * boss.scale };
  }

  /** Seconds of safe offense available now (0 = none). */
  openWindow(sim: Sim, boss: Actor, dist: number): number {
    if (boss.state === 'spezzato') return 6 - boss.stateTime;
    if (boss.state === 'stagger') return boss.stateDur - boss.stateTime;
    if (boss.state === 'transition' || boss.invulnerable) return 0;
    if (boss.state === 'attack' && boss.attack) {
      const a = boss.attack;
      if (a.stage === 'recovery') {
        const left = (a.def.telegraph + a.def.active + a.def.recovery - a.time) / a.rate;
        return left + (a.def.combo_next ? 0 : 0.5);
      }
      if (a.stage === 'telegraph' && dist > 4) return 0;
      return this.profile === 'sloppy' ? 0.6 : 0;
    }
    if (boss.state === 'idle' || boss.state === 'move') return Math.max(0, boss.idleTimer) + 0.4;
    return 0;
  }
}

function progressWhenRingReaches(h: HitWindowDef, origin: Vec3, a: Actor, p: Vec3): number {
  if (h.shape.type !== 'ring') return -1;
  const c = h.shape.c ? localToWorld(origin, a.yaw, h.shape.c[0], h.shape.c[1], h.shape.c[2], v3(), a.scale) : origin;
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  const r0 = h.shape.r0 * a.scale, r1 = h.shape.r1 * a.scale;
  if (d < r0 - 1 || d > r1 + 1.5) return -1;
  return Math.min(1, Math.max(0, (d - r0) / Math.max(0.01, r1 - r0)));
}

/** Run one complete fight. */
export function runFight(sim: Sim, bossId: string, profile: BotProfile, opts: { maxTime?: number; maxDeaths?: number; loadout?: (string | null)[]; form?: string; tod?: string } = {}): BotResult {
  const bot = new Bot(profile, bossId);
  const def = sim.c.boss(bossId);
  // give the bot the weapons a player would own at this point
  for (const b of sim.c.bosses) {
    if (b.order >= def.order) break;
    if (!sim.state.defeated.includes(b.id)) sim.state.defeated.push(b.id);
    if (b.drops_weapon && !sim.c.weapon(b.drops_weapon).delivered_by && !sim.c.weapon(b.drops_weapon).ng_plus_only) sim.giveWeapon(b.drops_weapon);
    if (b.unlocks_form) sim.unlockForm(b.unlocks_form);
  }
  if (opts.tod) sim.state.timeOfDay = opts.tod as any;
  const loadout = opts.loadout ?? bot.hook?.loadout?.(sim) ?? bestLoadout(sim);
  sim.setLoadout(loadout);
  if (opts.form) sim.setForm(opts.form);
  else if (bot.hook?.form) sim.setForm(bot.hook.form(sim));
  bot.hook?.before?.(sim, bot);
  sim.startFightDirect(bossId);
  const res: BotResult = {
    boss: bossId, won: false, time: 0, target: sim.bal.boss.ttk_base + sim.bal.boss.ttk_per_d * def.difficulty, deaths: 0, hitsTaken: 0, perfectDodges: 0,
    parries: 0, graces: 0, damageDealt: 0, playerHpEnd: 0, bossHpFrac: 1, phaseReached: 0, notes: bot.notes,
  };
  const maxTime = opts.maxTime ?? res.target * 2.5;
  const maxDeaths = opts.maxDeaths ?? 0;
  const t0 = sim.time;
  let fightTime = 0;
  while (true) {
    const inp = bot.decide(sim);
    sim.step(inp);
    if (sim.fight?.active && !sim.seq.running) fightTime += sim.dt;
    for (const e of sim.drainEvents()) {
      if (e.type === 'playerHurt') res.hitsTaken++;
      else if (e.type === 'perfectDodge') res.perfectDodges++;
      else if (e.type === 'parry') res.parries++;
      else if (e.type === 'grace') res.graces++;
      else if (e.type === 'hit' && e.source === -1) res.damageDealt += e.amount;
      else if (e.type === 'bossPhase') res.phaseReached = Math.max(res.phaseReached, e.phase);
      else if (e.type === 'playerDied') res.deaths++;
      else if (e.type === 'fightEnd' && e.boss === bossId) res.won = e.won || (bot.hook?.countsAsWin?.(sim) ?? false);
    }
    if (sim.boss) res.bossHpFrac = sim.boss.hpFrac;
    if (res.won && !sim.seq.running) break;
    if (bot.hook?.done?.(sim)) {
      res.won = true;
      break;
    }
    if (res.deaths > maxDeaths) break;
    if (sim.time - t0 > maxTime + 60) break;
  }
  res.time = fightTime;
  res.playerHpEnd = sim.player.hp;
  if (res.won) res.bossHpFrac = 0;
  return res;
}

/** Strongest weapons owned (highest damage), mixing in a parry-capable one if available. */
export function bestLoadout(sim: Sim): (string | null)[] {
  const owned = sim.state.weapons.map((id) => sim.c.weapon(id)).filter((w) => !w.ng_plus_only);
  owned.sort((a, b) => b.source_difficulty - a.source_difficulty);
  const melee = owned.filter((w) => w.category !== 'ranged' && w.category !== 'catalyst');
  const pick = (melee.length ? melee : owned).slice(0, 3).map((w) => w.id);
  while (pick.length < 3) pick.push(null as unknown as string);
  return pick;
}

export function shapeReachOf(h: HitWindowDef): number {
  return shapeReach(h.shape);
}
