/**
 * Weapon Arts (C4/C5/D8). Every Art = one reusable effect + params from data; visuals come from `vfx` (src/render/weapons).
 *
 * Damage model (documented in docs/WEAPONS.md):
 *  - `damage_mult` = the Art's total DIRECT damage as a multiple of the weapon's damage (18 + 4 x D): every strike,
 *    projectile, explosion and secondary wave of the Art landing on one large target adds up to it. Shares split it
 *    (`final_mult` = weight of the last strike, `*_share` = fraction of a secondary component).
 *  - `dps_mult` (with `time` / `dot_time` / `linger_time`) = lingering damage per second as a multiple of weapon damage
 *    (zones, vortices, poison), dealt only while the target stays inside: a skill bonus on top of the direct damage.
 *  - Equilibrio: Arte Prima +25, Arte Seconda +45 (+ `poise_bonus`) applied once, on the Art's first connecting hit.
 *
 * The sim drives Arts through `startArt` / `updateArt` (player state 'art'). Effects that outlive the animation (Innesto's
 * seed riding its victim, Falso Specchio exploding early when shattered, Ruggito's knockback) are tracked by
 * `updateArtEffects`, ticked by the sim every step; without that hook they degrade to their planted/expiry behavior.
 * Everything is deterministic (sim state and sim.rng only) and allocation-free per frame: hit shapes are reused scratch
 * objects; events are emitted only on cues.
 */
import { DEG, clamp, dist2D, forward, turnToward, v3, wrapAngle, yawTo, type Vec3 } from '../core/math';
import type { ArtDef, ArtEffect, ShapeDef, WeaponDef } from '../core/types';
import type { Player } from './player';
import type { Hazard, Projectile } from './pools';
import type { Sim } from './sim';

export interface ArtRuntime {
  def: ArtDef;
  weapon: WeaponDef;
  which: 'prima' | 'seconda';
  effect: ArtEffect;
  /** Time since the cast. */
  t: number;
  dur: number;
  uid: number;
  hit: Set<number>;
  ticks: Map<number, number>;
  /** Equilibrio still to deliver (consumed by the first connecting hit, projectile or hazard). */
  poiseLeft: number;
  /** Total direct damage budget: weapon damage x damage_mult x outgoing multipliers (Metamondo, buffs). */
  damage: number;
  /** Weapon damage x outgoing multipliers: lingering damage (dps_mult) is expressed against this. */
  base: number;
  invulnerable: boolean;
  cancelable: boolean;
  step: number;
  /** Per-effect scratch state (numbers only; read by the renderer too: under, caught, victim, window, countered...). */
  data: Record<string, number>;
  origin: Vec3;
  targetPos: Vec3;
  targetId: number;
  landed: boolean;
  /** Hits landed by the direct components. */
  hits: number;
  /** Facing at the cast. */
  yaw0: number;
}

let artUid = 2_000_000;
const tmp = v3();
const tmp2 = v3();
const tmp3 = v3();
/** How long before the end of the animation a finished Art may be cancelled by a buffered action. */
const CANCEL_LEAD = 0.22;

/* ----------------------------------------------------------------------------------------------------------------- */
/* Param helpers                                                                                                      */
/* ----------------------------------------------------------------------------------------------------------------- */

function p(def: ArtDef, k: string, d: number): number {
  const v = def.params[k];
  return typeof v === 'number' ? v : d;
}
function ps(def: ArtDef, k: string, d: string): string {
  const v = def.params[k];
  return typeof v === 'string' ? v : d;
}
function pb(def: ArtDef, k: string): boolean {
  return def.params[k] === true;
}

/** Comma lists from data (forms, wave kinds, per-strike elements), split once and cached. */
const listCache = new Map<string, string[]>();
function list(s: string): string[] {
  let l = listCache.get(s);
  if (!l) {
    l = s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
    listCache.set(s, l);
  }
  return l;
}

/** Default durations per effect (seconds) when params.dur is absent. */
const DUR: Record<ArtEffect, number> = {
  dash_strike: 0.6, spin: 0.75, multi_strike: 0.9, counter_stance: 1.3, projectile: 0.6, rain: 0.75, ground_wave: 0.7, slam: 0.9,
  grab_pull: 0.9, buff_self: 0.7, bind: 0.65, hazard_zone: 0.7, barrier: 0.6, decoy: 0.55, beam: 1.0, chain_lightning: 0.75,
  black_hole: 0.7, throw_return: 0.7, burrow: 1.4, dot_stab: 0.55, shape_shift: 0.6, cone_breath: 1.3, tentacle_ring: 0.95, waves: 1.3,
};

/* ----------------------------------------------------------------------------------------------------------------- */
/* Scratch hit shapes (the sim never stores melee shapes; hazards get their own objects)                             */
/* ----------------------------------------------------------------------------------------------------------------- */

type ArcShape = Extract<ShapeDef, { type: 'arc' }>;
type CapShape = Extract<ShapeDef, { type: 'capsule' }>;
type CylShape = Extract<ShapeDef, { type: 'cylinder' }>;
type SphShape = Extract<ShapeDef, { type: 'sphere' }>;
const ARC: ArcShape = { type: 'arc', r: 1, r_in: 0, angle: 90, yaw: 0, y: [-0.5, 3] };
const CAP: CapShape = { type: 'capsule', a: [0, 1, 0], b: [0, 1, 1], r: 0.5 };
const CYL: CylShape = { type: 'cylinder', c: [0, 0, 0], r: 1, h: 3 };
const SPH: SphShape = { type: 'sphere', c: [0, 1, 1], r: 1 };

