/**
 * Zod schemas for every data file in /data. They mirror src/core/types.ts.
 * Objects are strict: an unknown key is an error (catches typos in hand-authored YAML).
 */
import { z } from 'zod';
import { WEAPON_TYPES, TRANSITION_CATEGORIES } from '../src/core/types';

const v3 = z.tuple([z.number(), z.number(), z.number()]);
const range2 = z.tuple([z.number(), z.number()]);
const num = z.number();
const str = z.string().min(1);

export const timeOfDay = z.enum(['alba', 'giorno', 'tramonto', 'notte']);
export const element = z.enum(['physical', 'fire', 'ice', 'lightning', 'void', 'light', 'poison', 'water', 'nature', 'spirit', 'chaos', 'blood']);
export const hitFlag = z.enum([
  'red', 'unblockable', 'projectile', 'dot', 'grab', 'knockdown', 'knockback', 'launch', 'slow', 'freeze', 'burn', 'blind', 'mute',
  'madness', 'poison', 'unavoidable', 'parry_final',
]);
export const statusKind = z.enum(['slow', 'freeze', 'burn', 'blind', 'mute', 'madness', 'poison', 'void', 'root']);
const status = z.object({ kind: statusKind, dur: num, power: num.optional() }).strict();

export const shape = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sphere'), c: v3, r: num }).strict(),
  z.object({ type: z.literal('capsule'), a: v3, b: v3, r: num }).strict(),
  z.object({ type: z.literal('arc'), r: num, r_in: num.optional(), angle: num, yaw: num.optional(), y: range2.optional(), c: v3.optional() }).strict(),
  z.object({ type: z.literal('box'), c: v3, half: v3, yaw: num.optional() }).strict(),
  z.object({ type: z.literal('ring'), r0: num, r1: num, width: num, height: num.optional(), c: v3.optional() }).strict(),
  z.object({ type: z.literal('cylinder'), c: v3, r: num, h: num }).strict(),
]);

const hitWindow = z.object({
  t: num, dur: num, shape, damage_mult: num.optional(), flags: z.array(hitFlag).optional(), part: str.optional(), tick: num.optional(),
  element: element.optional(), status: status.optional(),
}).strict();

const motion = z.object({
  t: num, dur: num,
  type: z.enum(['forward', 'toward_target', 'leap_to_target', 'retreat', 'strafe_left', 'strafe_right', 'teleport_behind', 'teleport_random', 'teleport_far', 'rise', 'descend', 'orbit', 'charge_through', 'hover', 'to_center', 'dive_to_target', 'land']),
  speed: num.optional(), height: num.optional(), dist: num.optional(), track: num.optional(),
}).strict();

const spawn = z.object({
  t: num,
  type: z.enum(['projectile', 'hazard', 'shockwave', 'beam', 'minion', 'custom', 'vfx', 'sfx']),
  id: str.optional(), count: num.optional(), spread: num.optional(), speed: num.optional(), accel: num.optional(), homing: num.optional(),
  gravity: num.optional(), radius: num.optional(), life: num.optional(), from: v3.optional(), part: str.optional(),
  at: z.enum(['self', 'front', 'target', 'target_predict', 'random_arena', 'around_target', 'line_to_target', 'ring_self', 'grid', 'sky_above_target', 'arena_center', 'part']).optional(),
  dist: num.optional(), delay: num.optional(), active: num.optional(), shape: shape.optional(), damage_mult: num.optional(),
  flags: z.array(hitFlag).optional(), interval: num.optional(), repeat: num.optional(), status: status.optional(), element: element.optional(),
  pitch: num.optional(), event: str.optional(), vfx: str.optional(), sfx: str.optional(),
}).strict();

export const attack = z.object({
  id: str, anim: str.optional(), telegraph: num, active: num, recovery: num, damage_mult: num, poise: num, flags: z.array(hitFlag),
  range: range2.optional(), weight: num.optional(), cooldown: num.optional(), track: num.optional(), track_active: num.optional(),
  hits: z.array(hitWindow).optional(), motion: z.array(motion).optional(), spawns: z.array(spawn).optional(), element: element.optional(),
  sfx: str.optional(), vfx: str.optional(), part: str.optional(), requires: str.optional(), combo_next: str.optional(), combo_chance: num.optional(),
  global: z.boolean().optional(), signature: str.optional(),
}).strict();

const phase = z.object({
  id: str, hp_range: range2, music: str.optional(), patterns: z.array(str).min(1), on_enter: z.array(str).optional(), speed_mult: num.optional(),
  aggression: num.optional(), opener: str.optional(), arena_state: str.optional(), dialogue: str.optional(), transition: num.optional(),
}).strict();

