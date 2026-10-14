/** Localization service. Italian first; English complete. Strings come from locales/it.json and locales/en.json (generated). */
import type { Lang } from './types';

export type StringTable = Record<string, string>;

export class Loc {
  lang: Lang = 'it';
  private tables: Record<Lang, StringTable>;
  missing = new Set<string>();

  constructor(it: StringTable, en: StringTable, lang: Lang = 'it') {
    this.tables = { it, en };
    this.lang = lang;
  }

  setLang(lang: Lang): void {
    this.lang = lang;
  }

  has(key: string, lang: Lang = this.lang): boolean {
    return key in this.tables[lang];
  }

  /** Translate a key, interpolating {name} placeholders. Falls back to Italian, then to the key itself (recorded as missing). */
  t(key: string, vars?: Record<string, string | number>): string {
    let s = this.tables[this.lang][key];
    if (s === undefined) {
      s = this.tables.it[key];
      this.missing.add(key);
      if (s === undefined) return key;
    }
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
    return s;
  }

  keys(lang: Lang = this.lang): string[] {
    return Object.keys(this.tables[lang]);
  }
}

let current: Loc | null = null;
export function setLoc(l: Loc): Loc {
  current = l;
  return l;
}
export function loc(): Loc {
  if (!current) throw new Error('Loc not initialised');
  return current;
}
export function t(key: string, vars?: Record<string, string | number>): string {
  return current ? current.t(key, vars) : key;
}
