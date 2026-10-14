# Authoring a boss (Act content work-streams)

Reference implementation: `data/bosses/guardiano_del_regno.yaml` (+ `data/story/act1/guardiano.yaml`,
`locales/*/act1_guardiano.yaml`). Read `docs/BIBLE.md` C10 for your boss card: **every element of the card must exist**
(look, fight per phase, time-of-day variation, lore line, weapon is owned by the weapons stream).

## Definition of done (per boss)
1. Data entry complete and valid (`SM_PARTIAL=1 npm run data` clean for your files; at the end strict `npm run data`).
2. Behavior with **all phases from the card** (data patterns + `behavior.ts` for special mechanics).
3. Readable telegraphs, avoidable attacks, fair on touch (rules below).
4. Arena: data (`data/arenas/<arena>.yaml`) + dressing (`src/content/bosses/<boss>/arena.ts`), fog gate, altar before it.
5. Music ids `boss_<id>` / `boss_<id>_p<N>` (audio stream authors themes; just reference the ids); dialogue/lore IT + EN
   (none for mini bosses).
6. Weapon: owned by the weapons stream (`data/weapons/*`); you only reference `drops_weapon`.
7. Time-of-day variation if the card mentions one (`time_of_day_variants`).
8. Metamondo reaction if any (`metamondo_reaction` + behavior `onMetamondoStart`).
9. Form unlock if any (`unlocks_form`).
10. Debug kill works and the balance bot beats it inside 120 + 20×D s (`npm run bot -- <id> --seeds=3`), sloppy profile not trivial.
11. Unit tests for your scripted mechanics (`tests/actN*.test.ts`) and `npm run audit` shows no mismatch for your bosses.

## Files you write per boss
```
data/bosses/<id>.yaml                 boss + attacks + phases (+ minions)
data/arenas/<arena>.yaml              bounds, obstacles, static hazards, phase variants (already scaffolded: keep id/zone/center/gate)
src/content/bosses/<id>/behavior.ts   sim hooks (default export defineBehavior({...})) — optional for simple bosses
src/content/bosses/<id>/model.ts      procedural model (see docs/RENDER_KIT.md)
src/content/bosses/<id>/arena.ts      arena dressing (see docs/WORLD_KIT.md) keyed automatically by the arena id
data/story/actN/<id>.yaml             intro/defeat sequences (principal: dialogue + camera shots; secondary: 1–2 lines; mini: none)
data/speakers/actN.yaml               speaker entries for your talking bosses
data/voce/actN.yaml                   Voce dell'Alba lines (altar + after-boss conditions)
data/reperti/actN.yaml                Reperti dei Cercatori in your zones (2–3 per zone; texts IT/EN)
data/projectiles/actN.yaml, data/hazards/actN.yaml   your projectile/hazard kinds
locales/it/actN_<something>.yaml + locales/en/...    all your strings (flat keys)
tools/bot/hooks/<id>.ts               bot hook for scripted mechanics (optional)
tests/actN*.test.ts
```
Then `npm run registry` (behaviors/models/arenas/hooks registries are generated from folders).

## Conventions
- `model.builder` = boss id, `model.palette` = your act palette (`act1_green_gold` … `act7_white_gold_sunrise`), `music:
  boss_<id>`, phases `music: boss_<id>_p1..p4`.
- Principal bosses (except `lucifero_1`): `brightens_sky: true`, an `intro_sequence` with dialogue/cinematic, `defeat_sequence`.
- Secondary bosses: `lore_key` (1–3 sentences, shown in the Specchio dei Ricordi) and/or a one-line intro/defeat sequence.
- Mini bosses: **no dialogue, no lore, no `say` steps**.
- Key items: `grants: [lanterna_del_cavaliere]` etc. (docs/GLOSSARY.md).
- Scale: player is 1.8 m. Bosses are enormous: knights 4–6 m tall, beasts 5–12 m, dragons 15–30 m long, colossi 10–25 m.
  Little Garden bosses are 2–6 m in world units (player at 0.1 scale). `body.radius/height` drive collision, lock-on and camera;
  `hurtboxes` (spheres, local frame) must cover the visible body.
- **Local frame: +Z forward, +Y up, +X = the boss's LEFT** (Three.js object space). Shapes/hurtboxes/part anchors use it, so
  your model built in object space lines up with hitboxes.

