/**
 * World kit coverage: every particle / prop / horizon / water kind named by the biomes and the zone data exists in the
 * world renderer, data prop placements equal the sim colliders, and docs/WORLD_KIT.md stays in sync with the code.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZoneDef } from '../src/core/types';
import { Terrain, altarAvoid, propColliders, scatterProps } from '../src/core/terrain';
import { BIOMES } from '../src/render/world/biomes';
import { PARTICLE_KINDS } from '../src/render/world/particles';
import { PROP_KIND_IDS } from '../src/render/world/props/kinds';
import { horizonBuilders } from '../src/render/world/horizon';
import { ATMOS, HDR_HAZE_K } from '../src/render/world/atmosphere';
import { loadContent } from './helpers';

const ROOT = path.resolve(__dirname, '..');
const content = loadContent();
const zones: ZoneDef[] = Object.values(content.bundle.zones);
const WATER = ['swamp', 'souls', 'river', 'sea', 'mirror', 'lava', 'cloud', 'ice'];
const particleKind = (e: string) => e.split('*')[0].trim();

describe('world kit coverage', () => {
  it('every biome particle, dressing, rim and water kind exists', () => {
    for (const [id, b] of Object.entries(BIOMES)) {
      for (const p of b.particles ?? []) expect(PARTICLE_KINDS as readonly string[], `${id} particle ${p}`).toContain(particleKind(p));
      for (const d of b.dressing ?? []) expect(PROP_KIND_IDS, `${id} dressing ${d.kind}`).toContain(d.kind);
      for (const r of b.rim ?? []) expect(PROP_KIND_IDS, `${id} rim ${r.kind}`).toContain(r.kind);
      if (b.water) expect(WATER, `${id} water`).toContain(b.water);
    }
  });

  it('every zone biome, particle, horizon builder and prop kind exists', () => {
    const hz = horizonBuilders();
    for (const z of zones) {
      expect(BIOMES[z.biome], `${z.id} biome ${z.biome}`).toBeDefined();
      for (const p of z.particles ?? []) expect(PARTICLE_KINDS as readonly string[], `${z.id} particle ${p}`).toContain(particleKind(p));
      for (const h of z.horizon ?? []) expect(hz, `${z.id} horizon ${h.builder}`).toContain(h.builder);
      for (const p of z.props) expect(PROP_KIND_IDS, `${z.id} prop ${p.kind}`).toContain(p.kind);
      if (z.water?.kind) expect(WATER, `${z.id} water ${z.water.kind}`).toContain(z.water.kind);
    }
  });

  it('data props render exactly where the sim places their colliders', () => {
    // real zones plus a synthetic one, so the check is never vacuous while Act I data is still being authored
    const base = zones.find((z) => z.id === 'vetta_attesa') ?? zones[0];
    const synthetic: ZoneDef = { ...base, id: 'world_kit_probe', props: [{ kind: 'boulder', count: 40, collide: true, seed: 3 }, { kind: 'fern', count: 60 }] };
    let checked = 0;
    for (const z of [...zones, synthetic]) {
      if (!z.props.some((p) => p.collide)) continue;
      const terrain = new Terrain(z, z.arenas.map((a) => content.arena(a)));
      const avoid = altarAvoid(z, content.altarsInZone(z.id).map((a) => a.pos));
      const cols = propColliders(terrain, avoid);
      // the renderer's PropField places every data prop with this same call (src/render/world/props/field.ts addScatter)
      const rendered = z.props.filter((p) => p.collide).flatMap((p) => scatterProps(terrain, p, avoid));
      expect(cols.length, z.id).toBe(rendered.length);
      cols.forEach((c, i) => {
        const at = (c as { c: [number, number, number] }).c;
        expect(Math.hypot(rendered[i].x - at[0], rendered[i].z - at[2]), `${z.id} collider ${i}`).toBeLessThan(1e-9);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('haze layers share one exposure-aware scale', () => {
    expect(ATMOS.uHazeK.value).toBeGreaterThan(0);
    expect(HDR_HAZE_K).toBeGreaterThan(0.3);
    expect(HDR_HAZE_K).toBeLessThan(0.6);
    for (const f of ['glows.ts', 'mist.ts', 'particles.ts']) {
      expect(readFileSync(path.join(ROOT, 'src/render/world', f), 'utf8'), f).toContain('uHazeK');
    }
  });
});

describe('docs/WORLD_KIT.md', () => {
  const doc = readFileSync(path.join(ROOT, 'docs/WORLD_KIT.md'), 'utf8');
  it('is marked ready and lists every kind the code offers', () => {
    expect(doc.split('\n')[0]).toBe('STATUS: READY');
    for (const k of PROP_KIND_IDS) expect(doc, `prop ${k}`).toContain(k);
    for (const k of PARTICLE_KINDS) expect(doc, `particle ${k}`).toContain(k);
    for (const k of horizonBuilders()) expect(doc, `horizon ${k}`).toContain(k);
    for (const k of Object.keys(BIOMES)) expect(doc, `biome ${k}`).toContain(k);
    for (const k of WATER) expect(doc, `water ${k}`).toContain(k);
  });
});
