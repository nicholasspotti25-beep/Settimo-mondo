// On-ball actions: passing, shooting, tackling, feints, first touch and aerial duels. Reads only stats/PlayStyle-derived values.
import { BR, GH, GW, HL, HW, P, angd, clamp, dist, flightT, groundSpeed, hyp, launch } from './base';
import type { Match } from './match';

export const fat = (p: P) => clamp(p.st / 55, 0, 1);
export const nearestOpp = (m: Match, p: { x: number; z: number }, team: number, skip?: P): [P | null, number] => {
  let b: P | null = null, bd = 1e9;
  for (const o of m.teams[1 - team].ps) { if (!o.on || o === skip) continue; const d = dist(o, p); if (d < bd) { bd = d; b = o; } }
  return [b, bd];
};
/** Defensive pressure on a player: 0 (free) .. ~2 (crowded). */
export function pressure(m: Match, p: P) {
  let s = 0;
  for (const o of m.teams[1 - p.team.id].ps) { if (!o.on || o.act === 'down') continue; const d = dist(o, p); if (d < 4.5) s += (1 - d / 4.5) * (o.act === 'stun' ? 0.4 : 1); }
  return s;
}
/** How open the lane from (ax,az) to (bx,bz) is for a ball of average speed v: metres of margin (negative = interceptable). */
export function lane(m: Match, team: number, ax: number, az: number, bx: number, bz: number, v: number, loft = false) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2); let best = 99;
  for (const o of m.teams[1 - team].ps) {
    if (!o.on || o.act === 'down') continue;
    let t = ((o.x - ax) * dx + (o.z - az) * dz) / L2; t = clamp(t, loft ? 0.82 : 0.06, 1);
    const d = hyp(o.x - (ax + dx * t), o.z - (az + dz * t)), tb = L * t / v;
    const r = (o.grp === 'GK' ? 1.6 : 0.9 + (o.d.int - 80) * 0.012) + o.d.spd * 0.72 * Math.max(0, tb - 0.28);
    if (d - r < best) best = d - r;
  }
  return best;
}

export function kick(m: Match, p: P, kind: string, shot = false, passTo: P | null = null, noOff = false) {
  const b = m.ball, T = p.team, dir = T.dir;
  b.owner = null; b.last = p; b.kicker = p; b.passTo = passTo; b.shot = shot; b.kickId++; b.kickT = m.t; b.free = 0; b.futAt = -1;
  p.cdCtl = 0.4; p.q = null; p.passedT = m.t; p.feintT = 0;
  if (p.act === 'none' || p.act === 'hold' || p.act === 'throw') { p.act = 'kick'; p.actT = p.actDur = shot ? 0.36 : 0.26; p.actKind = kind; }
  b.off.length = 0;
  if (!noOff) {
    let a1 = -99, a2 = -99; for (const o of m.teams[1 - T.id].ps) if (o.on) { const v = o.x * dir; if (v > a1) { a2 = a1; a1 = v; } else if (v > a2) a2 = v; }
    const lim = Math.max(a2, b.x * dir, 0) + 0.15;
    for (const t of T.ps) if (t.on && t !== p && t.x * dir > lim) b.off.push(t);
  }
  m.ev.push({ k: 'kick', v: hyp(b.vx, b.vy, b.vz) });
}

/** Team-mate best matching an input direction (unit ax,az). `long` prefers distant targets. */
export function pickMate(m: Match, p: P, ax: number, az: number, long: boolean, fwdOnly = false): P | null {
  let best: P | null = null, bs = -1e9; const dir = p.team.dir;
  for (const t of p.team.ps) {
    if (!t.on || t === p) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = hyp(dx, dz); if (d < 2.5) continue;
    if (fwdOnly && (t.x - p.x) * dir < -4) continue;
    const ang = Math.abs(angd(Math.atan2(dz, dx), Math.atan2(az, ax)));
    if (ang > (t.grp === 'GK' ? 0.5 : 1.25)) continue;
    let s = -ang * 30 - Math.abs(d - (long ? 34 : 13)) * (long ? 0.25 : 0.5);
    if (lane(m, p.team.id, p.x, p.z, t.x, t.z, 16, long) < 0) s -= 5;
    if (s > bs) { bs = s; best = t; }
  }
  return best;
}
function weakSide(p: P, a: number) { // true when the kick direction forces the weaker foot
  const s = angd(a, p.face), f = p.data.look.foot;
  return f !== 'B' && Math.abs(s) > 0.55 && (f === 'R' ? s > 0 : s < 0);
}

