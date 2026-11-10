// Formations, team tactics and individual instructions (Game Bible §14–15 / Parte IX).
import { Pos } from './db';

export interface Slot { r: Pos; x: number; z: number }
export interface Formation { id: string; desc: string; slots: Slot[] }
const B4: [Pos, number, number][] = [['POR', -48, 0], ['TS', -26, -24], ['DC', -30, -8], ['DC', -30, 8], ['TD', -26, 24]];
const B3: [Pos, number, number][] = [['POR', -48, 0], ['DC', -30, -13], ['DC', -31, 0], ['DC', -30, 13]];
const B5: [Pos, number, number][] = [['POR', -48, 0], ['TS', -22, -27], ['DC', -30, -13], ['DC', -32, 0], ['DC', -30, 13], ['TD', -22, 27]];
const F = (id: string, desc: string, back: [Pos, number, number][], rest: [Pos, number, number][]): Formation =>
  ({ id, desc, slots: [...back, ...rest].map(([r, x, z]) => ({ r, x, z })) });
// x: metres from the centre spot towards the opponent goal with the ball at midfield; z: metres to the right (+) / left (−).
export const FORMATIONS: Formation[] = [
  F('4-3-3', 'Equilibrio e ampiezza', B4, [['CDC', -16, 0], ['CC', -8, -11], ['CC', -8, 11], ['AS', 12, -25], ['ATT', 19, 0], ['AD', 12, 25]]),
  F('4-2-3-1', 'Equilibrio tra reparti', B4, [['CDC', -15, -7], ['CDC', -15, 7], ['AS', 8, -24], ['COC', 5, 0], ['AD', 8, 24], ['ATT', 19, 0]]),
  F('4-4-2', 'Due punte, due linee da quattro', B4, [['AS', -2, -25], ['CC', -10, -7], ['CC', -10, 7], ['AD', -2, 25], ['ATT', 18, -7], ['ATT', 18, 7]]),
  F('4-1-2-1-2', 'Densità centrale', B4, [['CDC', -17, 0], ['CC', -8, -13], ['CC', -8, 13], ['COC', 5, 0], ['ATT', 18, -7], ['ATT', 18, 7]]),
  F('4-3-1-2', 'Trequartista dietro due punte', B4, [['CC', -11, -13], ['CDC', -16, 0], ['CC', -11, 13], ['COC', 5, 0], ['ATT', 18, -7], ['ATT', 18, 7]]),
  F('4-3-2-1', 'Attacco centrale', B4, [['CC', -12, -13], ['CDC', -16, 0], ['CC', -12, 13], ['COC', 7, -8], ['COC', 7, 8], ['ATT', 19, 0]]),
  F('4-2-2-2', 'Due trequartisti e due punte', B4, [['CDC', -15, -7], ['CDC', -15, 7], ['COC', 4, -13], ['COC', 4, 13], ['ATT', 18, -7], ['ATT', 18, 7]]),
  F('4-5-1', 'Densità a centrocampo', B4, [['AS', -3, -25], ['CC', -9, -11], ['CDC', -15, 0], ['CC', -9, 11], ['AD', -3, 25], ['ATT', 18, 0]]),
  F('3-5-2', 'Tre centrali e due esterni', B3, [['TS', -10, -27], ['CC', -9, -9], ['CDC', -16, 0], ['CC', -9, 9], ['TD', -10, 27], ['ATT', 18, -7], ['ATT', 18, 7]]),
  F('3-4-3', 'Tre attaccanti', B3, [['TS', -10, -27], ['CC', -11, -7], ['CC', -11, 7], ['TD', -10, 27], ['AS', 13, -22], ['ATT', 19, 0], ['AD', 13, 22]]),
  F('5-3-2', 'Difesa solida e ripartenze', B5, [['CC', -10, -11], ['CDC', -15, 0], ['CC', -10, 11], ['ATT', 17, -7], ['ATT', 17, 7]]),
  F('5-4-1', 'Blocco difensivo', B5, [['AS', -4, -22], ['CC', -11, -7], ['CC', -11, 7], ['AD', -4, 22], ['ATT', 17, 0]]),
];
export const formation = (id: string) => FORMATIONS.find(f => f.id === id) ?? FORMATIONS[0];

