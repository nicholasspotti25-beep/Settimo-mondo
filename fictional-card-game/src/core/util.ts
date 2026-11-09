export function uid(prefix = ''): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return prefix + Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const r = round2(v);
  return Number.isInteger(r) ? r.toLocaleString() : r.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function fmtFC(v: number): string {
  return `${Math.round(v).toLocaleString()} FC`;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export function deepClone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
