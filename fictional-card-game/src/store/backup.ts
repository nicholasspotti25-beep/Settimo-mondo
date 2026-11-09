/**
 * Complete backup file: a standard ZIP archive containing `backup.json` (every database, both players, settings,
 * pending tournament, media metadata) and every stored media file under `media/`. Built and read with Blob slices,
 * so backups with large videos are never loaded into memory at once. Older single-file backups (FCGBAK01) still import.
 */
import { MODES, type MediaMeta, type Mode, type PlayerProfile } from '../model/types';
import type { RawData } from './repo';
import { ZipError, crc32, readZip, writeZip } from './zip';

export const MAGIC = 'FCGBAK01';
export const FORMAT = 'fictional-card-game-backup';
export const FORMAT_VERSION = 1;
export const HEADER_NAME = 'backup.json';
const mediaPath = (key: string): string => `media/${encodeURIComponent(key)}`;

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
  const blobs: BlobEntry[] = [];
  const files: { name: string; data: Blob }[] = [];
  for (const key of keys) {
    const b = await getBlob(key);
    if (!b) continue;
    blobs.push({ key, offset: 0, size: b.size, type: b.type });
    files.push({ name: mediaPath(key), data: b });
  }
  const header: BackupHeader = { format: FORMAT, version: FORMAT_VERSION, createdAt: Date.now(), data, blobs };
  const json = new Blob([JSON.stringify(header)], { type: 'application/json' });
  return writeZip([{ name: HEADER_NAME, data: json }, ...files]);
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

function summarize(header: BackupHeader, warnings: string[]): BackupSummary {
  const d = header.data;
  return {
    createdAt: header.createdAt,
    entries: Object.fromEntries(MODES.map((m) => [m, d.entries[m].length])) as Record<Mode, number>,
    media: d.media.length,
    mediaBytes: header.blobs.reduce((s, b) => s + b.size, 0),
    players: d.players.map((p) => ({ name: p.name, fc: p.fc, cards: Object.values(p.collection).reduce((s, c) => s + (c?.qty ?? 0), 0) })),
    warnings,
  };
}

async function parseLegacy(file: Blob): Promise<ParsedBackup> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
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
  return { data: header.data, blobs, summary: summarize(header, warnings) };
}

export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  if (file.size < 12) throw new BackupError('This file is not a Fictional Card Game backup.');
  const magic = new TextDecoder().decode(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
  if (magic === MAGIC) return parseLegacy(file);
  let zip;
  try {
    zip = await readZip(file);
  } catch (e) {
    const m = (e as ZipError).message;
    if (m === 'truncated') throw new BackupError('The backup file is incomplete (it was probably cut off while saving or copying).');
    if (m === 'not a zip') {
      const sig = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (sig[0] === 0x50 && sig[1] === 0x4b && sig[2] === 3 && sig[3] === 4) throw new BackupError('The backup file is incomplete (it was probably cut off while saving or copying).');
      throw new BackupError('This file is not a Fictional Card Game backup.');
    }
    throw new BackupError(`The backup file is damaged (${m}).`);
  }
  const h = zip.get(HEADER_NAME);
  if (!h) throw new BackupError('This file is not a Fictional Card Game backup.');
  const hb = h.blob('application/json');
  if ((await crc32(hb)) !== h.crc) throw new BackupError('The backup is damaged: its contents do not match their checksum.');
  let json: unknown;
  try {
    json = JSON.parse(await hb.text());
  } catch {
    throw new BackupError('The backup is damaged: its contents cannot be read.');
  }
  const { header, warnings } = validateHeader(json, Number.MAX_SAFE_INTEGER);
  const blobs = new Map<string, Blob>();
  for (const b of header.blobs) {
    const z = zip.get(mediaPath(b.key));
    if (!z || z.size !== b.size) throw new BackupError('The backup is incomplete: some media files are missing or damaged.');
    blobs.set(b.key, z.blob(b.type));
  }
  return { data: header.data, blobs, summary: summarize(header, warnings) };
}

export function backupFileName(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `fictional-card-game-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
}
