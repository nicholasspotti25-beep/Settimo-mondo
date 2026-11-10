# Football Game

3D 11-v-11 football for phones (landscape, touch controls), built from the *Football Game — Game Bible v1.0* and the
Master Development Prompt. It is a separate project from Settimo Mondo and shares no code with it.

- **Stack:** TypeScript (strict) + Three.js + Vite. Code-only: pitch, stadium, player models, animation and audio are generated in code.
- **Play:** `build/football-game.html` is a single self-contained file (open it in any modern mobile or desktop browser).
- **UI language:** Italian, like the Game Bible.

## Run

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # dist/football-game.html (standalone) + dist/football-game-page.html (body fragment for page hosts)
npm run check      # typecheck + headless AI-vs-AI matches (roster validation, stall/NaN watchdog, match statistics)
npx tsx tools/human-test.ts   # scripted checks of every user-controlled action and set piece
npx tsx tools/bench.ts        # measurements: player individuality, tactics effects, difficulty levels
node tools/smoke.cjs          # headless Chromium: menus, match start, touch input, screenshots in tools/out
```

## Controls

Left half of the screen: floating joystick. Right: contextual buttons.

| Attack | | Defence | |
|---|---|---|---|
| PASSA | tap short pass · hold long/lofted | CONTR. | tap standing tackle · hold pressure |
| FILTR. | through ball (hold = lofted) | SCIVOL. | sliding tackle (foul/card risk) |
| TIRO | hold for power · joystick up/down picks the post · drag button up = finesse, down = chip | CAMBIA | switch defender |
| CROSS | cross from wide areas / long ball | CONTIENI | jockey |
| SCATTO | sprint | 2° UOMO / SCATTO | second defender / sprint |

Pressing TIRO or PASSA while the ball is on its way plays it first time (volley, header, one-touch pass). TATTICA opens the six quick
team commands. Keyboard for desktop testing: WASD, J/K/L/I/O, Shift, P.

## Layout

| Path | Content |
|---|---|
| `src/data/db.ts` | 57-player database, PlayStyle catalogue (60 passive styles, three tiers), derived internal parameters, role familiarity, roster validation |
| `src/data/tactics.ts` | 12 formations, team tactics, transitions, individual instructions, quick commands, difficulty names |
| `src/sim/` | pure simulation (no rendering): `base` ball flight, `act` pass/shot/tackle/feint/first touch/aerial duels, `ai` team shape + jobs + carrier decisions, `gk` goalkeepers, `match` state machine, rules, set pieces, user control |
| `src/gfx/world.ts` | stadium, pitch, goals with reactive nets, procedural footballers and animation, broadcast camera |
| `src/ui/` | HUD + touch input, menus (squad, tactics, player cards, settings, pause, substitutions, reports) |
| `tools/` | headless tests and build helper |

Player behaviour is data-driven: systems read statistics and PlayStyle weights, never player names. There is no Overall rating
anywhere, and lists follow roster/role order.

## Decisions where the two Game Bible documents differ

- **Formations:** the union of both lists (12): 4-3-3, 4-2-3-1, 4-4-2, 4-1-2-1-2, 4-3-1-2, 4-3-2-1, 4-2-2-2, 4-5-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1.
- **Difficulty:** five levels (Principiante → Esperto). Levels change reaction time, decision noise, tackle timing, marking tightness and
  pressing commitment of the CPU — never the players' statistics.
- **Defensive buttons:** pressure and tackle share one button (tap/hold) to keep the pad at six buttons.
- **Match length:** 3–6 minutes per half (default 4), clock scaled to 45'.

## Not implemented / simplified (stated plainly)

- Player models are stylised low-poly figures differentiated by height, build, skin tone, hair style and colour, beard, preferred foot
  and kit. They are not sculpted likenesses: no reference images were available.
- No extra time or penalty shoot-out: matches can end in a draw. In-match penalties are implemented.
- The CPU side makes no substitutions. The user has five.
- Goalkeepers can be booked but never sent off (no outfield player in goal). Handball is a rare event on blocked shots.
- Control size and joystick sensitivity are adjustable; buttons cannot be dragged to custom positions.
- Verified in headless Chromium with touch emulation (844×390) and by simulation tests, not on a physical phone.
- The Game Bible text itself is not stored in this repository; add it as `docs/GAME_BIBLE.md` to keep the source of truth beside the code.
