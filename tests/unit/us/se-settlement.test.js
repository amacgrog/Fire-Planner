// The 162(l) settlement of a held phase (Batch 5 step 1, spec 6.1-6.4): a year whose MAGI iteration holds a deduction is
// settled at its final draws, at the return's price; the difference from what it paid is carried into the next year.
// Every household runs without the cliff plan (cliffGuardEnabled: false: the plan cache ignores ctx.test).
// Not constructed (scans of several thousand households on this branch found none; Task 3 report): a held year whose
// section 5.02 deduction breaks the legal bound (with one marketplace premium the price only steps down at the floor, and
// 5.02's MAGI is on the step-1 side of it: it needs a premium that falls with MAGI between the two, such as an in-year IRMAA
// appeal beside a marketplace premium near the floor); a Medicaid (kind 3) held year for one person (a hold never pays under
// the Medicaid line: the consistent deduction there is 0 and 5.02's is 0); a credited year whose return falls under 100% in Texas, and an
// uncredited one over 400% whose return falls under it (a converged hold moves the MAGI by about 2% of the change in draws,
// and the forced pass captures the kind at its realized MAGI). The closest reachable cases are below; the pricing itself
// is pinned in tests/unit/us/aca-reconcile.test.js.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
// tests/se_health.js's FP (Task 9a single, working, self-employed, no draws), with no medical inflation and no plan.
const FP = {
  ...ZERO, singlePerson: true, ageA: 50, retireAgeA: 60, incomeA: 60000, incomeKindA: 'self', acaEnabled: true, healthcare: 18000,
  stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0,
  megaBackdoor: false, cliffGuardEnabled: false,
};
// The invariant grid's retiree (tests/se_health.js): single, 60, retired, a self stream owned by A, no housing.
const stream = (amount) => ({ amount, startAge: 60, endAge: 70, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });
const IG = {
  ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, healthcare: 18000, stateTax: 'tx',
  inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0, cliffGuardEnabled: false,
};
// A married couple, A 66 on Medicare and B 60 on the marketplace and self-employed (one return: B's deduction covers A's
// Medicare premiums too); Roth money only, so the MAGI is B's net less the deduction.
const MIX = {
  ...ZERO, singlePerson: false, filingStatus: 'mfj', ageA: 66, ageB: 60, retireAgeA: 66, retireAgeB: 70, incomeA: 0, incomeKindA: 'wages',
  incomeB: 40000, incomeKindB: 'self', acaEnabled: true, healthcare: 18000, medicareYearly: 10000, stateTax: 'tx', inflation: 0, incomeGrowth: 0,
  medicalInflation: 0, k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, profitSharingPctA: 0, profitSharingPctB: 0, iraPctA: 0,
  iraPctB: 0, megaBackdoor: false, cliffGuardEnabled: false, tenure: 'rent', rent: 0, ssMonthlyA: 0, ssMonthlyB: 0, irmaaPriorKnown: false,
  employerCoversSpouseA: false, employerCoversSpouseB: false, rothIraA: 300000, spending: 20000,
};

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const { testHooks } = await w.load('us/core/test-hooks.js');
  const e = await engine(w);
  return { w, e, testHooks };
}
const runOf = (e) => ({ rows: e.simulateRaw().rows, trace: e.accountTrace() });
const settledYears = (rows) => rows.map((r, y) => ('seSettlement' in r ? y : -1)).filter((y) => y >= 0);
const firstSettled = (rows) => rows.findIndex((r) => 'seSettlement' in r);
// The applicable percentage between 133% and 150% of the poverty line (2026, not enhanced), written out.
const pctBand133 = (ratio) => 3.14 + ((4.19 - 3.14) * (ratio - 1.33)) / (1.5 - 1.33);

