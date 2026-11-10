// Player database + PlayStyle catalogue (Game Bible v1.0). Data only: gameplay systems read these, never player names.
export type Pos = 'POR' | 'TD' | 'TS' | 'DC' | 'CDC' | 'CC' | 'COC' | 'AD' | 'AS' | 'ATT' | 'CF';
export const POS_NAME: Record<Pos, string> = {
  POR: 'Portiere', TD: 'Terzino destro', TS: 'Terzino sinistro', DC: 'Difensore centrale', CDC: 'Centrocampista difensivo',
  CC: 'Centrocampista centrale', COC: 'Centrocampista offensivo', AD: 'Ala destra', AS: 'Ala sinistra', ATT: 'Attaccante', CF: 'Seconda punta',
};
export const STAT_NAMES = ['Velocità', 'Tiro', 'Passaggio', 'Dribbling', 'Difesa', 'Fisico', 'Colpo di testa'];
export const GK_STAT_NAMES = ['Tuffo', 'Riflessi', 'Presa', 'Posizionamento', 'Portiere libero', 'Rinvio'];

export interface Look { h: number; build: number; skin: number; hair: number; hc: string; beard: number; foot: 'L' | 'R' | 'B' }
export interface PlayerData {
  id: string; name: string; short: string; nat: string; pos: Pos; sec: Pos[]; gk: boolean;
  stats: number[]; ps: { e: string[]; s: string[]; t: string[] }; look: Look; bio: string;
}

// Derived internal parameters (never shown as a single rating; no Overall exists anywhere).
export const DK = ['spd', 'acc', 'agi', 'ctl', 'fst', 'bal', 'str', 'pasS', 'pasL', 'pasT', 'crs', 'vis', 'shoF', 'shoL', 'shoP', 'shoC',
  'shoV', 'shoA', 'fk', 'tck', 'cln', 'int', 'mrk', 'dpos', 'rec', 'agg', 'prs', 'air', 'hdr', 'sta', 'run', 'ovl', 'lead', 'wf', 'skl',
  'tight', 'cutIn', 'oneT', 'carry', 'shield', 'drb', 'boxp', 'acro', 'elas', 'gDiv', 'gRef', 'gHan', 'gPos', 'gSwp', 'gKick', 'gReach',
  'gRush', 'gParry', 'gClutch', 'gCover', 'vers'] as const;
export type DKey = typeof DK[number];
export type D = Record<DKey, number>;

