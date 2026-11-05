# Requests from the act4 stream (Little Garden, player at 0.1 scale)

## 1. tools/bot/bot.ts — approach distance for sub-scale players (open)

At garden scale the player's light reach is ~0.25 m. `decide()` walks until `dist <= max(0.6, reach - 0.6)` (0.6 m from
the boss surface) but only swings when `dist <= reach + 0.2` (~0.45 m), so the generic bot never attacks a Little Garden
boss. Act IV hooks work around it (tools/bot/hooks/re_mantide.ts `gardenOffense`); with this fix the workaround can stay
(it is a no-op superset) or be dropped.

```diff
-    const wantRange = Math.max(0.6, reach - 0.6);
+    const wantRange = Math.max(Math.min(0.6, reach * 0.7), reach - 0.6);
```
