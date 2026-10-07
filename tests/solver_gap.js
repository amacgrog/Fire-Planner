// Gap table (Batch 3C, spec sections 7 and 13.3): the shipped engine (cliff guard on, default withdrawal order,
// the bracket conversion: `withdrawalMixEnabled: false`, `cliffGuardEnabled: true`) against a slow reference, the
// multi-lever coordinate ascent (per-year Roth bracket, per-year withdrawal mix, smooth on/off) with a
// 200,000-evaluation budget, on short plans (life expectancy 75) so the reference finishes. Objective: the
// optimizer's own, lifetime real tax + healthcare (`rothScheduleCost`). A positive gap means the shipped engine
// costs more than the reference: the room Batch 5's outer search has to win back. Each case converts at the
// plan's bracket setting (22%) from now to 74 in the shipped run; the reference may pick any bracket per year,
// including none, so most of the gap is conversion sizing (Batch 5). The cost objective does not count the tax
// still owed on the traditional balance left at the end; the after-tax end value column (22% haircut on
// traditional, as in tests/solver_scan.js) is printed beside it for that reason. Not a gate; not in `npm test`
// (about a minute). Usage: node tests/solver_gap.js [--root DIR] [--budget 200000]
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const BUDGET = Number(opt('--budget', 200000));

const CASES = [
  { name: 'early ACA single (TX)', p: { singlePerson: true, ageA: 55, retireAgeA: 55, lifeExpectancyA: 75, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 }, acct: { traditional: 1200000, roth: 100000 } },
  { name: 'couple 62, IRMAA (CA)', p: { singlePerson: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, lifeExpectancyA: 75, lifeExpectancyB: 75, stateTax: 'ca', spending: 110000, taxable: 800000 }, acct: { traditional: 2500000, roth: 200000 } },
  { name: 'couple 58, trad-heavy, ACA (NY)', p: { singlePerson: false, ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, lifeExpectancyA: 75, lifeExpectancyB: 75, acaEnabled: true, stateTax: 'ny', spending: 90000, taxable: 200000 }, acct: { traditional: 2000000, roth: 50000 } },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(path.join(ROOT, 'Planner_US.html')).href);
  await page.waitForTimeout(300);
  const fmt = (n) => (n == null ? 'never' : Math.round(n).toLocaleString('en-US'));
  console.log(`| Case | Shipped (guard on) cost | Guard off cost | Reference cost | Gap | After-tax end value, real: shipped / ref | Converted: shipped / ref | Depletion shipped / ref | Ref smooth | Reference evals | Seconds |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const c of CASES) {
    const patch = { ...c.p, rothConvEnabled: true, rothConvStartAge: c.p.ageA, rothConvEndAge: 74, ...legacyToAccounts(c.acct, c.p) };
    const out = await page.evaluate(({ patch, BUDGET }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      const cost = (s) => window.__test_rothScheduleCost(s);
      // Ending after-tax value as in tests/solver_scan.js (every traditional dollar haircut 22%), real (today's dollars),
      // and the sum of the conversions, both read from the run just made (same overrides and settings).
      const valueOf = (s) => {
        const r = s.rows.at(-1), t = window.__test_accountTrace(st.retireAgeA, st.retireAgeB).at(-1);
        return (r.taxable + r.bonds + r.cash + r.roth + r.homeEquity + r.traditional - 0.22 * t.tradPool) / Math.pow(1 + st.inflation / 100, r.year);
      };
      const converted = (s) => s.rows.reduce((a, r) => a + (r.conversionAmount || 0), 0);
      try {
        Object.assign(st, patch, { withdrawalMixEnabled: false, cliffGuardEnabled: true });
        const shipped = window.__test_simulate();
        const shippedValue = valueOf(shipped);
        st.cliffGuardEnabled = false;
        const guardOff = window.__test_simulate();
        st.cliffGuardEnabled = true;
        window.__test_setOptimizerBudget(BUDGET);
        const t0 = performance.now();
        const ref = window.__test_optimizeMultiLever(shipped, { includeRoth: true, includeMix: true, includeSmooth: true });
        const secs = (performance.now() - t0) / 1000;
        // Replay the reference's schedules to read its ending total and depletion age.
        window.__test_setRothOverride(ref.rothSchedule);
        window.__test_setWithdrawalMixOverride(ref.mixSchedule);
        st.smoothWithdrawals = ref.smoothWithdrawals;
        const refSim = window.__test_simulate();
        const refValue = valueOf(refSim);
        return {
          shipped: cost(shipped), guardOff: cost(guardOff), shippedValue, shippedConv: converted(shipped), shippedDep: shipped.depletedAge,
          ref: ref.cost, refReplay: cost(refSim), refValue, refConv: converted(refSim), refDep: refSim.depletedAge, refSmooth: ref.smoothWithdrawals,
          refEvals: ref.evalCount, refBudget: ref.budgetExhausted, secs,
        };
      } finally {
        window.__test_setRothOverride(null);
        window.__test_setWithdrawalMixOverride(null);
        window.__test_setOptimizerBudget(8000);
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch, BUDGET });
    if (Math.abs(out.refReplay - out.ref) > 0.01) console.error(`  ${c.name}: replayed reference cost ${out.refReplay} differs from the optimizer's ${out.ref}`);
    const gap = ((out.shipped / out.ref - 1) * 100).toFixed(2);
    console.log(`| ${c.name} | ${fmt(out.shipped)} | ${fmt(out.guardOff)} | ${fmt(out.ref)} | ${gap}% | ${fmt(out.shippedValue)} / ${fmt(out.refValue)} | ${fmt(out.shippedConv)} / ${fmt(out.refConv)} | ${fmt(out.shippedDep)} / ${fmt(out.refDep)} | ${out.refSmooth ? 'on' : 'off'} | ${out.refEvals}${out.refBudget ? ' (budget hit)' : ''} | ${out.secs.toFixed(0)} |`);
  }
  await browser.close();
})();
