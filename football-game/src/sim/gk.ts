// Goalkeeper AI: positioning, trajectory-based saves, catches/parries, rushing out, sweeping and distribution.
// Differences between keepers come only from their six statistics and PlayStyles.
import { BR, GH, GW, HL, HW, P, PA_D, PA_W, clamp, crossPlane, dist, hyp, lerp } from './base';
import { doPass, leadPt, lane, nearestOpp, touchBall } from './act';
import type { Match } from './match';

const inArea = (g: P, x: number, z: number) => x * g.team.dir < -HL + PA_D && Math.abs(z) < PA_W;

function hold(m: Match, g: P) {
  const b = m.ball;
  b.owner = g; b.last = g; b.passTo = null; b.shot = false; b.off.length = 0; b.vx = b.vy = b.vz = 0; b.curve = 0;
  g.act = 'hold'; g.actT = 99; g.gkHold = m.t; g.vx = g.vz = 0; m.gained(g);
}

export function gkUpdate(m: Match, g: P) {
  const T = g.team, O = m.teams[1 - T.id], b = m.ball, dir = T.dir, gx = -dir * HL, d = g.d;
  if (g.act === 'hold') {
    g.mx = g.mz = 0;
    if (b.owner !== g) { g.act = 'none'; return; }
    if (m.t - g.gkHold > (m.ctrl === g ? 6 : 1.3 + (g.i % 3) * 0.3)) gkDistribute(m, g);
    return;
  }
  if (g.act === 'dive') {
    if (b.kickId !== g.gkShot || b.owner) { if (g.gkOk >= 0) { g.act = 'stun'; g.actT = g.actDur = 0.45; g.actKind = ''; } return; }
    if (g.gkOk < 0) return; // already resolved, finishing the animation
    if (m.t >= g.gkGo) { const vd = 2.9 + d.gDiv * 0.021, rem = Math.max(0.03, g.gkAt - m.t); g.vz = clamp((g.gkTz - g.z) / rem, -vd, vd); g.vx = 0; } else { g.vx *= 0.8; g.vz *= 0.8; }
    if ((b.x - g.x) * -dir >= -0.35) resolveSave(m, g);
    return;
  }
  if (g.act !== 'none') return;
  // --- shot detection: predict where the ball crosses the goal line and whether it can be reached in time
  if (!b.owner && b.kickId !== g.gkShot && b.vx * -dir > 5 && (b.x - g.x) * dir > 0.5) {
    g.gkShot = b.kickId;
    const c0 = crossPlane(b, gx), c = c0 && Math.abs(c0.z) < GW + 0.9 && c0.y < GH + 0.6 && c0.t < 2.2 ? crossPlane(b, g.x + dir * 0.3) ?? c0 : null;
    if (c) {
      let react = clamp(0.36 - d.gRef * 0.002 + m.rnd() * 0.06 + (b.shot ? 0 : 0.05), 0.1, 0.42);
      if (m.penId === b.kickId) { const r = m.rnd(), read = 0.3 + (d.gPos - 90) / 40; react += r < read ? -0.12 : r > 0.75 ? 0.22 : 0; }
      const ta = Math.max(0, c.t - react), vd = 2.9 + d.gDiv * 0.021;
      const reach = 0.8 + d.gReach + d.gCover * 0.12 + (g.data.look.h - 190) * 0.012 + vd * ta;
      const eff = hyp(c.z - g.z, Math.max(0, c.y - 1.3) * 0.75);
      let ps = clamp(0.55 + (reach - eff) / 0.8, 0.03, 0.985);
      if (c.t < 0.75 && b.shot) ps = Math.min(0.985, ps + d.gClutch * 0.08);
      g.gkOk = m.rnd() < ps ? (eff < reach * 0.62 ? 1 : 2) : 0;
      if ((globalThis as any).GKDBG) console.log('   shot t', c.t.toFixed(2), 'z', c.z.toFixed(1), 'y', c.y.toFixed(1), 'gz', g.z.toFixed(1), 'eff', eff.toFixed(2), 'reach', reach.toFixed(2), 'ps', ps.toFixed(2), 'ok', g.gkOk, 'gkx', (HL - Math.abs(g.x)).toFixed(1));
      g.gkAt = m.t + c.t; g.gkGo = m.t + react; g.gkTz = c.z; g.gkTy = c.y;
      g.act = 'dive'; g.actT = g.actDur = c.t + 0.5; g.actDir = Math.sign(c.z - g.z) * dir;
      g.actKind = eff < 1.0 ? 'catch' : c.y > 1.25 ? 'high' : 'low'; g.mx = g.mz = 0;
      return;
    }
  }
  // --- positioning on the ball–goal line
  const bd = hyp(b.x - gx, b.z) || 1, oc = b.owner && b.owner.team !== T ? b.owner : null, sw = clamp((d.gSwp - 84) / 20, 0, 1.2);
  const far = 5 + sw * 9 + d.gRush * 2;
  let out = bd > 48 ? far : bd > 22 ? lerp(2.2, far, (bd - 22) / 26) : clamp(bd * 0.14, 0.7, 2.6) * (1 + d.gCover * 0.18);
  g.spr = false; g.gkRush = false; g.job = 'gk';
  if (oc && bd < 24 && Math.abs(b.z) < 13) { // one-on-one: nobody goal-side of the carrier
    let cover = false; for (const t of T.ps) if (t.on && t !== g && dist(t, oc) < 6 && hyp(t.x - gx, t.z) < bd + 2) cover = true;
    if (!cover) {
      out = clamp(bd - 3, 1, 5.5 + d.gRush * 5 + sw * 2); g.spr = true; g.gkRush = true;
      if (hyp(b.x - g.x, b.z - g.z) < 1.5 && g.cdTk <= 0 && inArea(g, g.x, g.z)) {
        g.cdTk = 1.2;
        const ps = clamp(0.35 + (d.gRef - 85) / 40 + d.gRush * 0.15 - (oc.d.ctl - 85) / 60, 0.1, 0.85) * (oc.feintT > 0 ? 0.5 : 1);
        if (m.rnd() < ps) { m.stats[T.id].saves++; m.ev.push({ k: 'save', p: g }); oc.act = 'stun'; oc.actT = oc.actDur = 0.5; hold(m, g); }
        else { g.act = 'down'; g.actT = g.actDur = 0.85; g.actKind = 'smother'; }
        return;
      }
    }
  }
  const err = (100 - Math.min(100, d.gPos)) * 0.02;
  g.tx = gx + (b.x - gx) / bd * out; g.tz = b.z / bd * out + Math.sin(m.t * 0.8 + g.i) * err;
  if (hyp(g.tx - g.x, g.tz - g.z) > 1.2) g.spr = true;
  if (!b.owner) { // sweep / claim: get to the ball before any attacker
    const lim = -HL + PA_D + Math.max(0, d.gSwp - 88) * 1.3 + d.gRush * 4; let gt = 99, px = 0, pz = 0;
    if (hyp(b.x - g.x, b.z - g.z) < 2 && b.y < 2.8) { gt = 0.1; px = b.x; pz = b.z; }
    else for (let k = 0; k < b.fut.length / 3; k++) {
      const tk = (k + 1) * 0.25, fx = b.fut[k * 3], fy = b.fut[k * 3 + 1], fz = b.fut[k * 3 + 2], nfx = fx * dir, inA = nfx < -HL + PA_D - 0.5 && Math.abs(fz) < PA_W - 0.5;
      if (Math.abs(fx) > HL || Math.abs(fz) > HW) break;
      if (fy > (inA ? 2.75 : 1.4) || !inA && (nfx > lim || Math.abs(fz) > PA_W + 8)) continue;
      if (hyp(fx - g.x, fz - g.z) / (d.spd * 0.95) + 0.15 <= tk) { gt = tk; px = fx; pz = fz; break; }
    }
    const mine = b.passTo && b.passTo.team === T && T.chaseT < gt + 0.2;
    if (gt < 90 && !mine && gt < O.chaseT - (0.3 - d.gRush * 0.2)) { g.tx = px; g.tz = pz; g.spr = true; g.job = 'sweep'; }
  }
}

