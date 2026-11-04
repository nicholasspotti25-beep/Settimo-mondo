/**
 * Debug tools (TECH_SPEC debug menu): a pause-menu section shown when settings.debugMenu is on (toggled by the hidden
 * gesture: five quick taps on the pause title) with teleport to any altar or boss, invincibility, one-hit kills, give all
 * weapons and Forms, time of day, Metamondo meter and Eco, kill boss, hitbox display and the FPS + memory overlay; plus
 * the hitbox overlay itself: a 2D canvas drawing the sim's hurt volumes, the player's body, the active melee attack shapes
 * (Actor.forEachActiveShape), projectiles and hazards projected with the render camera (sim.debug.showHitboxes). Everything acts on the live sim.
 */
import type { ShapeDef, TimeOfDay } from '../core/types';
import { DEG, localToWorld, type Vec3 } from '../core/math';
import type { UiCtx } from './ctx';
import { h } from './dom';
import { ICONS } from './icons';
import { ProjVec } from './controls';
import { pill, rangeCtl, row, segCtl, toggleCtl, toggleRow, uiSound } from './screen';

const TODS: readonly TimeOfDay[] = ['alba', 'giorno', 'tramonto', 'notte'];

export interface DebugHost {
  /** Close the pause menu (world-changing actions run in the game). */
  closePause(): void;
  /** Fade out, run, fade back in once the zone streamed. */
  transition(fn: () => void): void;
  flash(text: string): void;
  /** Rebuild head + section (the hour changed). */
  relabel(): void;
}