export interface PlayStyle { n: string; d: string; c: string; m: Partial<D> }
const S = (n: string, c: string, d: string, m: Partial<D>): PlayStyle => ({ n, c, d, m });
// m = parameter shifts at Elite weight (Speciale ×0.62, Standard ×0.36). Flags (tight, cutIn, oneT…) drive AI/animation choices.
export const PS: Record<string, PlayStyle> = {
  tuffo: S('Tuffo acrobatico', 'Portieri', 'Interventi spettacolari sui palloni più lontani: maggiore estensione in tuffo.', { gDiv: 6, gReach: 0.28 }),
  rifl: S('Riflessi', 'Portieri', 'Reazioni più rapide sulle conclusioni ravvicinate.', { gRef: 8 }),
  resp: S('Respinta', 'Portieri', 'I palloni non bloccabili vengono respinti lontano dalle zone pericolose.', { gParry: 1 }),
  usc: S('Uscita aggressiva', 'Portieri', 'Uscite tempestive sugli attaccanti lanciati a rete e sui palloni in profondità.', { gRush: 1, gSwp: 3 }),
  lib: S('Portiere libero', 'Portieri', 'Posizione avanzata e interventi fuori area da ultimo uomo.', { gSwp: 7, gRush: 0.5 }),
  piedi: S('Gioco con i piedi', 'Portieri', 'Distribuzione precisa: partecipa alla costruzione.', { gKick: 7, pasS: 14, pasL: 14 }),
  parata: S('Parata decisiva', 'Portieri', 'Rendimento superiore nelle occasioni più pericolose.', { gClutch: 1 }),
  cop: S('Copertura della porta', 'Portieri', 'Posizionamento che riduce lo specchio disponibile.', { gPos: 6, gCover: 1 }),
  presa: S('Presa', 'Portieri', 'Blocca conclusioni che altri portieri respingerebbero.', { gHan: 8 }),
  res: S('Resistenza', 'Velocità e movimento', 'Consuma meno energia e recupera più in fretta.', { sta: -0.38 }),
  sovr: S('Sovrapposizione', 'Velocità e movimento', 'Riconosce quando sovrapporsi sulla fascia e lo fa più spesso.', { ovl: 1 }),
  contr: S('Contrasto', 'Difesa', 'Interventi diretti sul pallone più efficaci.', { tck: 8 }),
  marc: S('Marcatura', 'Difesa', 'Resta più vicino all’avversario diretto e ne segue i movimenti.', { mrk: 10 }),
  interc: S('Intercettazione', 'Difesa', 'Legge le linee di passaggio e arriva su palloni più lontani.', { int: 10 }),
  drib: S('Dribbling', 'Dribbling e tecnica', 'Conduzione più efficace e maggiore propensione all’uno contro uno.', { ctl: 5, agi: 4, drb: 1 }),
  pass: S('Passaggio', 'Passaggi', 'Passaggi più precisi in ogni situazione.', { pasS: 6, pasL: 4, pasT: 3 }),
  tecn: S('Tecnica', 'Dribbling e tecnica', 'Gesti tecnici più vari: tacco, piede debole, primo controllo.', { ctl: 3, fst: 4, wf: 0.14, skl: 1 }),
  cross: S('Cross', 'Passaggi', 'Cross più precisi e tesi.', { crs: 12 }),
  lungo: S('Passaggio lungo', 'Passaggi', 'Cambi di gioco e lanci più precisi.', { pasL: 10 }),
  filtr: S('Passaggio filtrante', 'Passaggi', 'Cerca e trova i compagni nello spazio oltre la linea.', { pasT: 10, vis: 5 }),
  tiki: S('Tiki-taka', 'Passaggi', 'Passaggi di prima precisi, scarico e movimento.', { pasS: 4, oneT: 1 }),
  vis: S('Visione', 'Passaggi', 'Individua linee di passaggio che altri non vedono.', { vis: 12 }),
  cravv: S('Controllo ravvicinato', 'Dribbling e tecnica', 'Primo controllo e gestione sotto pressione.', { ctl: 5, fst: 6, tight: 0.6 }),
  giro: S('Tiro a giro', 'Tiro', 'Conclusioni a effetto più curve e precise.', { shoC: 14 }),
  puniz: S('Punizioni', 'Tiro', 'Calci di punizione più precisi e con più effetto.', { fk: 16 }),
  pot: S('Tiro potente', 'Tiro', 'Conclusioni molto più veloci.', { shoP: 14 }),
  testa: S('Colpo di testa', 'Fisico e gioco aereo', 'Colpi di testa più precisi.', { hdr: 10, air: 3 }),
  lett: S('Lettura difensiva', 'Difesa', 'Posizione più intelligente: anticipa lo sviluppo dell’azione.', { dpos: 10, int: 4 }),
  domf: S('Dominio fisico', 'Fisico e gioco aereo', 'Vince i duelli spalla a spalla e protegge il pallone.', { str: 11, bal: 5, shield: 0.5 }),
  antic: S('Anticipi', 'Difesa', 'Interviene sulle traiettorie prima dell’attaccante.', { int: 8 }),
  aereo: S('Gioco aereo', 'Fisico e gioco aereo', 'Tempismo e qualità nei duelli aerei.', { air: 10 }),
  lead: S('Leadership', 'Leadership', 'Coordina i compagni vicini: linea e coperture più ordinate.', { lead: 1 }),
  elev: S('Elevazione', 'Fisico e gioco aereo', 'Raggiunge palloni più alti.', { air: 8 }),
  cpul: S('Contrasto pulito', 'Difesa', 'Contrasti precisi: molti meno falli.', { cln: 22, tck: 3 }),
  posiz: S('Posizionamento', 'Difesa', 'Sceglie la posizione giusta: in difesa e, per gli attaccanti, in area.', { dpos: 7, boxp: 1 }),
  recvel: S('Recupero in velocità', 'Difesa', 'Recupera terreno negli inseguimenti difensivi.', { rec: 1 }),
  regia: S('Regia difensiva', 'Difesa', 'Imposta dal reparto arretrato e avanza palla al piede.', { pasL: 5, pasS: 3, carry: 1 }),
  recpal: S('Recupero palla', 'Difesa', 'Riconquista il pallone e lo tiene dopo il contrasto.', { tck: 5, int: 4, prs: 12 }),
  fin: S('Finalizzazione', 'Tiro', 'Più freddo e preciso nelle occasioni in area.', { shoF: 9, run: 0.15 }),
  acc: S('Accelerazione', 'Velocità e movimento', 'Raggiunge prima la velocità di corsa.', { acc: 2.4 }),
  elast: S('Elastici', 'Dribbling e tecnica', 'Esegue l’elastico nelle finte contestuali.', { elas: 1, skl: 1 }),
  equil: S('Equilibrio', 'Dribbling e tecnica', 'Resta in piedi dopo contatti e cambi di direzione.', { bal: 14 }),
  press: S('Pressing', 'Difesa', 'Partecipa con continuità alla pressione.', { prs: 32, sta: -0.1 }),
  ambi: S('Entrambi i piedi', 'Tiro', 'Calcia e passa con la stessa qualità con entrambi i piedi.', { wf: 1 }),
  accgiro: S('Accentramento e tiro a giro', 'Tiro', 'Rientra dalla fascia sul piede forte e conclude a giro.', { cutIn: 1, shoC: 12 }),
  prec: S('Tiro di precisione', 'Tiro', 'Conclusioni più precise quando ha tempo e spazio.', { shoA: 10 }),
  aggr: S('Aggressività', 'Difesa', 'Interventi più decisi e frequenti (con rischio di fallo).', { agg: 32, tck: 3 }),
  forza: S('Forza fisica', 'Fisico e gioco aereo', 'Più forte nei contatti.', { str: 8 }),
  acrob: S('Acrobazie', 'Tiro', 'Conclusioni acrobatiche sui palloni alti.', { acro: 1, shoV: 10 }),
  prot: S('Protezione palla', 'Fisico e gioco aereo', 'Mantiene il possesso spalle all’avversario.', { shield: 1, bal: 5 }),
  anticip: S('Anticipazione', 'Difesa', 'Legge la traiettoria e arriva prima dell’avversario.', { int: 9, dpos: 3 }),
  vers: S('Versatilità difensiva', 'Difesa', 'Rende allo stesso livello in tutti i ruoli difensivi.', { vers: 1 }),
  vel: S('Velocità', 'Velocità e movimento', 'Velocità di punta superiore, anche palla al piede.', { spd: 0.36 }),
  inser: S('Inserimento offensivo', 'Velocità e movimento', 'Attacca gli spazi in area con tempismo.', { run: 0.5 }),
  ctrl: S('Controllo', 'Dribbling e tecnica', 'Primo controllo più pulito.', { fst: 9 }),
  cpalla: S('Controllo di palla', 'Dribbling e tecnica', 'Addomestica palloni difficili con naturalezza.', { fst: 12, ctl: 3 }),
  dtec: S('Dribbling tecnico', 'Dribbling e tecnica', 'Repertorio di finte più ampio ed efficace.', { ctl: 4, agi: 3, skl: 2, drb: 0.6 }),
  dravv: S('Dribbling ravvicinato', 'Dribbling e tecnica', 'Pallone incollato al piede e cambi di direzione rapidissimi.', { ctl: 6, agi: 7, tight: 1, acc: 0.9 }),
  dist: S('Tiro dalla distanza', 'Tiro', 'Conclusioni da fuori area più precise.', { shoL: 11 }),
  volo: S('Tiro al volo', 'Tiro', 'Conclusioni di prima e al volo più pulite.', { shoV: 13 }),
};
export const TIER_W = { e: 1, s: 0.62, t: 0.36 };
export const TIER_NAME = { e: 'Elite', s: 'Speciale', t: 'Standard' };

