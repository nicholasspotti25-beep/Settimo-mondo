/**
 * Serpent / chain family: giant snakes (Grande Divoratore), sea serpents, hydras (multi-head, up to 5 necks), worms
 * (Verme Mangiamondi: `mouth: 'ring'`), eels and chains of flesh.
 *
 * Skeleton (rest: lying along -Z behind the origin, head(s) raised in front, facing +Z):
 *   root -> body_0 (front, under the neck) -> body_1 ... body_n (tail tip, toward -Z)
 *   body_0 -> neck{sfx}_0..k -> head{sfx} -> jaw{sfx}     sfx: '' | _l | _r | _l2 | _r2
 * Locomotion is a travelling wave on `body` (axis y) driven by distance; the root bone is body_0.
 */
import * as geo from '../../kit/geometry';
import type { ModelBuilder } from '../../kit/model';
import { mix, shade } from '../../kit/palette';
import { bezierPoints, boneAt, chainThrough, creatureHead, dorsalSpikes, headSuffixes, profile, standardSurfaces, suffixSide, type SurfaceIds, type SurfaceStyle } from './common';

export interface SerpentOpts {
  /** Body length from the neck base to the tail tip (meters). */
  length: number;
  /** Maximum body radius (meters). */
  radius: number;
  /** Body bones (quality scaled, default 14). */
  segments?: number;
  heads?: number;
  neckBones?: number;
  /** Neck length (meters, default 0.22 x length). */
  neckLength?: number;
  /** Head height above the ground in the raised posture (meters). */
  rise?: number;
  /** Fraction of the body ahead of the actor origin (default 0.22). */
  front?: number;
}

export interface SerpentDims {
  L: number;
  r: number;
  body: string[];
  heads: string[];
  necks: Record<string, string[]>;
  rise: number;
}

export function serpentSkeleton(mb: ModelBuilder, o: SerpentOpts): SerpentDims {
  const L = o.length, r = o.radius;
  const n = mb.seg(o.segments ?? 14, 8);
  const front = (o.front ?? 0.22) * L;
  const seg = L / n;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([0, r * 0.92, front - i * seg]);
  const body = chainThrough(mb, 'body', 'root', pts);
  const heads = headSuffixes(o.heads ?? 1);
  const nl = o.neckLength ?? 0.22 * L;
  const nb = o.neckBones ?? 4;
  const rise = o.rise ?? Math.max(r * 3, nl * 0.75);
  const necks: Record<string, string[]> = {};
  const base = mb.restPos('body_0');
  for (const sfx of heads) {
    const { side, rank } = suffixSide(sfx);
    const sx = side * (r * 0.55 + rank * r * 0.35);
    const a: [number, number, number] = [base.x + sx * 0.5, base.y + r * 0.3, base.z + r * 0.4];
    const tip: [number, number, number] = [base.x + sx * (1.6 + rank * 0.6) * r * (heads.length > 1 ? 1 : 0), rise - rank * r * 0.5, base.z + nl * (0.55 - rank * 0.08)];
    const ctrl: [number, number, number] = [a[0] + (tip[0] - a[0]) * 0.3, tip[1] * 0.25 + a[1] * 0.4, tip[2] + nl * 0.15];
    const np = bezierPoints(a, ctrl, tip, nb);
    np.unshift(a);
    const names = chainThrough(mb, `neck${sfx}`, 'body_0', np.slice(0, nb));
    necks[sfx] = names;
    const last = np[np.length - 1];
    boneAt(mb, `head${sfx}`, names[names.length - 1], last);
    boneAt(mb, `jaw${sfx}`, `head${sfx}`, [last[0], last[1] - r * 0.12, last[2] + r * 0.12]);
    mb.socket(`mouth${sfx}`, `head${sfx}`, [0, -r * 0.05, r * 1.6]);
  }
  mb.size = r * 2;
  mb.height = Math.max(rise + r, r * 2);
  mb.info.family = mb.info.family ?? 'serpent';
  mb.info.rootBone = 'body_0';
  mb.info.walkSpeed = 2.5 * (r / 0.8);
  mb.info.runSpeed = 8 * (r / 0.8);
  mb.info.look = heads.map((s) => ({ bone: `head${s}`, weight: 0.6, limit: 50 }));
  mb.info.flinch = heads.map((s) => `neck${s}_0`);
  const springs = (mb.info.springs as unknown[] | undefined) ?? [];
  springs.push({ chain: body.slice(Math.floor(n * 0.55)), stiffness: 30, damping: 5, gravity: 0, falloff: 0.4, weight: 0.6 });
  mb.info.springs = springs;
  return { L, r, body, heads, necks, rise };
}

export interface SerpentBodyStyle {
  body: string;
  belly?: string;
  pattern?: string;
  eye: string;
  eyeGlow?: boolean;
  horns?: number;
  /** Dorsal fin / spikes. */
  spikes?: 'spikes' | 'fin' | 'plates' | 'none';
  spikeColor?: string;
  /** 'snake' jaws or a round worm 'ring' mouth with spiral teeth. */
  mouth?: 'snake' | 'ring';
  /** Scatter plates on the back. */
  scales?: boolean;
  /** Glowing veins / spots along the flanks. */
  glow?: string;
  surfaces?: SurfaceIds;
  surfaceStyle?: SurfaceStyle;
}

