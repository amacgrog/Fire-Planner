// Every source file under src/ must reference only names it declares or imports (or built-ins and browser
// globals). esbuild does not report an undeclared identifier (it fails at runtime), so this is the guard for
// edits that move or remove declarations, which the module split does constantly.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { undeclaredNames } = require('../scripts/analyze-closure');

const srcDir = path.join(__dirname, '..', 'src');
function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = jsFiles(srcDir);
assert.ok(files.length >= 3, 'expected to find the source files');
for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file).split(path.sep).join('/');
  const bad = undeclaredNames(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  assert.deepStrictEqual(
    bad.map((b) => `${b.name} (line ${b.line})`),
    [],
    `${rel} references names that are not declared or imported`,
  );
}
console.log(`closure_names OK (${files.length} files)`);
