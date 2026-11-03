# Requests from the act2 stream

## 1. Sim: one hit per attack for hazards of the same spawn (src/sim/sim.ts, hazard update) — fairness

Found by the balance bot (Ice, `ice_spikes`): hazards placed in a line or a cluster by ONE spawn (`line_to_target`,
`around_target`, `grid`) each get their own hit instance (`atk.uid * 64 + 16 + i`), so a player standing where two
neighboring footprints overlap takes the damage twice on the same frame (seen: two `ice_spike_line` hits at t=102.1,
seed 5000+2·104729). It affects every Act: Pyro's fire-pillar lines (dist 3.2, r 1.6), Thunder's marks (center + 3 at 3.6 m,
r 2.2), Lucifero's sword rain, the Mostro di Magma's geysers, and Act I's root/ripple clusters. Spacing the footprints apart
leaves visible gaps in walls of fire that are meant to read as one line.

Proposed minimal diff (enemy branch of the hazard loop, ~line 1663): hazards that share the attack uid hit the player once
per step.

```diff
       if (h.team === 'enemy') {
         if (this.player.state === 'dead' || this.fight?.intro) return;
         ...
         } else if (h.hitOnce.has(-1)) return;
         if (!shapeHits(h.shape, h.pos, h.yaw, 1, progress, pv, contact)) return;
+        // one attack's hazards (a line of pillars, a cluster of marks) land as ONE blow on a player standing in an overlap
+        const group = h.tick > 0 ? -1 : Math.floor(h.instance / 64);
+        if (group >= 0 && this.hazardHitGroup === group && this.hazardHitTime === this.time) {
+          h.hitOnce.add(-1);
+          return;
+        }
         const attacker = this.actorById(h.owner) ?? null;
         const res = damagePlayer(this, attacker, { ... });
+        if (group >= 0) { this.hazardHitGroup = group; this.hazardHitTime = this.time; }
```
with two fields on Sim: `private hazardHitGroup = -1; private hazardHitTime = -1;`.
