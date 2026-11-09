/**
 * The game's single source of truth: four independent mode databases, two player profiles, settings and media.
 * Everything is loaded into memory at start and every change is written to IndexedDB immediately (one transaction
 * per action). Writes are serialized; the in-memory state only changes after the write has committed.
 * Load problems never reset data: damaged records are skipped and reported, never deleted.
 */
import { cryptoRng } from '../core/rng';
import { dayKey, weekKey } from '../core/time';
import { deepClone } from '../core/util';
import { type ContentStatus, newPlayer, normalizePlayer, refreshPeriodic } from '../engines/economy';
import { missingRarities } from '../engines/pack';
import type { TournamentState } from '../engines/tournament';
import {
  ALT_RARITIES, DEFAULT_SETTINGS, MODES, MODE_LABEL, PLAYERS, cardKey,
  type AnyEntry, type CollectorEntry, type Edition, type EntryByMode, type MediaMeta, type MediaRef, type Mode, type PlayerId,
  type PlayerProfile, type Settings,
} from '../model/types';
import { type Issue, MIN_ENTRIES, validate } from '../model/validation';
import { Idb, MemoryStore, type Op, type Store, StorageError, toBlob } from './idb';
import { type Imported, forgetMediaUrls, setBlobLoader, setDirectUrl, thumbKey } from './media';
import { CloudStore, type AssetsApi, type DbApi } from './cloud';

type Listener = () => void;
export type SaveState = 'saving' | 'saved' | 'error';
export type StorageKind = 'cloud' | 'device' | 'memory';

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Inside the Claude viewer: the artifact's private account storage, or null when this view cannot use it. */
async function openCloud(): Promise<CloudStore | null> {
  const c = (window as any).claude;
  if (typeof c?.use !== 'function') return null;
  const [db, user, assets] = await Promise.all([
    withTimeout(c.use('db') as Promise<DbApi | null>, 12000).catch(() => null),
    withTimeout(c.use('user') as Promise<{ id(): Promise<string | null> } | null>, 12000).catch(() => null),
    withTimeout(c.use('assets') as Promise<AssetsApi | null>, 12000).catch(() => null),
  ]);
  if (!db || !user) return null;
  const uid = await withTimeout(user.id(), 12000).catch(() => null);
  if (!uid) return null;
  return new CloudStore(db, assets, uid);
}
type EntryMaps = { [M in Mode]: Map<string, EntryByMode[M]> };

export interface Readiness {
  mode: Mode;
  valid: number;
  total: number;
  needed: number;
  ok: boolean;
  message: string;
}

export interface Collectible {
  entry: CollectorEntry;
  edition: Edition;
  key: string;
}

export interface RawData {
  entries: { [M in Mode]: EntryByMode[M][] };
  players: PlayerProfile[];
  settings: Settings;
  pendingTournament: TournamentState | null;
  media: MediaMeta[];
}

function mediaRefsOf(e: AnyEntry): MediaRef[] {
  const out: MediaRef[] = [];
  for (const k of ['image', 'cutscene', 'normalArt', 'altArt'] as const) {
    const v = (e as unknown as Record<string, MediaRef | null | undefined>)[k];
    if (v && typeof v === 'object' && typeof v.id === 'string') out.push(v);
  }
  return out;
}

class Repo {
  private idb!: Store;
  /** false when the browser refused storage and the game runs from memory only. */
  persistent = true;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private pendingWrites = 0;
  private statusListeners = new Set<(s: SaveState) => void>();
  storageKind: StorageKind = 'device';
  entries: EntryMaps = { classic: new Map(), tournament: new Map(), team: new Map(), collector: new Map() };
  players!: Record<PlayerId, PlayerProfile>;
  media = new Map<string, MediaMeta>();
  settings: Settings = deepClone(DEFAULT_SETTINGS);
  pendingTournament: TournamentState | null = null;
  /** Human-readable notes about records that could not be loaded (they are left untouched in storage). */
  loadWarnings: string[] = [];
  ready = false;