const sp = (s: string) => (s ? s.split(' ') : []);
const P = (name: string, short: string, nat: string, pos: Pos, sec: string, stats: number[], e: string, s: string, t: string,
  lk: [number, number, number, number, string, number, string], bio: string): PlayerData => ({
  id: short.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, ''), name, short, nat, pos, sec: sp(sec) as Pos[], gk: pos === 'POR', stats,
  ps: { e: sp(e), s: sp(s), t: sp(t) }, bio,
  look: { h: lk[0], build: lk[1], skin: lk[2], hair: lk[3], hc: lk[4], beard: lk[5], foot: lk[6] as 'L' | 'R' | 'B' },
});
// look: [height cm, build 0-2, skin 0-4, hair 0 rasato·1 corto·2 medio·3 lungo·4 ricci·5 coda·6 cresta·7 fascia, colore, barba, piede]
export const PLAYERS: PlayerData[] = [
  P('Gianluigi Buffon', 'Buffon', 'Italia', 'POR', '', [98, 97, 96, 96, 94, 84], 'tuffo', 'rifl resp', '', [192, 1, 1, 2, 'd', 0, 'R'], 'Portiere di riflessi e parate spettacolari: reagisce alle conclusioni improvvise e respinge lontano.'),
  P('Manuel Neuer', 'Neuer', 'Germania', 'POR', '', [94, 96, 94, 97, 99, 98], 'usc', 'lib piedi', '', [193, 2, 0, 1, 'l', 0, 'R'], 'Portiere libero: aggressivo nelle uscite, anticipa fuori area e imposta con i piedi.'),
  P('Thibaut Courtois', 'Courtois', 'Belgio', 'POR', '', [98, 97, 97, 98, 95, 87], 'parata', 'cop presa', '', [200, 1, 0, 1, 'b', 0, 'L'], 'Copre lo specchio con posizione e allungo: neutralizza le conclusioni più pericolose.'),
  P('Cafu', 'Cafu', 'Brasile', 'TD', '', [94, 78, 87, 88, 94, 93, 78], 'res', 'sovr contr', '', [176, 1, 3, 1, 'k', 0, 'R'], 'Terzino atletico e completo: accompagna l’azione offensiva per tutta la partita.'),
  P('Javier Zanetti', 'Zanetti', 'Argentina', 'TD', '', [90, 76, 87, 87, 96, 94, 79], 'marc', 'interc res', '', [178, 2, 1, 2, 'k', 0, 'R'], 'Terzino disciplinato: affidabile in marcatura e nella gestione difensiva.'),
  P('Dani Alves', 'Dani Alves', 'Brasile', 'TD', '', [91, 79, 94, 94, 84, 84, 72], 'drib', 'pass tecn', '', [172, 1, 3, 1, 'k', 0, 'R'], 'Terzino offensivo e tecnico: costruisce e combina nello stretto.'),
  P('Trent Alexander-Arnold', 'Alexander-Arnold', 'Inghilterra', 'TD', '', [82, 82, 99, 87, 82, 77, 68], 'cross', 'lungo filtr', '', [180, 1, 3, 1, 'k', 1, 'R'], 'Terzino creativo: cross e distribuzione da regista.'),
  P('Paolo Maldini', 'Maldini', 'Italia', 'TS', 'DC', [90, 73, 85, 86, 99, 91, 88], 'marc', 'interc contr', '', [186, 1, 1, 3, 'd', 0, 'B'], 'Legge le situazioni e interviene con precisione: difensore di intelligenza superiore.'),
  P('Gianluca Zambrotta', 'Zambrotta', 'Italia', 'TS', 'TD', [92, 80, 85, 86, 91, 91, 81], 'vers', 'res contr', '', [181, 1, 1, 2, 'd', 0, 'R'], 'Terzino completo e versatile, a suo agio su entrambe le fasce.'),
  P('Roberto Carlos', 'Roberto Carlos', 'Brasile', 'TS', '', [97, 94, 91, 91, 86, 87, 76], 'puniz', 'pot vel', '', [168, 2, 3, 0, 'k', 0, 'L'], 'Terzino offensivo: velocità estrema e conclusioni violente dalla distanza.'),
  P('Marcelo', 'Marcelo', 'Brasile', 'TS', 'AS', [87, 83, 91, 97, 82, 84, 75], 'drib', 'tecn pass', '', [174, 1, 3, 4, 'k', 0, 'L'], 'Terzino creativo: conduzione e combinazioni offensive.'),
  P('Virgil van Dijk', 'Van Dijk', 'Paesi Bassi', 'DC', '', [89, 67, 83, 77, 98, 96, 95], 'domf', 'antic aereo', '', [195, 2, 3, 5, 'k', 1, 'R'], 'Dominante nei duelli fisici e nel gioco aereo.'),
  P('Nemanja Vidić', 'Vidić', 'Serbia', 'DC', '', [78, 56, 70, 67, 97, 98, 97], 'contr', 'aereo marc', '', [190, 2, 0, 1, 'd', 0, 'R'], 'Difensore aggressivo e fisico, specialista del contrasto.'),
  P('Sergio Ramos', 'Ramos', 'Spagna', 'DC', '', [83, 78, 78, 75, 96, 93, 97], 'testa', 'contr aggr', '', [184, 2, 1, 1, 'd', 1, 'R'], 'Difensore aggressivo, decisivo nei duelli aerei.'),
  P('Franco Baresi', 'Baresi', 'Italia', 'DC', '', [82, 65, 91, 83, 99, 82, 86], 'lett', 'interc lead', '', [176, 1, 1, 1, 'd', 0, 'R'], 'Organizzatore della linea: legge l’azione e coordina i compagni.'),
  P('Fabio Cannavaro', 'Cannavaro', 'Italia', 'DC', '', [91, 62, 76, 77, 98, 90, 94], 'anticip', 'elev marc', '', [176, 2, 1, 0, 'k', 0, 'R'], 'Maestro dell’anticipo e della scelta di tempo.'),
  P('Alessandro Nesta', 'Nesta', 'Italia', 'DC', '', [85, 61, 83, 78, 99, 87, 91], 'cpul', 'interc posiz', '', [187, 1, 1, 3, 'k', 0, 'R'], 'Difensore tecnico e intelligente: interventi di grande pulizia.'),
  P('Franz Beckenbauer', 'Beckenbauer', 'Germania', 'DC', 'CDC', [88, 80, 96, 91, 97, 87, 90], 'regia', 'drib filtr', '', [181, 1, 0, 4, 'd', 0, 'R'], 'Libero moderno: difende, imposta e avanza palla al piede.'),
  P('William Saliba', 'Saliba', 'Francia', 'DC', '', [91, 62, 82, 78, 94, 91, 88], 'recvel', 'interc marc', '', [192, 2, 4, 1, 'k', 0, 'R'], 'Difensore moderno e rapido, efficace nelle coperture.'),
  P('Sergio Busquets', 'Busquets', 'Spagna', 'CDC', '', [67, 70, 96, 88, 91, 82, 72], 'tiki', 'interc pass', '', [189, 0, 1, 1, 'd', 1, 'R'], 'Regista basso: posizione e circolazione del pallone.'),
  P('Rodri', 'Rodri', 'Spagna', 'CDC', '', [75, 84, 96, 87, 94, 92, 85], 'regia', 'interc dist', '', [191, 2, 1, 1, 'd', 1, 'R'], 'Protegge la difesa e organizza la costruzione.'),
  P('Claude Makélélé', 'Makélélé', 'Francia', 'CDC', '', [83, 65, 83, 80, 98, 91, 77], 'recpal', 'marc contr', '', [170, 1, 4, 0, 'k', 0, 'R'], 'Mediano di recupero: riconquista il pallone davanti alla difesa.'),
  P('Casemiro', 'Casemiro', 'Brasile', 'CDC', '', [72, 77, 83, 77, 94, 96, 92], 'contr', 'aereo pot', '', [185, 2, 2, 1, 'k', 1, 'R'], 'Mediano fisico: aggressivo nei contrasti, pericoloso sulle palle alte.'),
  P('Xavi', 'Xavi', 'Spagna', 'CC', '', [77, 75, 99, 94, 78, 73, 65], 'tiki', 'pass vis', '', [170, 1, 1, 1, 'k', 0, 'R'], 'Organizzatore: controlla il ritmo con passaggi di precisione assoluta.'),
  P('Andrés Iniesta', 'Iniesta', 'Spagna', 'CC', '', [84, 80, 97, 99, 72, 75, 64], 'tiki', 'drib cravv', '', [171, 0, 0, 0, 'b', 0, 'R'], 'Supera l’uomo negli spazi stretti e crea superiorità.'),
  P('Luka Modrić', 'Modrić', 'Croazia', 'CC', '', [85, 82, 97, 96, 81, 75, 66], 'pass', 'tiki dist', '', [172, 0, 0, 7, 'l', 0, 'R'], 'Centrocampista tecnico e completo: ritmo e occasioni.'),
  P('Michel Platini', 'Platini', 'Francia', 'CC', '', [85, 96, 96, 91, 65, 80, 83], 'fin', 'filtr giro', '', [179, 1, 1, 4, 'd', 0, 'R'], 'Centrocampista offensivo: inserimenti, conclusioni e ultimo passaggio.'),
  P('Steven Gerrard', 'Gerrard', 'Inghilterra', 'CC', '', [88, 92, 92, 86, 84, 92, 85], 'pot', 'lungo lead', '', [183, 2, 0, 1, 'b', 0, 'R'], 'Centrocampista completo e fisico, pericoloso dalla distanza.'),
  P('Jude Bellingham', 'Bellingham', 'Inghilterra', 'CC', '', [90, 88, 88, 90, 85, 91, 86], 'inser', 'ctrl contr', '', [186, 2, 3, 1, 'k', 0, 'R'], 'Centrocampista dinamico: due fasi e inserimenti in area.'),
  P('Zinedine Zidane', 'Zidane', 'Francia', 'COC', '', [85, 90, 96, 97, 70, 89, 85], 'cpalla', 'drib pass', '', [185, 2, 1, 0, 'k', 0, 'B'], 'Trequartista tecnico e fisico: controllo e gestione sotto pressione.'),
  P('Kevin De Bruyne', 'De Bruyne', 'Belgio', 'COC', '', [82, 91, 99, 89, 70, 82, 72], 'filtr', 'cross pot', '', [181, 1, 0, 1, 'r', 0, 'R'], 'Creatore di occasioni: distribuzione e passaggi decisivi.'),
  P('Pelé', 'Pelé', 'Brasile', 'COC', 'ATT CF', [95, 98, 94, 98, 58, 86, 94], 'drib', 'pot fin', '', [173, 2, 4, 1, 'k', 0, 'B'], 'Attaccante totale: crea, dribbla e conclude.'),
  P('Johan Cruyff', 'Cruyff', 'Paesi Bassi', 'COC', 'ATT CF AS', [93, 94, 97, 98, 67, 83, 89], 'tiki', 'filtr pass giro drib', '', [178, 0, 0, 3, 'b', 0, 'B'], 'Mobilissimo tra le linee: interpreta più ruoli e crea spazi con il movimento.'),
  P('Lionel Messi', 'Messi', 'Argentina', 'AD', 'COC CF ATT', [92, 97, 99, 99, 45, 76, 72], 'dravv dtec', 'giro puniz', 'filtr', [170, 1, 1, 2, 'd', 0, 'L'], 'Controllo ravvicinato, conduzione tecnica, passaggi di precisione e conclusioni a giro.'),
  P('Arjen Robben', 'Robben', 'Paesi Bassi', 'AD', '', [94, 94, 85, 97, 48, 76, 74], 'accgiro', 'drib acc', 'pot', [180, 1, 0, 0, 'b', 0, 'L'], 'Rientra dalla destra sul sinistro e conclude a giro.'),
  P('Mohamed Salah', 'Salah', 'Egitto', 'AD', '', [96, 94, 87, 93, 55, 81, 78], 'fin', 'acc drib', 'ctrl', [175, 1, 2, 4, 'k', 1, 'L'], 'Esterno rapido e pericoloso in zona conclusiva.'),
  P('Gareth Bale', 'Bale', 'Galles', 'AD', '', [98, 94, 86, 91, 62, 90, 91], 'vel', 'pot testa', 'cross', [185, 2, 0, 5, 'b', 0, 'L'], 'Esterno esplosivo: velocità, potenza fisica e conclusioni.'),
  P('Lamine Yamal', 'Yamal', 'Spagna', 'AD', '', [91, 85, 91, 98, 43, 68, 60], 'drib', 'cravv pass', 'giro', [180, 0, 2, 1, 'k', 0, 'L'], 'Esterno creativo: supera l’uomo con controllo e dribbling.'),
  P('Bukayo Saka', 'Saka', 'Inghilterra', 'AD', '', [91, 85, 87, 91, 65, 79, 72], 'drib', 'cross acc', 'pass', [178, 1, 3, 1, 'k', 0, 'L'], 'Esterno equilibrato: crea, dribbla e collabora.'),
  P('Ángel Di María', 'Di María', 'Argentina', 'AD', '', [91, 85, 94, 95, 52, 73, 75], 'filtr', 'cross drib', 'giro', [180, 0, 1, 1, 'd', 0, 'L'], 'Esterno creativo: distribuzione e ultimo passaggio.'),
  P('Riyad Mahrez', 'Mahrez', 'Algeria', 'AD', '', [85, 86, 88, 97, 40, 68, 65], 'dtec', 'cravv', 'giro', [179, 0, 2, 1, 'k', 1, 'L'], 'Esterno tecnico: controllo e movimenti individuali.'),
  P('Cristiano Ronaldo', 'C. Ronaldo', 'Portogallo', 'AS', 'ATT', [97, 99, 86, 95, 55, 95, 99], 'pot testa', 'vel fin', 'giro', [187, 2, 1, 6, 'd', 0, 'R'], 'Pericolosissimo nelle conclusioni, negli inserimenti e nel gioco aereo.'),
  P('Neymar', 'Neymar', 'Brasile', 'AS', 'AD COC', [91, 89, 94, 99, 42, 70, 65], 'dtec dravv', 'elast ctrl', 'filtr', [175, 0, 2, 6, 'd', 0, 'R'], 'Esterno tecnico: dribbling e movimenti creativi.'),
  P('Kylian Mbappé', 'Mbappé', 'Francia', 'AS', 'AD ATT', [99, 96, 87, 97, 45, 85, 82], 'vel', 'fin drib', 'giro', [178, 1, 3, 0, 'k', 0, 'R'], 'Esplosivo: accelerazioni e attacco della profondità.'),
  P('Eden Hazard', 'Hazard', 'Belgio', 'AS', 'AD COC', [88, 86, 88, 98, 48, 76, 65], 'dravv', 'ctrl equil', 'pass', [175, 2, 1, 1, 'd', 0, 'B'], 'Protegge il pallone, cambia direzione e resta in piedi nei contatti.'),
  P('Franck Ribéry', 'Ribéry', 'Francia', 'AS', 'AD COC', [91, 85, 90, 98, 45, 77, 70], 'drib', 'acc ctrl', 'filtr', [170, 1, 0, 1, 'b', 1, 'R'], 'Esterno tecnico e rapido: superiorità con il dribbling.'),
  P('Sadio Mané', 'Mané', 'Senegal', 'AS', 'AD ATT', [96, 91, 84, 91, 61, 83, 84], 'acc', 'press fin', 'testa', [174, 1, 4, 1, 'k', 0, 'R'], 'Attaccante dinamico: inserimenti e pressing continuo.'),
  P('Son Heung-min', 'Son', 'Corea del Sud', 'AS', 'AD ATT', [95, 94, 87, 91, 53, 78, 85], 'giro', 'fin vel', 'ambi', [183, 1, 1, 2, 'k', 0, 'B'], 'Rapido e ambidestro: conclude con entrambi i piedi.'),
  P('Ronaldinho', 'Ronaldinho', 'Brasile', 'AS', 'AD COC', [90, 91, 95, 99, 42, 81, 78], 'dtec', 'elast filtr', 'giro', [181, 1, 3, 7, 'k', 0, 'R'], 'Repertorio amplissimo di finte, gesti tecnici e passaggi imprevedibili.'),
  P('Robert Lewandowski', 'Lewandowski', 'Polonia', 'ATT', 'CF', [83, 98, 86, 89, 50, 89, 95], 'fin', 'posiz testa', 'volo', [185, 2, 0, 1, 'd', 0, 'R'], 'Centravanti completo: posizionamento e finalizzazione.'),
  P('Erling Haaland', 'Haaland', 'Norvegia', 'ATT', '', [97, 98, 75, 85, 45, 96, 96], 'vel fin', 'pot testa', 'forza', [195, 2, 0, 5, 'l', 0, 'L'], 'Centravanti dominante: rapido e devastante in profondità.'),
  P('Karim Benzema', 'Benzema', 'Francia', 'ATT', 'CF COC', [86, 94, 92, 94, 45, 83, 86], 'cravv', 'filtr fin', 'drib', [185, 1, 2, 0, 'k', 1, 'R'], 'Centravanti tecnico: si abbassa, dialoga e conclude.'),
  P('Ronaldo Nazário', 'Ronaldo', 'Brasile', 'ATT', 'CF', [98, 98, 87, 99, 40, 91, 88], 'drib vel prec', 'fin cravv', 'pot', [183, 2, 2, 0, 'k', 0, 'R'], 'Accelerazione, dribbling in velocità, controllo e conclusione.'),
  P('Didier Drogba', 'Drogba', 'Costa d’Avorio', 'ATT', '', [84, 94, 82, 83, 52, 98, 98], 'domf', 'testa fin', 'prot', [188, 2, 4, 3, 'k', 0, 'R'], 'Centravanti fisico: protegge il pallone e domina i duelli.'),
  P('Zlatan Ibrahimović', 'Ibrahimović', 'Svezia', 'ATT', 'CF', [82, 97, 88, 91, 42, 96, 96], 'pot', 'testa acrob', 'ctrl', [195, 2, 1, 5, 'd', 0, 'R'], 'Tecnico e fisico: conclusioni potenti e gesti acrobatici.'),
  P('Luis Suárez', 'Suárez', 'Uruguay', 'ATT', 'CF', [85, 97, 89, 94, 55, 87, 89], 'fin', 'drib aggr', 'volo', [182, 2, 1, 1, 'k', 0, 'R'], 'Imprevedibile e tecnico, letale in area.'),
  P('Harry Kane', 'Kane', 'Inghilterra', 'ATT', 'CF COC', [78, 97, 94, 88, 55, 89, 94], 'fin', 'filtr dist', 'testa', [188, 2, 0, 1, 'l', 0, 'R'], 'Centravanti completo: conclude, si abbassa e costruisce.'),
];
export const byId = (id: string) => PLAYERS.find(p => p.id === id)!;

