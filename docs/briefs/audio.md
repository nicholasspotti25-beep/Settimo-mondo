# Stream: AUDIO (Vite port 5177)

Owns: src/audio/**, data/music/**, tests/audio*.test.ts, docs/AUDIO.md.
Also read: src/app/interfaces.ts (AudioDirector contract), src/app/Game.ts (unlock on first touch, suspend/resume,
setVolumes, onEvent(e, sim) for every SimEvent, update(dt, sim|null, mode), playUi(id)), src/audio/index.ts (createAudio),
src/sim/types.ts, sim.ts, player.ts, actor.ts, metamondo.ts, gamestate.ts (themeNotes() = 0..7 principal bosses defeated,
Lucifero I excluded; 0 = the theme exists only as its heartbeat rhythm; 7 only in the final fight), src/core/types.ts
(SpeakerDef voice, ZoneDef.ambience/music, BossDef.music + phases[].music), data/speakers, data/zones (ambience ids),
data/story (music cue ids risveglio, alba, titoli), Bible C1, C7, C8, C10 (every card), C13.
No audio files: everything synthesized (Web Audio) and generative.

Deliverables:
1. Engine: AudioContext, buses (music, sfx, voice, ambience, ui) with settings volumes, ducking under dialogue/big impacts,
   compressor + soft limiter, environment reverbs (cave, cathedral, plains, under glass, void), spatial panning + distance,
   lookahead scheduler, reused nodes/buffers, per-quality voice limits; robust unlock/resume (iOS interrupted/suspended);
   'mute' status silences all but a soft tinnitus; 'madness' adds wobble/distortion.
2. Synth SFX for every gameplay event: swings by weapon family (via weapon id → type/category), hits by element and weight,
   parry, perfect dodge (slow whoosh + chime), block, guard break, dodge, jump/land, footsteps per surface (stone, grass,
   moss, mud, water, wood, ash, snow, ice, sand, marble, bone, obsidian, soil, bark, void, cloud), drink, swap, Transizione,
   Art casts by effect, projectiles by visual, explosions, shockwaves, hazard telegraph cues, Colpo Rosso stinger, Spezzato,
   Colpo di Grazia, boss voices/roars by rig family, phase transition swell, boss defeat, hurt, death (gentle), respawn,
   altar/meditation, time-of-day change, Metamondo ready/activate/end + reactions (shatter, rewrite, devour, spit), weapon
   obtained, Form unlocked, reperto, vista, gate lock/open, zone enter, UI sounds, story cues (ending_shadow, ending_feather,
   ending_laugh = Loki's eerie synthesized laugh in the wind, ending_lantern, ending_cave, loki_laugh), ritual gestures,
   whispered 'voices_*' cues of the Mostro della Palude, unknown sfx/cue ids → graceful generic sound.
3. Speaker voice tones: short synthesized murmur per dialogue line from SpeakerDef.voice; Voce dell'Alba ethereal; unknown
   speakers derive a voice from the id.
4. Generative music: act palettes (I pastoral strings/winds; II infernal brass/choir/drums; III glassy bells/celesta/cold
   pads; IV playful macro-garden marimbas; V majestic brass/harps/choir; VI inverted dark organ/reversed swells; VII full
   orchestra-like → sunrise). A theme for EVERY encounter as data/music/boss_<bossId>.yaml (38 ids from tools/canon/bible.ts;
   phase layers boss_<id>_p1..p4 ≥ the boss's phases) written from the Bible cards (e.g. Caronte funereal barcarolle, Cerbero
   three-voice snarling ostinato, Loki shifting meter, Uruk music-box waltz turning colossal, Reina astral arpeggios, Re/
   Regina Drago mirrored themes, Dio dei Draghi grand, Cthulhu dissonant dream); crossfade layers on 'bossPhase'; any unknown
   cue id still produces fitting music (procedural fallback seeded by id + act); mini bosses shorter and percussive. The
   seven-note Portatore theme (data/music/portatore.yaml): each principal boss reprises it on its own instrument family; notes
   played = sim.themeNotes() (0 = heartbeat pulse), full only in the final fight; quiet fragment at altars; opening
   (risveglio), sunrise cue (alba), credits (titoli), title music; zone ambiences for every zone.ambience id with time-of-day
   tint. Musical transitions on bar boundaries.
5. docs/AUDIO.md; tests: theme data validation for all 38 encounters, Portatore progression, scheduler math.
Verify with OfflineAudioContext renders in headless Chromium (RMS > 0, no NaN, no clipping).
