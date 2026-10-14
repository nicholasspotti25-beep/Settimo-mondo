/**
 * The Game Bible (PART C) in machine-readable form. This file is the canon auditor's source of truth.
 * Names are exactly as written in the Bible (Italian). Never edit to match data: fix the data instead.
 */
export interface CanonEncounter {
  order: number;
  id: string;
  name: string;
  class: 'mini' | 'secondary' | 'principal';
  act: number;
  location: string;
  /** null for Lucifero I (scripted, no weapon). */
  weaponType: string | null;
  difficulty: number | null; // null = scripted
  weapon: { id: string; name: string; arts: [string, string] } | null;
  form: string | null;
  phases: number; // minimum number of phases from the card
}

export const CANON_ENCOUNTERS: CanonEncounter[] = [
  // ACT I — IL RISVEGLIO
  { order: 1, id: 'guardiano_del_regno', name: 'Guardiano del Regno', class: 'secondary', act: 1, location: "Vetta dell'Attesa", weaponType: 'lancia', difficulty: 2, weapon: { id: 'lancia_del_custode', name: 'Lancia del Custode', arts: ['Carica del Custode', "Ruota d'Argento"] }, form: null, phases: 2 },
  { order: 2, id: 'cavaliere_errante', name: 'Cavaliere Errante', class: 'secondary', act: 1, location: 'Le Grandi Pianure', weaponType: 'spada_lunga', difficulty: 3, weapon: { id: 'brando_del_viandante', name: 'Brando del Viandante', arts: ['Fendente Itinerante', 'Postura del Viandante'] }, form: null, phases: 2 },
  { order: 3, id: 'elder_tree', name: 'Elder Tree', class: 'secondary', act: 1, location: 'La Foresta Oscura', weaponType: 'bastone_magico', difficulty: 4, weapon: { id: 'ramo_dell_antico', name: "Ramo dell'Antico", arts: ['Radici Fameliche', 'Fioritura'] }, form: null, phases: 2 },
  { order: 4, id: 'mostro_della_palude', name: 'Mostro della Palude', class: 'secondary', act: 1, location: 'La Palude', weaponType: 'mazza', difficulty: 5, weapon: { id: 'randello_del_pantano', name: 'Randello del Pantano', arts: ['Colpo Melmoso', 'Sprofondamento'] }, form: null, phases: 2 },
  { order: 5, id: 'great_devourer', name: 'Great Devourer', class: 'mini', act: 1, location: 'La Palude (deep waters)', weaponType: 'spada_serpentina', difficulty: 6, weapon: { id: 'zanna_strisciante', name: 'Zanna Strisciante', arts: ['Sibilo', 'Avvolgimento'] }, form: null, phases: 2 },
  { order: 6, id: 'caronte', name: 'Caronte', class: 'secondary', act: 1, location: 'Il Fiume delle Anime', weaponType: 'alabarda', difficulty: 6, weapon: { id: 'remo_del_traghettatore', name: 'Remo del Traghettatore', arts: ['Richiamo delle Anime', 'Spinta della Corrente'] }, form: null, phases: 2 },
  // ACT II — LA DISCESA
  { order: 7, id: 'cerbero', name: 'Cerbero', class: 'secondary', act: 2, location: 'Porta di Dite', weaponType: 'catene', difficulty: 7, weapon: { id: 'triplice_guinzaglio', name: 'Triplice Guinzaglio', arts: ['Tre Morsi', 'Guinzaglio'] }, form: null, phases: 2 },
  { order: 8, id: 'pyro', name: 'Pyro, il Cavaliere di Fiamme', class: 'secondary', act: 2, location: 'Landa dei Roghi', weaponType: 'spadone', difficulty: 8, weapon: { id: 'brace_eterna', name: 'Brace Eterna', arts: ['Onda Incandescente', 'Lama Rovente'] }, form: null, phases: 2 },
  { order: 9, id: 'thunder', name: 'Thunder, il Cavaliere di Fulmini', class: 'secondary', act: 2, location: 'Bufera Eterna', weaponType: 'martello_da_guerra', difficulty: 8, weapon: { id: 'tuono_spezzacielo', name: 'Tuono Spezzacielo', arts: ['Schianto Tonante', 'Catena di Fulmini'] }, form: null, phases: 2 },
  { order: 10, id: 'ice', name: 'Ice, il Cavaliere di Ghiaccio', class: 'secondary', act: 2, location: 'Cocito', weaponType: 'stocco', difficulty: 9, weapon: { id: 'brina_silente', name: 'Brina Silente', arts: ['Affondo Gelido', 'Danza dei Cristalli'] }, form: null, phases: 2 },
  { order: 11, id: 'mostro_di_magma', name: 'Mostro di Magma', class: 'secondary', act: 2, location: 'Fucine Sepolte', weaponType: 'ascia_a_due_mani', difficulty: 9, weapon: { id: 'fenditura_ardente', name: 'Fenditura Ardente', arts: ['Frattura Magmatica', 'Eruzione'] }, form: null, phases: 2 },
  { order: 12, id: 'lucifero_1', name: "Lucifero, l'Arcangelo Caduto", class: 'principal', act: 2, location: 'Cattedrale Caduta', weaponType: null, difficulty: null, weapon: null, form: null, phases: 1 },
  // ACT III — IL BIANCO SILENZIO
  { order: 13, id: 'gigante_di_fuoco', name: 'Gigante di Fuoco', class: 'secondary', act: 3, location: 'Bocca del Vulcano', weaponType: 'pugni', difficulty: 10, weapon: { id: 'pugni_di_brace', name: 'Pugni di Brace', arts: ['Pugno Cratere', 'Presa Ardente'] }, form: null, phases: 2 },
  { order: 14, id: 'yeti', name: 'Yeti', class: 'secondary', act: 3, location: 'Pendii della Corona Bianca', weaponType: 'artigli', difficulty: 10, weapon: { id: 'unghie_del_bianco', name: 'Unghie del Bianco', arts: ['Graffio Valanga', 'Balzo Predatore'] }, form: null, phases: 2 },
  { order: 15, id: 'guardiano_rocca_di_brina', name: 'Guardiano della Rocca di Brina', class: 'secondary', act: 3, location: 'Rocca di Brina gate', weaponType: 'scudo', difficulty: 11, weapon: { id: 'baluardo_gelido', name: 'Baluardo Gelido', arts: ['Urto del Baluardo', 'Muro di Brina'] }, form: null, phases: 2 },
  { order: 16, id: 'loki', name: 'Loki', class: 'principal', act: 3, location: 'Sala del Trono di Brina', weaponType: 'tomo', difficulty: 13, weapon: { id: 'grimorio_delle_menzogne', name: 'Grimorio delle Menzogne', arts: ['Falso Specchio', 'Verità Scomoda'] }, form: 'specchio', phases: 3 },
  { order: 17, id: 'grande_lupo', name: 'Grande Lupo', class: 'secondary', act: 3, location: 'Taiga, clearing of the Three Spirits', weaponType: 'katana', difficulty: 11, weapon: { id: 'zanna_d_argento', name: "Zanna d'Argento", arts: ['Taglio Lunare', 'Branco'] }, form: null, phases: 2 },
  { order: 18, id: 'grande_orso', name: 'Grande Orso', class: 'secondary', act: 3, location: 'Taiga, forest of the Logs', weaponType: 'asce_gemelle', difficulty: 12, weapon: { id: 'asce_gemelle_del_taglialegna', name: 'Asce Gemelle del Taglialegna', arts: ['Tempesta di Schegge', 'Abbattimento'] }, form: null, phases: 2 },
  { order: 19, id: 'sciamano', name: 'Sciamano', class: 'secondary', act: 3, location: 'Taiga, Cerchio dei Tamburi', weaponType: 'totem', difficulty: 12, weapon: { id: 'totem_degli_spiriti', name: 'Totem degli Spiriti', arts: ['Ruggito Spirituale', 'Stormo di Corvi'] }, form: null, phases: 2 },
  { order: 20, id: 'grande_aquila_reale', name: 'Grande Aquila Reale', class: 'secondary', act: 3, location: 'Il Grande Fiume (ship)', weaponType: 'arco_lungo', difficulty: 12, weapon: { id: 'piuma_reale', name: 'Piuma Reale', arts: ['Freccia Planante', "Pioggia d'Oro"] }, form: null, phases: 2 },
  { order: 21, id: 'drago_di_fuoco', name: 'Drago di Fuoco', class: 'mini', act: 3, location: 'Porto del Grande Fiume', weaponType: 'balestra', difficulty: 12, weapon: { id: 'balestra_del_drago_ardente', name: 'Balestra del Drago Ardente', arts: ['Dardo Incendiario', 'Salva a Scaglie'] }, form: null, phases: 2 },
  { order: 22, id: 'kraken', name: 'Kraken', class: 'mini', act: 3, location: 'Il Mare', weaponType: 'arpione', difficulty: 13, weapon: { id: 'arpione_abissale', name: 'Arpione Abissale', arts: ['Lancio e Richiamo', 'Vortice'] }, form: null, phases: 2 },
  // ACT IV — IL GIARDINO DEL DIO
  { order: 23, id: 're_mantide', name: 'Re Mantide', class: 'secondary', act: 4, location: 'Prato dei Trifogli', weaponType: 'kama_gemelle', difficulty: 13, weapon: { id: 'kama_della_mantide', name: 'Kama della Mantide', arts: ['Imboscata Verde', 'Falcata Incrociata'] }, form: null, phases: 2 },
  { order: 24, id: 'coleottero_imperiale', name: 'Coleottero Imperiale', class: 'secondary', act: 4, location: 'Bosco di Muschio', weaponType: 'lama_a_tenaglia', difficulty: 14, weapon: { id: 'mandibole_imperiali', name: 'Mandibole Imperiali', arts: ['Morsa', 'Carica Corazzata'] }, form: null, phases: 2 },
  { order: 25, id: 'regina_formica', name: 'Regina Formica', class: 'secondary', act: 4, location: 'Formicaio sotto le radici', weaponType: 'pugnali', difficulty: 14, weapon: { id: 'pungiglioni_regali', name: 'Pungiglioni Regali', arts: ['Puntura Acida', 'Sciame'] }, form: null, phases: 2 },
  { order: 26, id: 'uruk', name: 'Uruk, Dio Minore di Little Garden', class: 'principal', act: 4, location: 'La Serra del Giardiniere', weaponType: 'cesoie', difficulty: 15, weapon: { id: 'cesoie_del_giardiniere', name: 'Cesoie del Giardiniere', arts: ['Potatura', 'Innesto'] }, form: 'gigante', phases: 3 },
  // ACT V — IL REGNO DEI DRAGHI
  { order: 27, id: 'drago_di_ghiaccio', name: 'Drago di Ghiaccio', class: 'mini', act: 5, location: 'Altipiano delle Ossa', weaponType: 'naginata', difficulty: 14, weapon: { id: 'naginata_cristallina', name: 'Naginata Cristallina', arts: ['Falciata Glaciale', 'Punta di Cristallo'] }, form: null, phases: 2 },
  { order: 28, id: 'drago_a_tre_teste', name: 'Drago a Tre Teste', class: 'mini', act: 5, location: 'I Nidi', weaponType: 'tridente', difficulty: 15, weapon: { id: 'tridente_delle_tre_punte', name: 'Tridente delle Tre Punte', arts: ['Triplice Affondo', 'Lancio del Tridente'] }, form: null, phases: 1 },
  { order: 29, id: 'reina', name: 'Reina, la Maga Ancestrale', class: 'principal', act: 5, location: 'Osservatorio delle Stelle', weaponType: 'astrolabio', difficulty: 16, weapon: { id: 'astrolabio_ancestrale', name: 'Astrolabio Ancestrale', arts: ['Congiunzione', 'Cometa'] }, form: 'firmamento', phases: 3 },
  { order: 30, id: 'idra', name: 'Idra', class: 'secondary', act: 5, location: 'Lago dei Nove Specchi', weaponType: 'frusta', difficulty: 15, weapon: { id: 'frusta_delle_nove_code', name: 'Frusta delle Nove Code', arts: ['Nove Morsi', 'Sibilo Multiplo'] }, form: null, phases: 2 },
  { order: 31, id: 'grifone', name: 'Grifone', class: 'secondary', act: 5, location: 'Scogliere del Vento', weaponType: 'scimitarra', difficulty: 16, weapon: { id: 'ala_di_grifone', name: 'Ala di Grifone', arts: ["Colpo d'Ala", 'Tuffo del Rapace'] }, form: null, phases: 2 },
  { order: 32, id: 're_drago', name: 'Re Drago', class: 'principal', act: 5, location: 'La Chioma di Yggdrasil', weaponType: 'spada_bastarda', difficulty: 17, weapon: { id: 'spada_del_sovrano', name: 'Spada del Sovrano', arts: ['Giuramento di Luce', 'Tre Soffi'] }, form: 'cielo_aureo', phases: 4 },
  // ACT VI — IL ROVESCIO
  { order: 33, id: 'lucifero_2', name: "Lucifero, l'Arcangelo Caduto", class: 'principal', act: 6, location: 'Cattedrale Caduta', weaponType: 'flagello', difficulty: 18, weapon: { id: 'stella_del_mattino', name: 'Stella del Mattino', arts: ['Alba Spezzata', 'Caduta'] }, form: 'abisso_rosso', phases: 3 },
  { order: 34, id: 'drago_del_vuoto', name: 'Drago del Vuoto', class: 'mini', act: 6, location: 'Il Rovescio, Pianura Capovolta', weaponType: 'chakram', difficulty: 16, weapon: { id: 'chakram_del_vuoto', name: 'Chakram del Vuoto', arts: ['Lancio Orbitale', 'Foro Nero'] }, form: null, phases: 2 },
  { order: 35, id: 'verme_mangiamondi', name: 'Verme Mangiamondi', class: 'mini', act: 6, location: 'Il Rovescio, Deserto di Cenere', weaponType: 'trivella', difficulty: 17, weapon: { id: 'trivella_divorante', name: 'Trivella Divorante', arts: ['Perforazione', 'Scavo'] }, form: null, phases: 2 },
  { order: 36, id: 'regina_drago', name: 'Regina Drago', class: 'principal', act: 6, location: 'Il Palazzo Capovolto', weaponType: 'falce', difficulty: 19, weapon: { id: 'falce_dell_eclissi', name: "Falce dell'Eclissi", arts: ['Falciata Eclissi', "Raccolto d'Ombra"] }, form: 'rovescio', phases: 4 },
  // ACT VII — L'ALBA
  { order: 37, id: 'dio_dei_draghi', name: 'Dio dei Draghi (Ouranthos)', class: 'principal', act: 7, location: 'Terrazze Celesti', weaponType: 'scettro', difficulty: 19, weapon: { id: 'scettro_del_primo_respiro', name: 'Scettro del Primo Respiro', arts: ['Respiro Primordiale', 'Settimo Anello'] }, form: null, phases: 2 },
  { order: 38, id: 'cthulhu', name: 'Cthulhu, Dio Maggiore del Caos', class: 'principal', act: 7, location: 'Il Collasso', weaponType: 'arma_mutaforma', difficulty: 20, weapon: { id: 'lama_dell_abisso_sognante', name: "Lama dell'Abisso Sognante", arts: ['Metamorfosi', 'Risveglio Abissale'] }, form: null, phases: 3 },
];