## Attacks (data)
```yaml
- id: tail_sweep            # unique per boss
  anim: tail_sweep          # renderer keyword (docs/RENDER_KIT.md lists them)
  telegraph: 0.9            # wind-up seconds (≥ 0.5 typical, ≥ 0.8 for heavy/red, ≥ 0.35 absolute minimum)
  active: 0.4               # hit windows live inside [0, active]
  recovery: 1.2             # punish window
  damage_mult: 1.2          # x typical hit (10% + 1.2% x D of player Health); capped at 2.0
  poise: 26                 # stagger power vs player (>= 25 knocks down)
  flags: [red, knockdown]   # red = Colpo Rosso (dodge only); also unblockable, knockback, grab, slow, burn, freeze, blind, mute, madness, poison, unavoidable, parry_final
  range: [0, 9]             # selection distance filter from the boss surface
  weight: 1                 # selection weight
  cooldown: 4
  track: 1                  # turn-rate multiplier during telegraph
  track_active: 0           # NEVER track through the whole active window (≤ 0.35)
  hits:                     # t relative to active start
    - {t: 0.05, dur: 0.25, shape: {type: arc, r: 9, angle: 200, yaw: 180, y: [0, 3]}}
  motion:                   # root motion (forward, toward_target, leap_to_target, retreat, strafe_*, teleport_behind/random/far, rise, descend, hover, orbit, charge_through, to_center, dive_to_target, land)
    - {t: -0.2, dur: 0.4, type: forward, speed: 3}
  spawns:                   # projectile | hazard | shockwave | beam | minion | custom | vfx | sfx
    - {t: 0.1, type: shockwave, radius: 10, shape: {type: ring, r0: 1, r1: 10, width: 1.2, height: 0.8}, active: 0.8, damage_mult: 0.6}
    - {t: 0.0, type: hazard, id: crack, at: target_predict, count: 3, dist: 4, delay: 1.0, active: 0.4, shape: {type: cylinder, c: [0,0,0], r: 2.2, h: 4}}
    - {t: 0.0, type: projectile, id: fireball, count: 3, spread: 30, speed: 16, from: [0, 3, 2]}
  combo_next: tail_sweep_2  # optional chained follow-up
  part: head_left           # multi-head: the part performing it (unavailable while broken/Spezzato)
```
Shapes: `sphere {c, r}`, `capsule {a, b, r}`, `arc {r, r_in?, angle (deg), yaw (deg), y: [lo, hi], c?}`, `box {c, half, yaw?}`,
`ring {r0, r1, width, height?}` (expanding over the window; the player can **jump** over it), `cylinder {c, r, h}`.
Hazard placement `at`: self, front, target, target_predict, around_target, line_to_target, random_arena, ring_self, grid,
sky_above_target, arena_center, part. Hazards telegraph during `delay` (decal), then hit during `active`; add `flags: [dot]`
for damage-over-time zones.

## Phases
```yaml
phases:
  - {id: p1, hp_range: [1.0, 0.5], music: boss_x_p1, patterns: [a, b, c], opener: a}
  - {id: p2, hp_range: [0.5, 0.0], music: boss_x_p2, on_enter: [flag_for_visuals], speed_mult: 1.15, aggression: 1.2,
     arena_state: pier_destroyed, dialogue: boss.x.mid, patterns: [a, b, c, d], transition: 2.5}
```
`on_enter` flags land in `actor.flags` (models read them). `arena_state` switches `arena.variants[state]` (bounds, obstacles,
surface, gravity) and sends `cue arena_state:<state>` to your arena dressing. Arena `hazards` with `from_phase: p2` appear
when p2 starts (lava floors etc.). The phase transition is an invulnerable roar (`transition` seconds).

## New Game+ (Ciclo dell'Alba) — required for every non-scripted boss
C12: "bosses return with new, more aggressive patterns". Add at least one NEW attack per phase that only exists in NG+:
```yaml
ng_plus:
  add_patterns: {p1: [ng_tail_cyclone], p2: [ng_double_breath]}   # attack ids defined in `attacks`, used only in NG+
  speed_mult: 1.1     # optional, keep telegraphs readable
  idle_mult: 0.8      # shorter gaps between attacks
```
NG+ attacks follow the same fairness rules (readable, avoidable). The bot can test them by setting `sim.state.ngCycle = 1`.

