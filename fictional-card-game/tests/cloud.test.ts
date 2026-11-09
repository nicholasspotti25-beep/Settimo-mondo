import { describe, expect, it } from 'vitest';
import { CloudStore } from '../src/store/cloud';
import { createMock } from './cloudmock';
import { newPlayer } from '../src/engines/economy';

const store = (m: ReturnType<typeof createMock>) => new CloudStore(m.db as any, m.assets as any, 'user42', m.fetchFn);

describe('account storage', () => {
  it('round-trips records and lists more than one page', async () => {
    const m = createMock();
    const s = store(m);
    const ops = Array.from({ length: 1234 }, (_, i) => ({ store: 'classic' as const, type: 'put' as const, value: { id: `cl_${String(i).padStart(5, '0')}`, name: `C${i}` } }));
    await s.run(ops);
    const all = await store(m).getAll<{ id: string }>('classic');
    expect(all.length).toBe(1234);
    expect(new Set(all.map((x) => x.id)).size).toBe(1234);
    expect([...m.docs.keys()].every((p) => p.startsWith('data/users/user42/fcg/'))).toBe(true);
  });

  it('splits records larger than the 256 KiB document limit and reads them back exactly', async () => {
    const m = createMock();
    const s = store(m);
    const p = newPlayer('p1', 'Big "quoted" — ünïcødé');
    for (let i = 0; i < 6000; i++) p.collection[`co_${i}|normal`] = { qty: i % 5 + 1, firstAt: 1, lastAt: 2, obtained: 3 };
    await s.run([{ store: 'players', type: 'put', value: p }]);
    expect(m.stats.maxDocBytes).toBeLessThanOrEqual(256 * 1024);
    const back = await store(m).get<typeof p>('players', 'p1');
    expect(back).toEqual(p);
    // shrinking it removes the old parts
    const chunksBefore = [...m.docs.keys()].filter((k) => k.includes('/chunks/')).length;
    expect(chunksBefore).toBeGreaterThan(1);
    p.collection = {};
    await s.run([{ store: 'players', type: 'put', value: p }]);
    expect([...m.docs.keys()].filter((k) => k.includes('/chunks/')).length).toBe(0);
    expect(await store(m).get('players', 'p1')).toEqual(p);
  });

  it('stores small images as one streamable file', async () => {
    const m = createMock();
    const s = store(m);
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: 'image/png' });
    await s.run([{ store: 'blobs', type: 'put', key: 'img1', value: png }, { store: 'blobs', type: 'put', key: 'img1#thumb', value: png }]);
    expect(s.urlFor('img1')).toMatch(/^\/_blob\/\d{32}$/);
    const s2 = store(m);
    expect((await s2.getAllKeys('blobs')).sort()).toEqual(['img1', 'img1#thumb']);
    const back = await s2.get<Blob>('blobs', 'img1');
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(new Uint8Array(await png.arrayBuffer()));
    expect(back!.type).toBe('image/png');
  });

  it('stores videos over 20 MiB (and unsupported types) in parts and rebuilds them byte for byte', async () => {
    const m = createMock();
    const s = store(m);
    const big = new Uint8Array(45 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 4093) big[i] = (i * 7) & 0xff;
    big[0] = 0x3c; // a part may start with '<': the prefix byte keeps it from looking like markup
    big[19 * 1024 * 1024] = 0x3c;
    const video = new Blob([big], { type: 'video/mp4' });
    await s.run([{ store: 'blobs', type: 'put', key: 'vid1', value: video }]);
    expect(m.stats.uploads).toBe(3);
    expect(s.urlFor('vid1')).toBeNull();
    const back = await store(m).get<Blob>('blobs', 'vid1');
    expect(back!.size).toBe(big.length);
    const got = new Uint8Array(await back!.arrayBuffer());
    expect(got[0]).toBe(0x3c);
    expect(got[19 * 1024 * 1024]).toBe(0x3c);
    expect(got[4093 * 10]).toBe(big[4093 * 10]);
    const mov = new Blob([new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112])], { type: 'video/quicktime' });
    await s.run([{ store: 'blobs', type: 'put', key: 'mov1', value: mov }]);
    const mb = await store(m).get<Blob>('blobs', 'mov1');
    expect(mb!.type).toBe('video/quicktime');
    expect(new Uint8Array(await mb!.arrayBuffer())).toEqual(new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]));
    // deleting removes the uploaded files too
    await s.run([{ store: 'blobs', type: 'delete', key: 'vid1' }]);
    expect(m.blobs.size).toBe(1);
  });

  it('never treats an unconfirmed (cached) read as the saved data', async () => {
    const m = createMock();
    await store(m).run([{ store: 'players', type: 'put', value: newPlayer('p1', 'Saved') }]);
    m.setCached(3);
    const all = await store(m).getAll<{ name: string }>('players');
    expect(all.map((p) => p.name)).toEqual(['Saved']);
    m.setCached(100);
    await expect(store(m).getAll('players')).rejects.toThrow(/could not be confirmed|reached/);
  }, 30000);

  it('clear removes records and their files', async () => {
    const m = createMock();
    const s = store(m);
    await s.run([
      { store: 'kv', type: 'put', key: 'settings', value: { a: 1 } },
      { store: 'blobs', type: 'put', key: 'x', value: new Blob([new Uint8Array([1])], { type: 'image/png' }) },
    ]);
    await s.run([{ store: 'kv', type: 'clear' }, { store: 'blobs', type: 'clear' }]);
    expect(await store(m).getAll('kv')).toEqual([]);
    expect(m.blobs.size).toBe(0);
  });
});
