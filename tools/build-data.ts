/**
 * Compiles and validates /data (YAML) and /locales/<lang>/*.yaml into:
 *   src/generated/content.json, locales/it.json, locales/en.json
 * Fails (exit 1) on any schema error, broken cross-reference or missing/placeholder localization string.
 *
 * Usage: tsx tools/build-data.ts [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import type { z } from 'zod';
import * as S from './schemas';
import type { ContentBundle } from '../src/core/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const quiet = process.argv.includes('--quiet');
const errors: string[] = [];
const warnings: string[] = [];

function readYaml(file: string): unknown {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return YAML.parse(text, { uniqueKeys: true });
  } catch (e) {
    errors.push(`${rel(file)}: YAML parse error: ${(e as Error).message}`);
    return null;
  }
}
function rel(f: string): string {
  return path.relative(ROOT, f);
}
function listYaml(dir: string): string[] {
  const full = path.join(DATA, dir);
  if (!fs.existsSync(full)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(e.name)) out.push(p);
    }
  };
  walk(full);
  return out.sort();
}

function validate<T>(schema: z.ZodType<T>, value: unknown, where: string): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    for (const issue of r.error.issues.slice(0, 12)) {
      errors.push(`${where}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return null;
  }
  return r.data;
}

/** Load a directory where each file holds one def or an array of defs. */
function loadDefs<T>(dir: string, schema: z.ZodType<T>): T[] {
  const out: T[] = [];
  for (const f of listYaml(dir)) {
    const raw = readYaml(f);
    if (raw == null) continue;
    const items = Array.isArray(raw) ? raw : [raw];
    items.forEach((item, i) => {
      const v = validate(schema, item, `${rel(f)}${items.length > 1 ? `[${i}]` : ''}`);
      if (v) out.push(v);
    });
  }
  return out;
}
function loadFile<T>(file: string, schema: z.ZodType<T>): T | null {
  const full = path.join(DATA, file);
  if (!fs.existsSync(full)) {
    errors.push(`missing data/${file}`);
    return null;
  }
  return validate(schema, readYaml(full), `data/${file}`);
}
function loadArrayFile<T>(file: string, schema: z.ZodType<T>): T[] {
  const full = path.join(DATA, file);
  if (!fs.existsSync(full)) {
    errors.push(`missing data/${file}`);
    return [];
  }
  const raw = readYaml(full);
  if (!Array.isArray(raw)) {
    errors.push(`data/${file}: expected a list`);
    return [];
  }
  const out: T[] = [];
  raw.forEach((item, i) => {
    const v = validate(schema, item, `data/${file}[${i}]`);
    if (v) out.push(v);
  });
  return out;
}
function loadKeyed(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of listYaml(dir)) {
    const raw = readYaml(f);
    if (raw != null) out[path.basename(f).replace(/\.ya?ml$/, '')] = raw;
  }
  return out;
}
function dupCheck(kind: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */

const balance = loadFile('balance.yaml', S.balance);
const bosses = loadDefs('bosses', S.boss);
const weapons = loadDefs('weapons', S.weapon);
const movesets = loadDefs('movesets', S.moveset);
const transitions = loadDefs('transitions', S.transition);
const forms = loadDefs('forms', S.form);
const altars = loadDefs('altars', S.altar);
const zones = loadDefs('zones', S.zone);
const arenas = loadDefs('arenas', S.arena);
const reperti = loadDefs('reperti', S.reperto);
const voce = loadDefs('voce', S.voce);
const sequences = loadDefs('story', S.sequence);
const speakers = loadDefs('speakers', S.speaker);
const progression = loadFile('progression.yaml', S.progression);
const projectiles = loadDefs('projectiles', S.projectileKind);
const hazards = loadDefs('hazards', S.hazardKind);
const skies = loadDefs('skies', S.sky);
const timeofday: Record<string, z.infer<typeof S.timeofday>> = {};
for (const [k, v] of Object.entries(loadKeyed('timeofday'))) {
  const t = validate(S.timeofday, v, `data/timeofday/${k}.yaml`);
  if (t) timeofday[k] = t;
}
const touch_layouts: Record<string, z.infer<typeof S.touchLayout>> = {};
for (const [k, v] of Object.entries(loadKeyed('ui'))) {
  if (!k.startsWith('touch_')) continue;
  const t = validate(S.touchLayout, v, `data/ui/${k}.yaml`);
  if (t) touch_layouts[k] = t;
}
const anim = loadKeyed('anim');
const music = loadKeyed('music');
const palettes: Record<string, Record<string, string>> = {};
for (const [k, v] of Object.entries(loadKeyed('palettes'))) Object.assign(palettes, k === 'index' ? v : { [k]: v });

dupCheck('boss', bosses.map((b) => b.id));
dupCheck('weapon', weapons.map((w) => w.id));
dupCheck('moveset', movesets.map((m) => m.id));
dupCheck('form', forms.map((f) => f.id));
dupCheck('altar', altars.map((a) => a.id));
dupCheck('zone', zones.map((z) => z.id));
dupCheck('arena', arenas.map((a) => a.id));
dupCheck('reperto', reperti.map((r) => r.id));
dupCheck('sequence', sequences.map((s) => s.id));
dupCheck('projectile kind', projectiles.map((p) => p.id));
dupCheck('hazard kind', hazards.map((h) => h.id));
dupCheck('order', bosses.map((b) => String(b.order)));

/* ------------------------------------------------------------------------------------------------------------------ */
/* Cross references                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const bossIds = new Set(bosses.map((b) => b.id));
const weaponIds = new Set(weapons.map((w) => w.id));
const formIds = new Set(forms.map((f) => f.id));
const altarIds = new Set(altars.map((a) => a.id));
const zoneIds = new Set(zones.map((z) => z.id));
const arenaIds = new Set(arenas.map((a) => a.id));
const seqIds = new Set(sequences.map((s) => s.id));
const swingIds = new Set<string>();
for (const m of movesets) for (const k of Object.keys(m.swings)) {
  if (swingIds.has(k)) errors.push(`duplicate swing id ${k} (moveset ${m.id})`);
  swingIds.add(k);
}
const projIds = new Set(projectiles.map((p) => p.id));
const hazIds = new Set(hazards.map((h) => h.id));
const repIds = new Set(reperti.map((r) => r.id));
const speakerIds = new Set(speakers.map((s) => s.id));

for (const b of bosses) {
  const where = `boss ${b.id}`;
  if (!arenaIds.has(b.arena)) errors.push(`${where}: unknown arena ${b.arena}`);
  if (!zoneIds.has(b.zone)) errors.push(`${where}: unknown zone ${b.zone}`);
  if (b.drops_weapon && !weaponIds.has(b.drops_weapon)) errors.push(`${where}: unknown weapon ${b.drops_weapon}`);
  if (b.unlocks_form && !formIds.has(b.unlocks_form)) errors.push(`${where}: unknown form ${b.unlocks_form}`);
  if (b.intro_sequence && !seqIds.has(b.intro_sequence)) errors.push(`${where}: unknown intro_sequence ${b.intro_sequence}`);
  if (b.defeat_sequence && !seqIds.has(b.defeat_sequence)) errors.push(`${where}: unknown defeat_sequence ${b.defeat_sequence}`);
  const atkIds = new Set(b.attacks.map((a) => a.id));
  if (atkIds.size !== b.attacks.length) errors.push(`${where}: duplicate attack ids`);
  const partIds = new Set((b.parts ?? []).map((p) => p.id));
  const minionIds = new Set((b.minions ?? []).map((m) => m.id));
  for (const m of b.minions ?? []) for (const a of m.attacks) atkIds.add(a.id);
  for (const ph of b.phases) {
    for (const p of ph.patterns) if (!atkIds.has(p)) errors.push(`${where}: phase ${ph.id} unknown pattern ${p}`);
    if (ph.opener && !atkIds.has(ph.opener)) errors.push(`${where}: phase ${ph.id} unknown opener ${ph.opener}`);
    if (ph.hp_range[0] < ph.hp_range[1]) errors.push(`${where}: phase ${ph.id} hp_range must be [high, low]`);
  }
  for (const [tod, v] of Object.entries(b.time_of_day_variants)) {
    if (v?.opener && !atkIds.has(v.opener)) errors.push(`${where}: ${tod} unknown opener ${v.opener}`);
    for (const k of Object.keys(v?.weights ?? {})) if (!atkIds.has(k)) errors.push(`${where}: ${tod} weight for unknown attack ${k}`);
  }
  for (const a of [...b.attacks, ...(b.minions ?? []).flatMap((m) => m.attacks)]) {
    if (a.part && !partIds.has(a.part)) errors.push(`${where}: attack ${a.id} unknown part ${a.part}`);
    if (a.combo_next && !atkIds.has(a.combo_next)) errors.push(`${where}: attack ${a.id} unknown combo_next ${a.combo_next}`);
    for (const h of a.hits ?? []) if (h.part && !partIds.has(h.part)) errors.push(`${where}: attack ${a.id} hit part ${h.part} unknown`);
    for (const s of a.spawns ?? []) {
      if (s.type === 'projectile' && s.id && !projIds.has(s.id)) errors.push(`${where}: attack ${a.id} unknown projectile kind ${s.id}`);
      if (s.type === 'hazard' && s.id && !hazIds.has(s.id)) errors.push(`${where}: attack ${a.id} unknown hazard kind ${s.id}`);
      if (s.type === 'minion' && s.id && !minionIds.has(s.id)) errors.push(`${where}: attack ${a.id} unknown minion ${s.id}`);
      if (s.part && !partIds.has(s.part)) errors.push(`${where}: attack ${a.id} spawn unknown part ${s.part}`);
      if (s.type === 'hazard' && !s.shape) errors.push(`${where}: attack ${a.id} hazard spawn needs a shape`);
    }
    const total = a.telegraph + a.active + a.recovery;
    if (total <= 0) errors.push(`${where}: attack ${a.id} has no duration`);
    for (const h of a.hits ?? []) if (h.t + h.dur > a.active + 1e-6 && !a.flags.includes('dot')) warnings.push(`${where}: attack ${a.id} hit window exceeds active window`);
    if (a.telegraph < 0.35 && !(a.flags.includes('unavoidable'))) warnings.push(`${where}: attack ${a.id} telegraph < 0.35 s may be unreadable on touch`);
  }
  if (b.class !== 'mini' && b.id !== 'lucifero_1' && b.drops_weapon) {
    const w = weapons.find((x) => x.id === b.drops_weapon);
    if (w && !w.flavor_key) errors.push(`${where}: non-mini weapon ${w.id} needs flavor_key`);
  }
  if (!altars.some((a) => a.before_boss === b.id)) errors.push(`${where}: no Altare della Quiete before this boss`);
}

for (const w of weapons) {
  const where = `weapon ${w.id}`;
  if (w.source_boss && !bossIds.has(w.source_boss)) errors.push(`${where}: unknown source boss ${w.source_boss}`);
  for (const k of ['light', 'heavy', 'running', 'jumping'] as const) if (!swingIds.has(w.moveset[k])) errors.push(`${where}: unknown ${k} swing ${w.moveset[k]}`);
  const src = bosses.find((b) => b.id === w.source_boss);
  if (src && src.difficulty !== w.source_difficulty) errors.push(`${where}: source_difficulty ${w.source_difficulty} != boss difficulty ${src.difficulty}`);
  if (src && src.class === 'mini' && w.flavor_key) errors.push(`${where}: mini-boss weapons have no lore text (remove flavor_key)`);
  if (w.arts.prima.eco_cost !== 100) errors.push(`${where}: Arte Prima must cost 100 Eco`);
  if (w.arts.seconda.eco_cost !== 200) errors.push(`${where}: Arte Seconda must cost 200 Eco`);
}
for (const m of movesets) {
  for (const [k, v] of Object.entries(m.swings)) {
    for (const s of Array.isArray(v) ? v : [v]) {
      if (!s.shape && !s.projectile) errors.push(`moveset ${m.id}: swing ${k}/${s.id} needs a shape or a projectile`);
      if (s.projectile && !projIds.has(s.projectile.kind)) errors.push(`moveset ${m.id}: swing ${k} unknown projectile kind ${s.projectile.kind}`);
    }
  }
}
for (const t of transitions) {
  if (t.projectile && !projIds.has(t.projectile.kind)) errors.push(`transition ${t.id}: unknown projectile kind ${t.projectile.kind}`);
}
for (const f of forms) if (f.unlocked_by && !bossIds.has(f.unlocked_by)) errors.push(`form ${f.id}: unknown boss ${f.unlocked_by}`);
for (const a of altars) {
  if (!zoneIds.has(a.zone)) errors.push(`altar ${a.id}: unknown zone ${a.zone}`);
  if (a.before_boss && !bossIds.has(a.before_boss)) errors.push(`altar ${a.id}: unknown boss ${a.before_boss}`);
}
for (const z of zones) {
  for (const a of z.altars) if (!altarIds.has(a)) errors.push(`zone ${z.id}: unknown altar ${a}`);
  for (const a of z.arenas) if (!arenaIds.has(a)) errors.push(`zone ${z.id}: unknown arena ${a}`);
  for (const r of z.reperti) if (!repIds.has(r)) errors.push(`zone ${z.id}: unknown reperto ${r}`);
  for (const e of z.exits) {
    if (!zoneIds.has(e.to)) errors.push(`zone ${z.id}: exit to unknown zone ${e.to}`);
    if (e.arrive !== 'spawn' && !altarIds.has(e.arrive)) errors.push(`zone ${z.id}: exit arrive unknown altar ${e.arrive}`);
    for (const r of e.requires) if (!bossIds.has(r)) errors.push(`zone ${z.id}: exit requires unknown boss ${r}`);
  }
  if (!timeofday[z.timeofday]) errors.push(`zone ${z.id}: unknown timeofday ${z.timeofday}`);
}
for (const a of arenas) if (!zoneIds.has(a.zone)) errors.push(`arena ${a.id}: unknown zone ${a.zone}`);
for (const [k, t] of Object.entries(timeofday)) {
  for (const tod of ['alba', 'giorno', 'tramonto', 'notte'] as const) {
    if (skies.length && !skies.some((s) => s.id === t[tod].sky)) errors.push(`timeofday ${k}.${tod}: unknown sky ${t[tod].sky}`);
  }
}
for (const s of sequences) {
  const labels = new Set<string>();
  for (const st of s.steps) if ('label' in st) labels.add(st.label);
  for (const st of s.steps) {
    if ('goto' in st && typeof st.goto === 'string' && !labels.has(st.goto)) errors.push(`sequence ${s.id}: unknown label ${st.goto}`);
    if ('choice' in st) for (const c of st.choice) if (!labels.has(c.goto)) errors.push(`sequence ${s.id}: choice goto unknown label ${c.goto}`);
    if ('say' in st && !speakerIds.has(st.speaker)) errors.push(`sequence ${s.id}: unknown speaker ${st.speaker}`);
    if ('give_weapon' in st && !weaponIds.has(st.give_weapon)) errors.push(`sequence ${s.id}: unknown weapon ${st.give_weapon}`);
    if ('unlock_form' in st && !formIds.has(st.unlock_form)) errors.push(`sequence ${s.id}: unknown form ${st.unlock_form}`);
  }
}
if (progression) {
  for (const act of progression.acts) for (const z of act.zones) if (!zoneIds.has(z)) errors.push(`progression act ${act.n}: unknown zone ${z}`);
  if (!zoneIds.has(progression.start_zone)) errors.push(`progression: unknown start_zone`);
  if (!altarIds.has(progression.start_altar)) errors.push(`progression: unknown start_altar`);
  for (const k of ['start_sequence', 'ending_sequence', 'credits_sequence'] as const) if (!seqIds.has(progression[k])) errors.push(`progression: unknown ${k} ${progression[k]}`);
  for (const act of progression.acts) if (act.intro_sequence && !seqIds.has(act.intro_sequence)) errors.push(`progression act ${act.n}: unknown intro_sequence`);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Localization                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

function flatten(obj: unknown, prefix: string, out: Record<string, string>, file: string): void {
  if (obj == null) return;
  if (typeof obj === 'string') {
    if (out[prefix] !== undefined) errors.push(`${file}: duplicate key ${prefix}`);
    out[prefix] = obj;
    return;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    out[prefix] = String(obj);
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out, file);
  }
}
function loadLocale(lang: string): Record<string, string> {
  const dir = path.join(ROOT, 'locales', lang);
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const full = path.join(dir, f);
    const raw = readYaml(full);
    flatten(raw, '', out, rel(full));
  }
  return out;
}
const it = loadLocale('it');
const en = loadLocale('en');

const requiredKeys = new Set<string>();
const addKey = (k: string | null | undefined) => {
  if (k) requiredKeys.add(k);
};
for (const b of bosses) {
  addKey(b.name_key); addKey(b.title_key); addKey(b.lore_key);
  b.dialogue_keys.forEach(addKey);
  b.phases.forEach((p) => addKey(p.dialogue));
  for (const v of Object.values(b.time_of_day_variants)) addKey(v?.note_key);
  for (const p of b.parts ?? []) addKey(p.name_key);
  for (const m of b.minions ?? []) addKey(m.name_key);
}
for (const w of weapons) {
  addKey(w.name_key); addKey(w.desc_key); addKey(w.flavor_key);
  for (const a of [w.arts.prima, w.arts.seconda]) {
    addKey(a.name_key ?? `art.${a.id}.name`);
    addKey(a.desc_key ?? `art.${a.id}.desc`);
  }
}
for (const t of transitions) addKey(t.name_key);
for (const f of forms) { addKey(f.name_key); addKey(f.desc_key); addKey(f.ability.name_key); addKey(f.ability.desc_key); }
for (const a of altars) { addKey(a.name_key); addKey(a.voice_line_key); }
for (const z of zones) { addKey(z.name_key); z.vistas.forEach((v) => addKey(v.name_key)); z.exits.forEach((e) => addKey(e.name_key)); }
for (const a of arenas) addKey(a.name_key);
for (const r of reperti) { addKey(r.title_key); addKey(r.text_key); }
for (const v of voce) addKey(v.key);
for (const s of speakers) addKey(s.name_key);
for (const s of sequences) {
  for (const st of s.steps) {
    if ('say' in st) addKey(st.say);
    if ('voce' in st) addKey(st.voce);
    if ('caption' in st) addKey(st.caption);
    if ('title' in st) addKey(st.title);
    if ('gesture' in st) addKey(st.prompt_key);
    if ('choice' in st) st.choice.forEach((c) => addKey(c.key));
  }
}
if (progression) progression.acts.forEach((a) => addKey(a.name_key));

for (const k of requiredKeys) {
  if (!(k in it)) errors.push(`locale it: missing key ${k}`);
  if (!(k in en)) errors.push(`locale en: missing key ${k}`);
}
for (const k of Object.keys(it)) if (!(k in en)) errors.push(`locale en: missing key ${k} (present in it)`);
for (const k of Object.keys(en)) if (!(k in it)) errors.push(`locale it: missing key ${k} (present in en)`);
const bad = /\b(TODO|TBD|FIXME|lorem ipsum|placeholder|XXX)\b/i;
for (const [lang, table] of [['it', it], ['en', en]] as const) {
  for (const [k, v] of Object.entries(table)) {
    if (bad.test(v)) errors.push(`locale ${lang}: placeholder text in ${k}`);
    if (!v.trim()) errors.push(`locale ${lang}: empty string ${k}`);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */

// Partial mode (SM_PARTIAL=1): references to content that other work-streams have not authored yet are warnings.
if (process.env.SM_PARTIAL === '1') {
  const missing = /unknown (source boss|boss|form|sequence|zone|arena|weapon|altar|reperto|speaker|minion|projectile kind|hazard kind|.*swing)|no Altare|missing key|needs flavor_key|exit (to|requires|arrive) unknown|unknown (intro|defeat)_sequence|unknown start|unknown (ending|credits)_sequence/;
  for (let i = errors.length - 1; i >= 0; i--) {
    if (missing.test(errors[i])) warnings.push(errors.splice(i, 1)[0]);
  }
}
if (warnings.length && !quiet) {
  console.warn(`build-data: ${warnings.length} warning(s)`);
  for (const w of warnings.slice(0, 40)) console.warn('  ! ' + w);
}
if (errors.length) {
  console.error(`build-data: ${errors.length} error(s)`);
  for (const e of errors.slice(0, 200)) console.error('  x ' + e);
  process.exit(1);
}

const bundle: ContentBundle = {
  version: new Date().toISOString().slice(0, 10),
  balance: balance!,
  bosses: bosses as ContentBundle['bosses'],
  weapons: weapons as ContentBundle['weapons'],
  movesets: movesets as ContentBundle['movesets'],
  transitions: transitions as ContentBundle['transitions'],
  forms: forms as ContentBundle['forms'],
  altars,
  zones: zones as ContentBundle['zones'],
  arenas: arenas as ContentBundle['arenas'],
  timeofday,
  skies,
  reperti,
  voce,
  sequences: sequences as ContentBundle['sequences'],
  speakers,
  progression: progression!,
  projectiles,
  hazards,
  touch_layouts,
  anim,
  music,
  palettes,
};
fs.mkdirSync(path.join(ROOT, 'src/generated'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/generated/content.json'), JSON.stringify(bundle));
fs.writeFileSync(path.join(ROOT, 'locales/it.json'), JSON.stringify(it, null, 0));
fs.writeFileSync(path.join(ROOT, 'locales/en.json'), JSON.stringify(en, null, 0));
if (!quiet) {
  console.log(
    `build-data: ok — ${bosses.length} bosses, ${weapons.length} weapons, ${movesets.length} movesets, ${transitions.length} transitions, ` +
      `${forms.length} forms, ${zones.length} zones, ${arenas.length} arenas, ${altars.length} altars, ${sequences.length} sequences, ` +
      `${Object.keys(it).length} it / ${Object.keys(en).length} en strings`,
  );
}
