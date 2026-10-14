/**
 * Code-drawn icon set (SVG, 24x24, stroke = currentColor). Weapon glyphs are generated along the icon diagonal (pommel at the
 * lower left, tip at the upper right) so the 38 weapon types read as one family.
 */

const SQ = Math.SQRT1_2;
/** Point at distance t along the diagonal from (3.5, 20.5) toward the upper right, offset o along the normal. */
function P(t: number, o = 0): string {
  const x = 3.5 + t * SQ + o * SQ;
  const y = 20.5 - t * SQ + o * SQ;
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}
const BLADE = 'fill="currentColor" fill-opacity=".22"';
const SOLID = 'fill="currentColor" stroke="none"';

function grip(from: number, to: number): string {
  return `<path d="M${P(from)}L${P(to)}"/><circle cx="${P(to - 0.6).split(' ')[0]}" cy="${P(to - 0.6).split(' ')[1]}" r="0.9" ${SOLID}/>`;
}

function straightSword(bs: number, be: number, w: number, g: number, gripEnd = 1): string {
  const tipBack = Math.min(be - bs, w * 2.2);
  return (
    `<path ${BLADE} d="M${P(bs, -w)}L${P(be - tipBack, -w)}L${P(be, 0)}L${P(be - tipBack, w)}L${P(bs, w)}Z"/>` +
    `<path d="M${P(bs + 0.6, 0)}L${P(be - tipBack - 0.6, 0)}" stroke-opacity=".45" stroke-width="0.8"/>` +
    `<path d="M${P(bs, -g)}L${P(bs, g)}"/>` +
    grip(bs, gripEnd)
  );
}

function pole(len: number, from = 0): string {
  return `<path d="M${P(from)}L${P(len)}"/>`;
}

function mirror(inner: string): string {
  return `<g transform="translate(24 0) scale(-1 1)">${inner}</g>`;
}

