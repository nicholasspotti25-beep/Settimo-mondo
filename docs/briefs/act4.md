# Stream: ACT IV content — encounters 23–26 + Little Garden (Vite port 5184)

Follow docs/CONTENT_BRIEF.md and docs/BOSS_AUTHORING.md.
Owns: data/bosses/{re_mantide,coleottero_imperiale,regina_formica,uruk}.yaml, data/arenas/{giardino_trifogli,giardino_muschio,
giardino_formicaio,serra_giardiniere}.yaml, data/zones/{little_garden,serra_giardiniere}.yaml + altars,
src/content/bosses/<your ids>/**, src/content/zones/{little_garden,serra_giardiniere}/**, data/story/act4/**,
data/speakers/act4.yaml, data/voce/act4.yaml, data/reperti/act4.yaml, data/projectiles/act4.yaml, data/hazards/act4.yaml,
locales/{it,en}/act4_*.yaml, tools/bot/hooks/<your ids>.ts, tests/act4*.test.ts, docs/requests/act4.md; Act IV intro
`act4_intro` (touching the shore, the Sguardo del Giardiniere shrinks you).
SCALE: player 0.1 scale (~0.18 m) moving at 60% speed (DECISIONS.md, gamestate.playerBaseScale); everything is enormous:
clovers, moss, grass, flowers, mushrooms; vivid colors, glowing pollen, an endless hedge; the exit is the central greenhouse
protected by three gates, each guarded by a courtier. Arenas 12–17 m radius, bosses 2–6 m (Uruk ~6 m, huge in phase 3);
check camera framing.
Cards:
- re_mantide (D13): jade-green mantis tall as a cathedral compared with you, crown of petals, chitin scythes; camouflages among
  leaves and reappears behind you (readable cue), crossed slashes, tight combos; Phase 2 the crown blooms, bursts of sharp
  petals; chief of the guards, opens the first gate, studies you with a naturalist's curiosity.
- coleottero_imperiale (D14): armored metallic-blue beetle, huge stag mandibles, buzzing wings; slow, armored, fearsome:
  head-down charges, mandibles that grab and crush; Phase 2 wings open, flight and bombing runs from above; general of Uruk's
  court, opens the second gate, respectfully recognizes a worthy opponent.
- regina_formica (D14): gigantic ant, swollen golden abdomen, luminous eggs; avoids melee: spits acid, sends WAVES OF WORKERS
  across the arena that you JUMP to avoid (low moving hazards, not allies); Phase 2 tunnels open under your feet and she
  attacks from the holes; behind the anthill is the passage to the greenhouse.
- uruk (principal, D15): gigantic gardener — tall, thin, woven-leaf hat, pale bark skin, dewdrop eyes, earth-stained apron,
  enormous shears and a bronze watering can; dignified and melancholic. Phase 1 la Potatura (shears like guillotines,
  carnivorous flowers sprout, he tries to cut you like a dead branch). Phase 2 l'Annaffiatoio (he waters the arena; FLOWERS
  GROW IN REAL TIME into barricades and traps via sim.addArenaCollider/removeArenaCollider + hazards; enormous drops rain).
  Phase 3 l'Erbaccia (greenhouse opens, sky visible, Uruk truly a god at full size; you are the weed he cannot uproot).
  "Un giardino piccolo non si può perdere." (verbatim). Defeat = the Ascesa: his essence flows into you, you grow past the
  garden, measures return to reality, Little Garden is revealed as a flowerbed in a normal-sized park; you end at 112%
  (storyEvent set_scale 1.12); memorable camera pull-back; brightens_sky; unlocks gigante.
Palette act4_vivid.