// Role familiarity (0..1): primary 1, secondary 0.95, related roles lower. Never shown as a rating.
const REL: Record<string, number> = {
  'TD-TS': .86, 'TD-DC': .78, 'TS-DC': .78, 'DC-CDC': .8, 'CDC-CC': .88, 'CC-COC': .88, 'COC-AD': .84, 'COC-AS': .84, 'AD-AS': .9,
  'AD-ATT': .82, 'AS-ATT': .82, 'ATT-CF': .95, 'COC-CF': .92, 'COC-ATT': .82, 'TD-AD': .78, 'TS-AS': .78, 'CDC-COC': .76, 'CC-AD': .74,
  'CC-AS': .74, 'TD-CDC': .72, 'TS-CDC': .72, 'CF-AD': .82, 'CF-AS': .82,
};
export function familiarity(p: PlayerData, role: Pos): number {
  if (p.gk !== (role === 'POR')) return 0.35;
  if (p.pos === role) return 1;
  if (p.sec.includes(role)) return 0.95;
  let f = REL[p.pos + '-' + role] ?? REL[role + '-' + p.pos] ?? 0.62;
  for (const s of p.sec) f = Math.max(f, (REL[s + '-' + role] ?? REL[role + '-' + s] ?? 0) - 0.04);
  if (p.ps.e.includes('vers') && ['TD', 'TS', 'DC', 'CDC'].includes(role)) f = Math.max(f, 0.96);
  return f;
}
export function psWeight(p: PlayerData, id: string): number {
  return p.ps.e.includes(id) ? TIER_W.e : p.ps.s.includes(id) ? TIER_W.s : p.ps.t.includes(id) ? TIER_W.t : 0;
}