/** kind: g ground · l lofted · c cross · tg through (ground) · tl through (lofted). */
export function doPass(m: Match, p: P, tgt: P | null, px: number, pz: number, kind: string, ft = false, pow = 0.5, noOff = false) {
  const b = m.ball, d = p.d, dx = px - b.x, dz = pz - b.z, D = hyp(dx, dz) || 1, a0 = Math.atan2(dz, dx);
  const skill = kind === 'g' ? d.pasS : kind === 'l' ? d.pasL : kind === 'c' ? d.crs : d.pasT;
  let mult = 1 + p.press * 0.35 + (1 - fat(p)) * 0.4 + (ft ? 0.42 - 0.34 * Math.min(1, d.oneT) : 0), knd = 'pass';
  const ao = p.act === 'hold' || p.act === 'throw' ? 0 : Math.abs(angd(p.face, a0));
  if (ao > 2.0) { if (d.skl > 0 || d.wf > 0.85) { mult += 0.18; knd = 'heel'; } else mult += 0.55; } else if (ao > 1.15) mult += 0.2;
  if (weakSide(p, a0)) mult += (1 - d.wf) * 0.9;
  const sig = (0.016 + (100 - Math.min(skill, 106)) / 99 * 0.11) * mult, a = a0 + m.gauss() * sig, sv = 1 + m.gauss() * 0.035 * mult;
  if (b.y < BR) b.y = BR;
  if (kind === 'g' || kind === 'tg') {
    const v = Math.min(31, groundSpeed(D, kind === 'g' ? 7.5 + pow * 3.5 : 5.2) * sv);
    b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; b.vy = D > 24 ? 1.6 : 0; b.curve = 0;
  } else {
    const T = (kind === 'c' ? 0.7 + D / 27 : kind === 'tl' ? 0.9 + D / 22 : 0.8 + D / 24) * (1.12 - pow * 0.24);
    launch(b, b.x + Math.cos(a) * D * sv, kind === 'c' ? 1.95 : 0.35, b.z + Math.sin(a) * D * sv, T);
    if (kind === 'c') knd = 'cross';
  }
  if (p.act === 'throw') { b.y = 2.1; knd = 'throw'; }
  m.stats[p.team.id].pass++; m.passId = b.kickId + 1; p.kickFoot = p.data.look.foot === 'L' ? -1 : 1;
  kick(m, p, knd, false, tgt, noOff);
}
/** Target point leading a moving receiver. */
export function leadPt(p: P, t: P, extra = 0): [number, number] {
  const D = dist(p, t), tt = D / 15 + 0.15, dir = p.team.dir;
  return [clamp(t.x + t.vx * tt * 0.8 + extra * dir, -HL + 2, HL - 2), clamp(t.z + t.vz * tt * 0.8, -HW + 1.5, HW - 1.5)];
}

