/**
 * Minimal promise wrapper around IndexedDB. Every multi-record change runs in ONE transaction,
 * so it is either fully stored or (on any failure) rolled back by the browser, leaving existing data intact.
 */
export const DB_NAME = 'fictional-card-game';
export const DB_VERSION = 1;
export const ENTRY_STORES = ['classic', 'tournament', 'team', 'collector'] as const;
export const STORES = [...ENTRY_STORES, 'players', 'media', 'blobs', 'kv'] as const;
export type StoreName = (typeof STORES)[number];

export type Op =
  | { store: StoreName; type: 'put'; value: unknown; key?: IDBValidKey }
  | { store: StoreName; type: 'delete'; key: IDBValidKey }
  | { store: StoreName; type: 'clear' };

export class StorageError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError') return 'The device storage is full (quota exceeded). Free some space or remove large videos, then try again.';
  if (name === 'InvalidStateError') return 'The browser database is not available (private browsing or blocked storage).';
  if (name === 'VersionError') return 'This save was created by a newer version of the game.';
  return (e as Error)?.message || String(e);
}

export interface Store {
  getAll<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  getAllKeys(store: StoreName): Promise<IDBValidKey[]>;
  run(ops: Op[]): Promise<void>;
}

/** Used only when the browser refuses IndexedDB (private mode, blocked storage): the game runs but nothing is kept. */
export class MemoryStore implements Store {
  private data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  private keyOf(store: StoreName, value: unknown, key?: IDBValidKey): string {
    return String(key ?? (store === 'blobs' || store === 'kv' ? '' : (value as { id: string }).id));
  }
  async getAll<T>(store: StoreName): Promise<T[]> { return [...this.data.get(store)!.values()] as T[]; }
  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> { return this.data.get(store)!.get(String(key)) as T | undefined; }
  async getAllKeys(store: StoreName): Promise<IDBValidKey[]> { return [...this.data.get(store)!.keys()]; }
  async run(ops: Op[]): Promise<void> {
    for (const o of ops) {
      const m = this.data.get(o.store)!;
      if (o.type === 'put') m.set(this.keyOf(o.store, o.value, o.key), o.value);
      else if (o.type === 'delete') m.delete(String(o.key));
      else m.clear();
    }
  }
}

export class Idb implements Store {
  private constructor(private db: IDBDatabase) {
    db.onversionchange = () => db.close();
  }

  static open(): Promise<Idb> {
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') {
        rej(new StorageError('IndexedDB is not available in this browser, so the game cannot save. Try another browser or disable private mode.'));
        return;
      }
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of ENTRY_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      r.onsuccess = () => res(new Idb(r.result));
      r.onerror = () => rej(new StorageError(`Could not open the game database: ${describeError(r.error)}`, r.error));
      r.onblocked = () => rej(new StorageError('The game database is open in another tab with an older version. Close other tabs and reload.'));
    });
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return req(this.db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return req(this.db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
  }

  async getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
    return req(this.db.transaction(store, 'readonly').objectStore(store).getAllKeys());
  }

  /** Runs every op in a single readwrite transaction; resolves only once the transaction has committed. */
  run(ops: Op[]): Promise<void> {
    if (!ops.length) return Promise.resolve();
    const stores = [...new Set(ops.map((o) => o.store))];
    return new Promise((res, rej) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction(stores, 'readwrite');
      } catch (e) {
        rej(new StorageError(describeError(e), e));
        return;
      }
      tx.oncomplete = () => res();
      tx.onabort = () => rej(new StorageError(describeError(tx.error), tx.error));
      tx.onerror = (ev) => {
        ev.preventDefault();
      };
      try {
        for (const o of ops) {
          const s = tx.objectStore(o.store);
          if (o.type === 'put') o.key === undefined ? s.put(o.value) : s.put(o.value, o.key);
          else if (o.type === 'delete') s.delete(o.key);
          else s.clear();
        }
      } catch (e) {
        try { tx.abort(); } catch { /* already aborted */ }
        rej(new StorageError(describeError(e), e));
      }
    });
  }
}

/** Some older WebKit builds cannot store Blobs; fall back to ArrayBuffer records. */
export interface StoredBuffer {
  buf: ArrayBuffer;
  type: string;
}

export function toBlob(v: unknown): Blob | null {
  if (v instanceof Blob) return v;
  if (v && typeof v === 'object' && (v as StoredBuffer).buf instanceof ArrayBuffer) {
    return new Blob([(v as StoredBuffer).buf], { type: (v as StoredBuffer).type });
  }
  return null;
}
