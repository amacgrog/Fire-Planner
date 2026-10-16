// Tests for scripts/lib/extract-units.js (plain Node, fixture trees in tmp).
// The fixtures are miniatures of the real layout: two planners, some use of the shared store module, some country code. After every
// extraction the planners are bundled the way the build does and must produce what they produced before.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { planExtraction } = require('../scripts/lib/extraction-plan');
const { applyModules, functionBodyProblem } = require('../scripts/lib/extract-units');
const espree = require('espree');
const { statementLabel: labelOf } = require('../scripts/analyze-closure');
const { compareScripts } = require('../scripts/compare-builds');

const made = [];
function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const newRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-units-'));
  made.push(root);
  write(root, 'src/package.json', '{ "private": true, "type": "module" }\n');
  write(root, 'src/shared/core/store.js', 'export const state = { base: 3 };\n');
  return root;
};

const STORE_USERS = [
  '  // doubles a number',
  '  const twice = (n) => n * 2;',
  '  function addBase(n) {',
  '    return n + state.base;',
  '  }',
];
const mainText = (rate, extra) =>
  [
    "import { state } from '../shared/core/store.js';",
    '(() => {',
    ...STORE_USERS,
    '  // the country rate',
    `  const rate = ${rate};`,
    '  function tax(n) {',
    '    return twice(n) * rate + addBase(0);',
    '  }',
    ...extra,
    '  window.__out = tax(5);',
    '})();',
    '',
  ].join('\n');
const US_EXTRA = [
  '  let counter = 0;',
  '  function bump() {',
  '    counter++;',
  '  }',
  '  function reset() {',
  '    counter = 0;',
  '  }',
  '  function isEven(n) {',
  '    return n === 0 ? true : isOdd(n - 1);',
  '  }',
  '  function isOdd(n) {',
  '    return n === 0 ? false : isEven(n - 1);',
  '  }',
];
function fixture() {
  const root = newRoot();
  write(root, 'src/us/main.js', mainText('0.1', US_EXTRA));
  write(root, 'src/canada/main.js', mainText('0.2', []));
  return root;
}

// A data block (// NAME:begin ... // NAME:end) with two units, plus a user of it.
const dataMain = (extra) =>
  [
    '(() => {',
    '  // RULES:begin',
    '  const A = 1;',
    '  const B = A + 1;',
    '  // RULES:end',
    '  function useRules() {',
    '    return A + B;',
    '  }',
    ...extra,
    '  window.__out = useRules();',
    '})();',
    '',
  ].join('\n');
function dataFixture() {
  const root = newRoot();
  write(root, 'src/us/main.js', dataMain([]));
  write(root, 'src/canada/main.js', dataMain([]));
  return root;
}

// Bundles a planner the way the build does and returns the bundle's text.
async function bundle(root, country) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src', country, 'main.js')],
    bundle: true,
    write: false,
    format: 'iife',
    logLevel: 'silent',
    outfile: 'out.js',
  });
  return result.outputFiles[0].text;
}
// Bundles a planner the way the build does and returns what it leaves in window.__out.
async function run(root, country) {
  const window = {};
  vm.runInNewContext(await bundle(root, country), { window });
  return window.__out;
}
const both = async (root) => ({ us: await run(root, 'us'), canada: await run(root, 'canada') });

