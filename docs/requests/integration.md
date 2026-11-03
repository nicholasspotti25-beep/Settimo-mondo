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
