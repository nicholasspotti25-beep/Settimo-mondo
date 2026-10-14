/**
 * Data-driven procedural animator. Poses a kit Model from a pose-clip library (data/anim/<family>.yaml) and the sim's
 * animation exposure (Actor.anim / animStage / animTime / animDur / moveSpeedNow / flags):
 *
 *   locomotion layer   idle / walk / run (or hover / fly when airborne) blended by speed, distance-driven cycles
 *   action layer       attack stages (telegraph wind-up -> active snap -> recovery settle), stagger, Spezzato, phase
 *                      transition roar, death, intro; every stage change blends from the pose currently on screen
 *   additive           hit flinch, look-at, telegraph tremble
 *   post               spring chains (secondary motion), part-anchor IK (multi-head rigs follow the sim), custom hooks
 *
 * Zero allocation per frame after the first evaluation of each clip (compiled clips are cached per animator).
 */
import * as THREE from 'three';
import type { Content } from '../../core/content';
import type { Model } from '../kit/model';
import { getClip, resolveKeyword, resolveLibrary, type ClipDef, type ClipLibraryDef, type CycleDef, type Osc, type StagePose, type WaveDef } from './clips';
import { SpringChain, type SpringSpec } from './springs';
import { aimBone, ccdIK } from './ik';

const DEG = Math.PI / 180;

export type AnimStageName = 'idle' | 'move' | 'telegraph' | 'active' | 'recovery' | 'stagger' | 'spezzato' | 'transition' | 'dead' | 'scripted' | 'hidden' | 'intro';

/** Per-frame animation input (mirrors the sim Actor animation exposure). */
export interface AnimInput {
  anim: string;
  stage: AnimStageName;
  /** Seconds into the current stage. */
  time: number;
  /** Stage duration (seconds). */
  dur: number;
  /** Current movement speed in world m/s. */
  speed: number;
  /** World scale of the visual (actor.scale x model.scale). */
  scale: number;
  flags?: ReadonlySet<string>;
  airborne?: boolean;
  /** Seconds of hit flash left (rising edge triggers a flinch). */
  hitFlash?: number;
}

/** Model metadata read by the animator (written by rig family builders into ModelBuilder.info). */
export interface RigInfo {
  family?: string;
  /** Bone receiving clip root offsets / root rotation (default 'hips', else 'body', else first bone after root). */
  rootBone?: string;
  /** Model-space speeds (m/s at scale 1) where walk / run cycles reach full weight. */
  walkSpeed?: number;
  runSpeed?: number;
  /** Spring chains for secondary motion. */
  springs?: SpringSpec[];
  /** Multi-part rigs: chain of bones that follows sim part anchors (part id -> bones root..tip). */
  partChains?: Record<string, { bones: string[]; weight?: number }>;
  /** Look-at bones toward the target. */
  look?: { bone: string; weight: number; limit?: number }[];
  /** Flag -> clip prefix (e.g. { dismounted: 'foot_', airborne: 'air_' }). */
  flagPrefix?: Record<string, string>;
  /** Bones that recoil on hits (lean back). */
  flinch?: string[];
  /**
   * Bones that follow another bone's transform (mounted riders sit on the saddle). While the `off` flag is set the
   * follower blends back to its own rest transform (dismounted rider standing beside the steed).
   */
  follow?: { bone: string; target: string; off?: string }[];
  /** Bones hidden (scaled to zero) while a flag is set, e.g. { dismounted: ['body'] } (the steed vanishes). */
  hideOnFlag?: Record<string, string[]>;
}

interface CStage {
  idx: Int16Array;
  rot: Float32Array;
  root: Float32Array | null;
  rootRot: Float32Array | null;
  /** cycle terms: [target(bone idx | -1 root | -2 rootRot), axis, amp, phase, mode] */
  cyc: Float32Array | null;
  cycCount: number;
  period: number;
  stride: number;
  /** waves: per entry [boneIdx, axis, amp, chainK] + shared params */
  waves: CWave[];
  ease: string;
  blend: number | undefined;
}
interface CWave {
  idx: Int16Array;
  axis: number;
  amp: number;
  ampEnd: number;
  wavelength: number;
  offset: number;
  period: number;
  stride: number;
}
interface CClip {
  name: string;
  base: CStage | null;
  telegraph: CStage | null;
  active: CStage | null;
  recovery: CStage | null;
  hold: number;
}

