# GAME BIBLE (CANON) — Settimo Mondo

This is PART C of the design brief, verbatim. It is canon: follow it exactly (every boss, weapon, Art, Form, line of lore,
rule and number). Change the technique, never the content. Record any interpretation in `DECISIONS.md`.

## C1. Identity

- **Title:** Settimo Mondo.
- **Genre:** boss-based action RPG, third person, in the spirit of Elden Ring.
- **Structure:** one continuous, contemplative world divided into **seven acts**. The order of encounters is **fixed**.
- **Platform:** mobile. iOS and Android phones and tablets, landscape, touch-first (external gamepad optional), running entirely on the device and fully offline. Not built with Godot, Unity or Unreal (see PART D).
- **Encounters:** **38** (37 distinct bosses; Lucifero is fought twice).
- **Progression:** no levels. Power comes only from weapons dropped by bosses and from player skill.
- **Estimated length:** 35 to 45 hours on a first playthrough.
- **Tone:** marvelous, mysterious, melancholic, with a luminous ending. The map must look stunning, mysterious, unknown but wonderful, like Elden Ring: it leaves you open-mouthed.

## C2. Design pillars

1. **Only bosses.** No filler: every fight is an event with its own arena, music and story.
2. **The character does not grow, the player does.** No levels, no stat upgrades. You beat harder bosses by learning and choosing weapons well.
3. **A world to contemplate.** Travel between bosses is for breathing, looking, understanding. There are no common enemies on the way.
4. **A defined story.** The fixed order means difficulty follows the narrative curve, not chance.
5. **Weapons are identity.** Each boss leaves a unique weapon with unique look and special attacks.
6. **Every fight says something.** Even a mini boss without lore has a memorable arena and style.

## C3. The player character and systems

**Who you are.** You wake with no memories in the Castello della Culla. You are the **Portatore** ('the Bearer'): inside your chest is the seed of the Seventh World, which in gameplay is the Metamondo ability. Name and appearance are chosen with a simple creator; there are no classes. NPCs call you **Senz'Ombra** ('Shadowless'): in the Lungo Crepuscolo your body casts no shadow, until the very last scene. Technical hint: the player model casts no shadow in all scenes until the ending cutscene.

**No numeric growth.** Health, Fiato and Eco are fixed from start to end. No levels, no XP from monsters, missions or even bosses. The player becomes able to beat stronger bosses in only two ways: weapons from bosses, and the player's own skill.

**Resources**
- **Salute (Health):** your life.
- **Fiato (Stamina):** consumed by attacks, dodges, guard.
- **Eco:** three segments, filled by good play and spent on weapon Arts.

**Inventory: three weapons.** Three slots, each accepting any weapon type (e.g., a sword, a bow and a magic staff, or three greatswords). All obtained weapons are stored in the **Armeria**; the three equipped slots can be changed only at an Altare della Quiete. During a fight you swap weapons instantly. You start with a basic weapon, the **Lama della Culla** (plain short sword found in the castle), so the first fight is possible; it stays in the Armeria afterwards. So the Armeria can hold 37 boss weapons plus this starter.

**Le Lacrime d'Alba (the elixirs).** You have **three** elixirs, glass vials containing a drop of light. Each **fully heals Health**. They refill when you **die** or when you **meditate**. Drinking takes about 1.2 seconds during which you are vulnerable.

**Meditation.** You can meditate only at **Altari della Quiete** (Altars of Stillness), placed at resting points: always before each arena and at some panoramic viewpoints. When you meditate:
- you choose the **time of day**: Alba (dawn), Giorno (day), Tramonto (sunset), Notte (night). It changes light, colors and atmosphere of the whole zone. In-world the sky is always the Lungo Crepuscolo (violet and gold, sunless); the four presets modulate it: Alba = pale gold-violet, Giorno = bright sunless violet-gold, Tramonto = deep amber-red, Notte = dark violet with stars or aurora. The sun itself never appears until the ending;
- you recover **all Health** and **all Lacrime d'Alba**;
- you may change the three equipped weapons and the equipped Metamondo Form.

The chosen time of day does not make a boss stronger, but it can change behavior. Examples: at dawn the Cavaliere Errante opens with a chivalrous salute and duels fairly, at night he charges from the dark; Caronte at night summons many slow souls, by day few but fast; Reina at night has the whole sky to use for her spells. Each boss may define a small behavior variation per time of day in data.

