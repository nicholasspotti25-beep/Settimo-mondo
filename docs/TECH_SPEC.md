# Technical specification (PART D, condensed) + quality bar

## Quality bar (PART B)
- Biggest, most complete and polished result possible; no prototype, no cuts. Change the *technique*, never the *content*.
- Combat feel first: instant response, generous input buffering, readable telegraphs, fair hitboxes, consistent i-frames, no
  cheap deaths, no input ever lost under an overlapping control. Beatable by skill alone on a phone with two thumbs.
- No silent placeholders, no TODO text or lorem ipsum in shipped content, no stubbed bosses. Never claim something works
  unless you ran it.
- No enemies, quests, XP, levels, armor stats, crafting, currencies, loot, microtransactions, ads, accounts or online features.
- Art and sound are built in code (procedural meshes, rigs, shaders, particles, procedural animation, synthesized audio and
  generative music). CC0/public-domain assets only if the license is verified and recorded in `CREDITS.md`. Never imitate
  copyrighted assets, characters or music from other games.

## D2. Mobile platform
- Landscape locked; safe-area insets (notch, rounded corners, home indicator); UI scales from small phones to tablets.
- Pointer Events, independent multi-touch, no 300 ms delay, no pinch-zoom, no text selection, no long-press menu, no
  pull-to-refresh, no scroll bounce, `touch-action: none`; controls never steal each other's touches.
- Lifecycle: auto-pause + autosave on `visibilitychange`, `pagehide`, background; resume safely; WebGL context loss/restore;
  Screen Wake Lock while playing; unlock audio on first touch; recover from audio interruptions.
- Storage: persistent storage request; IndexedDB + localStorage fallback; save export/import as copyable text code.
- Offline: everything bundled/precached; target ≤ ~150 MB; per-Act code chunks loaded lazily.
- Battery/heat: quality presets Low, Medium, High, Auto; 30 FPS battery mode; dynamic resolution from frame time; watchdog
  that lowers quality before frames drop; **no per-frame allocations in hot paths** (object pools).
- Haptics: distinct patterns for hit, parry, perfect dodge, Colpo Rosso warning, Colpo di Grazia, boss defeat.
- Optional external gamepad; keyboard/mouse only as a desktop debugging convenience.

## D3. Performance budgets
- 60 FPS on mid-range phones from ~2021; graceful 30 FPS fallback. Reference 2400×1080, dynamic scale 0.6–1.0.
- High preset: ~250 draw calls, ~400k visible triangles, boss ≤ ~80k triangles across LODs, texture memory ≤ ~400 MB.
  Prefer procedural/shader materials and small atlases.
- Instancing for foliage, props, particles; GPU particles with instanced quads; hemisphere + one directional light; cheap blob
  shadows; real shadow map only on Medium/High at 1024; **the player model never casts a shadow until the ending cutscene**;
  sky and fog in shaders instead of heavy post; bloom/outline optional and quality-gated; frustum culling, LODs, one active
  arena + a cheap low-detail vista of regions ahead.

## D4. Art without art tools
- Bodies/creatures: parametric procedural meshes (lathe, extrude, skinned tubes, SDF shapes baked to meshes, instanced plates,
  spikes, scales, fur cards, wings, tendrils) assembled from a per-boss build spec. Rigs in code by family: humanoid (knights,
  giants, Reina, Lucifero, Loki, Uruk), quadruped (wolf, bear, Cerbero, mounts), serpentine/multi-segment chains (Idra, dragons,
  Verme Mangiamondi, Kraken tentacles), insectoid, winged, plant/tree, composite colossi (Cthulhu, Dio dei Draghi). Every boss:
  unique instantly recognizable silhouette, act palette, glowing signature details, its own VFX.
- Animation: data-driven procedural animator layering pose clips defined in data (idle, walk, run, sprint, dodge roll, guard,
  parry, hit reactions, drink, kneel, Colpo di Grazia, death), swing-arc generators for weapon movesets, IK for feet on terrain
  and hands on grips, spring/secondary motion for cloaks, hair, chains, tentacles, wings. Boss attacks are timelines
  (telegraph, active, recovery) with pose targets, root motion, hitbox windows, VFX and sound events.
- Weapons: procedural builder with a template per type (blade profiles, guards, hafts, strings, heads, mutable parts),
  parameterized per weapon by the boss that dropped it (colors, glow, motifs): 37 distinct boss weapons + starter, trails, Art
  effects.
- Environments: terrain from authored control curves + layered noise; shader materials per surface (rock, moss, snow, ash,
  sand, marble, void, flesh); instanced props (trees, reeds, ruins, crystals, giant flora); authored landmark builder per region
  (Castello della Culla, Vetta, Palude, Fiume delle Anime, gate + Inferno, Cattedrale, snowy mountains + ice castle, taiga, ports
  and ships, sea, Little Garden macro flora, Yggdrasil, Terrazze Celesti, Rovescio palace, the Collapse). The Lungo Crepuscolo
  sky is a shader: violet-gold gradient, stars, aurora, god-rays, **no sun disc until the ending**.
- Look: painterly stylized realism, strong silhouettes, rim lighting, rich color grading per act and per time of day, extreme
  scale contrast (tiny player, enormous bosses), vista framing. A breathtaking first impression on a phone screen.
- UI art drawn in code (SVG, canvas, CSS) in one consistent dawn-light, glass-and-gold language; open-license fonts embedded
  or system fallbacks.

## D5. Audio
- Web Audio engine with buses (music, sfx, voice, ambience), ducking, stereo panning, per-quality voice limits.
- SFX synthesized (noise shaping, FM, filtered impacts) for every hit, parry, perfect dodge, swing by weapon family, boss roar,
  footstep by surface, altar, UI.
- Music: adaptive generative engine. Each act has a harmonic palette; each boss has its own theme with per-phase layers that
  crossfade at phase changes; altars have quiet ambience. The seven-note Portatore theme is data: each principal boss reprises
  it on a different synthesized instrument family, it gains one note after every principal boss defeated, and it is heard in
  full only in the final fight; the sunrise has its own cue.
- Voices: subtitled text with a short synthesized vocal tone per speaker.

## D6/D13. Controller, UI, accessibility
- Lock-on: nearest to screen center; lock button or double-tap on the boss; flick on the right half to switch; camera frames
  player and boss and pulls back for huge bosses; multi-part bosses expose selectable lock points.
- Floating stick with dead zone and smoothing; dodge direction follows stick; aim assist for ranged; latency compensation
  estimated per device and shown in settings.
- HUD: thin Salute bar, Fiato bar, three Eco pips with the Metamondo ring around them, three Lacrime icons, boss bar with
  Equilibrio under it, weapon trio indicator, touch controls. No minimap, no quest markers. Controls semi-transparent, fade
  when idle.
- Layout editor: move, scale, opacity for every control; left-handed mirror; presets for small phones and tablets.
- Menus: Armeria, Forme, Reperti, settings (graphics quality, frame rate, language, audio, haptics, accessibility, save export
  and import).
- Accessibility: full control layout remapping, subtitles with size options, reduced screen shake and flashing,
  colorblind-safe Colpo Rosso cues (shape + sound + haptics), toggle instead of hold, camera sensitivity, large-button mode. No
  difficulty selector; any leniency options live under Accessibility and are off by default.
- Debug menu: teleport to any altar or boss, invincibility, give all weapons, set time of day, set Metamondo meter, kill boss,
  hitbox display, FPS and memory overlay.
