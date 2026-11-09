/**
 * Account storage for the Claude viewer: the artifact's own document store (`db`) for game data and its asset store
 * (`assets`) for images and videos. Unlike browser storage inside the app, this survives closing the app, reloads,
 * republishes and other devices.
 *
 * Layout (private to the signed-in player): data/users/<uid>/fcg/<store>/<docId>
 *  - regular value: { _k, j: JSON }                   (bodies stay far below the 256 KiB document limit)
 *  - large value:   { _k, n, ver } + chunks/<store>.<docId>.<ver>.<i> = { s }  (written before the head, so the head
 *                   always points at a complete set)
 *  - media file:    blobs/<docId> = { _k, assets: [ids], type, size, packed }
 *                   ≤ 20 MiB in an accepted type → one asset served directly at /_blob/<id> (videos stream);
 *                   otherwise 19 MiB parts, each prefixed with one 0x00 byte, joined again when read.
 * Every read must be confirmed by the server (never a cached copy), so a slow connection can never make the game
 * believe the saved data is empty and overwrite it.
 */
import type { Op, Store, StoreName } from './idb';
import { StorageError } from './idb';

/* Minimal shapes of the platform namespaces this module uses. */
interface Meta { fromCache: boolean }
interface DocSnap { id: string; exists: boolean; data(): Record<string, unknown> | undefined; metadata: Meta }
interface QuerySnap { docs: DocSnap[]; metadata: Meta }
interface Query { where(f: string, op: string, v: unknown): Query; orderBy(f: string, d?: 'asc' | 'desc'): Query; limit(n: number): Query; get(): Promise<QuerySnap> }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; collection(p: string): CollRef }
interface CollRef extends Query { doc(id: string): DocRef }
export interface DbApi { doc(path: string): DocRef; collection(path: string): CollRef }
export interface AssetsApi {
  upload(b: Blob, o?: { type?: string }): Promise<{ id: string; url: string; sizeBytes: number }>;
  delete(ref: string): Promise<{ deleted: boolean }>;
  list(): Promise<{ usage: { bytes: number; maxBytes: number; files: number; maxFiles: number } }>;
}

const DIRECT_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']);
const ASSET_MAX = 20 * 1024 * 1024;
const PART = 19 * 1024 * 1024;
const CHUNK_CHARS = 50_000;
const PAGE = 500;

interface BlobMap { assets: string[]; type: string; size: number; packed: boolean }

const encKey = (k: string): string => k.replace(/#/g, '~');
const decKey = (k: string): string => k.replace(/~/g, '#');

function friendly(e: unknown): StorageError {
  const code = (e as { code?: string })?.code ?? '';
  const msg: Record<string, string> = {
    quota_exceeded: 'Your game storage is full. Delete unused media or old entries, then try again.',
    quota_or_state: 'The media storage for this game is full. Delete unused media in Database → Media, then try again.',
    resource_exhausted: 'Too many saves in a short time. Wait a few seconds and try again.',
    rate_limited: 'Too many uploads in a short time. Wait a few seconds and try again.',
    unavailable: 'Your saved game could not be reached. Check the connection and try again.',
    store_unavailable: 'The media storage could not be reached. Check the connection and try again.',
    revoked: 'Access to the saved game was withdrawn. Reload the page.',
    not_granted: 'This page is not allowed to save. Reload it from your Claude account.',
    upstream_auth: 'Your session expired. Reload the page or sign in again.',
  };
  return new StorageError(msg[code] ?? `Saving failed (${code || (e as Error)?.message || 'unknown error'})`, e);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function confirmed<T extends { metadata: Meta }>(read: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < 6; i++) {
    try {
      const s = await read();
      if (!s.metadata?.fromCache) return s;
    } catch (e) {
      last = e;
      const code = (e as { code?: string })?.code;
      if (code !== 'unavailable') throw friendly(e);
    }
    await sleep(600 + i * 700);
  }
  throw last ? friendly(last) : new StorageError('Your saved game could not be confirmed by the server yet. Check the connection and reload.');
}

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'unavailable' || code === 'store_unavailable') {
      await sleep(400 + Math.random() * 600);
      try { return await fn(); } catch (e2) { throw friendly(e2); }
    }
    throw friendly(e);
  }
}