function arc(r: number, angle: number, yawDeg = 0, rIn = 0, y0 = -0.5, y1 = 3.2): ShapeDef {
  ARC.r = r; ARC.angle = angle; ARC.yaw = yawDeg; ARC.r_in = rIn;
  ARC.y![0] = y0; ARC.y![1] = y1;
  return ARC;
}
function cap(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): ShapeDef {
  CAP.a[0] = ax; CAP.a[1] = ay; CAP.a[2] = az;
  CAP.b[0] = bx; CAP.b[1] = by; CAP.b[2] = bz;
  CAP.r = r;
  return CAP;
}
function cyl(cx: number, cy: number, cz: number, r: number, h: number): ShapeDef {
  CYL.c[0] = cx; CYL.c[1] = cy; CYL.c[2] = cz;
  CYL.r = r; CYL.h = h;
  return CYL;
}
function sph(cx: number, cy: number, cz: number, r: number): ShapeDef {
  SPH.c[0] = cx; SPH.c[1] = cy; SPH.c[2] = cz;
  SPH.r = r;
  return SPH;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                                      */
/* ----------------------------------------------------------------------------------------------------------------- */

function scaleOf(pl: Player): number {
  return Math.max(0.3, pl.scale);
}

/** Direct hit with a share of the Art's damage budget. tick > 0 allows re-hits every `tick` seconds. */
function strike(sim: Sim, pl: Player, art: ArtRuntime, shape: ShapeDef, share: number, tick = 0, origin: Vec3 = pl.pos, yaw = pl.yaw): number {
  const n = sim.playerArtHit(pl, art, shape, origin, yaw, scaleOf(pl), 0, art.damage * share, tick);
  if (n > 0) {
    art.landed = true;
    art.hits += n;
  }
  return n;
}

/** Same as strike, with a per-strike element (Tridente's three points). Restores the content value immediately. */
function strikeElement(sim: Sim, pl: Player, art: ArtRuntime, shape: ShapeDef, share: number, element: string): number {
  const params = art.def.params;
  const prev = params.element;
  params.element = element;
  const n = strike(sim, pl, art, shape, share);
  if (prev === undefined) delete params.element;
  else params.element = prev;
  return n;
}

/** Discrete multi-hit scheduler: returns the index of the hit due this step, or -1. */
function due(art: ArtRuntime, key: string, t: number, start: number, interval: number, count: number): number {
  const done = art.data[key] ?? 0;
  if (done >= count || t < start + done * interval) return -1;
  art.data[key] = done + 1;
  return done;
}

function fin(art: ArtRuntime): void {
  art.data.fin = 1;
}

function advance(pl: Player, dist: number): void {
  forward(pl.yaw, tmp);
  pl.pos.x += tmp.x * dist;
  pl.pos.z += tmp.z * dist;
}

/** Point in front of the player (ground level). */
function front(pl: Player, dist: number, out: Vec3): Vec3 {
  forward(pl.yaw, tmp);
  out.x = pl.pos.x + tmp.x * dist;
  out.y = pl.pos.y;
  out.z = pl.pos.z + tmp.z * dist;
  return out;
}

function firstHit(art: ArtRuntime): number {
  for (const id of art.hit) return id;
  for (const id of art.ticks.keys()) return id;
  return -1;
}

/** Newest active hazard / projectile spawned by this Art. */
function lastHazard(sim: Sim, art: ArtRuntime): Hazard | null {
  let best: Hazard | null = null;
  const items = sim.hazards.items;
  for (let i = 0; i < items.length; i++) {
    const h = items[i];
    if (h.active && h.instance === art.uid && (!best || h.id > best.id)) best = h;
  }
  return best;
}
function lastProjectile(sim: Sim, art: ArtRuntime): Projectile | null {
  let best: Projectile | null = null;
  const items = sim.projectiles.items;
  for (let i = 0; i < items.length; i++) {
    const pr = items[i];
    if (pr.active && pr.instance === art.uid && (!best || pr.id > best.id)) best = pr;
  }
  return best;
}
function tagHazard(h: Hazard | null, tag: string): Hazard | null {
  if (h) h.tag = tag;
  return h;
}

/** Move a volley's Equilibrio onto the projectile flying closest to the aim line (the middle of a fan). */
function centerPoise(sim: Sim, art: ArtRuntime): void {
  const aim = yawTo(sim.player.pos, art.targetPos);
  let best: Projectile | null = null;
  let bd = Infinity;
  let poise = 0;
  const items = sim.projectiles.items;
  for (let i = 0; i < items.length; i++) {
    const pr = items[i];
    if (!pr.active || pr.instance !== art.uid) continue;
    poise += pr.poise;
    pr.poise = 0;
    const dd = Math.abs(wrapAngle(Math.atan2(pr.vel.x, pr.vel.z) - aim)) + (pr.age < 0 ? -pr.age : 0);
    if (dd < bd) {
      bd = dd;
      best = pr;
    }
  }
  if (best) best.poise = poise;
}

/** Visual cue for the renderer: vfx id `<art vfx>:<phase>` at a position, with the player's yaw and two numbers. */
function cue(sim: Sim, pl: Player, art: ArtRuntime, phase: string, pos: Vec3, k = 0, n = 0): void {
  sim.emit({ type: 'vfx', id: `${art.def.vfx ?? `art_${art.def.id}`}:${phase}`, pos: { x: pos.x, y: pos.y, z: pos.z }, params: { yaw: pl.yaw, k, n, uid: art.uid } });
}

function shake(sim: Sim, strength: number, dur: number): void {
  sim.emit({ type: 'shake', strength, dur });
}

/** Freeze / slow every actor hit so far by this Art. */
function freezeHit(sim: Sim, art: ArtRuntime, time: number): void {
  for (const id of art.hit) {
    const a = sim.actorById(id);
    if (!a || !a.alive) continue;
    const k = a.mass === 'light' ? 1 : a.mass === 'heavy' ? 0.7 : 0.45;
    a.bound = Math.max(a.bound, time * k);
    a.slowed = Math.max(a.slowed, time * 2);
    a.slowPower = Math.max(a.slowPower, 0.5);
    sim.emit({ type: 'vfx', id: 'freeze', pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, params: { r: a.radius * a.scale, h: a.height * a.scale, time } });
  }
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Start                                                                                                              */
/* ----------------------------------------------------------------------------------------------------------------- */

export function startArt(sim: Sim, pl: Player, weapon: WeaponDef, def: ArtDef, which: 'prima' | 'seconda'): ArtRuntime {
  const E = sim.bal.equilibrio;
  const s = scaleOf(pl);
  const base = pl.baseDamage(sim, weapon) * pl.outgoingMult(sim);
  const total = base * p(def, 'damage_mult', which === 'prima' ? 2.2 : 3.2);
  // aim: lock point, else the nearest enemy in a forward cone, else 8 m ahead
  const targetPos = v3();
  let targetId = -1;
  const lock = pl.lock ? sim.lockPointPos(pl.lock.actor, pl.lock.part, tmp2) : null;
  if (lock && pl.lock) {
    targetPos.x = lock.x; targetPos.y = lock.y; targetPos.z = lock.z;
    targetId = pl.lock.actor;
  } else {
    const e = sim.nearestEnemy(pl.pos, 24 * s, pl.yaw, 50 * DEG);
    if (e) {
      targetPos.x = e.pos.x; targetPos.y = e.pos.y + e.height * e.scale * 0.5; targetPos.z = e.pos.z;
      targetId = e.id;
    } else front(pl, 8 * s, targetPos);
  }
  const art: ArtRuntime = {
    def, weapon, which, effect: def.effect, t: 0, dur: p(def, 'dur', DUR[def.effect] ?? 0.8), uid: artUid++, hit: new Set(), ticks: new Map(),
    poiseLeft: (which === 'prima' ? E.arte_prima : E.arte_seconda) + p(def, 'poise_bonus', 0),
    damage: total, base, invulnerable: false, cancelable: false, step: 0, data: {},
    origin: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z }, targetPos, targetId, landed: false, hits: 0, yaw0: pl.yaw,
  };
  switch (def.effect) {
    case 'burrow':
      art.invulnerable = true;
      break;
    case 'buff_self':
      pl.buff = { element: ps(def, 'element', 'fire'), time: p(def, 'time', 10), bonus: p(def, 'bonus', 0.35) };
      sim.emit({ type: 'vfx', id: `buff_${pl.buff.element}`, pos: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z }, params: { time: pl.buff.time } });
      break;
    case 'shape_shift': {
      // Metamorfosi locks the blade into the form it has right now (the combo step just shown); recasting cycles onward.
      const forms = list(ps(def, 'forms', 'spada_lunga,frusta,ascia_a_due_mani,lancia'));
      let idx: number;
      if (pl.shapeShift) idx = (forms.indexOf(pl.shapeShift.type) + 1) % forms.length;
      else idx = pl.comboTimer > 0 && pl.comboIndex > 0 ? (pl.comboIndex - 1) % forms.length : 0;
      const next = forms[Math.max(0, idx)];
      pl.shapeShift = { type: next, time: p(def, 'time', 10) };
      art.data.form = idx;
      sim.emit({ type: 'vfx', id: `shape_shift_${next}`, pos: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z } });
      break;
    }
    default:
      break;
  }
  return art;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Update                                                                                                             */
/* ----------------------------------------------------------------------------------------------------------------- */