const sphereHurt = z.object({ c: v3, r: num }).strict();
const part = z.object({
  id: str, hurt: z.array(sphereHurt), damage_mult: num.optional(), poise_mult: num.optional(), hp: num.optional(), equilibrio: num.optional(),
  lockable: z.boolean().optional(), active: z.boolean().optional(), regrow: num.optional(), name_key: str.optional(), main_share: num.optional(),
}).strict();

const moveDef = z.object({ walk: num, run: num, turn: num, preferred_range: range2, flying: z.boolean().optional(), hover_height: num.optional() }).strict();
const modelDef = z.object({ builder: str, rig: str, scale: num, palette: str }).strict();

const todVariant = z.object({
  speed_mult: num.optional(), aggression: num.optional(), weights: z.record(z.string(), num).optional(), opener: str.optional(), spawn_mult: num.optional(),
  projectile_speed_mult: num.optional(), note_key: str.optional(), flags: z.array(str).optional(),
}).strict();

const minion = z.object({
  id: str, name_key: str.optional(), hp: num, body: z.object({ radius: num, height: num }).strict(), move: moveDef, attacks: z.array(attack),
  idle_gap: range2, model: modelDef, hurt: z.array(sphereHurt).optional(), main_share: num.optional(), equilibrio: num.optional(),
}).strict();

export const boss = z.object({
  id: str, order: z.number().int().min(1).max(38), name_key: str, title_key: str.optional(), class: z.enum(['mini', 'secondary', 'principal']),
  difficulty: z.number().int().min(1).max(20), act: z.number().int().min(1).max(7), arena: str, zone: str, mounted: z.boolean().optional(),
  model: modelDef, equilibrio_max: num, body: z.object({ radius: num, height: num, mass: z.enum(['light', 'heavy', 'immovable']).optional() }).strict(),
  hurtboxes: z.array(sphereHurt).optional(), parts: z.array(part).optional(), move: moveDef, idle_gap: range2, phases: z.array(phase).min(1),
  attacks: z.array(attack).min(1), minions: z.array(minion).optional(),
  time_of_day_variants: z.object({ alba: todVariant.optional(), giorno: todVariant.optional(), tramonto: todVariant.optional(), notte: todVariant.optional() }).strict(),
  dialogue_keys: z.array(str), lore_key: str.optional(), drops_weapon: str.nullable(), unlocks_form: str.nullable(), music: str,
  intro_sequence: str.optional(), defeat_sequence: str.optional(), metamondo_reaction: z.enum(['shatter', 'rewrite', 'devour']).nullable().optional(),
  scripted: z.boolean().optional(), hp_override: num.optional(), behavior: str.optional(),
  ng_plus: z.object({ add_patterns: z.record(z.string(), z.array(str)).optional(), speed_mult: num.optional(), idle_mult: num.optional() }).strict().optional(),
  grants: z.array(str).optional(), brightens_sky: z.boolean().optional(),
}).strict();

const projSpec = z.object({
  kind: str, speed: num, radius: num, life: num, count: num.optional(), spread: num.optional(), gravity: num.optional(), homing: num.optional(),
  pierce: z.boolean().optional(), explode_radius: num.optional(), returns: z.boolean().optional(),
}).strict();

export const swing = z.object({
  id: str, anim: str, startup: num, active: num, recovery: num, damage_mult: num, poise: num, stamina: num.optional(), shape: shape.optional(),
  move: z.object({ speed: num, dur: num }).strict().optional(), projectile: projSpec.optional(), cancel: num.optional(), hits: num.optional(),
  arc: z.object({ from: range2, to: range2, roll: num.optional(), hand: z.enum(['r', 'l', 'both']).optional() }).strict().optional(),
  element: element.optional(),
}).strict();

export const moveset = z.object({
  id: str, type: z.enum(WEAPON_TYPES), grip: z.enum(['one_hand', 'two_hand', 'dual', 'bow', 'catalyst', 'fist', 'flexible', 'shield', 'polearm']),
  reach: num, guard: z.object({ absorption: num }).strict(), swings: z.record(z.string(), z.union([swing, z.array(swing).min(1)])),
}).strict();

