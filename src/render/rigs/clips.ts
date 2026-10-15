/**
 * Pose-clip libraries (data/anim/<family>.yaml, compiled into content.json `anim`). A clip is a set of bone rotations
 * (degrees, XYZ, relative to the rest pose) plus optional root offset/rotation and oscillation cycles; attack clips have
 * three stages (telegraph wind-up, active strike, recovery). Libraries can `extends` another family.
 *
 * Rotation convention (bone-local = parent frame at rest; rest rotations are identity for kit rigs):
 *   x = pitch forward (an upright chain leans forward, a forward chain nods down, a hanging limb swings BACK),
 *   y = turn toward the character's LEFT, z = roll: top tilts to the character's RIGHT (a left arm hanging down rises
 *   sideways with +z, a right arm with -z). Mirror (left<->right) = swap _l/_r names and negate y and z.
 * Root offsets are in units of the model's reference size (hip height): [left, up, forward].
 */
import type { Content } from '../../core/content';

export type Rot = [number, number, number];
/** [amplitude (deg or size units), phase 0..1, mode?] — mode: 'pos' (rectified +), 'neg', 'abs', 'double' (2x freq). */
export type Osc = [number, number] | [number, number, string];
export interface CycleTerm {
  x?: Osc;
  y?: Osc;
  z?: Osc;
}
export interface CycleDef {
  /** Seconds per cycle (time-driven). */
  period?: number;
  /** Distance per cycle in size units (locomotion, distance-driven). */
  stride?: number;
  bones?: Record<string, CycleTerm>;
  /** Root bob/sway in size units. */
  root?: CycleTerm;
  /** Root rotation oscillation (deg). */
  rootRot?: CycleTerm;
}
/**
 * Travelling wave along a bone chain (serpents, tails, tentacles, necks, wing fingers): bone k of the chain gets
 * amp * lerp(1, ampEnd, k/(n-1)) * sin(2PI(phase - k/wavelength + offset)) on `axis` (degrees).
 */
export interface WaveDef {
  /** Chain name (model.chains) or bone prefix: 'body' matches body_0, body_1, ... in numeric order. */
  chain: string;
  axis: 'x' | 'y' | 'z';
  amp: number;
  /** Wavelength in bones (default 6). */
  wavelength?: number;
  /** Amplitude multiplier at the chain end (default 1). */
  ampEnd?: number;
  /** Phase offset 0..1. */
  offset?: number;
  /** Seconds per cycle (time-driven). Default 1.2. */
  period?: number;
  /** Size units per cycle (distance-driven, locomotion). Overrides period when moving. */
  stride?: number;
}
export interface StagePose {
  /** Bone rotations (deg). Keys are bone names or prefix globs ('neck*' = every bone starting with 'neck'). */
  pose?: Record<string, Rot>;
  root?: [number, number, number];
  rootRot?: Rot;
  cycle?: CycleDef;
  waves?: WaveDef[];
  /** Blend curve for reaching this stage's pose. */
  ease?: 'out' | 'in' | 'inout' | 'snap' | 'linear' | 'back';
  /** Blend time as a fraction of the stage duration (default: telegraph 0.75, active 0.25 (max 0.08 s), recovery 0.5). */
  blend?: number;
}
export interface ClipDef extends StagePose {
  telegraph?: StagePose;
  active?: StagePose;
  recovery?: StagePose;
  /** Derive from another clip, mirrored left/right. */
  mirror?: string;
  /** Start from another clip and override. */
  base?: string;
  /** Tension tremble amplitude (deg) at the end of the telegraph. */
  hold?: number;
  /** Only these bones (prefix* globs) are driven; others keep locomotion (upper-body attacks while moving). */
  mask?: string[];
}
/** Import every clip of another library, renaming bones (`bonePrefix`) and clips (`clipPrefix`). */
export interface ClipInclude {
  family: string;
  /** Prefix added to every bone key / chain name (e.g. 'rider_' for a humanoid rider inside the mounted rig). */
  bonePrefix?: string;
  /** Prefix added to every imported clip name (e.g. 'foot_' for the dismounted rider). */
  clipPrefix?: string;
  /** Only these clips (before prefixing). */
  only?: string[];
}
export interface ClipLibraryDef {
  family: string;
  extends?: string;
  includes?: ClipInclude[];
  clips: Record<string, ClipDef>;
  aliases?: Record<string, string>;
}