/** Returns true when the Art has finished. */
export function updateArt(sim: Sim, pl: Player, art: ArtRuntime, dt: number): boolean {
  art.t += dt;
  const d = art.def;
  const s = scaleOf(pl);
  const t = art.t;
  const lockPos = pl.lock ? sim.lockPointPos(pl.lock.actor, pl.lock.part, tmp2) : null;
  if (lockPos && pl.lock) {
    art.targetPos.x = lockPos.x; art.targetPos.y = lockPos.y; art.targetPos.z = lockPos.z;
    art.targetId = pl.lock.actor;
  }
  switch (art.effect) {
    case 'dash_strike': updateDash(sim, pl, art, dt, t, s, lockPos); break;
    case 'spin': updateSpin(sim, pl, art, dt, t, s); break;
    case 'multi_strike': updateMulti(sim, pl, art, t, s, lockPos); break;
    case 'counter_stance': updateCounter(sim, pl, art, t); break;
    case 'projectile': updateProjectile(sim, pl, art, t); break;
    case 'rain': updateRain(sim, pl, art, t, s); break;
    case 'ground_wave': updateGroundWave(sim, pl, art, t, s); break;
    case 'slam': updateSlam(sim, pl, art, dt, t, s, lockPos); break;
    case 'grab_pull': updateGrab(sim, pl, art, t, s); break;
    case 'buff_self': updateBuff(sim, pl, art, t, s); break;
    case 'bind': updateBind(sim, pl, art, t, s); break;
    case 'hazard_zone': updateZone(sim, pl, art, t, s); break;
    case 'barrier': updateBarrier(sim, pl, art, t, s); break;
    case 'decoy': updateDecoy(sim, pl, art, t, s); break;
    case 'beam': updateBeam(sim, pl, art, dt, t, lockPos); break;
    case 'chain_lightning': updateChain(sim, pl, art, t, s); break;
    case 'black_hole': updateBlackHole(sim, pl, art, t, s); break;
    case 'throw_return': updateThrow(sim, pl, art, t, s); break;
    case 'burrow': updateBurrow(sim, pl, art, t, s, lockPos); break;
    case 'dot_stab': updateDotStab(sim, pl, art, t); break;
    case 'shape_shift': updateShapeShift(sim, pl, art, t); break;
    case 'cone_breath': updateCone(sim, pl, art, dt, t, lockPos); break;
    case 'tentacle_ring': updateTentacles(sim, pl, art, t, s); break;
    case 'waves': updateWaves(sim, pl, art, t); break;
  }
  if (art.data.fin && !art.cancelable && t >= art.dur - CANCEL_LEAD) {
    art.cancelable = true;
    art.invulnerable = false;
  }
  return art.t >= art.dur;
}

/* --- dash_strike: Carica del Custode, Fendente Itinerante, Primo Passo, Sibilo, Affondo Gelido, Urto del Baluardo,
       Imboscata Verde, Carica Corazzata, Punta di Cristallo, Perforazione ------------------------------------------- */
function updateDash(sim: Sim, pl: Player, art: ArtRuntime, dt: number, t: number, s: number, lockPos: Vec3 | null): void {
  const d = art.def;
  const dist = p(d, 'distance', 6) * s;
  const t0 = 0.08, t1 = Math.max(t0 + 0.12, art.dur * 0.62);
  const through = pb(d, 'through'), guarded = pb(d, 'guarded');
  const drill = Math.round(p(d, 'drill', 0));
  const dbl = pb(d, 'double');
  const dShare = dbl ? p(d, 'double_share', 0.4) : 0;
  const reach = p(d, 'reach', 2.4), width = p(d, 'width', 0.9);
  if (t >= t0 && t <= t1) {
    if (!art.data.go) {
      art.data.go = 1;
      cue(sim, pl, art, 'dash', pl.pos, dist, reach * s);
    }
    let sp = dist / (t1 - t0);
    if (!through) {
      if (lockPos && dist2D(pl.pos, lockPos) - sim.lockRadius(pl) < 0.9 * s) sp *= 0.1;
      else if (art.hits > 0 && drill <= 0) sp *= 0.3;
    } else if (art.data.passed) sp *= 0.12;
    advance(pl, sp * dt);
    art.invulnerable = through || guarded;
    const k = (t - t0) / (t1 - t0);
    const shape = cap(0, 1.05, 0.2, 0, pb(d, 'rising') ? 1.0 + k * 1.6 : 1.1, reach, width);
    if (drill > 0) {
      const interval = (t1 - t0) / drill;
      if ((art.data.dh ?? 0) < drill && strike(sim, pl, art, shape, (1 - dShare) / drill, interval * 0.95) > 0) {
        art.data.dh = (art.data.dh ?? 0) + 1;
        if (art.data.dh === 1) onDashHit(sim, pl, art, s);
      }
    } else if (!art.data.c1 && strike(sim, pl, art, shape, 1 - dShare) > 0) {
      art.data.c1 = 1;
      onDashHit(sim, pl, art, s);
    }
    // dash THROUGH the target: once it connects, come out on the far side
    if (through && art.hits > 0 && !art.data.passed) {
      const a = sim.actorById(firstHit(art));
      if (a && a.alive) {
        art.data.passed = 1;
        forward(pl.yaw, tmp);
        const out = a.radius * a.scale + 1.1 * s;
        pl.pos.x = a.pos.x + tmp.x * out;
        pl.pos.z = a.pos.z + tmp.z * out;
        cue(sim, pl, art, 'through', pl.pos);
      }
    }
  } else if (t > t1 && !art.data.endInv) {
    art.data.endInv = 1;
    art.invulnerable = false;
  }
  if (dbl && !art.data.c2 && t >= t1 + 0.05) {
    // the second cut, turning back toward the target
    art.data.c2 = 1;
    art.hit.clear();
    if (lockPos) pl.yaw = yawTo(pl.pos, lockPos);
    else pl.yaw = wrapAngle(pl.yaw + Math.PI);
    strike(sim, pl, art, arc(reach * 1.4, 170, 0, 0, -0.5, 3.4), dShare);
    cue(sim, pl, art, 'second', pl.pos);
  }
  if (t >= t1 + (dbl ? 0.06 : 0)) fin(art);
}

function onDashHit(sim: Sim, pl: Player, art: ArtRuntime, s: number): void {
  const d = art.def;
  const kb = p(d, 'knockback', 0);
  if (kb > 0) sim.pushEnemies(pl.pos, p(d, 'reach', 2.4) * s + 2, kb);
  const freeze = p(d, 'freeze', 0);
  if (freeze > 0) freezeHit(sim, art, freeze);
  if (pb(d, 'shatter')) {
    front(pl, p(d, 'reach', 2.4) * s * 0.8, tmp3);
    tmp3.y += 1.1 * s;
    cue(sim, pl, art, 'shatter', tmp3);
    shake(sim, 0.35, 0.25);
  } else cue(sim, pl, art, 'hit', pl.pos);
}

/* --- spin: Ruota d'Argento, Spinta della Corrente, Tempesta di Schegge, Vortice, Colpo d'Ala, Sibilo Multiplo,
       Raccolto d'Ombra --------------------------------------------------------------------------------------------- */
function updateSpin(sim: Sim, pl: Player, art: ArtRuntime, dt: number, t: number, s: number): void {
  const d = art.def;
  const hits = Math.max(1, Math.round(p(d, 'hits', 1)));
  const start = 0.16, win = art.dur * 0.55;
  const interval = hits > 1 ? win / (hits - 1) : 0;
  const r = p(d, 'radius', 3), ang = p(d, 'angle', 360), rin = p(d, 'r_in', 0);
  const mv = p(d, 'move', 0) * s;
  if (mv > 0 && t >= start && t <= start + win) advance(pl, (mv / win) * dt);
  const k = due(art, 'k', t, start, interval, hits);
  if (k < 0) return;
  art.hit.clear();
  if (k === 0) cue(sim, pl, art, 'spin', pl.pos, r * s, hits);
  const n = strike(sim, pl, art, arc(r, ang, 0, rin, -0.5, 3.4), 1 / hits);
  if (n > 0) {
    const kb = p(d, 'knockback', 0), pull = p(d, 'pull', 0);
    if (kb > 0 && k === hits - 1) sim.pushEnemies(pl.pos, r * s + 1.5, kb);
    if (pull > 0) sim.pushEnemies(pl.pos, r * s + 3, -pull / hits);
    const refund = p(d, 'eco_refund', 0);
    if (refund > 0 && !art.data.refunded) {
      art.data.refunded = 1;
      pl.eco = Math.min(sim.bal.eco.max, pl.eco + refund);
      sim.emit({ type: 'cue', id: 'eco_refund', pos: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z } });
      cue(sim, pl, art, 'refund', pl.pos, refund);
    }
  }
  if (k === hits - 1) fin(art);
}

/* --- multi_strike: Ninnananna dell'Alba, Danza dei Cristalli, Tre Morsi, Graffio Valanga, Branco, Abbattimento,
       Falcata Incrociata, Sciame, Potatura, Triplice Affondo, Nove Morsi -------------------------------------------- */
