# UI and touch controls

Owner: the ui stream. Files: `src/ui/**`, `src/input/touch.ts`, `data/ui/**` (touch presets), `locales/{it,en}/ui.yaml`,
`tests/ui*.test.ts`. Canon: Bible C3, C4 (touch), C6, C12; TECH_SPEC D13. This page is the map for anyone who has to change
the UI: where things live, the rules every screen follows, and how to check a change.

## 1. Shape of the UI

`createUI()` (src/ui/index.ts) returns `SettimoUI` (src/ui/UI.ts), the `GameUI` the Game drives:

| GameUI call | What the UI does |
|---|---|
| `mount(root, game)` | builds one `#sm-ui` root over the canvas, injects the stylesheet, registers the touch controller on `game.input` |
| `update(dt)` | per frame: HUD, controls, story layer, cards, altar/pause menu, hitbox overlay; no allocation, cached style writes |
| `onEvent(e)` | SimEvents fan out to Hud, StoryLayer, Cards, ControlsView |
| `onMode(m)` | title / game / ending / credits switches (resets story, cards, menus) |
| `fade(kind, dur)` | the full-screen fade (black or white); resolves a superseded fade's promise |
| `setLoading(on)` | loading spinner + the "fade back in once zone streaming ends" gate |
| `applySettings(s)` | live: language (every part relabels), subtitles, reduce flashing, quality class, handedness, layout |
| `paused()` | true ONLY for the pause menu, settings in game and the layout editor (the altar menu does not pause) |

`attach()` calls `applySettings()` before `mount()`; every GameUI method tolerates an unmounted UI.

Children of `#sm-ui`, bottom to top (DOM order is the stacking order): safe-area probe, hitbox canvas, letterbox, HUD, touch
controls, cards, pause button, altar/pause screen, story layer (subtitles, choices, title cards), end credits, title
screen, settings, layout editor, fade, portrait hint.

State classes on `#sm-ui`: `inmenu` (altar/pause open: subtitles move to a framed full-width band at the bottom that the
menu keeps clear through `--subband`, measured by the UI only when a line appears/changes/goes, so a line never covers a
control), `paused` (pause menu / settings in game: lines wait hidden, card and line timers get dt 0), `setopen` (settings over the title or
pause: the screen under it is hidden, not shown through), `editopen` (layout editor: HUD, live controls, settings and pause
button hidden, the world shows), `ending` (letterbox, no HUD/toasts/pause), `subbg`, `rflash` (reduce flashing), `lowfx`.

## 2. Files

| File | Part |
|---|---|
| UI.ts | root, layout resolution, safe area, `--k`, pause/settings/editor/credits orchestration, transitions, portrait hint |
| layout.ts | PURE layout math: units, presets, resolveLayout, hit testing, stick vector, flick/tap/double tap, fade, portrait |
| controls.ts | touch controls view (buttons, stick, slot glyphs, Arts pips, Lacrime count, interact label), lock picking projection |
| ../input/touch.ts | TouchController: Pointer Events -> InputRouter (press/setHeld/setStick/addCamera/lockSwitch/pickLock) |
| hud.ts | Salute/Fiato bars, Eco ring + Metamondo, vials, statuses, ally bar, boss bar + parts, Colpo di Grazia, Colpo Rosso, vignettes, perfect dodge/parry, desktop trio + prompt, FPS/memory overlay |
| story.ts | subtitles (seq lines + transient dialogue/caption/voce), centered captions, title cards, choices (Implora HOLD + kneel ring), ritual gestures, tap-to-advance, hold-to-skip |
| cards.ts | zone / act cards (an act card hides a zone card / banner still up), boss name card (top-center under the HUD bars, clear of both thumbs), defeat banner ("L'alba avanza" only for a sky-brightening boss outside a memory, else "Nemico sconfitto": `defeatBannerKey`), toasts, death screen, loading veil (spinner + `ui.loading`) |
| screen.ts | MenuScreen scaffold + widgets (pill, row, toggleRow, segCtl, rangeCtl, listItem, confirmDialog, pips, uiSound) |
| altar.ts | AltarMenu, modes `altar` (Medita, Armeria, Forme, Viaggio, Specchio dei Ricordi, Reperti, leave) and `pause` (journey, read-only Armeria/Forme/Reperti, Collezioni, Impostazioni, save, Debug, quit) |
| collections.ts | Collezioni view + pure collectionStats / memoryCatalogue |
| title.ts, creator.ts, credits.ts | title + journeys + import (front page = one flex column: logo on top, menu standing on the horizon line with a minimum gap; under 540 px tall a compact logo and the primary buttons in one row), character creator (code-drawn SVG figure), credits (title and end-of-game mode) |
| settings.ts, calib.ts | settings screen (7 sections), latency tap test (pure estimateLatency) |
| editor.ts | touch layout editor + pure panelSpot / rectHitsCircle / overlapping |
| debug.ts | debug section of the pause menu + HitboxOverlay canvas |
| style.ts, icons.ts, dom.ts, ctx.ts | stylesheet, code-drawn SVG icons and 38 weapon glyphs, DOM helpers, shared context |

