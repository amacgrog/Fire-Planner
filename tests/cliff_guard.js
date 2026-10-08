const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b} (+/-${tol}), got ${a}`);

async function openPlanner() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'Planner_US.html'));
  await page.waitForTimeout(300);
  return { browser, page, errors };
}
// Runs simulate() under a state patch and restores the state afterwards. Returns the rows.
const rows = (page, patch) =>
  page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return JSON.parse(JSON.stringify(window.__test_simulate().rows));
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, patch);
// The cliff plan refreshCliffPlan keeps for a state patch ({ plan, report }); the state is restored and re-planned.
const planOf = (page, patch) =>
  page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_refreshCliffPlan();
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
      window.__test_refreshCliffPlan();
    }
  }, patch);
const intentAt = (p, age) => (p.plan && p.plan.intents[age]) || null;
// Calls window.__test_tax[fn](...args) under a state patch.
const taxCall = (page, patch, fn, args) =>
  page.evaluate(({ patch, fn, args }) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_tax[fn](...args);
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { patch, fn, args });

const BASE = {
  singlePerson: true, filingStatus: 'single', marryLater: false, survivorEnabled: false, children: [],
  ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 64, lifeExpectancyB: 64,
  inflation: 0, medicalInflation: 0, returnRate: 0, bondReturn: 0, hysaRate: 0, incomeA: 0, incomeB: 0,
  taxable: 0, basisRatio: 100, cash: 3000000, cashReserve: 0, bondYears: 0, spending: 40000,
  tradIraA: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0, rothIraBasisA: 0,
  tradIraB: 0, trad401kB: 0, rothIraB: 0, roth401kB: 0, rothIraBasisB: 0,
  ssMonthlyA: 0, ssMonthlyB: 0, pensionCoverage: 'both', pensionYearlyA: 0, pensionYearlyB: 0, pensionStartAgeA: 0, pensionStartAgeB: 0,
  stateTax: 'tx', acaEnabled: false, acaEnhanced: false, medicaidWhenEligible: true, healthcare: 12000,
  medicareYearly: 0, ltcEnabled: false, irmaaPriorKnown: false, rothConvEnabled: false,
  withdrawalMixEnabled: false, smoothWithdrawals: false, appliedMixSchedule: null, appliedRothSchedule: null,
  guardrailsEnabled: false, incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
  sepp72tIraA: false, sepp72tK401A: false, sepp72tIraB: false, sepp72tK401B: false,
};

// The cliff plan (spec 2026-10-07; this file was the 3C in-path guard's test, rewritten to the plan): the plan chosen on
// the deterministic projection stays under a line when the credit saved outweighs the extra value spent, crosses when it
// does not, fills to a floor when that removes a premium; refreshCliffPlan keeps it (rule A) and the rows of a projection
// that applies it carry the label. Each case finds its spending by scanning, so it does not depend on housing defaults.
// rows() runs __test_simulate, which plans for the state it sees (ensureTestPlan).
(async () => {
  const { browser, page, errors } = await openPlanner();
  const G = { ...BASE, ruleOf55A: false, ruleOf55B: false, acaEnabled: true, trad401kA: 600000, rothIraA: 300000, rothIraBasisA: 300000, cash: 0, lifeExpectancyA: 62 };
  const first = async (patch) => (await rows(page, patch))[0];
  async function findSpending(patch, lo, hi, pred) {
    for (let s = 0; s <= 200000; s += 500) {
      const r = await first({ ...patch, spending: s, cliffGuardEnabled: false });
      if (r.magiProxy > lo && r.magiProxy < hi && (!pred || pred(r))) return s;
    }
    throw new Error(`no spending lands MAGI in (${lo}, ${hi})`);
  }

  // Each year's candidates in the chooser (window.__test_planTrace: the standard `choose` run), under a state patch.
  const traceOf = (patch) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return window.__test_planTrace();
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, patch);
  const kinds = (tr, year) => ((tr.find((t) => t.year === year) || {}).candidates || []).map((c) => c.kind);

  // 1. Just over the 400% line (62,600): staying under saves most of a 12,000 premium for a small Roth draw.
  const s1 = await findSpending(G, 62600, 64000);
  const off1 = await first({ ...G, spending: s1, cliffGuardEnabled: false });
  const on1 = await first({ ...G, spending: s1, cliffGuardEnabled: true });
  near(off1.healthcare, 12000, 0.01, 'guard off: over the cliff, full premium');
  assert(on1.magiProxy <= 62600, `guard on stays under (${on1.magiProxy})`);
  assert(on1.healthcare < 12000 - 3000, 'guard on keeps the credit');
  assert(/^stayed under ACA 400% line/.test(on1.cliffChoice), `cliffChoice ${on1.cliffChoice}`);
  const p1 = await planOf(page, { ...G, spending: s1, cliffGuardEnabled: true });
  assert.deepStrictEqual(intentAt(p1, 60), { kind: 'under', line: 'aca400', ret: 'H' }, `1: the plan stays under the 400% line at 60 (${JSON.stringify(p1)})`);
  // Just over the line the premium saved (about 6,400) alone brings the need under the cap, so no Roth is needed
  // here (Texas: with the guard off the MAGI iteration settles on the high fixed point, 12,000 charged at 62,898;
  // the low one, about 5,600 charged at about 56,500, is also consistent and is what the cap finds).
  assert(on1.rothWithdrawn >= off1.rothWithdrawn, 'no less Roth');
  // This pair is also the mutation check for the MAGI room: on1 is the plan applied (`apply`, the default run with the guard
  // on); removing the cap (guard off) changes the result.
  assert(off1.magiProxy > 62600 && on1.magiProxy !== off1.magiProxy, '1: mutation check: without the cap the year is different');

  // 1b. Further over (about 71,000): even with the lower premium the need exceeds the room under the line, so the
  //     capped shortfall falls through to Roth (the strategy's own order, before the cap is released).
  const s1b = await findSpending(G, 70000, 72000);
  const off1b = await first({ ...G, spending: s1b, cliffGuardEnabled: false });
  const on1b = await first({ ...G, spending: s1b, cliffGuardEnabled: true });
  assert(on1b.magiProxy <= 62600, `1b: guard on stays under (${on1b.magiProxy})`);
  assert(/^stayed under ACA 400% line/.test(on1b.cliffChoice), `1b: cliffChoice ${on1b.cliffChoice}`);
  assert.deepStrictEqual(intentAt(await planOf(page, { ...G, spending: s1b, cliffGuardEnabled: true }), 60), { kind: 'under', line: 'aca400', ret: 'H' }, '1b: plan intent');
  assert(on1b.rothWithdrawn > off1b.rothWithdrawn + 100, `1b: the shortfall came from Roth (${on1b.rothWithdrawn})`);
  assert(on1b.total > off1b.total, '1b: ends the year with more');

  // 2. Far over the line (about 150,000) with a high lambda: staying under would replace about 87,000 of
  //    traditional (worth 1 - lambda) with Roth (worth 1) to save a credit of about 5,800. That loses when
  //    lambda exceeds this year's marginal rate (24%) by more than 5,800 / 87,000, so crossing wins.
  //    (With lambda 0, as in case 1, staying under always wins: the Roth draw also saves this year's tax.)
  const H = { ...G, trad401kA: 8000000, lifeExpectancyA: 90 };
  const s2 = await findSpending(H, 140000, 160000);
  const on2 = await first({ ...H, spending: s2, cliffGuardEnabled: true });
  // The chooser's trace shows the stay-under tried and met, but scored below the natural year; the plan keeps no intent.
  const tr2 = (await traceOf({ ...H, spending: s2, cliffGuardEnabled: true })).find((t) => t.year === 0);
  const nat2 = tr2.candidates.find((c) => c.kind === 'none'),
    und2 = tr2.candidates.find((c) => c.kind === 'under');
  assert(und2 && und2.ok && und2.score < nat2.score, `2: the stay-under met its line but scored lower (${JSON.stringify(tr2.candidates)})`);
  assert.strictEqual(intentAt(await planOf(page, { ...H, spending: s2, cliffGuardEnabled: true }), 60), null, '2: no intent at 60');
  assert(on2.magiProxy > 62600, 'crossing wins far over the line');
  assert.strictEqual(on2.cliffChoice, undefined);

  // 3. Fill to the Medicaid line: California, Medicaid declined, MAGI under 138% pays the full premium;
  //    just over it pays about 3.1% of income.
  //    No housing cost here: the default mortgage alone (about 26,400 a year) puts MAGI over the line at zero spending.
  const F = { ...G, stateTax: 'ca', medicaidWhenEligible: false, pensionYearlyA: 8000, tenure: 'rent', rent: 0 };
  const s3 = await findSpending(F, 15650, 21597);
  const on3 = await first({ ...F, spending: s3, cliffGuardEnabled: true });
  assert(/^filled to Medicaid line/.test(on3.cliffChoice), `cliffChoice ${on3.cliffChoice}`);
  assert.deepStrictEqual(intentAt(await planOf(page, { ...F, spending: s3, cliffGuardEnabled: true }), 60), { kind: 'fill', line: 'medicaid', ret: 'H' }, '3: plan fills to the Medicaid line at 60');
  assert(on3.magiProxy > 21597, 'MAGI just over the line');
  const expect3 = await taxCall(page, F, 'acaNetCost', [on3.magiProxy, 1, 12000, 0]);
  near(on3.healthcare, expect3, 0.5, 'premium priced at the realized MAGI');

  // 4. Nothing in reach (no ACA, age 50, no children): identical rows with the guard on and off; the plan is empty and only
  //    `none` was a candidate.
  const N = { ...G, acaEnabled: false, ageA: 50, retireAgeA: 50, lifeExpectancyA: 54, spending: 50000 };
  const a = await rows(page, { ...N, cliffGuardEnabled: false }),
    b = await rows(page, { ...N, cliffGuardEnabled: true });
  assert.deepStrictEqual(b, a, 'skip path is identical');
  const p4 = await planOf(page, { ...N, cliffGuardEnabled: true });
  assert.deepStrictEqual(p4.plan.intents, {}, '4: empty plan');
  assert.deepStrictEqual(p4.report.candidates.map((c) => c.family), ['none'], '4: only none was a candidate');


  // 3b. Fill to the nearest FLOOR, not the nearest line: natural MAGI under 100% of the poverty line. In California
  //     with Medicaid declined the 100% line is not a floor (the full 12,000 premium on both sides: no credit under it,
  //     declined Medicaid over it); the Medicaid line (138%, 21,597) is. Filled to 21,598: ratio 21,598 / 15,650 =
  //     1.38006; applicable percentage 3.14 + 1.05 x (1.38006 - 1.33) / 0.17 = 3.44922%; premium 21,598 x 3.44922% = 744.96.
  // (Natural MAGI near the top of that band, so the floor is within reach: from 8,000 up to twice the need.)
  const s3b = await findSpending(F, 14700, 15650);
  const off3b = await first({ ...F, spending: s3b, cliffGuardEnabled: false });
  const on3b = await first({ ...F, spending: s3b, cliffGuardEnabled: true });
  near(off3b.healthcare, 12000, 0.01, '3b: guard off pays the full premium under 100%');
  assert(/^filled to Medicaid line/.test(on3b.cliffChoice), `3b: cliffChoice ${on3b.cliffChoice}`);
  assert.deepStrictEqual(intentAt(await planOf(page, { ...F, spending: s3b, cliffGuardEnabled: true }), 60), { kind: 'fill', line: 'medicaid', ret: 'H' }, '3b: plan intent');
  near(on3b.magiProxy, 21598, 0.01, '3b: MAGI just over the Medicaid line');
  near(on3b.healthcare, 744.96, 0.01, '3b: premium at 138%');
  assert(on3b.total > off3b.total, '3b: ends the year with more');

  // 5. No penalty-free traditional money (55, IRA only, no Rule of 55): the fill is never offered, with natural MAGI
  //    between the 100% line and the Medicaid floor, where a fill would pay. Positive control: the same household with
  //    the money in a Rule of 55 401(k) is offered the fill and takes it. (No Roth or cash: the draw is traditional.)
  const P0 = { ...G, ageA: 55, retireAgeA: 55, lifeExpectancyA: 57, rothIraA: 0, rothIraBasisA: 0, stateTax: 'ca', medicaidWhenEligible: false, pensionYearlyA: 8000, tenure: 'rent', rent: 0 };
  const Ppen = { ...P0, trad401kA: 0, tradIraA: 600000, ruleOf55A: false },
    Pfree = { ...P0, trad401kA: 600000, tradIraA: 0, ruleOf55A: true };
  const s5 = await findSpending(Ppen, 15650, 21597);
  const tr5 = await traceOf({ ...Ppen, spending: s5, cliffGuardEnabled: true });
  assert(kinds(tr5, 0).includes('none'), 'precondition: the guard looked at year 0');
  assert(!kinds(tr5, 0).includes('fill'), `no fill offered from penalized money (${kinds(tr5, 0)})`);
  const pr = await rows(page, { ...Ppen, spending: s5, cliffGuardEnabled: true });
  assert(pr.every((r) => !/^filled/.test(r.cliffChoice || '')), 'no fill from penalized money');
  const s5c = await findSpending(Pfree, 15650, 21597);
  const tr5c = await traceOf({ ...Pfree, spending: s5c, cliffGuardEnabled: true });
  assert(kinds(tr5c, 0).includes('fill'), `positive control: fill offered with Rule of 55 money (${kinds(tr5c, 0)})`);
  assert(/^filled to Medicaid line/.test((await first({ ...Pfree, spending: s5c, cliffGuardEnabled: true })).cliffChoice || ''), 'positive control: filled');
  assert.strictEqual(intentAt(await planOf(page, { ...Ppen, spending: s5, cliffGuardEnabled: true }), 55), null, '5: no plan intent from penalized money');
  assert.deepStrictEqual(intentAt(await planOf(page, { ...Pfree, spending: s5c, cliffGuardEnabled: true }), 55), { kind: 'fill', line: 'medicaid', ret: 'H' }, '5: positive control: plan intent');

  // 5b. An 'under' candidate that does not stay under is not eligible: the taxable account (66,000, all gain, sold
  //     first) alone puts MAGI at 66,000, over the 400% line (62,600); capping traditional cannot undo that, so the
  //     capped candidate realizes 66,000 > target 62,599 + 1 and the natural draw is kept (it used to be able to win
  //     just from drawing Roth instead of traditional).
  const U = { ...G, taxable: 66000, basisRatio: 0, dividendYield: 0, tenure: 'rent', rent: 0, spending: 90000 };
  const trU = (await traceOf({ ...U, cliffGuardEnabled: true })).find((t) => t.year === 0);
  const capU = (trU.candidates || []).find((c) => c.kind === 'under');
  assert(capU, 'precondition: an under candidate was tried');
  near(capU.magi, 62599, 1e-6, '5b: target');
  near(capU.realized, 66000, 0.01, '5b: realized MAGI, the gain alone');
  assert.strictEqual(capU.ok, false, '5b: not eligible');
  const offU = await first({ ...U, cliffGuardEnabled: false }),
    onU = await first({ ...U, cliffGuardEnabled: true });
  assert.strictEqual(onU.cliffChoice, undefined, '5b: not labelled');
  near(onU.total, offU.total, 1e-6, '5b: same year as with the guard off');
  assert.strictEqual(intentAt(await planOf(page, { ...U, cliffGuardEnabled: true }), 60), null, '5b: no plan intent');

  // 6. Survivor transition: A-dies equals B-dies with the guard on (identical partners).
  const SV = { ...G, singlePerson: false, ageB: 60, retireAgeB: 60, lifeExpectancyA: 70, lifeExpectancyB: 70, trad401kB: 600000, survivorEnabled: true, survivorDeathAge: 63, spending: 70000, cliffGuardEnabled: true };
  const dA = await rows(page, { ...SV, survivorPartner: 'A' }),
    dB = await rows(page, { ...SV, survivorPartner: 'B' });
  for (let i = 0; i < dA.length; i++) near(dA[i].total, dB[i].total, 0.01, `survivor symmetry, year ${i}`);

  // 7. Determinism: the same scenario twice gives identical rows.
  assert.deepStrictEqual(await rows(page, { ...G, spending: s1, cliffGuardEnabled: true }), await rows(page, { ...G, spending: s1, cliffGuardEnabled: true }));

  // 8. Bucket engine, a down year paid from cash: finite results.
  const hist = await page.evaluate((patch) => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return window.__test_simulateHistorical(() => [2008, -37, 0, 5]).rows.map((r) => r.total);
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  }, { ...G, cash: 500000, bondYears: 2, spending: s1, cliffGuardEnabled: true });
  assert(hist.every(Number.isFinite), 'historical run finite');

  // 8b. Bucket engine down years paid from cash and the bond reserve: the guard is a no-op (cash and bonds keep their
  //     place; the bond step is never capped), so those years match the guard-off run exactly.
  const histRows = (guard) =>
    page.evaluate((patch) => {
      const st = window.__test_getState();
      const saved = JSON.parse(JSON.stringify(st));
      Object.assign(st, patch);
      try {
        return JSON.parse(JSON.stringify(window.__test_simulateHistorical(() => [2008, -37, 0, 5]).rows));
      } finally {
        for (const k of Object.keys(st)) delete st[k];
        Object.assign(st, saved);
      }
    }, { ...G, cash: 60000, trad401kA: 400000, bondYears: 3, retireAgeA: 62, lifeExpectancyA: 66, spending: s1b, dividendYield: 0, cliffGuardEnabled: guard });
  const hOff = await histRows(false),
    hOn = await histRows(true);
  // Ages 60-61 work (the ladder is built), 62 onward retired: the down years draw cash, then the bond reserve.
  const bondYearsRows = hOff.filter((r) => r.age >= 62 && r.bonds > 0);
  assert(bondYearsRows.length > 0, 'precondition: some retired years still hold bonds');
  for (const r of bondYearsRows) assert.deepStrictEqual(hOn[r.year], r, `down year at ${r.age} unchanged by the plan`);

  // 9. The primitives the guard relies on, on a hand-built withdrawal (single, 60, Texas; 2026 deduction 16,100).
  //    freeTraditional: only the penalty-free accounts count. withdrawStandard with a cap: traditional up to the
  //    room (20,000 gross, tax 10% of 3,900 = 390), then Roth, then cash, then the cap is released and the rest
  //    comes from traditional uncapped, so the target never strands the need.
  const prim = await page.evaluate(() => {
    const st = window.__test_getState();
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, { stateTax: 'tx', inflation: 0, singlePerson: true, tenure: 'rent' });
    try {
      const S = window.__test_solver;
      const profile = { filing: 'single', otherA: 0, otherB: 0, extraIncome: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0, ageA: 60, ageB: null, singlePerson: true, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 1, k401FracA: 0, k401FracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [] };
      const r = {};
      let wd = S.newTestWithdrawal({ traditional: 400000, bondTraditional: 100000 }, profile);
      r.freeAll = S.freeTraditional(wd);
      wd.status = [0, 1, 2, 3].map(() => ({ free: false, qualified: false }));
      r.freeNone = S.freeTraditional(wd);
      wd.accts.trad = [0.5, 0, 0.5, 0];
      wd.status = [{ free: true, qualified: true }, { free: false, qualified: false }, { free: false, qualified: false }, { free: false, qualified: false }];
      r.freeHalf = S.freeTraditional(wd);
      wd = S.newTestWithdrawal({ traditional: 500000, roth: 5000, cash: 2000 }, profile);
      wd.magiCap = { limit: 20000, off: false };
      wd.need = 40000;
      S.withdrawStandard(wd, { age: 60, remainingMagiRoom: Infinity });
      Object.assign(r, { need: wd.need, off: wd.magiCap.off, roth: wd.rothWithdrawn, cash: wd.bal.cash, tradGross: wd.traditionalGross });
      return r;
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  });
  assert.strictEqual(prim.freeAll, 500000, 'freeTraditional: everything free');
  assert.strictEqual(prim.freeNone, 0, 'freeTraditional: nothing free');
  near(prim.freeHalf, 250000, 1e-6, 'freeTraditional: one of two owners free');
  near(prim.need, 0, 0.01, 'release: need met');
  assert.strictEqual(prim.off, true, 'release: cap lifted');
  near(prim.roth, 5000, 1e-6, 'release: Roth drawn before the release');
  near(prim.cash, 0, 1e-6, 'release: cash drawn before the release');
  // After the release: 40,000 - 19,610 - 5,000 - 2,000 = 13,390 net more. Taxable income is 3,900: 8,500 more at
  // 10% (to the 12,400 bracket top) nets 7,650, the remaining 5,740 at 12% takes 5,740 / 0.88 gross.
  near(prim.tradGross, 20000 + 8500 + 5740 / 0.88, 0.5, 'release: the rest from traditional, uncapped');

  // 13.7 A: the IRMAA line sits on the tiers of the year the surcharge is charged. Household from the solver_scan grid:
  // single person, 62, 500k traditional, 2M taxable, Roth IRA 200k, 60k spending, smooth withdrawals, ACA on, Texas,
  // 2.5% inflation (the defaults). Age 63 (year 1; the surcharge is charged at 65, two years on). The natural MAGI
  // (guard off) is 113,610. This year's first IRMAA edge is 109,000 x 1.025 = 111,725; the one charged is 1.025^2 higher,
  // 117,381. Before 13.7 A the guard put the line at 111,725 and stayed under it ("stayed under IRMAA tier", MAGI
  // 111,724) although nothing jumps there: at 113,610 the household is still under the edge that is charged.
  {
    const { legacyToAccounts } = require('./legacy_balances');
    const H = {
      singlePerson: true, children: [], ageA: 62, ageB: 62, retireAgeA: 62, retireAgeB: 62, lifeExpectancyA: 95, lifeExpectancyB: 95,
      acaEnabled: true, acaEnhanced: false, stateTax: 'tx', taxable: 2000000, spending: 60000, smoothWithdrawals: true,
      withdrawalMixEnabled: false, rothConvEnabled: false, ruleOf55A: false, ruleOf55B: false, sepp72tK401A: false,
      ...legacyToAccounts({ traditional: 500000, roth: 200000 }, { singlePerson: true }),
    };
    const hOff = (await rows(page, { ...H, cliffGuardEnabled: false }))[1];
    const hOn = (await rows(page, { ...H, cliffGuardEnabled: true }))[1];
    assert.strictEqual(hOff.age, 63);
    assert(hOff.magiProxy > 111725 && hOff.magiProxy < 117381, `natural MAGI between the edges (${hOff.magiProxy})`);
    assert(!/IRMAA/.test(hOn.cliffChoice || ''), `no IRMAA stay-under between this year's edge and the charged one (${hOn.cliffChoice})`);
    near(hOn.magiProxy, hOff.magiProxy, 1, 'the guard leaves the natural MAGI alone');
  }

  assert.deepStrictEqual(errors, []);
  console.log('cliff_guard: OK');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
