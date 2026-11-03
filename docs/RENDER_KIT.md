STATUS: READY

# Render kit — boss and minion models

How content streams build the model of their bosses (and minions) with the render-kit code (src/render/kit/**,
src/render/rigs/**, data/anim/**). Everything below matches the code as it is today. The worked example is the
Guardiano del Regno, `src/content/bosses/guardiano_del_regno/model.ts` (section 11): copy its structure. If something
you need is missing, ask in docs/requests/<your-stream>.md (render-kit owns the files above).

## 1. How an actor is drawn

`ActorRenderer` (src/render/actors/ActorRenderer.ts) draws every `sim.actors` entry each frame:

1. It lazily imports the model module for `actor.defId` from `BOSS_MODELS` (src/generated/registry.render.ts) and
   calls its builder once per actor: `builder(def, ctx, actor) -> ActorVisual`. Clones (`actor.kind === 'clone'`) use
   the boss's id, so they get your model (tinted icy by the renderer). Decoys/allies/echoes are tinted too.
2. No module, a module that fails to load, or a builder that throws -> the **generic family model**
   (src/rigs/generic.ts `buildGenericVisual`): picked by `def.model.rig`, colored by `def.model.palette`, sized by
   `def.body`, heads from part ids. Never a capsule, but generic: every boss should ship its own model.
3. Every frame: `visual.update(actor, alpha, dt, sim)` (your RigVisual places, scales and animates the model), then the
   renderer drives the per-actor FX uniforms generically (section 7.2). You never code hit flash, Colpo Rosso tint,
   Spezzato cracks, the phase-transition aura or the death dissolve yourself.
4. Actors that leave `sim.actors` are disposed (`visual.dispose()`).

## 2. Registering a model module

| What | File | Export | Registered by |
| --- | --- | --- | --- |
| Boss model | `src/content/bosses/<bossId>/model.ts` | `export default` a `BossModelBuilder` | `npm run registry` (key = folder = boss id) |
| Minion models | same file | `export const minions: Record<minionId, BossModelBuilder>` | looked up through the owner boss (the minion id is in `data/bosses/<bossId>.yaml` `minions`) |

```ts
// src/render/types.ts
type BossModelBuilder = (def: BossDef | MinionDef, ctx: RenderCtx, actor: Actor) => ActorVisual;
interface ActorVisual { root: THREE.Object3D; update(actor, alpha, dt, sim): void; height: number; dispose(): void }
```

Return a `RigVisual` (src/render/rigs/visual.ts): it implements ActorVisual for kit models. A minion without an entry in
`minions` gets the generic model of its `model.rig`. Run `npm run registry` after adding the file (the generated registry
is committed by the lead), and keep `model.builder` = boss id in the data for consistency (the registry keys by folder).
Imports from a model module: only `three`, `src/render/**` and `src/core/types` / `src/sim/actor` types. A model module
must never import sim code at runtime or another boss's module.

## 3. Frame, size and lining up with the data

- **Local frame = sim frame**: origin on the ground under the actor, **+Z forward, +Y up, +X = the boss's LEFT**, meters.
  The renderer sets `root.position = actor.pos`, `root.rotation.y = actor.yaw`, `root.scale = actor.scale * def.model.scale`.
  Build the model at `def.model.scale = 1` size in this frame and it lines up with `hurtboxes`, `parts[].hurt`, attack
  `hits` shapes and `spawns.from` offsets, which use the same frame.
- **Size from data**: derive every dimension from `def.body.height` / `def.body.radius` (the Guardiano: `H =
  def.body.height`, horse = 0.5 H, rider = 0.52 H). Then the hurtboxes you wrote cover the visible body. Check: every
  hurtbox sphere sits inside the silhouette, and no big visible limb is outside every hurtbox (players hit what they see).
- **Reach**: weapons, tails and necks must reach as far as the hit shapes that animate them (the Guardiano lance tip
  reaches ~6 m forward because `lance_thrust_combo` capsules end at z 6.0-6.4).
- **Parts**: part ids are free, but multi-head rigs map parts to bone chains (section 6.5). Broken / inactive parts
  (`part.broken`, `!part.active`) shrink the tip bone of their part chain to zero automatically and regrow it.
- **height**: `RigVisual.height` (default 0.55 x model height) is the visual centre used by camera framing and lock-on;
  override with `RigVisualOpts.height` for tall thin or flat wide bosses.

## 4. Kit API

### 4.1 ModelBuilder (src/render/kit/model.ts) — `const mb = ctx.kit.model(def.id, ctx.quality)`

Everything sharing a surface (material) is merged into ONE SkinnedMesh bound to one Skeleton: a whole boss is
typically 6-14 draw calls. Rest pose is built in model space (section 3).

| Call | Does |
| --- | --- |
| `bone(name, parent \| null, pos, rot?)` | bone at `pos` relative to the parent (rest), `rot` degrees XYZ (rarely needed) |
| `chain(prefix, parent, count, first, step, bend?)` | bones `prefix_0..n-1`, registered as chain `prefix` (springs, waves, IK) |
| `namedChain(name, bones)` | register an existing list of bones as a chain |
| `surface(id, SurfaceSpec)` | define a material; parts reference it by id; vertex colors carry the colors (`castShadow: false` to skip shadows) |
| `part(bone, geo, surface, {pos, rot, scale, color, shade})` | rigid geometry on a bone, transform in the bone's local frame; `shade` darkens toward the bottom (painterly AO) |
| `partModel(bone, geo, surface, color?)` | rigid geometry already placed in model space, skinned to `bone` |
| `tube(bones, surface, TubeOpts) -> TubeHandle` | smooth skinned tube along a chain: limbs, necks, tails, serpents, tentacles. `radius` number or `(t) => r` (use `profile([[t, r], ...])` from rigs/families/common.ts), `color/colorEnd/belly`, `flatten`, `ridge`, `twist`, `tip`, `start`, caps |
| `TubeHandle.scatter(surface, geo, count, {t, theta, scale, lean, seed, color, sink, rows})` | scales, plates, spikes, fur tufts on the tube surface, skinned with it |
| `TubeHandle.at(t, theta)` | surface point + normal (place horns, eyes, glow spots on a tube) |
| `cloth(bones, surface, ClothOpts)` | skinned strip on a chain: capes, banners, tabards, barding skirts (`width/widthEnd`, `side`, `bulge`, `ragged`); use a DoubleSide surface |
| `membrane(rays, surface, MembraneOpts)` | skinned surface between bone rays: bat/dragon wings, fins (`scallop`, `colorEdge`) |
| `fan(bone, surface, geoFn, count, {from, to, pos, posTo, scale, color, colorEnd})` | feathers / leaves / plumes interpolated between two rotations, rigid on one bone |
| `socket(name, bone, pos, rot?)` | attachment point (weapons, FX emitters) -> `model.sockets[name]` |
| `addRaw(surface, geo)` / `skinGeometry(geo, idx[4], w[4], color?)` | custom skinned geometry (the Guardiano caparison is one hand-built sheet with Bernstein weights over 3 bones) |
| `restPos(bone)` / `restMatrix(bone)` / `boneIndex(bone)` / `has(bone)` / `seg(base, min)` | rest-pose queries; `seg` = quality-scaled segment count (low x0.6, medium x0.8) |
| `size` / `height` / `info` | pose root-offset unit (hip height), visual height, rig metadata (family builders fill these) |
| `build() -> Model` | merge + bind. `model.triangles` = total |

`Model`: `root`, `bones`, `sockets`, `chains`, `meshes`, `materials`, `fx` (per-actor FX uniforms), `size`, `height`,
`info`, `triangles`; `setShadow(cast)` (call `model.setShadow(ctx.quality !== 'low')`), `attach(boneOrSocket, obj)`
(non-skinned extras, disposed with the model), `addAura(color, {surfaces, inflate, power, strength, flow})` (fresnel
shell; RigVisual does this for flag auras), `resetPose()`, `dispose()`.

### 4.2 Geometry (src/render/kit/geometry.ts, `import * as geo`)

All return a fresh `BufferGeometry` you hand to `part()` (consumed). V3 = `[x, y, z]`.

`ellipsoid(rx, ry, rz, ws, hs)`, `capsule(r, len)`, `lathe([[r, y], ...], segs)` (helms, shafts, vases, bells; profile
r first), `bevelBox(w, h, d, radius)`, `spike(r, h, radial, bendZ)`, `horn(length, baseR, bend, spiral)`,
`torus(R, r, radial, tubular, arc)`, `rock(r, detail, seed, rough, stretch)`, `tube(points, radius, opts)` (static
swept tube), `blade(outline, thickness, bevel)` + `leafOutline(length, width, widest, steps, tipSharp)` (extruded
blade/leaf/lance heads lying along +Y; rotate with `.rotateX(Math.PI / 2)` to point +Z), `plate(w, h, curveR,
thickness)` (curved armor plate), `leaf(length, width, segs, curl, fold)`, `furTuft(len, r, count, seed)`,
`crown(radius, bandH, points, spikeH, broken[], thickness)` (the broken crown of the Regno), `displace`,
`noiseDisplace(geo, amp, freq, seed)`, `paint(geo, color)`, `gradient(geo, axis, c0, c1)`, `shadeByHeight`,
`xform(geo, pos, rotDeg, scale)`, `flipFaces`, `doubleSide`, `mergeGeometries(list)`, `triCount(geo)`,
`instances(geo, mat, [{pos, rot, scale, color}])` (InstancedMesh for repeated static parts), `lod(levels)`.

### 4.3 Surfaces / materials (src/render/kit/materials.ts)

`SurfaceSpec` (= `SurfaceOpts` + `castShadow`): `roughness`, `metalness`, `emissive`, `emissiveIntensity`,
`emissiveVertexColor` (glow tinted per part by vertex color), `detail` ('noise' | 'metal' | 'scales' | 'bark' |
'cloth' | 'fur' | 'stone' | 'chitin' | 'feather' | 'skin' | 'leather' | 'crystal' | 'lava' | 'mud' | null),
`detailScale` (cycles / m, triplanar, object space), `detailStrength`, `rim` / `rimPower` (fresnel rim driven by the sky),
`toon`, `side`, `transparent`, `opacity`, `alphaTest`, `flatShading`, `fog`. All kit materials are stylized PBR
(wrap lighting, rim, detail map) and carry the per-actor FX uniforms automatically when built by ModelBuilder.

Standard surface sets: `standardSurfaces(mb, prefix, style)` (rigs/families/common.ts) defines `skin, cloth, metal,
dark, glow, cape, horn` with sensible defaults (`style.skinDetail`, `metalRough`, `metalness`, `glowIntensity`, `rim`,
`toon`, `overrides`). **Use a prefix per body** you want to address separately (the Guardiano: `steed_*` and `knight_*`,
so the spectral aura wraps only the horse). Keep the number of surfaces small: each surface = one draw call (+1 shadow).

Shared helpers: `ctx.kit.mat(opts)` (cached static material for props/extras), `ctx.kit.glow(color, opacity)` (cached unlit
glow, additive below opacity 1), `ctx.kit.fresnel(color, {power, strength, inflate, flow})` (additive shell for ghosts,
orbs, spectral wraps), `ctx.kit.sprite(kind)` / `tex.spriteAtlas()` (sprite textures), `ctx.kit.detail(kind)`.

### 4.4 Palette (src/render/kit/palette.ts)

`const P = pal(ctx, def.model.palette)` -> `P.primary, secondary, accent, dark, light, metal, glow` (any extra key with
`P.c('key')`). Palettes: act1_green_gold, act2_red_blue_black, act3_white_azure, act4_vivid, act5_gold_white_midnight,
act6_violet_red_black, act7_white_gold_sunrise, mirror, portatore (data/palettes/index.yaml). Color ops return hex:
`mix(a, b, k)`, `shade(c, k)` (lightness), `saturate(c, k)`, `hue(c, deg)`, `elementColor(element)`.
`colorsFrom(P)` (common.ts) gives the ColorSet the family body builders take. Rule: derive from the act palette, then
give the boss one signature color/glow of its own.

## 5. Rig families

Each family = a skeleton builder (bones + `mb.info`: root bone, walk/run speeds, springs, look-at bones, flinch bones) +
a body builder (procedural body on that skeleton) + a pose library `data/anim/<family>.yaml`. Use the skeleton builder,
optionally the body builder, then add your own parts on the family's bones. `def.model.rig` names the family for the
generic fallback (`familyOf`: 'mounted*', '*quadruped*/wolf/hound/bear/beast', serpent/snake/worm/hydra/chain,
dragon/wyvern, bird/griffin/eagle, insect/mantis/beetle/ant/spider/wasp, tree/plant, tentacle/kraken/cthulhu,
colossus/golem/giant, else humanoid).

