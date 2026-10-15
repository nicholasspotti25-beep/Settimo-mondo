# PROGRESS — Settimo Mondo

Checklist of every item in PART F. `[x]` = implemented and verified by running it (tests, bot, build or headless browser). On 'continue', resume from the first unchecked item.

## 1. Foundation
- [x] Repo + toolchain (TS strict, Vite, Vitest, ESLint, tsx)
- [x] sim/render split (lint-enforced)
- [x] Fixed 60 Hz loop + interpolation
- [x] Balance file with every C4/C6 number (data/balance.yaml)
- [x] Data loaders + zod validation + compiled bundle
- [x] Event bus / sim events
- [x] Localization service (IT first, EN complete)
- [x] Save system (IndexedDB + localStorage, 3 slots, export/import code)
- [ ] Debug menu
- [x] Test harness (vitest)
- [ ] Touch input layer
- [ ] PWA shell (manifest, service worker, icons, offline)

## 2. Core feel
- [x] Player controller + state machine (D6)
- [ ] Lock-on camera (frames player+boss, pulls back for huge bosses, multi-part lock points)
- [x] Fiato
- [x] Eco (3 segments)
- [x] Lacrime d'Alba (1.2 s, cancel ≤0.4 s, refill on death/meditation)
- [x] Dodge + perfect dodge (+40 Eco, +3% Metamondo, slow-mo)
- [x] Guard + perfect parry (parry-capable types)
- [x] Weapon slots + swapping (0.35 s)
- [ ] Transizioni (49 ordered category pairs)
- [ ] HUD (thin bars, Eco pips + Metamondo ring, boss bar + Equilibrio)
- [ ] Procedural humanoid animator
- [ ] Procedural weapon builder (38 looks)
- [x] Hit stop
- [ ] Haptics (hit, parry, perfect dodge, Colpo Rosso warning, Colpo di Grazia, boss defeat)

