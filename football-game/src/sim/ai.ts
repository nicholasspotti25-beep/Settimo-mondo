// Team AI: formation shape, defensive jobs (press / cover / mark), off-ball attacking movement and the ball carrier's decisions.
// Decisions are utility based; difficulty changes reaction time and decision noise only — never the players' statistics.
import { DT, GW, HL, HW, P, Team, angd, clamp, dist, hyp, lerp, predict, xgAt } from './base';
import { doPass, doShot, lane, leadPt, nearestOpp, startFeint, startTackle } from './act';
import type { Match } from './match';

const NOISE = [0.45, 0.32, 0.2, 0.11, 0.05], THINK = [0.5, 0.4, 0.3, 0.23, 0.17], TIMING = [0.3, 0.45, 0.6, 0.78, 0.92];
const pick = <T>(m: Match, w: [T, number][]): T => { let s = 0; for (const x of w) s += Math.max(0, x[1]); let r = m.rnd() * s; for (const x of w) { r -= Math.max(0, x[1]); if (r <= 0) return x[0]; } return w[0][0]; };

/** Who can get to a free ball first (per team), from sampled ball prediction. */
export function chasers(m: Match) {
  const b = m.ball; predict(b, b.fut);
  for (const T of m.teams) {
    let best: P | null = null, bt = 99, bx = b.x, bz = b.z;
    for (const p of T.ps) {
      if (!p.on || p.grp === 'GK') continue;
      const react = (p === b.passTo ? 0 : 0.1 + (T === m.att ? 0.04 : (100 - Math.min(100, p.d.dpos)) * 0.004 + [0.2, 0.14, 0.08, 0.04, 0][T.ai]))
        + (p.act === 'down' || p.act === 'stun' ? p.actT : 0);
      let tt = 99, px = b.x, pz = b.z; const v = p.d.spd * 0.92;
      if (hyp(b.x - p.x, b.z - p.z) < 1.4 && b.y < 2) { tt = react; }
      else for (let k = 0; k < b.fut.length / 3; k++) {
        const tk = (k + 1) * 0.25, y = b.fut[k * 3 + 1]; if (y > 2.2) continue;
        const fx = clamp(b.fut[k * 3], -HL - 0.5, HL + 0.5), fz = clamp(b.fut[k * 3 + 2], -HW - 0.5, HW + 0.5), dd = hyp(fx - p.x, fz - p.z);
        px = fx; pz = fz;
        if (dd / v + react <= tk + 0.05) { tt = tk; break; }
        if (k === b.fut.length / 3 - 1) tt = tk + (dd - v * (tk - react)) / v;
      }
      if (p === b.passTo) tt -= 0.4;
      if (tt < bt) { bt = tt; best = p; bx = px; bz = pz; }
    }
    T.chaser = best; T.chaseT = bt; T.cpx = bx; T.cpz = bz;
  }
}

