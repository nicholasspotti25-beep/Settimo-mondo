# Work log: ui (UI + touch controls, Vite port 5175)

Brief: docs/briefs/ui.md. Owned: src/ui/**, src/input/touch.ts, data/ui/**, locales/{it,en}/ui.yaml, tests/ui*.test.ts, docs/UI.md.

## Status

| # | Deliverable | Status | Files |
|---|-------------|--------|-------|
| 1 | Touch controls: Pointer Events, one control per pointer, floating stick (dead zone, smoothing, sprint ring), camera drag, right-half flick = lockSwitch, double tap = lock pick (projected lock points), E7 buttons (light, heavy, dodge, guard hold/tap parry, jump, Arts lit by Eco + cost pips, Lacrime count, lock, slot_1..3 weapon glyphs + Transizione flash, Metamondo = ring tap when ready), contextual interact (also in fights), active/idle opacity + idle fade, per-control alpha, large buttons, left-handed mirror, haptic tick, toggle guard (router) | done | src/input/touch.ts, src/ui/controls.ts, src/ui/layout.ts, data/ui/touch_*.yaml |
| 1b | Layout editor (drag, scale, opacity, reset, presets, mirror, saved in settings) | missing (editor CSS exists in style.ts) | |
| 2 | HUD: Salute/Fiato bars (damage lag), 3 Eco pips in the Metamondo ring (fraction, ready glow, active countdown), Lacrime vials, status icons with timers, ally bar, boss bar (name + title, HP, phase ticks, Equilibrio, part bars, memory challenge marks), Colpo di Grazia prompt, Colpo Rosso (shape + red edge, steady with reduce flashing), damage + low-health vignettes, perfect dodge/parry, Transizione name, desktop trio + prompt, FPS/memory overlay | done | src/ui/hud.ts |
| 2b | Story layer: subtitles for seq lines + transient dialogue/caption/voce events (speaker colors, size/background), centered captions, title cards, seq fades, choices with Implora HOLD + kneel ring, ritual gestures (tap/trace), tap-to-advance, hold-to-skip | done (gesture traces untested with real data: no story file authors a gesture step yet) | src/ui/story.ts |
| 2c | Cards: zone card, act card, boss name card, "dawn advances" banner, toasts (weapon + Arts, Form, key item, altar, reperto, vista), gentle death screen, loading spinner, GameUI.fade | done | src/ui/cards.ts, src/ui/UI.ts |
| 3 | Screens: title (only Continue / New game on slot 0 so far; needs 3 slots, import, settings, credits), creator, pause, altar menu, collections, credits, ending | partial (title minimal) / missing (rest) | src/ui/UI.ts (buildTitle) |
| 4 | Settings screen (all options, applySettings, save export/import) | missing (applySettings already honours subtitles, reduce flashing, language live, handedness, large buttons, quality lowfx) | |
| 5 | Debug menu | missing (FPS/memory overlay done in HUD) | |
| 6 | Safe areas (env() probe -> layout safe rect), phone -> tablet scaling (--k, ring), portrait hint, pause overlay after background, paused() semantics | partial (safe areas + scaling done; portrait hint, pause-after-background, paused() = false until the pause menu exists) | src/ui/UI.ts |
| 7 | docs/UI.md + unit tests for pure layout math | partial (tests/ui_layout.test.ts, 22 tests; docs/UI.md missing) | tests/ui_layout.test.ts |
| L | locales/{it,en}/ui.yaml | partial (HUD, touch, story, cards, prompts, title keys; menus/settings keys to add with their screens) | locales/*/ui.yaml |

## Next

