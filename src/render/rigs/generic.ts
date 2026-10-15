/**
 * Generic boss/minion model: the fallback used when a content id has no model module in BOSS_MODELS (or it fails to load).
 * Built from the data alone — def.model.rig picks the rig family, def.model.palette the colors, def.body the size, the
 * part list the number of heads — so an unfinished boss still reads as a proper creature of its family, never a capsule.
 */
import * as THREE from 'three';
import type { BossDef, MinionDef } from '../../core/types';
import type { Actor } from '../../sim/actor';
import type { RenderCtx } from '../types';
import * as geo from '../kit/geometry';
import { pal } from '../kit/index';
import { mix, shade } from '../kit/palette';
import type { ModelBuilder } from '../kit/model';
import { colorsFrom, standardSurfaces, type ColorSet } from './families/common';
import { humanoidBody, humanoidSkeleton } from './families/humanoid';
import { quadrupedBody, quadrupedSkeleton } from './families/quadruped';
import { mountedSkeleton } from './families/mounted';
import { serpentBody, serpentSkeleton } from './families/serpent';
import { colossusBody, colossusSkeleton, type ColossusMatter } from './families/colossus';
import { treeBody, treeSkeleton } from './families/tree';
import { dragonBody, dragonSkeleton } from './families/dragon';
import { birdBody, birdSkeleton } from './families/bird';
import { insectBody, insectSkeleton, type InsectKind } from './families/insect';
import { tentacledBody, tentacledSkeleton } from './families/tentacled';
import { RigVisual, type FlagAura } from './visual';

