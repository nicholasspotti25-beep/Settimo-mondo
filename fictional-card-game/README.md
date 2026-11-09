# Fictional Card Game

A two-player, same-device game with four independent modes — **Classic Draft**, **Tournament**, **Team Draft** and
**Card Collector** — built around characters you add yourself (anime, visual novels, games, books, comics, film…).
Everything runs in the browser and is saved on the device (IndexedDB). No accounts, no real-money purchases.

## Run it

```bash
cd fictional-card-game
npm install
npm run dev        # http://localhost:5180 (also reachable from a phone on the same Wi-Fi via the printed Network URL)
npm test           # rules engines + backup format (39 tests)
npm run build      # dist/ (static site) + dist/fictional-card-game.html (one self-contained file)
```

**On a phone or tablet:** host `dist/` on any static host (GitHub Pages, Netlify…) or run `npm run preview` on a computer
on the same Wi-Fi, open the URL in Safari/Chrome and use *Add to Home Screen*. `dist/fictional-card-game.html` is a
single file containing the whole game; it works from any web server.

## First steps

1. Open **Database** (top-right icon on the home screen). Each mode has its own database; entries never cross modes.
2. Add characters with **Add entry**, or **Quick add from images** to import many images at once as drafts.
   Drafts with missing values are kept but stay out of the game until complete (the list shows exactly what is missing).
3. Minimums: Classic Draft 2 characters · Tournament 2 (or the bracket size) · Team Draft 10 ·
   Card Collector at least **one valid card of every rarity** (so the exact probabilities can always be delivered).
   Omniversal cards need a Normal Art image **and** a cutscene; Alternative Art is optional (Legendary and above only).
4. Pick the two home-screen portraits by tapping the empty frames.
5. Back up regularly: **Profiles & Settings → Export complete backup** (includes every image and video).

## Images and videos

- **Any image size or shape works.** The original file is stored untouched. By default the *whole* image is shown inside
  every frame, with a soft blurred copy filling the empty space — nothing is cropped. Per image you can switch to
  *Fill the frame* and drag a focal point. Grids use an automatic thumbnail so huge images stay fast; tapping a card or
  portrait opens the full-resolution viewer (pinch / scroll / double-tap to zoom, 1:1 button, drag to pan).
- **Cutscenes** play full screen, letterboxed for any aspect ratio (landscape, portrait, square), inline on iPhone.
  If the browser blocks autoplay with sound, a *Tap to play* button appears instead of failing. Every cutscene can be
  skipped and never removes a card. **MP4 (H.264 video + AAC audio)** plays on every phone, tablet and computer;
  WebM and MOV (often HEVC) only where the browser supports them — unsupported files get a clear message, never a crash.
- Media lives in IndexedDB and survives reloads and restarts. The Media Library (Database → Media) shows storage use and
  lets you remove unused files.

## Rules as implemented

All values come from the design specification; the engines are in `src/engines/` and covered by `tests/`.

- **Rarity tables** are exact integer weights out of 10 000 (0.01% resolution): cards 1–4 use
  69.99 / 20 / 7 / 2.3 / 0.6 / 0.1 / 0.01 %; card 5 uses 0 / 69.95 / 20 / 7 / 2.5 / 0.5 / 0.05 % (never Common).
  The edition is rolled afterwards: Alternative Art 8 % (Legendary), 12 % (Mythic), 15 % (Secret and Omniversal),
  and only if that character actually has an Alternative Art image.
- **Pity** (per player): after 20 packs without Legendary+, 50 without Mythic+, or 100 without Secret+, the 5th card of
  the next pack is raised to that rarity *if no card in the pack reached it naturally*. A natural roll is always kept,
  so the Omniversal chance is never increased. Omniversal has no pity. Higher rarities reset lower counters.
- **Packs** cost 500 FC in the Shop and become *unopened packs*. Opening a pack writes all five cards, the pity counters,
  history and mission progress in one transaction **before** the animation starts — leaving or crashing mid-reveal loses
  nothing (the reveal can be resumed from *Open Pack*).
- **Duplicates** convert at 10 / 20 / 50 / 150 / 400 / 1 000 / 10 000 FC (Normal) and 450 / 1 200 / 3 000 / 10 000 FC
  (Alternative Art, Legendary→Omniversal); one copy is always kept.
- **Tournament placements:** losing the Final = Finalist, the Semifinal = Semifinal, the Quarterfinal = Intermediate,
  any earlier round = Early elimination. (At 4 and 8 participants there is no round before the quarterfinal, so
  "Early elimination" cannot happen there.) Results are decided when the tournament starts and rewards are paid once
  when it finishes or is skipped to the end.
- **Matches** for match rewards, missions and achievements are Classic Draft and Team Draft games (first 5 per day 20 FC,
  first 3 wins +10 FC). Tournaments pay their own placement rewards and count for "Complete a tournament".
- **Daily missions** are three random missions that are actually possible with the current content (and a pack mission
  only when the player can afford or owns a pack); impossible ones are replaced. Weekly missions reset on Monday.
- **Daily login** advances one day of the 7-day cycle per claim (50 → 250 FC), once per calendar day.
- **Achievements** "Collect 50/100 cards" count every card obtained, duplicates included; "first Legendary" and
  "Secret card" also count higher rarities.
- Both players start with **0 FC** — all FC is earned through play.
- **Classic Draft:** rounds are configurable (default 5); each player privately sees their own character (and its stats,
  unless *blind mode* is enabled in Settings), never the opponent's, until both choices are locked. Ties give no point.
- **Team Draft:** a coin toss picks who starts, then a snake order (A B B A A B B A A B). Special Effects are evaluated on
  base role values only, so they are deterministic and order-independent; the results screen explains each one.

## Code map

```
src/core      rng (crypto, unbiased), dates, helpers
src/model     data types and validation
src/engines   rarity, pack + pity, classic, tournament, team + effects, economy (missions, login, rewards, achievements)
src/store     IndexedDB wrapper, repository (4 independent databases + players + settings), media import, backup format
src/ui        DOM helpers, router, overlays, components (cards, media, picker, cutscene, fx) and screens
styles/       design tokens and per-area stylesheets
```

Backups are standard `.zip` files: `backup.json` (databases, players, settings, media index) plus every media file
under `media/`, written and read with Blob slices so large videos are never loaded into memory at once. Imports are fully validated
first and restored in a single transaction — an invalid or partial file never touches existing data.
