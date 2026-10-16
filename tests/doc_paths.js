// Every `src/...js` path named in CLAUDE.md and in docs/superpowers/inventory/*.md exists on disk (the regroup tool
// rewrites exact paths in CLAUDE.md and the region maps; this catches a path it missed or a hand edit that went stale).
// `{a,b}` is expanded (`src/{us,canada}/main.js` names two files); a path with `*` or `<...>` is a pattern or a
// placeholder, not a file, and is skipped; ALLOW lists the few paths that are examples on purpose, each with its reason.
// `--root DIR` checks another tree (the fixture runs below use it). Run without --root, it first runs its fixtures, then
// checks this repository, and also fails when an ALLOW entry is no longer named anywhere.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ALLOW = new Map([
  ['src/us/core/ui/x.js', 'stage4-open-items.md (T10fixB): a made-up path showing that two side tests disagree on it'],
  ['src/us/core/b.js', 'stage4-open-items.md (T10fixB): a file of a tests/extraction_plan.js fixture tree, not of src/'],
]);
const PATH = /(?<![\w./-])src\/[\w./{},<>*-]*?\.js(?!\w)/g;

function expand(p) {
  const m = /\{([^{}]*)\}/.exec(p);
  if (!m) return [p];
  return m[1].split(',').flatMap((alt) => expand(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length)));
}
function docsOf(root) {
  const dir = path.join(root, 'docs', 'superpowers', 'inventory');
  const inv = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort().map((n) => `docs/superpowers/inventory/${n}`) : [];
  return [...(fs.existsSync(path.join(root, 'CLAUDE.md')) ? ['CLAUDE.md'] : []), ...inv];
}
function check(root, { allowStale }) {
  const docs = docsOf(root);
  const missing = [];
  const allowSeen = new Set();
  let paths = 0;
  let skipped = 0;
  for (const doc of docs) {
    fs.readFileSync(path.join(root, doc), 'utf8').split(/\r?\n/).forEach((line, i) => {
      for (const [p] of line.matchAll(PATH)) {
        if (/[*<>]/.test(p)) {
          skipped++;
          continue;
        }
        for (const q of expand(p)) {
          paths++;
          if (ALLOW.has(q)) allowSeen.add(q);
          else if (!fs.existsSync(path.join(root, q))) missing.push(`${doc}:${i + 1}: ${q}`);
        }
      }
    });
  }
  const stale = allowStale ? [...ALLOW.keys()].filter((p) => !allowSeen.has(p)) : [];
  return { docs, missing, stale, paths, skipped };
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--root');
if (at >= 0) {
  const root = path.resolve(argv[at + 1] || '.');
  const r = check(root, { allowStale: false });
  if (!r.docs.length) {
    console.error(`doc_paths FAILED: no CLAUDE.md or docs/superpowers/inventory/*.md under ${root} (wrong --root?)`);
    process.exit(1);
  }
  if (r.missing.length) {
    console.error(r.missing.join('\n'));
    console.error(`doc_paths FAILED (${r.missing.length} path${r.missing.length === 1 ? '' : 's'} named but missing)`);
    process.exit(1);
  }
  console.log(`doc_paths OK (${r.paths} paths in ${r.docs.length} docs, ${r.skipped} patterns skipped)`);
  process.exit(0);
}

// the fixtures, through the command line
const made = [];
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-paths-'));
  made.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const runOn = (root) => spawnSync(process.execPath, [__filename, '--root', root], { encoding: 'utf8' });
try {
  const SRC = { 'src/us/main.js': '', 'src/canada/main.js': '', 'src/shared/ui/a.js': '' };
  const ok = runOn(tree({ ...SRC, 'CLAUDE.md': 'See `src/us/main.js`, `src/{us,canada}/main.js`, `src/<country>/main.js`, src/**/*.js and `src/package.json`.\n', 'docs/superpowers/inventory/m.md': '| `src/shared/ui/a.js` |\n' }));
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.ok(/doc_paths OK \(4 paths in 2 docs, 2 patterns skipped\)/.test(ok.stdout), ok.stdout);
  const bad = runOn(tree({ ...SRC, 'docs/superpowers/inventory/stage4-region-map.md': 'x\n| r | `src/shared/ui/gone.js` |\n' }));
  assert.strictEqual(bad.status, 1, 'a doc naming a missing path fails');
  assert.ok(bad.stderr.includes('docs/superpowers/inventory/stage4-region-map.md:2: src/shared/ui/gone.js'), bad.stderr);
  const brace = runOn(tree({ 'src/us/main.js': '', 'CLAUDE.md': '`src/{us,canada}/main.js`\n' }));
  assert.strictEqual(brace.status, 1, 'each alternative of a brace must exist');
  assert.ok(brace.stderr.includes('CLAUDE.md:1: src/canada/main.js'), brace.stderr);
  assert.strictEqual(runOn(tree({ 'src/us/main.js': '' })).status, 1, 'no docs at all fails');
} finally {
  made.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}

// this repository
const root = path.join(__dirname, '..');
const r = check(root, { allowStale: true });
const problems = [...r.missing, ...r.stale.map((p) => `ALLOW entry ${p} is no longer named in any doc: remove it`)];
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`doc_paths FAILED (${problems.length})`);
  process.exit(1);
}
console.log(`doc_paths OK (${r.paths} paths in ${r.docs.length} docs, ${r.skipped} patterns skipped, ${ALLOW.size} allowed examples)`);