/** Build the debug section into `p`. */
export function fillDebug(ctx: UiCtx, p: HTMLElement, host: DebugHost, tab: { v: 'altars' | 'bosses' }, rebuild: () => void): void {
  const { t } = ctx;
  const game = ctx.game;
  const sim = game.sim;
  const c = game.content;
  const st = sim.state;
  p.append(h('div', { class: 'sm-p it' }, t('ui.debug.hint')));

  // toggles
  p.append(h('div', { class: 'sm-h3' }, t('ui.debug.player')));
  const dtog = (label: string, sub: string, on: boolean, set: (v: boolean) => void) => toggleRow(ctx, label, sub, on, set);
  p.append(
    dtog(t('ui.debug.invincible'), t('ui.debug.invincible_d'), sim.debug.invincible, (v) => { sim.debug.invincible = v; }),
    dtog(t('ui.debug.one_hit'), t('ui.debug.one_hit_d'), sim.debug.oneHitKill, (v) => { sim.debug.oneHitKill = v; }),
    dtog(t('ui.debug.hitboxes'), t('ui.debug.hitboxes_d'), sim.debug.showHitboxes, (v) => { sim.debug.showHitboxes = v; }),
    dtog(t('ui.set.fps_show'), t('ui.debug.fps_d'), game.settings.showFps, (v) => game.applySettings({ ...game.settings, showFps: v })));

  // resources
  const meter = rangeCtl(0, 100, 5, Math.round(sim.meta.meter), (v) => `${Math.round(v)}`, (v) => {
    if (!sim.meta.active) sim.meta.meter = v;
  });
  p.append(row(t('ui.debug.meter'), t('ui.debug.meter_d'), meter.el, meter.val),
    h('div', { class: 'sm-pills' },
      pill(t('ui.debug.eco'), () => {
        uiSound(ctx, 'confirm');
        sim.player.eco = sim.bal.eco.max;
        host.flash(t('ui.debug.done'));
      }, { icon: ICONS.star }),
      pill(t('ui.debug.give_all'), () => {
        uiSound(ctx, 'confirm');
        // straight into the state: no 38 toasts
        for (const w of c.weapons) if (!st.weapons.includes(w.id)) st.weapons.push(w.id);
        for (const f of c.forms) if (!st.forms.includes(f.id)) st.forms.push(f.id);
        host.flash(t('ui.debug.given', { w: st.weapons.length, f: st.forms.length }));
      }, { icon: ICONS.armory }),
      pill(t('ui.debug.kill'), () => {
        if (!(sim.boss && sim.boss.alive)) {
          uiSound(ctx, 'deny');
          return;
        }
        uiSound(ctx, 'confirm');
        host.closePause();
        game.act((s) => s.debugKillBoss());
      }, { icon: ICONS.red, cls: 'danger', disabled: !(sim.boss && sim.boss.alive) })));

  // hour
  p.append(row(t('ui.debug.tod'), '', segCtl(ctx, TODS.map((v) => ({ v, label: t(`ui.tod.${v}`) })), st.timeOfDay, (v) => {
    game.meditate(v);
    host.relabel();
  })));

  // teleport
  p.append(h('div', { class: 'sm-h3' }, t('ui.debug.teleport')),
    segCtl(ctx, [{ v: 'altars' as const, label: t('ui.debug.altars') }, { v: 'bosses' as const, label: t('ui.debug.bosses') }], tab.v, (v) => {
      tab.v = v;
      rebuild();
    }));
  const go = (fn: () => void) => {
    uiSound(ctx, 'confirm');
    host.closePause();
    host.transition(() => game.act(fn));
  };
  const route = c.bundle.progression.acts.flatMap((a) => a.zones);
  const zi = (z: string) => (route.indexOf(z) < 0 ? 999 : route.indexOf(z));
  if (tab.v === 'altars') {
    const altars = [...c.bundle.altars].filter((a) => c.hasZone(a.zone)).sort((a, b) => zi(a.zone) - zi(b.zone));
    let zone = '';
    let chips: HTMLElement | null = null;
    for (const a of altars) {
      if (a.zone !== zone || !chips) {
        zone = a.zone;
        chips = h('div', { class: 'sm-chips' });
        p.append(h('div', { class: 'sm-small sm-dbgz' }, t(c.zone(a.zone).name_key)), chips);
      }
      const ch = h('button', { class: `sm-chip${a.id === sim.altarOpen || a.id === st.lastAltar ? ' sel' : ''}`, type: 'button' }, t(a.name_key));
      ch.addEventListener('click', () => go(() => {
        if (!st.visitedAltars.includes(a.id)) st.visitedAltars.push(a.id);
        sim.travel(a.zone, a.id);
      }));
      chips.appendChild(ch);
    }
  } else {
    const chips = h('div', { class: 'sm-chips' });
    for (const b of [...c.bosses].sort((x, y) => x.order - y.order)) {
      const ch = h('button', { class: `sm-chip${st.defeated.includes(b.id) ? ' done' : ''}`, type: 'button' }, `${b.order}. ${t(b.name_key)}`);
      ch.addEventListener('click', () => go(() => sim.startFightDirect(b.id, { skipIntro: true })));
      chips.appendChild(ch);
    }
    p.append(chips);
  }
}

/* ------------------------------------------------------------------------------------------------ hitbox overlay */

const HURT_MAX = 64;
/** Box corner index pairs (bit 0 = +x, bit 1 = +y, bit 2 = +z). */
const BOX_EDGES: readonly (readonly [number, number])[] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