function updateMulti(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number, lockPos: Vec3 | null): void {
  const d = art.def;
  const count = Math.max(1, Math.round(p(d, 'count', 3)));
  const interval = p(d, 'interval', 0.16), start = p(d, 'start', 0.12);
  const kind = ps(d, 'shape', 'slash');
  const finalW = p(d, 'final_mult', 1);
  const burstR = p(d, 'burst', 0);
  const burstShare = burstR > 0 ? p(d, 'burst_share', 0.3) : 0;
  const projKind = ps(d, 'projectile', '');
  const projShare = projKind ? p(d, 'proj_share', 0.3) : 0;
  const reach = p(d, 'reach', 2.8), angle = p(d, 'angle', kind === 'fan' ? 120 : 90);
  const wsum = count - 1 + finalW;
  const idx = due(art, 'k', t, start, interval, count);
  if (idx >= 0) {
    art.hit.clear();
    const w = ((idx === count - 1 ? finalW : 1) / wsum) * (1 - burstShare);
    if (pb(d, 'teleport') && lockPos) {
      // Branco: strikes from different angles around the target, like a pack
      const ang = yawTo(lockPos, pl.pos) + (idx - (count - 1) / 2) * 1.75;
      const rr = sim.lockRadius(pl) + 1.5 * s;
      pl.pos.x = lockPos.x + Math.sin(ang) * rr;
      pl.pos.z = lockPos.z + Math.cos(ang) * rr;
      pl.yaw = yawTo(pl.pos, lockPos);
      sim.collidePlayer(pl);
      art.invulnerable = true;
    } else if (lockPos) pl.yaw = yawTo(pl.pos, lockPos);
    let shape: ShapeDef;
    switch (kind) {
      case 'thrust': {
        const x = ((idx % 3) - 1) * 0.22;
        shape = cap(x, 1.15, 0.3, x * 0.4, 1.15, reach, 0.55);
        break;
      }
      case 'fan':
        // every lash sweeps the whole fan (the visuals spread the cords across it)
        shape = arc(reach, Math.max(angle, p(d, 'fan_angle', angle)), 0, 0.4);
        break;
      case 'cross':
      case 'scissor':
        shape = arc(reach, angle, idx % 2 ? -8 : 8, 0, -0.4, 3.4);
        break;
      default:
        shape = arc(reach, angle, idx % 2 ? -10 : 10);
        break;
    }
    const els = ps(d, 'elements', '');
    if (els) {
      const l = list(els);
      strikeElement(sim, pl, art, shape, w * (1 - projShare), l[idx % l.length]);
    } else strike(sim, pl, art, shape, w * (1 - projShare));
    if (projKind) {
      const keep = art.damage;
      art.damage = keep * w * projShare;
      sim.firePlayerArtProjectile(pl, art, projKind, { count: 1, spread: 0, speed: p(d, 'proj_speed', 30), mult: 1, life: 1.2 });
      art.damage = keep;
    }
    cue(sim, pl, art, 'strike', pl.pos, idx, count);
    const step = p(d, 'step', 0.3) * s;
    if (step > 0 && !(lockPos && dist2D(pl.pos, lockPos) - sim.lockRadius(pl) < 0.8 * s)) advance(pl, step);
    if (idx === count - 1 && burstR <= 0) fin(art);
  }
  const doneAt = start + interval * (count - 1);
  if (burstR > 0 && !art.data.burst && (art.data.k ?? 0) >= count && t >= doneAt + 0.16) {
    // the crossed strokes hang in the air, then detonate
    art.data.burst = 1;
    art.hit.clear();
    const fz = reach * 0.6;
    strike(sim, pl, art, sph(0, 1.2, fz, burstR), burstShare);
    front(pl, fz * s, tmp3);
    tmp3.y += 1.2 * s;
    cue(sim, pl, art, 'burst', tmp3, burstR * s);
    sim.emit({ type: 'shockwave', pos: { x: tmp3.x, y: pl.pos.y, z: tmp3.z }, radius: burstR * s, element: (ps(d, 'element', 'light') as 'light') });
    fin(art);
  }
  if ((art.data.k ?? 0) >= count && t > doneAt + interval) art.invulnerable = false;
}

/* --- counter_stance: Postura del Viandante --------------------------------------------------------------------------- */
function updateCounter(sim: Sim, pl: Player, art: ArtRuntime, t: number): void {
  const d = art.def;
  const winEnd = art.dur - 0.3;
  const c = art.data.countered ?? 0;
  // the window is read by combat.ts when a hit reaches the player
  art.data.window = !c && t >= 0.05 && t <= winEnd ? 1 : 0;
  if (!c) {
    if (t > winEnd) fin(art);
    return;
  }
  if (!art.data.counterDone) {
    art.invulnerable = true;
    if (t >= c + 0.1) {
      art.data.counterDone = 1;
      art.hit.clear();
      strike(sim, pl, art, arc(p(d, 'reach', 3.4), p(d, 'angle', 150), 0, 0, -0.5, 3.6), 1);
      sim.emit({ type: 'counter', pos: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z } });
      cue(sim, pl, art, 'counter', pl.pos);
      shake(sim, 0.3, 0.2);
      art.dur = Math.min(art.dur, t + 0.5);
    }
  } else if (t >= c + 0.42) {
    art.invulnerable = false;
    fin(art);
  }
}

/* --- projectile: Richiamo delle Anime, Fioritura, Ruggito Spirituale, Freccia Planante, Dardo Incendiario, Salva a
       Scaglie, Taglio Lunare, Cometa, Giuramento di Luce, Alba Spezzata ------------------------------------------------ */
function updateProjectile(sim: Sim, pl: Player, art: ArtRuntime, t: number): void {
  const d = art.def;
  const at = p(d, 'delay', 0.25);
  if (t < at || art.data.fired) return;
  art.data.fired = 1;
  const kind = ps(d, 'kind', 'w_link_orb');
  const k = sim.c.projectile(kind);
  const count = Math.max(1, Math.round(p(d, 'count', 1)));
  const explode = p(d, 'explode_radius', k?.explode_radius ?? 0);
  const cutShare = pb(d, 'cut') ? p(d, 'cut_share', 0.3) : 0;
  if (cutShare > 0) strike(sim, pl, art, arc(p(d, 'reach', 3.2), 150, 0, 0, -0.4, 3.2), cutShare);
  // per-projectile damage so that every projectile (and its explosion) landing adds up to the budget
  const per = (art.damage * (1 - cutShare)) / count / (explode > 0 ? 1.6 : 1);
  const keep = art.damage;
  art.damage = per * (count > 1 ? count * 0.55 : 1);
  const homing = d.params.homing !== undefined ? p(d, 'homing', 0) : k?.homing;
  const status = ps(d, 'status', '');
  sim.firePlayerArtProjectile(pl, art, kind, {
    count, spread: p(d, 'spread', 0), speed: p(d, 'speed', k?.speed ?? 22), accel: p(d, 'accel', 0), explode, pierce: pb(d, 'pierce'),
    homing, status: status || undefined, mult: 1, life: p(d, 'life', k?.life ?? 2.5), sequential: p(d, 'sequential', 0),
  });
  art.damage = keep;
  if (count > 1) centerPoise(sim, art);
  const kb = p(d, 'knockback', 0);
  if (kb > 0) {
    const pr = lastProjectile(sim, art);
    if (pr) addLinger(sim, LK_KNOCK, -1, pr.id, -1, kb);
  }
  front(pl, 0.8 * scaleOf(pl), tmp3);
  tmp3.y += 1.3 * scaleOf(pl);
  cue(sim, pl, art, 'release', tmp3, count);
  fin(art);
}

