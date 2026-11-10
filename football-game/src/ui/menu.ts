// Menus: home, squad management, tactics, player cards, settings, pre-match, pause, substitutions, half/full-time reports.
// No Overall rating and no "best player" labels anywhere: lists follow roster/role order only.
import { GK_STAT_NAMES, PLAYERS, POS_NAME, PS, PlayerData, Pos, STAT_NAMES, TIER_NAME, familiarity } from '../data/db';
import { Squad, autoPick, resolve } from '../data/squad';
import { DIFFS, FORMATIONS, GRP, INSTR, TACTIC_SECTIONS, Tactics, formation } from '../data/tactics';
import { KITS } from '../gfx/world';
import type { Match } from '../sim/match';

export interface Settings { half: number; dif: number; quality: number; scale: number; sens: number; sound: boolean }
export interface Save { squad: Squad; set: Settings }
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const famLabel = (f: number) => (f >= 0.999 ? 'Ruolo naturale' : f >= 0.94 ? 'Ruolo secondario' : f >= 0.8 ? 'Adattabile' : 'Fuori ruolo');
const famCls = (f: number) => (f >= 0.94 ? 'ok' : f >= 0.8 ? 'mid' : 'bad');
const ORDER: Pos[] = ['POR', 'TD', 'TS', 'DC', 'CDC', 'CC', 'COC', 'AD', 'AS', 'ATT'];

export class Menu {
  root: HTMLElement; screen = ''; match: Match | null = null; sel = -1; pick: { kind: 'xi' | 'bench'; i: number } | null = null; filter = 'ALL'; tab = 0; back = 'home'; subSel = -1; warn = '';
  onPlay = () => { }; onResume = () => { }; onQuit = () => { }; onNext = () => { }; onChange = () => { }; onSettings = () => { };
  constructor(parent: HTMLElement, public save: Save) {
    this.root = document.createElement('div'); this.root.className = 'ui'; parent.appendChild(this.root);
    this.root.addEventListener('click', e => { const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (t) { const [a, ...r] = t.dataset.a!.split(':'); this.act(a, r.join(':')); } });
    this.root.addEventListener('change', e => { const t = e.target as HTMLSelectElement; if (t.dataset.c) this.act(t.dataset.c, t.value); });
  }
  get sq() { return this.save.squad; }
  hide() { this.root.style.display = 'none'; this.screen = ''; }
  show(s: string) { this.screen = s; this.root.style.display = ''; this.render(); }

  act(a: string, v: string) {
    const sq = this.sq, tac = sq.tac;
    switch (a) {
      case 'go': if (v === 'tactics' || v === 'squad' || v === 'players') this.back = this.match ? 'pause' : this.screen === 'pre' ? 'pre' : 'home'; this.pick = null; this.show(v); return;
      case 'back': this.pick = null; this.sel = -1; this.show(this.back); return;
      case 'play': this.onPlay(); return;
      case 'resume': this.onResume(); return;
      case 'quit': this.onQuit(); return;
      case 'next': this.onNext(); return;
      case 'form': tac.form = v; tac.instr = Array(11).fill(''); this.changed(); break;
      case 'auto': { const r = autoPick(tac.form, PLAYERS, Math.random); sq.xi = r.xi.map(p => p.id); sq.bench = r.bench.map(p => p.id); this.changed(); break; }
      case 'kit': sq.kit = +v; this.changed(); break;
      case 'slot': this.pick = { kind: 'xi', i: +v }; break;
      case 'bslot': this.pick = { kind: 'bench', i: +v }; break;
      case 'nopick': this.pick = null; break;
      case 'choose': {
        const pk = this.pick!, arr = pk.kind === 'xi' ? sq.xi : sq.bench, cur = arr[pk.i], ix = sq.xi.indexOf(v), ib = sq.bench.indexOf(v);
        if (ix >= 0) sq.xi[ix] = cur; else if (ib >= 0) { if (cur) sq.bench[ib] = cur; else sq.bench.splice(ib, 1); }
        arr[pk.i] = v; sq.bench = sq.bench.filter(Boolean); this.pick = null; this.changed(); break;
      }
      case 'unbench': sq.bench.splice(+v, 1); this.changed(); break;
      case 'card': this.sel = PLAYERS.findIndex(p => p.id === v); break;
      case 'nocard': this.sel = -1; break;
      case 'filter': this.filter = v; break;
      case 'tab': this.tab = +v; break;
      case 'tac': { const [k, n] = v.split('='); (tac as unknown as Record<string, number>)[k] = +n; this.changed(); break; }
      case 'ins': { const [i, id] = v.split('='); tac.instr[+i] = id; this.changed(); break; }
      case 'set': { const [k, n] = v.split('='); (this.save.set as unknown as Record<string, number | boolean>)[k] = k === 'sound' ? n === '1' : +n; this.onSettings(); break; }
      case 'subp': this.subSel = +v; break;
      case 'subb': if (this.match && this.subSel >= 0) { const m = this.match, ok = m.sub(m.cfg.human, this.subSel, +v); this.subSel = -1; this.warn = ok ? '' : 'Sostituzione non possibile: un portiere può essere sostituito solo da un portiere, e i cambi sono al massimo 5.'; } break;
      case 'full': try { const d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else d.requestFullscreen?.().catch(() => { }); } catch { /* not allowed in this frame */ } return;
    }
    this.render();
  }
  changed() { this.onChange(); }