function resolveSave(m: Match, g: P) {
  const b = m.ball, d = g.d, T = g.team, dir = T.dir, ok = g.gkOk;
  g.gkOk = -1; g.actT = Math.min(g.actT, 0.5);
  if (!ok || Math.abs(b.z - g.z) > 1.7 || b.y > 3) return;
  const sp = hyp(b.vx, b.vy, b.vz), sgn = Math.sign(b.z - g.z || b.z || 1);
  m.stats[T.id].saves++; m.ev.push({ k: 'save', p: g });
  if (ok === 1 && sp < 14 + d.gHan * 0.13 + m.rnd() * 3) { const k = g.actKind; hold(m, g); if (k !== 'catch') { g.gkHold += 0.6; } return; }
  b.last = g; b.passTo = null; b.shot = false; b.off.length = 0; b.kickId++; g.gkShot = b.kickId; b.futAt = -1; b.free = 0; g.cdCtl = 0.5;
  if (ok === 2 && m.rnd() < 0.5) { b.vx = -dir * (3 + m.rnd() * 3); b.vz = sgn * (7 + m.rnd() * 3); b.vy = 1.5 + m.rnd() * 3; } // tipped round the post
  else if (m.rnd() < 0.3 + 0.7 * Math.min(1, d.gParry)) { b.vx = dir * (3 + m.rnd() * 4); b.vz = sgn * (8 + m.rnd() * 4); b.vy = 2 + m.rnd() * 2; } // pushed wide, away from danger
  else { b.vx = dir * (5 + m.rnd() * 6); b.vz = (m.rnd() - 0.5) * 12 + sgn * 2; b.vy = 2 + m.rnd() * 3; } // rebound in front of goal
}