/* --- rain: Pioggia d'Oro ---------------------------------------------------------------------------------------------- */
function updateRain(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.28 || art.data.fired) return;
  art.data.fired = 1;
  const count = Math.max(1, Math.round(p(d, 'count', 12)));
  const radius = p(d, 'radius', 4) * s;
  // each arrow deals budget / (count / 2): about half the volley lands on a large target
  sim.spawnPlayerRain(pl, art, art.targetPos, count, radius, p(d, 'delay', 0.6), ps(d, 'visual', 'light'));
  // the arrow nearest the aim point carries the Equilibrio
  let best: Hazard | null = null;
  let bd = Infinity;
  const items = sim.hazards.items;
  for (let i = 0; i < items.length; i++) {
    const h = items[i];
    if (!h.active || h.instance !== art.uid) continue;
    h.tag = 'rain';
    const dd = (h.pos.x - art.targetPos.x) ** 2 + (h.pos.z - art.targetPos.z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = h;
    }
  }
  if (best) {
    let poise = 0;
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      if (h.active && h.instance === art.uid) {
        poise += h.poise;
        h.poise = 0;
      }
    }
    best.poise = poise;
  }
  cue(sim, pl, art, 'volley', pl.pos, radius);
  tmp3.x = art.targetPos.x; tmp3.z = art.targetPos.z; tmp3.y = sim.groundAt(tmp3.x, tmp3.z);
  cue(sim, pl, art, 'mark', tmp3, radius, p(d, 'delay', 0.6));
  fin(art);
}

/* --- ground_wave: Onda Incandescente, Frattura Magmatica, Pugno Cratere ----------------------------------------------- */
function updateGroundWave(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < p(d, 'at', 0.3) || art.data.fired) return;
  art.data.fired = 1;
  const kind = ps(d, 'kind', 'line');
  const cutShare = pb(d, 'cut') ? p(d, 'cut_share', 0.3) : 0;
  if (cutShare > 0) strike(sim, pl, art, arc(p(d, 'reach', 3.4), 130, 0, 0, -0.4, 3.4), cutShare);
  const length = p(d, 'length', 12) * s, width = p(d, 'width', 1.6) * s, speed = p(d, 'speed', 16) * s;
  const visual = ps(d, 'visual', 'fire'), status = ps(d, 'status', '');
  const keep = art.damage;
  art.damage = keep * (1 - cutShare);
  sim.spawnPlayerWave(pl, art, { kind, length, width, speed, visual, status, radius: p(d, 'radius', 6) * s });
  art.damage = keep;
  const wave = lastHazard(sim, art);
  if (wave && kind !== 'fissure') wave.tag = kind === 'ring' ? 'ring' : 'wave';
  const linger = Math.round(p(d, 'linger', 0));
  if (linger > 0) {
    // the fissure leaves burning pools along its path as it passes
    const poise = art.poiseLeft;
    art.poiseLeft = 0;
    const keepD = art.damage;
    art.damage = art.base;
    forward(pl.yaw, tmp2);
    for (let i = 0; i < linger; i++) {
      const dd = 1.2 + (length * (i + 0.7)) / (linger + 0.4);
      tmp3.x = pl.pos.x + tmp2.x * dd; tmp3.z = pl.pos.z + tmp2.z * dd; tmp3.y = pl.pos.y;
      sim.spawnPlayerZone(pl, art, tmp3, width * 0.75, p(d, 'linger_time', 3), visual, p(d, 'dps_mult', 0.2), status);
      const h = tagHazard(lastHazard(sim, art), 'pool');
      if (h) h.delay = 0.1 + dd / Math.max(1, speed);
    }
    art.damage = keepD;
    art.poiseLeft = poise;
  }
  cue(sim, pl, art, 'release', pl.pos, kind === 'ring' ? p(d, 'radius', 6) * s : length, kind === 'ring' ? 0 : speed);
  shake(sim, 0.22, 0.2);
  fin(art);
}

/* --- slam: Colpo Melmoso, Sprofondamento, Schianto Tonante, Eruzione, Balzo Predatore, Tuffo del Rapace, Caduta ------ */
function updateSlam(sim: Sim, pl: Player, art: ArtRuntime, dt: number, t: number, s: number, lockPos: Vec3 | null): void {
  const d = art.def;
  const leap = pb(d, 'leap');
  const impact = p(d, 'impact', leap ? 0.55 : 0.4);
  if (leap && t < impact) {
    if (!art.data.leap) {
      art.data.leap = 1;
      const max = p(d, 'leap_dist', 6) * s;
      art.data.ld = lockPos ? clamp(dist2D(pl.pos, lockPos) - sim.lockRadius(pl) - 0.4 * s, 0, max) : max;
      cue(sim, pl, art, 'leap', pl.pos, art.data.ld, impact);
    }
    if (lockPos) pl.yaw = turnToward(pl.yaw, yawTo(pl.pos, lockPos), 6 * dt);
    advance(pl, (art.data.ld / impact) * dt);
    pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) + Math.sin((t / impact) * Math.PI) * p(d, 'height', 2.4) * s;
    art.data.air = 1;
    art.invulnerable = t > 0.08;
  }
  const ringShare = pb(d, 'ring') ? p(d, 'ring_share', 0.3) : 0;
  const rakeShare = pb(d, 'rake') ? p(d, 'rake_share', 0.3) : 0;
  if (t >= impact && !art.data.fired) {
    art.data.fired = 1;
    art.data.air = 0;
    art.invulnerable = false;
    pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z);
    const r = p(d, 'radius', 4);
    const element = ps(d, 'element', 'physical');
    strike(sim, pl, art, cyl(0, -0.5, leap ? 0.3 : 0.9, r, 4.5), 1 - ringShare - rakeShare);
    forward(pl.yaw, tmp);
    const cz = leap ? 0.3 : 0.9;
    tmp3.x = pl.pos.x + tmp.x * cz * s; tmp3.z = pl.pos.z + tmp.z * cz * s; tmp3.y = pl.pos.y;
    sim.emit({ type: 'shockwave', pos: { x: tmp3.x, y: tmp3.y, z: tmp3.z }, radius: r * s, element: element as 'physical' });
    shake(sim, 0.3 + Math.min(0.3, r * 0.04), 0.3);
    if (ps(d, 'status', '') === 'slow') sim.slowEnemies(tmp3, r * s + 1, p(d, 'slow_time', 3), 0.4);
    if (ringShare > 0) {
      const keep = art.damage;
      art.damage = keep * ringShare;
      sim.spawnPlayerWave(pl, art, { kind: 'ring', length: 0, width: 1.4 * s, speed: 0, visual: ps(d, 'visual', element === 'physical' ? 'crack' : element), status: '', radius: p(d, 'ring_radius', 7) * s });
      art.damage = keep;
      tagHazard(lastHazard(sim, art), 'ring');
    }
    if (pb(d, 'pit')) {
      const poise = art.poiseLeft;
      art.poiseLeft = 0;
      const keep = art.damage;
      art.damage = art.base;
      sim.spawnPlayerZone(pl, art, tmp3, r * s, p(d, 'zone_time', 4), ps(d, 'visual', 'mud'), p(d, 'dps_mult', 0.25), 'slow');
      art.damage = keep;
      art.poiseLeft = poise;
      tagHazard(lastHazard(sim, art), 'pit');
    }
    cue(sim, pl, art, 'impact', tmp3, r * s);
    if (rakeShare <= 0) fin(art);
  }
  if (rakeShare > 0 && art.data.fired && !art.data.rake && t >= impact + 0.16) {
    art.data.rake = 1;
    art.hit.clear();
    strike(sim, pl, art, arc(2.9, 140, 0, 0, -0.5, 3), rakeShare);
    cue(sim, pl, art, 'rake', pl.pos);
    fin(art);
  }
}