export function teamThink(m: Match, T: Team, dtk: number) {
  const O = m.teams[1 - T.id], b = m.ball, dir = T.dir, tac = T.tac, q = T.quickT > 0 ? T.quick : '';
  const bx = clamp(b.x * dir, -HL, HL), bz = clamp(b.z * dir, -HW, HW), att = m.att === T;
  let a1 = -99, a2 = -99; for (const o of O.ps) if (o.on) { const v = o.x * dir; if (v > a1) { a2 = a1; a1 = v; } else if (v > a2) a2 = v; }
  T.offLine = Math.max(a2, bx, 0);
  T.lead = 0; for (const p of T.ps) if (p.on) T.lead = Math.max(T.lead, p.d.lead);
  const ment = tac.ment + (q === 'attacca' ? 1 : q === 'compatti' || q === 'gestisci' ? -1 : 0);
  let lineX = 99;
  for (const p of T.ps) {
    if (!p.on || p.grp === 'GK') continue;
    const s = T.form.slots[p.slot], g = p.grp, sgn = s.z >= 0 ? 1 : -1, ins = p.ins; let ax: number, az: number;
    if (att) {
      ax = s.x * (tac.build === 0 ? 0.72 : tac.build >= 2 ? 0.86 : 0.8) + bx * 0.62 + 4 + (ment - 1) * 4 + (tac.build >= 2 && (g === 'ST' || g === 'W') ? 4 : 0);
      az = s.z * [0.86, 1, 1.14][tac.width] + bz * 0.22;
      if (g === 'FB') { if (ins === 'dietro') ax -= 8; else if (ins === 'attacca') ax += 6; else if (ins === 'dentro') { az *= 0.5; ax += 3; } }
      else if (g === 'DM') { if (ins === 'davanti') ax -= 3; else if (ins === 'costruzione' && bx < -8) { ax -= 7; az *= 0.3; } }
      else if (g === 'CM') { if (ins === 'copertura') ax -= 6; else if (ins === 'inserisciti') ax += 4; else if (ins === 'regia') { ax = lerp(ax, bx - 4, 0.4); az = lerp(az, bz, 0.35); } }
      else if (g === 'AM') { if (ins === '') az += bz * 0.3; else if (ins === 'linee') ax = Math.max(ax, T.offLine - 9); }
      else if (g === 'W') { if (ins === 'largo') az = sgn * (HW - 3.5); else if (ins === 'accentrati') az *= 0.55; else if (ins === 'incontro') ax -= 7; else if (ins === 'profondita') ax += 3; }
      else if (g === 'ST') { if (ins === 'incontro') ax -= 8; else if (ins === 'profondita') ax = Math.max(ax, T.offLine - 1.5); else if (ins === 'libero') az += bz * 0.35;
        else if (ins === 'riferimento') { ax = Math.max(ax, T.offLine - 2); az *= 0.5; } else az *= 0.8; }
      ax = Math.min(ax, g === 'CB' ? 14 : HL - 5);
      if (ax > bx) ax = Math.min(ax, Math.max(T.offLine - 0.6, bx));
    } else {
      ax = s.x * 0.6 + bx * 0.6 - 6 + (tac.line - 1) * 5 + (ment - 1) * 2 + [6, 2, -2, -7][tac.press] * (g === 'CB' || g === 'FB' ? 0.5 : 1) - (q === 'compatti' ? 6 : 0);
      az = s.z * [0.62, 0.74, 0.86][tac.comp] * (q === 'compatti' ? 0.85 : 1) + bz * (g === 'DM' && ins === '' ? 0.52 : 0.42);
      if (T.lostT < 5 && tac.lost === 2) az *= 0.8;
      if (g === 'W' && ins === 'difesa') ax -= 10; if (g === 'CB' && ins === 'profondita') ax -= 3;
      if (g === 'CB' || g === 'FB' || g === 'DM') ax = Math.min(ax, bx - (g === 'CB' ? 6 : g === 'FB' ? 4 : 2));
      // reading of play: good positional defenders shade towards where the ball is going
      const k = clamp((p.d.dpos - 70) / 30, 0, 1.2) * 0.35; az += clamp(b.vz * dir, -12, 12) * k * 0.35;
      const nz = (100 - Math.min(100, p.d.dpos)) * 0.045; ax += Math.sin(m.t * 0.7 + p.i * 2.1) * nz; az += Math.cos(m.t * 0.6 + p.i) * nz;
      if (g === 'CB') lineX = Math.min(lineX, ax);
    }
    p.ax = clamp(ax, -HL + 4.5, HL - 3); p.az = clamp(az, -HW + 1.5, HW - 1.5); p.job = 'zone'; p.mark = null; p.spr = false; p.jock = false;
  }
  if (!att) for (const p of T.ps) if (p.on) { // line cohesion: tidy with a leader on the pitch, ragged without
    if (p.grp === 'CB') p.ax = Math.max(-HL + 4.5, lineX + Math.sin(m.t * 0.4 + p.i * 3) * 1.7 * (1 - Math.min(1, T.lead)));
    else if (p.grp === 'FB') p.ax = Math.min(p.ax, lineX + 9);
  }
  if (att) attackJobs(m, T, O, bx, bz, dtk, q); else defendJobs(m, T, O, bx, q);
  for (const p of T.ps) {
    if (!p.on || p.grp === 'GK') continue;
    p.tx = p.ax * dir; p.tz = p.az * dir;
    if (!p.spr && p.st > 18) {
      const dd = hyp(p.tx - p.x, p.tz - p.z);
      p.spr = dd > 13 || (!att && dd > 5 && p.x * dir > bx + 2 && (p.grp === 'CB' || p.grp === 'FB' || p.grp === 'DM' || tac.lost === 1 && T.lostT < 6));
    }
  }
}

