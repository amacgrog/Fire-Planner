// Two hand-computed households for every state researched in Batch 7D (US).
//
// The same two joint-return households are run through each state's row, 2026 tax year, no inflation:
//
//   RETIREE   ages 66 and 64. Pensions 40,000 (A 30,000, B 10,000), traditional withdrawals 40,000
//             (A 25,000, B 15,000), Social Security benefits 36,000 (A 24,000, B 12,000) of which 22,000 is federally
//             taxable (A 14,000, B 8,000), long-term gains 10,000. No wages. Federal AGI proxy = 40,000 + 40,000
//             + 10,000 + 22,000 = 112,000.
//   FAMILY    ages 42 and 40. Wages 130,000 (A 80,000, B 50,000), gains 2,000, two qualifying children aged 6 and 9,
//             owner with 6,000 of property tax, no rent. Federal AGI proxy = 132,000.
//
// Every expected figure is worked out by hand in the comment beside the state, from that state's published
// figures (see its row in docs/state-tax-rules.md for the source), never copied from the evaluator.
// A row's `why` names the rules the case exercises.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks(CASES) {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const fails = [];
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.01)) fails.push(label + ': expected ' + b + ', got ' + a); };
  st.inflation = 0;
  window.__test_setCurrentYear(2026);
  const kid = (age) => ({ age, student: false, qualifyingChild: true });
  const retiree = {
    wages: 0, pension: 40000, pensionA: 30000, pensionB: 10000, retirement: 40000, retirementA: 25000, retirementB: 15000,
    gains: 10000, taxableSS: 22000, taxableSSA: 14000, taxableSSB: 8000, ssBenefits: 36000, ssBenefitsA: 24000, ssBenefitsB: 12000,
    ages: [66, 64], dependents: [], propertyTax: 0, rent: 0, federalTax: 0,
  };
  const family = {
    wages: 130000, pension: 0, pensionA: 0, pensionB: 0, retirement: 0, retirementA: 0, retirementB: 0,
    gains: 2000, taxableSS: 0, taxableSSA: 0, taxableSSB: 0, ssBenefits: 0, ssBenefitsA: 0, ssBenefitsB: 0,
    ages: [42, 40], dependents: [kid(6), kid(9)], propertyTax: 6000, rent: 0, federalTax: 0,
  };
  for (const c of CASES) {
    const rule = t.STATE_RULES[c.code];
    if (!rule || rule.status !== 'researched') { fails.push(c.code + ': row is not researched'); continue; }
    st.stateTax = c.code;
    near(t.stateIncomeTax(retiree, 'mfj', 0), c.retiree, c.code + ' retiree (' + c.why + ')');
    near(t.stateIncomeTax(family, 'mfj', 0), c.family, c.code + ' family (' + c.why + ')');
    // Extra checks: a household, a plan year index, the expected tax (scheduled changes and other year-dependent rules).
    for (const x of c.extra || []) near(t.stateIncomeTax(x.household === 'retiree' ? retiree : family, 'mfj', x.yearIndex), x.expect, c.code + ' ' + x.household + ' year ' + x.yearIndex + ' (' + x.why + ')');
  }
  st.stateTax = 'tx';
  return fails;
}