/* --- grab_pull: Avvolgimento, Guinzaglio, Presa Ardente, Lancio e Richiamo, Morsa -------------------------------------- */
function updateGrab(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  const range = p(d, 'range', 8);
  const c0 = 0.16, c1 = 0.44;
  const crush = Math.round(p(d, 'crush', 0));
  const throwIt = pb(d, 'throw');
  const grabShare = crush > 0 || throwIt ? p(d, 'grab_share', 0.4) : 1;
  if (!art.data.caught && t >= c0 && t <= c1) {
    // a thrown hook (harpoon) flies out: the catch line grows to full range
    const len = pb(d, 'thrown') ? 1 + (range - 1) * clamp(((t - c0) / (c1 - c0)) * 1.6, 0, 1) : range;
    art.data.len = len * s;
    if (!art.data.cast) {
      art.data.cast = 1;
      cue(sim, pl, art, 'cast', pl.pos, range * s);
    }
    if (strike(sim, pl, art, cap(0, 1.1, 0.4, 0, 1.1, len, 0.8), grabShare) > 0) {
      art.data.caught = t;
      const id = firstHit(art);
      art.data.victim = id;
      sim.pullEnemyToward(pl, id, p(d, 'pull', 4) * s, p(d, 'hold', 0));
      const a = sim.actorById(id);
      if (a) cue(sim, pl, art, 'catch', a.pos, a.radius * a.scale, a.height * a.scale);
    }
  }
  if (!art.data.caught) {
    if (t > c1 && !art.data.miss) {
      art.data.miss = 1;
      cue(sim, pl, art, 'miss', pl.pos);
      fin(art);
    }
    return;
  }
  const ct = art.data.caught;
  if (crush > 0) {
    const k = due(art, 'cr', t, ct + 0.22, 0.26, crush);
    if (k >= 0) {
      art.hit.clear();
      strike(sim, pl, art, arc(range + 1.2, 110, 0, 0, -0.5, 4), (1 - grabShare) / crush);
      cue(sim, pl, art, 'crush', pl.pos, k, crush);
      shake(sim, 0.18, 0.15);
      if (k === crush - 1) fin(art);
    }
  } else if (throwIt) {
    if (!art.data.thrown && t >= ct + 0.38) {
      art.data.thrown = 1;
      art.hit.clear();
      strike(sim, pl, art, arc(Math.max(3.2, range * 0.7), 130, 0, 0, -0.5, 4), 1 - grabShare);
      const a = sim.actorById(art.data.victim);
      const pos = a ? a.pos : pl.pos;
      sim.emit({ type: 'shockwave', pos: { x: pos.x, y: pos.y, z: pos.z }, radius: 3 * s, element: ps(d, 'element', 'physical') as 'physical' });
      cue(sim, pl, art, 'throw', pos);
      shake(sim, 0.35, 0.3);
      fin(art);
    }
  } else fin(art);
}

/* --- buff_self: Lama Rovente ------------------------------------------------------------------------------------------ */
function updateBuff(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.3 || art.data.fired) return;
  art.data.fired = 1;
  if (pb(d, 'burst')) {
    const r = p(d, 'radius', 3);
    strike(sim, pl, art, cyl(0, -0.5, 0, r, 3.5), 1);
    sim.emit({ type: 'shockwave', pos: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z }, radius: r * s, element: ps(d, 'element', 'fire') as 'fire' });
  }
  cue(sim, pl, art, 'ignite', pl.pos, p(d, 'radius', 3) * s, p(d, 'time', 10));
  fin(art);
}

/* --- bind: Radici Fameliche, Innesto -------------------------------------------------------------------------------- */
function updateBind(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  const radius = p(d, 'radius', 2.5) * s, delay = p(d, 'delay', 0.4), bindTime = p(d, 'bind_time', 2.5), visual = ps(d, 'visual', 'roots');
  if (pb(d, 'plant')) {
    const plantShare = p(d, 'plant_share', 0.3);
    if (!art.data.stab && t >= 0.16 && t <= 0.34) {
      if (strike(sim, pl, art, cap(0, 1.1, 0.3, 0, 1.1, p(d, 'reach', 2.6), 0.6), plantShare) > 0) {
        art.data.stab = 1;
        art.data.victim = firstHit(art);
      }
    }
    if (t >= 0.34 && !art.data.fired) {
      art.data.fired = 1;
      const a = art.data.stab ? sim.actorById(art.data.victim) : undefined;
      if (a) {
        tmp3.x = a.pos.x; tmp3.y = a.pos.y; tmp3.z = a.pos.z;
      } else front(pl, p(d, 'reach', 2.6) * s * 0.8, tmp3);
      const keep = art.damage;
      art.damage = keep * (1 - plantShare);
      sim.spawnPlayerBind(pl, art, tmp3, radius, delay, bindTime, visual);
      art.damage = keep;
      const h = tagHazard(lastHazard(sim, art), 'seed');
      if (h && a) addLinger(sim, LK_SEED, h.id, -1, a.id, 0);
      cue(sim, pl, art, 'plant', tmp3, radius, delay);
      fin(art);
    }
    return;
  }
  if (t < 0.22 || art.data.fired) return;
  art.data.fired = 1;
  sim.spawnPlayerBind(pl, art, art.targetPos, radius, delay, bindTime, visual);
  tagHazard(lastHazard(sim, art), 'bind');
  tmp3.x = art.targetPos.x; tmp3.z = art.targetPos.z; tmp3.y = sim.groundAt(tmp3.x, tmp3.z);
  cue(sim, pl, art, 'cast', tmp3, radius, delay);
  fin(art);
}

/* --- hazard_zone: Falciata Eclissi, Falciata Glaciale --------------------------------------------------------------- */
function updateZone(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  const radius = p(d, 'radius', 3) * s, time = p(d, 'time', 5), visual = ps(d, 'visual', 'mud'), status = ps(d, 'status', '');
  const dps = p(d, 'dps_mult', 0.3);
  if (pb(d, 'trail')) {
    const reach = p(d, 'reach', 4), angle = p(d, 'angle', 160);
    if (t >= 0.2 && !art.data.cut) {
      art.data.cut = 1;
      strike(sim, pl, art, arc(reach, angle, 0, 0.5, -0.5, 3.4), 1);
      cue(sim, pl, art, 'cut', pl.pos, reach * s, angle);
    }
    if (t >= 0.26 && !art.data.fired) {
      // the blade's path stays behind as a trail of lingering ground
      art.data.fired = 1;
      const n = Math.max(1, Math.round(p(d, 'trail_count', 4)));
      const poise = art.poiseLeft;
      art.poiseLeft = 0;
      const keep = art.damage;
      art.damage = art.base;
      for (let i = 0; i < n; i++) {
        const a = pl.yaw + (-angle / 2 + (angle * (i + 0.5)) / n) * DEG;
        const rr = reach * 0.62 * s;
        tmp3.x = pl.pos.x + Math.sin(a) * rr; tmp3.z = pl.pos.z + Math.cos(a) * rr; tmp3.y = pl.pos.y;
        sim.spawnPlayerZone(pl, art, tmp3, radius, time, visual, dps, status);
        const h = tagHazard(lastHazard(sim, art), 'trail');
        if (h) h.delay = 0.05 + i * 0.035;
      }
      art.damage = keep;
      art.poiseLeft = poise;
      fin(art);
    }
    return;
  }
  if (t < 0.3 || art.data.fired) return;
  art.data.fired = 1;
  const at = ps(d, 'at', 'front');
  if (at === 'target') { tmp3.x = art.targetPos.x; tmp3.z = art.targetPos.z; tmp3.y = pl.pos.y; }
  else if (at === 'self') { tmp3.x = pl.pos.x; tmp3.z = pl.pos.z; tmp3.y = pl.pos.y; }
  else front(pl, 3 * s, tmp3);
  sim.spawnPlayerBind(pl, art, tmp3, radius, 0.05, 0, visual);
  tagHazard(lastHazard(sim, art), 'burst');
  const keep = art.damage;
  art.damage = art.base;
  sim.spawnPlayerZone(pl, art, tmp3, radius, time, visual, dps, status);
  art.damage = keep;
  tagHazard(lastHazard(sim, art), 'zone');
  cue(sim, pl, art, 'zone', tmp3, radius, time);
  fin(art);
}

/* --- barrier: Muro di Brina ------------------------------------------------------------------------------------------- */
function updateBarrier(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.22 || art.data.fired) return;
  art.data.fired = 1;
  front(pl, 1.6 * s, tmp3);
  sim.addBarrier(tmp3, pl.yaw, p(d, 'width', 4) * s, p(d, 'time', 6));
  if (pb(d, 'shock')) {
    // the wall erupts out of the ground: everything at its foot is struck
    strike(sim, pl, art, cyl(0, -0.5, 1.6 + p(d, 'radius', 3) * 0.4, p(d, 'radius', 3), 4), 1);
    sim.emit({ type: 'shockwave', pos: { x: tmp3.x, y: tmp3.y, z: tmp3.z }, radius: p(d, 'radius', 3) * s, element: ps(d, 'element', 'ice') as 'ice' });
  }
  cue(sim, pl, art, 'raise', tmp3, p(d, 'width', 4) * s, p(d, 'time', 6));
  fin(art);
}