it('held year settles: the amount is the difference, and the next year receives it', async () => {
  const { e } = await setup({ ...FP, incomeA: 82000 });
  const { rows } = runOf(e);
  const y = firstSettled(rows);
  expect(y).toBe(0);
  const r = rows[y];
  expect(r.seSettlement).toBe((r.healthcare - r.healthcareSettled) + (r.tax - r.taxSettled));
  expect(r.seSettlement !== 0).toBe(true);
  expect(rows[y + 1].seSettlementIn).toBe(r.seSettlement);
  // the five fields appear only in settled rows
  for (const row of rows) expect('healthcareSettled' in row).toBe('seSettlement' in row);
});

it('settled MAGI recorded: the hold replaced by the settled deduction, the years before identical', async () => {
  const { e, testHooks } = await setup({ ...FP, incomeA: 82000 });
  testHooks.testSeNoSettle = true;
  const off = runOf(e);
  testHooks.testSeNoSettle = false;
  const { rows } = runOf(e);
  const y = firstSettled(rows);
  expect(settledYears(off.rows)).toStrictEqual([]);
  expect(rows.slice(0, y)).toStrictEqual(off.rows.slice(0, y));
  const hold = off.trace[y].profile.seHealthA;
  expect(hold !== rows[y].seDeductionA).toBe(true);
  expect(Math.abs(rows[y].magiProxy - (off.rows[y].magiProxy + hold - rows[y].seDeductionA)) <= 1e-6).toBe(true);
  // the year keeps what it paid
  expect(rows[y].healthcare).toBe(off.rows[y].healthcare);
  expect(rows[y].tax).toBe(off.rows[y].tax);
});

it("return's price: healthcareSettled is acaNetCost at the recorded MAGI and the paid kind", async () => {
  const { w, e } = await setup({ ...FP, incomeA: 82000 });
  const { rows, trace } = runOf(e);
  const aca = await w.load('us/core/healthcare/aca.js');
  const ctx = await w.ctx();
  for (const y of settledYears(rows).slice(0, 3))
    expect(rows[y].healthcareSettled).toBe(aca.acaNetCost(ctx, rows[y].magiProxy, 1, 18000, y, trace[y].seSettle.kindA));
});

it('legal bound: the settled deduction is at most the return premium (+$1) and the plan net', async () => {
  for (const incomeA of [70000, 74000, 82000, 86000]) {
    const { e } = await setup({ ...FP, incomeA });
    const { rows, trace } = runOf(e);
    const ys = settledYears(rows);
    expect(ys.length > 0).toBe(true);
    for (const y of ys) {
      expect(rows[y].seDeductionA <= rows[y].healthcareSettled + 1).toBe(true);
      expect(rows[y].seDeductionA <= trace[y].profile.sePlanNetA).toBe(true);
      expect(trace[y].profile.seHealthA).toBe(rows[y].seDeductionA);
    }
  }
});

it('settleChoice: the lowest sum, the lowest index on a tie', async () => {
  const w = await world();
  const { settleChoice } = await w.load('us/core/projection/run-projection.js');
  expect(settleChoice([5, 5], 2)).toBe(0);
  expect(settleChoice([7, 5], 2)).toBe(1);
  expect(settleChoice([4, 3, 3, 9], 4)).toBe(1);
  expect(settleChoice([2, 9, 9, 9], 1)).toBe(0);
});

it('400% jump claims lo: no consistent deduction at net 76,207; lo beats 5.02 at the same full premium', async () => {
  const { e } = await setup({ ...FP, incomeA: 82000 });
  const { rows, trace } = runOf(e);
  const y = firstSettled(rows);
  const s = trace[y].seSettle;
  expect(trace[y].profile.sePlanNetA).toBe(76206.8845);
  expect(s.kindA).toBe(2);
  expect(s.partsA).toBe('lo');
  expect(rows[y].seDeductionA).toBe(s.loA);
  expect(rows[y].seDeductionA > s.d502A).toBe(true);
  expect(rows[y].healthcareSettled).toBe(18000);
  // 5.02's passes the bound (the price rises with MAGI here): two candidates, 5.02's first
  expect(s.sums.length).toBe(2);
  const chosen = rows[y].healthcareSettled + rows[y].taxSettled;
  expect(chosen).toBe(s.sums[1]);
  for (const v of s.sums) expect(chosen <= v).toBe(true);
});

