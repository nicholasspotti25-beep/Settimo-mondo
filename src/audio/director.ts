/**
 * The AudioDirector: owns the AudioContext (created + resumed on the first gesture, iOS-safe), the mixer, the SFX voice
 * pools, the generative music player and the ambience player; turns every SimEvent into sound and keeps music/ambience in
 * step with the game state (title, zone exploration, fights and their phases, altars, death, story cues, credits).
 */
import type { AudioDirector, GameMode } from '../app/interfaces';
import type { Settings } from '../app/settings';
import { content } from '../core/content';
import { t as translate } from '../core/loc';
import type { Sim } from '../sim/sim';
import type { SimEvent } from '../sim/types';
import { AudioRng, hashString } from './core/rng';
import { AmbiencePlayer, type Tod } from './ambience/player';
import { Mixer, type BusId } from './engine/mixer';
import type { Out } from './engine/nodes';
import { spatialize, type Listener, type SpatialOut } from './engine/spatial';
import { VoicePool } from './engine/voices';
import { buildLibrary, generateAmbience, type MusicLibrary } from './music/resolve';
import { MusicPlayer } from './music/player';
import { defaultParams, swell, whoosh, chime, click, elementLayer, rumble, type SfxParams } from './sfx/kit';
import { bossVoice, envForAmbience, envForArena, SHAPESHIFT_CYCLE, surfaceOf, swingFamily, type SwingFamily } from './sfx/families';
import {
  art, bossVoiceSfx, combat, explosion, footstep, hazardErupt, hazardTelegraph, projectileHit, projectileLaunch, shockwave, story,
  swing, ui, world, type Recipe,
} from './sfx/library';
import { deriveVoice, murmur, syllablesFor, type VoiceTone } from './voice/murmur';
import { noise, tone } from './engine/nodes';

export type AudioQuality = 'low' | 'medium' | 'high';

const VOICES: Record<AudioQuality, number> = { low: 14, medium: 22, high: 32 };
const REVERB_MAX: Record<AudioQuality, number> = { low: 2.6, medium: 5, high: 7 };

type Pos = { x: number; y: number; z: number };
type MusicMode = 'none' | 'title' | 'explore' | 'fight' | 'victory' | 'story' | 'altar' | 'dead' | 'credits';

const UI_ALIAS: Record<string, string> = { move: 'ui_move', confirm: 'ui_confirm', back: 'ui_back', deny: 'ui_error', equip: 'ui_equip', error: 'ui_error' };

/* ---------------------------------------------------------------------------------------------------------------- */
/* Cue router: explicit recipes first, then keyword families, then a soft generic                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

/** Whispered voices of the Mostro della Palude (C10): breathy fragments drifting left and right. */
const whispers: Recipe = (o, t) => {
  let e = t;
  for (let i = 0; i < 6; i++) {
    const d = o.rng.range(0.25, 0.6);
    const at = t + i * o.rng.range(0.18, 0.35);
    noise(o, at, { color: 'pink', dur: d, a: 0.05, gain: 0.09, filter: { type: 'bandpass', f: o.rng.range(1800, 3400), q: 4 }, filter2: { type: 'highpass', f: 900 } });
    e = Math.max(e, noise(o, at + 0.04, { color: 'white', dur: d * 0.6, a: 0.03, gain: 0.03, filter: { type: 'bandpass', f: o.rng.range(5000, 7000), q: 3 } }));
  }
  return e;
};

const flash: Recipe = (o, t) => {
  click(o, t, 6000, 0.25, 0.015, 1);
  chime(o, t, 2637, 0.5, 0.12);
  return chime(o, t, 3951, 0.35, 0.06, 0.01);
};
const riseSwell: Recipe = (o, t, p) => swell(o, t, 0.9 + p.size, 0.22, 200, 2400, 82);
const sinkDown: Recipe = (o, t) => {
  whoosh(o, t, 1500, 200, 1.2, 0.18, 0.8, 'pink');
  return tone(o, t, { f: 140, f1: 45, dur: 1.2, a: 0.1, gain: 0.12 });
};
const wind: Recipe = (o, t) => whoosh(o, t, 250, 1400, 2.2, 0.22, 0.6, 'pink');
const softGlow: Recipe = (o, t) => {
  chime(o, t, 1046.5, 1.4, 0.06);
  return chime(o, t, 1568, 1.2, 0.04, 0.08);
};
const genericCue: Recipe = (o, t) => {
  whoosh(o, t, 400, 1600, 0.6, 0.08, 0.8, 'pink');
  return chime(o, t + 0.2, 1174.7, 1, 0.04);
};

function elementRecipe(el: string, heavy = true): Recipe {
  return (o, t) => elementLayer(o, t, el, heavy, 0.55);
}

interface CueChoice {
  r: Recipe;
  /** Boss voice kind instead of a recipe. */
  voice?: 'roar' | 'attack' | 'hurt';
  size: number;
}

