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