function defendJobs(m: Match, T: Team, O: Team, bx: number, q: string) {
  const b = m.ball, dir = T.dir, tac = T.tac, gx = -dir * HL;
  const c = b.owner && b.owner.team === O ? b.owner : null;
  let fx = c ? c.x + c.vx * 0.25 : O.cpx, fz = c ? c.z + c.vz * 0.25 : O.cpz;
  if (!c && !b.passTo) { fx = T.cpx; fz = T.cpz; }
  const fd = hyp(fx - gx, fz), ux = (gx - fx) / (fd || 1), uz = -fz / (fd || 1);
  const human = m.ctrl && m.ctrl.team === T && m.ctrl.grp !== 'GK' ? m.ctrl : null;
  // first defender
  let pr: P | null = null, pc = 1e9, cv: P | null = null, cc = 1e9;
  for (const p of T.ps) {
    if (!p.on || p.grp === 'GK' || p.act === 'down') continue;
    const d = hyp(p.x - fx, p.z - fz), gs = (p.x - fx) * dir < 1.5;
    const cost = d + (gs ? 0 : 5) - (p === T.presser ? 3 : 0) - p.d.prs / 25 + (p.grp === 'CB' && fd > 26 ? 6 : 0) + (p.st < 25 ? 3 : 0);
    if (cost < pc) { cc = pc; cv = pr; pc = cost; pr = p; } else if (cost < cc && gs) { cc = cost; cv = p; }
  }
  T.presser = pr; T.cover = cv;
  const counter = T.lostT < 4.5 && tac.lost === 0;
  const engage = bx < [46, 22, 6, -12][tac.press] + (q === 'pressing' || counter ? 60 : 0) || fd < 32;
  const inten = tac.inten + (q === 'pressing' ? 1 : 0);
  const pressT = (p: P) => { p.job = 'press'; p.ax = (fx + ux * 1.1) * dir; p.az = (fz + uz * 1.1) * dir; p.spr = (hyp(p.x - fx, p.z - fz) > (inten >= 2 ? 1.5 : 2.5) || !!c && hyp(c.vx, c.vz) > 4.5) && p.st > 8 && (T.ai >= 2 || fd < 34 || (p.i + Math.floor(m.t / 3)) % (T.ai + 2) > 0); };
  if (pr) {
    if (human && human !== pr && dist(human, { x: fx, z: fz }) < 13 && !T.second) { cv = pr; T.cover = pr; } // the user is the first defender
    else if (engage || !c) pressT(pr);
    else { pr.job = 'shadow'; pr.ax = (fx + ux * 6) * dir; pr.az = (fz + uz * 6) * dir; }
  }
  if (cv && cv !== pr || cv && human) {
    if ((T.second || counter && engage) && c) pressT(cv);
    else { cv.job = 'cover'; cv.ax = (fx + ux * 6.5) * dir; cv.az = (fz + uz * 6.5) * dir * 0.92; cv.spr = (cv.x - fx) * dir > 2; }
  }
  for (const p of T.ps) { // extra pressers: instruction "Pressa", Pressing PlayStyle, collective pressing
    if (!p.on || p.job !== 'zone' || p.grp === 'GK' || p.grp === 'CB' || !c || !engage) continue;
    const d = hyp(p.x - fx, p.z - fz);
    if (d < 15 && (p.ins === 'pressa' || p.d.prs > 68 && p.st > 30 || q === 'pressing' && d < 11)) { pressT(p); p.job = 'press2'; break; }
  }
  // marking
  const man = tac.mark === 1, thr: P[] = [];
  for (const o of O.ps) if (o.on && o !== c && o.grp !== 'GK' && o.x * dir < bx + 14 && o.x * dir < 12) thr.push(o);
  thr.sort((a, b2) => a.x * dir - b2.x * dir);
  for (const o of thr) {
    const onx = o.x * dir, danger = onx < -HL + 36, tight = man || tac.mark === 2 && danger;
    let best: P | null = null, bd = tight ? 17 : 10.5;
    for (const p of T.ps) {
      if (!p.on || p.job !== 'zone' || p.grp === 'GK' || p.grp === 'ST') continue;
      const R = p.grp === 'CB' ? (p.ins === 'anticipa' ? 1.3 : p.ins === '' ? 0.8 : 1) : 1;
      const d = hyp(p.ax - onx, p.az - o.z * dir) / R; if (d < bd) { bd = d; best = p; }
    }
    if (!best) continue;
    const p = best, od = hyp(o.x - gx, o.z) || 1, gap = clamp(2.1 - (p.d.mrk - 70) / 28, 0.9, 2.4);
    const mx = (o.x + (gx - o.x) / od * gap + o.vx * 0.3) * dir, mz = (o.z - o.z / od * gap + o.vz * 0.3) * dir, w = (tight ? 0.92 : danger ? 0.75 : 0.55) * [0.6, 0.8, 1, 1, 1][T.ai];
    p.job = 'mark'; p.mark = o; p.ax = lerp(p.ax, mx, w); p.az = lerp(p.az, mz, w);
    if (hyp(o.vx, o.vz) > 5.5 && p.st > 12) p.spr = true;
  }
}

