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
  // Between the keyword and from: names, braces, commas, stars and whitespace only (a multi-line named import
  // matches; a quote, paren, equals sign or semicolon ends the statement and stops the match).
  new RegExp('\\b(?:import|export)\\b[\\w$*{},\\s]*?\\bfrom\\s*[\'"`]' + SRC),
  new RegExp('\\bimport\\s*[\'"`]' + SRC),
  new RegExp('\\bimport\\s*\\([^)]*' + '/sr' + 'c/'),
  new RegExp('\\bvi\\.importActual\\s*\\([^)]*' + '/sr' + 'c/'),
  new RegExp('\\brequire\\s*\\([^)]*' + '/sr' + 'c/'),
];

const S = '/sr' + 'c/';
const matches = (text) => patterns.some((re) => re.test(text));

describe('import guard patterns', () => {
  it('match each way of reaching into src/', () => {
    const must = [
      "import { a } from '../../.." + S + "x.js';",
      "export * from '../.." + S + "x.js';",
      "import '../.." + S + "x.js';",
      "const m = await import('../.." + S + "x.js');",
      'const m = await import(new URL("../../..' + S + 'x.js", import.meta.url).href);',
      "await vi.importActual('../.." + S + "x.js');",
      "const m = require('../.." + S + "x.js');",
      'import {\n  a,\n  b,\n} from "../..' + S + 'x.js";',
    ];
    for (const t of must) expect(matches(t), t).toBe(true);
  });

  it('do not match other imports, or a path in a later statement', () => {
    const mustNot = [
      "import { a } from 'vitest';",
      "import { world } from '../helpers/world.js';",
      "const x = require('node:fs');",
      "const m = await import('./other.js');",
      "import { a } from 'vitest'; // see " + S,
      "import a from 'b'\nfoo('c', 'from', \"" + S + "\")",
      "export const a = 1\nconst s = x.from('" + S + "')",
    ];
    for (const t of mustNot) expect(matches(t), t).toBe(false);
  });
});

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
