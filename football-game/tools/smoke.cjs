// Headless browser smoke test: menus render, a match starts, touch controls drive the player, no page errors.
const { chromium } = require('playwright');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const root = join(__dirname, '..'), out = join(root, 'tools', 'out');
(async () => {
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(join(root, 'dist', 'football-game.html')).href);
await page.waitForTimeout(800); await page.screenshot({ path: join(out, '1-home.png') });
const shot = async (n) => page.screenshot({ path: join(out, n + '.png') });
const tapA = async (a) => { await page.locator(`[data-a="${a}"]`).first().tap(); await page.waitForTimeout(250); };
await tapA('go:squad'); await shot('2-squad'); await tapA('slot:9'); await shot('3-picker'); await tapA('nopick'); await tapA('back');
await tapA('go:tactics'); await shot('4-tactics'); await tapA('tab:4'); await shot('4b-instr'); await tapA('back');
await tapA('go:players'); await tapA('card:messi'); await shot('5-card'); await tapA('nocard'); await tapA('back');
await tapA('go:pre'); await shot('6-pre'); await tapA('play'); await page.waitForTimeout(2500); await shot('7-kickoff');
const st = () => page.evaluate(() => { const m = window.__fg.match; return { state: m.state, min: m.minute(), score: m.score.join('-'), ctx: m.ctx, ctrl: m.ctrl?.data.short, x: m.ctrl?.x.toFixed(1), z: m.ctrl?.z.toFixed(1), owner: m.ball.owner?.data.short, bx: m.ball.x.toFixed(1), fps: 0 }; });
console.log('start', await st());
// drag the joystick to the right while tapping sprint, then pass, then shoot
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
await touch('touchStart', [[150, 250, 1]]); await touch('touchMove', [[215, 250, 1]]); await page.waitForTimeout(1500);
console.log('after joystick', await st()); await shot('8-dribble');
await touch('touchStart', [[215, 250, 1], [844 - 98 - 37, 390 - 14 - 37, 2]]); await page.waitForTimeout(80); await touch('touchEnd', [[215, 250, 1]]); await touch('touchStart', [[215, 250, 1]]);
await page.waitForTimeout(900); console.log('after pass', await st()); await shot('9-pass');
await touch('touchEnd', []); await page.waitForTimeout(200);
// let it run, measure frame rate, then force a shot via input
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
console.log('fps (software GL)', fps.toFixed(0)); await shot('10-play');
await page.evaluate(() => { const m = window.__fg.match; for (let i = 0; i < 60 * 40; i++) { m.step(); m.ev.length = 0; if (m.state === 'half' || m.state === 'full') break; } });
await page.waitForTimeout(400); console.log('later', await st()); await shot('11-later');
await page.locator('.hb.pause').tap(); await page.waitForTimeout(300); await shot('12-pause'); await tapA('go:subs'); await shot('13-subs');
console.log('errors:', errors.length ? errors : 'none');
await b.close();
})().catch(e => { console.error(e); process.exit(1); });