export interface ShotOpt { power: number; aimZ: number | null; mod: string; ft?: boolean; ty?: number; curve?: number; fk?: boolean }
export function doShot(m: Match, p: P, o: ShotOpt) {
  const b = m.ball, d = p.d, dir = p.team.dir, gx = dir * HL, gk = m.teams[1 - p.team.id].ps[0];
  let aimZ = o.aimZ; if (aimZ == null) aimZ = (gk.on && gk.z > 0 ? -1 : 1) * 0.6;
  const head = b.y > 1.3, air = b.y > 0.4 && !o.fk;
  const kind = head ? 'header' : air ? (d.acro > 0 && b.y > 0.85 ? 'acro' : 'volley') : o.mod === 'finesse' ? 'finesse' : o.mod === 'chip' ? 'chip' : 'shot';
  const D0 = hyp(gx - b.x, b.z), inBox = D0 < 18, tz = clamp(aimZ, -1, 1) * (GW - 0.3), pw = clamp(o.power, 0, 1);
  const powF = 0.8 + (Math.min(d.shoP, 114) - 60) / 54 * 0.34, base = inBox ? d.shoF : d.shoL, a0 = Math.atan2(tz - b.z, gx - b.x);
  let v = (18 + 14 * pw) * powF, ty = 0.2 + pw * pw * 2.0, curve = 0, skill = base, km = 1;
  const ft = p.data.look.foot, sgn = ft === 'L' ? 1 : ft === 'R' ? -1 : (b.z * dir > 0 ? -1 : 1) * dir;
  if (kind === 'header') { v = (10.5 + 5 * pw) * (0.85 + d.hdr / 400 + d.str / 600); ty = 0.3 + m.rnd() * 1.3; skill = d.hdr; km = 1.15; }
  else if (kind === 'volley' || kind === 'acro') { v = (19 + 12 * pw) * powF; ty = 0.5 + pw * 1.4; skill = d.shoV; km = 1.3; }
  else if (kind === 'finesse') { v = (17.5 + 8 * pw) * (0.9 + (powF - 0.9) * 0.5); ty = 0.5 + pw * 1.5; curve = sgn * (0.22 + clamp((d.shoC - 70) / 45, 0, 1) * 0.3); skill = d.shoC * 0.6 + base * 0.4 + 4; km = 0.85; }
  else if (kind === 'chip') { skill = d.shoC * 0.5 + d.shoF * 0.5; ty = 1.3; }
  if (o.fk) { skill = d.fk; curve = (o.curve ?? 0) * (0.3 + clamp((d.fk - 70) / 45, 0, 1) * 0.35); km = 0.8; }
  if (o.ty != null) ty = o.ty;
  skill += d.shoA * (p.press < 0.5 ? 1 : 0.3);
  let mult = 1 + p.press * 0.6 + hyp(p.vx, p.vz) / p.d.spd * 0.45 + pw * pw * 0.45 + D0 / 55 + (1 - fat(p)) * 0.5 + (o.ft ? 0.15 : 0);
  if (!head && weakSide(p, a0)) { mult += (1 - d.wf) * 1.1; p.kickFoot = ft === 'L' ? 1 : -1; } else p.kickFoot = ft === 'L' ? -1 : 1;
  const sig = (0.021 + (100 - Math.min(skill, 112)) / 99 * 0.12) * mult * km, D = hyp(gx - b.x, tz - b.z);
  const ez = tz + m.gauss() * sig * D, ey = Math.max(0.12, ty + m.gauss() * sig * D * 0.8 + (pw > 0.82 ? m.rnd() * (pw - 0.82) * 6 : 0));
  if (b.y < BR) b.y = BR;
  launch(b, gx, ey, ez, kind === 'chip' ? 1.0 + D / 24 : flightT(D, v), curve);
  const s = m.stats[p.team.id]; s.shots++; if (Math.abs(ez) < GW && ey < GH) s.onT++;
  kick(m, p, kind, true);
}

// ---- dribbling feints (contextual, passive) --------------------------------------------------------------------------
export function startFeint(m: Match, c: P) {
  const d = c.d, r = m.rnd();
  c.feintKind = d.elas > 0 && r < 0.45 ? 'elastico' : d.skl >= 2 ? (r < 0.6 ? 'stepover' : r < 0.8 ? 'roulette' : 'body') : d.skl >= 1 ? (r < 0.5 ? 'stepover' : 'body')
    : d.acc > 12.6 ? 'stopgo' : 'body';
  c.feintT = 0.4; c.cdFeint = 2.8 - d.skl * 0.45 - d.tight * 0.5; c.burst = 0.9;
  m.ev.push({ k: 'feint', p: c });
}

