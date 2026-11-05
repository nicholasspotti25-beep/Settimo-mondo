# Requests from the act5 stream (ACT V content)

## 1. Tick damage must not flinch the player (integrator: src/sim/combat.ts, src/sim/actor.ts) — open

Every hit runs `pl.hitReaction` (0.4 s flinch), including the ticks of continuous attacks (`hits[].tick`: breaths) and of
`dot` hazards (puddles). Each tick restarts the flinch, so a player caught in a breath or a puddle is pinned until it ends
(measured: the Drago di Ghiaccio's breath pinned the perfect bot for 4 ticks in a row; every Act's breaths/puddles are
affected). Proposed minimal diff:

```diff
--- a/src/sim/actor.ts   (updateAttack, building the DamageEvent of a hit window)
-        const flags: HitFlag[] = h.flags ? [...def.flags, ...h.flags] : def.flags;
+        const flags: HitFlag[] = h.flags ? [...def.flags, ...h.flags] : [...def.flags];
+        if (h.tick && !flags.includes('dot')) flags.push('dot');
--- a/src/sim/combat.ts  (damagePlayer, step 5)
   applyPlayerDamage(sim, amount, dmg, true);
-  if ((pl.state as string) !== 'dead') {
+  const tickOnly = dmg.flags.includes('dot') && dmg.poise <= 0 && !dmg.flags.includes('knockdown');
+  if ((pl.state as string) !== 'dead' && !tickOnly) {
```
(`dot` hazards already pass poise 0 for their ticks.) Workaround meanwhile: `noTickFlinch` in
src/content/bosses/drago_di_ghiaccio/behavior.ts cancels a flinch that started on a tick of my own breaths/puddles.

## 2. Local ice footing from hazards (integrator: src/sim/sim.ts `surfaceAt`) — open

The player's ice footing (player.ts, accel 3.2 on `surfaceAt(...) === 'ice'`) only reads the whole arena surface. The Drago di
Ghiaccio's breath leaves icy PATCHES (static hazards `ghiaccio_ice`, never damaging). Proposed minimal diff:

```diff
--- a/src/sim/sim.ts
   surfaceAt(x: number, z: number): string {
+    let ice = false;
+    if (this.fight?.active) this.hazards.forEachActive((h) => {
+      if (!ice && h.tag === 'surface:ice' && h.shape.type === 'cylinder' && Math.hypot(x - h.shape.c[0], z - h.shape.c[2]) < h.shape.r) ice = true;
+    });
+    if (ice) return 'ice';
     return this.zone ? this.zone.surfaceAt(x, z) : 'stone';
   }
```
Then layIce() sets `h.tag = 'surface:ice'` and the behavior's slide emulation (`slide`, SLIDE_GRIP) can go. Workaround
meanwhile: the behavior emulates the low grip by pushing the player along a slowly-following slide velocity.
