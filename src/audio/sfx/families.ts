/** Lookup tables (pure): weapon type -> swing family, boss -> voice family, surfaces, zone ambience -> reverb environment. */
import type { ReverbEnv } from '../music/data';

export type SwingFamily =
  | 'blade' | 'heavy_blade' | 'thin' | 'dagger' | 'shears' | 'axe' | 'blunt' | 'polearm' | 'harpoon' | 'drill' | 'scythe' | 'whip'
  | 'chain' | 'flail' | 'bow' | 'crossbow' | 'disc' | 'catalyst' | 'fist' | 'claw' | 'shield' | 'shapeshift';

export const WEAPON_FAMILY: Record<string, SwingFamily> = {
  spada_corta: 'blade', spada_lunga: 'blade', spada_bastarda: 'blade', katana: 'blade', scimitarra: 'blade',
  spadone: 'heavy_blade', ascia_a_due_mani: 'axe', asce_gemelle: 'axe', stocco: 'thin', pugnali: 'dagger', kama_gemelle: 'dagger',
  lama_a_tenaglia: 'shears', cesoie: 'shears', mazza: 'blunt', martello_da_guerra: 'blunt', lancia: 'polearm', alabarda: 'polearm',
  naginata: 'polearm', tridente: 'polearm', arpione: 'harpoon', trivella: 'drill', falce: 'scythe', frusta: 'whip', catene: 'chain',
  spada_serpentina: 'whip', flagello: 'flail', arco_lungo: 'bow', balestra: 'crossbow', chakram: 'disc', bastone_magico: 'catalyst',
  tomo: 'catalyst', totem: 'catalyst', astrolabio: 'catalyst', scettro: 'catalyst', pugni: 'fist', artigli: 'claw', scudo: 'shield',
  arma_mutaforma: 'shapeshift',
};

export const CATEGORY_FAMILY: Record<string, SwingFamily> = {
  one_handed: 'blade', two_handed: 'heavy_blade', polearm: 'polearm', ranged: 'bow', catalyst: 'catalyst', fist: 'fist', flexible: 'whip',
};

/** Forms of the Lama dell'Abisso Sognante cycle (sword, whip, axe, spear). */
export const SHAPESHIFT_CYCLE: readonly SwingFamily[] = ['blade', 'whip', 'axe', 'polearm'];

export function swingFamily(type: string | undefined, category: string | undefined): SwingFamily {
  if (type && WEAPON_FAMILY[type]) return WEAPON_FAMILY[type];
  if (category && CATEGORY_FAMILY[category]) return CATEGORY_FAMILY[category];
  return 'blade';
}

export type VoiceFamily =
  | 'knight' | 'humanoid' | 'spectral' | 'colossus' | 'beast' | 'serpent' | 'dragon' | 'bird' | 'insect' | 'tree' | 'tentacled' | 'divine';

/** Voice family + size (0..1) + voices (multi-head) per encounter. */
export const BOSS_VOICE: Record<string, { family: VoiceFamily; size: number; heads?: number; dark?: boolean }> = {
  guardiano_del_regno: { family: 'knight', size: 0.45 },
  cavaliere_errante: { family: 'knight', size: 0.4 },
  elder_tree: { family: 'tree', size: 0.85 },
  mostro_della_palude: { family: 'spectral', size: 0.7 },
  great_devourer: { family: 'serpent', size: 0.85 },
  caronte: { family: 'spectral', size: 0.5 },
  cerbero: { family: 'beast', size: 0.75, heads: 3 },
  pyro: { family: 'knight', size: 0.6 },
  thunder: { family: 'knight', size: 0.55 },
  ice: { family: 'knight', size: 0.35 },
  mostro_di_magma: { family: 'colossus', size: 0.85 },
  lucifero_1: { family: 'divine', size: 0.6, dark: true },
  gigante_di_fuoco: { family: 'colossus', size: 0.95 },
  yeti: { family: 'beast', size: 0.6 },
  guardiano_rocca_di_brina: { family: 'knight', size: 0.8 },
  loki: { family: 'humanoid', size: 0.3 },
  grande_lupo: { family: 'beast', size: 0.55 },
  grande_orso: { family: 'beast', size: 0.8 },
  sciamano: { family: 'humanoid', size: 0.35 },
  grande_aquila_reale: { family: 'bird', size: 0.6 },
  drago_di_fuoco: { family: 'dragon', size: 0.7 },
  kraken: { family: 'tentacled', size: 0.9 },
  re_mantide: { family: 'insect', size: 0.55 },
  coleottero_imperiale: { family: 'insect', size: 0.7 },
  regina_formica: { family: 'insect', size: 0.65 },
  uruk: { family: 'humanoid', size: 0.85 },
  drago_di_ghiaccio: { family: 'dragon', size: 0.7 },
  drago_a_tre_teste: { family: 'dragon', size: 0.75, heads: 3 },
  reina: { family: 'divine', size: 0.35 },
  idra: { family: 'serpent', size: 0.75, heads: 5 },
  grifone: { family: 'bird', size: 0.55 },
  re_drago: { family: 'dragon', size: 0.9, heads: 3 },
  lucifero_2: { family: 'divine', size: 0.65, dark: true },
  drago_del_vuoto: { family: 'dragon', size: 0.8, dark: true },
  verme_mangiamondi: { family: 'serpent', size: 0.95 },
  regina_drago: { family: 'dragon', size: 0.9, heads: 3, dark: true },
  dio_dei_draghi: { family: 'divine', size: 1 },
  cthulhu: { family: 'tentacled', size: 1 },
};

