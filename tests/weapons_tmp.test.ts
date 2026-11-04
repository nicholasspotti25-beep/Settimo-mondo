import { it } from 'vitest';
import { loadContent } from './helpers';
import { Kit } from '../src/render/kit/index';
import { buildWeapon } from '../src/render/weapons/index';
it('tris', () => {
  const content = loadContent();
  for (const q of ['low', 'medium', 'high'] as const) {
    const kit = new Kit(); kit.quality = q;
    const ctx = { content, quality: q, palette: (id: string) => content.bundle.palettes[id] ?? {}, kit, time: 0, skyShade: 0 } as any;
    const out: string[] = [];
    for (const id of ['triplice_guinzaglio', 'brace_eterna', 'tuono_spezzacielo', 'brina_silente', 'fenditura_ardente']) {
      const v = buildWeapon(content.weapon(id), ctx);
      const parts: string[] = [];
      v.root.traverse((o: any) => { if (o.isMesh) { const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3; parts.push(`${o.name || o.type}:${Math.round(t * (o.isInstancedMesh ? o.count : 1))}`); } });
      out.push(`${id} ${v.triangles} [${parts.join(' ')}]`);
      v.dispose();
    }
    require('node:fs').appendFileSync('/tmp/claude-0/-home-user-settimo-mondo/af03cb07-d77a-5105-8b91-fb3fdb8d8552/scratchpad/tris.txt', q + '\n' + out.join('\n') + '\n');
  }
});