export class HitboxOverlay {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private v = new ProjVec();
  private hurt: { x: number; y: number; z: number; r: number }[] = [];
  private w = 0;
  private hgt = 0;
  private dpr = 1;
  private shown = false;
  private wa: Vec3 = { x: 0, y: 0, z: 0 };
  private wb: Vec3 = { x: 0, y: 0, z: 0 };
  private corners: Vec3[] = [];
  /** Draw one active attack shape (same geometry as sim/shapes.ts shapeHits); bound once, no per-frame closure. */
  private drawShape = (shape: ShapeDef, origin: Vec3, yaw: number, scale: number, progress: number): void => {
    const a = this.wa, b = this.wb;
    switch (shape.type) {
      case 'sphere':
        this.at(origin, yaw, scale, shape.c, a);
        this.sphere(a.x, a.y, a.z, shape.r * scale);
        break;
      case 'capsule':
        this.at(origin, yaw, scale, shape.a, a);
        this.at(origin, yaw, scale, shape.b, b);
        this.sphere(a.x, a.y, a.z, shape.r * scale);
        this.sphere(b.x, b.y, b.z, shape.r * scale);
        this.line(a.x, a.y, a.z, b.x, b.y, b.z);
        break;
      case 'arc': {
        this.at(origin, yaw, scale, shape.c, a);
        const yb = shape.y ?? [-0.5, 3];
        const y = a.y + Math.max(yb[0] * scale, 0.05);
        const r = shape.r * scale, rin = (shape.r_in ?? 0) * scale;
        if (shape.angle >= 360) {
          this.arc(a.x, y, a.z, r, 0, Math.PI * 2);
          if (rin > 0) this.arc(a.x, y, a.z, rin, 0, Math.PI * 2);
        } else {
          const f = yaw + (shape.yaw ?? 0) * DEG, half = (shape.angle * DEG) / 2;
          this.arc(a.x, y, a.z, r, f - half, f + half);
          if (rin > 0) this.arc(a.x, y, a.z, rin, f + half, f - half);
          else this.line(a.x + Math.sin(f + half) * r, y, a.z + Math.cos(f + half) * r, a.x, y, a.z);
          this.line(a.x, y, a.z, a.x + Math.sin(f - half) * r, y, a.z + Math.cos(f - half) * r);
          if (rin > 0) {
            this.line(a.x + Math.sin(f - half) * rin, y, a.z + Math.cos(f - half) * rin, a.x + Math.sin(f - half) * r, y, a.z + Math.cos(f - half) * r);
            this.line(a.x + Math.sin(f + half) * rin, y, a.z + Math.cos(f + half) * rin, a.x + Math.sin(f + half) * r, y, a.z + Math.cos(f + half) * r);
          }
        }
        break;
      }
      case 'box': {
        this.at(origin, yaw, scale, shape.c, a);
        const by = yaw + (shape.yaw ?? 0) * DEG, sn = Math.sin(by), co = Math.cos(by);
        const hx = shape.half[0] * scale, hy = shape.half[1] * scale, hz = shape.half[2] * scale;
        const k = this.corners;
        for (let i = 0; i < 8; i++) {
          const lx = i & 1 ? hx : -hx, ly = i & 2 ? hy : -hy, lz = i & 4 ? hz : -hz;
          k[i].x = a.x + lx * co + lz * sn;
          k[i].y = a.y + ly;
          k[i].z = a.z - lx * sn + lz * co;
        }
        for (const [i, j] of BOX_EDGES) this.line(k[i].x, k[i].y, k[i].z, k[j].x, k[j].y, k[j].z);
        break;
      }
      case 'ring': {
        this.at(origin, yaw, scale, shape.c, a);
        const r = (shape.r0 + (shape.r1 - shape.r0) * Math.min(1, Math.max(0, progress))) * scale, w = (shape.width * scale) / 2;
        this.arc(a.x, a.y + 0.05, a.z, r + w, 0, Math.PI * 2);
        if (r - w > 0.05) this.arc(a.x, a.y + 0.05, a.z, r - w, 0, Math.PI * 2);
        break;
      }
      case 'cylinder':
        this.at(origin, yaw, scale, shape.c, a);
        this.arc(a.x, a.y, a.z, shape.r * scale, 0, Math.PI * 2);
        this.arc(a.x, a.y + shape.h * scale, a.z, shape.r * scale, 0, Math.PI * 2);
        break;
    }
  };

  constructor(private ctx: UiCtx) {
    this.el = h('canvas', { class: 'sm-hitbox sm-hidden' }) as HTMLCanvasElement;
    this.g = this.el.getContext('2d');
    for (let i = 0; i < HURT_MAX; i++) this.hurt.push({ x: 0, y: 0, z: 0, r: 0 });
    for (let i = 0; i < 8; i++) this.corners.push({ x: 0, y: 0, z: 0 });
  }

