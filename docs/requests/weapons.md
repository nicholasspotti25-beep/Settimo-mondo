# Requests from the WEAPONS stream

## 1. URGENT — tools/build-data.ts: partial mode must tolerate `unknown source boss` (integrator)

All 38 weapons now exist with their canonical `source_boss` ids (as the weapons brief requires, "even if its data file does
not exist yet"). The partial-mode regex does not match the message `weapon X: unknown source boss Y`, so
`SM_PARTIAL=1 npm run data` fails until every boss file exists — which blocks every stream's data build.

```diff
-  const missing = /unknown (boss|form|sequence|zone|arena|weapon|altar|reperto|speaker|minion|projectile kind|hazard kind|.*swing)|no Altare|missing key|needs flavor_key|exit (to|requires|arrive) unknown|unknown intro_sequence|unknown start|unknown (ending|credits)_sequence/;
+  const missing = /unknown (source boss|boss|form|sequence|zone|arena|weapon|altar|reperto|speaker|minion|projectile kind|hazard kind|.*swing)|no Altare|missing key|needs flavor_key|exit (to|requires|arrive) unknown|unknown (intro|defeat)_sequence|unknown start|unknown (ending|credits)_sequence/;
```

(`unknown defeat_sequence` is the same class of in-flight reference: Act streams add a boss before its defeat sequence.)

**DONE** (already applied in tools/build-data.ts before integration #1; checked 2026-11-03).

## 2. Renderer must install the weapon VFX (render-kit / integrator)

`installWeaponFx(fx)` (src/render/weapons/index.ts) registers all Art / Transizione / swing / weapon-projectile visuals on
the FxRenderer, but nothing calls it yet. In `src/render/Renderer.ts`, right after the FxRenderer is created:

```diff
+import { installWeaponFx } from './weapons/index';
 ...
     this.fx = new FxRenderer(this.scene, this.ctx);
+    installWeaponFx(this.fx);
```

The handlers only read sim state and draw into their own pooled group (added to `fx.group`); they never allocate per frame.

**DONE (integration #1, 2026-11-03):** render-kit had not wired it, so the integrator added the import and
`installWeaponFx(this.fx)` right after the FxRenderer is created in src/render/Renderer.ts (the function is still the empty
stub in src/render/weapons/index.ts, so this is a no-op until the weapons stream fills it).

## 3. FxRenderer generic fallback: skip weapon-owned vfx ids (render-kit)

Art events carry `vfx: 'art_*'` and arts.ts emits `{type: 'vfx', id: 'art_*:<phase>'}` / `'tr_*'` cues that the weapons
stream draws itself. Please make the generic fallback for unknown vfx ids ignore ids starting with `art_` or `tr_` so they
are not drawn twice. (Sim-generic ids such as `barrier`, `decoy_spawn`, `dispel`, `lightning_arc`, `bind`,
`shape_shift_<form>` stay with the render kit; the weapons stream only adds weapon-specific dressing on top.)

## 4. ActorRenderer hooks used by weapons (render-kit)

`WeaponVisual` keeps the documented contract (root/base/tip/grip/offhand/update/dispose) and adds optional fields that
the actor renderer may use:
- `trail: { color: string; glow: string; width: number }` — swing-trail colors per weapon (use instead of a fixed color).
- `setPose?(anim: string, k: number)` — not required: weapon morphs (shape-shifter forms, shears splitting, mandibles
  opening, chakram/harpoon/trident leaving the hand while thrown, bow string draw) are driven internally from sim state by
  `installWeaponFx`, which tracks the visuals created by `buildWeapon` for the player's equipped weapons.
Please create the weapon visual with `buildWeapon(def, ctx)` and call `visual.update?.(dt, time)` each frame; dispose it
on weapon swap/unequip.

## 5. Optional: lingering Art effects tick (integrator, src/sim/sim.ts)

arts.ts exports `updateArtEffects(sim, dt)` and `clearArtEffects()` for effects that outlive the Art animation (Innesto's
seed follows the enemy it was planted in until it blooms). Without the hook the seed blooms where it was planted.

```diff
+import { clearArtEffects, updateArtEffects } from './arts';
 ...
   // in step(), after this.updateHazards(dt):
+    updateArtEffects(this, dt);
 ...
   // in clearCombat():
+    clearArtEffects();
```

**DONE (integration #1, 2026-11-03):** `updateArtEffects(this, dt)` runs every step right after `updateHazards`, and
`clearArtEffects()` in `clearCombat()` (fight start/end, zone change, respawn), in src/sim/sim.ts. `artEffectsHooked(sim)`
is therefore true while the sim steps.

## 6. Optional: Perforazione pierces guard (integrator, src/sim/sim.ts `playerArtHit`)

Trivella Divorante's Arte Prima "pierces guard". Boss behaviors that block frontal hits (`modifyIncoming`) can only tell
if the DamageEvent carries a flag:

```diff
-      applyDamageToActor(this, a, { source: -1, target: a.id, amount: damage, poise, element: (art.def.params.element as any) ?? 'physical', flags: [], pos, instance: art.uid, part: part?.index ?? -1, kind: 'art' }, part);
+      applyDamageToActor(this, a, { source: -1, target: a.id, amount: damage, poise, element: (art.def.params.element as any) ?? 'physical', flags: art.def.params.pierce_guard ? ['unblockable'] : [], pos, instance: art.uid, part: part?.index ?? -1, kind: 'art' }, part);
```

**#6 DONE** (already applied in src/sim/sim.ts `playerArtHit` before integration #1: `pierce_guard` -> `['unblockable']`).
Open for render-kit: #3 (generic vfx fallback must skip `art_*` / `tr_*` ids) and #4 (weapon `trail` colors, `update()` per
frame, dispose on swap).

