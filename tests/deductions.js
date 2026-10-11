// Federal deductions (US): age-based standard deduction, the temporary senior
// deduction (tax years 2025-2028), the SALT cap schedule, simplified itemizing
// (state income tax + property tax under the SALT cap, plus mortgage interest)
// and the $750,000 mortgage-debt limit. Every expected value is worked by hand;
// the arithmetic is in the comment beside it. The wall clock is pinned to 2026
// so plan year 0 is tax year 2026, and inflation is set to 0 unless a case says
// otherwise (indexing then leaves every amount at its 2026 value).
//
// Figures (2026): standard deduction $32,200 MFJ / $16,100 single; additional
// $1,650 per married filer / $2,050 unmarried aged 65+; senior deduction $6,000
// per filer, minus 6% of MAGI over $75,000 / $150,000; SALT cap $40,400 (2025
// $40,000, then +1% to $41,624 in 2029, $10,000 from 2030), reduced by 30% of
// MAGI over $505,000 (+1% a year) to a $10,000 floor; mortgage debt limit
// $750,000. See "Batch 2 notes" in docs/next-batches-plan.md for sources.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { translateFieldList } = require('./legacy_balances');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const near = (actual, expected, label, tol = 0.005) => {
    if (!(Math.abs(actual - expected) <= tol)) fails.push(`${label}: expected ${expected}, got ${actual}`);
  };
  st.inflation = 0;
  st.stateTax = 'tx';

  // --- Standard deduction by age ---------------------------------------------
  near(t.standardDeduction('mfj', 0, [60, 60]), 32200, 'MFJ under 65');
  near(t.standardDeduction('mfj', 0, [66, 60]), 33850, 'MFJ one spouse 65+'); // 32,200 + 1,650
  near(t.standardDeduction('mfj', 0, [66, 70]), 35500, 'MFJ both 65+'); // 32,200 + 2 x 1,650
  near(t.standardDeduction('single', 0, [70]), 18150, 'single 65+'); // 16,100 + 2,050
  near(t.standardDeduction('single', 0, [64]), 16100, 'single 64');
  near(t.standardDeduction('single', 0, [65]), 18150, 'single exactly 65');
  near(t.standardDeduction('mfj', 0), 32200, 'no ages given');
  st.inflation = 3;
  near(t.standardDeduction('mfj', 10, [70, 70]), 35500 * Math.pow(1.03, 10), 'age amounts index with the standard deduction', 1e-6);
  st.inflation = 0;

  // --- Senior deduction -------------------------------------------------------
  near(t.seniorDeduction('single', 0, [70], 75000), 6000, 'single at the phase-out start');
  near(t.seniorDeduction('single', 0, [70], 100000), 4500, 'single phase-out'); // 6,000 - 6% x 25,000
  near(t.seniorDeduction('single', 0, [70], 175000), 0, 'single fully phased out'); // 6% x 100,000 = 6,000
  near(t.seniorDeduction('single', 0, [70], 400000), 0, 'single far above, floored at zero');
  near(t.seniorDeduction('single', 0, [64], 50000), 0, 'single under 65');
  near(t.seniorDeduction('mfj', 0, [70, 70], 150000), 12000, 'MFJ both 65+ at the start');
  // Each eligible spouse's 6,000 is reduced by the same 6% x excess MAGI, then summed.
  near(t.seniorDeduction('mfj', 0, [70, 70], 175000), 9000, 'MFJ both 65+ phase-out'); // 2 x (6,000 - 6% x 25,000)
  near(t.seniorDeduction('mfj', 0, [70, 70], 200000), 6000, 'MFJ both 65+ phase-out, 200,000'); // 2 x (6,000 - 3,000)
  near(t.seniorDeduction('mfj', 0, [70, 70], 250000), 0, 'MFJ both 65+ gone at 250,000'); // 6% x 100,000 = 6,000 each
  near(t.seniorDeduction('mfj', 0, [70, 70], 350000), 0, 'MFJ both 65+ stays zero above');
  near(t.seniorDeduction('mfj', 0, [70, 60], 200000), 3000, 'MFJ one 65+'); // 6,000 - 6% x 50,000
  near(t.seniorDeduction('mfj', 0, [70, 60], 250000), 0, 'MFJ one 65+ gone at 250,000');
  // Cutoff: tax years 2025-2028 only (plan year 0 = 2026).
  if (t.SENIOR_DEDUCTION_LAST_YEAR !== 2028) fails.push('SENIOR_DEDUCTION_LAST_YEAR should be 2028');
  near(t.seniorDeduction('single', 0, [70], 50000), 6000, '2026 gets it');
  near(t.seniorDeduction('single', 2, [70], 50000), 6000, '2028 gets it');
  near(t.seniorDeduction('single', 3, [70], 50000), 0, '2029 does not');
  near(t.seniorDeduction('single', 10, [70], 50000), 0, '2036 does not');

  // --- SALT cap ---------------------------------------------------------------
  near(t.saltCap(0, 300000), 40400, '2026 cap below the threshold');
  near(t.saltCap(0, 505000), 40400, '2026 at the threshold');
  near(t.saltCap(0, 605000), 10400, '2026 phase-down'); // 40,400 - 30% x 100,000
  near(t.saltCap(0, 700000), 10000, '2026 floored at 10,000'); // 40,400 - 58,500 < 10,000
  near(t.saltCap(1, 0), 40804, '2027 cap'); // 40,400 x 1.01
  near(t.saltCap(1, 520050), 37804, '2027 phase-down'); // threshold 510,050; 40,804 - 30% x 10,000
  near(t.saltCap(2, 0), 41212, '2028 cap');
  near(t.saltCap(3, 0), 41624, '2029 cap');
  near(t.saltCap(3, 620302.005), 11624, '2029 phase-down'); // threshold 520,302.005; 41,624 - 30% x 100,000
  near(t.saltCap(4, 0), 10000, '2030 back to a flat 10,000');
  near(t.saltCap(9, 0), 10000, '2035 flat 10,000');

  // --- Itemized deduction -----------------------------------------------------
  near(t.itemizedDeduction(0, 100000, 8000, 6000, 12000), 26000, 'itemized under the cap'); // 14,000 + 12,000
  near(t.itemizedDeduction(0, 100000, 30000, 20000, 5000), 45400, 'SALT capped at 40,400'); // 40,400 + 5,000
  near(t.itemizedDeduction(4, 100000, 30000, 20000, 5000), 15000, 'SALT 10,000 in 2030'); // 10,000 + 5,000
  near(t.itemizedDeduction(0, 605000, 30000, 20000, 5000), 15400, 'phase-down cap'); // 10,400 + 5,000
  near(t.itemizedDeduction(0, 0, 0, 0, 0), 0, 'nothing to itemize');

  // --- Standard vs itemized crossover, senior stacked on either ---------------
  // MFJ 55/55, MAGI 100,000. Itemized = 10,000 + 10,000 + mortgage.
  near(t.federalDeduction('mfj', 0, [55, 55], 100000, 10000, 10000, 12000), 32200, 'itemized 32,000 loses to 32,200');
  near(t.federalDeduction('mfj', 0, [55, 55], 100000, 10000, 10000, 12200), 32200, 'tie at 32,200');
  near(t.federalDeduction('mfj', 0, [55, 55], 100000, 10000, 10000, 12300), 32300, 'itemized 32,300 wins');
  // 70/60: standard 33,850. Itemized 40,000 wins, senior 6,000 on top.
  near(t.federalDeduction('mfj', 0, [70, 60], 100000, 15000, 10000, 15000), 46000, 'senior on top of itemized');
  // Itemized 15,000 loses to 33,850; senior still added.
  near(t.federalDeduction('mfj', 0, [70, 60], 100000, 0, 5000, 10000), 39850, 'senior on top of standard');

  // --- Mortgage-debt limit ------------------------------------------------------
  near(t.mortgageInterestShare(750000), 1, 'at the limit');
  near(t.mortgageInterestShare(400000), 1, 'under the limit');
  near(t.mortgageInterestShare(1000000), 0.75, '1,000,000 loan'); // 750,000 / 1,000,000
  near(t.mortgageInterestShare(1500000), 0.5, '1,500,000 loan');
  near(t.mortgageInterestShare(0), 1, 'no loan');

  // --- Mortgage schedule exposes yearly interest -------------------------------
  Object.assign(st, { tenure: 'own', mortgage: 300000, mortgagePrincipal: 300000, mortgageRate: 5.5, mortgageYears: 30, extraPrincipal: 0 });
  {
    const sched = t.mortgageSchedule(),
      r = 0.055 / 12,
      n = 360,
      pmt = (300000 * r) / (1 - Math.pow(1 + r, -n)),
      g = Math.pow(1 + r, 12),
      bal12 = 300000 * g - (pmt * (g - 1)) / r; // closed-form balance after 12 payments
    near(sched.interest[0], 12 * pmt - (300000 - bal12), 'first-year mortgage interest', 1e-6);
    near(sched.payments[0], 12 * pmt, 'first-year payments unchanged', 1e-6);
    const lifetimeInterest = sched.interest.reduce((a, b) => a + b, 0);
    near(lifetimeInterest, n * pmt - 300000, 'lifetime interest = payments - principal', 1e-4);
    near(sched.interest[30], 0, 'no interest after payoff');
    near(sched.originalPrincipal, 300000, 'original principal exposed');
  }

  // --- taxFor end to end -------------------------------------------------------
  const prof = (o) =>
    Object.assign({ wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 40, ageB: 40 }, o);
  // Single 70, 60,000 pension: deduction 16,100 + 2,050 + 6,000 = 24,150 -> taxable 35,850.
  //   10% x 12,400 = 1,240; 12% x 23,450 = 2,814.
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 60000, pensionA: 60000 }), 0, 0), 4054, 'single 70, $60k');
  // Same person in 2029 (no senior deduction): deduction 18,150 -> taxable 41,850: 1,240 + 12% x 29,450 = 3,534.
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 60000, pensionA: 60000, year: 3 }), 0, 0), 4774, 'single 70 in 2029');
  // Single 70, 100,000: senior 6,000 - 6% x 25,000 = 4,500; deduction 22,650; taxable 77,350:
  //   1,240 + 12% x 38,000 = 4,560 + 22% x 26,950 = 5,929.
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 100000, pensionA: 100000 }), 0, 0), 11729, 'single 70 phase-out');
  // MFJ both 70, 100,000: deduction 32,200 + 3,300 + 12,000 = 47,500; taxable 52,500: 2,480 + 12% x 27,700 = 3,324.
  near(t.taxFor(prof({ filing: 'mfj', ageA: 70, ageB: 70, otherA: 100000, pensionA: 100000 }), 0, 0), 5804, 'MFJ both 70');
  // MFJ both 70, 200,000 pension: each senior 6,000 - 6% x 50,000 = 3,000 -> 6,000 total;
  //   deduction 32,200 + 3,300 + 6,000 = 41,500; taxable 158,500:
  //   2,480 + 12% x 76,000 = 9,120 + 22% x 57,700 = 12,694 -> 24,294.
  near(t.taxFor(prof({ filing: 'mfj', ageA: 70, ageB: 70, otherA: 200000, pensionA: 200000 }), 0, 0), 24294, 'MFJ both 70, per-person phase-out');
  // Two separate filers 70/70 (pre-marriage), 40,000 each: 18,150 + 6,000 = 24,150; taxable 15,850:
  //   1,240 + 12% x 3,450 = 414 -> 1,654 each.
  near(t.taxFor(prof({ filing: 'single', ageA: 70, ageB: 70, otherA: 40000, otherB: 40000, pensionA: 40000, pensionB: 40000 }), 0, 0), 3308, 'two filers 70/70');
  // MFJ 55/55, 100,000 pension, property tax 12,000, deductible interest 25,000 (no state tax):
  //   itemized 37,000 > 32,200; taxable 63,000: 2,480 + 12% x 38,200 = 4,584.
  near(t.taxFor(prof({ filing: 'mfj', ageA: 55, ageB: 55, otherA: 100000, pensionA: 100000, propertyTax: 12000, mortgageInterest: 25000 }), 0, 0), 7064, 'MFJ itemizes');
  // Same, interest 15,000: itemized 27,000 < 32,200 -> standard; taxable 67,800: 2,480 + 12% x 43,000 = 5,160 -> 7,640.
  near(t.taxFor(prof({ filing: 'mfj', ageA: 55, ageB: 55, otherA: 100000, pensionA: 100000, propertyTax: 12000, mortgageInterest: 15000 }), 0, 0), 7640, 'MFJ takes the standard deduction');
  // State income tax counts toward SALT: Illinois flat 4.95% on 100,000 wages less the 5,850 joint exemption = 4,660.425, less the 5% property tax credit (600) = 4,060.425.
  //   itemized = 4,060.425 + 12,000 + 20,000 = 36,060.425; taxable 63,939.575: 2,480 + 12% x 39,139.575 (4,696.749) = 7,176.749; + 4,060.425 = 11,237.174.
  st.stateTax = 'il';
  near(t.taxFor(prof({ filing: 'mfj', ageA: 55, ageB: 55, otherA: 100000, wageA: 100000, propertyTax: 12000, mortgageInterest: 20000 }), 0, 0), 11237.174, 'state tax inside SALT');
  // Pre-marriage two-filer split: each return gets half of 24,000 property tax and 20,000 interest.
  //   Each: wages 50,000, exemption 2,925, state (47,075 x 4.95%) 2,330.2125 less the 5% credit on 12,000 (600) = 1,730.2125; itemized = 1,730.2125 + 12,000 + 10,000 = 23,730.2125 > 16,100;
  //   taxable 26,269.7875: 1,240 + 12% x 13,869.7875 (1,664.3745) = 2,904.3745; state 1,730.2125 -> 4,634.587 each.
  near(t.taxFor(prof({ filing: 'single', ageA: 55, ageB: 55, otherA: 50000, otherB: 50000, wageA: 50000, wageB: 50000, propertyTax: 24000, mortgageInterest: 20000 }), 0, 0), 2 * 4634.587, 'two filers split housing deductions');
  st.stateTax = 'tx';
  // Gains use the same (larger) deduction: single 70, 60,000 pension + 60,000 long-term gain.
  //   MAGI 120,000 -> senior 6,000 - 6% x 45,000 = 3,300; deduction 16,100 + 2,050 + 3,300 = 21,450.
  //   Ordinary taxable 38,550: 1,240 + 12% x 26,150 = 3,138 -> 4,378.
  //   Gains: 0% band has 49,450 - 38,550 = 10,900 of room; the other 49,100 is taxed at 15% = 7,365.
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 60000, pensionA: 60000 }), 60000, 0), 4378 + 7365, 'gains stack on the larger deduction');
  // A deduction bigger than ordinary income shelters gains too: 20,000 pension, 10,000 gain,
  //   deduction 24,150 covers all of it -> no tax.
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 20000, pensionA: 20000 }), 10000, 0), 0, 'gains sheltered by the larger deduction');

  // --- Medical expenses over 7.5% of AGI (O2) -----------------------------------
  // Single 70, AGI 80,000: floor 6,000. Medical 100,000 -> itemized 94,000; the senior deduction
  // (6,000 - 6% x 5,000 = 5,700) goes on top.
  near(t.itemizedDeduction(0, 80000, 0, 0, 0, 100000), 94000, 'medical over the floor');
  near(t.itemizedDeduction(0, 100000, 0, 0, 0, 7000), 0, 'medical under the 7.5% floor (7,500)');
  near(t.itemizedDeduction(0, 100000, 0, 0, 0, 7500), 0, 'medical exactly at the floor');
  near(t.itemizedDeduction(0, 0, 0, 0, 0, 4000), 4000, 'no income: all of it');
  near(t.itemizedDeduction(0, 80000, 8000, 6000, 12000, 10000), 26000 + 4000, 'medical adds to SALT and mortgage'); // 14,000 + 12,000 + (10,000 - 6,000)
  near(t.federalDeduction('single', 0, [70], 80000, 0, 0, 0, 100000), 94000 + 5700, 'medical itemizing plus senior');
  // Crossover against the 18,150 standard deduction: itemized = medical - 6,000.
  near(t.federalDeduction('single', 0, [70], 80000, 0, 0, 0, 24150), 18150 + 5700, 'medical 24,150 ties the standard deduction');
  near(t.federalDeduction('single', 0, [70], 80000, 0, 0, 0, 24200), 18200 + 5700, 'medical 24,200 itemizes');
  near(t.federalDeduction('single', 0, [70], 80000, 0, 0, 0, 5000), 18150 + 5700, 'small medical: standard deduction');
  // End to end. Single 70, 80,000 pension, medical 40,000: itemized 34,000 + senior 5,700 = 39,700.
  //   Taxable 40,300: 10% x 12,400 = 1,240; 12% x 27,900 = 3,348 -> 4,588.
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 80000, pensionA: 80000, medicalExpense: 40000 }), 0, 0), 4588, 'single 70, medical 40,000');
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 80000, pensionA: 80000, medicalExpense: 100000 }), 0, 0), 0, 'medical shelters all of it');
  // MFJ both 70, 120,000 pension, medical 60,000: floor 9,000, itemized 51,000 beats 35,500; senior 2 x 6,000
  //   (MAGI under 150,000). Taxable 120,000 - 63,000 = 57,000: 10% x 24,800 = 2,480; 12% x 32,200 = 3,864 -> 6,344.
  near(t.taxFor(prof({ filing: 'mfj', ageA: 70, ageB: 70, otherA: 120000, pensionA: 120000, medicalExpense: 60000 }), 0, 0), 6344, 'MFJ, medical 60,000');
  // Without the field the answer is the old one (hot path: no medical term).
  near(t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 80000, pensionA: 80000 }), 0, 0), t.taxFor(prof({ singlePerson: true, filing: 'single', ageA: 70, otherA: 80000, pensionA: 80000, medicalExpense: 0 }), 0, 0), 'medicalExpense 0 is the same as absent', 0);

  return fails;
}

