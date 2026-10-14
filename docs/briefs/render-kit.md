# Stream: RENDER KIT + CHARACTERS (Vite port 5174)

Owns: src/render/Renderer.ts, src/render/camera.ts, src/render/kit/**, src/render/rigs/**, src/render/actors/**,
src/render/fx/**, data/anim/**, docs/RENDER_KIT.md, src/content/bosses/guardiano_del_regno/model.ts, tests/render*.test.ts.
Also read: src/render/Renderer.ts, camera.ts, kit/index.ts, actors/ActorRenderer.ts, fx/FxRenderer.ts, weapons/index.ts
(contract only), src/sim/actor.ts, player.ts, types.ts, sim.ts, data/bosses/guardiano_del_regno.yaml.

Deliverables:
1. src/render/kit/: rich procedural kit — lathe profiles, tubes along curves with radius profiles, skinned tube builder
   (SkinnedMesh + bone chain) for serpents/necks/tails/tentacles/chains, extruded blade profiles, ellipsoids, beveled boxes,
   instanced plates/scales/spikes, fur cards, membrane and feathered wings, tendrils, capes, merge + LOD helpers; stylized PBR
   with rim/fresnel (onBeforeCompile), emissive glow, palette-driven (ctx.palette), small cached procedural textures; blob
   shadow helper. Keep Kit entry points mat()/glow().
2. src/render/rigs/: rig families + data-driven procedural animator (pose clips from data/anim/<family>.yaml): humanoid,
   colossus, mounted (dismountable), quadruped (multi-head), serpent/chain (multi-head), dragon (≤3 heads, wings, tail, fly/
   hover/dive), bird/griffin, insect (mantis/beetle/ant), tree, tentacled (Kraken/Cthulhu). Reads Actor.anim, animStage
   (idle/move/telegraph/active/recovery/stagger/spezzato/transition/dead/scripted/hidden/intro), animTime, animDur,
   moveSpeedNow, flags. Keywords at least: idle, walk, run, overhead, sweep_l, sweep_r, thrust, thrust_heavy, slam, stomp,
   rear_stomp, charge, leap, bite, breath, roar, claw_l, claw_r, tail_sweep, grab, throw, spin, cast, summon, fly, hover, dive,
   swoop, burrow, emerge, coil, shield_bash, block, kick, howl, stagger, spezzato, death, intro, transition; graceful fallback
   (prefix match, generic attack). Telegraphs read clearly (wind-up), active snaps, recovery settles. Springs for capes,
   chains, hair, tails, tentacles, wings. Multi-part rigs follow sim part anchors (Actor.parts[i].anchor/.center).
3. src/render/actors/ActorRenderer.ts: the Portatore (from sim.state.character CharacterLook; elegant silhouette, cloak,
   seed-glow in the chest; NEVER castShadow unless sim.player.hasShadow), all player states animated (idle, move/run/sprint,
   jump, light/heavy/running/jumping via swing-arc generator from SwingDef.anim+arc, guard, parry, dodge roll/backstep, drink
   with glass vial of light, swap, transizione, art, stagger, knockdown, guardbreak, grace cinematic, kneel, dead, climb,
   interact/meditate kneel, locked, flying), smooth scale changes (0.1 / 1.12 / ×3). Weapons via buildWeapon(def, ctx) from
   src/render/weapons/index.ts (weapons stream implements it; use only its contract) with swing trails from base/tip.
   Bosses/minions: lazily load BOSS_MODELS[actor.defId] from src/generated/registry.render.ts; fallback = GOOD generic model
   from def.model.rig + palette + body dims + parts (never a grey capsule). Clones (Specchio ice mirrors), decoy, ally
   fallback. hitFlash, redFlash + distinct red warning icon above the attacker (colorblind-safe), Spezzato visual, phase
   transition aura, death dissolving into light, hidden actors invisible, part.highlight constellation lines, blob shadows.
4. src/render/fx/FxRenderer.ts: keep registerHandler/spawn API. Instanced/pooled, zero per-frame allocation: projectile
   visuals for every ProjectileKindDef.visual with trails; hazard telegraph decals + active visuals for every
   HazardKindDef.visual; shockwave rings; element hit sparks; perfect-dodge flash + afterimage; parry spark; block; guard
   break; Spezzato burst; Colpo di Grazia flash; explosions; teleport; minion spawn; generic fallback for unknown vfx ids
   (incl. 'collider_add:<id>' growth, 'ally_wing_shield'); GPU particle system exposed as fx.particles; Metamondo spherical
   warp on metamondoStart/End and reactions (shatter, rewrite, devour/spit); debug hitbox drawing when sim.debug.showHitboxes.
5. Renderer.ts/camera.ts: keep the API used by src/app/Game.ts. Set `this.ctx.registerShot = (id, fn) =>
   this.rig.registerShot(id, fn)`. Expose renderer.screenPoint(worldPos). Quality-gated bloom/outline, color grading per act,
   blob vs real shadows per preset, lock-on framing incl. multi-part lock points and pull-back for huge bosses, gravity-flip
   roll, hit-stop friendly shake.
6. data/anim/*.yaml pose libraries.
7. Reference model src/content/bosses/guardiano_del_regno/model.ts: knight in dull silver armor on a barded steed, helm shaped
   like a broken crown, white lance with leaf-shaped head; flag 'spectral_aura' (phase 2) wraps the horse in a spectral aura;
   lines up with the hurtboxes/attacks in its data.
8. docs/RENDER_KIT.md: API guide for content authors (compose a model, rigs, keywords, part anchors, VFX hooks, budgets,
   worked example). First line "STATUS: READY" once stable.
Verify: typecheck clean (your files), headless screenshots of title → new game → Guardiano fight (idle, attacks, red
telegraph, Spezzato, grace) and renderer.stats on low and high. Iterate on looks.
