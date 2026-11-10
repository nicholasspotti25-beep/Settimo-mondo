// Scripted checks of the user-controlled paths (Option B controls, set pieces, first-time actions) without a browser.
declare const process: any;
import { PLAYERS } from '../src/data/db';
import { autoPick } from '../src/data/squad';
import { defaultTactics } from '../src/data/tactics';
import { HL, InAct, mulberry } from '../src/sim/base';
import { Match } from '../src/sim/match';

const rnd = mulberry(5), A = autoPick('4-3-3', PLAYERS, rnd), B = autoPick('4-4-2', PLAYERS.filter(p => !A.xi.includes(p) && !A.bench.includes(p)), rnd);
const mk = (seed = 3) => new Match({ name: 'TU', xi: A.xi, bench: A.bench, tac: defaultTactics('4-3-3'), kit: 0 }, { name: 'CPU', xi: B.xi, bench: B.bench, tac: defaultTactics('4-4-2'), kit: 1 }, { halfLen: 240, dif: 2, human: 0, seed });
let fail = 0; const ok = (name: string, c: boolean, info = '') => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); if (!c) fail++; };
const act = (type: string, power = 0.3, mod = '', curve = 0): InAct => ({ type, power, mod, curve });
const run = (m: Match, n: number, each?: () => boolean | void) => { for (let i = 0; i < n; i++) { m.step(); m.ev.length = 0; if (each && each()) return i; } return n; };
const give = (m: Match, p: any, x?: number, z?: number) => { if (x != null) { p.x = x; p.z = z; p.vx = p.vz = 0; } const b = m.ball; b.owner = p; b.x = p.x; b.z = p.z; b.y = 0.11; b.passTo = null; m.gained(p); m.state = 'play'; m.sp = null; p.act = 'none'; };
const clearOpp = (m: Match, x = -40) => m.teams[1].ps.forEach((o, i) => { if (o.grp !== 'GK') { o.x = x; o.z = -30 + i * 5; } });