function attackJobs(m: Match, T: Team, O: Team, bx: number, bz: number, dtk: number, q: string) {
  const b = m.ball, dir = T.dir, tac = T.tac, c = b.owner && b.owner.team === T ? b.owner : null;
  const cx = (c ? c.x : b.x) * dir, cz = (c ? c.z : b.z) * dir, time = !c || c.press < 0.7;
  const tempo = tac.tempo + (q === 'ritmo' ? 1 : 0) - (q === 'gestisci' ? 1 : 0), counter = (tac.build === 3 || tac.won === 0) && T.wonT < 6;
  for (const p of T.ps) {
    if (!p.on || p.grp === 'GK' || p === c) continue;
    if (!c && (p === b.passTo || p === T.chaser)) { p.job = 'recv'; p.ax = T.cpx * dir; p.az = T.cpz * dir; p.spr = true; continue; }
    const g = p.grp, s = T.form.slots[p.slot], sgn = s.z >= 0 ? 1 : -1, ins = p.ins, pnx = p.x * dir;
    p.runT -= dtk;
    if (m.t - p.passedT < 0.4 && p.d.oneT > 0 && m.rnd() < p.d.oneT * 0.5) { p.runKind = 'run'; p.runT = 2; } // give-and-go
    if (p.runT <= 0) {
      const tired = p.st < 28 ? 0.35 : 1, side = Math.sign(bz) === sgn || Math.abs(bz) < 8;
      const im = ins === 'inserisciti' ? 2.2 : ins === 'profondita' ? 2 : ins === 'copertura' || ins === 'davanti' || ins === 'dietro' ? 0 : ins === 'incontro' ? 0.4 : ins === 'riferimento' ? 0.5 : 1;
      const wRun = p.d.run * [0.5, 1, 1.6][tac.runs] * (q === 'attacca' ? 1.8 : q === 'gestisci' ? 0.4 : 1) * tired * (pnx > bx - 8 ? 1 : 0.3) * im * (counter ? 2 : 1) * (time ? 1 : 0.6);
      const wShort = ((g === 'CM' || g === 'AM' || g === 'DM' || g === 'ST' ? 0.35 : 0.15) + p.d.oneT * 0.3) * (tac.build === 0 ? 1.8 : 1) * (q === 'supporto' ? 2.6 : q === 'gestisci' ? 1.6 : 1)
        * (ins === 'regia' || ins === 'incontro' ? 2.5 : 1) * (hyp(pnx - cx, p.z * dir - cz) < 30 ? 1 : 0.3);
      const wOver = g === 'FB' && ins !== 'dietro' ? ([0.05, 0.45, 1, 0.7][tac.over] + p.d.ovl * 0.6) * (side && bx > -18 ? 1 : 0.08) * (ins === 'attacca' ? 1.8 : 1) * tired * (q === 'attacca' ? 1.5 : 1) : 0;
      const wCut = g === 'W' && ins !== 'largo' ? (0.25 + p.d.cutIn * 0.8) * (ins === 'accentrati' ? 2.5 : 1) * (bx > 5 ? 1 : 0.3) : 0;
      p.runKind = pick(m, [['hold', 1], ['run', wRun], ['short', wShort], ['over', wOver], ['cut', wCut]]);
      p.runT = (p.runKind === 'hold' ? 1.1 + m.rnd() * 1.4 : 2.2 + m.rnd() * 1.8) * (tempo >= 2 ? 0.75 : tempo <= 0 ? 1.25 : 1);
    }
    const k = p.runKind; p.job = k;
    if (k === 'run') { p.ax = Math.min(HL - 7, Math.max(p.ax + 6, T.offLine + 9)); p.az = p.az * 0.75 + Math.sign(p.az - cz || sgn) * 3; p.spr = p.st > 12; }
    else if (k === 'short') { const dx = p.ax - cx, dz = p.az - cz, d = hyp(dx, dz) || 1, r = tac.build === 0 ? 8 : 10; p.ax = cx + dx / d * r; p.az = cz + dz / d * r; }
    else if (k === 'over') { p.ax = Math.min(HL - 8, Math.max(bx + 9, p.ax + 14)); p.az = sgn * (tac.over === 3 || ins === 'dentro' ? 11 : HW - 3); p.spr = p.st > 15; }
    else if (k === 'cut') { p.ax = Math.max(p.ax + 4, T.offLine - 1); p.az = sgn * 8; p.spr = p.st > 20; }
    // stay onside while the ball is behind the line
    if (p.ax > bx && p !== b.passTo) p.ax = Math.min(p.ax, Math.max(T.offLine - 0.5, bx));
    // open a passing lane: step out of the cover shadow of the nearest opponent
    if (c && (k === 'hold' || k === 'short')) {
      const wx = p.ax * dir, wz = p.az * dir;
      if (lane(m, T.id, c.x, c.z, wx, wz, 15) < 0.3) {
        const dx = wx - c.x, dz = wz - c.z, d = hyp(dx, dz) || 1, px = -dz / d, pz = dx / d, sh = 4 + (p.d.boxp > 0 && pnx > 30 ? 2 : 0);
        const l1 = lane(m, T.id, c.x, c.z, wx + px * sh, wz + pz * sh, 15), l2 = lane(m, T.id, c.x, c.z, wx - px * sh, wz - pz * sh, 15), sg = l1 > l2 ? 1 : -1;
        p.ax = clamp((wx + px * sh * sg) * dir, -HL + 4, HL - 4); p.az = clamp((wz + pz * sh * sg) * dir, -HW + 1.5, HW - 1.5);
      }
    }
  }
  // spacing: no two team-mates on the same spot
  const ps = T.ps;
  for (let i = 1; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b2 = ps[j]; if (!a.on || !b2.on || a === c || b2 === c) continue;
    const dx = a.ax - b2.ax, dz = a.az - b2.az, d = hyp(dx, dz);
    if (d < 5.5 && d > 0.01) { const f = (5.5 - d) / d * 0.5; if (a.job !== 'recv') { a.ax += dx * f; a.az += dz * f; } if (b2.job !== 'recv') { b2.ax -= dx * f; b2.az -= dz * f; } }
  }
}

