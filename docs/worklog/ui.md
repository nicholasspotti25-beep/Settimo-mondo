# Work log: ui (UI + touch controls, Vite port 5175)

Brief: docs/briefs/ui.md. Owned: src/ui/**, src/input/touch.ts, data/ui/**, locales/{it,en}/ui.yaml, tests/ui*.test.ts, docs/UI.md.

## Status

| # | Deliverable | Status | Files |
|---|-------------|--------|-------|
| 1 | Touch controls: Pointer Events, one control per pointer, floating stick (dead zone, smoothing, sprint ring), camera drag, right-half flick = lockSwitch, double tap = lock pick (projected lock points), E7 buttons (light, heavy, dodge, guard hold/tap parry, jump, Arts lit by Eco + cost pips, Lacrime count, lock, slot_1..3 weapon glyphs + Transizione flash, Metamondo = ring tap when ready), contextual interact (also in fights), active/idle opacity + idle fade, per-control alpha, large buttons, left-handed mirror, haptic tick, toggle guard (router) | done | src/input/touch.ts, src/ui/controls.ts, src/ui/layout.ts, data/ui/touch_*.yaml |
| 1b | Layout editor (drag, scale, opacity, reset, presets, mirror, saved in settings) | missing (editor CSS exists in style.ts) | |
| 2 | HUD: Salute/Fiato bars (damage lag), 3 Eco pips in the Metamondo ring (fraction, ready glow, active countdown), Lacrime vials, status icons with timers, ally bar, boss bar (name + title, HP, phase ticks, Equilibrio, part bars, memory challenge marks), Colpo di Grazia prompt, Colpo Rosso (shape + red edge, steady with reduce flashing), damage + low-health vignettes, perfect dodge/parry, Transizione name, desktop trio + prompt, FPS/memory overlay | done | src/ui/hud.ts |
| 2b | Story layer: subtitles for seq lines + transient dialogue/caption/voce events (speaker colors, size/background), centered captions, title cards, seq fades, choices with Implora HOLD + kneel ring, ritual gestures (tap/trace), tap-to-advance, hold-to-skip | done (gesture traces untested with real data: no story file authors a gesture step yet) | src/ui/story.ts |
| 2c | Cards: zone card, act card, boss name card, "dawn advances" banner, toasts (weapon + Arts, Form, key item, altar, reperto, vista; held while a big card is on), gentle death screen, loading spinner, GameUI.fade | done | src/ui/cards.ts, src/ui/UI.ts |
| 3a | Altar menu (sim.altarOpen): Medita (4 ToD cards via game.meditate behind a fade, "beyond the mist" ToD note of the next boss), Armeria (3 slots, owned-weapon grid, detail: type, damage 18+4D via weaponDamage, parry, stamina, both Arts with Eco pips + descs, flavor; equip/swap/remove via sim.setLoadout; Lama dell'Abisso locked until NG+), Forme (7, locked ones dormant; sim.setForm), Viaggio (visited altars by route order, disabled when !canFastTravel; fade + waits for zone streaming), Specchio dei Ricordi (defeated non-scripted bosses, lore, ToD chips with defeated marks + variant note, owned Forms, 4 challenges with completed marks -> sim.startMemoryFight), Reperti (found list + reader), leave (sim.closeAltar; back button / Escape) | done | src/ui/altar.ts, src/ui/screen.ts |
| 3b | Pause menu: top pause button (mirrors with left-handed), Escape, auto-open on visibilitychange (background); Il cammino summary (name, zone, NG cycle, playtime, foes, weapons, Forms, reperti, deaths), Armeria/Forme/Reperti read-only, save export (code + copy + save now), quit to title with confirm; paused() true only here | done (settings entry to add with the settings screen) | src/ui/altar.ts (pause mode), src/ui/UI.ts |
| 3c | Title (3 slots with zone/playtime/bosses, import code, settings, credits), character creator (CharacterLook), collections, credits mode, ending overlay | partial (title has Continue / New game on slot 0 only) / missing (rest) | src/ui/UI.ts (buildTitle) |
| 4 | Settings screen (all options, applySettings, save export/import) | missing (applySettings already honours subtitles, reduce flashing, language live, handedness, large buttons, quality lowfx) | |
| 5 | Debug menu | missing (FPS/memory overlay done in HUD) | |
| 6 | Safe areas (env() probe -> layout safe rect), phone -> tablet scaling (--k, ring), portrait hint, pause overlay after background, paused() semantics | partial (all done except the portrait hint) | src/ui/UI.ts |
| 7 | docs/UI.md + unit tests for pure layout math | partial (tests/ui_layout.test.ts, 22 tests; docs/UI.md missing) | tests/ui_layout.test.ts |
| L | locales/{it,en}/ui.yaml | partial (HUD, touch, story, cards, prompts, title, tod, altar, wtype (38 weapon types), pause keys; settings/title-slots/creator/collections/debug keys to add with their screens) | locales/*/ui.yaml |