export const CANON_STARTER = { id: 'lama_della_culla', name: 'Lama della Culla', type: 'spada_corta' };

export const CANON_FORMS = [
  { order: 1, id: 'prato_lunare', name: 'Prato Lunare', ability: 'Respiro Libero', unlockedBy: null },
  { order: 2, id: 'specchio', name: 'Specchio', ability: 'Riflessi', unlockedBy: 'loki' },
  { order: 3, id: 'gigante', name: 'Gigante', ability: 'Statura', unlockedBy: 'uruk' },
  { order: 4, id: 'firmamento', name: 'Firmamento', ability: 'Tempo Stellare', unlockedBy: 'reina' },
  { order: 5, id: 'cielo_aureo', name: 'Cielo Aureo', ability: 'Ali di Luce', unlockedBy: 're_drago' },
  { order: 6, id: 'abisso_rosso', name: 'Abisso Rosso', ability: 'Patto di Sangue', unlockedBy: 'lucifero_2' },
  { order: 7, id: 'rovescio', name: 'Rovescio', ability: 'Inversione', unlockedBy: 'regina_drago' },
];

export const CANON_MINI = ['great_devourer', 'drago_di_fuoco', 'kraken', 'drago_di_ghiaccio', 'drago_a_tre_teste', 'drago_del_vuoto', 'verme_mangiamondi'];
export const CANON_PARRY_TYPES = ['scudo', 'spada_lunga', 'spada_bastarda', 'stocco', 'katana', 'scimitarra'];
export const CANON_ACT_NAMES = ['Il Risveglio', 'La Discesa', 'Il Bianco Silenzio', 'Il Giardino del Dio', 'Il Regno dei Draghi', 'Il Rovescio', "L'Alba"];

