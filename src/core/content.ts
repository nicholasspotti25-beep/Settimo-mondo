/**
 * Runtime access to the compiled content bundle (src/generated/content.json, built from /data by tools/build-data.ts).
 * Pure data, usable from sim, render, ui, tools and tests.
 */
import type {
  AltarDef, ArenaDef, BossDef, ContentBundle, FormDef, HazardKindDef, MovesetDef, ProjectileKindDef, RepertoDef, SequenceDef,
  SkyPresetDef, SpeakerDef, SwingDef, TransitionCategory, TransitionDef, WeaponDef, ZoneDef,
} from './types';

export class Content {
  readonly bundle: ContentBundle;
  readonly bosses: BossDef[];
  readonly weapons: WeaponDef[];
  private bossMap = new Map<string, BossDef>();
  private weaponMap = new Map<string, WeaponDef>();
  private movesetMap = new Map<string, MovesetDef>();
  private swingMap = new Map<string, SwingDef | SwingDef[]>();
  private formMap = new Map<string, FormDef>();
  private altarMap = new Map<string, AltarDef>();
  private zoneMap = new Map<string, ZoneDef>();
  private arenaMap = new Map<string, ArenaDef>();
  private seqMap = new Map<string, SequenceDef>();
  private speakerMap = new Map<string, SpeakerDef>();
  private projMap = new Map<string, ProjectileKindDef>();
  private hazMap = new Map<string, HazardKindDef>();
  private repertoMap = new Map<string, RepertoDef>();
  private skyMap = new Map<string, SkyPresetDef>();
  private transMap = new Map<string, TransitionDef>();

  constructor(bundle: ContentBundle) {
    this.bundle = bundle;
    this.bosses = [...bundle.bosses].sort((a, b) => a.order - b.order);
    this.weapons = bundle.weapons;
    for (const b of this.bosses) this.bossMap.set(b.id, b);
    for (const w of bundle.weapons) this.weaponMap.set(w.id, w);
    for (const m of bundle.movesets) {
      this.movesetMap.set(m.id, m);
      for (const [k, v] of Object.entries(m.swings)) this.swingMap.set(k, v);
    }
    for (const f of bundle.forms) this.formMap.set(f.id, f);
    for (const a of bundle.altars) this.altarMap.set(a.id, a);
    for (const z of bundle.zones) this.zoneMap.set(z.id, z);
    for (const a of bundle.arenas) this.arenaMap.set(a.id, a);
    for (const s of bundle.sequences) this.seqMap.set(s.id, s);
    for (const s of bundle.speakers) this.speakerMap.set(s.id, s);
    for (const p of bundle.projectiles) this.projMap.set(p.id, p);
    for (const h of bundle.hazards) this.hazMap.set(h.id, h);
    for (const r of bundle.reperti) this.repertoMap.set(r.id, r);
    for (const s of bundle.skies) this.skyMap.set(s.id, s);
    for (const t of bundle.transitions) this.transMap.set(`${t.from}>${t.to}`, t);
  }

  get balance() {
    return this.bundle.balance;
  }
  boss(id: string): BossDef {
    const b = this.bossMap.get(id);
    if (!b) throw new Error(`Unknown boss ${id}`);
    return b;
  }
  hasBoss(id: string): boolean {
    return this.bossMap.has(id);
  }
  weapon(id: string): WeaponDef {
    const w = this.weaponMap.get(id);
    if (!w) throw new Error(`Unknown weapon ${id}`);
    return w;
  }
  hasWeapon(id: string): boolean {
    return this.weaponMap.has(id);
  }
  moveset(id: string): MovesetDef {
    const m = this.movesetMap.get(id);
    if (!m) throw new Error(`Unknown moveset ${id}`);
    return m;
  }
  movesetForType(type: string): MovesetDef {
    return this.moveset(type);
  }
  swing(id: string): SwingDef | SwingDef[] {
    const s = this.swingMap.get(id);
    if (!s) throw new Error(`Unknown swing ${id}`);
    return s;
  }
  swingList(id: string): SwingDef[] {
    const s = this.swing(id);
    return Array.isArray(s) ? s : [s];
  }
  form(id: string): FormDef {
    const f = this.formMap.get(id);
    if (!f) throw new Error(`Unknown form ${id}`);
    return f;
  }
  get forms(): FormDef[] {
    return [...this.bundle.forms].sort((a, b) => a.order - b.order);
  }
  altar(id: string): AltarDef {
    const a = this.altarMap.get(id);
    if (!a) throw new Error(`Unknown altar ${id}`);
    return a;
  }
  hasAltar(id: string): boolean {
    return this.altarMap.has(id);
  }
  zone(id: string): ZoneDef {
    const z = this.zoneMap.get(id);
    if (!z) throw new Error(`Unknown zone ${id}`);
    return z;
  }
  hasZone(id: string): boolean {
    return this.zoneMap.has(id);
  }
  arena(id: string): ArenaDef {
    const a = this.arenaMap.get(id);
    if (!a) throw new Error(`Unknown arena ${id}`);
    return a;
  }
  sequence(id: string): SequenceDef {
    const s = this.seqMap.get(id);
    if (!s) throw new Error(`Unknown sequence ${id}`);
    return s;
  }
  hasSequence(id: string): boolean {
    return this.seqMap.has(id);
  }
  speaker(id: string): SpeakerDef | undefined {
    return this.speakerMap.get(id);
  }
  projectile(id: string): ProjectileKindDef | undefined {
    return this.projMap.get(id);
  }
  hazard(id: string): HazardKindDef | undefined {
    return this.hazMap.get(id);
  }
  reperto(id: string): RepertoDef {
    const r = this.repertoMap.get(id);
    if (!r) throw new Error(`Unknown reperto ${id}`);
    return r;
  }
  sky(id: string): SkyPresetDef | undefined {
    return this.skyMap.get(id);
  }
  transition(from: TransitionCategory, to: TransitionCategory): TransitionDef | undefined {
    return this.transMap.get(`${from}>${to}`);
  }
  bossForArena(arenaId: string): BossDef[] {
    return this.bosses.filter((b) => b.arena === arenaId);
  }
  bossesInZone(zoneId: string): BossDef[] {
    return this.bosses.filter((b) => b.zone === zoneId);
  }
  altarsInZone(zoneId: string): AltarDef[] {
    return this.bundle.altars.filter((a) => a.zone === zoneId);
  }
  weaponDroppedBy(bossId: string): WeaponDef | undefined {
    return this.bundle.weapons.find((w) => w.source_boss === bossId);
  }
}

let current: Content | null = null;

export function setContent(bundle: ContentBundle): Content {
  current = new Content(bundle);
  return current;
}

export function content(): Content {
  if (!current) throw new Error('Content not loaded');
  return current;
}
