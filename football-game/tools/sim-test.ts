// Headless AI-vs-AI matches: validates the roster, checks the simulation for stalls/NaN and prints football statistics.
declare const process: any;
import { PLAYERS, validateRoster } from '../src/data/db';
import { autoPick } from '../src/data/squad';
import { FORMATIONS, defaultTactics } from '../src/data/tactics';
import { mulberry } from '../src/sim/base';
import { Match } from '../src/sim/match';

if (process.argv.includes('-g')) (globalThis as any).GKDBG = 1;
const errs = validateRoster(); if (errs.length) { console.error('ROSTER INVALID', errs); process.exit(1); }
console.log('roster ok:', PLAYERS.length, 'players');
const N = +(process.argv[2] ?? 6), half = +(process.argv[3] ?? 240), verbose = process.argv.includes('-v');
const tot = { g: 0, shots: 0, onT: 0, pass: 0, ok: 0, fouls: 0, corners: 0, offs: 0, yel: 0, red: 0, saves: 0, tack: 0, throws: 0, gks: 0, fks: 0, pens: 0, stall: 0 };
let bad = 0; const t0 = Date.now();
for (let n = 0; n < N; n++) {
  const rnd = mulberry(1000 + n), fa = FORMATIONS[n % FORMATIONS.length].id, fb = FORMATIONS[(n * 5 + 3) % FORMATIONS.length].id;
  const A = autoPick(fa, PLAYERS, rnd), rest = PLAYERS.filter(p => !A.xi.includes(p) && !A.bench.includes(p)), B = autoPick(fb, rest, rnd);
  const m = new Match({ name: 'A', xi: A.xi, bench: A.bench, tac: defaultTactics(fa), kit: 0 }, { name: 'B', xi: B.xi, bench: B.bench, tac: defaultTactics(fb), kit: 1 }, { halfLen: half, dif: 2, human: -1, seed: 77 + n });
  let lastTouch = 0, lastId = -1, steps = 0;
  while (m.state !== 'full' && steps < 60 * 60 * 30) {
    m.step(); steps++;
    for (const e of m.ev) { if (e.k === 'sp') { if (e.txt === 'throw') tot.throws++; else if (e.txt === 'gk') tot.gks++; else if (e.txt === 'fk') tot.fks++; else if (e.txt === 'pen') tot.pens++; } if (verbose && (e.k === 'goal' || e.k === 'msg')) console.log(`  ${m.minute()}' ${e.k} ${e.txt ?? ''}`); }
    m.ev.length = 0;
    const b = m.ball;
    if (b.kickId !== lastId || b.owner) { lastId = b.kickId; lastTouch = m.t; }
    if (m.state === 'play' && m.t - lastTouch > 12) { tot.stall++; lastTouch = m.t; if (verbose) console.log('  STALL at', m.minute(), b.x.toFixed(1), b.z.toFixed(1), b.y.toFixed(2)); }
    if (!(Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.y))) { bad++; console.error('NaN ball', n, m.t); break; }
    for (const p of m.ps) if (!Number.isFinite(p.x + p.z + p.st)) { bad++; console.error('NaN player', p.data.name); steps = 1e9; break; }
  }
  if (m.state !== 'full') { bad++; console.error('match did not finish', n, m.state, m.minute()); }
  const s = m.stats;
  console.log(`#${n} ${fa} v ${fb}: ${m.score[0]}-${m.score[1]} shots ${s[0].shots}(${s[0].onT})-${s[1].shots}(${s[1].onT}) pass ${s[0].passOk}/${s[0].pass}-${s[1].passOk}/${s[1].pass} poss ${Math.round(s[0].poss / (s[0].poss + s[1].poss) * 100)}% fouls ${s[0].fouls}-${s[1].fouls} corners ${s[0].corners}-${s[1].corners} off ${s[0].offs}-${s[1].offs} cards ${s[0].yel + s[1].yel}y ${s[0].red + s[1].red}r | ${m.scorers.map(x => x.name + ' ' + x.min + "'").join(', ')}`);
  tot.g += m.score[0] + m.score[1];
  for (const x of s) { tot.shots += x.shots; tot.onT += x.onT; tot.pass += x.pass; tot.ok += x.passOk; tot.fouls += x.fouls; tot.corners += x.corners; tot.offs += x.offs; tot.yel += x.yel; tot.red += x.red; tot.saves += x.saves; tot.tack += x.tackles; }
}
const per = (v: number) => (v / N).toFixed(1);
console.log(`\nper match: goals ${per(tot.g)} shots ${per(tot.shots)} onT ${per(tot.onT)} saves ${per(tot.saves)} passes ${per(tot.pass)} (${Math.round(tot.ok / tot.pass * 100)}%) tackles ${per(tot.tack)} fouls ${per(tot.fouls)} yel ${per(tot.yel)} red ${per(tot.red)} corners ${per(tot.corners)} offsides ${per(tot.offs)} throws ${per(tot.throws)} gk ${per(tot.gks)} fk ${per(tot.fks)} pens ${per(tot.pens)} stalls ${tot.stall}`);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (bad) process.exit(1);
