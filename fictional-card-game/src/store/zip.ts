/**
 * Minimal ZIP (store / no compression) writer and reader built on Blob slices, so archives with large videos are
 * never loaded into memory at once. Limits: 65 535 entries and 4 GiB (no ZIP64).
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export async function crc32(blob: Blob, chunk = 4 * 1024 * 1024): Promise<number> {
  let c = 0xffffffff;
  for (let off = 0; off < blob.size; off += chunk) {
    const b = new Uint8Array(await blob.slice(off, off + chunk).arrayBuffer());
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export class ZipError extends Error {}

const MAX = 0xffffffff;

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export async function writeZip(entries: { name: string; data: Blob }[], now = new Date()): Promise<Blob> {
  if (entries.length > 0xffff) throw new ZipError('Too many files for one archive');
  const enc = new TextEncoder();
  const { time, date } = dosTime(now);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name) as Uint8Array<ArrayBuffer>;
    const size = e.data.size;
    if (size > MAX || offset > MAX) throw new ZipError('The backup is larger than 4 GB');
    const crc = await crc32(e.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + name.length);
    rec.set(new Uint8Array(ch.buffer), 0);
    rec.set(name, 46);
    central.push(rec);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  if (offset > MAX) throw new ZipError('The backup is larger than 4 GB');
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, entries.length, true);
  eo.setUint16(10, entries.length, true);
  eo.setUint32(12, cdSize, true);
  eo.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eo.buffer], { type: 'application/zip' });
}

export interface ZipEntry {
  name: string;
  size: number;
  crc: number;
  /** Lazy slice of the stored bytes. */
  blob(type?: string): Blob;
}

export async function readZip(file: Blob): Promise<Map<string, ZipEntry>> {
  if (file.size < 22) throw new ZipError('not a zip');
  const tailLen = Math.min(file.size, 22 + 0xffff);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('not a zip');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  if (cdOff + cdSize > file.size) throw new ZipError('truncated');
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50) throw new ZipError('damaged directory');
    const method = cd.getUint16(p + 10, true);
    const crc = cd.getUint32(p + 16, true);
    const csize = cd.getUint32(p + 20, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0) throw new ZipError('compressed entries are not supported');
    const lh = new DataView(await file.slice(local, local + 30).arrayBuffer());
    if (lh.byteLength < 30 || lh.getUint32(0, true) !== 0x04034b50) throw new ZipError('damaged entry');
    const start = local + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    if (start + csize > file.size) throw new ZipError('truncated');
    out.set(name, { name, size: csize, crc, blob: (type = '') => file.slice(start, start + csize, type) });
  }
  return out;
}