export type Grp = 'GK' | 'FB' | 'CB' | 'DM' | 'CM' | 'AM' | 'W' | 'ST';
export const GRP: Record<Pos, Grp> = { POR: 'GK', TD: 'FB', TS: 'FB', DC: 'CB', CDC: 'DM', CC: 'CM', COC: 'AM', AD: 'W', AS: 'W', ATT: 'ST', CF: 'ST' };

export interface Opt { k: string; label: string; opts: string[]; help: string }
export const TACTIC_SECTIONS: { title: string; items: Opt[] }[] = [
  { title: 'Mentalità', items: [
    { k: 'ment', label: 'Mentalità', opts: ['Difensiva', 'Bilanciata', 'Offensiva', 'Molto offensiva'], help: 'Priorità collettive: quanto la squadra si alza e quanti uomini accompagnano l’azione.' }] },
  { title: 'Attacco', items: [
    { k: 'build', label: 'Costruzione', opts: ['Possesso palla', 'Equilibrata', 'Gioco diretto', 'Contropiede'], help: 'Sostegni corti, verticalizzazioni o ripartenze immediate.' },
    { k: 'width', label: 'Ampiezza', opts: ['Stretta', 'Equilibrata', 'Ampia'], help: 'Quanto la squadra si allarga in possesso.' },
    { k: 'tempo', label: 'Ritmo', opts: ['Lento', 'Normale', 'Rapido'], help: 'Velocità di circolazione e di movimento dei compagni (il ritmo alto consuma più energia).' },
    { k: 'runs', label: 'Inserimenti', opts: ['Prudenti', 'Equilibrati', 'Aggressivi'], help: 'Frequenza dei movimenti in profondità senza palla.' },
    { k: 'over', label: 'Sovrapposizioni', opts: ['Limitate', 'Situazionali', 'Frequenti', 'Interne'], help: 'Comportamento dei terzini quando la palla è sulla loro fascia.' }] },
  { title: 'Difesa', items: [
    { k: 'press', label: 'Stile', opts: ['Pressing alto', 'Pressing equilibrato', 'Blocco medio', 'Blocco basso'], help: 'Da quale altezza la squadra aggredisce il portatore.' },
    { k: 'inten', label: 'Intensità', opts: ['Moderata', 'Normale', 'Aggressiva'], help: 'Frequenza e decisione degli interventi (più falli e più fatica se aggressiva).' },
    { k: 'line', label: 'Linea difensiva', opts: ['Bassa', 'Media', 'Alta'], help: 'Altezza della linea: alta accorcia il campo ma concede profondità.' },
    { k: 'comp', label: 'Compattezza', opts: ['Compatta', 'Equilibrata', 'Distribuita'], help: 'Distanza laterale tra i giocatori senza palla.' },
    { k: 'mark', label: 'Marcatura', opts: ['A zona', 'A uomo', 'Aggressiva nelle zone pericolose'], help: 'Come vengono seguiti gli avversari.' }] },
  { title: 'Transizioni', items: [
    { k: 'won', label: 'Dopo il recupero', opts: ['Ripartenza rapida', 'Costruzione equilibrata', 'Conservazione del possesso'], help: 'Cosa fanno i compagni appena riconquistato il pallone.' },
    { k: 'lost', label: 'Dopo la perdita', opts: ['Contropressione', 'Rientro organizzato', 'Protezione centrale'], help: 'Reazione immediata alla palla persa (la contropressione consuma più energia).' }] },
];
export interface Tactics { form: string; ment: number; build: number; width: number; tempo: number; runs: number; over: number; press: number; inten: number;
  line: number; comp: number; mark: number; won: number; lost: number; instr: string[] }
export const defaultTactics = (form = '4-3-3'): Tactics =>
  ({ form, ment: 1, build: 1, width: 1, tempo: 1, runs: 1, over: 1, press: 1, inten: 1, line: 1, comp: 1, mark: 0, won: 1, lost: 1, instr: Array(11).fill('') });

