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