{ // dribble + pass + control switch
  const m = mk(); run(m, 120); const T = m.teams[0], p = T.ps[7]; give(m, p, -5, 0); clearOpp(m);
  m.inp.mx = 1; m.inp.sprint = true; const x0 = p.x; run(m, 60);
  ok('dribble: carrier moves with the ball', p.x > x0 + 4 && m.ball.owner === p && m.ctrl === p, `dx=${(p.x - x0).toFixed(1)}`);
  const mate = T.ps[10], a = Math.atan2(mate.z - p.z, mate.x - p.x); m.inp.mx = Math.cos(a); m.inp.mz = Math.sin(a); m.inp.sprint = false; run(m, 2);
  m.inp.acts.push(act('pass')); const n0 = m.stats[0].pass; let got: any = null; run(m, 240, () => { if (m.ball.owner && m.ball.owner !== p) { got = m.ball.owner; return true; } });
  ok('short pass reaches a team-mate and control follows', m.stats[0].pass === n0 + 1 && got && got.team === T && m.ctrl === got, got ? `to ${got.data.short}` : 'no receiver');
}
{ // shooting: power, finesse, chip
  for (const [mod, pw] of [['', 0.6], ['finesse', 0.5], ['chip', 0.4]] as [string, number][]) {
    const m = mk(8); run(m, 120); const p = m.teams[0].ps[9]; give(m, p, 32, 4); clearOpp(m); m.inp.mx = 1; run(m, 5);
    m.inp.acts.push(act('shoot', pw, mod)); const s0 = m.stats[0].shots; run(m, 3); const b = m.ball, v = Math.hypot(b.vx, b.vy, b.vz), c = b.curve;
    let res = 'none'; run(m, 200, () => { if (m.state === 'goal') { res = 'goal'; return true; } if (m.state === 'dead') { res = 'out/save'; return true; } if (b.owner) { res = 'held by ' + b.owner.data.short; return true; } });
    ok(`shot ${mod || 'normal'}`, m.stats[0].shots === s0 + 1 && v > 8, `v=${v.toFixed(1)} m/s curve=${c.toFixed(2)} → ${res}`);
  }
}
{ // through ball, cross, first-time finish
  const m = mk(11); run(m, 120); const T = m.teams[0], p = T.ps[7]; give(m, p, 10, 0); T.ps[9].x = 22; T.ps[9].z = 3; m.inp.mx = 1; run(m, 3); m.inp.acts.push(act('through', 0.4)); const n0 = m.stats[0].pass; run(m, 3);
  ok('through ball played ahead of a runner', m.stats[0].pass === n0 + 1 && !!m.ball.passTo && m.ball.vx > 5, m.ball.passTo ? 'for ' + m.ball.passTo.data.short : '');
  const m2 = mk(12); run(m2, 120); const w = m2.teams[0].ps[10], st = m2.teams[0].ps[9]; give(m2, w, 40, 24); clearOpp(m2); m2.teams[1].ps[1].x = 50; m2.teams[1].ps[1].z = 18; st.x = 43; st.z = 2; m2.inp.mx = 0; m2.inp.mz = -1; run(m2, 2); m2.inp.acts.push(act('cross', 0.5)); run(m2, 3);
  ok('cross is lofted into the box', m2.ball.vy > 3 && m2.ball.vz < -3, `vy=${m2.ball.vy.toFixed(1)}`);
  const s0 = m2.stats[0].shots; let q = false; run(m2, 150, () => { if (m2.ctrl && !q && m2.ball.passTo === m2.ctrl) { m2.inp.acts.push(act('shoot', 0.6)); q = true; } return m2.stats[0].shots > s0; });
  ok('first-time finish (header/volley) from a queued shot', m2.stats[0].shots > s0, q ? 'queued' : 'never queued');
}
{ // defending: press, tackle, slide, switch
  const m = mk(4); run(m, 120); const O = m.teams[1], c = O.ps[8]; give(m, c, 5, 3); run(m, 12);
  const d0 = m.ctrl ? Math.hypot(m.ctrl.x - c.x, m.ctrl.z - c.z) : 99, first = m.ctrl; ok('defence: a defender is selected', m.ctx === 'def' && !!first && first.team === m.teams[0] && first.grp !== 'GK', first?.data.short);
  m.inp.press = true; run(m, 50); const d1 = Math.hypot(first!.x - m.ball.x, first!.z - m.ball.z); m.inp.press = false;
  ok('pressure closes down the ball', d1 < d0 || d1 < 3, `${d0.toFixed(1)} → ${d1.toFixed(1)} m`);
  m.inp.acts.push(act('switch')); run(m, 2); ok('player switch changes the controlled defender', m.ctrl !== first, m.ctrl?.data.short);
  const p = m.ctrl!; m.inp.acts.push(act('tackle')); m.step(); ok('standing tackle starts', p.act === 'tackle'); run(m, 60);
  m.ctrl!.act = 'none'; m.ctrl!.cdTk = 0; m.inp.acts.push(act('slide')); const pp = m.ctrl!; m.step(); ok('sliding tackle starts', pp.act === 'slide');
  let won = 0; for (let s = 0; s < 40; s++) { const mm = mk(100 + s); run(mm, 120); const cc = mm.teams[1].ps[8]; give(mm, cc, 5, 3); run(mm, 10); mm.inp.press = true; let done = false; run(mm, 600, () => { const u = mm.ctrl!; if (!done && mm.ball.owner === cc && Math.hypot(u.x - mm.ball.x, u.z - mm.ball.z) < 1.3 && u.act === 'none' && u.cdTk <= 0) mm.inp.acts.push(act('tackle')); if (mm.ball.owner && mm.ball.owner.team === mm.teams[0]) { won++; return true; } return mm.state !== 'play'; }); }
  ok('user tackles can win the ball', won > 6 && won < 38, `${won}/40 duels ended with the user in possession`);
}
{ // set pieces taken by the user
  for (const [type, x, z, a, extra] of [['corner', HL, 30, 'cross', ''], ['throw', 10, 34, 'pass', ''], ['gk', 0, 3, 'pass', ''], ['fk', 28, 4, 'shoot', 'direct'], ['fk', -10, 10, 'pass', 'deep'], ['pen', 0, 0, 'shoot', '']] as [string, number, number, string, string][]) {
    const m = mk(21); run(m, 150); m.state = 'play'; m.award(type, m.teams[0], x, z); run(m, 200, () => m.state === 'setpiece'); const sp = m.sp; run(m, 45);
    const isSet = m.state === 'setpiece' && !!sp && m.ctrl === sp.taker; m.inp.mx = 0.2; m.inp.mz = z > 0 ? -0.8 : 0.8; run(m, 10); m.inp.acts.push(act(a, 0.5)); run(m, 3);
    ok(`set piece ${type} ${extra}`.trim(), isSet && m.state === 'play' && (!!m.ball.owner || Math.hypot(m.ball.vx, m.ball.vz) > 3), `taker ${sp?.taker.data.short}, mode ${sp?.shoot ? 'reticle' : 'arrow'}`);
  }
  const m = mk(22); run(m, 150); m.state = 'play'; m.award('corner', m.teams[0], HL, 30); run(m, 60 * 17, () => m.state === 'play'); ok('untaken set piece is auto-taken after the time limit', m.state === 'play');
  const m3 = mk(23); run(m3, 150); m3.state = 'play'; m3.award('pen', m3.teams[1], 0, 0); let r = ''; run(m3, 900, () => { if (m3.state === 'goal') { r = 'goal'; return true; } if (m3.state === 'play' && m3.ball.owner) { r = 'saved/held'; return true; } if (m3.state === 'dead') { r = 'missed/parried'; return true; } }); ok('CPU penalty is taken and resolved', r !== '', r);
}
{ // substitutions, tactics change, quick command
  const m = mk(30); run(m, 200); const T = m.teams[0], out = T.ps[9].data.short, inn = T.bench.find(p => !p.gk)!, bi = T.bench.indexOf(inn);
  ok('substitution is queued in play', m.sub(0, 9, bi) && T.pend.length === 1); m.state = 'play'; m.award('throw', m.teams[1], 0, 34); run(m, 120);
  ok('…and made at the next stoppage', T.ps[9].data === inn && T.subs === 4, `${inn.short} for ${out}`);
  m.setTactics(0, { ...defaultTactics('3-5-2'), press: 0, line: 2 }); ok('formation/tactics change live', T.form.id === '3-5-2' && T.ps[1].role === 'DC'); m.quick(0, 'pressing'); ok('quick command active', T.quickT > 20);
}
console.log(fail ? `\n${fail} FAILED` : '\nall user-control checks passed'); if (fail) process.exit(1);
