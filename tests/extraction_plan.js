// Tests for scripts/lib/extraction-plan.js (plain Node, a fixture tree in tmp).
// The fixture is a miniature of the real layout: two planners with one shared region and some country code.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planExtraction, kebab } = require('../scripts/lib/extraction-plan');

const made = [];
function write(root, rel, text) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

const SHARED_REGION = [
  '  // @@shared:helpers begin',
  '  // doubles a number',
  '  const twice = (n) => n * 2;',
  '  function addBase(n) {',
  '    return n + state.base;',
  '  }',
  '  // @@shared:helpers end',
];
const mainText = (rate, extra) =>
  [
    "import { state } from '../shared/core/store.js';",
    '(() => {',
    ...SHARED_REGION,
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-plan-'));
  made.push(root);
  write(root, 'src/package.json', '{ "private": true, "type": "module" }\n');
  write(root, 'src/shared/core/store.js', 'export const state = { base: 3 };\n');
  write(root, 'src/us/main.js', mainText('0.1', US_EXTRA));
  write(root, 'src/canada/main.js', mainText('0.2', []));
  write(root, 'shared/helpers.js', SHARED_REGION.slice(1, -1).join('\n') + '\n');
  return root;
}

try {
  assert.strictEqual(kebab('01-LIST_MAX'), 'list-max');
  assert.strictEqual(kebab('selfEmploymentTax'), 'self-employment-tax');

  const root = fixture();
  const plan = planExtraction(root, { maxLayer: 3 });
  const byPath = Object.fromEntries(plan.modules.map((m) => [m.path, m]));
  assert.deepStrictEqual(
    Object.keys(byPath).sort(),
    ['src/canada/core/rate.js', 'src/shared/core/helpers.js', 'src/us/core/is-even.js', 'src/us/core/rate.js'],
  );
  // The shared region becomes one shared module, with the same units in both planners.
  assert.deepStrictEqual(byPath['src/shared/core/helpers.js'].units, { us: ['twice', 'addBase'], canada: ['twice', 'addBase'] });
  assert.strictEqual(byPath['src/shared/core/helpers.js'].owner, 'shared');
  assert.deepStrictEqual(byPath['src/shared/core/helpers.js'].regions, ['helpers']);
  // Country code that depends on it comes in a later batch than it.
  assert.deepStrictEqual(byPath['src/us/core/rate.js'].units.us, ['rate', 'tax']);
  assert.ok(byPath['src/us/core/rate.js'].batch > byPath['src/shared/core/helpers.js'].batch);
  // Two functions that call each other are one cycle, so one module.
  assert.deepStrictEqual(byPath['src/us/core/is-even.js'].units.us.sort(), ['isEven', 'isOdd']);
  // A binding with two writers (`counter`, written by bump and reset) and its writers stay, and so does a side-effect statement.
  const planned = JSON.stringify(plan.modules);
  assert.ok(!planned.includes('counter') && !planned.includes('bump') && !planned.includes('reset'), 'a shared mutable binding and its writers must stay');
  assert.ok(!planned.includes('__out') && !planned.includes('stmt:'), 'a side-effect statement must stay');
  // Names can be overridden.
  const renamed = planExtraction(root, { maxLayer: 3, names: { 'shared:helpers': 'math', 'us:rate': 'us-rate' } });
  assert.ok(renamed.modules.some((m) => m.path === 'src/shared/core/math.js'));
  assert.ok(renamed.modules.some((m) => m.path === 'src/us/core/us-rate.js'));
  // maxLayer limits how deep a unit may sit: `tax` depends on `twice`, so layer 0 holds only leaves.
  const shallow = planExtraction(root, { maxLayer: 0 });
  assert.ok(!JSON.stringify(shallow.modules).includes('"tax"'), 'a unit above the layer limit stays');

  // ---- stage 3: mutable bindings, DOM-free only, seams, cycles between a shared region and country code
  const planOf = (usLines, caLines, options, files = {}) => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-plan-'));
    made.push(r);
    write(r, 'src/package.json', '{ "private": true, "type": "module" }\n');
    const wrap = (lines) =>
      [...lines.filter((l) => l.startsWith('import ')), '(() => {', ...lines.filter((l) => !l.startsWith('import ')), '})();', ''].join('\n');
    write(r, 'src/us/main.js', wrap(usLines));
    write(r, 'src/canada/main.js', wrap(caLines));
    for (const [rel, text] of Object.entries(files)) write(r, rel, text);
    return planExtraction(r, options);
  };
  const countryUnits = (plan, country) => plan.modules.filter((m) => m.owner === country).flatMap((m) => m.units[country]);
  const NONE = [];

  // One writer function and no statement writer: the declaration moves with its writer, and a reader comes along.
  const colocate = [
    '  let counter = 0;',
    '  function bump() {',
    '    counter++;',
    '  }',
    '  function peek() {',
    '    return counter;',
    '  }',
  ];
  let p = planOf(colocate, NONE, { coreOnly: true });
  assert.deepStrictEqual(countryUnits(p, 'us').sort(), ['bump', 'counter', 'peek']);
  assert.deepStrictEqual(p.bindings.us.colocated, [{ declaredIn: 'counter', writer: 'bump' }]);
  assert.deepStrictEqual(p.bindings.us.needsDecision, []);
  assert.strictEqual(p.modules.length, 1, 'the binding and its writer are one module');

  // Two writers, or a statement writer: nothing that touches the binding moves, and the binding is reported.
  p = planOf(
    [
      '  let level = 0;',
      '  function up() {',
      '    level++;',
      '  }',
      '  function down() {',
      '    level--;',
      '  }',
      '  let mode = 0;',
      '  function pure() {',
      '    return 1;',
      '  }',
      '  mode = 2;',
    ],
    NONE,
    {},
  );
  assert.deepStrictEqual(countryUnits(p, 'us'), ['pure']);
  assert.deepStrictEqual(
    p.bindings.us.needsDecision.map((b) => ({ names: b.names, writers: b.writers.map((w) => (w.startsWith('stmt:') ? 'statement' : w)) })),
    [
      { names: ['level'], writers: ['down', 'up'] },
      { names: ['mode'], writers: ['statement'] },
    ],
  );

  // coreOnly leaves a unit that touches the DOM, and a unit that depends on it.
  const dom = ["  function paint() {", "    document.title = 'x';", '  }', '  function viaPaint() {', '    paint();', '  }', '  function pure() {', '    return 1;', '  }'];
  assert.deepStrictEqual(countryUnits(planOf(dom, NONE, { coreOnly: true }), 'us'), ['pure']);
  assert.deepStrictEqual(countryUnits(planOf(dom, NONE, {}), 'us').sort(), ['paint', 'pure', 'viaPaint']);
  assert.ok(planOf(dom, NONE, {}).modules.some((m) => m.ui && m.path.includes('/ui/')), 'DOM code goes under ui/ when it is moved');

  // A unit that imports from a ui/ module is ui code, although its own text touches no browser global.
  const viaImport = ["  function usesUi() {", '    return helperUi();', '  }', '  function pure() {', '    return 1;', '  }'];
  const withImport = (lines) => ["import { helperUi } from './ui/thing.js';", ...lines];
  const uiFile = { 'src/us/ui/thing.js': 'export const helperUi = () => 2;\n' };
  p = planOf(withImport(viaImport), NONE, { coreOnly: true }, uiFile);
  assert.deepStrictEqual(countryUnits(p, 'us'), ['pure']);

  // A path an earlier stage already made is never reused.
  p = planOf(['  function rate() {', '    return 1;', '  }'], NONE, {}, { 'src/us/core/rate.js': 'export const x = 1;\n' });
  assert.deepStrictEqual(p.modules.map((m) => m.path), ['src/us/core/rate-2.js']);

  // maxBatch caps the batch number; maxLayer is unlimited by default.
  const chain = ['  const a = 1;', '  const b = a + 1;', '  const c = b + 1;', '  const d = c + 1;'];
  p = planOf(chain, NONE, { maxBatch: 1 });
  assert.ok(p.modules.every((m) => m.batch <= 1));
  assert.deepStrictEqual(countryUnits(p, 'us').sort(), ['a', 'b', 'c', 'd']);

  // A shared region may use a country unit only through the seam names, and only when the names exist in both planners.
  const seamUs = [
    '  // @@shared:calls begin',
    '  function callTax(n) {',
    '    return taxFor(n) + 1;',
    '  }',
    '  // @@shared:calls end',
    '  function taxFor(n) {',
    '    return n * 2;',
    '  }',
  ];
  const seamCa = seamUs.map((l) => l.replace('n * 2', 'n * 3'));
  const seamFiles = { 'shared/calls.js': seamUs.slice(1, 4).join('\n') + '\n' };
  assert.deepStrictEqual(countryUnits(planOf(seamUs, seamCa, {}, seamFiles), 'us'), ['taxFor']);
  p = planOf(seamUs, seamCa, { seam: ['taxFor'] }, seamFiles);
  assert.deepStrictEqual(p.seam, ['taxFor']);
  assert.ok(p.modules.some((m) => m.owner === 'shared' && m.units.us.includes('callTax')), 'the shared unit moves through the seam');
  assert.throws(() => planOf(seamUs, seamCa, { seam: ['nope'] }, seamFiles), /seam name nope/);
  // A seam name an earlier run already exported through its facades is valid although main.js no longer has it.
  const pureLines = ['  function pure() {', '    return 1;', '  }'];
  const fooFacades = {
    'src/us/core/seam-foo.js': "export { foo } from './foo.js';\n",
    'src/canada/core/seam-foo.js': "export { foo } from './foo.js';\n",
  };
  assert.doesNotThrow(() => planOf(pureLines, pureLines, { seam: ['foo'] }, fooFacades));

  // A shared region and a country run that would import each other as whole modules are split until they do not.
  const cycUs = (n) => [
    '  // @@shared:pair begin',
    '  function f(n) {',
    '    return g(n) + 1;',
    '  }',
    '  function h(n) {',
    '    return n + 1;',
    '  }',
    '  // @@shared:pair end',
    '  function g(n) {',
    `    return h(n) * ${n};`,
    '  }',
    '  function k(n) {',
    '    return f(n) - 1;',
    '  }',
  ];
  const pairFiles = { 'shared/pair.js': cycUs(2).slice(1, 7).join('\n') + '\n' };
  p = planOf(cycUs(2), cycUs(3), { seam: ['g'] }, pairFiles);
  const sharedModules = p.modules.filter((m) => m.owner === 'shared');
  assert.deepStrictEqual(sharedModules.map((m) => m.units.us).sort(), [['f'], ['h']], 'f and h are in modules of their own');
  assert.deepStrictEqual(countryUnits(p, 'us').sort(), ['g', 'k']);

  console.log('extraction_plan OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
