import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const unitDir = fileURLToPath(new URL('../', import.meta.url));
const worldFile = join(unitDir, 'helpers', 'world.js');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

// A static import, import(), vi.importActual() or require() of a path containing /src/. The
// patterns are built from pieces so this file does not match itself.
const SRC = '[^\'"`)]*' + '/sr' + 'c/';
const patterns = [
  new RegExp('\\b(?:import|export)\\b[^;]*?\\bfrom\\s*[\'"`]' + SRC),
  new RegExp('\\bimport\\s*[\'"`]' + SRC),
  new RegExp('\\bimport\\s*\\([^)]*' + '/sr' + 'c/'),
  new RegExp('\\bvi\\.importActual\\s*\\([^)]*' + '/sr' + 'c/'),
  new RegExp('\\brequire\\s*\\([^)]*' + '/sr' + 'c/'),
];

describe('import guard', () => {
  it('only helpers/world.js reaches into src/', () => {
    const bad = [];
    for (const p of walk(unitDir)) {
      if (p === worldFile) continue;
      const text = readFileSync(p, 'utf8');
      if (patterns.some((re) => re.test(text))) bad.push(relative(unitDir, p).split(sep).join('/'));
    }
    expect(bad).toStrictEqual([]);
  });
});
