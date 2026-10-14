# Stream: ACT III-A content — encounters 13–16 + zones (Vite port 5183)

Follow docs/CONTENT_BRIEF.md and docs/BOSS_AUTHORING.md.
Owns: data/bosses/{gigante_di_fuoco,yeti,guardiano_rocca_di_brina,loki}.yaml, data/arenas/{vulcano_cratere,yeti_caverna,
rocca_cancello,rocca_sala_trono}.yaml, data/zones/{bocca_vulcano,corona_bianca,rocca_brina}.yaml + their altars,
src/content/bosses/<your ids>/**, src/content/zones/<your zones>/**, data/story/act3a/**, data/speakers/act3a.yaml,
data/voce/act3a.yaml, data/reperti/act3a.yaml, data/projectiles/act3a.yaml, data/hazards/act3a.yaml,
locales/{it,en}/act3a_*.yaml, tools/bot/hooks/<your ids>.ts, tests/act3a*.test.ts, docs/requests/act3a.md; plus the Act III
intro sequence `act3_intro` (up the Scala dei Dannati into white silence).

Cards:
- gigante_di_fuoco (D10, vulcano_cratere): giant tall as a tower, black rock skin, veins of fire, beard of flames, rises from the
  crater while snow melts; fists that ignite the ground, grabs and throws (grab), ember breath; crater rim slippery and
  unstable; Phase 2 covered in fire, charges head-down; sentinel between Inferno and Frost, not evil, he obeys.
- yeti (D10, yeti_caverna): white beast, thick fur, blue eyes, massive yet agile; cave with painted walls; sudden leaps, screams
  that trigger small avalanches, fast claws in a snowstorm with poor visibility; Phase 2 furious, never stops; he painted the
  LAST DAWN on the wall (first visual hint of the goal) and defends it. Export a reusable builder
  src/content/bosses/yeti/painting.ts → export function buildYetiPainting(ctx, opts: { withCompanion: boolean }) (the ending
  shows the painting finally with a companion).
- guardiano_rocca_di_brina (D11, rocca_cancello): gigantic empty ice armor, tower shield, small sword, frost in the joints;
  the shield blocks almost everything from the front (modifyIncoming) and punishes light spam; break Equilibrio to open a
  gap; Phase 2 the shield shatters into orbiting blades; Loki's porter bound by an oath he does not remember; falls saying
  "Finalmente" and crumbles.
- loki (principal, D13, rocca_sala_trono): elegant, black hair, crooked smile, green-and-gold cloak, changes expression and
  sometimes face. Phase 1 illusions: two copies (minions flagged 'illusion'); ONLY THE REAL ONE CASTS A SHADOW (flag
  'casts_shadow'; also 'illusionist'). Phase 2 labyrinth of mirrors (arena variant), he exits mirrors to strike. Phase 3 the
  hall collapses → suspended ice bridges (arena variant), he IMITATES THE THREE WEAPONS THE PLAYER HAS EQUIPPED (build
  mirrored, retimed-for-fairness AttackDefs at runtime from sim.player.weapons movesets). Lies mixed with truth: the Seventh
  World is a prison, Ouranthos is dead. Defeated he laughs and vanishes (cue 'loki_laugh'). brightens_sky; unlocks specchio.
Zones (palette act3_white_azure): white ridges under the gold-violet sky, auroras at night, from the volcano mouth to the ice
castle (Rocca di Brina) with its throne hall; 2–3 Reperti per zone.