/** Key canonical quotes (Italian) that must appear verbatim in it locale. */
export const CANON_QUOTES = [
  "Nessuno scende finché l'Alba non è pronta",
  "L'alba non si trova. Si porta",
  "Non hai ombra, Portatore. Né passato.",
  'Il Fuoco giura per primo.',
  'Il Tuono giura per secondo.',
  'Il Gelo giura per ultimo.',
  'Sei vivo, piccolo seme. Cosa vuoi da me?',
  'Nessuno mi ha mai implorato per vivere. Vai.',
  'Finalmente',
  "Il fiume sa dov'è il mare. Il mare sa dov'è il giardino.",
  'Un giardino piccolo non si può perdere.',
  'Se le stelle mentono, voglio vederlo.',
  'Sono ciò che resta quando si toglie il rimpianto.',
  'Sei tornato a prendere il resto del colpo.',
  'Sei tornato in piedi. Mi piace di più.',
  'Io ho perso il cielo per aver detto no. Dimostrami che il tuo sì valga.',
  'Il cielo, ora, è sotto di noi.',
  'Io ricordo tutto. Lui ha scelto di dimenticare per poter continuare.',
  'Basta. Ti ho visto.',
  'Ho respirato sei mondi e li ho persi tutti. Il settimo non lo respiro io: lo respiri tu.',
];
