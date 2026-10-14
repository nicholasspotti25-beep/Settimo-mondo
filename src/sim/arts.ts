/**
 * Weapon Arts: reusable effects parameterized from data (D8). Each Art = effect + params; visuals come from `vfx`.
 * Damage per hit = weapon damage x params.damage_mult x outgoing multipliers. Equilibrio: Arte Prima +25, Arte Seconda +45
 * applied on the Art's first connecting hit (plus params.poise_bonus).
 */
import { DEG, clamp, dist2D, forward, v3, wrapAngle, yawTo, type Vec3 } from '../core/math';
import type { ArtDef, ArtEffect, ShapeDef, WeaponDef } from '../core/types';
import type { Player } from './player';
import type { Sim } from './sim';

export interface ArtRuntime {
  def: ArtDef;
  weapon: WeaponDef;
  which: 'prima' | 'seconda';
  effect: ArtEffect;
  t: number;
  dur: number;
  uid: number;
  hit: Set<number>;
  ticks: Map<number, number>;
  poiseLeft: number;
  damage: number;
  invulnerable: boolean;
  cancelable: boolean;
  step: number;
  data: Record<string, number>;
  origin: Vec3;
  targetPos: Vec3;
  targetId: number;
  landed: boolean;
}

let artUid = 2_000_000;
const tmp = v3();
const tmp2 = v3();

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

/** Default durations per effect (seconds) when params.dur is absent. */
const DUR: Record<ArtEffect, number> = {
  dash_strike: 0.6, spin: 0.75, multi_strike: 0.9, counter_stance: 1.3, projectile: 0.6, rain: 0.7, ground_wave: 0.6, slam: 0.9,
  grab_pull: 0.8, buff_self: 0.6, bind: 0.6, hazard_zone: 0.6, barrier: 0.5, decoy: 0.5, beam: 1.0, chain_lightning: 0.7,
  black_hole: 0.6, throw_return: 0.7, burrow: 1.4, dot_stab: 0.55, shape_shift: 0.5, cone_breath: 1.3, tentacle_ring: 0.9, waves: 1.3,
};

export function startArt(sim: Sim, pl: Player, weapon: WeaponDef, def: ArtDef, which: 'prima' | 'seconda'): ArtRuntime {
  const E = sim.bal.equilibrio;
  const dmgMult = p(def, 'damage_mult', which === 'prima' ? 1.5 : 2.2);
  const lock = pl.lock ? sim.lockPointPos(pl.lock.actor, pl.lock.part, tmp2) : null;
  const fwd = forward(pl.yaw, tmp);
  const targetPos = lock ? { ...lock } : { x: pl.pos.x + fwd.x * 8 * Math.max(0.3, pl.scale), y: pl.pos.y, z: pl.pos.z + fwd.z * 8 * Math.max(0.3, pl.scale) };
  const art: ArtRuntime = {
    def, weapon, which, effect: def.effect, t: 0, dur: p(def, 'dur', DUR[def.effect] ?? 0.8), uid: artUid++, hit: new Set(), ticks: new Map(),
    poiseLeft: (which === 'prima' ? E.arte_prima : E.arte_seconda) + p(def, 'poise_bonus', 0),
    damage: pl.baseDamage(sim, weapon) * dmgMult * pl.outgoingMult(sim), invulnerable: false, cancelable: false, step: 0, data: {},
    origin: { ...pl.pos }, targetPos, targetId: pl.lock?.actor ?? -1, landed: false,
  };
  if (def.effect === 'burrow') art.invulnerable = true;
  if (def.effect === 'buff_self') {
    pl.buff = { element: ps(def, 'element', 'fire'), time: p(def, 'time', 10), bonus: p(def, 'bonus', 0.35) };
  }
  if (def.effect === 'shape_shift') {
    const forms = ps(def, 'forms', 'spada_lunga,frusta,ascia_a_due_mani,lancia').split(',');
    const cur = pl.shapeShift ? forms.indexOf(pl.shapeShift.type) : -1;
    const next = forms[(cur + 1) % forms.length];
    pl.shapeShift = { type: next, time: p(def, 'time', 10) };
    sim.emit({ type: 'vfx', id: `shape_shift_${next}`, pos: { ...pl.pos } });
  }
  return art;
}