## Time of day
```yaml
time_of_day_variants:
  alba:  {opener: salute, weights: {flank_charge: 0.5}, flags: [chivalrous]}
  notte: {opener: dark_charge, speed_mult: 1.1, spawn_mult: 2.0, projectile_speed_mult: 0.7}
```
Never make the boss "stronger" (canon): change behavior, rhythm, counts, openers.

## Behavior hooks (`src/content/bosses/<id>/behavior.ts`)
```ts
import { defineBehavior } from '../../../sim/behavior';
export default defineBehavior({
  init(a, sim) { a.bstate.t = 0; },
  update(a, sim, dt) { /* return true to skip the default AI this tick */ },
  onPhaseEnter(a, sim, phase) {},
  onCustomEvent(a, sim, event, spawn, atk) {},   // spawns with `event: name` or `type: custom`
  canUseAttack(a, sim, def) { return def.requires !== 'mounted' || a.flags.has('mounted'); },
  selectAttack(a, sim, cands) { return undefined; },   // undefined = default selector
  modifyIncoming(a, sim, dmg, part, fromFront) {},     // shields, weak points, immunity
  onPartBroken(a, sim, part) {}, onSpezzato(a, sim, part) {}, onGraceStrike(a, sim, part) {},
  canDie(a, sim) { return true; }, onDeath(a, sim) {},
  onMetamondoStart(a, sim) { return 'normal'; },       // 'shatter' | 'rewrite' | 'devour'
  onInteract(a, sim, id) {},                           // in-fight interactables (sim.addFightInteractable)
});
```
Rules: deterministic (use `sim.rng` only), no DOM/three imports, keep per-actor state in `a.bstate`. Useful sim API:
`sim.player`, `sim.boss`, `sim.actors`, `sim.emit(event)`, `sim.spawnMinion(def, pos, owner, life)`, `sim.spawnAlly(md, pos)`,
`sim.addStaticHazard(kind, shape, dpsMult, status)`, `sim.setArenaVariant(state)`, `sim.setGravity(±1)`,
`sim.addFightInteractable(id, pos, r, promptKey)`, `sim.seq.start(sim, sim.c.sequence(id), onEnd)`, `sim.storyEvent(name, params)`,
`sim.completeEncounter(def, won)`, `sim.meta.forceActivate(sim, formDef)`, `sim.randomArenaPoint(minDist, from)`,
`a.startAttack(sim, def)`, `a.setState('scripted' | 'hidden' | 'idle' ...)`, `a.parts[i].anchor` (move heads/tentacles; the
renderer follows), `a.flags`, `a.invulnerable`, `a.untargetable`, `a.hidden`.
Minion behaviors: `src/content/bosses/<boss>/minion_<minionId>.ts` (registry key `<boss>:<minion>`).

## Story sequences (`data/story/actN/*.yaml`)
Steps: `say {say: key, speaker}`, `voce`, `caption`, `title`, `camera {camera: shot, dur}`, `wait`, `fade`, `choice` (with
`hold: 5` for Implora), `label`/`goto`/`if` (`"lucifero_choice == fought"`, `defeated:<boss>`, `item:<id>`, `ng`), `set`,
`give_item`, `give_weapon`, `unlock_form`, `gesture {gesture: id, prompt_key}` (Rituale: three gestures), `event` (story
events: start_fight, end_fight_scripted, boss_scripted, boss_resume, kneel, player_free, rest, travel {zone, altar|spawn},
teleport_altar, sky_brighten, set_scale, shadow, ending, credits, autosave, cue {id}, start_fight_direct {boss},
arena_state {state}, gravity {sign}, give_item {item}), `music`, `end`.
Intro sequences run while the boss is in `intro` (inactive) — end with `{event: start_fight}`. Defeat sequences run after the
kill. Keep secondary bosses to 1–2 lines; only principal bosses, the Rituale and the ending get cinematics.

## Fairness checklist (C4/D7)
Every attack avoidable by timing; telegraph readable (pose + VFX + sound); no tracking through the whole active window; no
unreadable overlapping attacks in phases 1–2; Colpi Rossi only where the card or design wants a must-dodge; give recovery
windows to punish (0.8–1.6 s); avoid stun-locks (multi-hit windows that knock down then hit again); hazards always telegraph.
Use the bot: perfect profile must win inside the target and take few hits; sloppy profile must not win untouched.
