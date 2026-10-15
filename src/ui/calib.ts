/** Pure math for the settings screen: latency tap-test estimate and slider value helpers (no DOM; unit-tested). */

export const LATENCY_MAX = 0.04;
export const BUFFER_MIN = 0.15;
export const BUFFER_MAX = 0.2;

/**
 * Estimate the touch-to-screen latency from a tap test: the player taps along with a visual beat every `period` seconds
 * starting at `t0`. Each tap is matched to its nearest beat; the median signed offset (late = positive), clamped to
 * 0..LATENCY_MAX, is the compensation. Returns null when fewer than `minTaps` taps land within a third of a period.
 */
export function estimateLatency(taps: readonly number[], t0: number, period: number, minTaps = 5): number | null {
  const offs: number[] = [];
  for (const t of taps) {
    const k = Math.round((t - t0) / period);
    if (k < 0) continue;
    const d = t - (t0 + k * period);
    if (Math.abs(d) <= period / 3) offs.push(d);
  }
  if (offs.length < minTaps) return null;
  offs.sort((a, b) => a - b);
  const m = offs.length >> 1;
  const med = offs.length % 2 ? offs[m] : (offs[m - 1] + offs[m]) / 2;
  return Math.round(Math.max(0, Math.min(LATENCY_MAX, med)) * 1000) / 1000;
}

/** Snap a slider value to its step and range (avoids 0.30000000000000004 in saved settings). */
export function snap(v: number, min: number, max: number, step: number): number {
  const s = Math.round((Math.max(min, Math.min(max, v)) - min) / step) * step + min;
  return Math.round(s * 1e6) / 1e6;
}
