// Files under src/**/core/ must not touch the DOM or browser storage (spec section 3, rule 1): they have to be
// importable in plain Node. Uses scope analysis, so comments, strings and local names that happen to be called
// `window` or `document` do not count. Two more rules (spec section 14):
//  - a core file calls no DOM method on an element it is handed (a global-free helper can still be DOM code);
//  - a core file imports nothing from a ui/ directory (core code cannot depend on DOM code), by a relative path or a
//    '#country/ui/...' specifier (so a core/ seam facade re-exporting a ui/ module fails too).
// That is all it checks. It reads only core/ files: it does not check that a ui/ module needs to be under ui/, nor that a
// ui/ seam facade belongs there (stage 4 design section 5.2; the regroup tool moves facades by that rule).
// DOM_METHODS and stripComments come from scripts/analyze-closure.js (shared with scripts/lib/regroup.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { domGlobalsUsed, DOM_METHODS, stripComments } = require('../scripts/analyze-closure');

const root = path.join(__dirname, '..');
const IMPORT_SOURCE = /(?:from|import)\s*['"]([^'"]+)['"]/g;

function coreFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'core' ? allJs(full) : coreFiles(full);
    return [];
  });
}
function allJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return allJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = coreFiles(path.join(root, 'src'));
assert.ok(files.length > 0, 'expected core/ files');
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const code = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const used = domGlobalsUsed(code);
  assert.deepStrictEqual(
    used.map((u) => `${u.name} (line ${u.line})`),
    [],
    `${rel} is under core/ but uses browser globals (move it to ui/)`,
  );
  const text = stripComments(code);
  const method = DOM_METHODS.exec(text);
  assert.ok(!method, `${rel} is under core/ but calls a DOM method (${method && method[0]}); move it to ui/`);
  for (const [, source] of text.matchAll(IMPORT_SOURCE)) {
    // a relative import is tested on its path under src/ (a checkout under a directory named ui must not count),
    // a '#country/...' specifier on its own text
    const target = source.startsWith('.') ? path.relative(path.join(root, 'src'), path.resolve(path.dirname(file), source)) : source;
    const segments = target.split(/[\\/]/);
    assert.ok(!segments.includes('ui'), `${rel} is under core/ but imports ${source}, a ui/ module`);
  }
}
console.log(`core_purity OK (${files.length} core files)`);
