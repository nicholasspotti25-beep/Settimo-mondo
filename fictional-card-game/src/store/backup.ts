/**
 * Complete backup file (.fcgbackup): every database, both players, settings, pending tournament AND every media file.
 *
 * Layout: "FCGBAK01" (8 bytes) · header length (uint32 LE) · header JSON (UTF-8) · media bytes back to back.
 * The header lists each stored blob with its offset/size inside the data section. Building and reading use Blob slices,
 * so even multi-gigabyte backups with large videos are never loaded into memory at once.
 */
import { MODES, type MediaMeta, type Mode, type PlayerProfile } from '../model/types';
import type { RawData } from './repo';

export const MAGIC = 'FCGBAK01';
export const FORMAT = 'fictional-card-game-backup';
export const FORMAT_VERSION = 1;

export interface BlobEntry {
  key: string;
  offset: number;
  size: number;
  type: string;
}

export interface BackupHeader {
  format: string;
  version: number;
  createdAt: number;
  data: RawData;
  blobs: BlobEntry[];
}

export interface BackupSummary {
  createdAt: number;
  entries: Record<Mode, number>;
  media: number;
  mediaBytes: number;
  players: { name: string; fc: number; cards: number }[];
  warnings: string[];
}

export class BackupError extends Error {}

export async function buildBackup(data: RawData, keys: string[], getBlob: (key: string) => Promise<Blob | null>): Promise<Blob> {
  const parts: Blob[] = [];
  const blobs: BlobEntry[] = [];
  let offset = 0;
  for (const key of keys) {
    const b = await getBlob(key);
    if (!b) continue;
    blobs.push({ key, offset, size: b.size, type: b.type });
    parts.push(b);
    offset += b.size;
  }
  const header: BackupHeader = { format: FORMAT, version: FORMAT_VERSION, createdAt: Date.now(), data, blobs };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, headerBytes.length, true);
  return new Blob([new TextEncoder().encode(MAGIC), len, headerBytes, ...parts], { type: 'application/octet-stream' });
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validateHeader(h: unknown, dataSize: number): { header: BackupHeader; warnings: string[] } {
  const warnings: string[] = [];
  if (!isObj(h) || h.format !== FORMAT) throw new BackupError('This file is not a Fictional Card Game backup.');
  if (typeof h.version !== 'number' || h.version > FORMAT_VERSION) throw new BackupError('This backup was made by a newer version of the game.');
  const d = h.data;
  if (!isObj(d) || !isObj(d.entries)) throw new BackupError('The backup is damaged: databases are missing.');
  for (const m of MODES) {
    const list = (d.entries as Record<string, unknown>)[m];
    if (!Array.isArray(list)) throw new BackupError(`The backup is damaged: the ${m} database is missing.`);
    for (const e of list) if (!isObj(e) || typeof e.id !== 'string' || typeof e.name !== 'string') throw new BackupError(`The backup is damaged: a ${m} entry is invalid.`);
  }
  if (!Array.isArray(d.players) || d.players.length !== 2) throw new BackupError('The backup is damaged: player profiles are missing.');
  const ids = (d.players as PlayerProfile[]).map((p) => p?.id).sort();
  if (ids[0] !== 'p1' || ids[1] !== 'p2') throw new BackupError('The backup is damaged: player profiles are invalid.');
  for (const p of d.players as PlayerProfile[]) {
    if (typeof p.fc !== 'number' || !isObj(p.collection)) throw new BackupError('The backup is damaged: a player profile is invalid.');
  }
  if (!isObj(d.settings)) throw new BackupError('The backup is damaged: settings are missing.');
  if (!Array.isArray(d.media)) throw new BackupError('The backup is damaged: the media list is missing.');
  if (!Array.isArray(h.blobs)) throw new BackupError('The backup is damaged: the media index is missing.');
  let end = 0;
  for (const b of h.blobs as BlobEntry[]) {
    if (!isObj(b) || typeof b.key !== 'string' || typeof b.offset !== 'number' || typeof b.size !== 'number' || b.offset < 0 || b.size < 0) {
      throw new BackupError('The backup is damaged: the media index is invalid.');
    }
    end = Math.max(end, b.offset + b.size);
  }
  if (end > dataSize) throw new BackupError('The backup file is incomplete (it was probably cut off while saving or copying).');
  const keys = new Set((h.blobs as BlobEntry[]).map((b) => b.key));
  for (const m of d.media as MediaMeta[]) if (!keys.has(m.id)) warnings.push(`Media "${m.name}" has no file in the backup.`);
  return { header: h as unknown as BackupHeader, warnings };
}

export interface ParsedBackup {
  data: RawData;
  blobs: Map<string, Blob>;
  summary: BackupSummary;
}

export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  if (file.size < 12) throw new BackupError('This file is not a Fictional Card Game backup.');
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new BackupError('This file is not a Fictional Card Game backup.');
  const len = new DataView(head.buffer).getUint32(8, true);
  if (12 + len > file.size) throw new BackupError('The backup file is incomplete.');
  let json: unknown;
  try {
    json = JSON.parse(await file.slice(12, 12 + len).text());
  } catch {
    throw new BackupError('The backup is damaged: its contents cannot be read.');
  }
  const dataStart = 12 + len;
  const { header, warnings } = validateHeader(json, file.size - dataStart);
  const blobs = new Map<string, Blob>();
  for (const b of header.blobs) blobs.set(b.key, file.slice(dataStart + b.offset, dataStart + b.offset + b.size, b.type));
  const d = header.data;
  const summary: BackupSummary = {
    createdAt: header.createdAt,
    entries: Object.fromEntries(MODES.map((m) => [m, d.entries[m].length])) as Record<Mode, number>,
    media: d.media.length,
    mediaBytes: header.blobs.reduce((s, b) => s + b.size, 0),
    players: d.players.map((p) => ({ name: p.name, fc: p.fc, cards: Object.values(p.collection).reduce((s, c) => s + (c?.qty ?? 0), 0) })),
    warnings,
  };
  return { data: d, blobs, summary };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `fictional-card-game-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.fcgbackup`;
}