/** Per-frame steering of an AI-moved player towards its target. */
export function steer(p: P) {
  const dx = p.tx - p.x, dz = p.tz - p.z, d = hyp(dx, dz);
  if (d < 0.35) { p.mx = 0; p.mz = 0; return; }
  const mag = p.spr ? 1 : clamp(d / 3, 0.25, p.job === 'zone' || p.job === 'hold' ? 0.82 : 1);
  p.mx = dx / d * mag; p.mz = dz / d * mag;
}

/** AI first defender: jockey and choose the moment to tackle. */
export function aiPress(m: Match, p: P) {
  const b = m.ball, c = b.owner; if (!c || c.team === p.team || p.act !== 'none' || p.cdTk > 0 || c.act === 'hold') return;
  const T = p.team, d = hyp(b.x - p.x, b.z - p.z);
  if (d < 1.8) {
    const exposed = dist(c, b) > 0.95, qq = TIMING[T.ai], inten = T.tac.inten + (T.quickT > 0 && T.quick === 'pressing' ? 1 : 0);
    const rate = (exposed ? 1.6 + qq * 2.6 : 1.6 * (1 - qq) + 0.7) * [0.7, 1, 1.35, 1.6][inten] * (0.8 + p.d.agg / 250);
    if (m.rnd() < rate * DT) startTackle(m, p, false);
  } else if (d > 1.7 && d < 3 && hyp(c.vx, c.vz) > 5 && (c.x - p.x) * T.dir < 0 && hyp(c.x + T.dir * HL, c.z) < 30 && m.rnd() < (0.25 + p.d.agg / 200) * DT * 2) startTackle(m, p, true);
}

