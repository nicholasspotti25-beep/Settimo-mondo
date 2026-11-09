/**
 * Grande Aquila Reale (20) — guardian of the river's skies, on the deck of the Nave dei Cercatori.
 *
 *  - The deck rocks: a slow sideways sway (ROCK_SPEED m/s, period ROCK_PERIOD s, always slower than a walk; cue
 *    aquila_rock at each swing, pos.x = side, for the camera roll). Lifted in phase 2 it swings harder and tilts toward
 *    the stern (TILT_SPEED).
 *  - Phase 1 cycle (modes deck → sky → deck): on the deck for DECK_TIME s (talon_rake, beak_strike, wing_buffet), then
 *    take_off (flag `aloft`); from the sky she circles the ship, casts a feather volley, then DIVES on you (cue aquila_dive
 *    at the spot) and glides away low and straight (climb_out: flag `gliding`, cue aquila_ballista_window). After
 *    SKY_DIVES dives she lands again.
 *  - The BALLISTA (contextual action, prompt act3b.prompt.ballista): an interactable at the stern. Firing it takes a
 *    moment (player state `interact`) and it reloads in BALLISTA_RELOAD s (cue aquila_ballista_ready). The bolt hits her
 *    in flight only in a clear window: while she glides out of a dive (phase 1) or while she holds the lifted ship
 *    (phase 2: she cannot evade). Otherwise she banks away (cue aquila_evade). A bolt deals BOLT_DAMAGE of her health and
 *    BOLT_POISE Equilibrio; in phase 1 it brings her down onto the deck for DOWNED_TIME s (cue aquila_downed: the melee
 *    window); in phase 2 she flinches.
 *  - Phase 2 (flag `lifting`, arena_state ship_lifted): she grabs the ship and lifts it above the water (cue aquila_lift).
 *    She holds it by the bow (mode carry, hover CARRY_H): beak_plunge (she drops onto the bow, head down on the deck for
 *    the recovery), ship_shake (the deck tilts to one side: SHAKE_SPEED push for SHAKE_TIME s, crates slide onto marked
 *    spots), gale (pushed toward the stern at GALE_SPEED for GALE_TIME s, feathers in the wind), feather_rain.
 *  - Struck down (stagger / Spezzato) she falls to the deck instead of hanging in the air.
 * Deterministic: sim.rng only (shake side, NG+ double dive).
 */
import type { AttackDef } from '../../../core/types';
import { dist2D, yawTo, type Vec3 } from '../../../core/math';
import type { Actor, AttackRuntime } from '../../../sim/actor';
import { defineBehavior } from '../../../sim/behavior';
import { applyDamageToActor } from '../../../sim/combat';
import type { Sim } from '../../../sim/sim';

export const DECK_TIME = 6;
export const SKY_H = 10;
export const SKY_DIVES = 2;
export const SKY_ORBIT = 10;
export const CARRY_H = 8;
export const PLUNGE_H = 0.4;
/** The bow point she holds in phase 2, from the arena center along the ship (+z). */
export const BOW_Z = 23;
export const BALLISTA_ID = 'ballista';
export const BALLISTA_PROMPT = 'act3b.prompt.ballista';
/** The ballista at the stern, from the arena center along the ship (-z). */
export const BALLISTA_Z = -21.4;
export const BALLISTA_RADIUS = 2.4;
export const BALLISTA_RELOAD = 5;
export const BALLISTA_RELOAD_P2 = 7;
export const BOLT_DAMAGE = 0.045;
export const BOLT_POISE = 60;
export const DOWNED_TIME = 3.5;
export const ROCK_SPEED = 0.7;
export const ROCK_PERIOD = 6;
export const LIFT_ROCK_SPEED = 1.1;
export const LIFT_ROCK_PERIOD = 4.5;
export const TILT_SPEED = 0.6;
export const SHAKE_SPEED = 2.6;
export const SHAKE_TIME = 1.6;
export const GALE_SPEED = 3.0;
export const GALE_TIME = 1.2;