/* --- decoy: Falso Specchio -------------------------------------------------------------------------------------------- */
function updateDecoy(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.2 || art.data.fired) return;
  art.data.fired = 1;
  const time = p(d, 'time', 6);
  front(pl, 2.5 * s, tmp3);
  sim.spawnDecoy(tmp3, pl.yaw, time);
  const decoy = sim.actors[sim.actors.length - 1];
  if (pb(d, 'burst')) {
    // when the illusion vanishes (or the boss shatters it) it explodes
    sim.spawnPlayerBind(pl, art, tmp3, p(d, 'radius', 3) * s, time, 0, 'mirror');
    const h = tagHazard(lastHazard(sim, art), 'decoy_burst');
    if (h && decoy && decoy.kind === 'decoy') addLinger(sim, LK_DECOY, h.id, -1, decoy.id, 0);
  }
  cue(sim, pl, art, 'mirror', tmp3, time);
  fin(art);
}

/* --- beam: Congiunzione, Verità Scomoda ------------------------------------------------------------------------------ */
function updateBeam(sim: Sim, pl: Player, art: ArtRuntime, dt: number, t: number, lockPos: Vec3 | null): void {
  const d = art.def;
  const t0 = p(d, 'at', 0.3), bt = p(d, 'beam_time', 0.5);
  const ticks = Math.max(1, Math.round(p(d, 'ticks', 3)));
  if (lockPos && t < t0 + bt) pl.yaw = turnToward(pl.yaw, yawTo(pl.pos, lockPos), (t < t0 ? 10 : 4) * dt);
  if (t >= t0) {
    const k = due(art, 'k', t, t0, ticks > 1 ? bt / (ticks - 1) : 0, ticks);
    if (k >= 0) {
      art.hit.clear();
      if (k === 0) cue(sim, pl, art, 'fire', pl.pos, p(d, 'length', 18) * scaleOf(pl), bt);
      strike(sim, pl, art, cap(0, 1.25, 0.5, 0, 1.25, p(d, 'length', 18), p(d, 'width', 0.8)), 1 / ticks);
      if (pb(d, 'dispel') && k === 0) {
        const keep = art.damage;
        art.damage = keep * 0.5;
        sim.dispelIllusions(pl, art);
        art.damage = keep;
      }
    }
  }
  if ((art.data.k ?? 0) >= ticks) fin(art);
}

/* --- chain_lightning: Catena di Fulmini -------------------------------------------------------------------------------- */
function updateChain(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.25 || art.data.fired) return;
  art.data.fired = 1;
  const b = Math.max(0, Math.round(p(d, 'bounces', 3)));
  const range = p(d, 'range', 14) * s;
  // sim.chainLightning attenuates each bounce; scale so the whole chain on one target equals the budget
  let sum = 0;
  for (let i = 0; i <= b; i++) sum += 1 / (1 + i * 0.15);
  const first = pl.lock ? sim.actorById(pl.lock.actor) : sim.nearestEnemy(pl.pos, range, pl.yaw, Math.PI);
  const keep = art.damage;
  art.damage = (keep * Math.max(1, (b + 1) * 0.6)) / sum;
  sim.chainLightning(pl, art, b, range);
  art.damage = keep;
  if (first && first.alive) {
    art.landed = true;
    art.hits += b + 1;
  }
  cue(sim, pl, art, 'cast', pl.pos, b);
  fin(art);
}

/* --- black_hole: Foro Nero, Settimo Anello ------------------------------------------------------------------------------ */
function updateBlackHole(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.28 || art.data.fired) return;
  art.data.fired = 1;
  const radius = p(d, 'radius', 4) * s, time = p(d, 'time', 3);
  if (ps(d, 'at', 'front') === 'target') { tmp3.x = art.targetPos.x; tmp3.z = art.targetPos.z; tmp3.y = pl.pos.y; }
  else front(pl, p(d, 'dist', 5) * s, tmp3);
  const visual = ps(d, 'visual', 'void');
  const keep = art.damage;
  art.damage = art.base;
  sim.spawnPlayerVortex(pl, art, tmp3, radius, time, p(d, 'pull', 5), p(d, 'dps_mult', 0.5), visual);
  art.damage = keep;
  tagHazard(lastHazard(sim, art), 'vortex');
  if (pb(d, 'burst')) {
    // the vortex collapses on itself at the end
    sim.spawnPlayerBind(pl, art, tmp3, radius * 0.85, time, 0, visual);
    tagHazard(lastHazard(sim, art), 'collapse');
  }
  cue(sim, pl, art, 'open', tmp3, radius, time);
  fin(art);
}

/* --- throw_return: Lancio Orbitale, Lancio del Tridente ---------------------------------------------------------------- */
function updateThrow(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  if (t < 0.2 || art.data.fired) return;
  art.data.fired = 1;
  const kind = ps(d, 'kind', 'w_orbital_chakram');
  const k = sim.c.projectile(kind);
  const speed = p(d, 'speed', k?.speed ?? 22);
  const distance = p(d, 'distance', 12) * s;
  const keep = art.damage;
  art.damage = keep / 2; // one pass out, one pass back
  sim.firePlayerArtProjectile(pl, art, kind, {
    count: 1, spread: 0, speed, returns: true, maxDist: distance, pierce: true, mult: 1, life: Math.max(2.6, (2.6 * distance) / speed),
    // straight out and back along the aim line (the visuals spin and curve it): it crosses the target twice
    homing: p(d, 'homing', 0),
  });
  art.damage = keep;
  const pr = lastProjectile(sim, art);
  if (pr) pr.tag = 'thrown_weapon';
  cue(sim, pl, art, 'throw', pl.pos, distance);
  fin(art);
}

/* --- burrow: Scavo ------------------------------------------------------------------------------------------------------ */
function updateBurrow(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number, lockPos: Vec3 | null): void {
  const d = art.def;
  const travel = p(d, 'travel', 0.9);
  art.invulnerable = t < travel + 0.18;
  if (t < travel) {
    const k = clamp(t / travel, 0, 1);
    const dest = lockPos ?? art.targetPos;
    const rr = lockPos ? sim.lockRadius(pl) * 0.6 : 0;
    const ang = yawTo(art.origin, dest);
    const tx = dest.x - Math.sin(ang) * rr, tz = dest.z - Math.cos(ang) * rr;
    pl.pos.x = art.origin.x + (tx - art.origin.x) * k;
    pl.pos.z = art.origin.z + (tz - art.origin.z) * k;
    pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) - 1.2 * Math.sin(k * Math.PI);
    pl.yaw = ang;
    if (!art.data.under) cue(sim, pl, art, 'dig', pl.pos, travel);
    art.data.under = 1;
  } else if (!art.data.fired) {
    art.data.fired = 1;
    art.data.under = 0;
    pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z);
    if (lockPos) pl.yaw = yawTo(pl.pos, lockPos);
    const r = p(d, 'radius', 3.5);
    strike(sim, pl, art, cyl(0, -1, 0, r, 6), 1);
    sim.emit({ type: 'shockwave', pos: { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z }, radius: r * s, element: 'physical' });
    cue(sim, pl, art, 'emerge', pl.pos, r * s);
    shake(sim, 0.45, 0.35);
    fin(art);
  }
}

