/**
 * Content type contract. Mirrors the YAML schemas in /data (validated by tools/build-data.ts with zod).
 * Every def here is plain JSON so the sim can run headless in Node.
 *
 * Local frames: +Z forward, +Y up, +X = the owner's LEFT (Three.js object space). Units: meters, seconds, radians unless the
 * field name says deg.
 */
import type { Vec3T } from './math';

export type { Vec3T };

export type BossClass = 'mini' | 'secondary' | 'principal';
export type TimeOfDay = 'alba' | 'giorno' | 'tramonto' | 'notte';
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['alba', 'giorno', 'tramonto', 'notte'];
export type Lang = 'it' | 'en';

export type Element =
  | 'physical' | 'fire' | 'ice' | 'lightning' | 'void' | 'light' | 'poison' | 'water' | 'nature' | 'spirit' | 'chaos' | 'blood';

/**
 * Hit flags. `red` = Colpo Rosso (unparryable, must be dodged). `unblockable` = guard does not help either.
 * Status flags apply a status to the player on hit.
 */
export type HitFlag =
  | 'red' | 'unblockable' | 'projectile' | 'dot' | 'grab' | 'knockdown' | 'knockback' | 'launch'
  | 'slow' | 'freeze' | 'burn' | 'blind' | 'mute' | 'madness' | 'poison' | 'unavoidable' | 'parry_final';

export type StatusKind = 'slow' | 'freeze' | 'burn' | 'blind' | 'mute' | 'madness' | 'poison' | 'void' | 'root';

/* ----------------------------------------------------------------------------------------------------------------- */
/* Shapes                                                                                                             */
/* ----------------------------------------------------------------------------------------------------------------- */

export type ShapeDef =
  | { type: 'sphere'; c: Vec3T; r: number }
  | { type: 'capsule'; a: Vec3T; b: Vec3T; r: number }
  /** Horizontal sector around c (default owner origin): radius r, optional inner radius, full angle in degrees, yaw offset in degrees, vertical band y. */
  | { type: 'arc'; r: number; r_in?: number; angle: number; yaw?: number; y?: [number, number]; c?: Vec3T }
  | { type: 'box'; c: Vec3T; half: Vec3T; yaw?: number }
  /** Expanding ring from r0 to r1 over the hit window; `width` = ring thickness; hits only targets near the ground (height). */
  | { type: 'ring'; r0: number; r1: number; width: number; height?: number; c?: Vec3T }
  | { type: 'cylinder'; c: Vec3T; r: number; h: number };

/* ----------------------------------------------------------------------------------------------------------------- */
/* Boss attacks                                                                                                       */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface HitWindowDef {
  /** Start time relative to the beginning of the active window. */
  t: number;
  dur: number;
  shape: ShapeDef;
  damage_mult?: number;
  flags?: HitFlag[];
  /** Shape is local to this part's anchor instead of the root. */
  part?: string;
  /** For continuous attacks (breath): re-hit interval in seconds. */
  tick?: number;
  element?: Element;
  status?: { kind: StatusKind; dur: number; power?: number };
}

export type MotionType =
  | 'forward' | 'toward_target' | 'leap_to_target' | 'retreat' | 'strafe_left' | 'strafe_right'
  | 'teleport_behind' | 'teleport_random' | 'teleport_far' | 'rise' | 'descend' | 'orbit' | 'charge_through' | 'hover' | 'to_center'
  | 'dive_to_target' | 'land';

export interface MotionDef {
  /** Start relative to active start (may be negative to begin during telegraph). */
  t: number;
  dur: number;
  type: MotionType;
  speed?: number;
  height?: number;
  dist?: number;
  /** Max steering toward target during the motion (rad/s). */
  track?: number;
}

export type SpawnAt =
  | 'self' | 'front' | 'target' | 'target_predict' | 'random_arena' | 'around_target' | 'line_to_target' | 'ring_self' | 'grid' | 'sky_above_target' | 'arena_center' | 'part';

