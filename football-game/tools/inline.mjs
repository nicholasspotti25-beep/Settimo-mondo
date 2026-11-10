// Post-build: inline the bundled JS and CSS into one self-contained HTML file (dist/football-game.html).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, f) => `<script type="module">${readFileSync(join(dist, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
writeFileSync(join(dist, 'football-game.html'), html);
console.log('inline: dist/football-game.html', (html.length / 1024).toFixed(0) + ' kB');