it("Medicaid line, expansion state: a credited year whose return falls under the line keeps the credit, not Medicaid's $0", async () => {
  // tests/se_health.js's Medicaid-line household (California, box on), the plan net $50 over the line: year 0 holds section
  // 5.02's 0 and pays the credit at its MAGI over the line (kind 1); the return's consistent deduction takes the MAGI under the
  // line (Treas. Reg. 1.36B-2(c)(2)(v): still the credit). The return cannot reach 133% (where the rate is 2.1%): a deduction
  // of about 3.2% of the MAGI moves it from over 138% to about 134%, so the credit is the 133-150% band's (written out).
  const line = 1.38 * 15650, k = 1 - ((0.124 + 0.029) * 0.9235) / 2;
  const { e } = await setup({ ...FP, stateTax: 'ca', medicaidWhenEligible: true, incomeA: (line + 50) / k });
  const { rows, trace } = runOf(e);
  expect(firstSettled(rows)).toBe(0);
  const r = rows[0], s = trace[0].seSettle;
  expect(s.kindA).toBe(1);
  expect(r.healthcare > 0).toBe(true);
  expect(r.magiProxy < line).toBe(true);
  expect(r.magiProxy / 15650 > 1.33).toBe(true);
  expect(r.healthcareSettled > 0).toBe(true);
  const want = (r.magiProxy * pctBand133(r.magiProxy / 15650)) / 100;
  expect(Math.abs(r.healthcareSettled - want) <= 1e-9).toBe(true);
  expect(s.partsA).toBe('consistent');
});

it('reconciliation price under 133%: a Texas credited year is settled at the 2.1% credit at the return MAGI (closest to a floor crossing)', async () => {
  // A retiree drawing from a traditional IRA, a $500 self stream: year 0 holds, ends in the forced pass, pays a credited premium
  // (kind 1) and settles a little under what it paid (a balance due). The brief's case (a credited year whose return falls
  // under 100%) was not found in the scans of this branch (Task 3 report): a converged hold moves the MAGI by only about 2% of
  // the change in draws, and the forced pass captures the kind at its realized MAGI.
  const { e } = await setup({ ...IG, tradIraA: 600000, medicaidWhenEligible: true, spending: 15000, incomeSources: [stream(500)] });
  const { rows, trace } = runOf(e);
  expect(firstSettled(rows)).toBe(0);
  const r = rows[0];
  expect(trace[0].forcedPass).toBe(true);
  expect(trace[0].seSettle.kindA).toBe(1);
  expect(r.magiProxy / 15650 < 1.33).toBe(true);
  expect(r.healthcareSettled).toBe((r.magiProxy * 2.1) / 100);
  expect(r.seSettlement < 0).toBe(true);
});

it('uncredited year gets the credit: a year that paid the full premium under the floor, whose return is in the band', async () => {
  // MIX in year 1 (B's net about 33,640): the year pays B's full marketplace premium under 100% (kind 2) plus A's Medicare; the
  // return's deduction (B's premium and A's Medicare) puts the MAGI at 133% of the two-person line, where the return claims the
  // credit it did not get in advance (written out: A's Medicare 5,000 plus B's credit; no IRMAA, an appeal year). The brief's
  // case (paid over 400%, settled under it) was not found in the scans (Task 3 report).
  const { e } = await setup({ ...MIX, retireAgeA: 67, incomeA: 50000, irmaaPriorKnown: true, irmaaMagiPrior1: 300000, irmaaMagiPrior2: 300000, incomeB: 36200 });
  const { rows, trace } = runOf(e);
  const y = 1, r = rows[y], s = trace[y].seSettle;
  expect(s.kindA).toBe(2);
  expect(r.healthcare).toBe(14000);
  const ratio = r.magiProxy / 21150;
  expect(ratio > 1.33 && ratio < 1.5).toBe(true);
  const want = 5000 + (r.magiProxy * pctBand133(ratio)) / 100;
  expect(Math.abs(r.healthcareSettled - want) <= 1e-6).toBe(true);
  expect(r.healthcareSettled < 14000).toBe(true);
  expect(r.seSettlement > 0).toBe(true);
});

