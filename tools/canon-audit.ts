/**
 * Canon auditor: compares the shipped content (src/generated/content.json + locales) with the Bible tables in
 * tools/canon/bible.ts and fails on any mismatch (order, class, act, difficulty, weapon types/names, Arts, Forms, unlocks,
 * counts, mini-boss lore rules, canonical quotes, time-of-day/Metamondo reactions, required story pieces).
 * Usage: tsx tools/canon-audit.ts [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import contentJson from '../src/generated/content.json';
import it from '../locales/it.json';
import en from '../locales/en.json';
import type { BossDef, ContentBundle, WeaponDef } from '../src/core/types';
import { CANON_ACT_NAMES, CANON_ENCOUNTERS, CANON_FORMS, CANON_MINI, CANON_PARRY_TYPES, CANON_QUOTES, CANON_STARTER } from './canon/bible';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = contentJson as unknown as ContentBundle;
const IT = it as Record<string, string>;
const EN = en as Record<string, string>;
const issues: string[] = [];
const fail = (m: string) => issues.push(m);
const norm = (s: string) => s.replace(/[’']/g, "'").trim();

const bosses = new Map<string, BossDef>(C.bosses.map((b) => [b.id, b]));
const weapons = new Map<string, WeaponDef>(C.weapons.map((w) => [w.id, w]));

// --- counts
if (C.bosses.length !== 38) fail(`expected 38 encounters, found ${C.bosses.length}`);
if (C.weapons.length !== 38) fail(`expected 37 boss weapons + starter = 38 weapons, found ${C.weapons.length}`);
if (C.forms.length !== 7) fail(`expected 7 Metamondo Forms, found ${C.forms.length}`);
const types = C.weapons.map((w) => w.type);
if (new Set(types).size !== types.length) fail('weapon types are not all distinct');

// --- encounters
for (const ce of CANON_ENCOUNTERS) {
  const b = bosses.get(ce.id);
  if (!b) {
    fail(`missing encounter ${ce.order}. ${ce.name} (${ce.id})`);
    continue;
  }
  const where = `${ce.order}. ${ce.id}`;
  if (b.order !== ce.order) fail(`${where}: order ${b.order} != ${ce.order}`);
  if (b.class !== ce.class) fail(`${where}: class ${b.class} != ${ce.class}`);
  if (b.act !== ce.act) fail(`${where}: act ${b.act} != ${ce.act}`);
  if (ce.difficulty === null) {
    if (!b.scripted) fail(`${where}: must be a scripted encounter`);
    if (b.drops_weapon) fail(`${where}: must not drop a weapon`);
  } else if (b.difficulty !== ce.difficulty) fail(`${where}: difficulty ${b.difficulty} != ${ce.difficulty}`);
  // name (+ title for knights / principals)
  const nm = IT[b.name_key];
  const full = b.title_key ? `${nm}, ${IT[b.title_key]}` : nm;
  const canonName = ce.name.replace(/ \(Ouranthos\)$/, '');
  if (!nm || (norm(nm) !== norm(canonName) && norm(full) !== norm(ce.name) && norm(`${nm} (${IT[b.title_key ?? ''] ?? ''})`) !== norm(ce.name))) fail(`${where}: name "${full}" != "${ce.name}"`);
  // phases
  const minPhases = ce.class === 'principal' ? (ce.id === 'lucifero_1' ? 1 : ce.id === 'dio_dei_draghi' ? 2 : 3) : 2;
  if (b.phases.length < Math.max(minPhases, ce.phases)) fail(`${where}: ${b.phases.length} phases < ${Math.max(minPhases, ce.phases)}`);
  if (ce.class === 'principal' && ce.id !== 'lucifero_1' && ce.id !== 'dio_dei_draghi' && b.phases.length > 4) fail(`${where}: principal bosses have 3 or 4 phases`);
  // weapon
  if (ce.weapon) {
    const w = b.drops_weapon ? weapons.get(b.drops_weapon) : undefined;
    if (!w) fail(`${where}: drops_weapon ${b.drops_weapon} missing (expected ${ce.weapon.id})`);
    else {
      if (w.id !== ce.weapon.id) fail(`${where}: weapon id ${w.id} != ${ce.weapon.id}`);
      if (w.type !== ce.weaponType) fail(`${where}: weapon type ${w.type} != ${ce.weaponType}`);
      if (norm(IT[w.name_key] ?? '') !== norm(ce.weapon.name)) fail(`${where}: weapon name "${IT[w.name_key]}" != "${ce.weapon.name}"`);
      if (w.source_boss !== ce.id) fail(`${where}: weapon source_boss ${w.source_boss}`);
      if (w.source_difficulty !== ce.difficulty) fail(`${where}: weapon source_difficulty ${w.source_difficulty} != ${ce.difficulty}`);
      const pk = w.arts.prima.name_key ?? `art.${w.arts.prima.id}.name`;
      const sk = w.arts.seconda.name_key ?? `art.${w.arts.seconda.id}.name`;
      if (norm(IT[pk] ?? '') !== norm(ce.weapon.arts[0])) fail(`${where}: Arte Prima "${IT[pk]}" != "${ce.weapon.arts[0]}"`);
      if (norm(IT[sk] ?? '') !== norm(ce.weapon.arts[1])) fail(`${where}: Arte Seconda "${IT[sk]}" != "${ce.weapon.arts[1]}"`);
      if (w.arts.prima.eco_cost !== 100 || w.arts.seconda.eco_cost !== 200) fail(`${where}: Art costs must be 100 / 200 Eco`);
      if (CANON_PARRY_TYPES.includes(w.type) !== w.parry_capable) fail(`${where}: parry_capable mismatch for ${w.type}`);
      const mini = ce.class === 'mini';
      if (mini && w.flavor_key) fail(`${where}: mini-boss weapon must have no lore text`);
      if (!mini && !w.flavor_key) fail(`${where}: weapon needs a flavor text`);
    }
  }
  // forms
  if (ce.form) {
    if (b.unlocks_form !== ce.form) fail(`${where}: unlocks_form ${b.unlocks_form} != ${ce.form}`);
  } else if (b.unlocks_form) fail(`${where}: must not unlock a Form`);
  // mini bosses: no dialogue, no lore
  if (CANON_MINI.includes(ce.id)) {
    if (b.dialogue_keys.length) fail(`${where}: mini boss must have no dialogue`);
    if (b.lore_key) fail(`${where}: mini boss must have no lore text`);
    if (b.intro_sequence || b.defeat_sequence) {
      const seqs = [b.intro_sequence, b.defeat_sequence].filter(Boolean).map((id) => C.sequences.find((s) => s.id === id));
      if (seqs.some((s) => s?.steps.some((st) => 'say' in st))) fail(`${where}: mini boss sequences must not contain dialogue`);
    }
  } else if (ce.class === 'principal' && !b.intro_sequence) fail(`${where}: principal boss needs an intro sequence (dialogue/cinematic)`);
  if (ce.class === 'secondary' && !b.lore_key && b.dialogue_keys.length === 0) fail(`${where}: secondary boss keeps a fragment of story (lore or line)`);
  if (ce.class === 'principal' && ce.id !== 'lucifero_1' && !b.brightens_sky) fail(`${where}: principal boss must brighten the sky`);
  if (ce.id === 'lucifero_1' && b.brightens_sky) fail(`${where}: narrative defeat does not brighten the sky`);
  // New Game+: new, more aggressive patterns (C12)
  if (!b.scripted) {
    const ng = b.ng_plus?.add_patterns ?? {};
    const added = Object.values(ng).flat();
    if (!added.length) fail(`${where}: New Game+ needs new aggressive patterns (ng_plus.add_patterns)`);
    for (const id of added) if (!b.attacks.some((a) => a.id === id) && !(b.minions ?? []).some((m) => m.attacks.some((a) => a.id === id))) fail(`${where}: ng_plus pattern ${id} is not defined`);
  }
  // altar before every arena
  if (!C.altars.some((a) => a.before_boss === ce.id)) fail(`${where}: no Altare della Quiete before the arena`);
  // music
  if (!fs.existsSync(path.join(ROOT, 'data/music', `${b.music}.yaml`)) && !C.music[b.music]) fail(`${where}: no music theme data for ${b.music}`);
  // render pieces
  if (!fs.existsSync(path.join(ROOT, 'src/content/bosses', ce.id, 'model.ts')) && !(ce.id === 'lucifero_2' && fs.existsSync(path.join(ROOT, 'src/content/bosses/lucifero_1/model.ts')))) fail(`${where}: no model builder src/content/bosses/${ce.id}/model.ts`);
  if (!fs.existsSync(path.join(ROOT, 'src/content/bosses', ce.id, 'behavior.ts')) && ce.class !== 'mini') {
    // behaviors are optional for simple bosses, but story bosses need one for their unique mechanics
    if (['lucifero_1', 'lucifero_2', 'loki', 'uruk', 'reina', 're_drago', 'regina_drago', 'dio_dei_draghi', 'cthulhu', 'mostro_della_palude', 'idra', 'grande_aquila_reale', 'cavaliere_errante', 'cerbero'].includes(ce.id)) fail(`${where}: needs a behavior module for its unique mechanics`);
  }
}
for (const b of C.bosses) if (!CANON_ENCOUNTERS.some((c) => c.id === b.id)) fail(`extra encounter not in the Bible: ${b.id}`);

// --- specific card rules
const tod = (id: string) => bosses.get(id)?.time_of_day_variants ?? {};
if (!tod('cavaliere_errante').alba || !tod('cavaliere_errante').notte) fail('cavaliere_errante: needs dawn (salute, fair duel) and night (charges from the dark) variants');
if (!tod('caronte').notte || !tod('caronte').giorno) fail('caronte: needs night (many slow souls) and day (few fast souls) variants');
if (!tod('reina').notte) fail('reina: needs a night variant (whole sky for her spells)');
if (bosses.get('lucifero_1')?.metamondo_reaction !== 'shatter') fail('lucifero_1: Metamondo reaction must be shatter');
if (bosses.get('reina')?.metamondo_reaction !== 'rewrite') fail('reina: Metamondo reaction must be rewrite');
if (bosses.get('cthulhu')?.metamondo_reaction !== 'devour') fail('cthulhu: Metamondo reaction must be devour');
for (const id of ['guardiano_del_regno', 'cavaliere_errante']) if (bosses.get(id) && !bosses.get(id)!.mounted) fail(`${id}: mounted boss`);
if (!bosses.get('cavaliere_errante')?.grants?.includes('lanterna_del_cavaliere')) fail('cavaliere_errante: must grant the lantern (lanterna_del_cavaliere)');
if (!bosses.get('re_drago')?.grants?.includes('cuore_di_luce')) fail('re_drago: must grant the Cuore di Luce');
if (!bosses.get('regina_drago')?.grants?.includes('cuore_di_ombra')) fail("regina_drago: must grant the Cuore d'Ombra");
const lucSeqs = C.sequences.filter((s) => s.id.startsWith('lucifero'));
const lucText = JSON.stringify(lucSeqs);
if (!lucText.includes('cicatrice_del_rifiuto')) fail('lucifero_1: Affronta path must give the Cicatrice del Rifiuto');
if (!lucText.includes('piuma_nera')) fail('lucifero_1: Implora path must give the Piuma Nera');
if (!/"hold":\s*5/.test(lucText)) fail('lucifero_1: Implora requires a 5-second hold');
if (!/lucifero_choice/.test(lucText)) fail('lucifero_2: opening line must depend on lucifero_choice');

// --- starter + weapons
const st = weapons.get(CANON_STARTER.id);
if (!st) fail('missing starter weapon Lama della Culla');
else {
  if (st.type !== CANON_STARTER.type) fail('starter type must be spada_corta');
  if (norm(IT[st.name_key] ?? '') !== CANON_STARTER.name) fail('starter name mismatch');
}
const scettro = weapons.get('scettro_del_primo_respiro');
if (scettro && scettro.delivered_by !== 'cthulhu') fail('scettro_del_primo_respiro: delivered after the final victory (delivered_by: cthulhu)');
const lama = weapons.get('lama_dell_abisso_sognante');
if (lama && !lama.ng_plus_only) fail('lama_dell_abisso_sognante: usable only from New Game+');
for (const w of C.weapons) {
  for (const k of [w.desc_key, `art.${w.arts.prima.id}.desc`, `art.${w.arts.seconda.id}.desc`]) if (!IT[k] || !EN[k]) fail(`weapon ${w.id}: missing string ${k}`);
}
if (C.transitions.length !== 49) fail(`expected 49 Transizioni (7x7 ordered category pairs), found ${C.transitions.length}`);
const pairs = new Set(C.transitions.map((t) => `${t.from}>${t.to}`));
if (pairs.size !== C.transitions.length) fail('duplicate Transizione pairs');
for (const t of types) if (!C.movesets.some((m) => m.type === t)) fail(`no moveset for type ${t}`);

// --- forms
for (const cf of CANON_FORMS) {
  const f = C.forms.find((x) => x.id === cf.id);
  if (!f) {
    fail(`missing Form ${cf.name}`);
    continue;
  }
  if (f.order !== cf.order) fail(`Form ${cf.id}: order ${f.order} != ${cf.order}`);
  if (f.unlocked_by !== cf.unlockedBy) fail(`Form ${cf.id}: unlocked_by ${f.unlocked_by} != ${cf.unlockedBy}`);
  if (norm(IT[f.name_key] ?? '') !== cf.name) fail(`Form ${cf.id}: name "${IT[f.name_key]}" != "${cf.name}"`);
  if (norm(IT[f.ability.name_key] ?? '') !== cf.ability) fail(`Form ${cf.id}: ability "${IT[f.ability.name_key]}" != "${cf.ability}"`);
  if (f.base.duration !== 30 || f.base.damage_mult !== 1.5 || f.base.eco_regen_mult !== 2 || !f.base.boss_no_heal) fail(`Form ${cf.id}: base must be 30 s, +50% damage, Eco x2, no boss heal`);
  if (!fs.existsSync(path.join(ROOT, 'src/content/forms', cf.id, 'environment.ts'))) fail(`Form ${cf.id}: no diorama environment src/content/forms/${cf.id}/environment.ts`);
}

// --- acts and quotes
CANON_ACT_NAMES.forEach((n, i) => {
  if (norm(IT[`act.${i + 1}.name`] ?? '') !== norm(n)) fail(`act ${i + 1}: name "${IT[`act.${i + 1}.name`]}" != "${n}"`);
});
const allIt = Object.values(IT).map(norm).join('\n');
for (const q of CANON_QUOTES) if (!allIt.includes(norm(q).replace(/[.]$/, ''))) fail(`canonical quote missing from Italian text: "${q}"`);

// --- localization completeness
for (const k of Object.keys(IT)) if (!(k in EN)) fail(`EN missing ${k}`);
for (const k of Object.keys(EN)) if (!(k in IT)) fail(`IT missing ${k}`);

// --- story pieces
for (const id of [C.progression.start_sequence, C.progression.ending_sequence, C.progression.credits_sequence]) if (!C.sequences.some((s) => s.id === id)) fail(`missing sequence ${id}`);
const ritual = C.sequences.find((s) => s.steps.filter((st) => 'gesture' in st).length >= 3);
if (!ritual) fail('missing the Rituale delle Due Metà (three guided gestures)');
const ending = C.sequences.find((s) => s.id === C.progression.ending_sequence);
const endText = JSON.stringify(ending ?? {});
for (const cue of ['ending_shadow', 'ending_feather', 'ending_laugh', 'ending_lantern', 'ending_cave']) if (!endText.includes(cue)) fail(`ending: missing ${cue}`);

const json = process.argv.includes('--json');
if (json) console.log(JSON.stringify({ issues }, null, 1));
else {
  for (const i of issues) console.log('  x ' + i);
  console.log(`canon-audit: ${issues.length} mismatch(es)`);
}
process.exit(issues.length ? 1 : 0);
