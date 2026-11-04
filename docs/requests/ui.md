# Requests from the ui stream

## 1. audio: music for GameMode 'credits' (2026-11-03)
After the ending, `Game` switches to mode `credits` (sim paused) and the UI shows the end credits over the last shot, then
offers Ciclo dell'Alba / title. The story data has a `titoli` music cue (data/story/core/opening_ending.yaml, sequence
`titoli`) that nothing plays in this mode. Proposed: in the AudioDirector's `update(dt, sim, mode)`, when `mode === 'credits'`
start the `titoli` cue (same path as a `{type:'music', cue:'titoli'}` SimEvent), and stop it on the next mode change.

## 2. sim: read access to active attack shapes for the debug hitbox overlay (2026-11-03)
The debug hitbox overlay (src/ui/debug.ts, sim.debug.showHitboxes) draws hurt volumes (`actor.bodyHurt`), the player body,
projectiles and hazards. Melee attack shapes are evaluated inside actor.ts and are not reachable from outside. Proposed
minimal API in src/sim/actor.ts (read-only, no allocation):
```ts
/** Debug: the attack shapes active this tick (shape, origin, yaw, scale, progress), for overlays. */
forEachActiveShape(fn: (shape: ShapeDef, origin: Vec3, yaw: number, scale: number, progress: number) => void): void
```
called where `shapeHits(h.shape, origin, this.yaw, this.scale, progress, vol, contact)` is evaluated. The UI would then draw
spheres/sectors/lines in red.

**DONE (integration #1, 2026-11-03):** `Actor.forEachActiveShape(fn)` in src/sim/actor.ts, exactly the proposed signature.
It mirrors the hit-window test (same window timing, part origin, yaw, scale, progress; skips inactive/broken parts), loops
without allocating, and passes a scratch origin vector (copy it to keep it). Call it per actor (`sim.actors`). Test:
tests/sim_integration.test.ts.
Used by the ui stream since chunk 5: the hitbox overlay draws every active shape type (sphere, capsule, arc sector with inner
radius, box, expanding ring, cylinder) in orange (src/ui/debug.ts).

## 3. sim + app: honor the Aim assist setting (review finding 1, 2026-11-04)
`Settings.aimAssist` (default true) is shown in Impostazioni > Controlli > Combattimento ("Mira assistita") and the UI already
passes it through `game.applySettings({ ...s, aimAssist })`, but nothing reads it: the sim always aims. Proposed minimal diff:
```ts
// src/sim/sim.ts
export interface SimSettings {
  inputBuffer: number;
  latencyComp: number;
  /** Aim assist: unlocked attacks / shots turn toward the nearest foe in front (the lock always aims). Default true. */
  aimAssist: boolean;
}
// wherever `settings` is initialised: { inputBuffer: ..., latencyComp: ..., aimAssist: true }

// firePlayerProjectile (sim.ts ~1211): only the cone search is gated, a lock always aims
-    if (!aim) {
+    if (!aim && this.settings.aimAssist) {
       const t = this.nearestEnemy(pl.pos, 60, pl.yaw, 35 * DEG);
// (homing at ~1235 `spec.homing ?? (aim ? 1.2 : 0)` then follows automatically: no aim without lock/assist -> no homing)

// src/sim/player.ts faceForAction (~771): the soft snap toward the nearest foe
-    else if (snap) {
+    else if (snap && sim.settings.aimAssist) {

// src/sim/arts.ts (~278, Arts targeting without a lock): fall back to `front(pl, 8 * s, targetPos)` when !sim.settings.aimAssist
-  } else {
-    const e = sim.nearestEnemy(pl.pos, 24 * s, pl.yaw, 50 * DEG);
+  } else {
+    const e = sim.settings.aimAssist ? sim.nearestEnemy(pl.pos, 24 * s, pl.yaw, 50 * DEG) : null;

// src/app/Game.ts applySettings (and makeSim, next to inputBuffer/latencyComp)
+    this.sim.settings.aimAssist = s.aimAssist;
```
The firePlayerArtProjectile homing (`o.homing ?? (lock ? 1.5 : 0)`) already depends on the lock only, so it needs no change.
Test idea: with aimAssist false and no lock, a light attack with a foe 30 degrees to the side keeps the player's yaw.

**DONE (integration #2, 2026-11-04):** `SimSettings.aimAssist` (default true in the Sim constructor) gates exactly the three
unlocked aim paths: the 35-degree cone search in `Sim.firePlayerProjectile` (no aim -> no homing), the soft turn in
`Player.faceForAction`, and the Arts fallback target in src/sim/arts.ts (`front(pl, 8 * s)` when off; weapons-stream file,
the one line of the proposed diff). A lock always aims. `Game.applySettings` and `Game.makeSim` copy `settings.aimAssist`.
Area effects that search all around by design (chain lightning's first link, the hook/dot fallbacks in sim.ts) are not aim
assist and are unchanged. Tests: tests/sim_integration.test.ts "aim assist setting" (on: a light attack with the foe 30
degrees to the side turns to it; off: the player's yaw is unchanged).

## 4. sim: Specchio dei Ricordi in the Ciclo dell'Alba (review finding 16, 2026-11-04)
`newGamePlus` resets `state.defeated`, and `startMemoryFight` (and the UI list) require `isDefeated(state, id)`, so the Specchio
dei Ricordi is empty when NG+ begins although every boss was defeated in the previous cycle (Bible: "replay any defeated boss";
NG+ carries `todDefeats` and `challenges`). Proposed:
```ts
// src/sim/gamestate.ts
/** Defeated in this cycle or any earlier one (todDefeats is carried into the Ciclo dell'Alba): what the Specchio may replay. */
export function everDefeated(s: GameStateData, id: string): boolean {
  return s.defeated.includes(id) || (s.todDefeats[id]?.length ?? 0) > 0;
}
// src/sim/sim.ts startMemoryFight
-    if (!isDefeated(this.state, bossId) || this.c.boss(bossId).scripted) return;
+    if (!everDefeated(this.state, bossId) || this.c.boss(bossId).scripted) return;
// src/ui/altar.ts memoryBosses (ui stream file; apply in the same change so the list and the sim agree)
-    return this.ctx.game.content.bosses.filter((b) => !b.scripted && isDefeated(st, b.id)).sort((a, b) => a.order - b.order);
+    return this.ctx.game.content.bosses.filter((b) => !b.scripted && everDefeated(st, b.id)).sort((a, b) => a.order - b.order);
```
(the altar.ts `isDefeated` import becomes `everDefeated`). Until then the UI keeps the sim's rule, so no Specchio entry is dead.

**DONE (integration #2, 2026-11-04):** checked against the Bible ("Specchio dei Ricordi: replay any defeated boss";
NG+ carries `todDefeats`). `everDefeated(s, id)` in src/sim/gamestate.ts (`defeated` or a non-empty carried `todDefeats`
entry); `Sim.startMemoryFight` uses it; src/ui/altar.ts `memoryBosses` uses it (import is now `{ everDefeated, isDefeated }`:
the altar's "beyond the mist" note and the journey count keep the per-cycle `isDefeated`). A memory win still never marks
the boss defeated in the current cycle (story progression unchanged). Test: tests/sim_integration.test.ts "Specchio dei
Ricordi in the Ciclo dell'Alba".
