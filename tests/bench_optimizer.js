// Performance baseline of the multi-lever optimizer (Batch 5 step 0; the plan's step 1): times `optimizeMultiLever`
// (Roth + mix + smooth, as the analysis card runs it) on representative US households at an evaluation budget, and
// prints the evaluations it used, whether it hit the budget, the per-evaluation time, the lever windows it searched
// (cut at ROTH_PER_YEAR_MAX_WINDOW) and one sweep's size (the evaluations of one pass over every coordinate from one
// start; the search runs 6 starts x 2 smooth settings, up to 5 passes each). --root DIR times another build (for
// example one with a different window cap). Not a gate; not in `npm test`.
// --objective endValue|lifetimeCost (default endValue) is the objective the optimizer scores by (Batch 5 step 2).
// Usage: node tests/bench_optimizer.js [--root DIR] [--budget 8000] [--rounds 1] [--objective endValue|lifetimeCost]
const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const { pathToFileURL } = require('url');
const { legacyToAccounts } = require('./legacy_balances');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const BUDGET = Number(opt('--budget', 8000));
const ROUNDS = Number(opt('--rounds', 1));
const OBJECTIVE = opt('--objective', 'endValue');
if (OBJECTIVE !== 'endValue' && OBJECTIVE !== 'lifetimeCost') throw new Error(`--objective must be endValue or lifetimeCost, got ${OBJECTIVE}`);

const gap = (p, acct) => ({ ...p, rothConvEnabled: true, rothConvStartAge: p.ageA, rothConvEndAge: 74, ...legacyToAccounts(acct, p) });
// The gap cases of tests/solver_gap.js at the planner's own life expectancy (100), plus the 3C optimizer re-run's households.
const SCENARIOS = [
  { name: 'Default', p: {} },
  { name: 'Default, conversions on', p: { rothConvEnabled: true } },
  { name: 'ACA early retiree (CA)', p: { retireAgeA: 50, retireAgeB: 50, ageA: 50, ageB: 50, acaEnabled: true, stateTax: 'ca' } },
  { name: 'early ACA single (TX), to 100', p: gap({ singlePerson: true, ageA: 55, retireAgeA: 55, acaEnabled: true, stateTax: 'tx', spending: 60000, taxable: 600000 }, { traditional: 1200000, roth: 100000 }) },
  { name: 'couple 62, IRMAA (CA), to 100', p: gap({ singlePerson: false, ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, stateTax: 'ca', spending: 110000, taxable: 800000 }, { traditional: 2500000, roth: 200000 }) },
  { name: 'couple 58, trad-heavy, ACA (NY), to 100', p: gap({ singlePerson: false, ageA: 58, ageB: 58, retireAgeA: 58, retireAgeB: 58, acaEnabled: true, stateTax: 'ny', spending: 90000, taxable: 200000 }, { traditional: 2000000, roth: 50000 }) },
];
const ROTH_CANDIDATES = 7, MIX_CANDIDATES = 8; // ROTH_PER_YEAR_CANDIDATES, WITHDRAWAL_MIX_CANDIDATES

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto(pathToFileURL(plannerPath('Planner_US.html', ROOT)).href);
  await page.waitForTimeout(300);
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  console.log(`Budget ${BUDGET}, ${ROUNDS} round(s), median seconds, objective ${OBJECTIVE}\n`);
  console.log('| Scenario | Shipped score | Optimizer score | Gain (today dollars) | Evaluations | Seconds | ms / evaluation | Roth / mix years searched (of) | One sweep | Plan years |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of SCENARIOS) {
    const out = await page.evaluate(({ patch, BUDGET, ROUNDS, OBJECTIVE }) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      try {
        Object.assign(st, patch, { withdrawalMixEnabled: false, cliffGuardEnabled: true });
        const shipped = window.__test_simulate();
        window.__test_setOptimizerBudget(BUDGET);
        const secs = [];
        let r;
        for (let i = 0; i < ROUNDS; i++) {
          const t0 = performance.now();
          r = window.__test_optimizeMultiLever(shipped, { includeRoth: true, includeMix: true, includeSmooth: true }, OBJECTIVE);
          secs.push((performance.now() - t0) / 1000);
        }
        secs.sort((a, b) => a - b);
        const mixFull = (st.singlePerson ? st.lifeExpectancyA : Math.max(st.lifeExpectancyA, st.lifeExpectancyB)) - (st.singlePerson ? st.retireAgeA : Math.min(st.retireAgeA, st.retireAgeB)) + 1;
        return {
          shipped: window.__test_objectiveScore(OBJECTIVE, shipped), score: r.score, gain: r.gain, evals: r.evalCount, hit: r.budgetExhausted, secs: secs[Math.floor(ROUNDS / 2)],
          roth: r.rothYears.length, rothFull: st.rothConvEndAge - st.rothConvStartAge + 1, mix: r.mixYears.length, mixFull, years: shipped.rows.length,
        };
      } finally {
        window.__test_setOptimizerBudget(8000);
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { patch: s.p, BUDGET, ROUNDS, OBJECTIVE });
    const sweep = out.roth * (ROTH_CANDIDATES - 1) + out.mix * (MIX_CANDIDATES - 1);
    console.log(`| ${s.name} | ${fmt(out.shipped)} | ${fmt(out.score)} | ${fmt(out.gain)} | ${out.evals}${out.hit ? ' (budget hit)' : ''} | ${out.secs.toFixed(1)} | ${((out.secs * 1000) / out.evals).toFixed(2)} | ${out.roth} (${out.rothFull}) / ${out.mix} (${out.mixFull}) | ${sweep} | ${out.years} |`);
  }
  await browser.close();
})();