| Family (`RigVisualOpts.family`) | Skeleton / body (src/render/rigs/families/) | Bones (rest: facing +Z, +X = left) | Pose library |
| --- | --- | --- | --- |
| humanoid | `humanoidSkeleton(mb, {height, build, shoulders, armLength, legLength, hunch, prefix, parent, at, cape, hair, tail, jaw})` / `humanoidBody(mb, d, {skin, cloth, metal, trim, glow, armor: none\|tunic\|plate\|robe\|bare, head: human\|helm\|hood\|skull\|beast\|mask\|none, cape, bulk, surfaces})` | root > hips > spine > chest > neck > head (> jaw); chest > shoulder_l > arm_l > forearm_l > hand_l (+ _r); hips > thigh_l > shin_l > foot_l (+ _r); chains cape_*, hair_*, tail_*; sockets grip_l/grip_r (weapon, +Z out of the fist), back, seed, head_top | humanoid.yaml (35+ clips) |
| quadruped | `quadrupedSkeleton(mb, {length, height, legStyle: equine\|canine\|ursine\|feline, heads 1-3, neckBones, neckLength, neckAngle, tailBones, width})` / `quadrupedBody(mb, d, {body, belly, dark, mane, hoof, eye, eyeGlow, fur, muzzle, ears, horns, teeth, bulk, surfaces})` | root > body (pelvis) > spine > chest; chest > neck_0..n > head > jaw (extra heads neck_l_* / head_l / jaw_l, neck_r_* ...); chest > leg_fl_0..2, leg_fr_0..2; body > leg_bl_0..2, leg_br_0..2; body > tail_* | quadruped.yaml |
| mounted | `mountedSkeleton(mb, {horse: QuadrupedOpts, rider: HumanoidSkeletonOpts, seat})` (+ quadrupedBody + humanoidBody) | the quadruped bones + `saddle`, `rider_root`, `seat` + the humanoid bones prefixed `rider_` | mounted.yaml (steed_* = quadruped, foot_* = dismounted rider) |
| colossus | `colossusSkeleton(mb, {height, build...})` / `colossusBody(mb, d, {matter: rock\|mud\|lava\|ice\|bone, body, chunk, glow, heart, dressing})` | humanoid bones, heavy proportions | not yet (*) |
| serpent | `serpentSkeleton(mb, {length, radius, segments, heads up to 5, neckBones, neckLength, rise, front})` / `serpentBody(mb, d, {body, belly, pattern, eye, horns, spikes, mouth: snake\|ring, scales, glow})` | root > body_0 (front) .. body_n (tail tip, -Z); body_0 > neck{sfx}_0..k > head{sfx} > jaw{sfx}, sfx '' \| _l \| _r \| _l2 \| _r2 | not yet (*) |
| dragon | `dragonSkeleton(mb, {length, height, heads 1-3, neckLength, neckBones, tailLength, tailBones, wingSpan, frontLegs, width})` / `dragonBody(mb, d, {body, belly, membrane, membraneEdge, horn, eye, headColors, glow, crystals, stars, spikes})` | root > body > spine > chest; chest > neck{sfx}_* > head{sfx} > jaw{sfx}; legs leg_fl/fr/bl/br_0..2; body > tail_*; chest > wing_l_0..2 > wing_l_f{0,1,2}_{0,1}; wing_l_b_0..1 (+ _r) | not yet (*) |
| bird | `birdSkeleton(mb, {height, wingSpan, griffin, length})` / `birdBody(mb, d, {feather, featherTip, belly, fur, beak, talon, eye, glow})` | root > body > chest > neck_0..2 > head > jaw; chest > wing_l_0..2 (+ _r); body > tail_0 (griffin tail_*); legs leg_l_0..2 / leg_r_0..2 (griffin leg_fl/fr/bl/br_*) | not yet (*) |
| insect | `insectSkeleton(mb, {kind: mantis\|beetle\|ant\|wasp\|spider, height, length, legPairs})` / `insectBody(mb, d, {shell, shellDark, belly, eye, sheen, glow, crown, blade, wing})` | root > body > abd_0..2; body > chest > head > mand_l/mand_r, ant_l_0..2/ant_r_0..2; legs leg_l{i}_0..2 / leg_r{i}_0..2 (mantis front pair scythe_l_0..2 / scythe_r_0..2); elytra_l/r, wing_l_0/wing_r_0 | not yet (*) |
| tree | `treeSkeleton(mb, {height, radius, armLength, roots})` / `treeBody(mb, d, {bark, barkDark, leaves, leavesTip, glow, mushrooms, moss, face})` | root > trunk_0..3 > crown_*; trunk_2 > branch_l_0..2 / branch_r_0..2; trunk_3 > branch_l2_*, branch_r2_*; trunk_1 > jaw; root > rootl_* | not yet (*) |
| tentacled | `tentacledSkeleton(mb, {variant: kraken\|cthulhu, height, tentacles, tentacleBones, tentacleLength, wingSpan})` / `tentacledBody(mb, d, {skin, belly, sucker, eye, glow, membrane})` | kraken: root > body > head; body > tent{i}_0..k. cthulhu: humanoid bones + head > face{i}_* + chest > wing_* + mist{i}_* | not yet (*) |