export function serpentBody(mb: ModelBuilder, d: SerpentDims, s: SerpentBodyStyle): SurfaceIds {
  const S = s.surfaces ?? standardSurfaces(mb, '', { skinDetail: 'scales', skinRough: 0.5, ...s.surfaceStyle });
  const r = d.r;
  const belly = s.belly ?? mix(s.body, '#efe0b8', 0.45);
  const pattern = s.pattern ?? shade(s.body, 0.6);
  const body = mb.tube(d.body, S.skin, {
    radius: profile([[0, r * 0.82], [0.12, r], [0.4, r * 0.96], [0.7, r * 0.62], [0.9, r * 0.26], [1, r * 0.06]]),
    tip: (d.L / d.body.length) * 0.9, start: r * 0.6, radial: 14, perBone: 3, color: s.body, colorEnd: pattern, belly, flatten: [1.12, 0.88], capStart: true,
  });
  if (s.scales !== false) {
    const scale = geo.plate(0.5, 0.42, 0.6, 0.06, 4, 1);
    scale.rotateX(-Math.PI / 2);
    body.scatter(S.skin, scale, mb.quality === 'low' ? 22 : 48, { t: [0.04, 0.85], theta: [-1.1, 1.1], scale: [0.35, 0.55], lean: 55, seed: 11, color: shade(s.body, 0.78), sink: 0.25 });
  }
  if (s.glow) body.scatter(S.glow, geo.ellipsoid(0.16, 0.1, 0.22, 6, 4), mb.quality === 'low' ? 10 : 22, { t: [0.06, 0.8], theta: [1.2, 1.9], scale: [0.25, 0.45], seed: 5, color: s.glow, sink: 0.4 });
  const sp = s.spikes ?? 'spikes';
  if (sp !== 'none') {
    dorsalSpikes(mb, S.horn, d.body.slice(0, Math.max(2, d.body.length - 2)), (t) => r * (sp === 'fin' ? 0.9 : 0.7) * (1 - t * 0.85), s.spikeColor ?? shade(s.body, 0.5), {
      offsetY: (t) => r * (0.85 - t * 0.5), lean: sp === 'fin' ? 55 : 35, plate: sp !== 'spikes', perBone: sp === 'fin' ? 2 : 1,
    });
  }
  for (const sfx of d.heads) {
    const nk = d.necks[sfx];
    const neck = mb.tube(['body_0', ...nk, `head${sfx}`], S.skin, {
      radius: profile([[0, r * 0.85], [0.35, r * 0.62], [0.8, r * 0.5], [1, r * 0.46]]), tip: r * 0.2, radial: 12, perBone: 3, color: s.body, belly, blendParent: false, capEnd: false,
    });
    if (s.scales !== false) {
      const sc = geo.plate(0.5, 0.42, 0.6, 0.06, 4, 1);
      sc.rotateX(-Math.PI / 2);
      neck.scatter(S.skin, sc, mb.quality === 'low' ? 6 : 14, { t: [0.1, 0.9], theta: [-0.9, 0.9], scale: [0.3, 0.45], lean: 55, seed: 3, color: shade(s.body, 0.8), sink: 0.25 });
    }
    if (s.mouth === 'ring') {
      // worm maw: a flared ring of spiral teeth facing forward
      const lip = geo.torus(r * 0.62, r * 0.16, mb.seg(8, 5), mb.seg(22, 12));
      mb.part(`head${sfx}`, lip, S.skin, { pos: [0, 0, r * 0.55], color: shade(s.body, 0.7) });
      const rings = 3;
      for (let k = 0; k < rings; k++) {
        const count = mb.quality === 'low' ? 8 : 14;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + k * 0.4;
          const rr = r * (0.55 - k * 0.14);
          mb.part(`head${sfx}`, geo.spike(r * 0.06, r * 0.28, 4, r * 0.08), S.horn, { pos: [Math.cos(a) * rr, Math.sin(a) * rr, r * (0.5 - k * 0.18)], rot: [90, 0, (a * 180) / Math.PI - 90 + 25], color: '#efe2c6' });
        }
      }
      mb.part(`head${sfx}`, geo.ellipsoid(r * 0.42, r * 0.42, r * 0.1, 12, 6), S.glow, { pos: [0, 0, r * 0.12], color: s.glow ?? '#ff6a3a' });
    } else {
      creatureHead(mb, S, `head${sfx}`, `jaw${sfx}`, {
        length: r * 1.9, width: r * 1.05, height: r * 0.72, color: s.body, belly, eye: s.eye, eyeGlow: s.eyeGlow ?? true, teeth: true, horns: s.horns ?? 0,
        hornColor: s.spikeColor, crest: 3, snout: 'reptile',
      });
    }
  }
  return S;
}