const KEYWORDS: [RegExp, CueChoice][] = [
  [/laugh/, { r: story.ending_laugh, size: 0.5 }],
  [/^voices_|whisper|voices/, { r: whispers, size: 0.5 }],
  [/flash/, { r: flash, size: 0.5 }],
  [/parried|parry|riposte/, { r: combat.parry, size: 0.5 }],
  [/roar|howl|scream|cry|growl/, { r: genericCue, voice: 'roar', size: 0.6 }],
  [/shatter|crumble|snap|collapse|split|break|broken/, { r: combat.part_broken, size: 0.6 }],
  [/bite|swallow|devour|grab|hug|grip|caught|catch/, { r: genericCue, voice: 'attack', size: 0.6 }],
  [/breath|nova|flare|ablaze|ember|fire|magma|lava|erupt/, { r: elementRecipe('fire'), size: 0.6 }],
  [/thunder|lightning|bolt|storm_rain|call/, { r: elementRecipe('lightning'), size: 0.6 }],
  [/ice|frost|mirror|glass|brina|crystal/, { r: elementRecipe('ice'), size: 0.5 }],
  [/void|gravity|hole|invert|swap|copy|illusion|trick|mimic/, { r: world.gravity_flip, size: 0.5 }],
  [/storm|blizzard|gust|wind|cyclone|whirl/, { r: wind, size: 0.6 }],
  [/quake|slam|stomp|smash|land|fist|kick|bash|head_down|millstone|grind/, { r: combat.boss_step, size: 0.85 }],
  [/swing|sweep|swipe|claw|cut|cleave|scythe|thrust|tail|lash|whip|cross|lunge|dash|rush|charge|leap|pounce|dive|take_off|wing|spin|glide|step/, { r: combat.boss_whoosh, size: 0.6 }],
  [/spit|acid|spray|poison/, { r: elementRecipe('poison'), size: 0.5 }],
  [/rise|rises|emerge|stand|open|bloom|gather|call|swords|tunnels|workers|eggs/, { r: riseSwell, size: 0.4 }],
  [/sink|sinks|burrow|dig|vanish|fade|dims|down|out|end/, { r: sinkDown, size: 0.5 }],
  [/eyes|glow|light|lantern|salute|study|star|feather|petal|shield|heart/, { r: softGlow, size: 0.4 }],
  [/drum/, { r: (o, t) => elementLayer(o, t, 'nature', true, 0.4) && rumble(o, t, 0.6, 0.3, 120), size: 0.5 }],
  [/raven|buzz|click|rustle/, { r: (o, t) => elementLayer(o, t, 'spirit', false, 0.4), size: 0.4 }],
];

const SPECIFIC: Record<string, CueChoice> = {
  lucifero_caduta: { r: (o, t) => swell(o, t, 1.6, 0.3, 120, 3000, 55), size: 0.8 },
  lucifero_caduta_flash: { r: flash, size: 0.5 },
  lucifero_caduta_parried: { r: (o, t) => combat.parry(o, t, defaultParams()) && combat.spezzato(o, t + 0.05, defaultParams()), size: 0.8 },
  lucifero_embers: { r: elementRecipe('fire'), size: 0.6 },
  lucifero_wings_of_fire: { r: (o, t) => whoosh(o, t, 200, 1200, 1, 0.35, 0.7, 'pink') && elementLayer(o, t + 0.2, 'fire', true, 0.6), size: 0.8 },
  porta_rovesciata_opens: { r: (o, t) => world.gate_open(o, t, defaultParams()) && swell(o, t, 2.4, 0.18, 150, 1500, 41), size: 0.8 },
  vuoto_gravity_inverts: { r: world.gravity_flip, size: 0.8 },
  verme_burrow: { r: (o, t) => rumble(o, t, 1.6, 0.45, 110) && sinkDown(o, t, defaultParams()), size: 0.9 },
  verme_emerge: { r: (o, t) => rumble(o, t, 1.2, 0.5, 120) && combat.part_broken(o, t + 0.3, defaultParams()), size: 0.9 },
  verme_swallow: { r: genericCue, voice: 'attack', size: 0.9 },
  verme_split: { r: combat.part_broken, size: 0.9 },
  verme_segment_crumbles: { r: combat.part_broken, size: 0.7 },
  first_light: { r: (o, t) => world.sky_brighten(o, t, defaultParams()), size: 0.5 },
  eruption_warn: { r: (o, t) => rumble(o, t, 2, 0.4, 100), size: 0.8 },
  eruption_flood: { r: elementRecipe('fire'), size: 0.8 },
  loki_laugh: { r: story.ending_laugh, size: 0.5 },
  debug_invincible: { r: ui.ui_toggle, size: 0.2 },
};

export function routeCue(id: string): CueChoice {
  const s = SPECIFIC[id];
  if (s) return s;
  const direct = story[id] ?? combat[id] ?? world[id] ?? ui[id];
  if (direct) return { r: direct, size: 0.5 };
  if (id.startsWith('arena_state:')) return { r: (o, t) => swell(o, t, 1.4, 0.2, 150, 2500, 55), size: 0.6 };
  if (id.startsWith('story_')) return { r: world.story, size: 0.4 };
  if (id.startsWith('gesture') || id.startsWith('ritual')) return { r: story.gesture, size: 0.5 };
  for (const [re, c] of KEYWORDS) if (re.test(id)) return c;
  return { r: genericCue, size: 0.4 };
}

/* ---------------------------------------------------------------------------------------------------------------- */

