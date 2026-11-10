// Match engine: state machine, player movement, ball contacts, rules (offside, fouls, cards, advantage), set pieces and user control.
import { PlayerData, derive } from '../data/db';
import { GRP, Tactics, formation } from '../data/tactics';
import { BR, Ball, DT, Ev, GH, GW, HL, HW, InAct, Input, P, PA_D, PA_W, Team, angd, clamp, dist, hitFrame, hyp, mulberry, stepFree } from './base';
import { aerial, doPass, doShot, fat, kick, leadPt, nearestOpp, pickMate, pressure, startFeint, startTackle, tackleHit, touchBall } from './act';
import { aiPress, aiReceive, carrierThink, chasers, steer, teamThink } from './ai';
import { gkDistribute, gkTouch, gkUpdate } from './gk';

export interface TeamSetup { name: string; xi: PlayerData[]; bench: PlayerData[]; tac: Tactics; kit: number }
export interface MatchCfg { halfLen: number; dif: number; human: number; seed: number; difs?: number[] }
export interface Stats { shots: number; onT: number; pass: number; passOk: number; fouls: number; corners: number; offs: number; poss: number; yel: number; red: number; saves: number; tackles: number }
export interface SP { type: string; team: Team; taker: P; t: number; wait: number; indirect: boolean; aim: number; rz: number; ry: number; shoot: boolean; x: number; z: number }
const mkStats = (): Stats => ({ shots: 0, onT: 0, pass: 0, passOk: 0, fouls: 0, corners: 0, offs: 0, poss: 0, yel: 0, red: 0, saves: 0, tackles: 0 });
const SP_NAME: Record<string, string> = { throw: 'Rimessa laterale', corner: 'Calcio d’angolo', gk: 'Rinvio dal fondo', fk: 'Calcio di punizione', pen: 'Calcio di rigore' };

export class Match {
  t = 0; clock = 0; half = 1; state = 'kickoff'; stT = 0; frame = 0;
  teams: Team[]; ps: P[] = []; ball: Ball; score = [0, 0]; stats = [mkStats(), mkStats()]; ev: Ev[] = [];
  inp: Input = { mx: 0, mz: 0, sprint: false, press: false, contain: false, second: false, acts: [] };
  ctrl: P | null = null; att: Team; ctx = 'def'; lastCtx = ''; farT = 0;
  sp: SP | null = null; next: { type: string; team: Team; x: number; z: number; indirect: boolean } | null = null;
  pendFoul: { t: P; c: P; x: number; z: number; card: number; pen: boolean; at: number } | null = null;
  passId = -1; penId = -1; addedSec = 0; addedMin = 0; stoppage = 0; endWait = 0; koTeam = 0; koNext = 0; auto: boolean; staScale: number;
  scorers: { name: string; min: number; team: number }[] = []; rnd: () => number;

  constructor(a: TeamSetup, b: TeamSetup, public cfg: MatchCfg) {
    this.rnd = mulberry(cfg.seed); this.auto = cfg.human < 0; this.staScale = 240 / cfg.halfLen;
    this.teams = [a, b].map((s, id) => {
      const T: Team = { id, name: s.name, dir: id === 0 ? 1 : -1, ps: [], bench: s.bench.slice(), subs: 5, tac: s.tac, form: formation(s.tac.form), human: id === cfg.human,
        ai: cfg.difs ? cfg.difs[id] : id === cfg.human ? 3 : cfg.dif, quick: '', quickT: 0, lostT: 99, wonT: 99, second: false, kit: s.kit, presser: null, cover: null,
        chaser: null, chaseT: 9, cpx: 0, cpz: 0, offLine: 0, lead: 0, pend: [] };
      s.xi.forEach((pd, slot) => { const p = this.mkP(T, slot, pd); T.ps.push(p); this.ps.push(p); });
      return T;
    });
    this.ball = { x: 0, y: BR, z: 0, vx: 0, vy: 0, vz: 0, curve: 0, owner: null, last: null, passTo: null, kickId: 0, kickT: 0, shot: false, kicker: null, off: [], fut: [], futAt: -1, rx: 0, rz: 0, inNet: false, free: 0 };
    this.att = this.teams[0]; this.koTeam = this.rnd() < 0.5 ? 0 : 1; this.kickoff(this.koTeam);
  }
  mkP(T: Team, slot: number, pd: PlayerData): P {
    const role = formation(T.tac.form).slots[slot].r;
    return { i: this.ps.length, team: T, slot, role, grp: GRP[role], data: pd, d: derive(pd, role), on: true, ins: T.tac.instr[slot] ?? '', x: 0, z: 0, y: 0, vx: 0, vz: 0, face: 0,
      st: 100, load: 0, act: 'none', actT: 0, actDur: 1, actDir: 0, actKind: '', hit: false, mx: 0, mz: 0, spr: false, lockFace: null, jock: false, tx: 0, tz: 0, ax: 0, az: 0,
      job: 'zone', mark: null, runKind: 'hold', runT: this.rnd() * 2, think: 0.3, carryA: 0, carrySpr: false, passedT: -9, cdCtl: 0, cdTk: 0, cdFeint: 0, feintT: 0, feintKind: '',
      burst: 0, press: 0, yellow: 0, q: null, phase: this.rnd() * 6, touch: 0, idle: 0, gkShot: -1, gkTz: 0, gkTy: 0, gkAt: 0, gkGo: 0, gkOk: 0, gkHold: 0, gkRush: false,
      goals: 0, kickFoot: 1, fix: false, gotT: 0 };
  }
  gauss() { return Math.sqrt(-2 * Math.log(this.rnd() + 1e-9)) * Math.cos(6.2832 * this.rnd()); }
  other(T: Team) { return this.teams[1 - T.id]; }
  minute() { return Math.floor(Math.min(this.clock / this.cfg.halfLen, 1) * 45) + (this.half === 2 ? 45 : 0); }
  place(p: P, x: number, z: number) { p.x = clamp(x, -HL - 1, HL + 1); p.z = clamp(z, -HW - 1, HW + 1); p.vx = p.vz = 0; p.mx = p.mz = 0; }
  msg(txt: string) { this.ev.push({ k: 'msg', txt }); }

