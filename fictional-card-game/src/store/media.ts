/**
 * Media import and display support.
 * - Any image size is accepted: the original file is stored untouched, and a downscaled thumbnail is generated for grids
 *   (so huge images stay fast), while detail views and the full-screen viewer use the original.
 * - Videos are stored as-is; a poster frame is extracted when the browser can decode the file.
 */
import type { MediaKind, MediaMeta } from '../model/types';
import { uid } from '../core/util';

export class MediaError extends Error {}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  bmp: 'image/bmp', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', ico: 'image/x-icon',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg',
  mkv: 'video/x-matroska', '3gp': 'video/3gpp', avi: 'video/x-msvideo',
};

export function guessMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

export function kindOf(mime: string): MediaKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

export const THUMB_MAX = 720;

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => {
    try {
      c.toBlob((b) => res(b), type, q);
    } catch {
      res(null);
    }
  });
}

async function makeThumb(source: CanvasImageSource, w: number, h: number, keepAlpha: boolean): Promise<Blob | null> {
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.drawImage(source, 0, 0, tw, th);
  } catch {
    return null;
  }
  let b = await canvasToBlob(c, 'image/webp', 0.86);
  if (!b || b.type !== 'image/webp') b = await canvasToBlob(c, keepAlpha ? 'image/png' : 'image/jpeg', 0.86);
  return b;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => rej(new MediaError('decode'));
    img.src = url;
  });
}

export interface Imported {
  meta: MediaMeta;
  blob: Blob;
  thumb: Blob | null;
  warning?: string;
}

export async function importImage(file: File): Promise<Imported> {
  const mime = guessMime(file);
  const blob = file.type ? file : file.slice(0, file.size, mime);
  const url = URL.createObjectURL(blob);
  try {
    let img: HTMLImageElement;
    try {
      img = await loadImage(url);
    } catch {
      const fmt = mime.split('/')[1]?.toUpperCase() ?? 'unknown';
      throw new MediaError(`This browser cannot display this image (${fmt}). Please use JPG, PNG, WebP or GIF.`);
    }
    const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
    const animated = mime === 'image/gif' || mime === 'image/apng';
    let thumb: Blob | null = null;
    if (!animated && (Math.max(w, h) > THUMB_MAX || file.size > 350_000)) {
      thumb = await makeThumb(img, w, h, mime !== 'image/jpeg');
    }
    const meta: MediaMeta = {
      id: uid('img'), kind: 'image', mime, name: file.name || 'image', size: file.size, width: w, height: h, duration: 0,
      createdAt: Date.now(), hasThumb: !!thumb, animated, playable: true,
    };
    return { meta, blob, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLElement, events: string[], ms: number): Promise<string> {
  return new Promise((res) => {
    const done = (ev: string): void => {
      clearTimeout(t);
      for (const e of events) el.removeEventListener(e, handlers[e]!);
      res(ev);
    };
    const handlers: Record<string, () => void> = {};
    for (const e of events) {
      handlers[e] = () => done(e);
      el.addEventListener(e, handlers[e]!);
    }
    const t = setTimeout(() => done('timeout'), ms);
  });
}

export function videoSupportHint(mime: string): string {
  const v = document.createElement('video');
  const can = v.canPlayType(mime);
  if (mime === 'video/quicktime') return 'MOV files often use HEVC (H.265), which many browsers cannot play. Export the video as MP4 (H.264) for the widest support.';
  if (mime === 'video/webm' && !can) return 'This browser cannot play WebM. Use MP4 (H.264 + AAC) for the widest support.';
  if (mime === 'video/x-matroska' || mime === 'video/x-msvideo') return 'MKV/AVI files are not supported by browsers. Convert to MP4 (H.264 + AAC).';
  return 'Use MP4 (H.264 video + AAC audio) for the widest support on phones, tablets and computers.';
}

export async function importVideo(file: File): Promise<Imported> {
  const mime = guessMime(file);
  const blob = file.type ? file : file.slice(0, file.size, mime);
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  try {
    v.src = url;
    v.load();
    const ev = await once(v, ['loadedmetadata', 'error'], 20000);
    const playable = ev === 'loadedmetadata' && (v.videoWidth > 0 || v.duration > 0);
    let poster: Blob | null = null;
    if (playable && v.videoWidth > 0) {
      const at = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(1.2, v.duration * 0.15) : 0;
      try {
        v.currentTime = at;
        const s = await once(v, ['seeked', 'error'], 6000);
        if (s === 'seeked') {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          poster = await makeThumb(v, v.videoWidth, v.videoHeight, false);
        }
      } catch {
        poster = null;
      }
    }
    const meta: MediaMeta = {
      id: uid('vid'), kind: 'video', mime, name: file.name || 'video', size: file.size,
      width: v.videoWidth || 0, height: v.videoHeight || 0, duration: Number.isFinite(v.duration) ? v.duration : 0,
      createdAt: Date.now(), hasThumb: !!poster, playable,
    };
    const warning = playable ? undefined : `This browser could not play this video. ${videoSupportHint(mime)}`;
    return { meta, blob, thumb: poster, warning };
  } finally {
    v.removeAttribute('src');
    try { v.load(); } catch { /* ignore */ }
    URL.revokeObjectURL(url);
  }
}

export async function importMedia(file: File, expected: MediaKind): Promise<Imported> {
  const kind = kindOf(guessMime(file));
  if (kind !== expected) throw new MediaError(expected === 'image' ? 'Please choose an image file.' : 'Please choose a video file.');
  return expected === 'image' ? importImage(file) : importVideo(file);
}

// ---------------------------------------------------------------- object-URL cache

export type BlobLoader = (key: string) => Promise<Blob | null>;
let loader: BlobLoader = async () => null;
let direct: ((key: string) => string | null) | null = null;
/** Lets a storage backend hand out streamable URLs (account storage) instead of reading files into memory. */
export function setDirectUrl(fn: ((key: string) => string | null) | null): void {
  direct = fn;
}
const urlCache = new Map<string, Promise<string | null>>();

export function setBlobLoader(l: BlobLoader): void {
  loader = l;
}

export const thumbKey = (id: string): string => `${id}#thumb`;

/** Object URL for a stored media file (variant 'thumb' falls back to the original when there is no thumbnail). */
export function mediaUrl(meta: MediaMeta | undefined, variant: 'full' | 'thumb'): Promise<string | null> {
  if (!meta) return Promise.resolve(null);
  const useThumb = variant === 'thumb' && meta.hasThumb && !meta.animated;
  const key = useThumb ? thumbKey(meta.id) : meta.id;
  let p = urlCache.get(key);
  const d = direct?.(key);
  if (!p && d) {
    p = Promise.resolve(d);
    urlCache.set(key, p);
  }
  if (!p) {
    p = loader(key).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null);
    urlCache.set(key, p);
    p.then((u) => { if (!u) urlCache.delete(key); });
  }
  return p;
}

/** A fresh in-memory copy of a video, used when a browser fails to stream directly from the database blob. */
export async function mediaUrlInMemory(id: string): Promise<string | null> {
  const b = await loader(id);
  if (!b) return null;
  const buf = await b.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: b.type }));
}

export function forgetMediaUrls(id: string): void {
  for (const key of [id, thumbKey(id)]) {
    const p = urlCache.get(key);
    if (p) p.then((u) => u && u.startsWith('blob:') && URL.revokeObjectURL(u));
    urlCache.delete(key);
  }
}