/** Global keyword aliases (applied after the family's own aliases). */
export const GLOBAL_ALIASES: Record<string, string> = {
  slash: 'sweep_r', slash_rl: 'sweep_r', slash_lr: 'sweep_l', swipe: 'claw_r', swipe_l: 'claw_l', swipe_r: 'claw_r', cleave: 'overhead',
  chop: 'overhead', smash: 'slam', pound: 'slam', crush: 'slam', ground_slam: 'slam', punch: 'thrust', jab: 'thrust', stab: 'thrust',
  lunge: 'thrust_heavy', pierce: 'thrust_heavy', impale: 'thrust_heavy', plunge: 'slam', jump: 'leap', pounce: 'leap', hop: 'leap',
  dash: 'charge', rush: 'charge', ram: 'charge', trample: 'rear_stomp', rear: 'rear_stomp', stamp: 'stomp', quake: 'stomp',
  fire_breath: 'breath', spit: 'breath', spray: 'breath', venom: 'breath', exhale: 'breath', beam: 'breath', scream: 'roar',
  shout: 'roar', growl: 'roar', bellow: 'roar', call: 'howl', snap: 'bite', chomp: 'bite', devour: 'bite', swallow: 'bite',
  scratch: 'claw_r', rake: 'claw_r', maul: 'claw_r', tail: 'tail_sweep', tail_whip: 'tail_sweep', tail_slam: 'tail_sweep', whip: 'sweep_r',
  lash: 'sweep_r', sweep: 'sweep_r', spin_attack: 'spin', whirl: 'spin', twirl: 'spin', wheel: 'spin', grapple: 'grab', seize: 'grab',
  hug: 'grab', toss: 'throw', hurl: 'throw', fling: 'throw', spell: 'cast', magic: 'cast', invoke: 'cast', channel: 'cast',
  conjure: 'summon', spawn: 'summon', glide: 'fly', soar: 'fly', flap: 'hover', float: 'hover', levitate: 'hover', swoop_down: 'swoop',
  stoop: 'dive', bomb: 'dive', burrow_in: 'burrow', dig: 'burrow', submerge: 'burrow', surface: 'emerge', rise: 'emerge', erupt: 'emerge',
  constrict: 'coil', wrap: 'coil', bash: 'shield_bash', guard: 'block', parry: 'block', defend: 'block', kick_back: 'kick', buck: 'kick',
  wail: 'howl', bark: 'howl', hit: 'stagger', flinch: 'stagger', broken: 'spezzato', kneel: 'spezzato', die: 'death', dead: 'death',
  defeat: 'death', entrance: 'intro', reveal: 'intro', phase: 'transition', enrage: 'transition', salute: 'intro', scythe: 'sweep_r',
  pincer: 'grab', mandible: 'bite', sting: 'thrust', shoot: 'cast', volley: 'cast', rain: 'summon', drum: 'cast', water: 'cast',
  cut: 'sweep_r', shear: 'grab', snip: 'grab', fan: 'sweep_r', double_slash: 'sweep_r', cross_slash: 'overhead', uppercut: 'sweep_l',
  backhand: 'sweep_l', stomp_l: 'stomp', stomp_r: 'stomp', walk_back: 'walk', retreat: 'walk', strafe: 'walk', gallop: 'run', sprint: 'run',
  riposte: 'thrust', combo: 'sweep_r', stance: 'block', counter: 'block', reach: 'thrust', long_reach: 'thrust', pulse: 'roar',
  shake: 'roar', quiver: 'roar', wave: 'slam', arms: 'grab', tremor: 'stomp', thunder: 'slam', hammer: 'overhead', drill: 'thrust',
  barrage: 'cast', storm: 'summon', blizzard: 'breath', frost: 'breath', flame: 'breath', inferno: 'summon', meteor: 'summon',
  nova: 'roar', burst: 'roar', explode: 'roar', flurry: 'sweep_r', rend: 'claw_r', gore: 'charge', horn: 'charge', butt: 'charge',
  peck: 'bite', strike: 'thrust', fang: 'bite', tongue: 'thrust', squeeze: 'coil', crush_coil: 'coil', ink: 'breath', web: 'cast',
  mark: 'cast', curse: 'cast', pray: 'cast', song: 'howl', sing: 'howl', vanish: 'burrow', appear: 'emerge', ambush: 'emerge',
  lift: 'grab', carry: 'grab', drop: 'slam', fall: 'slam', crash: 'slam', land: 'stomp', hover_slam: 'dive', wing: 'swoop',
  gust: 'hover', tornado: 'spin', whirlwind: 'spin', cyclone: 'spin', bolt: 'cast', ray: 'breath', laser: 'breath', duel: 'sweep_r',
};

