import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const unitDir = fileURLToPath(new URL('../', import.meta.url));
const self = fileURLToPath(import.meta.url);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('exactness guard', () => {
  it('no test uses toBeCloseTo', () => {
    const needle = 'toBeClose' + 'To';
    const bad = walk(unitDir)
      .filter((p) => p !== self)
      .filter((p) => readFileSync(p, 'utf8').includes(needle))
      .map((p) => relative(unitDir, p));
    expect(bad).toStrictEqual([]);
  });
});
