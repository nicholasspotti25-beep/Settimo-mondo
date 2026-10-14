/**
 * Cavaliere Errante — mounted duel in the tall grass, then a sword duel on foot.
 *
 * Phase 1 (mounted, flag 'mounted'): circles the player at a canter (movement hook) and attacks from the flank; passing cuts
 * are steered so the horse passes the player on its left and the sword (right side) reaches them; holding guard opens the
 * unblockable `guard_dive` ("dives at an open guard"). Phase 2 (flag 'dismounted'): the horse leaves, the knight duels on foot,
 * holds a counter stance (`riposte_stance`: frontal hits are parried and answered by `riposte`, hits on his back break it) and
 * sometimes parries hits taken while he is idle.
 * Dawn (flag 'chivalrous'): salute openers, a frontal joust instead of circling, and he never strikes a player who is drinking,
 * knocked down or dead. Night (flag 'night_rider'): rides into the dark (hidden) and charges out of it.
 * Deterministic: sim.rng only.
 */
import { DEG, angleDiff, clamp, dist2D, forward, turnToward, v3, yawTo } from '../../../core/math';
import type { AttackDef } from '../../../core/types';
import type { Actor } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import type { Sim } from '../../../sim/sim';

/** Canter circle radius around the player (day / night). */
export const ORBIT_RADIUS = 10.5;
export const ORBIT_RADIUS_NIGHT = 13.5;
const CANTER = 6.2;
const FOOT_WALK = 2.3;
const FOOT_RUN = 5.4;
/** Seconds of held guard after which he punishes the open guard. */
export const GUARD_PUNISH_AFTER = 0.45;
/** Dimensions on foot (the mounted size is the data body). */
export const FOOT_RADIUS = 1.0;
export const FOOT_HEIGHT = 3.9;

const TMP = v3();
const DARK_ATTACKS = new Set(['dark_charge', 'dark_lunge']);
const PASSING = new Set(['passing_slash', 'ng_double_pass', 'ng_double_pass_return']);

interface CavaliereState {
  guardT: number;
  orbitDir: number;
  orbitT: number;
  parryCd: number;
  idleHits: number;
  idleHitT: number;
  p2Pending: boolean;
  /** Seconds left in which the parried player is open to the riposte (for presentation). */
  parryFlash: number;
}

function st(a: Actor): CavaliereState {
  return a.bstate as CavaliereState;
}

export function isMounted(a: Actor): boolean {
  return a.flags.has('mounted');
}

function playerHelpless(sim: Sim): boolean {
  const s = sim.player.state;
  return s === 'drink' || s === 'knockdown' || s === 'dead' || s === 'guardbreak';
}