/** Prefix bone keys (names, globs, chain names) of a stage. */
function prefixStage(s: StagePose | undefined, bp: string): StagePose | undefined {
  if (!s || !bp) return s;
  const out: StagePose = { ...s };
  if (s.pose) {
    out.pose = {};
    for (const [k, v] of Object.entries(s.pose)) out.pose[bp + k] = v;
  }
  if (s.cycle?.bones) {
    const b: Record<string, CycleTerm> = {};
    for (const [k, v] of Object.entries(s.cycle.bones)) b[bp + k] = v;
    out.cycle = { ...s.cycle, bones: b };
  }
  if (s.waves) out.waves = s.waves.map((w) => ({ ...w, chain: bp + w.chain }));
  return out;
}

function prefixClip(c: ClipDef, bp: string, cp: string): ClipDef {
  return {
    ...prefixStage(c, bp),
    telegraph: prefixStage(c.telegraph, bp),
    active: prefixStage(c.active, bp),
    recovery: prefixStage(c.recovery, bp),
    mirror: c.mirror ? cp + c.mirror : undefined,
    base: c.base ? cp + c.base : undefined,
    hold: c.hold,
    mask: c.mask?.map((m) => bp + m),
  };
}

const libCache = new WeakMap<object, Map<string, ClipLibraryDef>>();

/**
 * Merge a family library with its `extends` chain and `includes` (child overrides parent; includes sit between the parent
 * and the library's own clips). Results are cached per content bundle; callers must not mutate them.
 */
export function resolveLibrary(content: Content | null, family: string, depth = 0): ClipLibraryDef {
  const anim = (content?.bundle.anim ?? null) as Record<string, unknown> | null;
  if (anim && depth === 0) {
    let m = libCache.get(anim);
    if (!m) libCache.set(anim, (m = new Map()));
    const hit = m.get(family);
    if (hit) return hit;
    const r = resolveLibraryRaw(anim, family, 0);
    m.set(family, r);
    return r;
  }
  return resolveLibraryRaw(anim, family, depth);
}

