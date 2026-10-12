// Both planner sources must reference only declared names and assign no implicit global.
// esbuild does not report an undeclared identifier (it fails at runtime), so this is the guard
// for edits that remove a declaration (stage 1 moves many bindings out of the closure).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyze } = require('../scripts/analyze-closure');

for (const dir of ['us', 'canada']) {
  const file = path.join(__dirname, '..', 'src', dir, 'main.js');
  const model = analyze(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  assert.deepStrictEqual(
    model.unknownGlobals.map((g) => `${g.name} (line ${g.line})`),
    [],
    `src/${dir}/main.js references names that are not declared anywhere`,
  );
  assert.deepStrictEqual(model.implicitGlobalWrites, [], `src/${dir}/main.js assigns an implicit global`);
}
console.log('closure_names OK');