  update(on: boolean): void {
    const g = this.g;
    if (!on || !g) {
      if (this.shown) {
        this.shown = false;
        this.el.classList.add('sm-hidden');
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.el.classList.remove('sm-hidden');
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, hh = window.innerHeight;
    if (w !== this.w || hh !== this.hgt || dpr !== this.dpr) {
      this.w = w;
      this.hgt = hh;
      this.dpr = dpr;
      this.el.width = Math.round(w * dpr);
      this.el.height = Math.round(hh * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    const sim = this.ctx.game.sim;
    g.lineWidth = 1.5;
    // enemies (and parts): hurt spheres
    for (const a of sim.actors) {
      if (!a.alive || a.hidden) continue;
      const n = Math.min(HURT_MAX, a.bodyHurt(this.hurt));
      g.strokeStyle = a.team === 'enemy' ? 'rgba(90,220,255,.9)' : 'rgba(170,255,150,.85)';
      for (let i = 0; i < n; i++) this.sphere(this.hurt[i].x, this.hurt[i].y, this.hurt[i].z, this.hurt[i].r);
    }
    // player body: a circle at the feet, one at the head and the axis
    const pl = sim.player;
    const r = sim.bal.player.radius * pl.scale, ph = sim.bal.player.height * pl.scale;
    g.strokeStyle = 'rgba(150,255,140,.95)';
    this.ring(pl.pos.x, pl.pos.y, pl.pos.z, r);
    this.ring(pl.pos.x, pl.pos.y + ph, pl.pos.z, r);
    // active melee attack shapes (this tick's hit windows): orange
    g.strokeStyle = 'rgba(255,170,60,.95)';
    g.lineWidth = 2;
    for (const a of sim.actors) if (a.alive && !a.hidden) a.forEachActiveShape(this.drawShape);
    g.lineWidth = 1.5;
    // projectiles and hazards: red
    g.strokeStyle = 'rgba(255,90,70,.95)';
    sim.projectiles.forEachActive((pr) => this.sphere(pr.pos.x, pr.pos.y, pr.pos.z, pr.radius));
    sim.hazards.forEachActive((hz) => {
      const s = hz.shape as { r?: number };
      this.ring(hz.pos.x, hz.pos.y + 0.05, hz.pos.z, typeof s.r === 'number' ? s.r : 1);
    });
  }

  /** A shape point (local offset c, or the origin when c is absent) in world space. */
  private at(origin: Vec3, yaw: number, scale: number, c: readonly number[] | undefined, out: Vec3): void {
    if (c) localToWorld(origin, yaw, c[0], c[1], c[2], out, scale);
    else {
      out.x = origin.x;
      out.y = origin.y;
      out.z = origin.z;
    }
  }

  /** Project a world point; false when behind the camera. */
  private px(x: number, y: number, z: number): boolean {
    const v = this.v.set(x, y, z).project(this.ctx.game.renderer.rig.camera);
    if (v.z < -1 || v.z > 1) return false;
    v.x = (v.x * 0.5 + 0.5) * this.w;
    v.y = (-v.y * 0.5 + 0.5) * this.hgt;
    return true;
  }

  private sphere(x: number, y: number, z: number, r: number): void {
    if (!this.px(x, y, z)) return;
    const cx = this.v.x, cy = this.v.y;
    if (!this.px(x, y + r, z)) return;
    const sr = Math.max(2, Math.abs(cy - this.v.y));
    const g = this.g!;
    g.beginPath();
    g.arc(cx, cy, sr, 0, Math.PI * 2);
    g.stroke();
  }

  /** Horizontal ring of radius r around (x, y, z). */
  private ring(x: number, y: number, z: number, r: number): void {
    this.arc(x, y, z, r, 0, Math.PI * 2);
  }

  /** Horizontal arc of radius r around (x, y, z) from angle a0 to a1 (sim convention: direction (sin a, cos a) on x/z). */
  private arc(x: number, y: number, z: number, r: number, a0: number, a1: number): void {
    const g = this.g!;
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) / (Math.PI * 2)) * 24));
    g.beginPath();
    let open = false;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      if (!this.px(x + Math.sin(a) * r, y, z + Math.cos(a) * r)) {
        open = false;
        continue;
      }
      if (open) g.lineTo(this.v.x, this.v.y);
      else g.moveTo(this.v.x, this.v.y);
      open = true;
    }
    g.stroke();
  }

  private line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    if (!this.px(x0, y0, z0)) return;
    const sx = this.v.x, sy = this.v.y;
    if (!this.px(x1, y1, z1)) return;
    const g = this.g!;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(this.v.x, this.v.y);
    g.stroke();
  }
}
