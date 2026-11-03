# Work log: ui (UI + touch controls, Vite port 5175)

Brief: docs/briefs/ui.md. Owned: src/ui/**, src/input/touch.ts, data/ui/**, locales/{it,en}/ui.yaml, tests/ui*.test.ts, docs/UI.md.

## Status

| # | Deliverable | Status | Files |
|---|-------------|--------|-------|
| 1 | Touch controls: Pointer Events, one control per pointer, floating stick (dead zone, smoothing, sprint ring), camera drag, right-half flick = lockSwitch, double tap = lock pick (projected lock points), E7 buttons (light, heavy, dodge, guard hold/tap parry, jump, Arts lit by Eco + cost pips, Lacrime count, lock, slot_1..3 weapon glyphs + Transizione flash, Metamondo = ring tap when ready), contextual interact (also in fights), active/idle opacity + idle fade, per-control alpha, large buttons, left-handed mirror, haptic tick, toggle guard (router) | done | src/input/touch.ts, src/ui/controls.ts, src/ui/layout.ts, data/ui/touch_*.yaml |
| 1b | Layout editor (Settings > Tocco > Modifica disposizione, title and in game): one-finger drag of every control, tap to select -> size (0.06-0.18 u) + opacity (0.2-1) sliders, presets Piccolo/Standard/Tablet, Specchia (left hand), Ripristina (device preset -> saved as null), Annulla/Salva via applySettings (touchLayout + leftHanded), overlap outline + warning, zones + HUD ring ghosts, slot glyphs of the equipped weapons; panel placed where it hides no control (panelSpot) and fades while dragging; game world visible behind (HUD/live controls hidden) | done | src/ui/editor.ts, src/ui/UI.ts, src/ui/settings.ts, src/ui/style.ts |
| 2 | HUD: Salute/Fiato bars (damage lag), 3 Eco pips in the Metamondo ring (fraction, ready glow, active countdown), Lacrime vials, status icons with timers, ally bar, boss bar (name + title, HP, phase ticks, Equilibrio, part bars, memory challenge marks), Colpo di Grazia prompt, Colpo Rosso (shape + red edge, steady with reduce flashing), damage + low-health vignettes, perfect dodge/parry, Transizione name, desktop trio + prompt, FPS/memory overlay | done | src/ui/hud.ts |
| 2b | Story layer: subtitles for seq lines + transient dialogue/caption/voce events (speaker colors, size/background), centered captions, title cards, seq fades, choices with Implora HOLD + kneel ring, ritual gestures (tap/trace), tap-to-advance, hold-to-skip | done (gesture traces untested with real data: no story file authors a gesture step yet) | src/ui/story.ts |
| 2c | Cards: zone card, act card, boss name card, "dawn advances" banner, toasts (weapon + Arts, Form, key item, altar, reperto, vista; held while a big card is on), gentle death screen, loading spinner, GameUI.fade | done | src/ui/cards.ts, src/ui/UI.ts |
| 3a | Altar menu (sim.altarOpen): Medita (4 ToD cards via game.meditate behind a fade, "beyond the mist" ToD note of the next boss), Armeria (3 slots, owned-weapon grid, detail: type, damage 18+4D via weaponDamage, parry, stamina, both Arts with Eco pips + descs, flavor; equip/swap/remove via sim.setLoadout; Lama dell'Abisso locked until NG+), Forme (7, locked ones dormant; sim.setForm), Viaggio (visited altars by route order, disabled when !canFastTravel; fade + waits for zone streaming), Specchio dei Ricordi (defeated non-scripted bosses, lore, ToD chips with defeated marks + variant note, owned Forms, 4 challenges with completed marks -> sim.startMemoryFight), Reperti (found list + reader), leave (sim.closeAltar; back button / Escape) | done | src/ui/altar.ts, src/ui/screen.ts |
| 3b | Pause menu: top pause button (mirrors with left-handed), Escape, auto-open on visibilitychange (background); Il cammino summary (name, zone, NG cycle, playtime, foes, weapons, Forms, reperti, deaths), Armeria/Forme/Reperti read-only, save export (code + copy + save now), quit to title with confirm; paused() true only here | done (settings entry to add with the settings screen) | src/ui/altar.ts (pause mode), src/ui/UI.ts |
| 3c | Title (dawn horizon + logo; Continua = most recent save, Carica, Nuova partita, Importa codice, Impostazioni, Riconoscimenti; journeys screen with 3 slots: name, resume zone (last visited altar, as Game.loadState), hour, playtime, bosses, last-step date, delete with confirm, overwrite confirm; text-code import with paste, slot choice, validation), character creator (name, build, height, skin, 6 hair styles, hair color, eyes, cloak; code-drawn SVG preview with the Portatore palettes; shrinks to fit 375 px tall), credits from the title | done (title, slots, import, creator, title credits; verified chunk 3) / missing (credits MODE after the ending, ending overlay, collections) | src/ui/title.ts, src/ui/creator.ts, src/ui/credits.ts |
| 4 | Settings screen from title AND pause (Generale: language live, subtitle size/background + live sample, show FPS; Grafica: quality Low/Medium/High/Auto (+ current auto level), 30/60 FPS; Audio: 5 volumes with live preview; Controlli: camera sensitivity, invert Y, toggle guard, aim assist, input buffer 0.15-0.20, latency 0-0.04 + tap test estimate; Tocco: large buttons, left hand, controls fade, haptics + strength, layout reset; Accessibilita: reduce shake/flashing, leniency (off by default); Salvataggio: export code + copy + save now in game, import from the title), all via game.applySettings | done | src/ui/settings.ts, src/ui/calib.ts |
| 5 | Debug menu | missing (FPS/memory overlay done in HUD) | |
| 6 | Safe areas (env() probe -> layout safe rect), phone -> tablet scaling (--k, ring), portrait hint, pause overlay after background, paused() semantics | partial (all done except the portrait hint) | src/ui/UI.ts |
| 7 | docs/UI.md + unit tests for pure layout math | partial (tests/ui_layout.test.ts 22 tests, tests/ui_screens.test.ts 10 tests: editor panelSpot/rectHitsCircle/overlapping, calib estimateLatency/snap, latestSlot, sanitizeLook/wrapIndex/mixHex; docs/UI.md missing) | tests/ui_layout.test.ts, tests/ui_screens.test.ts |
| L | locales/{it,en}/ui.yaml | partial (HUD, touch, story, cards, prompts, title, slots, import, creator, tod, altar, wtype, pause, set.*, editor.* done; collections/debug/credits-mode keys to add with their screens) | locales/*/ui.yaml |

