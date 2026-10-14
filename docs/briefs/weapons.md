# Stream: WEAPONS (Vite port 5178)

Owns: src/sim/arts.ts, data/movesets/**, data/weapons/**, data/transitions/**, data/projectiles/weapons.yaml,
src/render/weapons/**, locales/{it,en}/weapons.yaml, tests/weapons*.test.ts, docs/WEAPONS.md.
Also read: Bible C4, C5, C10 (each weapon, look, two Arts), DECISIONS.md (starter Arts; Transizione categories),
src/core/types.ts (WeaponDef, MovesetDef, SwingDef, ArtDef, ArtEffect, TransitionDef, ProjectileKindDef, WEAPON_TYPES,
PARRY_TYPES), src/core/formulas.ts (18 + 4×D), src/sim/player.ts, arts.ts, sim.ts (playerMeleeHits, firePlayerProjectile,
firePlayerArtProjectile, spawnPlayer*, chainLightning, dispelIllusions), shapes.ts, data/balance.yaml, tools/schemas.ts,
tools/bot/bot.ts, src/render/weapons/index.ts (contract), src/render/fx/FxRenderer.ts (registerHandler/spawn),
locales/*/canon_names.yaml (weapon NAMES exist there — do not duplicate keys).

Deliverables:
1. data/movesets/<type>.yaml for ALL 38 types (swing keys <type>_light/_heavy/_run/_jump so Metamorfosi's shape-shift lookup
   works): distinct timing, reach, shapes, lunges, multi-hits; ranged (bow arrows with gravity, crossbow bolts, harpoon thrown &
   recalled, chakram returning disc), catalysts (staff, tome, totem, astrolabe, scepter), flexible (snake-sword extends,
   chains, whip, flail, shape-shifter whose 4-step light combo cycles sword→whip→axe→spear), fast fists/claws, shield (bash,
   absorption 1.0, parry), dual weapons, shears separating into two short swords. Every SwingDef has `arc` + `anim`. Stamina
   light 12–18, heavy 25–35. Parry-capable EXACTLY: scudo, spada_lunga, spada_bastarda, stocco, katana, scimitarra.
2. data/weapons/<id>.yaml for ALL 38 weapons (ids/types/categories per DECISIONS.md + tools/canon/bible.ts; source_boss = the
   canonical boss id even if its data file does not exist yet; source_difficulty = canonical D; scettro_del_primo_respiro
   delivered_by: cthulhu; lama_dell_abisso_sognante ng_plus_only: true). Unique model params from each boss's look + act
   palette. Two Arts each with EXACT Bible names (art.<id>.name) mapped to ArtEffect + params (poise_bonus for Arts that
   break Equilibrio: Abbattimento, Potatura, Punta di Cristallo). Starter: Primo Passo / Ninnananna dell'Alba.
3. data/transitions/*.yaml: all 49 ordered category pairs, each a distinct short linking move, names IT+EN.
4. src/sim/arts.ts: every effect correct and juicy for all 78 Arts; deterministic; no allocation storms.
5. Balance: roles distinct (fast, heavy, ranged, defensive, magic), no best weapon; DPS sanity table in docs/WEAPONS.md.
6. Strings in locales/*/weapons.yaml: desc (functional) for all; flavor 1–2 lines for secondary/principal bosses' weapons in
   the Bible's voice; mini-boss weapons (Zanna Strisciante, Balestra del Drago Ardente, Arpione Abissale, Naginata
   Cristallina, Tridente delle Tre Punte, Chakram del Vuoto, Trivella Divorante) NO flavor; art names + descs.
7. src/render/weapons/: buildWeapon(def, ctx) per WeaponVisual contract, one procedural template per type, 38 unique looks
   matching the Bible (e.g. Lancia del Custode white shaft + leaf head engraved with a crown; Brace Eterna wavy blade with
   incandescent core; Astrolabio three orbiting rings; Stella del Mattino golden spiked ball on black chain; Falce
   dell'Eclissi black scythe, violet blade, red veins); ≤ ~3k tris each; trail colors; installWeaponFx(fx): unique Art VFX for
   all 78 Arts (ArtDef.vfx ids) via fx.registerHandler on 'art','artHit','transizione','swing','projectile' + fx.spawn;
   Transizione flashes; pooled.
8. tests/weapons.test.ts: 38 weapons + movesets valid, canon types, parry flags, damage formula, 49 transitions, every Art
   runs headless with an observable effect (startFightDirect('guardiano_del_regno'), giveWeapon + setLoadout).
Optional: a weapon gallery screenshot to check uniqueness.
