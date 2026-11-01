// Replay check scan (Batch 5 follow-ups S1, Task 2f; not in npm test): with the engine's replay check on (ctx.test.replayCheck,
// window.__test_replayCheck), every replayed pass (R2-R6 of the site table in docs/architecture/magi-iteration.md), every forced
// pass and every seeded phase's first pass (P1-P5, S1, P4) is compared with its source: the IRMAA holds entering the pass, and the
// conversion and MAGI it realizes (Object.is). It runs, through the uncached paths (each household re-plans: the store's
// simulate and refreshCliffPlan caches would count nothing):
//   snap   every US snapshot scenario (tests/snapshot_scenarios.js): its plan, then the fresh run;
//   grid   the conversion_sizing grid (tests/unit/helpers/scan-grid.mjs, conversions on, default order): refreshCliffPlan, the run;
//   lever  the same grid's two-return and MFJ couples at 62 and 66 with the withdrawal toggle on (the order and split levers);
//   plans  the phased fixtures of the plan tests (plan-search, order-lever, two-return-split, split-order-floor, gains-capped,
//          stored-plan), rebuilt here: the plan (the toggle on and off), choose with both levers and the apply run of what it
//          recorded, and Optimize on two of them;
//   scan   (with --scan N) the first N solver_scan households (tests/unit/helpers/scan-grid.mjs, conversions on), both modes.
// It prints replayMismatch and every replayChecked* count per set, and exits 1 on a mismatch (or a page error).
//
//   node tests/replay_check.js [--root DIR] [--sets snap,grid,lever,plans] [--scan N]
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const { plannerPath } = require('./helpers/planner-path');
const { scenarios } = require('./snapshot_scenarios.js');
const { legacyToAccounts } = require('./legacy_balances.js');
const H = require('./helpers/plan-households.js');

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const SCAN = Number(opt('--scan', 0));
const SETS = opt('--sets', 'snap,grid,lever,plans' + (SCAN ? ',scan' : '')).split(',');

const RUNNER = `(() => {
  const state = window.__test_getState();
  const base = JSON.parse(JSON.stringify(state));
  const legacyToAccounts = ${legacyToAccounts.toString()};
  const resetTo = (patch, legacy) => {
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(legacy ? legacyToAccounts(patch, base) : patch)));
    window.__test_setRothOverride(null);
    window.__test_setWithdrawalMixOverride(null);
  };
  // The cliff plan's one shape (src/us/core/cliff-plan/plan-shape.js makePlan), keys in PLAN_KEYS order.
  const makePlan = (f) => ({ intents: f.intents || {}, family: f.family || 'none', bracket: f.bracket == null ? null : f.bracket, bracketFrom: f.bracketFrom == null ? null : f.bracketFrom, orders: f.orders || null, splits: f.splits || null, levers: f.levers || null, mult: null, orderPhases: null, conv: null });
  const replan = () => window.__test_replayCheck(true, false); // drops the plan store and cache, keeps the counters
  const fail = (e) => ({ error: String((e && e.message) || e) });
  window.__rc = {
    snap: (batch) => batch.map((sc) => {
      try {
        resetTo(sc.patch, true);
        replan();
        if (sc.kind === 'std') {
          const a = state.retireAgeA + sc.shift, b = state.retireAgeB + sc.shift;
          window.__test_simulate(a, b);
          window.__test_simulateRaw(a, b);
        } else {
          const fn = window.__test_rowFnFor(sc.series);
          window.__test_simulateHistorical(fn);
          window.__test_simulateHistoricalRaw(fn);
        }
        return null;
      } catch (e) { return fail(e); }
    }),
    grid: (patches) => patches.map((patch) => {
      try {
        resetTo(patch, false);
        replan();
        window.__test_refreshCliffPlan();
        window.__test_simulateRaw();
        return null;
      } catch (e) { return fail(e); }
    }),
    plans: (items) => items.map(({ patch, optimize }) => {
      try {
        for (const mix of [patch.withdrawalMixEnabled === true, !(patch.withdrawalMixEnabled === true)]) {
          resetTo({ ...patch, withdrawalMixEnabled: mix }, false);
          replan();
          window.__test_refreshCliffPlan();
          window.__test_simulateRaw();
        }
        resetTo(patch, false);
        replan();
        const from = state.rothConvBracket;
        const chosen = window.__test_runPlanMode({ planMode: 'choose', plan: makePlan({ bracket: from, bracketFrom: from, levers: { order: true, split: true } }) });
        window.__test_runPlanMode({ planMode: 'apply', plan: makePlan({ bracket: from, bracketFrom: from, intents: chosen.intents || {}, orders: chosen.orderIntents, splits: chosen.splitIntents }) });
        if (optimize) window.__test_optimizePlan('endValue', null);
        return null;
      } catch (e) { return fail(e); }
    }),
  };
  return true;
})()`;