function resolveLibraryRaw(anim: Record<string, unknown> | null, family: string, depth: number): ClipLibraryDef {
  const raw = (anim?.[family] ?? null) as ClipLibraryDef | null;
  const own: ClipLibraryDef = raw && typeof raw === 'object'
    ? { family, extends: raw.extends, includes: raw.includes, clips: { ...(raw.clips ?? {}) }, aliases: { ...(raw.aliases ?? {}) } }
    : { family, clips: {}, aliases: {} };
  let clips: Record<string, ClipDef> = {};
  let aliases: Record<string, string> = {};
  if (own.extends && depth < 4) {
    const parent = resolveLibraryRaw(anim, own.extends, depth + 1);
    clips = { ...parent.clips };
    aliases = { ...(parent.aliases ?? {}) };
  }
  for (const inc of own.includes ?? []) {
    if (depth >= 4) break;
    const lib = resolveLibraryRaw(anim, inc.family, depth + 1);
    const bp = inc.bonePrefix ?? '', cp = inc.clipPrefix ?? '';
    for (const [name, c] of Object.entries(lib.clips)) {
      if (inc.only && !inc.only.includes(name)) continue;
      clips[cp + name] = bp || cp ? prefixClip(c, bp, cp) : c;
    }
    for (const [a, t] of Object.entries(lib.aliases ?? {})) aliases[cp + a] = cp + t;
  }
  Object.assign(clips, own.clips);
  Object.assign(aliases, own.aliases ?? {});
  return { family, extends: own.extends, includes: own.includes, clips, aliases };
}

/** A library extended in code (content models add custom clips/aliases on top of a family library). */
export function extendLibrary(base: ClipLibraryDef, clips?: Record<string, ClipDef>, aliases?: Record<string, string>): ClipLibraryDef {
  if (!clips && !aliases) return base;
  return { family: base.family, clips: { ...base.clips, ...(clips ?? {}) }, aliases: { ...(base.aliases ?? {}), ...(aliases ?? {}) } };
}

/** Mirror a bone name (_l <-> _r, also l/r tokens like leg_fl -> leg_fr, arm_l_0 -> arm_r_0). */
export function mirrorName(n: string): string {
  return n
    .replace(/(^|_)l(?=_|$|\d)/g, '$1§R')
    .replace(/(^|_)r(?=_|$|\d)/g, '$1§L')
    .replace(/_fl(?=_|$)/g, '_§FR').replace(/_fr(?=_|$)/g, '_§FL')
    .replace(/_bl(?=_|$)/g, '_§BR').replace(/_br(?=_|$)/g, '_§BL')
    .replace(/§R/g, 'r').replace(/§L/g, 'l').replace(/§FR/g, 'fr').replace(/§FL/g, 'fl').replace(/§BR/g, 'br').replace(/§BL/g, 'bl');
}

function mirrorRot(r: Rot): Rot {
  return [r[0], -r[1], -r[2]];
}
function mirrorStage(s: StagePose | undefined): StagePose | undefined {
  if (!s) return s;
  const out: StagePose = { ...s };
  if (s.pose) {
    out.pose = {};
    for (const [k, v] of Object.entries(s.pose)) out.pose[mirrorName(k)] = mirrorRot(v);
  }
  if (s.root) out.root = [-s.root[0], s.root[1], s.root[2]];
  if (s.rootRot) out.rootRot = mirrorRot(s.rootRot);
  if (s.cycle) {
    const c: CycleDef = { ...s.cycle };
    if (s.cycle.bones) {
      c.bones = {};
      for (const [k, v] of Object.entries(s.cycle.bones)) c.bones[mirrorName(k)] = { x: v.x, y: v.y ? ([-v.y[0], ...v.y.slice(1)] as Osc) : undefined, z: v.z ? ([-v.z[0], ...v.z.slice(1)] as Osc) : undefined };
    }
    out.cycle = c;
  }
  if (s.waves) out.waves = s.waves.map((w) => ({ ...w, chain: mirrorName(w.chain), amp: w.axis === 'x' ? w.amp : -w.amp }));
  return out;
}

