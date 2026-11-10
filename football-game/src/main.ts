// Bootstrap: wires simulation, rendering, HUD/touch input, menus, audio and persistence together.
import './ui/style.css';
import { PLAYERS, validateRoster } from './data/db';
import { autoPick, defaultSquad, resolve } from './data/squad';
import { FORMATIONS, Tactics, defaultTactics, formation } from './data/tactics';
import { KITS, World } from './gfx/world';
import { DT } from './sim/base';
import { Match } from './sim/match';
import { Sfx } from './audio';
import { Hud } from './ui/hud';
import { Menu, Save } from './ui/menu';

const KEY = 'football-game-save-v1';
function load(): Save {
  const def: Save = { squad: defaultSquad(), set: { half: 240, dif: 2, quality: 1, scale: 1, sens: 1, sound: true } };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.squad && s.set) { Object.assign(def.set, s.set); if (resolve(s.squad.xi).length === 11) def.squad = { ...def.squad, ...s.squad, tac: { ...def.squad.tac, ...s.squad.tac } }; } } catch { /* storage unavailable */ }
  return def;
}
const save = load();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ } };
const app = document.getElementById('app')!, canvas = document.getElementById('c') as HTMLCanvasElement;
const world = new World(canvas, save.set.quality), hud = new Hud(app), menu = new Menu(app, save), sfx = new Sfx();
let match: Match | null = null, paused = true, acc = 0, last = performance.now();
const errs = validateRoster(); if (errs.length) console.error('Roster non valido', errs);

function applySettings() { app.style.setProperty('--s', String(save.set.scale)); hud.scale = save.set.scale; hud.sens = save.set.sens; world.setQuality(save.set.quality); sfx.setOn(save.set.sound); resize(); persist(); }
function resize() { world.resize(app.clientWidth || window.innerWidth, app.clientHeight || window.innerHeight); }
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
window.addEventListener('pointerdown', () => sfx.init(), { once: false });
document.addEventListener('visibilitychange', () => { if (document.hidden && match && !paused && match.state !== 'full') pause(); });

function fixSquad() { // make sure the saved XI still fits the formation (a keeper in goal, 11 distinct players)
  const sq = save.squad, f = formation(sq.tac.form), xi = resolve(sq.xi);
  const ok = xi.length === 11 && new Set(sq.xi).size === 11 && f.slots.every((s, i) => xi[i].gk === (s.r === 'POR'));
  if (!ok) { const r = autoPick(sq.tac.form, PLAYERS, Math.random); sq.xi = r.xi.map(p => p.id); sq.bench = r.bench.map(p => p.id); }
  sq.bench = sq.bench.filter(id => !sq.xi.includes(id)).slice(0, 7);
}
function startMatch() {
  fixSquad(); const sq = save.squad, xi = resolve(sq.xi), bench = resolve(sq.bench);
  const rest = PLAYERS.filter(p => !xi.includes(p) && !bench.includes(p)), of = FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)].id, opp = autoPick(of, rest, Math.random);
  const r = (n: number) => Math.floor(Math.random() * n), ot: Tactics = { ...defaultTactics(of), ment: 1 + r(2), build: r(4), width: r(3), tempo: r(3), runs: r(3), over: r(4), press: r(4), inten: r(3), line: r(3), comp: r(3), mark: r(3), won: r(3), lost: r(3) };
  const a = KITS[sq.kit].shirt, dc = (c: number) => Math.abs((c >> 16) - (a >> 16)) + Math.abs((c >> 8 & 255) - (a >> 8 & 255)) + Math.abs((c & 255) - (a & 255));
  const kits = KITS.map((k, i) => i).filter(i => dc(KITS[i].shirt) > 200), okit = kits[r(kits.length)] ?? (sq.kit + 1) % KITS.length;
  match = new Match({ name: 'TU', xi, bench, tac: JSON.parse(JSON.stringify(sq.tac)), kit: sq.kit }, { name: 'CPU', xi: opp.xi, bench: opp.bench, tac: ot, kit: okit },
    { halfLen: save.set.half, dif: save.set.dif, human: 0, seed: (Date.now() & 0xfffffff) + r(1000) });
  (window as unknown as { __fg: unknown }).__fg = { match, world, hud };
  world.setMatch(match); hud.setTeams(match); hud.show(true); menu.match = match; menu.hide(); paused = false; acc = 0; sfx.init(); sfx.ambience(0.18);
  hud.say(`${sq.tac.form} contro ${of}`, 2.5);
}
function pause() { if (!match || paused) return; paused = true; hud.show(false); menu.show('pause'); sfx.ambience(0.05); }
function resume() { if (!match) return; paused = false; menu.hide(); hud.show(true); sfx.ambience(0.18); }
function quit() { match = null; menu.match = null; paused = true; hud.show(false); menu.show('home'); sfx.ambience(0); }
hud.onPause = pause; hud.onQuick = id => { if (match) match.quick(0, id); };
menu.onPlay = startMatch; menu.onResume = () => { if (match && match.state === 'half') menu.show('half'); else resume(); }; menu.onQuit = quit;
menu.onNext = () => { if (match) { match.secondHalf(); resume(); } };
menu.onChange = () => { fixSquadSoft(); persist(); if (match) match.setTactics(0, JSON.parse(JSON.stringify(save.squad.tac))); };
menu.onSettings = applySettings;
function fixSquadSoft() { const sq = save.squad; sq.bench = sq.bench.filter((id, i) => !sq.xi.includes(id) && sq.bench.indexOf(id) === i).slice(0, 7); }

function events(m: Match) {
  for (const e of m.ev) {
    switch (e.k) {
      case 'goal': hud.say('GOL!  ' + (e.txt ?? ''), 3.2, true); sfx.goal(); break;
      case 'whistle': sfx.whistle(); break;
      case 'kick': sfx.kick(e.v ?? 10); break;
      case 'msg': hud.say(e.txt ?? ''); break;
      case 'post': sfx.post(); sfx.ooh(); hud.say('Palo!', 1.2); break;
      case 'save': sfx.ooh(); hud.say('Parata di ' + (e.p?.data.short ?? ''), 1.4); break;
      case 'net': world.netHit(e.team ?? 1, m.ball.y, e.v ?? 0); break;
      case 'half': paused = true; hud.show(false); menu.show('half'); break;
      case 'full': paused = true; hud.show(false); menu.show('full'); sfx.ambience(0.08); break;
    }
  }
  m.ev.length = 0;
}
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (match && !paused) {
    hud.feed(match, (x, y) => world.mapInput(x, y)); acc += dt; let n = 0;
    while (acc >= DT && n < 4 && !paused) { match.step(); acc -= DT; n++; events(match); }
    if (acc > DT * 4) acc = 0;
    hud.update(match, dt);
  }
  world.update(match, dt);
  requestAnimationFrame(frame);
}
applySettings(); hud.show(false); menu.show('home'); requestAnimationFrame(frame);
