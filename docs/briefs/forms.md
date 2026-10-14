# Stream: METAMONDO FORMS (Vite port 5179)

Owns: src/content/forms/**, data/forms/**, locales/{it,en}/forms.yaml, tests/forms*.test.ts, docs/FORMS.md.
Also read: Bible C6 (Metamondo, seven Forms, boss reactions, last fight), src/sim/metamondo.ts (meter, activation, abilities,
reactions), src/sim/sim.ts (enterMetamondoSpace / exitMetamondoSpace: a circular arena around the fighters), player.ts
(flying for Ali di Luce, formScale for Statura), data/forms/forms.yaml, src/render/types.ts (FormEnvironmentBuilder),
src/generated/registry.render.ts (FORM_ENVIRONMENTS), docs/RENDER_KIT.md and docs/WORLD_KIT.md when READY.

Deliverables:
1. src/content/forms/<formId>/environment.ts for all 7 Forms (default export FormEnvironmentBuilder): a small suspended
   diorama-world like a glass sphere containing a different sky, cheap to render, replacing the arena while sim.meta.active:
   Prato Lunare (night meadow, glowing flowers, large moon), Specchio (hall of ice mirrors), Gigante (garden at colossal
   scale), Firmamento (night sky of constellations), Cielo Aureo (golden clouds above Yggdrasil's foliage), Abisso Rosso
   (cathedral of embers), Rovescio (upside-down world where you can also walk on the ceiling). Plus the special story-only
   environment 'settimo_mondo' (the Seventh World opening in the final fight: dawn light sweeping the mist) and
   'cielo_riscritto' (Reina rewrites the sky inside the Metamondo). Each fits the circle radius of sim.zone.metaSpace.
2. Wire the environments into the presentation: if the world renderer does not yet swap environments on metamondoStart/End,
   file a precise request in docs/requests/forms.md (WorldRenderer is the world stream's) and provide an exported helper the
   world stream can call.
3. Ability readability visuals where content-side: constellation weak-point highlights (Firmamento), golden shockwave
   trails (Cielo Aureo) etc. coordinate via docs/requests if they belong to the render kit.
4. Verify every Form's balance in the sim (tests/forms.test.ts): Respiro Libero unlimited Fiato, Riflessi clones at half
   damage and boss targeting clones, Statura ×3 scale + area + poise, Tempo Stellare boss at 60%, Ali di Luce flight,
   Patto di Sangue +100% and 2%/s drain never below 1, Inversione reflection on dodge; +50% damage, Eco ×2, no boss heal/
   summon; 30 s duration; meter rules. Report sim bugs in docs/requests/forms.md with diffs.
5. Strings (form names/descs already in locales/*/canon_names.yaml — add only new keys in forms.yaml), docs/FORMS.md.
Screenshots of each environment in a fight (debug: __game.sim.unlockForm(id); __game.sim.setForm(id); __game.sim.meta.meter=100;
then press V or call __game.sim.meta.tryActivate(__game.sim)).