(async () => {
  const t0 = Date.now();
  const { scanHouseholds, GAP_CASES } = await import(pathToFileURL(path.resolve(__dirname, 'unit/helpers/scan-grid.mjs')).href);
  const gridOf = (o) => scanHouseholds(o);
  const findGrid = (mode, filing, age, trad, taxable, spending, elections, conv) =>
    scanHouseholds({ conversions: conv, mode }).find((x) => x.g.filing === filing && x.g.age === age && x.g.trad === trad && x.g.taxable === taxable && x.g.spending === spending && x.g.elections === elections).patch;
  const gap = (name, life) => GAP_CASES.find((g) => g.name === name).patch(life, life);
  // The plan tests' phased fixtures (see the file names in each entry).
  const PLANS = [
    // plan-search.test.js
    ...[100, 75].flatMap((life) => GAP_CASES.map((g) => ['plan-search ' + g.name + ' ' + life, gap(g.name, life)])),
    ['plan-search SINGLE52', findGrid('default', 'single-person', 52, 1500000, 300000, 60000, 'none', true), true],
    ['plan-search SINGLE52 bondYears 6', { ...findGrid('default', 'single-person', 52, 1500000, 300000, 60000, 'none', true), bondYears: 6 }],
    ['plan-search COUPLE58', findGrid('default', 'single-couple', 58, 1500000, 300000, 130000, 'sepp', true), true],
    ['plan-search COUPLE62', findGrid('default', 'single-couple', 62, 1500000, 2000000, 130000, 'none', true)],
    // order-lever.test.js
    ['order-lever ORDER_DROP', H.ORDER_DROP],
    ['order-lever ORDER_H1', H.ORDER_H1],
    ['order-lever ORDER_H2', H.ORDER_H2],
    ['order-lever ORDER_H3', H.ORDER_H3],
    ['order-lever ORDER_H4', H.ORDER_H4],
    ['order-lever HoH 52', findGrid('default', 'hoh', 52, 1500000, 2000000, 130000, 'none', true)],
    // two-return-split.test.js
    ['two-return-split SPLIT_H1', H.SPLIT_H1],
    ['two-return-split SPLIT_H1 110k', { ...H.SPLIT_H1, spending: 110000 }],
    ['two-return-split SPLIT_ML', H.SPLIT_ML],
    ['two-return-split SPLIT_CONV', H.SPLIT_CONV],
    ['two-return-split SPLIT_H1 ACA', { ...H.SPLIT_H1, acaEnabled: true }],
    ['two-return-split 58 1500k 300k 130k none', findGrid('default', 'single-couple', 58, 1500000, 300000, 130000, 'none', false)],
    ['two-return-split 58 1500k 2000k 130k none', findGrid('default', 'single-couple', 58, 1500000, 2000000, 130000, 'none', false)],
    ['two-return-split 58 1500k 2000k 130k rule55', findGrid('default', 'single-couple', 58, 1500000, 2000000, 130000, 'rule55', false)],
    ['two-return-split 58 1500k 300k 130k sepp conv', findGrid('default', 'single-couple', 58, 1500000, 300000, 130000, 'sepp', true)],
    // split-order-floor.test.js
    ['split-order-floor 52 sepp conv', findGrid('default', 'single-couple', 52, 1500000, 2000000, 130000, 'sepp', true)],
    ['split-order-floor smooth 62 conv', findGrid('smooth', 'single-couple', 62, 1500000, 2000000, 130000, 'none', true)],
    ['split-order-floor smooth 58 rule55 conv', findGrid('smooth', 'single-couple', 58, 500000, 2000000, 130000, 'rule55', true)],
    ['split-order-floor 52 60k off', findGrid('default', 'single-couple', 52, 500000, 300000, 60000, 'none', false)],
    ['split-order-floor 52 60k conv', findGrid('default', 'single-couple', 52, 500000, 300000, 60000, 'none', true)],
    ['split-order-floor mfj 58 rule55 conv', findGrid('default', 'mfj', 58, 1500000, 2000000, 130000, 'rule55', true)],
    ['split-order-floor smooth 52 sepp conv', findGrid('smooth', 'single-couple', 52, 1500000, 2000000, 130000, 'sepp', true)],
    // gains-capped.test.js
    ['gains-capped TX', gap('early ACA single (TX)', 100)],
    ...scanHouseholds().filter((_, i) => i % 16 === 0).slice(0, 8).map((h) => ['gains-capped grid ' + h.name, h.patch]),
    // stored-plan.test.js
    ['stored-plan CA', { ...gap('couple 62, IRMAA (CA)', 100), bondYears: 0 }],
    ['stored-plan CA150', { ...gap('couple 62, IRMAA (CA)', 100), bondYears: 0, spending: 150000 }],
    ['stored-plan CA140', { ...gap('couple 62, IRMAA (CA)', 100), bondYears: 0, spending: 140000 }],
    ['stored-plan NY', gap('couple 58, trad-heavy, ACA (NY)', 100)],
    ['stored-plan BROKE_TRAD', { ageA: 48, ageB: 43, retireAgeA: 48, retireAgeB: 43, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 300000, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, tenure: 'own', homeValue: 450000, mortgagePrincipal: 300000, mortgage: 300000, rothConvEnabled: true, rothConvStartAge: 48, rothConvEndAge: 74, spending: 30000 }],
  ];
  const sets = {
    snap: () => scenarios(true).map((sc) => ({ name: sc.name, x: sc })),
    grid: () => gridOf({ conversions: true, mode: 'default' }).map((h) => ({ name: h.name, x: h.patch })),
    lever: () => gridOf({ conversions: true, mode: 'default' }).filter((h) => (h.g.filing === 'single-couple' || h.g.filing === 'mfj') && (h.g.age === 62 || h.g.age === 66)).map((h) => ({ name: h.name + '; toggle on', x: { ...h.patch, withdrawalMixEnabled: true } })),
    plans: () => PLANS.map(([name, patch, optimize]) => ({ name, x: { patch, optimize: !!optimize } })),
    scan: () => ['default', 'smooth'].flatMap((mode) => gridOf({ conversions: true, mode }).slice(0, SCAN).map((h) => ({ name: mode + ': ' + h.name, x: h.patch }))),
  };
  const fnOf = { snap: 'snap', grid: 'grid', lever: 'grid', plans: 'plans', scan: 'grid' };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForFunction(() => typeof window.__test_replayCheck === 'function');
  await page.evaluate(RUNNER);
  let bad = false;
  for (const set of SETS) {
    const items = sets[set]();
    await page.evaluate(() => { window.__test_replayCheck(true, true); });
    const runErrors = [];
    const CHUNK = set === 'plans' ? 2 : 20;
    for (let i = 0; i < items.length; i += CHUNK) {
      const b = items.slice(i, i + CHUNK);
      const r = await page.evaluate(({ fn, xs }) => window.__rc[fn](xs), { fn: fnOf[set], xs: b.map((it) => it.x) });
      r.forEach((e, j) => { if (e) runErrors.push(b[j].name + ': ' + e.error); });
    }
    const st = await page.evaluate(() => {
      const h = window.__test_replayCheck(false, false), out = {};
      for (const k of Object.keys(h)) if (k === 'replayMismatch' || k.startsWith('replayChecked')) out[k] = h[k];
      out.last = h.replayMismatchLast;
      return out;
    });
    const counts = Object.keys(st).filter((k) => k.startsWith('replayChecked')).map((k) => `${k.slice('replayChecked'.length)} ${st[k]}`).join(', ');
    console.log(`${set}: ${items.length} items, replayMismatch ${st.replayMismatch}; checked: ${counts}`);
    if (st.replayMismatch) console.log('  last mismatch: ' + JSON.stringify(st.last));
    if (runErrors.length) console.log('  run errors:\n    ' + runErrors.slice(0, 10).join('\n    '));
    if (st.replayMismatch || runErrors.length) bad = true;
  }
  await browser.close();
  if (errors.length) {
    console.error('page errors: ' + errors.join('; '));
    bad = true;
  }
  console.log(`replay_check: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (bad) {
    console.error('FAIL: a replayed, forced or seeded pass did not repeat its source');
    process.exit(1);
  }
  console.log('OK: every replayed, forced and seeded pass repeated its source');
})();
