# Requests from the integrator

## 1. ui: drop stale captions and cards when a fight or zone changes (src/ui/story.ts, src/ui/cards.ts) — integration #1

Seen in the smoke screenshots (tools/out/smoke, 2026-11-03): the Mostro della Palude's whispered caption
`boss.mostro_della_palude.voices.rise.1` ("...sale... sale dall'acqua...") still on screen in the Great Devourer, Caronte,
Cerbero and Pyro fights, and the "ATTO II · La Discesa" act card drawn over the Cerbero and Pyro boss name cards.

Cause (two parts):
- `Story.onEvent` clears only the queue on `fightEnd` / `respawn`; the line on screen (`cur`) keeps its timer, and nothing
  clears on `zoneEnter`. `Cards.onEvent('fightStart')` hides the zone card but not the act card, and leaves `pendingZone`,
  so a zone card pops up over the fight 4.6 s later.
- The UI timers run on the clamped frame dt (Game caps a frame at 0.1 s). A zone build blocks the main thread for one long
  frame, so a caption or card shown just before a zone change keeps almost all its time in the new zone.

This is not only a smoke-tool artifact. Real-play paths:
- **Specchio dei Ricordi**: `sim.startMemoryFight` -> `startFightDirect` -> `loadZone` + `startFight` in ONE tick, so
  `zoneEnter` (act card + pendingZone when the boss is in another act) and `fightStart` (boss card) land together, and the
  act card overlaps the boss card. The altar's Voce line (emitted by `openAltar`) also carries into the memory fight.