export class WebAudioDirector implements AudioDirector {
  ctx: AudioContext | null = null;
  mixer: Mixer | null = null;
  music: MusicPlayer | null = null;
  ambience: AmbiencePlayer | null = null;
  lib: MusicLibrary;
  private pools: Partial<Record<BusId, VoicePool>> = {};
  private quality: AudioQuality;
  private userSuspended = false;
  private primed = false;
  private volumes: Settings['volume'] | null = null;
  private readonly p: SfxParams = defaultParams();
  private readonly o: Out;
  private readonly rng = new AudioRng(0x5a11);
  private readonly listener: Listener = { x: 0, y: 0, z: 0, yaw: 0, scale: 1 };
  private readonly sp: SpatialOut = { pan: 0, gain: 1, dist: 0 };
  private listenerYaw: number | null = null;
  private last = new Map<string, number>();
  private familyCache = new Map<string, SwingFamily>();
  private shapeshiftIdx = 0;
  private mode: GameMode = 'boot';
  private musicMode: MusicMode = 'none';
  private storyRelease = Infinity;
  private exploreCue = '';
  private act = 1;
  private bossMusic = '';
  private bossId = '';
  private fightIntensity = 0.5;
  private dialogueUntil = 0;
  private notesTimer = 0;
  private dyingTimer = 0;
  private tod: Tod = 'giorno';

  constructor(quality?: AudioQuality) {
    this.quality = quality ?? WebAudioDirector.guessQuality();
    let music: Record<string, unknown> | undefined;
    try {
      music = content().bundle.music;
    } catch {
      music = undefined;
    }
    this.lib = buildLibrary(music);
    this.o = { ctx: null as unknown as BaseAudioContext, dest: null as unknown as AudioNode, srcs: null, noise: null as unknown as Out['noise'], rng: this.rng };
    if (typeof window !== 'undefined') {
      const onKey = () => {
        this.unlock();
        window.removeEventListener('keydown', onKey);
      };
      window.addEventListener('keydown', onKey);
    }
  }

  static guessQuality(): AudioQuality {
    if (typeof navigator === 'undefined') return 'high';
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    if (cores <= 4 || mem <= 2) return 'low';
    if (cores <= 6 || mem <= 4) return 'medium';
    return 'high';
  }

  /** Build the graph on an existing context (used by unlock and by offline renders/tests). */
  attachContext(ctx: BaseAudioContext): void {
    const mixer = new Mixer(ctx, { reverbMax: REVERB_MAX[this.quality] });
    this.mixer = mixer;
    if (this.volumes) mixer.setVolumes(this.volumes);
    this.music = new MusicPlayer(ctx, mixer.input('music'), mixer.noise, this.lib, this.quality === 'low' ? 0.25 : 0.2);
    this.ambience = new AmbiencePlayer(ctx, mixer.input('ambience'), mixer.noise);
    this.ambience.density = this.quality === 'low' ? 0.6 : 1;
    this.pools = {
      sfx: new VoicePool(ctx, mixer.input('sfx'), VOICES[this.quality]),
      ui: new VoicePool(ctx, mixer.input('ui'), 6),
      voice: new VoicePool(ctx, mixer.input('voice'), 4),
    };
    this.o.ctx = ctx;
    this.o.noise = mixer.noise;
    mixer.setEnv('plains', 0.05);
  }

  setQuality(q: AudioQuality | 'auto'): void {
    this.quality = q === 'auto' ? WebAudioDirector.guessQuality() : q;
    this.pools.sfx?.resize(VOICES[this.quality]);
    if (this.ambience) this.ambience.density = this.quality === 'low' ? 0.6 : 1;
  }