const art = z.object({
  id: str, eco_cost: num, effect: z.enum(['dash_strike', 'spin', 'multi_strike', 'counter_stance', 'projectile', 'rain', 'ground_wave', 'slam', 'grab_pull', 'buff_self', 'bind', 'hazard_zone', 'barrier', 'decoy', 'beam', 'chain_lightning', 'black_hole', 'throw_return', 'burrow', 'dot_stab', 'shape_shift', 'cone_breath', 'tentacle_ring', 'waves']),
  params: z.record(z.string(), z.union([num, z.string(), z.boolean()])), name_key: str.optional(), desc_key: str.optional(), vfx: str.optional(), sfx: str.optional(), anim: str.optional(),
}).strict();

export const weapon = z.object({
  id: str, name_key: str, desc_key: str, type: z.enum(WEAPON_TYPES), category: z.enum(TRANSITION_CATEGORIES as [string, ...string[]]),
  source_boss: str.nullable(), source_difficulty: z.number().int().min(0).max(20), parry_capable: z.boolean(),
  model: z.object({ template: str, motif: str, glow: str, colors: z.object({ primary: str, secondary: str, accent: str }).strict().optional(), params: z.record(z.string(), z.union([num, z.string(), z.boolean()])).optional() }).strict(),
  stamina_cost: z.object({ light: num, heavy: num }).strict(),
  moveset: z.object({ light: str, heavy: str, running: str, jumping: str }).strict(),
  arts: z.object({ prima: art, seconda: art }).strict(),
  flavor_key: str.optional(), element: element.optional(), ng_plus_only: z.boolean().optional(), delivered_by: str.optional(), starter: z.boolean().optional(),
}).strict();

export const transition = z.object({
  id: str, from: z.enum(TRANSITION_CATEGORIES as [string, ...string[]]), to: z.enum(TRANSITION_CATEGORIES as [string, ...string[]]), name_key: str, anim: str,
  shape: shape.optional(), damage_mult: num, poise: num, duration: num, move: z.object({ speed: num, dur: num }).strict().optional(), projectile: projSpec.optional(), vfx: str.optional(),
}).strict();

export const form = z.object({
  id: str, order: z.number().int(), name_key: str, desc_key: str, unlocked_by: str.nullable(), environment: str,
  base: z.object({ duration: num, damage_mult: num, eco_regen_mult: num, boss_no_heal: z.boolean() }).strict(),
  ability: z.object({ id: z.enum(['respiro_libero', 'riflessi', 'statura', 'tempo_stellare', 'ali_di_luce', 'patto_di_sangue', 'inversione', 'settimo_mondo']), name_key: str, desc_key: str, params: z.record(z.string(), z.union([num, z.boolean(), z.string()])) }).strict(),
}).strict();

export const altar = z.object({
  id: str, zone: str, name_key: str, pos: v3, yaw: num.optional(), before_boss: str.nullable(), voice_line_key: str.nullable(), vista: z.boolean().optional(), fast_travel: z.boolean().optional(),
}).strict();

const todPreset = z.object({ sky: str, fog: z.enum(['none', 'thin', 'light', 'medium', 'dense']), ambient: num, tint: str.optional(), aurora: num.optional(), stars: num.optional() }).strict();
export const timeofday = z.object({ alba: todPreset, giorno: todPreset, tramonto: todPreset, notte: todPreset }).strict();

export const sky = z.object({
  id: str, zenith: str, horizon: str, ground: str, glow: str, glow_dir: v3, stars: num, aurora: num, fog_color: str, light_color: str, light_intensity: num,
  hemi_sky: str, hemi_ground: str, exposure: num,
}).strict();

const collider = z.object({ type: z.enum(['cylinder', 'box']), c: v3, r: num.optional(), h: num.optional(), half: v3.optional(), yaw: num.optional() }).strict();

