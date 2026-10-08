// Additional income (income streams and one-time income) reaches the state tax (US, Batch 7D).
//
// The federal side reads profile.otherA, which carries the household's extra income in Partner A's slot;
// the state inputs were built from the wage fields only, so a rental stream or a one-time payment was
// federally taxed but never state taxed. profile.extraA / extraB (not-earned streams, each on its owner's return) now feed the state `wages` in every branch.
// Hand-computed on a synthetic flat 10% state with no deduction.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const R = t.STATE_RULES;
  const fails = [];
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a); };
  const zero3 = { single: 0, mfj: 0, hoh: 0 };
  R.zzx = {
    name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null,
    indexing: { bracketsIndexed: false, standardDeductionIndexed: false, personalExemptionIndexed: false, creditAmountsIndexed: false, creditThresholdsIndexed: false, retirementExclusionIndexed: false },
    statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: { kind: 'flat', rate: 0.1 }, additions: [],
    base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
    standardDeduction: { ...zero3 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
    seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
    retirementExclusion: { kind: 'none' }, credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
  };
  st.inflation = 0;
  // otherA carries the extra income as buildTaxProfile builds it (wage + pension + rmd + extra).
  const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 50, ageB: 48, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
  const stateOf = (p) => { st.stateTax = 'zzx'; const a = t.taxFor(p, 0, 0); st.stateTax = 'tx'; return a - t.taxFor(p, 0, 0); };

  // A couple: wages 60,000 + 40,000, extra income 20,000 -> 120,000 x 10% = 12,000 (was 10,000).
  near(stateOf(profile({ wageA: 60000, wageB: 40000, otherA: 80000, otherB: 40000, extraA: 20000 })), 12000, 'joint return taxes the extra income');
  // One person: wages 60,000 + extra 20,000 -> 8,000.
  near(stateOf(profile({ singlePerson: true, filing: 'single', ageB: null, wageA: 60000, otherA: 80000, extraA: 20000 })), 8000, 'one-person return taxes the extra income');
  // Two separate returns: the household's extra income sits with Partner A (as the federal side has it):
  // A 60,000 + 20,000 = 8,000, B 40,000 = 4,000.
  near(stateOf(profile({ filing: 'single', wageA: 60000, wageB: 40000, otherA: 80000, otherB: 40000, extraA: 20000 })), 12000, 'two separate returns tax the extra income once, on A\'s return');
  // A profile without the field (the Roth solver and optimizer literals) owes what it did.
  near(stateOf(profile({ wageA: 60000, wageB: 40000, otherA: 60000, otherB: 40000 })), 10000, 'no extra income field: unchanged');
  delete R.zzx;
  st.stateTax = 'tx';
  return fails;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(checks);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(failures, [], 'state extra income:\n  ' + failures.join('\n  '));
  console.log('[US] state tax on additional income test passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
