/** Platform services: haptics, wake lock, fullscreen/orientation, Capacitor bridges. All calls are best-effort. */

type HapticPattern = 'hit' | 'parry' | 'perfectDodge' | 'redWarning' | 'grace' | 'bossDefeat' | 'hurt' | 'light';

const PATTERNS: Record<HapticPattern, number[]> = {
  hit: [12],
  parry: [8, 30, 24],
  perfectDodge: [6, 18, 6],
  redWarning: [30, 40, 30],
  grace: [20, 50, 40, 60, 80],
  bossDefeat: [60, 80, 120, 80, 200],
  hurt: [35],
  light: [5],
};

interface CapacitorLike {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, any>;
}

function cap(): CapacitorLike | null {
  return (globalThis as any).Capacitor ?? null;
}

export function isNative(): boolean {
  return !!cap()?.isNativePlatform?.();
}

export class Platform {
  hapticsEnabled = true;
  hapticStrength = 1;
  private wakeLock: any = null;

  haptic(p: HapticPattern): void {
    if (!this.hapticsEnabled) return;
    const pattern = PATTERNS[p].map((v) => Math.round(v * this.hapticStrength));
    const H = cap()?.Plugins?.Haptics;
    if (H) {
      try {
        if (p === 'hit' || p === 'light') H.impact({ style: 'LIGHT' });
        else if (p === 'hurt' || p === 'parry') H.impact({ style: 'MEDIUM' });
        else if (p === 'grace' || p === 'bossDefeat') H.vibrate({ duration: pattern.reduce((a, b) => a + b, 0) });
        else H.impact({ style: 'HEAVY' });
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  }

  async keepAwake(on: boolean): Promise<void> {
    const KA = cap()?.Plugins?.KeepAwake;
    try {
      if (KA) {
        if (on) await KA.keepAwake();
        else await KA.allowSleep();
        return;
      }
      if (on && !this.wakeLock && (navigator as any).wakeLock) this.wakeLock = await (navigator as any).wakeLock.request('screen');
      if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {
      this.wakeLock = null;
    }
  }

  async enterFullscreen(): Promise<void> {
    try {
      const el = document.documentElement as any;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      const so = (screen as any).orientation;
      if (so?.lock) await so.lock('landscape').catch(() => undefined);
    } catch {
      /* iOS Safari has no fullscreen API; the PWA runs standalone instead */
    }
  }

  async nativeSetup(): Promise<void> {
    const P = cap()?.Plugins;
    if (!P) return;
    try {
      await P.StatusBar?.hide?.();
    } catch {
      /* ignore */
    }
    try {
      await P.ScreenOrientation?.lock?.({ orientation: 'landscape' });
    } catch {
      /* ignore */
    }
  }

  /** Register background/foreground callbacks (web + Capacitor App plugin). */
  onLifecycle(onBackground: () => void, onForeground: () => void): void {
    document.addEventListener('visibilitychange', () => (document.hidden ? onBackground() : onForeground()));
    window.addEventListener('pagehide', onBackground);
    window.addEventListener('blur', () => onBackground());
    const App = cap()?.Plugins?.App;
    try {
      App?.addListener?.('appStateChange', (s: { isActive: boolean }) => (s.isActive ? onForeground() : onBackground()));
      App?.addListener?.('pause', onBackground);
    } catch {
      /* ignore */
    }
  }
}