const MODE_POS = 1, MODE_NEG = 2, MODE_ABS = 3, MODE_DOUBLE = 4;
function modeOf(m: string | undefined): number {
  return m === 'pos' ? MODE_POS : m === 'neg' ? MODE_NEG : m === 'abs' ? MODE_ABS : m === 'double' ? MODE_DOUBLE : 0;
}
function osc(phase: number, amp: number, ph: number, mode: number): number {
  const a = (phase + ph) * Math.PI * 2;
  switch (mode) {
    case MODE_POS: return Math.max(0, Math.sin(a)) * amp;
    case MODE_NEG: return Math.min(0, Math.sin(a)) * amp;
    case MODE_ABS: return Math.abs(Math.sin(a)) * amp;
    case MODE_DOUBLE: return Math.sin(a * 2) * amp;
    default: return Math.sin(a) * amp;
  }
}

export function ease(name: string, t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  switch (name) {
    case 'in': return x * x * x;
    case 'inout': return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'linear': return x;
    case 'snap': return 1 - Math.pow(1 - x, 4);
    case 'back': {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    default: return 1 - Math.pow(1 - x, 3); // out
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

export class Animator {
  readonly model: Model;
  readonly lib: ClipLibraryDef;
  readonly info: RigInfo;
  readonly bones: THREE.Bone[];
  readonly n: number;
  private readonly boneIndex = new Map<string, number>();
  private clipCache = new Map<string, CClip | null>();
  private kwCache = new Map<string, string>();
  private rootIdx = -1;
  // layers (degrees)
  private loco: Float32Array;
  private locoRoot = new Float32Array(3);
  private locoRootRot = new Float32Array(3);
  private act: Float32Array;
  private actW: Float32Array;
  private actRoot = new Float32Array(3);
  private actRootRot = new Float32Array(3);
  private actRootW = 0;
  private snap: Float32Array;
  private snapW: Float32Array;
  private snapRoot = new Float32Array(3);
  private snapRootRot = new Float32Array(3);
  private snapRootW = 0;
  private tgt: Float32Array;
  private tgtW: Float32Array;
  private tgtRoot = new Float32Array(3);
  private tgtRootRot = new Float32Array(3);
  private tgtRootW = 0;
  private out: Float32Array;
  private outRoot = new Float32Array(3);
  private outRootRot = new Float32Array(3);
  // clocks
  private stageKey = '';
  private ownClock = 0;
  private time = 0;
  private locoPhase = 0;
  private idlePhase = 0;
  private flinch = 0;
  private flinchV = 0;
  private lastHit = 0;
  private springs: SpringChain[] = [];
  private partChains: { id: string; bones: THREE.Bone[]; chain: THREE.Bone[]; tip: THREE.Bone; weight: number; w: number }[] = [];
  private lookBones: { bone: THREE.Bone; weight: number; limit: number }[] = [];
  private flinchIdx: number[] = [];
  private follows: { bone: THREE.Bone; target: THREE.Bone; off: string; w: number }[] = [];
  private hides: { flag: string; bones: THREE.Bone[]; k: number }[] = [];
  /** Weight of the look-at (0 during strikes, death...). */
  private lookW = 0;
  /** Current resolved clip name (debug / tests). */
  clipName = 'idle';
  /** Extra per-frame hook after posing (content-specific procedural touches). */
  post: ((a: Animator, dt: number) => void) | null = null;
  /** World-space look target (set by the visual each frame), or null. */
  lookTarget: THREE.Vector3 | null = null;
  /** Global multiplier on the action layer (content can lower it for custom procedural states). */
  actionScale = 1;

  constructor(model: Model, content: Content | null, family: string, info?: RigInfo) {
    this.model = model;
    this.info = (info ?? (model.info as RigInfo)) || {};
    this.lib = resolveLibrary(content, family);
    this.bones = model.boneList;
    this.n = this.bones.length;
    this.bones.forEach((b, i) => this.boneIndex.set(b.name, i));
    const rb = this.info.rootBone ?? (this.boneIndex.has('hips') ? 'hips' : this.boneIndex.has('body') ? 'body' : this.bones[1]?.name);
    this.rootIdx = rb ? this.boneIndex.get(rb) ?? -1 : -1;
    const n = this.n;
    this.loco = new Float32Array(n * 3);
    this.act = new Float32Array(n * 3);
    this.actW = new Float32Array(n);
    this.snap = new Float32Array(n * 3);
    this.snapW = new Float32Array(n);
    this.tgt = new Float32Array(n * 3);
    this.tgtW = new Float32Array(n);
    this.out = new Float32Array(n * 3);
    for (const s of this.info.springs ?? []) {
      const names = Array.isArray(s.chain) ? s.chain : model.chains[s.chain] ?? [];
      const bones = names.map((x) => model.bones[x]).filter((b): b is THREE.Bone => !!b);
      if (bones.length) this.springs.push(new SpringChain(bones, s, model.size));
    }
    for (const [id, pc] of Object.entries(this.info.partChains ?? {})) {
      const bones = pc.bones.map((x) => model.bones[x]).filter((b): b is THREE.Bone => !!b);
      if (bones.length >= 2) this.partChains.push({ id, bones, chain: bones.slice(0, -1), tip: bones[bones.length - 1], weight: pc.weight ?? 1, w: 0 });
    }
    for (const l of this.info.look ?? []) {
      const b = model.bones[l.bone];
      if (b) this.lookBones.push({ bone: b, weight: l.weight, limit: (l.limit ?? 50) * DEG });
    }
    for (const f of this.info.follow ?? []) {
      const b = model.bones[f.bone], t = model.bones[f.target];
      if (b && t) this.follows.push({ bone: b, target: t, off: f.off ?? '', w: 1 });
    }
    for (const [flag, names] of Object.entries(this.info.hideOnFlag ?? {})) {
      const bones = names.map((x) => model.bones[x]).filter((b): b is THREE.Bone => !!b);
      if (bones.length) this.hides.push({ flag, bones, k: 1 });
    }
    const fl = this.info.flinch ?? ['spine', 'chest', 'neck_0'];
    for (const f of fl) {
      const i = this.boneIndex.get(f);
      if (i !== undefined) this.flinchIdx.push(i);
    }
  }

  bone(name: string): THREE.Bone | undefined {
    const i = this.boneIndex.get(name);
    return i === undefined ? undefined : this.bones[i];
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* Clip compilation                                                                                                */
  /* -------------------------------------------------------------------------------------------------------------- */

  /** Bone indices for a pose key: exact name, or prefix glob 'neck*'. */
  private keyBones(key: string): number[] {
    if (key.endsWith('*')) {
      const p = key.slice(0, -1);
      const out: number[] = [];
      this.bones.forEach((b, i) => {
        if (b.name.startsWith(p)) out.push(i);
      });
      return out;
    }
    const i = this.boneIndex.get(key);
    return i === undefined ? [] : [i];
  }

  /** Bones of a chain name in order (model.chains, else prefix_N numeric order). */
  chainBones(chain: string): number[] {
    const named = this.model.chains[chain];
    if (named) return named.map((x) => this.boneIndex.get(x)).filter((x): x is number => x !== undefined);
    const re = new RegExp(`^${chain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)$`);
    const list: [number, number][] = [];
    this.bones.forEach((b, i) => {
      const m = re.exec(b.name);
      if (m) list.push([Number(m[1]), i]);
    });
    list.sort((a, b) => a[0] - b[0]);
    return list.map((x) => x[1]);
  }

  private compileStage(s: StagePose | undefined | null): CStage | null {
    if (!s) return null;
    const idx: number[] = [];
    const rot: number[] = [];
    const exact = new Set<number>();
    const entries = Object.entries(s.pose ?? {});
    // exact names win over globs
    for (const [k, r] of entries) {
      if (k.endsWith('*')) continue;
      for (const i of this.keyBones(k)) {
        exact.add(i);
        idx.push(i);
        rot.push(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0);
      }
    }
    for (const [k, r] of entries) {
      if (!k.endsWith('*')) continue;
      for (const i of this.keyBones(k)) {
        if (exact.has(i)) continue;
        idx.push(i);
        rot.push(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0);
      }
    }
    let cyc: number[] | null = null;
    const c: CycleDef | undefined = s.cycle;
    if (c) {
      cyc = [];
      const push = (target: number, axis: number, o: Osc | undefined) => {
        if (!o) return;
        cyc!.push(target, axis, o[0], o[1] ?? 0, modeOf(o[2] as string | undefined));
      };
      for (const [k, term] of Object.entries(c.bones ?? {})) {
        for (const i of this.keyBones(k)) {
          push(i, 0, term.x);
          push(i, 1, term.y);
          push(i, 2, term.z);
        }
      }
      if (c.root) {
        push(-1, 0, c.root.x);
        push(-1, 1, c.root.y);
        push(-1, 2, c.root.z);
      }
      if (c.rootRot) {
        push(-2, 0, c.rootRot.x);
        push(-2, 1, c.rootRot.y);
        push(-2, 2, c.rootRot.z);
      }
    }
    const waves: CWave[] = [];
    for (const w of s.waves ?? ([] as WaveDef[])) {
      const ids = this.chainBones(w.chain);
      if (!ids.length) continue;
      waves.push({
        idx: Int16Array.from(ids), axis: w.axis === 'x' ? 0 : w.axis === 'y' ? 1 : 2, amp: w.amp, ampEnd: w.ampEnd ?? 1, wavelength: w.wavelength ?? 6,
        offset: w.offset ?? 0, period: w.period ?? 1.2, stride: w.stride ?? 0,
      });
    }
    return {
      idx: Int16Array.from(idx), rot: Float32Array.from(rot), root: s.root ? Float32Array.from(s.root) : null, rootRot: s.rootRot ? Float32Array.from(s.rootRot) : null,
      cyc: cyc ? Float32Array.from(cyc) : null, cycCount: cyc ? cyc.length / 5 : 0, period: c?.period ?? 1, stride: c?.stride ?? 0, waves,
      ease: s.ease ?? '', blend: s.blend,
    };
  }

  private compile(name: string): CClip | null {
    if (this.clipCache.has(name)) return this.clipCache.get(name)!;
    const def: ClipDef | null = getClip(this.lib, name);
    let cc: CClip | null = null;
    if (def) {
      const hasBase = !!(def.pose || def.cycle || def.root || def.rootRot || def.waves);
      cc = {
        name,
        base: hasBase ? this.compileStage(def) : null,
        telegraph: this.compileStage(def.telegraph),
        active: this.compileStage(def.active),
        recovery: this.compileStage(def.recovery),
        hold: def.hold ?? 0,
      };
    }
    this.clipCache.set(name, cc);
    return cc;
  }

  /** Resolve a keyword to a compiled clip, honoring flag prefixes ('foot_', 'air_'...). */
  resolve(anim: string, flags?: ReadonlySet<string>, airborne?: boolean): CClip | null {
    const fp = this.info.flagPrefix;
    if (fp) {
      for (const f in fp) {
        if ((f === 'airborne' && airborne) || flags?.has(f)) {
          const n = fp[f] + anim;
          if (this.lib.clips[n]) return this.compile(n);
          const al = this.lib.aliases?.[anim];
          if (al && this.lib.clips[fp[f] + al]) return this.compile(fp[f] + al);
        }
      }
    }
    const nm = resolveKeyword(this.lib, anim, this.kwCache);
    return this.compile(nm);
  }

  hasClip(name: string): boolean {
    return !!this.lib.clips[name];
  }

  /* -------------------------------------------------------------------------------------------------------------- */
  /* Evaluation                                                                                                      */
  /* -------------------------------------------------------------------------------------------------------------- */

  /** Write a stage pose (+ its cycles/waves at `phase`) into buf/w scaled by `k` (additive accumulation). */
  private addStage(st: CStage, buf: Float32Array, w: Float32Array | null, root: Float32Array, rootRot: Float32Array, k: number, phase: number, wavePhase: number): void {
    const idx = st.idx, rot = st.rot;
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j] * 3;
      buf[i] += rot[j * 3] * k;
      buf[i + 1] += rot[j * 3 + 1] * k;
      buf[i + 2] += rot[j * 3 + 2] * k;
      if (w) w[idx[j]] = 1;
    }
    if (st.root) {
      root[0] += st.root[0] * k; root[1] += st.root[1] * k; root[2] += st.root[2] * k;
    }
    if (st.rootRot) {
      rootRot[0] += st.rootRot[0] * k; rootRot[1] += st.rootRot[1] * k; rootRot[2] += st.rootRot[2] * k;
    }
    if (st.cyc) {
      const c = st.cyc;
      for (let j = 0; j < st.cycCount; j++) {
        const o = j * 5;
        const target = c[o], axis = c[o + 1];
        const v = osc(phase, c[o + 2], c[o + 3], c[o + 4]) * k;
        if (target >= 0) {
          buf[target * 3 + axis] += v;
          if (w) w[target] = 1;
        } else if (target === -1) root[axis] += v;
        else rootRot[axis] += v;
      }
    }
    for (const wv of st.waves) {
      const n = wv.idx.length;
      for (let j = 0; j < n; j++) {
        const f = n > 1 ? j / (n - 1) : 0;
        const a = wv.amp * (1 + (wv.ampEnd - 1) * f);
        const v = Math.sin((wavePhase - j / wv.wavelength + wv.offset) * Math.PI * 2) * a * k;
        buf[wv.idx[j] * 3 + wv.axis] += v;
        if (w) w[wv.idx[j]] = 1;
      }
    }
  }

  private stagePhase(st: CStage, time: number): number {
    return time / Math.max(0.05, st.period);
  }

  private evalLocomotion(inp: AnimInput, dt: number): void {
    this.loco.fill(0);
    this.locoRoot.fill(0);
    this.locoRootRot.fill(0);
    const scale = Math.max(1e-3, inp.scale);
    const sp = inp.speed / scale;
    const flying = !!inp.airborne && (this.hasClip('hover') || this.hasClip('fly') || !!this.info.flagPrefix?.airborne);
    const idle = this.resolve(flying ? 'hover' : 'idle', inp.flags, inp.airborne);
    const walk = this.resolve(flying ? 'fly' : 'walk', inp.flags, inp.airborne);
    const run = flying ? null : this.resolve('run', inp.flags, inp.airborne);
    const walkRef = this.info.walkSpeed ?? 2;
    const runRef = this.info.runSpeed ?? walkRef * 2.6;
    const wW = smooth(0.06 * walkRef, 0.6 * walkRef, sp);
    const wR = run && run.base ? smooth(walkRef * 1.05, (walkRef + runRef) * 0.5, sp) : 0;
    const kIdle = 1 - wW, kWalk = wW * (1 - wR), kRun = wW * wR;
    // distance-driven phase (stride in size units)
    const size = Math.max(0.05, this.model.size);
    const ws = walk?.base?.stride || 1.6, rs = run?.base?.stride || 2.4;
    const stride = (ws * (1 - wR) + rs * wR) * size;
    if (wW > 0.001) this.locoPhase += (Math.max(sp, walkRef * 0.35) * dt) / stride;
    this.idlePhase += dt;
    if (idle?.base && kIdle > 0.001) {
      const st = idle.base;
      this.addStage(st, this.loco, null, this.locoRoot, this.locoRootRot, kIdle, this.idlePhase / Math.max(0.05, st.period), this.idlePhase / Math.max(0.05, st.waves[0]?.period ?? st.period));
    }
    if (walk?.base && kWalk > 0.001) {
      const st = walk.base;
      const wph = st.waves.length && st.waves[0].stride ? this.locoPhase : this.idlePhase / Math.max(0.05, st.waves[0]?.period ?? 1.2);
      this.addStage(st, this.loco, null, this.locoRoot, this.locoRootRot, kWalk, st.stride ? this.locoPhase : this.idlePhase / st.period, wph);
    }
    if (run?.base && kRun > 0.001) {
      const st = run.base;
      const wph = st.waves.length && st.waves[0].stride ? this.locoPhase : this.idlePhase / Math.max(0.05, st.waves[0]?.period ?? 1.2);
      this.addStage(st, this.loco, null, this.locoRoot, this.locoRootRot, kRun, st.stride ? this.locoPhase : this.idlePhase / st.period, wph);
    }
  }

  /** Choose the action stage pose for the input: [stage, key, blendSeconds, easeName, layerWeight, trembleAmp]. */
  private pick(inp: AnimInput): { st: CStage | null; key: string; blend: number; ease: string; layer: number; tremble: number; clock: number } {
    const R = this.pickOut;
    R.tremble = 0;
    R.layer = 1;
    R.clock = inp.time;
    const t = inp.time, dur = Math.max(1e-3, inp.dur);
    const stage = inp.stage;
    if (stage === 'idle' || stage === 'move' || stage === 'scripted' || stage === 'hidden') {
      R.st = null;
      R.key = 'loco';
      R.blend = 0.28;
      R.ease = 'inout';
      R.clock = this.ownClock;
      // scripted actors may still request a named pose (e.g. 'kneel', 'intro') through anim
      if (stage === 'scripted' && inp.anim && inp.anim !== 'idle' && inp.anim !== 'walk' && inp.anim !== 'run') {
        const c = this.resolve(inp.anim, inp.flags, inp.airborne);
        if (c && c.name !== 'idle') {
          R.st = c.active ?? c.base ?? c.telegraph;
          R.key = `s:${c.name}`;
          R.blend = 0.4;
          this.clipName = c.name;
        }
      }
      return R;
    }
    const c = this.resolve(inp.anim || (stage === 'dead' ? 'death' : stage === 'transition' ? 'roar' : stage), inp.flags, inp.airborne);
    this.clipName = c?.name ?? 'idle';
    if (!c) {
      R.st = null;
      R.key = 'none';
      R.blend = 0.2;
      R.ease = 'inout';
      return R;
    }
    const base = c.base;
    const tel = c.telegraph ?? base ?? c.active;
    const act = c.active ?? base ?? c.telegraph;
    const rec = c.recovery ?? act;
    switch (stage) {
      case 'telegraph': {
        R.st = tel;
        R.key = `${c.name}:t`;
        R.blend = dur * (tel?.blend ?? 0.75);
        R.ease = tel?.ease || 'out';
        if (c.hold > 0) R.tremble = c.hold * smooth(0.65, 0.95, t / dur);
        return R;
      }
      case 'active': {
        R.st = act;
        R.key = `${c.name}:a`;
        R.blend = Math.min(0.09, dur * (act?.blend ?? 0.25));
        R.ease = act?.ease || 'snap';
        return R;
      }
      case 'recovery': {
        R.st = rec;
        R.key = `${c.name}:r`;
        R.blend = dur * (rec?.blend ?? 0.5);
        R.ease = rec?.ease || 'inout';
        R.layer = 1 - smooth(0.4, 1.0, t / dur);
        return R;
      }
      case 'stagger': {
        R.st = act;
        R.key = `${c.name}:s`;
        R.blend = 0.08;
        R.ease = 'snap';
        R.layer = 1 - smooth(0.55, 1.0, t / dur);
        return R;
      }
      case 'transition': {
        const early = t < dur * 0.32;
        R.st = early ? tel : act;
        R.key = `${c.name}:${early ? 'tt' : 'ta'}`;
        R.blend = early ? dur * 0.3 : 0.12;
        R.ease = early ? 'out' : 'snap';
        if (early && c.hold > 0) R.tremble = c.hold * smooth(0.15, 0.3, t / dur);
        return R;
      }
      case 'spezzato': {
        const early = t < 0.35 && !!c.telegraph;
        R.st = early ? tel : act;
        R.key = `${c.name}:${early ? 'zt' : 'za'}`;
        R.blend = early ? 0.2 : 0.45;
        R.ease = early ? 'snap' : 'inout';
        R.layer = dur > 0.5 ? 1 - smooth(dur - 0.35, dur, t) : 1;
        return R;
      }
      case 'dead': {
        const early = t < 0.45 && !!c.telegraph;
        R.st = early ? tel : act;
        R.key = `${c.name}:${early ? 'dt' : 'da'}`;
        R.blend = early ? 0.25 : 0.9;
        R.ease = early ? 'out' : 'inout';
        return R;
      }
      case 'intro': {
        const early = !!c.telegraph && t < Math.max(0.6, dur * 0.4);
        R.st = early ? tel : act;
        R.key = `${c.name}:${early ? 'it' : 'ia'}`;
        R.blend = early ? 0.6 : 0.35;
        R.ease = 'inout';
        return R;
      }
      default:
        R.st = base;
        R.key = c.name;
        R.blend = 0.25;
        R.ease = 'inout';
        return R;
    }
  }
  private pickOut = { st: null as CStage | null, key: '', blend: 0.2, ease: 'out', layer: 1, tremble: 0, clock: 0 };

  /** Advance and apply the pose. Call once per rendered frame. */
  update(inp: AnimInput, dt: number): void {
    this.time += dt;
    this.ownClock += dt;
    this.evalLocomotion(inp, dt);
    const P = this.pick(inp);
    if (P.key !== this.stageKey) {
      // snapshot what is on screen; blend from it
      this.snap.set(this.act);
      this.snapW.set(this.actW);
      this.snapRoot.set(this.actRoot);
      this.snapRootRot.set(this.actRootRot);
      this.snapRootW = this.actRootW;
      this.stageKey = P.key;
      this.ownClock = 0;
      if (P.key === 'loco' || P.key.startsWith('s:')) P.clock = 0;
    }
    // target
    this.tgt.fill(0);
    this.tgtW.fill(0);
    this.tgtRoot.fill(0);
    this.tgtRootRot.fill(0);
    this.tgtRootW = 0;
    const layer = P.layer * this.actionScale;
    if (P.st) {
      const st = P.st;
      this.addStage(st, this.tgt, this.tgtW, this.tgtRoot, this.tgtRootRot, 1, this.stagePhase(st, P.clock), P.clock / Math.max(0.05, st.waves[0]?.period ?? 1.2));
      this.tgtRootW = st.root || st.rootRot || (st.cyc && st.cycCount) ? 1 : 0;
      if (P.tremble > 0) {
        const tr = P.tremble;
        for (let j = 0; j < st.idx.length; j++) {
          const i = st.idx[j];
          this.tgt[i * 3] += Math.sin(this.time * 47 + i * 1.7) * tr;
          this.tgt[i * 3 + 2] += Math.sin(this.time * 39 + i * 2.3) * tr * 0.6;
        }
      }
    }
    const w = ease(P.ease, P.blend > 1e-4 ? P.clock / P.blend : 1);
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const sw = this.snapW[i], tw = this.tgtW[i] * layer;
      const i3 = i * 3;
      if (tw > 0 && sw > 0) {
        this.act[i3] = this.snap[i3] + (this.tgt[i3] - this.snap[i3]) * w;
        this.act[i3 + 1] = this.snap[i3 + 1] + (this.tgt[i3 + 1] - this.snap[i3 + 1]) * w;
        this.act[i3 + 2] = this.snap[i3 + 2] + (this.tgt[i3 + 2] - this.snap[i3 + 2]) * w;
      } else if (tw > 0) {
        this.act[i3] = this.tgt[i3]; this.act[i3 + 1] = this.tgt[i3 + 1]; this.act[i3 + 2] = this.tgt[i3 + 2];
      } else {
        this.act[i3] = this.snap[i3]; this.act[i3 + 1] = this.snap[i3 + 1]; this.act[i3 + 2] = this.snap[i3 + 2];
      }
      this.actW[i] = sw + (tw - sw) * w;
    }
    const trw = this.tgtRootW * layer;
    for (let c = 0; c < 3; c++) {
      const s0 = this.snapRootW > 0 ? this.snapRoot[c] : this.tgtRoot[c];
      const s1 = this.snapRootW > 0 ? this.snapRootRot[c] : this.tgtRootRot[c];
      const t0 = trw > 0 ? this.tgtRoot[c] : this.snapRoot[c];
      const t1 = trw > 0 ? this.tgtRootRot[c] : this.snapRootRot[c];
      this.actRoot[c] = s0 + (t0 - s0) * w;
      this.actRootRot[c] = s1 + (t1 - s1) * w;
    }
    this.actRootW = this.snapRootW + (trw - this.snapRootW) * w;
    // combine
    for (let i = 0; i < n; i++) {
      const a = this.actW[i];
      const i3 = i * 3;
      this.out[i3] = this.loco[i3] + (this.act[i3] - this.loco[i3]) * a;
      this.out[i3 + 1] = this.loco[i3 + 1] + (this.act[i3 + 1] - this.loco[i3 + 1]) * a;
      this.out[i3 + 2] = this.loco[i3 + 2] + (this.act[i3 + 2] - this.loco[i3 + 2]) * a;
    }
    const ra = Math.min(1, Math.max(0, this.actRootW));
    for (let c = 0; c < 3; c++) {
      this.outRoot[c] = this.locoRoot[c] + (this.actRoot[c] - this.locoRoot[c]) * ra;
      this.outRootRot[c] = this.locoRootRot[c] + (this.actRootRot[c] - this.locoRootRot[c]) * ra;
    }
    // hit flinch (damped spring kicked on the rising edge of hitFlash)
    const hf = inp.hitFlash ?? 0;
    if (hf > this.lastHit + 0.02) this.flinchV += 60;
    this.lastHit = hf;
    this.flinchV += (-this.flinch * 260 - this.flinchV * 18) * Math.min(dt, 0.05);
    this.flinch += this.flinchV * Math.min(dt, 0.05);
    if (Math.abs(this.flinch) > 0.01 && inp.stage !== 'dead') {
      for (const i of this.flinchIdx) this.out[i * 3] -= this.flinch;
    }
    this.apply();
    if (this.follows.length) this.applyFollow(inp, dt);
    for (const hd of this.hides) {
      const want = inp.flags?.has(hd.flag) ? 0 : 1;
      hd.k += (want - hd.k) * Math.min(1, dt * 1.6);
      if (hd.k > 0.999 && want === 1) {
        for (const b of hd.bones) {
          b.userData.smScaled = false;
          b.scale.set(1, 1, 1);
        }
        continue;
      }
      const sc = Math.max(0.001, hd.k * hd.k);
      for (const b of hd.bones) {
        b.userData.smScaled = true;
        b.scale.setScalar(sc);
      }
    }
    // look-at weight: idle/move/telegraph only
    const lookOn = this.lookTarget && (inp.stage === 'idle' || inp.stage === 'move' || inp.stage === 'telegraph' || inp.stage === 'intro') ? 1 : 0;
    this.lookW += (lookOn - this.lookW) * Math.min(1, dt * 4);
    this.model.root.updateMatrixWorld(true);
    if (this.lookW > 0.01 && this.lookTarget) {
      for (const l of this.lookBones) aimBone(l.bone, this.lookTarget, l.weight * this.lookW, l.limit);
    }
    for (const s of this.springs) s.update(dt, inp.scale);
    this.post?.(this, dt);
  }

  private applyFollow(inp: AnimInput, dt: number): void {
    this.model.root.updateMatrixWorld(true);
    for (const f of this.follows) {
      const want = f.off && inp.flags?.has(f.off) ? 0 : 1;
      f.w += (want - f.w) * Math.min(1, dt * 2.5);
      if (f.w < 0.001) continue;
      const parent = f.bone.parent;
      if (!parent) continue;
      _m4.copy(parent.matrixWorld).invert().multiply(f.target.matrixWorld);
      _m4.decompose(_v, _q, _s3);
      f.bone.position.lerp(_v, f.w);
      f.bone.quaternion.slerp(_q, f.w);
    }
  }

  /** Write the combined pose to the bones. */
  private apply(): void {
    const n = this.n;
    const size = this.model.size;
    for (let i = 1; i < n; i++) {
      const b = this.bones[i];
      const rq = b.userData.restQuat as THREE.Quaternion;
      const rp = b.userData.restPos as THREE.Vector3;
      const i3 = i * 3;
      _e.set(this.out[i3] * DEG, this.out[i3 + 1] * DEG, this.out[i3 + 2] * DEG, 'XYZ');
      _q.setFromEuler(_e);
      if (i === this.rootIdx) {
        _e.set(this.outRootRot[0] * DEG, this.outRootRot[1] * DEG, this.outRootRot[2] * DEG, 'XYZ');
        _qr.setFromEuler(_e);
        b.quaternion.copy(rq).multiply(_qr).multiply(_q);
        b.position.set(rp.x + this.outRoot[0] * size, rp.y + this.outRoot[1] * size, rp.z + this.outRoot[2] * size);
      } else {
        b.quaternion.copy(rq).multiply(_q);
        b.position.copy(rp);
      }
      if (b.scale.x !== 1 && !b.userData.smScaled) b.scale.set(1, 1, 1);
    }
  }

  /**
   * Multi-part rigs: blend the chain tips toward the sim part anchors. `parts` = actor.parts (local hurt c + anchor),
   * `modelScale` converts actor-local units to model units. Weight rises with the anchor offset so free animation runs
   * when the behavior does not drive the anchor.
   */
  followParts(parts: readonly { id: string; anchor: { x: number; y: number; z: number }; def: { hurt: { c: [number, number, number] }[] }; active: boolean; broken: boolean }[], modelScale: number, dt: number): void {
    if (!this.partChains.length) return;
    for (const pc of this.partChains) {
      const p = parts.find((x) => x.id === pc.id);
      if (!p || !p.def.hurt.length) continue;
      const a = p.anchor;
      const mag = Math.hypot(a.x, a.y, a.z);
      const want = smooth(0.05, 0.6, mag) * pc.weight;
      pc.w += (want - pc.w) * Math.min(1, dt * 6);
      if (pc.w < 0.01) continue;
      const h = p.def.hurt[0].c;
      _v.set((h[0] + a.x) / modelScale, (h[1] + a.y) / modelScale, (h[2] + a.z) / modelScale);
      _v.applyMatrix4(this.model.root.matrixWorld);
      ccdIK(pc.chain, pc.tip, _v, 2, pc.w, 0.5);
    }
  }

  /** World position of a bone (debug / FX anchoring). */
  boneWorld(name: string, out: THREE.Vector3): THREE.Vector3 | null {
    const b = this.bone(name);
    if (!b) return null;
    return out.setFromMatrixPosition(b.matrixWorld);
  }

  resetSprings(): void {
    for (const s of this.springs) s.reset();
  }

  get stage(): string {
    return this.stageKey;
  }

  /** Current output rotation of a bone (degrees) — tests. */
  outRot(name: string): [number, number, number] | null {
    const i = this.boneIndex.get(name);
    if (i === undefined) return null;
    return [this.out[i * 3], this.out[i * 3 + 1], this.out[i * 3 + 2]];
  }
}