1. Altar menu (sim.altarOpen): Meditate (game.meditate), Armeria/loadout (weaponDamage, parry, Arts, flavor, 3 slots via
   sim.setLoadout, Lama dell'Abisso locked until NG+), Forme (sim.setForm), fast travel, Specchio dei Ricordi
   (sim.startMemoryFight), Reperti, leave (sim.closeAltar). Without it an altar interaction leaves the player in 'locked'.
2. Pause menu + top pause button (paused() true), pause overlay after background; title screen with 3 slots (zone,
   playtime, bosses), import code, credits; character creator (CharacterLook).
3. Settings screen (all options of the brief, latency tap test) + layout editor.
4. Collections (38 weapons, 7 Forms, ToD variants, challenges), credits mode (-> Ciclo dell'Alba / title), ending overlay.
5. Debug menu (hidden gesture + settings.debugMenu): teleport, invincible, give all, ToD, meter, kill boss, hitboxes, FPS.
6. Portrait hint; tablet HUD polish (vials/status icons are small at 1366x1024).
7. docs/UI.md (conventions, layout units, components, input ownership).
8. Final verification pass at 844x390, 932x430, 667x375 (dsf 3), 1180x820, 1366x1024 incl. CDP multi-touch.

## Notes

### Chunk 1 (2026-10-15)
- Replaced the bring-up MinimalUI (deleted) with `SettimoUI` (src/ui/UI.ts) via `createUI()`; parts: hud.ts, story.ts,
  cards.ts, controls.ts, ctx.ts; input in src/input/touch.ts (registered as an InputSource on game.input).
- Fixed in style.ts: `#sm-ui .sm-layer {pointer-events:none}` out-specified `.sm-touch.on` (touches fell through to the
  canvas) and `#sm-ui .sm-ico {width:100%}` out-specified the button icon box; added trio/prompt/tap-catch/lock CSS.
- Tablet preset: Lacrime moved to y 0.19 so it clears the HUD ring, which now scales with the safe height (22..46 px).
- Verification:
  - `npx tsc --noEmit -p tsconfig.json`: 0 errors (whole tree). `npx vitest run tests/ui_layout.test.ts`: 22/22 pass
    (presets inside the safe area and non-overlapping at all 5 brief viewports, normal + large; mirror, large scale,
    toFraction round trip, normalize, stick/flick/tap/double-tap, hit test, fade). `SM_PARTIAL=1 npm run data`: ok,
    692 it / 692 en strings (warnings are other streams' missing minion keys).
  - Headless (Playwright, touch emulation, script in the session scratchpad `shot.mjs`): title, exploration (zone card),
    Guardiano fight at 844x390 dsf2/3, 667x375 dsf3, 1366x1024. CDP multi-touch (stick + light at once) -> router stick
    (0.51, 0.86) sprint=true, held=[light], player state running. In-page double tap on the projected boss -> pickLock
    (1, -1) -> player.lock set. Screenshots reviewed: bars, ring + pips, vials, burn timer, boss bar with lag chip, phase
    tick and Equilibrio, lit Art with cost pips, slot glyphs, stick + sprint ring, pressed state, zone/boss cards.
  - CDP touch round trips under swiftshader take ~550 ms, longer than the 330 ms double-tap window, so double taps are
    verified with in-page PointerEvents.
- Observed once (render stream, not UI): `TypeError ... refreshFogUniforms` thrown from Renderer.render during a fight
  start; it aborts Game.frame before ui.update. Not reproduced in later runs; the test script wraps renderer.render to
  keep checking the UI.
- `game.attach()` calls `ui.applySettings()` BEFORE `ui.mount()`: applySettings/fade/setLoading tolerate an unmounted UI.
- keyboard.ts reads `globalThis.__smTouchStickActive`; touch.ts sets it while the touch stick (or its smoothing) is live.
- No `renderer.screenPoint` exists; lock picking projects `sim.lockPointPos()` with `renderer.rig.camera` (own tiny
  projection, no three import in the UI) and mirrors sim's private lockPoints() filtering.
- `ui.title` is defined in story_core.yaml (story stream); ui.yaml defines the `ui.prompt.*` keys used by world.ts.