export class CloudStore implements Store {
  readonly kind = 'cloud' as const;
  private root: DocRef;
  private maps = new Map<string, BlobMap>();
  private chunkSets = new Map<string, { ver: string; n: number }>();
  constructor(private db: DbApi, private assets: AssetsApi | null, uid: string, private fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.root = db.doc(`data/users/${uid}/fcg`);
  }

  private coll(store: StoreName | 'chunks'): CollRef {
    return this.root.collection(store);
  }

  private async readValue(store: StoreName, body: Record<string, unknown>, key: string): Promise<unknown> {
    if (typeof body.j === 'string') return JSON.parse(body.j);
    if (typeof body.n === 'number' && typeof body.ver === 'string') {
      let s = '';
      for (let i = 0; i < body.n; i++) {
        const c = await confirmed(() => this.coll('chunks').doc(`${store}.${encKey(key)}.${body.ver}.${i}`).get());
        const part = c.exists ? c.data()?.s : undefined;
        if (typeof part !== 'string') throw new StorageError(`Part of a saved record is missing (${store}/${key}).`);
        s += part;
      }
      this.chunkSets.set(`${store}|${key}`, { ver: body.ver, n: body.n });
      return JSON.parse(s);
    }
    return undefined;
  }

  private async listAll(store: StoreName): Promise<DocSnap[]> {
    const out: DocSnap[] = [];
    let last: string | null = null;
    for (;;) {
      const c = this.coll(store);
      const q: Query = last === null ? c.orderBy('_k').limit(PAGE) : c.where('_k', '>', last).orderBy('_k').limit(PAGE);
      const snap = await confirmed(() => q.get());
      for (const d of snap.docs) if (d.exists) out.push(d);
      if (snap.docs.length < PAGE) return out;
      last = String(snap.docs[snap.docs.length - 1]!.data()?._k ?? '');
    }
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const docs = await this.listAll(store);
    const out: T[] = [];
    for (const d of docs) {
      const body = d.data()!;
      const key = String(body._k ?? decKey(d.id));
      if (store === 'blobs') { this.maps.set(key, body as unknown as BlobMap); continue; }
      const v = await this.readValue(store, body, key);
      if (v !== undefined) out.push(v as T);
    }
    return out;
  }

