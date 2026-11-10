// Shared simulation types, pitch constants and math helpers. The simulation is pure TypeScript (no rendering imports).
import { D, PlayerData, Pos } from '../data/db';
import { Formation, Grp, Tactics } from '../data/tactics';

export const HL = 52.5, HW = 34, GW = 3.66, GH = 2.44, PA_D = 16.5, PA_W = 20.16, SIX_D = 5.5, BR = 0.11, DT = 1 / 60, G = 9.81;
export const K_AIR = 0.28, K_GND = 0.42, C_GND = 0.9;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const hyp = Math.hypot;
export const angd = (a: number, b: number) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => hyp(a.x - b.x, a.z - b.z);

export type Act = 'none' | 'kick' | 'tackle' | 'slide' | 'down' | 'stun' | 'dive' | 'jump' | 'throw' | 'cele' | 'hold';
export interface Queued { type: 'pass' | 'through' | 'shoot' | 'cross'; power: number; mod: string; ax: number; az: number; t: number; target?: P | null; aimZ?: number | null }

export interface P {
  i: number; team: Team; slot: number; role: Pos; grp: Grp; data: PlayerData; d: D; on: boolean; ins: string;
  x: number; z: number; y: number; vx: number; vz: number; face: number;
  st: number; load: number;
  act: Act; actT: number; actDur: number; actDir: number; actKind: string; hit: boolean;
  mx: number; mz: number; spr: boolean; lockFace: number | null; jock: boolean;
  tx: number; tz: number; ax: number; az: number;
  job: string; mark: P | null; runKind: string; runT: number; think: number; carryA: number; carrySpr: boolean; passedT: number;
  cdCtl: number; cdTk: number; cdFeint: number; feintT: number; feintKind: string; burst: number; press: number;
  yellow: number; q: Queued | null; phase: number; touch: number; idle: number;
  gkShot: number; gkTz: number; gkTy: number; gkAt: number; gkGo: number; gkOk: number; gkHold: number; gkRush: boolean;
  goals: number; kickFoot: number; fix: boolean; gotT: number;
}
export interface Team {
  id: number; name: string; dir: number; ps: P[]; bench: PlayerData[]; subs: number; tac: Tactics; form: Formation; human: boolean; ai: number;
  quick: string; quickT: number; lostT: number; wonT: number; second: boolean; kit: number;
  presser: P | null; cover: P | null; chaser: P | null; chaseT: number; cpx: number; cpz: number; offLine: number; lead: number;
  pend: { slot: number; pd: PlayerData }[];
}
export interface Ball {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; curve: number;
  owner: P | null; last: P | null; passTo: P | null; kickId: number; kickT: number; shot: boolean; kicker: P | null;
  off: P[]; fut: number[]; futAt: number; rx: number; rz: number; inNet: boolean; free: number;
}
export interface Ev { k: string; team?: number; p?: P; txt?: string; v?: number }
export interface Input { mx: number; mz: number; sprint: boolean; press: boolean; contain: boolean; second: boolean; acts: InAct[] }
export interface InAct { type: string; power: number; mod: string; curve: number }

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- ball flight ----------------------------------------------------------------------------------------------------
export interface BState { x: number; y: number; z: number; vx: number; vy: number; vz: number; curve: number }
/** One integration step of a free ball (no collisions with players or goal frame). */
export function stepFree(b: BState, dt: number) {
  const sp = hyp(b.vx, b.vz);
  if (b.y <= BR + 0.004 && Math.abs(b.vy) < 0.7) {
    b.y = BR; b.vy = 0;
    if (sp > 0) { const ns = Math.max(0, sp - (K_GND * sp + C_GND) * dt); b.vx *= ns / sp; b.vz *= ns / sp; }
    b.curve *= 1 - 4 * dt;
  } else {
    if (b.curve && sp > 1) { const c = Math.cos(b.curve * dt), s = Math.sin(b.curve * dt), vx = b.vx; b.vx = vx * c - b.vz * s; b.vz = vx * s + b.vz * c; }
    b.vx -= K_AIR * b.vx * dt; b.vz -= K_AIR * b.vz * dt; b.vy -= (G + K_AIR * b.vy) * dt;
    b.curve *= 1 - 0.3 * dt;
  }
  b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
  if (b.y < BR) { b.y = BR; if (b.vy < -1.3) { b.vy = -b.vy * 0.52; b.vx *= 0.8; b.vz *= 0.8; } else b.vy = 0; }
}
/** Launch speed for a ground pass that should arrive after `D` metres still rolling at `v1`. */
export function groundSpeed(D: number, v1: number) {
  let v0 = v1 + K_GND * D;
  for (let i = 0; i < 3; i++) { const t = Math.log((v0 + C_GND / K_GND) / (v1 + C_GND / K_GND)) / K_GND; v0 = v1 + K_GND * D + C_GND * t; }
  return v0;
}
/** Set velocity so the ball reaches (tx,ty,tz) after `T` seconds (linear drag, optional curve in rad/s). */
export function launch(b: BState, tx: number, ty: number, tz: number, T: number, curve = 0) {
  const dx = tx - b.x, dz = tz - b.z, D = hyp(dx, dz) || 0.01, e = 1 - Math.exp(-K_AIR * T);
  const vh = D * K_AIR / e, a = Math.atan2(dz, dx) - curve * T * 0.47;
  b.vx = Math.cos(a) * vh; b.vz = Math.sin(a) * vh; b.vy = (ty - b.y + G * T / K_AIR) * K_AIR / e - G / K_AIR; b.curve = curve;
}
/** Flight time for a driven ball of horizontal speed `v` to cover `D` metres. */
export const flightT = (D: number, v: number) => { const r = K_AIR * D / v; return r >= 0.95 ? 3 : -Math.log(1 - r) / K_AIR; };

