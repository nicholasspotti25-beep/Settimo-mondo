/**
 * Headless browser smoke test on the production build (dist/): serves it, opens it in Chromium (SwiftShader WebGL), starts a
 * new game, visits every zone and loads every boss arena for a few seconds, fails on console errors, and records
 * screenshots + frame-time / draw-call stats to tools/out/smoke/.
 * Usage: tsx tools/smoke.ts [bossId ...] [--zones] [--quality=low|medium|high] [--size=WxH]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const DIST = path.resolve('dist');
const OUT = path.resolve('tools/out/smoke');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const doZones = args.includes('--zones');
const quality = args.find((a) => a.startsWith('--quality='))?.split('=')[1] ?? 'medium';
const [vw, vh] = (args.find((a) => a.startsWith('--size='))?.split('=')[1] ?? '1280x576').split('x').map(Number);

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function main(): Promise<void> {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ missing: run npm run build first');
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, hasTouch: true });
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 30000 });
  await page.evaluate(async (q) => {
    const g = (window as any).__game;
    g.applySettings({ ...g.settings, quality: q, language: 'it' });
    await g.newGame(0, { name: 'Smoke', build: 0.5, height: 0.5, skin: 2, hair: 1, hairColor: 0, eyes: 0, cloak: 0 });
    g.sim.seq.skip(g.sim);
    g.sim.debug.invincible = true;
  }, quality);
  await page.waitForTimeout(1500);
  const report: Record<string, unknown>[] = [];
  const ids: string[] = await page.evaluate(() => (window as any).__game.content.bosses.map((b: { id: string }) => b.id));
  const zones: string[] = await page.evaluate(() => (window as any).__game.content.bundle.zones.map((z: { id: string }) => z.id));
  const sample = async (label: string) => {
    await page.waitForTimeout(2500);
    const stats = await page.evaluate(() => {
      const g = (window as any).__game;
      return { ...g.renderer.stats, quality: g.renderer.quality, res: g.renderer.resScale, zone: g.sim.zone?.def.id, boss: g.sim.boss?.defId ?? null, bossState: g.sim.boss?.state ?? null };
    });
    await page.screenshot({ path: path.join(OUT, `${label}.png`) });
    report.push({ label, ...stats, errors: errors.splice(0) });
    console.log(`${label.padEnd(36)} fps ${Number(stats.fps).toFixed(0).padStart(3)} calls ${String(stats.calls).padStart(4)} tris ${String(stats.triangles).padStart(7)} ${stats.zone}`);
  };
  if (doZones) {
    for (const z of zones) {
      await page.evaluate((zid) => {
        const g = (window as any).__game;
        g.sim.travel(zid, 'spawn');
        g.sim.seq.skip(g.sim);
      }, z);
      await sample(`zone_${z}`);
    }
  }
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    await page.evaluate((bid) => {
      const g = (window as any).__game;
      if (g.sim.seq.running) g.sim.seq.stop(g.sim);
      g.sim.startFightDirect(bid, { skipIntro: true });
    }, id);
    await sample(`boss_${String(ids.indexOf(id) + 1).padStart(2, '0')}_${id}`);
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const failed = report.filter((r) => (r.errors as string[]).length);
  for (const f of failed) console.log(`ERRORS in ${f.label}:\n  ${(f.errors as string[]).slice(0, 5).join('\n  ')}`);
  await browser.close();
  server.close();
  console.log(`smoke: ${report.length} scenes, ${failed.length} with console errors (screenshots in ${OUT})`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