function aiShoot(m: Match, p: P, gd: number) {
  const d = p.d, T = p.team, gk = m.teams[1 - T.id].ps[0], b = m.ball, sk = gd < 18 ? d.shoF : d.shoL;
  const margin = clamp((0.3 + (100 - Math.min(100, sk)) / 100 * 1.4 + [1.3, 0.9, 0.5, 0.25, 0][T.ai]) / GW, 0.08, 0.8);
  const side = !gk.on || Math.abs(gk.z) < 0.35 ? (b.z > 0 ? -1 : 1) : gk.z > 0 ? -1 : 1, gkOut = gk.on ? hyp(gk.x - T.dir * HL, gk.z) : 0;
  let mod = '', power = 0.55 + m.rnd() * 0.25, ty: number | undefined = m.rnd() < 0.55 ? 0.25 + m.rnd() * 0.4 : m.rnd() < 0.5 ? 0.9 + m.rnd() * 0.5 : 1.6 + m.rnd() * 0.5;
  if (gkOut > 6.5 && gd > 11 && gd < 30 && m.rnd() < 0.5) { mod = 'chip'; ty = undefined; }
  else if (gd > 11 && gd < 27 && m.rnd() < 0.15 + (d.shoC - 82) / 40 + d.cutIn * 0.3) mod = 'finesse';
  else if (gd > 15 && m.rnd() < (d.shoP - 85) / 30) power = 0.84 + m.rnd() * 0.1;
  doShot(m, p, { power, aimZ: side * (1 - margin), mod, ty });
}