export function bossVoice(id: string, rig?: string): { family: VoiceFamily; size: number; heads?: number; dark?: boolean } {
  const v = BOSS_VOICE[id];
  if (v) return v;
  const r = (rig ?? '').toLowerCase();
  const f: VoiceFamily = /dragon|drake/.test(r) ? 'dragon' : /serp|worm|chain|snake/.test(r) ? 'serpent' : /insect|mantis|beetle|ant/.test(r) ? 'insect'
    : /bird|wing|eagle|griff/.test(r) ? 'bird' : /tree|plant/.test(r) ? 'tree' : /tentac|octo/.test(r) ? 'tentacled' : /colossus|giant|composite/.test(r) ? 'colossus'
    : /quadruped|beast|wolf|bear|dog/.test(r) ? 'beast' : /knight|mounted/.test(r) ? 'knight' : 'humanoid';
  return { family: f, size: 0.6 };
}

export const SURFACES = [
  'stone', 'grass', 'moss', 'mud', 'water', 'wood', 'ash', 'snow', 'ice', 'sand', 'marble', 'bone', 'obsidian', 'soil', 'bark', 'void', 'cloud',
] as const;
export type Surface = (typeof SURFACES)[number];

const SURFACE_ALIAS: Record<string, Surface> = {
  rock: 'stone', basalt: 'stone', cobble: 'stone', metal: 'stone', pine: 'moss', needles: 'moss', deck: 'wood', plank: 'wood', glass: 'ice',
  crystal: 'ice', dirt: 'soil', earth: 'soil', leaf: 'grass', leaves: 'grass', flower: 'grass', petal: 'grass', clover: 'grass', lava: 'obsidian',
  ember: 'ash', embers: 'ash', cinder: 'ash', root: 'bark', branch: 'bark', light: 'cloud', star: 'void', flesh: 'mud', bog: 'mud', swamp: 'mud',
  shallow: 'water', river: 'water', frost: 'snow',
};

export function surfaceOf(s: string): Surface {
  if ((SURFACES as readonly string[]).includes(s)) return s as Surface;
  if (SURFACE_ALIAS[s]) return SURFACE_ALIAS[s];
  for (const k of SURFACES) if (s.includes(k)) return k;
  return 'stone';
}

/** Reverb environment for a zone ambience id (arena overrides below). */
export function envForAmbience(id: string): ReverbEnv {
  switch (id) {
    case 'castle_hall': case 'ice_castle': return 'hall';
    case 'cathedral': case 'upturned_palace': return 'cathedral';
    case 'forges': case 'hollow_root': return 'cave';
    case 'forest_night': case 'taiga': case 'swamp': case 'garden': case 'world_tree': return 'forest';
    case 'greenhouse': case 'observatory': case 'mirror_lake': case 'cocytus': return 'glass';
    case 'collapse': case 'upturned': case 'ash_desert': return 'void';
    default: return 'plains';
  }
}

const ARENA_ENV: Record<string, ReverbEnv> = {
  yeti_caverna: 'cave', giardino_formicaio: 'cave', fucine_incudini: 'cave', cattedrale_navata: 'cathedral', palazzo_capovolto_sala: 'cathedral',
  rocca_sala_trono: 'hall', osservatorio_cupola: 'glass', serra_giardiniere: 'glass', collasso_arena: 'void', terrazze_celesti_arena: 'plains',
};

export function envForArena(id: string | null | undefined): ReverbEnv | null {
  return id ? ARENA_ENV[id] ?? null : null;
}
