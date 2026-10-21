// Import cycles in src/ may exist only among ui/ modules, and every ui/ and core/ module must pass the load-time guard
// (core/ modules are never in a cycle, so they get the non-cycle rule)
// (stage 4 design sections 5.2, 5.3 and 6.4). Fixture trees run first (they test scripts/lib/load-time.js and
// scripts/lib/module-graph.js), then the real tree.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const espree = require('espree');
const { isInert, loadTimeMarker, checkLoadTime } = require('../scripts/lib/load-time');
const { buildGraph, cycles } = require('../scripts/lib/module-graph');
const { isUi, isCore } = require('../scripts/lib/src-paths');

const made = [];
function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-cycles-'));
  made.push(root);
  write(root, 'src/package.json', '{ "private": true, "type": "module" }\n');
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  return root;
}
function exprOf(src) {
  return espree.parse('(' + src + ');', { ecmaVersion: 2022, sourceType: 'module' }).body[0].expression;
}

// The check that runs over a tree: returns problem strings.
function checkTree(root, country) {
  const graph = buildGraph(root, country);
  const cyc = cycles(graph);
  const problems = [];
  const inCycle = new Map();
  for (const c of cyc) {
    for (const f of c) inCycle.set(f, c);
    for (const f of c) if (!isUi(f)) problems.push(`${country}: cycle member outside ui/: ${f} (${c.join(' <-> ')})`);
  }
  for (const f of graph.files) {
    if (!(isUi(f) || isCore(f))) continue;
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    const c = inCycle.get(f);
    let found;
    let partners;
    if (c) {
      partners = new Set();
      for (const [local, target] of graph.importsOf.get(f)) if (c.includes(target)) partners.add(local);
    }
    try {
      found = checkLoadTime(code, c ? { cyclePartners: partners, inCycle: true } : {});
    } catch (e) {
      throw new Error(`${f}: ${e.message}`);
    }
    for (const p of found) {
      problems.push(`${country}: ${f}:${p.line} ${p.name} ${p.why}${p.ref ? ` (${p.ref})` : ''}`);
    }
  }
  return { problems, cycles: cyc };
}

// 1. isInert
for (const src of ['1', "'a'", '`x`', '() => {}', 'function () {}', '{ a: 1, b: [2, 3] }', '-1', 'class {}']) {
  assert.strictEqual(isInert(exprOf(src)), true, `inert: ${src}`);
}
for (const src of ['x', '`${x}`', 'f()', 'new Set()', 'a.b', '{ ...a }', '{ [k]: 1 }', 'class { static x = f(); }', 'class { static { f(); } }', '[...a]', '[1, , 2]', 'class extends B {}', 'class { [f()] = 1; }', 'class { static [g]() {} }', 'class extends mix(B) {}']) {
  assert.strictEqual(isInert(exprOf(src)), false, `not inert: ${src}`);
}
assert.strictEqual(isInert(null), true, 'a missing initializer is inert');

