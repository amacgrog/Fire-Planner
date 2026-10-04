// State income tax mechanisms (US, Batch 7C), each exercised on a synthetic jurisdiction 'zz' that
// the test adds to STATE_RULES, so the arithmetic is isolated from any real state's figures. Every
// expected value is worked by hand in the comment beside it. The real reference states are covered
// in tests/state_reference.js.
//
// The synthetic row is a flat 10% tax with no deduction; each case switches on one mechanism.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const R = t.STATE_RULES;
  const fails = [];
  const near = (a, b, label) => { if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a); };
  st.inflation = 0;
  st.stateTax = 'zz';
  const zero3 = { single: 0, mfj: 0, hoh: 0 };
  const flat = (rate) => ({ kind: 'flat', rate });
  const mk = (o) => Object.assign({
    name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null, indexing: 'none',
    statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: flat(0.1), additions: [],
    base: { ordinary: true, gainsIncluded: 1, socialSecurity: 'exempt' },
    standardDeduction: { ...zero3 }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
    retirementExclusion: { kind: 'none' }, credits: [], federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
  }, o);
  // The compiled row is cached per code, so each case registers a fresh code.
  let n = 0;
  const run = (row, sources, filing = 'single', yearIndex = 0) => {
    const code = 'zz' + n++;
    R[code] = mk(row);
    st.stateTax = code;
    const s = Object.assign({ wages: 0, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40] }, sources);
    const out = t.stateIncomeTax(s, filing, yearIndex);
    delete R[code];
    return out;
  };
  const kid = (age, o) => Object.assign({ age, student: false, qualifyingChild: true }, o);
  const cols = (v) => ({ single: v, mfj: v, hoh: v });

  // --- Benefit recapture (NY-style) ------------------------------------------------------------------
  // Brackets: 4% to 10,000, 5% to 20,000, 6% above. Recapture from AGI 12,000 over 4,000 of AGI; bands: below
  // 20,000 taxable the flat 5%, above it 6%; everything at 7% once AGI is over 1,000,000.
  const recap = {
    tax: { kind: 'graduated', columns: { single: [[0, 0.04], [10000, 0.05], [20000, 0.06]], mfj: [[0, 0.04], [10000, 0.05], [20000, 0.06]], hoh: [[0, 0.04], [10000, 0.05], [20000, 0.06]] } },
    additions: [{ kind: 'benefitRecapture', agiStart: 12000, phaseWidth: 4000, flatAbove: 1000000, flatRate: 0.07, tiers: { single: [[0, 0.05], [20000, 0.06]], mfj: [[0, 0.05], [20000, 0.06]], hoh: [[0, 0.05], [20000, 0.06]] } }],
  };
  near(run(recap, { wages: 11000 }), 400 + 5 * 10, 'recapture: AGI under the start owes the plain tax (11,000: 400 + 50)'); // 400 + 1,000 x 5% = 450
  // AGI 15,000: tax 400 + 250 = 650; flat 5% = 750; ratio (15,000 - 12,000) / 4,000 = 0.75 -> 650 + 100 x 0.75 = 725
  near(run(recap, { wages: 15000 }), 725, 'recapture: first band, three quarters phased in');
  // AGI 18,000: tax 400 + 400 = 800; flat 5% = 900; ratio 1 -> 900
  near(run(recap, { wages: 18000 }), 900, 'recapture: first band, fully phased in is the flat rate on everything');
  // AGI 30,000 (taxable 30,000): tax 400 + 500 + 600 = 1,500; band 6% from 20,000 (previous rate 5%): base 0.05 x 20,000 - 900 = 100,
  // incremental (0.06 - 0.05) x 20,000 = 200; ratio (30,000 - 20,000) / 4,000 -> 1; 1,500 + 100 + 200 = 1,800 = 6% x 30,000
  near(run(recap, { wages: 30000 }), 1800, 'recapture: second band, fully phased in is 6% of everything');
  // AGI 21,000 (taxable 21,000): tax 400 + 500 + 60 = 960; ratio (21,000 - 20,000) / 4,000 = 0.25 -> 960 + 100 + 200 x 0.25 = 1,110
  near(run(recap, { wages: 21000 }), 1110, 'recapture: second band, a quarter of the incremental benefit');
  // A deduction lowers taxable income but the AGI that drives the phase-in is before it: AGI 30,000, deduction 10,000
  // -> taxable 20,000 (first band): 900 + (0.05 x 20,000 - 900) = 1,000
  near(run({ ...recap, standardDeduction: cols(10000) }, { wages: 30000 }), 1000, 'recapture: phase-in follows AGI, band follows taxable income');
  near(run(recap, { wages: 2000000 }), 140000, 'recapture: AGI over the flat threshold is 7% of everything');

  // --- AGI step addition (CT-style add-back) -----------------------------------------------------------
  const step = { tax: flat(0.1), additions: [{ kind: 'agiStep', label: 'add-back', tables: cols([[0, 0], [50000, 25], [60000, 50]]) }] };
  near(run(step, { wages: 50000 }), 5000, 'agi step: at the bound is not over it');
  near(run(step, { wages: 55000 }), 5525, 'agi step: 5,500 + 25');
  near(run(step, { wages: 70000 }), 7050, 'agi step: 7,000 + 50');

  // --- Exemption credits with a phase-out (CA-style) ----------------------------------------------------
  const exc = (extra) => Object.assign({
    credits: [{ kind: 'exemptionCredits', label: 'exemption credits', refundable: false, personal: { single: 100, mfj: 200, hoh: 100 }, personalCount: { single: 1, mfj: 2, hoh: 1 }, senior: { age: 65, amount: 100 }, dependent: 300, phaseOut: { start: cols(50000), width: 2500, reduction: 6 } }],
  }, extra);
  near(run(exc(), { wages: 40000, ages: [40] }), 4000 - 100, 'exemption credits: personal only');
  near(run(exc(), { wages: 40000, ages: [66] }), 4000 - 200, 'exemption credits: personal + senior');
  near(run(exc(), { wages: 40000, ages: [40], dependents: [kid(5), kid(20, { qualifyingChild: false })] }), 4000 - 400, 'exemption credits: one qualifying dependent');
  // Federal AGI 60,000: over by 10,000 = 4 steps; two credits (personal + senior) lose 6 x 4 each = 48 -> 200 - 48 = 152
  near(run(exc(), { wages: 60000, ages: [66] }), 6000 - 152, 'exemption credits: phase-out of 6 per 2,500 on each credit');
  near(run(exc(), { wages: 60001, ages: [40] }), 6000.1 - (100 - 6 * 5), 'exemption credits: a partial step counts as a full one (60,001 -> 5 steps)');
  near(run(exc(), { wages: 100000, ages: [40] }), 10000, 'exemption credits: phased out entirely never goes negative (20 steps x 6 = 120 > 100)');
  near(run(exc(), { wages: 40000, ages: [40, 40] }, 'mfj'), 4000 - 200, 'exemption credits: joint personal amount');

  // --- Renter credit ---------------------------------------------------------------------------------------
  const rent = { credits: [{ kind: 'renterCredit', label: 'renter', refundable: false, amount: { single: 60, mfj: 120, hoh: 120 }, agiLimit: cols(50000) }] };
  near(run(rent, { wages: 40000, rent: 12000 }), 4000 - 60, 'renter credit: renter under the limit');
  near(run(rent, { wages: 40000, rent: 0 }), 4000, 'renter credit: an owner gets none');
  near(run(rent, { wages: 50000, rent: 12000 }), 5000 - 60, 'renter credit: at the limit still counts');
  near(run(rent, { wages: 50001, rent: 12000 }), 5000.1, 'renter credit: over the limit loses all of it');
  near(run(rent, { wages: 40000, rent: 12000 }, 'mfj'), 4000 - 120, 'renter credit: joint amount');

  // --- Child credit by age, refundable, with a phase-out (NY-style) --------------------------------------
  const child = { credits: [{ kind: 'childCredit', label: 'child', refundable: true, tiers: [[3, 1000], [16, 500]], phaseOut: { start: cols(75000), width: 1000, per: 16.5 } }] };
  const kids = [kid(2), kid(10), kid(17), kid(4, { qualifyingChild: false })];
  // Under the threshold: 1,000 (age 2) + 500 (age 10); the 17-year-old is over the top tier and the unqualified child is skipped.
  near(run(child, { wages: 40000, dependents: kids }), 4000 - 1500, 'child credit: by age, qualifying children only');
  // Federal AGI 90,000: over by 15,000 = 15 steps x 16.50 = 247.50 per child -> 752.50 + 252.50 = 1,005
  near(run(child, { wages: 90000, dependents: kids }), 9000 - 1005, 'child credit: phase-out per child');
  // Tax 500 on 5,000 of wages, credit 1,500 (refundable): the state tax goes negative.
  near(run(child, { wages: 5000, dependents: kids }), 500 - 1500, 'child credit: refundable credit can take the tax below zero');

  // --- Property tax credit (CT-style) ----------------------------------------------------------------------
  const prop = { credits: [{ kind: 'propertyTaxCredit', label: 'property tax', refundable: false, max: 300, limit: cols(50000), stepWidth: 10000, stepPct: 0.15 }] };
  near(run(prop, { wages: 40000, propertyTax: 5000 }), 4000 - 300, 'property tax credit: capped at the maximum');
  near(run(prop, { wages: 40000, propertyTax: 120 }), 4000 - 120, 'property tax credit: limited to the tax paid');
  // AGI 65,000: over 50,000 by 15,000 = 2 steps -> 70% -> 210
  near(run(prop, { wages: 65000, propertyTax: 5000 }), 6500 - 210, 'property tax credit: 15% off per 10,000 over');
  near(run(prop, { wages: 120000, propertyTax: 5000 }), 12000, 'property tax credit: gone far above the limit');
  near(run({ ...prop, tax: flat(0.001) }, { wages: 40000, propertyTax: 5000 }), 0, 'property tax credit: nonrefundable, the tax stops it at zero'); // tax 40, credit 300 -> 0

  // --- Tax forgiveness (PA-style) -----------------------------------------------------------------------------
  const forgive = { credits: [{ kind: 'taxForgiveness', label: 'forgiveness', refundable: false, limit: { single: 6500, mfj: 13000, hoh: 6500 }, perDependent: 9500, stepWidth: 250, stepPct: 0.1 }] };
  near(run(forgive, { wages: 6500 }), 0, 'forgiveness: at the limit, all of the 650 forgiven');
  // base 7,000: over by 500 = 2 steps -> 80% forgiven: tax 700 x 0.2 = 140
  near(run(forgive, { wages: 7000 }), 140, 'forgiveness: 10% per 250 over');
  near(run(forgive, { wages: 9000 }), 900, 'forgiveness: nothing past ten steps');
  near(run(forgive, { wages: 15000, dependents: [kid(5)] }), 0, 'forgiveness: a dependent adds 9,500 to the limit (16,000)');
  near(run(forgive, { wages: 13000 }, 'mfj'), 0, 'forgiveness: the joint limit');

  // --- AGI step fraction credit (CT personal credit) ----------------------------------------------------------
  const frac = { credits: [{ kind: 'agiStepFraction', label: 'personal credit', refundable: false, tables: cols([[0, 0], [15000, 0.75], [18800, 0.7]]) }] };
  near(run(frac, { wages: 17000 }), 1700 * 0.25, 'step fraction: 75% off at an AGI of 17,000');
  near(run(frac, { wages: 18900 }), 1890 * 0.3, 'step fraction: 70% off over 18,800');
  near(run(frac, { wages: 14000 }), 1400, 'step fraction: nothing at or below the first bound');

  // --- Exemption with an AGI step-down (CT-style) -----------------------------------------------------------------
  const exm = { exemption: cols(15000), exemptionPhaseOut: { kind: 'stepDown', start: cols(30000), step: 1000, width: 1000 } };
  near(run(exm, { wages: 20000 }), 500, 'exemption step-down: full exemption below the start (taxable 5,000)');
  // AGI 33,500: over by 3,500 -> 4 steps -> exemption 11,000 -> taxable 22,500 -> 2,250
  near(run(exm, { wages: 33500 }), 2250, 'exemption step-down: 1,000 per 1,000 over');
  near(run(exm, { wages: 50000 }), 5000, 'exemption step-down: gone entirely');

  // --- Dependent exemption -----------------------------------------------------------------------------------------
  near(run({ dependentExemption: 1000 }, { wages: 30000, dependents: [kid(5), kid(10), kid(17, { qualifyingChild: false })] }), 2800, 'dependent exemption: 1,000 per qualifying child (taxable 28,000)');

  // --- Social Security tested on AGI (CT-style) ----------------------------------------------------------------------
  const ssTest = { base: { ordinary: true, gainsIncluded: 1, socialSecurity: { kind: 'agiTested', exemptBelow: cols(75000), taxedShareOfBenefits: 0.25 } } };
  // AGI 40,000 + 20,000 taxable SS = 60,000 < 75,000: all 20,000 subtracted -> taxable 40,000 -> 4,000
  near(run(ssTest, { wages: 40000, taxableSS: 20000, ssBenefits: 30000 }), 4000, 'Social Security test: exempt under the AGI');
  // AGI 90,000 >= 75,000: taxed amount = min(20,000, 25% x 30,000) = 7,500; subtraction 12,500 -> 77,500 -> 7,750
  near(run(ssTest, { wages: 70000, taxableSS: 20000, ssBenefits: 30000 }), 7750, 'Social Security test: over the AGI, 25% of benefits taxed');
  // AGI 78,000 (75,000 + 3,000 taxable): min(3,000, 25% x 30,000) = 3,000 is taxed, so nothing is subtracted -> 7,800
  near(run(ssTest, { wages: 75000, taxableSS: 3000, ssBenefits: 30000 }), 7800, 'Social Security test: never more than the federally taxable part is taxed');

  // --- Per-person retirement exclusion (NY / PA style) ----------------------------------------------------------------
  const per = { retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, cap: 20000 } };
  // A (62): pension 10,000 + traditional 15,000 = 25,000 -> 20,000 cap; B (50): pension 5,000 (pensions from age 0), traditional 12,000 excluded
  // only from 59.5 -> 0. Exclusion 25,000; base 15,000 + 27,000 = 42,000 -> 17,000 -> 1,700
  const two = { pension: 15000, retirement: 27000, ages: [62, 50], pensionA: 10000, pensionB: 5000, retirementA: 15000, retirementB: 12000 };
  near(run(per, two, 'mfj'), 1700, 'per person: each filer capped and age-tested on their own');
  // No cap: A excludes 25,000, B 5,000 -> taxable 42,000 - 30,000 = 12,000 -> 1,200
  near(run({ retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, cap: null } }, two, 'mfj'), 1200, 'per person: no cap');
  // B absent (age null): only A's 20,000 is excluded -> 42,000 - 20,000 = 22,000 -> 2,200
  near(run(per, { ...two, ages: [62, null] }, 'mfj'), 2200, 'per person: a missing partner is skipped');

  // --- Retirement share by AGI (CT-style) ------------------------------------------------------------------------------
  const phased = { retirementExclusion: { kind: 'agiPhasedShare', inclusive: true, tables: cols([[0, 1], [75000, 0.85], [100000, 0]]) } };
  near(run(phased, { retirement: 50000, wages: 20000 }), 2000, 'AGI-phased share: all excluded under the first bound (taxable 20,000)');
  // AGI 75,000 exactly (inclusive): 85% of 50,000 = 42,500 excluded -> 32,500 -> 3,250
  near(run(phased, { retirement: 50000, wages: 25000 }), 3250, 'AGI-phased share: at the bound the lower share applies');
  near(run(phased, { retirement: 50000, wages: 60000 }), 11000, 'AGI-phased share: none at 110,000 (taxable 110,000)');

  // --- Status columns and indexing ----------------------------------------------------------------------------------------
  const own = { standardDeduction: { single: 1000, mfj: 3000, hoh: 2000 }, exemption: cols(0), statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' } };
  near(run(own, { wages: 10000 }, 'single'), 900, 'columns: single');
  near(run(own, { wages: 10000 }, 'hoh'), 800, 'columns: its own head-of-household column');
  near(run(own, { wages: 10000 }, 'qss'), 700, 'columns: qualifying surviving spouse reads the joint column');
  near(run({ ...own, statusAs: { mfj: 'mfj', single: 'single', hoh: 'single', qss: 'single' } }, { wages: 10000 }, 'hoh'), 900, 'columns: a state that reads head of household as single');
  st.inflation = 3;
  const f10 = Math.pow(1.03, 10);
  near(run({ ...own, indexing: 'none' }, { wages: 10000 }, 'single', 10), 900, 'indexing none: the deduction stays nominal');
  near(run({ ...own, indexing: 'cpi' }, { wages: 10000 * f10 }, 'single', 10), (10000 * f10 - 1000 * f10) * 0.1, 'indexing cpi: the deduction follows inflation');
  st.inflation = 0;

  // --- Plumbing through taxFor: each partner's discretionary traditional draw follows the account-ledger share ---
  // A retiree couple (A 62, B 50) draws 100,000 from traditional accounts; the synthetic state excludes a filer's own
  // traditional income from 59.5, so only A's part is excluded. The state tax is the difference between the same
  // profile under the synthetic state and under Texas (the federal part is identical: the standard deduction wins).
  R.zzp = mk({ retirementExclusion: { kind: 'perPerson', pensionMinAge: 0, traditionalMinAge: 59.5, cap: null } });
  const profile = (o) => Object.assign({ year: 0, filing: 'mfj', singlePerson: false, otherA: 0, otherB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 62, ageB: 50, invOrd: 0, invQual: 0, propertyTax: 0, mortgageInterest: 0, dependents: [] }, o);
  const stateOf = (p, trad) => { st.stateTax = 'zzp'; const a = t.taxFor(p, 0, trad); st.stateTax = 'tx'; return a - t.taxFor(p, 0, trad); };
  near(stateOf(profile({ ownerShareA: 0.8 }), 100000), 2000, 'taxFor: A holds 80% of the pool, 80,000 excluded, 20,000 taxed');
  near(stateOf(profile({}), 100000), 5000, 'taxFor: no ledger share means an even split (50,000 excluded)');
  near(stateOf(profile({ ownerShareA: 1, ageB: null, singlePerson: true, filing: 'single' }), 100000), 0, 'taxFor: a one-person return holds all of it (100,000 excluded)');
  delete R.zzp;

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
  assert.deepStrictEqual(failures, [], 'state mechanisms:\n  ' + failures.join('\n  '));
  console.log('[US] state mechanism tests passed (recapture, AGI steps, credits, exclusions, columns, indexing)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
