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
  'working, then retires, bondYears 4': { bondYears: 4 },
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