## Next

1. Title screen with 3 load slots (zone, playtime, bosses; continue / new / delete), import code (game.importSave),
   credits entry; character creator (CharacterLook: name, build, height, skin, hair, hair color, eyes, cloak swatches +
   code-drawn preview) before newGame.
2. Settings screen (all options of the brief, latency tap test, applySettings) reachable from title AND pause (add a
   'settings' nav item to the pause mode in altar.ts) + layout editor (CSS already in style.ts).
3. Collections (38 weapons, 7 Forms, ToD variants from state.todDefeats, challenges) in pause; credits mode
   (-> Ciclo dell'Alba via game.startNewGamePlus / title), ending overlay.
4. Debug menu (hidden gesture + settings.debugMenu): teleport, invincible, give all, ToD, meter, kill boss, hitboxes, FPS.
5. Portrait hint; tablet HUD polish (vials/status icons are small at 1366x1024).
6. docs/UI.md (conventions, layout units, components, input ownership, menu modes) + tests for any new pure math.
7. Final verification pass at 844x390, 932x430, 667x375 (dsf 3), 1180x820, 1366x1024 incl. CDP multi-touch.

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

### Chunk 2 (2026-10-15)
- New: src/ui/screen.ts (MenuScreen scaffold: head/back/title/sub, rule, nav + scrolling panel; widgets pill, row,
  toggleCtl, segCtl, rangeCtl, listItem, confirmDialog, pips; uiSound ids move/confirm/back/deny/equip for the audio
  stream's playUi). src/ui/altar.ts (AltarMenu with modes 'altar' and 'pause'). UI.ts: transition() = fade out 0.38 s,
  run the action, fade in 0.7 s once zone streaming (setLoading) ends; fade() now resolves a superseded fade's promise;
  pause button, Escape, visibilitychange -> pause; `#sm-ui.inmenu` moves subtitles to a framed bottom-right box over menus.
- Fixed in style.ts: `#sm-ui button` / `#sm-ui input` resets (specificity 1,0,1) out-specified every class background
  (ToD cards, tiles, slot cards, gold pills, chips) and `.sm-input` fonts; now `:where(#sm-ui) button`. Cards layer class
  renamed `sm-cards` -> `sm-cardlayer` (collided with the menu `.sm-cards` grid). Toasts no longer overlap zone/act/boss
  cards (queued until they end).
- Verification:
  - `npx tsc --noEmit -p tsconfig.json`: 0 errors (whole tree). `npx vitest run tests/ui_layout.test.ts`: 22/22.
    `npm run registry && SM_PARTIAL=1 npm run data`: ok, 880 it / 880 en strings.
  - Headless (scratchpad `ui/altar.mjs`, `ui/pause.mjs`, touch emulation, real taps) at 844x390 dsf3 (it), 667x375 dsf3
    (en), 1366x1024 dsf2 (it), 932x430 dsf3 (pause): open altar -> player 'locked'; tap Notte -> state.timeOfDay notte
    behind the fade; slot 2 + double tap tile -> equipped [lama_della_culla, brace_eterna, null]; Forme equip ->
    equippedForm specchio; leave -> altarOpen null, player idle; reopen + Viaggio -> zone bufera_eterna, altar reopened
    at altare_bufera_01; Specchio -> fight true in grandi_pianure. Pause: paused() true and sim.time frozen, read-only
    tile tap leaves the loadout unchanged, Copia puts the 999-char code on the clipboard, quit dialog cancel/confirm ->
    mode title, Escape toggles pause. No page errors. Screenshots reviewed (meditate, armory, forms, travel, mirror,
    reperti empty state, journey, quit dialog, game with pause button).
  - Headless gotcha: Vite HMR reloads the page when other streams save files; use a no-HMR config (`server.hmr:false,
    watch:null`, scratchpad `ui/vite.ui.config.mjs`) and RESTART it after own edits (no watcher = stale transforms);
    wait ~3 s after the title appears before driving the game. Stop it with `fuser -k 5175/tcp` (pkill -f matches the
    calling shell).
- Known: Android hardware back is not wired (platform.ts is not ours; Escape covers desktop). No reperti exist in the
  content yet, so the Reperti reader was only seen in its empty state.
