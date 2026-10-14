/**
 * MetamondoController (C6 / D10): meter 0..100 that fills 100/150 per second, +3 per perfect dodge, starts each fight at 50.
 * Activation (when full) pulls player and boss into the Form's diorama for 30 s: +50% damage, Eco x2, boss cannot heal or
 * summon, plus the Form ability. Lucifero I shatters it, Reina rewrites its sky, Cthulhu devours it and spits it out.
 * In the last fight it is activated by the story (Settimo Mondo).
 */
import { clamp, v3, type Vec3 } from '../core/math';
import type { FormAbility, FormDef } from '../core/types';
import type { Sim } from './sim';

export class MetamondoController {
  meter = 0;
  active = false;
  time = 0;
  duration = 30;
  form: FormDef | null = null;
  ability: FormAbility | null = null;
  damageMult = 1;
  ecoMult = 1;
  noBossHeal = false;
  forced = false;
  /** Reina rewrote the sky: ability suppressed, base bonuses kept. */
  rewritten = false;
  /** Cthulhu devoured it: ends early at devourAt. */
  devourAt = -1;
  savedPlayer: Vec3 = v3();
  savedBoss: Vec3 = v3();
  readyAnnounced = false;
  /** Environment id rendered while active. */
  environment = '';

  reset(start: number): void {
    this.meter = start;
    this.active = false;
    this.time = 0;
    this.form = null;
    this.ability = null;
    this.damageMult = 1;
    this.ecoMult = 1;
    this.noBossHeal = false;
    this.forced = false;
    this.rewritten = false;
    this.devourAt = -1;
    this.readyAnnounced = start >= 100;
  }

  get fraction(): number {
    return this.active ? 1 - this.time / this.duration : this.meter / 100;
  }
  get ready(): boolean {
    return !this.active && this.meter >= 100;
  }

  addPerfectDodge(sim: Sim): void {
    if (!this.active) this.meter = Math.min(100, this.meter + sim.bal.metamondo.perfect_dodge_bonus);
  }

  update(sim: Sim, dt: number): void {
    if (!sim.fight || !sim.fight.active) return;
    if (this.active) {
      this.time += dt;
      if (this.devourAt > 0 && this.time >= this.devourAt) {
        sim.emit({ type: 'metamondoReaction', reaction: 'spit' });
        this.end(sim, 50);
        return;
      }
      if (this.time >= this.duration && !this.forced) this.end(sim, 0);
      return;
    }
    if (sim.challenges.noMetamondo) return;
    this.meter = clamp(this.meter + (100 / sim.bal.metamondo.fill_time) * dt, 0, 100);
    if (this.meter >= 100 && !this.readyAnnounced) {
      this.readyAnnounced = true;
      sim.emit({ type: 'metamondoReady' });
    }
  }

  tryActivate(sim: Sim): boolean {
    if (!this.ready || !sim.fight?.active || sim.challenges.noMetamondo || sim.inputLocked) return false;
    const formId = sim.state.equippedForm;
    const form = sim.c.form(formId);
    const boss = sim.boss;
    const reaction = boss?.behavior?.onMetamondoStart?.(boss, sim) ?? (boss?.bossDef?.metamondo_reaction ?? 'normal');
    sim.player.usedMetamondo = true;
    if (reaction === 'shatter') {
      // Lucifero shatters it with one finger
      this.meter = 0;
      this.readyAnnounced = false;
      sim.emit({ type: 'metamondoReaction', reaction: 'shatter' });
      sim.emit({ type: 'shake', strength: 0.6, dur: 0.6 });
      return true;
    }
    this.begin(sim, form, false);
    if (reaction === 'rewrite') {
      this.rewritten = true;
      this.removeAbility(sim);
      this.ability = null;
      this.environment = 'cielo_riscritto';
      sim.emit({ type: 'metamondoReaction', reaction: 'rewrite' });
    } else if (reaction === 'devour') {
      this.devourAt = 4.5;
      sim.emit({ type: 'metamondoReaction', reaction: 'devour' });
    }
    return true;
  }

  /** Story-driven activation (final fight). */
  forceActivate(sim: Sim, form: FormDef): void {
    if (this.active) this.end(sim, 0);
    this.begin(sim, form, true);
  }

  private begin(sim: Sim, form: FormDef, forced: boolean): void {
    const M = sim.bal.metamondo;
    this.active = true;
    this.forced = forced;
    this.time = 0;
    this.form = form;
    this.ability = form.ability.id;
    this.duration = form.base.duration || M.duration;
    this.damageMult = form.base.damage_mult || M.damage_mult;
    this.ecoMult = form.base.eco_regen_mult || M.eco_regen_mult;
    this.noBossHeal = form.base.boss_no_heal;
    this.environment = form.environment;
    this.meter = 0;
    this.readyAnnounced = false;
    this.savedPlayer = { ...sim.player.pos };
    if (sim.boss) this.savedBoss = { ...sim.boss.pos };
    sim.enterMetamondoSpace();
    this.applyAbility(sim);
    sim.emit({ type: 'metamondoStart', form: form.id, forced });
  }

  private applyAbility(sim: Sim): void {
    const f = this.form;
    if (!f) return;
    const pr = f.ability.params;
    switch (f.ability.id) {
      case 'statura':
        sim.player.formScale = Number(pr.scale ?? sim.bal.scale.gigante);
        sim.emit({ type: 'scale', scale: sim.player.scale });
        break;
      case 'riflessi':
        sim.spawnPlayerClones(Number(pr.clones ?? 2));
        break;
      case 'patto_di_sangue':
        this.damageMult = Number(pr.damage_mult ?? 2.0);
        break;
      case 'ali_di_luce':
        sim.player.flying = true;
        break;
      case 'tempo_stellare':
        if (sim.boss) for (const p of sim.boss.parts) p.highlight = (p.def.damage_mult ?? 1) > 1 || !!p.def.lockable;
        break;
      case 'settimo_mondo':
        this.damageMult = Number(pr.damage_mult ?? 2.5);
        sim.player.flying = false;
        break;
      default:
        break;
    }
  }

  private removeAbility(sim: Sim): void {
    sim.player.formScale = 1;
    sim.player.flying = false;
    sim.removePlayerClones();
    if (sim.boss) for (const p of sim.boss.parts) p.highlight = false;
    if (this.form?.ability.id === 'patto_di_sangue') this.damageMult = this.form.base.damage_mult;
  }

  end(sim: Sim, refill: number): void {
    if (!this.active) return;
    const form = this.form;
    this.removeAbility(sim);
    this.active = false;
    this.forced = false;
    this.time = 0;
    this.meter = refill;
    this.readyAnnounced = refill >= 100;
    this.damageMult = 1;
    this.ecoMult = 1;
    this.noBossHeal = false;
    this.rewritten = false;
    this.devourAt = -1;
    sim.exitMetamondoSpace();
    if (sim.boss) sim.boss.behavior?.onMetamondoEnd?.(sim.boss, sim);
    sim.emit({ type: 'metamondoEnd', form: form?.id ?? '' });
  }
}
