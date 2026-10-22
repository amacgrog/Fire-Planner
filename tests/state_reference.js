// The researched reference states (US, Batch 7C): California, New York, Pennsylvania, Connecticut, Washington
// and Texas. Every expected value is worked by hand in the comment beside it, from the state's own figures:
// CA 2025 (CalCPA Fast Tax Facts, secondary), NY 2026 rates over the statutory thresholds in the IT-201-I
// worksheets, PA (pa.gov), CT 2025 (Form CT-1040 TCS and OLR report 2025-R-0152), WA (DOR). Inflation 0 and
// plan year 0 unless a case says otherwise. The mechanisms themselves are tested in tests/unit/us/state-mechanisms.test.js.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a); };
  st.inflation = 0;
  const kid = (age, o) => Object.assign({ age, student: false, qualifyingChild: true }, o);
  const tax = (code, sources, filing = 'single', yearIndex = 0) => {
    st.stateTax = code;
    const s = Object.assign({ wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] }, sources);
    return t.stateIncomeTax(s, filing, yearIndex);
  };

  // ============================== California (2025 figures) ==============================
  // Single, wages 100,000 (the first-year case also in tests/unit/us/tax-brackets.test.js): 5,207.98 - 153 = 5,054.98.
  near(tax('ca', { wages: 100000 }), 5054.98, 'CA single 100k');
  // Head of household, two children (5 and 8), wages 100,000: taxable 100,000 - 11,412 = 88,588 on the HoH schedule
  //   22,173 x 1% = 221.73; 30,357 x 2% = 607.14; 15,186 x 4% = 607.44; 16,089 x 6% = 965.34; 4,783 x 8% = 382.64 -> 2,784.29
  //   credits: personal 153 + 2 dependents x 475 = 1,103 -> 1,681.29
  near(tax('ca', { wages: 100000, dependents: [kid(5), kid(8)] }, 'hoh'), 1681.29, 'CA HoH, two children');
  // Retired couple 66 and 68, pension 80,000: taxable 80,000 - 11,412 = 68,588 on the joint schedule
  //   22,158 x 1% = 221.58; 30,370 x 2% = 607.40; 16,060 x 4% = 642.40 -> 1,471.38; credits 307 + 2 x 153 = 613 -> 858.38
  near(tax('ca', { pension: 80000, ages: [66, 68] }, 'mfj'), 858.38, 'CA retired couple');
  // Renter, single, wages 40,000, rent 18,000: taxable 34,294: 110.79 + 303.70 + 8,030 x 4% = 735.69; credits 153 + 60 -> 522.69
  near(tax('ca', { wages: 40000, rent: 18000 }), 522.69, 'CA renter');
  // High earner, single, wages 300,000: taxable 294,294: 3,201.97 + 221,570 x 9.3% = 23,807.98; the exemption credit is cut by
  // 6 for each 2,500 of AGI over 252,203: 47,797 -> 20 steps -> 120, leaving 33 -> 23,774.98
  near(tax('ca', { wages: 300000 }), 23774.98, 'CA exemption credit phase-out');
  // Over 1,000,000 (the 1% mental health surcharge is inside the top brackets): wages 1,200,000, taxable 1,194,294
  //   3,201.97 + 27,784.215 + 7,652.076 + 33,581.566 + 31,616.781 + 194,294 x 13.3% (25,841.102) = 129,677.71; credit gone
  near(tax('ca', { wages: 1200000 }), 129677.71, 'CA top bracket');
  // A qualifying surviving spouse reads the joint schedule: wages 100,000, one child: taxable 88,588
  //   221.58 + 607.40 + 30,376 x 4% (1,215.04) + 5,684 x 6% (341.04) = 2,385.06; credits 307 + 475 = 782 -> 1,603.06
  near(tax('ca', { wages: 100000, dependents: [kid(5)] }, 'qss'), 1603.06, 'CA qualifying surviving spouse');
  // California indexes everything with inflation: year 10 at 3% scales tax and credit alike.
  st.inflation = 3;
  near(tax('ca', { wages: 100000 * Math.pow(1.03, 10) }, 'single', 10), 5054.98 * Math.pow(1.03, 10), 'CA indexed');
  st.inflation = 0;

  // ============================== New York (2026 rates) ==============================
  // Single, wages 60,000: taxable 52,000: 8,500 x 3.9% 331.50 + 3,200 x 4.4% 140.80 + 2,200 x 5.15% 113.30 + 38,100 x 5.4% 2,057.40
  near(tax('ny', { wages: 60000 }), 2643.0, 'NY single 60k');
  // Single, wages 130,000 (AGI over 107,650): taxable 122,000, table tax 6,629.75; at a flat 5.9% 7,198.00; the 568.25 difference
  // comes back in proportion (130,000 - 107,650) / 50,000 = 0.447 -> 254.00775 -> 6,883.75775
  near(tax('ny', { wages: 130000 }), 6883.75775, 'NY single 130k recapture');
  // Married, wages 200,000: taxable 183,950 (over 161,550): table tax 8,391.20 + 22,400 x 5.9% 1,321.60 = 9,712.80; recapture base
  // 5.4% x 161,550 - 8,391.20 = 332.50 (the 2024 worksheet's 333), incremental 0.5% x 161,550 = 807.75 (807) x (200,000 - 161,550) / 50,000 = 0.769
  //   -> 9,712.80 + 332.50 + 621.15975 = 10,666.45975
  near(tax('ny', { wages: 200000, ages: [40, 40] }, 'mfj'), 10666.45975, 'NY joint 200k recapture, second band');
  // Single, wages 1,300,000: AGI is over 1,077,550 + 50,000, so everything is taxed at the 9.65% of its band: 1,292,000 x 9.65%
  near(tax('ny', { wages: 1300000 }), 124678.0, 'NY single 1.3M fully recaptured');
  // Retired couple 62 and 60: pension 50,000 (A) and traditional withdrawals 30,000 (B); each excludes up to 20,000 -> AGI 40,000
  //   taxable 40,000 - 16,050 = 23,950: 17,150 x 3.9% 668.85 + 6,450 x 4.4% 283.80 + 350 x 5.15% 18.025 = 970.675
  near(tax('ny', { pension: 50000, retirement: 30000, ages: [62, 60], pensionA: 50000, retirementB: 30000 }, 'mfj'), 970.675, 'NY pension exclusion per person');
  // The same pension at 55 is not excluded (under 59 and a half): single, pension 20,000, age 55 -> taxable 12,000
  //   8,500 x 3.9% 331.50 + 3,200 x 4.4% 140.80 + 300 x 5.15% 15.45 = 487.75
  near(tax('ny', { pension: 20000, ages: [55], pensionA: 20000 }), 487.75, 'NY no exclusion under 59.5');
  // Married with children 2 and 9, wages 90,000: taxable 90,000 - 16,050 - 2 x 1,000 = 71,950
  //   668.85 + 283.80 + 221.45 + 44,050 x 5.4% (2,378.70) = 3,552.80; Empire State child credit 1,000 + 500 (refundable) -> 2,052.80
  near(tax('ny', { wages: 90000, ages: [40, 40], dependents: [kid(2), kid(9)] }, 'mfj'), 2052.8, 'NY married with children');
  // The same with wages 130,000: taxable 111,950, table tax 5,712.80, flat 5.4% 6,045.30, difference 332.50 x 0.447 = 148.6275
  //   -> 5,861.4275; child credit 1,500 less one cut of 16.50 x 20 = 330 -> 1,170 -> 4,691.4275
  near(tax('ny', { wages: 130000, ages: [40, 40], dependents: [kid(2), kid(9)] }, 'mfj'), 4691.4275, 'NY children, phase-outs');
  // Two children aged 5, MFJ, AGI 120,000: 1,000 less 10 x 16.50 = 835 (the owner's worked example); tax 120,000 - 16,050 - 2,000 = 101,950
  //   668.85 + 283.80 + 221.45 + 74,050 x 5.4% (3,998.70) = 5,172.80; recapture 332.50 x (120,000 - 107,650) / 50,000 (0.247) = 82.1275 -> 5,254.9275 - 835
  near(tax('ny', { wages: 120000, ages: [40, 40], dependents: [kid(5), kid(5)] }, 'mfj'), 5254.9275 - 835, 'NY child credit, two children aged 5');
  // Head of household with a 5-year-old, wages 60,000: taxable 60,000 - 11,200 - 1,000 = 47,800 on the HoH schedule
  //   12,800 x 3.9% 499.20 + 4,850 x 4.4% 213.40 + 3,250 x 5.15% 167.375 + 26,900 x 5.4% 1,452.60 = 2,332.575; credit 500 -> 1,832.575
  near(tax('ny', { wages: 60000, dependents: [kid(5)] }, 'hoh'), 1832.575, 'NY head of household');
  // New York does not index: year 20 at 3% inflation owes the same tax on the same nominal income.
  st.inflation = 3;
  near(tax('ny', { wages: 60000 }, 'single', 20), 2643.0, 'NY not indexed');
  st.inflation = 0;

  // ============================== Pennsylvania ==============================
  near(tax('pa', { wages: 60000 }), 1842.0, 'PA single 60k'); // 60,000 x 3.07%, no deduction
  near(tax('pa', { wages: 20000, gains: 10000 }), 921.0, 'PA gains taxed as ordinary'); // 30,000 x 3.07%
  // Traditional withdrawals 40,000: taxed at 55 (1,228.00), excluded at 60; a pension of 20,000 is excluded at 55
  near(tax('pa', { retirement: 40000, ages: [55], retirementA: 40000 }), 1228.0, 'PA early traditional draw taxed');
  near(tax('pa', { retirement: 40000, ages: [60], retirementA: 40000 }), 0, 'PA traditional draw excluded from 59.5');
  near(tax('pa', { pension: 20000, ages: [55], pensionA: 20000 }), 0, 'PA pension excluded');
  // Tax Forgiveness: wages 7,000, tax 214.90, over the 6,500 limit by 500 -> 2 steps -> 80% forgiven -> 42.98
  near(tax('pa', { wages: 7000 }), 42.98, 'PA forgiveness partial');
  near(tax('pa', { wages: 6500 }), 0, 'PA forgiveness full');
  // A married couple with two children: limit 13,000 + 2 x 9,500 = 32,000: wages 30,000 owe nothing; wages 33,000 are 1,000 over
  // (4 steps, 60% forgiven): 1,013.10 x 0.4 = 405.24
  near(tax('pa', { wages: 30000, ages: [40, 40], dependents: [kid(4), kid(7)] }, 'mfj'), 0, 'PA family forgiven');
  near(tax('pa', { wages: 33000, ages: [40, 40], dependents: [kid(4), kid(7)] }, 'mfj'), 405.24, 'PA family partly forgiven');
  near(tax('pa', { wages: 60000, dependents: [kid(5)] }, 'hoh'), 1842.0, 'PA head of household reads single');

  // ============================== Connecticut (2025 tables) ==============================
  // Single, wages 60,000: exemption gone (15,000 less 1,000 per 1,000 over 30,000); Table B 200 + 1,800 + 550 = 2,550; add-back 25;
  // personal tax credit 10% of 2,575 = 257.50 -> 2,317.50
  near(tax('ct', { wages: 60000 }), 2317.5, 'CT single 60k');
  // With 8,000 of property tax: credit min(8,000, 300) cut 15% for each 10,000 over 49,500 (2 steps) = 210 -> 2,107.50
  near(tax('ct', { wages: 60000, propertyTax: 8000 }), 2107.5, 'CT property tax credit');
  // Retired couple 66 and 64: pension 60,000 + IRA 60,000, taxable Social Security 20,000 of 40,000 received: federal AGI 140,000
  //   Social Security: at or over 100,000, 25% of 40,000 = 10,000 taxed, 10,000 subtracted; pension and IRA: AGI 140,000 -> 2.5% excluded 3,000
  //   AGI 127,000; no exemption; Table B 400 + 3,600 + 27,000 x 5.5% 1,485 = 5,485; add-back 300; recapture 0; credit 0 -> 5,785
  near(tax('ct', { pension: 60000, retirement: 60000, taxableSS: 20000, ssBenefits: 40000, ages: [66, 64] }, 'mfj'), 5785, 'CT retired couple, phased exclusions');
  // The same couple with pension 40,000 + IRA 30,000: AGI 90,000 is under 100,000, so Social Security (20,000) and all 70,000 of
  // pension and IRA income are subtracted: AGI 0
  near(tax('ct', { pension: 40000, retirement: 30000, taxableSS: 20000, ssBenefits: 45000, ages: [66, 64] }, 'mfj'), 0, 'CT retired couple under the thresholds');
  // High earner: single, wages 300,000: Table B 14,000 + 50,000 x 6.9% = 17,450; add-back 250; recapture (295,000-300,000) 2,050 -> 19,750
  near(tax('ct', { wages: 300000 }), 19750, 'CT single 300k');
  // Head of household, wages 50,000, a child: exemption 19,000 - 12,000 = 7,000 -> taxable 43,000 on the HoH table 320 + 27,000 x 4.5% = 1,535;
  // credit 10% -> 1,381.50
  near(tax('ct', { wages: 50000, dependents: [kid(5)] }, 'hoh'), 1381.5, 'CT head of household');
  near(tax('ct', { wages: 50000, dependents: [kid(5)] }, 'qss'), tax('ct', { wages: 50000, dependents: [kid(5)] }, 'mfj'), 'CT surviving spouse reads the joint column');
  st.inflation = 3;
  near(tax('ct', { wages: 60000 }, 'single', 15), 2317.5, 'CT not indexed');
  st.inflation = 0;

  // ============================== Washington and Texas ==============================
  near(tax('wa', { wages: 500000 }), 0, 'WA wages untaxed');
  near(tax('wa', { gains: 100000 }), 0, 'WA gains under the 278,000 deduction');
  near(tax('wa', { wages: 500000, gains: 400000 }), 8540, 'WA gains over the deduction: (400,000 - 278,000) x 7%');
  near(tax('wa', { gains: 378000 }, 'mfj'), 7000, 'WA the same deduction for a couple');
  near(tax('wa', { gains: 1378000 }), 79900, 'WA 9.9% above 1,000,000 of taxable gains'); // 70,000 + 100,000 x 9.9%
  near(tax('tx', { wages: 500000, gains: 500000 }), 0, 'TX no income tax');
  // Washington indexes the deduction but not the 1,000,000 tier: at year 10 (3%) the deduction is 278,000 x 1.3439 and a taxable
  // gain of 1,100,000 still pays 9.9% only on the last 100,000: 70,000 + 9,900
  st.inflation = 3;
  const f10 = Math.pow(1.03, 10);
  near(tax('wa', { gains: 278000 * f10 + 1100000 }, 'single', 10), 79900, 'WA deduction indexed, $1M tier fixed');
  st.inflation = 0;

  // ============================== The engine runs with every reference state ==============================
  // A working couple with children and some of every income source: no NaN, no negative withdrawals.
  for (const code of ['ca', 'ny', 'pa', 'ct', 'wa', 'tx']) {
    st.stateTax = code;
    const rows = window.__test_simulate().rows;
    if (!rows.length || rows.some((r) => !Number.isFinite(r.tax) || !Number.isFinite(r.investable))) fails.push(code + ': engine rows are not finite');
  }
  st.stateTax = 'tx';
  return fails;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(checks);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(failures, [], 'state reference rows:\n  ' + failures.join('\n  '));
  console.log('[US] state reference test passed (CA, NY, PA, CT, WA, TX hand-computed households)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
