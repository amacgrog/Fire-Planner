// Tests for scripts/lib/extraction-plan.js (plain Node, a fixture tree in tmp).
// The fixture is a miniature of the real layout: two planners with one shared region and some country code.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planExtraction, draftTopics, kebab } = require('../scripts/lib/extraction-plan');

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

  // ---- stage 4: the topics file (statements, runs, wiring functions, draft mode)
  const { analyze } = require('../scripts/analyze-closure');
  const wrapLines = (lines) =>
    [...lines.filter((l) => l.startsWith('import ')), '(() => {', ...lines.filter((l) => !l.startsWith('import ')), '})();', ''].join('\n');
  // A fixture root plus the stable label of every statement (by its one-line text) in each planner.
  const topicRoot = (usLines, caLines, files = {}) => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'extraction-plan-'));
    made.push(r);
    write(r, 'src/package.json', '{ "private": true, "type": "module" }\n');
    write(r, 'src/us/main.js', wrapLines(usLines));
    write(r, 'src/canada/main.js', wrapLines(caLines));
    for (const [rel, text] of Object.entries(files)) write(r, rel, text);
    const L = {};
    for (const c of ['us', 'canada']) {
      const code = fs.readFileSync(path.join(r, 'src', c, 'main.js'), 'utf8');
      const lines = code.split('\n');
      L[c] = {};
      for (const u of analyze(code).units) if (u.kind === 'statement') L[c][lines[u.startLine - 1].trim()] = u.label;
    }
    return { root: r, L };
  };
  const topicsOf = ({ shared = {}, us = {}, canada = {} } = {}) => ({
    shared: { modules: {}, main: [], ...shared },
    us: { modules: {}, main: [], ...us },
    canada: { modules: {}, main: [], ...canada },
  });
  const modOf = (plan, p) => plan.modules.find((m) => m.path === p);
  const LOG = (s) => `  window.log('${s}');`;
  const logs = (s) => `window.log('${s}');`;

  // 1. Two country statements listed in one module are one run, with the default wiring name.
  {
    const { root: r, L } = topicRoot([LOG('a'), LOG('b')], NONE);
    const la = L.us[logs('a')];
    const lb = L.us[logs('b')];
    const plan1 = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [la, lb] } } } }) });
    const x = modOf(plan1, 'src/us/ui/x.js');
    assert.deepStrictEqual(x.units.us, [la, lb]);
    assert.deepStrictEqual(x.wiring, [{ name: 'wireX', statements: { us: [la, lb] } }]);
    assert.strictEqual(x.owner, 'us');
    assert.ok(x.ui, 'a module under ui/ is a ui module');
    // Without topics the statements stay and no module has a wiring key; the manifest has no topics key.
    const plain = planExtraction(r, {});
    assert.ok(plain.modules.every((m) => !('wiring' in m)) && !('topics' in plain));
    assert.ok(!JSON.stringify(plain.modules).includes('stmt:'), 'statements stay without topics');
    // Names with a hyphen become PascalCase; a one-run module may use the default name.
    const hy = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/is-even.js': { units: [la, lb] } } } }) });
    assert.strictEqual(modOf(hy, 'src/us/ui/is-even.js').wiring[0].name, 'wireIsEven');
  }

  // 2. A module with two runs needs both runs named.
  {
    const { root: r, L } = topicRoot([LOG('a'), LOG('c'), LOG('b')], NONE);
    const [la, lc, lb] = ['a', 'c', 'b'].map((s) => L.us[logs(s)]);
    const t = (wiring) =>
      topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [la, lb], ...(wiring ? { wiring } : {}) }, 'src/us/ui/y.js': { units: [lc] } } } });
    assert.throws(() => planExtraction(r, { topics: t() }), /several runs/);
    assert.throws(() => planExtraction(r, { topics: t({ [la]: 'wireA' }) }), /several runs/);
    const two = planExtraction(r, { topics: t({ [la]: 'wireA', [lb]: 'wireB' }) });
    assert.deepStrictEqual(modOf(two, 'src/us/ui/x.js').wiring, [
      { name: 'wireA', statements: { us: [la] } },
      { name: 'wireB', statements: { us: [lb] } },
    ]);
    assert.deepStrictEqual(modOf(two, 'src/us/ui/y.js').wiring, [{ name: 'wireY', statements: { us: [lc] } }]);
    // A wiring key that is no statement of the module is a mistake.
    assert.throws(() => planExtraction(r, { topics: t({ [la]: 'wireA', [lb]: 'wireB', [lc]: 'wireC' }) }), /wiring key/);
  }

  // 3. A declaration between two statements of one module does not split the run.
  {
    const { root: r, L } = topicRoot([LOG('a'), '  function mid() {', '    return 1;', '  }', LOG('b')], NONE);
    const [la, lb] = ['a', 'b'].map((s) => L.us[logs(s)]);
    const p3 = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [la, lb] } } } }) });
    assert.deepStrictEqual(modOf(p3, 'src/us/ui/x.js').wiring, [{ name: 'wireX', statements: { us: [la, lb] } }]);
    assert.ok(modOf(p3, 'src/us/core/mid.js'), 'the declaration keeps its own grouping');
  }

  // 4. A shared module's runs split at the union of both planners' boundaries.
  const sharedFix = (withBetween) => [
    '  // @@shared:a begin',
    '  function fa() {',
    '    return 1;',
    '  }',
    LOG('s1'),
    '  // @@shared:a end',
    ...(withBetween ? [LOG('c')] : []),
    '  // @@shared:b begin',
    LOG('s2'),
    '  function fb() {',
    '    return 2;',
    '  }',
    '  // @@shared:b end',
  ];
  {
    const { root: r, L } = topicRoot(sharedFix(true), sharedFix(false));
    const [s1, s2] = ['s1', 's2'].map((s) => L.us[logs(s)]);
    assert.strictEqual(L.canada[logs('s1')], s1, 'a shared statement has one label in both planners');
    const lc = L.us[logs('c')];
    const t = (wiring) =>
      topicsOf({
        shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2], ...(wiring ? { wiring } : {}) } } },
        us: { modules: { 'src/us/ui/c.js': { units: [lc] } } },
      });
    assert.throws(() => planExtraction(r, { topics: t() }), /several runs/);
    const p4 = planExtraction(r, { topics: t({ [s1]: 'wireS1', [s2]: 'wireS2' }) });
    assert.deepStrictEqual(modOf(p4, 'src/shared/ui/m.js').wiring, [
      { name: 'wireS1', statements: { us: [s1], canada: [s1] } },
      { name: 'wireS2', statements: { us: [s2], canada: [s2] } },
    ]);
    // Without the US-only statement between them the two are one run in both planners, and the default name applies.
    const same = topicRoot(sharedFix(false), sharedFix(false));
    const [t1, t2] = ['s1', 's2'].map((s) => same.L.us[logs(s)]);
    const p4b = planExtraction(same.root, { topics: topicsOf({ shared: { modules: { 'src/shared/ui/theme.js': { units: [t1, t2] } } } }) });
    assert.deepStrictEqual(modOf(p4b, 'src/shared/ui/theme.js').wiring, [{ name: 'wireTheme', statements: { us: [t1, t2], canada: [t1, t2] } }]);
    assert.strictEqual(modOf(p4b, 'src/shared/ui/theme.js').owner, 'shared');
  }

  // 5. Refusals.
  {
    const { root: r, L } = topicRoot([...sharedFix(true), '  function g() {', '    return 3;', '  }'], sharedFix(false).concat(['  function g() {', '    return 3;', '  }']));
    const [s1, s2] = ['s1', 's2'].map((s) => L.us[logs(s)]);
    const lc = L.us[logs('c')];
    const full = (extra = {}) =>
      topicsOf({
        shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2], wiring: { [s1]: 'wireS1', [s2]: 'wireS2' } } } },
        us: { modules: { 'src/us/ui/c.js': { units: [lc] } } },
        ...extra,
      });
    assert.doesNotThrow(() => planExtraction(r, { topics: full() }));
    // unlisted statement
    const unlisted = topicsOf({ shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2] } } } });
    assert.throws(() => planExtraction(r, { topics: unlisted }), new RegExp(`statement ${lc} \\(us line \\d+\\) has no topics entry`));
    assert.throws(() => planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/c.js': { units: [lc] } } } }) }), /has no topics entry/);
    // core
    assert.throws(
      () => planExtraction(r, { topics: full({ us: { modules: { 'src/us/core/c.js': { units: [lc] } } } }) }),
      /listed in the core module/,
    );
    // a country statement in a shared module
    assert.throws(
      () => planExtraction(r, { topics: topicsOf({ shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2, lc] } } } }) }),
      /country statement/,
    );
    // a shared statement in a country module
    assert.throws(
      () =>
        planExtraction(r, {
          topics: topicsOf({
            shared: { modules: { 'src/shared/ui/m.js': { units: [s2] } } },
            us: { modules: { 'src/us/ui/c.js': { units: [lc, s1] } } },
          }),
        }),
      /shared statement/,
    );
    // a shared declaration in a country module, a country declaration in a shared module
    assert.throws(
      () => planExtraction(r, { topics: full({ us: { modules: { 'src/us/ui/c.js': { units: [lc, 'fa'] } } } }) }),
      /shared declaration/,
    );
    assert.throws(
      () => planExtraction(r, { topics: topicsOf({ shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2, 'g'] } } }, us: { modules: { 'src/us/ui/c.js': { units: [lc] } } } }) }),
      /country declaration/,
    );
    // a statement in two places
    assert.throws(
      () => planExtraction(r, { topics: full({ us: { modules: { 'src/us/ui/c.js': { units: [lc] } }, main: [lc] } }) }),
      /more than once/,
    );
    // a statement of main is not a failure, and a module outside its owner's directory is
    assert.doesNotThrow(() => planExtraction(r, { topics: full({ us: { modules: {}, main: [lc] } }) }));
    assert.throws(() => planExtraction(r, { topics: full({ us: { modules: { 'src/canada/ui/c.js': { units: [lc] } } } }) }), /outside/);
    // an unknown label
    assert.throws(() => planExtraction(r, { topics: full({ us: { modules: { 'src/us/ui/c.js': { units: [lc, 'nothing'] } } } }) }), /unknown unit nothing/);
  }

  // 6. A pinned statement may not assign a top-level binding of main.js.
  {
    const { root: r, L } = topicRoot(['  let n = 0;', '  n = 1;', LOG('a')], NONE);
    const ln = L.us['n = 1;'];
    const la = L.us[logs('a')];
    assert.throws(
      () => planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [la] } }, main: [ln] } }) }),
      /pinned statement assigns/,
    );
    // The same statement listed in a module is not pinned.
    assert.doesNotThrow(() => planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [la, ln] } } } }) }));
  }

  // 7. Wiring names: clashes with declarations, with each other, with the reserved list; a topics path that exists.
  {
    const files = {
      'src/shared/core/names.js': 'export function wireX() {}\n',
      'src/canada/core/z.js': 'export const wireZ = 1;\n',
      'src/us/ui/taken.js': 'export const x = 1;\n',
    };
    const { root: r, L } = topicRoot([LOG('a'), LOG('b'), '  function wireM() {', '    return 1;', '  }'], [LOG('a'), LOG('b')], files);
    const [la, lb] = ['a', 'b'].map((s) => L.us[logs(s)]);
    const mod = (p, units, wiring) => ({ [p]: { units, ...(wiring ? { wiring } : {}) } });
    const ca = [L.canada[logs('a')], L.canada[logs('b')]];
    const caMod = (p = 'src/canada/ui/k.js', wiring = { [ca[0]]: 'wireK' }) => ({ modules: mod(p, ca, wiring) });
    const one = (p, wiring) => topicsOf({ us: { modules: mod(p, [la, lb], wiring) }, canada: caMod() });
    // the default name clashes with a shared declaration
    assert.throws(() => planExtraction(r, { topics: one('src/us/ui/x.js') }), /wiring name clash/);
    assert.doesNotThrow(() => planExtraction(r, { topics: one('src/us/ui/x.js', { [la]: 'wireOk' }) }));
    // the clash with a unit that is still in main.js, and with the reserved names
    assert.throws(() => planExtraction(r, { topics: one('src/us/ui/q.js', { [la]: 'wireM' }) }), /wiring name clash/);
    assert.throws(() => planExtraction(r, { topics: one('src/us/ui/q.js', { [la]: 'wireOk' }), reservedNames: ['wireOk'] }), /wiring name clash/);
    // another country's tool module does not count; this country's does
    assert.doesNotThrow(() => planExtraction(r, { topics: one('src/us/ui/z.js') }));
    const caOnly = topicsOf({ us: { modules: mod('src/us/ui/q.js', [la, lb], { [la]: 'wireOk' }) }, canada: caMod('src/canada/ui/z.js', {}) });
    assert.throws(() => planExtraction(r, { topics: caOnly }), /wiring name clash/);
    // two modules with one name, two runs with one name
    assert.throws(
      () =>
        planExtraction(r, {
          topics: topicsOf({ us: { modules: { ...mod('src/us/ui/p.js', [la], { [la]: 'wireOk' }), ...mod('src/us/ui/q.js', [lb], { [lb]: 'wireOk' }) } }, canada: caMod() }),
        }),
      /wiring name clash/,
    );
    const { root: r2, L: L2 } = topicRoot([LOG('a'), LOG('c'), LOG('b'), LOG('d')], NONE);
    const [a2, c2, b2, d2] = ['a', 'c', 'b', 'd'].map((s) => L2.us[logs(s)]);
    assert.throws(
      () =>
        planExtraction(r2, {
          topics: topicsOf({
            us: { modules: { 'src/us/ui/x.js': { units: [a2, b2], wiring: { [a2]: 'wireOk', [b2]: 'wireOk' } }, 'src/us/ui/y.js': { units: [c2, d2] } } },
          }),
        }),
      /wiring name clash/,
    );
    // a topics path that exists on disk
    assert.throws(() => planExtraction(r, { topics: one('src/us/ui/taken.js', { [la]: 'wireOk' }) }), /already exists/);
  }

  // 8. Movability: a statement waits for what it depends on, moves after what it depends on, and a listed declaration goes where it is listed.
  {
    const { root: r, L } = topicRoot(
      ['  let lvl = 0;', '  function up() {', '    lvl++;', '  }', '  function down() {', '    lvl--;', '  }', '  function f() {', '    return 1;', '  }', '  window.log(lvl);', '  f();'],
      NONE,
    );
    const lstuck = L.us['window.log(lvl);'];
    const lf = L.us['f();'];
    const p8 = planExtraction(r, {
      topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: ['f', lf, lstuck] } } } }),
    });
    const x = modOf(p8, 'src/us/ui/x.js');
    assert.deepStrictEqual(x.units.us, ['f', lf], 'the declaration goes where it is listed; the blocked statement waits');
    assert.deepStrictEqual(x.wiring, [{ name: 'wireX', statements: { us: [lf] } }]);
    // A statement that calls a declaration grouped elsewhere comes in a later batch than it.
    const p8b = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [lf] } }, main: [lstuck] } }) });
    assert.ok(modOf(p8b, 'src/us/ui/x.js').batch > modOf(p8b, 'src/us/core/f.js').batch);
  }

  // 9. Draft mode (fixtures only): defaults from the design, computed as if every declaration moved.
  {
    const body = (extra) => [
      '  function paint() {',
      "    document.title = 'x';",
      '  }',
      LOG('p'),
      '  // @@shared:a begin',
      '  function fa() {',
      "    document.title = 'y';",
      '  }',
      LOG('s1'),
      '  // @@shared:a end',
      ...extra,
    ];
    const usLines = body([LOG('q'), '  function pure() {', '    return 1;', '  }', LOG('r')]);
    const { root: r, L } = topicRoot(usLines, body([]));
    const draft = draftTopics(r, {});
    const [lp, ls1, lq, lr] = ['p', 's1', 'q', 'r'].map((s) => L.us[logs(s)]);
    assert.deepStrictEqual(draft.us.modules['src/us/ui/paint.js'].units, [lp], 'after a country function: its module');
    assert.deepStrictEqual(draft.shared.modules['src/shared/ui/a.js'].units, [ls1], 'a shared statement: the module of the unit before it');
    assert.deepStrictEqual(draft.us.modules.TODO.units, [lq, lr], 'after a shared region, or landing in core/: TODO');
    assert.deepStrictEqual(Object.keys(draft.canada.modules), ['src/canada/ui/paint.js']);
    assert.deepStrictEqual(draft.canada.modules['src/canada/ui/paint.js'].units, [L.canada[logs('p')]]);
    assert.deepStrictEqual(draft.us.main, []);
  }

  // ---- fix round 1: wiring keys, existing modules, mirrored and failing shared runs, cycles between topics modules
  {
    // A wiring key must be the first statement of one of the module's runs.
    const { root: r, L } = topicRoot(
      [LOG('a'), LOG('b'), '  let lvl = 0;', '  function up() {', '    lvl++;', '  }', '  function down() {', '    lvl--;', '  }', '  window.log(lvl);', '  function f() {', '    return 1;', '  }'],
      NONE,
    );
    const [la, lb] = ['a', 'b'].map((s) => L.us[logs(s)]);
    const lw = L.us['window.log(lvl);'];
    const t = (units, wiring) =>
      topicsOf({ us: { modules: { 'src/us/ui/x.js': { units, wiring } }, main: [la, lb, lw].filter((l) => !units.includes(l)) } });
    assert.doesNotThrow(() => planExtraction(r, { topics: t([la, lb, lw], { [la]: 'wireA' }) }));
    assert.throws(() => planExtraction(r, { topics: t([la, lb, lw], { [lb]: 'wireB' }) }), /wiring key stmt:\w+ .*not the first statement of a run/);
    assert.throws(() => planExtraction(r, { topics: t([la, lw], { [la]: 'wireA', [lw]: 'wireW' }) }), /wiring key .* waits/);
    assert.throws(() => planExtraction(r, { topics: t([la, 'f'], { [la]: 'wireA', f: 'wireF' }) }), /wiring key f .*declaration/);
    assert.throws(() => planExtraction(r, { topics: t([la], { [lb]: 'wireB' }) }), /wiring key .* not a statement listed/);
  }
  {
    // A declaration listed in a module that already exists must be a top-level name of its file.
    const files = { 'src/us/ui/taken.js': 'export const moved = 1;\nexport function alsoMoved() {}\n' };
    const { root: r, L } = topicRoot([LOG('a')], NONE, files);
    const la = L.us[logs('a')];
    const withTaken = (units) => topicsOf({ us: { modules: { 'src/us/ui/taken.js': { units }, 'src/us/ui/x.js': { units: [la] } } } });
    assert.doesNotThrow(() => planExtraction(r, { topics: withTaken(['moved', 'alsoMoved']) }));
    assert.throws(() => planExtraction(r, { topics: withTaken(['moved', 'movd']) }), /declaration movd .*taken\.js/);
    assert.throws(() => planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/taken.js': { units: [la] } } } }) }), /already exists.*still in main\.js/);
  }
  {
    // The mirrored union-boundary case: the splitting statement is Canada's only; the shared module is two runs in both planners.
    const { root: r, L } = topicRoot(sharedFix(false), sharedFix(true));
    const [s1, s2] = ['s1', 's2'].map((s) => L.us[logs(s)]);
    const lc = L.canada[logs('c')];
    const topics = (wiring) =>
      topicsOf({
        shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2], ...(wiring ? { wiring } : {}) } } },
        canada: { modules: { 'src/canada/ui/c.js': { units: [lc] } } },
      });
    assert.throws(() => planExtraction(r, { topics: topics() }), /several runs/);
    const p = planExtraction(r, { topics: topics({ [s1]: 'wireS1', [s2]: 'wireS2' }) });
    assert.deepStrictEqual(modOf(p, 'src/shared/ui/m.js').wiring, [
      { name: 'wireS1', statements: { us: [s1], canada: [s1] } },
      { name: 'wireS2', statements: { us: [s2], canada: [s2] } },
    ]);
  }
  {
    // A shared module whose statements come in a different order in the two planners is refused.
    const reg = (a, b) => ['  // @@shared:a begin', LOG(a), LOG(b), '  // @@shared:a end'];
    const { root: r, L } = topicRoot(reg('s1', 's2'), reg('s2', 's1'));
    const [s1, s2] = ['s1', 's2'].map((s) => L.us[logs(s)]);
    assert.throws(
      () => planExtraction(r, { topics: topicsOf({ shared: { modules: { 'src/shared/ui/m.js': { units: [s1, s2] } } } }) }),
      /gathers different statements in the two planners/,
    );
  }
  {
    // Two topics modules whose declarations call each other, one of them under core/: refused (the topics paths decide,
    // design 5.3; Task 6 accepts the case where both are ui/ modules, below).
    const { root: r } = topicRoot(['  function f(n) {', '    return g(n);', '  }', '  function g(n) {', '    return f(n);', '  }'], NONE);
    assert.throws(
      () => planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/a.js': { units: ['f'] }, 'src/us/core/b.js': { units: ['g'] } } } }) }),
      /topics modules .* import each other/,
    );
  }

  // ---- Task 6: statement writers, the split rule, load-time markers, seam sides, UI cycles
  const { statementLabel } = require('../scripts/analyze-closure');

  // 0. The split assignment stands at the declaration's position and joins the run of its module.
  {
    const lines0 = ['  let y = 0;', '  y = 1;', '  let x = y;', LOG('t')];
    const { root: r, L } = topicRoot(lines0, NONE);
    const s = L.us['y = 1;'];
    const t = L.us[logs('t')];
    const split = statementLabel('x = y;');
    const p0 = planExtraction(r, {
      topics: topicsOf({ us: { modules: { 'src/us/ui/m.js': { units: [s, 'x'], wiring: { [s]: 'loadM' } }, 'src/us/ui/n.js': { units: [t] } } } }),
    });
    const m = modOf(p0, 'src/us/ui/m.js');
    assert.deepStrictEqual(m.units.us, ['y', s, 'x'], 'the binding y moves with its statement writer');
    assert.deepStrictEqual(m.wiring, [{ name: 'loadM', statements: { us: [s, split] } }], 'one run [s, x = y], named by s');
    assert.deepStrictEqual(m.splits, [{ name: 'x', label: split }]);
    assert.ok(!('splits' in modOf(p0, 'src/us/ui/n.js')), 'an empty splits list is left out');
    assert.deepStrictEqual(p0.bindings.us.colocated, [{ declaredIn: 'y', module: 'src/us/ui/m.js' }]);
    assert.deepStrictEqual(p0.bindings.us.needsDecision, []);
    // The declaration before s: the assignment would start the run.
    {
      const { root: r2, L: L2 } = topicRoot(['  let y = 0;', '  let x = y;', '  y = 1;', LOG('t')], NONE);
      const s2 = L2.us['y = 1;'];
      assert.throws(
        () => planExtraction(r2, { topics: topicsOf({ us: { modules: { 'src/us/ui/m.js': { units: [s2, 'x'] }, 'src/us/ui/n.js': { units: [L2.us[logs('t')]] } } } }) }),
        /split assignment would start a run: x/,
      );
    }
    // A main statement between s and the declaration: the same.
    {
      const { root: r3, L: L3 } = topicRoot(['  let y = 0;', '  y = 1;', LOG('m'), '  let x = y;', LOG('t')], NONE);
      const s3 = L3.us['y = 1;'];
      assert.throws(
        () =>
          planExtraction(r3, {
            topics: topicsOf({
              us: { modules: { 'src/us/ui/m.js': { units: [s3, 'x'] }, 'src/us/ui/n.js': { units: [L3.us[logs('t')]] } }, main: [L3.us[logs('m')]] },
            }),
          }),
        /split assignment would start a run: x/,
      );
    }
  }

  // 1. A binding written by a function and a statement moves when both go to one module.
  {
    const region = ['  // @@shared:lv begin', '  let level = 0;', '  function up() {', '    level++;', '  }', '  level = 5;', '  // @@shared:lv end'];
    const { root: r, L } = topicRoot(region, region);
    const ls = L.us['level = 5;'];
    assert.strictEqual(L.canada['level = 5;'], ls);
    const p1 = planExtraction(r, { topics: topicsOf({ shared: { modules: { 'src/shared/ui/l.js': { units: ['up', ls] } } } }) });
    assert.deepStrictEqual(modOf(p1, 'src/shared/ui/l.js').units, { us: ['level', 'up', ls], canada: ['level', 'up', ls] });
    assert.deepStrictEqual(p1.bindings.us.needsDecision, []);
    assert.deepStrictEqual(p1.bindings.canada.needsDecision, []);
    assert.deepStrictEqual(p1.bindings.us.colocated, [{ declaredIn: 'level', module: 'src/shared/ui/l.js' }]);
    // The statement in another module: the writers span modules, so the binding needs a decision.
    const p1b = planExtraction(r, {
      topics: topicsOf({ shared: { modules: { 'src/shared/ui/l.js': { units: ['up'] }, 'src/shared/ui/m.js': { units: [ls] } } } }),
    });
    assert.deepStrictEqual(p1b.bindings.us.needsDecision.map((b) => b.names), [['level']]);
    assert.ok(!JSON.stringify(p1b.modules).includes('"level"'), 'a binding that needs a decision stays');
  }

  // 2. A non-inert `let` in a ui/ module is split, unless a load-time comment marks it.
  {
    const { root: r, L } = topicRoot(['  let flag = 0;', '  flag = 1;', '  let seen = flag;'], NONE);
    const lf = L.us['flag = 1;'];
    const p2 = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [lf, 'seen'] } } } }) });
    const x = modOf(p2, 'src/us/ui/x.js');
    assert.deepStrictEqual(x.splits, [{ name: 'seen', label: statementLabel('seen = flag;') }]);
    assert.deepStrictEqual(x.wiring, [{ name: 'wireX', statements: { us: [lf, statementLabel('seen = flag;')] } }]);
    const marked = topicRoot(['  let flag = 0;', '  flag = 1;', '  // load-time: x', '  let seen = flag;'], NONE);
    const lf2 = marked.L.us['flag = 1;'];
    const p2b = planExtraction(marked.root, { topics: topicsOf({ us: { modules: { 'src/us/ui/x.js': { units: [lf2, 'seen'] } } } }) });
    const x2 = modOf(p2b, 'src/us/ui/x.js');
    assert.ok(!('splits' in x2), 'a marked initializer moves as is');
    assert.deepStrictEqual(x2.wiring, [{ name: 'wireX', statements: { us: [lf2] } }]);
  }

  // 3. A non-inert initializer that cannot be split throws.
  {
    const fLines = ['  function f() {', '    return 1;', '  }'];
    const { root: r } = topicRoot([...fLines, '  const k = f();'], NONE);
    const at = (p) => topicsOf({ us: { modules: { [p]: { units: ['f', 'k'] } } } });
    assert.throws(() => planExtraction(r, { topics: at('src/us/ui/k.js') }), /non-inert initializer of k needs a load-time comment or a split/);
    assert.throws(() => planExtraction(r, { topics: at('src/us/core/k.js') }), /non-inert initializer of k needs a load-time comment or a split/);
    const two = topicRoot([...fLines, '  let a = f(), b = 2;'], NONE);
    assert.throws(
      () => planExtraction(two.root, { topics: topicsOf({ us: { modules: { 'src/us/ui/k.js': { units: ['f', 'a, b'] } } } }) }),
      /non-inert initializer of a needs a load-time comment or a split/,
    );
    const ok = topicRoot([...fLines, '  // load-time: f reads nothing', '  const k = f();'], NONE);
    assert.doesNotThrow(() => planExtraction(ok.root, { topics: at('src/us/ui/k.js') }));
    const okCore = planExtraction(ok.root, { topics: at('src/us/core/k.js') });
    assert.deepStrictEqual(modOf(okCore, 'src/us/core/k.js').units.us, ['f', 'k']);
  }

  // 4. Seam sides: a name whose target is ui/ in either country has a ui facade, and a shared unit using it is ui.
  {
    const region = ['  // @@shared:user begin', '  function useR() {', '    return R() + 1;', '  }', '  // @@shared:user end'];
    const usLines = ["import { helperUi } from './ui/thing.js';", ...region, '  function R() {', '    return helperUi();', '  }'];
    const caLines = [...region, '  function R() {', '    return 1;', '  }'];
    const p4 = planOf(usLines, caLines, { seam: ['R'] }, { 'src/us/ui/thing.js': 'export const helperUi = () => 2;\n' });
    assert.deepStrictEqual(p4.seamSides, { R: 'ui' });
    const user = p4.modules.find((m) => m.owner === 'shared' && m.units.us.includes('useR'));
    assert.ok(user && user.path.startsWith('src/shared/ui/') && user.ui, 'the shared unit using a ui seam name is ui in both planners');
    // Names that are core in both countries keep core facades.
    assert.deepStrictEqual(planOf(seamUs, seamCa, { seam: ['taxFor'] }, seamFiles).seamSides, { taxFor: 'core' });
    assert.deepStrictEqual(planOf(pureLines, pureLines, { seam: ['foo'] }, fooFacades).seamSides, { foo: 'core' });
    // A name an earlier run exported through ui facades.
    const uiFacades = {
      'src/us/ui/seam-foo.js': "export { foo } from './foo.js';\n",
      'src/canada/ui/seam-foo.js': "export { foo } from './foo.js';\n",
    };
    assert.deepStrictEqual(planOf(pureLines, pureLines, { seam: ['foo'] }, uiFacades).seamSides, { foo: 'ui' });
  }

  // 5. The design section 2 cycle in miniature: accepted, recorded, one batch.
  const viewCycle = (withCore) => [
    '  // @@shared:view begin',
    '  function setView(v) {',
    '    document.body.dataset.v = v;',
    '    render();',
    '  }',
    '  // @@shared:view end',
    '  const Q = { go: () => setView(1) };',
    ...(withCore ? ['  const T = { q: Q };'] : []),
    '  function render() {',
    `    document.title = String(${withCore ? 'T.q' : 'Q'}.go);`,
    '  }',
  ];
  {
    const p5 = planOf(viewCycle(false), viewCycle(false), { seam: ['render'] });
    assert.strictEqual(p5.seamSides.render, 'ui');
    assert.strictEqual(p5.uiCycles.length, 1, 'one accepted cycle');
    const cyc = p5.uiCycles[0];
    assert.ok(cyc.length >= 2 && cyc.every((q) => modOf(p5, q)), 'the cycle names planned modules');
    assert.ok(cyc.some((q) => modOf(p5, q).owner === 'shared') && cyc.some((q) => modOf(p5, q).owner === 'us'));
    assert.strictEqual(new Set(cyc.map((q) => modOf(p5, q).batch)).size, 1, 'every module of the cycle has the same batch');
    assert.strictEqual(new Set(cyc.map((q) => modOf(p5, q).depth)).size, 1, 'and the same depth');
    assert.deepStrictEqual(countryUnits(p5, 'us').sort(), ['Q', 'render']);
    // No accepted cycle, no splits: the keys are left out.
    assert.ok(!('uiCycles' in plan) && plan.modules.every((m) => !('splits' in m)));
    // Two topics modules of one country that import each other, all ui: both keep their paths, one batch.
    const { root: r } = topicRoot(
      ['  function f(n) {', '    document.title = n;', '    return g(n);', '  }', '  function g(n) {', '    document.title = n;', '    return f(n);', '  }'],
      NONE,
    );
    const p5b = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/a.js': { units: ['f'] }, 'src/us/ui/b.js': { units: ['g'] } } } }) });
    assert.deepStrictEqual(modOf(p5b, 'src/us/ui/a.js').units.us, ['f']);
    assert.deepStrictEqual(modOf(p5b, 'src/us/ui/b.js').units.us, ['g']);
    assert.strictEqual(modOf(p5b, 'src/us/ui/a.js').batch, modOf(p5b, 'src/us/ui/b.js').batch);
    assert.deepStrictEqual(p5b.uiCycles, [['src/us/ui/a.js', 'src/us/ui/b.js']]);
  }

  // 6. The same cycle with one core unit (T, a plain object) still throws.
  assert.throws(() => planOf(viewCycle(true), viewCycle(true), { seam: ['render'] }), /module cycle across owners/);

  // 6b. Fix B (design 5.3): with a topics file the cycle condition is on modules, not units. A module of the cycle that holds
  // a plain `let` (inert initializer, not a ui unit) is accepted when its topics path is under ui/, and throws under core/.
  {
    const usView = [
      '  // @@shared:view begin',
      '  function setView(v) {',
      '    document.body.dataset.v = v;',
      '    render();',
      '  }',
      '  // @@shared:view end',
      '  let mode = 0;',
      '  const Q = { go: () => { mode = 1; return setView(1); } };',
      '  function render() {',
      '    document.title = String(Q.go);',
      '  }',
    ];
    const { root: r } = topicRoot(usView, viewCycle(false));
    const topics = (qPath) =>
      topicsOf({ us: { modules: { [qPath]: { units: ['mode', 'Q'] }, 'src/us/ui/render.js': { units: ['render'] } } } });
    const p6 = planExtraction(r, { topics: topics('src/us/ui/q.js'), seam: ['render'] });
    assert.deepStrictEqual(modOf(p6, 'src/us/ui/q.js').units.us, ['mode', 'Q'], 'the let stays in its ui/ topics module');
    assert.deepStrictEqual(p6.bindings.us.needsDecision, []);
    assert.strictEqual(p6.uiCycles.length, 1, 'one accepted cycle');
    const cyc6 = p6.uiCycles[0];
    assert.ok(cyc6.includes('src/us/ui/q.js') && cyc6.includes('src/us/ui/render.js'), 'the cycle names both topics modules');
    assert.ok(cyc6.some((q) => modOf(p6, q).owner === 'shared'), 'and the shared module');
    assert.strictEqual(new Set(cyc6.map((q) => modOf(p6, q).batch)).size, 1, 'every module of the cycle has the same batch');
    // The same topics file with the let's module under core/: throws.
    assert.throws(() => planExtraction(r, { topics: topics('src/us/core/q.js'), seam: ['render'] }), /module cycle across owners/);
  }
  {
    // Two topics modules of one country that import each other, one holding a plain `let`: both ui/ accepted, core/ throws.
    const { root: r } = topicRoot(
      [
        '  function f(n) {',
        '    document.title = n;',
        '    return g(n);',
        '  }',
        '  let count = 0;',
        '  function g(n) {',
        '    count++;',
        '    return f(n);',
        '  }',
      ],
      NONE,
    );
    const topics = (bPath) => topicsOf({ us: { modules: { 'src/us/ui/a.js': { units: ['f'] }, [bPath]: { units: ['count', 'g'] } } } });
    const p6c = planExtraction(r, { topics: topics('src/us/ui/b.js') });
    assert.deepStrictEqual(modOf(p6c, 'src/us/ui/a.js').units.us, ['f']);
    assert.deepStrictEqual(modOf(p6c, 'src/us/ui/b.js').units.us, ['count', 'g']);
    assert.strictEqual(modOf(p6c, 'src/us/ui/a.js').batch, modOf(p6c, 'src/us/ui/b.js').batch);
    assert.deepStrictEqual(p6c.uiCycles, [['src/us/ui/a.js', 'src/us/ui/b.js']]);
    assert.throws(() => planExtraction(r, { topics: topics('src/us/core/b.js') }), /topics modules src\/us\/ui\/a\.js and src\/us\/core\/b\.js import each other|topics modules src\/us\/core\/b\.js and src\/us\/ui\/a\.js import each other/);
  }

  // 7. An auto-named module never takes a topics path.
  {
    const { root: r, L } = topicRoot(['  function paint() {', "    document.title = 'x';", '  }', LOG('a')], NONE);
    const p7 = planExtraction(r, { topics: topicsOf({ us: { modules: { 'src/us/ui/paint.js': { units: [L.us[logs('a')]] } } } }) });
    assert.deepStrictEqual(modOf(p7, 'src/us/ui/paint.js').units.us, [L.us[logs('a')]]);
    assert.deepStrictEqual(modOf(p7, 'src/us/ui/paint-2.js').units.us, ['paint']);
  }

  // 8. The command line: an unknown or space-separated argument exits 2 before any planning; an error is one line, no
  // stack trace.
  {
    const { spawnSync } = require('child_process');
    const cli = path.join(__dirname, '..', 'scripts', 'plan-extraction.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-cli-'));
    made.push(dir);
    const topicsFile = path.join(dir, 'topics.json');
    fs.writeFileSync(topicsFile, '{}');
    for (const args of [['--topics', topicsFile], ['--bogus'], ['extra'], ['--max-layer'], ['--max-batch=x'], ['--core-only=1']]) {
      const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
      assert.strictEqual(r.status, 2, `exit 2 for ${args.join(' ')} (stderr: ${r.stderr.slice(0, 200)})`);
      assert.strictEqual(r.stdout, '', `no plan printed for ${args.join(' ')}`);
      assert.ok(/usage: node scripts\/plan-extraction\.js/.test(r.stderr), r.stderr);
    }
    const missing = spawnSync(process.execPath, [cli, `--topics=${path.join(dir, 'missing.json')}`], { encoding: 'utf8' });
    assert.strictEqual(missing.status, 1, missing.stderr);
    assert.ok(/^plan-extraction failed: .*missing\.json/.test(missing.stderr), missing.stderr);
    assert.ok(!/\n\s+at /.test(missing.stderr), `no stack trace: ${missing.stderr}`);
  }

  console.log('extraction_plan OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
