# Common rules for every work-stream

Project: "Settimo Mondo", a mobile (iOS/Android phones+tablets, landscape, touch-first, offline) boss-only action RPG in the
spirit of Elden Ring, built entirely in code: TypeScript strict + Three.js 0.186 (WebGL2) + Vite + Web Audio; PWA + Capacitor.
No art/audio tools exist: meshes, rigs, animation, shaders, VFX, SFX and music are procedural code. Maximum effort,
production quality, nothing cut. The Game Bible (docs/BIBLE.md) is canon.

Repo: /home/user/settimo-mondo (git; node_modules installed). Always read first: docs/ARCHITECTURE.md, docs/TECH_SPEC.md,
docs/GLOSSARY.md, the relevant parts of docs/BIBLE.md, src/core/types.ts, src/render/types.ts.

- PARTIAL WORK MAY ALREADY EXIST in your owned files from an earlier interrupted session: inspect it first
  (`git log --stat -5`, list your files), keep what is good, fix what is not, and complete everything in your brief.
- Edit ONLY files your brief says you own. Other streams work concurrently in the same repo. If you need a change elsewhere,
  append a precise request (with a minimal proposed diff) to docs/requests/<your-stream>.md and work around it.
- Do NOT run git add/commit/stash/reset/checkout/clean (the lead commits). No npm install.
- Typecheck `npx tsc --noEmit -p tsconfig.json`: fix errors in your files; ignore other streams' in-progress errors.
  Data/locales: `npm run registry && SM_PARTIAL=1 npm run data`. Tests: `npx vitest run <your tests>`.
- Italian first, English complete: every visible string is a locale key in both locales/it/<file>.yaml and
  locales/en/<file>.yaml (your own files). No TODO/placeholder/lorem text anywhere.
- sim/core never import three/render/ui/audio/input. Behaviors are deterministic (sim.rng only).
- Performance (D3): ~250 draw calls and ~400k triangles on High, far less on Low; boss ≤ 80k tris; no per-frame allocations
  in hot paths (pool objects); quality-aware detail via ctx.quality.
- Headless visual checks: run your own Vite on your assigned port (`npx vite --port <PORT> --strictPort &`; kill it when done),
  Playwright from a node script importing /home/user/settimo-mondo/node_modules/playwright-core/index.mjs with chromium
  executablePath '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' and args ['--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--ignore-gpu-blocklist']. window.__game is the Game: `await __game.newGame(0,{name:'T',
  build:.5,height:.5,skin:2,hair:1,hairColor:0,eyes:0,cloak:0}); __game.sim.seq.skip(__game.sim);
  __game.sim.debug.invincible=true; __game.sim.startFightDirect('<boss>',{skipIntro:true})`, `__game.sim.travel(zone,'spawn')`,
  `__game.meditate('notte')`, `__game.renderer.stats`. Save screenshots under /tmp and LOOK at them (Read tool); iterate on
  quality until it is genuinely beautiful and readable on a phone-sized viewport (e.g. 1280x576).
- Work in solid increments so the game always stays runnable.
