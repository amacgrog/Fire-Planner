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
// Rows that deduct the federal income tax paid (AL, MO and others) read it from the household's federalTax, worked out by hand with the 2026
// federal rules and a state tax of zero:
//   RETIREE   ordinary 40,000 + 40,000 + 22,000 = 102,000, gains 10,000, deduction 32,200 + 1,650 + senior 6,000 = 39,850; ordinary taxable 62,150
//             = 2,480 + 37,350 x 12% (4,482) = 6,962; the gains sit in the 0% band; no credits -> 6,962
//   FAMILY    ordinary 130,000, gains 2,000, standard deduction 32,200 (property tax 6,000 does not itemize); ordinary taxable 97,800 = 2,480 + 73,000 x 12% (8,760)
//             = 11,240; gains: 1,100 at 0% and 900 at 15% = 135; child tax credit 2 x 2,200 -> 11,375 - 4,400 = 6,975
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
    ages: [66, 64], dependents: [], propertyTax: 0, rent: 0, federalTax: 6962,
  };
  const family = {
    wages: 130000, pension: 0, pensionA: 0, pensionB: 0, retirement: 0, retirementA: 0, retirementB: 0,
    gains: 2000, taxableSS: 0, taxableSSA: 0, taxableSSB: 0, ssBenefits: 0, ssBenefitsA: 0, ssBenefitsB: 0,
    ages: [42, 40], dependents: [kid(6), kid(9)], propertyTax: 6000, rent: 0, federalTax: 6975,
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

  // --- G4a: states with large retirement rules (AL CO DE GA IL IA) -----------------------------------------------------------------------
  // AL (joint). Defined-benefit pension (40,000) exempt, IRA withdrawals taxed; standard deduction falls to 5,000 at this income, so the federal tax 6,962 is deducted instead;
  // exemption 3,000; 2% / 4% / 5% at 1,000 / 6,000.
  //   retiree: 90,000 - 40,000 = 50,000 - 6,962 - 3,000 = 40,038: 20 + 200 + 34,038 x 5% (1,701.90) = 1,921.90
  //   family:  132,000 - 6,975 - 3,000 - 2 x 300 (income over 100,000) = 121,425: 20 + 200 + 115,425 x 5% (5,771.25) = 5,991.25
  { code: 'al', retiree: 1921.9, family: 5991.25, why: 'federal tax deducted, income-tiered dependents, defined-benefit pension' },
  // CO (joint). 4.4% of federal taxable income. Federal deduction 32,200 + 1,650 + senior 6,000 (retiree); Social Security: A (66) all 14,000, B (64) 8,000 (AGI 112,000 is over 95,000 but the cap 20,000 is not binding);
  // pension caps shared: A 24,000 - 14,000 = 10,000, B 20,000 - 8,000 = 12,000.
  //   retiree: 112,000 - 22,000 - 22,000 = 68,000 - 39,850 = 28,150 x 4.4% = 1,238.60
  //   family:  132,000 - 32,200 = 99,800 x 4.4% = 4,391.20
  { code: 'co', retiree: 1238.6, family: 4391.2, why: 'shared Social Security and pension cap, conformity' },
  // DE (joint). Std 6,500; exclusion 12,500 per filer 60+ (A 55,000 and B 25,000 both reach it: 25,000 total); brackets 2.175% from 2,000 ... 5.525% from 25,000 to 60,000, 6.6% to 125,000, 6.75% above;
  // credits 220 + 110 per filer 60+ (440) and 110 per child.
  //   retiree: 90,000 - 25,000 = 65,000 - 6,500 = 58,500: 65.25 + 193.75 + 477.50 + 258.75 + 33,500 x 5.525% (1,850.875) = 2,846.125; - 440 = 2,406.125
  //   family:  132,000 - 6,500 = 125,500: 7,219 + 500 x 6.75% (33.75) = 7,252.75; - 220 - 220 = 6,812.75
  { code: 'de', retiree: 2406.125, family: 6812.75, why: 'new 2026 brackets, age-tiered exclusion, credits' },
  // GA (joint). 4.99%; std 30,000; A (66) excludes up to 65,000 (55,000), B (64) up to 35,000 (25,000); 4,000 per dependent. From 2027 the 65+ cap is 70,000 (nothing changes here).
  //   retiree: 90,000 - 80,000 = 10,000 -> inside the standard deduction: 0; at ages 60 and 58 (no exclusion): 90,000 - 30,000 = 60,000 x 4.99% = 2,994
  //   family:  132,000 - 30,000 - 8,000 = 94,000 x 4.99% = 4,690.60
  { code: 'ga', retiree: 0, family: 4690.6, why: 'age-tiered retirement exclusion', extra: [{ household: 'retiree', ages: [60, 58], expect: 2994, why: 'no exclusion under 62' }] },
  // IL (joint). 4.95%; all retirement income exempt; exemptions 5,850 + 1,000 for a filer 65+ + 2,925 per child; 5% property tax credit.
  //   retiree: 90,000 - 80,000 = 10,000 - 5,850 - 1,000 = 3,150 x 4.95% = 155.925
  //   family:  132,000 - 5,850 - 5,850 = 120,300 x 4.95% = 5,954.85; - 5% x 6,000 (300) = 5,654.85
  { code: 'il', retiree: 155.925, family: 5654.85, why: 'retirement income exempt, exemptions, property tax credit' },
  // IA (joint). 3.8%; federal deduction 32,200 + 1,650 + 6,000; retirement income of a filer 55+ excluded (all 80,000); credits 80 + 20 (one filer 65+) + 40 per child.
  //   retiree: 90,000 - 80,000 = 10,000 - 39,850 < 0: 0; ages 54 and 52 (no exclusion, no add-ons): 90,000 - 32,200 = 57,800 x 3.8% = 2,196.40; - 80 = 2,116.40
  //   family:  132,000 - 32,200 = 99,800 x 3.8% = 3,792.40; - 80 - 80 = 3,632.40
  { code: 'ia', retiree: 0, family: 3632.4, why: 'conformity, all retirement income excluded from 55', extra: [{ household: 'retiree', ages: [54, 52], expect: 2116.4, why: 'under 55' }] },

  // --- G4b: ME MS MO NJ SC ------------------------------------------------------------------------------------------------------
  // ME (joint). Standard deduction 31,400 + 1,650 (one filer 65+), exemption 10,600 + 5,300 per child; pension deduction 49,824 less the filer's own Social Security benefits
  // (A 24,000 -> 25,824 of A's 55,000; B 12,000 -> 37,824 of B's 25,000); 5.8% to 54,850, 6.75% to 129,750.
  //   retiree: 90,000 - 25,824 - 25,000 = 39,176 - 31,400 - 10,600 - 1,650 < 0: 0
  //   family:  132,000 - 31,400 - 10,600 - 10,600 = 79,400: 54,850 x 5.8% (3,181.30) + 24,550 x 6.75% (1,657.125) = 4,838.425
  // 7O fix F4: no personal exemption for dependents: taxable 132,000 - 31,400 - 10,600 = 90,000; 54,850 x 5.8% = 3,181.30 + 35,150 x 6.75% = 2,372.625 = 5,553.925; less the 610 credit
  { code: 'me', retiree: 0, family: 4943.925, why: 'pension deduction reduced by benefits received; dependent credit 610, no dependent exemption' },
  // MS (joint). 4% above 10,000 (3.75% in 2027 ... 3% in 2030); std 4,600; exemptions 12,000 + 1,500 for one filer 65+ + 1,500 per child; retirement income exempt.
  //   retiree: 90,000 - 80,000 = 10,000 - 4,600 - 13,500 < 0: 0
  //   family:  132,000 - 4,600 - 12,000 - 3,000 = 112,400: 102,400 x 4% = 4,096; 2027: x 3.75% = 3,840; 2030: x 3% = 3,072
  { code: 'ms', retiree: 0, family: 4096, why: 'exemptions, retirement income exempt, scheduled rate cuts', extra: [
    { household: 'family', yearIndex: 1, expect: 3840, why: '2027 rate 3.75%' }, { household: 'family', yearIndex: 4, expect: 3072, why: '2030 rate 3%' } ] },
  // MO (joint). Gains fully subtracted; Social Security exempt at 62+ (22,000); pension exemption lost (income 102,000 is over the joint limit); federal tax paid deducted
  // at 15% of 6,962 (income 80,000) = 1,044.30; federal deduction 32,200 + 1,650; 2% from 1,348 ... 4.5% from 8,088, 4.7% above 9,436 (the six brackets 2% to 4.5% add 195 x 1,348 / 1,000).
  //   retiree: 90,000 - 10,000 (gains) = 80,000 start 102,000 less 22,000 = 80,000; - 1,044.30 = 78,955.70 - 33,850 = 45,105.70: 262.86 + 35,669.70 x 4.7% (1,676.476) = 1,939.336
  //   family:  130,000 - 32,200 = 97,800 (gains subtracted, the deduction share is 0 over 125,000): 262.86 + 88,364 x 4.7% (4,153.108) = 4,415.968
  { code: 'mo', retiree: 1939.3359, family: 4415.968, why: 'federal tax deducted by income, gains subtracted, conformity' },
  // NJ (joint). Retirement exclusion for a filer 62+: all 80,000 (income 90,000 is under 100,000); exemptions 2,000 + 1,000 (one filer 65+) + 1,500 per child;
  // joint brackets 1.4% to 20,000, 1.75% to 50,000, 2.45% to 70,000, 3.5% to 80,000, 5.525% to 150,000.
  //   retiree: 90,000 - 80,000 - 3,000 = 7,000 x 1.4% = 98
  //   family:  132,000 - 2,000 - 3,000 = 127,000: 280 + 525 + 490 + 350 + 47,000 x 5.525% (2,596.75) = 4,241.75
  { code: 'nj', retiree: 98, family: 4241.75, why: 'income-tested pension exclusion, exemptions' },
  // SC (joint). 44% of gains deducted; B (64) deducts 3,000 of retirement income, A (66) none (the age deduction applies instead); SCIAD 30,000 less (income - 80,000)/110,000 of it;
  // age deduction 15,000 for A; 1.99% to 30,000, 5.21% above (597 + 5.21%).
  //   retiree: 40,000 + 40,000 + 5,600 - 3,000 = 82,600; SCIAD 30,000 x (1 - 2,600/110,000) = 29,290.91; - 15,000: taxable 38,309.09 -> 597 + 8,309.09 x 5.21% (432.90) = 1,029.904
  //   family:  130,000 + 1,120 = 131,120; SCIAD 30,000 x (1 - 51,120/110,000) = 16,058.18; dependents 9,860: taxable 105,201.82 -> 597 + 75,201.82 x 5.21% (3,918.015) = 4,515.015
  { code: 'sc', retiree: 1029.9036, family: 4515.0147, why: 'SCIAD phase-out, 65+ deduction, gains deduction' },

  // --- G5: MD MI MN MT OR VT WI ---------------------------------------------------------------------------------------------------
  // MD (joint). Pension exclusion for a filer 65+: 40,600 less benefits received (A: 40,600 - 24,000 = 16,600 of 30,000 pension; B is 64: none; IRA withdrawals not eligible);
  // std 6,700; exemptions 6,400 + 1,000 (65+), +3,200 per child; 2% / 3% / 4% to 3,000, 4.75% to 150,000; local 3.2%.
  //   retiree: 90,000 - 16,600 = 73,400 - 6,700 - 7,400 = 59,300: 20 + 30 + 40 + 56,300 x 4.75% (2,674.25) = 2,764.25; + 3.2% x 59,300 (1,897.60) = 4,661.85
  //   family:  132,000 - 6,700 - 6,400 - 6,400 = 112,500: 90 + 109,500 x 4.75% (5,201.25) = 5,291.25; + 3.2% x 112,500 (3,600) = 8,891.25
  { code: 'md', retiree: 4661.85, family: 8891.25, why: 'pension exclusion less benefits, county tax' },
  // MI (joint). 4.25%; exemptions 11,800 + 5,900 per child; retirement deduction up to 135,220 per filer: all 80,000.
  //   retiree: 90,000 - 80,000 = 10,000 - 11,800 < 0: 0
  //   family:  132,000 - 11,800 - 11,800 = 108,400 x 4.25% = 4,607
  { code: 'mi', retiree: 0, family: 4607, why: 'retirement deduction, exemptions' },
  // MN (joint). Taxable Social Security 22,000 is included; AGI 112,000 is over 108,320 (not over 112,320): 90% subtracted = 19,800; std 30,600 + 1,300 (one filer 65+);
  // dependent exemption 5,300 each; 5.35% to 48,700, 6.8% above.
  //   retiree: 112,000 - 19,800 = 92,200 - 30,600 - 1,300 = 60,300: 2,605.45 + 11,600 x 6.8% (788.80) = 3,394.25
  //   family:  132,000 - 30,600 - 10,600 = 90,800: 2,605.45 + 42,100 x 6.8% (2,862.80) = 5,468.25
  { code: 'mn', retiree: 3394.25, family: 5468.25, why: 'Social Security subtraction phase-out' },
  // MT (joint). Starts from federal taxable income: deduction 32,200 + 1,650 + 6,000 (retiree); taxable Social Security included; gains 3.0% / 4.1% stacked on the ordinary income;
  // 4.7% to 95,000, 5.65% above (2027: 4.7% to 130,000, 5.4% above).
  //   retiree: ordinary 112,000 - 10,000 - 39,850 = 62,150 x 4.7% = 2,921.05; gains 10,000 at 3.0% = 300 -> 3,221.05
  //   family:  ordinary 130,000 - 32,200 = 97,800: 95,000 x 4.7% (4,465) + 2,800 x 5.65% (158.20) = 4,623.20; gains 2,000 all above 95,000 at 4.1% = 82 -> 4,705.20
  //   family 2027: 97,800 x 4.7% = 4,596.60 + gains 2,000 at 3.0% = 60 -> 4,656.60
  { code: 'mt', retiree: 3221.05, family: 4705.2, why: 'conformity, stacked gains rates, scheduled 2027 brackets', extra: [{ household: 'family', yearIndex: 1, expect: 4656.6, why: '2027 brackets' }] },
  // OR (joint). Federal tax paid deducted (retiree 6,962, family 6,975; both under the 8,500 cap and the 250,000 phase-out); std 5,670; 4.75% to 9,100, 6.75% to 22,800, 8.75% above;
  // exemption credit 256 per person and child.
  //   retiree: 90,000 - 6,962 - 5,670 = 77,368: 432.25 + 924.75 + 54,568 x 8.75% (4,774.70) = 6,131.70; - 512 = 5,619.70
  //   family:  132,000 - 6,975 - 5,670 = 119,355: 1,357 + 96,555 x 8.75% (8,448.5625) = 9,805.5625; - 1,024 = 8,781.5625
  { code: 'or', retiree: 5619.7, family: 8781.5625, why: 'federal tax subtraction, exemption credits' },
  // VT (joint, 2025 amounts). AGI 112,000 is over 80,000: no Social Security subtraction (taxable 22,000 included); pension exclusion 10,000 per filer (20,000);
  // std 15,300; exemptions 10,600 + 1,250 (65+) + 5,300 per child; 3.35% to 82,500, 6.6% above.
  //   retiree: 112,000 - 20,000 = 92,000 - 15,300 - 10,600 - 1,250 = 64,850 x 3.35% = 2,172.475
  //   family:  132,000 - 15,300 - 10,600 - 10,600 = 95,500: 2,763.75 + 13,000 x 6.6% (858) = 3,621.75
  // O4 (7O): the Child Tax Credit for the child of 6 only (the child of 9 is too old): 1,000 less 7 steps x 20 for the 7,000 of AGI over 125,000 = 860: 3,621.75 - 860
  { code: 'vt', retiree: 2172.475, family: 2761.75, why: 'Social Security phase-out, pension exclusion; child credit 860' },
  // WI (joint, 2025 amounts). 70% of gains; nobody is 67, so no retirement subtraction; standard deduction on the straight-line approximation 25,110 x (1 - (income - 35,600) / 131,200);
  // exemptions 1,400 + 250 (one filer 65+) + 700 per child; 3.5% to 19,580, 4.4% to 67,300, 5.3% above.
  //   retiree: 40,000 + 40,000 + 7,000 = 87,000; std 15,272.70; taxable 70,077.30: 685.30 + 2,099.68 + 2,777.30 x 5.3% (147.19) = 2,932.177
  //   family:  130,000 + 1,400 = 131,400; std 6,775.11; taxable 121,824.89: 685.30 + 2,099.68 + 54,524.89 x 5.3% (2,889.82) = 5,674.80
  { code: 'wi', retiree: 2932.177, family: 5674.7993, why: 'gains exclusion, sliding standard deduction (approximated)' },

  // --- G6: NM DC ----------------------------------------------------------------------------------------------------------------------
  // NM (joint). Federal AGI 112,000 is under 150,000: the taxable Social Security 22,000 is exempt; gains deduction 2,500; standard deduction 32,200 + 1,650 (A is 66);
  // the low- and middle-income and the 65+ exemptions are gone at this income; dependents beyond the first 4,000; brackets 1.5% to 8,000, 3.2% to 25,000, 4.3% to 50,000, 4.7% to 100,000.
  //   retiree: 90,000 - 2,500 - 33,850 = 53,650: 120 + 544 + 1,075 + 3,650 x 4.7% (171.55) = 1,910.55
  //   family:  130,000 + 2,000 - 2,000 (gains under the 2,500) = 130,000 - 32,200 - 4,000 (second child) = 93,800: 1,739 + 43,800 x 4.7% (2,058.60) = 3,797.60; Child Income Tax Credit 2 x 79 = 158 -> 3,639.60
  { code: 'nm', retiree: 1910.55, family: 3639.6, why: 'Social Security test, gains deduction, dependents beyond the first, child credit' },
  // DC (joint). Conforms to the federal standard deduction with the 65+ add-on and the senior deduction (retiree 32,200 + 1,650 + 6,000 = 39,850; family 32,200); Social Security exempt; no child credit at this income.
  //   retiree: 90,000 - 39,850 = 50,150: 400 + 1,800 + 10,150 x 6.5% (659.75) = 2,859.75
  //   family:  132,000 - 32,200 = 99,800: 3,500 + 39,800 x 8.5% (3,383) = 6,883
  { code: 'dc', retiree: 2859.75, family: 6883, why: 'federal conformity with the senior deduction, bracket 8.5%' },
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