  async init(progress: (msg: string) => void = () => undefined): Promise<void> {
    setBlobLoader((key) => this.getBlob(key));
    const inViewer = typeof (window as any).claude?.use === 'function';
    if (inViewer) {
      progress('Connecting to your saved game…');
      const cloud = await openCloud();
      if (cloud) {
        this.idb = cloud;
        this.storageKind = 'cloud';
        setDirectUrl((key) => cloud.urlFor(key));
        progress('Loading your saved game…');
        await this.load();
        if (this.isEmpty()) await this.copyFromDevice(progress);
        this.ready = true;
        return;
      }
    }
    let fallback = '';
    try {
      this.idb = await Idb.open();
    } catch (e) {
      fallback = (e as Error)?.message ?? String(e);
      this.idb = new MemoryStore();
      this.persistent = false;
      this.storageKind = 'memory';
    }
    await this.load();
    if (fallback) {
      this.loadWarnings.unshift(`Saving is not available in this browser (${fallback}) — the game works, but nothing you do now will be kept. Any data saved earlier has not been touched; reload to try again.`);
    } else if (inViewer) {
      this.loadWarnings.unshift('Your account storage could not be reached, so this visit saves only in this browser, which the Claude app may clear. Reload to reconnect, and export a backup before closing.');
    }
    this.ready = true;
  }

  private isEmpty(): boolean {
    if (this.media.size) return false;
    for (const m of MODES) if (this.entries[m].size) return false;
    return PLAYERS.every((id) => { const p = this.players[id]; return p.fc === 0 && !p.packs.length && !p.ledger.length && !Object.keys(p.collection).length; });
  }

  /** First visit with account storage: bring over anything this browser still holds from before. Local data is kept. */
  private async copyFromDevice(progress: (msg: string) => void): Promise<void> {
    let local: Idb;
    try { local = await Idb.open(); } catch { return; }
    try {
      const ops: Op[] = [];
      let found = 0;
      for (const s of [...MODES, 'media'] as const) for (const v of await local.getAll(s)) { ops.push({ store: s, type: 'put', value: v }); found++; }
      const players = await local.getAll<PlayerProfile>('players');
      const progressed = players.some((p) => p && (p.fc > 0 || p.packs?.length || p.ledger?.length));
      if (!found && !progressed) return;
      for (const p of players) ops.push({ store: 'players', type: 'put', value: p });
      for (const k of ['settings', 'pendingTournament']) { const v = await local.get('kv', k); if (v) ops.push({ store: 'kv', type: 'put', key: k, value: v }); }
      for (const k of await local.getAllKeys('blobs')) { const b = toBlob(await local.get('blobs', k)); if (b) ops.push({ store: 'blobs', type: 'put', key: String(k), value: b }); }
      progress('Moving your game from this device to your account…');
      await this.idb.run(ops);
      await this.load();
      this.loadWarnings.push('Your game was moved from this browser to your account storage. It is now kept when you close the app.');
    } catch (e) {
      this.loadWarnings.push(`Data found in this browser could not be moved to your account (${(e as Error)?.message ?? e}). It is still in this browser; reload to try again.`);
    }
  }