/** A free ball is next to the keeper outside a tracked shot. */
export function gkTouch(m: Match, g: P): boolean {
  const b = m.ball, T = g.team, d = g.d;
  if (g.act === 'dive' || g.act === 'down' || g.act === 'stun' || g.cdCtl > 0) return false;
  const back = !!b.kicker && b.kicker.team === T && b.kicker !== g && m.passId === b.kickId;
  if (!inArea(g, g.x, g.z) || back) return touchBall(m, g);
  if (hyp(b.x - g.x, b.z - g.z) > 1.15 || b.y > 2.85) return false;
  const s = hyp(b.vx, b.vy, b.vz);
  if (s < 14 + d.gHan * 0.13) { if (b.kicker && b.kicker.team !== T) { m.stats[T.id].saves += b.shot ? 1 : 0; } hold(m, g); m.ev.push({ k: 'catch', p: g }); return true; }
  if (m.rnd() < 0.45 + (d.gRef - 80) / 50) {
    m.stats[T.id].saves++; m.ev.push({ k: 'save', p: g });
    b.last = g; b.passTo = null; b.shot = false; b.kickId++; g.gkShot = b.kickId; b.futAt = -1; g.cdCtl = 0.5;
    b.vx = T.dir * (4 + m.rnd() * 5); b.vz = (m.rnd() - 0.5) * 14; b.vy = 2 + m.rnd() * 3; return true;
  }
  return false;
}

/** Distribution from the hands or from a goal kick, following the build-up tactic and the keeper's feet. */
export function gkDistribute(m: Match, g: P, noOff = false, forceLong = false) {
  const T = g.team, tac = T.tac, b = m.ball; let best: P | null = null, bs = -9, short = false;
  g.act = 'none'; if (b.owner === g) { b.x = g.x + T.dir * 0.6; b.z = g.z; b.y = BR; }
  for (const t of T.ps) {
    if (!t.on || t === g) continue;
    const D = dist(g, t), sp = nearestOpp(m, t, T.id)[1]; let s = -9, sh = false;
    if ((t.grp === 'CB' || t.grp === 'FB' || t.grp === 'DM') && D < 34 && sp > 7 && !forceLong) { s = sp * 0.08 + [0.7, 0.35, -0.3, -0.4][tac.build] + lane(m, T.id, g.x, g.z, t.x, t.z, 14) * 0.05; sh = true; }
    else if ((t.grp === 'CM' || t.grp === 'AM') && D < 46 && sp > 6 && g.d.pasS > 84 && !forceLong) s = 0.3 + sp * 0.05 + (g.d.pasL - 85) / 40;
    else if (t.grp === 'ST' || t.grp === 'W') s = (t.d.air - 75) / 60 + sp * 0.04 + (tac.build >= 2 || forceLong ? 0.6 : 0.05);
    s += m.rnd() * 0.2; if (s > bs) { bs = s; best = t; short = sh; }
  }
  if (best) { const [lx, lz] = leadPt(g, best); doPass(m, g, best, lx, lz, short ? 'g' : 'l', false, 0.3, noOff); }
  else doPass(m, g, null, T.dir * 5, 0, 'l', false, 0.5, noOff);
}
