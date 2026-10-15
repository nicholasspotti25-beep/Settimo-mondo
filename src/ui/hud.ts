/**
 * In-game HUD: thin Salute + Fiato bars, the Eco pips inside the Metamondo ring, Lacrime vials, status icons, ally bar,
 * boss bar (name + title, HP with phase ticks, Equilibrio under it) with small bars for parts that have their own Equilibrio or
 * HP, challenge marks for memory fights, the Colpo di Grazia prompt, the Colpo Rosso warning (shape + red edge; steady
 * when reduce-flashing is on), damage / low-health vignettes, perfect dodge / parry feedback, Transizione names, desktop
 * weapon trio and interact prompt, FPS / memory overlay. Everything reads the real sim; updates write the DOM only on change.
 */
import type { Actor } from '../sim/actor';
import type { SimEvent } from '../sim/types';
import type { StatusKind } from '../core/types';
import { h, s, svgIcon, setText, toggle, StyleCache, clamp01 } from './dom';
import { ICONS, STATUS_ICONS, weaponGlyph, promptIcon } from './icons';
import type { ResolvedLayout } from './layout';
import { replay, type UiCtx } from './ctx';

const STATUS_KINDS: StatusKind[] = ['slow', 'freeze', 'burn', 'blind', 'mute', 'madness', 'poison', 'void', 'root'];
const CHALLENGES = ['noDamage', 'singleWeapon', 'noLacrime', 'noMetamondo'] as const;
const RING_C = 2 * Math.PI * 44;
/** Eco pip arcs on r=33: three 100-degree arcs with 20-degree gaps, starting at the top. */
const PIP_R = 33;
const PIP_LEN = ((2 * Math.PI * PIP_R) * 100) / 360;

interface Bar { el: HTMLElement; fill: StyleCache; lag: StyleCache | null; lagV: number; lagHold: number; v: number }

function makeBar(cls: string, lag: boolean): Bar {
  const fill = h('i', { class: 'fill' });
  const lagEl = lag ? h('i', { class: 'lag' }) : null;
  const el = h('div', { class: `sm-bar ${cls}` }, lagEl, fill);
  return { el, fill: new StyleCache(fill), lag: lagEl ? new StyleCache(lagEl) : null, lagV: 1, lagHold: 0, v: 1 };
}

function setBar(b: Bar, v: number, dt: number): void {
  v = clamp01(v);
  if (v !== b.v) {
    if (v < b.v) b.lagHold = 0.55;
    b.v = v;
    b.fill.set('transform', `scaleX(${v.toFixed(4)})`);
  }
  if (!b.lag) return;
  if (b.lagV < v) b.lagV = v;
  else if (b.lagV > v) {
    if (b.lagHold > 0) b.lagHold -= dt;
    else b.lagV = Math.max(v, b.lagV - dt * 0.45);
  }
  b.lag.set('transform', `scaleX(${b.lagV.toFixed(4)})`);
}

interface PartView { root: HTMLElement; name: HTMLElement; hp: Bar; eq: Bar; idx: number }

export class Hud {
  readonly el: HTMLElement;
  private ring: HTMLElement;
  private ringCss: StyleCache;
  private metaArc: SVGCircleElement;
  private ecoArcs: SVGCircleElement[] = [];
  private seed: SVGGElement;
  private count: SVGTextElement;
  private pbars: HTMLElement;
  private pbarsCss: StyleCache;
  private salute = makeBar('salute', true);
  private fiato = makeBar('fiato', false);
  private vials: HTMLElement;
  private vialEls: HTMLElement[] = [];
  private status: HTMLElement;
  private statusEls = new Map<StatusKind, { el: HTMLElement; arc: SVGCircleElement; max: number }>();
  private ally: HTMLElement;
  private allyName: HTMLElement;
  private allyBar = makeBar('', false);
  private boss: HTMLElement;
  private bossCss: StyleCache;
  private bossName: HTMLElement;
  private bossTitle: HTMLElement;
  private bossHp = makeBar('boss', true);
  private bossEq = makeBar('equil', false);
  private ticks: HTMLElement[] = [];
  private tickFr: number[] = [];
  private parts: HTMLElement;
  private partViews: PartView[] = [];
  private chal: HTMLElement;
  private chalEls: HTMLElement[] = [];
  private bossActor: Actor | null = null;
  private grace: HTMLElement;
  private redwarn: HTMLElement;
  private rededge: HTMLElement;
  private redUntil = 0;
  private redActor = -1;
  private vignette: StyleCache;
  private vigV = 0;
  private lowvig: StyleCache;
  private pd: HTMLElement;
  private pdText: HTMLElement;
  private trans: HTMLElement;
  private transCss: StyleCache;
  private trio: HTMLElement;
  private trioEls: { el: HTMLElement; glyph: string | null }[] = [];
  private prompt: HTMLElement;
  private promptText: HTMLElement;
  private promptIco: HTMLElement;
  private promptKey = '';
  private fps: HTMLElement;
  private fpsT = 0;
  private time = 0;
  private L: ResolvedLayout | null = null;
  private touchOn = false;
  private lastHp = -1;
  private readyFlash = false;
  /** Colpo di Grazia state this frame: 0 none, 1 Spezzato target out of reach, 2 available (light button glow). */
  graceLevel: 0 | 1 | 2 = 0;

