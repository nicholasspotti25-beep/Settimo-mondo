/**
 * The dawn-light, glass-and-gold visual language, as one stylesheet injected at mount. System font stacks only (offline).
 * Sizes: `--k` (set from the touch layout unit) scales the HUD; menus use clamp() on viewport units. Safe areas via env().
 */
export const CSS = /* css */ `
#sm-ui {
  --gold: #ead09a; --gold-hi: #fff3d2; --gold-deep: #b88d4c; --ivory: #f6efe2; --ivory-dim: rgba(246,239,226,.72);
  --rose: #f0b49c; --violet: #2a1f3d; --night: #120d1c; --red: #ff4836; --red-soft: #ff7a5a;
  --glass: rgba(24,17,38,.40); --glass-2: rgba(20,14,32,.66); --glass-3: rgba(14,10,24,.86);
  --line: rgba(234,208,154,.46); --line-2: rgba(234,208,154,.22); --line-3: rgba(234,208,154,.12);
  --serif: "Cormorant Garamond","Cormorant","EB Garamond","Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans: system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --k: 1; --sub: 1;
  --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px); --st: env(safe-area-inset-top, 0px); --sb: env(safe-area-inset-bottom, 0px);
  position: fixed; inset: 0; z-index: 10; pointer-events: none; color: var(--ivory); font-family: var(--sans);
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; overflow: hidden;
}
#sm-ui * { box-sizing: border-box; }
#sm-ui .sm-layer { position: absolute; inset: 0; pointer-events: none; }
#sm-ui .sm-hidden { display: none !important; }
#sm-ui .sm-ico { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; overflow: visible; }
:where(#sm-ui) button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; touch-action: manipulation; }
:where(#sm-ui) input, :where(#sm-ui) textarea { font: inherit; color: inherit; -webkit-user-select: text; user-select: text; }

/* ------------------------------------------------------------------ HUD */
.sm-hud { opacity: 1; transition: opacity .5s ease; }
.sm-hud.dim { opacity: 0; }
.sm-ring { position: absolute; transform: translate(-50%,-50%); }
.sm-ring svg { width: 100%; height: 100%; overflow: visible; }
.sm-ring .trk { fill: none; stroke: rgba(10,6,18,.55); }
.sm-ring .meta { fill: none; stroke: url(#sm-g-meta); stroke-linecap: round; transition: stroke-dashoffset .25s linear; }
.sm-ring .meta-hair { fill: none; stroke: var(--line); stroke-width: .8; }
.sm-ring .eco-trk { fill: none; stroke: rgba(246,239,226,.14); }
.sm-ring .eco { fill: none; stroke: var(--gold-hi); stroke-linecap: butt; filter: drop-shadow(0 0 2px rgba(255,226,160,.8)); }
.sm-ring .eco.full { stroke: #fff6dc; }
.sm-ring .core { fill: rgba(16,10,26,.55); stroke: var(--line-2); stroke-width: .8; }
.sm-ring .seed { color: rgba(246,239,226,.5); transition: color .3s; }
.sm-ring.ready .seed { color: var(--gold-hi); }
.sm-ring.ready .halo { opacity: 1; animation: sm-pulse 1.6s ease-in-out infinite; }
.sm-ring .halo { fill: none; stroke: rgba(255,222,150,.55); stroke-width: 6; opacity: 0; filter: blur(3px); }
.sm-ring .count { font: 600 calc(13px * var(--k)) var(--serif); fill: var(--gold-hi); text-anchor: middle; dominant-baseline: central; }
.sm-ring.active .meta { stroke: url(#sm-g-meta-on); }
.sm-ring.deny { animation: sm-shake .3s; }
@keyframes sm-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes sm-shake { 0%,100% { transform: translate(-50%,-50%); } 25% { transform: translate(calc(-50% - 3px),-50%); } 75% { transform: translate(calc(-50% + 3px),-50%); } }

.sm-pbars { position: absolute; display: flex; flex-direction: column; gap: calc(5px * var(--k)); }
.sm-pbars.mir { align-items: flex-end; }
.sm-bar { position: relative; height: calc(5px * var(--k)); background: rgba(10,6,18,.58); border-radius: 3px; box-shadow: 0 0 0 1px rgba(234,208,154,.30), 0 1px 6px rgba(0,0,0,.35); overflow: hidden; }
.sm-bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; border-radius: 2px; }
.sm-pbars.mir .sm-bar > i { transform-origin: 100% 50%; }
.sm-bar .lag { background: rgba(255,238,206,.7); }
.sm-bar.salute { width: calc(clamp(150px, 27vw, 330px) * var(--k)); height: calc(6px * var(--k)); }
.sm-bar.salute .fill { background: linear-gradient(90deg,#a8364a,#de7a66 62%,#f6c49c); }
.sm-bar.salute.low .fill { animation: sm-lowhp 1.1s ease-in-out infinite; }
@keyframes sm-lowhp { 50% { filter: brightness(1.45); } }
.sm-bar.fiato { width: calc(clamp(110px, 19vw, 240px) * var(--k)); height: calc(4px * var(--k)); }
.sm-bar.fiato .fill { background: linear-gradient(90deg,#7f9a74,#d3dfa6); }
.sm-bar.fiato.empty { box-shadow: 0 0 0 1px rgba(255,120,90,.6); }
.sm-pmeta { display: flex; align-items: center; gap: calc(8px * var(--k)); height: calc(18px * var(--k)); }
.sm-pbars.mir .sm-pmeta { flex-direction: row-reverse; }
.sm-vials { display: flex; gap: calc(3px * var(--k)); }
.sm-vial { width: calc(11px * var(--k)); height: calc(17px * var(--k)); color: var(--gold-hi); filter: drop-shadow(0 0 3px rgba(255,226,170,.55)); transition: opacity .3s, filter .3s; }
.sm-vial.used { opacity: .28; filter: none; color: var(--ivory-dim); }
.sm-status { display: flex; gap: calc(4px * var(--k)); }
.sm-st { position: relative; width: calc(18px * var(--k)); height: calc(18px * var(--k)); border-radius: 50%; padding: calc(2.5px * var(--k)); background: rgba(16,10,26,.6); box-shadow: 0 0 0 1px var(--line-2); color: var(--ivory); }
.sm-st.burn { color: #ffae6a; } .sm-st.freeze { color: #bfe6ff; } .sm-st.poison { color: #b8e07a; } .sm-st.madness { color: #e7a0ff; }
.sm-st.blind { color: #e8e0d0; } .sm-st.mute { color: #d8c8ff; } .sm-st.slow { color: #f2dca2; } .sm-st.void { color: #b48cff; } .sm-st.root { color: #c9b07a; }
.sm-st svg.tm { position: absolute; inset: -2px; width: calc(100% + 4px); height: calc(100% + 4px); transform: rotate(-90deg); }
.sm-st svg.tm circle { fill: none; stroke: currentColor; stroke-width: 2; opacity: .7; }
.sm-ally { display: flex; align-items: center; gap: 6px; font: italic calc(11px * var(--k)) var(--serif); color: var(--gold); }
.sm-ally .sm-bar { width: calc(90px * var(--k)); height: calc(3px * var(--k)); }
.sm-ally .fill { background: linear-gradient(90deg,#e8c56a,#fff1c0); }

.sm-boss { position: absolute; left: 50%; bottom: calc(var(--sb) + 10px * var(--k)); width: clamp(240px, 46vw, 640px); transform: translateX(-50%); opacity: 0; transition: opacity .6s ease; }
.sm-boss.on { opacity: 1; }
.sm-boss-name { display: flex; align-items: baseline; gap: .6em; margin-bottom: calc(4px * var(--k)); white-space: nowrap; overflow: hidden; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
.sm-boss-name b { font: 600 calc(15px * var(--k)) var(--serif); letter-spacing: .06em; color: var(--ivory); }
.sm-boss-name span { font: italic calc(12px * var(--k)) var(--serif); color: var(--gold); opacity: .9; overflow: hidden; text-overflow: ellipsis; }
.sm-bar.boss { width: 100%; height: calc(6px * var(--k)); overflow: visible; }
.sm-bar.boss > i { overflow: hidden; }
.sm-bar.boss .fill { background: linear-gradient(90deg,#7c1a2c,#c23b3a 55%,#e88a5c); }
.sm-bar.boss .tick { position: absolute; top: 50%; width: calc(7px * var(--k)); height: calc(7px * var(--k)); margin: calc(-3.5px * var(--k)) 0 0 calc(-3.5px * var(--k)); transform: rotate(45deg); background: var(--night); box-shadow: 0 0 0 1px var(--gold); left: 0; }
.sm-bar.boss .tick.past { background: var(--gold-deep); }
.sm-bar.equil { width: 100%; height: calc(3px * var(--k)); margin-top: calc(4px * var(--k)); }
.sm-bar.equil .fill { background: linear-gradient(90deg,#b98c46,#f6dfa4); }
.sm-bar.equil.hot .fill { animation: sm-hot .8s ease-in-out infinite; }
.sm-bar.equil.broken .fill { background: linear-gradient(90deg,#fff1c4,#ffffff); box-shadow: 0 0 10px #ffe7a8; }
@keyframes sm-hot { 50% { filter: brightness(1.5); } }
.sm-parts { position: absolute; bottom: calc(100% + 8px * var(--k)); right: 0; display: flex; gap: calc(10px * var(--k)); }
.sm-part { width: calc(74px * var(--k)); font: calc(10px * var(--k)) var(--serif); color: var(--ivory-dim); text-align: right; transition: opacity .3s; }
.sm-part .sm-bar { height: calc(3px * var(--k)); margin-top: 2px; }
.sm-part .sm-bar.hp .fill { background: linear-gradient(90deg,#9c2b38,#e07a5c); }
.sm-part .sm-bar.eq .fill { background: linear-gradient(90deg,#b98c46,#f6dfa4); }
.sm-part.broken { opacity: .35; }
.sm-part.spez .sm-bar.eq .fill { background: #fff3cc; box-shadow: 0 0 6px #ffe7a8; }
.sm-part.locked { color: var(--gold-hi); }
.sm-chal { position: absolute; bottom: calc(100% + 8px * var(--k)); left: 0; display: flex; gap: 4px; }
.sm-chal i { width: calc(16px * var(--k)); height: calc(16px * var(--k)); color: var(--gold); opacity: .85; }
.sm-chal i.fail { color: var(--red-soft); opacity: .6; }

.sm-grace { position: absolute; left: 50%; bottom: calc(var(--sb) + 64px * var(--k)); transform: translateX(-50%); font: 600 calc(19px * var(--k)) var(--serif); letter-spacing: .22em; text-transform: uppercase; color: var(--gold-hi); text-shadow: 0 0 12px rgba(255,214,140,.95), 0 0 30px rgba(255,190,100,.6); opacity: 0; transition: opacity .25s; white-space: nowrap; display: flex; align-items: center; gap: .5em; }
.sm-grace i { width: 1.2em; height: 1.2em; display: inline-block; }
.sm-grace.on { opacity: 1; animation: sm-gracep 1.1s ease-in-out infinite; }
.sm-grace.far { opacity: .55; animation: none; }
@keyframes sm-gracep { 50% { text-shadow: 0 0 18px rgba(255,230,170,1), 0 0 40px rgba(255,200,110,.9); } }

.sm-redwarn { position: absolute; left: 50%; top: calc(var(--st) + 18%); width: calc(44px * var(--k)); height: calc(44px * var(--k)); margin-left: calc(-22px * var(--k)); color: var(--red); opacity: 0; filter: drop-shadow(0 0 8px rgba(255,60,40,.9)); }
.sm-redwarn.on { opacity: 1; animation: sm-redp .32s ease-in-out infinite alternate; }
@keyframes sm-redp { from { transform: scale(.92); } to { transform: scale(1.1); } }
.sm-rededge { position: absolute; inset: 0; box-shadow: inset 0 0 calc(70px * var(--k)) calc(14px * var(--k)) rgba(255,40,24,.55); opacity: 0; }
.sm-rededge.on { animation: sm-rededge .5s ease-in-out infinite alternate; }
@keyframes sm-rededge { from { opacity: .35; } to { opacity: 1; } }
#sm-ui.rflash .sm-rededge.on { animation: none; opacity: .55; }
#sm-ui.rflash .sm-redwarn.on { animation: none; }
.sm-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(120,8,24,.75) 100%); opacity: 0; }
.sm-lowvig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 58%, rgba(90,10,30,.55) 100%); opacity: 0; transition: opacity .8s; }
.sm-pd { position: absolute; left: 50%; top: 50%; width: 30vmin; height: 30vmin; margin: -15vmin 0 0 -15vmin; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255,236,190,.9), 0 0 40px 6px rgba(255,214,140,.55) inset; opacity: 0; }
.sm-pd.go { animation: sm-pd .55s ease-out; }
.sm-pd.parry { box-shadow: 0 0 0 3px rgba(200,230,255,.95), 0 0 40px 8px rgba(160,210,255,.5) inset; }
@keyframes sm-pd { from { opacity: 1; transform: scale(.35); } to { opacity: 0; transform: scale(1.5); } }
#sm-ui.rflash .sm-pd.go { animation-duration: .9s; }
.sm-pdtext { position: absolute; left: 50%; top: 38%; transform: translateX(-50%); font: italic 600 calc(15px * var(--k)) var(--serif); letter-spacing: .14em; color: var(--gold-hi); text-shadow: 0 0 10px rgba(255,214,140,.9); opacity: 0; white-space: nowrap; }
.sm-pdtext.go { animation: sm-pdt 1s ease-out; }
@keyframes sm-pdt { 0% { opacity: 0; transform: translate(-50%, 6px); } 15% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -8px); } }
.sm-trans { position: absolute; font: italic calc(12px * var(--k)) var(--serif); color: var(--gold-hi); text-shadow: 0 0 8px rgba(255,214,140,.9); opacity: 0; white-space: nowrap; transform: translateX(-50%); }
.sm-trans.go { animation: sm-pdt 1.4s ease-out; }
.sm-fps { position: absolute; left: 50%; top: calc(var(--st) + 4px); transform: translateX(-50%); font: 11px ui-monospace,Menlo,monospace; color: rgba(246,239,226,.75); text-shadow: 0 0 3px #000; white-space: pre; text-align: center; }

/* ------------------------------------------------------------------ cards, banners, toasts */
.sm-card { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; transition: opacity 1.1s ease; pointer-events: none; }
.sm-card.on { opacity: 1; }
.sm-card.zone { top: 24%; }
.sm-card.zone .t { font: 400 clamp(22px, 5.4vh + 6px, 46px) var(--serif); letter-spacing: .18em; color: var(--ivory); text-shadow: 0 2px 18px rgba(0,0,0,.65); }
.sm-card.zone .s { font: italic clamp(12px, 2.2vh + 4px, 18px) var(--serif); color: var(--gold); letter-spacing: .1em; margin-top: .3em; }
.sm-orn { display: block; margin: .5em auto; width: min(46vw, 380px); height: 10px; }
.sm-card.act { top: 34%; }
.sm-card.act .s { font: 500 clamp(12px, 2vh + 4px, 17px) var(--sans); letter-spacing: .5em; text-transform: uppercase; color: var(--gold); }
.sm-card.act .t { font: 400 clamp(26px, 7vh + 4px, 60px) var(--serif); letter-spacing: .12em; color: var(--ivory); text-shadow: 0 0 30px rgba(255,214,150,.35); }
.sm-card.boss { bottom: calc(var(--sb) + 22%); text-align: left; left: 12%; right: auto; }
.sm-card.boss .t { font: 500 clamp(24px, 6vh + 4px, 54px) var(--serif); letter-spacing: .06em; color: var(--ivory); text-shadow: 0 2px 20px rgba(0,0,0,.8); }
.sm-card.boss .s { font: italic clamp(13px, 2.4vh + 4px, 20px) var(--serif); color: var(--gold); }
.sm-card.boss .sm-orn { margin: .3em 0; width: min(40vw, 320px); }
.sm-card.banner { top: 34%; }
.sm-card.banner::before { content: ""; position: absolute; left: 0; right: 0; top: -30%; bottom: -30%; background: linear-gradient(90deg, transparent, rgba(16,10,26,.55) 25%, rgba(16,10,26,.55) 75%, transparent); z-index: -1; }
.sm-card.banner .t { font: 500 clamp(26px, 7vh + 6px, 64px) var(--serif); letter-spacing: .2em; text-transform: uppercase; background: linear-gradient(180deg,#fff6dc,#ecc985 55%,#b4884a); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 14px rgba(255,210,130,.55)); }
.sm-card.banner .s { font: italic clamp(13px, 2.4vh + 4px, 20px) var(--serif); color: var(--ivory-dim); letter-spacing: .08em; }
.sm-card.title .t { font: 400 clamp(28px, 9vh + 4px, 76px) var(--serif); letter-spacing: .3em; text-transform: uppercase; background: linear-gradient(180deg,#fff6dc,#ecc985 55%,#b4884a); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 22px rgba(255,214,150,.45)); }
.sm-card.title { top: 36%; }
.sm-toasts { position: absolute; left: 50%; top: calc(var(--st) + 20%); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; width: min(58vw, 460px); }
.sm-toast { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 14px; border-radius: 4px; background: linear-gradient(90deg, rgba(20,14,32,.0), rgba(20,14,32,.72) 18%, rgba(20,14,32,.72) 82%, rgba(20,14,32,0)); border-top: 1px solid var(--line-2); border-bottom: 1px solid var(--line-2); opacity: 0; transform: translateY(-6px); transition: opacity .5s, transform .5s; }
.sm-toast.on { opacity: 1; transform: none; }
.sm-toast .ic { flex: none; width: 34px; height: 34px; padding: 5px; border-radius: 50%; color: var(--gold-hi); box-shadow: 0 0 0 1px var(--line), 0 0 14px rgba(255,214,140,.25) inset; }
.sm-toast .tx { min-width: 0; flex: 1; }
.sm-toast .k { font: 500 10px var(--sans); letter-spacing: .24em; text-transform: uppercase; color: var(--gold); }
.sm-toast .n { font: 600 clamp(14px, 2vh + 6px, 19px) var(--serif); color: var(--ivory); }
.sm-toast .d { font: italic 12px var(--serif); color: var(--ivory-dim); margin-top: 1px; }

/* ------------------------------------------------------------------ touch controls */
.sm-touch { touch-action: none; }
#sm-ui .sm-touch.on { pointer-events: auto; }
.sm-ctrls { position: absolute; inset: 0; transition: opacity .35s ease; }
.sm-ctrls.gone { opacity: 0 !important; transition: opacity .25s; }
.sm-b { position: absolute; border-radius: 50%; transform: translate(-50%,-50%); color: var(--ivory); pointer-events: none;
  background: radial-gradient(circle at 50% 38%, rgba(255,246,226,.16), rgba(26,18,40,.42) 62%, rgba(16,10,26,.52));
  box-shadow: 0 0 0 1.2px rgba(234,208,154,.55), 0 2px 10px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.12);
  transition: transform .08s ease, background .12s, box-shadow .2s, opacity .3s; }
#sm-ui .sm-b > .sm-ico { position: absolute; left: 24%; top: 24%; width: 52%; height: 52%; }
#sm-ui .sm-b.light > .sm-ico { left: 26%; top: 26%; width: 48%; height: 48%; }
.sm-b.on { transform: translate(-50%,-50%) scale(.9); background: radial-gradient(circle at 50% 40%, rgba(255,240,200,.55), rgba(190,150,90,.42) 60%, rgba(60,40,30,.5)); box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 18px rgba(255,220,150,.6); }
.sm-b.off { opacity: .38; }
.sm-b.art { color: rgba(246,239,226,.5); }
.sm-b.art.lit { color: var(--gold-hi); box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 16px rgba(255,214,140,.65); }
.sm-b .pips { position: absolute; left: 50%; bottom: 9%; transform: translateX(-50%); display: flex; gap: 3px; }
.sm-b .pips i { width: 4px; height: 4px; transform: rotate(45deg); background: currentColor; opacity: .9; }
.sm-b.light.grace { color: var(--gold-hi); box-shadow: 0 0 0 2px var(--gold-hi), 0 0 26px rgba(255,214,140,.95); animation: sm-pulse 0.9s ease-in-out infinite; }
.sm-b.guard.held { box-shadow: 0 0 0 1.8px #cfe4ff, 0 0 16px rgba(180,215,255,.55); }
.sm-b .cnt { position: absolute; right: -8%; bottom: -6%; min-width: 42%; height: 42%; border-radius: 50%; background: var(--glass-3); box-shadow: 0 0 0 1px var(--line); font: 600 calc(11px * var(--k)) var(--serif); display: flex; align-items: center; justify-content: center; color: var(--gold-hi); }
.sm-b.slot { border-radius: 30%; }
.sm-b.slot.cur { color: var(--gold-hi); box-shadow: 0 0 0 1.8px var(--gold-hi), 0 0 14px rgba(255,214,140,.55); background: radial-gradient(circle at 50% 38%, rgba(255,236,190,.28), rgba(40,28,44,.55)); }
.sm-b.slot.empty > .sm-ico { opacity: .25; }
.sm-b.slot .num { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 2px); font: 600 calc(9px * var(--k)) var(--sans); letter-spacing: .1em; color: var(--ivory-dim); }
.sm-b.slot.flash { animation: sm-slotflash .6s ease-out; }
@keyframes sm-slotflash { 0% { box-shadow: 0 0 0 3px #fff, 0 0 30px #ffe7a8; } 100% { } }
.sm-b.interact { color: var(--gold-hi); box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 18px rgba(255,214,140,.5); animation: sm-intr 2s ease-in-out infinite; }
@keyframes sm-intr { 50% { box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 26px rgba(255,214,140,.8); } }
.sm-b .lbl { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; font: 600 calc(12px * var(--k)) var(--serif); letter-spacing: .14em; text-transform: uppercase; color: var(--gold-hi); text-shadow: 0 1px 6px #000, 0 0 10px rgba(255,214,140,.5); }
.sm-stick { position: absolute; left: 0; top: 0; transform: translate(-50%,-50%); pointer-events: none; transition: opacity .25s; }
.sm-stick .base { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(16,10,26,.28), rgba(16,10,26,.12) 70%, transparent 71%); box-shadow: 0 0 0 1.2px rgba(234,208,154,.42); }
.sm-stick .sprint { position: absolute; border-radius: 50%; border: 1px dashed rgba(234,208,154,.35); }
.sm-stick.sprinting .sprint { border: 1.5px solid var(--gold-hi); box-shadow: 0 0 12px rgba(255,214,140,.55); }
.sm-stick .knob { position: absolute; left: 50%; top: 50%; border-radius: 50%; transform: translate(-50%,-50%); background: radial-gradient(circle at 50% 38%, rgba(255,246,226,.55), rgba(200,170,120,.38) 60%, rgba(60,40,40,.45)); box-shadow: 0 0 0 1.2px var(--gold-hi), 0 2px 8px rgba(0,0,0,.4); }
.sm-stick.ghost { opacity: .45; }
.sm-stick.ghost .knob { opacity: .5; }

/* top HUD buttons (pause / skip) */
.sm-topbtn { position: absolute; width: calc(36px * var(--k)); height: calc(36px * var(--k)); padding: calc(9px * var(--k)); border-radius: 50%; pointer-events: auto; color: var(--ivory); background: rgba(16,10,26,.38); box-shadow: 0 0 0 1px var(--line-2); opacity: .7; transition: opacity .3s; }
.sm-topbtn:active { opacity: 1; background: rgba(60,44,70,.6); }
.sm-skip { position: absolute; right: calc(var(--sr) + 14px); bottom: calc(var(--sb) + 14px); display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 999px; pointer-events: auto; background: rgba(16,10,26,.45); box-shadow: 0 0 0 1px var(--line-2); font: 600 11px var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--ivory-dim); }
.sm-skip svg.ring { width: 22px; height: 22px; transform: rotate(-90deg); }
.sm-skip svg.ring circle { fill: none; stroke-width: 2.4; }
.sm-skip svg.ring .t { stroke: rgba(246,239,226,.2); }
.sm-skip svg.ring .p { stroke: var(--gold-hi); }

/* ------------------------------------------------------------------ subtitles, choices, gestures */
.sm-subs { position: absolute; left: 50%; bottom: calc(var(--sb) + 15%); transform: translateX(-50%); width: min(78vw, 860px); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.sm-sub { max-width: 100%; text-align: center; padding: .35em .9em .45em; border-radius: 6px; font: calc(17px * var(--sub)) var(--serif); line-height: 1.3; color: var(--ivory); text-shadow: 0 1px 3px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.6); opacity: 0; transition: opacity .35s; }
.sm-sub.on { opacity: 1; }
#sm-ui.subbg .sm-sub { background: rgba(10,6,18,.62); }
.sm-sub .who { display: block; font: 600 calc(11px * var(--sub)) var(--sans); letter-spacing: .24em; text-transform: uppercase; margin-bottom: .15em; }
.sm-sub.voce { font-style: italic; color: #fff1cc; text-shadow: 0 0 14px rgba(255,214,150,.75), 0 1px 3px #000; }
.sm-sub.caption { font-style: italic; color: var(--ivory); }
.sm-sub.small { font-size: calc(14px * var(--sub)); opacity: .92; }
.sm-capcenter { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(76vw, 820px); text-align: center; font: italic calc(20px * var(--sub)) var(--serif); line-height: 1.45; color: var(--ivory); text-shadow: 0 0 18px rgba(0,0,0,.8); opacity: 0; transition: opacity .9s; }
.sm-capcenter.on { opacity: 1; }
.sm-choices { position: absolute; left: 50%; bottom: calc(var(--sb) + 14%); transform: translateX(-50%); display: flex; gap: clamp(14px, 4vw, 48px); pointer-events: auto; }
.sm-choice { position: relative; min-width: clamp(120px, 20vw, 220px); padding: 14px 22px; border-radius: 4px; text-align: center; font: 600 clamp(15px, 2.4vh + 6px, 22px) var(--serif); letter-spacing: .18em; text-transform: uppercase; color: var(--ivory); background: linear-gradient(180deg, rgba(40,28,56,.7), rgba(16,10,26,.82)); box-shadow: 0 0 0 1px var(--line), 0 6px 30px rgba(0,0,0,.45); }
.sm-choice:active, .sm-choice.held { box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 30px rgba(255,214,140,.45); color: var(--gold-hi); }
.sm-choice .hold { display: block; margin-top: 6px; font: 500 10px var(--sans); letter-spacing: .24em; color: var(--gold); }
.sm-choice svg.kneel { position: absolute; left: 50%; top: -58px; width: 48px; height: 48px; margin-left: -24px; transform: rotate(-90deg); opacity: 0; transition: opacity .3s; }
.sm-choice.held svg.kneel, .sm-choice.prog svg.kneel { opacity: 1; }
.sm-choice svg.kneel circle { fill: none; stroke-width: 3; }
.sm-choice svg.kneel .t { stroke: rgba(246,239,226,.15); }
.sm-choice svg.kneel .p { stroke: var(--gold-hi); filter: drop-shadow(0 0 4px #ffd890); }
.sm-gesture { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
.sm-gesture svg { position: absolute; left: 50%; top: 46%; width: min(52vh, 46vw); height: min(52vh, 46vw); transform: translate(-50%,-50%); overflow: visible; }
.sm-gesture .guide { fill: none; stroke: rgba(255,236,190,.25); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
.sm-gesture .trace { fill: none; stroke: var(--gold-hi); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 8px #ffd890); }
.sm-gesture .dot { fill: #fff6dc; filter: drop-shadow(0 0 10px #ffd890); }
.sm-gesture .start { fill: none; stroke: var(--gold-hi); stroke-width: 2; animation: sm-pulse 1.2s ease-in-out infinite; }
.sm-gesture .ptxt { position: absolute; left: 50%; bottom: calc(var(--sb) + 9%); transform: translateX(-50%); width: min(80vw, 700px); text-align: center; font: italic calc(17px * var(--sub)) var(--serif); color: var(--gold-hi); text-shadow: 0 0 12px rgba(255,214,140,.6), 0 1px 3px #000; }
.sm-gesture .alt { position: absolute; left: 50%; bottom: calc(var(--sb) + 3%); transform: translateX(-50%); font: 500 10px var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--ivory-dim); }

/* ------------------------------------------------------------------ fades, death, loading, overlays */
.sm-fade { position: absolute; inset: 0; background: #000; opacity: 0; }
.sm-fade.white { background: #fff8ec; }
.sm-death { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: opacity 1.2s ease; background: radial-gradient(ellipse at 50% 55%, rgba(30,18,40,.15), rgba(6,4,10,.65) 80%); }
.sm-death.on { opacity: 1; }
.sm-death .t { font: italic 400 clamp(20px, 4.6vh + 6px, 40px) var(--serif); letter-spacing: .08em; color: var(--ivory); text-shadow: 0 0 24px rgba(255,214,150,.3); text-align: center; padding: 0 8vw; }
.sm-death .s { margin-top: .8em; font: 500 11px var(--sans); letter-spacing: .32em; text-transform: uppercase; color: var(--gold); opacity: .8; }
.sm-loading { position: absolute; right: calc(var(--sr) + 18px); bottom: calc(var(--sb) + 16px); width: 34px; height: 34px; color: var(--gold-hi); opacity: 0; transition: opacity .4s; }
.sm-loading.on { opacity: .9; }
.sm-loading svg { animation: sm-spin 3.2s linear infinite; }
@keyframes sm-spin { to { transform: rotate(360deg); } }
.sm-veil { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 60%, #2a1f3d, #0c0814 75%); opacity: 0; transition: opacity .5s; display: flex; align-items: center; justify-content: center; }
.sm-veil.on { opacity: 1; }
.sm-veil .t { font: italic clamp(14px, 2.4vh + 6px, 20px) var(--serif); letter-spacing: .2em; color: var(--gold); }
.sm-portrait { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: radial-gradient(ellipse at 50% 60%, #2a1f3d, #0c0814 75%); pointer-events: auto; text-align: center; padding: 10vw; }
.sm-portrait i { width: 64px; height: 64px; color: var(--gold-hi); animation: sm-rot 2.4s ease-in-out infinite; }
@keyframes sm-rot { 0%,30% { transform: rotate(0); } 60%,100% { transform: rotate(-90deg); } }
.sm-portrait .t { font: 500 18px var(--serif); letter-spacing: .14em; }
.sm-portrait .s { font: italic 14px var(--serif); color: var(--ivory-dim); }
.sm-dbgov { position: absolute; left: calc(var(--sl) + 8px); bottom: calc(var(--sb) + 8px); padding: 6px 8px; border-radius: 4px; background: rgba(0,0,0,.55); font: 10.5px/1.35 ui-monospace,Menlo,monospace; color: #e9f4e0; white-space: pre; }

/* ------------------------------------------------------------------ HUD additions: desktop trio + prompt, tap-to-advance, lock state */
.sm-trio { position: absolute; right: calc(var(--sr) + 16px); bottom: calc(var(--sb) + 14px); display: flex; gap: calc(6px * var(--k)); }
.sm-trio-w { width: calc(34px * var(--k)); height: calc(34px * var(--k)); padding: calc(5px * var(--k)); border-radius: 30%; color: var(--ivory-dim); background: rgba(16,10,26,.42); box-shadow: 0 0 0 1px var(--line-2); transition: color .2s, box-shadow .2s; }
.sm-trio-w.cur { color: var(--gold-hi); box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 12px rgba(255,214,140,.45); }
.sm-trio-w.empty { opacity: .35; }
.sm-prompt { position: absolute; left: 50%; bottom: calc(var(--sb) + 26%); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 7px 18px 7px 12px; border-radius: 999px; background: linear-gradient(90deg, rgba(20,14,32,0), rgba(20,14,32,.66) 20%, rgba(20,14,32,.66) 80%, rgba(20,14,32,0)); font: 600 calc(14px * var(--k)) var(--serif); letter-spacing: .16em; text-transform: uppercase; color: var(--gold-hi); text-shadow: 0 1px 6px #000; opacity: 0; transition: opacity .3s; white-space: nowrap; }
.sm-prompt.on { opacity: 1; }
.sm-prompt i { width: calc(20px * var(--k)); height: calc(20px * var(--k)); }
.sm-tapcatch { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
.sm-b.lock.act { color: var(--gold-hi); box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 14px rgba(255,214,140,.5); }
.sm-st[title] { cursor: default; }

/* ------------------------------------------------------------------ screens (menus) */
.sm-screen { position: absolute; inset: 0; pointer-events: auto; display: flex; flex-direction: column; color: var(--ivory);
  padding: calc(var(--st) + 10px) calc(var(--sr) + 16px) calc(var(--sb) + 10px) calc(var(--sl) + 16px);
  background: radial-gradient(ellipse 90% 60% at 50% 115%, rgba(240,170,110,.26), transparent 70%), linear-gradient(180deg, rgba(16,10,28,.90), rgba(30,20,46,.93));
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); animation: sm-in .28s ease-out; }
#sm-ui.lowfx .sm-screen { -webkit-backdrop-filter: none; backdrop-filter: none; }
.sm-screen.clear { background: radial-gradient(ellipse 120% 70% at 50% 120%, rgba(240,170,110,.18), transparent 70%), linear-gradient(90deg, rgba(14,9,24,.88) 0%, rgba(14,9,24,.70) 46%, rgba(14,9,24,.12) 100%); -webkit-backdrop-filter: none; backdrop-filter: none; }
@keyframes sm-in { from { opacity: 0; } to { opacity: 1; } }
.sm-screen.altar { background: radial-gradient(ellipse 70% 90% at 100% 100%, rgba(255,196,130,.16), transparent 60%), linear-gradient(90deg, rgba(14,9,24,.92) 0%, rgba(16,10,28,.84) 40%, rgba(18,12,30,.66) 100%); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.sm-pipsrow { display: inline-flex; gap: 3px; vertical-align: middle; margin-left: 4px; }
.sm-pipsrow i { width: 7px; height: 7px; transform: rotate(45deg); box-shadow: 0 0 0 1px var(--line); }
.sm-pipsrow i.on { background: var(--gold-hi); box-shadow: 0 0 4px rgba(255,226,160,.8); }
#sm-ui .sm-ico.sm-inl { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; }
.sm-read { font-size: clamp(14px, 1.7vh + 8px, 18px); line-height: 1.6; color: var(--ivory); white-space: pre-line; margin-top: 8px; }
.sm-slotc.empty .g { color: var(--line); }
.sm-tile > .sm-ico { display: block; }
.sm-cards.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.sm-cards.four .sm-todc .d { line-height: 1.25; }
.sm-cards.four .sm-todc { padding: 8px 10px; height: clamp(96px, 26vh, 160px); }
.sm-cards.four .sm-todc i { width: 22px; height: 22px; right: 8px; top: 8px; }
.sm-pausebtn { top: calc(var(--st) + 10px); right: calc(var(--sr) + 12px); z-index: 2; }
.sm-pausebtn.mir { right: auto; left: calc(var(--sl) + 12px); }
.sm-sum { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(120px, 20vw, 190px), 1fr)); gap: 8px; margin: 6px 0 10px; }
.sm-sum > div { padding: 10px 12px; border-radius: 6px; background: rgba(10,6,18,.38); box-shadow: 0 0 0 1px var(--line-3); }
.sm-sum b { display: block; font: 500 clamp(18px, 2.6vh + 8px, 26px) var(--serif); color: var(--gold-hi); font-variant-numeric: tabular-nums; }
.sm-sum span { font: 600 9.5px var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
#sm-ui.inmenu .sm-subs { left: auto; right: calc(var(--sr) + 16px); bottom: calc(var(--sb) + 8px); transform: none; width: min(66vw, 760px); }
#sm-ui.inmenu .sm-sub { background: rgba(14,9,24,.92); box-shadow: 0 0 0 1px var(--line-2), 0 8px 30px rgba(0,0,0,.5); }
.sm-slotc.empty .n { color: var(--ivory-dim); font-style: italic; }
.sm-detail .big .sm-h2 { margin: 0; }
.sm-split > .a .sm-li { min-height: 46px; }
.sm-head { flex: none; display: flex; align-items: center; gap: 12px; min-height: 44px; }
.sm-head .ttl { font: 500 clamp(17px, 3vh + 7px, 28px) var(--serif); letter-spacing: .16em; text-transform: uppercase; color: var(--gold-hi); }
.sm-head .sub { font: italic clamp(12px, 1.6vh + 6px, 16px) var(--serif); color: var(--ivory-dim); margin-left: auto; text-align: right; }
.sm-iconbtn { flex: none; width: 40px; height: 40px; padding: 10px; border-radius: 50%; color: var(--ivory); box-shadow: 0 0 0 1px var(--line-2); background: rgba(255,255,255,.03); }
.sm-iconbtn:active { background: rgba(234,208,154,.18); }
.sm-rule { flex: none; height: 1px; margin: 6px 0 8px; background: linear-gradient(90deg, transparent, var(--line) 15%, var(--line) 85%, transparent); position: relative; }
.sm-rule::after { content: ""; position: absolute; left: 50%; top: -3px; width: 6px; height: 6px; margin-left: -3px; transform: rotate(45deg); background: var(--gold); }
.sm-body { flex: 1; min-height: 0; display: flex; gap: clamp(10px, 2.4vw, 28px); }
.sm-nav { flex: none; width: clamp(150px, 25vw, 260px); display: flex; flex-direction: column; gap: 2px; overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.sm-navi { display: flex; align-items: center; gap: 10px; padding: 9px 10px; min-height: 42px; border-radius: 3px; text-align: left; font: 500 clamp(14px, 1.8vh + 7px, 19px) var(--serif); letter-spacing: .05em; color: var(--ivory-dim); transition: background .15s, color .15s; }
.sm-navi i { flex: none; width: 22px; height: 22px; color: var(--gold); opacity: .8; }
.sm-navi.sel { color: var(--gold-hi); background: linear-gradient(90deg, rgba(234,208,154,.16), rgba(234,208,154,0)); box-shadow: inset 2px 0 0 var(--gold); }
.sm-navi:active { background: rgba(234,208,154,.12); }
.sm-navi.dis { opacity: .4; }
.sm-panel { flex: 1; min-width: 0; overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 2px 4px 18px 2px; }
.sm-h2 { font: 500 clamp(15px, 2.4vh + 6px, 22px) var(--serif); letter-spacing: .08em; color: var(--gold-hi); margin: 2px 0 6px; }
.sm-h3 { font: 600 10.5px var(--sans); letter-spacing: .26em; text-transform: uppercase; color: var(--gold); margin: 14px 0 6px; }
.sm-p { font: clamp(13px, 1.5vh + 7px, 16px)/1.45 var(--serif); color: var(--ivory-dim); margin: 4px 0; }
.sm-p.it { font-style: italic; }
.sm-small { font: 11px/1.4 var(--sans); color: var(--ivory-dim); letter-spacing: .04em; }
.sm-row { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 6px 2px; border-bottom: 1px solid var(--line-3); }
.sm-row .lab { flex: 1; min-width: 0; font: clamp(13px, 1.5vh + 7px, 16px) var(--serif); color: var(--ivory); }
.sm-row .lab small { display: block; font: 11px var(--sans); color: var(--ivory-dim); letter-spacing: .02em; margin-top: 1px; }
.sm-row .val { flex: none; font: 600 12px var(--sans); color: var(--gold); min-width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
.sm-pill { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 8px 18px; border-radius: 999px; font: 600 12px var(--sans); letter-spacing: .18em; text-transform: uppercase; color: var(--ivory); background: rgba(255,255,255,.04); box-shadow: 0 0 0 1px var(--line); transition: background .15s, box-shadow .15s; }
.sm-pill i { width: 18px; height: 18px; }
.sm-pill:active { background: rgba(234,208,154,.2); }
.sm-pill.gold { color: var(--night); background: linear-gradient(180deg,#fff0c8,#e2bc76); box-shadow: 0 0 0 1px #fff3d2, 0 4px 18px rgba(255,200,120,.25); }
.sm-pill.gold:active { filter: brightness(.92); }
.sm-pill.dis { opacity: .4; pointer-events: none; }
.sm-pill.danger { color: #ffd4c8; box-shadow: 0 0 0 1px rgba(255,120,100,.5); }
.sm-pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.sm-seg { flex: none; display: inline-flex; border-radius: 999px; box-shadow: 0 0 0 1px var(--line); overflow: hidden; }
.sm-seg button { min-width: 44px; min-height: 36px; padding: 6px 12px; font: 600 11.5px var(--sans); letter-spacing: .1em; color: var(--ivory-dim); }
.sm-seg button + button { box-shadow: -1px 0 0 var(--line-2); }
.sm-seg button.sel { color: var(--night); background: linear-gradient(180deg,#fff0c8,#e2bc76); }
.sm-tog { flex: none; position: relative; width: 50px; height: 28px; border-radius: 999px; background: rgba(255,255,255,.08); box-shadow: 0 0 0 1px var(--line-2); transition: background .2s; }
.sm-tog::after { content: ""; position: absolute; left: 3px; top: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--ivory-dim); transition: transform .2s, background .2s; }
.sm-tog.on { background: rgba(234,208,154,.45); box-shadow: 0 0 0 1px var(--gold); }
.sm-tog.on::after { transform: translateX(22px); background: #fff3d2; }
.sm-range { flex: none; width: clamp(110px, 22vw, 240px); height: 32px; -webkit-appearance: none; appearance: none; background: transparent; touch-action: none; }
.sm-range::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(90deg, var(--gold) var(--p,50%), rgba(255,255,255,.15) var(--p,50%)); }
.sm-range::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -9.5px; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #fff6dc, #e2bc76); box-shadow: 0 0 0 1px #fff3d2, 0 2px 6px rgba(0,0,0,.5); }
.sm-range::-moz-range-track { height: 3px; background: rgba(255,255,255,.15); }
.sm-range::-moz-range-progress { height: 3px; background: var(--gold); }
.sm-range::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 50%; background: #f0d49a; }
.sm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(64px, 11vw, 96px), 1fr)); gap: 8px; }
.sm-tile { position: relative; aspect-ratio: 1; border-radius: 6px; padding: 12% 20% 30%; color: var(--ivory); background: radial-gradient(circle at 50% 35%, rgba(255,246,226,.08), rgba(16,10,26,.5)); box-shadow: 0 0 0 1px var(--line-2); }
.sm-tile.sel { box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 14px rgba(255,214,140,.35); color: var(--gold-hi); }
.sm-tile.eq::after { content: attr(data-slot); position: absolute; right: 4px; top: 3px; font: 700 10px var(--sans); color: var(--night); background: var(--gold); border-radius: 3px; padding: 0 4px; }
.sm-tile.locked { opacity: .35; }
.sm-tile.unknown { color: rgba(246,239,226,.18); }
.sm-tile .tn { position: absolute; left: 3px; right: 3px; bottom: 3px; font: 10px var(--sans); text-align: center; color: var(--ivory-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sm-slots { display: flex; gap: 10px; margin: 2px 0 10px; }
.sm-slotc { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; background: rgba(16,10,26,.5); box-shadow: 0 0 0 1px var(--line-2); text-align: left; }
.sm-slotc.sel { box-shadow: 0 0 0 1.6px var(--gold-hi), 0 0 18px rgba(255,214,140,.3); }
.sm-slotc .g { flex: none; width: 34px; height: 34px; color: var(--gold-hi); }
.sm-slotc .n { min-width: 0; font: 600 13px var(--serif); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; }
.sm-slotc .n small { display: block; font: 500 9.5px var(--sans); letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
.sm-split { display: flex; gap: clamp(10px, 2vw, 22px); min-height: 0; }
.sm-split > .a { flex: 1.2; min-width: 0; }
.sm-split > .b { flex: 1; min-width: 0; }
.sm-detail { padding: 10px 12px; border-radius: 6px; background: rgba(10,6,18,.38); box-shadow: 0 0 0 1px var(--line-3); }
.sm-detail .big { display: flex; gap: 12px; align-items: center; }
.sm-detail .big i { flex: none; width: 48px; height: 48px; color: var(--gold-hi); }
.sm-stats { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font: 12px var(--sans); color: var(--ivory-dim); margin: 8px 0; }
.sm-stats b { color: var(--ivory); font-weight: 600; }
.sm-art { margin: 8px 0; padding-left: 10px; border-left: 2px solid var(--line); }
.sm-art .an { font: 600 14px var(--serif); color: var(--gold-hi); }
.sm-art .ac { font: 600 9.5px var(--sans); letter-spacing: .2em; color: var(--gold); text-transform: uppercase; }
.sm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(120px, 18vw, 180px), 1fr)); gap: 10px; }
.sm-todc { position: relative; height: clamp(84px, 22vh, 150px); border-radius: 6px; overflow: hidden; text-align: left; box-shadow: 0 0 0 1px var(--line-2); padding: 10px; display: flex; flex-direction: column; justify-content: flex-end; }
.sm-todc.alba { background: linear-gradient(180deg,#6f5a9a 0%,#d9a0a8 55%,#f7d6a2 100%); }
.sm-todc.giorno { background: linear-gradient(180deg,#6c62b8 0%,#b6a8e0 45%,#f4e2b4 100%); }
.sm-todc.tramonto { background: linear-gradient(180deg,#3a1f4a 0%,#b04a3e 55%,#f29a4e 100%); }
.sm-todc.notte { background: radial-gradient(1px 1px at 20% 20%, #fff 50%, transparent), radial-gradient(1px 1px at 70% 30%, #fff 50%, transparent), radial-gradient(1.4px 1.4px at 45% 12%, #fff 50%, transparent), radial-gradient(1px 1px at 85% 15%, #fff 50%, transparent), linear-gradient(180deg,#0e0a22 0%,#2a1f4a 60%,#4a3266 100%); }
.sm-todc::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(10,6,18,.75)); }
.sm-todc > * { position: relative; z-index: 1; }
.sm-todc i { position: absolute; right: 10px; top: 10px; width: 28px; height: 28px; color: #fff8e6; }
.sm-todc .n { font: 600 clamp(15px, 2vh + 8px, 21px) var(--serif); letter-spacing: .1em; color: #fff; }
.sm-todc .d { font: italic 11.5px var(--serif); color: rgba(255,248,236,.85); }
.sm-todc.sel { box-shadow: 0 0 0 2px var(--gold-hi), 0 0 22px rgba(255,214,140,.45); }
.sm-todc.sel .n::after { content: " \\2726"; color: var(--gold-hi); }
.sm-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.sm-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 5px 12px; border-radius: 999px; font: 600 11.5px var(--sans); letter-spacing: .06em; color: var(--ivory-dim); box-shadow: 0 0 0 1px var(--line-2); }
.sm-chip i { width: 16px; height: 16px; }
.sm-chip.sel { color: var(--night); background: linear-gradient(180deg,#fff0c8,#e2bc76); box-shadow: none; }
.sm-chip.dis { opacity: .35; pointer-events: none; }
.sm-li { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 50px; padding: 8px 10px; border-bottom: 1px solid var(--line-3); text-align: left; }
.sm-li:active { background: rgba(234,208,154,.1); }
.sm-li.sel { background: linear-gradient(90deg, rgba(234,208,154,.14), transparent); }
.sm-li i { flex: none; width: 26px; height: 26px; color: var(--gold); }
.sm-li .tx { flex: 1; min-width: 0; }
.sm-li .n { font: 600 clamp(14px, 1.6vh + 8px, 18px) var(--serif); color: var(--ivory); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-li .d { font: 11.5px var(--sans); color: var(--ivory-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-li .r { flex: none; font: 600 11px var(--sans); letter-spacing: .1em; color: var(--gold); }
.sm-li.dis { opacity: .4; }
.sm-text { width: 100%; min-height: 90px; padding: 10px; border-radius: 6px; border: 0; resize: vertical; background: rgba(10,6,18,.55); box-shadow: 0 0 0 1px var(--line-2); font: 12px/1.4 ui-monospace,Menlo,monospace; color: var(--ivory); word-break: break-all; }
.sm-input { width: 100%; height: 44px; padding: 0 12px; border-radius: 4px; border: 0; background: rgba(10,6,18,.55); box-shadow: 0 0 0 1px var(--line); font: 600 18px var(--serif); letter-spacing: .06em; color: var(--ivory); }
.sm-input:focus, .sm-text:focus { outline: none; box-shadow: 0 0 0 1.6px var(--gold-hi); }
.sm-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.sm-sw { width: 34px; height: 34px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.4), 0 0 0 2px var(--line-2); }
.sm-sw.sel { box-shadow: 0 0 0 2px var(--night), 0 0 0 4px var(--gold-hi); }
.sm-note { font: italic 12px var(--serif); color: var(--gold); margin: 6px 0; }
.sm-empty { padding: 30px 10px; text-align: center; font: italic 15px var(--serif); color: var(--ivory-dim); }
.sm-dialog { position: absolute; inset: 0; pointer-events: auto; display: flex; align-items: center; justify-content: center; background: rgba(6,4,10,.6); animation: sm-in .2s; z-index: 50; padding: 16px; }
.sm-dialog .box { width: min(92vw, 460px); max-height: 92vh; overflow-y: auto; padding: 18px 20px; border-radius: 8px; background: linear-gradient(180deg, rgba(42,30,58,.97), rgba(20,14,32,.98)); box-shadow: 0 0 0 1px var(--line), 0 20px 60px rgba(0,0,0,.6); }
.sm-dialog .box .sm-pills { justify-content: flex-end; margin-top: 14px; }
.sm-toastmini { position: absolute; left: 50%; bottom: calc(var(--sb) + 18px); transform: translateX(-50%); padding: 8px 16px; border-radius: 999px; background: var(--glass-3); box-shadow: 0 0 0 1px var(--line); font: 12px var(--sans); letter-spacing: .06em; pointer-events: none; animation: sm-in .2s; z-index: 60; }

/* title */
.sm-title { position: absolute; inset: 0; pointer-events: auto; overflow: hidden; background: radial-gradient(ellipse 120% 80% at 50% 118%, #e79a68 0%, #a2506a 18%, #4a2a5e 42%, #1d1430 70%, #0d0916 100%); }
.sm-title canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.sm-title .hz { position: absolute; left: -10%; right: -10%; bottom: 23%; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,226,170,.65) 30%, rgba(255,240,210,.95) 50%, rgba(255,226,170,.65) 70%, transparent); box-shadow: 0 0 30px 6px rgba(255,190,120,.28); }
.sm-title .logo { position: absolute; left: 0; right: 0; top: calc(var(--st) + 10%); text-align: center; }
.sm-title .logo .seal { width: clamp(30px, 7vh, 54px); height: clamp(30px, 7vh, 54px); color: var(--gold-hi); margin: 0 auto 6px; display: block; filter: drop-shadow(0 0 10px rgba(255,214,140,.7)); }
.sm-title .logo h1 { margin: 0; font: 400 clamp(30px, 10vh + 2px, 92px) var(--serif); letter-spacing: .32em; padding-left: .32em; text-transform: uppercase; background: linear-gradient(180deg,#fff8e4 0%,#f2d595 50%,#b4884a 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 26px rgba(255,210,140,.35)); }
.sm-title .logo .tag { font: italic clamp(13px, 2.4vh + 5px, 21px) var(--serif); color: rgba(255,240,215,.82); letter-spacing: .12em; }
.sm-title .menu { position: absolute; left: 50%; bottom: calc(var(--sb) + 7%); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: clamp(2px, .8vh, 8px); }
.sm-tbtn { min-width: 230px; padding: clamp(5px, 1.2vh, 10px) 20px; font: 500 clamp(15px, 2.6vh + 6px, 24px) var(--serif); letter-spacing: .22em; text-transform: uppercase; color: rgba(255,244,224,.86); text-shadow: 0 1px 8px rgba(0,0,0,.6); transition: color .2s, letter-spacing .3s; }
.sm-tbtn:active, .sm-tbtn:focus-visible { color: var(--gold-hi); outline: none; }
.sm-tbtn.first { color: var(--gold-hi); }
.sm-tbtn.first::before, .sm-tbtn.first::after { content: "\\2726"; font-size: .55em; margin: 0 .9em; vertical-align: middle; color: var(--gold); }
.sm-title .row2 { display: flex; gap: 6px; margin-top: 4px; }
.sm-title .row2 .sm-tbtn { min-width: 0; font-size: clamp(11px, 1.6vh + 5px, 15px); letter-spacing: .2em; color: rgba(255,244,224,.6); }
.sm-title .ver { position: absolute; right: calc(var(--sr) + 12px); bottom: calc(var(--sb) + 8px); font: 10px var(--sans); color: rgba(255,240,220,.35); letter-spacing: .1em; }
.sm-slot { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 14px; margin-bottom: 8px; border-radius: 6px; background: rgba(10,6,18,.42); box-shadow: 0 0 0 1px var(--line-2); text-align: left; }
.sm-slot:active { background: rgba(234,208,154,.12); }
.sm-slot .no { flex: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font: 600 16px var(--serif); color: var(--gold-hi); box-shadow: 0 0 0 1px var(--line); }
.sm-slot .tx { flex: 1; min-width: 0; }
.sm-slot .n { font: 600 clamp(15px, 1.8vh + 8px, 19px) var(--serif); }
.sm-slot .d { font: 11.5px var(--sans); color: var(--ivory-dim); margin-top: 2px; }
.sm-slot .acts { display: flex; gap: 6px; }

.sm-title .front { position: absolute; inset: 0; animation: sm-in .8s ease-out; }
.sm-title .sky { position: absolute; inset: 0 0 40% 0; opacity: .75; background:
  radial-gradient(1px 1px at 8% 14%, #fff 50%, transparent), radial-gradient(1px 1px at 19% 32%, rgba(255,255,255,.7) 50%, transparent),
  radial-gradient(1.4px 1.4px at 31% 9%, #fff 50%, transparent), radial-gradient(1px 1px at 44% 24%, rgba(255,255,255,.6) 50%, transparent),
  radial-gradient(1px 1px at 58% 12%, #fff 50%, transparent), radial-gradient(1.4px 1.4px at 69% 30%, rgba(255,240,220,.8) 50%, transparent),
  radial-gradient(1px 1px at 81% 8%, #fff 50%, transparent), radial-gradient(1px 1px at 92% 22%, rgba(255,255,255,.7) 50%, transparent),
  radial-gradient(1px 1px at 26% 46%, rgba(255,255,255,.4) 50%, transparent), radial-gradient(1px 1px at 76% 44%, rgba(255,255,255,.4) 50%, transparent);
  -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent); mask-image: linear-gradient(180deg, #000 30%, transparent); animation: sm-twinkle 6s ease-in-out infinite; }
@keyframes sm-twinkle { 50% { opacity: .5; } }
.sm-title .mist { position: absolute; left: 0; right: 0; bottom: 0; height: 24%; background: linear-gradient(180deg, rgba(255,196,140,.16), rgba(70,38,80,.55) 45%, rgba(18,12,30,.85)); }
.sm-title .sm-screen.clear { background: radial-gradient(ellipse 120% 70% at 50% 120%, rgba(240,170,110,.16), transparent 70%), linear-gradient(90deg, rgba(14,9,24,.9) 0%, rgba(14,9,24,.8) 50%, rgba(14,9,24,.6) 100%); }
.sm-slot { cursor: default; }
.sm-slot.tap { cursor: pointer; }
.sm-slot.dis { opacity: .5; }
.sm-slot.empty .n { font-style: italic; color: var(--ivory-dim); font-weight: 500; }
.sm-slot.empty .no { color: var(--ivory-dim); box-shadow: 0 0 0 1px var(--line-3); }
.sm-slot .tx > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-slot .d.w { font-size: 10.5px; opacity: .7; }
.sm-iconbtn.small { width: 36px; height: 36px; padding: 9px; }
.sm-note.err { font: 12px var(--sans); color: var(--red-soft); }
.sm-cfield { padding: 6px 0 10px; border-bottom: 1px solid var(--line-3); }
.sm-cfield .lab { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font: 600 10px var(--sans); letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-bottom: 6px; }
.sm-cfield .lab .val { font: italic 13px var(--serif); letter-spacing: .04em; text-transform: none; color: var(--ivory); }
.sm-cfield .sm-range { width: 100%; }
.sm-cpair { display: flex; gap: 18px; }
.sm-cpair > * { flex: 1; min-width: 0; }
.sm-creator .prev .sm-pills { justify-content: center; margin-top: 6px; }
.sm-credits .body { display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 2.2vh, 20px); }
.sm-credits .end { margin-top: 4vh; }

/* creator */
.sm-creator { display: flex; gap: clamp(12px, 3vw, 36px); flex: 1; min-height: 0; }
.sm-creator .form { flex: 1.25; min-width: 0; overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain; padding-right: 4px; }
.sm-creator .prev { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.sm-creator .prev svg.fig { width: auto; height: min(58vh, 600px); overflow: visible; }
.sm-creator .prev .pt { font: italic clamp(12px, 1.6vh + 6px, 15px)/1.45 var(--serif); color: var(--ivory-dim); text-align: center; max-width: 34ch; margin-top: 8px; }

/* layout editor */
.sm-editor { position: absolute; inset: 0; pointer-events: auto; touch-action: none; background: radial-gradient(ellipse at 50% 60%, rgba(42,31,61,.55), rgba(12,8,20,.75)); }
.sm-editor .zone { position: absolute; border: 1px dashed rgba(234,208,154,.35); border-radius: 6px; font: 600 10px var(--sans); letter-spacing: .2em; text-transform: uppercase; color: rgba(234,208,154,.55); padding: 6px; }
.sm-editor .sm-b { pointer-events: none; }
.sm-editor .sm-b.sel { box-shadow: 0 0 0 2px var(--gold-hi), 0 0 22px rgba(255,214,140,.6); }
.sm-editor .sm-b.bad { box-shadow: 0 0 0 2px var(--red-soft), 0 0 14px rgba(255,90,60,.5); }
.sm-editor .bar { position: absolute; left: 50%; top: calc(var(--st) + 8px); transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 94vw; padding: 6px; border-radius: 10px; background: var(--glass-3); box-shadow: 0 0 0 1px var(--line); pointer-events: auto; z-index: 3; }
.sm-editor .bar .sm-pill { min-height: 34px; padding: 6px 12px; font-size: 10.5px; letter-spacing: .12em; }
.sm-editor .insp { position: absolute; left: 50%; bottom: calc(var(--sb) + 8px); transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 14px; max-width: 94vw; padding: 6px 12px; border-radius: 10px; background: var(--glass-3); box-shadow: 0 0 0 1px var(--line); pointer-events: auto; z-index: 3; font: 600 11px var(--sans); letter-spacing: .08em; }
.sm-editor .insp label { display: flex; align-items: center; gap: 6px; }
.sm-editor .insp .sm-range { width: clamp(90px, 16vw, 170px); }
.sm-editor .hint { position: absolute; left: 50%; top: 46%; transform: translateX(-50%); font: italic 14px var(--serif); color: var(--ivory-dim); pointer-events: none; text-align: center; }

/* credits */
.sm-credits { position: absolute; inset: 0; pointer-events: auto; background: radial-gradient(ellipse 110% 70% at 50% 120%, rgba(255,190,120,.55), rgba(140,70,90,.25) 35%, transparent 65%), linear-gradient(180deg, #0c0816, #1d1430 60%, #3a2440); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 8vh 10vw; }
.sm-credits .ln { font: italic clamp(16px, 3vh + 6px, 28px)/1.5 var(--serif); color: var(--ivory); opacity: 0; transition: opacity 1.4s ease; max-width: 900px; }
.sm-credits .ln.title { font: 400 clamp(30px, 10vh, 88px) var(--serif); font-style: normal; letter-spacing: .3em; text-transform: uppercase; background: linear-gradient(180deg,#fff8e4,#f2d595 50%,#b4884a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sm-credits .ln.on { opacity: 1; }
.sm-credits .end { display: flex; flex-direction: column; align-items: center; gap: 14px; opacity: 0; transition: opacity 1.4s; }
.sm-credits .end.on { opacity: 1; }
.sm-credits .end .ty { font: italic clamp(18px, 3.4vh + 6px, 30px) var(--serif); color: var(--gold-hi); }
`;

export function injectStyle(): void {
  if (document.getElementById('sm-ui-style')) return;
  const st = document.createElement('style');
  st.id = 'sm-ui-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}