export const zone = z.object({
  id: str, act: z.number().int().min(1).max(7), name_key: str, size: range2, biome: str, palette: str,
  terrain: z.object({
    base: num, bumps: z.array(z.tuple([num, num, num, num])).optional(), noise: z.object({ amp: num, scale: num, octaves: num.optional(), seed: num.optional() }).strict().optional(),
    flats: z.array(z.tuple([num, num, num, num, num])).optional(), path_flatten: num.optional(), water_level: num.optional(),
    rim: z.object({ height: num, width: num }).strict().optional(), type: z.enum(['heightfield', 'interior', 'deck', 'void', 'islands']).optional(),
  }).strict(),
  spawn: v3, spawn_yaw: num.optional(), path: z.array(v3).min(2), bounds: z.array(num).optional(), altars: z.array(str), arenas: z.array(str),
  exits: z.array(z.object({ to: str, at: v3, radius: num, requires: z.array(str), arrive: str, kind: z.enum(['walk', 'boat', 'ship', 'stair', 'root', 'portal', 'ritual', 'fall']).optional(), name_key: str.optional() }).strict()),
  vistas: z.array(z.object({ id: str, pos: v3, look: v3, name_key: str }).strict()), reperti: z.array(str), colliders: z.array(collider).optional(),
  climb: z.array(z.object({ a: v3, b: v3, top: num }).strict()).optional(),
  landmarks: z.array(z.object({ builder: str, pos: v3, yaw: num.optional(), scale: num.optional(), params: z.record(z.string(), z.union([num, z.string(), z.boolean()])).optional() }).strict()),
  props: z.array(z.object({ kind: str, count: num, area: z.tuple([num, num, num, num]).optional(), seed: num.optional(), scale: range2.optional(), avoid_path: num.optional(), collide: z.boolean().optional(), params: z.record(z.string(), z.union([num, z.string(), z.boolean()])).optional() }).strict()),
  water: z.object({ level: num, kind: str, area: z.tuple([num, num, num, num]).optional() }).strict().optional(),
  surface: str, ambience: str, timeofday: str, particles: z.array(str).optional(),
  horizon: z.array(z.object({ builder: str, dir: num, dist: num, scale: num.optional() }).strict()).optional(),
  no_fast_travel: z.boolean().optional(), player_scale: num.optional(), player_speed_mult: num.optional(), gravity_flip: z.boolean().optional(), music: str.optional(),
  platform: z.object({ kind: z.enum(['ship', 'boat', 'raft']), spline: z.array(v3), speed: num, sway: num }).strict().optional(),
}).strict();

export const arena = z.object({
  id: str, zone: str, name_key: str, center: v3, shape: z.enum(['circle', 'rect', 'polygon']), radius: num.optional(), half: range2.optional(),
  polygon: z.array(num).optional(), yaw: num.optional(), gate: z.object({ pos: v3, yaw: num, width: num }).strict(), floor_y: num, surface: str,
  obstacles: z.array(collider),
  hazards: z.array(z.object({ kind: str, shape, dps_mult: num, status: statusKind.optional(), from_phase: str.optional() }).strict()).optional(),
  variants: z.record(z.string(), z.object({ radius: num.optional(), half: range2.optional(), polygon: z.array(num).optional(), obstacles: z.array(collider).optional(), surface: str.optional(), floor_y: num.optional(), gravity: num.optional() }).strict()).optional(),
  builder: str, platform: z.enum(['ship', 'boat', 'raft', 'bridge', 'islands', 'deck', 'none']).optional(), ceiling: num.optional(), open_sky: z.boolean().optional(),
}).strict();

export const reperto = z.object({
  id: str, zone: str, pos: v3, kind: z.enum(['lantern', 'letter', 'armor', 'mural', 'grave', 'relic']), title_key: str, text_key: str,
}).strict();

export const voce = z.object({ key: str, altar: str.optional(), after: z.array(str).optional(), priority: num.optional() }).strict();

const anyVal = z.union([z.string(), z.number(), z.boolean()]);
const step = z.union([
  z.object({ say: str, speaker: str, dur: num.optional() }).strict(),
  z.object({ voce: str, dur: num.optional() }).strict(),
  z.object({ caption: str, dur: num.optional() }).strict(),
  z.object({ camera: str, dur: num.optional() }).strict(),
  z.object({ wait: num }).strict(),
  z.object({ fade: z.enum(['in', 'out', 'white_in', 'white_out']), dur: num.optional() }).strict(),
  z.object({ choice: z.array(z.object({ key: str, goto: str, hold: num.optional(), set: z.record(z.string(), anyVal).optional() }).strict()).min(1) }).strict(),
  z.object({ label: str }).strict(),
  z.object({ goto: str }).strict(),
  z.object({ if: str, goto: str }).strict(),
  z.object({ set: z.record(z.string(), anyVal) }).strict(),
  z.object({ give_weapon: str }).strict(),
  z.object({ give_item: str }).strict(),
  z.object({ unlock_form: str }).strict(),
  z.object({ gesture: str, prompt_key: str }).strict(),
  z.object({ event: str, params: z.record(z.string(), anyVal).optional() }).strict(),
  z.object({ music: str }).strict(),
  z.object({ title: str, dur: num.optional() }).strict(),
  z.object({ end: z.literal(true) }).strict(),
]);
export const sequence = z.object({ id: str, skippable: z.boolean().optional(), steps: z.array(step).min(1) }).strict();

