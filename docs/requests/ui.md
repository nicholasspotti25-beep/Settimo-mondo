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
