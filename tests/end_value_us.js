// Cliff plan (spec section 5): the ending value counts traditional money net of the income tax it carries, as ten
// slices of the balance on the last year's own return. Hand-computed, 2026 law, inflation 0 (index factor 1).
// Single, 60 -> 61, Texas, 1,000,000 in a traditional IRA, 1,000,000 taxable at 100% basis (spending comes from it,
// no gains), no Social Security, pension, dividends, healthcare or Medicare.
// One slice: 100,000 of ordinary income; standard deduction 16,100 (under 65: no add-on, no senior deduction);
// taxable 83,900; tax 10% x 12,400 + 12% x 38,000 + 22% x 33,500 = 1,240 + 4,560 + 7,370 = 13,170. Ten slices: 131,700.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const PATCH = { singlePerson: true, filingStatus: 'single', marryLater: false, survivorEnabled: false, children: [],
  ageA: 60, retireAgeA: 60, lifeExpectancyA: 61, inflation: 0, medicalInflation: 0, returnRate: 0, bondReturn: 0, hysaRate: 0,
  dividendYield: 0, incomeA: 0, taxable: 1000000, basisRatio: 100, cash: 0, cashReserve: 0, bondYears: 0, spending: 20000,
  tradIraA: 1000000, trad401kA: 0, rothIraA: 0, roth401kA: 0, rothIraBasisA: 0, ssMonthlyA: 0, pensionYearlyA: 0,
  stateTax: 'tx', acaEnabled: false, healthcare: 0, medicareYearly: 0, ltcEnabled: false, rothConvEnabled: false,
  withdrawalMixEnabled: false, smoothWithdrawals: false, guardrailsEnabled: false, cliffGuardEnabled: false,
  tenure: 'rent', rent: 0, incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [], loans: [] };
const COUPLE = { ...PATCH, singlePerson: false, filingStatus: 'mfj', ageB: 60, retireAgeB: 60, lifeExpectancyB: 61, incomeB: 0,
  tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, rothIraBasisB: 0, ssMonthlyB: 0, pensionYearlyB: 0,
  survivorEnabled: true, survivorPartner: 'B', survivorDeathAge: 60 };

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const run = (patch) => page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      const sim = window.__test_simulate();
      return { enumerable: Object.keys(sim).includes('estate'), estate: JSON.parse(JSON.stringify(sim.estate)),
        value: window.__test_afterTaxEndValueUS(sim) };
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, patch);

  const s = await run(PATCH);
  assert.strictEqual(s.enumerable, false, 'estate is not enumerable');
  assert.strictEqual(s.estate.traditional, 1000000);
  assert.strictEqual(s.estate.lastTrad, 0);
  assert.strictEqual(s.estate.lastGain, 0);
  const rest = s.estate.roth + s.estate.taxable + s.estate.cash + s.estate.homeEquity;
  assert(Math.abs(s.value - (rest + 1000000 - 131700)) < 0.01, `single value ${s.value} vs ${rest + 1000000 - 131700}`);

  const c = await run(COUPLE);
  assert.strictEqual(c.estate.profile.filing, 'single', 'survivor return is single');
  // The survivor spends less (survivor spending share), so the balances differ; the tax on the traditional money must not.
  const crest = c.estate.roth + c.estate.taxable + c.estate.cash + c.estate.homeEquity;
  assert(Math.abs(c.value - (crest + 1000000 - 131700)) < 0.01, `survivor value ${c.value} vs ${crest + 1000000 - 131700}`);
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('end_value_us: ok');
})().catch((e) => { console.error(e); process.exit(1); });
