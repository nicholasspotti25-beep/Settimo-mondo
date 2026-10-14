# Stream: ACT V content — encounters 27–32 + Dragon Realm zones (Vite port 5186)

Follow docs/CONTENT_BRIEF.md and docs/BOSS_AUTHORING.md.
Owns: data/bosses/{drago_di_ghiaccio,drago_a_tre_teste,reina,idra,grifone,re_drago}.yaml, data/arenas/{ossa_altipiano,nidi_rupe,
osservatorio_cupola,lago_specchi,scogliere_cornice,chioma_yggdrasil}.yaml, data/zones/{altipiano_ossa,nidi,osservatorio,
lago_nove_specchi,scogliere_vento,yggdrasil}.yaml + altars, src/content/bosses/<your ids>/**, src/content/zones/<your
zones>/**, data/story/act5/**, data/speakers/act5.yaml, data/voce/act5.yaml, data/reperti/act5.yaml,
data/projectiles/act5.yaml, data/hazards/act5.yaml, locales/{it,en}/act5_*.yaml, tools/bot/hooks/<your ids>.ts,
tests/act5*.test.ts, docs/requests/act5.md; Act V intro `act5_intro` (the player returns to real scale, 112%, leaving the park
into the Dragon Realm).
Cards:
- drago_di_ghiaccio (MINI, D14 — no dialogue/lore): white-and-azure dragon, ice crystals instead of scales, frozen-fog breath
  leaving icy zones on the ground (surface/hazards that make you slide), tail sweeps; Phase 2 storm + stalactites from above.
- drago_a_tre_teste (MINI, D15 — no dialogue/lore): green-and-brown dragon with three different heads (fire, poison,
  lightning) among nests carved in rock; each head has an element and its OWN Equilibrio bar (parts with equilibrio,
  lockable): choosing which to bring down first is the key; when a head falls the others become enraged and faster
  (Phase 2 begins at the first head's fall).
- reina (principal, D16, osservatorio_cupola): tall ageless woman, midnight-blue robe of moving stars, comet-white hair,
  crystal eyes, floats among orbiting rings. Phase 1 le Orbite: concentric rings rotate on the ground, falling stars,
  constellations that strike when their lines join (very clear telegraphs). Phase 2 il Cielo Riscritto: variable gravity
  (zones that change jump/fall or pull) and star-bombs; metamondo_reaction rewrite (she rewrites the sky inside it).
  Phase 3 la Profezia: shows the prophecy of your death and stages it — an ECHO of yourself repeats your movements of the
  last ten seconds and attacks you (record sim.player each tick; echo minion replays positions + swings as damaging hits).
  notte variant: the whole sky for her spells (more stars). "Se le stelle mentono, voglio vederlo." (verbatim). Defeat: the
  prophecy was incomplete — the seventh place in the sky was empty: your sky was not yet written; she explains the Rituale
  delle Due Metà (Cuore di Luce from Re Drago + Cuore d'Ombra from Regina Drago reunited on the Altare del Rovescio).
  brightens_sky; unlocks firmamento.
- idra (D15, lago_specchi): multi-headed serpent, violet and green scales, from the misty lake; heads attack in turn (bites,
  venom sprays); each head has its own Equilibrio: break it and deliver the Colpo di Grazia → it does not regrow; otherwise it
  returns in twenty seconds (parts with regrow: 20; the sim already handles grace → no regrow); Phase 2 heads go from five to
  nine. Guardian of the Sentiero della Terra toward Yggdrasil; asks whether the Portatore is ready to climb.
- grifone (D16, scogliere_cornice): half lion, half eagle, white-and-gold feathers, ochre fur, large as a house; narrow cliff:
  WIND pushes (sim.pushPlayer with telegraphed gusts), swoops, lion claws, glides through gusts; Phase 2 storm of sharp
  feathers; guardian of the Sentiero del Cielo; whoever defeats both keepers may climb.
- re_drago (principal, D17, chioma_yggdrasil): three-headed dragon, white body with many gold parts and a few azure touches,
  enormous luminous wings; heads Legge (gold), Memoria (white), Pietà (azure). Phase 1 heads in turn: golden light breath,
  azure roar that slows, white bite. Phase 2 flies around the World Tree; arena of suspended branches (variant), rains of
  light. Phase 3 gives up flight: full strength, gold waves and charges. Phase 4: Pietà stops and admits defeat → leaves the
  Cuore di Luce (grants cuore_di_luce; scripted end). "Sono ciò che resta quando si toglie il rimpianto." (verbatim); the
  Light and Order half of Ouranthos; points to the Yggdrasil root that descends to the Inferno. brightens_sky; unlocks
  cielo_aureo. His Legge/Pietà heads' looks must mirror Regina Drago's later (coordinate visual language).
Zones (palette act5_gold_white_midnight): plateaus of dragon bones, nests carved in rock, a mage's observatory, the Lago dei
Nove Specchi, wind-battered cliffs, Yggdrasil whose crown sits above the clouds; Yggdrasil visible on the horizon from the
first zone of the act. 2–3 Reperti per zone.
