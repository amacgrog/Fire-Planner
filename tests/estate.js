// After-tax estate and probate fees (Batch 7N, N8).
//
// Probate fee schedules (provincial pages and statutes, retrieved 2026-10-06): Ontario nil to 50,000 then 15 per 1,000 or part of the
// excess (the ontario.ca example: 240,000 -> 2,850); British Columbia (Probate Fee Act) nil to 25,000, 6 per 1,000 from 25,000 to
// 50,000, 14 per 1,000 above; Alberta a step schedule (35 / 135 / 275 / 400 / 525); Saskatchewan 7 per 1,000; Manitoba none (2020);
// Quebec none (notarial will); New Brunswick 200 to 20,000, 5 per 1,000 to 100,000, 15 per 1,000 above; Nova Scotia 1,002.65 at
// 100,000 plus 16.95 per 1,000; Prince Edward Island 400 at 100,000 plus 4 per 1,000; Newfoundland and Labrador 60 plus 0.60 per 100
// above 1,000.
// After-tax estate = final total assets - the tax the RRSP/RRIF and the deemed gains add to the last person's final return - probate.
// The plan's projection does not change (the estate is a non-enumerable field), the meltdown table is ranked by this figure.
//
// Run: node tests/estate.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_Canada.html'));
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => {
    const t = window.__test_tax;
    const st = window.__test_getState();
    const R = t.PROBATE_RULES || t.PROVINCE_RULES;
    const fee = (code, v) => t.probateFee(R[code], v);
    const res = { fee: {} };
    const cases = { on240: ['on', 240000], on50: ['on', 50000], on50001: ['on', 50001], bc100: ['bc', 100000], bc30: ['bc', 30000], bc20: ['bc', 20000], ab100: ['ab', 100000], ab300: ['ab', 300000], ab5: ['ab', 5000], sk500: ['sk', 500000], mb: ['mb', 900000], qc: ['qc', 900000], nb150: ['nb', 150000], nb10: ['nb', 10000], ns200: ['ns', 200000], ns40: ['ns', 40000], pe200: ['pe', 200000], nl100: ['nl', 100000] };
    for (const [k, [c, v]] of Object.entries(cases)) res.fee[k] = fee(c, v);
    // The after-tax estate of a synthetic final state (Ontario, last survivor age 90, 30,000 of income in the last year).
    st.province = 'on';
    st.singlePerson = true;
    const row = { year: 0, age: 90, ageB: null, grossIncome: 30000, total: 0 };
    const mk = (e) => ({ rows: [{ ...row, total: e.traditional + e.taxable + e.roth + e.cash + e.homeEquity }], estate: e });
    const base = { traditional: 0, taxable: 0, taxableBasis: 0, roth: 0, cash: 0, homeEquity: 0 };
    res.tfsa = t.afterTaxEstate(mk({ ...base, roth: 400000 })) - 400000;
    const rrsp = mk({ ...base, traditional: 500000 });
    res.rrspAfter = t.afterTaxEstate(rrsp);
    res.rrspTax = t.personTaxCA(30000 + 500000, 0, 0, 0, 90, 0) - t.personTaxCA(30000, 0, 0, 0, 90, 0);
    const mixed = mk({ ...base, taxable: 300000, taxableBasis: 100000, cash: 20000, homeEquity: 400000, roth: 50000 });
    res.mixedAfter = t.afterTaxEstate(mixed);
    res.mixedTax = t.personTaxCA(30000, 200000, 0, 0, 90, 0) - t.personTaxCA(30000, 0, 0, 0, 90, 0);
    res.mixedProbate = fee('on', 300000 + 20000 + 400000);
    res.mixedTotal = mixed.rows[0].total;
    // A survivor's last year: the whole last-year income is one person's (the review fix), not half of it. BC, age 90, 100,000 of income.
    st.province = 'bc';
    st.singlePerson = false;
    const srow = { year: 0, age: 90, ageB: 88, grossIncome: 100000, total: 150000 };
    const svEstate = { ...base, traditional: 150000, survivor: true };
    res.survivor = t.afterTaxEstate({ rows: [srow], estate: svEstate });
    res.survivorTax = t.personTaxCA(100000 + 150000, 0, 0, 0, 90, 0) - t.personTaxCA(100000, 0, 0, 0, 90, 0);
    // A couple's last year (both alive): half each, as before.
    res.couple = t.afterTaxEstate({ rows: [srow], estate: { ...base, traditional: 150000, survivor: false } });
    res.coupleTax = t.personTaxCA(50000 + 150000, 0, 0, 0, 90, 0) - t.personTaxCA(50000, 0, 0, 0, 90, 0);
    st.province = 'on';
    st.singlePerson = true;
    // The last year's realized gains count at 50% in the final-return base (grossIncome carries them in full): Ontario, age 85, 100,000
    // of last-year income of which 40,000 is gains, 300,000 of RRIF left.
    const grow = { year: 0, age: 85, ageB: null, grossIncome: 100000, total: 300000 };
    res.gainsYear = t.afterTaxEstate({ rows: [grow], estate: { ...base, traditional: 300000, lastGains: 40000 } });
    res.gainsYearTax = t.personTaxCA(80000 + 300000, 0, 0, 0, 85, 0) - t.personTaxCA(80000, 0, 0, 0, 85, 0);
    // The projection itself is untouched: the estate field does not enumerate.
    const sim = window.__test_simulate();
    res.keys = Object.keys(sim).includes('estate');
    res.estateKeys = Object.keys(sim.estate || {});
    // The meltdown table: the recommended bracket has the highest after-tax estate among the plans that do not shorten the portfolio's life.
    Object.assign(st, { singlePerson: false, province: 'on', ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 95, lifeExpectancyB: 95, taxable: 100000, traditional: 1500000, roth: 100000, cash: 30000, spending: 70000, meltdownEnabled: true, meltdownStartAge: 60, meltdownEndAge: 70, meltdownBracket: 20.5 });
    const sim2 = window.__test_simulate();
    const opt = t.computeRothOptimizer(sim2);
    const pool = opt.results.filter((r) => (sim2.depletedAge ? !r.depletedAge || r.depletedAge >= sim2.depletedAge : !r.depletedAge));
    res.opt = { best: opt.best.afterTaxEstate, maxPool: Math.max(...(pool.length ? pool : opt.results).map((r) => r.afterTaxEstate)), n: opt.results.length, hasField: opt.results.every((r) => Number.isFinite(r.afterTaxEstate)), spread: Math.max(...opt.results.map((r) => r.afterTaxEstate)) - Math.min(...opt.results.map((r) => r.afterTaxEstate)) };
    // Lifetime tax in the optimizer table counts the OAS recovery tax (row.tax leaves it out, row.oasClawback carries it).
    Object.assign(st, { singlePerson: false, province: 'on', ageA: 66, ageB: 66, retireAgeA: 66, retireAgeB: 66, lifeExpectancyA: 80, lifeExpectancyB: 80, incomeA: 0, incomeB: 0, taxable: 0, cash: 0, roth: 0, traditional: 2500000, healthcare: 0, ltcEnabled: false, pensionYearlyA: 60000, pensionYearlyB: 60000, pensionStartAgeA: 60, pensionStartAgeB: 60, cppMonthlyA: 1000, cppMonthlyB: 1000, cppStartAgeA: 65, cppStartAgeB: 65, oasMonthlyA: 760, oasMonthlyB: 760, oasStartAgeA: 65, oasStartAgeB: 65, pensionSplitEnabled: false, spending: 180000, meltdownEnabled: true });
    const sim3 = window.__test_simulate();
    const opt3 = t.computeRothOptimizer(sim3);
    const cur3 = opt3.results.find((r) => r.bracket === opt3.currentBracket);
    res.life = {
      table: cur3.lifetimeTax,
      expected: sim3.rows.reduce((a, r) => a + t.displayValue(r.tax + (r.oasClawback || 0) - (r.benefits || 0), r.year), 0),
      clawback: sim3.rows.reduce((a, r) => a + (r.oasClawback || 0), 0),
    };
    return res;
  });
  const f = out.fee;
  near(f.on240, 2850, 1e-9, 'Ontario 240,000 (the ontario.ca example)');
  near(f.on50, 0, 1e-9, 'Ontario nil at 50,000');
  near(f.on50001, 15, 1e-9, 'Ontario 50,001 rounds up to 51,000: 15');
  near(f.bc100, 6 * 25 + 14 * 50, 1e-9, 'BC 100,000: 6 x 25 + 14 x 50');
  near(f.bc30, 6 * 5, 1e-9, 'BC 30,000');
  near(f.bc20, 0, 1e-9, 'BC nil at 20,000');
  near(f.ab100, 275, 1e-9, 'Alberta 100,000');
  near(f.ab300, 525, 1e-9, 'Alberta over 250,000');
  near(f.ab5, 35, 1e-9, 'Alberta under 10,000');
  near(f.sk500, 3500, 1e-9, 'Saskatchewan 7 per 1,000');
  near(f.mb, 0, 1e-9, 'Manitoba none');
  near(f.qc, 0, 1e-9, 'Quebec none');
  near(f.nb150, 200 + 5 * 80 + 15 * 50, 1e-9, 'New Brunswick 150,000');
  near(f.nb10, 200, 1e-9, 'New Brunswick under 20,000');
  near(f.ns200, 1002.65 + 16.95 * 100, 1e-9, 'Nova Scotia 200,000');
  near(f.pe200, 400 + 4 * 100, 1e-9, 'PEI 200,000');
  near(f.nl100, 60 + 6 * 99, 1e-9, 'Newfoundland and Labrador 100,000');
  near(out.tfsa, 0, 1e-9, 'a TFSA-only estate owes nothing (and no probate: registered plans pass by designation)');
  near(out.rrspAfter, 500000 - out.rrspTax, 1e-6, 'an RRSP/RRIF estate: total less the tax of the final return');
  assert(out.rrspTax > 200000 && out.rrspTax < 260000, 'tax on 500,000 of RRSP at the top of the Ontario brackets, got ' + out.rrspTax);
  near(out.mixedAfter, out.mixedTotal - out.mixedTax - out.mixedProbate, 1e-6, 'mixed estate: gains (200,000 deemed, 50% included), probate on taxable + cash + home, TFSA and the residence untaxed');
  near(out.survivor, 150000 - out.survivorTax, 1e-6, 'a survivor year: the final-return tax stacks on ALL of the last-year income');
  near(out.couple, 150000 - out.coupleTax, 1e-6, 'a two-person last year: half the income each');
  assert(out.survivorTax > out.coupleTax + 5000, 'the survivor case must cost more tax than the half-income reading');
  assert(out.life.clawback > 1000, 'the scenario must pay OAS recovery tax, got ' + out.life.clawback);
  near(out.life.table, out.life.expected, 1e-6, 'lifetime tax in the meltdown table includes the OAS recovery tax');
  near(out.gainsYear, 300000 - out.gainsYearTax, 1e-6, 'the last year\'s gains enter the final-return base at 50%');
  assert(!out.keys, 'the estate must not be an enumerable result field');
  assert.deepStrictEqual(out.estateKeys.sort(), ['cash', 'homeEquity', 'lastGains', 'roth', 'survivor', 'taxable', 'taxableBasis', 'traditional'], 'estate fields');
  assert(out.opt.hasField && out.opt.n >= 4, 'the optimizer rows carry the after-tax estate');
  near(out.opt.best, out.opt.maxPool, 1e-6, 'the recommended bracket has the highest after-tax estate among the plans that do not shorten the portfolio');
  assert(out.opt.spread > 1000, 'the brackets must differ in after-tax estate');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('[Canada] after-tax estate test passed (probate fees, estate tax, optimizer ranking)');
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
