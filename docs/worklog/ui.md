# Work log: ui (UI + touch controls, Vite port 5175)

Brief: docs/briefs/ui.md. Owned: src/ui/**, src/input/touch.ts, data/ui/**, locales/{it,en}/ui.yaml, tests/ui*.test.ts, docs/UI.md.

## Status

Inventory at the start of chunk 1 (git history: 3159bfe dom.ts, 24f1544 icons.ts, 8fd4e60 layout.ts + presets, 1082c5e style.ts;
`createUI()` still returned the bring-up `MinimalUI`).

| # | Deliverable | Status | Files |
|---|-------------|--------|-------|
| 1 | Touch controls (stick, camera drag, flick, double-tap lock, E7 buttons, interact, haptic tick, toggle guard, large/mirror, fade) | missing (layout math + presets + CSS only) | src/ui/layout.ts, data/ui/touch_*.yaml |
| 1b | Layout editor (drag, scale, opacity, reset, presets, mirror) | missing | |
| 2 | HUD (bars, Eco ring, vials, weapon trio, boss bar, warnings, subtitles, choices, gestures, cards, fades, death, loading) | missing (CSS + icons only) | src/ui/style.ts, src/ui/icons.ts |
| 3 | Screens: title, creator, pause, altar menu, collections, credits, ending | missing (screen CSS exists) | |
| 4 | Settings screen (all options, applySettings, save export/import) | missing | |
| 5 | Debug menu | missing | |
| 6 | Safe areas, scaling, portrait hint, pause after background, paused() semantics | missing (CSS vars only) | |
| 7 | docs/UI.md + tests/ui_layout.test.ts | missing | |
| L | locales/{it,en}/ui.yaml | missing | |

## Next

1. UI shell (`SettimoUI` replacing MinimalUI: #sm-ui root, CSS, --k scale, modes, fades, loading) + ui.yaml + full HUD.
2. Touch controls: src/input/touch.ts + controls view, wired to InputRouter; tests/ui_layout.test.ts.
3. Altar menu (meditate, Armeria/loadout, Forme, fast travel, Specchio dei Ricordi, Reperti, leave).
4. Title screen (continue / new game / 3 slots / import / settings / credits) + character creator + pause menu.
5. Settings screen (all options) + layout editor.
6. Collections, credits mode, ending overlay.
7. Debug menu (gesture + settings.debugMenu).
8. Portrait hint, pause overlay after background, safe-area polish.
9. docs/UI.md.
10. Verification pass at 844x390, 932x430, 667x375 (dsf 3), 1180x820, 1366x1024 with CDP multi-touch.

## Notes

- `game.attach()` calls `ui.applySettings()` BEFORE `ui.mount()`: applySettings must tolerate an unmounted UI.
- keyboard.ts reads `globalThis.__smTouchStickActive` so it does not zero the stick while a touch stick is active.
- No `renderer.screenPoint` exists; lock picking projects `sim.lockPointPos()` with `renderer.rig.camera`.
- `ui.title` is defined in story_core.yaml (story stream): ui.yaml must not redefine it.
