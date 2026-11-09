import { describe, expect, it } from 'vitest';
import { BackupError, buildBackup, parseBackup } from '../src/store/backup';
import { newPlayer } from '../src/engines/economy';
import { DEFAULT_SETTINGS } from '../src/model/types';
import type { RawData } from '../src/store/repo';

const data = (): RawData => ({
  entries: {
    classic: [{ id: 'c1', name: 'A', image: { id: 'm1' }, offense: 1, defense: 2, hax: 3, iq: 4, cutscene: { id: 'v1' }, createdAt: 0, updatedAt: 0 }],
    tournament: [], team: [], collector: [],
  },
  players: [newPlayer('p1', 'One'), newPlayer('p2', 'Two')],
  settings: { ...DEFAULT_SETTINGS },
  pendingTournament: null,
  media: [
    { id: 'm1', kind: 'image', mime: 'image/png', name: 'a.png', size: 3, width: 1, height: 1, duration: 0, createdAt: 0, hasThumb: false },
    { id: 'v1', kind: 'video', mime: 'video/mp4', name: 'v.mp4', size: 5, width: 1, height: 1, duration: 1, createdAt: 0, hasThumb: false },
  ],
});

describe('backup', () => {
  it('round-trips databases, players and media bytes', async () => {
    const blobs: Record<string, Blob> = { m1: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), v1: new Blob([new Uint8Array([9, 8, 7, 6, 5])], { type: 'video/mp4' }) };
    const file = await buildBackup(data(), ['m1', 'v1'], async (k) => blobs[k] ?? null);
    const parsed = await parseBackup(file);
    expect(parsed.data.entries.classic[0]!.name).toBe('A');
    expect(parsed.summary.players.map((p) => p.name)).toEqual(['One', 'Two']);
    expect(new Uint8Array(await parsed.blobs.get('v1')!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
    expect(parsed.blobs.get('v1')!.type).toBe('video/mp4');
    expect(new Uint8Array(await parsed.blobs.get('m1')!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(parsed.summary.warnings).toEqual([]);
  });
  it('rejects foreign, truncated and damaged files', async () => {
    await expect(parseBackup(new Blob(['hello world, not a backup']))).rejects.toBeInstanceOf(BackupError);
    const file = await buildBackup(data(), ['m1'], async () => new Blob([new Uint8Array(100)]));
    await expect(parseBackup(file.slice(0, file.size - 10))).rejects.toThrow(/incomplete/);
    const bad = { ...data(), players: [newPlayer('p1', 'x')] };
    await expect(parseBackup(await buildBackup(bad, [], async () => null))).rejects.toThrow(/player/);
  });
});
