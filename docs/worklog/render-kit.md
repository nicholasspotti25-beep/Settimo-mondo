# Work log — render-kit (RENDER KIT + CHARACTERS, Vite port 5174)

Brief: docs/briefs/render-kit.md. Owned: src/render/Renderer.ts, camera.ts, kit/**, rigs/**, actors/**, fx/**, data/anim/**,
docs/RENDER_KIT.md, src/content/bosses/guardiano_del_regno/model.ts, tests/render*.test.ts.

## Status

| # | Deliverable | Status | Files |
|---|---|---|---|
| 1 | Procedural kit (lathe, swept/skinned tubes, blades, ellipsoids, bevel boxes, instanced scatter, fur, membranes, cloth/capes, merge/LOD, stylized PBR + rim/fresnel, actor FX uniforms, cached textures, blob shadows) | done (code); used by real models in game since chunk 1 | src/render/kit/*.ts |
| 2 | Rigs: animator, clip libraries + keyword resolution, springs, IK, part anchors, 10 family builders, generic-from-data builder | partial: core + generic builder done and verified for humanoid/quadruped/mounted; the other 7 families have no pose library yet (they hold their rest pose) | src/render/rigs/**, rigs/generic.ts |
| 3 | ActorRenderer: Portatore, player states, weapons + trails, bosses (BOSS_MODELS + generic fallback), clones/decoy/ally, overlays | partial (v1): Portatore from CharacterLook (cloak, seed glow, vial of light, no shadow, smooth scale, every player state mapped, dodge roll pivot, lock look-at); weapon via buildWeapon on grip sockets; bosses via lazy BOSS_MODELS or generic family model; clone/decoy/ally/echo tints; hit flash, pulsing red flash + red warning icon; Spezzato cracks; transition aura; death dissolve; hidden; blob shadows on Low. Missing: swing-arc generator + trails, part highlight constellation lines, two-hand IK | src/render/actors/ActorRenderer.ts, actors/portatore.ts |
| 4 | FxRenderer: pooled particles, projectile/hazard visuals, combat FX, fallbacks, Metamondo warp, debug hitboxes | missing (sphere/disc stub) | src/render/fx/FxRenderer.ts |
| 5 | Renderer/camera: registerShot hook, screenPoint, bloom/outline, act grading, shadow presets, lock-on framing, gravity roll, shake | partial: quality/watchdog/dynamic res, lock-on framing, ctx.registerShot wired, renderer.screenPoint(), post pipeline src/render/fx/post.ts: probe-driven auto exposure ACTIVE on all tiers (direct path); HDR path (half-float target, MSAA x4 High, dehaze, ACES, per-act grading, vignette, dither, bloom mips) written but switched OFF (HDR_ENABLED=false, see Notes); CameraRig.inspect; no outline yet | src/render/Renderer.ts, camera.ts, fx/post.ts |
| 6 | data/anim/*.yaml pose libraries | partial: humanoid (35 clips), quadruped, mounted (steed + seated rider + foot_ dismounted), portatore (player actions) done; colossus, serpent, dragon, bird, insect, tree, tentacled missing | data/anim/ |
| 7 | Guardiano del Regno reference model | done (chunk 2): barded slate destrier (dagged green-gold caparison with crown heraldry, peytral, crinet, chanfron, saddle), dull-silver knight (broken-crown great helm, layered pauldrons, tabard, faults, cape), Lancia del Custode (white shaft, vamplate, leaf head with crown socket); 'spectral_aura' wraps only the steed | src/content/bosses/guardiano_del_regno/model.ts |
| 8 | docs/RENDER_KIT.md | missing | docs/RENDER_KIT.md |
| — | tests/render*.test.ts | partial: tests/render_anim.test.ts (9 tests) | tests/render_anim.test.ts |

## Next

1. FxRenderer (top for gameplay): GPU particle system (fx.particles), hazard telegraph decals + active visuals per
   HazardKindDef.visual, shockwave rings (Guardiano heavy_overhead / ng_spectral_ring), projectile visuals with trails
   (spectral_lance), hit sparks, dodge/parry/guard/Spezzato/Grazia FX, generic fallback ('collider_add:<id>',
   'ally_wing_shield'), debug hitboxes. Replaces the stub's white spheres (they show as white blobs on fighters).
2. Exposure part 2 (src/render/fx/post.ts, HDR_ENABLED=false today): clamp kit rim/specular for half floats (white
   blocks after MSAA resolve), make the dehaze cut follow view changes instantly (crushed rk2/final_1_boss_high), then
   enable HDR + per-act grading + vignette, and bloom (BLOOM_LEVELS high 5 / medium 3) once the world stream re-tunes its
   additive layers (request filed). Re-shoot vetta_attesa alba/tramonto/notte; outline pass; shadow preset check.
3. Remaining pose libraries: colossus, serpent, dragon, bird, insect, tree, tentacled (+ extend render_anim tests).
4. ActorRenderer v2: swing-arc generator from SwingDef.arc + weapon trails (base/tip), left-hand IK for two-handed grips,
   part.highlight constellation lines, multi-part lock markers; Portatore cloak drape polish.
5. Guardiano polish: hind thigh still grazes the caparison rear in some poses; chanfron reads boxy from the front; add a
   model triangle-count assert (< 80k) to tests/render_anim.test.ts for BOSS_MODELS entries.
6. Generic model polish: humanoid sword clips need hand_r pitch tuning (blade follows the swing arc).
7. docs/RENDER_KIT.md (STATUS: READY when stable; Guardiano model.ts is the worked example), full screenshot pass
   (title -> new game -> Guardiano: idle, attacks, red telegraph, Spezzato, grace) low/high.

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

