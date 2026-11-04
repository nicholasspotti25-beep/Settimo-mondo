/**
 * arch: a freestanding stone archway or arcade of `bays` arches along local X (opening faces local +Z), springing on
 * square piers with plinths and imposts, voussoirs with a keystone, a spandrel wall and cornice when intact. `broken`
 * (0..1) drops voussoirs from one side, the spandrel and cornice, and scatters fallen blocks; piers reach down to the
 * terrain.
 *
 * params: span (6, clear opening of each bay), height (5, springing height), depth (1.6), bays (1), broken (0),
 * pointed (false), style ('pale'), seed. Collide with one cylinder r ~1.1 per pier (pier centers at x = -total/2 +
 * pier/2 + i * (span + pier), pier = 1.6).
 */
import type { LandmarkDef, ZoneDef } from '../../core/types';
import type { RenderCtx } from '../../render/types';
import type { LandmarkResult } from '../../render/world/landmarks';
import { zoneEnv } from '../../render/world/env';
import { blob, box, disposeTree, mat4 } from '../../render/world/geo';
import { DARK, Parts, R, bool, groundLocal, num, styleColor, voussoirs } from './_kit';

export default function build(def: LandmarkDef, zone: ZoneDef, ctx: RenderCtx): LandmarkResult {
  const env = zoneEnv(zone, ctx);
  const span = num(def, 'span', 6), hs = num(def, 'height', 5), dp = num(def, 'depth', 1.6);
  const bays = Math.max(1, Math.round(num(def, 'bays', 1)));
  const broken = num(def, 'broken', 0);
  const pointed = bool(def, 'pointed', false);
  const col = styleColor(def.params?.style);
  const seed = num(def, 'seed', 23);
  const r = new R(seed);
  const p = new Parts(seed);
  const pw = 1.6;
  const total = bays * span + (bays + 1) * pw;
  const rise = pointed ? span * 0.8 : span / 2;
  const top = hs + rise + 1.4;
  for (let i = 0; i <= bays; i++) {
    const x = -total / 2 + pw / 2 + i * (span + pw);
    const g = Math.min(groundLocal(env, def, x - pw / 2, 0), groundLocal(env, def, x + pw / 2, 0), groundLocal(env, def, x, dp / 2), groundLocal(env, def, x, -dp / 2)) - 0.4;
    const ph = (i === 0 || i === bays) && broken > 0.5 && r.next() < 0.5 ? hs * r.range(0.4, 0.8) : hs;
    p.add(box(pw + 0.5, 1.2 - g, dp + 0.5), 'matte', { color: DARK, cover: 1, aoBottom: 0.5 }, mat4([x, (1.2 + g) / 2 - 0.1, 0]));
    p.add(box(pw, ph - 1.1, dp), 'matte', { color: col, cover: 0.7, aoBottom: 0.6, jitter: 0.07 }, mat4([x, 1.1 + (ph - 1.1) / 2, 0]));
    if (ph >= hs) p.add(box(pw + 0.35, 0.4, dp + 0.3), 'matte', { color: col, cover: 1 }, mat4([x, hs - 0.1, 0]));
  }
  for (let i = 0; i < bays; i++) {
    const cx = -total / 2 + pw + span / 2 + i * (span + pw);
    const side = r.sign();
    voussoirs(p, mat4([cx, hs, 0]), span, rise, 0.9, dp, pointed, col, r, (k, n) => {
      if (broken <= 0) return true;
      const f = side > 0 ? k / n : 1 - k / n;
      return f < 1 - broken * 0.75 || r.next() < 0.15;
    });
    if (broken < 0.2) {
      // spandrels up to the cornice
      for (const s of [-1, 1]) p.add(box(span * 0.32, top - hs - rise * 0.55, dp * 0.92), 'matte', { color: col, cover: 0.6 }, mat4([cx + s * (span / 2 - span * 0.12), hs + rise * 0.55 + (top - hs - rise * 0.55) / 2 - 0.2, 0]));
    }
  }
  if (broken < 0.2) {
    p.add(box(total + 0.4, 0.5, dp + 0.4), 'matte', { color: col, cover: 1 }, mat4([0, top, 0]));
    p.add(box(total, 0.9, dp * 0.9), 'matte', { color: col, cover: 1 }, mat4([0, top + 0.65, 0]));
  } else {
    for (let k = 0; k < 4 + Math.round(broken * 6); k++) {
      const x = r.range(-total / 2 - 2, total / 2 + 2), z = r.range(-3, 3) + (r.next() < 0.5 ? dp + 1 : -dp - 1);
      p.add(r.next() < 0.5 ? box(r.range(0.7, 1.1), 0.6, 0.9) : blob(r.range(0.3, 0.6), 0, 0.3, r.int(1, 999), 0.4), 'matte', { color: col, cover: 1, aoBottom: 0.6 }, mat4([x, groundLocal(env, def, x, z) + 0.2, z], [r.range(-0.3, 0.3), r.range(0, 6), r.range(-0.3, 0.3)]));
    }
  }
  const group = p.build({ matte: { detail: 0.8, breakup: 0.35, rim: 0.3 } }, ctx.quality !== 'low');
  group.name = 'arch';
  return { object: group, dispose: () => disposeTree(group) };
}
