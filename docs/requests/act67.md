# Requests from the act67 stream (Acts VI–VII)

## 1. sim/sequence.ts — a step that starts another sequence must not advance the new one (integration)
`travel` into the first zone of an act starts its intro (`act7_intro` after the Rituale), and `start_fight_direct` starts the
next boss's intro (Dio dei Draghi → Cthulhu). Both run inside `SequenceRunner.enter()` → `applyInstant()`; when the instant
step replaces `this.seq`, the loop then does `this.pc++` on the NEW sequence and skips its first timed step (same in `skip()`).
Workaround in place: every act67 sequence that can be started that way begins with `{wait: 0.05}`. Proposed fix:
```diff
       if ('set' in st || 'give_weapon' in st || 'give_item' in st || 'unlock_form' in st || 'event' in st || 'music' in st) {
+        const cur = this.seq;
         this.applyInstant(sim, st);
-        if (!this.seq) return;
+        if (!this.seq || this.seq !== cur) return;
         this.pc++;
         continue;
       }
```
and in `skip()`: `const cur = this.seq; this.applyInstant(sim, st); if (!this.seq || this.seq !== cur) return;`.

## 2. act2 — Cattedrale Caduta for Lucifero II
- Arena dressing `cattedrale_navata`: react to the cues `arena_state:embers` (p2: the Cathedral turns to embers, glowing
  red-hot glass patches on the floor at `GLASS_PATCHES` exported by `src/content/bosses/lucifero_2/behavior.ts`, nave-local
  coordinates converted by its `naveToWorld`) and `arena_state:la_caduta` (p3: burning vaults, falling light), and to the cue
  `porta_rovesciata_opens` (the Porta Rovesciata behind the throne opens; the zone exit to pianura_capovolta is already at
  [0, 0, 100] with `requires: [lucifero_2]`).
- Model: the Lucifero II look (standing, wings fully open, armor recomposed black and gold, pale tired eyes) — if
  `lucifero_1/model.ts` exports a builder with a standing variant, act67 will register `lucifero_2/model.ts` as a thin wrapper;
  otherwise act67 builds its own.

## 3. audio — themes and cues
Music ids referenced: `boss_lucifero_2` (+ `_p1.._p3`), `boss_drago_del_vuoto` (+ `_p1`, `_p2`), `boss_verme_mangiamondi`
(+ `_p1`, `_p2`). Cues worth a sound: `lucifero_caduta` (the wind-up), `lucifero_caduta_flash` (the parry instant: a bright,
short tone), `lucifero_caduta_parried`, `lucifero_embers`, `lucifero_wings_of_fire`, `porta_rovesciata_opens`,
`vuoto_gravity_inverts`, `verme_burrow`, `verme_emerge`, `verme_swallow`, `verme_split`, `verme_segment_crumbles`.
