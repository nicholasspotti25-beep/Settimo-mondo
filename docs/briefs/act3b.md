# Stream: ACT III-B content — encounters 17–22 + zones (Vite port 5185)

Follow docs/CONTENT_BRIEF.md and docs/BOSS_AUTHORING.md.
Owns: data/bosses/{grande_lupo,grande_orso,sciamano,grande_aquila_reale,drago_di_fuoco,kraken}.yaml, data/arenas/{taiga_radura,
taiga_tronchi,taiga_tamburi,fiume_nave_ponte,porto_moli,mare_nave_ponte}.yaml, data/zones/{taiga,grande_fiume,porto_fiume,mare}
.yaml + their altars, src/content/bosses/<your ids>/**, src/content/zones/<your zones>/**, data/story/act3b/**,
data/speakers/act3b.yaml, data/voce/act3b.yaml, data/reperti/act3b.yaml, data/projectiles/act3b.yaml, data/hazards/act3b.yaml,
locales/{it,en}/act3b_*.yaml, tools/bot/hooks/<your ids>.ts, tests/act3b*.test.ts, docs/requests/act3b.md.

Cards:
- grande_lupo (D11, taiga_radura): gray-silver wolf tall as a house, amber eyes, cloud of snow; very fast leaps and bites, a
  howl that calls snowstorms; Phase 2 splits into a spirit that attacks alongside him (minion); one of the Tre Spiriti della
  Taiga, guide and keeper; tests whether you are Chaos — discovering you are not is his answer.
- grande_orso (D12, taiga_tronchi): huge brown bear, moss in the fur, collar of bones, ancient scars; slams, hugs (grab),
  head-down charges, slow but devastating; Phase 2 stands up and shakes the forest: trees fall on the arena (telegraphed);
  second spirit, protector of the woods; fights to know whether you can protect something.
- sciamano (D12, taiga_tamburi): old hooded man, deer mask, furs and bones, drum and totem staff; ranged caster: wolf, bear and
  raven spirits as projectiles; a drum whose rhythm changes the attack pattern (behavior selects pattern sets by beat);
  Phase 2 fuses with the raven and flies above the arena; binder of the three spirits; "Il fiume sa dov'è il mare. Il mare
  sa dov'è il giardino." (verbatim) — points to the Grande Fiume and the Nave dei Cercatori.
- grande_aquila_reale (D12, fiume_nave_ponte): golden eagle with a wingspan as wide as the ship, eyes like two small suns; on
  the narrow rocking deck between mast and sails; dives; the onboard BALLISTA is a contextual action
  (sim.addFightInteractable + behavior onInteract → big bolt that hits the eagle in flight; give the player a clear window);
  Phase 2 grabs the ship and lifts it above the water (arena variant + visuals); guardian of the river's skies, mistakes the
  ship for an invasion.
- drago_di_fuoco (MINI, D12, porto_moli — no dialogue/lore): rust-red dragon, membrane wings, smoke from the nostrils; attacks
  from above, cone fire breath, glides and claws; Phase 2 sets the docks on fire (arena hazards from p2). The port stop
  between the two ships: supplies, an altar, time to breathe — then the dragon breaks the calm.
- kraken (MINI, D13, mare_nave_ponte — no dialogue/lore): colossal octopus rising from the night sea, an enormous eye above the
  waves; tentacles sweep the deck and must be broken one by one (breakable lockable parts); the eye is the weak point;
  Phase 2 whirlpool, the ship spins on itself (rotating push via sim.pushPlayer / camera).
Zones (palette act3_white_azure): endless taiga (three clearings), first ship on the Grande Fiume (deck zone, no fast travel),
river port, second ship crossing the night sea toward a new continent. 2–3 Reperti per walkable zone (the Nave dei Cercatori
carries seekers' relics).