export const speaker = z.object({
  id: str, name_key: str, color: str,
  voice: z.object({ base: num, formant: num, wave: z.enum(['sine', 'triangle', 'sawtooth', 'square']), vibrato: num, breath: num }).strict(),
}).strict();

export const progression = z.object({
  acts: z.array(z.object({ n: z.number().int(), name_key: str, palette: str, zones: z.array(str).min(1), intro_sequence: str.optional() }).strict()).length(7),
  start_zone: str, start_altar: str, start_sequence: str, ending_sequence: str, credits_sequence: str, sky_shades: z.array(num),
}).strict();

export const projectileKind = z.object({
  id: str, radius: num, speed: num, life: num, gravity: num.optional(), homing: num.optional(), element: element.optional(),
  visual: z.enum(['orb', 'bolt', 'arrow', 'soul', 'feather', 'petal', 'shard', 'spirit', 'raven', 'fireball', 'comet', 'star', 'disc', 'crescent', 'acid', 'drop', 'chain', 'harpoon', 'tentacle', 'wave', 'rock', 'seed', 'ball']),
  color: str, trail: z.boolean().optional(), explode_radius: num.optional(),
}).strict();

export const hazardKind = z.object({
  id: str,
  visual: z.enum(['crack', 'circle', 'fire', 'ice', 'lightning', 'mud', 'lava', 'roots', 'pollen', 'acid', 'void', 'star', 'water', 'light', 'shadow', 'spikes', 'whirlpool', 'flowers', 'fog', 'embers', 'glass']),
  color: str, element: element.optional(),
}).strict();

export const touchLayout = z.object({
  stick: z.object({ zone: z.tuple([num, num, num, num]), mode: z.enum(['floating', 'fixed']), radius: num, sprint_ring: num, dead_zone: num }).strict(),
  camera_drag: z.object({ zone: z.tuple([num, num, num, num]), sensitivity: num }).strict(),
  buttons: z.record(z.string(), z.union([z.object({ pos: range2, size: num, hold: z.boolean().optional() }).strict(), z.object({ anchor: str }).strict()])),
  opacity: z.object({ active: num, idle: num }).strict(),
  left_handed: z.boolean(),
}).strict();

export const balance = z.object({
  sim_hz: num,
  player: z.object({
    walk: num, run: num, sprint: num, jump_height: num, gravity: num, turn_rate: num, air_control: num, radius: num, height: num, health: num, fiato: num,
    fiato_regen: num, fiato_regen_delay: num, sprint_cost: num, dodge_cost: num, jump_cost: num, guard_stamina_ratio: num, dodge_duration: num,
    dodge_iframes: range2, dodge_distance: num, backstep_distance: num, backstep_duration: num, perfect_dodge_window: num, perfect_dodge_slowmo: num,
    perfect_dodge_slowmo_scale: num, parry_window: num, parry_recovery: num, input_buffer: num, latency_comp_max: num, lacrime: num, drink_time: num,
    drink_cancel: num, drink_heal: num, swap_time: num, transizione_window: num, flinch_time: num, knockdown_time: num, guard_break_time: num, fall_damage_height: num,
  }).strict(),
  eco: z.object({ max: num, segment: num, light_hit: num, heavy_hit: num, perfect_dodge: num, perfect_parry: num, prima_cost: num, seconda_cost: num, art_hit: num, transizione_hit: num }).strict(),
  equilibrio: z.object({ decay: num, decay_delay: num, light_hit: num, heavy_hit: num, perfect_parry: num, arte_prima: num, arte_seconda: num, jump_hit: num, transizione: num, spezzato_time: num, grace_mult: num, grace_time: num, grace_range: num }).strict(),
  metamondo: z.object({ fill_time: num, perfect_dodge_bonus: num, start: num, duration: num, damage_mult: num, eco_regen_mult: num, eco_passive: num }).strict(),
  weapon: z.object({ base: num, per_difficulty: num, starter_damage: num }).strict(),
  boss: z.object({ ttk_base: num, ttk_per_d: num, hit_base: num, hit_per_d: num, heavy_cap: num, ref_hit_rate: num, parry_recoil: num, phase_transition: num, spezzato_time: num, min_hp: num }).strict(),
  guard_absorption: z.record(z.string(), num),
  scale: z.object({ garden: num, garden_speed: num, ascended: num, gigante: num, gigante_speed: num }).strict(),
  camera: z.object({ distance: num, height: num, lock_distance_per_size: num, fov: num }).strict(),
}).strict();