it('forced unheld year has no deduction: a step-1 deduction of 0 (the Solo plan takes the whole net) never settles', async () => {
  const solo = { ...stream(4000), contribute: true, deferralPct: 100, profitSharingPct: 25 };
  const { w, e } = await setup({ ...IG, tradIraA: 600000, spending: 15000, incomeSources: [solo] });
  const { rows, trace } = runOf(e);
  const forced = trace.map((t, y) => (t.forcedPass ? y : -1)).filter((y) => y >= 0);
  expect(forced.length > 0).toBe(true);
  for (const y of forced) {
    expect(trace[y].profile.seAllowA).toBe(true);
    expect(trace[y].profile.seHealthA).toBe(0);
    expect('seSettlement' in rows[y]).toBe(false);
    expect(trace[y].seSettle).toBe(null);
  }
  expect(w.country).toBe('us');
});

it('two returns: both parts settled, the rows read the settled pair', async () => {
  const w = await world();
  const { returnMagis } = await w.load('us/core/healthcare/irmaa.js');
  for (const incomeA of [70000, 72000, 74000]) {
    await w.setState({ ...ZERO, singlePerson: false, ageA: 50, ageB: 50, retireAgeA: 60, retireAgeB: 50, incomeA, incomeKindA: 'self', incomeB: 0, filingStatus: 'single', acaEnabled: true, healthcare: 18000, stateTax: 'tx', inflation: 0, incomeGrowth: 0, medicalInflation: 0, k401PctA: 0, catchupPctA: 0, profitSharingPctA: 0, iraPctA: 0, k401PctB: 0, iraPctB: 0, megaBackdoor: false, children: [], cliffGuardEnabled: false });
    const e = await engine(w);
    const { rows, trace } = runOf(e);
    const y = firstSettled(rows);
    expect(y).toBe(0);
    const r = rows[y], s = trace[y].seSettle;
    expect(s.partsA === 'none' || s.partsB === 'none').toBe(false);
    const [mA, mB] = returnMagis(trace[y].profile, 0, 0);
    expect(r.magiA).toBe(mA);
    expect(r.magiB).toBe(mB);
    expect(Math.abs(r.magiA + r.magiB - r.magiProxy) <= 1e-6).toBe(true);
    // both parts consistent here (one candidate each: nA * nB = 1)
    expect([s.partsA, s.partsB]).toStrictEqual(['consistent', 'consistent']);
    expect(s.sums.length).toBe(1);
    expect(r.seDeductionB).toBe(0);
    expect(r.seDeductionA <= r.healthcareSettled + 1).toBe(true);
  }
});

it('year-0 stand-in: with no prior MAGIs the return prices IRMAA on its own settled MAGI', async () => {
  // MIX: A 66 on Medicare (IRMAA's year-0 lookback is the year's own MAGI, irmaaMagiHistory[0], with irmaaPriorKnown off), B 60
  // on the marketplace and self-employed for 105,500 (B's deduction also covers A's Medicare premiums). Year 0 holds and pays
  // B's full premium over 400% of the two-person line; the return claims lo at that line, so its MAGI moves (found by a scan
  // of B's income by $500).
  const { w, e, testHooks } = await setup({ ...MIX, incomeB: 105500 });
  const { irmaaMagiOf } = await w.load('us/core/healthcare/irmaa.js');
  const { rows, trace } = runOf(e);
  testHooks.testSeNoSettle = true;
  const off = runOf(e);
  testHooks.testSeNoSettle = false;
  expect(trace[0].medA).toBe(true);
  expect(trace[0].profile.seAllowB).toBe(true);
  expect(trace[0].seSettle.partsA).toBe('lo');
  expect(off.rows[0].magiProxy !== rows[0].magiProxy).toBe(true);
  expect(trace[0].seSettle.hist0).toBe(irmaaMagiOf(rows[0].magiProxy, 0, 'mfj'));
});