  // ---- tactics & substitutions (can be changed during the match) -------------------------------------------------------
  setTactics(tid: number, tac: Tactics) {
    const T = this.teams[tid]; T.tac = tac; T.form = formation(tac.form);
    for (const p of T.ps) { p.role = T.form.slots[p.slot].r; p.grp = GRP[p.role]; p.d = derive(p.data, p.role); p.ins = tac.instr[p.slot] ?? ''; }
  }
  quick(tid: number, id: string) { const T = this.teams[tid]; T.quick = id; T.quickT = 25; }
  /** Queue a substitution; it is carried out at the next stoppage (max 5, a replaced player cannot return). */
  sub(tid: number, slot: number, benchIdx: number): boolean {
    const T = this.teams[tid], p = T.ps[slot];
    if (T.subs - T.pend.length <= 0 || !p.on || !T.bench[benchIdx] || T.bench[benchIdx].gk !== p.data.gk) return false;
    T.pend.push({ slot, pd: T.bench.splice(benchIdx, 1)[0] });
    if (this.state !== 'play') this.applyPend();
    return true;
  }
  applyPend() {
    for (const T of this.teams) {
      for (const s of T.pend) { const p = T.ps[s.slot]; this.msg(`Sostituzione: ${s.pd.short} per ${p.data.short}`); p.data = s.pd; p.d = derive(s.pd, p.role); p.st = 100; p.load = 0; p.yellow = 0; p.goals = 0; T.subs--; this.stoppage += 0.3; this.ev.push({ k: 'sub', p }); }
      T.pend.length = 0;
    }
  }

  // ---- main loop ---------------------------------------------------------------------------------------------------
  step() {
    const dt = DT; this.t += dt; this.frame++;
    for (const T of this.teams) { T.lostT += dt; T.wonT += dt; if (T.quickT > 0) T.quickT -= dt; }
    switch (this.state) {
      case 'kickoff': this.stT -= dt; this.idle(dt);
        if (this.stT <= 0) { const b = this.ball, k = this.sp!.taker; b.owner = k; b.last = k; b.kicker = null; this.sp = null; this.state = 'play'; this.ev.push({ k: 'whistle' }); k.think = 0.4; }
        break;
      case 'play': this.play(dt); break;
      case 'dead': this.stT -= dt; this.idle(dt); if (this.stT <= 0) this.setupSP(); break;
      case 'setpiece': this.spStep(dt); break;
      case 'goal': this.stT -= dt; this.idle(dt); if (this.stT <= 0) this.kickoff(this.koNext); break;
      case 'half': if (this.auto) { this.stT -= dt; if (this.stT <= 0) this.secondHalf(); } break;
    }
    this.inp.acts.length = 0;
  }
  idle(dt: number) { for (const p of this.ps) if (p.on) { p.mx = p.mz = 0; p.lockFace = null; this.move(p, dt); } this.ballStep(dt); }

  play(dt: number) {
    const b = this.ball; this.clock += dt;
    if (!b.owner) { b.free += dt; if (this.frame % 6 === 0 || b.futAt !== b.kickId) { chasers(this); b.futAt = b.kickId; } }
    const prev = this.att;
    if (b.owner) this.att = b.owner.team; else if (b.passTo) this.att = b.passTo.team;
    else { const o = this.other(prev); if (o.chaseT < prev.chaseT - 0.25) this.att = o; }
    if (this.att !== prev) { prev.lostT = 0; this.att.wonT = 0; }
    this.stats[this.att.id].poss += dt;
    if (this.frame % 4 === 0) for (const p of this.ps) if (p.on) p.press = pressure(this, p);
    const k = this.frame % 6; if (k === 0) teamThink(this, this.teams[0], 0.1); else if (k === 3) teamThink(this, this.teams[1], 0.1);
    this.humanCtl(dt);
    for (const p of this.ps) {
      if (!p.on) continue;
      if (p.grp === 'GK') gkUpdate(this, p);
      if (p !== this.ctrl || this.auto) this.aiPlayer(p, dt);
      this.move(p, dt);
    }
    this.separate(); this.ballStep(dt); this.rules(dt);
  }
  aiPlayer(p: P, dt: number) {
    const b = this.ball; p.lockFace = null; p.jock = false;
    if (b.owner === p) {
      if (p.act === 'hold') return;
      p.think -= dt; if (p.think <= 0 && p.act === 'none') carrierThink(this, p);
      if (b.owner === p) { p.mx = Math.cos(p.carryA); p.mz = Math.sin(p.carryA); p.spr = p.carrySpr; }
      return;
    }
    if (p.grp === 'GK') { if (p.act === 'none') steer(p); return; }
    if (b.passTo === p && !b.owner) aiReceive(this, p);
    steer(p);
    const c = b.owner;
    if (c && c.team !== p.team && dist(p, c) < 3.2) {
      aiPress(this, p);
      if ((p.job === 'press' || p.job === 'press2') && hyp(c.vx, c.vz) < 5.5) { p.jock = true; p.lockFace = Math.atan2(b.z - p.z, b.x - p.x); }
    }
  }