const DECK = new Set(['talon_rake', 'beak_strike', 'wing_buffet']);
const SKY = new Set(['feather_volley']);
const DIVES = new Set(['dive', 'ng_double_dive']);
const CARRY = new Set(['beak_plunge', 'ship_shake', 'gale', 'feather_rain', 'ng_storm_shake']);
const COMBO_ONLY = new Set(['climb_out', 'ng_second_dive']);
const FREE = new Set(['idle', 'move', 'guard']);
let boltIds = 0;

export function ballistaPos(sim: Sim): Vec3 {
  const c = sim.arenaCenter();
  return { x: c.x, y: c.y, z: c.z + BALLISTA_Z };
}

function bowPos(sim: Sim): Vec3 {
  const c = sim.arenaCenter();
  return { x: c.x, y: c.y, z: c.z + BOW_Z };
}

function closeWindow(a: Actor): void {
  a.bstate.window = false;
  a.flags.delete('gliding');
}

/** A bolt struck her out of the glide: she falls onto the deck. */
function downed(a: Actor, sim: Sim): void {
  const g = a.bstate;
  g.mode = 'deck';
  g.deckT = 0;
  g.dives = 0;
  closeWindow(a);
  a.flags.delete('aloft');
  a.hoverHeight = 0;
  a.cancelAttack(sim);
  if (a.state !== 'spezzato') a.setState('stagger', DOWNED_TIME);
  sim.emit({ type: 'cue', id: 'aquila_downed', actor: a.id, pos: { ...a.pos } });
}

function push(a: Actor, x: number, z: number, t: number): void {
  a.bstate.pushX = x;
  a.bstate.pushZ = z;
  a.bstate.pushT = t;
}