it('IRMAA two years on and the appeal read the settled MAGI (tests/irmaa_appeal.js case 15 variant)', async () => {
  // Single, 66, wages 200,000 to 68, then a self stream of 128,700 (ages 60-80): year 2 holds section 5.02's 10,000 and pay
  // IRMAA tier 1 in the appeal window. The return claims lo, the largest deduction that keeps the MAGI over the tier-1 line (the
  // charge stays tier 1, so lo is legal), a lower tax at the same premium. The return's MAGI sits just over this year's line, so
  // with no inflation it would sit in the paid one's tier two years on too: inflation 0.1% indexes year y + 2's line (109,000 x
  // 1.001^(y+2)) between the settled MAGI (just over 109,000 x 1.001^y) and the paid one (119,607.63 - 10,000), so the lookback
  // tier differs. The Medicare premium inflates too: the IRMAA is compared through the difference of the two runs' charges.
  const QUIET = {
    stateTax: 'tx', acaEnabled: false, inflation: 0.1, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0,
    bondYears: 0, ...ZERO, cashReserve: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeA: 0, incomeB: 0, spending: 120000,
    medicareYearly: 10000, ltcEnabled: false, guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false,
    children: [], loans: [], incomeSources: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [],
    pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0, incomeGrowth: 0, k401PctA: 0, k401PctB: 0, catchupPctA: 0,
    catchupPctB: 0, iraPctA: 0, iraPctB: 0, profitSharingPctA: 0, profitSharingPctB: 0, megaBackdoor: false, cliffGuardEnabled: false,
  };
  const SELF = { amount: 128700, startAge: 60, endAge: 80, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, profitSharingPct: 0 };
  const { w, e, testHooks } = await setup({ ...QUIET, singlePerson: true, ageA: 66, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages', retireAgeA: 68, incomeSources: [SELF] });
  const { irmaaMagiOf, irmaaSurcharge } = await w.load('us/core/healthcare/irmaa.js');
  const ctx = await w.ctx();
  testHooks.testSeNoSettle = true;
  const off = runOf(e);
  testHooks.testSeNoSettle = false;
  const { rows, trace } = runOf(e);
  // (with the inflation, year 3 converges: only year 2 holds)
  expect(firstSettled(rows)).toBe(2);
  for (const y of [2]) {
    const r = rows[y];
    expect(trace[y].seSettle.partsA).toBe('lo');
    // the hold is section 5.02's (the Medicare premium, no IRMAA at the step-1 MAGI), the same at the final draws
    expect(trace[y].seSettle.d502A).toBe(off.trace[y].profile.seHealthA);
    expect(r.seDeductionA > trace[y].seSettle.d502A).toBe(true);
    // the settled row's in-year (appealed) IRMAA is the charge at its own settled MAGI: tier 1, the paid one's (the same
    // Medicare plus the same charge: the same double as the paid premium)
    const irmaa = irmaaSurcharge(ctx, irmaaMagiOf(r.magiProxy, 0, 'single'), 'single', y);
    expect(irmaa).toBe(1148.4);
    expect(irmaaSurcharge(ctx, irmaaMagiOf(off.rows[y].magiProxy, 0, 'single'), 'single', y)).toBe(1148.4);
    expect(r.healthcareSettled).toBe(off.rows[y].healthcare);
    // the appeal: this year's MAGI (the event year) gives the charge
    expect(r.irmaaAppealYearA).toBe(2028);
  }
  // two years on (year 4, past the appeal window): the lookback reads the settled MAGI, a lower tier than the paid one
  for (const y of [4]) {
    const settled = irmaaSurcharge(ctx, irmaaMagiOf(rows[y - 2].magiProxy, 0, 'single'), 'single', y),
      paid = irmaaSurcharge(ctx, irmaaMagiOf(off.rows[y - 2].magiProxy, 0, 'single'), 'single', y);
    expect([settled, paid]).toStrictEqual([0, 1148.4]);
    expect(Math.abs(rows[y].healthcare - off.rows[y].healthcare - (settled - paid)) <= 1e-9).toBe(true);
  }
});

// The forced pass under a carry (spec 6.5; Task 2's carried gap): a retiree with a $10,000 self stream, $300,000 taxable at 30%
// basis and a $6,000 premium, guardrails on; year 2 holds and ends in the forced pass. The carry is injected into year 1's
// outgoing carry (testSeCarryAt), so year 2's cash flow is its own flow (flowOwn) plus the carry.
const FC = { ...IG, healthcare: 6000, taxable: 300000, basisRatio: 30, guardrailsEnabled: true, incomeSources: [stream(10000)] };
const Y = 2;
async function carryRun(spending, amount) {
  const { e, testHooks } = await setup({ ...FC, spending });
  testHooks.testSeCarryAt = { year: Y - 1, amount };
  const { rows, trace } = runOf(e);
  testHooks.testSeCarryAt = null;
  return { rows, trace, t: trace[Y], flow: trace[Y].flowOwn + (rows[Y].seSettlementIn || 0) };
}

it('forced pass under a carry, flowOwn >= 0 > flow: a balance due makes the year draw; the forced pass records nothing', async () => {
  const { rows, trace, t, flow } = await carryRun(500, -10750);
  expect(rows[Y].seSettlementIn).toBe(-10750);
  expect(t.flowOwn >= 0 && flow < 0).toBe(true);
  expect(t.forcedPass).toBe(true);
  expect(t.forcedRefund > 0).toBe(true);
  expect(t.seSettle === null).toBe(false);
  // no record, as a surplus year (the multiplier may move: it runs at the year's start)
  const g = t.guardrails, g0 = trace[Y - 1].guardrails;
  expect([g.prevNeed, g.prevPortfolio, g.initialWR]).toStrictEqual([g0.prevNeed, g0.prevPortfolio, g0.initialWR]);
  expect(g.prevPortfolio !== t.gpBase).toBe(true);
});

it('forced pass under a carry, flowOwn < 0: the re-record is the own need net of the refund', async () => {
  // a refund that does not tip the year (flow stays below 0)
  const { t, flow } = await carryRun(4000, 1000);
  expect(t.flowOwn < 0 && flow < 0).toBe(true);
  expect(t.forcedPass).toBe(true);
  expect(t.forcedRefund > 0).toBe(true);
  expect(t.guardrails.prevNeed).toBe(Math.max(0, -t.flowOwn - t.forcedRefund - 0));
  expect(t.guardrails.prevPortfolio).toBe(t.gpBase);
});

it('a refund that tips the forced year into a surplus, flowOwn < 0 <= flow: no forced pass, the own need is recorded', async () => {
  const { t, flow } = await carryRun(4000, 0);
  expect(t.forcedPass).toBe(true);
  const tip = await carryRun(4000, 3000);
  expect(tip.t.flowOwn).toBe(t.flowOwn);
  expect(tip.t.flowOwn < 0 && tip.flow >= 0).toBe(true);
  expect(tip.t.forcedRefund).toBe(0);
  expect(tip.t.guardrails.prevNeed).toBe(Math.max(0, -tip.t.flowOwn - 0));
  expect(tip.t.guardrails.prevPortfolio).toBe(tip.t.gpBase);
  expect(flow < 0).toBe(true);
});

it('historical and Monte Carlo: a settled household is deterministic', async () => {
  const { w, e } = await setup({ ...FP, incomeA: 82000 });
  const sim = await w.load('shared/core/projection/simulate.js');
  const rowFn = (y) => [2000 + y, 7, 2.5, 4, 4];
  const h1 = e.simulateHistoricalRaw(rowFn), h2 = e.simulateHistoricalRaw(rowFn);
  expect(settledYears(h1.rows).length > 0).toBe(true);
  expect(h2.rows).toStrictEqual(h1.rows);
  const m1 = sim.runMonteCarlo(2), m2 = sim.runMonteCarlo(2);
  expect(m1.paths.some((p) => settledYears(p.rows).length > 0)).toBe(true);
  expect(m2.paths.map((p) => p.rows)).toStrictEqual(m1.paths.map((p) => p.rows));
});