(*) Pose libraries for these seven families are the next render-kit item. Until they land, a model of these families
holds its rest pose plus springs, look-at and hit flinch. You can ship your own clips today in `RigVisualOpts.clips`
(section 6.4): they take precedence over the family library, so they stay valid when it lands.

The `d` (Dims) object each skeleton builder returns has the measurements you need to place parts: humanoid `H, hipY,
shoulderX, upperArm, forearm, thigh, shin, r` (limb radius scale), `p` (prefix); quadruped `h, L, w, bodyY, chestY, heads,
necks, legs, tail`; and so on (see the interfaces in each family file).

## 6. Animation

### 6.1 What the animator reads

`RigVisual.update` feeds the Animator from the sim actor: `actor.anim` (the attack's `anim` keyword, or idle/walk/run),
`actor.animStage` (idle, move, telegraph, active, recovery, stagger, spezzato, transition, dead, scripted, hidden, intro),
`actor.animTime` / `actor.animDur` (seconds into the stage / its length), `actor.moveSpeedNow` (locomotion blend walk ->
run, distance-driven cycles), `actor.flags`, airborne (flying actors or > 0.5 m above the ground), `actor.hitFlash`
(flinch). Telegraph blends into the wind-up over 75% of the telegraph (with an optional tension tremble `hold`),
active snaps to the strike in <= 0.09 s, recovery settles and hands back to locomotion. Phase transitions play the
clip of `anim` (default `roar`), Spezzato plays the `spezzato` clip, death plays `death`, `scripted` actors may still
request a named pose through `anim` (e.g. 'kneel').

### 6.2 Keywords and resolution

Guaranteed keywords (`KEYWORDS` in src/render/rigs/clips.ts): idle, walk, run, overhead, sweep_l, sweep_r, thrust,
thrust_heavy, slam, stomp, rear_stomp, charge, leap, bite, breath, roar, claw_l, claw_r, tail_sweep, grab, throw, spin,
cast, summon, fly, hover, dive, swoop, burrow, emerge, coil, shield_bash, block, kick, howl, stagger, spezzato, death,
intro, transition.

An attack `anim` resolves in this order: flag prefix clip (e.g. `foot_<anim>` while 'dismounted') -> exact clip ->
model aliases (`RigVisualOpts.aliases`) / family aliases -> global aliases (about 200 verbs: slash, cleave, lunge,
trample, fire_breath, pounce, constrict, ...) -> mirror of the other side (`claw_l` from `claw_r`) -> shorter prefixes
(`thrust_combo_2` -> `thrust_combo` -> `thrust`) -> suffix compounds (`lance_thrust_combo` -> `thrust_combo` ->
`thrust`) -> any token -> `attack` (generic wind-up/strike) -> `idle`. Name attacks freely; pick an `anim` that resolves
to the motion you mean, or add a clip with exactly that name.

### 6.3 Clip format (data/anim/<family>.yaml or RigVisualOpts.clips)

```yaml
family: mounted
extends: quadruped            # optional parent library
includes: [{family: humanoid, bonePrefix: rider_, clipPrefix: foot_}]
aliases: {stomp: rear_stomp}
clips:
  overhead:
    base: steed_rear_stomp    # start from another clip and override (or `mirror: other_clip`)
    hold: 2                   # tension tremble (deg) at the end of the telegraph
    mask: [rider_*]           # only these bones (upper-body attack while the legs keep walking)
    telegraph: {pose: {rider_arm_r: [-150, 0, -10], rider_spine: [-12, 0, 0]}, root: [0, 0.1, -0.05], ease: out}
    active:    {pose: {rider_arm_r: [-40, 0, -6]}, rootRot: [8, 0, 0], ease: snap}
    recovery:  {pose: {rider_arm_r: [-20, 0, -10]}, blend: 0.5}
  idle:
    pose: {spine: [2, 0, 0]}
    cycle: {period: 3.2, bones: {chest: {x: [1.5, 0]}}, root: {y: [0.01, 0.25]}}
    waves: [{chain: tail, axis: y, amp: 8, wavelength: 5, period: 2.4}]
```

- `pose`: bone -> `[x, y, z]` degrees relative to rest. **x = pitch forward** (an upright chain leans forward, a forward
  chain nods down, a hanging limb swings BACK), **y = turn to the character's left**, **z = roll, top toward the
  character's right** (a left arm rises sideways with +z, a right arm with -z). Keys may be globs (`neck*`).
- `root`: offset of the root bone in units of `model.size` (hip height) `[left, up, forward]`; `rootRot` degrees.
- `cycle`: oscillations (`[amplitude, phase 0..1, mode?]`, modes pos/neg/abs/double), time (`period`) or distance
  (`stride`, size units) driven. `waves`: travelling waves along a chain (serpents, tails, tentacles, wing fingers).
- Stage blend overrides: `ease` (out, in, inout, snap, linear, back), `blend` (fraction of the stage).
- Weapon pitch tip (humanoid / rider): the weapon's pitch is the SUM of the x rotations of arm + forearm + hand
  (0 = horizontal forward, -90 = straight up).

### 6.4 Model-specific clips

```ts
new RigVisual(ctx, def, actor, model, {
  family: 'dragon',
  clips: { tail_cyclone: { telegraph: { pose: { 'tail_*': [0, 40, 0] } }, active: { waves: [{ chain: 'tail', axis: 'y', amp: 50, period: 0.5 }] } } },
  aliases: { ng_tail_cyclone: 'tail_cyclone' },
});
```

Clips here override family clips of the same name; aliases map your attack anims to clip names.

### 6.5 Multi-part rigs, springs, look-at

- `mb.info.partChains = { head_left: { bones: ['neck_l_0', 'neck_l_1', 'neck_l_2', 'head_l'], weight: 1 } }` maps a
  sim part id to a chain root..tip. When the behavior moves `actor.parts[i].anchor` (offset from the part's first hurtbox
  centre, actor-local meters), the chain reaches the moved point by CCD IK (weight rises with the anchor offset, so free
  animation runs while the anchor is zero). Broken / inactive parts shrink the chain tip away (and regrow it). Family
  builders do NOT set partChains: set them yourself for multi-head / tentacle bosses whose behavior drives anchors.
- `mb.info.springs = [{ chain: 'cape', stiffness: 60, damping: 8, gravity: 2, weight: 1, falloff: 0.5 }]` (family
  builders already add cape/hair/tail/mane springs): secondary motion on top of the clips, zero allocation.
- `mb.info.look = [{ bone: 'head', weight: 0.6, limit: 60 }]`: look-at the player during idle, move, telegraph, intro
  (disable with `lookAtPlayer: false`). `mb.info.flinch`: bones that recoil on hits.
- Mounted-style tricks, all generic: `info.follow` (a bone follows another unless a flag is set), `info.hideOnFlag`,
  `info.flagPrefix` (flag -> clip prefix, also `airborne`), `info.flagRoot` (flag -> root bone).

## 7. RigVisual

### 7.1 Options (`new RigVisual(ctx, def, actor, model, opts)` or `rigVisual(...)`)

| Option | Meaning |
| --- | --- |
| `family` | clip library id (data/anim/<family>.yaml) |
| `flagAuras` | `{ [flag]: { color, surfaces?, strength?, inflate?, power?, flow? } }`: a fresnel shell over those surfaces that fades in while `actor.flags.has(flag)` (and the actor lives) |
| `onUpdate(v, actor, sim, dt)` | per-frame hook after animation: emissive pulses, extra meshes, flag-driven visibility (no allocation) |
| `extras` | objects with `update(dt, time)` updated each frame |
| `clips` / `aliases` | model-specific clips (6.4) |
| `height` | visual centre override (meters, before scale) |
| `lookAtPlayer` | default true for enemies |
| `info` | RigInfo override (else `model.info`) |

Useful members: `v.model` (bones, sockets, materials, fx), `v.animator` (`clipName`, `stage`), `v.boneWorld(name, out)`
(world position of a bone, e.g. to emit FX), `v.time`.

### 7.2 What the renderer does for you (any visual whose `root.userData.smFx` holds the model's fx, as Model does)

- Hit flash (white) when the actor is hit; **Colpo Rosso**: pulsing red tint + a red diamond warning icon above the
  attacker (shape + color, colorblind-safe) for the whole red telegraph.
- **Spezzato**: glowing cracks over every surface while `actor.state === 'spezzato'`.
- **Phase transition**: palette-glow aura while `animStage === 'transition'`.
- **Death**: dissolves into light (`fx.dissolve` 0 -> 1 over ~3 s), then the visual is hidden.
- `actor.hidden` -> invisible; Low preset -> blob shadows instead of shadow maps.

## 8. Flags and overlays

Phase `on_enter` flags land in `actor.flags` (data). Map them to visuals in the model:

- **Aura flags** via `flagAuras`. The Guardiano: `spectral_aura` (phase 2) -> pale blue flowing shell on the steed's
  surfaces only; `enraged` -> warm shell. The generic model adds `spectral_aura` and `enraged` to every family except
  colossus/tree.
- **Anything else** in `onUpdate`: e.g. `if (actor.flags.has('wings_burning')) ...` toggling extra meshes,
  emissive intensity (`(v.model.materials.glow as THREE.MeshStandardMaterial).emissiveIntensity = ...`), part visibility.
- Mounted: `dismounted` switches the rider to `foot_*` clips, re-roots at `rider_hips` and hides the steed.
- Prefer flags over new sim events: the model reads `actor` every frame, so a save loaded mid-phase shows the right state.

## 9. VFX hooks (src/render/fx/FxRenderer.ts, `renderer.fx`)

Drawn for you from data, no code needed:
- **Attack warnings**: during every enemy attack's telegraph the footprint of its first hit windows (`hits` with t <= 0.75)
  is drawn on the ground: bright edge + dark outline, faint area fill, a fill growing toward impact, edge pulsing faster
  near impact; Colpi Rossi (`flags: [red]`) are red AND hatched (pattern, colorblind-safe) next to the red diamond icon.
  `forward` / `charge_through` motions stretch the footprint into a lane; `leap_to_target` / `dive_to_target` mark the
  landing point; part-local hits follow the part. Write honest hit shapes: the warning is exactly what hits.
  `fx.attackWarnings = 'all' | 'red' | 'off'`.
- **Hazards** (`data/hazards/*.yaml` `visual` + `color`): telegraph decal of the shape during `delay`, then the active look
  by visual family — circle (flash), fire / lava (flicker + flames), embers / pollen / flowers / acid (dots + spores),
  ice / glass (facets + shards), light / lightning / star (rays + flash; lightning adds a bolt column), crack / spikes /
  roots / mud (broken ground + debris), void / shadow / whirlpool / water / fog (swirl + mist). Cylinders with `h >= 3`
  of fire/light families also get a pillar. Static arena hazards (`permanent`) stay on at half intensity.
- **Shockwaves** (`type: shockwave`, ring shapes): an expanding wall as tall as the ring's hit `height` (the player jumps
  over it) + a ground ring + dust.
