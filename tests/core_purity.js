// Files under src/**/core/ must not touch the DOM or browser storage (spec section 3, rule 1): they have to be
// importable in plain Node. Uses scope analysis, so comments, strings and local names that happen to be called
// `window` or `document` do not count.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { domGlobalsUsed } = require('../scripts/analyze-closure');

const root = path.join(__dirname, '..');
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
  const used = domGlobalsUsed(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  assert.deepStrictEqual(
    used.map((u) => `${u.name} (line ${u.line})`),
    [],
    `${rel} is under core/ but uses browser globals (move it to ui/)`,
  );
}
console.log(`core_purity OK (${files.length} core files)`);
