/**
 * Procedural app icons (no image tools): a violet-gold twilight, a horizon of clouds and a seed of light rising.
 * Writes PNGs with a tiny encoder (zlib from Node). Usage: tsx tools/gen-icons.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function draw(w: number, h: number, mask: 'rounded' | 'none' | 'circle'): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const S = Math.min(w, h);
  const zen = [24, 14, 44], mid = [92, 52, 110], hor = [236, 170, 110], gold = [255, 228, 160];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = (px - w / 2) / S + 0.5, v = (py - h / 2) / S + 0.5;
      // sky gradient
      let c = mix(mix(zen, mid, smooth(0, 0.48, v)), hor, smooth(0.42, 0.7, v));
      // stars
      if (v < 0.5 && hash(px, py) > 0.9975) c = mix(c, [255, 245, 230], 0.8 * (1 - v * 1.6));
      // glow of the seed / dawn
      const dx = u - 0.5, dy = v - 0.6;
      const d = Math.hypot(dx, dy * 1.15);
      c = mix(c, gold, Math.exp(-d * d * 28) * 0.9);
      // rays
      const ang = Math.atan2(dy, dx);
      const ray = Math.pow(Math.max(0, Math.cos(ang * 9)), 18) * Math.exp(-d * 4.2) * (v < 0.6 ? 0.45 : 0);
      c = mix(c, gold, ray);
      // seed core
      c = mix(c, [255, 252, 240], smooth(0.07, 0.035, d));
      // cloud sea
      const cloud = 0.67 + 0.03 * Math.sin(u * 13 + 0.4) + 0.015 * Math.sin(u * 31 + 1.3) + 0.008 * Math.sin(u * 71);
      const edge = smooth(cloud - 0.012, cloud + 0.012, v);
      if (edge > 0) {
        const t = smooth(cloud, cloud + 0.3, v);
        let cc = mix([252, 222, 198], [70, 44, 92], t * 0.9);
        cc = mix(cc, [255, 242, 224], Math.exp(-((u - 0.5) ** 2) * 14) * (1 - t) * 0.7);
        const puff = 0.5 + 0.5 * Math.sin(u * 40 + v * 30) * Math.sin(u * 23 - v * 51);
        cc = mix(cc, [255, 236, 214], puff * 0.12 * (1 - t));
        c = mix(c, cc, edge);
      }
      // rounded mask for non-maskable icons
      let a = 255;
      if (mask === 'rounded') {
        const r = 0.22;
        const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
        const sd = Math.hypot(qx, qy) - r;
        a = Math.round(255 * smooth(0.004, -0.004, sd));
      } else if (mask === 'circle') {
        a = Math.round(255 * smooth(0.5, 0.49, Math.hypot(u - 0.5, v - 0.5)));
      }
      const i = (py * w + px) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = a;
    }
  }
  return out;
}

const dir = path.resolve('public/icons');
fs.mkdirSync(dir, { recursive: true });
for (const [name, size, mask] of [['icon-192.png', 192, 'rounded'], ['icon-512.png', 512, 'rounded'], ['icon-180.png', 180, 'none'], ['maskable-512.png', 512, 'none']] as const) {
  fs.writeFileSync(path.join(dir, name), png(size, size, draw(size, size, mask)));
}
console.log('gen-icons: web icons ->', dir);

// Native projects (if generated): Android mipmaps + splash, iOS app icon + splash.
const res = path.resolve('native/android/app/src/main/res');
if (fs.existsSync(res)) {
  const dens: [string, number][] = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
  for (const [d, px] of dens) {
    const dir2 = path.join(res, `mipmap-${d}`);
    fs.writeFileSync(path.join(dir2, 'ic_launcher.png'), png(px, px, draw(px, px, 'rounded')));
    fs.writeFileSync(path.join(dir2, 'ic_launcher_round.png'), png(px, px, draw(px, px, 'circle')));
    const fg = Math.round(px * 2.25);
    fs.writeFileSync(path.join(dir2, 'ic_launcher_foreground.png'), png(fg, fg, draw(fg, fg, 'none')));
  }
  const splash: [string, number, number][] = [
    ['drawable', 480, 320], ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280], ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280], ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
  ];
  for (const [d, w, h] of splash) fs.writeFileSync(path.join(res, d, 'splash.png'), png(w, h, draw(w, h, 'none')));
  console.log('gen-icons: android mipmaps + splash');
}
const ios = path.resolve('native/ios/App/App/Assets.xcassets');
if (fs.existsSync(ios)) {
  fs.writeFileSync(path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'), png(1024, 1024, draw(1024, 1024, 'none')));
  const sp = png(2732, 2732, draw(2732, 2732, 'none'));
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) fs.writeFileSync(path.join(ios, 'Splash.imageset', f), sp);
  console.log('gen-icons: ios app icon + splash');
}
