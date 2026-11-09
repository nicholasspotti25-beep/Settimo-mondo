// Produces dist/fictional-card-game.html: one self-contained file (JS + CSS inlined) that runs offline from anywhere.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, f) => {
  const js = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`);
if (/src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html)) {
  console.error('inline: some assets were not inlined', readdirSync(join(dist, 'assets')));
  process.exit(1);
}
writeFileSync(join(dist, 'fictional-card-game.html'), html);
console.log(`dist/fictional-card-game.html ${(html.length / 1024).toFixed(0)} KB`);