// ---- tackling --------------------------------------------------------------------------------------------------------
export function startTackle(m: Match, t: P, slide: boolean) {
  if (t.act !== 'none' || t.cdTk > 0) return;
  const b = m.ball, a = slide && hyp(t.mx, t.mz) > 0.3 ? Math.atan2(t.mz, t.mx) : Math.atan2(b.z - t.z, b.x - t.x);
  t.act = slide ? 'slide' : 'tackle'; t.actT = t.actDur = slide ? 0.85 : 0.36; t.actDir = a; t.hit = false; t.face = a; t.cdTk = slide ? 1.5 : 0.75;
  const sp = slide ? Math.max(hyp(t.vx, t.vz), 5.5) + 1.5 : Math.max(hyp(t.vx, t.vz), 3) + 1.2;
  t.vx = Math.cos(a) * sp; t.vz = Math.sin(a) * sp;
}
/** Called every frame while a tackle/slide is active, until it connects or expires. */
export function tackleHit(m: Match, t: P) {
  const b = m.ball, c = b.owner, slide = t.act === 'slide', el = t.actDur - t.actT;
  if (t.hit || el < 0.07 || el > (slide ? 0.55 : 0.24)) return;
  const reach = (slide ? 1.25 : 1.0) + (t.d.tck - 80) / 220, db = hyp(b.x - t.x, b.z - t.z);
  if (!c) { if (db < reach && b.y < 0.8 && b.free > 0.1) { t.hit = true; const a = t.actDir; b.vx = Math.cos(a) * 6; b.vz = Math.sin(a) * 6; b.last = t; b.passTo = null; b.kickId++; b.futAt = -1; } return; }
  if (c.team === t.team || c.act === 'hold') return;
  if (db > reach) {
    if (slide && dist(t, c) < 0.75 && el > 0.15) { t.hit = true; m.foul(t, c, 1.2 + (behind(t, c) ? 1 : 0)); }
    return;
  }
  t.hit = true;
  const bh = behind(t, c), cs = hyp(c.vx, c.vz);
  let pr = 0.5 + (t.d.tck - (0.5 * c.d.ctl + 0.25 * c.d.bal + 0.25 * c.d.agi)) / 120 + clamp(dist(c, b) - 0.6, 0, 1) * 0.24 + (slide ? 0.1 : 0);
  pr *= 0.75 + 0.25 * fat(t);
  if (bh) pr *= 0.6;
  if (cs < 3.2) pr *= 1 - clamp((c.d.str - t.d.str + 12) / 45, 0, 0.6) * (0.45 + 0.55 * Math.min(1, c.d.shield));
  if (c.feintT > 0) pr *= 0.42;
  else if (c.cdFeint <= 0 && m.rnd() < clamp((c.d.ctl - 80) / 42 + c.d.tight * 0.14 + c.d.skl * 0.07, 0, 0.78)) { startFeint(m, c); pr *= 0.5; }
  const win = m.rnd() < clamp(pr, 0.06, 0.93);
  let pf = 0.05 + (bh ? 0.22 : 0) + (slide ? 0.12 : 0) + (win ? 0 : 0.12) + (t.d.agg - 50) / 100 * 0.14 - (t.d.cln - 75) / 100 * 0.38 + (t.team.tac.inten - 1) * 0.03;
  pf = clamp(pf, 0.012, 0.7) * (win ? 0.3 : 1);
  if (m.rnd() < pf) { m.foul(t, c, (slide ? 1 : 0) + (bh ? 1 : 0) + (win ? 0 : 0.5) + m.rnd() * 0.8); return; }
  if (win) {
    m.ev.push({ k: 'tackle', p: t }); m.stats[t.team.id].tackles++;
    c.act = 'stun'; c.actT = c.actDur = clamp(0.62 - c.d.bal / 300, 0.25, 0.6); c.q = null;
    b.last = t; b.passTo = null; b.off.length = 0; b.kickId++; b.futAt = -1;
    if (!slide && m.rnd() < 0.42 + (t.d.cln - 80) / 90 + (t.d.prs - 50) / 200) { b.owner = t; m.gained(t); }
    else { const a = t.actDir + (m.rnd() - 0.5) * 1.6, v = 4 + m.rnd() * 4; b.owner = null; b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; b.vy = m.rnd() * 2; b.free = 0; c.cdCtl = 0.5; }
  } else {
    t.act = 'stun'; t.actT = t.actDur = (0.62 - t.d.agi / 400 + (slide ? 0.55 : 0)) * (1 - 0.3 * Math.min(1, t.d.rec)); t.actKind = slide ? 'slide' : '';
    c.burst = Math.max(c.burst, 0.5);
  }
}
const behind = (t: P, c: P) => Math.abs(angd(c.face, Math.atan2(t.z - c.z, t.x - c.x))) > 2.25 && hyp(c.vx, c.vz) > 1.5;