  async getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
    const docs = await this.listAll(store);
    return docs.map((d) => {
      const body = d.data()!;
      const key = String(body._k ?? decKey(d.id));
      if (store === 'blobs') this.maps.set(key, body as unknown as BlobMap);
      return key;
    });
  }

  private async blobMap(key: string): Promise<BlobMap | undefined> {
    let m = this.maps.get(key);
    if (!m) {
      const s = await confirmed(() => this.coll('blobs').doc(encKey(key)).get());
      if (!s.exists) return undefined;
      m = s.data() as unknown as BlobMap;
      this.maps.set(key, m);
    }
    return m;
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const k = String(key);
    if (store === 'blobs') {
      const m = await this.blobMap(k);
      if (!m) return undefined;
      const parts: Blob[] = [];
      for (const id of m.assets) {
        const r = await this.fetchFn(`/_blob/${id}`);
        if (!r.ok) return undefined;
        const b = await r.blob();
        parts.push(m.packed ? b.slice(1) : b);
      }
      return new Blob(parts, { type: m.type }) as unknown as T;
    }
    const s = await confirmed(() => this.coll(store).doc(encKey(k)).get());
    if (!s.exists) return undefined;
    return (await this.readValue(store, s.data()!, k)) as T | undefined;
  }

  /** Direct, streamable URL for a media file stored as a single asset (null when it must be reassembled). */
  urlFor(key: string): string | null {
    const m = this.maps.get(key);
    return m && !m.packed && m.assets.length === 1 ? `/_blob/${m.assets[0]}` : null;
  }

  async usage(): Promise<{ bytes: number; maxBytes: number } | null> {
    if (!this.assets) return null;
    try { return (await this.assets.list()).usage; } catch { return null; }
  }

  private async putBlob(key: string, blob: Blob): Promise<void> {
    if (!this.assets) throw new StorageError('Adding images and videos needs edit access to this game. Ask its owner to give you Editor access.');
    const type = blob.type || 'application/octet-stream';
    const direct = DIRECT_TYPES.has(type) && blob.size <= ASSET_MAX && blob.size > 0;
    const uploadType = type.startsWith('video/') ? 'video/mp4' : type === 'image/svg+xml' ? 'image/png' : type.startsWith('image/') ? (DIRECT_TYPES.has(type) ? type : 'image/png') : 'video/mp4';
    const ids: string[] = [];
    try {
      if (direct) ids.push((await retryOnce(() => this.assets!.upload(blob, { type }))).id);
      else {
        const zero = new Uint8Array([0]);
        for (let off = 0; off < Math.max(1, blob.size); off += PART) {
          const part = new Blob([zero, blob.slice(off, off + PART)], { type: uploadType });
          ids.push((await retryOnce(() => this.assets!.upload(part, { type: uploadType }))).id);
        }
      }
    } catch (e) {
      for (const id of ids) void this.assets.delete(id).catch(() => undefined);
      throw e instanceof StorageError ? e : friendly(e);
    }
    const map: BlobMap = { assets: ids, type, size: blob.size, packed: !direct };
    const old = this.maps.get(key);
    await retryOnce(() => this.coll('blobs').doc(encKey(key)).set({ _k: key, ...map }));
    this.maps.set(key, map);
    if (old) for (const id of old.assets) if (!ids.includes(id)) void this.assets.delete(id).catch(() => undefined);
  }

  private async putValue(store: StoreName, key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    const ref = this.coll(store).doc(encKey(key));
    const prev = this.chunkSets.get(`${store}|${key}`);
    const single = JSON.stringify({ _k: key, j: json });
    if (new TextEncoder().encode(single).length <= 240_000) {
      await retryOnce(() => ref.set({ _k: key, j: json }));
      this.chunkSets.delete(`${store}|${key}`);
    } else {
      const ver = Date.now().toString(36);
      const n = Math.ceil(json.length / CHUNK_CHARS);
      for (let i = 0; i < n; i++) {
        const s = json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS);
        await retryOnce(() => this.coll('chunks').doc(`${store}.${encKey(key)}.${ver}.${i}`).set({ s }));
      }
      await retryOnce(() => ref.set({ _k: key, n, ver }));
      this.chunkSets.set(`${store}|${key}`, { ver, n });
    }
    if (prev) await this.dropChunks(store, key, prev);
  }

  private async dropChunks(store: StoreName, key: string, set: { ver: string; n: number }): Promise<void> {
    for (let i = 0; i < set.n; i++) await this.coll('chunks').doc(`${store}.${encKey(key)}.${set.ver}.${i}`).delete().catch(() => undefined);
  }

  private async deleteKey(store: StoreName, key: string): Promise<void> {
    if (store === 'blobs') {
      const m = await this.blobMap(key).catch(() => undefined);
      await retryOnce(() => this.coll('blobs').doc(encKey(key)).delete());
      this.maps.delete(key);
      if (m && this.assets) for (const id of m.assets) await this.assets.delete(id).catch(() => undefined);
      return;
    }
    await retryOnce(() => this.coll(store).doc(encKey(key)).delete());
    const prev = this.chunkSets.get(`${store}|${key}`);
    if (prev) { await this.dropChunks(store, key, prev); this.chunkSets.delete(`${store}|${key}`); }
  }

  /** Clears first, then media files, then records, then deletions — so a record never points at a file not yet stored. */
  async run(ops: Op[]): Promise<void> {
    const rank = (o: Op): number => (o.type === 'clear' ? 0 : o.type === 'put' && o.store === 'blobs' ? 1 : o.type === 'put' ? 2 : 3);
    for (const o of [...ops].sort((a, b) => rank(a) - rank(b))) {
      if (o.type === 'clear') {
        for (const key of await this.getAllKeys(o.store)) await this.deleteKey(o.store, String(key));
      } else if (o.type === 'delete') {
        await this.deleteKey(o.store, String(o.key));
      } else if (o.store === 'blobs') {
        if (!(o.value instanceof Blob)) throw new StorageError('Invalid media file');
        await this.putBlob(String(o.key), o.value);
      } else {
        const key = String(o.key ?? (o.value as { id?: string })?.id ?? '');
        if (!key) throw new StorageError('Invalid record');
        await this.putValue(o.store, key, o.value);
      }
    }
  }
}
