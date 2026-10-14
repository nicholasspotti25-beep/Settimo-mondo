/**
 * Balance bot CLI: fights every boss (or those given as arguments) headlessly with the perfect profile (must win inside the
 * time-to-kill target 120 + 20 x D s) and the sloppy profile (must not win trivially).
 * Usage: tsx tools/balance-bot.ts [bossId ...] [--seeds=3] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import contentJson from '../src/generated/content.json';
import { setContent } from '../src/core/content';
import type { ContentBundle } from '../src/core/types';
import { Sim } from '../src/sim/sim';
import { BEHAVIORS } from '../src/generated/registry.sim';
import { runFight, type BotResult } from './bot/bot';

const c = setContent(contentJson as unknown as ContentBundle);
const args = process.argv.slice(2);
const seeds = Number(args.find((a) => a.startsWith('--seeds='))?.split('=')[1] ?? 3);
const ids = args.filter((a) => !a.startsWith('--'));
const bosses = (ids.length ? ids.map((i) => c.boss(i)) : c.bosses).filter(Boolean);

interface Row { boss: string; order: number; D: number; target: number; perfect: BotResult[]; sloppy: BotResult[]; ok: boolean; reason: string }
const rows: Row[] = [];
let failures = 0;
for (const b of bosses) {
  const perfect: BotResult[] = [];
  const sloppy: BotResult[] = [];
  for (let s = 0; s < seeds; s++) {
    perfect.push(runFight(new Sim(c, { behaviors: BEHAVIORS, seed: 1000 + s * 7919, headless: true }), b.id, 'perfect'));
    sloppy.push(runFight(new Sim(c, { behaviors: BEHAVIORS, seed: 5000 + s * 104729, headless: true }), b.id, 'sloppy', { maxDeaths: 0 }));
  }
  const target = c.balance.boss.ttk_base + c.balance.boss.ttk_per_d * b.difficulty;
  let ok = true;
  let reason = '';
  if (b.scripted) {
    ok = perfect.every((r) => r.won);
    if (!ok) reason = 'scripted encounter did not complete';
  } else {
    const lost = perfect.filter((r) => !r.won);
    const slow = perfect.filter((r) => r.won && r.time > target);
    if (lost.length) { ok = false; reason = `perfect bot lost ${lost.length}/${seeds}`; }
    else if (slow.length) { ok = false; reason = `perfect bot over target (${Math.max(...slow.map((r) => r.time)).toFixed(0)} s > ${target} s)`; }
    const trivial = sloppy.filter((r) => r.won && r.hitsTaken < 3);
    if (ok && trivial.length === seeds) { ok = false; reason = 'trivial: sloppy bot wins without being hit'; }
  }
  if (!ok) failures++;
  rows.push({ boss: b.id, order: b.order, D: b.difficulty, target, perfect, sloppy, ok, reason });
  const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
  const pt = avg(perfect.filter((r) => r.won).map((r) => r.time));
  const sw = sloppy.filter((r) => r.won).length;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${String(b.order).padStart(2)} ${b.id.padEnd(26)} D${String(b.difficulty).padStart(2)} target ${String(target).padStart(3)}s | perfect ${perfect.filter((r) => r.won).length}/${seeds} ` +
      `avg ${pt.toFixed(0).padStart(4)}s hits ${avg(perfect.map((r) => r.hitsTaken)).toFixed(1)} pd ${avg(perfect.map((r) => r.perfectDodges)).toFixed(0)} | sloppy wins ${sw}/${seeds} ` +
      `hits ${avg(sloppy.map((r) => r.hitsTaken)).toFixed(1)} bossHp ${avg(sloppy.map((r) => r.bossHpFrac)).toFixed(2)} ${reason ? '— ' + reason : ''}`,
  );
}
const out = path.resolve('tools/out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'bot-report.json'), JSON.stringify(rows.map((r) => ({ ...r, perfect: r.perfect.map(strip), sloppy: r.sloppy.map(strip) })), null, 1));
function strip(r: BotResult) { return { won: r.won, time: Math.round(r.time), hits: r.hitsTaken, pd: r.perfectDodges, deaths: r.deaths, bossHp: Number(r.bossHpFrac.toFixed(3)), phase: r.phaseReached }; }
console.log(`\nbalance-bot: ${rows.length - failures}/${rows.length} encounters pass`);
process.exit(failures ? 1 : 0);
