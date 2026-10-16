// Tests for scripts/lib/regroup.js and scripts/regroup-modules.js (plain Node, fixture trees in tmp; stage 4 design
// section 5.8). The fixtures are miniatures of the real layout: src/package.json with the #country alias, two planners,
// shared and country modules, seam facades, and copies of tests/state_modules.js and CLAUDE.md. After every applied map
// both planners are bundled the way the build does and must produce what they produced before.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');
const esbuild = require('esbuild');
const { regroup } = require('../scripts/lib/regroup');

// Every temp directory of this run (fixture trees and the tool's own regroup-* directories, also those of the CLI child
// processes, which inherit the environment) lives under one private directory, so the leak check below counts only this
// run's directories and another process running the tool at the same time cannot make it fail.
const PRIVATE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'regroupmodules-test-'));
for (const k of ['TMPDIR', 'TMP', 'TEMP']) process.env[k] = PRIVATE_TMP;
if (os.tmpdir() !== PRIVATE_TMP) throw new Error('os.tmpdir() does not follow the environment');
const made = [PRIVATE_TMP];
function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

const PACKAGE = '{ "private": true, "type": "module", "imports": { "#country/*": { "us": "./us/*.js", "canada": "./canada/*.js" } } }\n';
const mainText = (country) =>
  [
    "import { helper } from '../shared/ui/helper.js';",
    "import { useIt } from '../shared/ui/user.js';",
    "import { a } from '../shared/ui/a.js';",
    "import { t } from '../shared/ui/third.js';",
    "import { h } from '../shared/ui/m2.js';",
    '(() => {',
    `  window.__out = [helper(1), useIt(), a(), t(), h(), '${country}'].join(',');`,
    '})();',
    '',
  ].join('\n');
const BASE = {
  'src/package.json': PACKAGE,
  'src/shared/core/k.js': 'export const k = 10;\n',
  'src/shared/core/store.js': 'export const state = { n: 1 };\n',
  'src/shared/ui/helper.js': 'export function helper(n) {\n  return n * 2;\n}\n',
  'src/us/ui/seam-helper.js': "export { helper } from '../../shared/ui/helper.js';\n",
  'src/canada/ui/seam-helper.js': "export { helper } from '../../shared/ui/helper.js';\n",
  'src/shared/ui/user.js': "import { helper } from '#country/ui/seam-helper';\n\nexport function useIt() {\n  return helper(3);\n}\n",
  'src/shared/ui/b.js': "import { k } from '../core/k.js';\n\nexport function b() {\n  return k;\n}\n",
  'src/shared/ui/a.js': "import { b } from './b.js';\nimport { k } from '../core/k.js';\n\nexport function a() {\n  return b() + k;\n}\n",
  'src/shared/ui/m1.js': '// returns one\nexport function f() {\n  return 1;\n}\nexport function g() {\n  return f() + 1;\n}\n',
  'src/shared/ui/m2.js': 'export function h() {\n  return 5;\n}\n',
  'src/shared/ui/third.js': "import { f, g } from './m1.js';\n\nexport function t() {\n  return f() + g();\n}\n",
  'src/us/main.js': mainText('us'),
  'src/canada/main.js': mainText('canada'),
  'tests/state_modules.js': "const store = await load('src/shared/core/store.js');\n",
  'CLAUDE.md': '- `src/shared/core/store.js` holds the state; `src/shared/core/store.js.bak` is a decoy; src/shared/ui/helper.js doubles.\n',
};
const EXPECTED = { us: '2,6,20,3,5,us', canada: '2,6,20,3,5,canada' };

function tree(extra = {}, drop = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regroup-test-'));
  made.push(root);
  for (const [rel, text] of Object.entries({ ...BASE, ...extra })) if (!drop.includes(rel) && text !== null) write(root, rel, text);
  return root;
}
// every file under root, path -> text
function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}
async function bundle(root, country) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src', country, 'main.js')],
    bundle: true,
    write: false,
    format: 'iife',
    conditions: [country],
    logLevel: 'silent',
    outfile: 'out.js',
  });
  return result.outputFiles[0].text;
}
async function run(root, country) {
  const window = {};
  const document = { getElementById: (id) => ({ id }) };
  vm.runInNewContext(await bundle(root, country), { window, document });
  return window.__out;
}
async function bothRun(root) {
  return { us: await run(root, 'us'), canada: await run(root, 'canada') };
}
// regroup must refuse with a message matching re and write nothing
function refuses(root, ops, re, what) {
  const before = snapshot(root);
  let err = null;
  try {
    regroup(root, ops, {});
  } catch (e) {
    err = e;
  }
  assert.ok(err, `${what}: expected a refusal`);
  assert.ok(re.test(err.message), `${what}: message "${err.message}" does not match ${re}`);
  assert.deepStrictEqual(snapshot(root), before, `${what}: nothing is written`);
  return err;
}
const tmpRegroupDirs = () => fs.readdirSync(PRIVATE_TMP).filter((n) => /^regroup-(?!test-)/.test(n));

