# Stream: ACT II content — encounters 7–12 + Act II zones (Vite port 5182)

Follow docs/CONTENT_BRIEF.md and docs/BOSS_AUTHORING.md.
Owns: data/bosses/{cerbero,pyro,thunder,ice,mostro_di_magma,lucifero_1}.yaml, data/arenas/{dite_soglia,roghi_campo,
bufera_altura,cocito_lago,fucine_incudini,cattedrale_navata}.yaml, data/zones/{porta_dite,landa_roghi,bufera_eterna,cocito,
fucine_sepolte,cattedrale_caduta}.yaml + their altars (keep ids), src/content/bosses/<your ids>/**, src/content/zones/<your
zones>/**, data/story/act2/**, data/speakers/act2.yaml, data/voce/act2.yaml, data/reperti/act2.yaml,
data/projectiles/act2.yaml, data/hazards/act2.yaml, locales/{it,en}/act2_*.yaml, tools/bot/hooks/<your ids>.ts,
tests/act2*.test.ts, docs/requests/act2.md. Also the Act II intro sequence `act2_intro` (arrival at the Gate of Dis).
lucifero_2 (Act VI stream) reuses arena cattedrale_navata; build the Lucifero model so it supports both looks via actor.defId
(lucifero_1 seated on a throne of swords, cracked golden armor, burned black wings; lucifero_2 standing, armor recomposed in
black and gold, wings fully open) and export it for reuse.

Cards:
- cerbero (D7, dite_soglia): three heads as parts: left bites, center spits fire, right growls shockwaves; you must read which
  head attacks (per-head telegraph); Phase 2 chains break, sudden leaps; the Gate opens only for souls: your shadowless body
  weighs like a soul (lore).
- pyro (D8, roghi_campo; 'Pyro', title 'il Cavaliere di Fiamme'): giant incandescent knight, cloak of flames, wavy greatsword;
  long two-handed combos, fire waves on the ground, leap with slam; Phase 2 wrapped in flames, also attacks at range; first
  of the Tre Cavalieri del Giuramento (fell with Lucifero); "Il Fuoco giura per primo."
- thunder (D8, bufera_altura): blue-silver armor with electric arcs, great hammer; fast unpredictable dashes, overheads,
  lightning that marks the ground before striking; Phase 2 rain of lightning, a dance among discharges; "Il Tuono giura per
  secondo."
- ice (D9, cocito_lago): slender azure crystal knight, thin rapier, breath freezes the air; precision duelist who parries and
  ripostes, very fast attacks, PUNISHES LIGHT-ATTACK SPAM; ground freezes and slides (arena surface 'ice': the sim makes the
  player slide); Phase 2 ice mirrors he re-emerges from; "Il Gelo giura per ultimo." The three knights hold the three seals
  of the Cathedral: make the seals diegetic in the cathedral zone (break as knights fall).
- mostro_di_magma (D9, fucine_incudini): rock-and-lava colossus among giant anvils, glowing cracks, pulsing heart; slow
  devastating blows, lava bursts, an eruption that fills the arena; Phase 2 obsidian carapace (breakable part, damage reduced
  until shattered) exposing the heart (weak point); built by the knights to guard the forge where the armor of the Fallen was
  beaten.
- lucifero_1 (principal, scripted, no weapon, cattedrale_navata): burned black wings, cracked golden armor, throne of swords,
  no more hurry. Intro: "Sei vivo, piccolo seme. Cosa vuoi da me?" → choice Affronta / Implora. Implora = choice with
  `hold: 5` (kneel under his gaze) → "Nessuno mi ha mai implorato per vivere. Vai." → give_item piuma_nera, set lucifero_choice
  begged. Affronta → real fight, he is invulnerable (canDie false / immune), metamondo_reaction shatter (one finger), after
  ~2 minutes an unavoidable attack ends it as a NARRATIVE defeat: wake at the exit (near the Scala dei Dannati) with full
  Health and Lacrime, give_item cicatrice_del_rifiuto, set lucifero_choice fought. Both complete the encounter (storyEvent
  end_fight_scripted) and lead out by the Scala dei Dannati. He spared you because he recognized the seed.
Zones (palette act2_red_blue_black): Porta di Dite (immense arch of bones and iron in rock), Landa dei Roghi (embers plain, fire
columns, red sky), Bufera Eterna (black storm, horizontal lightning), Cocito (blue frozen lake, shadows trapped below), Fucine
Sepolte (magma caves and anvils), Cattedrale Caduta (sunken black-marble temple, overturned nave). 2–3 Reperti per zone.
