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
      /core/,
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

  console.log('extraction_plan OK');
} finally {
  made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}