/** Hit test helper shared by effects. */
function strike(sim: Sim, pl: Player, art: ArtRuntime, shape: ShapeDef, origin: Vec3, yaw: number, opts: { tick?: number; mult?: number; progress?: number; scale?: number } = {}): number {
  const n = sim.playerArtHit(pl, art, shape, origin, yaw, opts.scale ?? Math.max(0.3, pl.scale), opts.progress ?? 0, art.damage * (opts.mult ?? 1), opts.tick ?? 0);
  if (n > 0) art.landed = true;
  return n;
}

/** Returns true when the Art has finished. */
export function updateArt(sim: Sim, pl: Player, art: ArtRuntime, dt: number): boolean {
  art.t += dt;
  const d = art.def;
  const s = Math.max(0.3, pl.scale);
  const t = art.t;
  const lockPos = pl.lock ? sim.lockPointPos(pl.lock.actor, pl.lock.part, tmp2) : null;
  if (lockPos) {
    art.targetPos.x = lockPos.x; art.targetPos.y = lockPos.y; art.targetPos.z = lockPos.z;
  }
  switch (art.effect) {
    case 'dash_strike': {
      const dist = p(d, 'distance', 6) * s;
      const t0 = 0.08, t1 = art.dur * 0.75;
      if (t >= t0 && t <= t1) {
        const through = pb(d, 'through');
        let sp = dist / (t1 - t0);
        if (lockPos && !through && dist2D(pl.pos, lockPos) - sim.lockRadius(pl) < 0.9) sp *= 0.1;
        forward(pl.yaw, tmp);
        pl.pos.x += tmp.x * sp * dt;
        pl.pos.z += tmp.z * sp * dt;
        if (through) art.invulnerable = true;
        const reach = p(d, 'reach', 2.4);
        strike(sim, pl, art, { type: 'capsule', a: [0, 1, 0], b: [0, pb(d, 'rising') ? 2.2 : 1, reach], r: p(d, 'width', 0.9) }, pl.pos, pl.yaw);
      } else art.invulnerable = false;
      if (pb(d, 'double') && t > t1 && t < t1 + 0.12) strike(sim, pl, art, { type: 'arc', r: 3, angle: 140 }, pl.pos, pl.yaw, { mult: 0.8, tick: 0.11 });
      break;
    }
    case 'spin': {
      const hits = Math.max(1, Math.round(p(d, 'hits', 1)));
      const interval = (art.dur * 0.6) / hits;
      const r = p(d, 'radius', 3);
      if (t >= 0.18 && t <= 0.18 + interval * hits) {
        const n = strike(sim, pl, art, { type: 'arc', r, angle: 360, y: [-0.5, 3] }, pl.pos, pl.yaw, { tick: hits > 1 ? interval : 0 });
        if (n > 0) {
          const kb = p(d, 'knockback', 0), pull = p(d, 'pull', 0);
          if (kb || pull) sim.pushEnemies(pl.pos, r * s + 1, kb - pull);
          const refund = p(d, 'eco_refund', 0);
          if (refund && !art.data.refunded) {
            art.data.refunded = 1;
            pl.eco = Math.min(sim.bal.eco.max, pl.eco + refund);
            sim.emit({ type: 'cue', id: 'eco_refund' });
          }
        }
      }
      break;
    }
    case 'multi_strike': {
      const count = Math.max(1, Math.round(p(d, 'count', 3)));
      const interval = p(d, 'interval', 0.16);
      const start = 0.12;
      const idx = Math.floor((t - start) / interval);
      if (idx >= 0 && idx < count && art.step <= idx) {
        art.step = idx + 1;
        art.hit.clear();
        const shapeKind = ps(d, 'shape', 'slash');
        const reach = p(d, 'reach', 2.8);
        const angle = p(d, 'angle', shapeKind === 'fan' ? 120 : 80);
        if (pb(d, 'teleport') && lockPos) {
          // strikes from different angles around the target
          const ang = yawTo(lockPos, pl.pos) + (idx - (count - 1) / 2) * 1.6;
          const rr = sim.lockRadius(pl) + 1.6 * s;
          pl.pos.x = lockPos.x + Math.sin(ang) * rr;
          pl.pos.z = lockPos.z + Math.cos(ang) * rr;
          pl.yaw = yawTo(pl.pos, lockPos);
          sim.collidePlayer(pl);
          art.invulnerable = true;
        } else if (lockPos) pl.yaw = yawTo(pl.pos, lockPos);
        const shape: ShapeDef = shapeKind === 'thrust'
          ? { type: 'capsule', a: [0, 1, 0.3], b: [0, 1, reach], r: 0.6 }
          : { type: 'arc', r: reach, angle, yaw: shapeKind === 'fan' ? (idx - (count - 1) / 2) * (angle / Math.max(1, count)) : 0 };
        strike(sim, pl, art, shape, pl.pos, pl.yaw);
        const proj = ps(d, 'projectile', '');
        if (proj) sim.firePlayerArtProjectile(pl, art, proj, { count: 1, spread: 0, speed: p(d, 'proj_speed', 22), mult: p(d, 'proj_mult', 0.5) });
        forward(pl.yaw, tmp);
        const step = p(d, 'step', 0.35) * s;
        pl.pos.x += tmp.x * step;
        pl.pos.z += tmp.z * step;
      }
      if (t > start + interval * count) art.invulnerable = false;
      break;
    }
    case 'counter_stance': {
      // the counter itself is resolved by the sim when the player is hit during the stance window
      art.data.window = t >= 0.05 && t <= art.dur - 0.25 ? 1 : 0;
      if (art.data.countered && !art.data.counterDone && t >= art.data.countered + 0.12) {
        art.data.counterDone = 1;
        art.hit.clear();
        strike(sim, pl, art, { type: 'arc', r: p(d, 'reach', 3.4), angle: 150 }, pl.pos, pl.yaw, { mult: p(d, 'counter_mult', 1.6) });
        sim.emit({ type: 'counter', pos: { ...pl.pos } });
      }
      break;
    }
    case 'projectile': {
      const at = p(d, 'delay', 0.25);
      if (t >= at && !art.data.fired) {
        art.data.fired = 1;
        sim.firePlayerArtProjectile(pl, art, ps(d, 'kind', 'art_orb'), {
          count: p(d, 'count', 1), spread: p(d, 'spread', 0), speed: p(d, 'speed', 22), accel: p(d, 'accel', 0), explode: p(d, 'explode_radius', 0),
          pierce: pb(d, 'pierce'), homing: p(d, 'homing', 0), status: ps(d, 'status', ''), mult: 1, life: p(d, 'life', 2.5), sequential: p(d, 'sequential', 0),
        });
      }
      const seq = p(d, 'sequential', 0);
      if (seq > 0 && art.data.fired) {
        // additional delayed volleys (e.g. ravens, souls)
        const count = p(d, 'count', 1);
        const k = Math.floor((t - at) / seq);
        if (k > (art.data.vol ?? 0) && k < count) {
          art.data.vol = k;
        }
      }
      break;
    }
    case 'rain': {
      const at = p(d, 'delay', 0.5);
      if (t >= 0.25 && !art.data.fired) {
        art.data.fired = 1;
        sim.spawnPlayerRain(pl, art, art.targetPos, p(d, 'count', 12), p(d, 'radius', 4) * s, at, ps(d, 'kind', 'golden_arrow_rain'));
      }
      break;
    }
    case 'ground_wave': {
      if (t >= p(d, 'at', 0.25) && !art.data.fired) {
        art.data.fired = 1;
        sim.spawnPlayerWave(pl, art, {
          kind: ps(d, 'kind', 'line'), length: p(d, 'length', 12) * s, width: p(d, 'width', 1.6) * s, speed: p(d, 'speed', 16) * s,
          visual: ps(d, 'visual', 'fire'), status: ps(d, 'status', ''), radius: p(d, 'radius', 6) * s,
        });
      }
      break;
    }
    case 'slam': {
      const leap = pb(d, 'leap');
      const impact = p(d, 'impact', leap ? 0.55 : 0.4);
      if (leap && t < impact) {
        const dist = Math.min(p(d, 'leap_dist', 6) * s, lockPos ? Math.max(0, dist2D(pl.pos, lockPos) - sim.lockRadius(pl) - 0.6) : 99);
        forward(pl.yaw, tmp);
        pl.pos.x += tmp.x * (dist / impact) * dt;
        pl.pos.z += tmp.z * (dist / impact) * dt;
        pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) + Math.sin((t / impact) * Math.PI) * 2.4 * s;
        art.invulnerable = t > 0.1;
      }
      if (t >= impact && !art.data.fired) {
        art.data.fired = 1;
        art.invulnerable = false;
        pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z);
        const r = p(d, 'radius', 4);
        strike(sim, pl, art, { type: 'cylinder', c: [0, -0.5, 1], r, h: 4 }, pl.pos, pl.yaw);
        sim.emit({ type: 'shockwave', pos: { ...pl.pos }, radius: r * s, element: (ps(d, 'element', 'physical') as any) });
        const status = ps(d, 'status', '');
        if (status === 'slow') sim.slowEnemies(pl.pos, r * s + 1, p(d, 'slow_time', 3), 0.35);
        if (pb(d, 'pit')) sim.spawnPlayerZone(pl, art, pl.pos, r * s, p(d, 'zone_time', 4), 'mud', 0.25, 'slow');
      }
      break;
    }
    case 'grab_pull': {
      const range = p(d, 'range', 8) * s;
      if (t >= 0.2 && t <= 0.4 && !art.data.caught) {
        const n = strike(sim, pl, art, { type: 'capsule', a: [0, 1, 0.5], b: [0, 1, range], r: 0.9 }, pl.pos, pl.yaw);
        if (n > 0) {
          art.data.caught = 1;
          sim.pullEnemyToward(pl, art.targetId, p(d, 'pull', 4), p(d, 'hold', 0));
        }
      }
      if (art.data.caught && pb(d, 'throw') && t >= 0.6 && !art.data.thrown) {
        art.data.thrown = 1;
        art.hit.clear();
        strike(sim, pl, art, { type: 'arc', r: range, angle: 90 }, pl.pos, pl.yaw, { mult: 0.8 });
        sim.emit({ type: 'shockwave', pos: { ...art.targetPos }, radius: 3, element: 'fire' });
      }
      break;
    }
    case 'buff_self':
      break;
    case 'bind': {
      const delay = p(d, 'delay', 0.4);
      if (t >= 0.2 && !art.data.fired) {
        art.data.fired = 1;
        sim.spawnPlayerBind(pl, art, art.targetPos, p(d, 'radius', 2.5) * s, delay, p(d, 'bind_time', 2.5), ps(d, 'visual', 'roots'));
      }
      break;
    }
    case 'hazard_zone': {
      if (t >= 0.3 && !art.data.fired) {
        art.data.fired = 1;
        const at = ps(d, 'at', 'front');
        forward(pl.yaw, tmp);
        const pos = at === 'target' ? art.targetPos : at === 'self' ? pl.pos : { x: pl.pos.x + tmp.x * 3 * s, y: pl.pos.y, z: pl.pos.z + tmp.z * 3 * s };
        sim.spawnPlayerZone(pl, art, pos, p(d, 'radius', 3) * s, p(d, 'time', 5), ps(d, 'visual', 'mud'), p(d, 'dps_mult', 0.35), ps(d, 'status', 'slow'));
      }
      if (pb(d, 'trail') && t < 0.6) {
        // cut leaves a trail along the swing
        if (!art.data.cut) {
          art.data.cut = 1;
          strike(sim, pl, art, { type: 'arc', r: p(d, 'reach', 3.4), angle: 160 }, pl.pos, pl.yaw);
        }
      }
      break;
    }
    case 'barrier': {
      if (t >= 0.2 && !art.data.fired) {
        art.data.fired = 1;
        forward(pl.yaw, tmp);
        sim.addBarrier({ x: pl.pos.x + tmp.x * 1.6 * s, y: pl.pos.y, z: pl.pos.z + tmp.z * 1.6 * s }, pl.yaw, p(d, 'width', 4) * s, p(d, 'time', 6));
      }
      break;
    }
    case 'decoy': {
      if (t >= 0.2 && !art.data.fired) {
        art.data.fired = 1;
        forward(pl.yaw, tmp);
        sim.spawnDecoy({ x: pl.pos.x + tmp.x * 2.5 * s, y: pl.pos.y, z: pl.pos.z + tmp.z * 2.5 * s }, pl.yaw, p(d, 'time', 6));
      }
      break;
    }
    case 'beam': {
      const t0 = p(d, 'at', 0.3), dur = p(d, 'beam_time', 0.5);
      if (t >= t0 && t <= t0 + dur) {
        if (lockPos) pl.yaw = yawTo(pl.pos, lockPos);
        const len = p(d, 'length', 18);
        const n = strike(sim, pl, art, { type: 'capsule', a: [0, 1.2, 0.5], b: [0, 1.2, len], r: p(d, 'width', 0.8) }, pl.pos, pl.yaw, { tick: dur / Math.max(1, p(d, 'ticks', 3)), mult: 1 / Math.max(1, p(d, 'ticks', 3)) });
        if (pb(d, 'dispel') && !art.data.dispelled) {
          art.data.dispelled = 1;
          sim.dispelIllusions(pl, art);
        }
        void n;
      }
      break;
    }
    case 'chain_lightning': {
      if (t >= 0.25 && !art.data.fired) {
        art.data.fired = 1;
        sim.chainLightning(pl, art, Math.round(p(d, 'bounces', 3)), p(d, 'range', 14) * s);
      }
      break;
    }
    case 'black_hole': {
      if (t >= 0.25 && !art.data.fired) {
        art.data.fired = 1;
        forward(pl.yaw, tmp);
        const at = ps(d, 'at', 'front');
        const dd = p(d, 'dist', 5) * s;
        const pos = at === 'target' ? art.targetPos : { x: pl.pos.x + tmp.x * dd, y: pl.pos.y, z: pl.pos.z + tmp.z * dd };
        sim.spawnPlayerVortex(pl, art, pos, p(d, 'radius', 4) * s, p(d, 'time', 3), p(d, 'pull', 5), p(d, 'dps_mult', 0.5), ps(d, 'visual', 'void'));
      }
      break;
    }
    case 'throw_return': {
      if (t >= 0.2 && !art.data.fired) {
        art.data.fired = 1;
        sim.firePlayerArtProjectile(pl, art, ps(d, 'kind', 'chakram_throw'), { count: 1, spread: 0, speed: p(d, 'speed', 22), returns: true, maxDist: p(d, 'distance', 12) * s, pierce: true, mult: 1, life: 3 });
      }
      break;
    }
    case 'burrow': {
      const travel = p(d, 'travel', 0.9);
      art.invulnerable = t < travel + 0.15;
      if (t < travel) {
        const k = clamp(t / travel, 0, 1);
        const dest = lockPos ?? art.targetPos;
        const rr = lockPos ? sim.lockRadius(pl) * 0.6 : 0;
        const ang = yawTo(art.origin, dest);
        const tx = dest.x - Math.sin(ang) * rr, tz = dest.z - Math.cos(ang) * rr;
        pl.pos.x = art.origin.x + (tx - art.origin.x) * k;
        pl.pos.z = art.origin.z + (tz - art.origin.z) * k;
        pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z) - 1.2 * Math.sin(k * Math.PI);
        art.data.under = 1;
      } else if (!art.data.fired) {
        art.data.fired = 1;
        art.data.under = 0;
        pl.pos.y = sim.groundAt(pl.pos.x, pl.pos.z);
        strike(sim, pl, art, { type: 'cylinder', c: [0, -1, 0], r: p(d, 'radius', 3.5), h: 6 }, pl.pos, pl.yaw);
        sim.emit({ type: 'shockwave', pos: { ...pl.pos }, radius: p(d, 'radius', 3.5) * s, element: 'physical' });
      }
      break;
    }
    case 'dot_stab': {
      if (t >= 0.15 && t <= 0.3) {
        const n = strike(sim, pl, art, { type: 'capsule', a: [0, 1, 0.3], b: [0, 1, p(d, 'reach', 2.2)], r: 0.6 }, pl.pos, pl.yaw);
        if (n > 0 && !art.data.dot) {
          art.data.dot = 1;
          sim.applyDotToTarget(pl, art.targetId, art.damage * p(d, 'dot_mult', 0.25), p(d, 'dot_time', 6), ps(d, 'element', 'poison'));
        }
      }
      break;
    }
    case 'shape_shift':
      break;
    case 'cone_breath': {
      const t0 = 0.25, dur = art.dur - 0.4;
      if (t >= t0 && t <= t0 + dur) {
        if (lockPos) pl.yaw = wrapAngle(pl.yaw + clamp(wrapAngle(yawTo(pl.pos, lockPos) - pl.yaw), -2 * dt, 2 * dt));
        const ticks = Math.max(1, p(d, 'ticks', 6));
        strike(sim, pl, art, { type: 'arc', r: p(d, 'range', 8), angle: p(d, 'angle', 50), y: [-0.5, 4] }, pl.pos, pl.yaw, { tick: dur / ticks, mult: 1 / ticks * p(d, 'total_mult', 2.2) });
      }
      break;
    }
    case 'tentacle_ring': {
      const ticks = Math.max(1, p(d, 'ticks', 2));
      if (t >= 0.25 && t <= 0.25 + 0.4) {
        strike(sim, pl, art, { type: 'arc', r: p(d, 'radius', 5), angle: 360, y: [-0.5, 4] }, pl.pos, pl.yaw, { tick: 0.4 / ticks, mult: 1 / ticks * p(d, 'total_mult', 1.6) });
        if (!art.data.pull) {
          art.data.pull = 1;
          sim.pushEnemies(pl.pos, p(d, 'radius', 5) * s + 1, -p(d, 'pull', 2));
        }
      }
      break;
    }
    case 'waves': {
      const count = Math.max(1, Math.round(p(d, 'count', 3)));
      const interval = p(d, 'interval', 0.32);
      const k = Math.floor((t - 0.2) / interval);
      if (k >= 0 && k < count && (art.data.n ?? 0) <= k) {
        art.data.n = k + 1;
        const kinds = ps(d, 'kinds', 'light_wave').split(',');
        sim.firePlayerArtProjectile(pl, art, kinds[k % kinds.length], { count: 1, spread: 0, speed: p(d, 'speed', 20), pierce: true, mult: 1 / count * p(d, 'total_mult', 2.4), life: 1.6 });
      }
      break;
    }
  }
  return art.t >= art.dur;
}

export function artAngle(deg: number): number {
  return deg * DEG;
}
