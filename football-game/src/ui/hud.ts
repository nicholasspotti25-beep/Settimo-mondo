// Match HUD and touch controls: floating joystick, contextual action buttons, scoreboard, stamina, radar, quick tactics.
import { QUICK } from '../data/tactics';
import { HL, HW, InAct } from '../sim/base';
import type { Match } from '../sim/match';
import { KITS } from '../gfx/world';

export const h = (tag: string, cls = '', txt = '', parent?: HTMLElement): HTMLElement => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; parent?.appendChild(e); return e; };
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface Btn { el: HTMLElement; id: string; kind: 'charge' | 'hold' | 'tap' | 'tackle'; down: number; x0: number; y0: number; pid: number; dx: number; dy: number }
// [id, label, kind, right, bottom, size]
const ATT: [string, string, Btn['kind'], number, number, number][] = [['pass', 'PASSA', 'charge', 98, 14, 74], ['shoot', 'TIRO', 'charge', 14, 62, 80], ['through', 'FILTR.', 'charge', 182, 56, 62], ['cross', 'CROSS', 'charge', 104, 100, 62], ['sprint', 'SCATTO', 'hold', 22, 154, 62]];
const DEF: [string, string, Btn['kind'], number, number, number][] = [['tackle', 'CONTR.', 'tackle', 98, 14, 74], ['slide', 'SCIVOL.', 'tap', 14, 62, 80], ['switch', 'CAMBIA', 'tap', 182, 56, 62], ['contain', 'CONTIENI', 'hold', 104, 100, 62], ['sprint', 'SCATTO', 'hold', 22, 154, 62], ['second', '2° UOMO', 'hold', 186, 130, 54]];

export class Hud {
  root: HTMLElement; jx = 0; jy = 0; held = new Set<string>(); acts: InAct[] = []; charge: Btn | null = null; keys = new Set<string>();
  private joy: HTMLElement; private knob: HTMLElement; private jpid = -1; private jcx = 0; private jcy = 0;
  private attBox: HTMLElement; private defBox: HTMLElement; private btns: Btn[] = [];
  private score: HTMLElement; private time: HTMLElement; private nameA: HTMLElement; private nameB: HTMLElement; private who: HTMLElement; private sta: HTMLElement;
  private toast: HTMLElement; private hint: HTMLElement; private pow: HTMLElement; private powFill: HTMLElement; private radar: HTMLCanvasElement; private quickBox: HTMLElement;
  private toastT = 0; private last = ''; private ctx = ''; private frame = 0; scale = 1; sens = 1;
  onPause = () => { }; onQuick = (_id: string) => { };