export interface Instr { id: string; label: string; help: string }
export const INSTR: Record<Grp, Instr[]> = {
  GK: [{ id: '', label: 'Predefinito', help: 'Comportamento secondo le sue caratteristiche.' }],
  FB: [{ id: '', label: 'Equilibrato', help: 'Sale quando c’è spazio.' }, { id: 'dietro', label: 'Resta dietro', help: 'Non accompagna l’azione: copre la fascia.' },
    { id: 'attacca', label: 'Partecipa all’attacco', help: 'Si sovrappone e resta alto.' }, { id: 'dentro', label: 'Entra dentro al campo', help: 'Stringe verso il centro in possesso.' }],
  CB: [{ id: '', label: 'Mantieni posizione', help: 'Resta in linea.' }, { id: 'anticipa', label: 'Anticipa quando possibile', help: 'Esce sull’uomo tra le linee.' },
    { id: 'profondita', label: 'Copri la profondità', help: 'Resta qualche metro più basso.' }],
  DM: [{ id: '', label: 'Copri gli spazi', help: 'Scivola verso il lato palla.' }, { id: 'davanti', label: 'Resta davanti alla difesa', help: 'Non si sgancia mai.' },
    { id: 'costruzione', label: 'Partecipa alla costruzione', help: 'Si abbassa tra i centrali per ricevere.' }],
  CM: [{ id: '', label: 'Equilibrato', help: 'Due fasi.' }, { id: 'inserisciti', label: 'Inserisciti', help: 'Attacca l’area senza palla.' },
    { id: 'copertura', label: 'Resta in copertura', help: 'Resta dietro la linea della palla.' }, { id: 'regia', label: 'Organizza il gioco', help: 'Va incontro al portatore.' },
    { id: 'pressa', label: 'Pressa', help: 'Esce in pressione come secondo uomo.' }],
  AM: [{ id: '', label: 'Muoviti liberamente', help: 'Segue il lato palla.' }, { id: 'centrale', label: 'Resta centrale', help: 'Occupa la zona dietro le punte.' },
    { id: 'linee', label: 'Cerca gli spazi tra le linee', help: 'Si piazza alle spalle dei centrocampisti avversari.' }],
  W: [{ id: '', label: 'Equilibrato', help: 'Ampiezza e tagli a seconda dell’azione.' }, { id: 'largo', label: 'Resta largo', help: 'Piedi sulla linea laterale.' },
    { id: 'accentrati', label: 'Accentrati', help: 'Gioca nel mezzo spazio.' }, { id: 'profondita', label: 'Attacca la profondità', help: 'Scatta alle spalle del terzino.' },
    { id: 'incontro', label: 'Vieni incontro', help: 'Si abbassa per ricevere sui piedi.' }, { id: 'difesa', label: 'Aiuta in difesa', help: 'Rientra fino alla linea dei terzini.' }],
  ST: [{ id: '', label: 'Rimani centrale', help: 'Resta tra i due centrali.' }, { id: 'incontro', label: 'Vieni incontro', help: 'Si abbassa per legare il gioco.' },
    { id: 'profondita', label: 'Attacca la profondità', help: 'Gioca sulla linea del fuorigioco.' }, { id: 'libero', label: 'Muoviti liberamente', help: 'Svaria su tutto il fronte.' },
    { id: 'riferimento', label: 'Fai da riferimento', help: 'Riferimento alto per lanci e cross.' }],
};
export const QUICK = [
  { id: 'attacca', label: 'Attacca', help: 'Più uomini e inserimenti oltre la linea' }, { id: 'supporto', label: 'Supporto', help: 'Compagni vicini al portatore' },
  { id: 'pressing', label: 'Pressing', help: 'Pressione collettiva' }, { id: 'compatti', label: 'Compattati', help: 'Squadra bassa e stretta' },
  { id: 'ritmo', label: 'Ritmo alto', help: 'Movimenti più rapidi' }, { id: 'gestisci', label: 'Gestisci', help: 'Possesso e pochi rischi' },
];
export const DIFFS = ['Principiante', 'Facile', 'Normale', 'Difficile', 'Esperto'];