- **Projectiles** (`data/projectiles/*.yaml` `visual`, `color`, `radius`): head sprites, oriented meshes (arrow, harpoon,
  chain, tentacle, rock, seed, ball, disc, shard, feather, raven), ribbon trails and shed particles for all 23 visuals.
- **Combat events**: hit sparks by element (weak points add gold), player hurt, perfect dodge (flash + ring + afterimage
  of the Portatore), dodge wisps, parry / counter star, block, guard break shards, Spezzato burst + ground ring, Colpo di
  Grazia (white flash + light pillar + motes, impact burst on `graceHit`), part broken, explosions, boss defeat motes,
  Metamondo spherical warp + reactions (shatter / rewrite / devour / spit).
- **vfx ids** (attack `vfx:` or spawn `{type: vfx, vfx: <id>}`, emitted at the spawn origin, optional `params.color`,
  `params.radius`): `teleport` / `blink` / `vanish` / `appear`, `summon` / `minion_spawn` / `spawn`, `bind`,
  `ally_wing_shield`, `collider_add:<id>` (growth from the ground), and a generic sparkle burst for any other id (colored
  by `params.color` or an element word in the id: `fire_*`, `ice_*`, `void_*`, ...).

Code hooks (e.g. in an arena.ts or a model's first update; `renderer.fx` is reachable from `__game.renderer.fx`):
- `fx.registerVfx('myboss_*', (e, sim, fx) => ...)` claims vfx ids (exact or prefix) and replaces the built-in look.
- `fx.registerHandler(type, (e, sim, fx) => ...)` subscribes to any sim event type (runs before the built-ins).
- `fx.spawn({ update(dt, sim) { ...; return alive; }, dispose() {} })` adds a self-updating effect.
- Presets (no allocation): `fx.sparks(x, y, z, color, count, speed?, size?)`, `fx.flash(x, y, z, color, size, life?,
  cell?)`, `fx.ring(x, y, z, radius, color, life?, height?, kind 0 wall | 1 pillar)`, `fx.puff(...)` (smoke),
  `fx.motes(...)` (rising lights), `fx.shards(...)`; `fx.color(hex)` returns a cached THREE.Color. Raw GPU particles:
  `fx.particles` (additive) / `fx.smoke` (alpha) `.emit({x, y, z, vx, vy, vz, life, size0, size1, r, g, b, a, cell,
  gravity, drag, spin, stretch})`, cells from `CELL` in src/render/fx/particles.ts.
- In a model: emit light from bones in `onUpdate` (glow surfaces, `boneWorld`), never real THREE lights.
- Debug: `__game.sim.debug.showHitboxes = true` draws hurtboxes (green), parts (cyan), active hit windows (red), the
  player volume (blue) and projectiles.

## 10. Budgets and quality

- Boss <= 80k triangles on High (prefer 15-40k), far less on Low; a whole boss ~6-14 surfaces (draw calls, x2 with
  shadows). The Guardiano is 15.9k triangles on High in 13 surfaces (two standard sets + the lance ivory). Scene budget (D3): ~250 draw calls / ~400k triangles
  on High.
- Quality: `ctx.quality` ('low' | 'medium' | 'high'); use `mb.seg(base, min)` for every segment count (already scaled),
  drop small detail on Low, `model.setShadow(ctx.quality !== 'low')`.
- Repeated parts: `TubeHandle.scatter` / `fan` (merged into the surface) or `geo.instances` for static extras.
- No per-frame allocation in `onUpdate` (module-level scratch vectors), no `Math.random` (use `new Prng(seedOf(def.id))`
  from the kit so the model is identical every load), no real lights, no DOM.
- Glow: emissive `glow` surfaces (tone mapped, safe). Additive fresnel shells are not tone mapped: keep their strength
  <= ~1.5 and their surfaces small, or they bloom white in the alba/tramonto light.
- Tests: tests/render_models.test.ts builds every registered BOSS_MODELS entry on low/medium/high, asserts < 80k
  triangles and animates every attack's anim through telegraph/active/recovery without NaN. Run
  `npx vitest run tests/render_models.test.ts` after `npm run registry`.

## 11. Worked example: Guardiano del Regno

`src/content/bosses/guardiano_del_regno/model.ts` (data: data/bosses/guardiano_del_regno.yaml, `rig: mounted_humanoid`,
`body {radius 1.5, height 4.4}`, hurtboxes horse chest [0, 1.4, 0.9], horse body [0, 1.5, -0.8], rider torso [0, 3.2,
-0.1], helm [0, 4.0, -0.1]).

```ts
const build: BossModelBuilder = (def, ctx, actor) => {
  const C = colors(ctx, def);                         // pal(ctx, def.model.palette) + mix/shade -> named colors
  const H = Math.max(3, def.body.height);             // everything derives from the data size
  const mb = ctx.kit.model(def.id, ctx.quality);
  const horseH = H * 0.5;
  const d = mountedSkeleton(mb, {
    horse: { length: horseH * 0.98, height: horseH, legStyle: 'equine', tailBones: 4, width: 0.235 * horseH },
    rider: { height: H * 0.52, build: 0.9, shoulders: 1.08, cape: 6, jaw: false },
  });
  // two surface sets: the aura can wrap the steed alone
  const SS = standardSurfaces(mb, 'steed_', { skinDetail: 'skin', skinRough: 0.55, metalRough: 0.5, metalness: 0.68 });
  const SK = standardSurfaces(mb, 'knight_', { metalRough: 0.46, metalness: 0.72, rim: 1.0, glowIntensity: 1.6 });
  quadrupedBody(mb, d.horse, { body: C.coat, belly: C.coatBelly, dark: C.coatDark, mane: C.mane, eye: '#cfe8ff', eyeGlow: true, ears: 'equine', surfaces: SS, bulk: 1.06 });
  barding(mb, d.horse, SS, C);                        // caparison (addRaw sheet), peytral, crinet, chanfron, saddle
  humanoidBody(mb, d.rider, { skin: '#8a8880', cloth: C.green, metal: C.silver, trim: C.gold, glow: C.glow,
    armor: 'plate', head: 'none', cape: { width: 0.36, color: C.green, colorEnd: C.greenDark, ragged: 0.45 }, surfaces: SK, bulk: 1.3 });
  crownHelm(mb, d.rider, SK, C);                      // lathe helm + geo.crown(..., broken [1, 4]) + glowing visor slit
  knightArmor(mb, d.rider, SK, C);                    // layered pauldrons (plates), tabard, faulds
  lance(mb, d.rider, SK, C);                          // parts on rider_hand_r at the grip offset: shaft, vamplate, leaf head
  const model = mb.build();
  model.setShadow(ctx.quality !== 'low');
  return new RigVisual(ctx, def, actor, model, {
    family: 'mounted',
    flagAuras: {
      spectral_aura: { color: C.spectral, surfaces: Object.values(SS), strength: 1.5, power: 2.2, flow: 1.2 },
      enraged: { color: '#ff7a48', surfaces: Object.values(SS), strength: 0.8 },
    },
  });
};
export default build;
```

What to copy from it:
1. **Sizes from data, frame from the sim**: horse withers 2.2 m and rider 2.29 m for `height 4.4`; the horse chest lands
   on the chest hurtbox, the helm on the helm hurtbox (asserted in tests/render_models.test.ts).
2. **Family skeleton + family bodies, then signature parts on named bones**: weapon parts go on `rider_hand_r` at the
   grip offset `[0, -0.045 H, 0.012 H]` (the humanoid grip socket) pointing +Z, so the mounted clips aim it.
3. **Surface sets per body** for flag overlays; vertex colors for every color (few materials).
4. **Custom skinned geometry** when a primitive is not enough (`caparison`: one sheet, weights blended over
   body/spine/chest so rearing bends it).
5. **Animation from data**: attack anims `charge`, `thrust`, `overhead`, `sweep_r`, `rear_stomp` (trample) resolve to
   dedicated clips of data/anim/mounted.yaml; `lance_thrust_combo` resolves through suffix compounds to `thrust`.

## 12. Checklist and headless check

1. Model module exists, `npm run registry` lists it, `npx vitest run tests/render_models.test.ts` passes.
2. Silhouette unique and readable at phone size from the follow camera (12-20 m), signature glow, act palette.
3. Hurtboxes inside the silhouette; weapons/tails reach their hit shapes; every attack anim resolves to a clip that
   reads (wind-up pose, snap, settle); flags show their overlay; broken parts vanish.
4. <= 80k triangles on High, few surfaces, no per-frame allocation, deterministic (Prng).
5. Look at it: run your Vite on your port, then in Playwright (1280x576) `await __game.newGame(0, {...});
   __game.sim.seq.skip(__game.sim); __game.sim.debug.invincible = true; __game.sim.startFightDirect('<boss>', {skipIntro:
   true})`, wait for `!__game.renderer.world.busy`, and orbit with `__game.renderer.rig.inspect = {yaw, pitch, distance,
   height, target: null}` (CameraRig.inspect, set to null to return to the follow camera). `__game.renderer.stats` gives calls/triangles.
