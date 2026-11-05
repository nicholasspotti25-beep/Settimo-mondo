/**
 * Shared defensive helpers for the balance bot's boss hooks (integration #3). Moved verbatim from the Act I hook
 * (tools/bot/hooks/cavaliere_errante.ts: box hazards across their short axis, through-charges read in the telegraph, ground
 * rings held for and jumped, round ground hazards left during their telegraph) and the Act II hook
 * (tools/bot/hooks/cerbero.ts: shockwave rings jumped, moving waves rolled through), which hooks of five streams import.
 * Owned by the integrator so that a tweak for one boss cannot silently change every other act's bot numbers: a hook that
 * needs different behavior wraps these instead of editing them. Names are kept (`act1Defense`, `act2Defense`); the Act II
 * ring jump is `shockRingJump` here (it was `ringJump` in cerbero.ts, next to the Act I `ringJump`).
 */
import { DEG, yawOf } from '../../src/core/math';
import type { Sim } from '../../src/sim/sim';
import { insideArena } from '../../src/core/terrain';
import { shapeHits, type TargetVol } from '../../src/sim/shapes';
import { Btn, type PlayerInput } from '../../src/sim/types';
import type { Bot } from './bot';

const vol: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };

/** Escape an enemy box hazard that is about to turn active under the player: roll across its short axis. */
export function boxHazardDodge(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  const lead = bot.profile === 'perfect' ? 0.1 : 0.05;
  let best: { t: number; yaw: number } | null = null;
  const pv = pl.volume(vol, sim);
  pv.r += 0.35;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || h.shape.type !== 'box' || h.hitOnce.has(-1)) return;
    const until = h.delay - h.age;
    if (until < -0.02 || until > lead) return;
    if (!shapeHits(h.shape, h.pos, h.yaw, 1, 0, pv)) return;
    const sh = h.shape;
    // box local frame: x' = across, z' = along (data yaw convention); escape along the short half-axis
    const alongX = sh.half[0] >= sh.half[2];
    const by = h.yaw + (sh.yaw ?? 0) * DEG;
    const s = Math.sin(by), co = Math.cos(by);
    // box center in world
    const cx = h.pos.x + sh.c[0] * co + sh.c[2] * s;
    const cz = h.pos.z - sh.c[0] * s + sh.c[2] * co;
    const dx = pl.pos.x - cx, dz = pl.pos.z - cz;
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    // world direction of the short axis
    let yaw: number;
    if (alongX) yaw = by + (lz >= 0 ? 0 : Math.PI); // local +z
    else yaw = by + (lx >= 0 ? Math.PI / 2 : -Math.PI / 2); // local +x
    if (!best || until < best.t) best = { t: until, yaw };
  });
  if (!best) return null;
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.state === 'dodge' && pl.stateTime > 0.32);
  if (!free || pl.fiato <= 1) return null;
  const b = best as { t: number; yaw: number };
  base.moveX = Math.sin(b.yaw);
  base.moveZ = Math.cos(b.yaw);
  base.presses |= Btn.Dodge;
  bot.lastDodgeTime = sim.time;
  return base;
}

const probe: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };
const ESCAPE_DIRS = 16;
/** Pending hazards that will be live within this many seconds are avoided by the escape probes. */
const ESCAPE_HORIZON = 1.6;

/** Distance the player must still cover to leave the round hazards found by the last `inRoundHazard` call. */
let exitDist = 0;

/** Seconds until the soonest round enemy hazard overlapping the volume turns live (pending ≤ horizon, or live: ≤ 0). */
function inRoundHazard(sim: Sim, v: TargetVol, horizon: number): number {
  let soonest = Infinity;
  exitDist = 0;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || h.hitOnce.has(-1)) return;
    if (h.shape.type !== 'cylinder' && h.shape.type !== 'sphere') return;
    const until = h.delay - h.age;
    if (until > horizon || h.age > h.delay + h.activeDur) return;
    if (!shapeHits(h.shape, h.pos, h.yaw, 1, 0, v)) return;
    if (until < soonest) soonest = until;
    const d = Math.hypot(v.x - h.pos.x, v.z - h.pos.z);
    exitDist = Math.max(exitDist, h.shape.r + v.r - d);
  });
  return soonest;
}