export default defineBehavior(() => ({
  init(a: Actor, sim: Sim) {
    const g = a.bstate;
    g.mode = 'deck';
    g.deckT = 0;
    g.dives = 0;
    g.skyCasts = 0;
    g.loaded = true;
    g.reloadT = 0;
    g.window = false;
    g.rockT = 0;
    g.rockSide = 0;
    g.orbit = 0;
    push(a, 0, 0, 0);
    a.hoverHeight = 0;
    sim.addFightInteractable(BALLISTA_ID, ballistaPos(sim), BALLISTA_RADIUS, BALLISTA_PROMPT);
  },

  update(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    sim.clampActor(a);
    const live = !!sim.fight?.active && !sim.fight.intro && !sim.seq.running && a.alive;
    if (!live) return false;
    const pl = sim.player;
    const p2 = a.phaseIndex >= 1;
    if (g.mode === 'deck') g.deckT += dt;
    // the ballista reloads
    if (!g.loaded) {
      g.reloadT -= dt;
      if (g.reloadT <= 0) {
        g.loaded = true;
        sim.emit({ type: 'cue', id: 'aquila_ballista_ready', pos: ballistaPos(sim) });
      }
    }
    // the deck rocks (and, lifted, tilts toward the stern); her gales and shakes push too
    g.rockT += dt;
    const period = p2 ? LIFT_ROCK_PERIOD : ROCK_PERIOD;
    const sway = Math.sin((g.rockT * Math.PI * 2) / period);
    const side = sway >= 0 ? 1 : -1;
    if (side !== g.rockSide) {
      g.rockSide = side;
      sim.emit({ type: 'cue', id: 'aquila_rock', actor: a.id, pos: { x: side, y: 0, z: 0 } });
    }
    let px = sway * (p2 ? LIFT_ROCK_SPEED : ROCK_SPEED);
    let pz = p2 ? -TILT_SPEED : 0;
    if (g.pushT > 0) {
      g.pushT -= dt;
      px += g.pushX;
      pz += g.pushZ;
    }
    if (pl.state !== 'dead' && pl.state !== 'grace') sim.pushPlayer(px * dt, pz * dt);
    // the transition: she seizes the bow and lifts the ship
    if (a.state === 'transition' && p2) {
      const bow = bowPos(sim);
      a.pos.x += (bow.x - a.pos.x) * Math.min(1, dt * 1.5);
      a.pos.z += (bow.z - a.pos.z) * Math.min(1, dt * 1.5);
      a.pos.y += (sim.groundAt(a.pos.x, a.pos.z) + CARRY_H - a.pos.y) * Math.min(1, dt * 1.5);
    }
    // struck down: she falls onto the deck instead of hanging in the air
    if (a.state === 'stagger' || a.state === 'spezzato') {
      const ground = sim.groundAt(a.pos.x, a.pos.z) + (p2 ? 0.5 : 0);
      a.pos.y = Math.max(ground, a.pos.y - 12 * dt);
    }
    return false;
  },

  movement(a: Actor, sim: Sim, dt: number) {
    const g = a.bstate;
    if (g.mode === 'deck') return false;
    const pl = sim.player;
    // sky: she circles the ship around you; carry: she holds the bow
    let tx: number, tz: number;
    if (g.mode === 'carry') {
      const bow = bowPos(sim);
      tx = bow.x;
      tz = bow.z;
    } else {
      g.orbit += dt * 0.5;
      tx = pl.pos.x + Math.sin(g.orbit) * SKY_ORBIT;
      tz = pl.pos.z + Math.cos(g.orbit) * SKY_ORBIT;
    }
    const d = Math.hypot(tx - a.pos.x, tz - a.pos.z);
    const step = Math.min(d, (g.mode === 'carry' ? 6 : 7) * dt);
    if (d > 1e-3) {
      a.pos.x += ((tx - a.pos.x) / d) * step;
      a.pos.z += ((tz - a.pos.z) / d) * step;
    }
    a.moveSpeedNow = step / Math.max(1e-6, dt);
    a.faceTarget(pl.pos, dt, 1);
    a.state = 'move';
    a.anim = g.mode === 'carry' ? 'carry' : 'soar';
    a.animStage = 'move';
    a.animTime += dt;
    a.updateHover(sim, dt);
    sim.clampActor(a);
    return true;
  },

  canUseAttack(a: Actor, _sim: Sim, def: AttackDef) {
    const g = a.bstate;
    const id = def.id;
    if (COMBO_ONLY.has(id)) return false;
    if (CARRY.has(id)) return g.mode === 'carry';
    if (DECK.has(id)) return g.mode === 'deck';
    if (id === 'take_off') return g.mode === 'deck' && g.deckT >= DECK_TIME && a.phaseIndex === 0;
    if (SKY.has(id)) return g.mode === 'sky';
    if (DIVES.has(id)) return g.mode === 'sky' && g.skyCasts >= 1 && g.dives < SKY_DIVES;
    if (id === 'land') return g.mode === 'sky' && g.dives >= SKY_DIVES;
    return true;
  },

  selectAttack(a: Actor, sim: Sim, cands: AttackDef[]) {
    const g = a.bstate;
    const pick = (id: string) => cands.find((d) => d.id === id);
    if (g.mode === 'sky') {
      if (g.dives >= SKY_DIVES) return pick('land');
      if (g.skyCasts >= 1) {
        const ng = pick('ng_double_dive');
        if (ng && sim.rng.chance(0.5)) return ng;
        return pick('dive');
      }
    }
    if (g.mode === 'deck' && g.deckT >= DECK_TIME) return pick('take_off');
    return undefined;
  },

  onAttackStart(a: Actor, sim: Sim, atk: AttackRuntime) {
    const id = atk.def.id;
    if (DIVES.has(id) || id === 'ng_second_dive') sim.emit({ type: 'cue', id: 'aquila_dive', actor: a.id, pos: { ...sim.player.pos } });
    else if (id === 'beak_plunge') {
      a.hoverHeight = PLUNGE_H;
      sim.emit({ type: 'cue', id: 'aquila_plunge', actor: a.id, pos: { ...a.pos } });
    }
  },

  onAttackEnd(a: Actor, _sim: Sim, atk: AttackRuntime) {
    const g = a.bstate;
    const id = atk.def.id;
    if (SKY.has(id) && g.mode === 'sky') g.skyCasts++;
    else if (id === 'dive' || id === 'ng_second_dive') {
      g.dives++;
      g.skyCasts = 0;
    } else if (id === 'climb_out') {
      closeWindow(a);
      if (g.mode === 'sky') a.hoverHeight = SKY_H;
    } else if (id === 'beak_plunge' && g.mode === 'carry') a.hoverHeight = CARRY_H;
  },

  onCustomEvent(a: Actor, sim: Sim, event: string) {
    const g = a.bstate;
    switch (event) {
      case 'sky':
        g.mode = 'sky';
        g.skyCasts = 0;
        g.dives = 0;
        a.hoverHeight = SKY_H;
        a.flags.add('aloft');
        sim.emit({ type: 'cue', id: 'aquila_take_off', actor: a.id, pos: { ...a.pos } });
        break;
      case 'dive':
        // she falls with the dive
        a.hoverHeight = 0;
        break;
      case 'glide':
        g.window = true;
        a.flags.add('gliding');
        sim.emit({ type: 'cue', id: 'aquila_ballista_window', actor: a.id, pos: { ...a.pos } });
        break;
      case 'land':
        g.mode = 'deck';
        g.deckT = 0;
        a.hoverHeight = 0;
        a.flags.delete('aloft');
        sim.emit({ type: 'cue', id: 'aquila_land', actor: a.id, pos: { ...a.pos } });
        break;
      case 'shake':
      case 'shake_back': {
        if (event === 'shake') g.shakeSide = sim.rng.chance(0.5) ? 1 : -1;
        else g.shakeSide = -(g.shakeSide ?? 1);
        push(a, g.shakeSide * SHAKE_SPEED, 0, SHAKE_TIME);
        sim.emit({ type: 'cue', id: 'aquila_shake', actor: a.id, pos: { x: g.shakeSide, y: 0, z: 0 } });
        break;
      }
      case 'gale': {
        const pl = sim.player;
        const d = Math.max(1e-3, dist2D(a.pos, pl.pos));
        push(a, ((pl.pos.x - a.pos.x) / d) * GALE_SPEED, ((pl.pos.z - a.pos.z) / d) * GALE_SPEED, GALE_TIME);
        sim.emit({ type: 'cue', id: 'aquila_gale', actor: a.id, pos: { ...a.pos } });
        break;
      }
    }
  },

  onInteract(a: Actor, sim: Sim, id: string) {
    if (id !== BALLISTA_ID) return;
    const g = a.bstate;
    const pl = sim.player;
    if (!g.loaded) {
      sim.emit({ type: 'cue', id: 'aquila_ballista_reloading', pos: ballistaPos(sim) });
      return;
    }
    if (!FREE.has(pl.state) || !a.alive) return;
    g.loaded = false;
    g.reloadT = a.phaseIndex >= 1 ? BALLISTA_RELOAD_P2 : BALLISTA_RELOAD;
    pl.yaw = yawTo(pl.pos, a.pos);
    pl.setState('interact', 0.5);
    const inFlight = a.pos.y - sim.groundAt(a.pos.x, a.pos.z) > 2;
    const carrying = g.mode === 'carry' && a.state !== 'transition';
    const hit = inFlight && !a.invulnerable && (g.window || carrying);
    sim.emit({ type: 'cue', id: 'aquila_ballista_fire', actor: a.id, pos: { ...a.pos } });
    if (!hit) {
      sim.emit({ type: 'cue', id: 'aquila_evade', actor: a.id, pos: { ...a.pos } });
      return;
    }
    applyDamageToActor(sim, a, {
      source: -1, target: a.id, amount: BOLT_DAMAGE * a.hpMax, poise: BOLT_POISE, element: 'physical', flags: [],
      pos: { x: a.pos.x, y: a.pos.y + 2, z: a.pos.z }, instance: 0x5a000000 + boltIds++, part: -1, kind: 'heavy',
    }, null);
    if (!a.alive) return;
    if (g.window) downed(a, sim);
    else if (carrying && !a.attack && a.state !== 'spezzato') a.setState('stagger', 1.2);
  },

  onPhaseEnter(a: Actor, sim: Sim, phase: number) {
    if (phase < 1) return;
    const g = a.bstate;
    g.mode = 'carry';
    closeWindow(a);
    a.flags.add('aloft');
    a.hoverHeight = CARRY_H;
    sim.emit({ type: 'cue', id: 'aquila_lift', actor: a.id, pos: bowPos(sim) });
  },

  onDeath(a: Actor, sim: Sim) {
    sim.removeFightInteractable(BALLISTA_ID);
    closeWindow(a);
    a.pos.y = sim.groundAt(a.pos.x, a.pos.z);
    // the ship falls back onto the water
    if (a.phaseIndex >= 1) sim.setArenaVariant(null);
  },
}));
