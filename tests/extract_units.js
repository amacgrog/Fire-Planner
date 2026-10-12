// Tests for scripts/lib/extract-units.js (plain Node, fixture trees in tmp).
// The fixtures are miniatures of the real layout: two planners, one shared region, some country code. After every
// extraction the planners are bundled the way the build does and must produce what they produced before.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { planExtraction } = require('../scripts/lib/extraction-plan');
const { applyModules } = require('../scripts/lib/extract-units');

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
  const root = newRoot();
  write(root, 'src/us/main.js', mainText('0.1', US_EXTRA));
  write(root, 'src/canada/main.js', mainText('0.2', []));
  write(root, 'shared/helpers.js', SHARED_REGION.slice(1, -1).join('\n') + '\n');
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

// Bundles a planner the way the build does and returns what it leaves in window.__out.
async function run(root, country) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src', country, 'main.js')],
    bundle: true,
    write: false,
    format: 'iife',
    logLevel: 'silent',
    outfile: 'out.js',
  });
  const window = {};
  vm.runInNewContext(result.outputFiles[0].text, { window });
  return window.__out;
}
const both = async (root) => ({ us: await run(root, 'us'), canada: await run(root, 'canada') });

(async () => {
  // ---- applying a plan keeps the programs' behavior and writes the expected files
  let root = fixture();
  const before = await both(root);
  const plan = planExtraction(root, { maxLayer: 3 });
  const report = applyModules(root, plan.modules);
  assert.deepStrictEqual(report.deletedRegions, ['helpers']);
  assert.deepStrictEqual(report.warnings, []);
  assert.deepStrictEqual(report.moved, { us: 6, canada: 4 });
  assert.strictEqual(
    read(root, 'src/shared/core/helpers.js'),
    [
      "import { state } from './store.js';",
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
      "import { addBase, twice } from '../../shared/core/helpers.js';",
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
  assert.ok(!usMain.includes('@@shared:helpers'), 'the emptied region is gone from main.js');
  assert.ok(!fs.existsSync(path.join(root, 'shared/helpers.js')), 'and its fragment');
  assert.deepStrictEqual(await both(root), before);

  // ---- a dry run writes nothing
  root = fixture();
  const dry = applyModules(root, planExtraction(root, { maxLayer: 3 }).modules, { dryRun: true });
  assert.strictEqual(dry.modules.length, 4);
  assert.ok(!fs.existsSync(path.join(root, 'src/shared/core/helpers.js')) && fs.existsSync(path.join(root, 'shared/helpers.js')));

  // ---- a data block travels with both of its markers
  root = dataFixture();
  const dataBefore = await both(root);
  applyModules(root, [{ path: 'src/us/core/rules.js', owner: 'us', units: { us: ['A', 'B'], canada: [] } }]);
  const rulesModule = read(root, 'src/us/core/rules.js');
  assert.ok(rulesModule.includes('// RULES:begin') && rulesModule.includes('// RULES:end'), rulesModule);
  assert.ok(!read(root, 'src/us/main.js').includes('RULES:'), 'no marker is left behind');
  assert.deepStrictEqual((await both(root)).us, dataBefore.us);

  // ---- refusals: each throws and writes nothing
  const refuse = (setup, modules, pattern) => {
    const r = setup();
    const snapshot = [read(r, 'src/us/main.js'), read(r, 'src/canada/main.js')];
    assert.throws(() => applyModules(r, modules), pattern);
    assert.deepStrictEqual([read(r, 'src/us/main.js'), read(r, 'src/canada/main.js')], snapshot, 'nothing is written on a refusal');
  };
  const statementLabel = (r) => `statement@${read(r, 'src/us/main.js').split('\n').findIndex((l) => l.includes('window.__out')) + 1}`;
  const one = (p, owner, us, canada = []) => [{ path: p, owner, units: { us, canada } }];
  refuse(fixture, one('src/us/core/x.js', 'us', [statementLabel(fixture())]), /side-effect statement/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['counter']), /assigned outside its module/);
  refuse(fixture, one('src/us/core/x.js', 'us', ['tax']), /depends on "(rate|twice|addBase)", which stays/);
  refuse(fixture, one('src/shared/core/h.js', 'shared', ['twice'], ['addBase']), /shared unit lists differ/);
  refuse(fixture, one('src/shared/core/store.js', 'shared', ['twice'], ['twice']), /already exists/);
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
    () => {
      const r = fixture();
      write(r, 'src/canada/main.js', read(r, 'src/canada/main.js').replace('n * 2', 'n * 3'));
      return r;
    },
    one('src/shared/core/h.js', 'shared', ['twice'], ['twice']),
    /differs between the two planners/,
  );
  refuse(
    dataFixture,
    [
      { path: 'src/us/core/a.js', owner: 'us', units: { us: ['A'], canada: [] } },
      { path: 'src/us/core/b.js', owner: 'us', units: { us: ['B'], canada: [] } },
    ],
    /data block RULES is split/,
  );

  // a region emptied in one planner while the other still carries it
  refuse(fixture, one('src/us/core/x.js', 'us', ['twice', 'addBase']), /region helpers exists in canada\/main\.js but not in us\/main\.js/);

  console.log('extract_units OK');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