  /** Camera yaw for panning (the app may set it each frame; otherwise the sim's last camera input is used). */
  setListenerYaw(yaw: number): void {
    this.listenerYaw = yaw;
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* Lifecycle                                                                                                       */
  /* -------------------------------------------------------------------------------------------------------------- */

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.attachContext(this.ctx);
      const ctx = this.ctx;
      ctx.onstatechange = () => {
        // iOS 'interrupted' (call, Siri) or an OS suspension: try to come back unless the app asked for silence
        if (!this.userSuspended && ctx.state !== 'running' && ctx.state !== 'closed') setTimeout(() => this.tryResume(), 350);
      };
      // keep resuming on later gestures (Safari drops the context after interruptions)
      const again = () => {
        if (!this.userSuspended) this.tryResume();
      };
      window.addEventListener('pointerdown', again, { passive: true });
      window.addEventListener('touchend', again, { passive: true });
      window.addEventListener('keydown', again);
    }
    this.tryResume();
    if (!this.primed && this.ctx) {
      // iOS: a silent buffer started inside the gesture unlocks output
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
      this.primed = true;
    }
  }

  private tryResume(): void {
    const c = this.ctx;
    if (c && c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => undefined);
  }

  suspend(): void {
    this.userSuspended = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    this.userSuspended = false;
    this.tryResume();
  }

  setVolumes(v: Settings['volume']): void {
    this.volumes = { ...v };
    this.mixer?.setVolumes(v);
  }

  private get running(): boolean {
    const c = this.mixer?.ctx;
    return !!c && (!(c as AudioContext).state || (c as AudioContext).state === 'running' || !('resume' in c));
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* SFX core                                                                                                        */
  /* -------------------------------------------------------------------------------------------------------------- */

  private params(): SfxParams {
    const p = this.p;
    p.heavy = false;
    p.element = 'physical';
    p.size = 0.5;
    p.pitch = 1;
    p.kind = '';
    p.intensity = 0.5;
    p.flag = false;
    return p;
  }

  /** Rate limiter: false if `key` played less than `min` seconds ago. */
  private gate(key: string, min: number): boolean {
    const now = this.mixer ? this.mixer.ctx.currentTime : 0;
    const l = this.last.get(key);
    if (l !== undefined && now - l < min) return false;
    this.last.set(key, now);
    return true;
  }

  /** Play a recipe on a bus voice, optionally spatialized. */
  play(recipe: Recipe, p: SfxParams, bus: BusId = 'sfx', prio = 1, pos?: Pos | null, ref = 6, floor = 0.25, gain = 1): void {
    const mixer = this.mixer;
    const pool = this.pools[bus === 'music' || bus === 'ambience' ? 'sfx' : bus];
    if (!mixer || !pool || !this.running) return;
    const ctx = mixer.ctx;
    const now = ctx.currentTime;
    const v = pool.acquire(now, prio);
    if (!v) return;
    const ch = v.ch;
    let pan = 0;
    let g = gain;
    if (pos) {
      spatialize(this.listener, pos.x, pos.y, pos.z, ref, 0.7, floor, this.sp);
      pan = this.sp.pan;
      g *= this.sp.gain;
    }
    if (ch.panner) ch.panner.pan.setValueAtTime(pan, v.start);
    ch.input.gain.setValueAtTime(g, v.start);
    const o = this.o;
    o.dest = ch.input;
    o.srcs = ch.sources;
    let end = v.start + 0.5;
    try {
      end = recipe(o, v.start + 0.005, p);
    } catch {
      /* a recipe must never break the game */
    }
    o.srcs = null;
    ch.busyUntil = Math.max(v.start + 0.05, Number.isFinite(end) ? end : v.start + 1) + 0.05;
    ch.prio = prio;
    ch.started = now;
  }

  playUi(id: string): void {
    const key = UI_ALIAS[id] ?? (ui[id] ? id : `ui_${id}`);
    const r = ui[key] ?? ui.ui_move;
    if (!this.gate(key, 0.03)) return;
    this.play(r, this.params(), 'ui', 2);
  }

  private cue(id: string, sim: Sim, pos?: Pos | null, actor?: number): void {
    const c = routeCue(id);
    if (!this.gate(`cue:${id}`, 0.08)) return;
    const a = actor !== undefined ? sim.actorById(actor) : sim.boss;
    const at = pos ?? a?.pos ?? null;
    if (c.voice && a?.bossDef) {
      const v = bossVoice(a.bossDef.id, a.bossDef.model.rig);
      const p = this.params();
      this.play((o, t) => bossVoiceSfx(o, t, v.family, v.size, c.voice!, !!v.dark), p, 'sfx', 3, at, 10, 0.45);
      return;
    }
    const p = this.params();
    p.size = c.size;
    this.play(c.r, p, 'sfx', 2, at, 9, 0.35);
  }

  private familyOf(weapon: string): SwingFamily {
    let f = this.familyCache.get(weapon);
    if (!f) {
      let type: string | undefined;
      let cat: string | undefined;
      try {
        const w = content().weapon(weapon);
        type = w.type;
        cat = w.category;
      } catch {
        type = weapon;
      }
      f = swingFamily(type, cat);
      this.familyCache.set(weapon, f);
    }
    return f;
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* Events                                                                                                          */
  /* -------------------------------------------------------------------------------------------------------------- */

  onEvent(e: SimEvent, sim: Sim): void {
    if (!this.mixer) return;
    const mixer = this.mixer;
    const now = mixer.ctx.currentTime;
    let p: SfxParams;
    switch (e.type) {
      /* ----- player combat ----- */
      case 'swing': {
        p = this.params();
        p.heavy = e.kind === 'heavy' || e.kind === 'running' || e.kind === 'jumping';
        p.flag = /thrust|stab|affond|lunge|poke/.test(e.anim) || /thrust|stab|affond/.test(e.swing);
        let fam = this.familyOf(e.weapon);
        if (fam === 'shapeshift') fam = SHAPESHIFT_CYCLE[this.shapeshiftIdx++ % SHAPESHIFT_CYCLE.length];
        this.play((o, t, pp) => swing(o, t, pp, fam), p, 'sfx', 2);
        break;
      }
      case 'hit': {
        if (e.kind === 'grace') break; // graceHit carries the big one
        if (!this.gate(`hit:${e.target}`, 0.045)) break;
        p = this.params();
        p.heavy = e.heavy || e.amount > 60;
        p.element = e.element;
        p.flag = !!e.weak;
        p.pitch = e.target === -1 ? 0.85 : 1;
        this.play(combat.hit, p, 'sfx', 3, e.pos, 8, 0.4);
        if (p.heavy) mixer.impact(0.25, 0.1);
        break;
      }
      case 'playerHurt':
        p = this.params();
        p.heavy = e.heavy;
        p.element = e.element;
        p.flag = e.knockdown;
        this.play(combat.player_hurt, p, 'sfx', 4);
        mixer.impact(e.heavy ? 0.5 : 0.25, 0.15);
        break;
      case 'perfectDodge':
        this.play(combat.perfect_dodge, this.params(), 'sfx', 4);
        mixer.impact(0.35, 0.3);
        break;
      case 'dodgeAvoid':
        if (this.gate('dodgeAvoid', 0.2)) this.play(combat.dodge_avoid, this.params(), 'sfx', 1);
        break;
      case 'parry':
        this.play(combat.parry, this.params(), 'sfx', 4, e.pos, 8, 0.6);
        mixer.impact(0.45, 0.2);
        break;
      case 'block':
        p = this.params();
        p.pitch = e.amount > 40 ? 0.8 : 1;
        this.play(combat.block, p, 'sfx', 3);
        break;
      case 'guardBreak':
        this.play(combat.guard_break, this.params(), 'sfx', 4);
        mixer.impact(0.5, 0.2);
        break;
      case 'counter':
        this.play(combat.counter, this.params(), 'sfx', 3, e.pos);
        break;
      /* ----- boss ----- */
      case 'attackTelegraph': {
        const a = sim.actorById(e.actor);
        if (e.red) {
          // the Colpo Rosso cue is always identical and always heard
          this.play(combat.red_warning, this.params(), 'sfx', 5);
          mixer.impact(0.3, 0.3);
        }
        if (!a) break;
        const sfx = a.attack?.def.sfx;
        if (sfx && !e.red) {
          // attack-specific sound is played on activation; the telegraph gets a voice / wind-up
        }
        if (a.bossDef && this.gate(`voice:${e.actor}`, 2.6) && this.rng.chance(0.55)) {
          const v = bossVoice(a.bossDef.id, a.bossDef.model.rig);
          this.play((o, t) => bossVoiceSfx(o, t, v.family, v.size, 'attack', !!v.dark), this.params(), 'sfx', 2, a.pos, 10, 0.45);
        }
        if (e.duration > 0.55 && !e.red) {
          p = this.params();
          p.size = Math.min(1.5, e.duration);
          this.play(combat.windup, p, 'sfx', 1, a.pos, 10, 0.35);
        }
        break;
      }
      case 'attackActive': {
        const a = sim.actorById(e.actor);
        if (!a || !this.gate(`act:${e.actor}`, 0.22)) break;
        const sfx = a.attack?.def.sfx;
        if (sfx) {
          this.cue(sfx, sim, a.pos, e.actor);
          break;
        }
        p = this.params();
        p.size = Math.min(1, (a.bossDef ? bossVoice(a.bossDef.id, a.bossDef.model.rig).size : 0.4) * Math.max(0.5, a.scale));
        this.play(combat.boss_whoosh, p, 'sfx', 2, a.pos, 10, 0.35);
        break;
      }
      case 'bossPhase': {
        this.play(combat.boss_phase, this.params(), 'sfx', 4);
        const a = sim.actorById(e.actor);
        if (a?.bossDef) {
          const v = bossVoice(a.bossDef.id, a.bossDef.model.rig);
          this.play((o, t) => bossVoiceSfx(o, t + 0.3, v.family, v.size, 'roar', !!v.dark), this.params(), 'sfx', 4, a.pos, 12, 0.6);
        }
        const cue = e.music ?? `${this.bossMusic || `boss_${e.boss}`}_p${e.phase + 1}`;
        if (this.musicMode === 'fight' && this.music) this.music.play(cue, { act: this.act, encounter: e.boss, maxWait: 2.5 });
        break;
      }
      case 'spezzato':
        this.play(combat.spezzato, this.params(), 'sfx', 4, e.pos, 10, 0.6);
        mixer.impact(0.6, 0.35);
        break;
      case 'grace':
        this.play(combat.grace, this.params(), 'sfx', 5);
        mixer.impact(0.7, 1.1);
        break;
      case 'graceHit':
        this.play(combat.grace_hit, this.params(), 'sfx', 5);
        mixer.impact(1, 0.6);
        break;
      case 'partBroken':
        this.play(combat.part_broken, this.params(), 'sfx', 3, e.pos, 10, 0.5);
        break;
      case 'partRegrown':
        this.play(combat.part_regrown, this.params(), 'sfx', 2);
        break;
      case 'bossDefeated': {
        p = this.params();
        const v = bossVoice(e.boss);
        p.flag = !!v.dark;
        this.play(combat.boss_defeat, p, 'sfx', 5);
        const a = sim.actorById(e.actor);
        this.play((o, t) => bossVoiceSfx(o, t, v.family, v.size, 'death', !!v.dark), this.params(), 'sfx', 4, a?.pos ?? null, 14, 0.6);
        mixer.impact(0.8, 1.2);
        this.musicMode = 'victory';
        this.music?.stop(1.4);
        this.music?.play('victory', { act: this.act, encounter: e.boss, maxWait: 0.1, fadeIn: 0.8 });
        break;
      }
      /* ----- projectiles, hazards, explosions ----- */
      case 'projectile': {
        if (!this.gate(`proj:${e.kind}`, 0.07)) break;
        const def = content().projectile(e.kind);
        p = this.params();
        p.kind = def?.visual ?? e.kind;
        p.element = def?.element ?? 'physical';
        p.flag = e.team !== 'player';
        const pr = sim.projectiles;
        let at: Pos | null = null;
        pr.forEach?.((q: { id: number; pos: Pos }) => {
          if (q.id === e.id) at = q.pos;
        });
        this.play(projectileLaunch, p, 'sfx', 1, at, 10, 0.3);
        break;
      }
      case 'projectileHit': {
        if (!this.gate(`ph:${e.kind}`, 0.06)) break;
        const def = content().projectile(e.kind);
        p = this.params();
        p.kind = def?.visual ?? e.kind;
        p.element = def?.element ?? 'physical';
        this.play(projectileHit, p, 'sfx', 2, e.pos, 8, 0.3);
        break;
      }
      case 'explosion':
        if (!this.gate('explosion', 0.08)) break;
        p = this.params();
        p.size = Math.min(1, e.radius / 10);
        p.element = e.element;
        this.play(explosion, p, 'sfx', 3, e.pos, 12, 0.4);
        mixer.impact(Math.min(0.6, 0.15 + e.radius / 20), 0.2);
        break;
      case 'shockwave':
        if (!this.gate('shockwave', 0.1)) break;
        p = this.params();
        p.size = Math.min(1, e.radius / 12);
        p.element = e.element;
        this.play(shockwave, p, 'sfx', 3, e.pos, 12, 0.4);
        break;
      case 'hazard': {
        if (!this.gate(`hz:${e.kind}`, 0.15)) break;
        const def = content().hazard(e.kind);
        const tele = (def as { telegraph?: number } | undefined)?.telegraph ?? 1;
        p = this.params();
        p.kind = def?.visual ?? e.kind;
        p.size = tele;
        this.play(hazardTelegraph, p, 'sfx', 2, null);
        const kind = p.kind;
        this.play((o, t, pp) => hazardErupt(o, t + Math.max(0.05, tele), { ...pp, kind }), p, 'sfx', 2, null);
        break;
      }
      case 'cue':
        this.cue(e.id, sim, e.pos ?? null, e.actor);
        break;
      case 'sfx':
        this.cue(e.id, sim, e.pos ?? null);
        break;
      /* ----- player actions & world ----- */
      case 'footstep': {
        p = this.params();
        p.size = sim.player.scale;
        p.flag = e.sprint;
        const s = surfaceOf(e.surface);
        this.play((o, t, pp) => footstep(o, t, pp, s), p, 'sfx', 0, null, 6, 0.3, 0.8);
        break;
      }
      case 'jump':
        this.play(world.jump, this.params(), 'sfx', 1);
        break;
      case 'land':
        p = this.params();
        p.heavy = e.hard;
        this.play(world.land, p, 'sfx', 1);
        break;
      case 'dodge':
        p = this.params();
        p.flag = e.backstep;
        this.play(world.dodge, p, 'sfx', 2);
        break;
      case 'drink':
        this.play(e.healed ? world.drink : world.vial_empty, this.params(), 'sfx', 2);
        break;
      case 'weaponSwap':
        this.play(world.weapon_swap, this.params(), 'sfx', 2);
        break;
      case 'transizione':
        this.play(world.transizione, this.params(), 'sfx', 3);
        break;
      case 'art': {
        p = this.params();
        p.kind = e.effect;
        p.flag = e.which === 'seconda';
        try {
          p.element = content().weapon(e.weapon).element ?? 'physical';
        } catch {
          p.element = 'physical';
        }
        this.play(art, p, 'sfx', 3);
        break;
      }
      case 'artHit':
        if (!this.gate('artHit', 0.06)) break;
        p = this.params();
        p.heavy = true;
        this.play(combat.hit, p, 'sfx', 2, e.pos, 8, 0.35);
        break;
      case 'metamondoReady':
        this.play(world.meta_ready, this.params(), 'sfx', 3);
        break;
      case 'metamondoStart':
        p = this.params();
        p.kind = e.form;
        p.flag = e.forced;
        this.play(world.meta_start, p, 'sfx', 4);
        mixer.impact(0.6, 1);
        break;
      case 'metamondoEnd':
        this.play(world.meta_end, this.params(), 'sfx', 3);
        break;
      case 'metamondoReaction':
        this.play(world[`meta_${e.reaction}`] ?? world.meta_end, this.params(), 'sfx', 4);
        break;
      case 'weaponObtained':
        this.play(world.weapon_obtained, this.params(), 'sfx', 4);
        break;
      case 'formUnlocked':
        this.play(world.form_unlocked, this.params(), 'sfx', 4);
        break;
      case 'itemObtained':
        this.play(world.item_obtained, this.params(), 'sfx', 3);
        break;
      case 'reperto':
        this.play(world.reperto, this.params(), 'sfx', 3);
        break;
      case 'vista':
        this.play(world.vista, this.params(), 'sfx', 3);
        break;
      case 'gateLock':
        this.play(world.gate_lock, this.params(), 'sfx', 3);
        break;
      case 'gateOpen':
        this.play(world.gate_open, this.params(), 'sfx', 3);
        break;
      case 'skyBrighten':
        this.play(world.sky_brighten, this.params(), 'sfx', 3);
        break;
      case 'gravityFlip':
        this.play(world.gravity_flip, this.params(), 'sfx', 3);
        break;
      case 'scale':
        p = this.params();
        p.size = e.scale;
        this.play(world.scale_change, p, 'sfx', 3);
        break;
      case 'echo':
        if (e.active) this.play(world.echo, this.params(), 'sfx', 2);
        break;
      case 'status':
        if (!this.gate(`status:${e.kind}`, 1)) break;
        p = this.params();
        p.kind = e.kind;
        this.play(world.status, p, 'sfx', 2);
        break;
      case 'timeOfDay':
        p = this.params();
        p.kind = e.tod;
        this.play(world.tod_change, p, 'sfx', 3);
        this.tod = e.tod;
        this.ambience?.setTod(e.tod);
        break;
      case 'altarDiscovered':
        this.play(world.altar_discovered, this.params(), 'sfx', 3);
        break;
      case 'altarRest':
        this.play(world.altar_rest, this.params(), 'sfx', 3);
        this.setMusicMode('altar');
        break;
      case 'zoneEnter':
        this.play(world.zone_enter, this.params(), 'sfx', 1);
        if (this.musicMode !== 'fight') this.setMusicMode('explore');
        break;
      /* ----- life & death ----- */
      case 'playerDied':
        this.play(world.player_death, this.params(), 'sfx', 5);
        this.setMusicMode('dead');
        break;
      case 'respawn':
        this.play(world.respawn, this.params(), 'sfx', 4);
        this.dyingTimer = 1.5;
        this.setMusicMode('explore');
        break;
      /* ----- fights & music ----- */
      case 'fightStart': {
        let music = `boss_${e.boss}`;
        try {
          music = content().boss(e.boss).music;
        } catch {
          /* unknown boss: generated theme */
        }
        this.bossMusic = music;
        this.bossId = e.boss;
        mixer.setEnv(envForArena(e.arena) ?? envForAmbience(sim.zone?.def.ambience ?? ''), 1.5);
        this.setMusicMode('fight');
        break;
      }
      case 'fightEnd':
        if (!e.won && this.musicMode === 'fight') this.setMusicMode('explore');
        if (sim.zone) mixer.setEnv(this.lib.ambience.get(sim.zone.def.ambience)?.env ?? envForAmbience(sim.zone.def.ambience), 2);
        break;
      case 'music': {
        const c = e.cue;
        if (c === 'stop' || c === 'none' || c === 'silence') {
          this.music?.stop(2.5, true);
          this.musicMode = 'story';
          this.storyRelease = Infinity;
        } else {
          this.musicMode = 'story';
          this.storyRelease = Infinity;
          this.music?.play(c, { act: this.act, maxWait: 1.2, fadeIn: 2 });
        }
        break;
      }
      case 'sequenceEnd':
        if (this.musicMode === 'story') this.storyRelease = now + 10;
        break;
      case 'credits':
        this.setMusicMode('credits');
        break;
      /* ----- voices ----- */
      case 'dialogue':
        this.speak(e.speaker, e.key, false);
        break;
      case 'voce':
        this.speak('voce', e.key, true);
        break;
      default:
        break;
    }
  }

  private speak(speakerId: string, key: string, ethereal: boolean): void {
    const mixer = this.mixer;
    if (!mixer || !this.running) return;
    let v: VoiceTone;
    let sp: { voice: VoiceTone } | undefined;
    try {
      sp = content().speaker(speakerId) as { voice: VoiceTone } | undefined;
    } catch {
      sp = undefined;
    }
    v = sp ? { ...sp.voice } : deriveVoice(speakerId);
    if (speakerId === 'voce') ethereal = true;
    let text = key;
    try {
      text = translate(key);
    } catch {
      text = key;
    }
    const syl = syllablesFor(text);
    const seed = hashString(key);
    const eth = ethereal;
    let endAt = 0;
    this.play((o, t) => (endAt = murmur(o, t, v, syl, seed, eth)), this.params(), 'voice', 3);
    mixer.setDialogue(true);
    this.dialogueUntil = Math.max(this.dialogueUntil, endAt || mixer.ctx.currentTime + syl * 0.16);
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* Music state                                                                                                     */
  /* -------------------------------------------------------------------------------------------------------------- */

  private setMusicMode(m: MusicMode): void {
    const music = this.music;
    const prev = this.musicMode;
    this.musicMode = m;
    if (!music || !this.running) {
      if (prev !== m) this.musicMode = m;
      return;
    }
    const mixer = this.mixer!;
    mixer.musicDuckExtra = 0;
    switch (m) {
      case 'title':
        music.play('title', { act: 1, maxWait: 0.5, fadeIn: 2.5 });
        break;
      case 'credits':
        music.play('titoli', { act: 7, maxWait: 1, fadeIn: 2.5 });
        break;
      case 'fight':
        music.play(this.bossMusic, { act: this.act, encounter: this.bossId, maxWait: 0.35, fadeIn: 0.5, fadeOut: 1.2, phase: 0 });
        break;
      case 'altar':
        music.play('altar', { act: this.act, maxWait: 1.5, fadeIn: 3, fadeOut: 2.5 });
        break;
      case 'dead':
        music.stop(2.5);
        break;
      case 'explore':
        if (this.exploreCue) music.play(this.exploreCue, { act: this.act, maxWait: 2, fadeIn: 4, fadeOut: 3 });
        else music.stop(3);
        break;
      default:
        break;
    }
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* Frame update                                                                                                    */
  /* -------------------------------------------------------------------------------------------------------------- */

  update(dt: number, sim: Sim | null, mode: GameMode): void {
    const mixer = this.mixer;
    if (!mixer || !this.music || !this.ambience) {
      this.mode = mode;
      return;
    }
    const running = this.running;
    const now = mixer.ctx.currentTime;
    // mode-driven music
    if (mode !== this.mode || (running && this.musicMode === 'none')) {
      const prevMode = this.mode;
      this.mode = mode;
      if (running) {
        if (mode === 'title' || mode === 'creator') {
          if (this.musicMode !== 'title') this.setMusicMode('title');
          this.ambience.stop(2);
        } else if (mode === 'credits') this.setMusicMode('credits');
        else if (mode === 'game' && (prevMode !== 'game' || this.musicMode === 'none' || this.musicMode === 'title' || this.musicMode === 'credits')) this.musicMode = 'none';
      }
    }
    if (sim && (mode === 'game' || mode === 'ending')) this.updateGame(dt, sim, now);
    if (now > this.dialogueUntil && this.dialogueUntil > 0) {
      mixer.setDialogue(false);
      this.dialogueUntil = 0;
    }
    mixer.update(dt);
    if (running) {
      this.music.update();
      this.ambience.update();
    }
  }

  private updateGame(dt: number, sim: Sim, now: number): void {
    const mixer = this.mixer!;
    const music = this.music!;
    const pl = sim.player;
    // listener: player position, camera yaw
    const L = this.listener;
    L.x = pl.pos.x;
    L.y = pl.pos.y + 1.4 * pl.scale;
    L.z = pl.pos.z;
    L.scale = pl.scale;
    L.yaw = this.listenerYaw ?? (sim as unknown as { lastInput?: { camYaw?: number } }).lastInput?.camYaw ?? pl.yaw;
    // zone: ambience + exploration cue
    const z = sim.zone;
    if (z) {
      const id = z.def.ambience;
      if (this.ambience!.currentId !== id) {
        const spec = this.lib.ambience.get(id) ?? generateAmbience(id, z.def.act);
        this.ambience!.set(id, spec, 3);
        if (!sim.fight || !sim.fight.active) mixer.setEnv(spec.env ?? envForAmbience(id), 2);
        this.act = z.def.act;
        this.exploreCue = z.def.music ?? `explore_act${z.def.act}`;
        if (this.musicMode === 'explore') this.setMusicMode('explore');
      }
    }
    const tod = sim.state.timeOfDay as Tod;
    if (tod && tod !== this.tod) {
      this.tod = tod;
      this.ambience!.setTod(tod);
    }
    // statuses: Silenzio (mute) and madness
    const st = pl.statuses;
    mixer.setMute((st.mute ?? 0) > 0);
    mixer.setMadness((st.madness ?? 0) > 0 ? Math.min(1, 0.55 + 0.45 * (pl.statusPower.madness ?? 0.5)) : 0);
    // Portatore theme progression (cheap, but throttled anyway)
    this.notesTimer -= dt;
    if (this.notesTimer <= 0) {
      this.notesTimer = 1;
      music.themeNotes = sim.themeNotes();
    }
    // fight state safety: a fight that started without its event (direct starts) still gets its music
    const f = sim.fight;
    if (f && f.active && !f.ended && this.musicMode !== 'fight' && this.musicMode !== 'victory' && this.musicMode !== 'dead') {
      if (this.bossId !== f.boss) {
        this.bossId = f.boss;
        try {
          this.bossMusic = sim.c.boss(f.boss).music;
        } catch {
          this.bossMusic = `boss_${f.boss}`;
        }
      }
      if (this.musicMode !== 'story') this.setMusicMode('fight');
    }
    // adaptive intensity
    if (this.musicMode === 'fight' && sim.boss) {
      const b = sim.boss;
      const lost = b.hpMax > 0 ? 1 - Math.max(0, b.hp) / b.hpMax : 0;
      const low = pl.hp < pl.hpMax * 0.3 ? 0.15 : 0;
      this.fightIntensity = Math.min(1, 0.45 + lost * 0.4 + low);
      music.intensity = this.fightIntensity;
      this.ambience!.output.gain.setTargetAtTime(0.5, now, 0.8);
    } else {
      music.intensity = this.tod === 'notte' ? 0.25 : 0.35;
      this.ambience!.output.gain.setTargetAtTime(1, now, 1.5);
    }
    // transitions out of transient music modes
    if (this.musicMode === 'none' && this.mode === 'game') this.setMusicMode(sim.fight?.active ? 'fight' : 'explore');
    if (this.musicMode === 'victory' && !music.current) this.setMusicMode('explore');
    if (this.musicMode === 'altar' && !sim.altarOpen) this.setMusicMode('explore');
    if (this.musicMode === 'story' && now > this.storyRelease) {
      const c = music.current;
      if (!c || c.kind !== 'stinger') this.setMusicMode('explore');
    }
    if (this.musicMode === 'dead') {
      mixer.musicDuckExtra = 0.6;
    } else if (this.dyingTimer > 0) {
      this.dyingTimer -= dt;
    }
  }
}

export function hasWebAudio(): boolean {
  return typeof window !== 'undefined' && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}