/** Decision of an AI player in possession. */
export function carrierThink(m: Match, p: P) {
  const T = p.team, O = m.teams[1 - T.id], dir = T.dir, b = m.ball, d = p.d, tac = T.tac, dif = T.ai, q = T.quickT > 0 ? T.quick : '';
  const nx = p.x * dir, nz = p.z * dir, gd = hyp(HL - nx, nz), pr = p.press;
  const tempo = tac.tempo + (q === 'ritmo' ? 1 : 0) - (q === 'gestisci' ? 1 : 0);
  p.think = (THINK[dif] + m.rnd() * 0.15) * (tempo >= 2 ? 0.75 : tempo <= 0 ? 1.3 : 1);
  let bu = -9, act: () => void = () => { };
  const consider = (u: number, f: () => void) => { u += (m.rnd() - 0.5) * NOISE[dif]; if (u > bu) { bu = u; act = f; } };
  if (gd < 36) {
    let blocked = 0; const ga = Math.atan2(-p.z, dir * HL - p.x);
    for (const o of O.ps) if (o.on && o.grp !== 'GK' && dist(o, p) < 5 && Math.abs(angd(Math.atan2(o.z - p.z, o.x - p.x), ga)) < 0.28) blocked++;
    const sk = gd < 18 ? d.shoF : d.shoL, xg = xgAt(nx, nz) * (0.55 + 0.45 * sk / 95) * (1 - Math.min(0.5, pr * 0.28)) * (blocked ? 0.45 : 1);
    consider(xg * 3.3 - 0.1 + (gd > 17 && gd < 30 && !blocked ? (d.shoL - 86) / 90 : 0), () => aiShoot(m, p, gd));
  }
  const fwdW = [0.75, 1, 1.3, 1.35][tac.build] * (q === 'attacca' ? 1.2 : q === 'gestisci' ? 0.7 : 1) * (tac.won === 0 && T.wonT < 6 ? 1.3 : tac.won === 2 && T.wonT < 6 ? 0.7 : 1);
  const visR = 20 + (d.vis - 70) * 0.65;
  for (const t of T.ps) {
    if (!t.on || t === p) continue;
    const D = dist(p, t); if (D < 4 || D > 52) continue; if (D > visR && m.rnd() > 0.35) continue;
    const tnx = t.x * dir, prog = clamp((tnx - nx) / 25, -1, 1);
    if (tnx > T.offLine + 0.2 && tnx > nx && m.rnd() < [0.5, 0.7, 0.85, 0.95, 1][dif]) continue;
    let lob = D > 30, mg = lane(m, T.id, p.x, p.z, t.x, t.z, lob ? 17 : 15, lob);
    if (!lob && mg < -0.5 && D > 16) { lob = true; mg = lane(m, T.id, p.x, p.z, t.x, t.z, 17, true) - 0.5; }
    let pOk = clamp(0.5 + mg * 0.24, 0, 1); if (lob) pOk *= clamp(0.72 + (d.pasL - 80) / 80, 0.3, 1);
    const sp = nearestOpp(m, t, T.id)[1], tgd = hyp(HL - tnx, t.z);
    let val = 0.22 + prog * 0.42 * fwdW + Math.min(sp, 10) / 10 * 0.25 + clamp(1 - tgd / 45, 0, 1) * 0.35 + (D < 18 ? (tac.build === 0 ? 0.1 : 0) + d.oneT * 0.06 : 0);
    if (t.grp === 'GK') val = pr > 0.9 ? 0.2 : -0.2;
    if (nx < -18 && prog < 0) val -= 0.12;
    const isLob = lob;
    consider(pOk * val - (1 - pOk) * (nx < 0 ? 0.75 : 0.45), () => { const [lx, lz] = leadPt(p, t); doPass(m, p, t, lx, lz, isLob ? 'l' : 'g'); });
    if (tnx > nx + 2 && tnx > -5 && (t.grp === 'ST' || t.grp === 'W' || t.grp === 'AM' || t.runKind === 'run') && m.rnd() < 0.3 + d.vis / 160 + (tac.build >= 2 ? 0.15 : 0)) {
      const ptx = Math.min(HL - 8, Math.max(tnx + 7 + m.rnd() * 6, T.offLine + 5)), ptz = clamp(t.z * dir + t.vz * dir * 0.6, -HW + 3, HW - 3);
      if (ptx - tnx > 4) {
        const wx = ptx * dir, wz = ptz * dir, tT = hyp(wx - t.x, wz - t.z) / t.d.spd; let tO = 9;
        for (const o of O.ps) if (o.on) tO = Math.min(tO, hyp(wx - o.x, wz - o.z) / o.d.spd + (o.grp === 'GK' ? 0.2 : 0.3));
        const far = D > 28, pk = clamp(0.45 + (tO - tT) * 0.55, 0, 1) * clamp(0.5 + lane(m, T.id, p.x, p.z, wx, wz, 15, far) * 0.24, 0, 1);
        const v = 0.7 + clamp(1 - hyp(HL - ptx, ptz) / 40, 0, 1) * 0.45 + (d.pasT - 88) / 60;
        consider(pk * v - (1 - pk) * 0.35, () => doPass(m, p, t, wx, wz, far ? 'tl' : 'tg'));
      }
    }
  }
  if (Math.abs(nz) > 12 && nx > 30) { // cross
    let tg: P | null = null, ts = -1, n = 0;
    for (const t of T.ps) if (t.on && t !== p && t.x * dir > HL - 17 && Math.abs(t.z) < 13) { n++; const s = t.d.air + nearestOpp(m, t, T.id)[1] * 6 + m.rnd() * 10; if (s > ts) { ts = s; tg = t; } }
    if (tg) { const t = tg; consider(0.38 + n * 0.07 + (d.crs - 82) / 70 + (t.d.air - 80) / 150, () => doPass(m, p, t, t.x + t.vx * 0.5 + dir * 1.5, t.z + t.vz * 0.5, 'c')); }
  }
  { // carry / dribble: pick the most open direction around the path to goal
    const tz = p.z * (d.cutIn > 0 && nx > 10 ? 0.15 : Math.abs(nz) > 16 && nx < 34 ? 0.92 : 0.25), ga = Math.atan2(tz - p.z, dir * (HL - 8) - p.x);
    let bs = -9, ba = ga, bf = 0;
    for (const da of [0, 0.5, -0.5, 1.05, -1.05, 1.7, -1.7, 3.14]) {
      const a = ga + da, ca = Math.cos(a), sa = Math.sin(a); let f = 9;
      for (const o of O.ps) { if (!o.on || o.act === 'down' || o.act === 'stun') continue; const rel = (o.x - p.x) * ca + (o.z - p.z) * sa; if (rel > -0.5 && rel < 9 && Math.abs(-(o.x - p.x) * sa + (o.z - p.z) * ca) < 1.6 + rel * 0.22) f = Math.min(f, Math.max(0, rel)); }
      if (Math.abs(p.x + ca * 6) > HL - 1 || Math.abs(p.z + sa * 6) > HW - 1) f = Math.min(f, 2);
      const s = f / 9 * 0.62 + Math.cos(da) * 0.38 - (da > 3 ? 0.1 : 0); if (s > bs) { bs = s; ba = a; bf = f; }
    }
    let ud = 0.06 + bs * 0.27 + clamp((d.ctl - 82) / 25, -0.5, 1) * 0.1 + d.drb * 0.08 - Math.min(0.2, (m.t - p.gotT) * 0.035) + (d.carry > 0 && nx < 10 ? 0.1 : 0) - (pr > 1 ? 0.12 : 0) + (tempo <= 0 ? 0.06 : tempo >= 2 ? -0.06 : 0) + (nx > 20 ? 0.05 : 0);
    if (p.grp === 'CB' || p.grp === 'GK') ud -= d.carry > 0 ? 0.02 : 0.15;
    const a = ba, f = bf;
    consider(ud, () => {
      p.carryA = a; p.carrySpr = f > 5 && p.st > 15;
      const [o, od] = nearestOpp(m, p, T.id);
      if (o && od < 3 && p.cdFeint <= 0 && Math.abs(angd(Math.atan2(o.z - p.z, o.x - p.x), a)) < 1.1 && m.rnd() < 0.25 + d.drb * 0.3 + d.skl * 0.12) startFeint(m, p);
    });
  }
  if (nx < -26 && pr > 0.8) consider(0.3, () => doPass(m, p, null, clamp(p.x + dir * 38, -HL + 5, HL - 5), (p.z >= 0 ? 1 : -1) * 22, 'l'));
  act();
}

