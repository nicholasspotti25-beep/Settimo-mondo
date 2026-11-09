/** Calendar keys in the device's local time: daily resets at local midnight, weekly resets on Monday. */
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO-8601 week key, e.g. 2026-W45 (weeks start on Monday). */
export function weekKey(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

export function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 16);
  }
}
