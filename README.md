# Settimo Mondo

A third-person, boss-only action RPG for phones and tablets: 38 hand-crafted encounters across seven acts of a contemplative,
procedurally built world, a fixed story that ends with a sunrise. Runs entirely on the device, fully offline.

- **Code-only:** TypeScript (strict) + Three.js (WebGL2) + Vite + Web Audio. No game engine, no editor, no art or audio tools:
  meshes, rigs, animation, shaders, VFX, sound effects and generative music are all code.
- **Delivery:** an installable offline PWA (`dist/`) and Capacitor projects for Android (`native/android`) and iOS
  (`native/ios`).
- **Canon:** `docs/BIBLE.md` (the Game Bible). Architecture: `docs/ARCHITECTURE.md`. Decisions: `DECISIONS.md`.

## Play it on your phone (5 steps)

1. Install Node.js 20+ on a computer, then in this folder run `npm install` and `npm run build`.
2. Serve the build on your local network: `npm run preview` (prints a `Network:` URL such as `http://192.168.1.20:4173`).
   Any static host works too (copy `dist/` to it; HTTPS is required for installation from the internet).
3. On the phone (same Wi-Fi), open that URL in Safari (iOS) or Chrome (Android).
4. Install it: iOS Safari → Share → **Add to Home Screen**; Android Chrome → menu → **Install app** / **Add to Home screen**.
5. Launch it from the home screen in landscape. After the first load it works completely offline.

Desktop debugging: `npm run dev` and open the printed URL (WASD move, mouse drag camera, J/K light/heavy, Space dodge,
L guard, F jump, 1/2/3 weapons, Q/E Arts, R Lacrime, V Metamondo, Tab lock, X interact, Enter advance).

## Develop and test

```bash
npm install
npm run dev            # dev server (http://localhost:5173), window.__game exposes the Game
npm run check          # registry + data validation + typecheck + lint + unit tests + canon audit + balance bot
npm test               # unit tests (vitest)
npm run bot            # headless balance bot on all 38 encounters (add ids to run a subset: npm run bot -- loki --seeds=3)
npm run audit          # canon auditor: shipped data vs the Bible tables
npm run build          # production PWA build into dist/ (+ service worker)
npm run smoke          # headless Chromium smoke test on dist/ (screenshots + frame stats in tools/out/smoke)
```

Content lives in `data/` (YAML, validated by `tools/build-data.ts`) and `locales/` (Italian first, English complete).
Per-boss code lives in `src/content/bosses/<id>/` (behavior, model, arena dressing). `docs/BOSS_AUTHORING.md` explains how to
add a boss: mostly data plus one behavior file.

## Build the native apps

Prerequisites: Android Studio (Android SDK 35+, JDK 21) for Android; macOS with Xcode 16+ for iOS.

```bash
npm run build && npx cap sync          # copy dist/ into native/android and native/ios
npx cap open android                   # Android Studio → Build → Generate Signed App Bundle / APK
#   or headless: cd native/android && ./gradlew assembleRelease   (bundleRelease for the Play Store .aab)
npx cap open ios                       # Xcode → Product → Archive (set your signing team first)
```

The native projects are configured for landscape-only fullscreen, keep-awake, haptics, hidden status bar and persistent
storage (IndexedDB inside the app's WebView). App icons and splash screens are generated procedurally by
`npx tsx tools/gen-icons.ts`.

## Saves

Three slots, autosave at altars, on boss defeat and when the app goes to the background. Settings → Save → **Export** gives a
copyable text code (`SM1....`); **Import** restores it on any device.
