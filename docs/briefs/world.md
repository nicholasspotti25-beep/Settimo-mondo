# Stream: WORLD + ENVIRONMENT (Vite port 5176)

Owns: src/render/world/**, src/content/landmarks/**, src/content/zones/{castello_culla,vetta_attesa,grandi_pianure,
foresta_oscura,palude,fiume_anime}/**, data/zones/{those 6}.yaml, data/timeofday/**, data/skies/**, data/palettes/**,
data/reperti/act1_world.yaml, locales/{it,en}/act1_world.yaml, src/content/bosses/guardiano_del_regno/arena.ts,
docs/WORLD_KIT.md, tests/world*.test.ts. Keep every zone/arena/altar id, arena center/gate/radius and altar position of the Act
I zones (bosses depend on them). Never edit src/core/terrain.ts (shared with sim): request changes in docs/requests/world.md.
Also read: src/core/terrain.ts (heightAt + scatterProps shared with sim colliders), src/sim/world.ts, src/sim/sim.ts (zones,
interactables, sealed arenas, fog gate fight start), src/render/world/WorldRenderer.ts, data/zones, arenas, altars, skies,
timeofday, palettes, progression; Bible C3 (time of day), C8 (Lungo Crepuscolo), C9 (world), C11 (ending), C13.

Deliverables:
1. WorldRenderer (keep API: constructor(scene, ctx), loadZone(sim): Promise, onEvent(e, sim), update(sim, dt, camera), group,
   dispose): Lungo Crepuscolo sky shader (SkyPresetDef gradient, glow toward glow_dir, stars, aurora (strong in Act III
   nights), god-rays, layered clouds, drift; NO SUN DISC except the ending: sim.endingActive or the 'sunrise' preset), smooth
   time-of-day transitions ('timeOfDay' event, zone change), sky brightening with ctx.skyShade (violet→gold; NG+ golden),
   act tint + color grading, fog by TodPreset.fog matched to the horizon, hemisphere + one directional light, exposure.
   Terrain: chunked heightfields sampled from sim.zone.terrain.heightAt (must match the sim), skirts, LOD, biome shader
   blending surfaces by slope/height/noise (grass, moss, rock, snow, ash, sand, marble, mud, ice, obsidian, bone, soil, bark,
   void, cloud). Water: swamp, river of souls (black, luminous drifting lights), night sea, mirror lake, lava, cloud sea.
   Instanced props for every PropScatterDef.kind you define (document the list): crooked twilight trees, giant dark-forest
   trees, pines/firs, birch, dead trees, tall grass with wind, reeds, ferns, glowing mushrooms/flowers, rocks/boulders/cliff
   shards, ruin columns/arches/walls, gravestones, seeker lanterns, armor remains, bones, dragon bones, crystals, ice spikes,
   snowy rocks, giant clover/grass/flowers/mushrooms (Little Garden macro), anvils, chains, sword graves, ember vents,
   obsidian, marble pillars, statues, hanging gardens, cloud puffs, void shards — placement ONLY from core/terrain
   scatterProps with the same avoid list as the sim (altarAvoid(zone, altar positions)). Particles: fireflies, embers, snow,
   pollen, ash, souls, stars, rain, lightning, mist (use renderer.fx.particles if present, else your own instanced system).
   Altars (stone, dawn-light glow; the Cavaliere's lantern lit at every altar once state.items has
   'lanterna_del_cavaliere'), fog gates (Nebbia dell'Alba, luminous mist wall at arena.gate while sealed or fighting),
   Reperti by kind (hidden once collected), diegetic exits (lit doorway, boat, stair, root, portal — no markers), vista
   points, horizon impostors (zone.horizon + distant silhouettes of regions ahead; from the Vetta: plains, dark forest,
   swamp, river, far red glow; later Yggdrasil above the clouds). Ship zones (zone.platform): deck, mast, sails, ballista
   slot, water streaming along the spline, sway, wake. Generic zone builder from data when no custom zone.ts exists. Landmark
   registry src/content/landmarks/<builder>.ts (default export LandmarkBuilder(def, zone, ctx) => Object3D (+update)); broad
   reusable set for ALL acts: castle shell/interiors with huge arched windows, ruins, arches, colossal bone-and-iron gate,
   bridges, rotten walkways/piers, sunken black-marble cathedral (overturned nave, throne of swords), volcano crater rim,
   painted cave, ice castle + throne hall, taiga log forest, drum circle, river port/docks, ships, observatory, dragon nests,
   mirror lake shrines, wind cliffs, Yggdrasil (trunk, branches, crown above clouds), hollow root tunnel, inverted palace,
   marble celestial terraces with hanging gardens and stairs of light, glass greenhouse, endless hedge walls. Zone/arena
   visuals may expose named camera shots via ctx.registerShot.
2. Act I zones fully authored (data + builders): castello_culla (empty pale-stone castle, huge corridors, arched windows
   filtering violet light), vetta_attesa (summit plaza, castle gate behind, breathtaking vista of the whole world below),
   grandi_pianure (tall grass, wind, distant ruins), foresta_oscura (enormous trees, light barely filtering, fireflies, the
   Elder Tree's shadow), palude (fog, rotting walkways, seeker lanterns, deep waters for the pier), fiume_anime (black luminous
   river, dock, crossing). Terrain, path, colliders, a few marked climb walls (zone.climb {a,b,top}), props, landmarks,
   particles, horizons, vistas; 2–3 Reperti dei Cercatori per zone (texts IT+EN, canon-consistent, melancholic). Keep
   fog-gate passages clear.
3. Arena dressing src/content/bosses/guardiano_del_regno/arena.ts (vetta_piazzale: ancient summit plaza, broken statues,
   castle gate behind, the world below at the edges), matching data/arenas/vetta_piazzale.yaml bounds.
4. docs/WORLD_KIT.md (first line "STATUS: READY" when stable): zone data fields, prop kinds, landmark builders + params,
   particles, horizon, water, custom zone.ts/arena.ts how-to, budgets.
Verify: screenshots of every Act I zone at the four times of day; renderer.stats per zone on low/medium/high within budgets.