/**
 * Leave the footprint of round ground hazards (erupting roots, pollen clouds, mire arms, ripples) DURING their telegraph, as a
 * player does when the decal appears: a roll only covers 0.25 s of i-frames, while these stay live for 0.35–0.7 s. The bot
 * probes 16 directions for a spot outside every pending hazard and inside the arena, runs there while the decal is young (or
 * rolls at once when the footprint is too wide to walk out of in time) and rolls when the hit is close. The sloppy profile
 * notices late (only rolls in the last 0.45 s).
 */
export function hazardEscape(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  const pv = pl.volume(vol, sim);
  pv.r += 0.3;
  const until = inRoundHazard(sim, pv, 1.2);
  if (!Number.isFinite(until)) return null;
  const need = exitDist;
  const perfect = bot.profile === 'perfect';
  if (!perfect && until > 0.45) return null;
  const arena = sim.zone?.activeArena ?? null;
  const boss = sim.boss;
  const away = boss ? Math.atan2(pl.pos.x - boss.pos.x, pl.pos.z - boss.pos.z) : pl.yaw;
  const reachD = Math.max(4.2, need + 0.4);
  let bestYaw = NaN, bestScore = -Infinity;
  for (let i = 0; i < ESCAPE_DIRS; i++) {
    const yaw = (i / ESCAPE_DIRS) * Math.PI * 2;
    let ok = true;
    for (const d of [2.4, reachD]) {
      probe.x = pl.pos.x + Math.sin(yaw) * d;
      probe.z = pl.pos.z + Math.cos(yaw) * d;
      probe.y = pl.pos.y; probe.r = pv.r - 0.1; probe.h = pv.h;
      if (arena && !insideArena(arena, probe.x, probe.z, 1.2)) { ok = false; break; }
      if (d === reachD && Number.isFinite(inRoundHazard(sim, probe, ESCAPE_HORIZON))) { ok = false; break; }
    }
    if (!ok) continue;
    // prefer staying near the boss (sideways) over fleeing; never run straight into it
    const rel = Math.abs(Math.atan2(Math.sin(yaw - away), Math.cos(yaw - away)));
    const score = -Math.abs(rel - Math.PI / 2) - (rel > 2.6 ? 2 : 0);
    if (score > bestScore) { bestScore = score; bestYaw = yaw; }
  }
  if (Number.isNaN(bestYaw)) return null;
  base.moveX = Math.sin(bestYaw);
  base.moveZ = Math.cos(bestYaw);
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.state === 'dodge' && pl.stateTime > 0.32);
  // walking (5 m/s) cannot cover the footprint in time: roll now
  const tooWide = need > 5 * Math.max(0, until - 0.2);
  if (until <= (perfect ? 0.4 : 0.3) || tooWide) {
    if (!free || pl.fiato <= 1 || sim.time - bot.lastDodgeTime < 0.34) return null;
    base.presses |= Btn.Dodge;
    bot.lastDodgeTime = sim.time;
    return base;
  }
  // early: walk out (only when not committed to a swing; otherwise let the generic logic finish it)
  return pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' ? base : null;
}

/**
 * Jump over expanding shockwave rings (the Elder Tree's heart pulse, slam rings): the card's answer to a ring. Rolling away from
 * it only rides along the wave past the i-frames. The jump is pressed so the feet are clear when the wave front arrives.
 */