/** Rig family keyword (def.model.rig) -> clip library id. */
export function familyOf(rig: string): string {
  const r = rig.toLowerCase();
  if (r.startsWith('mounted')) return 'mounted';
  if (r.includes('quadruped') || r.includes('wolf') || r.includes('hound') || r.includes('bear') || r.includes('beast')) return 'quadruped';
  if (r.includes('serpent') || r.includes('snake') || r.includes('worm') || r.includes('hydra') || r.includes('chain')) return 'serpent';
  if (r.includes('dragon') || r.includes('wyvern')) return 'dragon';
  if (r.includes('bird') || r.includes('griffin') || r.includes('eagle')) return 'bird';
  if (r.includes('insect') || r.includes('mantis') || r.includes('beetle') || r.includes('ant') || r.includes('spider') || r.includes('wasp')) return 'insect';
  if (r.includes('tree') || r.includes('plant')) return 'tree';
  if (r.includes('tentacle') || r.includes('kraken') || r.includes('cthulhu')) return 'tentacled';
  if (r.includes('colossus') || r.includes('golem') || r.includes('giant')) return 'colossus';
  return 'humanoid';
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Simple procedural weapon for generic humanoids (blade with guard and grip, +Z out of the fist). */
function genericBlade(mb: ModelBuilder, hand: string, handH: number, C: ColorSet, len: number, surf: { metal: string; dark: string; glow: string }): void {
  const w = len * 0.07;
  // grip position in the hand bone's frame (same as the humanoid grip socket)
  const gy = -0.045 * handH, gz = 0.012 * handH;
  const at = (z: number): [number, number, number] => [0, gy, gz + z];
  const outline = geo.leafOutline(len, w, 0.2, 10, 1.6);
  const blade = geo.blade(outline, w * 0.18).rotateX(-Math.PI / 2).translate(0, gy, gz + len * 0.08);
  mb.part(hand, blade, surf.metal, { color: C.metal });
  mb.part(hand, geo.bevelBox(w * 3.2, w * 0.5, w * 0.5, w * 0.12), surf.dark, { pos: at(len * 0.07), color: C.trim });
  mb.part(hand, geo.capsule(w * 0.32, len * 0.16, 6, 2).rotateX(Math.PI / 2), surf.dark, { pos: at(-len * 0.02), color: C.clothDark });
  mb.part(hand, geo.ellipsoid(w * 0.18, w * 0.18, len * 0.5, 6, 4), surf.glow, { pos: at(len * 0.5), color: C.glow, scale: [1, 0.35, 1] });
}

/** Build the generic visual for a boss/minion/clone. */
export function buildGenericVisual(def: BossDef | MinionDef, ctx: RenderCtx, actor: Actor): RigVisual {
  const rig = def.model?.rig ?? 'humanoid';
  const family = familyOf(rig);
  const P = pal(ctx, def.model?.palette ?? 'portatore');
  const C = colorsFrom(P);
  const H = Math.max(0.5, def.body.height);
  const R = Math.max(0.2, def.body.radius);
  const seed = hashStr(def.id);
  const heads = Math.max(1, Math.min(3, (('parts' in def ? def.parts : undefined) ?? []).filter((p) => /head|testa|neck|collo/.test(p.id)).length || 1));
  const mb = ctx.kit.model(def.id, ctx.quality);
  const auras: Record<string, FlagAura> = {};
  switch (family) {
    case 'mounted': {
      const horseH = H * 0.5;
      const d = mountedSkeleton(mb, { horse: { length: Math.max(R * 1.3, horseH * 0.95), height: horseH, legStyle: 'equine', tailBones: 4 }, rider: { height: H * 0.5, build: 0.62, cape: 5, jaw: false } });
      const S = standardSurfaces(mb);
      quadrupedBody(mb, d.horse, { body: shade(C.body, 0.7), belly: C.belly, dark: C.bodyDark, mane: C.cloth, eye: C.eye, ears: 'equine', surfaces: S, bulk: 1.05 });
      humanoidBody(mb, d.rider, { skin: mix(C.body, '#c8a080', 0.5), cloth: C.cloth, metal: C.metal, trim: C.trim, glow: C.glow, armor: 'plate', head: 'helm', eyeGlow: true, cape: { color: C.cloth, colorEnd: C.clothDark, ragged: 0.3 }, surfaces: S });
      genericBlade(mb, 'rider_hand_r', H * 0.5, C, H * 0.62, S);
      break;
    }
    case 'quadruped': {
      const d = quadrupedSkeleton(mb, { length: Math.max(R * 1.4, H * 0.9), height: H * 0.72, legStyle: R > H * 0.45 ? 'ursine' : 'canine', heads });
      quadrupedBody(mb, d, { body: C.body, belly: C.belly, dark: C.bodyDark, mane: C.cloth, eye: C.eye, eyeGlow: true, fur: true, ears: 'pointed', teeth: true, horns: (seed & 1) === 1 });
      break;
    }
    case 'serpent': {
      const d = serpentSkeleton(mb, { length: Math.max(H * 3, R * 8), radius: R * 0.45, heads, rise: H * 0.6 });
      serpentBody(mb, d, { body: C.body, belly: C.belly, pattern: C.bodyDark, eye: C.eye, eyeGlow: true, spikes: 'fin', spikeColor: C.trim, scales: true, glow: C.glow });
      break;
    }
    case 'dragon': {
      const d = dragonSkeleton(mb, { length: Math.max(R * 2.4, H * 1.3), height: H * 0.55, heads, wingSpan: H * 2.2 });
      dragonBody(mb, d, { body: C.body, belly: C.belly, membrane: C.cloth, membraneEdge: C.trim, horn: C.horn, eye: C.eye, glow: C.glow, spikes: true });
      break;
    }
    case 'bird': {
      const d = birdSkeleton(mb, { height: H, wingSpan: H * 2.6, griffin: /griff/.test(rig) });
      birdBody(mb, d, { feather: C.body, featherTip: C.bodyDark, belly: C.belly, fur: C.cloth, beak: C.trim, talon: C.horn, eye: C.eye, glow: C.glow });
      break;
    }
    case 'insect': {
      const kinds: InsectKind[] = ['mantis', 'beetle', 'ant', 'wasp', 'spider'];
      const kind = kinds.find((k) => rig.includes(k)) ?? kinds[seed % 3];
      const d = insectSkeleton(mb, { kind, height: H, length: Math.max(R * 2, H) });
      insectBody(mb, d, { shell: C.body, shellDark: C.bodyDark, belly: C.belly, eye: C.eye, sheen: C.trim, glow: C.glow, blade: C.metal, wing: C.cloth });
      break;
    }
    case 'tree': {
      const d = treeSkeleton(mb, { height: H, radius: R * 0.5 });
      treeBody(mb, d, { bark: C.body, barkDark: C.bodyDark, leaves: C.cloth, leavesTip: C.trim, glow: C.glow, moss: C.belly, face: true });
      break;
    }
    case 'tentacled': {
      const d = tentacledSkeleton(mb, { variant: /cthulhu/.test(rig) ? 'cthulhu' : 'kraken', height: H });
      tentacledBody(mb, d, { skin: C.body, belly: C.belly, sucker: C.trim, eye: C.eye, glow: C.glow, membrane: C.cloth });
      break;
    }
    case 'colossus': {
      const d = colossusSkeleton(mb, { height: H, build: 0.8 });
      const matters: ColossusMatter[] = ['rock', 'mud', 'lava', 'ice', 'bone'];
      const matter = matters.find((m) => rig.includes(m) || def.id.includes(m)) ?? 'rock';
      colossusBody(mb, d, { matter, body: C.body, chunk: C.bodyDark, glow: C.glow, heart: true, dressing: true });
      break;
    }
    default: {
      const build = Math.min(1, Math.max(0, (R / H) * 2.4 - 0.3));
      const d = humanoidSkeleton(mb, { height: H, build, cape: 5, jaw: true });
      const S = standardSurfaces(mb);
      humanoidBody(mb, d, {
        skin: mix(C.body, '#b89070', 0.35), cloth: C.cloth, clothDark: C.clothDark, metal: C.metal, trim: C.trim, glow: C.glow,
        armor: seed % 3 === 0 ? 'robe' : 'plate', head: seed % 2 === 0 ? 'helm' : 'hood', eyeGlow: true,
        cape: { color: C.cloth, colorEnd: C.clothDark, ragged: 0.35 }, surfaces: S, bulk: 1 + build * 0.25,
      });
      genericBlade(mb, 'hand_r', H, C, H * 0.55, S);
      break;
    }
  }
  if (family !== 'colossus' && family !== 'tree') auras.spectral_aura = { color: mix(C.glow, '#bfe6ff', 0.5), strength: 1.2 };
  auras.enraged = { color: '#ff6a3a', strength: 1.0 };
  const model = mb.build();
  model.setShadow(ctx.quality !== 'low');
  void THREE;
  return new RigVisual(ctx, def, actor, model, { family, flagAuras: auras });
}