  constructor(parent: HTMLElement) {
    const r = this.root = h('div', 'hud', '', parent);
    const top = h('div', 'sb', '', r); this.nameA = h('span', 'tn', '', top); this.score = h('span', 'sc', '0 - 0', top); this.nameB = h('span', 'tn', '', top); this.time = h('span', 'tm', "0'", top);
    const pb = h('button', 'hb pause', 'II', r); pb.onclick = () => this.onPause();
    const qb = h('button', 'hb quick', 'TATTICA', r); this.quickBox = h('div', 'quickbox', '', r);
    for (const q of QUICK) { const b = h('button', 'qopt', q.label, this.quickBox); b.title = q.help; b.onclick = () => { this.onQuick(q.id); this.quickBox.classList.remove('on'); this.say(q.label + ': ' + q.help, 2); }; }
    qb.onclick = () => this.quickBox.classList.toggle('on');
    this.hint = h('div', 'hint', '', r); this.toast = h('div', 'toast', '', r);
    const mid = h('div', 'mid', '', r); this.who = h('div', 'who', '', mid); const sb = h('div', 'stab', '', mid); this.sta = h('div', 'staf', '', sb);
    this.radar = h('canvas', 'radar', '', mid) as HTMLCanvasElement; this.radar.width = 168; this.radar.height = 108;
    this.pow = h('div', 'pow', '', r); this.powFill = h('div', 'powf', '', this.pow);
    const jz = h('div', 'jzone', '', r); this.joy = h('div', 'joy', '', r); this.knob = h('div', 'knob', '', this.joy);
    jz.addEventListener('pointerdown', e => { if (this.jpid >= 0) return; this.jpid = e.pointerId; this.jcx = e.clientX; this.jcy = e.clientY; jz.setPointerCapture(e.pointerId); this.joy.style.left = e.clientX + 'px'; this.joy.style.top = e.clientY + 'px'; this.joy.classList.add('on'); this.jmove(e); e.preventDefault(); });
    jz.addEventListener('pointermove', e => { if (e.pointerId === this.jpid) this.jmove(e); });
    const jend = (e: PointerEvent) => { if (e.pointerId !== this.jpid) return; this.jpid = -1; this.jx = this.jy = 0; this.joy.classList.remove('on'); this.knob.style.transform = ''; };
    jz.addEventListener('pointerup', jend); jz.addEventListener('pointercancel', jend);
    this.attBox = h('div', 'btns', '', r); this.defBox = h('div', 'btns', '', r);
    for (const [box, defs] of [[this.attBox, ATT], [this.defBox, DEF]] as [HTMLElement, typeof ATT][]) for (const [id, label, kind, right, bottom, size] of defs) {
      const el = h('div', 'ab b-' + id, label, box); el.style.cssText = `right:${right}px;bottom:${bottom}px;width:${size}px;height:${size}px`;
      const b: Btn = { el, id, kind, down: 0, x0: 0, y0: 0, pid: -1, dx: 0, dy: 0 }; this.btns.push(b);
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); b.pid = e.pointerId; b.x0 = e.clientX; b.y0 = e.clientY; b.dx = b.dy = 0; this.press(b); });
      el.addEventListener('pointermove', e => { if (e.pointerId === b.pid) { b.dx = e.clientX - b.x0; b.dy = e.clientY - b.y0; } });
      const up = (e: PointerEvent) => { if (e.pointerId !== b.pid) return; b.pid = -1; this.release(b); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }
    r.addEventListener('contextmenu', e => e.preventDefault());
    r.addEventListener('touchstart', e => { if ((e.target as HTMLElement).tagName !== 'BUTTON') e.preventDefault(); }, { passive: false });
    // keyboard fallback (desktop): WASD/arrows move, J pass/tackle, K shoot/slide, L through/switch, I cross/contain, O 2nd man, Shift sprint
    const KM: Record<string, [string, string]> = { j: ['pass', 'tackle'], k: ['shoot', 'slide'], l: ['through', 'switch'], i: ['cross', 'contain'], o: ['', 'second'], shift: ['sprint', 'sprint'] };
    const kb = (key: string) => { const m = KM[key]; if (!m) return null; const id = m[this.ctx === 'def' ? 1 : 0]; return this.btns.find(b => b.id === id && b.el.parentElement === (this.ctx === 'def' ? this.defBox : this.attBox)) ?? null; };
    window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (this.keys.has(k)) return; this.keys.add(k); if (k === 'escape' || k === 'p') this.onPause(); const b = kb(k); if (b && !b.down) { b.dx = b.dy = 0; this.press(b); } });
    window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); this.keys.delete(k); for (const b of this.btns) if (b.down && b.pid < 0 && Object.entries(KM).some(([kk, v]) => kk === k && v.includes(b.id))) this.release(b); });
  }
  private jmove(e: PointerEvent) {
    const R = 52 * this.scale; let dx = (e.clientX - this.jcx) / R, dy = (e.clientY - this.jcy) / R; const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; if (m > 1.5) { this.jcx = e.clientX - dx * R * 1.5; this.jcy = e.clientY - dy * R * 1.5; this.joy.style.left = this.jcx + 'px'; this.joy.style.top = this.jcy + 'px'; } }
    this.knob.style.transform = `translate(${dx * R}px,${dy * R}px)`;
    const mm = Math.min(1, Math.hypot(dx, dy) * this.sens); if (mm < 0.12) { this.jx = this.jy = 0; return; } const n = Math.hypot(dx, dy) || 1; this.jx = dx / n * mm; this.jy = dy / n * mm;
  }
  private press(b: Btn) {
    b.down = performance.now(); b.el.classList.add('dn');
    if (b.kind === 'hold') this.held.add(b.id); else if (b.kind === 'tap') this.acts.push({ type: b.id, power: 0, mod: '', curve: 0 }); else if (b.kind === 'charge') this.charge = b;
  }
  private release(b: Btn) {
    const t = (performance.now() - b.down) / 1000; b.down = 0; b.el.classList.remove('dn');
    if (b.kind === 'hold') this.held.delete(b.id);
    else if (b.kind === 'tackle') { this.held.delete('press'); if (t < 0.22) this.acts.push({ type: 'tackle', power: 0, mod: '', curve: 0 }); }
    else if (b.kind === 'charge') {
      if (this.charge === b) this.charge = null;
      const mod = b.id === 'shoot' ? (b.dy < -26 ? 'finesse' : b.dy > 26 ? 'chip' : '') : '';
      this.acts.push({ type: b.id, power: Math.min(1, 0.12 + t / 0.75), mod, curve: Math.abs(b.dx) > 22 ? Math.max(-1, Math.min(1, b.dx / 60)) : 0 });
    }
  }
  /** Poll once per rendered frame: fills the match input. */
  feed(m: Match, map: (x: number, y: number) => [number, number]) {
    let jx = this.jx, jy = this.jy; const k = this.keys;
    if (this.jpid < 0) { jx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0); jy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0); const n = Math.hypot(jx, jy); if (n > 1) { jx /= n; jy /= n; } }
    const [mx, mz] = map(jx, jy), inp = m.inp; inp.mx = mx; inp.mz = mz;
    for (const b of this.btns) if (b.kind === 'tackle' && b.down && performance.now() - b.down > 220) this.held.add('press');
    inp.sprint = this.held.has('sprint'); inp.press = this.held.has('press'); inp.contain = this.held.has('contain'); inp.second = this.held.has('second');
    if (this.acts.length) { inp.acts.push(...this.acts); this.acts.length = 0; }
  }
  say(txt: string, t = 2.2, big = false) { this.toast.textContent = txt; this.toast.className = 'toast on' + (big ? ' big' : ''); this.toastT = t; }
  show(on: boolean) { this.root.style.display = on ? '' : 'none'; if (!on) { this.held.clear(); this.acts.length = 0; this.jx = this.jy = 0; this.charge = null; for (const b of this.btns) { b.down = 0; b.el.classList.remove('dn'); } } }
  setTeams(m: Match) {
    this.nameA.textContent = m.teams[0].name; this.nameB.textContent = m.teams[1].name;
    this.nameA.style.borderColor = css(KITS[m.teams[0].kit].shirt); this.nameB.style.borderColor = css(KITS[m.teams[1].kit].shirt); this.last = ''; this.ctx = '';
  }
  update(m: Match, dt: number) {
    this.frame++;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast.className = 'toast'; }
    const H = m.cfg.halfLen, over = m.clock > H && m.addedMin, min = m.minute();
    const sec = Math.floor((Math.min(m.clock, H) / H * 45 * 60) % 60), s = `${m.score[0]} - ${m.score[1]}|${min}:${sec < 10 ? '0' : ''}${sec}${over ? ' +' + m.addedMin : ''}`;
    if (s !== this.last) { this.last = s; const [a, b] = s.split('|'); this.score.textContent = a; this.time.textContent = b; }
    const sp = m.sp, mySP = m.state === 'setpiece' && !!sp && sp.team.human, ctx = mySP || m.state === 'kickoff' && sp?.team.human ? 'att' : m.ctx;
    if (ctx !== this.ctx) { this.ctx = ctx; this.attBox.style.display = ctx === 'att' ? '' : 'none'; this.defBox.style.display = ctx === 'att' ? 'none' : ''; }
    const c = m.ctrl;
    if (c) { this.who.textContent = `${c.data.short} · ${c.role}${c.yellow ? ' ▮' : ''}`; this.sta.style.width = c.st.toFixed(0) + '%'; this.sta.style.background = c.st > 50 ? '#56d364' : c.st > 25 ? '#e3b341' : '#f85149'; }
    const ch = this.charge; this.pow.style.display = ch ? 'block' : 'none';
    if (ch) this.powFill.style.width = Math.min(100, (0.12 + (performance.now() - ch.down) / 750) * 100) + '%';
    let hint = '';
    if (mySP) hint = sp!.type === 'pen' ? 'Joystick: mira · TIRO: tieni premuto per la potenza' : sp!.shoot ? 'Joystick: mira · TIRO (trascina ←/→ per l’effetto) · PASSA corto · CROSS in area'
      : sp!.type === 'corner' ? 'Joystick: direzione · CROSS alto (tieni = più lungo) · TIRO teso · PASSA corto' : sp!.type === 'gk' ? 'PASSA: corto · CROSS/TIRO: rinvio lungo' : 'Joystick: direzione · PASSA corto · CROSS lungo';
    if (hint !== this.hint.textContent) { this.hint.textContent = hint; this.radar.style.visibility = mySP && sp!.shoot ? 'hidden' : ''; }
    if (this.frame % 2 === 0) this.drawRadar(m);
  }
  private drawRadar(m: Match) {
    const g = this.radar.getContext('2d')!, W = 168, H = 108, sx = (x: number) => (x + HL) / (HL * 2) * (W - 8) + 4, sy = (z: number) => (z + HW) / (HW * 2) * (H - 8) + 4;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(20,70,30,0.72)'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.strokeRect(4, 4, W - 8, H - 8);
    g.beginPath(); g.moveTo(W / 2, 4); g.lineTo(W / 2, H - 4); g.stroke();
    for (const p of m.ps) { if (!p.on) continue; g.fillStyle = css(KITS[p.team.kit].shirt); g.strokeStyle = p === m.ctrl ? '#ffe94a' : 'rgba(0,0,0,0.6)'; g.lineWidth = p === m.ctrl ? 2 : 1; g.beginPath(); g.arc(sx(p.x), sy(p.z), p === m.ctrl ? 4 : 3.2, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(sx(m.ball.x), sy(m.ball.z), 2.2, 0, 7); g.fill();
  }
}