// Each case: the state, the hand-computed tax for each household, what it exercises.
const CASES = [
  // --- G1: no individual income tax ------------------------------------------------------------------------------
  { code: 'ak', retiree: 0, family: 0, why: 'no income tax' },
  { code: 'fl', retiree: 0, family: 0, why: 'no income tax' },
  { code: 'nv', retiree: 0, family: 0, why: 'no income tax' },
  { code: 'sd', retiree: 0, family: 0, why: 'no income tax' },
  { code: 'wy', retiree: 0, family: 0, why: 'no income tax' },
  { code: 'nh', retiree: 0, family: 0, why: 'interest and dividends tax repealed from 2025' },
  { code: 'tn', retiree: 0, family: 0, why: 'Hall tax repealed from 2021' },

  // --- G2: flat-rate states ---------------------------------------------------------------------------------------------
  // AZ 2.5%. Federal base standard deduction 32,200; 25% of gains subtracted; one filer 65+ (2,100); dependents 2,300 each; dependent credit 100 per child under 17.
  //   retiree: 40,000 + 40,000 + 0.75 x 10,000 = 87,500 (Social Security exempt); 87,500 - 32,200 - 2,100 = 53,200 x 2.5% = 1,330
  //   family:  130,000 + 0.75 x 2,000 = 131,500; 131,500 - 32,200 - 2 x 2,300 = 94,700 x 2.5% = 2,367.50; minus 2 x 100 = 2,167.50
  { code: 'az', retiree: 1330, family: 2167.5, why: 'federal deduction, 25% gains subtraction, 65+ exemption, dependent exemption and credit' },
  // ID 5.3%. Federal deduction 32,200 + 1,650 (one filer 65+) + senior deduction 6,000 (AGI 90,000 under 150,000); food credit 155 per person, refundable.
  //   retiree: 90,000 - 39,850 = 50,150 x 5.3% = 2,657.95; credit 310 -> 2,347.95
  //   family:  132,000 - 32,200 = 99,800 x 5.3% = 5,289.40; credit 4 x 155 = 620 -> 4,669.40
  { code: 'id', retiree: 2347.95, family: 4669.4, why: 'conformity with the 65+ add-on and senior deduction, refundable per-person food credit' },
  // IN 2.95% (2.90% from 2027) plus the 1.77% average county rate. Exemptions 1,000 each (2,000 joint), 1,000 per filer 65+, 2,500 per child.
  //   retiree: 90,000 - 2,000 - 1,000 = 87,000 x (2.95% + 1.77%) = 2,566.50 + 1,539.90 = 4,106.40; 2027: 87,000 x (2.90% + 1.77%) = 2,523 + 1,539.90 = 4,062.90
  //   family:  132,000 - 2,000 - 2 x 2,500 = 125,000 x 4.72% = 3,687.50 + 2,212.50 = 5,900
  { code: 'in', retiree: 4106.4, family: 5900, why: 'exemptions, state plus county rate, scheduled 2027 cut', extra: [{ household: 'retiree', yearIndex: 1, expect: 4062.9, why: 'rate 2.90% from 2027' }] },
  // KY 3.5%. Standard deduction 3,360; each filer excludes up to 31,110 of retirement income; 40 credit per filer 65+.
  //   retiree: A 30,000 + 25,000 = 55,000 -> 31,110; B 10,000 + 15,000 = 25,000 -> 25,000; 90,000 - 56,110 = 33,890; - 3,360 = 30,530 x 3.5% = 1,068.55; minus 40 = 1,028.55
  //   family:  132,000 - 3,360 = 128,640 x 3.5% = 4,502.40
  { code: 'ky', retiree: 1028.55, family: 4502.4, why: 'per-person retirement cap, age credit' },
  // LA 3%. Standard deduction 25,000 joint; only a filer 65+ excludes (12,000 of retirement income).
  //   retiree: A (66) 55,000 -> 12,000, B (64) nothing; 90,000 - 12,000 - 25,000 = 53,000 x 3% = 1,590
  //   family:  132,000 - 25,000 = 107,000 x 3% = 3,210
  { code: 'la', retiree: 1590, family: 3210, why: 'age-gated retirement exclusion' },
  // MA 5%. Exemptions 8,800 joint, 700 per filer 65+, 1,000 per dependent; child credit 440 per child under 13 (refundable).
  //   retiree: 90,000 - 8,800 - 700 = 80,500 x 5% = 4,025
  //   family:  132,000 - 8,800 - 2,000 = 121,200 x 5% = 6,060; minus 2 x 440 = 5,180
  { code: 'ma', retiree: 4025, family: 5180, why: 'exemptions, refundable child credit' },
  // NC 3.99%. Standard deduction 25,500 joint; child deduction by AGI (joint: 120,001-140,000 -> 500 each).
  //   retiree: 90,000 - 25,500 = 64,500 x 3.99% = 2,573.55
  //   family:  132,000 - 25,500 - 2 x 500 = 105,500 x 3.99% = 4,209.45
  { code: 'nc', retiree: 2573.55, family: 4209.45, why: 'AGI-tiered child deduction' },
  // UT 4.45%, no deduction; taxpayer credit 6% of the federal deduction (1,932 joint) + 123 per filer 65+ + 127 per child, less 1.3% of income over 36,426;
  // Social Security credit 4.45% of taxable benefits less 2.5% of income over 90,000. Taxable Social Security is included.
  //   retiree: 40,000 + 40,000 + 10,000 + 22,000 = 112,000 x 4.45% = 4,984; credit 1 = 1,932 + 123 - 0.013 x (112,000 - 36,426) = 2,055 - 982.462 = 1,072.538;
  //            credit 2 = 0.0445 x 22,000 - 0.025 x (112,000 - 90,000) = 979 - 550 = 429; 4,984 - 1,501.538 = 3,482.462
  //   family:  132,000 x 4.45% = 5,874; credit 1 = 1,932 + 254 - 0.013 x 95,574 = 2,186 - 1,242.462 = 943.538; credit 2 = 0 (no benefits); 5,874 - 943.538 = 4,930.462
  { code: 'ut', retiree: 3482.462, family: 4930.462, why: 'credits with a straight-line phase-out, Social Security credit' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(checks, CASES);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(failures, [], 'Batch 7D households:\n  ' + failures.join('\n  '));
  console.log('[US] Batch 7D household tests passed (' + CASES.length + ' states, two households each)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
