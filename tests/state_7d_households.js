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
    for (const x of c.extra || []) near(t.stateIncomeTax(Object.assign({}, x.household === 'retiree' ? retiree : family, x.ages ? { ages: x.ages } : {}), 'mfj', x.yearIndex || 0), x.expect, c.code + ' ' + x.household + ' year ' + x.yearIndex + ' (' + x.why + ')');
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

  // --- G3: progressive states, simpler ----------------------------------------------------------------------------------------------
  // AR (joint column). Gains half taxed; 6,000 retirement exclusion per filer; std 4,940; brackets 0 / 2% from 5,600 / 3% from 11,200 / 3.4% from 16,000 / 3.9% from 26,400;
  // credits 29 per filer, 29 per filer 65+, 29 per dependent.
  //   retiree: 40,000 + 40,000 + 5,000 = 85,000; - 6,000 (A) - 6,000 (B) = 73,000; - 4,940 = 68,060: 112 + 144 + 353.60 + 41,660 x 3.9% (1,624.74) = 2,234.34; credits 58 + 29 = 87 -> 2,147.34
  //   family:  130,000 + 1,000 = 131,000 - 4,940 = 126,060: 112 + 144 + 353.60 + 99,660 x 3.9% (3,886.74) = 4,496.34; credits 58 + 58 = 116 -> 4,380.34
  { code: 'ar', retiree: 2147.34, family: 4380.34, why: 'half of gains, per-filer retirement cap, personal credits' },
  // HI (joint column, 2026). Pension income (40,000) excluded, IRA withdrawals taxed; std 16,000; exemption 1,144 per person and dependent;
  // brackets 1.4% to 19,200, 3.2% to 28,800, 5.5% to 38,400, 6.4% to 48,000, 6.8% to 72,000, 7.2% to 96,000, 7.6% above.
  //   retiree: 40,000 + 40,000 + 10,000 - 40,000 = 50,000 - 16,000 - 2,288 = 31,712: 268.80 + 307.20 + 2,912 x 5.5% (160.16) = 736.16
  //   family:  132,000 - 16,000 - 2,288 - 2,288 = 111,424: 268.80 + 307.20 + 528 + 614.40 + 1,632 + 1,728 + 15,424 x 7.6% (1,172.224) = 6,250.624
  //   2027 (Act 24: second bracket 2.5%, third 5%, bracket limits widen): 31,712 -> 28,800 x 1.4% (403.20) + 2,912 x 2.5% (72.80) = 476.00
  //   2028 (deduction 18,000): 50,000 - 18,000 - 2,288 = 29,712 -> 403.20 + 912 x 2.5% (22.80) = 426.00
  //   2029 (brackets widen again, 1.4% to 38,400): 29,712 x 1.4% = 415.968
  { code: 'hi', retiree: 736.16, family: 6250.624, why: 'pension exclusion, exemptions, scheduled 2027-2029 changes', extra: [
    { household: 'retiree', yearIndex: 1, expect: 476, why: '2027 brackets with Act 24' },
    { household: 'retiree', yearIndex: 2, expect: 426, why: '2028 standard deduction' },
    { household: 'retiree', yearIndex: 3, expect: 415.968, why: '2029 brackets' } ] },
  // KS (joint). Social Security exempt; std 8,240; exemption allowance 18,320; 2,320 per dependent; 5.2% to 46,000, 5.58% above.
  //   retiree: 90,000 - 8,240 - 18,320 = 63,440: 2,392 + 17,440 x 5.58% (973.152) = 3,365.152
  //   family:  132,000 - 8,240 - 18,320 - 4,640 = 100,800: 2,392 + 54,800 x 5.58% (3,057.84) = 5,449.84
  { code: 'ks', retiree: 3365.152, family: 5449.84, why: 'exemption allowance, dependent exemptions' },
  // NE (joint). Std 17,700 + 1,700 for one filer 65+; 2.46% to 8,250, 3.51% to 49,530, 4.55% above; credit 176 per exemption (2 filers, +2 children).
  //   retiree: 90,000 - 17,700 - 1,700 = 70,600: 202.95 + 41,280 x 3.51% (1,448.928) + 21,070 x 4.55% (958.685) = 2,610.563; - 352 = 2,258.563
  //   family:  132,000 - 17,700 = 114,300: 202.95 + 1,448.928 + 64,770 x 4.55% (2,947.035) = 4,598.913; - 704 = 3,894.913
  //   2027 (3.99%, brackets 8,520 / 51,150): retiree 202.95 -> 8,520 x 2.46% = 209.592; 42,630 x 3.51% = 1,496.313; 19,450 x 3.99% = 776.055; 2,481.96 - 352 = 2,129.96
  { code: 'ne', retiree: 2258.563, family: 3894.913, why: 'exemption credits, senior add-on, scheduled 2027 rate', extra: [{ household: 'retiree', yearIndex: 1, expect: 2129.96, why: '2027 schedule' }] },
  // ND (joint). Federal base deduction 32,200 + 1,650 (one filer 65+) + senior deduction 6,000; 40% of gains excluded; 0% to 82,800, 1.95% to 304,850.
  //   retiree: 40,000 + 40,000 + 6,000 = 86,000 - 39,850 = 46,150 -> inside the 0% band: 0
  //   family:  130,000 + 1,200 = 131,200 - 32,200 = 99,000: (99,000 - 82,800) x 1.95% = 315.90
  { code: 'nd', retiree: 0, family: 315.9, why: 'conformity, gains exclusion, zero bracket' },
  // OH (joint). 2.75% above 26,050; exemptions 4,300 (filers); dependents 1,900 each at this income; senior credit 50; joint filing credit 20% of the tax.
  //   retiree: 90,000 - 4,300 = 85,700: 59,650 x 2.75% = 1,640.375; credits 50 + 328.075 -> 1,262.30
  //   family:  132,000 - 4,300 - 3,800 = 123,900: 97,850 x 2.75% = 2,690.875; joint filing credit 538.175 -> 2,152.70
  { code: 'oh', retiree: 1262.3, family: 2152.7, why: 'zero bracket, tiered exemptions, senior and joint filing credits' },
  // OK (joint). Retirement exclusion 10,000 per filer; std 12,700; exemption 2,000 + 1,000 per child; 2.5% from 7,500, 3.5% from 9,800, 4.5% from 14,400.
  //   retiree: 90,000 - 10,000 - 10,000 = 70,000 - 12,700 - 2,000 = 55,300: 57.50 + 161 + 40,900 x 4.5% (1,840.50) = 2,059
  //   family:  132,000 - 12,700 - 2,000 - 2,000 = 115,300: 57.50 + 161 + 100,900 x 4.5% (4,540.50) = 4,759
  { code: 'ok', retiree: 2059, family: 4759, why: 'new 2026 brackets, per-filer retirement exclusion' },
  // RI (joint). Nobody at 67: taxable Social Security is included and no pension exclusion; std 22,400; exemptions 10,500 + 5,250 per child; 3.75% to 82,050, 4.75% above.
  //   retiree: 40,000 + 40,000 + 10,000 + 22,000 = 112,000 - 22,400 - 10,500 = 79,100 x 3.75% = 2,966.25
  //   family:  132,000 - 22,400 - 10,500 - 10,500 = 88,600: 3,076.875 + 6,550 x 4.75% (311.125) = 3,388
  //   retiree ages 68 and 66: A subtracts all 14,000 of benefits and 50,000 of the 55,000 retirement income (AGI 112,000 under 133,750); B (66) nothing;
  //   112,000 - 14,000 - 50,000 = 48,000 - 22,400 - 10,500 = 15,100 x 3.75% = 566.25
  { code: 'ri', retiree: 2966.25, family: 3388, why: 'full-retirement-age tests', extra: [{ household: 'retiree', ages: [68, 66], expect: 566.25, why: 'one filer at 67 or older' }] },
  // VA (joint). Std 17,500; exemption 930 each; age deduction 12,000 per filer 65+ cut dollar for dollar over 75,000 (AGI 90,000: gone); 2% / 3% / 5% / 5.75% at 3,000 / 5,000 / 17,000.
  //   retiree: 90,000 - 17,500 - 1,860 = 70,640: 60 + 60 + 600 + 53,640 x 5.75% (3,084.30) = 3,804.30
  //   family:  132,000 - 17,500 - 1,860 - 1,860 = 110,780: 720 + 93,780 x 5.75% (5,392.35) = 6,112.35
  { code: 'va', retiree: 3804.3, family: 6112.35, why: 'age deduction phased out by income' },
  // WV (joint). Exemptions 4,000 + 2,000 per child; 8,000 for one filer 65+; 2.11% to 10,000, 2.81% to 25,000, 3.16% to 40,000, 4.22% to 60,000, 4.58% above.
  //   retiree: 90,000 - 4,000 - 8,000 = 78,000: 211 + 421.50 + 474 + 844 + 18,000 x 4.58% (824.40) = 2,774.90
  //   family:  132,000 - 4,000 - 4,000 = 124,000: 1,950.50 + 64,000 x 4.58% (2,931.20) = 4,881.70
  { code: 'wv', retiree: 2774.9, family: 4881.7, why: 'SB 392 rates, senior modification' },
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
