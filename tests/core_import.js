'use strict';
// Every core/ module imports cleanly in plain Node (spec sections 1, 10 and 14): for each country, each .js file
// under src/shared/core and src/<country>/core is imported with --conditions=<country> in a FRESH process. One
// process per module on purpose: a module that only works when some other module happened to be imported first
// (an import cycle that reaches a binding before its initializer ran, e.g. "Cannot access 'BUCKET_STEP' before
// initialization") is the failure this test exists to catch, and a shared process would hide it behind whatever
// was loaded earlier. It covers the country seam facades (src/<country>/core/seam-<name>.js) too.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

const listJs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listJs(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
};

const failures = [];
let count = 0;
for (const c of ['us', 'canada']) {
  const files = [...listJs(path.join(root, 'src', 'shared', 'core')), ...listJs(path.join(root, 'src', c, 'core'))];
  for (const file of files) {
    const code = 'import(' + JSON.stringify(pathToFileURL(file).href) + ').catch((e) => { console.error(e.message); process.exit(1); })';
    const run = spawnSync(process.execPath, ['--conditions=' + c, '--input-type=module', '-e', code], { encoding: 'utf8' });
    count++;
    if (run.status !== 0) {
      const first = String(run.stderr || run.error || '').trim().split('\n')[0];
      failures.push(`${path.relative(root, file)} (${c}): ${first}`);
    }
  }
}

assert.deepStrictEqual(failures, []);
console.log(`core_import OK (${count} imports)`);
