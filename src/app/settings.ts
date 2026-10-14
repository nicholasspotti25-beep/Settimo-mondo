/** Player settings (global, not per save slot). Persisted in localStorage; included in save exports. */
import type { Lang, TouchLayoutDef } from '../core/types';

export interface Settings {
  language: Lang;
  quality: 'low' | 'medium' | 'high' | 'auto';
  fps: 30 | 60;
  volume: { master: number; music: number; sfx: number; voice: number; ambience: number };
  haptics: boolean;
  hapticStrength: number;
  subtitles: { size: 's' | 'm' | 'l' | 'xl'; background: boolean };
  reduceShake: boolean;
  reduceFlashing: boolean;
  toggleGuard: boolean;
  toggleSprint: boolean;
  cameraSensitivity: number;
  invertY: boolean;
  largeButtons: boolean;
  aimAssist: boolean;
  /** Latency compensation (0..0.04 s) added to perfect dodge/parry windows. */
  latencyComp: number;
  latencyAuto: boolean;
  inputBuffer: number;
  touchLayout: TouchLayoutDef | null;
  leftHanded: boolean;
  controlsFade: boolean;
  showFps: boolean;
  /** Accessibility leniency (off by default; Settings > Accessibility). */
  lenientWindows: boolean;
  slowerBosses: boolean;
  autoLock: boolean;
  debugMenu: boolean;
}

export function defaultSettings(): Settings {
  const lang: Lang = typeof navigator !== 'undefined' && /^en/i.test(navigator.language ?? '') ? 'en' : 'it';
  return {
    language: lang,
    quality: 'auto',
    fps: 60,
    volume: { master: 0.9, music: 0.75, sfx: 0.9, voice: 0.85, ambience: 0.7 },
    haptics: true,
    hapticStrength: 1,
    subtitles: { size: 'm', background: true },
    reduceShake: false,
    reduceFlashing: false,
    toggleGuard: false,
    toggleSprint: false,
    cameraSensitivity: 1,
    invertY: false,
    largeButtons: false,
    aimAssist: true,
    latencyComp: 0.02,
    latencyAuto: true,
    inputBuffer: 0.2,
    touchLayout: null,
    leftHanded: false,
    controlsFade: true,
    showFps: false,
    lenientWindows: false,
    slowerBosses: false,
    autoLock: true,
    debugMenu: false,
  };
}

const KEY = 'settimo-mondo.settings.v1';

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...d, ...s, volume: { ...d.volume, ...(s.volume ?? {}) }, subtitles: { ...d.subtitles, ...(s.subtitles ?? {}) } };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode): settings stay in memory */
  }
}
