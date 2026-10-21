'use strict';
// sideOf / isFacade of scripts/lib/src-paths.js, and every file under src/ has a side.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sideOf, isFacade } = require('../scripts/lib/src-paths');

assert.strictEqual(sideOf('src/us/ui/charts/x.js'), 'ui');
assert.strictEqual(sideOf('src/shared/core/tax/x.js'), 'core');
assert.strictEqual(sideOf('src/us/core/x.js'), 'core');
assert.strictEqual(sideOf('src/us/core/ui/x.js'), null);
assert.strictEqual(sideOf('src/us/ui/core/x.js'), null);
assert.strictEqual(sideOf('src/us/main.js'), 'entry');
assert.strictEqual(sideOf('src/canada/storage-key.js'), 'entry');
assert.strictEqual(sideOf('src/shared/main.js'), null);
assert.strictEqual(sideOf('src/us/misc/x.js'), null);
assert.strictEqual(sideOf(['src', 'us', 'ui', 'x.js'].join(String.fromCharCode(92))), 'ui');
assert.strictEqual(isFacade('src/us/core/seam-taxFor.js'), true);
assert.strictEqual(isFacade('src/us/core/tax/seam-taxFor.js'), false);

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(path.relative(root, p).split(path.sep).join('/'));
  }
})(path.join(root, 'src'));
const bad = files.filter((f) => sideOf(f) === null);
assert.ok(bad.length === 0, `files with no side:\n${bad.join('\n')}`);
console.log(`src_paths OK (${files.length} files)`);
