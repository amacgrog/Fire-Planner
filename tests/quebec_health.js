// Quebec health contributions (Batch 7N, N7): the Health Services Fund contribution and the RAMQ drug insurance premium.
//
// Health Services Fund (Revenu Quebec Schedule F, 2025-12 form, thresholds of Finance Quebec Table 3 for 2026: 18,500 and 64,355):
// on income other than employment income, excluding OAS: nil up to 18,500; 1% of the excess to a maximum of 150 (reached at 33,500);
// 150 up to 64,355; then 150 plus 1% of the excess, to a maximum of 1,000.
// RAMQ premium (Schedule K, 2025-12 form): income used = family net income less 19,890 (single) or 32,240 (couple), plus 12,350 or 16,570
// (single) and 4,220 or 8,120 (couple) for one or more dependent children; single: 7.84% of the first 5,000 and 11.76% above; couple (each
// spouse): 3.93% and 5.89%; capped at the year's maximum. The 2025 maximum is 755 (six months at 62.00 and six at 63.83); the 2026 year
// is six months at 63.83 and six at 65.75 (the 789 a year from 1 July 2026 on the RAMQ page) = 777.48, and the formula is scaled by the
// ratio of the two maximums. Every retired adult pays it (owner decision: a working partner is assumed to have a group plan).
//
// Run: node tests/quebec_health.js

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
    st.province = 'qc';
    const k = 777.48 / 755;
    const f10 = t.taxIndexFactor(10);
    const kid = (age) => ({ age, student: false, qualifyingChild: true });
    const base = (o) => Object.assign({ year: 0, dtcA: 0, dtcB: 0, earnedA: 0, earnedB: 0, oasA: 0, oasB: 0 }, o);
    const res = { k, f10 };
    res.hsf = [18000, 30000, 40000, 64355, 100000, 200000].map((x) => t.quebecHsf(x, 0));
    res.hsf10 = t.quebecHsf(100000 * f10, 10);
    res.ramq = {
      cap: t.quebecRamq(40000, false, 0, 0),
      single22: t.quebecRamq(22000, false, 0, 0),
      singleKid: t.quebecRamq(40000, false, 1, 0),
      couple36: t.quebecRamq(36000, true, 0, 0),
      couple50: t.quebecRamq(50000, true, 0, 0),
      coupleKids: t.quebecRamq(44000, true, 2, 0),
      none: t.quebecRamq(19000, false, 0, 0),
      indexedCap: t.quebecRamq(1e6 * f10, false, 0, 10) / f10,
    };
    // Wiring: a retired single at 60,000 of pension: tax = personTaxCA + HSF + RAMQ; a working single pays HSF on non-wage income only and no RAMQ.
    const p = base({ singlePerson: true, otherA: 60000, ageA: 70, penA: 60000, payerA: 1 });
    const person = t.personTaxCA(60000, 0, 0, 0, 70, 60000, null);
    res.retiredExtra = t.incomeTax(p, 0, 0) - person;
    const w = base({ singlePerson: true, otherA: 90000, earnedA: 80000, ageA: 40, payerA: 0 });
    res.workingExtra = t.incomeTax(w, 0, 0) - t.personTaxCA(90000, 0, 0, 0, 40, 0, null);
    // Another province is untouched.
    st.province = 'on';
    res.onSame = t.incomeTax(base({ singlePerson: true, otherA: 60000, ageA: 70, penA: 60000, payerA: 1 }), 0, 0) - t.personTaxCA(60000, 0, 0, 0, 70, 60000, null);
    st.province = 'qc';
    res.oasExcluded = t.incomeTax(base({ singlePerson: true, otherA: 70000, oasA: 10000, ageA: 70, payerA: 1 }), 0, 0);
    // Engine: a retired Quebec single of 70 with a 60,000 pension and tax-free savings only pays HSF and the RAMQ premium on top of the income tax
    // (no medical credit: the premium is under the 3% floor).
    {
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, { province: 'qc', singlePerson: true, ageA: 70, retireAgeA: 65, lifeExpectancyA: 80, incomeA: 0, inflation: 0, taxable: 0, traditional: 0, roth: 400000, cash: 50000, bondYears: 0, hysaRate: 0, dividendYield: 0, healthcare: 0, ltcEnabled: false, pensionCoverage: 'a', pensionYearlyA: 60000, pensionStartAgeA: 65, cppMonthlyA: 0, oasMonthlyA: 0, spending: 40000 });
      const row = window.__test_simulate().rows[0];
      for (const key of Object.keys(saved)) st[key] = saved[key];
      st.province = 'qc';
      res.engine = { tax: row.tax, expected: t.personTaxCA(row.grossIncome, 0, 0, 0, 70, 60000, null) + t.quebecHsf(row.grossIncome, 0) + t.quebecRamq(row.grossIncome, false, 0, 0), gross: row.grossIncome };
    }
    res.oasExcludedRef = t.personTaxCA(70000, 0, 0, 0, 70, 0, null, 0, 10000);
    return res;
  });
  const hsf = out.hsf;
  near(hsf[0], 0, 1e-9, 'HSF nil under 18,500');
  near(hsf[1], 115, 1e-9, 'HSF at 30,000: 1% x 11,500');
  near(hsf[2], 150, 1e-9, 'HSF at 40,000: the 150 maximum of the first band');
  near(hsf[3], 150, 1e-9, 'HSF at 64,355');
  near(hsf[4], 150 + 0.01 * (100000 - 64355), 1e-9, 'HSF at 100,000: 150 + 1% x 35,645');
  near(hsf[5], 1000, 1e-9, 'HSF at 200,000: the 1,000 maximum');
  near(out.hsf10, 150 + 0.01 * (100000 - 64355) * out.f10, 1e-6, 'HSF thresholds are indexed (the 150 and 1,000 caps are statutory)');
  const k = out.k;
  near(out.ramq.cap, 777.48, 1e-9, 'RAMQ single at 40,000: the 2026 maximum');
  near(out.ramq.single22, 0.0784 * 2110 * k, 1e-6, 'RAMQ single at 22,000: 7.84% of 2,110');
  near(out.ramq.singleKid, (0.0784 * 5000 + 0.1176 * 2760) * k, 1e-6, 'RAMQ single parent at 40,000 (exempt 19,890 + 12,350)');
  near(out.ramq.couple36, 0.0393 * 3760 * k, 1e-6, 'RAMQ each spouse at family income 36,000');
  near(out.ramq.couple50, 777.48, 1e-9, 'RAMQ each spouse at family income 50,000: the maximum');
  near(out.ramq.coupleKids, 0.0393 * 3640 * k, 1e-6, 'RAMQ couple with two children at 44,000: income used 44,000 - 32,240 - 8,120 = 3,640');
  near(out.ramq.none, 0, 1e-12, 'RAMQ nil under the exemption');
  near(out.ramq.indexedCap, 777.48, 1e-6, 'the RAMQ maximum is indexed');
  assert(out.retiredExtra > 150 + 777.48 - 1e-6 && out.retiredExtra < 150 + 777.48 + 1e-6, 'retired single at 60,000: HSF 150 plus the RAMQ maximum, got ' + out.retiredExtra);
  near(out.workingExtra, 0, 1e-9, 'working single: HSF on the 10,000 of non-wage income is nil (under 18,500)');
  near(out.onSame, 0, 1e-12, 'no Quebec contributions outside Quebec');
  near(out.oasExcluded - out.oasExcludedRef, 150 + 777.48, 1e-6, 'OAS is not in the Health Services Fund base (60,000 of other income gives 150); the retired single pays the RAMQ maximum');
  near(out.engine.tax, out.engine.expected, 0.01, 'engine row: Quebec retired single (income ' + out.engine.gross.toFixed(0) + ')');
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  console.log('[Canada] Quebec health contributions test passed (HSF bands, RAMQ table, wiring)');
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
