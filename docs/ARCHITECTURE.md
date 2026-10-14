# Settimo Mondo — Architecture

Mobile-first, offline, code-only boss action RPG. TypeScript (strict) + Three.js (WebGL2) + Vite + Web Audio. Shipped as a PWA
(`dist/`) and as Capacitor Android/iOS projects (`native/`). The **Game Bible (the original prompt, PART C)** is canon; the
machine-readable subset lives in `tools/canon/bible.ts`.

## Golden rules

1. **`src/sim` and `src/core` never import `three`, `render`, `ui`, `audio` or `input`** (eslint enforces it). The sim is a
   deterministic fixed 60 Hz simulation with a seeded RNG; it runs headless in Node (tests, balance bot).
2. **Data-driven.** Bosses, weapons, movesets, Arts, Transizioni, Forms, zones, arenas, altars, time of day, skies, story
   sequences, speakers, projectile/hazard kinds, touch layouts live in `/data` (YAML), validated by `tools/build-data.ts` (zod
   schemas in `tools/schemas.ts`, types in `src/core/types.ts`) and compiled to `src/generated/content.json`.
3. **Italian first, English complete.** Every user-visible string is a localization key. Strings live in
   `locales/it/<file>.yaml` and `locales/en/<file>.yaml` (flat `key: "value"` maps; one file per work-stream/boss). The build
   fails on any key missing in either language and on placeholder text (TODO, lorem ipsum...).
4. **No placeholders shipped.** No stubbed bosses, no "TODO" strings, no grey boxes in final content.
5. **One owner per file.** Parallel work-streams never edit the same file. Shared lists are directories of files
   (`data/projectiles/<owner>.yaml`, `data/hazards/<owner>.yaml`, `data/speakers/<owner>.yaml`, `data/voce/<owner>.yaml`,
   `data/transitions/*.yaml`, `data/story/<act>/*.yaml`, `locales/<lang>/<owner>.yaml`). Registries are generated
   (`npm run registry`) from folder contents.
6. **Fairness on touch** (C4/D7): every attack avoidable by timing, readable telegraphs (≥0.35 s; ≥0.6 s for big hits), no attack
   tracks through its whole active window (`track_active` ≤ 0.35), no unreadable overlaps in the first two phases, nothing
   frame-rate dependent. Colpi Rossi (`flags: [red]`) are dodge-only and get a red flash + distinct icon + sound + haptic.

## Commands