## 3. World loop
- [ ] Castello della Culla
- [ ] Altars + meditation (Alba/Giorno/Tramonto/Notte, heal, refill)
- [ ] Time of day presets per zone
- [ ] Loadout at altars
- [ ] Armeria
- [ ] Fog gates (Nebbia dell'Alba)
- [ ] Vistas
- [ ] Reperti dei Cercatori
- [ ] Voce dell'Alba lines
- [ ] Fast travel (disabled on ships and in the Collapse)
- [ ] Zone streaming (one zone at a time + horizon impostors)
- [ ] Sky (Lungo Crepuscolo, no sun until the ending) + fog shaders
- [ ] Sky brightening per principal boss
- [ ] Player casts no shadow until the ending

## 4. Boss framework + special technology
- [x] BossBase (HP, Equilibrio, phases, patterns, death sequence)
- [x] Pattern selection constraints (cooldowns, distance, max twice in a row, openers)
- [ ] Multi-head bosses (own Equilibrio per head)
- [ ] Mounted bosses (Guardiano, Cavaliere dismount)
- [ ] Ship sections (spline platform, sway, ballista, tentacle break points)
- [ ] Scale change (Little Garden 10% / 60% speed, 112% after Uruk)
- [ ] Scripted loss (Lucifero I: invulnerable, ~2 min, Metamondo shatter, Affronta/Implora 5 s hold)
- [ ] Equipped-weapon mimic (Loki phase 3)
- [ ] Echo replay (Reina phase 3, last 10 s)
- [ ] AI ally (Ouranthos vs Cthulhu)
- [ ] Collapse arena (floating fragments, time jumps)
- [ ] Time-of-day variants
- [ ] Metamondo hooks (shatter, rewrite, devour)

## 5. Metamondo
- [x] MetamondoController (meter 2.5 min, +3%/perfect dodge, starts at 50%, 30 s, +50% dmg, Eco x2, no boss heal/summon)
- [ ] Form: Prato Lunare — Respiro Libero (ability + miniature environment)
- [ ] Form: Specchio — Riflessi (from Loki) (ability + miniature environment)
- [ ] Form: Gigante — Statura (from Uruk) (ability + miniature environment)
- [ ] Form: Firmamento — Tempo Stellare (from Reina) (ability + miniature environment)
- [ ] Form: Cielo Aureo — Ali di Luce (from Re Drago) (ability + miniature environment)
- [ ] Form: Abisso Rosso — Patto di Sangue (from Lucifero) (ability + miniature environment)
- [ ] Form: Rovescio — Inversione (from Regina Drago) (ability + miniature environment)

## 6. Encounters (boss definition of done: data, all phases, fair telegraphs, arena + fog gate + altar, phase music, IT/EN dialogue/lore, weapon + 2 Arts + look + VFX, ToD variation, Metamondo reaction, Form unlock, debug-kill + real play + bot inside target, tests)
- [ ] 01. Guardiano del Regno — lancia — Lancia del Custode — D2
- [ ] 02. Cavaliere Errante — spada lunga — Brando del Viandante — D3
- [ ] 03. Elder Tree — bastone magico — Ramo dell'Antico — D4
- [ ] 04. Mostro della Palude — mazza — Randello del Pantano — D5
- [ ] 05. Great Devourer — spada serpentina — Zanna Strisciante — D6
- [ ] 06. Caronte — alabarda — Remo del Traghettatore — D6
- [ ] 07. Cerbero — catene — Triplice Guinzaglio — D7
- [ ] 08. Pyro, il Cavaliere di Fiamme — spadone — Brace Eterna — D8
- [ ] 09. Thunder, il Cavaliere di Fulmini — martello da guerra — Tuono Spezzacielo — D8
- [ ] 10. Ice, il Cavaliere di Ghiaccio — stocco — Brina Silente — D9
- [ ] 11. Mostro di Magma — ascia a due mani — Fenditura Ardente — D9
- [ ] 12. Lucifero, l'Arcangelo Caduto (I) — — — — (scripted)
- [ ] 13. Gigante di Fuoco — pugni — Pugni di Brace — D10
- [ ] 14. Yeti — artigli — Unghie del Bianco — D10
- [ ] 15. Guardiano della Rocca di Brina — scudo — Baluardo Gelido — D11
- [ ] 16. Loki — tomo — Grimorio delle Menzogne — D13
- [ ] 17. Grande Lupo — katana — Zanna d'Argento — D11
- [ ] 18. Grande Orso — asce gemelle — Asce Gemelle del Taglialegna — D12
- [ ] 19. Sciamano — totem — Totem degli Spiriti — D12
- [ ] 20. Grande Aquila Reale — arco lungo — Piuma Reale — D12
- [ ] 21. Drago di Fuoco — balestra — Balestra del Drago Ardente — D12
- [ ] 22. Kraken — arpione — Arpione Abissale — D13
- [ ] 23. Re Mantide — kama gemelle — Kama della Mantide — D13
- [ ] 24. Coleottero Imperiale — lama a tenaglia — Mandibole Imperiali — D14
- [ ] 25. Regina Formica — pugnali — Pungiglioni Regali — D14
- [ ] 26. Uruk, Dio Minore di Little Garden — cesoie — Cesoie del Giardiniere — D15
- [ ] 27. Drago di Ghiaccio — naginata — Naginata Cristallina — D14
- [ ] 28. Drago a Tre Teste — tridente — Tridente delle Tre Punte — D15
- [ ] 29. Reina, la Maga Ancestrale — astrolabio — Astrolabio Ancestrale — D16
- [ ] 30. Idra — frusta — Frusta delle Nove Code — D15
- [ ] 31. Grifone — scimitarra — Ala di Grifone — D16
- [ ] 32. Re Drago — spada bastarda — Spada del Sovrano — D17
- [ ] 33. Lucifero, l'Arcangelo Caduto (II) — flagello — Stella del Mattino — D18
- [ ] 34. Drago del Vuoto — chakram — Chakram del Vuoto — D16
- [ ] 35. Verme Mangiamondi — trivella — Trivella Divorante — D17
- [ ] 36. Regina Drago — falce — Falce dell'Eclissi — D19
- [ ] 37. Dio dei Draghi (Ouranthos) — scettro — Scettro del Primo Respiro — D19
- [ ] 38. Cthulhu, Dio Maggiore del Caos — arma mutaforma — Lama dell'Abisso Sognante — D20

## 6b. Weapons (37 boss weapons + starter, two Arts each)
- [ ] 00. Lama della Culla (spada corta, starter) — Primo Passo / Ninnananna dell'Alba
- [ ] 01. Lancia del Custode (lancia)
- [ ] 02. Brando del Viandante (spada lunga)
- [ ] 03. Ramo dell'Antico (bastone magico)
- [ ] 04. Randello del Pantano (mazza)
- [ ] 05. Zanna Strisciante (spada serpentina)
- [ ] 06. Remo del Traghettatore (alabarda)
- [ ] 07. Triplice Guinzaglio (catene)
- [ ] 08. Brace Eterna (spadone)
- [ ] 09. Tuono Spezzacielo (martello da guerra)
- [ ] 10. Brina Silente (stocco)
- [ ] 11. Fenditura Ardente (ascia a due mani)
- [ ] 13. Pugni di Brace (pugni)
- [ ] 14. Unghie del Bianco (artigli)
- [ ] 15. Baluardo Gelido (scudo)
- [ ] 16. Grimorio delle Menzogne (tomo)
- [ ] 17. Zanna d'Argento (katana)
- [ ] 18. Asce Gemelle del Taglialegna (asce gemelle)
- [ ] 19. Totem degli Spiriti (totem)
- [ ] 20. Piuma Reale (arco lungo)
- [ ] 21. Balestra del Drago Ardente (balestra)
- [ ] 22. Arpione Abissale (arpione)
- [ ] 23. Kama della Mantide (kama gemelle)
- [ ] 24. Mandibole Imperiali (lama a tenaglia)
- [ ] 25. Pungiglioni Regali (pugnali)
- [ ] 26. Cesoie del Giardiniere (cesoie)
- [ ] 27. Naginata Cristallina (naginata)
- [ ] 28. Tridente delle Tre Punte (tridente)
- [ ] 29. Astrolabio Ancestrale (astrolabio)
- [ ] 30. Frusta delle Nove Code (frusta)
- [ ] 31. Ala di Grifone (scimitarra)
- [ ] 32. Spada del Sovrano (spada bastarda)
- [ ] 33. Stella del Mattino (flagello)
- [ ] 34. Chakram del Vuoto (chakram)
- [ ] 35. Trivella Divorante (trivella)
- [ ] 36. Falce dell'Eclissi (falce)
- [ ] 37. Scettro del Primo Respiro (scettro)
- [ ] 38. Lama dell'Abisso Sognante (arma mutaforma)

## 7. Story layer
- [ ] Every dialogue (principal bosses) IT/EN
- [ ] Voce dell'Alba lines
- [ ] Reperti texts
- [ ] Weapon flavor texts (secondary + principal only; none for mini bosses)
- [ ] Lucifero branches (Affronta/Implora) + callbacks in the second encounter
- [ ] Rituale delle Due Metà (three gestures)
- [ ] Ending cutscene (sunrise, shadow, white feather, Loki's laugh, lit lantern, cave painting)
- [ ] Credits + title

## 8. Audio
- [ ] SFX library (synthesized)
- [ ] Adaptive music for every boss (phase layers) and altar ambience
- [ ] Portatore theme progression (+1 note per principal boss, full only in the final fight)
- [ ] Sunrise cue
- [ ] Speaker voice tones

## 9. Post-game + polish
- [ ] Ciclo dell'Alba (New Game+): new aggressive patterns, carry-over, golden sky, Lama dell'Abisso usable
- [ ] Specchio dei Ricordi (replay bosses with chosen ToD + Form)
- [ ] Challenges (no damage, single weapon, no Lacrime, no Metamondo)
- [ ] Collections (37+1 weapons, 7 Forms, ToD variants)
- [ ] VFX pass
- [ ] Animation pass
- [ ] UI polish
- [ ] Accessibility (remap, subtitles, reduced shake/flash, colorblind-safe Colpo Rosso, toggle hold, sensitivity, large buttons)
- [ ] Settings
- [ ] English localization pass

## 10. Hardening
- [ ] Balance bot beats all 38 encounters inside target time
- [ ] Sloppy profile check (fights not trivial)
- [ ] Canon audit = zero mismatches
- [ ] Performance pass (low-end + mid-range profiles)
- [ ] UI checks on small phone + tablet sizes
- [ ] Lifecycle checks (background pause/autosave, relaunch restores)
- [ ] Battery: 30 FPS mode, quality presets, watchdog
- [ ] PWA build (dist/)
- [x] Capacitor Android project
- [x] Capacitor iOS project
- [ ] README.md
- [ ] DECISIONS.md
- [ ] CREDITS.md

## Resume notes (orchestration)
- Work-streams are defined in `docs/briefs/*.md` (COMMON + one per stream); each stream keeps `docs/worklog/<stream>.md`.
- One resumable workflow drives everything in bounded chunks (the earlier whole-brief workflows wasted each usage window on
  re-orientation): run `wf_38b1ecdd-baa`, script
  `/root/.claude/projects/-home-user-settimo-mondo/af03cb07-d77a-5105-8b91-fb3fdb8d8552/workflows/scripts/settimo-chunks-wf_38b1ecdd-baa.js`.
  Engine lane: world, render-kit, weapons, audio, forms (+ an integration pass every 3 chunks). Game lane: ui, act1..act67.
  A stream that reports its brief complete goes through adversarial review + fix (two rounds when serious findings remain).
- If interrupted (API usage limit; windows reset at :50 every 5 h — 00:50, 05:50, 10:50, 15:50, 20:50 UTC), snapshot-commit and
  relaunch with `Workflow({scriptPath, resumeFromRunId: "wf_38b1ecdd-baa"})`: finished chunks replay from cache.
- GitHub: `origin` = nicholasspotti25-beep/settimo-mondo (push refused until the Claude GitHub App is installed on it).
  Hosting for the phone-only owner: `tools/deploy-pages.sh --partial` publishes dist/ to the gh-pages branch.
- After all streams finish: final integration, strict `npm run check`, smoke on dist, canon audit to zero, final reviewer.
