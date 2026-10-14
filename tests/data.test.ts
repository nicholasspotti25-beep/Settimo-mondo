import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

describe('data validation (strict)', () => {
  it('every data file and locale compiles with zero errors (schemas, cross references, IT/EN completeness, no placeholders)', () => {
    let out = '';
    let code = 0;
    try {
      out = execFileSync('npx', ['tsx', 'tools/build-data.ts', '--quiet'], { cwd: ROOT, env: { ...process.env, SM_PARTIAL: '0' }, encoding: 'utf8' });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }
    expect(out + `\nexit ${code}`).toMatch(/exit 0$/);
  });

  it('the shipped content matches the Bible (canon audit: zero mismatches)', () => {
    let out = '';
    let code = 0;
    try {
      out = execFileSync('npx', ['tsx', 'tools/canon-audit.ts'], { cwd: ROOT, encoding: 'utf8' });
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      code = err.status ?? 1;
      out = err.stdout ?? '';
    }
    expect(out.split('\n').slice(-25).join('\n') + `\nexit ${code}`).toMatch(/exit 0$/);
  });
});