| Command | What |
|---|---|
| `npm run registry` | regenerate `src/generated/registry.*.ts` and `tools/bot/hooks/index.ts` |
| `npm run data` | validate + compile `/data` and `/locales` (strict). `SM_PARTIAL=1 npm run data` downgrades references to not-yet-authored content to warnings (use while other work-streams are in flight) |
| `npm run typecheck` / `npm run lint` / `npm test` | quality gates |
| `npm run bot -- <bossId> --seeds=3` | headless balance bot (perfect + sloppy profiles) |
| `npm run audit` | canon auditor (data vs Bible) |
| `npm run dev` | Vite dev server (http://localhost:5173). Debug: `window.__game` |
| `npm run build` | production PWA build to `dist/` + service worker |

Headless screenshots: Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; launch with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` via `playwright-core`.
`tools/smoke.ts` (see below) loads arenas and captures frames.

## Folders

```
src/core      math, rng, terrain (shared by sim+render), content access, formulas, loc, types (data contract)
src/sim       Sim (sim.ts), Player (player.ts), Actor/BossBase (actor.ts), combat.ts, arts.ts, metamondo.ts, sequence.ts,
              world.ts (zone runtime), gamestate.ts (save + export code), pools.ts, shapes.ts, behavior.ts, types.ts (events/input)
src/render    Renderer.ts (core, quality, dynamic resolution), camera.ts, types.ts (render contracts),
              kit/ (procedural materials+geometry), rigs/ (procedural rigs + animator), actors/ (player + actor visuals),
              fx/ (projectiles, hazards, VFX), weapons/ (weapon models, trails, Art VFX), world/ (sky, terrain, water, foliage,
              landmarks, zones, altars, gates, time of day)
src/input     InputRouter (single input contract), keyboard, gamepad, touch (touch controls)
src/ui        GameUI implementation (HUD, touch layout, menus, layout editor, debug menu, subtitles, choices)
src/audio     AudioDirector implementation (synth SFX, generative music, Portatore theme)
src/app       Game orchestrator (loop, lifecycle, saves), settings, storage, platform (haptics, wake lock, Capacitor)
src/content   bosses/<id>/{behavior.ts (sim), model.ts (render), arena.ts (render)}, zones/<id>/zone.ts (render),
              forms/<id>/environment.ts (render), landmarks/*.ts (render)
src/generated content.json + registries (generated; never edit)
data/         YAML content (see src/core/types.ts for every field)
locales/      it/*.yaml, en/*.yaml -> it.json, en.json (generated)
tools/        build-data, gen-registry, balance-bot (+ bot/), canon-audit, smoke, gen-sw, gen-icons
tests/        vitest unit tests (sim logic, data validation)
native/       Capacitor android/ios projects
```

## Runtime flow

`main.ts` → `Game` (src/app/Game.ts) owns `Sim`, `Renderer`, `InputRouter`, `GameUI`, `AudioDirector`, `SaveStore`.
Each animation frame: poll input → advance the sim in fixed 1/60 s steps (hit-stop freezes, perfect-dodge slow-motion scales
time) → drain `SimEvent`s and dispatch them to renderer, audio, UI, haptics → render with interpolation (`alpha`).
The sim exposes everything as readable state (`sim.player`, `sim.actors`, `sim.boss`, `sim.projectiles`, `sim.hazards`,
`sim.meta`, `sim.seq.view`, `sim.zone`, `sim.state`) and emits events (`src/sim/types.ts`). Presentation never writes sim
state except through explicit API calls (`game.act(sim => sim.meditate('notte'))`, `sim.setLoadout`, `sim.fastTravel`, ...).

### Coordinate conventions

Meters, seconds, radians. +Y up. `yaw = 0` faces +Z; `forward(yaw) = (sin yaw, 0, cos yaw)`. **Local frames equal Three.js
object space: +Z forward, +Y up, +X = the owner's LEFT.** Hitbox shapes in data use this local frame, so a model built in
Three.js object space lines up with its hitboxes. Zones span x ∈ [-w/2, w/2], z ∈ [-d/2, d/2]; spawn is usually at the south
(negative z) and the route goes north.

### Scale

Player 1.8 m tall at scale 1. Little Garden: scale 0.1 with movement at 60% (C9); after Uruk: 1.12. Gigante Form: ×3.
Bosses are enormous (typically 4–30 m). Camera distance adapts to player scale and target size.

## Combat model (summary)

- Player: `src/sim/player.ts`. Input buffer 0.20 s. Dodge 0.40 s, i-frames 0.05–0.30 s; perfect dodge if the hit lands during
  i-frames and the dodge began ≤ 0.12 s (+latency comp ≤ 0.04 s) earlier → +40 Eco, +3% Metamondo, slow-mo.
  Parry window 0.15 s (parry-capable types only; any weapon for `parry_final` attacks). Guard absorbs by category; blocking
  costs Fiato = 0.5 × absorbed. Lacrime 1.2 s (cancelable before 0.4 s, heal 100%). Swap 0.35 s; Transizione if swap within
  0.5 s of a landed hit.
- Boss: `src/sim/actor.ts`. HP from TTK formula (`src/core/formulas.ts`). Equilibrio bar; Spezzato 6 s; one Colpo di Grazia per
  Spezzato (3× weapon damage, 2.5 s invulnerable). Phases by HP thresholds (invulnerable roar transition). Weighted pattern
  selection: per-attack cooldowns, distance filters, no pattern more than twice in a row, phase/time-of-day openers.
  Attack timeline: telegraph → active (hit windows, motions, spawns) → recovery, all from data.
- Metamondo: `src/sim/metamondo.ts` (meter, activation, 30 s, Form abilities, boss reactions).

## Ownership map (parallel work-streams)

| Work-stream | Owns |
|---|---|
| Integrator (lead) | `src/core`, `src/sim` (except `arts.ts`), `src/app`, `src/render/types.ts`, `src/input/InputRouter.ts`, `src/input/keyboard.ts`, `src/input/gamepad.ts`, `tools/*` except `tools/bot/hooks/*`, `tests/sim*`, `data/balance.yaml`, `data/progression.yaml`, `data/bosses/guardiano_del_regno.yaml` (reference), docs |
| Render kit | `src/render/Renderer.ts`, `src/render/camera.ts`, `src/render/kit/**`, `src/render/rigs/**`, `src/render/actors/**`, `src/render/fx/**`, `data/anim/**`, `docs/RENDER_KIT.md` |
| World | `src/render/world/**`, `src/content/landmarks/**`, `src/content/zones/<act I zones>/**`, `data/zones/<act I>.yaml`, `data/timeofday/**`, `data/skies/**`, `data/palettes/**`, `data/reperti/act1*.yaml`, `locales/*/act1_world.yaml`, `src/content/bosses/guardiano_del_regno/arena.ts`, `docs/WORLD_KIT.md` |
| UI + touch | `src/ui/**`, `src/input/touch.ts`, `data/ui/**`, `locales/*/ui.yaml` |
| Audio | `src/audio/**`, `data/music/**` |
| Weapons | `src/sim/arts.ts`, `data/movesets/**`, `data/weapons/**`, `data/transitions/**`, `data/projectiles/weapons.yaml`, `src/render/weapons/**`, `locales/*/weapons.yaml`, `tests/weapons*.test.ts` |
| Act N content | `data/bosses/<their bosses>.yaml`, `data/arenas/<their arenas>.yaml`, `data/altars/<their altars>`, `data/zones/<their zones>` (Acts II–VII), `data/story/actN/**`, `data/voce/actN.yaml`, `data/speakers/actN.yaml`, `data/projectiles/actN.yaml`, `data/hazards/actN.yaml`, `data/reperti/actN.yaml`, `src/content/bosses/<their bosses>/**`, `src/content/zones/<their zones>/**`, `locales/*/actN*.yaml`, `tools/bot/hooks/<their bosses>.ts`, `tests/actN*.test.ts` |
| Metamondo Forms | `src/content/forms/**`, `data/forms/**`, `locales/*/forms.yaml` |

If you need a change in a file you do not own, write a short request in `docs/requests/<your-stream>.md` and work around it;
the integrator merges requests.