/** Weapon type -> glyph markup. */
export const WEAPON_GLYPHS: Record<string, string> = {
  spada_corta: straightSword(5.5, 16, 1.4, 3.2, 1.5),
  spada_lunga: straightSword(5, 22.2, 1.2, 4.2),
  spadone: straightSword(6.5, 22.4, 2.1, 5, 0),
  spada_bastarda:
    straightSword(5.6, 22.2, 1.6, 0.1, 0.4) + `<path d="M${P(4.2, -4.6)}Q${P(6.4, -2)} ${P(5.6, 0)}Q${P(6.4, 2)} ${P(4.2, 4.6)}"/>`,
  stocco:
    `<path d="M${P(5.5)}L${P(22.6)}" stroke-width="1.1"/>` +
    `<path ${BLADE} d="M${P(5.2, -2.6)}A2.6 2.6 0 0 0 ${P(5.2, 2.6)}"/>` +
    `<path d="M${P(5.2, 2.6)}Q${P(2, 3.6)} ${P(1, 0.4)}"/>` +
    grip(5.2, 1.2),
  katana:
    `<path ${BLADE} d="M${P(5.4, -0.9)}Q${P(14, -2.6)} ${P(22.4, 0.2)}Q${P(14, -0.6)} ${P(5.4, 0.9)}Z"/>` +
    `<circle cx="${P(5.2).split(' ')[0]}" cy="${P(5.2).split(' ')[1]}" r="1.7"/>` +
    `<path d="M${P(3.6)}L${P(0.4)}" stroke-width="2"/>`,
  scimitarra:
    `<path ${BLADE} d="M${P(5.4, -0.9)}Q${P(13, -1.2)} ${P(19, 1.6)}L${P(22, 4.2)}Q${P(16, 3.6)} ${P(12, 2.8)}Q${P(8, 1.6)} ${P(5.4, 1.1)}Z"/>` +
    `<path d="M${P(5.2, -2.8)}L${P(5.2, 2.8)}"/>` +
    grip(5.2, 1.4),
  spada_serpentina:
    `<path ${BLADE} d="M${P(5.5, -1.3)}Q${P(8, -3)} ${P(10, -1.3)}T${P(14.5, -1.3)}T${P(19, -1.3)}L${P(22.4, 0)}L${P(19, 1.3)}Q${P(16.6, 3)} ${P(14.5, 1.3)}T${P(10, 1.3)}T${P(5.5, 1.3)}Z"/>` +
    `<path d="M${P(5.5, -3.6)}L${P(5.5, 3.6)}"/>` +
    grip(5.5, 1.4),
  pugnali:
    straightSword(8, 17.5, 1.1, 2.4, 4.6) + mirror(straightSword(8, 17.5, 1.1, 2.4, 4.6)),
  lancia:
    pole(16.5) + `<path ${BLADE} d="M${P(15.6)}L${P(17.4, -1.7)}L${P(23, 0)}L${P(17.4, 1.7)}Z"/>` + `<path d="M${P(15)}L${P(15.6)}" stroke-width="2.4"/>`,
  alabarda:
    pole(22.5) +
    `<path ${BLADE} d="M${P(15, -0.4)}Q${P(14, -5.6)} ${P(18.6, -6.2)}Q${P(16.8, -3.4)} ${P(19, -0.4)}Z"/>` +
    `<path d="M${P(16.5, 0.4)}L${P(17.5, 2.6)}"/>`,
  naginata:
    pole(14.6) +
    `<path ${BLADE} d="M${P(14.2, -0.8)}Q${P(19, -1.4)} ${P(22.8, -3.4)}Q${P(20, 0.4)} ${P(14.2, 0.9)}Z"/>` +
    `<path d="M${P(14.2, -1.8)}L${P(14.2, 1.8)}"/>`,
  tridente:
    pole(15.5) +
    `<path d="M${P(15.5, -3)}L${P(15.5, 3)}"/>` +
    `<path d="M${P(15.5, -3)}L${P(21, -3)}M${P(15.5)}L${P(22.8)}M${P(15.5, 3)}L${P(21, 3)}"/>` +
    `<path d="M${P(19.5, -3.9)}L${P(21, -3)}M${P(19.5, 2.1)}L${P(21, 3)}"/>`,
  arpione:
    pole(17.5, 1.8) +
    `<path ${BLADE} d="M${P(17)}L${P(16, -2.2)}L${P(23, 0)}L${P(16, 2.2)}Z"/>` +
    `<path d="M${P(13, 0)}L${P(12, -1.6)}M${P(13, 0)}L${P(12, 1.6)}"/>` +
    `<circle cx="${P(0.8).split(' ')[0]}" cy="${P(0.8).split(' ')[1]}" r="1.6"/>`,
  falce:
    `<path d="M${P(0)}L${P(19)}"/>` +
    `<path ${BLADE} d="M${P(18.6, 0)}Q${P(22, -8)} ${P(12, -12.6)}Q${P(18, -7.6)} ${P(17, -0.4)}Z"/>` +
    `<path d="M${P(8, -0.2)}L${P(8, -2)}"/>`,
  trivella:
    `<path ${BLADE} d="M${P(8, -4)}L${P(23, 0)}L${P(8, 4)}Z"/>` +
    `<path d="M${P(9.5, -3.4)}L${P(12, 3.2)}M${P(12.5, -2.6)}L${P(15, 2.4)}M${P(15.5, -1.8)}L${P(18, 1.6)}M${P(18.5, -1)}L${P(20.4, 0.7)}" stroke-width="0.9"/>` +
    `<path d="M${P(8, -2)}L${P(8, 2)}"/>` + grip(8, 2),
  mazza:
    pole(12.5, 0.6) +
    `<circle ${BLADE} cx="${P(16).split(' ')[0]}" cy="${P(16).split(' ')[1]}" r="3.4"/>` +
    `<path d="M${P(16, -3.4)}L${P(16, -5)}M${P(16, 3.4)}L${P(16, 5)}M${P(19.4)}L${P(21)}M${P(13.6, -2.4)}L${P(12.6, -3.4)}M${P(13.6, 2.4)}L${P(12.6, 3.4)}"/>`,
  martello_da_guerra:
    pole(15, 0.4) +
    `<path ${BLADE} d="M${P(14.6, -1.2)}L${P(14.6, -5.2)}L${P(18.8, -5.2)}L${P(18.8, -1.2)}Z"/>` +
    `<path d="M${P(14.6, 1.2)}L${P(16.7, 5.4)}L${P(18.8, 1.2)}"/>` +
    `<path d="M${P(15)}L${P(21.6)}"/>`,
  ascia_a_due_mani:
    pole(21) +
    `<path ${BLADE} d="M${P(13.6, -0.6)}Q${P(11.6, -6)} ${P(16.6, -6.6)}Q${P(18.8, -3.4)} ${P(17.8, -0.6)}Z"/>` +
    `<path ${BLADE} d="M${P(13.6, 0.6)}Q${P(11.6, 6)} ${P(16.6, 6.6)}Q${P(18.8, 3.4)} ${P(17.8, 0.6)}Z"/>`,
  asce_gemelle: (() => {
    const axe = pole(15, 4) + `<path ${BLADE} d="M${P(11.6, -0.5)}Q${P(10.6, -5)} ${P(14.8, -5.4)}Q${P(16.2, -2.6)} ${P(15, -0.5)}Z"/>`;
    return axe + mirror(axe);
  })(),
  kama_gemelle: (() => {
    const kama = pole(13, 4) + `<path ${BLADE} d="M${P(12.6, -0.6)}Q${P(16.6, -2)} ${P(17.4, -6.6)}Q${P(15.4, -2.8)} ${P(12.6, 0.8)}Z"/>`;
    return kama + mirror(kama);
  })(),
  lama_a_tenaglia:
    grip(7, 1) +
    `<path d="M${P(7, -2.6)}L${P(7, 2.6)}"/>` +
    `<path ${BLADE} d="M${P(7.4, -1)}Q${P(13, -6.4)} ${P(22, -1.4)}Q${P(14, -3.2)} ${P(9, -0.2)}Z"/>` +
    `<path ${BLADE} d="M${P(7.4, 1)}Q${P(13, 6.4)} ${P(22, 1.4)}Q${P(14, 3.2)} ${P(9, 0.2)}Z"/>`,
  cesoie:
    `<path ${BLADE} d="M${P(8.6, 0.9)}L${P(22.6, -1.2)}L${P(10, -0.9)}Z"/>` +
    `<path ${BLADE} d="M${P(8.6, -0.9)}L${P(22.6, 1.2)}L${P(10, 0.9)}Z"/>` +
    `<circle cx="${P(9.6).split(' ')[0]}" cy="${P(9.6).split(' ')[1]}" r="0.9" ${SOLID}/>` +
    `<path d="M${P(8.6, 0.9)}L${P(4, 3.2)}M${P(8.6, -0.9)}L${P(4, -3.2)}"/>` +
    `<circle cx="${P(2.6, 3.8).split(' ')[0]}" cy="${P(2.6, 3.8).split(' ')[1]}" r="1.7"/>` +
    `<circle cx="${P(2.6, -3.8).split(' ')[0]}" cy="${P(2.6, -3.8).split(' ')[1]}" r="1.7"/>`,
  pugni:
    `<path ${BLADE} d="M5 15.5V11.2a1.6 1.6 0 0 1 3.2 0V10a1.6 1.6 0 0 1 3.2 0v-.4a1.6 1.6 0 0 1 3.2 0v.8a1.6 1.6 0 0 1 3.2 0v5.1c0 2.6-2.1 4.6-4.7 4.6H9.6C7.1 20.1 5 18.1 5 15.5z"/>` +
    `<path d="M5 14h12.8"/><path d="M8 7.2 9 4.6M12.4 6.6l.4-2.8M16.4 7.4l1.2-2.4" stroke-width="1.1"/>`,
  artigli:
    `<path d="M6 20.5c-.6-2.6.2-4.4 2-5.6l9.6-.4c1.4 1 1.6 3 .6 5.6"/>` +
    `<path ${BLADE} d="M7.6 15C7 10 8.4 6 11 3.4c-1.2 3.6-1.4 7.6-.6 11.4z"/>` +
    `<path ${BLADE} d="M11.6 14.8c-.2-5 1.4-8.8 4.2-11.2-1.1 3.6-1.2 7.4-.4 11z"/>` +
    `<path ${BLADE} d="M15.6 14.6c.2-4 1.6-7 3.8-9.2-.8 3-.9 6.1-.4 9z"/>`,
  scudo:
    `<path ${BLADE} d="M12 2.8 19.4 5.4v6.2c0 4.6-3.2 8-7.4 9.8-4.2-1.8-7.4-5.2-7.4-9.8V5.4z"/>` +
    `<path d="M12 5.2v13.6M7.2 9.6h9.6" stroke-opacity=".7"/><circle cx="12" cy="9.6" r="1.6"/>`,
  tomo:
    `<path ${BLADE} d="M5 4.2h11.6a2 2 0 0 1 2 2v13.6H7a2 2 0 0 1-2-2z"/>` +
    `<path d="M5 17.8a2 2 0 0 1 2-2h11.6"/><path d="M8.2 4.2v11.6" stroke-opacity=".6"/>` +
    `<path d="M13.4 7.2l1.2 2.4 2.4.3-1.8 1.6.5 2.4-2.3-1.2-2.3 1.2.5-2.4-1.8-1.6 2.4-.3z" stroke-width="1"/>`,
  totem:
    `<path ${BLADE} d="M9 6.6h6v14H9z"/>` +
    `<path d="M9 11.2h6M9 15.8h6"/>` +
    `<path d="M10.6 8.6h.01M13.4 8.6h.01M10.6 13.2h.01M13.4 13.2h.01" stroke-width="1.8"/>` +
    `<path d="M9 6.6 4 4.4l2.8 3M15 6.6l5-2.2-2.8 3"/><path d="M11 18.2h2"/>`,
  arco_lungo:
    `<path ${BLADE} d="M6 2.6c8 3.4 11 6.8 11.8 9.4-.8 2.6-3.8 6-11.8 9.4 6.2-4 8.2-6.6 8.6-9.4-.4-2.8-2.4-5.4-8.6-9.4z"/>` +
    `<path d="M6 2.6v18.8" stroke-width="0.8"/><path d="M3 12h16.6M17.6 10.4l2.4 1.6-2.4 1.6M3 12l-.6-1.4M3 12l-.6 1.4"/>`,
  balestra:
    `<path d="M12 21V6.4"/><path ${BLADE} d="M3.6 9.6Q12 3.4 20.4 9.6Q12 6.4 3.6 9.6z"/>` +
    `<path d="M3.6 9.6 12 14.2l8.4-4.6" stroke-width="0.8"/><path d="M12 6.4 12 2.6M10.6 4l1.4-1.4L13.4 4"/>` +
    `<path d="M10.4 15.6h3.2v5.4h-3.2z"/>`,
  chakram:
    `<circle cx="12" cy="12" r="7.2" ${BLADE}/><circle cx="12" cy="12" r="4"/>` +
    `<path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8"/>`,
  frusta:
    grip(5, 0.6) +
    `<path d="M${P(5)}C${P(12, -4)} ${P(10, 6)} ${P(15, 4)}S${P(19, -6)} ${P(23, -2.6)}" stroke-width="1.2"/>`,
  catene:
    `<rect x="2.6" y="15.2" width="6.6" height="3.6" rx="1.8" transform="rotate(-45 5.9 17)"/>` +
    `<rect x="6.8" y="11" width="6.6" height="3.6" rx="1.8" transform="rotate(45 10.1 12.8)"/>` +
    `<rect x="11" y="6.8" width="6.6" height="3.6" rx="1.8" transform="rotate(-45 14.3 8.6)"/>` +
    `<path d="M17.8 5.8c1.6-1.8 3.8-1 3.6.8-.2 1.6-2.2 2.4-3.4 1.2"/>`,
  flagello:
    grip(8, 1) +
    `<path d="M${P(8)}L${P(11.6, -2.2)}L${P(14, 0.6)}" stroke-dasharray="1.2 1.2"/>` +
    `<circle ${BLADE} cx="${P(17.2, 0.8).split(' ')[0]}" cy="${P(17.2, 0.8).split(' ')[1]}" r="3.2"/>` +
    `<path d="M${P(17.2, 4)}L${P(17.2, 5.6)}M${P(20.4, 0.8)}L${P(22, 0.8)}M${P(17.2, -2.4)}L${P(17.2, -4)}M${P(19.6, -1.6)}L${P(20.8, -2.8)}M${P(19.6, 3.2)}L${P(20.8, 4.4)}"/>`,
  bastone_magico:
    `<path d="M${P(0)}L${P(18.6)}"/>` +
    `<path d="M${P(18.6)}c0-3 3.4-3.4 4-1.2.5 1.8-1.4 2.6-2.4 1.6"/>` +
    `<circle cx="${P(16, 3.2).split(' ')[0]}" cy="${P(16, 3.2).split(' ')[1]}" r="1.6" ${SOLID} opacity=".8"/>` +
    `<path d="M${P(10, -1.4)}L${P(11.6, 1.4)}M${P(12.4, -1.4)}L${P(14, 1.4)}" stroke-width="0.9"/>`,
  astrolabio:
    `<circle cx="12" cy="13" r="7.4" ${BLADE}/><circle cx="12" cy="13" r="4.4"/>` +
    `<ellipse cx="12" cy="13" rx="7.4" ry="2.6" stroke-width="0.9"/><path d="M12 5.6v14.8M7.2 17.8l9.6-9.6" stroke-width="0.9"/>` +
    `<circle cx="12" cy="3.6" r="1.6"/>`,
  scettro:
    `<path d="M${P(0.6)}L${P(15)}"/>` +
    `<path ${BLADE} d="M${P(14.6, -3.2)}L${P(19.6, -3.6)}L${P(17.6, -1)}L${P(21.6, 0)}L${P(17.6, 1)}L${P(19.6, 3.6)}L${P(14.6, 3.2)}Z"/>` +
    `<circle cx="${P(16.4).split(' ')[0]}" cy="${P(16.4).split(' ')[1]}" r="1.1" ${SOLID}/>` +
    `<path d="M${P(9, -1.6)}L${P(9, 1.6)}"/>`,
  arma_mutaforma:
    `<path ${BLADE} d="M${P(5.2, -1.3)}L${P(13.4, -1.3)}L${P(14.4)}L${P(13.4, 1.3)}L${P(5.2, 1.3)}Z"/>` +
    `<path d="M${P(14)}C${P(17, -1)} ${P(15.6, -5)} ${P(19.6, -5.4)}M${P(14)}C${P(18, 0)} ${P(19, -1)} ${P(22.6, 0.6)}M${P(14)}C${P(16, 2)} ${P(14.6, 5)} ${P(18.6, 5.8)}" stroke-width="1.2"/>` +
    `<path d="M${P(5.2, -3.4)}L${P(5.2, 3.4)}"/>` + grip(5.2, 1),
};

