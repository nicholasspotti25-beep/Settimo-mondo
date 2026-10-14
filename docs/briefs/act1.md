# Stream: ACT I content — encounters 2–6 (Vite port 5181)

Follow docs/CONTENT_BRIEF.md (work order, rules) and docs/BOSS_AUTHORING.md.
Encounter 1 (guardiano_del_regno) is the lead's reference boss — do not edit it. Act I ZONES belong to the world stream (do not
edit data/zones for Act I or src/content/zones); you own the ARENAS of your bosses (keep id/zone/center/gate) and their dressing.
Owns: data/bosses/{cavaliere_errante,elder_tree,mostro_della_palude,great_devourer,caronte}.yaml,
data/arenas/{pianure_erba_alta,foresta_cuore,palude_pozza,palude_molo,fiume_traghetto}.yaml, src/content/bosses/<those 5>/**,
data/story/act1/<boss>.yaml (not guardiano.yaml), data/speakers/act1.yaml, data/voce/act1.yaml, data/projectiles/act1.yaml,
data/hazards/act1.yaml, locales/{it,en}/act1_bosses.yaml, tools/bot/hooks/<your ids>.ts, tests/act1*.test.ts, docs/requests/act1.md.

Cards (implement every element; Bible C10):
- cavaliere_errante (D3, arena pianure_erba_alta): mounted duel in tall grass: circles you, flank attacks, dives at an open
  guard (punish guarding); Phase 2 dismounts (mount leaves) and duels on foot with the sword, parrying and riposting (counter
  stance); alba = chivalrous salute opener + fair duel; notte = charges from the dark; first Cercatore; before falling:
  "L'alba non si trova. Si porta" (verbatim); grants: [lanterna_del_cavaliere]; mounted: true; lore_key.
- elder_tree (D4, foresta_cuore): giant tree with bark face, branch arms, black leaves, luminous mushrooms; roots erupt
  announced by soil cracks (hazards), whipping branches, pollen that blurs vision ('blind'); Phase 2 trunk opens on a heart of
  light: weak-point part where heavy hits break Equilibrio (poise_mult); dying, it lets through the first ray of light in
  centuries (cue 'first_light' for the arena dressing); lore_key.
- mostro_della_palude (D5, palude_pozza): colossus of mud, reeds, bones, unlit lanterns; emerges from water (hidden → emerge);
  two-handed slams, mud waves that slow, arms stretching out of the mire; Phase 2 splits into three smaller figures fighting
  in sequence (minions with main_share); the thousand voices announce attacks in advance — emit an sfx cue per attack family
  in the telegraph ('voices_slam' etc.) AND a {type:'caption', key} whispered line (IT/EN); a whisper clue: the ferryman does
  not want coins; heap of drowned Cercatori; lore_key.
- great_devourer (MINI, D6, palude_molo — no dialogue/lore): gigantic green-black serpent from the fog; rotten pier arena;
  attacks from below (ripple telegraphs), bites, coils around stilts to crush; Phase 2 destroys the pier → rafts and logs
  (arena variant).
- caronte (D6, fiume_traghetto): tall thin hooded figure on a black boat, blade-paddle oar, lantern holding the eyes of souls;
  fight on the boat then on a bridge of souls; souls as projectiles — giorno few but fast, notte many but slow
  (time_of_day_variants spawn_mult/projectile_speed_mult); oar sweeps the bridge; Phase 2 the boat sinks → duel on the
  luminous current (arena variant); "Non hai ombra, Portatore. Né passato." (verbatim); wants a memory not a coin; ferries you
  to the Porta di Dite (zone exit kind boat exists).
Palette act1_green_gold.