## 3. Rules every screen follows

- **Visual language**: dawn light, glass and gold, thin bars, no minimap or markers. Colors are the `--gold*`, `--ivory*`,
  `--glass*`, `--line*` tokens on `#sm-ui`. System font stacks only (`--serif`, `--sans`): the game is offline.
- **Strings**: every visible string is a key in BOTH `locales/it/ui.yaml` and `locales/en/ui.yaml` (Italian first). Content
  names come from content keys (`name_key`, `title_key`). `ctx.tOpt` for optional content strings.
- **Touch targets**: every control is at least 36 css px on its short side (toggles: the whole `.sm-row.tap` row is the
  target), reachable (scrolls into view, not covered at its center) and its text at least 11 px. The in-game buttons have
  a hard floor in resolveLayout (`MIN_BUTTON_PX`), whatever the preset, the editor size or the safe area.
- **No delays**: buttons fire on pointerdown; `touch-action: none` on the controls; no selection, callout, zoom or
  long-press menus (`#sm-ui` sets user-select none and touch-callout none).
- **Buttons**: `:where(#sm-ui) button` is the reset so any class wins over it (an id-specific reset once out-specified every
  class background).
- **Per frame**: `setText` / `toggle` / `StyleCache` write only on change; numeric attributes and opacities that move every
  frame (Metamondo dashoffset, Eco pip dasharray, status rings, vignettes, sequence fade, skip and kneel rings) go through
  `NumCache` (dom.ts: quantized, so a steady value costs no write and no string); the bar lag writes only when it moves;
  sequence lines and choices are compared field by field (`sameOptions`), never through a per-frame signature string;
  nothing allocates in `update()` (the hitbox overlay binds its shape callback once and uses scratch vectors).
- **Simulation access**: the UI reads `game.sim` and acts only through `game.act(fn)` or the InputRouter (the only input
  path). It never imports three: lock picking and the hitbox overlay project with `renderer.rig.camera` and a tiny
  ProjVec (controls.ts).

## 4. Layout units and scaling

- **Safe area**: an invisible probe element padded with `env(safe-area-inset-*)` gives the insets; layout math runs on the
  safe rect. CSS uses `--sl/--sr/--st/--sb` for the same insets.
- **Touch unit**: `unitFor(safe) = clamp(safe.h, 300, 400) * 1.45` px. Presets store positions as fractions of the safe area
  and sizes as fractions of the unit (button diameter = size x unit, x1.22 with large buttons).
- **Presets** (data/ui): `touch_default` (E7), `touch_small_phone` (long side < 720 or short side < 350), `touch_tablet`
  (short side >= 600). `settings.touchLayout` (from the editor) wins over the device preset; `normalizeLayout` fills any
  missing button from touch_default. `leftHanded` mirrors x (and the HUD ring, bars and pause button). On tablets the
  weapon slots arc just above the right cluster (next to lock, y 0.58..0.63) and Lacrime sits above the stick zone
  (0.06, 0.55), so both thumbs reach them (tested: within 0.4 x the short side of the light button).
- **HUD scale**: `--k = clamp(0.94 + (min(w,h) - 390) * 0.0008, 0.92, 1.28)` for text and bars; the Eco ring radius is
  `clamp(safe.h * 0.075, 22, 46)` and the vials/status icons follow it (`--hk = ring.r / 29`, 0.92..1.6), so on tablets
  they keep their proportion to the ring.
- **Menus** use clamp() on viewport units and scroll inside their panel; the detail column of the collections is sticky.
- **Boss bar**: centered in the widest free span of the bottom band that no touch button covers.
- **Portrait**: `isPortrait(w, h)` (h > w x 1.05) shows the "turn your device" hint over everything; a running game opens
  the pause menu under it, so rotating back shows the pause menu.

## 5. Input ownership (src/input/touch.ts)

Each pointer owns exactly one control for its whole life, decided at pointerdown:

1. a visible, accepting button under the finger (`hitButton`: radius x 1.12 + slop, closest relative center wins) -> press
   (and setHeld for guard/interact/light/jump until that pointer lifts; guard tap = parry by the sim);