export interface SpawnDef {
  t: number;
  type: 'projectile' | 'hazard' | 'shockwave' | 'beam' | 'minion' | 'custom' | 'vfx' | 'sfx';
  /** Projectile/hazard kind id (visual + default params), minion id, or custom event name. */
  id?: string;
  count?: number;
  spread?: number; // degrees
  speed?: number;
  accel?: number;
  homing?: number; // rad/s
  gravity?: number;
  radius?: number;
  life?: number;
  from?: Vec3T;
  part?: string;
  at?: SpawnAt;
  /** Distance used by 'front' / 'around_target' / 'line_to_target' spacing. */
  dist?: number;
  delay?: number; // hazard telegraph time before it becomes active
  active?: number; // hazard active duration
  shape?: ShapeDef;
  damage_mult?: number;
  flags?: HitFlag[];
  interval?: number;
  repeat?: number;
  status?: { kind: StatusKind; dur: number; power?: number };
  element?: Element;
  /** Pitch for projectiles in degrees (positive up). */
  pitch?: number;
  /** Custom event name delivered to the boss behavior. */
  event?: string;
  /** Hazards only: pull the player toward the hazard center (m/s at the center). */
  pull?: number;
  vfx?: string;
  sfx?: string;
}

export interface AttackDef {
  id: string;
  /** Animation keyword for the renderer pose library. */
  anim?: string;
  telegraph: number;
  active: number;
  recovery: number;
  damage_mult: number;
  /** Stagger power against the player (>= 25 knocks down). */
  poise: number;
  flags: HitFlag[];
  /** Distance filter [min, max] for selection. */
  range?: [number, number];
  weight?: number;
  cooldown?: number;
  /** Turn-rate multiplier during telegraph (default 1). */
  track?: number;
  /** Turn-rate multiplier during active (default 0: never tracks through the whole active window). */
  track_active?: number;
  hits?: HitWindowDef[];
  motion?: MotionDef[];
  spawns?: SpawnDef[];
  element?: Element;
  sfx?: string;
  vfx?: string;
  /** Which part performs it (multi-head bosses); attack unavailable if part is inactive/broken. */
  part?: string;
  /** Behavior condition keyword (e.g. 'mounted', 'airborne', 'grounded'). */
  requires?: string;
  /** Chain directly into another attack (skipping idle). */
  combo_next?: string;
  combo_chance?: number;
  /** Arena-wide attack: ignores range filter. */
  global?: boolean;
  /** Name key for named signature moves (shown nowhere, used by the Dio dei Draghi trial and Cthulhu nightmare). */
  signature?: string;
}

export interface PhaseDef {
  id: string;
  hp_range: [number, number];
  music?: string;
  patterns: string[];
  on_enter?: string[];
  speed_mult?: number;
  aggression?: number;
  opener?: string;
  arena_state?: string;
  dialogue?: string;
  /** Seconds of invulnerable transition (roar) when entering this phase (default 2.0, first phase 0). */
  transition?: number;
}

export interface PartDef {
  id: string;
  hurt: { c: Vec3T; r: number }[];
  damage_mult?: number;
  poise_mult?: number;
  /** Breakable part HP as a fraction of boss HP. */
  hp?: number;
  /** Own Equilibrio bar (multi-head). */
  equilibrio?: number;
  lockable?: boolean;
  active?: boolean;
  regrow?: number;
  name_key?: string;
  /** Damage dealt to this part also reduces the main bar by this factor (default 1). */
  main_share?: number;
}

export interface TodVariantDef {
  speed_mult?: number;
  aggression?: number;
  weights?: Record<string, number>;
  opener?: string;
  spawn_mult?: number;
  projectile_speed_mult?: number;
  note_key?: string;
  flags?: string[];
}

export interface MinionDef {
  id: string;
  name_key?: string;
  hp: number; // fraction of boss HP
  body: { radius: number; height: number };
  move: { walk: number; run: number; turn: number; preferred_range: [number, number]; flying?: boolean; hover_height?: number };
  attacks: AttackDef[];
  idle_gap: [number, number];
  model: { builder: string; rig: string; scale: number; palette: string };
  hurt?: { c: Vec3T; r: number }[];
  /** Damage dealt to it is shared with the main boss bar (default 0). */
  main_share?: number;
  equilibrio?: number;
}