/** Internal parameters from the visible statistics + passive PlayStyles + role familiarity. */
export function derive(p: PlayerData, role: Pos): D {
  const d = {} as D; for (const k of DK) d[k] = 0;
  const h = p.look.h, fam = familiarity(p, role);
  if (p.gk) {
    const [tuf, rif, pre, pos, lib, rin] = p.stats;
    Object.assign(d, { gDiv: tuf, gRef: rif, gHan: pre, gPos: pos, gSwp: lib, gKick: rin, spd: 6.3 + (lib - 80) * 0.035, acc: 10, agi: 60, ctl: 45 + (rin - 80) * 0.8,
      fst: 55, bal: 70, str: 80, pasS: rin * 0.82, pasL: rin * 0.8, pasT: rin * 0.6, crs: 50, vis: rin * 0.7, shoF: 30, shoL: 30, shoP: 70 + (rin - 80) * 0.6, shoC: 30,
      shoV: 30, fk: 40, tck: 40, cln: 60, int: 50, mrk: 30, dpos: 50, agg: 40, prs: 20, air: 80 + (h - 190) * 0.6, hdr: 40, sta: 0.7, wf: 0.8 });
  } else {
    const [vel, tir, pas, dri, dif, fis, tes] = p.stats;
    Object.assign(d, { spd: 6.0 + (vel - 40) / 59 * 3.2, acc: 7.5 + (0.65 * vel + 0.35 * dri - 40) / 59 * 6, agi: 0.75 * dri + 0.25 * vel - (h - 178) * 0.28,
      ctl: dri, fst: 0.7 * dri + 0.3 * pas, bal: 0.5 * fis + 0.5 * dri - (h - 178) * 0.15, str: fis + (h - 180) * 0.2, pasS: pas, pasL: pas - 4, pasT: pas - 3,
      crs: pas - 5, vis: pas * 0.8 + dri * 0.2 - 3, shoF: tir, shoL: tir - 5, shoP: 0.7 * tir + 0.3 * fis, shoC: 0.6 * tir + 0.4 * dri - 6, shoV: tir - 8,
      fk: 0.6 * tir + 0.4 * pas - 8, tck: dif, cln: dif * 0.8 + 12, int: dif - 3, mrk: dif - 2, dpos: dif, agg: 50, prs: 40 + (vel - 70) * 0.3 + (dif - 60) * 0.15,
      air: 0.6 * tes + 0.4 * fis + (h - 182) * 0.5, hdr: tes, sta: 1.25 - fis / 200, wf: p.look.foot === 'B' ? 1 : 0.72,
      run: ({ ATT: .6, CF: .5, AD: .5, AS: .5, COC: .4, CC: .25, CDC: .08, TD: .2, TS: .2, DC: .03, POR: 0 } as Record<Pos, number>)[role],
      skl: dri >= 96 ? 2 : dri >= 86 ? 1 : 0, gDiv: 30, gRef: 40, gHan: 30, gPos: 30, gSwp: 40, gKick: pas * 0.7 });
  }
  for (const tier of ['e', 's', 't'] as const) for (const id of p.ps[tier]) {
    const m = PS[id]?.m; if (!m) continue;
    for (const k in m) d[k as DKey] += m[k as DKey]! * TIER_W[tier];
  }
  d.wf = Math.min(1, d.wf); d.sta = Math.max(0.35, d.sta);
  // Out-of-position: reading of the role suffers (positioning, marking, vision, runs), technique barely changes.
  const f = 0.55 + 0.45 * fam, g = 0.9 + 0.1 * fam;
  for (const k of ['dpos', 'mrk', 'int', 'vis', 'crs', 'boxp'] as DKey[]) d[k] *= f;
  for (const k of ['tck', 'pasL', 'pasT', 'shoF', 'air'] as DKey[]) d[k] *= g;
  if (!p.gk && role === 'POR') { d.gDiv = 25; d.gRef = 35; }
  return d;
}

