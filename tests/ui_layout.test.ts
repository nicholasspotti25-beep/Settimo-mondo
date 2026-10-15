/** Pure touch-layout math (src/ui/layout.ts) against the shipped presets (data/ui/touch_*.yaml via the generated bundle). */
import { describe, expect, it } from 'vitest';
import contentJson from '../src/generated/content.json';
import type { ContentBundle, TouchLayoutDef } from '../src/core/types';
import {
  BUTTON_IDS, circlesOverlap, clampBase, classifyFlick, controlsOpacity, followBase, hitButton, hudRing, isDoubleTap, isTap,
  normalizeLayout, pickPresetId, resolveLayout, stickVector, toFraction, unitFor, type Rect,
} from '../src/ui/layout';

const bundle = contentJson as unknown as ContentBundle;
const layouts = bundle.touch_layouts;
const VIEWS: [number, number][] = [[844, 390], [932, 430], [667, 375], [1180, 820], [1366, 1024]];
const full = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

describe('touch presets', () => {
  it('ship the three presets with every canonical button', () => {
    for (const id of ['touch_default', 'touch_small_phone', 'touch_tablet']) {
      expect(layouts[id], id).toBeTruthy();
      for (const b of BUTTON_IDS) expect(layouts[id].buttons[b], `${id}.${b}`).toBeTruthy();
    }
  });

  it('pick the preset by device size', () => {
    expect(pickPresetId(844, 390)).toBe('touch_default');
    expect(pickPresetId(667, 375)).toBe('touch_small_phone');
    expect(pickPresetId(1366, 1024)).toBe('touch_tablet');
    expect(pickPresetId(390, 844)).toBe('touch_default');
  });

  for (const [w, h] of VIEWS) {
    for (const large of [false, true]) {
      it(`buttons stay inside the safe area and never overlap at ${w}x${h}${large ? ' (large)' : ''}`, () => {
        const safe = { x: 44, y: 0, w: w - 88, h: h - 21 };
        const L = resolveLayout(layouts[pickPresetId(w, h)], { w, h }, safe, { mirror: false, large });
        const free = L.buttons.filter((b) => !b.anchor);
        for (const b of free) {
          expect(b.cx - b.r).toBeGreaterThanOrEqual(safe.x - 0.01);
          expect(b.cx + b.r).toBeLessThanOrEqual(safe.x + safe.w + 0.01);
          expect(b.cy - b.r).toBeGreaterThanOrEqual(safe.y - 0.01);
          expect(b.cy + b.r).toBeLessThanOrEqual(safe.y + safe.h + 0.01);
        }
        for (let i = 0; i < free.length; i++) {
          for (let j = i + 1; j < free.length; j++) {
            // the contextual interact button may sit between the thumbs and the main cluster
            if (free[i].id === 'interact' || free[j].id === 'interact') continue;
            expect(circlesOverlap(free[i], free[j]), `${free[i].id} vs ${free[j].id}`).toBe(false);
          }
        }
        // the HUD ring (Metamondo button) does not collide with Lacrime
        expect(circlesOverlap(L.ring, L.byId.lacrime)).toBe(false);
      });
    }
  }
});

