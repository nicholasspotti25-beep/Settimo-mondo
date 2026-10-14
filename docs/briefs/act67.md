# Stream: ACTS VI–VII content — encounters 33–38, Rituale, ending (Vite port 5187)

Follow docs/CONTENT_BRIEF.md and docs/BOSS_AUTHORING.md.
Owns: data/bosses/{lucifero_2,drago_del_vuoto,verme_mangiamondi,regina_drago,dio_dei_draghi,cthulhu}.yaml,
data/arenas/{pianura_capovolta_arena,deserto_cenere_arena,palazzo_capovolto_sala,terrazze_celesti_arena,collasso_arena}.yaml
(cattedrale_navata belongs to Act II: request variants you need), data/zones/{radice_discesa,pianura_capovolta,deserto_cenere,
palazzo_capovolto,terrazze_celesti,collasso,alba}.yaml + altars, src/content/bosses/<your ids>/**, src/content/zones/<your
zones>/**, data/story/act6/**, data/story/act7/**, data/speakers/act67.yaml, data/voce/act67.yaml, data/reperti/act67.yaml,
data/projectiles/act67.yaml, data/hazards/act67.yaml, locales/{it,en}/act67_*.yaml, tools/bot/hooks/<your ids>.ts,
tests/act67*.test.ts, docs/requests/act67.md; Act intros `act6_intro` (the hollow root descending from Yggdrasil's crown to the
Inferno — a backward journey through everything crossed, sky less violet) and `act7_intro` (the Ritual lifts you through the
night to the Terrazze Celesti). The lead owns data/story/core/opening_ending.yaml (finale_alba, titoli): you may request
changes, and you build the ending's 3D presentation in your 'alba' zone (sea of clouds, sunrise, the cues below).

Cards:
- lucifero_2 (principal, D18, arena cattedrale_navata): left the throne; wings fully open; armor recomposed black and gold;
  pale tired eyes. Opening line by first encounter: fought → "Sei tornato a prendere il resto del colpo." begged → "Sei
  tornato in piedi. Mi piace di più." (sequence `if: "lucifero_choice == fought"`). Phase 1 duel with the Stella del Mattino,
  wide blows, feathers falling like blades. Phase 2 the Cathedral turns to embers; the floor is red-hot glass (arena hazards
  from p2; request the arena variant from Act II or use static hazards) and blades of the sky fall. Phase 3 la Caduta: wings
  of fire, dives and the final blow — the same unavoidable attack as the first encounter, now PARRYABLE with perfect timing
  (flags [unavoidable, red, parry_final]; any weapon may parry it). "Io ho perso il cielo per aver detto no. Dimostrami che
  il tuo sì valga." Defeated, he opens the Porta Rovesciata behind the throne: "Il cielo, ora, è sotto di noi." (verbatim);
  brightens_sky; unlocks abisso_rosso. Reuse/extend the Act II Lucifero model (src/content/bosses/lucifero_1/model.ts) or
  build your own model.ts.
- drago_del_vuoto (MINI, D16 — no dialogue/lore): black eyeless dragon cut out of darkness, tiny stars moving inside its
  scales; moves in reverse, walking on the sky that became ground; gravity holes that pull (hazards with `pull`), void breath;
  Phase 2 inverts the gravity of the whole arena (sim.setGravity(-1)).
- verme_mangiamondi (MINI, D17 — no dialogue/lore): gigantic segmented worm, circular mouth with spiral teeth, fragments of
  landscapes glued to its body (trees, towers, bridges); emerges and swallows pieces of the arena, which SHRINKS (arena
  variants); Phase 2 the body splits into segments that roll like millstones (minions).
- regina_drago (principal, D19, palazzo_capovolto_sala): like Re Drago but entirely dark: black body, violet and red details in
  equal amount pulsing like veins, wings of dark glass; heads Ricordo (violet), Rabbia (red), Silenzio (black). Phase 1 heads in
  turn: violet void breath, red flame, a silent scream that MUTES ALL SOUND (status mute). Phase 2 the Palace flips at each of
  her attacks: gravity changes sign and you rotate with it (sim.setGravity per attack). Phase 3 i Sei Mondi: memories of the
  dead worlds, each with a themed attack and arena state: fire, frost, garden, stars, wings, reverse. Phase 4: she recognizes
  you, stops attacking, anger becomes weeping, the Heart of Shadow offers itself (grants cuore_di_ombra; scripted end).
  "Io ricordo tutto. Lui ha scelto di dimenticare per poter continuare." (verbatim). brightens_sky; unlocks rovescio.
  THE RITUAL: at the top of the Palace the Altare del Rovescio — deposit the two hearts with THREE GUIDED GESTURES (sequence
  `gesture` steps), no combat; the halves reunite and the sky opens → travel to terrazze_celesti (act7_intro).
- dio_dei_draghi (principal, D19, terrazze_celesti_arena): a dragon long as a horizon, single majestic face, six halos of light
  on the forehead (one per fallen world) and a seventh, empty, turning above; body fades white→black like an aurora, gold and
  violet veins, golden eyes. Prova dell'Alba. Phase 1 il Giudizio: measured attacks each inspired by one of the six worlds
  (fire, frost, thunder, garden, stars, reverse). Phase 2 la Prova: tighter rhythms + signature moves of the principal bosses
  you defeated (copy AttackDefs from other bosses' data at runtime, retimed). The interruption (a third, scripted phase
  'l'Interruzione'): the sky cracks; "Basta. Ti ho visto." — he suspends the trial and turns to the new enemy; "Ho respirato
  sei mondi e li ho persi tutti. Il settimo non lo respiro io: lo respiri tu." (verbatim). Complete the encounter without a
  kill (end_fight_scripted) and chain into the Cthulhu fight (travel to collasso + start_fight_direct cthulhu). The Scettro is
  delivered after the final victory (weapon data has delivered_by: cthulhu).
- cthulhu (principal, D20, collasso_arena): titan of dreams: tentacled head, leathery wings, body dissolving into mist, many
  eyes; he does not speak — his voice is all the voices of the fallen worlds. Arena: fragments of every boss arena suspended
  in the void and rotating; time advances in jumps (periodic visual + positional jumps). The ALLY: Ouranthos fights with you
  (sim.spawnAlly with a MinionDef + ally behavior `cthulhu:ouranthos`): breaks Equilibrio with his breath, shields your
  mistakes with a wing (sim.allyShield uses ally.bstate.charge), recharges each perfect dodge (already wired). Phase 1 il
  Risveglio: tentacles sweeping the islands, waves of madness (status madness). Phase 2 il Sogno: the boss arenas re-emerge
  and each one's most famous attacks fall on the field (copy signature attacks from other bosses as global hazards). Phase 3
  l'Alba: Ouranthos, wounded, blows the seventh breath into your Metamondo, which activates by itself
  (sim.meta.forceActivate(sim, inline FormDef {ability id 'settimo_mondo'})): the Seventh World opens, your blows sweep away
  the mist; the fight ends with a COOPERATIVE Colpo di Grazia (sim.coopGrace = true). metamondo_reaction devour (earlier
  phases: he devours and spits it out). Defeat → defeat_sequence finale_alba (ending), credits.
- THE ENDING (alba zone + cues of finale_alba): new world above the sky — a sea of clouds to the horizon and a beautiful
  sunrise, the first in centuries (the world stream's sky shows the sun only when sim.endingActive); the player finally casts a
  shadow (render kit uses sim.player.hasShadow); Lucifero's black feather turns white and flies away (cue ending_feather; show
  it only if state.items has piuma_nera — otherwise show the Cicatrice healing into light), a laugh (Loki's) passes in the wind
  (cue ending_laugh, audio), the Cavaliere Errante's lantern, now lit, shines beside you (ending_lantern), on the wall of a
  faraway cave the Yeti's last dawn finally has a companion (ending_cave: use buildYetiPainting from
  src/content/bosses/yeti/painting.ts with withCompanion true, or request it from Act III-A). Register the ending camera shots
  (ending_clouds, ending_sunrise, ending_shadow, ending_feather, ending_lantern, ending_cave, ending_wide) via
  ctx.registerShot in your zone builder.
Zones: radice_discesa (hollow root; vistas of every region crossed), pianura_capovolta (Rovescio: inverted plain, the sky
underfoot), deserto_cenere (ash desert with devoured-world fragments), palazzo_capovolto (inverted palace, Altare del Rovescio at
the top), terrazze_celesti (white marble, hanging gardens, stairs of light, open silent sky — the paradise Lucifero lost),
collasso (fragments of all arenas floating in the void), alba (sea of clouds, sunrise). Palettes act6_violet_red_black and
act7_white_gold_sunrise. 2–3 Reperti in walkable zones.
