// ACA / IRMAA MAGI includes THIS year's own discretionary withdrawals.
// The premium credit depends on MAGI, MAGI depends on the withdrawals, and the
// withdrawals depend on the premium: each engine iterates the year to a fixed
// point. The checks below are consistency conditions that a one-year-lagged
// estimate cannot satisfy:
//   * every ACA-year's healthcare cost equals acaNetCost() of that same row's
//     own MAGI (to within the $1 convergence tolerance's effect);
//   * the IRMAA surcharge two years on is assessed on the earlier year's full
//     realized MAGI, withdrawals included;
//   * the historical (bucket-strategy) engine obeys the same identities.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(200);
  const set = (id, v) =>
    page.evaluate(
      ({ id, v }) => {
        const e = document.getElementById(id);
        if (e.type === 'checkbox') e.checked = v;
        else e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { id, v },
    );
  const baseFields = [
    ['singlePerson', true],
    ['ageA', 55],
    ['retireAgeA', 55],
    ['lifeExpectancyA', 70],
    ['incomeA', 0],
    ['rent', 0],
    ['taxable', 2000000],
    ['basisRatio', 50],
    ['traditional', 0],
    ['roth', 0],
    ['cash', 0],
    ['bondYears', 0],
    ['dividendYield', 1.5],
    ['returnRate', 5],
    ['inflation', 0],
    ['medicalInflation', 0],
    ['healthcare', 12000],
    ['medicareYearly', 5000],
    ['ssMonthlyA', 0],
    ['stateTax', 'tx'],
    ['acaEnabled', true],
    ['acaEnhanced', false],
    ['ltcEnabled', false],
    ['spending', 50000],
  ];
  for (const [id, v] of translateFieldList(baseFields, true)) await set(id, v);
  await page.waitForTimeout(300);

  // ACA cost == acaNetCost(row's own MAGI) in every pre-65 year, in the
  // projection and in a historical backtest path.
  const acaConsistency = () =>
    page.evaluate(() => {
      const t = window.__test_tax;
      const bad = [];
      const check = (label, rows, hasHealthcare) => {
        let n = 0;
        for (const r of rows) {
          if (r.age >= 65 || r.working) continue;
          n++;
          const want = t.acaNetCost(r.magiProxy, 1, 12000, r.year);
          if (hasHealthcare && Math.abs(r.healthcare - want) > 1.5)
            bad.push(`${label} year ${r.year}: cost ${r.healthcare.toFixed(2)} vs acaNetCost(MAGI ${r.magiProxy.toFixed(0)}) ${want.toFixed(2)}`);
        }
        return n;
      };
      const proj = window.__test_simulate();
      const n = check('projection', proj.rows, true);
      return { bad, n, magis: proj.rows.slice(0, 3).map((r) => Math.round(r.magiProxy)), cost: proj.rows.slice(0, 3).map((r) => Math.round(r.healthcare)) };
    });
  let r = await acaConsistency();
  assert(r.n >= 8, 'precondition: several pre-65 retired years');
  assert.deepStrictEqual(r.bad, [], `ACA cost must match this year's own MAGI:\n${r.bad.join('\n')}`);
  // Year 0 must already include the realized gains from selling shares for
  // spending (a lagged estimate would show dividends only: $30,000).
  assert(r.magis[0] > 30000 + 5000, `year-0 MAGI includes realized gains (${r.magis[0]})`);

  // Same identity when the subsidy cliff is in play (spending high enough that
  // MAGI lands above 400% of poverty): the cost is the full premium, again
  // matching the row's own MAGI.
  await set('spending', 140000);
  await page.waitForTimeout(300);
  r = await acaConsistency();
  assert.deepStrictEqual(r.bad, [], `cliff case:\n${r.bad.join('\n')}`);
  assert(r.cost[0] === 12000, `above the cliff the full premium is owed (${r.cost[0]})`);

  // IRMAA: the surcharge at 65 (year 2 for a 63-year-old) uses year 0's full
  // realized MAGI, withdrawals included.
  for (const [id, v] of [
    ['ageA', 63],
    ['retireAgeA', 63],
    ['spending', 160000],
    ['taxable', 4000000],
    ['basisRatio', 20],
    ['acaEnabled', false],
  ])
    await set(id, v);
  await page.waitForTimeout(300);
  const irmaa = await page.evaluate(() => {
    const rows = window.__test_simulate().rows;
    const t = window.__test_tax;
    return {
      magi0: rows[0].magiProxy,
      surcharge2: rows[2].healthcare - 5000,
      want: t.irmaaSurcharge(rows[0].magiProxy, 'single', 2),
      stale: t.irmaaSurcharge(0, 'single', 2),
    };
  });
  assert(irmaa.want > 0, `precondition: year-0 MAGI (${Math.round(irmaa.magi0)}) is in a surcharge tier`);
  assert(Math.abs(irmaa.surcharge2 - irmaa.want) < 0.01, `IRMAA at 65 follows year-0 realized MAGI (${irmaa.surcharge2} vs ${irmaa.want})`);

  // Historical engine: same two identities along a real market path.
  for (const [id, v] of [
    ['ageA', 55],
    ['retireAgeA', 55],
    ['spending', 50000],
    ['taxable', 2000000],
    ['basisRatio', 50],
    ['acaEnabled', true],
  ])
    await set(id, v);
  await page.waitForTimeout(300);
  const hist = await page.evaluate(() => {
    const t = window.__test_tax;
    const bad = [];
    let checked = 0;
    for (const start of [0, 20, 40, 60]) {
      const res = window.__test_simulateHistorical((y) => window.__test_HIST[start + y]);
      for (const row of res.rows) {
        if (row.age >= 65 || row.working) continue;
        checked++;
        // The historical engine indexes the poverty line, and the premium, with
        // that path's own CPI (cumFactor); this page-level helper no longer has
        // the path's factors, so restate the row in real dollars (inflation is 0
        // here, so year-0 scaling is the 2026 poverty line) and scale back.
        const want = t.acaNetCost(row.magiProxy / row.cumFactor, 1, 12000, 0) * row.cumFactor;
        if (Math.abs(row.healthcare - want) > 1.5 * row.cumFactor)
          bad.push(`start ${start} year ${row.year}: cost ${row.healthcare.toFixed(2)} vs ${want.toFixed(2)} (MAGI ${row.magiProxy.toFixed(0)})`);
      }
    }
    return { bad, checked };
  });
  assert(hist.checked > 20, 'historical paths exercised');
  assert.deepStrictEqual(hist.bad, []);
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  console.log('[US] ACA MAGI-iteration tests passed');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
