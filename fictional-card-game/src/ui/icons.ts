/** Stroke icons (24×24). */
import { svg } from './dom';

const P = (d: string, extra = ''): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICON = {
  back: P('<path d="M15 5l-7 7 7 7"/>'),
  close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  gear: P('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  db: P('<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6.5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V5.5M4.5 12v6.5c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V12"/>'),
  play: P('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
  pause: P('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  skip: P('<path d="M5 5l9 7-9 7zM18 5v14"/>'),
  ff: P('<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/>'),
  search: P('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  edit: P('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  image: P('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L5 20"/>'),
  video: P('<rect x="3" y="5" width="13" height="14" rx="2.5"/><path d="M16 10l5-3v10l-5-3z"/>'),
  check: P('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  warn: P('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
  coin: P('<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5h-4.2v7M10.3 12h3.4"/>'),
  trophy: P('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5"/>'),
  swords: P('<path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4M7 14l-3 3 3 3 3-3M17 14l3 3-3 3-3-3"/>'),
  users: P('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8"/>'),
  cards: P('<rect x="7" y="3" width="11" height="15" rx="2" transform="rotate(8 12 10)"/><rect x="4" y="5" width="11" height="15" rx="2" transform="rotate(-6 10 12)"/>'),
  pack: P('<path d="M6 3h12l-1 3H7zM7 6h10v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/><path d="M10 12l2-2 2 2-2 2z"/>'),
  target: P('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
  medal: P('<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5L6 3h4l2 4 2-4h4l-2.5 7.5"/><path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>'),
  shop: P('<path d="M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11zM5.5 13.5V20h13v-6.5M10 20v-4h4v4"/>'),
  book: P('<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 1h13v-3"/><path d="M9 7h6"/>'),
  swap: P('<path d="M7 4L3 8l4 4M3 8h13M17 12l4 4-4 4M21 16H8"/>'),
  lock: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  star: P('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  crown: P('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'),
  shield: P('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/>'),
  brain: P('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>'),
  bolt: P('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  fist: P('<path d="M7 11V7a1.5 1.5 0 0 1 3 0v3M10 10V6a1.5 1.5 0 0 1 3 0v4M13 10V7a1.5 1.5 0 0 1 3 0v4M16 11V9a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a5 5 0 0 1-5-5v-2a2 2 0 0 1 2-2h3"/>'),
  eye: P('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: P('<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.4 7.4C4 9.1 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  download: P('<path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/>'),
  upload: P('<path d="M12 20V9M7 13.5l5-5 5 5M4 4h16"/>'),
  zoomIn: P('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8v6M8 11h6"/>'),
  zoomOut: P('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>'),
  expand: P('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  volume: P('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: P('<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  calendar: P('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  gift: P('<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z"/>'),
  sort: P('<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>'),
  filter: P('<path d="M4 5h16l-6.2 7.5V19l-3.6 1.5v-8z"/>'),
  library: P('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
  refresh: P('<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  history: P('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2"/>'),
  sparkle: P('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  dice: P('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>'),
} as const;

export type IconName = keyof typeof ICON;
export const icon = (n: IconName, cls = 'ic'): SVGSVGElement => svg(ICON[n], cls);

/** The game emblem: an eight-point star inside a ring. */
export const EMBLEM = `<svg viewBox="0 0 100 100" fill="none"><defs><linearGradient id="emg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e8c46a"/><stop offset="1" stop-color="#9a6b1f"/></linearGradient></defs><circle cx="50" cy="50" r="44" stroke="url(#emg)" stroke-width="3"/><circle cx="50" cy="50" r="37" stroke="url(#emg)" stroke-width="1" opacity=".6"/><path d="M50 12l7 27 27-7-20 18 20 18-27-7-7 27-7-27-27 7 20-18-20-18 27 7z" fill="url(#emg)"/><circle cx="50" cy="50" r="6" fill="#0a0d22" stroke="url(#emg)" stroke-width="2"/></svg>`;