// ---------------------------------------------------------------------------
// Engine level: the deductions reach the real projection. A single retiree aged
// 70 living on an income stream, state tax none, no investments, inflation 0.
// Expected first-year tax is computed here from the 2026 single brackets.
// ---------------------------------------------------------------------------
const SINGLE = [[0, 0.1], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]];
const refTax = (taxable, lowers) => {
  let tax = 0;
  for (let i = 0; i < lowers.length; i++) {
    const lo = lowers[i][0],
      hi = i + 1 < lowers.length ? lowers[i + 1][0] : Infinity;
    tax += Math.max(0, Math.min(taxable, hi) - lo) * lowers[i][1];
  }
  return tax;
};
// Interest in the first 12 payments of a level-payment loan (closed form).
const firstYearInterest = (principal, annualRate, years) => {
  const r = annualRate / 12,
    n = years * 12,
    pmt = (principal * r) / (1 - Math.pow(1 + r, -n)),
    g = Math.pow(1 + r, 12);
  return 12 * pmt - (principal - (principal * g - (pmt * (g - 1)) / r));
};

async function engineTax(browser, isoDate, income, overrides = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(isoDate) });
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
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
  const fields = [
    ['singlePerson', true], ['ageA', 70], ['retireAgeA', 60], ['lifeExpectancyA', 72], ['spending', 30000],
    ['taxable', 0], ['traditional', 0], ['roth', 0], ['cash', 0], ['cashReserve', 0], ['dividendYield', 0],
    ['inflation', 0], ['stateTax', 'tx'], ['acaEnabled', false], ['ltcEnabled', false], ['healthcare', 0],
    ['medicareYearly', 0], ['ssMonthlyA', 0], ['hysaRate', 0], ['rent', 0],
    ...Object.entries(overrides).filter(([id]) => id !== 'tenure'),
  ];
  for (const [id, v] of translateFieldList(fields, true)) await set(id, v);
  if (overrides.tenure === 'rent') await page.click('#rentBtn');
  await page.evaluate((amount) => {
    window.__test_getState().incomeSources = [{ amount, startAge: 60, endAge: 100, followGrowth: false, growth: 0 }];
  }, income);
  await set('spending', 30000);
  await page.waitForTimeout(300);
  const tax = await page.evaluate(() => window.fireProjectionRows[0].tax);
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  await page.close();
  return tax;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(`(${checks.toString()})()`);
  assert.deepStrictEqual(errors, [], `page errors: ${errors}`);
  assert.deepStrictEqual(failures, [], 'deduction checks:\n  ' + failures.join('\n  '));
  await page.close();

  const near = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: got ${a}, expected ${b}`);
  // $80,000 income, default own-home mortgage (interest below the standard deduction).
  // 2026: deduction 16,100 + 2,050 + senior (6,000 - 6% x 5,000 = 5,700) = 23,850.
  near(await engineTax(browser, '2026-06-15T12:00:00Z', 80000), refTax(80000 - 23850, SINGLE), 'engine tax year 2026');
  near(await engineTax(browser, '2028-06-15T12:00:00Z', 80000), refTax(80000 - 23850, SINGLE), 'engine tax year 2028');
  // 2029: the senior deduction is gone: deduction 18,150.
  near(await engineTax(browser, '2029-06-15T12:00:00Z', 80000), refTax(80000 - 18150, SINGLE), 'engine tax year 2029');
  // Itemizing: $150,000 income, $600,000 loan at 7% (under the debt limit), $5,000 property tax.
  //   itemized = 5,000 + first-year interest; senior = 6,000 - 6% x 75,000 = 1,500.
  const interest600 = firstYearInterest(600000, 0.07, 30);
  near(
    await engineTax(browser, '2026-06-15T12:00:00Z', 150000, { mortgage: 600000, mortgagePrincipal: 600000, mortgageRate: 7, mortgageYears: 30, propertyTax: 5000, propertyTaxGrowth: 0 }),
    refTax(150000 - (5000 + interest600 + 1500), SINGLE),
    'engine itemizes property tax + mortgage interest',
  );
  // Debt limit: a $1,000,000 loan at 6% deducts only 750/1000 of its interest. Income 250,000 (senior gone).
  const interest1m = firstYearInterest(1000000, 0.06, 30);
  near(
    await engineTax(browser, '2026-06-15T12:00:00Z', 250000, { mortgage: 1000000, mortgagePrincipal: 1000000, mortgageRate: 6, mortgageYears: 30, propertyTax: 5000, propertyTaxGrowth: 0 }),
    refTax(250000 - (5000 + 0.75 * interest1m), SINGLE),
    'engine prorates mortgage interest above $750,000',
  );
  // Renting: no property tax or interest is deducted even if the fields hold values.
  near(
    await engineTax(browser, '2026-06-15T12:00:00Z', 150000, { tenure: 'rent', propertyTax: 20000, mortgage: 600000, mortgagePrincipal: 600000 }),
    refTax(150000 - (16100 + 2050 + 1500), SINGLE),
    'renter takes the standard deduction',
  );

  // Medical expenses (renting, so no property tax itemizes): 30,000 of long-term care (the year's LTC cost, from age 70) on 80,000 of income.
  //   Floor 6,000; itemized 24,000 beats the standard 18,150; senior 5,700 on top -> deduction 29,700.
  near(
    await engineTax(browser, '2026-06-15T12:00:00Z', 80000, { ltcEnabled: true, ltcYearlyA: 30000, ltcAgeA: 70, tenure: 'rent', medicalInflation: 0 }),
    refTax(80000 - 29700, SINGLE),
    'engine deducts long-term care over the 7.5% floor',
  );
  // Medicare premiums count too: 6,000 of Part B/D plus the 30,000 of care -> 36,000 - 6,000 = 30,000 itemized.
  near(
    await engineTax(browser, '2026-06-15T12:00:00Z', 80000, { ltcEnabled: true, ltcYearlyA: 30000, ltcAgeA: 70, tenure: 'rent', medicalInflation: 0, medicareYearly: 6000 }),
    refTax(80000 - (30000 + 5700), SINGLE),
    'engine deducts Medicare premiums with the care',
  );
  // Care that does not clear the standard deduction changes nothing: 20,000 - 6,000 = 14,000 < 18,150.
  near(
    await engineTax(browser, '2026-06-15T12:00:00Z', 80000, { ltcEnabled: true, ltcYearlyA: 20000, ltcAgeA: 70, tenure: 'rent', medicalInflation: 0 }),
    refTax(80000 - 23850, SINGLE),
    'engine: medical below the standard deduction',
  );

  console.log('[US] deductions test passed (age-based, senior through 2028, SALT schedule, itemizing, medical over 7.5%, mortgage limit, engine)');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