export interface BossDef {
  id: string;
  order: number;
  name_key: string;
  title_key?: string;
  class: BossClass;
  difficulty: number;
  act: number;
  arena: string;
  zone: string;
  mounted?: boolean;
  model: { builder: string; rig: string; scale: number; palette: string };
  equilibrio_max: number;
  body: { radius: number; height: number; mass?: 'light' | 'heavy' | 'immovable' };
  hurtboxes?: { c: Vec3T; r: number }[];
  parts?: PartDef[];
  move: { walk: number; run: number; turn: number; preferred_range: [number, number]; flying?: boolean; hover_height?: number };
  idle_gap: [number, number];
  phases: PhaseDef[];
  attacks: AttackDef[];
  minions?: MinionDef[];
  time_of_day_variants: Partial<Record<TimeOfDay, TodVariantDef>>;
  dialogue_keys: string[];
  /** Flavor/lore key for secondary bosses (shown in the Specchio dei Ricordi). */
  lore_key?: string;
  drops_weapon: string | null;
  unlocks_form: string | null;
  music: string;
  intro_sequence?: string;
  defeat_sequence?: string;
  metamondo_reaction?: 'shatter' | 'rewrite' | 'devour' | null;
  /** Scripted encounter (Lucifero I): cannot be won by damage. */
  scripted?: boolean;
  hp_override?: number;
  /** Behavior module id (default = id). */
  behavior?: string;
  /** Extra rules for New Game+ (Ciclo dell'Alba): new aggressive patterns added. */
  ng_plus?: { add_patterns?: Record<string, string[]>; speed_mult?: number; idle_mult?: number };
  /** Key items granted on defeat. */
  grants?: string[];
  /** Brightens the sky by one shade (principal bosses). */
  brightens_sky?: boolean;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Weapons                                                                                                            */
/* ----------------------------------------------------------------------------------------------------------------- */

export const WEAPON_TYPES = [
  'spada_corta', 'lancia', 'spada_lunga', 'bastone_magico', 'mazza', 'spada_serpentina', 'alabarda', 'catene', 'spadone',
  'martello_da_guerra', 'stocco', 'ascia_a_due_mani', 'pugni', 'artigli', 'scudo', 'tomo', 'katana', 'asce_gemelle', 'totem',
  'arco_lungo', 'balestra', 'arpione', 'kama_gemelle', 'lama_a_tenaglia', 'pugnali', 'cesoie', 'naginata', 'tridente',
  'astrolabio', 'frusta', 'scimitarra', 'spada_bastarda', 'flagello', 'chakram', 'trivella', 'falce', 'scettro', 'arma_mutaforma',
] as const;
export type WeaponType = (typeof WEAPON_TYPES)[number];

export type TransitionCategory = 'one_handed' | 'two_handed' | 'polearm' | 'ranged' | 'catalyst' | 'fist' | 'flexible';
export const TRANSITION_CATEGORIES: readonly TransitionCategory[] = ['one_handed', 'two_handed', 'polearm', 'ranged', 'catalyst', 'fist', 'flexible'];

export const PARRY_TYPES: readonly WeaponType[] = ['scudo', 'spada_lunga', 'spada_bastarda', 'stocco', 'katana', 'scimitarra'];

export type ArtEffect =
  | 'dash_strike' | 'spin' | 'multi_strike' | 'counter_stance' | 'projectile' | 'rain' | 'ground_wave' | 'slam' | 'grab_pull'
  | 'buff_self' | 'bind' | 'hazard_zone' | 'barrier' | 'decoy' | 'beam' | 'chain_lightning' | 'black_hole' | 'throw_return'
  | 'burrow' | 'dot_stab' | 'shape_shift' | 'cone_breath' | 'tentacle_ring' | 'waves';

export interface ArtDef {
  id: string;
  eco_cost: number;
  effect: ArtEffect;
  params: Record<string, number | string | boolean>;
  name_key?: string;
  desc_key?: string;
  /** Visual id for the renderer's Art VFX library. */
  vfx?: string;
  sfx?: string;
  anim?: string;
}

export interface WeaponDef {
  id: string;
  name_key: string;
  desc_key: string;
  type: WeaponType;
  category: TransitionCategory;
  source_boss: string | null;
  source_difficulty: number;
  parry_capable: boolean;
  model: { template: string; motif: string; glow: string; colors?: { primary: string; secondary: string; accent: string }; params?: Record<string, number | string | boolean> };
  stamina_cost: { light: number; heavy: number };
  moveset: { light: string; heavy: string; running: string; jumping: string };
  arts: { prima: ArtDef; seconda: ArtDef };
  flavor_key?: string;
  element?: Element;
  /** Usable only from New Game+ (Lama dell'Abisso Sognante). */
  ng_plus_only?: boolean;
  /** Delivered by a story event instead of on boss defeat (Scettro after the final victory). */
  delivered_by?: string;
  starter?: boolean;
}

export interface SwingDef {
  id: string;
  anim: string;
  startup: number;
  active: number;
  recovery: number;
  damage_mult: number;
  poise: number;
  /** Optional stamina override; defaults to the weapon's light/heavy cost. */
  stamina?: number;
  /** Player-local hitbox (scaled by player scale). Absent for pure projectile swings. */
  shape?: ShapeDef;
  /** Forward lunge during startup+active. */
  move?: { speed: number; dur: number };
  projectile?: { kind: string; speed: number; radius: number; life: number; count?: number; spread?: number; gravity?: number; homing?: number; pierce?: boolean; explode_radius?: number; returns?: boolean };
  /** Time into recovery after which a buffered follow-up may cancel the rest. */
  cancel?: number;
  /** Number of hit ticks during the active window (re-hits allowed for multi-hit swings). */
  hits?: number;
  /** Swing-arc for the renderer: from/to [yaw, pitch] in degrees, roll in degrees, relative to the player. */
  arc?: { from: [number, number]; to: [number, number]; roll?: number; hand?: 'r' | 'l' | 'both' };
  element?: Element;
}

export interface MovesetDef {
  id: string;
  type: WeaponType;
  grip: 'one_hand' | 'two_hand' | 'dual' | 'bow' | 'catalyst' | 'fist' | 'flexible' | 'shield' | 'polearm';
  reach: number;
  guard: { absorption: number };
  swings: Record<string, SwingDef | SwingDef[]>;
}

export interface TransitionDef {
  id: string;
  from: TransitionCategory;
  to: TransitionCategory;
  name_key: string;
  anim: string;
  /** Linking move: a hit with this shape, plus optional projectile and motion. */
  shape?: ShapeDef;
  damage_mult: number;
  poise: number;
  duration: number;
  move?: { speed: number; dur: number };
  projectile?: SwingDef['projectile'];
  vfx?: string;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Metamondo                                                                                                          */
/* ----------------------------------------------------------------------------------------------------------------- */

export type FormAbility = 'respiro_libero' | 'riflessi' | 'statura' | 'tempo_stellare' | 'ali_di_luce' | 'patto_di_sangue' | 'inversione' | 'settimo_mondo';

export interface FormDef {
  id: string;
  order: number;
  name_key: string;
  desc_key: string;
  unlocked_by: string | null;
  environment: string;
  base: { duration: number; damage_mult: number; eco_regen_mult: number; boss_no_heal: boolean };
  ability: { id: FormAbility; name_key: string; desc_key: string; params: Record<string, number | boolean | string> };
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* World                                                                                                              */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface AltarDef {
  id: string;
  zone: string;
  name_key: string;
  pos: Vec3T;
  yaw?: number;
  before_boss: string | null;
  voice_line_key: string | null;
  /** Panoramic viewpoint altar. */
  vista?: boolean;
  /** Fast travel destination (false on ships and in the Collapse). */
  fast_travel?: boolean;
}

export interface TodPreset {
  sky: string;
  fog: 'none' | 'thin' | 'light' | 'medium' | 'dense';
  ambient: number;
  tint?: string;
  aurora?: number;
  stars?: number;
}
export type TimeOfDayDef = Record<TimeOfDay, TodPreset>;

export interface SkyPresetDef {
  id: string;
  zenith: string;
  horizon: string;
  ground: string;
  glow: string;
  glow_dir: Vec3T;
  stars: number;
  aurora: number;
  fog_color: string;
  light_color: string;
  light_intensity: number;
  hemi_sky: string;
  hemi_ground: string;
  exposure: number;
}

export interface TerrainDef {
  base: number;
  /** Authored control points: [x, z, height, radius] gaussian bumps (negative height = depression). */
  bumps?: [number, number, number, number][];
  noise?: { amp: number; scale: number; octaves?: number; seed?: number };
  /** Flatten disks: [x, z, radius, height, falloff] (arenas, plazas). */
  flats?: [number, number, number, number, number][];
  /** Path corridors carved to a smooth slope along the main route. */
  path_flatten?: number;
  water_level?: number;
  /** Edge walls: height rises near bounds (bowl). */
  rim?: { height: number; width: number };
  type?: 'heightfield' | 'interior' | 'deck' | 'void' | 'islands';
}

export interface ColliderDef {
  type: 'cylinder' | 'box';
  c: Vec3T;
  r?: number;
  h?: number;
  half?: Vec3T;
  yaw?: number;
}

export interface ZoneExitDef {
  to: string;
  at: Vec3T;
  radius: number;
  requires: string[];
  /** Spawn altar in the next zone. */
  arrive: string;
  kind?: 'walk' | 'boat' | 'ship' | 'stair' | 'root' | 'portal' | 'ritual' | 'fall';
  name_key?: string;
}

export interface VistaDef {
  id: string;
  pos: Vec3T;
  look: Vec3T;
  name_key: string;
}

export interface LandmarkDef {
  builder: string;
  pos: Vec3T;
  yaw?: number;
  scale?: number;
  params?: Record<string, number | string | boolean>;
}

export interface PropScatterDef {
  kind: string;
  count: number;
  /** Area rectangle [x0, z0, x1, z1] or 'zone'. */
  area?: [number, number, number, number];
  seed?: number;
  scale?: [number, number];
  /** Keep this distance from the main path. */
  avoid_path?: number;
  collide?: boolean;
  params?: Record<string, number | string | boolean>;
}

export interface ZoneDef {
  id: string;
  act: number;
  name_key: string;
  size: [number, number];
  biome: string;
  palette: string;
  terrain: TerrainDef;
  spawn: Vec3T;
  spawn_yaw?: number;
  path: Vec3T[];
  /** Walkable bounds polygon (flat [x0,z0,x1,z1,...]); default = size rectangle. */
  bounds?: number[];
  altars: string[];
  arenas: string[];
  exits: ZoneExitDef[];
  vistas: VistaDef[];
  reperti: string[];
  colliders?: ColliderDef[];
  climb?: { a: Vec3T; b: Vec3T; top: number }[];
  landmarks: LandmarkDef[];
  props: PropScatterDef[];
  water?: { level: number; kind: string; area?: [number, number, number, number] };
  surface: string;
  ambience: string;
  timeofday: string;
  particles?: string[];
  /** Distant vista impostors visible on the horizon (regions ahead). */
  horizon?: { builder: string; dir: number; dist: number; scale?: number }[];
  no_fast_travel?: boolean;
  /** Player scale rule in this zone (Little Garden 0.1). */
  player_scale?: number;
  player_speed_mult?: number;
  gravity_flip?: boolean;
  music?: string;
  /** Moving platform (ships): the whole zone is a deck carried along a spline. */
  platform?: { kind: 'ship' | 'boat' | 'raft'; spline: Vec3T[]; speed: number; sway: number };
}

export interface ArenaDef {
  id: string;
  zone: string;
  name_key: string;
  center: Vec3T;
  shape: 'circle' | 'rect' | 'polygon';
  radius?: number;
  half?: [number, number];
  polygon?: number[];
  yaw?: number;
  gate: { pos: Vec3T; yaw: number; width: number };
  floor_y: number;
  surface: string;
  obstacles: ColliderDef[];
  /** Static hazards (lava pools etc.) */
  hazards?: { kind: string; shape: ShapeDef; dps_mult: number; status?: StatusKind; from_phase?: string }[];
  /** Phase/state variants keyed by arena_state keyword from boss phases. */
  variants?: Record<string, { radius?: number; half?: [number, number]; polygon?: number[]; obstacles?: ColliderDef[]; surface?: string; floor_y?: number; gravity?: number }>;
  builder: string;
  platform?: 'ship' | 'boat' | 'raft' | 'bridge' | 'islands' | 'deck' | 'none';
  ceiling?: number;
  /** The arena is open sky (flying bosses can leave the ground freely). */
  open_sky?: boolean;
}

export interface RepertoDef {
  id: string;
  zone: string;
  pos: Vec3T;
  kind: 'lantern' | 'letter' | 'armor' | 'mural' | 'grave' | 'relic';
  title_key: string;
  text_key: string;
}

export interface VoceLineDef {
  key: string;
  /** Play at this altar, or at any altar once these bosses are defeated. */
  altar?: string;
  after?: string[];
  priority?: number;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Story sequences (dialogue, cutscenes, choices, ritual, ending)                                                     */
/* ----------------------------------------------------------------------------------------------------------------- */

export type SequenceStep =
  | { say: string; speaker: string; dur?: number }
  | { voce: string; dur?: number }
  | { caption: string; dur?: number }
  | { camera: string; dur?: number }
  | { wait: number }
  | { fade: 'in' | 'out' | 'white_in' | 'white_out'; dur?: number }
  | { choice: { key: string; goto: string; hold?: number; set?: Record<string, string | number | boolean> }[] }
  | { label: string }
  | { goto: string }
  | { if: string; goto: string }
  | { set: Record<string, string | number | boolean> }
  | { give_weapon: string }
  | { give_item: string }
  | { unlock_form: string }
  | { gesture: string; prompt_key: string }
  | { event: string; params?: Record<string, string | number | boolean> }
  | { music: string }
  | { title: string; dur?: number }
  | { end: true };

export interface SequenceDef {
  id: string;
  skippable?: boolean;
  steps: SequenceStep[];
}

export interface SpeakerDef {
  id: string;
  name_key: string;
  /** Synth vocal tone. */
  voice: { base: number; formant: number; wave: 'sine' | 'triangle' | 'sawtooth' | 'square'; vibrato: number; breath: number };
  color: string;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Progression (fixed order)                                                                                          */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface ActDef {
  n: number;
  name_key: string;
  palette: string;
  zones: string[];
  intro_sequence?: string;
}

export interface ProgressionDef {
  acts: ActDef[];
  start_zone: string;
  start_altar: string;
  start_sequence: string;
  ending_sequence: string;
  credits_sequence: string;
  /** Sky brightness steps: index = principal bosses defeated. */
  sky_shades: number[];
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Balance                                                                                                            */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface BalanceDef {
  sim_hz: number;
  player: {
    walk: number; run: number; sprint: number; jump_height: number; gravity: number; turn_rate: number; air_control: number;
    radius: number; height: number;
    health: number; fiato: number; fiato_regen: number; fiato_regen_delay: number; sprint_cost: number; dodge_cost: number; jump_cost: number;
    guard_stamina_ratio: number;
    dodge_duration: number; dodge_iframes: [number, number]; dodge_distance: number; backstep_distance: number; backstep_duration: number;
    perfect_dodge_window: number; perfect_dodge_slowmo: number; perfect_dodge_slowmo_scale: number;
    parry_window: number; parry_recovery: number;
    input_buffer: number; latency_comp_max: number;
    lacrime: number; drink_time: number; drink_cancel: number; drink_heal: number;
    swap_time: number; transizione_window: number;
    flinch_time: number; knockdown_time: number; guard_break_time: number;
    fall_damage_height: number;
  };
  eco: { max: number; segment: number; light_hit: number; heavy_hit: number; perfect_dodge: number; perfect_parry: number; prima_cost: number; seconda_cost: number; art_hit: number; transizione_hit: number };
  equilibrio: { decay: number; decay_delay: number; light_hit: number; heavy_hit: number; perfect_parry: number; arte_prima: number; arte_seconda: number; jump_hit: number; transizione: number; spezzato_time: number; grace_mult: number; grace_time: number; grace_range: number };
  metamondo: { fill_time: number; perfect_dodge_bonus: number; start: number; duration: number; damage_mult: number; eco_regen_mult: number; eco_passive: number };
  weapon: { base: number; per_difficulty: number; starter_damage: number };
  boss: { ttk_base: number; ttk_per_d: number; hit_base: number; hit_per_d: number; heavy_cap: number; ref_hit_rate: number; parry_recoil: number; phase_transition: number; spezzato_time: number; min_hp: number };
  guard_absorption: Record<string, number>;
  scale: { garden: number; garden_speed: number; ascended: number; gigante: number; gigante_speed: number };
  camera: { distance: number; height: number; lock_distance_per_size: number; fov: number };
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Projectile / hazard kinds (shared visual + default params)                                                          */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface ProjectileKindDef {
  id: string;
  radius: number;
  speed: number;
  life: number;
  gravity?: number;
  homing?: number;
  element?: Element;
  /** Visual style for the renderer. */
  visual: 'orb' | 'bolt' | 'arrow' | 'soul' | 'feather' | 'petal' | 'shard' | 'spirit' | 'raven' | 'fireball' | 'comet' | 'star' | 'disc' | 'crescent' | 'acid' | 'drop' | 'chain' | 'harpoon' | 'tentacle' | 'wave' | 'rock' | 'seed' | 'ball';
  color: string;
  trail?: boolean;
  explode_radius?: number;
}

export interface HazardKindDef {
  id: string;
  visual: 'crack' | 'circle' | 'fire' | 'ice' | 'lightning' | 'mud' | 'lava' | 'roots' | 'pollen' | 'acid' | 'void' | 'star' | 'water' | 'light' | 'shadow' | 'spikes' | 'whirlpool' | 'flowers' | 'fog' | 'embers' | 'glass';
  color: string;
  element?: Element;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* UI                                                                                                                 */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface TouchButtonDef {
  pos: [number, number];
  size: number;
  hold?: boolean;
}

export interface TouchLayoutDef {
  stick: { zone: [number, number, number, number]; mode: 'floating' | 'fixed'; radius: number; sprint_ring: number; dead_zone: number };
  camera_drag: { zone: [number, number, number, number]; sensitivity: number };
  buttons: Record<string, TouchButtonDef | { anchor: string }>;
  opacity: { active: number; idle: number };
  left_handed: boolean;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Whole content bundle (src/generated/content.json)                                                                 */
/* ----------------------------------------------------------------------------------------------------------------- */

export interface ContentBundle {
  version: string;
  balance: BalanceDef;
  bosses: BossDef[];
  weapons: WeaponDef[];
  movesets: MovesetDef[];
  transitions: TransitionDef[];
  forms: FormDef[];
  altars: AltarDef[];
  zones: ZoneDef[];
  arenas: ArenaDef[];
  timeofday: Record<string, TimeOfDayDef>;
  skies: SkyPresetDef[];
  reperti: RepertoDef[];
  voce: VoceLineDef[];
  sequences: SequenceDef[];
  speakers: SpeakerDef[];
  progression: ProgressionDef;
  projectiles: ProjectileKindDef[];
  hazards: HazardKindDef[];
  touch_layouts: Record<string, TouchLayoutDef>;
  anim: Record<string, unknown>;
  music: Record<string, unknown>;
  palettes: Record<string, Record<string, string>>;
}