/** Deflect a hit and answer with the riposte. */
function parryAndRiposte(a: Actor, sim: Sim): void {
  const s = st(a);
  sim.emit({ type: 'vfx', id: 'cavaliere_parry', pos: { x: a.pos.x, y: a.pos.y + 2.2, z: a.pos.z } });
  sim.emit({ type: 'sfx', id: 'cavaliere_parry', pos: { ...a.pos } });
  sim.emit({ type: 'cue', id: 'cavaliere_parry', actor: a.id });
  s.parryFlash = 0.4;
  const rip = a.attackMap.get('riposte');
  a.cancelAttack(sim);
  if (rip) {
    a.yaw = yawTo(a.pos, sim.player.pos);
    a.startAttack(sim, rip);
  }
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    a.flags.add('mounted');
    const s: CavaliereState = {
      guardT: 0, orbitDir: sim.rng.chance(0.5) ? 1 : -1, orbitT: sim.rng.range(2.5, 4.5), parryCd: 3, idleHits: 0, idleHitT: 0,
      p2Pending: false, parryFlash: 0,
    };
    a.bstate = s;
  },

  update(a: Actor, sim: Sim, dt: number) {
    const s = st(a);
    const pl = sim.player;
    if (pl.state === 'guard' || pl.state === 'parry') s.guardT += dt;
    else s.guardT = Math.max(0, s.guardT - dt * 3);
    s.parryCd -= dt;
    s.idleHitT -= dt;
    s.parryFlash = Math.max(0, s.parryFlash - dt);
    if (s.idleHitT <= 0) s.idleHits = 0;

    const atk = a.attack;
    // Night: hidden in the dark between the moment he rides off and 0.7 s before the charge/lunge begins.
    if (atk && DARK_ATTACKS.has(atk.def.id)) {
      const hide = atk.activeTime >= -1.3 && atk.activeTime < -0.7;
      if (hide !== a.hidden) {
        a.hidden = hide;
        a.untargetable = hide;
        sim.emit({ type: 'cue', id: hide ? 'cavaliere_into_dark' : 'cavaliere_out_of_dark', actor: a.id, pos: { ...a.pos } });
      }
    } else if (a.hidden) {
      a.hidden = false;
      a.untargetable = false;
    }

    // Passing cut: steer the horse toward a line that passes the player on the horse's left.
    if (atk && PASSING.has(atk.def.id) && atk.stage === 'telegraph') {
      const tp = pl.pos;
      const toP = yawTo(a.pos, tp);
      const leftYaw = toP + Math.PI / 2;
      const off = 2.7;
      const px = tp.x + Math.sin(leftYaw) * off, pz = tp.z + Math.cos(leftYaw) * off;
      const want = Math.atan2(px - a.pos.x, pz - a.pos.z);
      a.yaw = turnToward(a.yaw, want, a.def.move.turn * 1.6 * dt);
    }

    // Phase 2 opener once the dismount transition is over.
    if (s.p2Pending && a.state === 'idle') {
      s.p2Pending = false;
      const night = a.flags.has('night_rider');
      const dawn = a.flags.has('chivalrous');
      const id = dawn ? 'duel_salute' : night ? 'dark_lunge' : 'lunge_thrust';
      const def = a.attackMap.get(id);
      if (def) a.startAttack(sim, def);
    }
    return false;
  },

  movement(a: Actor, sim: Sim, dt: number): boolean {
    const s = st(a);
    const t = sim.player.pos;
    const d = dist2D(a.pos, t);
    const rate = a.rate(sim);
    const tmp = TMP;
    if (isMounted(a)) {
      if (a.flags.has('chivalrous')) return false; // dawn: a frontal joust (default locomotion faces the player)
      const R = a.flags.has('night_rider') ? ORBIT_RADIUS_NIGHT : ORBIT_RADIUS;
      s.orbitT -= dt;
      if (s.orbitT <= 0) {
        s.orbitDir = sim.rng.chance(0.5) ? 1 : -1;
        s.orbitT = sim.rng.range(2.5, 4.5);
      }
      // radial unit (player -> knight) and tangent
      const rx = d > 1e-3 ? (a.pos.x - t.x) / d : 0;
      const rz = d > 1e-3 ? (a.pos.z - t.z) / d : 1;
      const tx = -rz * s.orbitDir, tz = rx * s.orbitDir;
      const k = clamp((R - d) / 4, -1.2, 1.2);
      const vx = tx + rx * k, vz = tz + rz * k;
      const want = Math.atan2(vx, vz);
      a.yaw = turnToward(a.yaw, want, a.def.move.turn * 1.4 * dt);
      const speed = (d > R + 9 ? a.def.move.run : CANTER) * rate;
      forward(a.yaw, tmp);
      a.pos.x += tmp.x * speed * dt;
      a.pos.z += tmp.z * speed * dt;
      a.moveSpeedNow = speed;
      a.state = 'move';
      a.anim = speed > a.def.move.walk * 1.2 ? 'run' : 'walk';
    } else {
      // on foot: keep a sword's distance, circle warily
      a.strafeTimer -= dt;
      if (a.strafeTimer <= 0) {
        a.strafeDir = sim.rng.chance(0.5) ? 1 : -1;
        a.strafeTimer = sim.rng.range(1.4, 3.0);
      }
      let speed = 0;
      let dir = yawTo(a.pos, t);
      if (d > 6) speed = d > 11 ? FOOT_RUN : FOOT_WALK;
      else if (d < 2.4 + FOOT_RADIUS) speed = -FOOT_WALK * 0.8;
      else {
        speed = FOOT_WALK * 0.5;
        dir += a.strafeDir * Math.PI / 2;
      }
      if (d > 6) a.approachTime += dt;
      else a.approachTime = 0;
      speed *= rate;
      forward(dir, tmp);
      a.pos.x += tmp.x * speed * dt;
      a.pos.z += tmp.z * speed * dt;
      a.faceTarget(t, dt, 1);
      a.moveSpeedNow = Math.abs(speed);
      a.state = Math.abs(speed) > 0.05 ? 'move' : 'idle';
      a.anim = Math.abs(speed) > FOOT_WALK * 1.2 ? 'run' : Math.abs(speed) > 0.05 ? 'walk' : 'idle';
    }
    a.animStage = a.state === 'move' ? 'move' : 'idle';
    a.animTime += dt;
    a.updateHover(sim, dt);
    sim.clampActor(a);
    return true;
  },

  canUseAttack(a: Actor, sim: Sim, def: AttackDef): boolean {
    // Dawn: a fair duel — never strike a player who is drinking, down or guard-broken.
    if (a.flags.has('chivalrous') && playerHelpless(sim)) return false;
    const mounted = isMounted(a);
    const night = a.flags.has('night_rider');
    const guardOpen = st(a).guardT >= GUARD_PUNISH_AFTER;
    switch (def.requires) {
      case 'mounted': return mounted;
      case 'on_foot': return !mounted;
      case 'night_mounted': return mounted && night;
      case 'night_on_foot': return !mounted && night;
      case 'guard_open': return mounted && guardOpen;
      case 'guard_open_foot': return !mounted && guardOpen;
      default: return true;
    }
  },

  selectAttack(a: Actor, sim: Sim, cands: AttackDef[]): AttackDef | null | undefined {
    // An open guard is punished first.
    if (st(a).guardT >= GUARD_PUNISH_AFTER) {
      const d = dist2D(a.pos, sim.player.pos) - a.radius * a.scale;
      const p = cands.find((c) => (c.id === 'guard_dive' || c.id === 'guard_breaker') && (!c.range || (d >= c.range[0] - 0.5 && d <= c.range[1] + 0.5)));
      if (p) return p;
    }
    return undefined;
  },

  modifyIncoming(a, sim, dmg, _part, fromFront) {
    if (isMounted(a) || dmg.source !== -1) return;
    const s = st(a);
    const atk = a.attack;
    // Counter stance: frontal hits are parried and answered; a hit on his back breaks the stance.
    if (atk && atk.def.id === 'riposte_stance' && atk.stage === 'active') {
      if (fromFront) {
        dmg.amount = 0;
        dmg.poise = 0;
        parryAndRiposte(a, sim);
      } else {
        a.cancelAttack(sim);
        a.setState('stagger', 0.8);
        sim.emit({ type: 'cue', id: 'cavaliere_stance_broken', actor: a.id });
      }
      return;
    }
    // Reactive parry: pressing him while he is idle (not in a recovery window) gets the second hit parried now and then.
    if ((a.state === 'idle' || a.state === 'move') && fromFront && (dmg.kind === 'light' || dmg.kind === 'heavy' || dmg.kind === 'running')) {
      s.idleHits++;
      s.idleHitT = 1.4;
      if (s.idleHits >= 2 && s.parryCd <= 0 && sim.rng.chance(0.45)) {
        s.parryCd = 7;
        s.idleHits = 0;
        dmg.amount = 0;
        dmg.poise = 0;
        parryAndRiposte(a, sim);
      }
    }
  },

  onPhaseEnter(a: Actor, sim: Sim, _index: number, def) {
    if (def.id !== 'p2') return;
    a.flags.delete('mounted');
    a.flags.add('dismounted');
    for (const p of a.parts) p.active = false;
    a.radius = FOOT_RADIUS;
    a.height = FOOT_HEIGHT;
    a.airborne = false;
    a.hidden = false;
    a.untargetable = false;
    st(a).p2Pending = true;
    sim.emit({ type: 'cue', id: 'cavaliere_dismount', actor: a.id, pos: { ...a.pos } });
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    if (event === 'salute') sim.emit({ type: 'dialogue', key: 'boss.cavaliere_errante.salute', speaker: 'cavaliere_errante' });
    else if (event === 'duel_salute') sim.emit({ type: 'dialogue', key: 'boss.cavaliere_errante.salute2', speaker: 'cavaliere_errante' });
    void a;
  },

  onDeath(a: Actor, sim: Sim) {
    a.hidden = false;
    sim.emit({ type: 'cue', id: 'cavaliere_lantern', actor: a.id, pos: { ...a.pos } });
  },
}));

/** Angle (deg) between the knight's facing and the player, for tests and the bot. */
export function facingAngleDeg(a: Actor, sim: Sim): number {
  return Math.abs(angleDiff(a.yaw, yawTo(a.pos, sim.player.pos))) / DEG;
}