export function ringJump(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  const perfect = bot.profile === 'perfect';
  // a ring is coming (the boss winds up a shockwave): stop starting swings so the jump is free when the wave arrives
  if (perfect && ringWindup(sim) && (pl.state === 'idle' || pl.state === 'move')) {
    // the same wind-up may also land a melee blow first (the Mostro's double slam: fists, then the mud ring): let the
    // generic logic roll out of it on time instead of holding still into it
    const blow = bot.threats(sim, 0.6).find((t) => !t.jumpable);
    if (blow && blow.t <= 0.1) return null;
    if (!ringSoon(sim, 0.3)) return base;
  }
  if (!(pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard') || pl.fiato < 12) return null;
  if (!ringSoon(sim, perfect ? 0.3 : 0.18)) return null;
  base.presses |= Btn.Jump;
  return base;
}

/** An enemy is in the telegraph of an attack that spawns a low shockwave ring, ending within 0.9 s. */
function ringWindup(sim: Sim): boolean {
  for (const a of sim.actors) {
    const atk = a.attack;
    if (!a.alive || a.team !== 'enemy' || !atk || atk.stage !== 'telegraph') continue;
    if ((atk.def.telegraph - atk.time) / atk.rate > 0.9) continue;
    for (const sp of atk.def.spawns ?? []) if (sp.type === 'shockwave' && sp.shape?.type === 'ring' && (sp.shape.height ?? 1) <= 1) return true;
  }
  return false;
}

/** A live low ring's wave front reaches the player in [lead - 0.06, lead] s. */
function ringSoon(sim: Sim, lead: number): boolean {
  const pl = sim.player;
  let hit = false;
  sim.hazards.forEachActive((h) => {
    if (hit || h.team !== 'enemy' || h.shape.type !== 'ring' || h.hitOnce.has(-1)) return;
    if ((h.shape.height ?? 1) > 1.0) return;
    const d = Math.hypot(pl.pos.x - h.pos.x, pl.pos.z - h.pos.z);
    const r0 = h.shape.r0, r1 = h.shape.r1;
    if (d < r0 - 0.5 || d > r1 + 1) return;
    const k = Math.min(1, Math.max(0, (d - r0) / Math.max(0.01, r1 - r0)));
    const impact = h.delay + k * h.activeDur - h.age;
    if (impact >= lead - 0.06 && impact <= lead) hit = true;
  });
  return hit;
}

/**
 * Get off the line of a through-charge (`charge_through` motion: the Great Devourer's breach across the rafts, the knight's
 * flank charges). The generic bot only reacts once the hitbox overlaps it, which is too late at 20+ m/s. A player reads the
 * wake line during the telegraph: the bot walks sideways off the predicted path while there is time and rolls across its
 * edge when the head is about to arrive.
 */
export function chargeDodge(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  const pl = sim.player;
  const perfect = bot.profile === 'perfect';
  let best: { t: number; yaw: number } | null = null;
  for (const a of sim.actors) {
    const atk = a.attack;
    if (!a.alive || a.team !== 'enemy' || !atk || atk.stage === 'recovery') continue;
    const mo = atk.def.motion?.find((m) => m.type === 'charge_through');
    if (!mo) continue;
    const speed = (mo.speed ?? 12) * a.scale;
    const elapsedActive = atk.stage === 'active' ? atk.activeTime : 0;
    if (elapsedActive > mo.t + mo.dur) continue;
    let width = 1.6, front = 3.5;
    for (const h of atk.def.hits ?? []) {
      if (h.shape.type === 'capsule') { width = h.shape.r; front = Math.max(h.shape.a[2], h.shape.b[2]); }
    }
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const dx = pl.pos.x - a.pos.x, dz = pl.pos.z - a.pos.z;
    const along = dx * fx + dz * fz;
    const lat = dx * fz - dz * fx; // + = the actor's left (local +X)
    const clear = (width + 0.45) * a.scale + 0.7;
    if (along < -1 || Math.abs(lat) > clear) continue;
    const telLeft = atk.stage === 'telegraph' ? (atk.def.telegraph - atk.time) / atk.rate : 0;
    const t = telLeft + Math.max(0, mo.t - elapsedActive) / atk.rate + Math.max(0, along - front * a.scale) / (speed * atk.rate);
    // escape across the path, on the player's side unless that side leaves the arena
    let side = lat >= 0 ? 1 : -1;
    const arena = sim.zone?.activeArena;
    const sx = (s: number) => pl.pos.x + fz * s * 3.2, sz = (s: number) => pl.pos.z - fx * s * 3.2;
    if (arena && !insideArena(arena, sx(side), sz(side), 0.8) && insideArena(arena, sx(-side), sz(-side), 0.8)) side = -side;
    const yaw = Math.atan2(fz * side, -fx * side);
    if (!best || t < best.t) best = { t, yaw };
  }
  if (!best) return null;
  const b = best as { t: number; yaw: number };
  base.moveX = Math.sin(b.yaw);
  base.moveZ = Math.cos(b.yaw);
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.state === 'dodge' && pl.stateTime > 0.32);
  if (b.t <= (perfect ? 0.12 : 0.06)) {
    if (!free || pl.fiato <= 1 || sim.time - bot.lastDodgeTime < 0.34) return null;
    base.presses |= Btn.Dodge;
    bot.lastDodgeTime = sim.time;
    return base;
  }
  if (!perfect || b.t > 1.4) return null;
  return pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' ? base : null;
}

/** All Act I defensive helpers in priority order. */
export function act1Defense(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (sim.seq.running || !sim.boss) return null;
  return boxHazardDodge(sim, bot, base) ?? chargeDodge(sim, bot, base) ?? ringJump(sim, bot, base) ?? hazardEscape(sim, bot, base);
}

const volR: TargetVol = { x: 0, y: 0, z: 0, r: 0, h: 0 };
const probeR = { x: 0, y: 0, z: 0 };

/** Jump incoming ground rings (perfect profile). Returns an input to use this tick, or null. */
export function shockRingJump(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (bot.profile !== 'perfect') return null;
  const pl = sim.player;
  const th = bot.threats(sim, 0.6);
  const t0 = th[0];
  if (!t0) return null;
  if (!pl.grounded) {
    // airborne over a ring: do nothing else this tick (no wasted dodge press)
    return t0.kind === 'ring' && t0.t < 0.35 ? base : null;
  }
  if (t0.kind !== 'ring' || !t0.jumpable) return null;
  if (pl.state !== 'idle' && pl.state !== 'move') return null;
  // another (non-jumpable) threat landing around the same time: let the generic dodge handle it
  if (th.some((t) => t.kind !== 'ring' && t.t < t0.t + 0.45)) return null;
  if (t0.t <= 0.23 && t0.t >= 0.1) {
    base.presses |= Btn.Jump;
    return base;
  }
  return null;
}

/** Earliest contact (s) of a moving enemy hazard with the player within `horizon`, and its velocity yaw. */
export function movingHazardContact(sim: Sim, horizon: number): { t: number; yaw: number } | null {
  const pl = sim.player;
  const pv = pl.volume(volR, sim);
  pv.r += 0.3;
  let best: { t: number; yaw: number } | null = null;
  sim.hazards.forEachActive((h) => {
    if (h.team !== 'enemy' || (h.vel.x === 0 && h.vel.z === 0) || h.hitOnce.has(-1)) return;
    for (let t = 0; t <= horizon; t += 1 / 60) {
      const age = h.age + t;
      if (age < h.delay) continue;
      if (age > h.delay + h.activeDur) break;
      probeR.x = h.pos.x + h.vel.x * t;
      probeR.y = h.pos.y;
      probeR.z = h.pos.z + h.vel.z * t;
      if (shapeHits(h.shape, probeR, h.yaw, 1, 0, pv)) {
        if (!best || t < best.t) best = { t, yaw: yawOf(h.vel.x, h.vel.z) };
        break;
      }
    }
  });
  return best;
}

/** Roll through a running wall of fire right before it reaches the player (perfect profile). */
export function waveDodge(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (bot.profile !== 'perfect') return null;
  const pl = sim.player;
  const c = movingHazardContact(sim, 0.4);
  if (!c) return null;
  const free = pl.state === 'idle' || pl.state === 'move' || pl.state === 'guard' || (pl.state === 'dodge' && pl.stateTime > 0.32);
  if (c.t <= 0.09 && free && pl.fiato > 1 && pl.grounded) {
    // through the wave: opposite to its travel direction
    const y = c.yaw + Math.PI;
    base.moveX = Math.sin(y);
    base.moveZ = Math.cos(y);
    base.presses |= Btn.Dodge;
    bot.lastDodgeTime = sim.time;
    return base;
  }
  return null;
}

/**
 * All Act II defensive helpers in priority order. The Act I helpers (tools/bot/hooks/cavaliere_errante.ts) cover the
 * generic shapes Act II shares: box hazards across their short axis, through-charges (Thunder's dashes) read during the
 * telegraph, ring wind-ups (hold swings so the jump is free) and round ground hazards (lightning marks, the storm, fire
 * pillars) left during their telegraph instead of being rolled at the last frame of a swing.
 */
export function act2Defense(sim: Sim, bot: Bot, base: PlayerInput): PlayerInput | null {
  if (sim.seq.running || !sim.boss) return null;
  return (
    waveDodge(sim, bot, base) ??
    boxHazardDodge(sim, bot, base) ??
    chargeDodge(sim, bot, base) ??
    shockRingJump(sim, bot, base) ??
    ringJump(sim, bot, base) ??
    hazardEscape(sim, bot, base)
  );
}
