// Batch 7O, O4: the state child credits (MN, VT, UT, OR, ME, NJ), run through the real credit literals of each
// STATE_RULES row on a synthetic base so the arithmetic is isolated: a flat 10% tax with no deduction or
// exemption, income = wages. A refundable credit can take the tax below zero, so the expected value is
// 10% of wages minus the credit; a nonrefundable one cannot take it below zero. Every expected value is
// worked by hand beside it (2026, no inflation unless the case says so). Also the new evaluator options:
// a straight-line phase-out, a state-AGI or taxable-income measure, a cap on children, a credit the
// statute does not index (`fixed`) and an age cap on the step credit.

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

function checks() {
  const t = window.__test_tax;
  const st = window.__test_getState();
  const R = t.STATE_RULES;
  const fails = [];
  const near = (a, b, label) => {
    if (!(Math.abs(a - b) <= 0.005)) fails.push(label + ': expected ' + b + ', got ' + a);
  };
  st.inflation = 0;
  const zero3 = { single: 0, mfj: 0, hoh: 0 };
  const kid = (age, o) => Object.assign({ age, student: false, qualifyingChild: true }, o);
  let n = 0;
  // The real row's credits and indexing on a flat-10% synthetic base.
  const run = (code, wages, kids, filing = 'single', yearIndex = 0, pick = null) => {
    const real = R[code];
    const zz = 'zc' + n++;
    R[zz] = {
      name: 'Synthetic', status: 'migrated', sourceKind: 'none', source: null, asOf: null, indexing: real.indexing,
      statusAs: { mfj: 'mfj', single: 'single', hoh: 'hoh', qss: 'mfj' }, tax: { kind: 'flat', rate: 0.1 }, additions: [],
      base: { ordinary: true, gainsIncluded: 1, gainsRate: null, gainsDeduction: 0, socialSecurity: 'exempt' },
      standardDeduction: { ...zero3 }, standardDeductionPhase: { kind: 'none' }, exemption: { ...zero3 }, exemptionPhaseOut: { kind: 'none' }, dependentExemption: 0,
      seniorExemption: { kind: 'none' }, federalConformity: { standardDeduction: false, seniorDeduction: false, ageAdditional: false }, schedule: [],
      retirementExclusion: { kind: 'none' }, credits: pick ? real.credits.filter((c) => c.label === pick) : real.credits, federalTaxSubtraction: 'none', localTax: 'notModeled', notes: '',
    };
    st.stateTax = zz;
    const s = { wages, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: filing === 'mfj' ? [40, 40] : [40], dependents: kids, propertyTax: 0, rent: 0 };
    const out = t.stateIncomeTax(s, filing, yearIndex);
    delete R[zz];
    return out;
  };

  // --- Minnesota: 1,750 per child under 18, 12% of federal AGI over 37,910 joint / 31,950 other ------------------
  const mnTax = (w) => w * 0.1;
  near(run('mn', 0, [kid(3), kid(17)], 'mfj'), -3500, 'MN: no income, two children');
  near(run('mn', 60000, [kid(3), kid(17)], 'mfj'), mnTax(60000) - (3500 - 0.12 * (60000 - 37910)), 'MN joint 60,000: 3,500 - 12% x 22,090 = 849.20');
  near(run('mn', 60000, [kid(3), kid(18)], 'mfj'), mnTax(60000) - Math.max(0, 1750 - 0.12 * (60000 - 37910)), 'MN: a child of 18 does not count (one child: 1,750 - 2,650.80 floors at zero)');
  near(run('mn', 0, [kid(18)], 'single'), 0, 'MN: a child of 18 gets nothing');
  near(run('mn', 40000, [kid(8)], 'single'), mnTax(40000) - (1750 - 0.12 * (40000 - 31950)), 'MN single 40,000: 1,750 - 966 = 784');
  near(run('mn', 40000, [kid(8)], 'hoh'), mnTax(40000) - (1750 - 0.12 * (40000 - 31950)), 'MN head of household uses the 31,950 column');
  near(run('mn', 200000, [kid(8)], 'single'), mnTax(200000), 'MN: phased out completely');
  // The thresholds are indexed, the amount is not: with 3% inflation and year 10, factor f.
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    near(run('mn', 60000, [kid(8)], 'single', 10), mnTax(60000) - Math.max(0, 1750 - 0.12 * (60000 - 31950 * f)), 'MN indexed thresholds, flat amount');
  }
  st.inflation = 0;

  // --- Vermont: 1,000 per child six or younger, 20 per 1,000 (or fraction) of AGI over 125,000, not indexed -------------
  near(run('vt', 100000, [kid(6), kid(7)], 'single'), mnTax(100000) - 1000, 'VT: only the child of 6 counts');
  near(run('vt', 125000, [kid(6)], 'single'), mnTax(125000) - 1000, 'VT at 125,000: full');
  near(run('vt', 125001, [kid(6)], 'single'), mnTax(125001) - 980, 'VT 125,001: one fraction of 1,000 over, 980');
  near(run('vt', 150000, [kid(6)], 'mfj'), mnTax(150000) - 500, 'VT 150,000: 25 steps x 20 = 500 off');
  near(run('vt', 175000, [kid(6)], 'single'), mnTax(175000), 'VT 175,000: gone');
  near(run('vt', 125000, [kid(1), kid(5), kid(6)], 'mfj'), mnTax(125000) - 3000, 'VT three young children');
  st.inflation = 3;
  near(run('vt', 125000, [kid(6)], 'single', 10), mnTax(125000) - 1000, 'VT: not indexed');
  st.inflation = 0;

  // --- Utah: 1,000 per child under six, nonrefundable, 10 cents per dollar over 49,000 single / 61,000 joint ----------
  near(run('ut', 30000, [kid(5)], 'single', 0, 'Child Tax Credit'), 3000 - 1000, 'UT 30,000: tax 3,000 less 1,000');
  near(run('ut', 55000, [kid(5)], 'single', 0, 'Child Tax Credit'), 5500 - (1000 - 0.1 * 6000), 'UT 55,000: 1,000 - 600 = 400');
  near(run('ut', 60000, [kid(5)], 'single', 0, 'Child Tax Credit'), 6000, 'UT 60,000: 1,100 over, gone');
  near(run('ut', 5000, [kid(5)], 'single', 0, 'Child Tax Credit'), 0, 'UT: nonrefundable, capped at the tax of 500');
  near(run('ut', 70000, [kid(1), kid(2)], 'mfj', 0, 'Child Tax Credit'), 7000 - (2000 - 0.1 * 9000), 'UT joint 70,000: 2,000 - 900 = 1,100');
  near(run('ut', 30000, [kid(6)], 'single', 0, 'Child Tax Credit'), 3000, 'UT: a child of six does not count');
  st.inflation = 3;
  near(run('ut', 55000, [kid(5)], 'single', 10, 'Child Tax Credit'), 5500 - 400, 'UT: the statute does not index it, whatever the row flags say');
  st.inflation = 0;

  // --- Oregon: 1,050 per child under six (at most five), straight line from 26,550 to nothing at 31,550, state AGI ----
  near(run('or', 0, [kid(2), kid(4), kid(6)], 'mfj', 0, 'Oregon Kids Credit'), -2100, 'OR: two children under six');
  near(run('or', 28000, [kid(2), kid(4)], 'mfj', 0, 'Oregon Kids Credit'), 2800 - (2100 - 0.21 * 1450), 'OR 28,000: 2,100 - 0.21 x 1,450 = 1,795.50');
  near(run('or', 31550, [kid(2)], 'single', 0, 'Oregon Kids Credit'), mnTax(31550), 'OR: nothing at 31,550');
  near(run('or', 0, [kid(0), kid(1), kid(2), kid(3), kid(4), kid(5)], 'mfj', 0, 'Oregon Kids Credit'), -5250, 'OR: capped at five children');
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    near(run('or', 40000, [kid(2)], 'single', 10, 'Oregon Kids Credit'), mnTax(40000) - Math.max(0, 1050 * f - 0.21 * f * (40000 - 26550 * f)), 'OR indexed amount and start');
    // The phase-out width (5,000) is not indexed: 2,500 over the indexed start takes half of the indexed credit.
    near(run('or', 26550 * f + 2500, [kid(2)], 'single', 10, 'Oregon Kids Credit'), mnTax(26550 * f + 2500) - (1050 * f) / 2, 'OR indexed: halfway down the line, half the credit');
  }
  st.inflation = 0;

  // --- Maine: 300 per dependent, 20 per 500 (or fraction) of Maine AGI over 100,000 / 125,000 / 150,000 ---------------
  near(run('me', 90000, [kid(5), kid(10)], 'single', 0, 'Dependent exemption tax credit'), mnTax(90000) - 600, 'ME: two dependents');
  near(run('me', 100001, [kid(5), kid(10)], 'single', 0, 'Dependent exemption tax credit'), mnTax(100001) - 580, 'ME 100,001: one fraction of 500, 20 off');
  near(run('me', 110000, [kid(5), kid(10)], 'single', 0, 'Dependent exemption tax credit'), mnTax(110000) - 200, 'ME 110,000: 20 steps = 400 off 600');
  near(run('me', 160000, [kid(5), kid(10)], 'single', 0, 'Dependent exemption tax credit'), mnTax(160000), 'ME single 160,000: gone');
  near(run('me', 130000, [kid(5)], 'hoh', 0, 'Dependent exemption tax credit'), mnTax(130000) - (300 - 20 * 10), 'ME head of household: starts at 125,000');
  near(run('me', 160000, [kid(5), kid(10)], 'mfj', 0, 'Dependent exemption tax credit'), mnTax(160000) - (600 - 20 * 20), 'ME joint: starts at 150,000');
  near(run('me', 0, [kid(18)], 'single', 0, 'Dependent exemption tax credit'), -300, 'ME: a dependent of 18 counts');
  near(run('me', 0, [kid(19, { qualifyingChild: false })], 'single', 0, 'Dependent exemption tax credit'), 0, 'ME: 19 and not a student is not a qualifying child here');
  near(run('me', 0, [kid(21, { student: true })], 'single', 0, 'Dependent exemption tax credit'), -300, 'ME: a student of 21 counts');

  // --- New Jersey: 1,000 per child five or younger by NJ taxable income steps (30,000 / 40,000 / 50,000 / 60,000 / 80,000) ---
  const nj = (w, kids, f = 'single') => run('nj', w, kids, f, 0);
  near(nj(25000, [kid(4), kid(5), kid(6)]), mnTax(25000) - 2000, 'NJ 25,000: two children five or younger at 1,000');
  near(nj(30000, [kid(4)]), mnTax(30000) - 1000, 'NJ exactly 30,000: still 1,000');
  near(nj(30001, [kid(4)]), mnTax(30001) - 800, 'NJ 30,001: 800');
  near(nj(45000, [kid(4)], 'mfj'), mnTax(45000) - 600, 'NJ 45,000: 600');
  near(nj(60000, [kid(4)]), mnTax(60000) - 400, 'NJ 60,000: 400');
  near(nj(70000, [kid(4)]), mnTax(70000) - 200, 'NJ 70,000: 200');
  near(nj(80000, [kid(4)]), mnTax(80000) - 200, 'NJ exactly 80,000: 200');
  near(nj(80001, [kid(4)]), mnTax(80001), 'NJ 80,001: nothing');
  near(nj(0, [kid(6)]), 0, 'NJ: a child of six does not count');

  st.stateTax = 'tx';
  return fails;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  const failures = await page.evaluate(checks);
  await browser.close();
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  assert.deepStrictEqual(failures, [], 'state child credits:\n  ' + failures.join('\n  '));
  console.log('[US] state child credits tests passed (MN, VT, UT, OR, ME, NJ)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
