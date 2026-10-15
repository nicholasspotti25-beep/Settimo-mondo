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
| 5 | Renderer/camera: registerShot hook, screenPoint, bloom/outline, act grading, shadow presets, lock-on framing, gravity roll, shake | partial: quality/watchdog/dynamic res, lock-on framing fixed (chunk 1), shadow map type fixed; registerShot not wired into ctx, no screenPoint, no post/grading | src/render/Renderer.ts, camera.ts |
| 6 | data/anim/*.yaml pose libraries | partial: humanoid (35 clips), quadruped, mounted (steed + seated rider + foot_ dismounted), portatore (player actions) done; colossus, serpent, dragon, bird, insect, tree, tentacled missing | data/anim/ |
| 7 | Guardiano del Regno reference model | missing (the generic mounted model from its data shows meanwhile) | src/content/bosses/guardiano_del_regno/model.ts |
| 8 | docs/RENDER_KIT.md | missing | docs/RENDER_KIT.md |
| — | tests/render*.test.ts | partial: tests/render_anim.test.ts (9 tests) | tests/render_anim.test.ts |

## Next

1. Guardiano del Regno model (mounted rig: barded steed, dull-silver knight, broken-crown helm, white lance with
   leaf-shaped head, 'spectral_aura' flag aura on the horse; line up with hurtboxes) + `npm run registry`. Check the
   overhead telegraph rear angle (it looks steeper than rootRot -24 in screenshots) and lance pitch per clip.
2. FxRenderer: GPU particle system (fx.particles), projectile visuals per ProjectileKindDef.visual with trails, hazard
   telegraph decals + actives per HazardKindDef.visual, rings, hit sparks, dodge/parry/guard/Spezzato/Grazia FX,
   generic fallback ('collider_add:<id>', 'ally_wing_shield'), debug hitboxes.
3. Renderer: `ctx.registerShot = (id, fn) => this.rig.registerShot(id, fn)`, `screenPoint(worldPos)`, bloom/outline/
   grading per quality and act, blob vs real shadow per preset.
4. Remaining pose libraries: colossus, serpent, dragon, bird, insect, tree, tentacled (+ extend render_anim tests to them).
5. ActorRenderer v2: swing-arc generator from SwingDef.arc + weapon trails (base/tip), left-hand IK for two-handed grips,
   part.highlight constellation lines, multi-part lock markers; Portatore cloak drape polish (reads a bit plank-like).
6. Generic model polish: steed coat detail reads blotchy at distance, rider small vs steed; humanoid sword clips need
   hand_r pitch tuning (blade follows the swing arc).
7. docs/RENDER_KIT.md (STATUS: READY when stable), full screenshot pass (title → new game → Guardiano: idle, attacks,
   red telegraph, Spezzato, grace) low/high.

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
