/**
 * Procedural weapon builder: one template per weapon type, parameterized per weapon (model params, colors, glow, motif),
 * plus swing trails, sim-driven morphs and Art VFX. Owned by the weapons work-stream. Contract used by the actor renderer:
 *   buildWeapon(def, ctx) -> WeaponVisual (attach `root` to the hand socket, +Z out of the fist; `base`/`tip` give the
 *                            blade line for trails; `update(dt, time)` every frame; `dispose()` on swap)
 *   installWeaponFx(fx)    -> registers swing trails, Art / Transizione visuals on the FxRenderer (src/render/weapons/fx.ts)
 * Types with a dedicated template: Act I (act1.ts). Every other type uses its category template (fallback.ts) until
 * its own template lands.
 */
import type { WeaponDef } from '../../core/types';
import type { RenderCtx } from '../types';
import type { FxRenderer } from '../fx/FxRenderer';
import { ACT1_TEMPLATES } from './act1';
import { buildFallback } from './fallback';
import { LIVE, installWeaponFxImpl } from './fx';
import type { WeaponTemplate, WeaponVisual } from './types';

export type { WeaponMorph, WeaponTrail, WeaponVisual } from './types';

/** Dedicated templates by weapon type. */
export const WEAPON_TEMPLATES: Record<string, WeaponTemplate> = { ...ACT1_TEMPLATES };

export function hasDedicatedTemplate(type: string): boolean {
  return type in WEAPON_TEMPLATES;
}

export function buildWeapon(def: WeaponDef, ctx: RenderCtx): WeaponVisual {
  const tpl = WEAPON_TEMPLATES[def.model?.template ?? def.type] ?? WEAPON_TEMPLATES[def.type];
  const v = tpl ? tpl(def, ctx) : buildFallback(def, ctx);
  v.def = def;
  v.root.name = `weapon:${def.id}`;
  v.root.userData.weapon = def.id;
  LIVE.add(v);
  const dispose = v.dispose;
  v.dispose = () => {
    LIVE.delete(v);
    dispose();
  };
  return v;
}

let installed: WeakSet<FxRenderer> | null = null;

export function installWeaponFx(fx: FxRenderer): void {
  installed ??= new WeakSet();
  if (installed.has(fx)) return;
  installed.add(fx);
  installWeaponFxImpl(fx);
}
