# Stream: UI + TOUCH CONTROLS (Vite port 5175)

Owns: src/ui/**, src/input/touch.ts, data/ui/**, locales/{it,en}/ui.yaml, tests/ui*.test.ts, docs/UI.md.
Also read: src/app/Game.ts, interfaces.ts (GameUI contract), settings.ts, storage.ts, platform.ts, src/input/InputRouter.ts
(the only input path: press/setHeld/setStick/addCamera/lockSwitch/pickLock/choose), src/sim/sim.ts (meditate, setLoadout,
setForm, fastTravelTargets/canFastTravel/fastTravel, startMemoryFight, closeAltar, sim.prompt (also during fights), sim.seq.view,
debug flags, debugKillBoss, startFightDirect, travel, giveWeapon, state), player.ts, actor.ts, metamondo.ts, gamestate.ts
(CharacterLook, exportCode/importCode, newGamePlus), src/sim/types.ts (SimEvents), data/ui/touch_default.yaml (E7),
src/ui/index.ts (createUI factory). Bible C3, C4 (touch controls), C6, C12, D13 in docs/TECH_SPEC.md. Visual language:
dawn-light, glass-and-gold, minimal thin bars, no minimap/markers; system font stacks only (offline).

Deliverables (wired to the real sim, no fake data):
1. Touch controls: Pointer Events, independent multi-touch (each control owns its pointer), no delays/zoom/selection/long-
   press, touch-action none. Floating stick (left zone, appears under the thumb, dead zone + smoothing, outer ring = sprint),
   camera drag on the free right area, short flick on the right half = router.lockSwitch, double-tap on a boss = lock pick
   (project lock points with renderer.screenPoint or renderer.rig.camera), E7 buttons (light, heavy, dodge, guard hold/tap
   parry, jump, Arts lit only with enough Eco, Lacrime with count, lock, slot_1..3 with weapon glyphs, Metamondo = tap the ring
   around the Eco indicator when full), contextual interact button when sim.prompt is set (also during fights, e.g. ballista);
   semi-transparent with active/idle opacity, fade when idle; large-button mode; left-handed mirror; light haptic tick; toggle
   guard. Layout from settings.touchLayout ?? content touch_default; full layout editor (drag, scale, opacity, reset, small-
   phone/tablet presets, mirror) saved in settings.
2. HUD: thin Salute + Fiato bars, three Eco pips with the Metamondo ring (sim.meta.fraction, glow when ready, active
   countdown), three Lacrime vials, weapon trio (active slot, transizione flash), boss bar (name + title, HP, Equilibrio under
   it, phase ticks) + small bars for parts with own Equilibrio (poiseMax>0), Spezzato "Colpo di Grazia" prompt, Colpo Rosso
   warning (red edge flash + distinct shape icon, respects reduce-flashing), status icons, damage vignette, perfect dodge/
   parry feedback, notifications (weapon obtained + Arts, Form unlocked, key item, boss defeated, altar discovered, reperto),
   subtitles for sim.seq.view lines AND transient standalone 'dialogue'/'caption' SimEvents (speaker colors from
   data/speakers, size/background options), choices (Implora = HOLD: router.choose(i) then router.setHeld('interact', true)
   until sim.seq.view.choice.holdProgress = 1, kneel progress ring), ritual gesture prompts (tap/trace → router.press
   ('advance')), title cards, fades (seq.view.fade + GameUI.fade), loading veil, gentle death screen, boss name card, zone name
   card on zoneEnter, act title cards.
3. Screens: title (continue / new game / 3 load slots with zone, playtime, bosses / import code / settings / credits),
   character creator (CharacterLook), pause (resume, Armeria, Forme, Reperti, collections, settings, save export, quit),
   altar menu when sim.altarOpen: Meditate (Alba/Giorno/Tramonto/Notte via game.meditate), Loadout (Armeria of owned weapons:
   type, damage 18+4D via weaponDamage, parry-capable, Arts names+descs, flavor; assign 3 slots via sim.setLoadout; Lama
   dell'Abisso locked until NG+), Forme, fast travel, Specchio dei Ricordi (boss, time of day, Form, challenges → sim.
   startMemoryFight), Reperti, leave (sim.closeAltar). Collections (38 weapons, 7 Forms, ToD variants from state.todDefeats,
   challenges). Credits mode (then offer Ciclo dell'Alba via game.startNewGamePlus or title). Ending overlay minimal.
4. Settings: quality Low/Medium/High/Auto, 30/60 FPS, language IT/EN (live), volumes, haptics + strength, subtitles size +
   background, reduce shake/flashing, toggle guard, camera sensitivity + invert Y, large buttons, aim assist, latency comp
   0–0.04 s (+ tap-test estimate), input buffer 0.15–0.20, controls fade, show FPS, Accessibility leniency (off by default),
   layout editor, save export/import. Apply via game.applySettings(s).
5. Debug menu (hidden gesture or settings.debugMenu): teleport to any altar/boss, invincibility, give all weapons + forms,
   set time of day, set Metamondo meter, kill boss, hitbox display (sim.debug.showHitboxes), FPS + memory overlay.
6. Safe areas, scaling small phone → tablet, portrait hint, pause overlay after background, GameUI.paused() true only for
   pause/settings/layout editor (not the altar menu).
7. docs/UI.md + unit tests for pure layout math.
Verify at 844x390, 932x430, 667x375 (dsf 3) and 1180x820, 1366x1024 landscape with touch emulation (incl. multi-touch via
CDP Input.dispatchTouchEvent); screenshots reviewed.
