# Act content work-stream brief (shared by all Act agents)

You build complete boss encounters for one slice of the fixed story, in "Settimo Mondo" (mobile, offline, boss-only action
RPG; TypeScript strict + Three.js; everything procedural, no art tools). Maximum effort: each boss must be a memorable event
with its own arena, look, attacks, music ids and story, exactly as its Bible card says.

READ FIRST: docs/ARCHITECTURE.md, docs/BOSS_AUTHORING.md (your manual), docs/BIBLE.md (your boss cards in C10 + C8 story +
C9 world + C13 art), docs/GLOSSARY.md, docs/TECH_SPEC.md, src/core/types.ts, src/sim/actor.ts, src/sim/sim.ts,
src/sim/behavior.ts, the reference boss data/bosses/guardiano_del_regno.yaml + data/story/act1/guardiano.yaml, and your
scaffolded data/zones/*.yaml, data/arenas/*.yaml, data/altars/*.yaml (ids/centers/gates/altars exist; keep ids).
When they say "STATUS: READY" on their first line, also read docs/RENDER_KIT.md (models) and docs/WORLD_KIT.md (zones,
landmarks, arena dressing). Until then, work on the sim/data/story/bot parts.

ORDER OF WORK (keep the repo runnable after every step):
1. Boss data + behaviors for ALL your bosses, with every phase/mechanic of the cards; story sequences, dialogue/lore IT+EN,
   speakers, Voce dell'Alba lines for your altars, time-of-day variants, Metamondo reactions, Form unlocks, key items, and the
   New Game+ `ng_plus` block (new, more aggressive patterns per phase — see BOSS_AUTHORING.md).
2. Balance with the headless bot: `npm run registry && SM_PARTIAL=1 npm run data && npx tsx tools/balance-bot.ts <id> --seeds=3`.
   Perfect bot must WIN inside the target (120 + 20×D s) with few hits; sloppy bot must not win untouched. Add a bot hook
   (tools/bot/hooks/<id>.ts) for scripted mechanics. Tune attacks for fairness and readability, not just numbers.
3. Unit tests (tests/<stream>*.test.ts) for your scripted mechanics (phase changes, special rules, story branches).
4. Zones of your act (if listed as yours): terrain, path, colliders, climb walls, props, landmarks, particles, horizon vistas
   of what lies ahead, Reperti dei Cercatori (2–3 per zone, texts IT+EN, canon-consistent), vistas — breathtaking, mysterious.
5. Arena dressing (src/content/bosses/<id>/arena.ts) and boss models (src/content/bosses/<id>/model.ts) with the kits; each
   boss a unique, instantly recognizable silhouette, act palette, glowing signature details; models line up with hitboxes and
   react to actor.flags/anim states; check them in headless Chromium screenshots and iterate until they look great.
6. `npx tsx tools/canon-audit.ts` must show no mismatch for your bosses (ignore other streams' items).

RULES
- Edit ONLY the files of your stream (list in your assignment). Never edit sim/core/render-core/ui/audio/weapons files or other
  streams' files. Need an engine change? Append a precise request (with a proposed minimal diff) to docs/requests/<stream>.md
  and work around it; the lead merges requests.
- Do NOT run git add/commit/stash/reset/checkout/clean (the lead commits). No npm install.
- Weapons (data/weapons, movesets, weapon strings incl. flavor texts) belong to the weapons stream: only reference
  `drops_weapon` ids from tools/canon/bible.ts.
- Music: reference ids `boss_<id>` and `boss_<id>_p<N>` (the audio stream writes themes). Optionally request special cues.
- Italian first, English complete (docs/GLOSSARY.md terms). Canonical quotes from the Bible must appear VERBATIM in Italian.
  Mini bosses: no dialogue, no lore. No TODO/placeholder text anywhere.
- Determinism: behaviors use sim.rng only; no Date/Math.random in sim code. No three/DOM imports in behavior.ts.
- Performance: boss ≤ ~80k triangles (prefer far less), instancing for repeated parts, quality-aware detail (ctx.quality).
- Headless visual checks: run your own Vite on your assigned port (`npx vite --port <PORT> --strictPort &`), Playwright via a
  node script importing /home/user/settimo-mondo/node_modules/playwright-core/index.mjs, chromium executablePath
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args ['--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--ignore-gpu-blocklist']. In the page: `await __game.newGame(0,{name:'T',build:.5,height:.5,
  skin:2,hair:1,hairColor:0,eyes:0,cloak:0}); __game.sim.seq.skip(__game.sim); __game.sim.debug.invincible=true;
  __game.sim.startFightDirect('<boss>',{skipIntro:true})`. Look at the screenshots (Read tool) and iterate.
- Other agents edit the repo concurrently: typecheck (`npx tsc --noEmit -p tsconfig.json`) and fix YOUR errors; ignore others'.
- FINAL REPLY (≤ 25 lines): per boss: phases implemented, bot result (time vs target, hits), tests, visuals checked; zones
  done; requests filed; known gaps.
