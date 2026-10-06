// Prints the historical-backtest and Monte Carlo success rates for a few fixed
// scenarios, so a change to the historical engine can be reported as a
// before/after table (docs/next-batches-plan.md, "Before/after report").
// Monte Carlo paths use a seeded RNG in place of Math.random, so the numbers
// repeat exactly. Not part of `npm test`.
//
//   node tests/historical_rates.js [--root DIR] [--paths 2000] [--seed 7]
//   (--root: a `git worktree` of the "before" ref)

const { chromium } = require('playwright');
const path = require('path');
const { legacyToAccounts } = require('./legacy_balances');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const PATHS = Number(opt('--paths', 2000)), SEED = Number(opt('--seed', 7));

// Patches over each planner's defaults. 'default' is the stock scenario.
const RICH = { taxable: 1600000, traditional: 2400000, roth: 600000, cash: 90000 };
const SCENARIOS = {
  default: {},
  'early retiree': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 1100000, traditional: 1400000, roth: 300000, cash: 80000, spending: 90000 },
  'early retiree, smooth': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 1100000, traditional: 1400000, roth: 300000, cash: 80000, spending: 90000, smoothWithdrawals: true },
  'early retiree, live mix (US)': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 1100000, traditional: 1400000, roth: 300000, cash: 80000, spending: 90000, withdrawalMixEnabled: true, onlyUS: true },
  'low-MAGI early retiree, expansion state (CA)': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 150000, traditional: 0, roth: 1800000, cash: 250000, spending: 60000, stateTax: 'ca', acaEnabled: true, healthcare: 18000, onlyUS: true },
  'low-MAGI early retiree, non-expansion state (TX)': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 150000, traditional: 0, roth: 1800000, cash: 250000, spending: 60000, stateTax: 'tx', acaEnabled: true, healthcare: 18000, onlyUS: true },
  'single, retired at 62, LTC years (O2)': { singlePerson: true, ageA: 62, retireAgeA: 62, lifeExpectancyA: 95, taxable: 600000, traditional: 1200000, roth: 200000, cash: 60000, spending: 60000, ltcEnabled: true, onlyUS: true },
  'PA early retiree, 401(k) and IRA (O3)': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, stateTax: 'pa', taxable: 300000, cash: 80000, spending: 90000, tradIraA: 300000, trad401kA: 500000, tradIraB: 200000, trad401kB: 500000, rothIraA: 100000, rothIraB: 100000, rothIraBasisA: 100000, rothIraBasisB: 100000, roth401kA: 0, roth401kB: 0, onlyUS: true },
  'working, then retires, bondYears 4': { bondYears: 4 },
  'survivor, A dies at 70': { ...RICH, ageA: 62, ageB: 60, retireAgeA: 62, retireAgeB: 60, lifeExpectancyA: 95, lifeExpectancyB: 95, spending: 110000, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 70, survivorSpendingPct: 70 },
  'survivor, B dies at 75, early': { ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 1100000, traditional: 1400000, roth: 300000, cash: 80000, spending: 90000, survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 75, survivorSpendingPct: 70 },
};

(async () => {
  const browser = await chromium.launch();
  for (const [key, file] of [['US', 'Planner_US.html'], ['Canada', 'Planner_Canada.html']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + path.join(ROOT, file));
    await page.waitForTimeout(300);
    for (const [name, patch0] of Object.entries(SCENARIOS)) {
      const { onlyUS, ...patch } = patch0;
      if (onlyUS && key !== 'US') continue;
      const out = await page.evaluate(({ patch, PATHS, SEED, convert }) => {
        const state = window.__test_getState();
        if (!window.__base) window.__base = JSON.parse(JSON.stringify(state));
        for (const k of Object.keys(state)) delete state[k];
        // The scenarios use the old pooled retirement fields; a planner with per-partner accounts gets the equivalent.
        const toAccounts = eval('(' + convert + ')');
        Object.assign(state, JSON.parse(JSON.stringify(window.__base)), window.__base.trad401kA !== undefined ? toAccounts(patch, window.__base) : patch);
        const real = Math.random;
        let a = SEED | 0;
        Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const h = window.__test_runHistoricalCycles(), m = window.__test_runMonteCarlo(PATHS);
        Math.random = real;
        return { hist: h.successRate, cycles: h.cycles.length, mc: m.successRate };
      }, { patch, PATHS, SEED, convert: legacyToAccounts.toString() });
      console.log(`${key.padEnd(7)} ${name.padEnd(36)} historical ${(out.hist * 100).toFixed(1).padStart(5)}% (${out.cycles} cycles)   Monte Carlo ${(out.mc * 100).toFixed(1).padStart(5)}% (${PATHS} paths, seed ${SEED})`);
    }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
