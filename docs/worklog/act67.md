# Work log — act67 (Acts VI–VII: encounters 33–38, Rituale, ending)

Brief: docs/briefs/act67.md. Vite port 5187. Chunk #1 started from nothing (no owned file existed beyond the scaffolded
zones/arenas/altars).

## Status

| Deliverable | Status | Files |
|---|---|---|
| lucifero_2: data, phases p1–p3, NG+, ToD variants | done (sim) | data/bosses/lucifero_2.yaml |
| lucifero_2: behavior (glass of p2, central lane, la Caduta parryable, parry → Spezzato) | done | src/content/bosses/lucifero_2/behavior.ts |
| lucifero_2: story (opening by lucifero_choice, defeat callback piuma/cicatrice, "Il cielo, ora, è sotto di noi.") | done | data/story/act6/lucifero_2.yaml, locales/{it,en}/act67_bosses.yaml, locales/{it,en}/act67_story.yaml |
| lucifero_2: bot hook (parry of la Caduta, glass escape) | done | tools/bot/hooks/lucifero_2.ts |
| lucifero_2: balance | partial — perfect 1/3 wins (282 s, 14.7 hits), sloppy 0/3 | |
| lucifero_2: model (standing look) | missing — requested from act2 (reuse of lucifero_1 model) | docs/requests/act67.md §2 |
| lucifero_2: arena embers dressing (cattedrale_navata is Act II's) | missing — requested from act2 | docs/requests/act67.md §2 |
| drago_del_vuoto: data p1–p2, NG+, ToD | done (sim) | data/bosses/drago_del_vuoto.yaml |
| drago_del_vuoto: behavior (reverse walk, tail blows only behind, gravity −1 in p2, restored on death) | done | src/content/bosses/drago_del_vuoto/behavior.ts |
| drago_del_vuoto: bot hook (breath, holes) | partial | tools/bot/hooks/drago_del_vuoto.ts |
| drago_del_vuoto: balance | FAILING — perfect 0/3 (25 hits, 5 perfect dodges), sloppy 0/3 | |
| drago_del_vuoto: model, arena dressing (pianura_capovolta_arena) | missing | |
| verme_mangiamondi: data p1–p2, millstone minion, NG+, ToD | done (sim) | data/bosses/verme_mangiamondi.yaml |
| verme_mangiamondi: behavior (burrow/emerge at the mark, 3 swallows shrink the arena, millstones, one blow at a time) | done | src/content/bosses/verme_mangiamondi/{behavior,minion_macina}.ts |
| verme_mangiamondi: arena variants swallow_1/2/3 (r 34→29→25→21) | done | data/arenas/deserto_cenere_arena.yaml |
| verme_mangiamondi: bot hook (swallow band escape) | done | tools/bot/hooks/verme_mangiamondi.ts |
| verme_mangiamondi: balance | partial — perfect 2/3 (319 s, 7 hits; millstone rolls are most hits), sloppy 0/3 | |
| verme_mangiamondi: model, arena dressing | missing | |
| regina_drago (4 phases, mute scream, gravity flip per attack, Sei Mondi, scripted p4 + cuore_di_ombra) | missing | |
| Rituale (Altare del Rovescio, three `gesture` steps, travel → terrazze_celesti) | missing | |
| act6_intro | done | data/story/act6/act6_intro.yaml |
| act7_intro | missing (progression warns: unknown intro_sequence) | |
| dio_dei_draghi (Giudizio, Prova with copied signatures, scripted Interruzione, chain to cthulhu) | missing | |
| cthulhu (ally Ouranthos, time jumps, madness, Sogno, l'Alba forced Metamondo, coop grace, devour, finale_alba) | missing | |
| Ending presentation (alba zone: sunrise, shadow, feather/scar, laugh, lantern, Yeti cave, 7 shots) | missing (finale_alba / titoli exist, lead-owned, wired in data/progression.yaml) | |
| Speakers | done (lucifero_2, regina_drago, dio_dei_draghi) | data/speakers/act67.yaml |
| Voce dell'Alba lines (all 7 Act VI–VII altars) | done | data/voce/act67.yaml, locales/{it,en}/act67_story.yaml |
| Projectile / hazard kinds | partial (encounters 33–35) | data/projectiles/act67.yaml, data/hazards/act67.yaml |
| Arenas palazzo_capovolto_sala, terrazze_celesti_arena, collasso_arena | missing (scaffold only) | |
| Zones radice_discesa … alba (terrain, props, landmarks, vistas, horizon) | missing (scaffold only) | |
| Reperti (2–3 per walkable zone) | missing | data/reperti/act67.yaml |
| Unit tests | partial — 13 tests for 33–35 + shared data rules | tests/act67.test.ts |
| Requests | filed | docs/requests/act67.md |

## Next

1. Balance drago_del_vuoto: the perfect bot loses with 25 hits and only 5 perfect dodges. Measure with the scratch tally
   script (which attack hits it). Suspects: the generic bot misreads the tail blows (arc yaw 180, track 0) and reverse_charge
   (motion `retreat`) while the dragon faces away; add a tail/charge dodge to its hook or retune those two attacks.
2. Balance lucifero_2 (1/3 → 3/3 inside 480 s) and verme_mangiamondi (2/3 → 3/3; a dodge for the millstone rolls, since
   act2Defense's chargeDodge only reads the boss).
3. regina_drago: data (heads ricordo/rabbia/silenzio as parts, `mute` scream, p2 setGravity per attack, p3 Sei Mondi
   arena states, p4 scripted end + cuore_di_ombra, rovescio form, brightens_sky), palazzo_capovolto_sala arena + variants,
   story with "Io ricordo tutto. Lui ha scelto di dimenticare per poter continuare." verbatim, hook, tests.
4. Rituale at the end of the regina_drago defeat sequence (three `gesture` steps, the hearts reunite, the sky opens, travel to
   terrazze_celesti as the last step) + act7_intro (starts with `{wait: 0.05}` until request §1 is merged).
5. dio_dei_draghi: Giudizio (six worlds), Prova (copied, retimed `signature` attacks of the defeated principals via
   selectAttack, never mutating shared content), Interruzione (sequence with "Basta. Ti ho visto." and "Ho respirato sei
   mondi e li ho persi tutti. Il settimo non lo respiro io: lo respiri tu." verbatim, end_fight_scripted, sky_brighten,
   start_fight_direct cthulhu).
6. cthulhu: Ouranthos ally (MinionDef + `cthulhu:ouranthos`), time jumps, madness waves, Sogno nightmare hazards from other
   bosses' signatures, l'Alba forceActivate(settimo_mondo) + coopGrace, metamondo_reaction devour, defeat_sequence finale_alba.
7. Tests and bot hooks for 36–38; run the whole chain Rituale → act7_intro → dio → cthulhu → finale_alba → titoli headless.
8. Ending presentation in the alba zone (shots ending_clouds … ending_wide via ctx.registerShot; cues feather/scar, laugh,
   lantern, buildYetiPainting withCompanion).
9. Reperti, zone dressing for the 7 zones, arena dressing, boss models (docs/RENDER_KIT.md and docs/WORLD_KIT.md are READY).

## Notes

- Verification (end of chunk #1): `npx tsc --noEmit -p tsconfig.json` 0 errors; `npx vitest run tests/act67.test.ts`
  13/13; `npm run registry && SM_PARTIAL=1 npm run data` ok, no warning about act67 files (remaining warnings name
  encounters 36–38, not yet written); canon-audit for 33–35 only reports music themes (audio stream) and models (later).
- Balance (`npx tsx tools/balance-bot.ts <id> --seeds=3`, targets 480/440/460 s): lucifero_2 perfect 1/3 at 282 s with
  14.7 hits, 3 parries of la Caduta in a measured run; drago_del_vuoto perfect 0/3; verme_mangiamondi perfect 2/3 at 319 s
  with 7 hits. The sloppy profile never wins.
- IMPORTANT: rebuild content with `SM_PARTIAL=1 npm run data`. Strict `npm run data` fails on the missing encounters and
  does NOT write src/generated/content.json, so bot runs silently use stale data.
- Measurement script (hits by attack/hazard, deaths, parries):
  /tmp/claude-0/-home-user-settimo-mondo/af03cb07-d77a-5105-8b91-fb3fdb8d8552/scratchpad/hits.ts
  (`npx tsx <path> <boss> [perfect|sloppy] [seeds]`). Scratchpad only; recreate it if it is gone.
- Decisions: Lucifero II's red-hot glass is laid by the behavior (static burn patches in the side aisles; he holds the central
  lane, |x| ≤ 8.5), because the arena belongs to Act II. La Caduta is parryable by any weapon (parry_final); a parry breaks
  his Equilibrio; unparried it deals 1.9 × a typical hit (never a kill from full Health) and is never started at a downed
  player, nor twice within 18 s. Breath ticks carry poise 0 (no flinch-lock). Ring shockwaves are centered on the attacker.
- Sequences that another step can start (`travel` into an act's first zone, `start_fight_direct`) begin with `{wait: 0.05}`,
  the workaround for the runner bug in request §1.
- The Drago del Vuoto and the Verme do not speak and have no lore (mini bosses); the millstone minion has a name key only.