## Next

1. Collections (38 weapons, 7 Forms, ToD variants from state.todDefeats, challenges) in pause; credits mode
   (-> Ciclo dell'Alba via game.startNewGamePlus / title), ending overlay.
2. Debug menu (hidden gesture + settings.debugMenu): teleport, invincible, give all, ToD, meter, kill boss, hitboxes, FPS.
3. Portrait hint; tablet HUD polish (vials/status icons are small at 1366x1024); altar/pause small labels (.sm-sum span,
   .sm-art .ac 9.5 px, .sm-tile .tn 10 px) up to >= 11 px like the title/settings ones (run ui/audit.mjs on the altar);
   in-game empty weapon slots draw ICONS.armory, which reads as an "X" at that size (editor shows the slot number).
4. docs/UI.md (conventions, layout units, components, input ownership, menu modes, editor placement rule).
5. Final verification pass at 844x390, 932x430, 667x375 (dsf 3), 1180x820, 1366x1024 incl. CDP multi-touch (title,
   creator, settings and editor were checked at 1280x576, 844x390 and 667x375 in chunk 3).

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

### Chunk 3 (2026-11-03)
- Title/slots/import/creator and the settings screen (written in an unlogged session, snapshot 377187a) verified and fixed:
  - Touch targets: title second-row buttons 31 -> 44 px (min-height on .sm-tbtn), seg buttons 36 -> 40, chips 34 -> 40,
    swatches 34 -> 40, sliders 32 -> 40 px tall (24 px thumb), slot delete 36 -> 40; toggles 52x30 with an expanded hit
    area AND the whole settings row toggles (`.sm-row.tap`). Small text raised to >= 11 px (version, slot date, creator
    field labels, settings section headings).
  - Slot description shows the zone the journey RESUMES in (last visited altar's zone, else start zone, as Game.loadState)
    instead of the zone at save time (a save in castello_della_culla resumed at vetta_attesa).
  - Settings opened over the title or the pause menu hides the screen under it (`#sm-ui.setopen`): the blurred logo and
    the pause menu's gold pill showed through the backdrop. Horizon line dims behind the journeys list / creator.
  - Creator figure: symmetric sleeves (the left one was a wide wedge), cape rim light follows the cape edge (was a
    detached line that looked like a staff), braid is now plaited (8 rotated links) from behind the right ear over the
    shoulder instead of a stick across the face, "Coda" is a tail tied at the nape over the left shoulder (the 3D model
    uses a hair chain for styles 2/3). Preview column shrinks (svg flex) so "Inizia il cammino" stays on screen at
    667x375; the form scrolls with a bottom fade.
  - Not exposed in settings: toggleSprint, slowerBosses, autoLock (no system reads them yet; a toggle would be fake).
- Verification:
  - `npx tsc --noEmit -p tsconfig.json`: 0 errors (whole tree). `npm run registry && SM_PARTIAL=1 npm run data`: ok,
    1013 it / 1013 en strings.
  - Headless with touch emulation and real taps (scratchpad `ui/title.mjs`, `ui/settings.mjs`, `ui/creator.mjs`, audit
    helper `ui/audit.mjs`: every visible control of the topmost screen/dialog must be >= 36 px on its short side, scroll
    into view, not be covered at its center, and all text >= 11 px): 1280x576 dsf2 (it + en), 667x375 dsf3 (en),
    844x390 dsf3: 0 issues on fresh title, creator, title with saves, load, import, imported, delete dialog, new,
    overwrite dialog, credits, all 7 settings sections, tap test, in-game settings > save.
  - Flows: fresh title -> Nuova partita -> creator (name, skin, hair, colors, build) -> game slot 0 with that look; quit
    -> Continua/Carica/Nuova; bad code -> error note; good code -> slot 3; delete slot 3 with confirm; overwrite confirm
    cancel; Escape -> front; credits; Continua -> slot 0 playtime 4000 resumed. Settings: language EN live, XL subtitles,
    quality Low, master 0.5, tap test -> 40 ms applied (latencyAuto), left-handed, in-game settings: paused() true,
    sim.time frozen, Escape -> back to pause. No page errors. Screenshots reviewed.
  - Gotcha: run vite from the repo root (`./node_modules/.bin/vite --config <scratchpad>/ui/vite.ui.config.mjs`); npx
    from the scratchpad fetched a different vite into ~/.npm/_npx and both fought over 5175.
- Layout editor (1b) built: src/ui/editor.ts (LayoutEditor + pure panelSpot / rectHitsCircle / overlapping), wired as
  SettingsHost.openLayoutEditor; `#sm-ui.editopen` hides the settings screen, HUD, live controls and pause button so the
  world shows behind. Panel has two states (globals: how-to line until the first selection, presets, mirror, reset;
  selected: size + opacity) so it stays ~230 px tall, and is placed at the first spot (sides x middle/bottom/top, then
  every 12 px) whose rect hides no control or the ring; unit test proves a free spot exists for every preset, both
  hands, at all 6 viewports. Size/opacity are stored per button (`size`, `alpha`), read by resolveLayout as before.
  - Verification (scratchpad `ui/editor.mjs`, in game, CDP touch drags): 1280x576 dsf2, 844x390 dsf3, 667x375 dsf3:
    audit 0 issues (open, selected, mirrored); drag dodge by (-90,-70) moves it exactly; size 0.16 / opacity 0.5 via
    the inspector; dragging jump onto heavy marks both red + warning; tap on empty space deselects; Specchia + Salva ->
    settings.touchLayout.dodge {pos [0.663,0.441], size 0.16, alpha 0.5} persisted in localStorage, leftHanded true;
    back in game ui.layout is mirrored with dodge at the saved spot; Ripristina + Salva -> touchLayout null. paused()
    true while editing in game. No page errors. Screenshots reviewed (open, selected, overlap, mirror, game after save).
  - `npx vitest run tests/ui_screens.test.ts tests/ui_layout.test.ts`: 32/32. tsc 0 errors. Data: 1026 it / 1026 en.
