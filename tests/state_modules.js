// The shared state modules (plain Node): importable without a DOM, live bindings, assign* setters.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const load = (rel) => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

(async () => {
  // store.js: state, mode, scenarios, compareIds
  const store = await load('src/shared/core/store.js');
  assert.strictEqual(store.state, null, 'state is null until main.js assigns it at startup');
  assert.strictEqual(store.mode, 'real');
  assert.deepStrictEqual(store.scenarios, []);
  assert.ok(store.compareIds instanceof Set);
  const next = { retireAgeA: 50 };
  store.assignState(next);
  assert.strictEqual(store.state, next, 'the live binding follows assignState');
  store.assignMode('nominal');
  assert.strictEqual(store.mode, 'nominal');
  const list = [{ id: 1 }];
  store.assignScenarios(list);
  assert.strictEqual(store.scenarios, list);

  // chart-prefs.js: defaults, live bindings, setters
  const prefs = await load('src/shared/core/chart-prefs.js');
  assert.deepStrictEqual(
    [prefs.chartView, prefs.chartShiftMode, prefs.chartGapPartner, prefs.chartXAxisMode, prefs.logScale,
      prefs.chartExpanded, prefs.chartToolbarCollapsed, prefs.mcPathCount, prefs.lastProjectionView],
    ['3yr', 'together', null, 'ageA', false, false, false, 1000, '3yr'],
  );
  prefs.assignChartView('mc');
  prefs.assignChartShiftMode('gap');
  prefs.assignChartGapPartner('B');
  prefs.assignChartXAxisMode('year');
  prefs.assignLogScale(true);
  prefs.assignChartExpanded(true);
  prefs.assignChartToolbarCollapsed(true);
  prefs.assignMcPathCount(250);
  prefs.assignLastProjectionView('cagr');
  assert.deepStrictEqual(
    [prefs.chartView, prefs.chartShiftMode, prefs.chartGapPartner, prefs.chartXAxisMode, prefs.logScale,
      prefs.chartExpanded, prefs.chartToolbarCollapsed, prefs.mcPathCount, prefs.lastProjectionView],
    ['mc', 'gap', 'B', 'year', true, true, true, 250, 'cagr'],
  );

  // US-only modules
  const taxYear = await load('src/us/core/tax-year.js');
  assert.strictEqual(taxYear.currentYear, new Date().getFullYear());
  taxYear.assignCurrentYear(2031);
  assert.strictEqual(taxYear.currentYear, 2031);

  const { cliffPlanStore } = await load('src/us/core/cliff-plan-store.js');
  assert.deepStrictEqual(cliffPlanStore, {
    plan: null, key: null, report: null, forState: null, year: null, overrides: null, computed: false, searched: false, searchPending: false, computes: 0, stateComputes: 0,
  });

  const { optimizerState, ROTH_PER_YEAR_EVAL_BUDGET } = await load('src/us/core/optimizer-state.js');
  assert.strictEqual(ROTH_PER_YEAR_EVAL_BUDGET, 8000);
  assert.deepStrictEqual(optimizerState, {
    rothBracketByAge: null, withdrawalMixByAge: null, lastMultiLeverRun: null, rothPerYearEvalBudget: 8000,
  });

  const { testHooks } = await load('src/us/core/test-hooks.js');
  assert.deepStrictEqual(testHooks, {
    irmaaInYearCalls: 0, inhTakeCount: 0, testInhForce: null, testInhNoNeedAdj: false, inhNoDrawCalls: 0, testSeCarryAt: null,
    testSeNoSettle: false, testBracketSearchOff: false, splitCheckCalls: 0,
  });

  console.log('state_modules OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
