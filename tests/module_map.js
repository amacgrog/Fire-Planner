// scripts/module-map.js on fixture trees (--root DIR): with no flag it writes docs/superpowers/inventory/module-map.md;
// --check and --require-purpose, alone or together, only check and never write (the file stays byte-identical, even
// when it is stale); a ui/ module without a purpose comment fails --require-purpose.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = path.join(__dirname, '..', 'scripts', 'module-map.js');
const MAP = 'docs/superpowers/inventory/module-map.md';
const made = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-map-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const run = (root, ...args) => spawnSync(process.execPath, [cli, '--root', root, ...args], { encoding: 'utf8' });
const mapOf = (root) => fs.readFileSync(path.join(root, MAP), 'utf8');

try {
  const GOOD = { 'src/shared/ui/x.js': '// Does x.\n\nexport function x() {}\n', 'src/us/core/y.js': 'export const y = 1;\n' };
  const STALE = 'stale map\r\n';

  // no flag: writes the map
  {
    const root = tree(GOOD);
    const r = run(root);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(/\| `src\/shared\/ui\/x\.js` \| x \| Does x\. \|/.test(mapOf(root)), mapOf(root));
    assert.strictEqual(run(root, '--check').status, 0, 'the written map is current');
    assert.strictEqual(run(root, '--check', '--require-purpose').status, 0);
  }
  // the check flags never write, alone or together, stale or not
  for (const flags of [['--require-purpose'], ['--check'], ['--check', '--require-purpose'], ['--require-purpose', '--check']]) {
    const root = tree({ ...GOOD, [MAP]: STALE });
    const r = run(root, ...flags);
    assert.strictEqual(mapOf(root), STALE, `${flags.join(' ')} leaves the map byte-identical`);
    assert.strictEqual(r.status, flags.includes('--check') ? 1 : 0, `${flags.join(' ')}: exit ${r.status} (${r.stderr})`);
    if (flags.includes('--check')) assert.ok(/module-map\.md is stale/.test(r.stderr), r.stderr);
  }
  // --require-purpose fails on a ui/ module without a purpose comment (and still writes nothing)
  {
    const root = tree({ ...GOOD, 'src/us/ui/z.js': 'export function z() {}\n', [MAP]: STALE });
    const r = run(root, '--require-purpose');
    assert.strictEqual(r.status, 1);
    assert.ok(/ui modules without a purpose comment \(1\):\s+src\/us\/ui\/z\.js/.test(r.stderr), r.stderr);
    assert.strictEqual(mapOf(root), STALE);
  }
  // bad arguments
  for (const args of [['--bogus'], ['--root']]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.strictEqual(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
  }
  console.log('module_map OK');
} finally {
  made.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}