// 2. loadTimeMarker
{
  const a = ['// load-time: reason', '// more', '// even more', 'let a = f();'];
  assert.deepStrictEqual(loadTimeMarker(a, 4), { marked: true, reason: 'reason' });
  const b = ['// load-time: reason', '// more', '// even more', '', 'let a = f();'];
  assert.strictEqual(loadTimeMarker(b, 5).marked, false, 'a blank line breaks the block');
  const c = ['// other', '// load-time: x', 'let a = f();'];
  assert.strictEqual(loadTimeMarker(c, 3).marked, false, 'the block must start with the marker');
  const d = ['  // load-time: indented', '  let a = f();'];
  assert.strictEqual(loadTimeMarker(d, 2).marked, true, 'indentation is allowed');
  assert.strictEqual(loadTimeMarker(['let a = f();'], 1).marked, false);

  // @@shared marker lines are skipped when finding the first line of the block
  const MB = '  // @@shared:ids begin';
  const ME = '  // @@shared:ids end';
  assert.deepStrictEqual(loadTimeMarker([MB, '  // load-time: r', '  const ids = f();'], 3), { marked: true, reason: 'r' }, '(a) begin marker above the comment');
  assert.deepStrictEqual(loadTimeMarker(['  // load-time: r', MB, '  const ids = f();'], 3), { marked: true, reason: 'r' }, '(b) marker between the comment and the declaration');
  assert.strictEqual(loadTimeMarker([MB, '  // other', '  // load-time: x', '  const ids = f();'], 4).marked, false, '(c) the first non-marker line must be load-time');
  assert.strictEqual(loadTimeMarker([MB, '  const ids = f();'], 2).marked, false, '(d) a block of marker lines only');
  assert.deepStrictEqual(loadTimeMarker([MB, '', '  // load-time: r', '  const ids = f();'], 4), { marked: true, reason: 'r' }, '(e) blank line above the comment block');
  assert.strictEqual(loadTimeMarker(['  // load-time: r', '', MB, '  const ids = f();'], 4).marked, false, '(f) a blank line breaks the block');
  assert.deepStrictEqual(loadTimeMarker([ME, '  // load-time: r', '  const ids = f();'], 3), { marked: true, reason: 'r' }, '(g) end marker above the comment');
}

