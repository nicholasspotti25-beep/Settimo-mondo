/** Pure helpers of the UI screens: layout editor placement/overlaps, settings calibration, title slots, creator looks. */
import { describe, expect, it } from 'vitest';
import contentJson from '../src/generated/content.json';
import type { ContentBundle } from '../src/core/types';
import { normalizeLayout, resolveLayout, type Circle, type Rect } from '../src/ui/layout';
import { overlapping, panelSpot, rectHitsCircle } from '../src/ui/editor';
import { BUFFER_MAX, BUFFER_MIN, LATENCY_MAX, estimateLatency, snap } from '../src/ui/calib';
import { latestSlot } from '../src/ui/title';
import { NAME_MAX, mixHex, sanitizeLook, wrapIndex } from '../src/ui/creator';
import type { GameStateData } from '../src/sim/gamestate';

const bundle = contentJson as unknown as ContentBundle;
const layouts = bundle.touch_layouts;
const VIEWS: [number, number][] = [[844, 390], [932, 430], [667, 375], [1280, 576], [1180, 820], [1366, 1024]];
const PRESET_FOR: Record<string, string> = { '667x375': 'touch_small_phone', '1180x820': 'touch_tablet', '1366x1024': 'touch_tablet' };

describe('layout editor', () => {
  it('rectHitsCircle uses the closest point of the rect', () => {
    const c: Circle = { cx: 50, cy: 50, r: 10 };
    expect(rectHitsCircle(0, 0, 45, 45, c)).toBe(true); // corner (45,45) is 7 px away
    expect(rectHitsCircle(0, 0, 35, 35, c)).toBe(false); // corner 21 px away
    expect(rectHitsCircle(0, 0, 35, 35, c, 12)).toBe(true);
    expect(rectHitsCircle(45, 0, 10, 100, c)).toBe(true); // circle center inside the rect's x span
  });

  it('places the panel over no control for every preset, both hands, at every brief viewport', () => {
    const base = layouts.touch_default;
    for (const [w, h] of VIEWS) {
      const id = PRESET_FOR[`${w}x${h}`] ?? 'touch_default';
      const def = normalizeLayout(layouts[id], base);
      for (const mirror of [false, true]) {
        const safe: Rect = { x: 0, y: 0, w, h };
        const L = resolveLayout(def, { w, h }, safe, { mirror, large: false });
        const circles: Circle[] = [...L.buttons.filter((b) => !b.anchor), L.ring];
        const pw = Math.min(300, w * 0.44), ph = 230; // the panel is at most ~230 px tall (globals or inspector, see editor.ts)
        const p = panelSpot(circles, safe, pw, ph);
        expect(p.x, `${w}x${h} ${id} mirror=${mirror}`).toBeGreaterThanOrEqual(0);
        expect(p.y + ph).toBeLessThanOrEqual(h);
        const hidden = circles.filter((c) => rectHitsCircle(p.x, p.y, pw, ph, c, 6));
        expect(hidden.length, `${w}x${h} ${id} mirror=${mirror}`).toBe(0);
      }
    }
  });

  it('falls back to the spot hiding the fewest controls', () => {
    const safe: Rect = { x: 0, y: 0, w: 400, h: 300 };
    // controls everywhere except near the bottom-right corner
    const circles: Circle[] = [];
    for (let x = 30; x < 400; x += 60) for (let y = 30; y < 300; y += 60) if (!(x > 250 && y > 150)) circles.push({ cx: x, cy: y, r: 10 });
    const p = panelSpot(circles, safe, 120, 120);
    const n = circles.filter((c) => rectHitsCircle(p.x, p.y, 120, 120, c, 6)).length;
    expect(p.x).toBeGreaterThan(200);
    expect(p.y).toBeGreaterThan(100);
    expect(n).toBeLessThanOrEqual(2);
  });

  it('flags overlapping controls (and controls on the HUD ring) but not the shipped presets', () => {
    for (const [w, h] of VIEWS) {
      const id = PRESET_FOR[`${w}x${h}`] ?? 'touch_default';
      const L = resolveLayout(normalizeLayout(layouts[id], layouts.touch_default), { w, h }, { x: 0, y: 0, w, h }, { mirror: false, large: false });
      expect([...overlapping(L)], `${w}x${h}`).toEqual([]);
    }
    const def = normalizeLayout(layouts.touch_default, layouts.touch_default);
    (def.buttons.jump as { pos: [number, number] }).pos = [...(def.buttons.heavy as { pos: [number, number] }).pos];
    (def.buttons.lacrime as { pos: [number, number] }).pos = [0.02, 0.02];
    const L = resolveLayout(def, { w: 844, h: 390 }, { x: 0, y: 0, w: 844, h: 390 }, { mirror: false, large: false });
    const bad = overlapping(L);
    expect(bad.has('jump') && bad.has('heavy') && bad.has('lacrime')).toBe(true);
    expect(bad.has('light')).toBe(false);
  });
});