**Death.** If you die you wake at your last altar with full Health and refilled Lacrime; the boss resets. No loss of items. The only cost is the attempt. Arenas are entered through a luminous mist gate (the 'Nebbia dell'Alba'); once inside you cannot leave until the boss is defeated or you die. Each arena has an Altare just before the gate.

**Exploration rewards.** There is no loot. Optional **Reperti dei Cercatori** (lanterns, letters, armor remains) tell the story of previous seekers; they have no gameplay effect. Panoramic vistas are the main exploration reward.

## C4. Combat

Third-person camera with target lock and a reasoned pace: every boss attack is readable and punishes impatience.

- **Basic actions:** light attack, heavy attack, sprint, jump, guard, dodge.
- **Dodge:** a roll with brief invulnerability. A dodge made at the last instant is a **perfect dodge**.
- **Guard and parry:** some weapons (shield, swords, rapier, katana) allow a **perfect parry**, which unbalances the boss.
- **Boss Equilibrio (poise):** under every boss health bar there is an Equilibrio bar. It fills with heavy hits, perfect parries and Arts. When it breaks the boss is **Spezzato** for 6 seconds and you can deliver the **Colpo di Grazia**, a cinematic attack with triple damage.
- **Eco:** three segments. Landed hits fill it slowly; perfect dodge and perfect parry fill it much more.
- **Weapon Arts:** every weapon has two Arts. **Arte Prima** costs one Eco segment, **Arte Seconda** costs two. They are the weapon's signature special attacks.
- **Weapon swap and Transizioni:** you swap weapons on the fly with a short **Transizione** animation, a linking attack unique to each pair of weapon types (e.g., sword to bow: thrust and point-blank shot). It rewards carefully built trios.
- **Colpi Rossi:** boss attacks that flash red cannot be parried: they must be dodged.
- **Phases:** bosses have 2 phases, principal bosses 3 or 4. Each phase changes moves, music and sometimes arena.
- **Only you and the boss:** no summoning of allies or spirits for the player. The single narrative exception is the final fight, where the Dragon God fights beside you.
- **Touch controls (canonical layout; every position, size and opacity is customizable in settings):**
  - **Move:** a floating virtual stick on the left half of the screen, appearing where the thumb lands. Pushing it to the outer ring sprints.
  - **Camera:** dragging a free area on the right half orbits the camera. While locked on, the camera frames player and boss automatically; a short flick on the right half switches the lock target (needed for multi-part bosses).
  - **Right-thumb cluster:** a large **Light attack** button; a **Heavy attack** button beside it; **Dodge**; **Guard** (hold to block; a tap timed just before impact is the perfect parry for parry-capable weapons); **Jump**. Dodge direction follows the stick; with no direction it is a backstep.
  - **Arts:** two buttons, **Arte Prima** and **Arte Seconda**, placed next to the attack cluster. They light up only when enough Eco is available.
  - **Weapon trio:** three small slot buttons at the screen edge. Tap a slot to swap instantly; a swap within 0.5 s after a landed hit triggers the Transizione.
  - **Lacrime d'Alba:** one vial button showing the remaining count. **Metamondo:** tap the ring around the Eco indicator when it is full.
  - **Lock-on:** a lock button, or double-tap on the boss.
  - **Fairness on touch:** input buffer 0.20 s by default; latency compensation extends the perfect dodge and parry windows by up to +0.04 s (the canonical windows below do not change); aim assist for ranged weapons toward the locked target; haptic feedback for hit, parry, perfect dodge, Colpo Rosso warning and Colpo di Grazia; the game pauses automatically when the app goes to the background; optional external gamepad.

**Tuning defaults** (all values live in one balance file; tune in playtests):
- Walk 2.0 m/s, run 5.0, sprint 7.5. Jump about 1.1 m. Climbing only on marked surfaces.
- Health 100 (shown as a bar). Fiato 100, regenerates 30 per second after 0.7 s without spending. Costs: light attack 12–18, heavy 25–35, dodge 18, sprint 8 per second, blocking costs half the damage absorbed.
- Eco 0–300 (three segments of 100). Gains: light hit +6, heavy hit +10, perfect dodge +40, perfect parry +80. Arte Prima costs 100, Arte Seconda 200.
- Dodge lasts 0.40 s, invulnerability from 0.05 to 0.30 s. Perfect dodge: dodge begins within 0.12 s before the hit would land; it gives +40 Eco, +3% Metamondo charge and a 0.15 s slow-motion.
- Perfect parry window 0.15 s. Parry-capable types: scudo, spada lunga, spada bastarda, stocco, katana, scimitarra.
- Lacrime d'Alba drink time 1.2 s (cancelable in the first 0.4 s), heals 100%.
- Weapon swap 0.35 s; a Transizione attack triggers if swap is pressed within 0.5 s after a landed hit.
- Equilibrio bar 100–300 depending on boss. It decays 8 per second after 4 s without hits. Heavy hit +20, perfect parry +35, Arte Prima +25, Arte Seconda +45. Spezzato lasts 6 s. Colpo di Grazia deals 3x weapon damage and a 2.5 s animation during which the player is invulnerable.
- **Weapon damage** = 18 + 4 x D, where D is the difficulty (1–20) of the boss that dropped it. Weapons never upgrade.
- **Boss time-to-kill target** for a competent player with a suitable weapon and no deaths: 120 s + 20 s x D. Set boss Health from that and the weapon's reference damage per second.
- **Boss damage:** a typical hit removes (10% + 1.2% x D) of player Health; heavy hits up to double. At D = 20 three typical hits can kill.

## C5. Weapons

Every boss, except Lucifero in his first encounter, leaves a weapon: **37 boss weapons**, each of a different type, so there are 37 ways to fight. Every weapon has:
- a **type** (sword, bow, magic staff, greatsword, axe, katana and so on);
- a **unique appearance** tied to the boss who dropped it;
- its own **moveset** (light, heavy, running, jumping attacks);
- **two Arts** (Arte Prima, Arte Seconda).

Weapons **do not upgrade**: a weapon's power is fixed and follows the difficulty of the boss who drops it, so each weapon is meant for the fights that follow. There is no best weapon: each has a role (fast, heavy, ranged, defensive, magic), and picking the right three for each boss is part of the challenge. Weapons dropped by **mini bosses have only a functional description, no lore text**. Any combination of types can be equipped. The 37 types are: lancia, spada lunga, bastone magico, mazza, spada serpentina, alabarda, catene, spadone, martello da guerra, stocco, ascia a due mani, pugni, artigli, scudo, tomo, katana, asce gemelle, totem, arco lungo, balestra, arpione, kama gemelle, lama a tenaglia, pugnali, cesoie, naginata, tridente, astrolabio, frusta, scimitarra, spada bastarda, flagello, chakram, trivella, falce, scettro, arma mutaforma. The full list with Arts is in the boss cards (C10).

## C6. The Metamondo (the unique ability)

The Metamondo is the player's special ability: the seed of the Seventh World carried in the chest.

**How it works**
1. A circular **recharge bar** around the Eco indicator fills with time (about 2.5 minutes from empty) and faster with perfect dodges (+3% each). At the start of every fight it begins at 50%.
2. When the bar is full you can activate it.
3. You and the boss are **pulled inside the Metamondo**: a small suspended diorama-world, like a glass sphere containing a different sky. The **environment changes completely** according to the equipped Form.
4. For **30 seconds** your attacks are stronger (+50% damage), Eco refills at double speed, and the boss cannot heal or summon reinforcements. On top of that, the **Form's special ability** is active.
5. When time runs out you return to the arena and the bar restarts from zero.

**The seven Forms.** The Metamondo exists in several types. You start with the first and obtain a new one by defeating six principal bosses, in story order. You equip one at a time at altars.

1. **Prato Lunare** (starting): a night meadow with glowing flowers and a large moon. *Respiro Libero:* unlimited Fiato for the whole duration.
2. **Specchio** (from Loki): a hall of ice mirrors. *Riflessi:* two copies of you attack beside you with half damage, and the boss mistakes them for you.
3. **Gigante** (from Uruk): a garden at colossal scale. *Statura:* you grow up to three times your size; heavy hits have huge area and break Equilibrio faster, but you move more slowly.
4. **Firmamento** (from Reina): a night sky of constellations. *Tempo Stellare:* the boss moves at 60% speed and constellations highlight its weak points.
5. **Cielo Aureo** (from Re Drago): golden clouds above the foliage of Yggdrasil. *Ali di Luce:* you fly freely for the whole duration, with aerial attacks and golden shockwaves.
6. **Abisso Rosso** (from Lucifero): a cathedral of embers. *Patto di Sangue:* damage dealt doubles (+100% instead of +50%), but you lose 2% Health per second (never below 1 point).
7. **Rovescio** (from Regina Drago): an upside-down world where you can also walk on the ceiling. *Inversione:* every successful dodge sends part of the avoided attack back at the boss.

**In the last fight** you do not activate the Metamondo: it awakens on its own, in the form written by the story.

**Boss reactions.** Some principal bosses react to the Metamondo: Lucifero, in the first encounter, shatters it with one finger; Reina rewrites the sky inside it; Cthulhu devours it and spits it out. Against all others it works normally.

## C7. Mini bosses, secondary bosses, principal bosses

Class indicates **role in the story**, not strength.

- **Mini bosses (7):** have no connection to story or lore. They serve pacing: they break up the journey with a memorable fight. They have an arena and a weapon, but **no dialogue and no lore text**. Great Devourer, Drago di Fuoco, Kraken, Drago di Ghiaccio, Drago a Tre Teste, Drago del Vuoto, Verme Mangiamondi.
- **Secondary bosses (22):** secondary role in story and lore. Each keeps a fragment of story (a line, an image, an object) and a passage of the world. Guardiano del Regno, Cavaliere Errante, Elder Tree, Mostro della Palude, Caronte, Cerbero, Pyro, Thunder, Ice, Mostro di Magma, Gigante di Fuoco, Yeti, Guardiano della Rocca di Brina, Grande Lupo, Grande Orso, Sciamano, Grande Aquila Reale, Re Mantide, Coleottero Imperiale, Regina Formica, Idra, Grifone.
- **Principal bosses (8):** central role. They speak, have cinematics, 3 or 4 phases and spectacular arenas. The first six grant a Metamondo Form. Lucifero, Loki, Uruk, Reina, Re Drago, Regina Drago, Dio dei Draghi, Cthulhu.

**Difficulty curve.** Because the story is fixed, difficulty follows **order**, not class. Every encounter has a value from 1 to 20 (shown in its card): a late mini boss can be harder than an early secondary boss. Peaks: Cerbero (7), the three knights (8–9), Loki (13), Uruk (15), Re Drago (17), Lucifero second encounter (18), Regina Drago and Dio dei Draghi (19), Cthulhu (20).

## C8. Story and lore

**Narrative delivery rules.** Story is told through pre-fight and mid-fight dialogue of principal bosses, one-to-two-line flavor text on the weapons of secondary bosses (mini-boss weapons have none), short lines from the **Voce dell'Alba** (the Dawn Voice, a bodiless voice from the Metamondo) when meditating at altars, Reperti dei Cercatori, and the environment. No long cutscenes outside principal bosses, the Rituale and the ending.

### The Lungo Crepuscolo
The sun no longer rises. For a time nobody remembers, the sky has stood still in a violet-and-gold twilight: beautiful and wrong. Trees grow crooked toward a light that does not come, the dead find no peace, and nobody, except perhaps the oldest beasts, remembers the last dawn.

### The Six Fallen Worlds
In the beginning there was only Chaos, a formless dream with an endless hunger. The **Dragon God, Ouranthos**, bent it and with six breaths blew six worlds: that of the **Mortals**, of the **Damned**, of **Frost**, of the **Minor Gods**, of the **Dragons**, and the **Rovescio** (the Reverse), where everything is inverted. One after another Chaos devoured them. What remains was stitched into a single wounded, wondrous world, the **Mondo Spezzato** (the Shattered World), where hell, ice and the dragon realm lie a few days' walk apart. Each fragment is separated from the next by **guardians**: custodians placed by Ouranthos or creatures bent by the Twilight.

### The Seventh
Ouranthos, exhausted, attempted a last breath, the seventh. But Chaos was too close: instead of blowing the world into the void, the god enclosed it in a seed, and the seed in a mortal. That mortal is the player. The Seventh World does not exist yet: it exists only in the chest, as the Metamondo. To make it be born, the Portatore must reach the **Luogo dell'Alba** (the Place of Dawn), the only spot from which a new sun can rise. A call like a heartbeat points the way; the **Voce dell'Alba** whispers fragments of truth between altars.

### Chaos
Chaos has a face: **Cthulhu, Dio Maggiore del Caos**. The six worlds were his dream before they were creation, and when he wakes, what he dreamed ends. He has sensed that a seventh seed is about to hatch and comes to devour it.

### Central characters
- **Lucifero, the Fallen Archangel.** The first to say no to Ouranthos, cast out of heaven. He rules the Inferno like a tired king. At the first encounter he lets you choose: fight him (and lose) or beg. He spares you because he recognized the seed. At the second encounter he blocks your way to learn whether your yes is worth as much as his no; he keeps the **Porta Rovesciata** toward the Rovescio.
- **Loki.** The Trickster of the Rocca di Brina. Mixes truth and lies: tells you the Seventh World is a prison and that Ouranthos is dead. He was wrong on one thing and right on the other. After defeat he laughs and vanishes; his laugh returns in the ending.
- **Uruk, Minor God of Little Garden.** An eternal gardener obsessed with order who shrinks intruders to keep them like flowers. Defeating him transfers his divinity: the **Ascesa**.
- **Reina, the Ancestral Mage.** The first to read the stars, which foretold the Portatore and his end at her hands. She fights to defy the prophecy. After defeat she reveals the **Rituale delle Due Metà** (Ritual of the Two Halves).
- **Re Drago and Regina Drago.** The two halves of Ouranthos, separated when the god split himself to avoid dying. He is **Light and Order**, white and gold with few touches of azure, and watches over Yggdrasil. She is **Shadow and Memory**, black with violet and red details in equal amounts, and governs the Rovescio, remembering the six dead worlds. Both, once defeated, give up their heart.
- **The Dragon God (Ouranthos).** Summoned by the ritual with the two hearts reunited. First he tests you, then fights beside you against Cthulhu.

### Recurring motifs
- **The Shadow:** you have none; you receive it at the end.
- **The Seekers (Cercatori):** many tried before you; lanterns, letters and armor scattered in the world tell of failures and hopes. The Cavaliere Errante and the Mostro della Palude are seekers.
- **The brightening sky:** every principal boss defeated brightens the Twilight by one shade, from violet toward gold.
- **The black feather:** Lucifero's, which turns white in the ending.

### The seven acts
1. **Il Risveglio** (The Awakening): from the castle to the Fiume delle Anime.
2. **La Discesa** (The Descent): the Inferno.
3. **Il Bianco Silenzio** (The White Silence): mountains, taiga, river and sea.
4. **Il Giardino del Dio** (The God's Garden): Little Garden.
5. **Il Regno dei Draghi** (The Dragon Realm): up to Yggdrasil.
6. **Il Rovescio:** return to the Inferno and the upside-down dimension.
7. **L'Alba** (The Dawn): the ritual, the collapse and the new world.

## C9. World and map

The Mondo Spezzato is one continuous map, with panoramic vistas that show what you will reach hours later. The route is guided but explorable: hidden vistas, seeker ruins and viewpoints do not level you up, they make you understand and gasp. Traversal: on foot (sprint, jump, climb on marked walls) and by ship on the great river and the sea, with fast travel between visited altars (disabled during ship sections and the Collapse). There are no common enemies anywhere.

1. **Castello della Culla and Vetta dell'Attesa.** You are born in an empty castle, a shell of pale stone with huge corridors and arched windows filtering violet light. Stepping out you find yourself on a high mountain with a breathtaking view of the whole world you will cross: plains, dark forest, swamp, river and, far away, a red glow on the horizon. A boss blocks the descent. First altar here.
2. **Le Grandi Pianure** (the Great Plains): tall grass, wind, distant ruins.
3. **La Foresta Oscura** (the Dark Forest): enormous trees, light barely filtering through, fireflies.
4. **La Palude** (the Swamp): fog, rotting walkways, seeker lanterns.
5. **Il Fiume delle Anime** (River of Souls): a black, luminous river crossed by boat.
6. **Porta di Dite and the Inferno.** An immense arch of bones and iron set in rock. Beyond, five areas: **Landa dei Roghi** (embers plain, fire columns, red sky), **Bufera Eterna** (black storm, horizontal lightning), **Cocito** (blue frozen lake, shadows trapped below), **Fucine Sepolte** (magma caves and anvils), **Cattedrale Caduta** (sunken black-marble temple). The three knights hold the three **seals** of the Cathedral; defeating them opens Lucifero's door. Exit via the **Scala dei Dannati** (Stair of the Damned).
7. **Le Montagne Nevate / Corona Bianca:** white ridges under the gold-violet sky, auroras at night, from the **Bocca del Vulcano** (volcano mouth) to the **Rocca di Brina**, the ice castle.
8. **La Taiga and the Grande Fiume:** an endless forest, then navigation on a first ship, a stop at a river port, a second ship.
9. **Il Mare:** night crossing toward a new continent.
10. **Little Garden.** Everything is enormous and you are tiny. Upon touching the shore the **Sguardo del Giardiniere** shrinks you and you are trapped in the garden of a god, closed by an endless hedge. Colors are vivid, pollen glows in the air. The exit is the central greenhouse, protected by three gates, each guarded by a courtier. **Scale rules:** the player is scaled to 10% (movement speed reduced only to 60%, camera adapted). After Uruk's defeat the player returns to normal scale and ends up at **112%** of the original size: taller than mortals. Little Garden is then revealed to be a flowerbed in a normal-sized park.
11. **Il Regno dei Draghi:** plateaus covered in dragon bones, nests carved in rock, a mage's observatory, the **Lago dei Nove Specchi**, wind-battered cliffs and finally **Yggdrasil**: the World Tree so tall its crown sits above the clouds and its roots descend to the Inferno. It connects the worlds.
12. **Return to the Inferno:** a hollow root descends from Yggdrasil's crown to the Cattedrale Caduta; the descent is a backward journey through everything you crossed. The sky is now less violet.
13. **Il Rovescio:** the dark upside-down dimension, behind the Porta Rovesciata. Gravity inverts. Includes Pianura Capovolta, Deserto di Cenere and the Palazzo Capovolto with the **Altare del Rovescio**.
14. **Terrazze Celesti, Collapse and Dawn:** a paradise above the clouds (white marble, hanging gardens, stairs of light), then space and time crumbling (fragments of every arena floating in the void, time moving in jumps), finally a new world above the sky: a sea of clouds and a beautiful sunrise. This is the end of the game.

## C10. Boss cards (fixed order)

**Quick reference:** number. name · class · weapon type · difficulty.

*Act I:* 1 Guardiano del Regno · secondary · lancia · 2. 2 Cavaliere Errante · secondary · spada lunga · 3. 3 Elder Tree · secondary · bastone magico · 4. 4 Mostro della Palude · secondary · mazza · 5. 5 Great Devourer · mini · spada serpentina · 6. 6 Caronte · secondary · alabarda · 6.

*Act II:* 7 Cerbero · secondary · catene · 7. 8 Pyro · secondary · spadone · 8. 9 Thunder · secondary · martello da guerra · 8. 10 Ice · secondary · stocco · 9. 11 Mostro di Magma · secondary · ascia a due mani · 9. 12 Lucifero (first encounter) · principal · no weapon · scripted.

*Act III:* 13 Gigante di Fuoco · secondary · pugni · 10. 14 Yeti · secondary · artigli · 10. 15 Guardiano della Rocca di Brina · secondary · scudo · 11. 16 Loki · principal · tomo · 13. 17 Grande Lupo · secondary · katana · 11. 18 Grande Orso · secondary · asce gemelle · 12. 19 Sciamano · secondary · totem · 12. 20 Grande Aquila Reale · secondary · arco lungo · 12. 21 Drago di Fuoco · mini · balestra · 12. 22 Kraken · mini · arpione · 13.

*Act IV:* 23 Re Mantide · secondary · kama gemelle · 13. 24 Coleottero Imperiale · secondary · lama a tenaglia · 14. 25 Regina Formica · secondary · pugnali · 14. 26 Uruk · principal · cesoie · 15.

*Act V:* 27 Drago di Ghiaccio · mini · naginata · 14. 28 Drago a Tre Teste · mini · tridente · 15. 29 Reina · principal · astrolabio · 16. 30 Idra · secondary · frusta · 15. 31 Grifone · secondary · scimitarra · 16. 32 Re Drago · principal · spada bastarda · 17.

*Act VI:* 33 Lucifero (second encounter) · principal · flagello · 18. 34 Drago del Vuoto · mini · chakram · 16. 35 Verme Mangiamondi · mini · trivella · 17. 36 Regina Drago · principal · falce · 19.

*Act VII:* 37 Dio dei Draghi (Ouranthos) · principal · scettro · 19. 38 Cthulhu · principal · arma mutaforma · 20.

### ACT I — IL RISVEGLIO

#### 1. Guardiano del Regno
*Secondary · Vetta dell'Attesa · Difficulty 2/20*
- **Look:** a knight in dull silver armor on a barded steed; the helm is shaped like a broken crown.
- **Fight:** the game's tutorial fight that does not feel like one. Charges along the plaza (lateral dodge), readable lance thrusts, one heavy overhead strike. Phase 2: the horse wraps in a spectral aura and speed increases. Teaches dodge, guard, Equilibrio.
- **Lore role:** has guarded the castle gate for centuries. Recognizes the seed's mark on your chest: 'Nessuno scende finché l'Alba non è pronta' (nobody descends until the Dawn is ready). First time the Voce dell'Alba speaks.
- **Weapon: Lancia del Custode** (cavalry lance): long white shaft, leaf-shaped head engraved with a crown. *Arte Prima, Carica del Custode:* forward dash with a long-reach thrust. *Arte Seconda, Ruota d'Argento:* 360-degree spin that pushes back nearby enemies.

#### 2. Cavaliere Errante
*Secondary · Le Grandi Pianure · Difficulty 3/20*
- **Look:** a knight in a worn cloak and patched armor on a gray horse; an unlit lantern hangs from the saddle.
- **Fight:** mounted duel in tall grass: circles you, attacks from the flank, dives at open guard. Phase 2: dismounts and duels on foot with the sword, parrying and riposting. Dawn: loyal clean duel with a salute. Night: charges from the dark.
- **Lore role:** the first **Cercatore** you meet; he rode his whole life chasing the dawn. Before falling: 'L'alba non si trova. Si porta' (the dawn is not found, it is carried). He leaves you the lantern, which from then on lights the start of every altar.
- **Weapon: Brando del Viandante** (longsword): slim blade engraved with all the roads walked. *Arte Prima, Fendente Itinerante:* sliding forward with a rising cut. *Arte Seconda, Postura del Viandante:* takes a guard; if hit during the animation it counterattacks automatically.

#### 3. Elder Tree
*Secondary · La Foresta Oscura · Difficulty 4/20*
- **Look:** a gigantic tree with a bark face in the trunk, branches like arms, black leaves, luminous mushrooms at the roots. Its shadow covers the whole forest.
- **Fight:** roots emerging from the ground (announced by cracks in the soil), whipping branches, pollen that blurs vision. Phase 2: the trunk opens to show a heart of light; heavy hits there break Equilibrio.
- **Lore role:** a seed of Yggdrasil grown without sun: its shadow darkened the forest. Dying, it lets through the first ray of light the world has seen in centuries.
- **Weapon: Ramo dell'Antico** (magic staff): living wood with leaves that change color. *Arte Prima, Radici Fameliche:* roots erupt and hold the target. *Arte Seconda, Fioritura:* fan-shaped burst of seeds.

#### 4. Mostro della Palude
*Secondary · La Palude · Difficulty 5/20*
- **Look:** a humanoid colossus of mud, reeds, bones and unlit lanterns; a thousand voices whisper inside it.
- **Fight:** emerges from the water: two-handed slams, mud waves that slow, arms stretching out of the mire. Phase 2: splits into three smaller figures that fight in sequence. The voices announce its attacks in advance: you must listen.
- **Lore role:** the heap of drowned Cercatori fused together: shows what happens to those who fail. Among the whispers is a clue: the ferryman does not want coins.
- **Weapon: Randello del Pantano** (mace): black wood and reeds with hanging lanterns. *Arte Prima, Colpo Melmoso:* area slam that slows. *Arte Seconda, Sprofondamento:* ground strike that opens a muddy pit.

#### 5. Great Devourer
*Mini boss · La Palude (deep waters) · Difficulty 6/20 · no dialogue, no lore*
- **Look:** a gigantic serpent, green and black scales, long as a river, appearing out of the fog.
- **Fight:** the arena is a rotten pier. It attacks from below (ripples in the water mark the spot), bites, coils around the stilts to crush. Phase 2: destroys the pier and the fight continues on rafts and logs.
- **Weapon: Zanna Strisciante** (snake-sword): segmented blade that extends like a whip. *Arte Prima, Sibilo:* forward dash with the blade extended. *Arte Seconda, Avvolgimento:* hooks the target and pulls it in.

#### 6. Caronte
*Secondary · Il Fiume delle Anime · Difficulty 6/20*
- **Look:** a tall thin figure with a hood on a black boat; the oar has a blade-paddle; the lantern holds the eyes of souls.
- **Fight:** on the boat then on a bridge of souls. The summoned souls fly at you as projectiles; their speed and number depend on time of day. The oar sweeps the bridge. Phase 2: the boat sinks and the duel continues on the luminous current.
- **Lore role:** wants no coin, wants a memory; but you have no memories and no shadow: 'Non hai ombra, Portatore. Né passato.' When defeated he ferries you to the Porta di Dite.
- **Weapon: Remo del Traghettatore** (halberd): long black oar with a paddle-blade. *Arte Prima, Richiamo delle Anime:* three spectral souls thrown forward as projectiles. *Arte Seconda, Spinta della Corrente:* wide cut that pushes back.

### ACT II — LA DISCESA

#### 7. Cerbero
*Secondary · Porta di Dite · Difficulty 7/20*
- **Look:** an enormous three-headed dog, pitch-black fur, ember eyes, broken chains at the neck.
- **Fight:** each head has its role: left bites, center spits fire, right growls shockwaves. You must read which head attacks. Phase 2: the chains break fully and Cerbero leaps at the target with sudden jumps.
- **Lore role:** keeps the living out: the Gate opens only for souls. Your body, shadowless, has the weight of a soul: you are the only living one who passes.
- **Weapon: Triplice Guinzaglio** (chains): three chains with black iron hooks. *Arte Prima, Tre Morsi:* three whip strikes in sequence. *Arte Seconda, Guinzaglio:* hooks and drags the target toward you.

#### 8. Pyro, il Cavaliere di Fiamme
*Secondary · Landa dei Roghi · Difficulty 8/20*
- **Look:** a giant knight in dark red incandescent armor, cloak of flames, wavy greatsword.
- **Fight:** long two-handed combos, fire waves running on the ground, a leap with slam. Phase 2: wraps himself in flames and attacks at range too.
- **Lore role:** first of the **Tre Cavalieri del Giuramento** (Three Knights of the Oath), paladins of Ouranthos who fell with Lucifero. Keeps the first seal: 'Il Fuoco giura per primo.'
- **Weapon: Brace Eterna** (greatsword): wavy blade with an incandescent core. *Arte Prima, Onda Incandescente:* cut that sends a wave of fire. *Arte Seconda, Lama Rovente:* imbues the weapon with flames for 10 seconds.

#### 9. Thunder, il Cavaliere di Fulmini
*Secondary · Bufera Eterna · Difficulty 8/20*
- **Look:** a knight in blue and silver armor crossed by electric arcs, with a great hammer.
- **Fight:** fast and unpredictable: dashes, overhead blows, lightning that marks the ground before striking. Phase 2: calls a rain of lightning and the fight becomes a dance among discharges.
- **Lore role:** second of the Three Knights, keeper of the second seal: 'Il Tuono giura per secondo.'
- **Weapon: Tuono Spezzacielo** (war hammer): metallic azure head crossed by sparks. *Arte Prima, Schianto Tonante:* vertical blow with shockwave. *Arte Seconda, Catena di Fulmini:* lightning that bounces three times.

#### 10. Ice, il Cavaliere di Ghiaccio
*Secondary · Cocito · Difficulty 9/20*
- **Look:** a slender knight in azure crystal armor with a thin rapier; his breath freezes the air.
- **Fight:** a precision duelist: parries and ripostes, very fast attacks, punishes light-attack spam. The ground freezes and slides. Phase 2: creates ice mirrors from which he re-emerges.
- **Lore role:** third of the Three Knights, guardian of the last seal: 'Il Gelo giura per ultimo.'
- **Weapon: Brina Silente** (rapier): ultra-thin ice blade. *Arte Prima, Affondo Gelido:* thrust that freezes the target for an instant. *Arte Seconda, Danza dei Cristalli:* three rapid thrusts with ice shards.

#### 11. Mostro di Magma
*Secondary · Fucine Sepolte · Difficulty 9/20*
- **Look:** a colossus of rock and lava, glowing cracks and a pulsing heart in its chest, among giant anvils.
- **Fight:** slow devastating blows, lava bursts from the ground, an eruption that fills the arena. Phase 2: solidifies into an obsidian carapace that must be shattered to expose the heart.
- **Lore role:** built by the three knights to guard the forge where the armor of the Fallen was beaten. The last sentinel before the Cathedral.
- **Weapon: Fenditura Ardente** (two-handed axe): heavy black-rock blade with veins of lava. *Arte Prima, Frattura Magmatica:* strike that opens a lava fissure in front of you. *Arte Seconda, Eruzione:* leap and slam with radial explosion.

#### 12. Lucifero, l'Arcangelo Caduto (first encounter)
*Principal · Cattedrale Caduta · Scripted fight: cannot be won · no weapon*
- **Look:** burned black wings, cracked golden armor, a throne of swords in the overturned nave of the Cathedral. He sits like someone with no more hurry.
- **The choice:** once the three seals are open, Lucifero speaks: 'Sei vivo, piccolo seme. Cosa vuoi da me?' You choose **Affronta** (Fight) or **Implora** (Beg).
- **Affronta:** the fight starts for real and you can dodge and hit, but Lucifero is invulnerable. If you activate the Metamondo he shatters it with one finger. After about two minutes an unavoidable attack ends the fight: not a death, a narrative defeat. You wake at the exit with full Health and refilled Lacrime, and you receive the **Cicatrice del Rifiuto** (a mark on the chest).
- **Implora:** hold the button for five seconds while the character kneels under his gaze. Lucifero laughs, tired: 'Nessuno mi ha mai implorato per vivere. Vai.' You receive the **Piuma Nera** (black feather).
- Both paths lead out of the Inferno along the Scala dei Dannati to the snowy mountains. The difference is narrative only: Lucifero remembers it at the second encounter.

### ACT III — IL BIANCO SILENZIO

#### 13. Gigante di Fuoco
*Secondary · Bocca del Vulcano · Difficulty 10/20*
- **Look:** a giant as tall as a tower, black rock skin and veins of fire, beard of flames. He rises from the crater while snow melts around him.
- **Fight:** fists that ignite the ground, grabs and throws, ember breath. The arena is the crater rim, slippery and unstable. Phase 2: covers himself in fire and charges head-down.
- **Lore role:** sentinel between Inferno and Frost, tasked with stopping infernal fire from rising and melting the mountains. He is not evil: he obeys.
- **Weapon: Pugni di Brace** (fists): black-rock gauntlets with veins of fire. *Arte Prima, Pugno Cratere:* ground punch that creates a fire wave. *Arte Seconda, Presa Ardente:* grabs the target and throws it.

#### 14. Yeti
*Secondary · Pendii della Corona Bianca (cave) · Difficulty 10/20*
- **Look:** a white beast with thick fur and blue eyes, massive yet very agile. Lives in a cave with painted walls.
- **Fight:** sudden leaps, screams that trigger small avalanches, fast claws in a snowstorm with poor visibility. Phase 2: furious, never stops.
- **Lore role:** on his cave wall he painted the last dawn, the only sun the world remembers: the first visual hint of what you must find. He does not want to fight: he defends that painting.
- **Weapon: Unghie del Bianco** (claws): bone-and-ice claws fixed on gloves. *Arte Prima, Graffio Valanga:* three slashes that lift snow. *Arte Seconda, Balzo Predatore:* leap onto the target.

#### 15. Guardiano della Rocca di Brina
*Secondary · Gate of the ice castle · Difficulty 11/20*
- **Look:** a gigantic empty armor made of ice, with a tower shield and a small sword. Frost in the joints.
- **Fight:** defensive: the tower shield blocks almost everything and punishes light-attack spam. Equilibrio must be broken to open a gap. Phase 2: the shield shatters into orbiting blades.
- **Lore role:** Loki's porter, bound by an oath he does not remember. Falling he says 'Finalmente' (at last) and crumbles.
- **Weapon: Baluardo Gelido** (shield): large ice shield with spikes. *Arte Prima, Urto del Baluardo:* shoulder-charge. *Arte Seconda, Muro di Brina:* raises a barrier that stops projectiles.

#### 16. Loki
*Principal · Sala del Trono di Brina · Difficulty 13/20*
- **Look:** an elegant figure with black hair and a crooked smile, green-and-gold cloak. He changes expression, sometimes face.
- **Fight:** *Phase 1:* duel with illusions; he creates two copies and only the real one casts a shadow, the only shadow in the hall since you have none. *Phase 2:* the hall becomes a labyrinth of mirrors and he exits the mirrors to strike you. *Phase 3:* the hall collapses and he fights on suspended ice bridges, imitating the **three weapons you have equipped**.
- **Lore role:** mixes truth and lies: says the Seventh World is a prison and that Ouranthos is dead. Defeated, he laughs and vanishes. Grants the **Specchio** Form.
- **Weapon: Grimorio delle Menzogne** (tome): green leather tome whose pages change text. *Arte Prima, Falso Specchio:* illusion that draws the boss's attack. *Arte Seconda, Verità Scomoda:* light bolt that dissolves illusions and hurts whoever uses them.

#### 17. Grande Lupo
*Secondary · Taiga, clearing of the Three Spirits · Difficulty 11/20*
- **Look:** a gray-silver wolf as tall as a house, amber eyes, surrounded by a cloud of snow.
- **Fight:** very fast: leaps, bites, a howl that calls snowstorms. Phase 2: splits into a spirit that attacks alongside him.
- **Lore role:** one of the **Tre Spiriti della Taiga**, guide and keeper. Tests you to find out whether you are Chaos: discovering you are not is his answer.
- **Weapon: Zanna d'Argento** (katana): thin silver blade, wolf-head hilt. *Arte Prima, Taglio Lunare:* crescent-moon cut at range. *Arte Seconda, Branco:* three rapid cuts from different angles.

#### 18. Grande Orso
*Secondary · Taiga, forest of the Logs · Difficulty 12/20*
- **Look:** a huge brown bear with moss in its fur, a collar of bones and ancient scars.
- **Fight:** brute force: slams, hugs, head-down charges, slow but devastating. Phase 2: stands up and shakes the forest; trees fall on the arena.
- **Lore role:** second spirit of the Taiga, protector of the woods. He fights to know whether you can protect something.
- **Weapon: Asce Gemelle del Taglialegna** (twin axes): two one-handed axes with fir handles. *Arte Prima, Tempesta di Schegge:* flurry of spinning strikes. *Arte Seconda, Abbattimento:* crossed blow that breaks Equilibrio.

#### 19. Sciamano
*Secondary · Taiga, Cerchio dei Tamburi · Difficulty 12/20*
- **Look:** an old hooded man with a deer mask, furs and bones, a drum and a totem staff.
- **Fight:** ranged caster: wolf, bear and raven spirits as projectiles, and a drum whose rhythm changes the attack pattern. Phase 2: fuses with the raven and flies above the arena.
- **Lore role:** binder of the three spirits. Points to the Grande Fiume and the Nave dei Cercatori: 'Il fiume sa dov'è il mare. Il mare sa dov'è il giardino.'
- **Weapon: Totem degli Spiriti** (totem): carved totem with three faces. *Arte Prima, Ruggito Spirituale:* bear or wolf spirit charging forward. *Arte Seconda, Stormo di Corvi:* wave of ravens hitting in a line.

#### 20. Grande Aquila Reale
*Secondary · Il Grande Fiume (on the ship) · Difficulty 12/20*
- **Look:** a golden eagle with a wingspan as wide as the ship, eyes like two small suns.
- **Fight:** on the deck, narrow and rocking, between mast and sails. The eagle dives; using the onboard ballista (contextual action) allows hitting it in flight. Phase 2: grabs the ship and lifts it above the water.
- **Lore role:** guardian of the river's skies; mistakes the ship for an invasion.
- **Weapon: Piuma Reale** (longbow): pale wood bow with golden feathers. *Arte Prima, Freccia Planante:* long-range arrow that accelerates in flight. *Arte Seconda, Pioggia d'Oro:* volley of arrows falling from above.

#### 21. Drago di Fuoco
*Mini boss · Porto del Grande Fiume · Difficulty 12/20 · no dialogue, no lore*
- **The stop:** between the two ships there is a stretch on land: supplies, an altar, time to breathe. While you change ships a giant fire dragon attacks, to break the calm.
- **Look:** a rust-red dragon with membrane wings and smoke from its nostrils.
- **Fight:** attacks from above, cone-shaped fire breath, glides and claws. Phase 2: sets the docks on fire and the port burns around you.
- **Weapon: Balestra del Drago Ardente** (crossbow): heavy crossbow with red scales on the limbs. *Arte Prima, Dardo Incendiario:* bolt that explodes in fire. *Arte Seconda, Salva a Scaglie:* three bolts in a fan.

#### 22. Kraken
*Mini boss · Il Mare · Difficulty 13/20 · no dialogue, no lore*
- **Look:** a colossal octopus rising from the night sea, an enormous eye above the waves.
- **Fight:** on the ship's deck: tentacles sweep the deck (must be broken one by one); the eye is the weak point. Phase 2: creates a whirlpool and the ship spins on itself.
- **Weapon: Arpione Abissale** (harpoon): harpoon with a chain that rewinds. *Arte Prima, Lancio e Richiamo:* throws the harpoon and drags the target to you. *Arte Seconda, Vortice:* spinning blow that pulls nearby enemies.

### ACT IV — IL GIARDINO DEL DIO

#### 23. Re Mantide
*Secondary · Prato dei Trifogli (first gate) · Difficulty 13/20*
- **Look:** a jade-green mantis as tall as a cathedral compared with you, with a crown of petals and chitin scythes.
- **Fight:** precise and quick: camouflages among leaves and reappears behind you, crossed slashes, tight-rhythm combos. Phase 2: the crown blooms and throws bursts of sharp petals.
- **Lore role:** chief of the garden's guards: opens the first gate. Before striking he studies you with a naturalist's curiosity.
- **Weapon: Kama della Mantide** (twin kama): two jade-green sickles. *Arte Prima, Imboscata Verde:* lightning dash through the target with a double cut. *Arte Seconda, Falcata Incrociata:* two cuts in an X.

#### 24. Coleottero Imperiale
*Secondary · Bosco di Muschio (second gate) · Difficulty 14/20*
- **Look:** an armored metallic-blue beetle with two huge stag-beetle mandibles and buzzing wings.
- **Fight:** slow, armored, fearsome: head-down charges, mandibles that grab and crush. Phase 2: opens its wings and attacks in flight, with bombing runs from above.
- **Lore role:** general of Uruk's court: opens the second gate and respectfully recognizes a worthy opponent.
- **Weapon: Mandibole Imperiali** (pincer blade): two curved blades joined at the base that open and close. *Arte Prima, Morsa:* closes the blades and holds the target. *Arte Seconda, Carica Corazzata:* forward shoulder-charge with the blades open.

#### 25. Regina Formica
*Secondary · Formicaio sotto le radici (third gate) · Difficulty 14/20*
- **Look:** a gigantic ant with a swollen golden abdomen, surrounded by luminous eggs.
- **Fight:** avoids melee: spits acid and sends waves of workers across the arena (jump to avoid; they are hazards, not allies). Phase 2: tunnels open under your feet and she attacks from the holes.
- **Lore role:** guards the last gate: behind the anthill is the underground passage to Uruk's greenhouse.
- **Weapon: Pungiglioni Regali** (daggers): two amber daggers with stinger tips. *Arte Prima, Puntura Acida:* stab that deals damage over time. *Arte Seconda, Sciame:* series of six very fast strikes.

#### 26. Uruk, Dio Minore di Little Garden
*Principal · La Serra del Giardiniere · Difficulty 15/20*
- **Look:** a gigantic gardener: tall thin figure with a woven-leaf hat, pale bark skin, eyes like dewdrops, an apron stained with earth. Carries enormous shears and a bronze watering can. Dignified and melancholic.
- **Fight:** *Phase 1, la Potatura:* shears close like guillotines, carnivorous flowers sprout, he tries to cut you like a dead branch. *Phase 2, l'Annaffiatoio:* he waters the arena and flowers grow in real time, becoming barricades and traps; enormous drops rain from above. *Phase 3, l'Erbaccia:* the greenhouse opens and the sky is visible; Uruk, now truly a god, fights at full size. You are the weed the gardener cannot uproot.
- **Lore role:** collected shrunken mortals like flowers in a tiny perfect garden: Chaos devoured his original garden and he wanted something nothing could lose. 'Un giardino piccolo non si può perdere.' When he falls his essence flows into you: the **Ascesa**. You become a minor god and grow past the garden; measures return to reality; Little Garden is revealed as a flowerbed. You are now bigger than before (112%). Grants the **Gigante** Form.
- **Weapon: Cesoie del Giardiniere** (shears): two crossed blades that can separate into two short swords. *Arte Prima, Potatura:* wide scissor cut that breaks Equilibrio. *Arte Seconda, Innesto:* plants a seed in the enemy that after three seconds blooms into vines that bind it.

### ACT V — IL REGNO DEI DRAGHI

#### 27. Drago di Ghiaccio
*Mini boss · Altipiano delle Ossa · Difficulty 14/20 · no dialogue, no lore*
- **Look:** a white-and-azure dragon with ice crystals instead of scales and a breath of frozen fog.
- **Fight:** cold breath that leaves icy zones on the ground, tails that sweep the arena. Phase 2: unleashes a storm and drops stalactites from above.
- **Weapon: Naginata Cristallina** (naginata): long shaft with a curved crystal blade. *Arte Prima, Falciata Glaciale:* wide cut that leaves an icy trail. *Arte Seconda, Punta di Cristallo:* thrust that shatters Equilibrio.

#### 28. Drago a Tre Teste
*Mini boss · I Nidi · Difficulty 15/20 · no dialogue, no lore*
- **Look:** a green-and-brown dragon with three different heads (fire, poison, lightning) among nests carved in rock.
- **Fight:** each head has an element and its own Equilibrio bar: deciding which to bring down first is the key. When a head falls the others become enraged and faster.
- **Weapon: Tridente delle Tre Punte** (trident): three points of different colors. *Arte Prima, Triplice Affondo:* three thrusts in sequence. *Arte Seconda, Lancio del Tridente:* throw it and recall it.

#### 29. Reina, la Maga Ancestrale
*Principal · Osservatorio delle Stelle · Difficulty 16/20*
- **Look:** a tall ageless woman in a midnight-blue robe covered in moving stars, hair white like comets, crystal eyes. Floats among orbiting rings.
- **Fight:** *Phase 1, le Orbite:* concentric rings rotate on the ground, falling stars, constellations that strike when their lines join (very clear telegraphing). *Phase 2, il Cielo Riscritto:* rewrites the arena with variable gravity and star-bombs; if you activate the Metamondo she rewrites the sky inside it. *Phase 3, la Profezia:* shows you the prophecy in which you die and stages it: an echo of yourself repeats your movements of the last ten seconds and attacks you.
- **Lore role:** 'Se le stelle mentono, voglio vederlo.' After defeat she reveals the prophecy was incomplete: the seventh place in the sky was empty. The stars did not say you would die, they said your sky was not yet written. She explains the **Rituale delle Due Metà**: the Heart of Light (from Re Drago) and the Heart of Shadow (from Regina Drago) must be reunited on the Altare del Rovescio. Grants the **Firmamento** Form.
- **Weapon: Astrolabio Ancestrale** (astrolabe): three concentric rings orbiting you. *Arte Prima, Congiunzione:* the three rings align and fire a light beam. *Arte Seconda, Cometa:* launches a comet that explodes on impact.

#### 30. Idra
*Secondary · Lago dei Nove Specchi · Difficulty 15/20*
- **Look:** a multi-headed serpentine creature, violet and green scales, emerging from the misty lake.
- **Fight:** heads attack in turn with bites and venom sprays. Each head has its own Equilibrio: if you break it and deliver the Colpo di Grazia it does not regrow; if you leave it, it returns in twenty seconds. Phase 2: heads go from five to nine.
- **Lore role:** guardian of the **Sentiero della Terra** (Path of Earth) toward Yggdrasil, one of the two keepers of the ascent. She asks whether the Portatore is ready to climb.
- **Weapon: Frusta delle Nove Code** (whip): nine cords each with a brass head. *Arte Prima, Nove Morsi:* nine rapid strikes in a fan. *Arte Seconda, Sibilo Multiplo:* circular lash that hits every target around you.

#### 31. Grifone
*Secondary · Scogliere del Vento · Difficulty 16/20*
- **Look:** half lion, half eagle, white-and-gold feathers and ochre fur, large as a house.
- **Fight:** the arena is a narrow cliff: wind pushes and the Griffin swoops, claws like a lion, glides through gusts. Phase 2: unleashes a storm of sharp feathers.
- **Lore role:** guardian of the **Sentiero del Cielo** (Path of Sky), the second way to Yggdrasil. Whoever defeats both keepers may climb.
- **Weapon: Ala di Grifone** (scimitar): curved wing-shaped blade, feathered grip. *Arte Prima, Colpo d'Ala:* wide cut that pushes the target back. *Arte Seconda, Tuffo del Rapace:* leap and downward slash.

#### 32. Re Drago
*Principal · La Chioma di Yggdrasil · Difficulty 17/20*
- **Look:** a three-headed dragon, white body with many gold parts and a few azure touches, enormous luminous wings. The three heads are **Legge** (gold), **Memoria** (white) and **Pietà** (azure).
- **Fight:** *Phase 1:* the three heads attack in turn: golden light breath, azure roar that slows, white bite. *Phase 2:* flies around the World Tree; the arena is suspended branches and he throws rains of light. *Phase 3:* gives up flight and fights with full strength, gold waves and charges. *Phase 4:* the azure head, Pietà, stops and admits defeat: it leaves the **Cuore di Luce**.
- **Lore role:** the Light and Order half of Ouranthos; knows he is incomplete: 'Sono ciò che resta quando si toglie il rimpianto.' Points to the Yggdrasil root that descends to the Inferno: the Tree connects the worlds. Grants the **Cielo Aureo** Form.
- **Weapon: Spada del Sovrano** (bastard sword): white blade with gold veins and an azure crystal in the hilt. *Arte Prima, Giuramento di Luce:* golden cut that travels at range. *Arte Seconda, Tre Soffi:* three successive waves: white, azure, gold.

### ACT VI — IL ROVESCIO

*Transition:* a hollow root descends from Yggdrasil's crown to the Inferno; the descent is a backward journey through everything crossed. The sky is less violet: four principal bosses have brightened it by four shades. You are back in the Cattedrale Caduta and Lucifero waits standing.

#### 33. Lucifero, l'Arcangelo Caduto (second encounter)
*Principal · Cattedrale Caduta · Difficulty 18/20*
- **Look:** this time he has left the throne. The burned black wings open fully; the cracked golden armor has been recomposed in black and gold. Pale, tired eyes.
- **Opening line depends on the first encounter:** if you fought: 'Sei tornato a prendere il resto del colpo.' If you begged: 'Sei tornato in piedi. Mi piace di più.'
- **Fight:** *Phase 1:* duel with the Stella del Mattino, wide blows, feathers falling like blades. *Phase 2:* the Cathedral turns to embers; the floor is red-hot glass and blades of the sky fall from above. *Phase 3, la Caduta:* wings of fire, dive attacks and a final blow: the same unavoidable attack as in the first encounter. This time it can be **parried with perfect timing**.
- **Lore role:** 'Io ho perso il cielo per aver detto no. Dimostrami che il tuo sì valga.' Defeated, he opens the **Porta Rovesciata** behind the throne and says without rancor: 'Il cielo, ora, è sotto di noi.' Grants the **Abisso Rosso** Form.
- **Weapon: Stella del Mattino** (flail / morning star): golden spiked ball on a black chain. *Arte Prima, Alba Spezzata:* throws the ball at long range, exploding into rays. *Arte Seconda, Caduta:* leap and slam with a red shockwave.

#### 34. Drago del Vuoto
*Mini boss · Il Rovescio, Pianura Capovolta · Difficulty 16/20 · no dialogue, no lore*
- **Look:** a black eyeless dragon that seems cut out of darkness; tiny stars move inside its scales.
- **Fight:** moves in reverse, walking on the sky that has become ground; opens gravity holes that pull in and breathes void. Phase 2: inverts gravity of the whole arena.
- **Weapon: Chakram del Vuoto** (chakram): disc with a central hole that swallows light. *Arte Prima, Lancio Orbitale:* throw it and it returns. *Arte Seconda, Foro Nero:* the chakram stays still and pulls nearby enemies in.

#### 35. Verme Mangiamondi
*Mini boss · Il Rovescio, Deserto di Cenere · Difficulty 17/20 · no dialogue, no lore*
- **Look:** a gigantic segmented worm, circular mouth with spiral teeth and fragments of landscapes glued to its body: trees, towers, bridges.
- **Fight:** emerges from the ground and swallows pieces of the arena, which shrinks. Phase 2: the body splits into segments that roll like millstones.
- **Weapon: Trivella Divorante** (drill-lance): lance with a spiral tip. *Arte Prima, Perforazione:* spinning thrust that pierces guard. *Arte Seconda, Scavo:* you burrow and re-emerge under the target.

#### 36. Regina Drago
*Principal · Il Palazzo Capovolto · Difficulty 19/20*
- **Look:** like Re Drago but entirely dark: black body, violet and red details in equal amount pulsing like veins, wings of dark glass. The three heads are **Ricordo** (violet), **Rabbia** (red) and **Silenzio** (black).
- **Fight:** *Phase 1:* three heads attack in turn: violet void breath, red flame and a silent scream that mutes all sound. *Phase 2:* the Palace flips at each of her attacks: gravity changes sign and you must rotate with it. *Phase 3, i Sei Mondi:* evokes the memories of the dead worlds, each with a themed attack and arena: fire, frost, garden, stars, wings, reverse. *Phase 4:* she recognizes you. Stops attacking; anger becomes weeping; the Heart of Shadow offers itself.
- **Lore role:** the Shadow and Memory half of Ouranthos: 'Io ricordo tutto. Lui ha scelto di dimenticare per poter continuare.' Grants the **Rovescio** Form.
- **Weapon: Falce dell'Eclissi** (scythe): large black scythe with violet blade and red veins. *Arte Prima, Falciata Eclissi:* arc cut leaving a Void trail that damages over time. *Arte Seconda, Raccolto d'Ombra:* spinning attack that, if it hits, returns one Eco segment.
- **The Ritual:** at the top of the Palace is the **Altare del Rovescio**. You deposit the Heart of Light and the Heart of Shadow: three guided gestures, no combat. The two halves reunite and the sky opens.

### ACT VII — L'ALBA

*Transition:* the Ritual lifts you out of the Rovescio, through the night, to the **Terrazze Celesti**: white marble, hanging gardens, stairs of light, an open silent sky. It is the paradise Lucifero lost.

#### 37. Dio dei Draghi (Ouranthos)
*Principal · Terrazze Celesti · Difficulty 19/20*
- **Look:** a dragon long as a horizon, with a single majestic face and six halos of light on the forehead, one per fallen world, and a seventh, empty, turning above the others. The body fades from white to black like an aurora, with gold and violet veins. Golden eyes.
- **Fight, the Prova dell'Alba (Trial of the Dawn):** *Phase 1, il Giudizio:* measured attacks, each inspired by one of the six worlds (fire, frost, thunder, garden, stars, reverse): a living summary of the journey. *Phase 2, la Prova:* the rhythms tighten and he uses the signature moves of the principal bosses you defeated. *The interruption:* the sky cracks. Ouranthos suspends the trial: 'Basta. Ti ho visto.' and turns toward the new enemy.
- **Lore role:** he has reunited his halves and recovered memory. He says: 'Ho respirato sei mondi e li ho persi tutti. Il settimo non lo respiro io: lo respiri tu.'
- **Weapon: Scettro del Primo Respiro** (scepter): white-gold scepter with a turning ring. *Arte Prima, Respiro Primordiale:* cone of light. *Arte Seconda, Settimo Anello:* creates a ring of light that pulls in and damages enemies. The weapon is delivered after the final victory.

#### 38. Cthulhu, Dio Maggiore del Caos
*Principal · Il Collasso · Difficulty 20/20*
- **Look:** a titan of dreams: tentacled head, leathery wings, a body dissolving into mist, many eyes. When he appears the Terrazze shatter and you fall into a space where reality, space and time have collapsed. He does not speak: his voice is the sound of all the voices of the fallen worlds.
- **Arena:** fragments of every boss arena suspended in the void and rotating; time advances in jumps.
- **The ally:** the only fight in which you are not alone: **Ouranthos fights with you**, AI-controlled. He breaks Equilibrio with his breath, shields your mistakes with a wing, and recharges every time you perfect-dodge.
- **Fight:** *Phase 1, il Risveglio:* tentacles sweeping the islands, waves of madness that distort the screen. *Phase 2, il Sogno:* the boss arenas re-emerge and each one's most famous attacks fall on the field as in a nightmare. *Phase 3, l'Alba:* Ouranthos, wounded, blows the seventh breath into your Metamondo, which activates by itself: the Seventh World opens around you both and your blows sweep away the mist. The fight ends with a cooperative Colpo di Grazia.
- **Weapon: Lama dell'Abisso Sognante** (shape-shifter): changes form at every combo: sword, whip, axe, spear. *Arte Prima, Metamorfosi:* takes the chosen form and uses its moveset for ten seconds. *Arte Seconda, Risveglio Abissale:* wave of light tentacles around you. Usable from New Game+ onward.

## C11. The ending

Cthulhu falls. The Collapse recomposes and Ouranthos blows: the Metamondo opens. You stand in a **new world above the sky**: a sea of clouds to the horizon and, on the horizon, a beautiful sunrise, the first in centuries. The sun rises and, for the first time, you have a shadow.

The last shot is full of small confirmations: Lucifero's black feather turns white and flies away; a laugh, Loki's, passes in the wind; the Cavaliere Errante's lantern, now lit, shines beside you; on the wall of a faraway cave the last dawn painted by the Yeti finally has a companion. The title appears: **Settimo Mondo**. This sunrise is also the end of the game.

## C12. After the Dawn

- **Ciclo dell'Alba (New Game+):** bosses return with new, more aggressive patterns; weapons and Forms carry over; the sky already starts golden. The Lama dell'Abisso Sognante becomes usable.
- **Specchio dei Ricordi:** replay any defeated boss from altars with chosen time of day and Form.
- **Challenges:** no damage taken, single weapon, no Lacrime d'Alba, no Metamondo.
- **Collections:** all 37 weapons (plus starter), all seven Forms, all time-of-day variants.

## C13. Art and audio direction

- **Palette by act:** I green and muted gold; II red, blue and black; III white and azure; IV saturated vivid colors; V gold, white and midnight blue; VI violet, red and black; VII white, gold and finally the sunrise.
- **Scale:** bosses are enormous and the player is always small. At each new region a panoramic vista shows what lies ahead. Environments must be visually stunning yet mysterious, like Elden Ring.
- **Music:** a seven-note **Portatore theme** runs through the whole game. Every principal boss reprises it with different instruments, and after every principal boss defeated the theme gains one note; only in the final fight is it heard in full. Each boss has its own phase-based music; altars have quiet ambience.
- **Interface:** minimal; thin bars, no icon map, no quest markers. On touch, the controls are semi-transparent and fade when idle, so the world stays visible. The world is read by looking.
- **Glossary:** *Altare della Quiete* (meditation and loadout point), *Arti* (two special attacks per weapon), *Eco* (3-segment resource), *Equilibrio* (boss poise), *Forma* (Metamondo type), *Lacrime d'Alba* (three full-heal elixirs), *Metamondo* (unique ability), *Portatore / Senz'Ombra* (protagonist), *Mondo Spezzato* (the game world).

## Asset rules (E6, condensed)

Never reproduce existing characters, logos, artworks or melodies from other games or franchises. Mythological and
public-domain figures (Cerbero, Caronte, Loki, Yggdrasil, Cthulhu, Lucifero, Kraken, Idra, Grifone) are fine; their designs
follow this Bible. Act style keywords: I green and muted gold, mist, ancient stone. II red, blue and black, fire, storm, ice,
obsidian. III white and azure, snow, auroras, pine forests. IV saturated giant flora and insects, glowing pollen, macro-scale.
V gold, white and midnight blue, dragon bones, floating islands, star charts. VI violet, red and black, inverted architecture,
void. VII white and gold marble clouds, then fractured cosmos, then sunrise.