// 3. checkLoadTime
{
  const why = (code, o) => checkLoadTime(code, o).map((p) => p.why);
  assert.deepStrictEqual(why('let a = f();\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why('// load-time: reads nothing\nlet a = f();\n'), []);
  assert.deepStrictEqual(why('document.body.append(x);\n'), ['top-level statement']);
  assert.deepStrictEqual(why('// load-time: calls a partner\nconst b = partnerFn();\n', { cyclePartners: new Set(['partnerFn']) }), ['reads the cycle']);
  assert.deepStrictEqual(why('// load-time: fine\nconst b = partnerFn();\n', { cyclePartners: new Set(['other']) }), []);
  assert.deepStrictEqual(why('class C { static x = f(); }\n'), ['class static']);
  assert.deepStrictEqual(why('class C { static { f(); } }\n'), ['class static']);
  assert.deepStrictEqual(why('class D { m() { f(); } }\n'), []);
  assert.deepStrictEqual(why("import { x } from './x.js';\nexport { x };\nexport const k = 1;\nexport function g() { return x; }\n"), []);
  assert.deepStrictEqual(why('export const s = new Set();\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why('const x = 1;\nconst s = new Set();\n'), ['not inert and not marked']);
  assert.strictEqual(checkLoadTime('const x = 1;\nconst s = new Set();\n')[0].line, 2);
  assert.deepStrictEqual(why('const m = class { static x = f(); };\n'), ['class static']);

  // (h) a shared-region begin marker above the load-time comment
  assert.deepStrictEqual(why('// @@shared:ids begin\n// load-time: filters an imported constant\nconst ids = f();\n'), []);

  // class heritage and computed keys run at load time
  const P = { cyclePartners: new Set(['B']) };
  assert.deepStrictEqual(why('class A extends B {}\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why('// load-time: extends\nclass A extends B {}\n', P), ['reads the cycle']);
  assert.deepStrictEqual(why('// load-time: extends\nclass A extends B {}\n'), []);
  assert.deepStrictEqual(why('export class A extends B {}\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why('class A { [f()] = 1; }\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why('class A { static [g()]() {} }\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why("class A { ['k']() {} }\n"), []);
  assert.deepStrictEqual(why('const C = class extends mix(B) {};\n'), ['not inert and not marked']);
  assert.deepStrictEqual(why('// load-time: mixes\nconst C = class extends mix(B) {};\n', P), ['reads the cycle']);
  assert.deepStrictEqual(why('// load-time: mixes\nconst C = class extends mix(B) {};\n'), []);

  // referencedNames, through the cycle check: a member property is not a reference, a shorthand property is, and a
  // shadowing parameter still counts (deliberately conservative)
  const R = { cyclePartners: new Set(['render']) };
  assert.deepStrictEqual(why('// load-time: m\nconst v = o.render;\n', R), []);
  assert.deepStrictEqual(why('// load-time: m\nconst v = { render: 1 };\n', R), []);
  assert.deepStrictEqual(why('// load-time: m\nconst v = { render };\n', R), ['reads the cycle']);
  assert.deepStrictEqual(why('// load-time: m\nconst v = [1].map((render) => render);\n', R), ['reads the cycle']);
  assert.deepStrictEqual(why('// load-time: m\nconst v = o[render];\n', R), ['reads the cycle']);

  // a parse error is thrown (the callers add the file name)
  assert.throws(() => checkLoadTime('let = ;'));

  // In a module that is part of an import cycle (inCycle; passing cyclePartners implies it), a marked initializer may
  // reference global names only (browser globals, ES built-ins) and literals: never a name its own module declares or
  // imports. Outside a cycle the marker rule is unchanged.
  const C = { inCycle: true };
  const local = '// load-time: calls a local helper\nconst v = helper();\nfunction helper() { return 1; }\n';
  assert.deepStrictEqual(why(local, C), ['reads its module in a cycle'], 'a local function, in a cycle');
  assert.strictEqual(checkLoadTime(local, C)[0].ref, 'helper');
  assert.deepStrictEqual(why(local), [], 'a local function, outside a cycle');
  assert.deepStrictEqual(why(local, { cyclePartners: new Set() }), ['reads its module in a cycle'], 'cyclePartners implies inCycle');
  assert.deepStrictEqual(why(local, { cyclePartners: new Set(), inCycle: false }), [], 'inCycle: false overrides');
  assert.deepStrictEqual(why("// load-time: a static element\nconst el = document.getElementById('x');\n", C), [], 'document, in a cycle');
  assert.deepStrictEqual(why('// load-time: an empty Set\nconst s = new Set();\n', C), [], 'new Set(), in a cycle');
  assert.deepStrictEqual(why('// load-time: built-in\nconst m = Math.max(1, 2);\n', C), [], 'Math.max, in a cycle');
  assert.deepStrictEqual(why('// load-time: built-in\nconst o = Object.keys({});\n', C), [], 'Object.keys, in a cycle');
  assert.deepStrictEqual(why('const one = 1;\n// load-time: a global\nconst w = window;\n', C), [], 'a literal or a browser global alone');
  const imported = "import { k } from './k.js';\n// load-time: reads an import\nconst v = k + 1;\n";
  assert.deepStrictEqual(why(imported, C), ['reads its module in a cycle'], 'an import, in a cycle');
  assert.strictEqual(checkLoadTime(imported, C)[0].ref, 'k');
  assert.deepStrictEqual(why(imported), [], 'an import, outside a cycle');
  assert.deepStrictEqual(why('const base = 1;\n// load-time: a binding\nconst v = [base];\n', C), ['reads its module in a cycle'], 'a binding of the module');
  assert.deepStrictEqual(why('class B {}\n// load-time: a class\nclass A extends B {}\n', C), ['reads its module in a cycle'], 'class heritage');
  assert.deepStrictEqual(why("import d from './d.js';\n// load-time: default import\nconst v = d();\n", C), ['reads its module in a cycle'], 'a default import binding');
  assert.deepStrictEqual(why('const [a1, b1] = [1, 2];\n// load-time: pattern\nconst v = a1 + 1;\n', C), ['reads its module in a cycle'], 'a name bound by a pattern');
  assert.deepStrictEqual(why('// load-time: own name only\nconst v = [1].map((x) => x * 2);\n', C), [], 'a parameter that is not a module name');
  // the partner check keeps its message
  assert.deepStrictEqual(why("import { p } from './p.js';\n// load-time: x\nconst v = p();\n", { cyclePartners: new Set(['p']) }), ['reads the cycle']);
}

// 4. buildGraph / cycles, with a facade
try {
  const root = tree({
    'src/shared/ui/a.js': "import { r } from '#country/ui/seam-r';\nexport function a() { return r(); }\n",
    'src/us/ui/seam-r.js': "export { r } from './r.js';\n",
    'src/us/ui/r.js': "import { a } from '../../shared/ui/a.js';\nexport function r() { return a; }\n",
    'src/canada/ui/seam-r.js': "export { r } from './r.js';\n",
    'src/canada/ui/r.js': 'export function r() { return 1; }\n',
  });
  const us = buildGraph(root, 'us');
  assert.deepStrictEqual(cycles(us), [['src/shared/ui/a.js', 'src/us/ui/r.js']], 'one cycle {a, r}, the facade is not a member');
  assert.ok(!us.files.some((f) => f.startsWith('src/canada/')), 'the other country is excluded');
  assert.strictEqual(us.importsOf.get('src/shared/ui/a.js').get('r'), 'src/us/ui/r.js', 'importsOf resolves through the facade');
  assert.deepStrictEqual([...us.edges.get('src/shared/ui/a.js')], ['src/us/ui/r.js']);
  assert.deepStrictEqual(cycles(buildGraph(root, 'canada')), [], 'no cycle for canada');
  assert.deepStrictEqual(checkTree(root, 'us').problems, [], 'a cycle of inert ui modules passes');

  // a marked initializer that reads a cycle partner (through the facade) fails
  const root2 = tree({
    'src/shared/ui/a.js': "import { r } from '#country/ui/seam-r';\n// load-time: reads r\nconst v = r();\nexport function a() { return v; }\n",
    'src/us/ui/seam-r.js': "export { r } from './r.js';\n",
    'src/us/ui/r.js': "import { a } from '../../shared/ui/a.js';\nexport function r() { return a; }\n",
  });
  const t2 = checkTree(root2, 'us');
  assert.strictEqual(t2.problems.length, 1);
  assert.ok(/reads the cycle/.test(t2.problems[0]), t2.problems[0]);

  // a marked initializer that calls a local function which reads a partner (the Task 10 fix B finding): refused in a
  // cycle; the same module outside a cycle passes
  const root2b = tree({
    'src/shared/ui/a.js': "import { r } from '#country/ui/seam-r';\n// load-time: calls a local helper\nconst v = helper();\nfunction helper() { return r; }\nexport function a() { return v; }\n",
    'src/us/ui/seam-r.js': "export { r } from './r.js';\n",
    'src/us/ui/r.js': "import { a } from '../../shared/ui/a.js';\nexport function r() { return a; }\n",
    'src/canada/ui/seam-r.js': "export { r } from './r.js';\n",
    'src/canada/ui/r.js': 'export function r() { return 1; }\n',
  });
  const t2b = checkTree(root2b, 'us');
  assert.strictEqual(t2b.problems.length, 1, t2b.problems.join('\n'));
  assert.ok(/a\.js:3 v reads its module in a cycle \(helper\)/.test(t2b.problems[0]), t2b.problems[0]);
  assert.deepStrictEqual(checkTree(root2b, 'canada').problems, [], 'no cycle in canada: allowed');

  // a cycle through a core/ file is reported with that file
  const root3 = tree({
    'src/shared/ui/a.js': "import { c } from '../core/c.js';\nexport function a() { return c; }\n",
    'src/shared/core/c.js': "import { a } from '../ui/a.js';\nexport function c() { return a; }\n",
  });
  const t3 = checkTree(root3, 'us');
  assert.deepStrictEqual(t3.cycles, [['src/shared/core/c.js', 'src/shared/ui/a.js']]);
  assert.strictEqual(t3.problems.length, 1);
  assert.ok(/outside ui\/: src\/shared\/core\/c\.js/.test(t3.problems[0]), t3.problems[0]);

  // a core/ module is held to the load-time guard too: an unmarked initializer is reported, a marked one passes
  const root3b = tree({ 'src/us/core/x.js': 'export const v = f();\n' });
  const t3b = checkTree(root3b, 'us');
  assert.strictEqual(t3b.problems.length, 1, t3b.problems.join('\n'));
  assert.ok(/core\/x\.js:1 v not inert and not marked/.test(t3b.problems[0]), t3b.problems[0]);
  const root3c = tree({ 'src/us/core/x.js': '// load-time: calls f; reads nothing\nexport const v = f();\n' });
  assert.deepStrictEqual(checkTree(root3c, 'us').problems, []);

  // a self-import is a cycle; an unmarked initializer in a ui module outside any cycle fails
  const root4 = tree({
    'src/shared/ui/s.js': "import { s } from './s.js';\nexport function f() { return s; }\n",
    'src/us/ui/u.js': 'let a = f();\n',
  });
  const t4 = checkTree(root4, 'us');
  assert.deepStrictEqual(t4.cycles, [['src/shared/ui/s.js']]);
  assert.strictEqual(t4.problems.length, 1);
  assert.ok(/u\.js:1 a not inert/.test(t4.problems[0]), t4.problems[0]);

  // a facade chain, a renamed re-export and a cycle of three files
  const root5 = tree({
    'src/shared/ui/a.js': "import { go } from '#country/ui/seam-go';\nexport function a() { return go; }\n",
    'src/us/ui/seam-go.js': "export { go } from './seam-go2.js';\n",
    'src/us/ui/seam-go2.js': "export { run as go } from './b.js';\n",
    'src/us/ui/b.js': "import { c } from './c.js';\nexport function run() { return c; }\nexport function other() {}\n",
    'src/us/ui/c.js': "import { a } from '../../shared/ui/a.js';\nexport function c() { return a; }\n",
  });
  const g5 = buildGraph(root5, 'us');
  assert.deepStrictEqual(cycles(g5), [['src/shared/ui/a.js', 'src/us/ui/b.js', 'src/us/ui/c.js']], 'three files, facades are not members');
  assert.strictEqual(g5.importsOf.get('src/shared/ui/a.js').get('go'), 'src/us/ui/b.js', 'chain and rename resolve to the holder');
  assert.deepStrictEqual([...g5.edges.get('src/shared/ui/a.js')], ['src/us/ui/b.js']);

  // an unresolved relative or #country import throws naming importer and specifier; a bare package is skipped
  const root6 = tree({ 'src/us/ui/x.js': "import { q } from './missing.js';\nexport const k = q;\n" });
  assert.throws(() => buildGraph(root6, 'us'), /src\/us\/ui\/x\.js.*\.\/missing\.js/);
  const root7 = tree({ 'src/us/ui/x.js': "import { q } from '#country/ui/nope';\nexport const k = q;\n" });
  assert.throws(() => buildGraph(root7, 'us'), /src\/us\/ui\/x\.js.*#country\/ui\/nope/);
  const root8 = tree({ 'src/us/ui/x.js': "import { q } from 'some-package';\nexport const k = q;\n" });
  assert.deepStrictEqual(cycles(buildGraph(root8, 'us')), []);
  const root9 = tree({ 'src/us/ui/bad.js': 'let = ;\n' });
  assert.throws(() => buildGraph(root9, 'us'), /src\/us\/ui\/bad\.js/);

} finally {
  for (const r of made) fs.rmSync(r, { recursive: true, force: true });
}

// 5. The real tree
const root = path.join(__dirname, '..');
let total = 0;
let failures = [];
for (const country of ['us', 'canada']) {
  const t = checkTree(root, country);
  total += t.cycles.length;
  failures = failures.concat(t.problems);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`ui_cycles OK (${total} cycles)`);