/** Expand `mirror` / `base` references into a concrete clip. */
export function concreteClip(lib: ClipLibraryDef, name: string, depth = 0): ClipDef | null {
  const c = lib.clips[name];
  if (!c) return null;
  if (depth > 4) return c;
  if (c.mirror) {
    const src = concreteClip(lib, c.mirror, depth + 1);
    if (!src) return null;
    return {
      ...mirrorStage(src),
      telegraph: mirrorStage(src.telegraph), active: mirrorStage(src.active), recovery: mirrorStage(src.recovery),
      hold: src.hold, mask: src.mask?.map(mirrorName),
    };
  }
  if (c.base) {
    const b = concreteClip(lib, c.base, depth + 1);
    if (b) {
      const merge = (x: StagePose | undefined, y: StagePose | undefined): StagePose | undefined => (x || y ? { ...x, ...y, pose: { ...(x?.pose ?? {}), ...(y?.pose ?? {}) } } : undefined);
      return {
        ...merge(b, c), telegraph: merge(b.telegraph, c.telegraph), active: merge(b.active, c.active), recovery: merge(b.recovery, c.recovery),
        hold: c.hold ?? b.hold, mask: c.mask ?? b.mask, mirror: undefined, base: undefined,
      };
    }
  }
  return c;
}

/** Concrete clip by resolved name (handles the synthetic '~mirror:<clip>' names produced by resolveKeyword). */
export function getClip(lib: ClipLibraryDef, name: string): ClipDef | null {
  if (name.startsWith('~mirror:')) {
    const src = name.slice(8);
    const tmp: ClipLibraryDef = { family: lib.family, clips: { ...lib.clips, [name]: { mirror: src } }, aliases: lib.aliases };
    return concreteClip(tmp, name);
  }
  return concreteClip(lib, name);
}

/** Every keyword the render kit guarantees for boss attack/state animation (docs/RENDER_KIT.md). */
export const KEYWORDS: readonly string[] = [
  'idle', 'walk', 'run', 'overhead', 'sweep_l', 'sweep_r', 'thrust', 'thrust_heavy', 'slam', 'stomp', 'rear_stomp', 'charge', 'leap',
  'bite', 'breath', 'roar', 'claw_l', 'claw_r', 'tail_sweep', 'grab', 'throw', 'spin', 'cast', 'summon', 'fly', 'hover', 'dive', 'swoop',
  'burrow', 'emerge', 'coil', 'shield_bash', 'block', 'kick', 'howl', 'stagger', 'spezzato', 'death', 'intro', 'transition',
];

/**
 * Resolve an animation keyword to a clip name: exact, family alias, global alias, auto-mirror of _l/_r, progressively
 * shorter prefixes, any token, then 'attack' (generic wind-up/strike), else 'idle'.
 */
export function resolveKeyword(lib: ClipLibraryDef, anim: string, cache?: Map<string, string>): string {
  const hit = cache?.get(anim);
  if (hit) return hit;
  const has = (n: string) => !!lib.clips[n];
  const tryName = (n: string): string | null => {
    if (has(n)) return n;
    const fa = lib.aliases?.[n];
    if (fa && has(fa)) return fa;
    const ga = GLOBAL_ALIASES[n];
    if (ga && has(ga)) return ga;
    if (ga && lib.aliases?.[ga] && has(lib.aliases[ga])) return lib.aliases[ga];
    return null;
  };
  let res = tryName(anim);
  if (!res && /_(l|r)$/.test(anim)) {
    const other = anim.replace(/_l$/, '_§').replace(/_r$/, '_l').replace(/_§$/, '_r');
    if (has(other)) res = `~mirror:${other}`;
  }
  if (!res) {
    const toks = anim.split('_');
    for (let i = toks.length - 1; i >= 1 && !res; i--) res = tryName(toks.slice(0, i).join('_'));
    if (!res) {
      // suffix compounds first (lance_thrust_combo -> thrust_combo -> thrust)
      for (let i = 1; i < toks.length && !res; i++) res = tryName(toks.slice(i).join('_'));
    }
    if (!res) for (const t of toks) if ((res = tryName(t))) break;
  }
  if (!res) res = has('attack') ? 'attack' : 'idle';
  cache?.set(anim, res);
  return res;
}