- Any line emitted just before an exit or a fast travel (after-boss Voce lines, a boss's last caption) survives into the
  next zone because of the blocked frame.
- Debug teleport to a boss mid-fight and the story action `start_fight_direct`.

Sim side (done in integration #1): a fight dropped unfinished (zone change or another fight started) now emits
`{ type: 'fightEnd', boss, won: false, abandoned: true }` before the new `zoneEnter` / `fightStart` (src/sim/sim.ts
`abandonFight`), so the HUD hides the old boss bar and the story queue is cleared.

Proposed minimal diff for the ui stream:

```diff
--- a/src/ui/story.ts   (Story.onEvent)
       case 'fightEnd':
       case 'respawn':
+      case 'zoneEnter':
         this.queue.length = 0;
+        // the line on screen belongs to the fight / place being left
+        if (this.cur) {
+          this.cur = null;
+          toggle(this.trSub, 'on', false);
+        }
         break;
```
(`zoneEnter` is drained before the new zone's own lines: fastTravel emits zoneEnter, then openAltar's voce; a boss opener's
caption is emitted after fightStart.)

```diff
--- a/src/ui/cards.ts   (Cards.onEvent)
       case 'zoneEnter': {
         if (!c.hasZone(e.zone) || game.sim.endingActive) break;
+        // a memory fight / direct fight start: the boss card replaces the act and zone cards
+        if (game.sim.fight) { this.lastAct = c.zone(e.zone).act; break; }
         ...
       case 'fightStart': {
         if (!c.hasBoss(e.boss)) break;
         const b = c.boss(e.boss);
         this.zone.hide();
+        this.act.hide();
+        this.pendingZone = null;
```
(At the time the UI handles `zoneEnter`, `sim.fight` is already set when the zone change came from `startFightDirect`,
because the whole step ran before the drain.)

Optional: let card / caption timers ignore the frames spent building a zone, for example by not ticking them while
`game.renderer.world.busy` is set or while the loading spinner is on.


**DONE (ui chunk 5, 2026-11-03):** src/ui/story.ts drops the queue AND the line on screen on `fightEnd` (incl. the new
`abandoned` one), `respawn` and `zoneEnter`. src/ui/cards.ts hides the act card and clears the scheduled zone card on
`fightStart`, and skips act/zone cards on a `zoneEnter` that arrives with `sim.fight` already set. One deviation from the
diff: that skip does not update `lastAct`, so coming back from a memory of another act shows no act card for the journey's
own act. Not done: the optional timer freeze while a zone builds (the clear on zoneEnter already covers the long frame, and
`world.busy` also covers ordinary streaming, where captions must keep running). Verified headless (scratchpad
`ui/fix.mjs`, 844x390): caption on screen + Specchio memory fight into act II (cerbero) -> caption gone, no act card, boss
card on, no zone card 5 s later.

## 2. render-kit: dynamic resolution blanks one frame per step (src/render/Renderer.ts) — integration #2, 2026-11-04 — DONE (lead, 2026-11-04: resize deferred to the start of the next render)

Seen in the pass #2 smoke (tools/out/smoke, 1280x576 medium, SwiftShader): boss_01 / boss_02 came out as an empty dark frame
(HUD only) although `renderer.stats` reported 86-182 draw calls and the world had finished building. Cause: `render()` draws
the frame (`gl.render` + `post.end`) and THEN calls `adapt(dt)`, which on a resolution step calls `resize()` ->
`gl.setSize()`. Resizing a WebGL canvas clears its drawing buffer, and the browser composites after the rAF callback
returns, so the frame actually presented is the cleared buffer. On a phone this is a one-frame black flash every time
the watchdog steps `resScale` (down by 0.08 per 0.5 s while over budget, up by 0.05 after 4 s stable: near the budget it
can oscillate and flicker repeatedly). Verified with a scratch script (forced steps + rapid screenshots: 2/24 captures
blank, ~72 KB PNG vs ~750 KB); later smoke shots are clean only because `resScale` has reached its 0.6 floor by then.

Proposed minimal diff (defer the resize to the start of the next frame, so the cleared buffer is redrawn in the same task):
```diff
--- a/src/render/Renderer.ts
+  /** Set by the watchdog; applied at the start of the next render() so a cleared buffer is never presented. */
+  private resizePending = false;
 ...
   render(sim: Sim, alpha: number, dt: number, camInput: { dx: number; dy: number }): void {
     if (this.contextLost) return;
+    if (this.resizePending) {
+      this.resizePending = false;
+      this.resize();
+    }
     this.ctx.time += dt;
 ...
   (adapt, both branches)
-        this.resize();
+        this.resizePending = true;
```
(`applyQuality()` / window resize / orientation change may keep calling `resize()` directly: those already happen outside
the frame and the next rAF redraws, though the same deferral would be harmless there too.)
The smoke now waits until `resScale` has held for 1.2 s before each screenshot (tools/smoke.ts), so it no longer records
these frames; please re-check with a scratch script after the fix (screenshots right after forced `resScale` steps).

Also seen, for the world stream (no request needed, it is world Next 1): vetta_attesa at Medium renders 182 calls / 402k tris
in the boss_01 shot (D3: ~250 calls / ~400k tris is the High budget), and its zone build takes ~10 s under SwiftShader
(grandi_pianure < 1 s). On alternate frames the same static shot reads 106 calls / 236k tris (some layer drawn every other
frame?), worth a look when profiling.

## 3. act3b + act4: adopt the sim's `one_blow` attack field instead of `guardMultiHit` — integration #3, 2026-11-05

`guardMultiHit` (src/content/bosses/grande_lupo/behavior.ts) is now used by three bosses of two streams (grande_lupo,
grande_orso, re_mantide) and Acts V-VII will need the same rule, so it is now a sim feature: `AttackDef.one_blow`
(src/core/types.ts, tools/schemas.ts, src/sim/actor.ts `landedOn`). Semantics = guardMultiHit's: once a window of the attack
resolves against a target (hit, blocked or parried) the attack's other windows skip that target; a dodged window does not
count; `tick` windows are unaffected. It is also exact for windows that overlap in the same tick (guardMultiHit ran in the
behavior update, before that tick's windows). Documented in docs/BOSS_AUTHORING.md. Test: tests/sim_integration.test.ts
"one_blow attacks" (two windows land twice without the field, once with it).

Proposed changes (data + one line each; behavior is unchanged for sequential windows):
```diff
--- data/bosses/grande_orso.yaml          (act3b)
   - id: standing_swipe
+    one_blow: true
--- src/content/bosses/grande_orso/behavior.ts
-    guardMultiHit(a);
--- src/content/bosses/grande_lupo/behavior.ts   (no lupo attack has 2+ windows today; keep the export until orso/mantide drop the import, then delete it)
-    guardMultiHit(a);
--- data/bosses/re_mantide.yaml           (act4: cross_slash, ambush_cross and ng_plus ng_green_ambush)
+    one_blow: true
--- src/content/bosses/re_mantide/behavior.ts
-const MULTI = new Set(['cross_slash', 'ambush_cross', 'ng_green_ambush']);
-    if (atk && MULTI.has(atk.def.id)) guardMultiHit(a);
```
Then re-run your bot rows (they should not move). New multi-window blows in Acts V-VII: use `one_blow: true`.

## 4. act4 (FYI, no action needed): enemy projectiles aim at the player's scale — integration #3, 2026-11-05

Enemy projectiles aimed at `target.y + 1` and homed at `player.y + 1` whatever the player's size: 1 m above the 0.18 m
Little Garden player (the reason for `aimLow`) and at the knees of the Gigante Form (x3). Now `Sim.aimLift(id)` =
`player.scale` for the player (1 m at scale 1: Acts I-III unchanged; 0.1 m in the garden; 1.12 after the Ascesa) and 1 m for
actor targets, used by `bossSpawn` (projectile pitch) and enemy homing (which also no longer allocates a vector per
projectile per frame). `aimLow` still works (it re-aims on the fire tick) and is now only needed for lobbed shots
(`gravity` projectiles use a fixed 0.35 pitch). Bot A/B (perfect, 3 seeds): re_mantide 239 -> 255 s, coleottero unchanged,
regina_formica unchanged within noise; all well inside target except regina (see the integration log).

## 5. act1, act2, act3a, act3b, act4: import the shared bot defenses from tools/bot/defense.ts — integration #3, 2026-11-05

Twelve hooks of four streams (act2, act3a, act3b, act4) import `act2Defense` from act2's tools/bot/hooks/cerbero.ts, which
imports act1's helpers from tools/bot/hooks/cavaliere_errante.ts (four more act1 hooks import `act1Defense` from it); Act IV hooks import `gardenDecide` from re_mantide.ts on top. A tweak in one boss's
hook file therefore silently moves every later act's bot numbers. The helpers now live verbatim in tools/bot/defense.ts
(integrator-owned): `boxHazardDodge`, `hazardEscape`, `ringJump`, `chargeDodge`, `act1Defense` (from cavaliere_errante.ts),
`shockRingJump` (was cerbero's `ringJump`), `movingHazardContact`, `waveDodge`, `act2Defense` (from cerbero.ts). Checked
identical: cavaliere_errante / cerbero hooks rebuilt on defense.ts give the same win/time/hits for the same seeds
(scratch A/B, 2 seeds each, plus pyro and elder_tree unchanged).

Proposed (each stream, its own files only):
```diff
--- tools/bot/hooks/cavaliere_errante.ts   (act1) replace the helper bodies with re-exports, keep the hook
+export { boxHazardDodge, hazardEscape, ringJump, chargeDodge, act1Defense } from '../defense';
+import { act1Defense } from '../defense';
--- tools/bot/hooks/cerbero.ts             (act2) same
+export { shockRingJump as ringJump, movingHazardContact, waveDodge, act2Defense } from '../defense';
+import { act2Defense } from '../defense';
--- act3a (gigante_di_fuoco, yeti, guardiano_rocca_di_brina, loki), act3b (grande_lupo, grande_orso), act4 (re_mantide), act2's
--- other hooks (ice, pyro, thunder, mostro_di_magma, lucifero_1) and act1's (caronte, elder_tree, great_devourer, palude):
-import { act2Defense } from './cerbero';
+import { act2Defense } from '../defense';
```
A boss that needs a different rule wraps these in its own hook instead of editing them. `gardenDecide` (Act IV only) can
stay in re_mantide.ts until a second stream needs it.

## 6. render-kit: the follow camera loses the Little Garden player (src/render/camera.ts) — integration #3, 2026-11-05

Smoke 1280x576 medium (tools/out/smoke, boss_19..21): at player scale 0.1 the player is drawn at the very bottom edge,
under the boss name bar (coleottero_imperiale, regina_formica: a ~10 px figure at y ~565 of 576) or hidden entirely
(re_mantide).
At scale 1 the Portatore's feet sit at ~92% of the screen height, above the bar. The framing offset (look-at height / pitch
/ screen-space lift) apparently does not scale with `sim.player.scale`. Please frame the player at the same screen
fraction at 0.1 scale (feet above ~85% of the height, clear of the boss bar) and check with
`__game.sim.startFightDirect('re_mantide', {skipIntro: true})` and `'regina_formica'`; act4 brief Next 4 asks for the same
check from the content side.
