# Glossary (IT → EN) and shared ids

Use these exact translations in English strings.

| Italiano | English |
|---|---|
| Settimo Mondo | Seventh World |
| Mondo Spezzato | Shattered World |
| Lungo Crepuscolo | Long Twilight |
| Portatore | Bearer |
| Senz'Ombra | Shadowless |
| Voce dell'Alba | Dawn Voice |
| Salute | Health |
| Fiato | Stamina |
| Eco | Echo |
| Equilibrio | Balance |
| Spezzato | Broken |
| Colpo di Grazia | Coup de Grâce |
| Colpo Rosso / Colpi Rossi | Red Strike / Red Strikes |
| Lacrime d'Alba | Tears of Dawn |
| Altare della Quiete | Altar of Stillness |
| Meditare | Meditate |
| Alba / Giorno / Tramonto / Notte | Dawn / Day / Sunset / Night |
| Metamondo | Metaworld |
| Forma / Forme | Form / Forms |
| Armeria | Armory |
| Arte Prima / Arte Seconda / Arti | First Art / Second Art / Arts |
| Transizione | Transition |
| Reperti dei Cercatori | Seekers' Relics |
| Cercatore / Cercatori | Seeker / Seekers |
| Nebbia dell'Alba | Dawn Mist |
| Specchio dei Ricordi | Mirror of Memories |
| Ciclo dell'Alba | Cycle of Dawn (New Game+) |
| Affronta / Implora | Fight / Beg |
| Ascesa | Ascension |
| Rituale delle Due Metà | Ritual of the Two Halves |
| Cuore di Luce / Cuore d'Ombra | Heart of Light / Heart of Shadow |
| Altare del Rovescio | Altar of the Reverse |
| Porta Rovesciata | Overturned Gate |
| Scala dei Dannati | Stair of the Damned |
| Luogo dell'Alba | Place of Dawn |

Proper names of characters keep their Bible spelling in Italian; in English use: Caronte → Charon, Cerbero → Cerberus,
Lucifero → Lucifer, Idra → Hydra, Grifone → Griffin (see `locales/en/canon_names.yaml`). Pyro, Thunder, Ice, Loki, Uruk,
Reina, Ouranthos, Cthulhu, Yggdrasil, Kraken, Yeti stay as they are.

## Shared ids

- Key items (`sim.giveItem`, `state.items`): `lanterna_del_cavaliere` (from Cavaliere Errante; lit at every altar afterwards),
  `cicatrice_del_rifiuto` (Lucifero I, Affronta), `piuma_nera` (Lucifero I, Implora), `cuore_di_luce` (Re Drago),
  `cuore_di_ombra` (Regina Drago).
- Flags: `lucifero_choice` = `fought` | `begged` (stored in `state.luciferoChoice`).
- Music cue ids: boss themes `boss_<bossId>` with phase layers `boss_<bossId>_p<N>`; sequences use `risveglio`, `alba`,
  `titoli`; zone ambiences use `zone.ambience`; altars use `altar`.
- Camera shot ids (sequences `camera:` steps): built-ins `boss_reveal`, `boss_close`, `player_close`, `wide`, `vista`,
  `castle_wake`; ending shots `ending_clouds`, `ending_sunrise`, `ending_shadow`, `ending_feather`, `ending_lantern`,
  `ending_cave`, `ending_wide` (registered by the Act VII stream). Register more with `renderer.rig.registerShot(id, fn)`.