2. the stick zone -> the floating stick appears under the thumb (dead zone, ~25 ms smoothing, outer ring = sprint);
3. inside `camera_drag.zone` (mirrored with the layout; the presets cover the whole free right side, corners included)
   -> camera drag, and a short horizontal flick there (< 280 ms, >= 4.5 % of the width) is `lockSwitch`;
4. anywhere else (e.g. the upper left outside the stick zone) only taps count: a double tap (<= 330 ms, <= 56 px) on a
   projected boss lock point is `pickLock` (also true inside the camera zone).

Metamondo is the ring around the Eco pips (an anchored button, only accepted when the meter is full). The interact button
exists only while `sim.prompt` is set (also in fights). Light haptic tick on presses (settings.haptics, strength).
`releaseAll()` runs on blur, pause, menus, title and the portrait hint. Controls appear at their active opacity (the
router's `lastActivity` is reset when they show and when the mode becomes game) and fade to the idle opacity after a few
seconds without input (settings.controlsFade).

## 6. Menu modes

- **Altar** (`sim.altarOpen`): opened by the sim, closed with `sim.closeAltar` (back button, Escape, "Lascia l'altare").
  World-changing actions (meditate, fast travel, memory fight) go through `UI.transition`: fade out 0.38 s, act, fade back in
  once streaming ends.
- **Pause**: pause button (>= 40 px, aria-label `ui.touch.pause`), Escape, the app going to the background, the window
  losing focus (blur: the platform layer freezes the sim until focus returns, so the pause menu shows instead of a silent
  freeze), or the portrait hint. Escape first closes the topmost dialog as cancelled (`DIALOG_CANCEL`). The sim is frozen
  (`paused()` true). Debug appears here when `settings.debugMenu`.
- **Settings**: over the title or over the pause menu. **Layout editor**: over settings.
- **Title** (`mode 'title'`): journeys, creator, import, credits. **Credits** (`mode 'credits'`): over the ending's last shot,
  then "Inizia il Ciclo dell'Alba" or "Torna al titolo". **Ending** (`mode 'ending'` or `sim.endingActive`): letterbox only.
- **Captions and cards across changes**: transient lines (queued and on screen) are dropped on `fightEnd`, `respawn` and
  `zoneEnter`; `fightStart` hides the zone and act cards and the scheduled zone card; a `zoneEnter` that arrives with a
  fight already set (memory fight, direct fight start) shows no zone/act card.

## 7. Layout editor placement rule

The editor panel must never hide a control: `panelSpot` tries the sides x (middle, bottom, top) and then every 12 px for the
first rect that hits no button circle (and not the HUD ring); the panel stays ~230 px tall by having two states (globals
until the first selection, then size + opacity) and fades while dragging. A unit test proves a free spot exists for every
preset, both hands, at every target viewport. Sizes are clamped to 0.06..0.18 units, opacity to 0.2..1; overlapping
buttons are outlined red with a warning, and saving an edited layout that still overlaps asks for an explicit confirmation
("Salva comunque" / "Continua a modificare"; the untouched preset saves directly). Saved via `applySettings` (touchLayout + leftHanded); Ripristina saves null.

## 8. Debug menu

Hidden gesture: five quick taps on the pause menu title toggle `settings.debugMenu` (the Debug section appears in the pause
menu). It offers invincibility, one-hit kills, hitbox overlay (`sim.debug.showHitboxes`: enemy hurt spheres cyan, player feet/
head rings green, active melee attack shapes orange via `Actor.forEachActiveShape`, projectiles and hazards red), FPS +
memory overlay, Metamondo meter, full Eco, give all weapons + Forms, kill boss, time of day, teleport to any altar (by zone in
route order) or boss.

## 9. Checking a change

- `npx tsc --noEmit -p tsconfig.json`
- `npx vitest run tests/ui_layout.test.ts tests/ui_screens.test.ts tests/ui_collections.test.ts` (pure math: presets inside
  the safe area and non-overlapping at every target viewport, the 36 px floor with insets, mirror, large, stick, gestures,
  editor placement, latency estimate, collections)
- `npm run registry && SM_PARTIAL=1 npm run data` after a locale or data/ui change (rebuilds the bundle the UI reads).
- Headless: Playwright with touch emulation (`isMobile`, `hasTouch`) at 844x390, 932x430, 667x375 (dsf 3), 1180x820 and
  1366x1024; real taps (`page.touchscreen.tap`), multi-touch through CDP `Input.dispatchTouchEvent` (stick + a button at
  once). Run Vite from the repo root with `server.hmr: false, watch: null` (other streams' saves otherwise reload the page)
  and restart it after an edit. CDP touch round trips under swiftshader are slower than the double-tap window: check double
  taps with in-page PointerEvents. Look at the screenshots.