  move(p: P, dt: number) {
    const d = p.d; p.cdCtl -= dt; p.cdTk -= dt; p.cdFeint -= dt; if (p.feintT > 0) p.feintT -= dt; if (p.burst > 0) p.burst -= dt;
    let ctl = true, spMul = 1;
    if (p.act !== 'none') {
      p.actT -= dt;
      if (p.act === 'tackle' || p.act === 'slide') { tackleHit(this, p); ctl = false; const f = 1 - (p.act === 'slide' ? 1.7 : 3.2) * dt; p.vx *= f; p.vz *= f; }
      else if (p.act === 'down' || p.act === 'stun' || p.act === 'cele') { ctl = false; const f = 1 - (p.act === 'stun' ? 3.5 : 7) * dt; p.vx *= f; p.vz *= f; }
      else if (p.act === 'dive') ctl = false;
      else if (p.act === 'throw') { ctl = false; p.vx = p.vz = 0; }
      else spMul = p.act === 'kick' ? 0.6 : p.act === 'jump' ? 0.5 : 0.45;
      if (p.actT <= 0) {
        const a = p.act, kd = p.actKind; p.act = 'none'; p.actKind = '';
        if (a === 'slide') { p.act = 'down'; p.actT = p.actDur = 0.55; p.actKind = 'slide'; }
        else if (a === 'dive' && kd !== 'catch') { p.act = 'down'; p.actT = p.actDur = 0.5; p.actKind = 'dive'; }
      }
    }
    const hasBall = this.ball.owner === p;
    if (ctl) {
      const fa = 0.84 + 0.16 * fat(p); let top = d.spd * fa;
      if (hasBall) {
        top *= 0.9 + clamp((d.ctl - 70) / 400, 0, 0.075);
        if (p.press > 0.75) { const [o, od] = nearestOpp(this, p, p.team.id); if (o && od < 1.1) top *= 1 - clamp((o.d.str - d.str + 18) / 50, 0, 0.6) * 0.2 * (1 - 0.5 * Math.min(1, d.shield)); }
      } else if (d.rec > 0 && p.job === 'press') top *= 1 + 0.05 * Math.min(1, d.rec);
      const mag = Math.min(1, hyp(p.mx, p.mz)), mm = hyp(p.mx, p.mz) || 1;
      const maxSp = top * (p.spr && p.st > 2 ? 1 : 0.7) * spMul * (p.jock ? 0.66 : 1) * mag, wx = p.mx / mm * maxSp, wz = p.mz / mm * maxSp;
      let acc = d.acc * fa * (hasBall ? 0.86 + clamp((d.ctl - 70) / 300, 0, 0.12) : 1) * (p.burst > 0 ? 1.35 : 1);
      const dvx = wx - p.vx, dvz = wz - p.vz, dv = hyp(dvx, dvz);
      if (dv > 1e-4) {
        const sp = hyp(p.vx, p.vz);
        if (sp > 1 && p.vx * wx + p.vz * wz < sp * hyp(wx, wz) * 0.7) acc *= 0.75 + clamp(d.agi, 40, 115) / 100 * 0.95; // turning & braking: agility
        const s = Math.min(dv, acc * dt); p.vx += dvx / dv * s; p.vz += dvz / dv * s;
      }
    }
    p.x = clamp(p.x + p.vx * dt, -HL - 3, HL + 3); p.z = clamp(p.z + p.vz * dt, -HW - 3, HW + 3);
    const sp = hyp(p.vx, p.vz), b = this.ball;
    if (p.act !== 'tackle' && p.act !== 'slide' && p.act !== 'down' && p.act !== 'dive') {
      const ft = p.lockFace ?? (sp > 0.7 ? Math.atan2(p.vz, p.vx) : p.act === 'throw' || this.sp?.taker === p ? null : Math.atan2(b.z - p.z, b.x - p.x));
      if (ft != null) { const r = (7 + d.agi / 14) * dt; p.face += clamp(angd(ft, p.face), -r, r); }
    }
    if (this.state === 'play') {
      if (sp > d.spd * 0.76) { const dr = 2.3 * d.sta * (sp / d.spd) ** 2 * this.staScale * dt * (p.job === 'press' || p.job === 'press2' ? 1.15 : 1) * (p.team.tac.tempo === 2 ? 1.08 : 1); p.st = Math.max(0, p.st - dr); p.load += dr; }
      else { const cap = 100 - Math.min(42, p.load * 0.11); if (p.st < cap) p.st = Math.min(cap, p.st + (sp < 2.5 ? 2.4 : sp < d.spd * 0.55 ? 1.1 : 0.2) * (1.6 - d.sta * 0.8) * this.staScale * dt); }
    }
    p.phase += sp * dt;
  }
  separate() {
    const ps = this.ps;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j]; if (!a.on || !c.on || a.act === 'down' || c.act === 'down') continue;
      const dx = a.x - c.x, dz = a.z - c.z, d = hyp(dx, dz);
      if (d < 0.62 && d > 1e-3) { const f = (0.62 - d) / d * 0.5, wa = c.d.str / (a.d.str + c.d.str) * 2; a.x += dx * f * wa; a.z += dz * f * wa; c.x -= dx * f * (2 - wa); c.z -= dz * f * (2 - wa); }
    }
  }

  ballStep(dt: number) {
    const b = this.ball, p = b.owner;
    if (p) {
      if (p.act === 'hold') { b.x = p.x + Math.cos(p.face) * 0.3; b.z = p.z + Math.sin(p.face) * 0.3; b.y = 1.15; }
      else if (p.act === 'throw') { b.x = p.x; b.z = p.z; b.y = 2.05; }
      else {
        const sp = hyp(p.vx, p.vz), fr = sp / p.d.spd; p.touch += dt * (2.2 + sp * 0.55);
        const ds = 0.5 + fr * (0.75 - Math.min(1, p.d.tight) * 0.25 - clamp((p.d.ctl - 70) / 100, 0, 0.35))
          + (p.spr && fr > 0.75 ? (0.5 + 0.5 * Math.sin(p.touch)) * 0.55 * clamp(1.15 - p.d.ctl / 100 - Math.min(1, p.d.tight) * 0.15, 0.05, 1) : 0);
        const k = Math.min(1, dt * (10 + p.d.ctl * 0.12));
        b.x += (p.x + Math.cos(p.face) * ds - b.x) * k; b.z += (p.z + Math.sin(p.face) * ds - b.z) * k; b.y = BR;
      }
      b.rx += p.vx * dt; b.rz += p.vz * dt; b.vx = p.vx; b.vz = p.vz; b.vy = 0; return;
    }
    const sp = hyp(b.vx, b.vy, b.vz), n = Math.max(1, Math.ceil(sp * dt / 0.14));
    for (let i = 0; i < n; i++) {
      const ox = b.x, oz = b.z; stepFree(b, dt / n); b.rx += b.x - ox; b.rz += b.z - oz;
      if (hitFrame(b)) { this.ev.push({ k: 'post' }); b.kickId++; b.futAt = -1; b.shot = false; }
    }
    if (Math.abs(b.x) > HL && Math.abs(b.z) < GW + 0.15 && b.y < GH + 0.15) { // inside the goal: the net catches the ball
      const sx = Math.sign(b.x);
      if (Math.abs(b.x) > HL + 1.9) { b.x = sx * (HL + 1.9); if (Math.abs(b.vx) > 2) this.ev.push({ k: 'net', v: b.z, team: sx }); b.vx *= -0.12; b.vz *= 0.4; }
      if (Math.abs(b.z) > GW - 0.1) { b.z = Math.sign(b.z) * (GW - 0.1); b.vz *= -0.2; }
      if (b.y > GH - 0.1) { b.y = GH - 0.1; b.vy *= -0.2; }
    }
    if (this.state !== 'play') return;
    let near: P[] | null = null;
    for (const q of this.ps) if (q.on && hyp(b.x - q.x, b.z - q.z) < 1.35) (near ??= []).push(q);
    if (!near) return;
    if (b.y > 1.25) {
      for (const g of near) if (g.grp === 'GK' && gkTouch(this, g)) return;
      if (b.y < 3) aerial(this, near);
    } else {
      near.sort((a, c) => hyp(b.x - a.x, b.z - a.z) - (b.passTo === a ? 0.3 : 0) - hyp(b.x - c.x, b.z - c.z) + (b.passTo === c ? 0.3 : 0));
      for (const q of near) if (q.grp === 'GK' ? gkTouch(this, q) : touchBall(this, q)) break;
    }
  }

  // ---- possession hooks called by the action code ----------------------------------------------------------------------
  gained(p: P) { p.gotT = this.t; const O = this.other(p.team); if (this.att !== p.team) { O.lostT = 0; p.team.wonT = 0; this.att = p.team; } p.think = Math.min(p.think, 0.25); }
  offsideCheck(p: P): boolean {
    const b = this.ball;
    if (this.state !== 'play' || !b.off.includes(p) || !b.kicker || b.kicker.team !== p.team) return true;
    this.stats[p.team.id].offs++; this.ev.push({ k: 'offside', p });
    this.award('fk', this.other(p.team), p.x, p.z, true, 'Fuorigioco');
    return false;
  }
  firstTime(p: P) {
    const q = p.q!, b = this.ball; p.q = null;
    if (!this.offsideCheck(p)) return;
    if (b.kicker && b.kicker.team === p.team && b.kicker !== p && this.passId === b.kickId) this.stats[p.team.id].passOk++;
    if (q.type === 'shoot') doShot(this, p, { power: q.power, aimZ: q.aimZ ?? null, mod: q.mod, ft: true });
    else this.execPass(p, q.type, q.power, q.ax, q.az, true, q.target ?? null);
  }
  header(p: P) {
    const b = this.ball, T = p.team, dir = T.dir, nx = p.x * dir, gd = hyp(HL - nx, p.z), mine = !!b.kicker && b.kicker.team === T;
    if (mine && this.passId === b.kickId) this.stats[T.id].passOk++;
    if (p.q && this.t - p.q.t < 1.6) { const q = p.q; p.q = null; if (q.type === 'shoot') return doShot(this, p, { power: 0.6 + q.power * 0.4, aimZ: q.aimZ ?? null, mod: '' }); }
    if (mine && gd < 16 && nx > 0) return doShot(this, p, { power: 0.75, aimZ: null, mod: '' });
    if (nx < -HL + 30 && !mine) { // defensive clearance
      const a = Math.atan2((p.z >= 0 ? 1 : -1) * 0.6, dir), v = 9 + this.rnd() * 4 + p.d.hdr / 30;
      b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; b.vy = 5 + this.rnd() * 2; b.curve = 0; return kick(this, p, 'header');
    }
    const od = nearestOpp(this, p, T.id)[1];
    if (od > 2.5 && b.y < 2) { b.owner = p; b.last = p; b.passTo = null; b.shot = false; b.off.length = 0; b.y = BR; this.gained(p); return; }
    let best: P | null = null, bs = -9;
    for (const t of T.ps) { if (!t.on || t === p || t.grp === 'GK') continue; const D = dist(p, t); if (D > 18 || D < 3) continue; const s = nearestOpp(this, t, T.id)[1] + (t.x - p.x) * dir * 0.2; if (s > bs) { bs = s; best = t; } }
    const tx = best ? best.x : p.x + dir * 8, tz = best ? best.z : p.z, a = Math.atan2(tz - b.z, tx - b.x) + this.gauss() * (0.5 - p.d.hdr / 250), v = 7 + hyp(tx - b.x, tz - b.z) * 0.35;
    b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; b.vy = 2.5; b.curve = 0; this.passId = b.kickId + 1; this.stats[T.id].pass++; kick(this, p, 'header', false, best);
  }
  execPass(p: P, type: string, power: number, ax: number, az: number, ft: boolean, target: P | null = null) {
    const dir = p.team.dir, long = power > 0.55;
    if (type === 'cross') {
      if (p.x * dir > 20 && Math.abs(p.z) > 9) { // cross into the box
        let tg: P | null = null, ts = -1e9;
        for (const t of p.team.ps) if (t.on && t !== p && t.x * dir > HL - 20 && Math.abs(t.z) < 14) { const s = t.d.air - Math.abs(angd(Math.atan2(t.z - p.z, t.x - p.x), Math.atan2(az, ax))) * 25; if (s > ts) { ts = s; tg = t; } }
        if (tg) return doPass(this, p, tg, tg.x + tg.vx * 0.5 + dir * 1.5, tg.z + tg.vz * 0.5, 'c', ft, power);
        return doPass(this, p, null, dir * (HL - 9), -Math.sign(p.z) * (power * 8 - 2), 'c', ft, power);
      }
      const t = target ?? pickMate(this, p, ax, az, true);
      if (t) { const [lx, lz] = leadPt(p, t); return doPass(this, p, t, lx, lz, 'l', ft, power); }
      return doPass(this, p, null, clamp(p.x + ax * (20 + power * 25), -HL + 3, HL - 3), clamp(p.z + az * (20 + power * 25), -HW + 3, HW - 3), 'l', ft, power);
    }
    if (type === 'through') {
      const t = target ?? pickMate(this, p, ax, az, true, true);
      if (t) {
        const L = 6 + power * 9 + (t.runKind === 'run' ? 3 : 0), far = power > 0.6 || dist(p, t) > 30;
        return doPass(this, p, t, clamp(t.x + t.vx * 0.9 + dir * L, -HL + 4, HL - 6), clamp(t.z + t.vz * 0.9 + az * 2, -HW + 2, HW - 2), far ? 'tl' : 'tg', ft, power);
      }
    }
    const t = target ?? pickMate(this, p, ax, az, long);
    if (t) { const [lx, lz] = leadPt(p, t); return doPass(this, p, t, lx, lz, long && dist(p, t) > 22 ? 'l' : 'g', ft, power); }
    doPass(this, p, null, clamp(p.x + ax * (10 + power * 22), -HL + 2, HL - 2), clamp(p.z + az * (10 + power * 22), -HW + 2, HW - 2), long ? 'l' : 'g', ft, power);
  }

  // ---- rules -----------------------------------------------------------------------------------------------------------
  foul(t: P, c: P, sev: number) {
    if (this.state !== 'play' || this.pendFoul) return;
    const b = this.ball, dir = c.team.dir, nx = c.x * dir; this.stats[t.team.id].fouls++;
    c.act = 'down'; c.actT = c.actDur = 1.3; c.actKind = 'fouled'; c.q = null; t.act = 'stun'; t.actT = t.actDur = 0.5; t.actKind = '';
    if (b.owner === c) { b.owner = null; b.vx = c.vx * 0.7 + (this.rnd() - 0.5) * 2; b.vz = c.vz * 0.7 + (this.rnd() - 0.5) * 2; b.free = 0; b.kickId++; b.futAt = -1; c.cdCtl = 1; t.cdCtl = 0.6; }
    let last = true; for (const o of t.team.ps) if (o.on && o !== t && o.grp !== 'GK' && o.x * dir > nx + 1) last = false;
    const dogso = last && nx > HL - 32, pen = nx > HL - PA_D && Math.abs(c.z) < PA_W;
    let card = sev > 2.7 || dogso && sev > 1.3 ? 2 : sev > 1.6 || dogso || nx > 15 && this.rnd() < 0.3 ? 1 : 0;
    if (t.grp === 'GK') card = Math.min(card, t.yellow ? 0 : 1);
    this.pendFoul = { t, c, x: c.x, z: c.z, card, pen, at: this.t };
  }
  handball(p: P) { this.msg('Fallo di mano'); this.stats[p.team.id].fouls++; const T = this.other(p.team), pen = p.x * T.dir > HL - PA_D && Math.abs(p.z) < PA_W; this.award(pen ? 'pen' : 'fk', T, p.x, p.z, false); }
  card(p: P, n: number) {
    if (!n) return; const s = this.stats[p.team.id]; this.stoppage += 0.3;
    if (n === 1 && ++p.yellow < 2) { s.yel++; this.ev.push({ k: 'card', p, v: 1 }); this.msg(`Ammonito ${p.data.short}`); return; }
    s.red++; p.on = false; p.x = 0; p.z = -200; this.ev.push({ k: 'card', p, v: 2 }); this.msg(`Espulso ${p.data.short}`);
    if (this.ctrl === p) this.ctrl = null; if (this.ball.owner === p) this.ball.owner = null;
  }
  award(type: string, team: Team, x: number, z: number, indirect = false, msg = '', delay = 1.1) {
    if (this.state !== 'play') return;
    this.state = 'dead'; this.stT = delay; this.next = { type, team, x, z, indirect }; this.pendFoul = null; this.ball.owner = null; this.ball.passTo = null;
    this.ev.push({ k: 'whistle' }); this.msg(msg || SP_NAME[type]); if (type === 'corner') this.stats[team.id].corners++;
  }
  goal(T: Team) {
    const b = this.ball; this.score[T.id]++; this.state = 'goal'; this.stT = 3.6; this.pendFoul = null; this.stoppage += 0.5;
    const s = b.kicker && b.kicker.team === T ? b.kicker : b.last && b.last.team === T ? b.last : null;
    this.scorers.push({ name: s ? s.data.short : 'Autogol', min: this.minute() + 1, team: T.id });
    for (const p of T.ps) if (p.on && p.act !== 'hold') { p.act = 'cele'; p.actT = p.actDur = 3.2; p.actKind = p === s ? 'scorer' : ''; }
    if (s) s.goals++;
    this.ev.push({ k: 'goal', team: T.id, p: s ?? undefined, txt: s ? s.data.short : 'Autogol' }); this.koNext = 1 - T.id; b.owner = null;
  }
  rules(dt: number) {
    const b = this.ball, f = this.pendFoul;
    if (Math.abs(b.x) > HL + BR) {
      const side = Math.sign(b.x), defT = this.teams.find(T => T.dir === -side)!, atkT = this.other(defT);
      if (Math.abs(b.z) < GW && b.y < GH) { if (f) this.card(f.t, f.card); return this.goal(atkT); }
      if (b.last && b.last.team === defT) this.award('corner', atkT, side * HL, b.z); else this.award('gk', defT, 0, b.z);
      return;
    }
    if (Math.abs(b.z) > HW + BR) { this.award('throw', b.last ? this.other(b.last.team) : this.teams[0], b.x, b.z); return; }
    if (f && this.t - f.at > (f.pen ? 0.35 : 0.8)) { // advantage: play on if the fouled side kept the ball going forward
      const o = b.owner, dir = f.c.team.dir;
      if (!f.pen && o && o.team === f.c.team && o !== f.c && (o.x - f.x) * dir > -4) { this.pendFoul = null; this.msg('Vantaggio'); this.card(f.t, f.card); }
      else { this.pendFoul = null; this.award(f.pen ? 'pen' : 'fk', f.c.team, f.x, f.z, false, f.pen ? 'Calcio di rigore!' : 'Fallo', f.card ? 1.9 : 1.2); this.card(f.t, f.card); }
      return;
    }
    const H = this.cfg.halfLen;
    if (this.clock >= H && !this.addedMin) { this.addedMin = clamp(Math.round(1 + this.stoppage), 1, 5); this.addedSec = this.addedMin / 45 * H; this.msg(`Recupero: +${this.addedMin}'`); }
    if (this.clock >= H + this.addedSec) { this.endWait += dt; if (Math.abs(b.x) < HL - 30 || this.endWait > 6) this.endHalf(); }
  }
  endHalf() {
    this.ev.push({ k: 'whistle' }); this.pendFoul = null;
    if (this.half === 1) { this.state = 'half'; this.stT = 1; this.ev.push({ k: 'half' }); } else { this.state = 'full'; this.ev.push({ k: 'full' }); }
  }
  secondHalf() {
    this.half = 2; this.clock = 0; this.addedMin = 0; this.addedSec = 0; this.endWait = 0; this.stoppage = 0;
    for (const T of this.teams) T.dir = -T.dir;
    for (const p of this.ps) p.st = Math.min(100 - Math.min(42, p.load * 0.11), p.st + 25);
    this.kickoff(1 - this.koTeam);
  }

  // ---- restarts --------------------------------------------------------------------------------------------------------
  resetAll(x: number, z: number, T: Team) {
    const b = this.ball; this.applyPend();
    Object.assign(b, { x, y: BR, z, vx: 0, vy: 0, vz: 0, curve: 0, owner: null, passTo: null, shot: false, last: null, kicker: null, free: 0 }); b.off.length = 0; b.kickId++; b.futAt = -1;
    this.att = T; this.pendFoul = null;
    for (const TT of this.teams) { TT.cpx = x; TT.cpz = z; TT.chaser = null; TT.presser = null; TT.cover = null; TT.chaseT = 9; }
    for (const p of this.ps) { p.fix = false; p.act = 'none'; p.actKind = ''; p.q = null; p.runKind = 'hold'; p.runT = 0.5 + this.rnd(); p.feintT = 0; p.lockFace = null; p.jock = false; p.y = 0; }
    teamThink(this, T, 0.1); teamThink(this, this.other(T), 0.1);
  }
  kickoff(tid: number) {
    const T = this.teams[tid]; this.resetAll(0, 0, T);
    for (const p of this.ps) {
      if (!p.on) continue; const dir = p.team.dir;
      if (p.grp === 'GK') { this.place(p, -dir * (HL - 2), 0); p.face = dir > 0 ? 0 : Math.PI; continue; }
      let nx = clamp(p.ax, -HL + 5, -1.5); const nz = p.az; if (p.team !== T && hyp(nx, nz) < 10.5) nx = -10.5;
      this.place(p, nx * dir, nz * dir); p.face = dir > 0 ? 0 : Math.PI;
    }
    const fw = T.ps.filter(p => p.on && p.grp !== 'GK').sort((a, c) => T.form.slots[c.slot].x - T.form.slots[a.slot].x);
    this.place(fw[0], -0.5 * T.dir, 0.2); if (fw[1]) this.place(fw[1], -1.2 * T.dir, 4.5);
    this.sp = { type: 'ko', team: T, taker: fw[0], t: 0, wait: 0, indirect: false, aim: 0, rz: 0, ry: 0, shoot: false, x: 0, z: 0 };
    this.state = 'kickoff'; this.stT = 1.6; if (!this.auto) this.ctrl = T.human ? fw[0] : this.bestDef(null);
  }
  setupSP() {
    const n = this.next!, T = n.team, O = this.other(T), dir = T.dir, type = n.type; this.next = null;
    let x = n.x, z = n.z;
    if (type === 'throw') { x = clamp(x, -HL + 1, HL - 1); z = Math.sign(z) * HW; }
    else if (type === 'corner') { x = Math.sign(x) * (HL - 0.5); z = Math.sign(z || 1) * (HW - 0.5); }
    else if (type === 'gk') { x = -dir * (HL - 5.5); z = Math.sign(z || 1) * 5; }
    else if (type === 'pen') { x = dir * (HL - 11); z = 0; }
    else { x = clamp(x, -HL + 1, HL - 1); z = clamp(z, -HW + 1, HW - 1); }
    this.resetAll(x, z, T);
    for (const p of this.ps) if (p.on) { if (p.grp === 'GK') this.place(p, -p.team.dir * (HL - 1.2), 0); else this.place(p, p.tx, p.tz); }
    const gd = hyp(dir * HL - x, z), shootFk = type === 'fk' && !n.indirect && gd < 33 && gd > 17;
    const of = T.ps.filter(p => p.on && p.grp !== 'GK'), by = (f: (p: P) => number) => of.reduce((a, c) => (f(c) > f(a) ? c : a));
    const here = { x, z }; let taker: P;
    if ((type === 'gk' || type === 'fk' && x * dir < -HL + 18) && T.ps[0].on) taker = T.ps[0];
    else if (type === 'pen') taker = by(p => p.d.shoF + p.d.fk * 0.5);
    else if (type === 'corner') taker = by(p => p.d.crs - (p.grp === 'CB' ? 30 : 0) - p.d.air * 0.3);
    else if (shootFk) taker = by(p => p.d.fk);
    else if (type === 'fk' && x * dir > 10) taker = by(p => p.d.crs * 0.5 + p.d.pasL * 0.5 - dist(p, here) * 0.4);
    else taker = by(p => -dist(p, here) - (p.grp === 'CB' && type === 'throw' ? 15 : 0));
    const aim = type === 'gk' ? (dir > 0 ? 0 : Math.PI) : type === 'throw' ? Math.atan2(-z, dir * 6) : Math.atan2(-z * 0.9, dir * (HL - 11) - x);
    if (type === 'throw') {
      this.place(taker, x, z - Math.sign(z) * 0.2); taker.act = 'throw'; taker.actT = 99; this.ball.owner = taker;
      of.filter(p => p !== taker).sort((a, c) => dist(a, here) - dist(c, here)).slice(0, 2).forEach((p, i) => { this.place(p, clamp(x + (i ? -8 : 8) * dir, -HL + 2, HL - 2), z - Math.sign(z) * (6 + i * 3)); p.fix = true; });
    } else if (type === 'corner') {
      this.place(taker, x + Math.sign(x) * 0.5, z + Math.sign(z) * 0.5);
      const s = Math.sign(z) * dir, spots = [[HL - 7.5, -s * 0.5], [HL - 6.5, -s * 5], [HL - 5, s * 3.5], [HL - 11, -s * 1.5], [HL - 17.5, s * 3], [HL - 8, s * 23]];
      const up = of.filter(p => p !== taker).sort((a, c) => c.d.air - a.d.air).slice(0, 6);
      up.forEach((p, i) => { this.place(p, spots[i][0] * dir, spots[i][1] * dir); p.fix = true; });
      const df = O.ps.filter(p => p.on && p.grp !== 'GK').sort((a, c) => c.d.air + c.d.mrk - a.d.air - a.d.mrk);
      df.slice(0, 5).forEach((o, i) => { this.place(o, up[i].x + dir * 1.1, up[i].z * 0.93); o.fix = true; });
      if (df[5]) { this.place(df[5], dir * (HL - 0.8), Math.sign(z) * 3.3); df[5].fix = true; }
    } else if (type === 'pen') {
      this.place(taker, x - dir * 2.6, 0); taker.fix = true;
      let k = 0;
      for (const p of this.ps) { if (!p.on || p === taker) continue; if (p.grp === 'GK') { p.fix = true; if (p.team === O) this.place(p, dir * (HL - 0.3), 0); continue; }
        const side = k % 2 ? 1 : -1, row = Math.floor(k / 2); this.place(p, dir * (HL - PA_D - 2 - (row % 3) * 1.6), side * (10.5 + (row % 5) * 2.2)); p.fix = true; k++; }
    } else if (type === 'gk') {
      this.place(taker, x - dir * 0.9, z);
      for (const o of O.ps) if (o.on && o.x * dir < -HL + PA_D + 3 && Math.abs(o.z) < PA_W + 2) this.place(o, -dir * (HL - PA_D - 4), o.z);
    } else {
      this.place(taker, x - Math.cos(aim) * 1.6, z - Math.sin(aim) * 1.6);
      if (shootFk || !n.indirect && gd < 34 && gd > 17) { // defensive wall
        const gz = clamp(z, -1.2, 1.2), L = hyp(dir * HL - x, gz - z), ux = (dir * HL - x) / L, uz = (gz - z) / L, wx = x + ux * 9.15, wz = z + uz * 9.15, nW = gd > 26 ? 3 : 4;
        O.ps.filter(p => p.on && p.grp !== 'GK').sort((a, c) => hyp(a.x - wx, a.z - wz) - hyp(c.x - wx, c.z - wz)).slice(0, nW)
          .forEach((o, i) => { const off = (i - (nW - 1) / 2) * 0.72; this.place(o, wx - uz * off, wz + ux * off); o.fix = true; });
      }
    }
    const R = type === 'throw' ? 2.5 : 9.15;
    for (const o of O.ps) if (o.on && !o.fix && o.grp !== 'GK') { const d = dist(o, here); if (d < R + 0.3) this.place(o, clamp(x - dir * (R + 0.6), -HL + 1, HL - 1), clamp(o.z + (o.z > z ? 2 : -2), -HW + 1, HW - 1)); }
    for (const p of this.ps) if (p.on) p.face = Math.atan2(z - p.z, x - p.x);
    taker.face = aim;
    this.sp = { type, team: T, taker, t: 0, wait: 1.5 + this.rnd() * 1.2, indirect: n.indirect, aim, rz: 0, ry: 1.1, shoot: type === 'pen' || shootFk, x, z };
    this.state = 'setpiece'; this.ev.push({ k: 'sp', txt: type });
    if (!this.auto) this.ctrl = T.human ? taker : this.bestDef(null);
  }
  spStep(dt: number) {
    const sp = this.sp!, b = this.ball, T = sp.team; sp.t += dt;
    const k = this.frame % 6; if (k === 0) teamThink(this, this.teams[0], 0.1); else if (k === 3) teamThink(this, this.teams[1], 0.1);
    const R = sp.type === 'throw' ? 2.5 : 9.15;
    for (const p of this.ps) {
      if (!p.on) continue; p.lockFace = null; p.jock = false;
      if (p === sp.taker || p.fix || p.grp === 'GK') { p.mx = p.mz = 0; p.vx = p.vz = 0; if (p === sp.taker) p.face += clamp(angd(sp.aim, p.face), -0.1, 0.1); }
      else { steer(p); p.spr = false; p.mx *= 0.65; p.mz *= 0.65; }
      this.move(p, dt);
      if (p.team !== T && !p.fix && p.grp !== 'GK') { const d = hyp(p.x - sp.x, p.z - sp.z); if (d < R && d > 0.01) { p.x = sp.x + (p.x - sp.x) / d * R; p.z = sp.z + (p.z - sp.z) / d * R; } }
    }
    if (sp.type === 'throw') this.ballStep(dt); else { b.x = sp.x; b.z = sp.z; b.y = BR; b.vx = b.vy = b.vz = 0; }
    const human = T.human && !this.auto;
    if (human && sp.t < 14) { if (sp.t > 0.5) this.humanSP(dt); } else if (sp.t > (human ? 14 : sp.wait)) this.aiSP();
  }
  release() {
    const sp = this.sp!; if (sp.type === 'pen') this.penId = this.ball.kickId;
    for (const p of this.ps) p.fix = false; sp.taker.cdCtl = 0.9; this.sp = null; this.state = 'play'; this.lastCtx = '';
    if (sp.shoot) for (const p of this.other(sp.team).ps) if (p.on && p.grp !== 'GK' && dist(p, sp) < 10 && this.rnd() < 0.6) { p.act = 'jump'; p.actT = p.actDur = 0.5; }
  }
  aiSP() {
    const sp = this.sp!, p = sp.taker, T = sp.team, dir = T.dir, noOff = sp.type !== 'fk' && sp.type !== 'pen', gk = this.other(T).ps[0];
    const boxTgt = () => { let tg: P | null = null, ts = -1e9; for (const t of T.ps) if (t.on && t !== p && t.x * dir > HL - 19 && Math.abs(t.z) < 13) { const s = t.d.air + this.rnd() * 25; if (s > ts) { ts = s; tg = t; } } return tg; };
    const open = (maxD: number) => { let tg: P | null = null, ts = -1e9; for (const t of T.ps) { if (!t.on || t === p) continue; const D = dist(p, t); if (D > maxD || D < 3) continue; const s = nearestOpp(this, t, T.id)[1] * 2 - D * 0.3 + (t.x - p.x) * dir * 0.25; if (s > ts) { ts = s; tg = t; } } return tg; };
    if (sp.type === 'pen') doShot(this, p, { power: 0.6 + this.rnd() * 0.2, aimZ: (this.rnd() < 0.5 ? -1 : 1) * (0.55 + this.rnd() * 0.33), mod: '', ty: this.rnd() < 0.6 ? 0.3 + this.rnd() * 0.5 : 1.4 + this.rnd() * 0.6 });
    else if (sp.type === 'gk') gkDistribute(this, p, true);
    else if (sp.shoot) doShot(this, p, { power: 0.72, aimZ: (gk.z > 0 ? -1 : 1) * (0.7 + this.rnd() * 0.2), mod: '', ty: 1.6 + this.rnd() * 0.6, fk: true, curve: (sp.z * dir > 0 ? -1 : 1) * (p.data.look.foot === 'L' ? -1 : 1) > 0 ? 1 : -1 });
    else {
      const bt = sp.type === 'corner' || sp.type === 'fk' && sp.x * dir > 12 ? boxTgt() : null;
      if (bt && (sp.type !== 'corner' || this.rnd() < 0.85)) doPass(this, p, bt, bt.x + dir * 0.8, bt.z, 'c', false, 0.5, noOff);
      else { const t = open(sp.type === 'throw' ? 18 : 30); if (t) { const [lx, lz] = leadPt(p, t); doPass(this, p, t, lx, lz, sp.type === 'throw' && dist(p, t) > 12 ? 'l' : 'g', false, 0.35, noOff); } else doPass(this, p, null, p.x + dir * 20, p.z * 0.5, 'l', false, 0.5, noOff); }
    }
    this.release();
  }
  humanSP(dt: number) {
    const sp = this.sp!, p = sp.taker, inp = this.inp, T = sp.team, dir = T.dir, mag = hyp(inp.mx, inp.mz), noOff = sp.type !== 'fk' && sp.type !== 'pen';
    if (sp.shoot) { sp.rz = clamp(sp.rz + inp.mz * 5 * dt, -GW - 1, GW + 1); sp.ry = clamp(sp.ry + inp.mx * dir * 2.6 * dt, 0.2, GH + 0.5); sp.aim = Math.atan2(sp.rz - sp.z, dir * HL - sp.x); }
    else if (mag > 0.3) sp.aim = Math.atan2(inp.mz, inp.mx);
    const ax = Math.cos(sp.aim), az = Math.sin(sp.aim);
    for (const a of inp.acts) {
      if (sp.shoot && a.type === 'shoot') {
        if (sp.type === 'pen') doShot(this, p, { power: 0.35 + a.power * 0.6, aimZ: sp.rz / (GW - 0.3), mod: '', ty: sp.ry });
        else doShot(this, p, { power: 0.5 + a.power * 0.45, aimZ: sp.rz / (GW - 0.3), mod: '', ty: sp.ry, fk: true, curve: a.curve || (sp.rz > sp.z ? 1 : -1) * 0.6 });
        return this.release();
      }
      if (sp.type === 'pen') continue;
      if (sp.type === 'gk' && a.type !== 'pass') { gkDistribute(this, p, true, true); return this.release(); }
      if (a.type === 'pass') {
        const t = pickMate(this, p, ax, az, false) ?? pickMate(this, p, ax, az, true); if (!t) continue;
        const [lx, lz] = leadPt(p, t); doPass(this, p, t, lx, lz, sp.type === 'throw' && dist(p, t) > 12 ? 'l' : 'g', false, 0.4, noOff); return this.release();
      }
      if (a.type === 'cross' || a.type === 'through' || a.type === 'shoot') {
        if (sp.type === 'fk' && a.type === 'shoot') { doShot(this, p, { power: a.power, aimZ: null, mod: '', fk: true, curve: a.curve }); return this.release(); }
        const D = sp.type === 'throw' ? 10 + a.power * 14 : 16 + a.power * 34; let tx = sp.x + ax * D, tz = sp.z + az * D, tg: P | null = null, td = 7;
        for (const t of T.ps) if (t.on && t !== p) { const d = hyp(t.x - tx, t.z - tz); if (d < td) { td = d; tg = t; } }
        if (tg && td < 4.5) { tx = tg.x; tz = tg.z; }
        const box = tx * dir > HL - 20 && Math.abs(tz) < 16;
        doPass(this, p, tg, clamp(tx, -HL + 1, HL - 1), clamp(tz, -HW + 1, HW - 1), box ? 'c' : 'l', false, a.type === 'shoot' ? 1 : a.power, noOff); return this.release();
      }
    }
  }

  // ---- user control (Option B: ball carrier in attack, one selected defender in defence) -----------------------------
  bestDef(excl: P | null): P | null {
    const T = this.teams[this.cfg.human], b = this.ball, c = b.owner && b.owner.team !== T ? b.owner : null, O = this.other(T);
    const fx = c ? c.x + c.vx * 0.3 : b.passTo ? O.cpx : b.x, fz = c ? c.z + c.vz * 0.3 : b.passTo ? O.cpz : b.z; let best: P | null = null, bs = 1e9;
    for (const p of T.ps) { if (!p.on || p.grp === 'GK' || p === excl) continue; const s = hyp(p.x - fx, p.z - fz) + ((p.x - fx) * T.dir < 1.5 ? 0 : 6) + (p.act === 'down' ? 8 : 0); if (s < bs) { bs = s; best = p; } }
    return best;
  }
  humanCtl(dt: number) {
    if (this.auto) return;
    const T = this.teams[this.cfg.human], b = this.ball, inp = this.inp, dir = T.dir, att = this.att === T; this.ctx = att ? 'att' : 'def';
    let c = this.ctrl;
    if (b.owner && b.owner.team === T) c = b.owner;
    else if (!b.owner && b.passTo && b.passTo.team === T) c = b.passTo;
    else if (!b.owner && att && T.chaser) c = T.chaser;
    else if (!att) {
      this.farT = c && dist(c, b) > 30 ? this.farT + dt : 0;
      if (!c || !c.on || c.grp === 'GK' || c.team !== T || this.lastCtx !== 'def' || this.farT > 1.5) { c = this.bestDef(null); this.farT = 0; }
    }
    this.lastCtx = this.ctx; this.ctrl = c; if (!c) return;
    T.second = inp.second;
    const p = c, mag = Math.min(1, hyp(inp.mx, inp.mz)), ax = mag > 0.2 ? inp.mx / mag : Math.cos(p.face), az = mag > 0.2 ? inp.mz / mag : Math.sin(p.face);
    p.lockFace = null; p.jock = false;
    const aimZ = () => { const v = clamp(inp.mz * 1.6, -1, 1); return mag > 0.3 && Math.abs(v) > 0.25 ? v : null; };
    if (b.owner === p && p.act === 'hold') { // keeper holding the ball
      p.mx = p.mz = 0;
      for (const a of inp.acts) {
        if (a.type === 'pass') { const t = pickMate(this, p, ax, az, false); if (t) { p.act = 'none'; b.y = BR; const [lx, lz] = leadPt(p, t); doPass(this, p, t, lx, lz, 'g', false, 0.3); break; } }
        else if (a.type === 'shoot' || a.type === 'cross' || a.type === 'through') { gkDistribute(this, p, false, true); break; }
      }
    } else if (b.owner === p) {
      if (mag > 0.5 && p.cdFeint <= 0 && hyp(p.vx, p.vz) > 2.5 && Math.abs(angd(Math.atan2(inp.mz, inp.mx), Math.atan2(p.vz, p.vx))) > 1.0 && nearestOpp(this, p, T.id)[1] < 3.2) startFeint(this, p);
      p.mx = inp.mx; p.mz = inp.mz; p.spr = inp.sprint;
      for (const a of inp.acts) {
        if (b.owner !== p) break;
        if (a.type === 'shoot') doShot(this, p, { power: a.power, aimZ: aimZ(), mod: a.mod });
        else if (a.type === 'pass' || a.type === 'through' || a.type === 'cross') this.execPass(p, a.type, a.power, ax, az, false);
      }
    } else if (att) {
      if (b.passTo === p || mag < 0.3) { p.tx = T.cpx; p.tz = T.cpz; p.spr = true; steer(p); } else { p.mx = inp.mx; p.mz = inp.mz; p.spr = true; }
      for (const a of inp.acts) if (a.type === 'pass' || a.type === 'through' || a.type === 'shoot' || a.type === 'cross') p.q = { type: a.type as 'pass', power: a.power, mod: a.mod, ax, az, t: this.t, aimZ: aimZ() };
    } else {
      const car = b.owner && b.owner.team !== T ? b.owner : null, fx = car ? car.x + car.vx * 0.25 : T.cpx, fz = car ? car.z + car.vz * 0.25 : T.cpz, gx = -dir * HL, fd = hyp(fx - gx, fz) || 1;
      if (inp.press) { p.tx = fx + (gx - fx) / fd; p.tz = fz - fz / fd; p.spr = inp.sprint || hyp(p.x - fx, p.z - fz) > 4; steer(p); p.idle = 0; }
      else if (inp.contain) {
        p.jock = true; p.lockFace = Math.atan2(b.z - p.z, b.x - p.x); p.spr = false; p.idle = 0;
        if (mag > 0.25) { p.mx = inp.mx; p.mz = inp.mz; } else { p.tx = fx + (gx - fx) / fd * 2.4; p.tz = fz - fz / fd * 2.4; steer(p); }
      } else if (mag > 0.12) { p.mx = inp.mx; p.mz = inp.mz; p.spr = inp.sprint; p.idle = 0; }
      else { p.idle += dt; if (p.idle > 0.8) steer(p); else p.mx = p.mz = 0; }
      for (const a of inp.acts) { if (a.type === 'tackle') startTackle(this, p, false); else if (a.type === 'slide') startTackle(this, p, true); else if (a.type === 'switch') { this.ctrl = this.bestDef(p) ?? p; this.farT = 0; } }
    }
  }
}
