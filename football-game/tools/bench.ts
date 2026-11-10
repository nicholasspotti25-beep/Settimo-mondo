// Measurements that back the design claims: players differ in play, tactics change team behaviour, difficulty changes results.
declare const process: any;
import { PLAYERS, byId } from '../src/data/db';
import { autoPick } from '../src/data/squad';
import { Tactics, defaultTactics, formation } from '../src/data/tactics';
import { mulberry } from '../src/sim/base';
import { Match } from '../src/sim/match';
const what = process.argv[2] ?? 'all';
const teams = (seed: number, fa = '4-3-3', fb = '4-3-3') => { const r = mulberry(seed), A = autoPick(fa, PLAYERS, r), B = autoPick(fb, PLAYERS.filter(p => !A.xi.includes(p) && !A.bench.includes(p)), r); return { A, B }; };

if (what === 'all' || what === 'players') {
  console.log('— individuality (measured in the simulation) —');
  console.log('player           top  20m+ball  turn180  ballDist  shot  feints            duels (60)');
  for (const id of ['messi', 'neymar', 'ronaldinho', 'ronaldo', 'robben', 'bale', 'mbappe', 'hazard', 'haaland', 'drogba', 'xavi', 'gerrard', 'busquets', 'maldini', 'vidic']) {
    const pd = byId(id), { A, B } = teams(9), f = formation('4-3-3'), slot = Math.max(1, f.slots.findIndex(s => s.r === pd.pos)), xi = A.xi.filter(p => p !== pd).slice(); if (!A.xi.includes(pd)) xi.length = 11; xi.splice(xi.indexOf(A.xi[slot]) >= 0 ? xi.indexOf(A.xi[slot]) : slot, A.xi.includes(pd) ? 0 : 1); const XI = A.xi.slice(); const cur = XI.indexOf(pd); if (cur >= 0) XI[cur] = XI[slot]; XI[slot] = pd;
    const mk = (seed: number) => { const m = new Match({ name: 'A', xi: XI, bench: [], tac: defaultTactics('4-3-3'), kit: 0 }, { name: 'B', xi: B.xi, bench: [], tac: defaultTactics('4-3-3'), kit: 1 }, { halfLen: 240, dif: 2, human: 0, seed }); for (let i = 0; i < 110; i++) m.step(); const p = m.teams[0].ps[slot]; m.teams[1].ps.forEach((o, i) => { if (o.grp !== 'GK') { o.x = -45; o.z = -30 + i * 5; } }); p.x = -20; p.z = 0; p.vx = p.vz = 0; const b = m.ball; b.owner = p; b.x = p.x; b.z = 0; b.passTo = null; m.gained(p); m.state = 'play'; m.sp = null; return { m, p }; };
    let { m, p } = mk(1); m.inp.mx = 1; m.inp.sprint = true; let t20 = 0, dsum = 0, n = 0, top = 0; for (let i = 0; i < 400 && p.x < 0; i++) { m.step(); t20 = i / 60; if (i > 60) { dsum += Math.hypot(m.ball.x - p.x, m.ball.z - p.z); n++; } top = Math.max(top, Math.hypot(p.vx, p.vz)); }
    m.inp.mx = -1; let tt = 0; for (let i = 0; i < 300; i++) { m.step(); if (p.vx < -0.8 * top) { tt = i / 60; break; } }
    ({ m, p } = mk(2)); p.x = 28; m.ball.x = 28; m.inp.mx = 1; for (let i = 0; i < 5; i++) m.step(); m.inp.acts.push({ type: 'shoot', power: 1, mod: '', curve: 0 }); m.step(); m.step(); const sv = Math.hypot(m.ball.vx, m.ball.vy, m.ball.vz);
    // 60 duels: an AI defender (same one for everybody) attacks the dribbler, who keeps running
    let lost = 0, fouled = 0; const kinds: Record<string, number> = {};
    for (let s = 0; s < 60; s++) { ({ m, p } = mk(50 + s)); const o = m.teams[1].ps[3]; o.x = p.x + 9; o.z = 0.5; m.inp.mx = 1; m.inp.sprint = s % 2 === 0; for (let i = 0; i < 260; i++) { m.step(); for (const e of m.ev) if (e.k === 'feint' && e.p === p) kinds[p.feintKind] = (kinds[p.feintKind] ?? 0) + 1; m.ev.length = 0; if (m.pendFoul) { fouled++; break; } if (m.ball.owner !== p) { lost++; break; } if (p.x > o.x + 6) break; } }
    console.log(`${pd.short.padEnd(15)} ${top.toFixed(2)}  ${t20.toFixed(2)}s    ${tt.toFixed(2)}s    ${(dsum / n).toFixed(2)}m    ${sv.toFixed(1)}  ${Object.entries(kinds).map(([k, v]) => k + ':' + v).join(' ').padEnd(17)} ${Math.round(lost / 60 * 100)}% lost, ${Math.round(fouled / 60 * 100)}% fouled`);
  }
}
if (what === 'all' || what === 'tactics') {
  console.log('\n— tactics (team A varies, team B default; 3 matches each) —');
  console.log('variant                 lineX   width  press%  passes  long%  stam  shots  goals f-a');
  const V: [string, Partial<Tactics>][] = [['default', {}], ['high press + high line', { press: 0, line: 2, inten: 2, lost: 0 }], ['low block', { press: 3, line: 0, comp: 0, ment: 0 }], ['possession, slow', { build: 0, tempo: 0, runs: 0 }],
    ['direct, fast, runs', { build: 2, tempo: 2, runs: 2 }], ['wide + overlaps', { width: 2, over: 2 }], ['narrow', { width: 0, over: 0 }]];
  for (const [name, t] of V) {
    let line = 0, ln = 0, wid = 0, wn = 0, hi = 0, reg = 0, pass = 0, sta = 0, sh = 0, gf = 0, ga = 0, lob = 0;
    for (let s = 0; s < 3; s++) {
      const { A, B } = teams(40 + s), m = new Match({ name: 'A', xi: A.xi, bench: [], tac: { ...defaultTactics('4-3-3'), ...t }, kit: 0 }, { name: 'B', xi: B.xi, bench: [], tac: defaultTactics('4-3-3'), kit: 1 }, { halfLen: 180, dif: 2, human: -1, seed: 500 + s });
      const T = m.teams[0]; let prev = m.att, k = 0, lastId = -1;
      while (m.state !== 'full') { m.step(); m.ev.length = 0; if (m.state !== 'play') continue; const b = m.ball;
        if (b.kickId !== lastId) { lastId = b.kickId; if (b.kicker && b.kicker.team === T && b.passTo && b.vy > 4) lob++; }
        if (m.att !== prev) { if (m.att === T) { reg++; if (b.x * T.dir > 0) hi++; } prev = m.att; }
        if (++k % 30) continue; const of = T.ps.filter(p => p.on && p.grp !== 'GK');
        if (m.att !== T) { const cb = of.filter(p => p.grp === 'CB'); line += cb.reduce((a, p) => a + p.x * T.dir, 0) / cb.length - b.x * T.dir; ln++; } else { const zs = of.map(p => p.z); wid += Math.max(...zs) - Math.min(...zs); wn++; } }
      pass += m.stats[0].pass; sta += T.ps.reduce((a, p) => a + p.st, 0) / 11; sh += m.stats[0].shots; gf += m.score[0]; ga += m.score[1];
    }
    console.log(`${name.padEnd(23)} ${(line / ln).toFixed(1).padStart(5)}  ${(wid / wn).toFixed(1)}   ${Math.round(hi / reg * 100).toString().padStart(3)}%    ${Math.round(pass / 3)}    ${Math.round(lob / pass * 100)}%   ${Math.round(sta / 3)}    ${Math.round(sh / 3)}     ${gf}-${ga}`);
  }
}
if (what === 'all' || what === 'difficulty') {
  console.log('\n— difficulty (same squads, AI level only) —');
  for (const [a, b] of [[0, 4], [4, 0], [2, 2], [1, 3]]) { let gf = 0, ga = 0, sf = 0, sa = 0; for (let s = 0; s < 8; s++) { const { A, B } = teams(70 + s), m = new Match({ name: 'A', xi: A.xi, bench: [], tac: defaultTactics('4-3-3'), kit: 0 }, { name: 'B', xi: B.xi, bench: [], tac: defaultTactics('4-3-3'), kit: 1 }, { halfLen: 180, dif: 2, human: -1, seed: 900 + s, difs: [a, b] }); while (m.state !== 'full') { m.step(); m.ev.length = 0; } gf += m.score[0]; ga += m.score[1]; sf += m.stats[0].shots; sa += m.stats[1].shots; }
    console.log(`level ${a} vs level ${b}: goals ${gf}-${ga}, shots ${sf}-${sa} (8 matches)`); }
}
