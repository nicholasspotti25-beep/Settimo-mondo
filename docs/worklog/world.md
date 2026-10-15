# Work log — WORLD + ENVIRONMENT stream (Vite port 5176)

## Status

1. WorldRenderer — **partial**
   - Atmosphere (src/render/world/atmosphere.ts: Lungo Crepuscolo state, tod blending, skyShade violet→gold, act aurora,
     fog/hemi/directional, exposure): written, not yet wired.
   - Sky dome (sky.ts: gradient, glow, god-rays, clouds, stars, aurora, sun disc only for ending): written, not wired.
   - Terrain (terrain.ts: field from core Terrain.heightAt, chunks + skirts + LOD, biome shader, backdrop ring): written.
   - Biomes table (biomes.ts), geometry toolkit (geo.ts), world materials (materials.ts), GLSL (glsl.ts), env.ts: written.
   - Generic zone builder (zone.ts): written but imports missing modules (props/field, cover, water, landmarks, horizon)
     → tree does not typecheck.
   - WorldRenderer.ts: still the minimal stub (flat ground plane).
   - Missing: prop kinds library + instancing, ground cover, water, landmark registry loader, horizon impostors, particles,
     altars, fog gates, reperti visuals, diegetic exits, vista points, ship zones, arena builder loading.
2. Act I zones authored (data + builders) — **missing** (data files exist only as skeletons: no props, landmarks,
   reperti, climb, horizon; no src/content/zones/<id>/zone.ts).
3. Arena dressing src/content/bosses/guardiano_del_regno/arena.ts — **missing**.
4. docs/WORLD_KIT.md — **missing**.
- Landmark builders (src/content/landmarks/**) — **missing** (directory empty).
- data/reperti/act1_world.yaml + locales/{it,en}/act1_world.yaml — **missing**.
- tests/world*.test.ts — **missing**.
- data/skies (28 act presets + sunrise), data/timeofday (all zones), data/palettes — present (initial values).

## Next

1. Fix the tree: props/kinds + props/field (instanced props), cover (grass), water, landmarks registry, horizon; wire
   WorldRenderer (atmosphere, sky, tod transitions, zone builder from registry or generic, arena builders). Screenshots.
2. Altars (stone + dawn glow + Cavaliere lantern), fog gates (Nebbia dell'Alba), reperti visuals, diegetic exits, vistas.
3. Particles (fireflies, embers, snow, pollen, ash, souls, stars, rain, lightning, mist, dust, spores).
4. Landmark builders set (castle shell, ruins, arches, bridges, walkways, ...), registry.
5. Act I zones authoring (castello_culla, vetta_attesa, grandi_pianure, foresta_oscura, palude, fiume_anime) + reperti
   data + locales; zone.ts builders; horizon impostors.
6. vetta_piazzale arena dressing (guardiano_del_regno/arena.ts).
7. Ship zones (platform), remaining landmark set for later acts.
8. tests/world*.test.ts, docs/WORLD_KIT.md, budget verification per zone × quality, 4 tod screenshots per Act I zone.

## Notes

- Chunk 1 started from: WorldRenderer stub + helper modules from an interrupted session (commit 1082c5e).
