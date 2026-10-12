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
  // A binding assigned elsewhere (`counter`, written by bump) and its writer stay, and so does a side-effect statement.
  const planned = JSON.stringify(plan.modules);
  assert.ok(!planned.includes('counter') && !planned.includes('bump'), 'a mutable binding and its writer must stay');
  assert.ok(!planned.includes('__out') && !planned.includes('statement@'), 'a side-effect statement must stay');
  // Names can be overridden.
  const renamed = planExtraction(root, { maxLayer: 3, names: { 'shared:helpers': 'math', 'us:rate': 'us-rate' } });
  assert.ok(renamed.modules.some((m) => m.path === 'src/shared/core/math.js'));
  assert.ok(renamed.modules.some((m) => m.path === 'src/us/core/us-rate.js'));
  // maxLayer limits how deep a unit may sit: `tax` depends on `twice`, so layer 0 holds only leaves.
  const shallow = planExtraction(root, { maxLayer: 0 });
  assert.ok(!JSON.stringify(shallow.modules).includes('"tax"'), 'a unit above the layer limit stays');

  console.log('extraction_plan OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