(async () => {
  assert.deepStrictEqual(tmpRegroupDirs(), [], 'the private temp directory starts empty');

  // ---- 0. the base fixture builds
  {
    const root = tree();
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'base fixture');
  }

  // ---- 1. rename a shared module imported by both planners and by a facade
  {
    const root = tree();
    const report = regroup(root, [{ rename: 'src/shared/ui/helper.js', to: 'src/shared/ui/doubling.js' }], {});
    assert.ok(!exists(root, 'src/shared/ui/helper.js'), 'old path gone');
    assert.strictEqual(read(root, 'src/shared/ui/doubling.js'), BASE['src/shared/ui/helper.js'], 'text moved verbatim');
    for (const c of ['us', 'canada']) {
      assert.ok(read(root, `src/${c}/main.js`).startsWith("import { helper } from '../shared/ui/doubling.js';\n"), `${c}/main.js rewritten`);
      assert.strictEqual(read(root, `src/${c}/ui/seam-helper.js`), "export { helper } from '../../shared/ui/doubling.js';\n", `${c} facade rewritten`);
    }
    assert.strictEqual(read(root, 'src/shared/ui/user.js'), BASE['src/shared/ui/user.js'], 'the #country specifier is unchanged');
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'fixture 1 builds');
    assert.ok(/^op 0: rename src\/shared\/ui\/helper\.js -> src\/shared\/ui\/doubling\.js/.test(report.lines[0]), report.lines[0]);
    assert.strictEqual(report.filesWritten, 6, 'doubling.js, two main.js, two facades, CLAUDE.md');
    assert.ok(read(root, 'CLAUDE.md').includes('src/shared/ui/doubling.js doubles'), 'CLAUDE.md rewritten');
    // a rename that changes directories recomputes the renamed file's own relative imports
    regroup(root, [{ rename: 'src/shared/ui/a.js', to: 'src/shared/ui/sub/a.js' }], {});
    assert.ok(read(root, 'src/shared/ui/sub/a.js').startsWith("import { b } from '../b.js';\nimport { k } from '../../core/k.js';\n"));
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'fixture 1b builds');
  }

  // ---- 2. merge two shared ui/ modules where one imports the other
  {
    const root = tree();
    regroup(root, [{ merge: ['src/shared/ui/a.js', 'src/shared/ui/b.js'], to: 'src/shared/ui/ab.js' }], {});
    assert.ok(!exists(root, 'src/shared/ui/a.js') && !exists(root, 'src/shared/ui/b.js'), 'sources deleted');
    assert.strictEqual(
      read(root, 'src/shared/ui/ab.js'),
      "import { k } from '../core/k.js';\n\nfunction b() {\n  return k;\n}\nexport function a() {\n  return b() + k;\n}\n",
      'one file, dependency order (b before a), no self-import, imports merged, export dropped where no other file imports',
    );
    for (const c of ['us', 'canada']) assert.ok(read(root, `src/${c}/main.js`).includes("import { a } from '../shared/ui/ab.js';"));
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'fixture 2 builds');
  }

  // ---- 3. move a function between modules
  {
    const root = tree();
    const report = regroup(root, [{ move: 'f', from: 'src/shared/ui/m1.js', to: 'src/shared/ui/m2.js' }], {});
    assert.strictEqual(read(root, 'src/shared/ui/m1.js'), "import { f } from './m2.js';\n\nexport function g() {\n  return f() + 1;\n}\n", 'm1 imports f for g');
    assert.strictEqual(read(root, 'src/shared/ui/m2.js'), 'export function h() {\n  return 5;\n}\n// returns one\nexport function f() {\n  return 1;\n}\n', 'f with its comment');
    assert.strictEqual(
      read(root, 'src/shared/ui/third.js'),
      "import { g } from './m1.js';\nimport { f } from './m2.js';\n\nexport function t() {\n  return f() + g();\n}\n",
      'the third module imports f from its new place',
    );
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'fixture 3 builds');
    assert.ok(/^op 0: move f src\/shared\/ui\/m1\.js -> src\/shared\/ui\/m2\.js/.test(report.lines[0]), report.lines[0]);
    // a move that empties its source deletes it; the moved name's imports travel with it
    regroup(root, [{ move: 'g', from: 'src/shared/ui/m1.js', to: 'src/shared/ui/m3.js' }], {});
    assert.ok(!exists(root, 'src/shared/ui/m1.js'), 'm1 emptied and deleted');
    assert.strictEqual(read(root, 'src/shared/ui/m3.js'), "import { f } from './m2.js';\n\nexport function g() {\n  return f() + 1;\n}\n");
    assert.ok(read(root, 'src/shared/ui/third.js').startsWith("import { g } from './m3.js';\nimport { f } from './m2.js';\n"));
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'fixture 3b builds');
  }

  // ---- 3c. tidy imports: a target whose only import was the moved name loses the import line and the blank line under
  // it; two imports that a merge points at one module become one declaration
  {
    const root = tree({
      'src/shared/ui/user2.js': "import { f } from './m1.js';\n\nexport function u2() {\n  return f();\n}\n",
      'src/shared/ui/d1.js': 'export function d1() {\n  return 1;\n}\n',
      'src/shared/ui/d2.js': 'export function d2() {\n  return 2;\n}\n',
      'src/shared/ui/consumer.js': "import { d1 } from './d1.js';\nimport { k } from '../core/k.js';\nimport { d2 } from './d2.js';\n\nexport function c() {\n  return d1() + d2() + k;\n}\n",
    });
    regroup(root, [
      { move: 'f', from: 'src/shared/ui/m1.js', to: 'src/shared/ui/user2.js' },
      { merge: ['src/shared/ui/d1.js', 'src/shared/ui/d2.js'], to: 'src/shared/ui/d.js' },
    ], {});
    assert.strictEqual(read(root, 'src/shared/ui/user2.js'), 'export function u2() {\n  return f();\n}\n// returns one\nexport function f() {\n  return 1;\n}\n');
    assert.strictEqual(read(root, 'src/shared/ui/consumer.js'), "import { d1, d2 } from './d.js';\nimport { k } from '../core/k.js';\n\nexport function c() {\n  return d1() + d2() + k;\n}\n");
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'fixture 3c builds');
  }

  // ---- 4. paths outside src/: tests/state_modules.js, CLAUDE.md, generated rule docs
  {
    const root = tree({
      'src/us/core/foo-rules.js': '// FOO_RULES:begin\nexport const FOO = 1;\n// FOO_RULES:end\n',
      'scripts/gen-foo-rules.js': "const SOURCE = findMarkerSource(root, 'us', 'FOO_RULES');\n",
      'package.json': '{ "scripts": { "gen:foo": "node scripts/gen-foo-rules.js" } }\n',
    });
    const report = regroup(root, [
      { rename: 'src/shared/core/store.js', to: 'src/shared/core/state-store.js' },
      { rename: 'src/us/core/foo-rules.js', to: 'src/us/core/foo-table.js' },
    ], {});
    assert.strictEqual(read(root, 'tests/state_modules.js'), "const store = await load('src/shared/core/state-store.js');\n");
    assert.strictEqual(
      read(root, 'CLAUDE.md'),
      '- `src/shared/core/state-store.js` holds the state; `src/shared/core/store.js.bak` is a decoy; src/shared/ui/helper.js doubles.\n',
      'exact path strings only',
    );
    assert.strictEqual(report.lines.filter((l) => l === 'regenerate: npm run gen:foo').length, 1, report.lines.join('\n'));
    assert.ok(!report.lines.some((l) => /regenerate: npm run gen:(states|provinces|benefits)/.test(l)), 'only the doc whose source moved');
  }

  // ---- 5. refusals
  {
    const root = tree();
    refuses(root, [{ rename: 'src/shared/ui/helper.js', to: 'src/shared/ui/m2.js' }], /^op 0 \(rename .*\): rename target exists: src\/shared\/ui\/m2\.js$/, 'rename onto an existing path');
  }
  {
    const root = tree({ 'src/shared/ui/x1.js': 'export const x = 1;\n', 'src/shared/ui/x2.js': 'export const x = 2;\n' });
    refuses(root, [{ merge: ['src/shared/ui/x1.js', 'src/shared/ui/x2.js'], to: 'src/shared/ui/x.js' }], /name clash: x in src\/shared\/ui\/x\.js/, 'merge of two modules that both declare x');
  }
  {
    const root = tree({
      'src/shared/ui/src-x.js': 'export function x() {\n  return 1;\n}\n',
      'src/shared/ui/other-x.js': 'export function x() {\n  return 2;\n}\n',
      'src/shared/ui/dest.js': "import { x } from './other-x.js';\n\nexport function d() {\n  return x();\n}\n",
    });
    refuses(root, [{ move: 'x', from: 'src/shared/ui/src-x.js', to: 'src/shared/ui/dest.js' }], /name clash: x in src\/shared\/ui\/dest\.js/, 'move of x into a module that imports another x');
  }
  {
    // the moved declaration needs the import binding y, which the target declares itself
    const root = tree({
      'src/shared/core/y.js': 'export const y = 1;\n',
      'src/shared/ui/p.js': "import { y } from '../core/y.js';\n\nexport function p() {\n  return y;\n}\n",
      'src/shared/ui/q.js': 'export const y = 2;\n',
    });
    refuses(root, [{ move: 'p', from: 'src/shared/ui/p.js', to: 'src/shared/ui/q.js' }], /name clash: y in src\/shared\/ui\/q\.js/, 'a declaration sharing its name with an import binding (move)');
    refuses(root, [{ merge: ['src/shared/ui/p.js', 'src/shared/ui/q.js'], to: 'src/shared/ui/pq.js' }], /name clash: y in src\/shared\/ui\/pq\.js/, 'a declaration sharing its name with an import binding (merge)');
  }
  {
    // a.js -> x.js -> b.js; merging a and b makes ab <-> x, a cycle through core/
    const root = tree({
      'src/shared/core/ca.js': "import { cx } from './cx.js';\nexport function ca() {\n  return cx();\n}\n",
      'src/shared/core/cx.js': "import { cb } from './cb.js';\nexport function cx() {\n  return cb();\n}\n",
      'src/shared/core/cb.js': 'export function cb() {\n  return 1;\n}\n',
    });
    refuses(root, [{ merge: ['src/shared/core/ca.js', 'src/shared/core/cb.js'], to: 'src/shared/core/cab.js' }], /import cycle outside ui\/ \(us\): .*src\/shared\/core\/cab\.js/, 'a merge that creates a cycle through core/');
  }
  {
    // p <-> q, a cycle of ui modules; p holds an unmarked initializer that is not inert
    const root = tree({
      'src/shared/ui/p.js': "import { q } from './q.js';\nconst v = [1].map((n) => n);\nexport function p() {\n  return q() + v[0];\n}\n",
      'src/shared/ui/q.js': "import { p } from './p.js';\nexport function q() {\n  return p;\n}\n",
    });
    refuses(root, [{ merge: ['src/shared/ui/p.js', 'src/shared/ui/q.js'], to: 'src/shared/ui/pq.js' }], /merge of cycle members: src\/shared\/ui\/p\.js line 2: v: not inert and not marked/, 'a merge of cycle members with an unmarked non-inert initializer');
  }
  {
    const root = tree({ 'src/shared/ui/counter.js': 'export let n = 0;\nexport function bump() {\n  n++;\n}\n' });
    refuses(root, [{ move: 'n', from: 'src/shared/ui/counter.js', to: 'src/shared/ui/m2.js' }], /mutable binding n is written by bump, which stays in src\/shared\/ui\/counter\.js/, 'a move of let n without its writer function');
  }
  {
    const root = tree({ 'src/shared/ui/dom.js': "export function el() {\n  return document.getElementById('x');\n}\n" });
    refuses(root, [{ move: 'el', from: 'src/shared/ui/dom.js', to: 'src/shared/core/k.js' }], /move into core\/: el uses document/, 'a move of a document-using function into core/');
    // the guards run after every operation: a later refused operation leaves the earlier ones unwritten too
    refuses(root, [
      { rename: 'src/shared/ui/helper.js', to: 'src/shared/ui/doubling.js' },
      { move: 'el', from: 'src/shared/ui/dom.js', to: 'src/shared/core/k.js' },
    ], /^op 1 \(move el/, 'refusal names its operation');
  }

  {
    // a named import its module does not export is refused even in a module the planners do not reach (the build alone
    // would not see it)
    const root = tree({ 'src/shared/ui/orphan.js': "import { nope } from './m2.js';\n\nexport function orphan() {\n  return nope;\n}\n" });
    refuses(root, [{ rename: 'src/shared/ui/helper.js', to: 'src/shared/ui/doubling.js' }], /missing export: src\/shared\/ui\/orphan\.js imports nope from \.\/m2\.js, which src\/shared\/ui\/m2\.js does not export/, 'missing export');
  }

  // ---- 5b. data blocks (// NAME:begin ... // NAME:end): markers are never carried away and stay paired
  {
    const DB = '// FOO_RULES:begin\nexport const FOO = 1;\n// FOO_RULES:end\nexport function after() {\n  return FOO;\n}\n';
    // a declaration right after an end marker moves without it
    const root = tree({ 'src/shared/core/dm.js': DB });
    regroup(root, [{ move: 'after', from: 'src/shared/core/dm.js', to: 'src/shared/core/after.js' }], {});
    assert.strictEqual(read(root, 'src/shared/core/dm.js'), '// FOO_RULES:begin\nexport const FOO = 1;\n// FOO_RULES:end\n', 'the end marker stays');
    assert.strictEqual(read(root, 'src/shared/core/after.js'), "import { FOO } from './dm.js';\n\nexport function after() {\n  return FOO;\n}\n", 'and is not carried');
    // a declaration inside a block is refused, whole block or not
    refuses(tree({ 'src/shared/core/dm.js': DB }), [{ move: 'FOO', from: 'src/shared/core/dm.js', to: 'src/shared/core/foo.js' }], /^op 0 \(move FOO .*\): FOO lies inside the data block FOO_RULES in src\/shared\/core\/dm\.js/, 'a move out of a data block');
    // a merge with a file holding a data block keeps its markers paired
    const r3 = tree({ 'src/shared/core/dm.js': DB, 'src/shared/core/dn.js': 'export const N = 2;\n' });
    regroup(r3, [{ merge: ['src/shared/core/dm.js', 'src/shared/core/dn.js'], to: 'src/shared/core/dmn.js' }], {});
    assert.strictEqual(read(r3, 'src/shared/core/dmn.js'), DB + 'export const N = 2;\n');
    // the BENEFIT_RULES case in miniature: two blocks in a row with a section comment between them
    const MINI = '// A_RULES:begin\nexport const A = { a: 1 };\n// A_RULES:end\n// ---- B section ----\n// B rows, pure literals.\n// B_RULES:begin\nexport const B = { b: 2 };\n// B_RULES:end\nexport function useB() {\n  return A.a + B.b;\n}\n';
    refuses(tree({ 'src/canada/core/rules.js': MINI }), [{ move: 'B', from: 'src/canada/core/rules.js', to: 'src/canada/core/b-rules.js' }], /B lies inside the data block B_RULES in src\/canada\/core\/rules\.js/, 'the BENEFIT_RULES case');
    const r4 = tree({ 'src/canada/core/rules.js': MINI });
    regroup(r4, [{ move: 'useB', from: 'src/canada/core/rules.js', to: 'src/canada/core/use-b.js' }], {});
    assert.ok(read(r4, 'src/canada/core/rules.js').endsWith('// B_RULES:end\n'), 'B_RULES:end stays with its block');
    assert.ok(!/RULES/.test(read(r4, 'src/canada/core/use-b.js')), 'no marker travels with useB');
    // the paired check itself runs on every touched file
    refuses(tree({ 'src/shared/core/half.js': '// HALF_RULES:begin\nexport const H = 1;\n' }), [{ rename: 'src/shared/core/half.js', to: 'src/shared/core/half2.js' }], /data-block markers are not paired in src\/shared\/core\/half2\.js: HALF_RULES/, 'unpaired markers');
  }

  // ---- 6. purpose comments
  {
    const root = tree({
      'src/shared/ui/p1.js': "// Purpose one.\n\nimport { k } from '../core/k.js';\n\nexport function one() {\n  return k;\n}\n",
      'src/shared/ui/p2.js': '// Purpose two.\n\nexport function two() {\n  return 2;\n}\n',
      'src/shared/ui/p3.js': '// Purpose three.\n\nexport function three() {\n  return 3;\n}\n',
      'src/shared/ui/p4.js': '// Purpose four.\n\nexport function four() {\n  return 4;\n}\n',
      'src/shared/ui/tgt.js': "// Target purpose.\n\nimport { k } from '../core/k.js';\n\nexport function t0() {\n  return k;\n}\n",
    });
    regroup(root, [{ merge: ['src/shared/ui/p1.js', 'src/shared/ui/p2.js'], to: 'src/shared/ui/fresh.js' }], {});
    assert.strictEqual(
      read(root, 'src/shared/ui/fresh.js'),
      "import { k } from '../core/k.js';\n\nexport function one() {\n  return k;\n}\nexport function two() {\n  return 2;\n}\n",
      'a new target keeps neither purpose comment',
    );
    regroup(root, [{ merge: ['src/shared/ui/p3.js', 'src/shared/ui/p4.js'], to: 'src/shared/ui/tgt.js' }], {});
    assert.strictEqual(
      read(root, 'src/shared/ui/tgt.js'),
      "// Target purpose.\n\nimport { k } from '../core/k.js';\n\nexport function t0() {\n  return k;\n}\nexport function three() {\n  return 3;\n}\nexport function four() {\n  return 4;\n}\n",
      'an existing target keeps its own purpose comment (and its body first when not listed)',
    );
  }

  // ---- 7. a rename onto a path freed by an earlier operation (the check reads the staged state)
  {
    const root = tree({ 'src/shared/ui/r1.js': 'export const r1 = 1;\n', 'src/shared/ui/r2.js': 'export const r2 = 2;\n' });
    refuses(root, [
      { rename: 'src/shared/ui/r2.js', to: 'src/shared/ui/r1.js' },
      { rename: 'src/shared/ui/r1.js', to: 'src/shared/ui/tmp.js' },
    ], /^op 0 \(rename .*\): rename target exists: src\/shared\/ui\/r1\.js$/, 'the other order');
    regroup(root, [
      { rename: 'src/shared/ui/r1.js', to: 'src/shared/ui/tmp.js' },
      { rename: 'src/shared/ui/r2.js', to: 'src/shared/ui/r1.js' },
    ], {});
    assert.strictEqual(read(root, 'src/shared/ui/tmp.js'), 'export const r1 = 1;\n');
    assert.strictEqual(read(root, 'src/shared/ui/r1.js'), 'export const r2 = 2;\n');
  }

  // ---- 8. an existing merge target listed among its own sources
  {
    const files = {
      'src/shared/ui/mx.js': 'export function x() {\n  return 1;\n}\n',
      'src/shared/ui/mt.js': '// The target.\n\nexport function tt() {\n  return 2;\n}\n',
      'src/shared/ui/my.js': 'export function y() {\n  return 3;\n}\n',
    };
    const listed = tree(files);
    regroup(listed, [{ merge: ['src/shared/ui/mx.js', 'src/shared/ui/mt.js', 'src/shared/ui/my.js'], to: 'src/shared/ui/mt.js' }], {});
    assert.strictEqual(
      read(listed, 'src/shared/ui/mt.js'),
      '// The target.\n\nexport function x() {\n  return 1;\n}\nexport function tt() {\n  return 2;\n}\nexport function y() {\n  return 3;\n}\n',
      'x, the target, y; none duplicated',
    );
    assert.ok(!exists(listed, 'src/shared/ui/mx.js') && !exists(listed, 'src/shared/ui/my.js'));
    const unlisted = tree(files);
    regroup(unlisted, [{ merge: ['src/shared/ui/mx.js', 'src/shared/ui/my.js'], to: 'src/shared/ui/mt.js' }], {});
    assert.strictEqual(
      read(unlisted, 'src/shared/ui/mt.js'),
      '// The target.\n\nexport function tt() {\n  return 2;\n}\nexport function x() {\n  return 1;\n}\nexport function y() {\n  return 3;\n}\n',
      'a target that is not listed keeps its body first',
    );
  }

  // ---- 9. the cycle rule through the tool: a marked initializer in a cycle may use only globals and literals
  {
    const cycle = {
      'src/shared/ui/cp.js': "import { cq } from './cq.js';\n// load-time: an empty Set; reads nothing.\nconst seen = new Set();\nexport function cp() {\n  return cq() + seen.size;\n}\n",
      'src/shared/ui/cq.js': "import { cp } from './cp.js';\nexport function cq() {\n  return cp ? 1 : 0;\n}\n",
      // outside any cycle, a marked initializer may call a function of its own module
      'src/shared/ui/cm.js': '// load-time: calls a local helper.\nconst v = local();\nfunction local() {\n  return 1;\n}\nexport function cm() {\n  return v;\n}\n',
      'src/shared/ui/cg.js': "// load-time: looks up a static element.\nconst el = document.getElementById('x');\n// load-time: built-ins.\nconst mx = Math.max(1, 2);\nexport function cg() {\n  return el && mx;\n}\n",
    };
    const root = tree(cycle);
    refuses(root, [{ merge: ['src/shared/ui/cm.js', 'src/shared/ui/cp.js'], to: 'src/shared/ui/cmp.js' }], /load-time guard: src\/shared\/ui\/cmp\.js line \d+: v: reads its module in a cycle \(local\)/, 'a merge that puts a marked initializer calling a local function into a cycle');
    // globals and built-ins only: the same merge with cg is allowed, and so is merging the two cycle members
    regroup(root, [{ merge: ['src/shared/ui/cg.js', 'src/shared/ui/cp.js'], to: 'src/shared/ui/cgp.js' }], {});
    assert.ok(exists(root, 'src/shared/ui/cgp.js'));
    const root2 = tree(cycle);
    regroup(root2, [{ merge: ['src/shared/ui/cp.js', 'src/shared/ui/cq.js'], to: 'src/shared/ui/cpq.js' }], {});
    assert.ok(/const seen = new Set\(\);/.test(read(root2, 'src/shared/ui/cpq.js')), 'cycle members with only inert or global initializers merge');
    // a marked initializer that reads an import, in a cycle: refused
    const root3 = tree({
      ...cycle,
      'src/shared/ui/cq.js': "import { cp } from './cp.js';\nimport { k } from '../core/k.js';\n// load-time: reads an import.\nconst kk = k + 1;\nexport function cq() {\n  return cp ? kk : 0;\n}\n",
    });
    refuses(root3, [{ rename: 'src/shared/ui/m2.js', to: 'src/shared/ui/m2b.js' }], /load-time guard: src\/shared\/ui\/cq\.js line 4: kk: reads its module in a cycle \(k\)/, 'every ui module is checked after every operation');
  }

  // ---- 10. the load-time order report, and the temp directories are removed
  {
    const root = tree({
      'src/us/main.js': "import { la } from '../shared/ui/la.js';\nimport { lb } from '../shared/ui/lb.js';\n(() => {\n  window.__out = la() + lb();\n})();\n",
      'src/canada/main.js': "import { la } from '../shared/ui/la.js';\nimport { lb } from '../shared/ui/lb.js';\n(() => {\n  window.__out = la() + lb();\n})();\n",
      'src/shared/ui/la.js': "// load-time: looks up a static element.\nconst aEl = document.getElementById('a');\nexport function la() {\n  return aEl.id;\n}\n",
      'src/shared/ui/lb.js': "// load-time: looks up a static element.\nconst bEl = document.getElementById('b');\nexport function lb() {\n  return bEl.id;\n}\n",
    });
    assert.strictEqual(await run(root, 'us'), 'ab');
    const report = regroup(root, [{ merge: ['src/shared/ui/lb.js', 'src/shared/ui/la.js'], to: 'src/shared/ui/lab.js' }], {});
    assert.ok(report.lines.includes('  load-time order (us): aEl now initializes after bEl'), report.lines.join('\n'));
    assert.ok(report.lines.includes('  load-time order (canada): aEl now initializes after bEl'), report.lines.join('\n'));
    assert.ok(report.tempDirs.length >= 2, 'a temp directory per operation and one for the start');
    for (const d of report.tempDirs) {
      assert.ok(path.basename(d).startsWith('regroup-') && path.dirname(d) === PRIVATE_TMP, d);
      assert.ok(!fs.existsSync(d), `temp dir removed: ${d}`);
    }
    assert.strictEqual(await run(root, 'us'), 'ab');
    // also removed when an operation is refused
    const root2 = tree({ 'src/shared/ui/x1.js': 'export const x = 1;\n', 'src/shared/ui/x2.js': 'export const x = 2;\n' });
    const err = refuses(root2, [{ merge: ['src/shared/ui/x1.js', 'src/shared/ui/x2.js'], to: 'src/shared/ui/x.js' }], /name clash/, 'refused merge');
    for (const d of err.tempDirs || []) assert.ok(!fs.existsSync(d), `temp dir removed after a refusal: ${d}`);
  }

  // ---- 11. facade side: a rename that moves a seam target to ui/ moves the facades in both countries
  {
    const files = {
      'src/us/core/tax.js': 'export function tax() {\n  return 1;\n}\n',
      'src/canada/core/tax.js': 'export function tax() {\n  return 2;\n}\n',
      'src/us/core/seam-tax.js': "export { tax } from './tax.js';\n",
      'src/canada/core/seam-tax.js': "export { tax } from './tax.js';\n",
      'src/shared/ui/uses-tax.js': "import { tax } from '#country/core/seam-tax';\n\nexport function usesTax() {\n  return tax();\n}\n",
    };
    const root = tree(files);
    const report = regroup(root, [{ rename: 'src/us/core/tax.js', to: 'src/us/ui/tax.js' }], {});
    for (const c of ['us', 'canada']) {
      assert.ok(!exists(root, `src/${c}/core/seam-tax.js`), `${c} core facade moved`);
      assert.ok(exists(root, `src/${c}/ui/seam-tax.js`), `${c} ui facade`);
    }
    assert.strictEqual(read(root, 'src/us/ui/seam-tax.js'), "export { tax } from './tax.js';\n");
    assert.strictEqual(read(root, 'src/canada/ui/seam-tax.js'), "export { tax } from '../core/tax.js';\n");
    assert.ok(read(root, 'src/shared/ui/uses-tax.js').startsWith("import { tax } from '#country/ui/seam-tax';\n"));
    assert.ok(report.lines.some((l) => /facades of tax moved to ui\//.test(l)), report.lines.join('\n'));
    // a core/ importer of that seam name makes the facade move impossible: refused by core purity
    const root2 = tree({ ...files, 'src/shared/core/core-tax.js': "import { tax } from '#country/core/seam-tax';\nexport function coreTax() {\n  return tax();\n}\n" });
    refuses(root2, [{ rename: 'src/us/core/tax.js', to: 'src/us/ui/tax.js' }], /core purity: src\/shared\/core\/core-tax\.js imports #country\/ui\/seam-tax, a ui\/ module/, 'facade side');
  }

  // ---- 12. the command line: --dry-run writes nothing, unknown flags are rejected
  {
    const root = tree();
    const map = path.join(root, 'map.json');
    fs.writeFileSync(map, JSON.stringify({ operations: [{ rename: 'src/shared/ui/helper.js', to: 'src/shared/ui/doubling.js' }, { move: 'f', from: 'src/shared/ui/m1.js', to: 'src/shared/ui/m2.js' }] }));
    const cli = path.join(__dirname, '..', 'scripts', 'regroup-modules.js');
    const before = snapshot(root);
    const out = execFileSync(process.execPath, [cli, '--root', root, '--map', map, '--dry-run'], { encoding: 'utf8' });
    assert.deepStrictEqual(snapshot(root), before, '--dry-run writes nothing (in src/ or outside it)');
    const lines = out.trim().split('\n');
    assert.ok(lines.every((l) => l.startsWith('[dry run] ')), out);
    assert.ok(/^\[dry run\] op 0: rename /.test(lines[0]), out);
    assert.ok(lines.some((l) => /^\[dry run\] op 1: move f /.test(l)), out);
    assert.ok(/^\[dry run\] regroup: 2 operations, \d+ files written$/.test(lines[lines.length - 1]), out);
    for (const bad of [['--map', map, '--bogus'], ['--map'], [], ['--map', map, '--dry-run', 'extra']]) {
      const r = spawnSync(process.execPath, [cli, '--root', root, ...bad], { encoding: 'utf8' });
      assert.strictEqual(r.status, 2, `exit 2 for ${bad.join(' ')}: ${r.stderr}`);
    }
    const real = execFileSync(process.execPath, [cli, '--root', root, '--map', map], { encoding: 'utf8' });
    assert.ok(/^regroup: 2 operations, \d+ files written$/m.test(real), real);
    assert.ok(exists(root, 'src/shared/ui/doubling.js'));
    assert.deepStrictEqual(await bothRun(root), EXPECTED, 'CLI result builds');
    const refused = spawnSync(process.execPath, [cli, '--root', root, '--map', map], { encoding: 'utf8' });
    assert.strictEqual(refused.status, 1);
    assert.ok(/nothing was written/.test(refused.stderr) && /op 0 \(rename .*\): src\/shared\/ui\/helper\.js does not exist/.test(refused.stderr), refused.stderr);
  }

  const leaked = tmpRegroupDirs();
  assert.deepStrictEqual(leaked, [], 'no regroup-* temp directory is left behind');
  console.log('regroup_modules OK');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => made.reverse().forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