/** An AI receiver decides, just before the ball arrives, whether to play first time. */
export function aiReceive(m: Match, p: P) {
  const b = m.ball, T = p.team, dir = T.dir;
  if (p.q || p.gkShot === b.kickId || dist(p, b) > 7) return;
  p.gkShot = b.kickId;
  const nx = p.x * dir, xg = xgAt(nx, p.z * dir), tempo = T.tac.tempo + (T.quickT > 0 && T.quick === 'ritmo' ? 1 : 0);
  if (xg > 0.2 && m.rnd() < 0.55 + TIMING[T.ai] * 0.4) { p.q = { type: 'shoot', power: 0.6, mod: '', ax: 0, az: 0, t: m.t, aimZ: null }; return; }
  if (m.rnd() < p.press * 0.35 + p.d.oneT * 0.45 + (tempo >= 2 ? 0.2 : 0)) {
    let best: P | null = null, bs = 0.4;
    for (const t of T.ps) {
      if (!t.on || t === p || t.grp === 'GK' || t === b.kicker && p.d.oneT <= 0) continue;
      const D = dist(p, t); if (D < 5 || D > 22 || t.x * dir > T.offLine + 0.2 && t.x * dir > nx) continue;
      const s = lane(m, T.id, p.x, p.z, t.x, t.z, 15) * 0.3 + (t.x * dir - nx) / 30 + nearestOpp(m, t, T.id)[1] / 20;
      if (s > bs) { bs = s; best = t; }
    }
    if (best) p.q = { type: 'pass', power: 0.4, mod: '', ax: 0, az: 0, t: m.t, target: best };
  }
}
