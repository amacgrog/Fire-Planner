// Tests for scripts/lib/marker-source.js (plain Node, fixture trees in tmp).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findMarkerSource } = require('../scripts/lib/marker-source');

const made = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-source-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return root;
}

try {
  const BLOCK = ['  // RULES:begin', '  export const RULES = { a: 1 };', '  // RULES:end', ''].join('\n');

  // The block can sit in main.js or in a module; `export` is removed so the text can be evaluated as a script.
  let root = tree({ 'src/us/main.js': `(() => {\n${BLOCK}})();\n`, 'src/us/core/other.js': 'export const x = 1;\n' });
  let found = findMarkerSource(root, 'us', 'RULES');
  assert.strictEqual(found.file, 'src/us/main.js');
  assert.ok(found.text.includes('  const RULES = { a: 1 };') && !found.text.includes('export'));

  root = tree({ 'src/us/main.js': '(() => {})();\n', 'src/us/core/rules.js': BLOCK });
  found = findMarkerSource(root, 'us', 'RULES');
  assert.strictEqual(found.file, 'src/us/core/rules.js');
  assert.strictEqual(found.text, BLOCK.replace('export ', ''));

  // A comment that merely mentions the marker is not a marker; the other planner's files are not searched.
  root = tree({
    'src/us/main.js': '// the block between `RULES:begin` and `RULES:end`\n',
    'src/canada/main.js': BLOCK,
  });
  assert.throws(() => findMarkerSource(root, 'us', 'RULES'), /expected exactly one file under src\/us\/ .* found 0/);
  assert.strictEqual(findMarkerSource(root, 'canada', 'RULES').file, 'src/canada/main.js');

  // Two files with the same marker is an error, not a guess.
  root = tree({ 'src/us/main.js': BLOCK, 'src/us/core/rules.js': BLOCK });
  assert.throws(() => findMarkerSource(root, 'us', 'RULES'), /found 2/);

  console.log('marker_source OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