(async () => {
  // ---- applying modules keeps the programs' behavior and writes the expected files
  let root = fixture();
  const before = await both(root);
  const MODS = [
    { path: 'src/us/core/helpers.js', owner: 'us', units: { us: ['twice', 'addBase'], canada: [] } },
    { path: 'src/us/core/rate.js', owner: 'us', units: { us: ['rate', 'tax'], canada: [] } },
  ];
  const report = applyModules(root, MODS);
  assert.deepStrictEqual(report.warnings, []);
  assert.deepStrictEqual(report.moved, { us: 4, canada: 0 });
  assert.strictEqual(
    read(root, 'src/us/core/helpers.js'),
    [
      "import { state } from '../../shared/core/store.js';",
      '',
      '  // doubles a number',
      '  export const twice = (n) => n * 2;',
      '  export function addBase(n) {',
      '    return n + state.base;',
      '  }',
      '',
    ].join('\n'),
  );
  assert.strictEqual(
    read(root, 'src/us/core/rate.js'),
    [
      "import { addBase, twice } from './helpers.js';",
      '',
      '  // the country rate',
      '  const rate = 0.1;',
      '  export function tax(n) {',
      '    return twice(n) * rate + addBase(0);',
      '  }',
      '',
    ].join('\n'),
  );
  const usMain = read(root, 'src/us/main.js');
  assert.ok(usMain.startsWith("import { tax } from './core/rate.js';\n(() => {"), usMain.split('\n').slice(0, 3).join('|'));
  assert.ok(usMain.includes('let counter = 0;') && usMain.includes('function bump()'), 'units that stay are untouched');
  assert.deepStrictEqual(await both(root), before);

  // ---- a dry run writes nothing
  root = fixture();
  const dry = applyModules(root, MODS, { dryRun: true });
  assert.strictEqual(dry.modules.length, 2);
  assert.ok(!fs.existsSync(path.join(root, 'src/us/core/helpers.js')));

  // ---- a data block travels with both of its markers
  root = dataFixture();
  const dataBefore = await both(root);
  applyModules(root, [{ path: 'src/us/core/rules.js', owner: 'us', units: { us: ['A', 'B'], canada: [] } }]);
  const rulesModule = read(root, 'src/us/core/rules.js');
  assert.ok(rulesModule.includes('// RULES:begin') && rulesModule.includes('// RULES:end'), rulesModule);
  assert.ok(!read(root, 'src/us/main.js').includes('RULES:'), 'no marker is left behind');
  assert.deepStrictEqual((await both(root)).us, dataBefore.us);

  // ---- refusals: each throws and writes nothing
  const refuse = (setup, modules, pattern, opts) => {
    const r = setup();
    const snapshot = [read(r, 'src/us/main.js'), read(r, 'src/canada/main.js')];
    assert.throws(() => applyModules(r, modules, opts), pattern);
    assert.deepStrictEqual([read(r, 'src/us/main.js'), read(r, 'src/canada/main.js')], snapshot, 'nothing is written on a refusal');
  };
  const statementLabel = (r) => labelOf(read(r, 'src/us/main.js').split('\n').find((l) => l.includes('window.__out')));
  const one = (p, owner, us, canada = []) => [{ path: p, owner, units: { us, canada } }];
  refuse(fixture, one('src/us/core/x.js', 'us', [statementLabel(fixture())]), /side-effect statement/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['counter']), /assigned outside its module/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['tax']), /depends on "(rate|twice|addBase)", which stays/);
  // Task 14: no shared regions remain, so a manifest module with owner 'shared' is refused
  refuse(fixture, one('src/shared/core/h.js', 'shared', ['twice'], ['twice']), /src\/shared\/core\/h\.js: no shared regions remain; write shared code in src\/shared\/ directly/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['nope']), /has no unit "nope"/);
  refuse(
    fixture,
    [
      { path: 'src/us/core/a.js', owner: 'us', units: { us: ['isEven'], canada: [] } },
      { path: 'src/us/core/b.js', owner: 'us', units: { us: ['isOdd'], canada: [] } },
    ],
    /module import cycle/,
  );
  refuse(
    dataFixture,
    [
      { path: 'src/us/core/a.js', owner: 'us', units: { us: ['A'], canada: [] } },
      { path: 'src/us/core/b.js', owner: 'us', units: { us: ['B'], canada: [] } },
    ],
    /data block RULES is split/,
  );


  // ---- country seam facades already on disk (owner 'shared' is refused, so applyModules can no longer create them; the
  // checks over the files that exist stay live). The wrong-side check ("its facade goes under X/ but ... exists") only runs
  // for a name a shared module reached through the seam, so it is unreachable now and has no fixture.
  const MOVE = one('src/us/core/x.js', 'us', ['isEven', 'isOdd']);
  const seamDisk = (files) => () => {
    const r = fixture();
    for (const [rel, text] of Object.entries(files)) write(r, rel, text);
    return r;
  };
  const FAC = "export { Q } from './q.js';\n";
  // equal facades in both countries, same side: accepted, and the report lists the name
  root = seamDisk({ 'src/us/core/seam-Q.js': FAC, 'src/canada/core/seam-Q.js': FAC })();
  assert.deepStrictEqual(applyModules(root, MOVE).seam, { us: ['Q'], canada: ['Q'] });
  // a facade in one country only, on either side, is refused
  refuse(seamDisk({ 'src/us/core/seam-Q.js': FAC }), MOVE, /the country seam facades differ: us exports core\/Q; canada exports /);
  refuse(seamDisk({ 'src/canada/ui/seam-Q.js': FAC }), MOVE, /the country seam facades differ: us exports ; canada exports ui\/Q/);
  // the same name on different sides in the two countries is refused
  refuse(seamDisk({ 'src/us/core/seam-Q.js': FAC, 'src/canada/ui/seam-Q.js': FAC }), MOVE, /the country seam facades differ: us exports core\/Q; canada exports ui\/Q/);

  // ---- stage 3: side-effect imports, bare specifiers, namespace imports, block comments, staged writes, paths
  const mainWith = (importLines, body, tail = '  window.__out = 1;') => [...importLines, '(() => {', ...body, tail, '})();', ''].join('\n');
  const twoPlanners = (usImports, usBody, caImports = usImports, caBody = usBody, tail) => {
    const r = newRoot();
    write(r, 'src/us/main.js', mainWith(usImports, usBody, tail));
    write(r, 'src/canada/main.js', mainWith(caImports, caBody, tail));
    return r;
  };
  const leftovers = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? leftovers(full) : e.name.endsWith('.extract-tmp') ? [full] : [];
    });

  // a bare side-effect import stays in main.js, and nothing is left from the staged writes
  root = twoPlanners(["import './effect.js';"], ['  function one() {', '    return 1;', '  }'], ["import './effect.js';"], ['  function one() {', '    return 1;', '  }']);
  write(root, 'src/us/effect.js', 'window.__fx = 1;\n');
  write(root, 'src/canada/effect.js', 'window.__fx = 1;\n');
  applyModules(root, [{ path: 'src/us/core/one.js', owner: 'us', units: { us: ['one'], canada: [] } }]);
  assert.ok(read(root, 'src/us/main.js').startsWith("import './effect.js';\n(() => {\n"), read(root, 'src/us/main.js').split('\n').slice(0, 3).join('|'));
  assert.deepStrictEqual(leftovers(root), []);

  // a namespace import cannot be moved, and a module path outside src/ is refused
  const nsImport = ["import * as store from '../shared/core/store.js';"];
  const nsBody = ['  function base() {', '    return store.state.base;', '  }'];
  refuse(() => twoPlanners(nsImport, nsBody), one('src/us/core/b.js', 'us', ['base']), /namespace import/);
  refuse(fixture, one('lib/x.js', 'us', ['isEven']), /must lie under src/);

  // block comments above a unit travel with it
  root = twoPlanners(
    [],
    ['  /* one-line note */', '  function a() {', '    return 1;', '  }', '  /**', '   * the b function', '   */', '  function b() {', '    return 2;', '  }'],
  );
  applyModules(root, [{ path: 'src/us/core/ab.js', owner: 'us', units: { us: ['a', 'b'], canada: [] } }]);
  assert.ok(read(root, 'src/us/core/ab.js').includes('/* one-line note */') && read(root, 'src/us/core/ab.js').includes('the b function'));
  assert.ok(!read(root, 'src/us/main.js').includes('note */') && !read(root, 'src/us/main.js').includes('the b function'));

  // ---- stage 4 (Task 7): wiring functions, comment placement, the split, the wiring record
  const LIB = [
    'export const out = [];',
    "export function a() { out.push('a'); }",
    "export function b() { out.push('b'); }",
    "export function c() { out.push('c'); }",
    'export function on(name, fn) { out.push(name + fn()); }',
    '',
  ].join('\n');
  const LIB_IMPORT = "import { a, b, c, on, out } from '../shared/lib.js';";
  const OUT_TAIL = "  window.__out = out.join('');";
  // A tree whose planners call the shared lib; `head` is the IIFE's first line.
  const wireRoot = (usBody, caBody = [], { head = '(() => {', usTail = OUT_TAIL, caTail = OUT_TAIL } = {}) => {
    const r = newRoot();
    write(r, 'src/shared/lib.js', LIB);
    write(r, 'src/us/main.js', [LIB_IMPORT, head, ...usBody, usTail, '})();', ''].join('\n'));
    write(r, 'src/canada/main.js', [LIB_IMPORT, head, ...caBody, caTail, '})();', ''].join('\n'));
    return r;
  };
  const L = (lines) => labelOf(Array.isArray(lines) ? lines.join('\n') : lines);
  // a module with wiring runs: wiring is [[name, [labels]], ...]
  const wmod = (p, owner, units, wiring, extra = {}) => {
    const per = (v) => (owner === 'shared' ? { us: v, canada: v } : { us: owner === 'us' ? v : [], canada: owner === 'canada' ? v : [] });
    const stmts = (v) => (owner === 'shared' ? { us: v, canada: v } : { [owner]: v });
    return { path: p, owner, units: per(units), wiring: wiring.map(([name, s]) => ({ name, statements: stmts(s) })), ...extra };
  };
  const COUNTRIES_T = ['us', 'canada'];
  const noTrailingSpaces = (text) => assert.ok(!/[ \t]+$/m.test(text), `no trailing spaces:\n${text}`);

  // 1. two country statements, the first with a comment, in one run
  root = wireRoot(['  // note', '  a();', '  b();']);
  let wireBefore = await both(root);
  let wireReport = applyModules(root, [wmod('src/us/ui/x.js', 'us', [L('a();'), L('b();')], [['wireX', [L('a();'), L('b();')]]])]);
  assert.strictEqual(
    read(root, 'src/us/ui/x.js'),
    ["import { a, b } from '../../shared/lib.js';", '', '  export function wireX() {', '    // note', '    a();', '    b();', '  }', ''].join('\n'),
  );
  assert.strictEqual(
    read(root, 'src/us/main.js'),
    ["import { out } from '../shared/lib.js';", "import { wireX } from './ui/x.js';", '(() => {', '  wireX();', OUT_TAIL, '})();', ''].join('\n'),
  );
  assert.deepStrictEqual(wireReport.wiring, [{ name: 'wireX', module: 'src/us/ui/x.js' }]);
  assert.deepStrictEqual(wireReport.moved, { us: 2, canada: 0 });
  assert.deepStrictEqual(await both(root), wireBefore);
  assert.deepStrictEqual(wireBefore.us, 'ab');

  // 1b. the module's declarations come first; a blank line inside a statement stays empty
  const s1b = ["  on('e', () => {", '    a();', '', '    return local();', '  });'];
  root = wireRoot(['  function local() {', "    return 'l';", '  }', '  // first', ...s1b]);
  wireBefore = await both(root);
  applyModules(root, [wmod('src/us/ui/y.js', 'us', ['local', L(s1b)], [['wireY', [L(s1b)]]])]);
  const yText = read(root, 'src/us/ui/y.js');
  assert.strictEqual(
    yText,
    [
      "import { a, on } from '../../shared/lib.js';",
      '',
      '  function local() {',
      "    return 'l';",
      '  }',
      '  export function wireY() {',
      '    // first',
      "    on('e', () => {",
      '      a();',
      '',
      '      return local();',
      '    });',
      '  }',
      '',
    ].join('\n'),
  );
  noTrailingSpaces(yText);
  assert.deepStrictEqual(await both(root), wireBefore);

  // 2. two runs of one module, interleaved with another module's statement
  root = wireRoot(['  a();', '  // the middle one', '  b();', '  c();']);
  wireBefore = await both(root);
  wireReport = applyModules(root, [
    wmod('src/us/ui/x.js', 'us', [L('a();'), L('c();')], [['wireA', [L('a();')]], ['wireC', [L('c();')]]]),
    wmod('src/us/ui/y.js', 'us', [L('b();')], [['wireB', [L('b();')]]]),
  ]);
  let usMainW = read(root, 'src/us/main.js');
  assert.ok(usMainW.includes("import { wireA, wireC } from './ui/x.js';") && usMainW.includes("import { wireB } from './ui/y.js';"), usMainW);
  assert.ok(usMainW.endsWith(['(() => {', '  wireA();', '  wireB();', '  wireC();', OUT_TAIL, '})();', ''].join('\n')), usMainW);
  assert.strictEqual(
    read(root, 'src/us/ui/x.js'),
    ["import { a, c } from '../../shared/lib.js';", '', '  export function wireA() {', '    a();', '  }', '  export function wireC() {', '    c();', '  }', ''].join('\n'),
  );
  assert.ok(read(root, 'src/us/ui/y.js').includes('  export function wireB() {\n    // the middle one\n    b();\n  }\n'));
  assert.deepStrictEqual(
    wireReport.wiring,
    [
      { name: 'wireA', module: 'src/us/ui/x.js' },
      { name: 'wireC', module: 'src/us/ui/x.js' },
      { name: 'wireB', module: 'src/us/ui/y.js' },
    ],
  );
  assert.deepStrictEqual(await both(root), wireBefore);
  assert.deepStrictEqual(wireBefore.us, 'abc');

  // 3. what can move into a function body: return inside a nested function, a break of the statement's own loop,
  //    this / arguments / var / a function declaration inside a nested non-arrow function
  const m3a = ["  on('e', () => {", "    if (!out.length) return 'x';", "    return 'y';", '  });'];
  const m3b = ['  for (const k of [1, 2]) {', '    if (k > 1) break;', '    a();', '  }'];
  const m3c = ["  on('f', function () {", '    var self = this;', '    function inner() {', '      return arguments.length;', '    }', '    return String(inner(self) + arguments.length);', '  });'];
  root = wireRoot([...m3a, ...m3b, ...m3c]);
  wireBefore = await both(root);
  applyModules(root, [wmod('src/us/ui/x.js', 'us', [L(m3a), L(m3b), L(m3c)], [['wireX', [L(m3a), L(m3b), L(m3c)]]])]);
  assert.ok(read(root, 'src/us/ui/x.js').includes('      if (k > 1) break;'));
  assert.deepStrictEqual(await both(root), wireBefore);
  assert.deepStrictEqual(wireBefore.us, 'exaf1');

  // 3. ... and what cannot: each refused with what it found, nothing written
  // (a statement whose var names a binding is labelled by that name, as the analyzer does)
  const cannot = (body, what, opts, lbl = L(body)) => {
    refuse(
      () => wireRoot(body, [], opts),
      [wmod('src/us/ui/x.js', 'us', [lbl], [['wireX', [lbl]]])],
      new RegExp(`statement ${lbl.replace(/[$]/g, '\\$&')} cannot move into a function body: ${what}`),
    );
  };
  cannot(['  if (out.length) return;'], 'return');
  cannot(["  on('e', () => this.y);"], 'this');
  cannot(["  on('e', () => `one", "  two`);"], 'multi-line literal');
  cannot(["  a('one\\", "two');"], 'multi-line literal');
  cannot(['  outer: for (;;) {', '    break outer;', '  }'], 'label');
  cannot(['  if (out) {', '    var v = 1;', '  }'], 'var', {}, 'v');
  cannot(['  if (out) {', '    function f() {}', '  }'], 'function declaration');
  cannot(['  {', '    class C {}', '  }'], 'class declaration');
  cannot(['  a(arguments);'], 'arguments');
  cannot(['  await a();'], 'await', { head: '(async () => {' });
  cannot(['  yield a();'], 'yield', { head: '(function* () {' });

  // the side-effect refusal stays for every statement that is not in its module's wiring
  refuse(() => wireRoot(['  a();', '  b();']), [wmod('src/us/ui/x.js', 'us', [L('a();'), L('b();')], [['wireX', [L('a();')]]])], /"stmt:\w+" is a side-effect statement/);
  refuse(
    () => wireRoot(['  a();', '  b();']),
    [wmod('src/us/ui/x.js', 'us', [L('a();')], [['wireX', [L('b();')]]]), wmod('src/us/ui/y.js', 'us', [L('b();')], [['wireY', [L('a();')]]])],
    /is a side-effect statement|not a statement of the module/,
  );
  refuse(() => wireRoot(['  a();']), [{ path: 'src/us/ui/x.js', owner: 'us', units: { us: [L('a();')], canada: [] } }], /is a side-effect statement/);
  // wiring functions live only in ui/ modules
  refuse(() => wireRoot(['  a();']), [wmod('src/us/core/x.js', 'us', [L('a();')], [['wireX', [L('a();')]]])], /wiring functions live only in ui\//);

  // 4. the split: `let seen = flag;` becomes `let seen;` plus `seen = flag;` at its position in the run
  const splitBody = ['  let flag = 0;', '  // the first step', '  flag = 2;', '  // seen is read at load', '  let seen = flag;', '  flag = 3;'];
  const SPLIT_TAIL = '  window.__out = [seen, flag].join();';
  root = wireRoot(splitBody, [], { usTail: SPLIT_TAIL });
  const splitBefore = { us: await bundle(root, 'us'), canada: await bundle(root, 'canada') };
  const splitPlan = planExtraction(root, {
    topics: {
      shared: { modules: {}, main: [] },
      us: { modules: { 'src/us/ui/x.js': { units: [L('flag = 2;'), 'seen', L('flag = 3;')] } }, main: [L(SPLIT_TAIL)] },
      canada: { modules: {}, main: [L(OUT_TAIL)] },
    },
  });
  const splitMod = splitPlan.modules.find((m) => m.path === 'src/us/ui/x.js');
  assert.deepStrictEqual(splitMod.splits, [{ name: 'seen', label: L('seen = flag;') }]);
  assert.deepStrictEqual(splitMod.wiring, [{ name: 'wireX', statements: { us: [L('flag = 2;'), L('seen = flag;'), L('flag = 3;')] } }]);
  applyModules(root, splitPlan.modules);
  assert.strictEqual(
    read(root, 'src/us/ui/x.js'),
    [
      '  export let flag = 0;',
      '  // seen is read at load',
      '  export let seen;',
      '  export function wireX() {',
      '    // the first step',
      '    flag = 2;',
      '    seen = flag;',
      '    flag = 3;',
      '  }',
      '',
    ].join('\n'),
  );
  assert.ok(read(root, 'src/us/main.js').includes(['(() => {', '  wireX();', SPLIT_TAIL].join('\n')), read(root, 'src/us/main.js'));
  for (const c of COUNTRIES_T) {
    const cmp = compareScripts(splitBefore[c], await bundle(root, c), { ordered: true });
    assert.deepStrictEqual([cmp.missing, cmp.added, cmp.orderedOk], [[], [], true], `${c}: ${JSON.stringify(cmp.firstOrderDiff)}`);
  }
  assert.strictEqual(await run(root, 'us'), '2,3');

  // ---- Task 7 fix round 1
  // run validation: source order (a split counts at its declaration's line) and nothing else in between
  const runErr = /run wireX \(stmt:/;
  refuse(() => wireRoot(['  a();', '  b();']), [wmod('src/us/ui/x.js', 'us', [L('a();'), L('b();')], [['wireX', [L('b();'), L('a();')]]])], runErr);
  refuse(() => wireRoot(['  a();', '  b();', '  c();']), [wmod('src/us/ui/x.js', 'us', [L('a();'), L('c();')], [['wireX', [L('a();'), L('c();')]]])], runErr);
  refuse(
    () => wireRoot(['  a();', '  b();', '  c();']),
    [wmod('src/us/ui/x.js', 'us', [L('a();'), L('c();')], [['wireX', [L('a();'), L('c();')]]]), wmod('src/us/ui/y.js', 'us', [L('b();')], [['wireY', [L('b();')]]])],
    runErr,
  );
  const SPL = L('seen = out.length;');
  const splitMods = (order, decl = 'seen') => [
    wmod('src/us/ui/x.js', 'us', [L('a();'), decl, L('b();')], [['wireX', order]], { splits: [{ name: 'seen', label: SPL }] }),
  ];
  refuse(() => wireRoot(['  a();', '  let seen = out.length;', '  b();']), splitMods([L('a();'), L('b();'), SPL]), runErr);
  // a declaration between two statements of a run is fine (it stays in main.js here)
  root = wireRoot(['  a();', '  const k = 1;', '  b();']);
  wireBefore = await both(root);
  applyModules(root, [wmod('src/us/ui/x.js', 'us', [L('a();'), L('b();')], [['wireX', [L('a();'), L('b();')]]])]);
  assert.ok(read(root, 'src/us/main.js').includes(['  wireX();', '  const k = 1;', OUT_TAIL].join('\n')), read(root, 'src/us/main.js'));
  assert.deepStrictEqual(await both(root), wireBefore);

  // a wiring name that clashes with a top-level name of main.js or of the module
  refuse(
    () => wireRoot(['  const wireX = () => b();', '  a();']),
    [wmod('src/us/ui/x.js', 'us', [L('a();')], [['wireX', [L('a();')]]])],
    /src\/us\/ui\/x\.js: wiring function wireX clashes with a top-level name of us\/main\.js/,
  );
  refuse(
    () => wireRoot(['  function wireX() {}', '  a();']),
    [wmod('src/us/ui/x.js', 'us', ['wireX', L('a();')], [['wireX', [L('a();')]]])],
    /src\/us\/ui\/x\.js: wiring function wireX clashes with a top-level name of the module/,
  );
  refuse(
    () => wireRoot(['  a();']),
    [wmod('src/us/ui/x.js', 'us', [L('a();')], [['a', [L('a();')]]])],
    /src\/us\/ui\/x\.js: wiring function a clashes with a top-level name of the module/,
  );

  // the wiring record lists the runs written, not the manifest's entries
  root = wireRoot(['  a();']);
  wireReport = applyModules(root, [wmod('src/us/ui/x.js', 'us', [L('a();')], [['wireX', [L('a();')]], ['wireEmpty', []]])]);
  assert.deepStrictEqual(wireReport.wiring, [{ name: 'wireX', module: 'src/us/ui/x.js' }]);

  // every split refusal
  const splitRefuse = (declLine, pattern, decl = 'seen') => refuse(() => wireRoot(['  a();', declLine, '  b();']), splitMods([L('a();'), SPL, L('b();')], decl), pattern);
  splitRefuse('  let seen = out.length; // why', /split seen shares its lines with other text/);
  splitRefuse('  let seen = out.length, z = 1;', /split seen is not a one-name/, 'seen, z'); // the analyzer's label for two declarators
  splitRefuse('  const seen = out.length;', /split seen has no `let` declaration/);
  splitRefuse('  let seen;', /split seen is not a one-name/);
  splitRefuse('  let seen = (out.length);', /split seen does not end with ";" right after its initializer/);
  // a run that starts with a split assignment
  refuse(() => wireRoot(['  let seen = out.length;', '  a();', '  b();']), splitMods([SPL, L('a();'), L('b();')]), /starts with the split assignment of seen/);
  // break and continue: a nested switch's break moves; with no loop or switch of the statement's own they are refused
  const sw = ['  switch (out.length) {', '    case 0:', '      a();', '      break;', '    default:', '      b();', '  }'];
  root = wireRoot(sw);
  wireBefore = await both(root);
  applyModules(root, [wmod('src/us/ui/x.js', 'us', [L(sw)], [['wireX', [L(sw)]]])]);
  assert.deepStrictEqual(await both(root), wireBefore);
  // A top-level break or continue of the IIFE does not parse, so the checker is driven directly on a statement inside a loop.
  const inner = (code) => espree.parse(code, { ecmaVersion: 2022, sourceType: 'module', range: true, loc: true }).body[0].body.body[0];
  assert.strictEqual(functionBodyProblem(inner('while (x) { if (y) break; }')), 'break');
  assert.strictEqual(functionBodyProblem(inner('while (x) { switch (y) { case 1: continue; } }')), 'continue');
  assert.strictEqual(functionBodyProblem(inner('while (x) { switch (y) { case 1: break; } }')), null);
  assert.strictEqual(functionBodyProblem(inner('while (x) { for (;;) { continue; } }')), null);

  // ---- stage 4 (Task 8): UI facades, UI cycles under the load-time guard
  // 2. two ui/ modules importing each other: accepted when every initializer is inert, refused (with the guard's problem) otherwise
  const EVEN_ODD = ['  function isEven(n) {', '    return n === 0 ? true : isOdd(n - 1);', '  }', '  function isOdd(n) {', '    return n === 0 ? false : isEven(n - 1);', '  }'];
  const cycleRoot = (extra = []) => {
    const r = newRoot();
    write(r, 'src/us/main.js', mainWith([], [...EVEN_ODD, ...extra], '  window.__out = isEven(4);'));
    write(r, 'src/canada/main.js', mainWith([], [], '  window.__out = true;'));
    return r;
  };
  const evenOdd = (dirA, dirB, bExtra = []) => [
    { path: `src/us/${dirA}/a.js`, owner: 'us', units: { us: ['isEven'], canada: [] } },
    { path: `src/us/${dirB}/b.js`, owner: 'us', units: { us: ['isOdd', ...bExtra], canada: [] } },
  ];
  root = cycleRoot();
  const cycleBefore = await both(root);
  applyModules(root, evenOdd('ui', 'ui'));
  assert.ok(read(root, 'src/us/ui/a.js').includes("import { isOdd } from './b.js';") && read(root, 'src/us/ui/b.js').includes("import { isEven } from './a.js';"));
  assert.deepStrictEqual(await both(root), cycleBefore);
  assert.deepStrictEqual(cycleBefore.us, true);
  refuse(
    () => cycleRoot(['  const k = isOdd(1);']),
    evenOdd('ui', 'ui', ['k']),
    /module import cycle: src\/us\/ui\/a\.js -> src\/us\/ui\/b\.js -> src\/us\/ui\/a\.js; load-time guard: src\/us\/ui\/b\.js line \d+: k: not inert and not marked/,
  );
  // a marked initializer that reads a name bound to a cycle partner
  refuse(
    () => cycleRoot(['  // load-time: reads isEven', '  const k = isEven(2);']),
    evenOdd('ui', 'ui', ['k']),
    /module import cycle: .*load-time guard: src\/us\/ui\/b\.js line \d+: k: reads the cycle/,
  );
  // in a cycle a marked initializer may use only globals and literals: a call of a function of its own module is refused
  refuse(
    () => cycleRoot(['  function helperK() {', '    return 1;', '  }', '  // load-time: calls a local helper', '  const k = helperK();']),
    evenOdd('ui', 'ui', ['helperK', 'k']),
    /module import cycle: .*load-time guard: src\/us\/ui\/b\.js line \d+: k: reads its module in a cycle \(helperK\)/,
  );
  // a cycle with a module outside ui/ still throws as before, whatever its initializers
  refuse(cycleRoot, evenOdd('ui', 'core'), /module import cycle: .*not every module of the cycle is under ui\//);
  refuse(cycleRoot, evenOdd('core', 'core'), /module import cycle/);

  console.log('extract_units OK');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
