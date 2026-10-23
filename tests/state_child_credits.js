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

  // --- Minnesota (2026): 1,800 per child under 18, 12% of federal AGI over 38,770 joint / 32,680 other ------------
  const mnTax = (w) => w * 0.1;
  near(run('mn', 0, [kid(3), kid(17)], 'mfj'), -3600, 'MN: no income, two children');
  near(run('mn', 60000, [kid(3), kid(17)], 'mfj'), mnTax(60000) - (3600 - 0.12 * (60000 - 38770)), 'MN joint 60,000: 3,600 - 12% x 21,230 = 1,052.40');
  near(run('mn', 60000, [kid(3), kid(18)], 'mfj'), mnTax(60000) - Math.max(0, 1800 - 0.12 * (60000 - 38770)), 'MN: a child of 18 does not count (one child: 1,800 - 2,547.60 floors at zero)');
  near(run('mn', 0, [kid(18)], 'single'), 0, 'MN: a child of 18 gets nothing');
  near(run('mn', 40000, [kid(8)], 'single'), mnTax(40000) - (1800 - 0.12 * (40000 - 32680)), 'MN single 40,000: 1,800 - 878.40 = 921.60');
  near(run('mn', 40000, [kid(8)], 'hoh'), mnTax(40000) - (1800 - 0.12 * (40000 - 32680)), 'MN head of household uses the 32,680 column');
  near(run('mn', 200000, [kid(8)], 'single'), mnTax(200000), 'MN: phased out completely');
  // The thresholds and the amount are indexed: with 3% inflation and year 10, factor f.
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    near(run('mn', 60000, [kid(8)], 'single', 10), mnTax(60000) - Math.max(0, 1800 * f - 0.12 * (60000 - 32680 * f)), 'MN indexed thresholds and amount');
  }
  st.inflation = 0;

  // --- Vermont: 1,000 per child six or younger, 20 per 1,000 (or fraction) of AGI over 125,000, not indexed -------------
  near(run('vt', 100000, [kid(6), kid(7)], 'single'), mnTax(100000) - 1000, 'VT: only the child of 6 counts');
  near(run('vt', 125000, [kid(6)], 'single'), mnTax(125000) - 1000, 'VT at 125,000: full');
  near(run('vt', 125001, [kid(6)], 'single'), mnTax(125001) - 980, 'VT 125,001: one fraction of 1,000 over, 980');
  near(run('vt', 150000, [kid(6)], 'mfj'), mnTax(150000) - 500, 'VT 150,000: 25 steps x 20 = 500 off');
  near(run('vt', 175000, [kid(6)], 'single'), mnTax(175000), 'VT 175,000: gone');
  near(run('vt', 125000, [kid(1), kid(5), kid(6)], 'mfj'), mnTax(125000) - 3000, 'VT three young children');
  // Per child (32 V.S.A. 5830f(b), the IN-112 table is per child): each child's 1,000 loses 20 per 1,000 or fraction over 125,000.
  near(run('vt', 150000, [kid(6), kid(2)], 'mfj'), mnTax(150000) - 1000, 'VT 150,000, two children: each 1,000 - 25 x 20 = 500, total 1,000');
  near(run('vt', 170000, [kid(6), kid(2)], 'mfj'), mnTax(170000) - 200, 'VT 170,000, two children: each 1,000 - 45 x 20 = 100, total 200');
  near(run('vt', 174001, [kid(6), kid(2)], 'mfj'), mnTax(174001), 'VT 174,001: 49,001 over = 50 steps, 1,000 off each: nothing');
  near(run('vt', 125001, [kid(1), kid(5), kid(6)], 'mfj'), mnTax(125001) - 2940, 'VT 125,001, three children: 3 x 980');
  near(run('vt', 190000, [kid(0), kid(1), kid(2), kid(3)], 'mfj'), mnTax(190000), 'VT 190,000, four children: gone for every child count');
  near(run('vt', 150000, [kid(7), kid(6)], 'single'), mnTax(150000) - 500, 'VT 150,000: the child of 7 never counts, the child of 6 gets 500');
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

  // --- Oregon: 1,050 per child under six (at most five); the credit is cut by the share (state AGI - 26,550) / 5,000 of the
  // WHOLE credit (rounded to two decimals as on the OR-40 worksheet), so it is gone at 31,550 for any number of children ---
  const orc = (w, kids, f = 'single', yi = 0) => run('or', w, kids, f, yi, 'Oregon Kids Credit');
  near(orc(0, [kid(2), kid(4), kid(6)], 'mfj'), -2100, 'OR: two children under six (the child of six does not count)');
  near(orc(28000, [kid(2), kid(4)], 'mfj'), 2800 - 1491, 'OR 28,000, two children: 1,450 / 5,000 = 0.29; 2,100 x 0.71 = 1,491');
  near(orc(28000, [kid(2)], 'single'), 2800 - 745.5, 'OR 28,000, one child: 1,050 x 0.71 = 745.50 (unchanged from the straight line)');
  near(orc(30000, [kid(1), kid(2), kid(3)], 'mfj'), 3000 - 976.5, 'OR 30,000, three children: 3,450 / 5,000 = 0.69; 3,150 x 0.31 = 976.50');
  near(orc(27000, [kid(0), kid(1), kid(2), kid(3), kid(4), kid(5)], 'mfj'), 2700 - 4777.5, 'OR 27,000, six children: capped at five first (5,250), 450 / 5,000 = 0.09; 5,250 x 0.91 = 4,777.50');
  near(orc(28123, [kid(2), kid(4)], 'mfj'), 2812.3 - 1449, 'OR 28,123: 1,573 / 5,000 = 0.3146 rounds to 0.31; 2,100 x 0.69 = 1,449 (unrounded 1,439.34)');
  near(orc(31549, [kid(2), kid(4)], 'mfj'), mnTax(31549), 'OR 31,549: 4,999 / 5,000 = 0.9998 rounds to 1.00: nothing');
  near(orc(31550, [kid(2)], 'single'), mnTax(31550), 'OR: nothing at 31,550');
  near(orc(26550, [kid(2), kid(4)], 'mfj'), 2655 - 2100, 'OR at 26,550: full');
  // 2029 and later: the statute ends the credit for tax years from 2029; the planner does NOT model that (owner decision).
  near(orc(0, [kid(2)], 'single', 3), -1050, 'OR 2029 (year index 3): still paid, no sunset modeled');
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    // The amount and the start index; the 5,000 divisor is a share, not a dollar amount, so it stays fixed.
    near(orc(26550 * f + 2500, [kid(2)], 'single', 10), mnTax(26550 * f + 2500) - (1050 * f) / 2, 'OR indexed, one child: 2,500 over the indexed start = half the indexed credit');
    near(orc(26550 * f + 2500, [kid(2), kid(4)], 'mfj', 10), mnTax(26550 * f + 2500) - (2100 * f) / 2, 'OR indexed, two children: still half (0.50 exactly)');
  }
  st.inflation = 0;

  // --- Maine: 305 per dependent, 610 for a child under six (5219-SS(5), no end date), refundable; 20 per 500 (or fraction)
  // of Maine AGI over 100,000 single / 125,000 head of household / 150,000 joint, taken off the household total; the
  // amounts and the thresholds are indexed (5403(9) and (10)); the 2025 worksheet values stand for 2026 -------------------
  const MECR = 'Dependent exemption tax credit';
  const mec = (w, kids, f = 'single', yi = 0) => run('me', w, kids, f, yi, MECR);
  near(mec(0, [kid(5)]), -610, 'ME: a child of 5 has not attained six: 610');
  near(mec(0, [kid(6)]), -305, 'ME: a child of 6 gets 305');
  near(mec(90000, [kid(5), kid(10)]), mnTax(90000) - 915, 'ME: 610 + 305');
  near(mec(100001, [kid(5), kid(10)]), mnTax(100001) - 895, 'ME 100,001: one fraction of 500, 20 off 915');
  near(mec(110000, [kid(5), kid(10)]), mnTax(110000) - 515, 'ME 110,000: 20 steps = 400 off 915');
  near(mec(125000, [kid(5), kid(10)]), mnTax(125000), 'ME single 125,000: 50 steps = 1,000 off 915, nothing left');
  near(mec(130000, [kid(3)], 'hoh'), mnTax(130000) - 410, 'ME head of household 130,000: 610 - 10 x 20');
  near(mec(160000, [kid(2), kid(4)], 'mfj'), mnTax(160000) - 820, 'ME joint 160,000: 1,220 - 20 x 20 = 820');
  near(mec(0, [kid(18)]), -305, 'ME: a dependent of 18 counts, 305');
  near(mec(0, [kid(19, { qualifyingChild: false })]), 0, 'ME: 19 and not a student is not a qualifying child here');
  near(mec(0, [kid(21, { student: true })]), -305, 'ME: a student of 21 counts, 305');
  st.inflation = 3;
  {
    const f = t.taxIndexFactor(10);
    near(mec(0, [kid(3)], 'single', 10), -610 * f, 'ME indexed amount: 610 x f');
    near(mec(100000 * f + 1000, [kid(3)], 'single', 10), mnTax(100000 * f + 1000) - (610 * f - 2 * 20 * f), 'ME indexed: the start 100,000 x f and the 20 per step scale with f (1,000 over = 2 steps)');
  }
  st.inflation = 0;

  // 7O follow-up F4: Maine gives no personal exemption for a dependent (36 M.R.S. 5126-A(1)), only the credit. One child of 5 on
  // a single return at 80,000 (AGI under 100,000, so the full 610): the household with the child pays exactly 610 less.
  st.stateTax = 'me';
  {
    const kids = [kid(5)],
      base = { wages: 80000, pension: 0, retirement: 0, gains: 0, taxableSS: 0, ages: [40], propertyTax: 0, rent: 0 };
    near(t.stateIncomeTax({ ...base, dependents: kids }, 'single', 0) - t.stateIncomeTax({ ...base, dependents: [] }, 'single', 0), -610, 'ME real row: a child changes the tax only by the 610 credit, no 5,300 exemption');
  }

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
  await page.goto('file://' + path.resolve(__dirname, '..', 'dist', 'Planner_US.html'));
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
