// No src/**/*.js file name ends in -<digits>.js except the ones listed here (stage 4 design section 2). A file arrives in
// ALLOWED with the batch that creates it (never earlier) and leaves with it in the tidy batch; an entry whose file no
// longer exists fails, so the list cannot go stale.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ALLOWED = [
  'src/shared/core/bond-ladder-2.js',
  'src/shared/core/estimates-and-warnings-2.js',
  'src/shared/core/lists-and-children-2.js',
  'src/shared/core/monte-carlo-paths-2.js',
  'src/shared/core/simulate-at-real-cagr-2.js',
  'src/shared/core/sweep-excess-cash-2.js',
  'src/shared/core/year-factors-2.js',
  'src/shared/ui/undo-2.js',
  'src/shared/ui/wizard-2.js',
];

function allJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allJs(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}
function check(root, allowed) {
  const rel = allJs(path.join(root, 'src')).map((f) => path.relative(root, f).split(path.sep).join('/'));
  const problems = [];
  for (const f of rel) if (/-\d+\.js$/.test(f) && !allowed.includes(f)) problems.push(`numbered module name not allowed: ${f}`);
  for (const a of allowed) if (!rel.includes(a)) problems.push(`stale allow-list entry: ${a}`);
  return problems;
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-names-'));
  try {
    const w = (rel) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), 'export {};\n');
    };
    w('src/shared/core/x.js');
    w('src/shared/core/x-2.js');
    w('src/us/ui/y-10.js');
    w('src/us/ui/z-2a.js');
    assert.deepStrictEqual(check(root, ['src/shared/core/x-2.js', 'src/us/ui/y-10.js']), []);
    assert.deepStrictEqual(check(root, ['src/shared/core/x-2.js']), ['numbered module name not allowed: src/us/ui/y-10.js']);
    assert.deepStrictEqual(check(root, ['src/shared/core/x-2.js', 'src/us/ui/y-10.js', 'src/us/ui/gone-3.js']), ['stale allow-list entry: src/us/ui/gone-3.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const problems = check(path.join(__dirname, '..'), ALLOWED);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`module_names OK (${ALLOWED.length} allowed)`);
