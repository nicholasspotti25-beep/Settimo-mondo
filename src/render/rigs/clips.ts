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
export interface StagePose {
  pose?: Record<string, Rot>;
  root?: [number, number, number];
  rootRot?: Rot;
  cycle?: CycleDef;
  /** Blend curve for reaching this stage's pose. */
  ease?: 'out' | 'in' | 'inout' | 'snap' | 'linear' | 'back';
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
export interface ClipLibraryDef {
  family: string;
  extends?: string;
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
};

/** Merge a family library with its `extends` chain (child overrides parent). */
export function resolveLibrary(content: Content | null, family: string, depth = 0): ClipLibraryDef {
  const raw = (content?.bundle.anim?.[family] ?? null) as ClipLibraryDef | null;
  const own: ClipLibraryDef = raw && typeof raw === 'object' ? { family, extends: raw.extends, clips: { ...(raw.clips ?? {}) }, aliases: { ...(raw.aliases ?? {}) } } : { family, clips: {}, aliases: {} };
  if (own.extends && depth < 4) {
    const parent = resolveLibrary(content, own.extends, depth + 1);
    return { family, clips: { ...parent.clips, ...own.clips }, aliases: { ...(parent.aliases ?? {}), ...(own.aliases ?? {}) } };
  }
  return own;
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
        hold: c.hold ?? b.hold, mask: c.mask ?? b.mask,
      };
    }
  }
  return c;
}

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