describe('settings calibration', () => {
  it('estimates the median late offset, clamped to the compensation range', () => {
    const t0 = 10, p = 0.75;
    const taps = Array.from({ length: 9 }, (_, k) => t0 + k * p + 0.025 + (k % 3) * 0.002);
    expect(estimateLatency(taps, t0, p)).toBeCloseTo(0.027, 3);
    expect(estimateLatency(taps.map((t) => t + 0.2), t0, p)).toBe(LATENCY_MAX);
    expect(estimateLatency(taps.map((t) => t - 0.06), t0, p)).toBe(0); // early taps never give negative compensation
  });

  it('needs enough taps near the beat', () => {
    expect(estimateLatency([10.0, 10.75, 11.5], 10, 0.75)).toBeNull();
    expect(estimateLatency([10.37, 11.12, 11.87, 12.62, 13.37, 14.12], 10, 0.75)).toBeNull(); // half a beat off
  });

  it('snaps slider values to step and range', () => {
    expect(snap(0.30000000000000004, 0, 1, 0.05)).toBe(0.3);
    expect(snap(0.172, BUFFER_MIN, BUFFER_MAX, 0.01)).toBe(0.17);
    expect(snap(9, BUFFER_MIN, BUFFER_MAX, 0.01)).toBe(BUFFER_MAX);
    expect(snap(-1, 0, LATENCY_MAX, 0.005)).toBe(0);
  });
});

describe('title and creator', () => {
  const save = (updated: number) => ({ updated, created: 1 }) as unknown as GameStateData;

  it('continues the most recently updated slot', () => {
    expect(latestSlot([null, null, null])).toBe(-1);
    expect(latestSlot([save(5), null, save(9)])).toBe(2);
    expect(latestSlot([null, save(3), null])).toBe(1);
  });

  it('sanitizes looks from the form, saves and imports', () => {
    const l = sanitizeLook({ name: '   Selene    di   Luna  e  Stelle  ', build: 3, height: Number.NaN, skin: -1, hair: 13, hairColor: 2.6, eyes: 0, cloak: 99 }, 'Portatore');
    expect(l.name.length).toBeLessThanOrEqual(NAME_MAX);
    expect(l.name.startsWith('Selene di Luna')).toBe(true);
    expect(l.build).toBe(1);
    expect(l.height).toBe(0.5);
    expect(l.skin).toBeGreaterThanOrEqual(0);
    expect(l.hair).toBe(1);
    expect(l.hairColor).toBe(3);
    expect(sanitizeLook({ ...l, name: '  ' }, 'Portatore').name).toBe('Portatore');
  });

  it('wraps palette indices and mixes colors', () => {
    expect(wrapIndex(-1, 6)).toBe(5);
    expect(wrapIndex(6, 6)).toBe(0);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030');
  });
});

describe('review fixes (cards, story, per-frame writes)', () => {
  it('the dawn advances only for a sky-brightening boss outside a memory', async () => {
    const { defeatBannerKey } = await import('../src/ui/cards');
    expect(defeatBannerKey(true, false)).toBe('ui.card.defeated');
    expect(defeatBannerKey(true, true)).toBe('ui.card.vanquished');
    expect(defeatBannerKey(false, false)).toBe('ui.card.vanquished');
    // only principal bosses brighten the sky, and some principal ones do not (Lucifero I)
    for (const b of bundle.bosses) if (b.brightens_sky) expect(b.class).toBe('principal');
    expect(bundle.bosses.some((b) => !b.brightens_sky)).toBe(true);
  });

  it('compares choice options without a signature string', async () => {
    const { sameOptions } = await import('../src/ui/story');
    const a = [{ key: 'x', hold: 0 }, { key: 'y', hold: 1.5 }];
    expect(sameOptions(a, a.map((o) => ({ ...o })))).toBe(true);
    expect(sameOptions(a, [{ key: 'x', hold: 0 }])).toBe(false);
    expect(sameOptions(a, [{ key: 'x', hold: 0 }, { key: 'y', hold: 0 }])).toBe(false);
    expect(sameOptions(null, null)).toBe(true);
    expect(sameOptions(a, null)).toBe(false);
  });

  it('NumCache writes an attribute / style only when the quantized value changes', async () => {
    const { NumCache } = await import('../src/ui/dom');
    const writes: string[] = [];
    const el = { setAttribute: (_n: string, v: string) => writes.push(v), style: { setProperty: (_n: string, v: string) => writes.push(`s:${v}`) } };
    const c = new NumCache(el as unknown as Element, 'stroke-dashoffset', 0.1);
    for (let i = 0; i < 100; i++) c.set(276.46);
    c.set(276.48);
    expect(writes).toEqual(['276.5']);
    c.set(12);
    expect(writes).toEqual(['276.5', '12.0']);
    c.reset();
    c.set(12);
    expect(writes.length).toBe(3);
    const d = new NumCache(el as unknown as Element, 'stroke-dasharray', 0.01, ' 999');
    d.set(0);
    d.set(0.001);
    expect(writes[3]).toBe('0.00 999');
    expect(writes.length).toBe(4);
    const o = new NumCache(el as unknown as Element, 'opacity', 0.001, '', true);
    o.set(0.5);
    o.set(0.5);
    expect(writes[4]).toBe('s:0.500');
    expect(writes.length).toBe(5);
  });
});
