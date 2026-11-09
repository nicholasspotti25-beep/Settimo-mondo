// After `vite build`:
//  - dist/fictional-card-game.html: one self-contained file (JS + CSS inlined) that runs from any web server.
//  - dist/artifact.html: the same game as page content for the Claude viewer (which supplies its own document skeleton).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
let js = '', css = '';
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, f) => {
  js = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/g, (_, f) => {
  css = readFileSync(join(dist, f), 'utf8');
  return `<style>${css}</style>`;
});
if (!js || !css || /src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html)) {
  console.error('inline: some assets were not inlined', readdirSync(join(dist, 'assets')));
  process.exit(1);
}
writeFileSync(join(dist, 'fictional-card-game.html'), html);
console.log(`dist/fictional-card-game.html ${(html.length / 1024).toFixed(0)} KB`);

// The viewer pads the page root by the phone's safe-area insets, so in-flow content must not add them again.
const viewerCss = `
.topbar { top: env(safe-area-inset-top, 0px); padding-top: 10px; }
.home-top { padding-top: 16px; }
.screen { padding-bottom: 28px; }
html::after { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 35; background: #05061a; pointer-events: none; }
`;
const fonts = [...html.matchAll(/<link [^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]).join('\n');
const artifact = `<title>Fictional Card Game</title>
${fonts}
<style>${css}${viewerCss}</style>
<div id="app"><div id="screens"></div><div id="overlays"></div></div>
<script type="module">${js}</script>
`;
writeFileSync(join(dist, 'artifact.html'), artifact);
console.log(`dist/artifact.html ${(artifact.length / 1024).toFixed(0)} KB`);
