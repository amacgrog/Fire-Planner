// No bare `import 'x'` (side-effect import) in src/**/*.js: a module's behavior must come from names it reads, so the
// import graph stays honest (stage 4 design section 5.3). Fixture trees first, then the real tree.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BARE = /^\s*import\s+['"]/;
function allJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return allJs(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}
function check(root) {
  const files = allJs(path.join(root, 'src'));
  const bad = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (BARE.test(l)) bad.push(`${path.relative(root, f)}:${i + 1}: ${l.trim()}`);
    });
  }
  return { files: files.length, bad };
}

{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bare-imports-'));
  try {
    const w = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    w('src/a.js', "import { x } from './b.js';\nexport const y = x;\n");
    assert.deepStrictEqual(check(root).bad, []);
    w('src/us/ui/c.js', "import './b.js';\n");
    w('src/d.js', "  import \"./b.js\";\n// import './b.js' in a comment is not at the line start\n");
    const r = check(root);
    assert.strictEqual(r.files, 3);
    assert.strictEqual(r.bad.length, 2);
    assert.ok(/c\.js:1/.test(r.bad.join('\n')) && /d\.js:1/.test(r.bad.join('\n')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const real = check(path.join(__dirname, '..'));
if (real.bad.length) {
  console.error(real.bad.join('\n'));
  process.exit(1);
}
console.log(`no_bare_imports OK (${real.files} files)`);