  constructor(private readonly ctx: UiCtx) {
    // ring: Metamondo track (outer) + three Eco pips (inner) + seed core
    const svg = s('svg', { viewBox: '-50 -50 100 100' });
    svg.innerHTML =
      `<defs><linearGradient id="sm-g-meta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6c49c"/><stop offset=".5" stop-color="#ead09a"/><stop offset="1" stop-color="#fff3d2"/></linearGradient>` +
      `<linearGradient id="sm-g-meta-on" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b48cff"/><stop offset=".55" stop-color="#f0b49c"/><stop offset="1" stop-color="#fff6dc"/></linearGradient></defs>` +
      `<circle class="halo" r="46"/><circle class="trk" r="44" stroke-width="5"/><circle class="meta-hair" r="48.6"/>`;
    this.metaArc = s('circle', { class: 'meta', r: 44, 'stroke-width': 4, transform: 'rotate(-90)', 'stroke-dasharray': `${RING_C} ${RING_C}`, 'stroke-dashoffset': RING_C });
    svg.appendChild(this.metaArc);
    for (let i = 0; i < 3; i++) {
      const rot = -90 + 10 + i * 120;
      svg.appendChild(s('circle', { class: 'eco-trk', r: PIP_R, 'stroke-width': 5, transform: `rotate(${rot})`, 'stroke-dasharray': `${PIP_LEN} 999` }));
      const arc = s('circle', { class: 'eco', r: PIP_R, 'stroke-width': 5, transform: `rotate(${rot})`, 'stroke-dasharray': `0 999` });
      this.ecoArcs.push(arc);
      svg.appendChild(arc);
    }
    svg.appendChild(s('circle', { class: 'core', r: 26 }));
    this.seed = s('g', { class: 'seed', transform: 'translate(-13 -13) scale(1.0833)' });
    this.seed.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${ICONS.seed}</g>`;
    svg.appendChild(this.seed);
    this.count = s('text', { class: 'count', x: 0, y: 1 });
    svg.appendChild(this.count);
    this.ring = h('div', { class: 'sm-ring' }, svg);
    this.ringCss = new StyleCache(this.ring);

    this.vials = h('div', { class: 'sm-vials' });
    this.status = h('div', { class: 'sm-status' });
    this.allyName = h('span');
    this.ally = h('div', { class: 'sm-ally sm-hidden' }, this.allyName, this.allyBar.el);
    this.pbars = h('div', { class: 'sm-pbars' }, this.salute.el, this.fiato.el, h('div', { class: 'sm-pmeta' }, this.vials, this.status, this.ally));
    this.pbarsCss = new StyleCache(this.pbars);

    this.bossName = h('b');
    this.bossTitle = h('span');
    this.parts = h('div', { class: 'sm-parts' });
    this.chal = h('div', { class: 'sm-chal' });
    this.boss = h('div', { class: 'sm-boss' }, this.parts, this.chal, h('div', { class: 'sm-boss-name' }, this.bossName, this.bossTitle), this.bossHp.el, this.bossEq.el);
    this.bossCss = new StyleCache(this.boss);

    this.grace = h('div', { class: 'sm-grace' }, h('i', null, svgIcon(ICONS.grace)), h('span', null, ''));
    this.redwarn = h('div', { class: 'sm-redwarn' }, svgIcon(ICONS.red));
    this.rededge = h('div', { class: 'sm-rededge' });
    const vig = h('div', { class: 'sm-vignette' });
    this.vignette = new StyleCache(vig);
    const low = h('div', { class: 'sm-lowvig' });
    this.lowvig = new StyleCache(low);
    this.pd = h('div', { class: 'sm-pd' });
    this.pdText = h('div', { class: 'sm-pdtext' });
    this.trans = h('div', { class: 'sm-trans' });
    this.transCss = new StyleCache(this.trans);
    this.trio = h('div', { class: 'sm-trio sm-hidden' });
    for (let i = 0; i < 3; i++) {
      const el = h('div', { class: 'sm-trio-w' });
      this.trioEls.push({ el, glyph: null });
      this.trio.appendChild(el);
    }
    this.promptIco = h('i');
    this.promptText = h('span');
    this.prompt = h('div', { class: 'sm-prompt' }, this.promptIco, this.promptText);
    this.fps = h('div', { class: 'sm-fps sm-hidden' });

    this.el = h('div', { class: 'sm-layer sm-hud' },
      vig, low, this.rededge, this.pd, this.pdText, this.ring, this.pbars, this.boss, this.grace, this.redwarn, this.trans, this.trio, this.prompt, this.fps);
  }

  /** Place the HUD from the resolved touch layout (ring corner, mirrored bars, boss bar between the thumbs). */
  layout(L: ResolvedLayout, touchOn: boolean): void {
    this.L = L;
    this.touchOn = touchOn;
    const r = L.ring;
    this.ringCss.set('left', `${r.cx}px`);
    this.ringCss.set('top', `${r.cy}px`);
    this.ringCss.set('width', `${r.r * 2}px`);
    this.ringCss.set('height', `${r.r * 2}px`);
    toggle(this.pbars, 'mir', L.mirrored);
    const gap = Math.max(8, r.r * 0.32);
    if (L.mirrored) {
      this.pbarsCss.set('left', 'auto');
      this.pbarsCss.set('right', `${L.view.w - (r.cx - r.r - gap)}px`);
    } else {
      this.pbarsCss.set('right', 'auto');
      this.pbarsCss.set('left', `${r.cx + r.r + gap}px`);
    }
    this.pbarsCss.set('top', `${r.cy - r.r * 0.62}px`);
    // boss bar: centered in the widest free span of the bottom band (touch buttons must not cover it)
    let lo = L.safe.x + L.safe.w * 0.2, hi = L.safe.x + L.safe.w * 0.8;
    if (touchOn) {
      const band = L.view.h - 48 * (L.unit / 560) - 10;
      const pad = 10;
      for (const b of L.buttons) {
        if (b.anchor || b.id === 'interact' || b.cy + b.r < band) continue;
        if (b.cx > L.view.w / 2) hi = Math.min(hi, b.cx - b.r - pad);
        else lo = Math.max(lo, b.cx + b.r + pad);
      }
    }
    const w = Math.min(640, Math.max(200, hi - lo));
    this.bossCss.set('width', `${w}px`);
    this.bossCss.set('left', `${(lo + hi) / 2}px`);
    toggle(this.trio, 'sm-hidden', touchOn);
    toggle(this.prompt, 'touch', touchOn);
  }

  onEvent(e: SimEvent): void {
    const game = this.ctx.game;
    switch (e.type) {
      case 'attackTelegraph':
        if (e.red) {
          this.redUntil = this.time + Math.max(0.5, e.duration + 0.25);
          this.redActor = e.actor;
        }
        break;
      case 'attackWillHit':
        if (e.red) {
          this.redUntil = Math.max(this.redUntil, this.time + e.timeToImpact + 0.15);
          this.redActor = e.actor;
        }
        break;
      case 'attackActive':
        if (e.actor === this.redActor && this.redUntil > this.time) this.redUntil = Math.min(this.redUntil, this.time + 0.18);
        break;
      case 'playerHurt': {
        const p = game.sim.player;
        const k = Math.min(1, 0.35 + (e.amount / Math.max(1, p.hpMax)) * 3);
        this.vigV = Math.max(this.vigV, game.settings.reduceFlashing ? k * 0.6 : k);
        break;
      }
      case 'perfectDodge':
        this.flashPerfect(false);
        break;
      case 'parry':
        this.flashPerfect(true);
        break;
      case 'transizione': {
        const tr = game.content.bundle.transitions.find((t) => t.id === e.id);
        const name = tr ? this.ctx.tOpt(tr.name_key) : '';
        if (name) {
          setText(this.trans, name);
          const L = this.L;
          const slot = L?.byId[`slot_${game.sim.player.activeSlot + 1}`];
          if (this.touchOn && slot) {
            this.transCss.set('left', `${slot.cx}px`);
            this.transCss.set('top', `${slot.cy + slot.r + 14}px`);
          } else {
            this.transCss.set('left', '50%');
            this.transCss.set('top', '30%');
          }
          replay(this.trans, 'go');
        }
        break;
      }
      case 'metamondoReady':
        this.readyFlash = true;
        break;
      case 'metamondoStart':
      case 'fightStart':
      case 'fightEnd':
        this.redUntil = 0;
        break;
      default:
        break;
    }
  }

  private flashPerfect(parry: boolean): void {
    toggle(this.pd, 'parry', parry);
    replay(this.pd, 'go');
    setText(this.pdText, this.ctx.t(parry ? 'ui.hud.perfect_parry' : 'ui.hud.perfect_dodge'));
    replay(this.pdText, 'go');
  }

  update(dt: number, visible: boolean): void {
    this.time += dt;
    toggle(this.el, 'dim', !visible);
    const game = this.ctx.game;
    const sim = game.sim;
    const p = sim.player;
    if (!visible) {
      this.graceLevel = 0;
      toggle(this.redwarn, 'on', false);
      toggle(this.rededge, 'on', false);
      return;
    }

    // --- player bars
    setBar(this.salute, p.hp / Math.max(1, p.hpMax), dt);
    toggle(this.salute.el, 'low', p.hp > 0 && p.hp < p.hpMax * 0.3);
    setBar(this.fiato, p.fiato / Math.max(1, p.fiatoMax), dt);
    toggle(this.fiato.el, 'empty', p.fiato < 8);
    const lowK = p.hp > 0 && p.hp < p.hpMax * 0.3 ? 1 - p.hp / (p.hpMax * 0.3) : 0;
    this.lowvig.set('opacity', (lowK * 0.9).toFixed(2));
    if (p.hp < this.lastHp - 0.01 && this.vigV < 0.3) this.vigV = 0.3;
    this.lastHp = p.hp;
    this.vigV = Math.max(0, this.vigV - dt * 1.6);
    this.vignette.set('opacity', this.vigV.toFixed(2));

    // --- vials
    while (this.vialEls.length < p.lacrimeMax) {
      const v = h('div', { class: 'sm-vial' }, svgIcon(ICONS.lacrime));
      this.vialEls.push(v);
      this.vials.appendChild(v);
    }
    for (let i = 0; i < this.vialEls.length; i++) {
      const el = this.vialEls[i];
      toggle(el, 'sm-hidden', i >= p.lacrimeMax);
      toggle(el, 'used', i >= p.lacrime);
    }

    // --- status icons
    for (const k of STATUS_KINDS) {
      const left = p.statuses[k] ?? 0;
      let v = this.statusEls.get(k);
      if (left > 0 && !v) {
        const arc = s('circle', { cx: 12, cy: 12, r: 11, 'stroke-dasharray': `${2 * Math.PI * 11} 999` });
        const tm = s('svg', { class: 'tm', viewBox: '0 0 24 24' }, arc);
        const el = h('div', { class: `sm-st ${k}`, title: this.ctx.t(`ui.status.${k}`) }, svgIcon(STATUS_ICONS[k] ?? ICONS.star), tm);
        v = { el, arc, max: left };
        this.statusEls.set(k, v);
        this.status.appendChild(el);
      }
      if (!v) continue;
      if (left <= 0) {
        v.el.remove();
        this.statusEls.delete(k);
        continue;
      }
      if (left > v.max) v.max = left;
      v.arc.setAttribute('stroke-dashoffset', ((1 - left / v.max) * 2 * Math.PI * 11).toFixed(1));
    }

    // --- ally (Ouranthos)
    const ally = sim.ally;
    toggle(this.ally, 'sm-hidden', !ally || !ally.alive);
    if (ally && ally.alive) {
      setText(this.allyName, this.ctx.tOpt((ally.def as { name_key?: string }).name_key ?? ''));
      setBar(this.allyBar, ally.hp / Math.max(1, ally.hpMax), dt);
    }

    // --- Metamondo ring + Eco pips
    const meta = sim.meta;
    const frac = clamp01(meta.fraction);
    this.metaArc.setAttribute('stroke-dashoffset', (RING_C * (1 - frac)).toFixed(1));
    toggle(this.ring, 'ready', meta.ready && !!sim.fight?.active);
    toggle(this.ring, 'active', meta.active);
    const segs = p.eco / 100;
    for (let i = 0; i < 3; i++) {
      const f = clamp01(segs - i);
      this.ecoArcs[i].setAttribute('stroke-dasharray', `${(PIP_LEN * f).toFixed(2)} 999`);
      toggle(this.ecoArcs[i], 'full', f >= 1);
    }
    const showCount = meta.active;
    toggle(this.seed, 'sm-hidden', showCount);
    toggle(this.count, 'sm-hidden', !showCount);
    if (showCount) setText(this.count, String(Math.max(0, Math.ceil(meta.duration - meta.time))));
    if (this.readyFlash) {
      this.readyFlash = false;
      replay(this.ring, 'deny');
    }

    // --- boss bar
    this.updateBoss(dt);

    // --- Colpo di Grazia prompt
    const g = (this.graceLevel = this.graceState());
    toggle(this.grace, 'on', g === 2);
    toggle(this.grace, 'far', g === 1);
    if (g) setText(this.grace.lastChild as HTMLElement, this.ctx.t('ui.hud.grace'));

    // --- Colpo Rosso
    const red = this.redUntil > this.time;
    toggle(this.redwarn, 'on', red);
    toggle(this.rededge, 'on', red);

    // --- desktop weapon trio
    if (!this.touchOn) {
      for (let i = 0; i < 3; i++) {
        const w = p.weapons[i] ?? null;
        const def = w && game.content.hasWeapon(w) ? game.content.weapon(w) : null;
        const t = this.trioEls[i];
        const glyph = def ? def.type : null;
        if (glyph !== t.glyph) {
          t.glyph = glyph;
          t.el.textContent = '';
          if (glyph) t.el.appendChild(svgIcon(weaponGlyph(glyph)));
        }
        toggle(t.el, 'cur', i === p.activeSlot);
        toggle(t.el, 'empty', !def);
      }
    }

    // --- interact prompt (label above the touch button, or a centered line on desktop)
    const pr = sim.prompt;
    const key = pr && !sim.seq.running && !sim.altarOpen ? pr.promptKey : '';
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.promptIco.textContent = '';
      if (key) {
        this.promptIco.appendChild(svgIcon(promptIcon(key)));
        setText(this.promptText, this.ctx.t(key));
      }
    }
    toggle(this.prompt, 'on', !!key && !this.touchOn);

    // --- FPS / memory overlay
    const showFps = game.settings.showFps;
    toggle(this.fps, 'sm-hidden', !showFps);
    if (showFps && (this.fpsT -= dt) <= 0) {
      this.fpsT = 0.5;
      const st = game.renderer.stats;
      const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      setText(this.fps, `${st.fps.toFixed(0)} fps  ${st.frameMs.toFixed(1)} ms  ${st.calls} dc  ${(st.triangles / 1000).toFixed(0)}k tri` +
        (mem ? `  ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''));
    }
  }

  /** 0 = none, 1 = a Spezzato target exists but is out of reach, 2 = Colpo di Grazia available now. */
  private graceState(): 0 | 1 | 2 {
    const sim = this.ctx.game.sim;
    const p = sim.player;
    const range = sim.bal.equilibrio.grace_range;
    let best = 0 as 0 | 1 | 2;
    for (const a of sim.actors) {
      if (a.team !== 'enemy' || !a.alive) continue;
      if (a.state === 'spezzato' && !a.graced) {
        const d = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - a.radius * a.scale;
        best = d <= range ? 2 : (best || 1);
      }
      for (const part of a.parts) {
        if (part.spezzato <= 0 || part.graced || !part.active || part.broken) continue;
        const d = Math.hypot(part.center.x - p.pos.x, part.center.z - p.pos.z);
        best = d <= range + 1 ? 2 : (best || 1);
      }
      if (best === 2) return 2;
    }
    return best;
  }

  private updateBoss(dt: number): void {
    const sim = this.ctx.game.sim;
    const b = sim.boss;
    const show = !!(b && sim.fight && !sim.fight.intro && !sim.fight.ended && b.bossDef && !b.hidden);
    toggle(this.boss, 'on', show);
    if (!b || !b.bossDef) return;
    if (b !== this.bossActor) this.bindBoss(b);
    const hpF = b.hp / Math.max(1, b.hpMax);
    setBar(this.bossHp, hpF, dt);
    for (let i = 0; i < this.ticks.length; i++) toggle(this.ticks[i], 'past', hpF < this.tickFr[i]);
    const eqF = b.poiseMax > 0 ? b.poise / b.poiseMax : 0;
    setBar(this.bossEq, eqF, dt);
    toggle(this.bossEq.el, 'hot', eqF > 0.75 && b.state !== 'spezzato');
    toggle(this.bossEq.el, 'broken', b.state === 'spezzato');
    toggle(this.bossEq.el, 'sm-hidden', b.poiseMax <= 0);
    const lock = sim.player.lock;
    for (const pv of this.partViews) {
      const part = b.parts[pv.idx];
      toggle(pv.root, 'sm-hidden', !part.active);
      toggle(pv.root, 'broken', part.broken);
      toggle(pv.root, 'spez', part.spezzato > 0);
      toggle(pv.root, 'locked', !!lock && lock.actor === b.id && lock.part === part.index);
      if (part.hpMax > 0) setBar(pv.hp, part.hp / part.hpMax, dt);
      if (part.poiseMax > 0) setBar(pv.eq, part.poise / part.poiseMax, dt);
    }
    if (sim.fight?.memory) {
      const pl = sim.player;
      const fail = [pl.tookDamage, pl.weaponsUsed.size > 1, pl.drank, pl.usedMetamondo];
      CHALLENGES.forEach((c, i) => {
        const el = this.chalEls[i];
        toggle(el, 'sm-hidden', !sim.challenges[c]);
        toggle(el, 'fail', fail[i]);
      });
    }
  }

  private bindBoss(b: Actor): void {
    this.bossActor = b;
    const def = b.bossDef!;
    setText(this.bossName, this.ctx.t(def.name_key));
    setText(this.bossTitle, def.title_key ? this.ctx.tOpt(def.title_key) : '');
    for (const t of this.ticks) t.remove();
    this.ticks = [];
    this.tickFr = [];
    for (let i = 1; i < def.phases.length; i++) {
      const f = def.phases[i].hp_range[0];
      if (f <= 0 || f >= 1) continue;
      const t = h('i', { class: 'tick', style: `left:${(f * 100).toFixed(2)}%` });
      this.bossHp.el.appendChild(t);
      this.ticks.push(t);
      this.tickFr.push(f);
    }
    this.parts.textContent = '';
    this.partViews = [];
    for (const part of b.parts) {
      if (part.poiseMax <= 0 && part.hpMax <= 0) continue;
      const hp = makeBar('hp', false);
      const eq = makeBar('eq', false);
      const name = h('div', null, part.def.name_key ? this.ctx.tOpt(part.def.name_key) : '');
      if (part.hpMax <= 0) hp.el.classList.add('sm-hidden');
      if (part.poiseMax <= 0) eq.el.classList.add('sm-hidden');
      const root = h('div', { class: 'sm-part' }, name, hp.el, eq.el);
      this.parts.appendChild(root);
      this.partViews.push({ root, name, hp, eq, idx: part.index });
    }
    this.chal.textContent = '';
    this.chalEls = CHALLENGES.map((c) => {
      const el = h('i', { class: 'sm-hidden', title: this.ctx.t(`ui.hud.challenge.${c}`) }, svgIcon(c === 'noDamage' ? ICONS.heart : c === 'singleWeapon' ? ICONS.armory : c === 'noLacrime' ? ICONS.lacrime : ICONS.forms));
      this.chal.appendChild(el);
      return el;
    });
  }

  /** Language changed: rebind names. */
  relabel(): void {
    this.bossActor = null;
    this.promptKey = '\u0000';
    for (const [k, v] of this.statusEls) v.el.setAttribute('title', this.ctx.t(`ui.status.${k}`));
  }
}