/* --- dot_stab: Puntura Acida ------------------------------------------------------------------------------------------- */
function updateDotStab(sim: Sim, pl: Player, art: ArtRuntime, t: number): void {
  const d = art.def;
  if (!art.data.stab && t >= 0.14 && t <= 0.3) {
    if (strike(sim, pl, art, cap(0, 1.1, 0.3, 0, 1.1, p(d, 'reach', 2.2), 0.55), 1) > 0) {
      art.data.stab = 1;
      const id = firstHit(art);
      sim.applyDotToTarget(pl, id, art.base * p(d, 'dps_mult', 0.2), p(d, 'dot_time', 6), ps(d, 'element', 'poison'));
      const a = sim.actorById(id);
      if (a) cue(sim, pl, art, 'inject', a.pos, p(d, 'dot_time', 6));
    }
  }
  if (t > 0.3) fin(art);
}

/* --- shape_shift: Metamorfosi ------------------------------------------------------------------------------------------ */
function updateShapeShift(sim: Sim, pl: Player, art: ArtRuntime, t: number): void {
  const d = art.def;
  if (t < 0.22 || art.data.fired) return;
  art.data.fired = 1;
  const r = p(d, 'burst', 2.4);
  strike(sim, pl, art, arc(r, 360, 0, 0, -0.5, 3.2), 1);
  cue(sim, pl, art, 'morph', pl.pos, art.data.form ?? 0, r * scaleOf(pl));
  fin(art);
}

/* --- cone_breath: Respiro Primordiale ------------------------------------------------------------------------------------ */
function updateCone(sim: Sim, pl: Player, art: ArtRuntime, dt: number, t: number, lockPos: Vec3 | null): void {
  const d = art.def;
  const t0 = 0.25, t1 = Math.max(t0 + 0.1, art.dur - 0.15);
  const ticks = Math.max(1, Math.round(p(d, 'ticks', 6)));
  if (t >= t0) {
    if (lockPos && t <= t1) pl.yaw = turnToward(pl.yaw, yawTo(pl.pos, lockPos), 2 * dt);
    const k = due(art, 'k', t, t0, ticks > 1 ? (t1 - t0) / (ticks - 1) : 0, ticks);
    if (k >= 0) {
      art.hit.clear();
      if (k === 0) cue(sim, pl, art, 'breath', pl.pos, p(d, 'range', 8) * scaleOf(pl), t1 - t0);
      strike(sim, pl, art, arc(p(d, 'range', 8), p(d, 'angle', 50), 0, 0, -0.5, 4), 1 / ticks);
    }
  }
  if ((art.data.k ?? 0) >= ticks) fin(art);
}

/* --- tentacle_ring: Risveglio Abissale ----------------------------------------------------------------------------------- */
function updateTentacles(sim: Sim, pl: Player, art: ArtRuntime, t: number, s: number): void {
  const d = art.def;
  const ticks = Math.max(1, Math.round(p(d, 'ticks', 2)));
  const r = p(d, 'radius', 5);
  const k = due(art, 'k', t, 0.25, 0.18, ticks);
  if (k < 0) return;
  art.hit.clear();
  if (k === 0) {
    cue(sim, pl, art, 'erupt', pl.pos, r * s, ticks);
    sim.pushEnemies(pl.pos, r * s + 1, -p(d, 'pull', 2));
    shake(sim, 0.3, 0.3);
  }
  strike(sim, pl, art, arc(r, 360, 0, 0, -0.5, 4.2), 1 / ticks);
  if (k === ticks - 1) fin(art);
}

/* --- waves: Tre Soffi, Stormo di Corvi ------------------------------------------------------------------------------------- */
function updateWaves(sim: Sim, pl: Player, art: ArtRuntime, t: number): void {
  const d = art.def;
  const count = Math.max(1, Math.round(p(d, 'count', 3)));
  const k = due(art, 'k', t, 0.2, p(d, 'interval', 0.32), count);
  if (k < 0) return;
  const kinds = list(ps(d, 'kinds', 'w_link_wave'));
  const keep = art.damage;
  art.damage = keep / count;
  sim.firePlayerArtProjectile(pl, art, kinds[k % kinds.length], { count: 1, spread: 0, speed: p(d, 'speed', 20), pierce: true, mult: 1, life: 1.6 });
  art.damage = keep;
  const spread = p(d, 'spread', 0);
  if (spread > 0 && k > 0) {
    // ravens fan out to alternate sides
    const pr = lastProjectile(sim, art);
    if (pr) {
      const off = (k % 2 ? 1 : -1) * ((k + 1) >> 1) * (spread / Math.max(1, count)) * DEG;
      const c = Math.cos(off), sn = Math.sin(off);
      const vx = pr.vel.x, vz = pr.vel.z;
      pr.vel.x = vx * c + vz * sn;
      pr.vel.z = -vx * sn + vz * c;
    }
  }
  cue(sim, pl, art, 'wave', pl.pos, k, count);
  if (k === count - 1) fin(art);
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Lingering effects (outlive the Art animation; ticked by the sim through updateArtEffects)                          */
/* ----------------------------------------------------------------------------------------------------------------- */

const LK_SEED = 1;
const LK_DECOY = 2;
const LK_KNOCK = 3;

interface Linger {
  active: boolean;
  kind: number;
  sim: Sim | null;
  hazard: number;
  proj: number;
  target: number;
  power: number;
  seen: number;
}
const LINGER: Linger[] = [];
for (let i = 0; i < 16; i++) LINGER.push({ active: false, kind: 0, sim: null, hazard: -1, proj: -1, target: -1, power: 0, seen: 0 });
let hookSim: Sim | null = null;
let hookTick = -1000;

/** True when the sim ticks updateArtEffects (docs/requests/weapons.md #5). */
export function artEffectsHooked(sim: Sim): boolean {
  return hookSim === sim && sim.tick - hookTick <= 2;
}

function addLinger(sim: Sim, kind: number, hazard: number, proj: number, target: number, power: number): void {
  if (!artEffectsHooked(sim)) return;
  let slot: Linger | null = null;
  for (const l of LINGER) if (!l.active) { slot = l; break; }
  if (!slot) return;
  slot.active = true; slot.kind = kind; slot.sim = sim; slot.hazard = hazard; slot.proj = proj; slot.target = target; slot.power = power; slot.seen = 0;
}

function hazardById(sim: Sim, id: number): Hazard | null {
  const items = sim.hazards.items;
  for (let i = 0; i < items.length; i++) if (items[i].active && items[i].id === id) return items[i];
  return null;
}
function projectileById(sim: Sim, id: number): Projectile | null {
  const items = sim.projectiles.items;
  for (let i = 0; i < items.length; i++) if (items[i].active && items[i].id === id) return items[i];
  return null;
}

/** Tick lingering Art effects. Called by the sim every step (after hazards). */
export function updateArtEffects(sim: Sim, _dt: number): void {
  hookSim = sim;
  hookTick = sim.tick;
  for (const l of LINGER) {
    if (!l.active) continue;
    if (l.sim !== sim) {
      l.active = false;
      continue;
    }
    if (l.kind === LK_SEED) {
      // Innesto: the seed rides its victim until it blooms
      const h = hazardById(sim, l.hazard);
      const a = sim.actorById(l.target);
      if (!h || h.age >= h.delay || !a || !a.alive) {
        l.active = false;
        continue;
      }
      h.pos.x = a.pos.x;
      h.pos.z = a.pos.z;
      h.pos.y = sim.groundAt(a.pos.x, a.pos.z);
    } else if (l.kind === LK_DECOY) {
      // Falso Specchio: shattered early -> explode now
      const h = hazardById(sim, l.hazard);
      if (!h || h.age >= h.delay) {
        l.active = false;
        continue;
      }
      const a = sim.actorById(l.target);
      if (!a || !a.alive) {
        h.delay = h.age + 0.05;
        l.active = false;
      }
    } else if (l.kind === LK_KNOCK) {
      // Ruggito Spirituale: the spirit bowls over what it runs through
      const pr = projectileById(sim, l.proj);
      if (!pr) {
        l.active = false;
        continue;
      }
      if (pr.hit.size > l.seen) {
        l.seen = pr.hit.size;
        sim.pushEnemies(pr.pos, pr.radius + 2.5, l.power);
      }
    }
  }
}

/** Drop every lingering effect (fight cleared, zone change). */
export function clearArtEffects(): void {
  for (const l of LINGER) {
    l.active = false;
    l.sim = null;
  }
}