  onSaveState(fn: (s: SaveState) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setSave(s: SaveState): void {
    for (const l of this.statusListeners) { try { l(s); } catch { /* ignore */ } }
  }

  async storageUsage(): Promise<{ bytes: number; maxBytes: number } | null> {
    return (await this.idb.usage?.()) ?? null;
  }

  private async load(): Promise<void> {
    this.loadWarnings = [];
    const entries: EntryMaps = { classic: new Map(), tournament: new Map(), team: new Map(), collector: new Map() };
    for (const m of MODES) {
      const rows = await this.idb.getAll<AnyEntry>(m);
      for (const r of rows) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string') {
          this.loadWarnings.push(`A damaged ${MODE_LABEL[m]} record was skipped (left in storage).`);
          continue;
        }
        (entries[m] as Map<string, AnyEntry>).set(r.id, r);
      }
    }
    this.entries = entries;
    const media = new Map<string, MediaMeta>();
    if (this.idb.kind === 'cloud') await this.idb.getAllKeys('blobs'); // index of stored files, so videos stream directly
    for (const m of await this.idb.getAll<MediaMeta>('media')) if (m && typeof m.id === 'string') media.set(m.id, m);
    this.media = media;
    const rawPlayers = await this.idb.getAll<PlayerProfile>('players');
    const players = {} as Record<PlayerId, PlayerProfile>;
    const toCreate: PlayerProfile[] = [];
    for (const id of PLAYERS) {
      const raw = rawPlayers.find((p) => p && p.id === id);
      if (raw) {
        try {
          players[id] = normalizePlayer(raw);
        } catch {
          this.loadWarnings.push(`${id.toUpperCase()} profile could not be read. It was not modified; restore a backup to recover it.`);
          players[id] = newPlayer(id, id === 'p1' ? 'Player 1' : 'Player 2');
        }
      } else {
        players[id] = newPlayer(id, id === 'p1' ? 'Player 1' : 'Player 2');
        toCreate.push(players[id]);
      }
    }
    this.players = players;
    if (toCreate.length) await this.idb.run(toCreate.map((p) => ({ store: 'players', type: 'put', value: p })));
    const s = await this.idb.get<Settings>('kv', 'settings');
    this.settings = { ...deepClone(DEFAULT_SETTINGS), ...(s ?? {}), portraits: { ...DEFAULT_SETTINGS.portraits, ...(s?.portraits ?? {}) } };
    this.pendingTournament = (await this.idb.get<TournamentState>('kv', 'pendingTournament')) ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of [...this.listeners]) {
      try { l(); } catch (e) { console.error(e); }
    }
  }

  /** Serialize writes so no change is ever based on stale state. */
  private serial<T>(fn: () => Promise<T>, silent = false): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    if (!silent) {
      this.pendingWrites++;
      this.setSave('saving');
      p.then(() => { if (--this.pendingWrites === 0) this.setSave('saved'); }, () => { this.pendingWrites--; this.setSave('error'); });
    }
    return p;
  }

  // ------------------------------------------------------------ media

  mediaMeta(id: string | undefined | null): MediaMeta | undefined {
    return id ? this.media.get(id) : undefined;
  }

  readonly mediaLookup = (id: string): { kind: 'image' | 'video' } | undefined => this.media.get(id);

  async getBlob(key: string): Promise<Blob | null> {
    return toBlob(await this.idb.get('blobs', key));
  }

  addMedia(imp: Imported): Promise<MediaMeta> {
    return this.serial(async () => {
      const ops = (blobValue: (b: Blob) => unknown): Op[] => {
        const o: Op[] = [
          { store: 'media', type: 'put', value: imp.meta },
          { store: 'blobs', type: 'put', key: imp.meta.id, value: blobValue(imp.blob) },
        ];
        if (imp.thumb) o.push({ store: 'blobs', type: 'put', key: thumbKey(imp.meta.id), value: blobValue(imp.thumb) });
        return o;
      };
      try {
        await this.idb.run(ops((b) => b));
      } catch (e) {
        const name = (e as StorageError).cause && ((e as StorageError).cause as DOMException).name;
        if (name !== 'DataCloneError') throw e;
        // Older WebKit: store raw bytes instead of Blob objects.
        const bufs = new Map<Blob, ArrayBuffer>();
        for (const b of [imp.blob, imp.thumb].filter(Boolean) as Blob[]) bufs.set(b, await b.arrayBuffer());
        await this.idb.run(ops((b) => ({ buf: bufs.get(b)!, type: b.type })));
      }
      this.media.set(imp.meta.id, imp.meta);
      this.emit();
      return imp.meta;
    });
  }

  /** Where a media file is used (entries in any mode and home portraits). */
  mediaUsage(id: string): string[] {
    const out: string[] = [];
    for (const m of MODES) {
      for (const e of this.entries[m].values() as Iterable<AnyEntry>) {
        if (mediaRefsOf(e).some((r) => r.id === id)) out.push(`${MODE_LABEL[m]}: ${e.name || 'Untitled'}`);
      }
    }
    if (this.settings.portraits.left?.id === id) out.push('Home portrait (left)');
    if (this.settings.portraits.right?.id === id) out.push('Home portrait (right)');
    return out;
  }

  deleteMedia(ids: string[]): Promise<void> {
    return this.serial(async () => {
      const del = ids.filter((id) => this.media.has(id) && this.mediaUsage(id).length === 0);
      const ops: Op[] = [];
      for (const id of del) {
        ops.push({ store: 'media', type: 'delete', key: id }, { store: 'blobs', type: 'delete', key: id }, { store: 'blobs', type: 'delete', key: thumbKey(id) });
      }
      await this.idb.run(ops);
      for (const id of del) {
        this.media.delete(id);
        forgetMediaUrls(id);
      }
      this.emit();
    });
  }

  // ------------------------------------------------------------ entries

  list<M extends Mode>(mode: M): EntryByMode[M][] {
    return [...this.entries[mode].values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get<M extends Mode>(mode: M, id: string): EntryByMode[M] | undefined {
    return this.entries[mode].get(id);
  }

  issues(mode: Mode, e: AnyEntry): Issue[] {
    return validate(mode, e, this.mediaLookup);
  }

  valid<M extends Mode>(mode: M): EntryByMode[M][] {
    return this.list(mode).filter((e) => this.issues(mode, e).length === 0);
  }

  readiness(mode: Mode): Readiness {
    const total = this.entries[mode].size;
    const valid = this.valid(mode).length;
    const needed = MIN_ENTRIES[mode];
    if (mode === 'collector') {
      const miss = missingRarities(this.valid('collector'));
      const ok = miss.length === 0;
      return {
        mode, valid, total, needed: 7, ok,
        message: ok ? `${valid} cards ready` : `Add at least one valid card for: ${miss.map((r) => r[0]!.toUpperCase() + r.slice(1)).join(', ')}`,
      };
    }
    const ok = valid >= needed;
    return { mode, valid, total, needed, ok, message: ok ? `${valid} characters ready` : `Needs ${needed} valid characters (${valid} ready)` };
  }

  saveEntry<M extends Mode>(mode: M, entry: EntryByMode[M]): Promise<void> {
    return this.serial(async () => {
      const e = { ...entry, name: entry.name.trim(), updatedAt: Date.now() };
      await this.idb.run([{ store: mode, type: 'put', value: e }]);
      (this.entries[mode] as Map<string, AnyEntry>).set(e.id, e);
      this.emit();
    });
  }

  saveEntries<M extends Mode>(mode: M, list: EntryByMode[M][]): Promise<void> {
    return this.serial(async () => {
      await this.idb.run(list.map((value) => ({ store: mode, type: 'put', value })));
      for (const e of list) (this.entries[mode] as Map<string, AnyEntry>).set(e.id, e);
      this.emit();
    });
  }

  deleteEntry(mode: Mode, id: string): Promise<void> {
    return this.serial(async () => {
      await this.idb.run([{ store: mode, type: 'delete', key: id }]);
      this.entries[mode].delete(id);
      this.emit();
    });
  }

  /** Every collectible edition: Normal Art for each valid card, plus Alternative Art where an image exists. */
  collectibles(): Collectible[] {
    const out: Collectible[] = [];
    for (const e of this.valid('collector')) {
      out.push({ entry: e, edition: 'normal', key: cardKey(e.id, 'normal') });
      if (e.altArt && e.rarity && ALT_RARITIES.includes(e.rarity)) out.push({ entry: e, edition: 'alt', key: cardKey(e.id, 'alt') });
    }
    return out;
  }

  contentStatus(): ContentStatus {
    return {
      classic: this.readiness('classic').ok,
      tournament: this.readiness('tournament').ok,
      team: this.readiness('team').ok,
      collector: this.readiness('collector').ok,
      collectibleKeys: this.collectibles().map((c) => c.key),
    };
  }

  // ------------------------------------------------------------ players

  player(id: PlayerId): PlayerProfile {
    return this.players[id];
  }

  /**
   * Change one or both profiles atomically. `fn` receives clones (with daily/weekly periods already rolled over);
   * if it throws, nothing is written.
   */
  mutate<R>(ids: PlayerId[], fn: (ps: Record<PlayerId, PlayerProfile>) => R, extra: Op[] = [], after?: () => void): Promise<R> {
    return this.serial(async () => {
      const day = dayKey(), week = weekKey();
      const content = this.contentStatus();
      const clones = { ...this.players };
      for (const id of ids) {
        const c = deepClone(this.players[id]);
        refreshPeriodic(c, day, week, content, cryptoRng);
        clones[id] = c;
      }
      const result = fn(clones);
      await this.idb.run([...ids.map((id): Op => ({ store: 'players', type: 'put', value: clones[id] })), ...extra]);
      for (const id of ids) this.players[id] = clones[id];
      after?.();
      this.emit();
      return result;
    });
  }

  /** Roll over daily/weekly periods and keep missions valid; writes only when something changed. */
  refreshPeriodic(): Promise<void> {
    return this.serial(async () => {
      const day = dayKey(), week = weekKey();
      const content = this.contentStatus();
      const changed: PlayerProfile[] = [];
      for (const id of PLAYERS) {
        const c = deepClone(this.players[id]);
        if (refreshPeriodic(c, day, week, content, cryptoRng)) changed.push(c);
      }
      if (!changed.length) return;
      await this.idb.run(changed.map((value) => ({ store: 'players', type: 'put', value })));
      for (const c of changed) this.players[c.id] = c;
      this.emit();
    }, true);
  }

  // ------------------------------------------------------------ settings & tournaments

  updateSettings(patch: Partial<Settings>): Promise<void> {
    return this.serial(async () => {
      const next = { ...this.settings, ...patch };
      await this.idb.run([{ store: 'kv', type: 'put', key: 'settings', value: next }]);
      this.settings = next;
      this.emit();
    });
  }

  setPendingTournamentOp(t: TournamentState | null): Op {
    return t ? { store: 'kv', type: 'put', key: 'pendingTournament', value: t } : { store: 'kv', type: 'delete', key: 'pendingTournament' };
  }

  savePendingTournament(t: TournamentState | null): Promise<void> {
    return this.serial(async () => {
      await this.idb.run([this.setPendingTournamentOp(t)]);
      this.pendingTournament = t;
      this.emit();
    });
  }

  /** For mutate(): keep the in-memory pending tournament in sync after an atomic write. */
  setPendingTournamentLocal(t: TournamentState | null): void {
    this.pendingTournament = t;
  }

  // ------------------------------------------------------------ backup

  snapshot(): RawData {
    return deepClone({
      entries: { classic: this.list('classic'), tournament: this.list('tournament'), team: this.list('team'), collector: this.list('collector') },
      players: PLAYERS.map((id) => this.players[id]),
      settings: this.settings,
      pendingTournament: this.pendingTournament,
      media: [...this.media.values()],
    });
  }

  async blobKeys(): Promise<string[]> {
    return (await this.idb.getAllKeys('blobs')).map(String);
  }

  /** Replace everything in one transaction (rolled back entirely on failure), then reload. */
  replaceAll(data: RawData, blobs: Map<string, Blob>): Promise<void> {
    return this.serial(async () => {
      const ops: Op[] = [];
      for (const s of ['classic', 'tournament', 'team', 'collector', 'players', 'media', 'blobs', 'kv'] as const) ops.push({ store: s, type: 'clear' });
      for (const m of MODES) for (const e of data.entries[m]) ops.push({ store: m, type: 'put', value: e });
      for (const p of data.players) ops.push({ store: 'players', type: 'put', value: p });
      for (const m of data.media) ops.push({ store: 'media', type: 'put', value: m });
      for (const [k, b] of blobs) ops.push({ store: 'blobs', type: 'put', key: k, value: b });
      ops.push({ store: 'kv', type: 'put', key: 'settings', value: data.settings });
      if (data.pendingTournament) ops.push({ store: 'kv', type: 'put', key: 'pendingTournament', value: data.pendingTournament });
      for (const id of this.media.keys()) forgetMediaUrls(id);
      await this.idb.run(ops);
      await this.load();
      this.emit();
    });
  }
}

export const repo = new Repo();
export { StorageError };
