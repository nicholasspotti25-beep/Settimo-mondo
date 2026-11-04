# Work log — weapons (Vite port 5178)

Brief: docs/briefs/weapons.md. Owns src/sim/arts.ts, data/movesets/**, data/weapons/**, data/transitions/**,
data/projectiles/weapons.yaml, src/render/weapons/**, locales/{it,en}/weapons.yaml, tests/weapons*.test.ts, docs/WEAPONS.md.

## Status

| # | Deliverable | Status | Files |
| --- | --- | --- | --- |
| 1 | Movesets for all 38 types (light/heavy/run/jump keys, arc + anim, stamina, parry flags, ranged/catalyst/flexible specials) | done (data; validated by build-data, checked again by tests/weapons.test.ts) | data/movesets/*.yaml (38) |
| 2 | 38 weapon files (canon ids/types/categories, source_boss/D, model params, two Arts with exact names, poise_bonus) | done (data) | data/weapons/*.yaml (38) |
| 3 | 49 Transizioni (all ordered category pairs, names IT+EN) | done (data) | data/transitions/from_*.yaml (7 x 7) |
| 4 | src/sim/arts.ts: all 24 effects for all 78 Arts, deterministic, allocation-free | partial — all effects implemented; Act I weapons (starter + 6) verified by tests/weapons.test.ts in chunk 1; the remaining 31 weapons' Arts are not yet verified one by one | src/sim/arts.ts |
| 5 | Balance: roles distinct, DPS sanity table in docs/WEAPONS.md | missing (docs/WEAPONS.md does not exist) | docs/WEAPONS.md |
| 6 | Locales: desc for all, flavor for secondary/principal bosses' weapons (no flavor for the 7 mini-boss weapons), Art names + descs | done (320 lines IT + EN, build-data ok) | locales/{it,en}/weapons.yaml |
| 7 | src/render/weapons: buildWeapon (one template per type, 38 unique looks, <= ~3k tris, trail colors), installWeaponFx (swing trails, 78 Art VFX, Transizione flashes, pooled) | partial — dedicated templates + Art VFX for the 7 Act I weapons (14 Arts); the other 31 types use category templates (fallback.ts); swing trails, pooled slash arcs, root tendrils, Transizione flash (generic), snake-sword extension morph done | src/render/weapons/{index,types,forge,act1,fallback,fx}.ts |
| 8 | tests/weapons.test.ts (38 weapons + movesets valid, canon types, parry flags, damage formula, 49 transitions, every Art observable headless) | partial — all data checks + visuals for all 38; "Art observable" covers the 14 Act I Arts | tests/weapons.test.ts |

## Next

1. buildWeapon templates for Act II weapons in story order (triplice_guinzaglio catene, brace_eterna spadone,
   tuono_spezzacielo martello_da_guerra, brina_silente stocco, fenditura_ardente ascia_a_due_mani) + their Art VFX.
2. Act III–VII weapon templates (remaining 26 types) + Art VFX for the remaining Arts; Transizione flashes per category pair.
3. Weapon morphs driven from sim state (snake-sword extension, shape-shifter forms, shears splitting, thrown chakram /
   harpoon leaving the hand, bow string draw).
4. tests/weapons.test.ts: extend "every Art observable" from Act I to all 78 Arts.
5. docs/WEAPONS.md: damage model, DPS sanity table (bot or analytic), roles.
6. Weapon gallery screenshot (all 38 side by side) to check uniqueness.

## Notes

- Chunk 1 (2026-11-04): inspected partial work; data/locales build clean (`SM_PARTIAL=1 npm run data` ok, 38 weapons,
  38 movesets, 49 transitions). render/weapons was a stub.
