/** In-memory stand-in for the viewer's `db` and `assets` capabilities, enforcing their documented limits. */
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain', 'application/json']);

export function createMock(opts: { cachedReads?: number } = {}) {
  const docs = new Map<string, Record<string, unknown>>();
  const blobs = new Map<string, Blob>();
  let cached = opts.cachedReads ?? 0;
  let nextId = 1;
  const stats = { writes: 0, uploads: 0, maxDocBytes: 0 };
  const meta = () => ({ fromCache: cached-- > 0, hasPendingWrites: false });
  const snap = (path: string) => {
    const d = docs.get(path);
    return { id: path.split('/').pop()!, exists: !!d, data: () => (d ? structuredClone(d) : undefined), metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const docRef = (path: string): any => {
    if (path.split('/').length % 2) throw new TypeError('document path needs an even number of segments');
    for (const seg of path.split('/')) if (!/^[A-Za-z0-9_\-.~:@+]+$/.test(seg) || seg === '.' || seg === '..') throw new TypeError(`bad segment ${seg}`);
    return {
      path,
      async get() { const s = snap(path); const m = meta(); return m.fromCache ? { ...s, exists: false, data: () => undefined, metadata: m } : s; },
      async set(d: Record<string, unknown>) {
        const n = new TextEncoder().encode(JSON.stringify(d)).length;
        stats.maxDocBytes = Math.max(stats.maxDocBytes, n);
        if (n > 256 * 1024) throw { code: 'invalid_argument', message: 'document over 256 KiB' };
        stats.writes++;
        docs.set(path, structuredClone(d));
      },
      async delete() { docs.delete(path); },
      collection: (p: string) => collRef(`${path}/${p}`),
    };
  };
  const collRef = (path: string): any => {
    const make = (filters: [string, string, unknown][], order: string | null, lim: number) => ({
      where: (f: string, op: string, v: unknown) => make([...filters, [f, op, v]], order, lim),
      orderBy: (f: string) => make(filters, f, lim),
      limit: (n: number) => { if (n < 1 || n > 1000) throw { code: 'invalid_argument' }; return make(filters, order, n); },
      async get() {
        const m = meta();
        if (m.fromCache) return { docs: [], size: 0, empty: true, metadata: m };
        let list = [...docs.entries()].filter(([p]) => p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1);
        for (const [f, op, v] of filters) list = list.filter(([, d]) => (op === '>' ? String(d[f]) > String(v) : d[f] === v));
        if (order) list.sort(([, a], [, b]) => (String(a[order]) < String(b[order]) ? -1 : 1));
        else list.sort(([a], [b]) => (a < b ? -1 : 1));
        const out = list.slice(0, lim).map(([p]) => snap(p));
        return { docs: out, size: out.length, empty: !out.length, metadata: m };
      },
      doc: (id: string) => docRef(`${path}/${id}`),
    });
    return make([], null, 1000);
  };
  const db = { doc: docRef, collection: collRef };
  const assets = {
    async upload(b: Blob, o: { type?: string } = {}) {
      const type = o.type ?? b.type;
      if (!ACCEPTED.has(type)) throw { code: 'unsupported_type' };
      if (b.size > 20 * 1024 * 1024) throw { code: 'too_large' };
      if (!b.size) throw { code: 'invalid_request' };
      const head = new TextDecoder().decode(new Uint8Array(await b.slice(0, 16).arrayBuffer())).trimStart();
      if (type !== 'image/svg+xml' && !type.startsWith('text/') && type !== 'application/json' && head.startsWith('<')) throw { code: 'unsupported_type' };
      const id = String(nextId++).padStart(32, '0');
      blobs.set(id, new Blob([await b.arrayBuffer()], { type }));
      stats.uploads++;
      return { id, url: `/_blob/${id}`, sizeBytes: b.size, contentType: type };
    },
    async delete(ref: string) { return { deleted: blobs.delete(ref) }; },
    async list() { return { assets: [], usage: { files: blobs.size, bytes: [...blobs.values()].reduce((s, b) => s + b.size, 0), maxFiles: 10000, maxBytes: 5e9 } }; },
  };
  const fetchFn = (async (url: string) => {
    const id = String(url).split('/').pop()!;
    const b = blobs.get(id);
    return { ok: !!b, blob: async () => b! } as Response;
  }) as unknown as typeof fetch;
  return { db, assets, fetchFn, docs, blobs, stats, setCached: (n: number) => { cached = n; } };
}