  render() {
    const s = this.screen; let html = '';
    if (s === 'home') html = this.home(); else if (s === 'squad') html = this.squad(); else if (s === 'tactics') html = this.tactics(); else if (s === 'players') html = this.players();
    else if (s === 'settings') html = this.settings(); else if (s === 'pre') html = this.pre(); else if (s === 'pause') html = this.pause(); else if (s === 'subs') html = this.subs();
    else if (s === 'half' || s === 'full') html = this.report(s); else if (s === 'help') html = this.help();
    if (this.sel >= 0) html += this.card(PLAYERS[this.sel]);
    this.root.innerHTML = html;
  }
  private head(t: string, back = true) { return `<div class="hd">${back ? '<button class="bt sm" data-a="back">‹ Indietro</button>' : ''}<h2>${t}</h2></div>`; }
  private home() {
    return `<div class="home"><h1>FOOTBALL GAME</h1><p class="sub">Calcio 3D · 11 contro 11 · 57 campioni al loro prime</p><p class="rot">Ruota il telefono in orizzontale per giocare.</p>
      <div class="col"><button class="bt big" data-a="go:pre">Gioca partita</button><button class="bt" data-a="go:squad">Squadra</button><button class="bt" data-a="go:tactics">Tattiche</button>
      <button class="bt" data-a="go:players">Calciatori</button><button class="bt" data-a="go:settings">Impostazioni</button><button class="bt" data-a="go:help">Comandi</button></div></div>`;
  }
  private pitch(xi: PlayerData[], form: string, clickable: boolean) {
    const f = formation(form); let o = '<div class="pitch">';
    f.slots.forEach((sl, i) => {
      const p = xi[i], fm = p ? familiarity(p, sl.r) : 0, left = (sl.x + 52) / 76 * 100, top = 50 + sl.z / 30 * 44;
      o += `<button class="slot ${p ? famCls(fm) : 'bad'}" style="left:${left}%;top:${top}%" ${clickable ? `data-a="slot:${i}"` : ''}><b>${sl.r}</b><span>${p ? p.short : '—'}</span></button>`;
    });
    return o + '</div>';
  }
  private squad() {
    const sq = this.sq, xi = sq.xi.map(id => PLAYERS.find(p => p.id === id)!), bench = resolve(sq.bench);
    let o = `<div class="panel">${this.head('Squadra')}<div class="row2"><div class="grow">${this.pitch(xi, sq.tac.form, true)}</div><div class="side">
      <label>Modulo <select data-c="form">${FORMATIONS.map(f => `<option ${f.id === sq.tac.form ? 'selected' : ''} value="${f.id}">${f.id} — ${f.desc}</option>`).join('')}</select></label>
      <div class="kits">${KITS.map((k, i) => `<button class="kit ${i === sq.kit ? 'on' : ''}" style="background:${hex(k.shirt)}" data-a="kit:${i}" title="${k.name}"></button>`).join('')}</div>
      <h3>Panchina (${bench.length}/7)</h3><div class="bench">${bench.map((p, i) => `<div class="brow"><span data-a="card:${p.id}"><b>${p.pos}</b> ${p.short}</span><button class="x" data-a="unbench:${i}">×</button></div>`).join('')}
      ${bench.length < 7 ? `<button class="bt sm" data-a="bslot:${bench.length}">+ Aggiungi riserva</button>` : ''}</div>
      <button class="bt sm" data-a="auto">Formazione automatica</button><p class="note">Tocca una posizione per scegliere il calciatore. Il colore indica quanto il ruolo gli è familiare.</p></div></div></div>`;
    if (this.pick) o += this.picker();
    return o;
  }
  private picker() {
    const sq = this.sq, pk = this.pick!, role = pk.kind === 'xi' ? formation(sq.tac.form).slots[pk.i].r : null, cur = (pk.kind === 'xi' ? sq.xi : sq.bench)[pk.i];
    let list = PLAYERS.filter(p => p.id !== cur && (role ? p.gk === (role === 'POR') : !sq.xi.includes(p.id) && !sq.bench.includes(p.id)));
    if (role) list = list.map((p, i) => ({ p, f: familiarity(p, role), i })).sort((a, b) => b.f - a.f || a.i - b.i).map(x => x.p);
    return `<div class="ov"><div class="modal"><div class="hd"><button class="bt sm" data-a="nopick">Chiudi</button><h2>${role ? `${role} — ${POS_NAME[role]}` : 'Riserva'}</h2></div><div class="plist">${list.map(p => {
      const f = role ? familiarity(p, role) : 1, where = sq.xi.includes(p.id) ? 'in campo' : sq.bench.includes(p.id) ? 'in panchina' : '';
      return `<div class="prow"><div class="pmain" data-a="choose:${p.id}"><b>${p.pos}</b> <span class="pn">${p.name}</span> ${role ? `<i class="${famCls(f)}">${famLabel(f)}</i>` : ''} <em>${where}</em><div class="mini">${this.miniStats(p)}</div></div><button class="bt sm" data-a="card:${p.id}">Scheda</button></div>`;
    }).join('')}</div></div></div>`;
  }
  private miniStats(p: PlayerData) { const n = p.gk ? ['TUF', 'RIF', 'PRE', 'POS', 'LIB', 'RIN'] : ['VEL', 'TIR', 'PAS', 'DRI', 'DIF', 'FIS', 'TES']; return p.stats.map((v, i) => `<span>${n[i]} ${v}</span>`).join(''); }
  private card(p: PlayerData) {
    const names = p.gk ? GK_STAT_NAMES : STAT_NAMES;
    const ps = (['e', 's', 't'] as const).map(t => p.ps[t].map(id => `<div class="ps ${t}"><b>${TIER_NAME[t]}</b> <span>${PS[id].n}</span><small>${PS[id].d}</small></div>`).join('')).join('');
    return `<div class="ov" data-a="nocard"><div class="modal cardm"><div class="hd"><button class="bt sm" data-a="nocard">Chiudi</button><h2>${p.name}</h2></div><div class="cgrid"><div>
      <p class="meta">${p.nat} · ${p.look.h} cm · piede ${p.look.foot === 'L' ? 'sinistro' : p.look.foot === 'R' ? 'destro' : 'ambidestro'}</p>
      <p class="meta"><b>${p.pos}</b> ${POS_NAME[p.pos]}${p.sec.length ? ' · secondarie: ' + p.sec.join(', ') : ''}</p><p class="bio">${p.bio}</p>
      <div class="stats">${p.stats.map((v, i) => `<div class="st"><span>${names[i]}</span><div class="bar"><div style="width:${v}%"></div></div><b>${v}</b></div>`).join('')}</div></div>
      <div><h3>PlayStyles (passivi)</h3>${ps}</div></div></div></div>`;
  }
  private players() {
    const fl: [string, string, Pos[]][] = [['ALL', 'Tutti', ORDER], ['POR', 'Portieri', ['POR']], ['DIF', 'Difensori', ['TD', 'TS', 'DC']], ['CEN', 'Centrocampisti', ['CDC', 'CC', 'COC']], ['ATT', 'Attaccanti', ['AD', 'AS', 'ATT']]];
    const cur = fl.find(f => f[0] === this.filter) ?? fl[0];
    return `<div class="panel">${this.head('Calciatori')}<div class="chips">${fl.map(f => `<button class="chip ${f[0] === cur[0] ? 'on' : ''}" data-a="filter:${f[0]}">${f[1]}</button>`).join('')}</div>
      <div class="pgrid">${PLAYERS.filter(p => cur[2].includes(p.pos)).map(p => `<button class="pcard" data-a="card:${p.id}"><b>${p.pos}</b><span>${p.name}</span><small>${p.nat}</small></button>`).join('')}</div></div>`;
  }
  private tactics() {
    const tac = this.sq.tac, tabs = [...TACTIC_SECTIONS.map(s => s.title), 'Istruzioni'], f = formation(tac.form), xi = this.match ? this.match.teams[this.match.cfg.human].ps.map(p => p.data) : resolve(this.sq.xi);
    let body = '';
    if (this.tab < TACTIC_SECTIONS.length) body = TACTIC_SECTIONS[this.tab].items.map(it => `<div class="opt"><h4>${it.label}</h4><div class="chips">${it.opts.map((o, i) => `<button class="chip ${(tac as unknown as Record<string, number>)[it.k] === i ? 'on' : ''}" data-a="tac:${it.k}=${i}">${o}</button>`).join('')}</div><p class="note">${it.help}</p></div>`).join('');
    else body = '<div class="ilist">' + f.slots.map((sl, i) => { const g = GRP[sl.r]; if (g === 'GK') return ''; return `<label class="irow"><span><b>${sl.r}</b> ${xi[i]?.short ?? ''}</span><select data-c="ins">${INSTR[g].map(o => `<option value="${i}=${o.id}" ${tac.instr[i] === o.id ? 'selected' : ''}>${o.label} — ${o.help}</option>`).join('')}</select></label>`; }).join('') + '</div>';
    return `<div class="panel">${this.head('Tattiche')}<div class="row2"><div class="grow"><div class="chips tabs">${tabs.map((t, i) => `<button class="chip ${i === this.tab ? 'on' : ''}" data-a="tab:${i}">${t}</button>`).join('')}</div>${body}</div>
      <div class="side"><label>Modulo <select data-c="form">${FORMATIONS.map(x => `<option ${x.id === tac.form ? 'selected' : ''} value="${x.id}">${x.id} — ${x.desc}</option>`).join('')}</select></label>${this.pitch(xi, tac.form, false)}</div></div></div>`;
  }
  private settings() {
    const st = this.save.set, row = (label: string, k: string, opts: [string, number][], cur: number) => `<div class="opt"><h4>${label}</h4><div class="chips">${opts.map(o => `<button class="chip ${o[1] === cur ? 'on' : ''}" data-a="set:${k}=${o[1]}">${o[0]}</button>`).join('')}</div></div>`;
    return `<div class="panel">${this.head('Impostazioni')}${row('Durata di un tempo', 'half', [['3 min', 180], ['4 min', 240], ['5 min', 300], ['6 min', 360]], st.half)}
      ${row('Difficoltà', 'dif', DIFFS.map((d, i) => [d, i] as [string, number]), st.dif)}${row('Qualità grafica', 'quality', [['Bassa', 0], ['Media', 1], ['Alta', 2]], st.quality)}
      ${row('Dimensione comandi', 'scale', [['Piccoli', 0.85], ['Normali', 1], ['Grandi', 1.18]], st.scale)}${row('Sensibilità joystick', 'sens', [['Bassa', 0.8], ['Normale', 1], ['Alta', 1.3]], st.sens)}
      ${row('Audio', 'sound', [['Attivo', 1], ['Spento', 0]], st.sound ? 1 : 0)}<button class="bt sm" data-a="full">Schermo intero</button></div>`;
  }
  private pre() {
    const sq = this.sq, xi = sq.xi.map(id => PLAYERS.find(p => p.id === id)!), st = this.save.set;
    return `<div class="panel">${this.head('Prepartita')}<div class="row2"><div class="grow">${this.pitch(xi, sq.tac.form, false)}</div><div class="side">
      <p class="meta"><b>${sq.tac.form}</b> · ${DIFFS[st.dif]} · ${st.half / 60} min per tempo</p>
      <button class="bt big" data-a="play">Calcio d’inizio</button><button class="bt" data-a="go:squad">Squadra e riserve</button><button class="bt" data-a="go:tactics">Tattiche</button><button class="bt" data-a="go:settings">Difficoltà e durata</button>
      <p class="note">L’avversario viene composto con i calciatori che non hai convocato, con modulo e tattiche propri.</p></div></div></div>`;
  }
  private pause() {
    return `<div class="home"><h1>PAUSA</h1><div class="col"><button class="bt big" data-a="resume">Riprendi</button><button class="bt" data-a="go:tactics">Tattiche</button><button class="bt" data-a="go:subs">Sostituzioni</button>
      <button class="bt" data-a="go:help">Comandi</button><button class="bt" data-a="quit">Abbandona partita</button></div></div>`;
  }
  private subs() {
    const m = this.match!, T = m.teams[m.cfg.human]; this.back = m.state === 'half' ? 'half' : 'pause';
    return `<div class="panel">${this.head('Sostituzioni')}<p class="note">Cambi rimasti: ${T.subs - T.pend.length}. Scegli chi esce, poi chi entra: il cambio avviene alla prossima interruzione.</p>${this.warn ? `<p class="warn">${this.warn}</p>` : ''}<div class="row2"><div class="grow"><h3>In campo</h3>
      ${T.ps.map((p, i) => `<button class="srow ${this.subSel === i ? 'on' : ''}" ${p.on ? `data-a="subp:${i}"` : 'disabled'}><b>${p.role}</b> ${p.data.short} <span class="stm"><i style="width:${p.st.toFixed(0)}%"></i></span>${p.yellow ? ' ▮' : ''}${p.on ? '' : ' (espulso)'}</button>`).join('')}</div>
      <div class="side"><h3>Panchina</h3>${T.bench.map((p, i) => `<button class="srow" data-a="subb:${i}"><b>${p.pos}</b> ${p.short}</button>`).join('') || '<p class="note">Nessuna riserva.</p>'}</div></div></div>`;
  }
  private report(s: string) {
    const m = this.match!, a = m.stats[0], b = m.stats[1], tp = a.poss + b.poss || 1, pc = (x: number, y: number) => (y ? Math.round(x / y * 100) : 0) + '%';
    const rows: [string, string | number, string | number][] = [['Possesso', pc(a.poss, tp), pc(b.poss, tp)], ['Tiri', a.shots, b.shots], ['Tiri in porta', a.onT, b.onT], ['Passaggi', a.pass, b.pass], ['Precisione passaggi', pc(a.passOk, a.pass), pc(b.passOk, b.pass)],
      ['Contrasti vinti', a.tackles, b.tackles], ['Parate', a.saves, b.saves], ['Falli', a.fouls, b.fouls], ['Calci d’angolo', a.corners, b.corners], ['Fuorigioco', a.offs, b.offs], ['Ammonizioni', a.yel, b.yel], ['Espulsioni', a.red, b.red]];
    const sc = (t: number) => m.scorers.filter(x => x.team === t).map(x => `${x.name} ${x.min}’`).join(', ');
    return `<div class="panel rep"><h2>${s === 'half' ? 'Intervallo' : 'Fine partita'}</h2><div class="final"><span>${m.teams[0].name}</span><b>${m.score[0]} - ${m.score[1]}</b><span>${m.teams[1].name}</span></div>
      <div class="scorers"><span>${sc(0)}</span><span>${sc(1)}</span></div><table>${rows.map(r => `<tr><td>${r[1]}</td><th>${r[0]}</th><td>${r[2]}</td></tr>`).join('')}</table>
      <div class="rowb">${s === 'half' ? '<button class="bt big" data-a="next">Secondo tempo</button><button class="bt" data-a="go:tactics">Tattiche</button><button class="bt" data-a="go:subs">Sostituzioni</button>' : '<button class="bt big" data-a="play">Rivincita</button><button class="bt" data-a="quit">Menu principale</button>'}</div></div>`;
  }
  private help() {
    this.back = this.match ? 'pause' : 'home';
    return `<div class="panel">${this.head('Comandi')}<div class="row2 helpg"><div><h3>Attacco</h3><p><b>Joystick</b> (metà sinistra): movimento e dribbling. I cambi di direzione vicino a un avversario producono finte contestuali, diverse per ogni calciatore.</p>
      <p><b>PASSA</b>: tocco = passaggio corto, tenuto = passaggio lungo/alto. <b>FILTR.</b>: passaggio nello spazio (tenuto = alto). <b>CROSS</b>: cross dalla fascia o lancio.</p>
      <p><b>TIRO</b>: tieni premuto per la potenza; joystick su/giù per scegliere il palo. Trascina il pulsante <b>verso l’alto</b> = tiro a giro, <b>verso il basso</b> = pallonetto. Premuto mentre il pallone arriva = tiro/passaggio di prima, al volo o di testa.</p><p><b>SCATTO</b>: consuma energia.</p></div>
      <div><h3>Difesa</h3><p><b>CONTR.</b>: tocco = contrasto, tenuto = pressione automatica sul portatore. <b>SCIVOL.</b>: scivolata (rischio fallo e cartellino). <b>CONTIENI</b>: accompagna l’avversario restando tra lui e la porta.</p>
      <p><b>CAMBIA</b>: seleziona il difensore meglio piazzato. <b>2° UOMO</b>: un compagno raddoppia la pressione.</p><p><b>TATTICA</b> (in alto a destra): sei comandi rapidi per la squadra, validi 25 secondi.</p>
      <p class="note">Tastiera: WASD/frecce, J passa·contrasto, K tiro·scivolata, L filtrante·cambia, I cross·contieni, O 2° uomo, Maiusc scatto, P pausa.</p></div></div></div>`;
  }
}