const tmp: BState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, curve: 0 };
/** Samples of the free ball's future every 0.25 s (x,y,z triples). */
export function predict(b: BState, out: number[], n = 14) {
  Object.assign(tmp, { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, curve: b.curve });
  out.length = 0;
  for (let i = 0; i < n; i++) { for (let k = 0; k < 8; k++) stepFree(tmp, 1 / 32); out.push(tmp.x, tmp.y, tmp.z); }
}
/** Where and when the free ball crosses the plane x = gx (null if it does not within 2.4 s). */
export function crossPlane(b: BState, gx: number): { t: number; y: number; z: number; sp: number } | null {
  Object.assign(tmp, { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, curve: b.curve });
  const s = Math.sign(gx - b.x);
  for (let i = 0; i < 144; i++) {
    const px = tmp.x, py = tmp.y, pz = tmp.z; stepFree(tmp, DT);
    if ((tmp.x - gx) * s >= 0) { const f = (gx - px) / ((tmp.x - px) || 1e-6); return { t: (i + f) * DT, y: lerp(py, tmp.y, f), z: lerp(pz, tmp.z, f), sp: hyp(tmp.vx, tmp.vy, tmp.vz) }; }
    if (hyp(tmp.vx, tmp.vz) < 0.5) return null;
  }
  return null;
}
/** Collide the ball with posts and crossbar. Returns true on a hit. */
export function hitFrame(b: BState): boolean {
  for (const sx of [-1, 1]) {
    const gx = sx * HL; if (Math.abs(b.x - gx) > 0.4) continue;
    if (b.y < GH + 0.1) for (const pz of [-GW, GW]) {
      const dx = b.x - gx, dz = b.z - pz, d = hyp(dx, dz);
      if (d < BR + 0.06 && d > 1e-4) { const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.55 * vn * nx; b.vz -= 1.55 * vn * nz; b.x = gx + nx * (BR + 0.061); b.z = pz + nz * (BR + 0.061); return true; } }
    }
    if (Math.abs(b.z) < GW) {
      const dx = b.x - gx, dy = b.y - GH, d = hyp(dx, dy);
      if (d < BR + 0.06 && d > 1e-4) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.x = gx + nx * (BR + 0.061); b.y = GH + ny * (BR + 0.061); return true; } }
    }
  }
  return false;
}
/** Chance quality of a shot from a normalised position (nx towards the goal, nz lateral): 0..1. */
export function xgAt(nx: number, nz: number) {
  const dx = HL - nx; if (dx <= 0.3) return 0;
  const ang = Math.atan2(nz + GW, dx) - Math.atan2(nz - GW, dx), d = hyp(dx, nz);
  return clamp(Math.pow(clamp(ang / 1.5708, 0, 1), 0.8) * Math.exp(-d / 14) * 1.35, 0, 0.95);
}