export function weaponGlyph(type: string): string {
  return WEAPON_GLYPHS[type] ?? WEAPON_GLYPHS.spada_corta;
}

/** Action and system glyphs. */
export const ICONS = {
  light: `<path d="M5.4 18.6 17.6 6.4" stroke-width="2.2"/><path d="M15.2 4.4l4.4 4.4" stroke-width="1.4" stroke-opacity=".6"/><path d="M4 20l1.4-1.4"/>`,
  heavy: `<path d="M4.6 17.4 15.4 6.6M8.6 19.4 19.4 8.6" stroke-width="2.4"/><path d="M13.6 3.8l6.6 6.6" stroke-opacity=".55"/>`,
  dodge: `<path d="M5 15.6a7.4 7.4 0 1 1 7 4.8"/><path d="M9 17.6l3 2.8-3 2.4" /><circle cx="12" cy="12.6" r="1.8" fill="currentColor" stroke="none"/>`,
  guard: `<path d="M12 3.2 18.8 5.6v5.8c0 4.4-3 7.6-6.8 9.4-3.8-1.8-6.8-5-6.8-9.4V5.6z" fill="currentColor" fill-opacity=".16"/><path d="M12 6.6v10.6" stroke-opacity=".6"/>`,
  jump: `<path d="M6 13.4 12 7.4l6 6"/><path d="M6 18.6 12 12.6l6 6" stroke-opacity=".55"/><path d="M8.2 4.4h7.6" stroke-opacity=".7"/>`,
  art_prima: `<path d="M12 3.4 14.4 12 12 20.6 9.6 12z" fill="currentColor" fill-opacity=".3"/><path d="M4 12h3M17 12h3" stroke-opacity=".6"/>`,
  art_seconda: `<path d="M8.4 4.4 10.4 12l-2 7.6L6.4 12zM15.6 4.4 17.6 12l-2 7.6-2-7.6z" fill="currentColor" fill-opacity=".3"/>`,
  lacrime: `<path d="M9.2 2.8h5.6M10 2.8v4.4l-3.6 5.4a5.8 5.8 0 1 0 11.2 0L14 7.2V2.8" fill="currentColor" fill-opacity=".12"/><path d="M12 11.2c1.4 1.8 2.2 3 2.2 4.1a2.2 2.2 0 0 1-4.4 0c0-1.1.8-2.3 2.2-4.1z" fill="currentColor" stroke="none"/>`,
  lock: `<circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.4v3.6M12 18v3.6M2.4 12H6M18 12h3.6"/>`,
  pause: `<path d="M9 6v12M15 6v12" stroke-width="2.4"/>`,
  back: `<path d="M14.6 5.4 8 12l6.6 6.6"/>`,
  close: `<path d="M6.6 6.6l10.8 10.8M17.4 6.6 6.6 17.4"/>`,
  check: `<path d="M5.4 12.6 10 17.2l8.6-9.8"/>`,
  meditate: `<path d="M12 5.2c1.6 1.6 1.6 4 0 5.6-1.6-1.6-1.6-4 0-5.6z" fill="currentColor" fill-opacity=".35"/><path d="M4.4 15.6c2.6.4 5 1.6 7.6 4 2.6-2.4 5-3.6 7.6-4M7 11.6c1.8.8 3.4 2.4 5 4.6 1.6-2.2 3.2-3.8 5-4.6"/>`,
  examine: `<circle cx="10.6" cy="10.6" r="5.6"/><path d="M15 15l5 5"/>`,
  look: `<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.6" fill="currentColor" fill-opacity=".4"/>`,
  board: `<path d="M3.4 14.6h17.2l-2.6 4.6H6z" fill="currentColor" fill-opacity=".18"/><path d="M12 14.6V3.6l6 8.4h-6M12 6.6 7.4 12H12"/>`,
  continue: `<path d="M4.6 12h13.2M13 6.8l5.2 5.2-5.2 5.2"/>`,
  gear: `<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/>`,
  seed: `<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 3.4v4M12 16.6v4M4.6 7.7l3.4 2M16 14.3l3.4 2M4.6 16.3l3.4-2M16 9.7l3.4-2" stroke-width="1.2"/>`,
  sun: `<circle cx="12" cy="13.4" r="4"/><path d="M3 18.6h18M12 4.4v2.4M5.6 7.6l1.6 1.6M18.4 7.6l-1.6 1.6M2.8 13.4h2.4M18.8 13.4h2.4"/>`,
  moon: `<path d="M15.6 3.8a8.4 8.4 0 1 0 4.6 12.6 6.6 6.6 0 0 1-4.6-12.6z" fill="currentColor" fill-opacity=".2"/><path d="M6 5.2h.01M8.6 3h.01" stroke-width="1.8"/>`,
  dusk: `<path d="M5.2 15.4a6.8 6.8 0 0 1 13.6 0"/><path d="M2.8 15.4h18.4M5.6 18.8h12.8" stroke-opacity=".6"/><path d="M12 4.6v2.6M6.2 7.2l1.6 1.6M17.8 7.2l-1.6 1.6"/>`,
  dawn: `<path d="M7.2 16a4.8 4.8 0 0 1 9.6 0"/><path d="M2.8 16h18.4M6.4 19.4h11.2" stroke-opacity=".6"/><path d="M12 7.4v3M7.4 9.6l1.4 1.4M16.6 9.6l-1.4 1.4" stroke-opacity=".8"/>`,
  travel: `<path d="M12 21s-6.4-6-6.4-11a6.4 6.4 0 0 1 12.8 0c0 5-6.4 11-6.4 11z"/><circle cx="12" cy="10" r="2.2"/>`,
  mirror: `<ellipse cx="12" cy="10.4" rx="5.6" ry="7.2" fill="currentColor" fill-opacity=".14"/><path d="M12 17.6v3.6M8.6 21.2h6.8M9.4 7.4l2.4-2"/>`,
  relic: `<path d="M8.6 3.6h6.8M9.4 3.6v2.2l-2.6 3v9.8a2 2 0 0 0 2 2h6.4a2 2 0 0 0 2-2V8.8l-2.6-3V3.6"/><path d="M12 11.4c1 1.4 1.6 2.4 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-.8.6-1.8 1.6-3.2z" fill="currentColor" stroke="none"/>`,
  armory: `<path d="M5 19 15.6 8.4M19 19 8.4 8.4"/><path d="M15.6 8.4l1.6-3.8 2.2-.6-.6 2.2zM8.4 8.4 6.8 4.6 4.6 4l.6 2.2z" fill="currentColor" fill-opacity=".3"/><path d="M4 20l2-2M20 20l-2-2"/>`,
  forms: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.4" stroke-opacity=".6"/><path d="M12 4v16M4 12h16" stroke-opacity=".3"/>`,
  collection: `<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1" fill="currentColor" fill-opacity=".25"/>`,
  save: `<path d="M5 4.6h11l3 3V19.4H5z"/><path d="M8 4.6v4.6h7V4.6M8 19.4v-5.6h8v5.6"/>`,
  exit: `<path d="M10 4.6H5.4v14.8H10"/><path d="M14.4 8l4 4-4 4M18.2 12H9"/>`,
  debug: `<rect x="7.4" y="7.6" width="9.2" height="11.4" rx="4.6"/><path d="M12 7.6V19M4 12h3.4M16.6 12H20M5 7.4l2.6 1.6M19 7.4l-2.6 1.6M5 17.6l2.6-1.6M19 17.6l-2.6-1.6M9.4 4.6l1.2 2M14.6 4.6l-1.2 2"/>`,
  lockClosed: `<rect x="5.6" y="10.6" width="12.8" height="9.4" rx="1.6"/><path d="M8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6"/>`,
  rotate: `<rect x="7.6" y="2.8" width="8.8" height="15" rx="1.6"/><path d="M3.6 16.6a9 9 0 0 0 14.6 4.2M18.2 20.8l.4-3.4-3.4.2" />`,
  skip: `<path d="M5.4 6.4 12 12l-6.6 5.6zM12.6 6.4 19.2 12l-6.6 5.6z" fill="currentColor" fill-opacity=".3"/>`,
  copy: `<rect x="8.4" y="8.4" width="11" height="11" rx="1.6"/><path d="M15.6 8.4V5.6a1 1 0 0 0-1-1H5.6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2.8"/>`,
  paste: `<path d="M8.6 4.4h6.8v2.6H8.6z"/><path d="M15.4 5.6h2.2a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H6.4a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1h2.2"/>`,
  key: `<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12h8.8M17.6 12v3M20.4 12v2.2"/>`,
  feather: `<path d="M19.4 4.6c-6.6.6-11.6 5.6-12.6 13.2l-2.4 2.6"/><path d="M19.4 4.6c.4 7.6-4.6 12.4-12.4 13M9 15.4l4.6-1M10.6 11.6l4.4-.6M13 8.2l3.4-.4"/>`,
  heart: `<path d="M12 20s-7.6-4.6-7.6-10.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.6 2c0 5.8-7.6 10.4-7.6 10.4z" fill="currentColor" fill-opacity=".2"/>`,
  lantern: `<path d="M9.6 3.4h4.8M12 3.4v2.2M8 7.6h8l-1 9.8H9z" fill="currentColor" fill-opacity=".14"/><path d="M8 7.6a4 2 0 0 1 8 0M9 17.4h6v2.4H9z"/><path d="M12 10.6c.9 1.1 1.4 2 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.6 1.4-2.7z" fill="currentColor" stroke="none"/>`,
  scar: `<path d="M6 18 18 6M8.4 9.4l1.6 1.6M11 12.2l1.6 1.6M13.6 14.8l1.6 1.6"/>`,
  red: `<path d="M12 2.6 21.4 12 12 21.4 2.6 12z" fill="currentColor" fill-opacity=".22" stroke-width="1.8"/><path d="M12 7.4v6" stroke-width="2.4"/><circle cx="12" cy="16.8" r="1.4" fill="currentColor" stroke="none"/>`,
  grace: `<path d="M12 2.6v18.8M7.4 7l9.2 10M16.6 7l-9.2 10" stroke-width="1.4"/><circle cx="12" cy="12" r="3.4" fill="currentColor" fill-opacity=".35"/>`,
  phase: `<path d="M12 3 15 12 12 21 9 12z" fill="currentColor" stroke="none"/>`,
  star: `<path d="M12 3.4l2.4 5.6 6 .5-4.6 4 1.4 5.9L12 16.3l-5.2 3.1 1.4-5.9-4.6-4 6-.5z"/>`,
} as const;