describe('resolveLayout', () => {
  const def = layouts.touch_default;

  it('mirrors for left-handed play', () => {
    const R = resolveLayout(def, { w: 844, h: 390 }, full(844, 390), { mirror: false, large: false });
    const M = resolveLayout(def, { w: 844, h: 390 }, full(844, 390), { mirror: true, large: false });
    expect(M.byId.light.cx).toBeCloseTo(844 - R.byId.light.cx, 5);
    expect(M.byId.light.cy).toBeCloseTo(R.byId.light.cy, 5);
    expect(M.stick.zone.x).toBeCloseTo(844 - (R.stick.zone.x + R.stick.zone.w), 5);
    expect(M.ring.cx).toBeGreaterThan(844 / 2);
    expect(R.ring.cx).toBeLessThan(844 / 2);
  });

  it('scales buttons in large mode and anchors Metamondo to the ring', () => {
    const N = resolveLayout(def, { w: 844, h: 390 }, full(844, 390), { mirror: false, large: false });
    const B = resolveLayout(def, { w: 844, h: 390 }, full(844, 390), { mirror: false, large: true });
    expect(B.byId.light.r / N.byId.light.r).toBeCloseTo(1.22, 5);
    expect(N.byId.metamondo.anchor).toBe('eco_ring');
    expect(N.byId.metamondo.cx).toBe(N.ring.cx);
  });

  it('keeps the unit (thumb size) bounded from phones to tablets', () => {
    expect(unitFor(full(667, 375))).toBeCloseTo(375 * 1.45, 5);
    expect(unitFor(full(1366, 1024))).toBe(400 * 1.45);
    expect(unitFor(full(600, 250))).toBe(300 * 1.45);
    const r = hudRing(full(844, 390), unitFor(full(844, 390)), false);
    expect(r.r).toBeGreaterThanOrEqual(22);
    expect(r.r).toBeLessThanOrEqual(46);
    expect(hudRing(full(1366, 1024), 580, false).r).toBe(46);
  });

  it('round-trips positions through toFraction (with mirror)', () => {
    const safe = { x: 40, y: 10, w: 760, h: 360 };
    for (const mirror of [false, true]) {
      const L = resolveLayout(def, { w: 844, h: 390 }, safe, { mirror, large: false });
      const b = L.byId.heavy;
      const [fx, fy] = toFraction(b.cx, b.cy, safe, mirror);
      expect(fx).toBeCloseTo((def.buttons.heavy as { pos: [number, number] }).pos[0], 2);
      expect(fy).toBeCloseTo((def.buttons.heavy as { pos: [number, number] }).pos[1], 2);
    }
  });

  it('normalizes old saved layouts with missing controls', () => {
    const old = JSON.parse(JSON.stringify(def)) as TouchLayoutDef;
    delete old.buttons.interact;
    delete (old as Partial<TouchLayoutDef>).opacity;
    const n = normalizeLayout(old, def);
    expect(n.buttons.interact).toEqual(def.buttons.interact);
    expect(n.opacity).toEqual(def.opacity);
    expect(old.buttons.interact).toBeUndefined();
  });
});

describe('gesture math', () => {
  it('stick: dead zone, ramp, sprint ring', () => {
    expect(stickVector(5, 0, 10, 80).mag).toBe(0);
    const half = stickVector(45, 0, 10, 80);
    expect(half.mag).toBeCloseTo(0.5, 5);
    expect(half.x).toBeCloseTo(0.5, 5);
    expect(half.sprint).toBe(false);
    const up = stickVector(0, -100, 10, 80);
    expect(up.y).toBeCloseTo(1, 5);
    expect(up.sprint).toBe(true);
  });

  it('floating base follows the thumb and stays in the safe area', () => {
    const base = followBase({ x: 100, y: 100 }, 250, 100, 50);
    expect(base.x).toBeCloseTo(200, 5);
    expect(base.y).toBe(100);
    const c = clampBase(5, 380, 50, full(844, 390));
    expect(c).toEqual({ x: 50, y: 340 });
  });

  it('classifies flicks, taps and double taps', () => {
    expect(classifyFlick(80, 5, 150, 844)).toBe(1);
    expect(classifyFlick(-80, 5, 150, 844)).toBe(-1);
    expect(classifyFlick(80, 5, 600, 844)).toBe(0);
    expect(classifyFlick(60, 70, 150, 844)).toBe(0);
    expect(classifyFlick(20, 0, 100, 844)).toBe(0);
    expect(isTap(4, 3, 120)).toBe(true);
    expect(isTap(30, 0, 120)).toBe(false);
    expect(isDoubleTap({ t: 0, x: 100, y: 100 }, { t: 200, x: 110, y: 104 })).toBe(true);
    expect(isDoubleTap({ t: 0, x: 100, y: 100 }, { t: 500, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap({ t: 0, x: 100, y: 100 }, { t: 200, x: 300, y: 100 })).toBe(false);
    expect(isDoubleTap(null, { t: 200, x: 300, y: 100 })).toBe(false);
  });

  it('hit testing picks the closest relative button and honours the filter', () => {
    const L = resolveLayout(layouts.touch_default, { w: 844, h: 390 }, full(844, 390), { mirror: false, large: false });
    const light = L.byId.light;
    expect(hitButton(L.buttons, light.cx, light.cy, 6)?.id).toBe('light');
    expect(hitButton(L.buttons, light.cx, light.cy, 6, (b) => b.id !== 'light')).toBeNull();
    expect(hitButton(L.buttons, 400, 200, 6)).toBeNull();
  });

  it('fades the controls after idling', () => {
    const op = { active: 0.85, idle: 0.35 };
    expect(controlsOpacity(0, op, true)).toBe(0.85);
    expect(controlsOpacity(10, op, true)).toBeCloseTo(0.35, 5);
    expect(controlsOpacity(10, op, false)).toBe(0.85);
  });
});
