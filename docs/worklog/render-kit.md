# Work log — render-kit (RENDER KIT + CHARACTERS, Vite port 5174)

Brief: docs/briefs/render-kit.md. Owned: src/render/Renderer.ts, camera.ts, kit/**, rigs/**, actors/**, fx/**, data/anim/**,
docs/RENDER_KIT.md, src/content/bosses/guardiano_del_regno/model.ts, tests/render*.test.ts.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Procedural kit (lathe, swept/skinned tubes, blades, ellipsoids, bevel boxes, instanced scatter, fur, membranes, cloth/capes, merge/LOD, stylized PBR + rim/fresnel, actor FX uniforms, cached textures, blob shadows) | done (code); used by real models in game since chunk 1 | src/render/kit/*.ts |
| 2 | Rigs: animator, clip libraries + keyword resolution, springs, IK, part anchors, 10 family builders, generic-from-data builder | done (chunk 4): all 10 families animate from their libraries; animator gained globs anywhere in keys (`neck*_0`), chain globs for waves (`tent*` + `spread`), static `bends`, `axis: radial`; sided compound resolution (`branch_whip_l` -> sweep_l); unknown anims fall back to the family `attack` alias | src/render/rigs/**, rigs/generic.ts |
| 3 | ActorRenderer: Portatore, player states, weapons + trails, bosses (BOSS_MODELS + generic fallback), clones/decoy/ally, overlays | partial (v1): Portatore from CharacterLook (cloak, seed glow, vial of light, no shadow, smooth scale, every player state mapped, dodge roll pivot, lock look-at); weapon via buildWeapon on grip sockets; bosses via lazy BOSS_MODELS or generic family model; clone/decoy/ally/echo tints; hit flash, pulsing red flash + red warning icon; Spezzato cracks; transition aura; death dissolve; hidden; blob shadows on Low. Missing: swing-arc generator + trails, part highlight constellation lines, two-hand IK | src/render/actors/ActorRenderer.ts, actors/portatore.ts |
| 4 | FxRenderer: pooled particles, projectile/hazard visuals, combat FX, fallbacks, Metamondo warp, debug hitboxes | done (chunk 3) v1: GPU particles (fx.particles additive + fx.smoke alpha, ring buffer, life evaluated in the VS), SDF ground decals (attack warnings incl. charge lanes/leap landings + red hatching, hazard telegraph + 7 active families), shockwave walls/pillars, projectile heads/meshes/ribbon trails/shed particles for all 23 visuals, combat FX for every combat event, perfect-dodge afterimage (fresnel ghost of the Portatore pose), vfx built-ins + generic fallback + registerVfx, Metamondo sphere + reactions, debug hitboxes | src/render/fx/FxRenderer.ts, particles.ts, decals.ts, projectiles.ts |
| 5 | Renderer/camera: registerShot hook, screenPoint, bloom/outline, act grading, shadow presets, lock-on framing, gravity roll, shake | partial: quality/watchdog/dynamic res, lock-on framing, ctx.registerShot wired, renderer.screenPoint(), post pipeline src/render/fx/post.ts: probe-driven auto exposure ACTIVE on all tiers (direct path); HDR path (half-float target, MSAA x4 High, dehaze, ACES, per-act grading, vignette, dither, bloom mips) written but switched OFF (HDR_ENABLED=false, see Notes); CameraRig.inspect; no outline yet | src/render/Renderer.ts, camera.ts, fx/post.ts |
| 6 | data/anim/*.yaml pose libraries | done (chunk 4): humanoid, quadruped, mounted, portatore + colossus (extends humanoid, 27 heavy clips), serpent (25), dragon (22), bird (24), insect (24, mantis/beetle/ant/wasp/spider), tree (23), tentacled (20, kraken + cthulhu); every keyword resolves on every family | data/anim/ |
| 7 | Guardiano del Regno reference model | done (chunk 2): barded slate destrier (dagged green-gold caparison with crown heraldry, peytral, crinet, chanfron, saddle), dull-silver knight (broken-crown great helm, layered pauldrons, tabard, faults, cape), Lancia del Custode (white shaft, vamplate, leaf head with crown socket); 'spectral_aura' wraps only the steed | src/content/bosses/guardiano_del_regno/model.ts |
| 8 | docs/RENDER_KIT.md | done (chunk 3): STATUS: READY — module registration (incl. minion `minions` export), frame/data alignment, ModelBuilder/geometry/surfaces/palette API, 10 rig families (bones, builders, pose-library status), keywords + resolution order, clip format, model-specific clips, partChains/springs/look, RigVisual options, generic overlays, flags, VFX hooks, budgets, Guardiano worked example, checklist | docs/RENDER_KIT.md |
| — | tests/render*.test.ts | done for the libraries: tests/render_anim.test.ts (27: keywords on all 11 libraries, sided compounds, every boss attack anim resolves to a real clip, bones+chains of every family on 16 generic variants, NaN-free, < 80k tris, serpent strike travels, dragon wings fold), tests/render_models.test.ts (3) | tests/render_anim.test.ts, tests/render_models.test.ts |

## Next

1. FX polish: a settings toggle for `fx.attackWarnings` (request to ui), shockwave wall look from close up, projectile
   meshes per visual reviewed in a dedicated shot (the chunk-3 capture caught only golden_wave/bolt in frame), decals on
   sloped (non-arena) ground, uHazeK/exposure scaling of the additive kit fresnel shells.
2. Exposure part 2 (src/render/fx/post.ts, HDR_ENABLED=false today): clamp kit rim/specular for half floats (white
   blocks after MSAA resolve), make the dehaze cut follow view changes instantly (crushed rk2/final_1_boss_high), then
   enable HDR + per-act grading + vignette, and bloom (BLOOM_LEVELS high 5 / medium 3) once the world stream re-tunes its
   additive layers (request filed). Re-shoot vetta_attesa alba/tramonto/notte; outline pass; shadow preset check.
3. ActorRenderer v2: swing-arc generator from SwingDef.arc + weapon trails (base/tip), left-hand IK for two-handed grips,
   part.highlight constellation lines, multi-part lock markers; Portatore cloak drape polish.
4. Guardiano polish: hind thigh still grazes the caparison rear in some poses; chanfron reads boxy from the front; add a
   model triangle-count assert (< 80k) to tests/render_anim.test.ts for BOSS_MODELS entries.
5. Generic model polish: humanoid sword clips need hand_r pitch tuning (blade follows the swing arc); bird/dragon
   attack poses on real content models (the generic bird has a 2.6 H wing, so close-ups of folds were judged in
   scratchpad rk4/fold_bird.png); serpent slam rear-up height depends on segment length (body_0/body_2 +-36).
6. Full screenshot pass (title -> new game -> Guardiano: idle, attacks, red telegraph, Spezzato, grace) low/high; keep
   docs/RENDER_KIT.md in sync with every API change.

## Notes

- Chunk 1 (2026-10-15): log created from inspection. Kit + rigs core + 10 family builders existed (earlier WIP commits);
  ActorRenderer/FxRenderer were capsule/sphere stubs, data/anim empty, no Guardiano model.
- Chunk 1 done:
  - data/anim: humanoid.yaml, quadruped.yaml, mounted.yaml (includes quadruped as steed_* and humanoid as foot_* with
    rider_ prefix; rider weapon pitch = sum of arm+forearm+hand x), portatore.yaml (extends humanoid: guard, parry,
    counter, dodge_roll, backstep, jump, drink, swap, transition_flourish, art_raise, knockdown, guardbreak, grace,
    kneel, climb, locked, flying). mounted.ts: info.flagRoot { dismounted: 'rider_hips' }.
  - src/render/rigs/generic.ts: data-driven fallback model per rig family (heads from part ids, palette colors, body
    dims, procedural blade for humanoids/riders, spectral_aura + enraged flag auras).
  - src/render/actors/portatore.ts + ActorRenderer.ts (see Status #3). Look tables SKIN_TONES / HAIR_COLORS /
    EYE_COLORS / CLOAK_COLORS exported from portatore.ts (index = CharacterLook field).
  - camera.ts lock-on: orbit stays on the player with a bounded lean (≤ 1.1 m) and the look point leans toward the
    target (≤ 4.5 m + size); before, at 23 m the player was out of frame (camera 1 m behind, looking past the head).
  - Renderer.ts: PCFSoftShadowMap (removed in three 0.186) → PCFShadowMap.
- Verification chunk 1:
  - `npx tsc --noEmit -p tsconfig.json` → 0 errors in src/render/** and tests/render*.
  - `npm run registry && SM_PARTIAL=1 npm run data` → ok (anim libraries compile into content.json `anim`).
  - `npx vitest run tests/render_anim.test.ts` → 9/9: every KEYWORD resolves to a concrete clip on humanoid/quadruped/
    mounted/portatore; Guardiano attack anims resolve to dedicated mounted clips; every pose key names an existing
    bone on the built generic humanoid/quadruped/mounted models and the Portatore (jaw optional); animator runs every
    keyword × stage without NaN; triangles < 80k (boss) / < 40k (Portatore); Portatore meshes castShadow=false.
  - Headless (port 5174, 1280×576) screenshots LOOKED at (scratchpad rk/ face_*, close_*): Portatore slim cloaked
    figure with seed glow and weapon; Guardiano (generic mounted) walk/sweep_r/overhead telegraph-active-recovery read
    clearly; red diamond warning icon above the rider during the Colpo Rosso wind-up; fixes made from them: lock-on
    framing, cloak width 0.42H→0.2H and lighter color, rider blade attached to a bone (sockets are not part targets).
  - renderer.stats during the Guardiano fight: high 37 calls / 140k tris; low 35 calls / 46k tris.
  - Capture tip: wait for `!__game.renderer.world.busy` before screenshots, otherwise frames are blank.

### Lead note (09:30, smoke screenshots)
- vetta_attesa at dawn (boss_01 smoke shot) is badly overexposed: sky, terrain and characters wash out to near-white and the
  HUD loses contrast. Tone mapping / exposure / bloom threshold need a pass so the brightest act still reads on a phone.
- Smoke scenes captured during the boss intro title card are fully black behind the card (boss_04..): fine during the
  intro, but check the intro fade does not leave the arena black after the card.

### Chunk 2 (2026-11-03)
- FIXED a kit-wide bug: `sweep()` (every mb.tube: limbs, barrels, necks, tails) had inward triangle winding with outward
  normals, so FrontSide drew the far inner wall and the rim term saturated (smNV = 1): tubes rendered as flat near-white
  silhouettes (the "white horse / white Portatore limbs" in chunk-1 shots). Walls + caps now wind outward (checked by a
  face-normal vs radial test: 32/32 wall + 48/48 cap faces outward). No other stream uses sweep/geo.tube.
- Guardiano del Regno model (src/content/bosses/guardiano_del_regno/model.ts, registry: 1 model). Mounted skeleton
  (horse 2.2 m withers, rider 2.29 m), separate 'steed_' / 'knight_' surface sets so the spectral aura (flag
  'spectral_aura', pale blue fresnel, flow) wraps only the horse; 'enraged' tint also steed-only.
- data/anim/mounted.yaml: overhead telegraph lance now raised high (relative pitch -90, was -180 = pointing down-back once
  the steed rears), overhead active strikes down-forward to the ground ~5 m ahead (was straight down), recovery and thrust
  active pitched up ~20 deg so the couched lance travels at hitbox height (y 2.0-2.6).
- CameraRig.inspect {yaw,pitch,distance,height,target} — an orbit view of the boss for headless captures/debug.
- Verification: tsc 0 errors in owned files; registry + SM_PARTIAL data ok; headless 1280x576 high (scratchpad rk2/g4_*):
  front/profile idle, thrust active (lance forward), overhead telegraph (lance raised, red diamond + vignette),
  spectral aura on the steed only. Stats with the model in frame (high): ~65-71 calls, 167-188k tris (scene total).
- Exposure fix (lead note): root causes found — (1) the white tubes above (rim saturation), (2) the world's transparent
  layers (glows.ts / mist.ts / particles, toneMapped:false, additive) ignore exposure on the direct path and dominate the
  frame when the camera faces the tramonto/alba glow, so lowering toneMappingExposure alone changed nothing (measured:
  exposure 0.42 looked identical to 1.0). New src/render/fx/post.ts (all tiers, half-float HDR target; direct path only as
  fallback): center-weighted log-average luminance probe (32x16 -> 1x1 RGBA8, async readback, no stalls), CPU-eased
  correction keeping the exposed key in [0.075, 0.21] (partial, exponent 0.85: dark scenes lift at most x1.3), soft-min
  dehaze (cuts up to 60% of a dominating veil), NaN/Inf sanitising, ACES, per-act grade (ACT_GRADES, eased on act change),
  vignette 0.24 (helps the corner HUD), dither. Renderer: gl.info.autoReset=false + reset per frame (stats count all
  passes), stats.exposure / stats.key, scene.onBeforeRender wrapper reads the atmosphere's base exposure.
  Evidence (1280x576, scratchpad rk2/): before = tools/out/smoke/boss_01 and rk2/basehi_0 (tramonto, near-white floor,
  boss/player bleached, HUD bars low contrast); after = rk2/e4lo_0_tramonto (low: exposure 1.0 -> 0.71, floor tiles,
  gate, boss and Portatore read, HUD bars stand out). Side effect: transparent layers now blend in linear space, so alba
  reads a bit hazier than before (rk2/e4hi_1_alba) -> request sent to the world stream (docs/requests/render-kit.md).
  Bloom (threshold 1.5 / knee 0.7 / clamp 8, dual-filter mips) produced white sparkles on character rims at High ->
  held at 0 levels (Next 3). Stats tramonto: high 68 calls / 159k tris, low 50 calls / 54k tris.
- Verification chunk 2: `npx tsc --noEmit -p tsconfig.json` 0 errors in owned files; `npm run registry` (1 model) and
  `SM_PARTIAL=1 npm run data` ok; `npx vitest run tests/render_anim.test.ts` (see final run); captures use a private Vite
  (scratchpad vite-rk.mjs: port 5174, hmr off, no watcher) because the ui stream's edits reloaded the page mid-capture.
- FINAL STATE of the exposure work this chunk: the full HDR path was tried on all tiers and then switched off
  (HDR_ENABLED=false) after rk2/final_1_boss_high showed white blocks on character rims (half-float overflow through the
  MSAA resolve) and a crushed near-black frame when the camera turned away from the glow (dehaze cut eased too slowly).
  Shipped now: the direct path on every tier (as before the chunk) + the probe-driven auto exposure (32x16 scene probe
  every 0.3 s, no shadow re-render, async 1x1 readback) multiplying the atmosphere's exposure (tramonto measured ~0.42-0.7).
  This darkens tone-mapped geometry but NOT the world's toneMapped:false haze/glow layers, which are the main cause of
  the vetta_attesa washout -> the world-stream request in docs/requests/render-kit.md is the remaining fix.
- Shipped-state check (rk2/ship_*, high, tramonto): facing the glow avg RGB (185,166,148), exposure 0.86, key 0.11 (in band);
  facing away the arena is very dark red with bright white blobs around the fighting actors — exposure is 0.86 there too,
  so the darkness comes from the world's tramonto lighting (low ambient, red key light), and the blobs are most likely the
  FxRenderer stub's white hit/parry spheres while the boss keeps hitting the invincible player (FxRenderer is Next 1).
  Both to re-check first thing next chunk with HDR_ENABLED=false (current) before touching post.ts again.


### Chunk 3 (2026-11-03)
- docs/RENDER_KIT.md written (STATUS: READY), checked against the code. API additions made for it (owned files):
  `RigVisualOpts.clips` / `.aliases` (model-specific clips layered over the family library, passed to the Animator as
  AnimatorExtra); ActorRenderer loads minion models from the owner boss module's named export
  `minions: Record<minionId, BossModelBuilder>` (BOSS_MODELS is keyed by boss folder only, so minions had no way in).
- tests/render_models.test.ts: Guardiano 15,896 triangles / 13 surfaces on High; all 3 tests pass with
  tests/render_anim.test.ts (12/12). tsc: 0 errors in owned files.
- Doc states honestly that 7 families (colossus, serpent, dragon, bird, insect, tree, tentacled) have no pose library
  yet and that `RigVisualOpts.clips` works meanwhile; family builders do not set `info.partChains` (models must).
- FxRenderer v1 (Status #4). Renderer.ts wires `fx.camera` and `fx.playerModel`. ~6-9 FX draw calls in a busy fight.
  Verification: tsc 0 errors in owned files; `npx vitest run tests/render_anim.test.ts tests/render_models.test.ts`
  13/13 (registry now has 2 models: guardiano_del_regno + cavaliere_errante from act1, both < 80k on every preset);
  `npm run registry` + `SM_PARTIAL=1 npm run data` ok. Headless 1280x576 (scratchpad rk3/, script fx.mjs, private Vite
  vite-rk.mjs on 5174), LOOKED at: a_high_red_tel/b_high_red_tel/c_low_red_tel (heavy_overhead: red hatched wedge +
  red diamond, readable on the bright giorno floor), c_low_sweep_tel (lance_sweep amber half-annulus filling outward),
  b_high_charge_tel (charge_lateral lane through the player), a_high_haz_tel/haz_act (fire_pillar, ice_spike,
  lightning_mark, void_zone, roots box: outlines + growing fill), a_high_proj (fire/ice/light pillars, void particles,
  crack seams), a_high_grace (rays flash + light pillar + ring), a_high_parry. Fixes made from the shots: decal fill/edge
  stronger + edge width grows with camera distance (thin at 20 m before), pillars toned down (were white-saturated),
  crack seams keep the hazard hue (roots read white), trails thin when flying at the camera (stood up as a bar).
  Stats with FX: high ~62-111 calls / 174-343k tris (scene incl. world + transparent pillars), low 51-54 calls / 69k tris.


### Chunk 4 (2026-11-04)
- Pose libraries for the 7 missing families (data/anim/): colossus.yaml (extends humanoid, 27 heavy clips: long low
  wind-ups, short snaps, recoveries that stay bent; slam_r/slam_l, eruption/mire_arms/double_slam/mud_wave/long_reach/
  submerge aliases), serpent.yaml (25: distance-driven body wave with neck*_0 cancelling it at the root, S-coil bite
  with jaws gaping in the telegraph and snapping shut on impact, coil, tail_sweep, tail_slam, slam, dive/burrow/emerge;
  breach/strike_below/head_sweep/tail_fling aliases), dragon.yaml (22: wings folded tented over the back on the ground,
  flapping hover/fly, breath, claw_r/l, rear_stomp, tail_sweep, dive, swoop, block with wings), bird.yaml (24: bird +
  griffin legs in the same clips, folded wings, claw, dive, swoop, screech, gust), insect.yaml (24: tripod gait for 3-4
  pairs, mantis raptorial grab, scythe sweep, mandible bite, threat display, dead-bug death), tree.yaml (23: per-root
  lifts in walk/stomp, two-branch slam, branch sweeps, canopy shake, toppling death; root_call/heart_pulse/
  shake_canopy aliases), tentacled.yaml (20: kraken + cthulhu in one library).
- Animator/clips (owned): globs with `*` anywhere in pose/cycle keys (`neck*_0`); wave/bend chain globs over named chains
  (`tent*`) with `spread`; static `bends`; `axis: radial` (per-chain tangent from rest positions, compile-time only);
  sided compound resolution (`branch_whip_l` -> sweep_l; before, both sides resolved to sweep_r); unknown anims fall
  back to the family `attack` alias (caronte `punt` resolved to idle) + global alias punt -> thrust.
- docs/RENDER_KIT.md: section 5 pose-library column filled for every family, "not yet" note removed; 6.2 resolution
  order (sided compounds, attack-alias fallback); 6.3 bends, chain globs, radial axis, key globs.
- Verification: `npx tsc --noEmit -p tsconfig.json` 0 errors in src/render/** and tests/render*; `npm run registry` +
  `SM_PARTIAL=1 npm run data` ok (11 anim libraries in content.json); `npx vitest run tests/render_anim.test.ts
  tests/render_models.test.ts` 30/30 (new: keywords on all 11 libraries, sided compounds, every attack anim of every
  boss in data resolves to a real non-idle clip, bones + wave/bend chains of each library exist on 16 generic variants
  (colossus x2, serpent/hydra/worm, dragon x2, bird/griffin, 5 insect kinds, tree, kraken/cthulhu), NaN-free over every
  keyword x stage, < 80k tris, serpent bite moves the head > 1.5 m forward, dragon idle brings the wing tip within 50%
  of its rest span). Headless 1280x576 contact sheets of key poses on the generic models, LOOKED at (scratchpad
  rk4/sheet_<family>.png, harness rk4/harness.ts + sheet.mjs, private Vite with fs.allow on the scratchpad): colossus
  (overhead wind-up arms high -> crouched double-fist strike, sweep wind-up/follow-through, eruption, kneel), serpent
  (S-coil -> lunge, tail wound left -> hook right, spiral coil), dragon (tented fold, hover flap, rear-up, roar),
  mantis (prayer idle, raised scythes -> extended strike, threat display), spider, beetle, tree (overhead branches ->
  slam, sweep, topple), kraken (tentacles gather into a column -> slam radiating onto the ground), cthulhu. Fixes made
  from them: bird fold (secondaries jutted out sideways; 8 candidates rendered in rk4/fold_bird.png, picked humerus
  [0,75,-25] / forearm [0,-165,0] / hand [0,175,0]), serpent slam rear-up doubled (root 0.45 -> 0.9, body bend 22 -> 36).