export const STATUS_ICONS: Record<string, string> = {
  slow: `<path d="M7 3.6h10M7 20.4h10M8 3.6c0 4.4 4 5.6 4 8.4s-4 4-4 8.4M16 3.6c0 4.4-4 5.6-4 8.4s4 4 4 8.4"/><path d="M9.6 18.4h4.8L12 15.6z" fill="currentColor" stroke="none"/>`,
  burn: `<path d="M12 21c-3.8 0-6.2-2.6-6.2-6 0-3.8 3.4-5.6 3.8-10.4 2.2 1.6 3.4 3.6 3.4 5.6.8-.8 1.4-2 1.4-3 2.2 2 3.8 4.6 3.8 7.8 0 3.4-2.4 6-6.2 6z" fill="currentColor" fill-opacity=".25"/>`,
  freeze: `<path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2M9.6 4.4 12 6.6l2.4-2.2M9.6 19.6 12 17.4l2.4 2.2"/>`,
  blind: `<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><path d="M4.4 19.6 19.6 4.4" stroke-width="1.9"/>`,
  mute: `<path d="M12 3.4 14.4 12 12 20.6 9.6 12z" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="12" r="8.6"/><path d="M5.9 18.1 18.1 5.9"/>`,
  madness: `<path d="M12 12c0-1 1.6-1 1.6.2 0 1.6-2.4 2.2-3.6 1-1.8-1.6-.6-4.8 2-5 3.4-.2 5.4 3.2 4.2 6.2-1.6 3.8-6.6 4.6-9.4 1.8C3.8 13.2 4.8 7 9.4 5.2c4.4-1.8 9.6.4 11 5"/>`,
  poison: `<path d="M12 3c3.4 4.2 5.6 7.4 5.6 10.4a5.6 5.6 0 0 1-11.2 0C6.4 10.4 8.6 7.2 12 3z" fill="currentColor" fill-opacity=".2"/><circle cx="10.4" cy="14.4" r="1.2"/><circle cx="13.8" cy="11.6" r="0.9"/>`,
  void: `<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 3.4a8.6 8.6 0 0 1 8.6 8.6M12 20.6A8.6 8.6 0 0 1 3.4 12" stroke-dasharray="2 2"/>`,
  root: `<path d="M12 3v8M12 11c-3 1-5 4-5.6 8.6M12 11c3 1 5 4 5.6 8.6M12 11v9.4M9 15l-3 1.2M15 15l3 1.2"/>`,
};

export function promptIcon(promptKey: string): string {
  if (promptKey.endsWith('meditate')) return ICONS.meditate;
  if (promptKey.endsWith('examine')) return ICONS.examine;
  if (promptKey.endsWith('look')) return ICONS.look;
  if (promptKey.endsWith('board')) return ICONS.board;
  return ICONS.continue;
}

export function itemIcon(id: string): string {
  if (id.includes('lanterna')) return ICONS.lantern;
  if (id.includes('piuma')) return ICONS.feather;
  if (id.includes('cuore')) return ICONS.heart;
  if (id.includes('cicatrice')) return ICONS.scar;
  return ICONS.key;
}

export const TOD_ICONS: Record<string, string> = { alba: ICONS.dawn, giorno: ICONS.sun, tramonto: ICONS.dusk, notte: ICONS.moon };