// ---- first touch, blocks, headers -------------------------------------------------------------------------------------
/** A free ball is within reach of p: control it, play a queued first-time action, or get hit by it. */
export function touchBall(m: Match, p: P): boolean {
  const b = m.ball, d = p.d;
  if (p.cdCtl > 0 || p.act === 'down' || p.act === 'dive' || p.act === 'cele') return false;
  const dx = b.x - p.x, dz = b.z - p.z, dh = hyp(dx, dz), mine = b.passTo === p, opp = b.kicker ? b.kicker.team !== p.team : false;
  const stunned = p.act === 'stun' || p.act === 'slide' || p.act === 'kick';
  const reach = stunned ? 0.45 : 0.8 + (mine ? 0.3 : 0) + (opp && !b.shot ? clamp((d.int - 78) / 60, 0, 0.45) : 0);
  if (dh > reach || b.y > 1.25) return false;
  const s = hyp(b.vx - p.vx, b.vz - p.vz) + Math.abs(b.vy) * 0.4;
  if (!stunned && p.q && m.t - p.q.t < 2.6 && p.team === m.att) { m.firstTime(p); return true; }
  const comf = 11 + d.fst * 0.15 - (mine ? 0 : 3) - p.press * 1.2;
  if (stunned || s > comf + m.rnd() * 12) { // too hot to handle: it deflects off the body
    if (s < 3) return false;
    const n = hyp(dx, dz) || 1, nx = -dx / n, nz = -dz / n, vn = b.vx * nx + b.vz * nz;
    if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vz -= 1.4 * vn * nz; }
    const k = 0.35 + m.rnd() * 0.25; b.vx = b.vx * k + (m.rnd() - 0.5) * 3; b.vz = b.vz * k + (m.rnd() - 0.5) * 3; b.vy = Math.abs(b.vy) * 0.4 + m.rnd() * 2.5;
    if (b.shot && p.team !== b.kicker?.team && b.y > 0.85 && p.grp !== 'GK' && m.rnd() < 0.035) { m.handball(p); return true; }
    deflect(m, p); m.ev.push({ k: 'block', p });
    return true;
  }
  if (!m.offsideCheck(p)) return true;
  if (b.kicker && b.kicker.team === p.team && b.kicker !== p && m.passId === b.kickId) { m.stats[p.team.id].passOk++; }
  const prevTeam = b.last?.team;
  b.owner = p; b.last = p; b.passTo = null; b.shot = false; b.off.length = 0; b.vy = 0; b.y = BR; b.curve = 0; p.gotT = m.t;
  if (prevTeam !== p.team || !b.kicker || b.kicker.team !== p.team) m.gained(p);
  // heavy touch: the ball runs away from weaker controllers receiving hard passes
  if (s > comf * 0.72 && m.rnd() < (s / comf - 0.72) * 1.5 * (1.25 - d.fst / 100)) {
    const a = Math.atan2(p.vz, p.vx) + (m.rnd() - 0.5) * 1.2, v = 3.5 + m.rnd() * 3 + hyp(p.vx, p.vz) * 0.6;
    b.owner = null; b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; b.free = 0; p.cdCtl = 0.25; b.kickId++; b.futAt = -1;
  }
  p.think = Math.min(p.think, 0.12 + m.rnd() * 0.1);
  return true;
}
export function deflect(m: Match, p: P) {
  const b = m.ball; b.last = p; b.passTo = null; b.kickId++; b.futAt = -1; p.cdCtl = 0.3; b.free = 0;
  if (b.kicker && b.kicker.team !== p.team) b.off.length = 0;
}
/** Aerial duel: the ball is at head height near one or more players. */
export function aerial(m: Match, cands: P[]) {
  const b = m.ball; let w: P | null = null, ws = -1;
  for (const p of cands) {
    if (p.cdCtl > 0 || p.act === 'down' || p.act === 'stun' || p.act === 'slide') continue;
    const top = 1.8 + (p.data.look.h - 180) / 100 + 0.3 + p.d.air / 190;
    if (b.y > top) continue;
    const s = p.d.air * (0.55 + m.rnd() * 0.45) + (b.passTo === p ? 12 : 0) - hyp(b.x - p.x, b.z - p.z) * 14 + (p.q ? 6 : 0);
    if (s > ws) { ws = s; w = p; }
  }
  if (!w) return;
  for (const p of cands) { p.cdCtl = Math.max(p.cdCtl, p === w ? 0 : 0.45); if (p.act === 'none') { p.act = 'jump'; p.actT = p.actDur = 0.5; p.actKind = p === w ? 'head' : ''; } }
  if (!m.offsideCheck(w)) return;
  m.header(w);
}