/** Roster validation (Master Prompt §19). Returns a list of problems; empty = valid. */
export function validateRoster(): string[] {
  const err: string[] = [], ids = new Set<string>(), POSS = Object.keys(POS_NAME);
  if (PLAYERS.length !== 57) err.push(`roster size ${PLAYERS.length} != 57`);
  for (const p of PLAYERS) {
    if (ids.has(p.id)) err.push('duplicate ' + p.id); ids.add(p.id);
    if (!POSS.includes(p.pos)) err.push(p.name + ': bad position');
    for (const s of p.sec) if (!POSS.includes(s)) err.push(p.name + ': bad secondary ' + s);
    if (p.stats.length !== (p.gk ? 6 : 7)) err.push(p.name + ': stat count');
    for (const v of p.stats) if (!(v >= 1 && v <= 99)) err.push(p.name + ': stat out of range');
    for (const id of [...p.ps.e, ...p.ps.s, ...p.ps.t]) if (!PS[id]) err.push(p.name + ': unknown PlayStyle ' + id);
    if ('overall' in p) err.push(p.name + ': overall present');
  }
  const cnt = (pp: Pos[]) => PLAYERS.filter(p => pp.includes(p.pos)).length;
  const exp: [Pos[], number][] = [[['POR'], 3], [['TD', 'TS'], 8], [['DC'], 8], [['CDC'], 4], [['CC'], 6], [['COC'], 4], [['AD'], 8], [['AS'], 8], [['ATT'], 8]];
  for (const [pp, n] of exp) if (cnt(pp) !== n) err.push(`group ${pp.join('/')} has ${cnt(pp)} != ${n}`);
  return err;
}
