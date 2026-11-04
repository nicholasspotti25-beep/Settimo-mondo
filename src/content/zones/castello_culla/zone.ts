/**
 * Castello della Culla: an interior zone with no heightfield — the halls (castle_hall landmarks) carry their own
 * paving at y = 0 (the sim's interior floor), and the castle stands on the summit crag above the sea of clouds and the
 * world below (world_below landmark), seen through the arched windows and from the east loggia.
 */
import type { ZoneDef } from '../../../core/types';
import type { RenderCtx } from '../../../render/types';
import { buildZone, type WorldZoneVisual } from '../../../render/world/zone';
import { Parts, R, blob, disposeTree, mat4 } from '../../../render/world/geo';

export default async function build(def: ZoneDef, ctx: RenderCtx): Promise<WorldZoneVisual> {
  const v = await buildZone(def, ctx, { noTerrain: true, noCover: true, noWater: true });
  // the crag under the castle: massive rock falling away below the floor line, wider toward the bottom
  const r = new R(4242);
  const p = new Parts(4242);
  const rock: [string, string] = ['#2a262c', '#5a5460'];
  const low = ctx.quality === 'low';
  for (let i = 0; i < (low ? 14 : 26); i++) {
    const z = r.range(-120, 120);
    const x = r.range(-30, 44);
    const depth = r.range(4, 60);
    const rad = r.range(10, 22) + depth * 0.35, sy = r.range(1.2, 2);
    p.add(blob(rad, 1, 0.3, r.int(1, 999)), 'matte', { color: rock, cover: 0.5, aoBottom: 0.4 }, mat4([x, -1.5 - depth - rad * sy * 1.3, z], [0, r.range(0, 6), 0], [r.range(0.8, 1.2), sy, r.range(0.8, 1.2)]));
  }
  for (let i = 0; i < (low ? 6 : 12); i++) {
    const z = r.range(-150, 150), x = r.sign() * r.range(45, 90);
    const h = r.range(60, 160);
    p.add(blob(r.range(12, 20), 1, 0.3, r.int(1, 999)), 'matte', { color: rock, cover: 0.6 }, mat4([x, -12 - h * 0.85, z], [0, r.range(0, 6), 0], [1, h / 26, 1]));
  }
  const crag = p.build({ matte: { detail: 0.3, breakup: 0.4, rim: 0.3 } }, false);
  crag.name = 'culla-crag';
  v.root.add(crag);
  v.disposers.push(() => disposeTree(crag));
  return v;
}
