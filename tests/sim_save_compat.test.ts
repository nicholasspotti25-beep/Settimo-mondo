/**
 * Save compatibility (integration #3): a save written by the build BEFORE the Act III/IV content (commit 30fa9fc, Act I with
 * the Guardiano del Regno and the Cavaliere Errante defeated) must still import, load at its altar and play on with the
 * current content. Keep this fixture as it is: it is the oldest save format in the wild; add newer fixtures next to it.
 */
import { describe, expect, it } from 'vitest';
import { deserialize, importCode, isDefeated, nextEncounter, serialize, type GameStateData } from '../src/sim/gamestate';
import { Sim } from '../src/sim/sim';
import { emptyInput } from '../src/sim/types';
import { BEHAVIORS } from '../src/generated/registry.sim';
import { loadContent } from './helpers';

const PRE_ACT3_SAVE = 'SM1.adndjz.eyJ2ZXJzaW9uIjoxLCJzbG90IjowLCJjcmVhdGVkIjoxNzkzODUyOTQwMjQwLCJ1cGRhdGVkIjoxNzkzODUyOTQwMjQwLCJwbGF5dGltZSI6NC4wMzMzMzMzMzMzMzMzMjQsImNoYXJhY3RlciI6eyJuYW1lIjoiUG9ydGF0b3JlIiwiYnVpbGQiOjAuNDUsImhlaWdodCI6MC41LCJza2luIjoyLCJoYWlyIjoxLCJoYWlyQ29sb3IiOjAsImV5ZXMiOjAsImNsb2FrIjowfSwiZGVmZWF0ZWQiOlsiZ3VhcmRpYW5vX2RlbF9yZWdubyIsImNhdmFsaWVyZV9lcnJhbnRlIl0sIndlYXBvbnMiOlsibGFtYV9kZWxsYV9jdWxsYSIsImxhbmNpYV9kZWxfY3VzdG9kZSIsImJyYW5kb19kZWxfdmlhbmRhbnRlIl0sImVxdWlwcGVkIjpbImxhbWFfZGVsbGFfY3VsbGEiLG51bGwsbnVsbF0sImFjdGl2ZVNsb3QiOjAsImZvcm1zIjpbInByYXRvX2x1bmFyZSJdLCJlcXVpcHBlZEZvcm0iOiJwcmF0b19sdW5hcmUiLCJsYXN0QWx0YXIiOiJhbHRhcmVfdmV0dGFfMDEiLCJ2aXNpdGVkQWx0YXJzIjpbImFsdGFyZV92ZXR0YV8wMSIsImFsdGFyZV9waWFudXJlXzAxIl0sInpvbmUiOiJncmFuZGlfcGlhbnVyZSIsInRpbWVPZkRheSI6InRyYW1vbnRvIiwibHVjaWZlcm9DaG9pY2UiOm51bGwsIml0ZW1zIjpbImxhbnRlcm5hX2RlbF9jYXZhbGllcmUiXSwicmVwZXJ0aSI6W10sInZvY2VIZWFyZCI6W10sInZpc3RhcyI6W10sIm5nQ3ljbGUiOjAsImZsYWdzIjp7fSwidG9kRGVmZWF0cyI6eyJndWFyZGlhbm9fZGVsX3JlZ25vIjpbInRyYW1vbnRvIl0sImNhdmFsaWVyZV9lcnJhbnRlIjpbInRyYW1vbnRvIl19LCJjaGFsbGVuZ2VzIjp7fSwiZ2FtZUNvbXBsZXRlZCI6ZmFsc2UsImRlYXRocyI6MCwicm5nIjozMDMxMjk1OTYzfQ==';

/** Same path as Game.loadState: respawn at the last visited altar, else the start zone. */
function load(state: GameStateData): Sim {
  const c = loadContent();
  const sim = new Sim(c, { behaviors: BEHAVIORS, seed: 3, headless: true, state });
  const altar = c.hasAltar(state.lastAltar) ? c.altar(state.lastAltar) : null;
  if (altar && state.visitedAltars.includes(altar.id)) sim.loadZone(altar.zone, altar.id);
  else sim.loadZone(c.bundle.progression.start_zone);
  return sim;
}

function play(sim: Sim, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / sim.dt); i++) {
    sim.step(emptyInput());
    if (sim.seq.running) sim.seq.skip(sim);
  }
  sim.drainEvents();
}

describe('save compatibility', () => {
  it('a pre-Act-III save imports, loads at its altar and plays the next encounter', () => {
    const s = importCode(PRE_ACT3_SAVE);
    expect(s.defeated).toEqual(['guardiano_del_regno', 'cavaliere_errante']);
    const sim = load(s);
    play(sim, 2);
    expect(sim.zone?.def.id).toBe('vetta_attesa');
    const next = nextEncounter(sim.c, sim.state);
    expect(next).toBe('elder_tree');
    sim.startFightDirect(next!, { skipIntro: true });
    sim.debug.invincible = true;
    play(sim, 5);
    expect(sim.fight?.boss).toBe('elder_tree');
    sim.boss!.hp = 0;
    sim.onBossDeath(sim.boss!);
    play(sim, 20);
    expect(isDefeated(sim.state, 'elder_tree')).toBe(true);
    // the migrated save round-trips through the current serializer
    const again = load(deserialize(serialize(sim.state)));
    play(again, 1);
    expect(again.state.defeated).toContain('elder_tree');
    expect(again.state.weapons).toEqual(expect.arrayContaining(s.weapons));
  });
});
