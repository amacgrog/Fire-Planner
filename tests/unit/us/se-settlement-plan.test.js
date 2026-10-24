// The cliff plan judges a held phase on its settled return (Batch 5, decision 4, spec 6.7): the natural record and each trial
// record carry the return's premium (healthcareSettled) and the IRMAA at the settled MAGI in their cliffCost, the score counts
// the settlement, a stay-under the return breaks is not met, and computeCliffPlan's cost sums the return's figures.
// Every run goes through usPlan(w).runPlanMode with an explicit plan mode (the plan cache ignores ctx.test).
// Not constructed: a held year whose settled MAGI and in-year MAGI sit in different IRMAA tiers (a scan of 372 Medicare
// households with a held year found none: the settled MAGI of an IRMAA hold lands just over the tier edge the hold is over);
// so the IRMAA part of the natural cliffCost is pinned at the settled MAGI (the identity), not against a moved tier. Nor a
// natural phase held and kept, with trials, whose return premium moved (scans of about 5,000 grid households: every one sits
// at the 400% jump, where the return pays the full premium too); the moved premium is pinned on a kept trial.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';

const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
const stream = (amount) => ({ amount, startAge: 55, endAge: 75, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 0, profitSharingPct: 0, healthPremium: 0 });
// The invariant grid's retiree (tests/se_health.js) with the cliff plan on: single, 60, retired, a self stream owned by A, Texas,
// premium 18,000, no inflation, no housing.
const IG = {
  ...ZERO, singlePerson: true, ageA: 60, retireAgeA: 60, incomeA: 0, incomeKindA: 'wages', acaEnabled: true, healthcare: 18000, stateTax: 'tx',
  inflation: 0, incomeGrowth: 0, medicalInflation: 0, ssMonthlyA: 0, tenure: 'rent', rent: 0, cliffGuardEnabled: true,
};
// Natural phase held and kept in year 1 (its first held year), with trials (ACA lines in reach); A is 61 then, so no IRMAA
// is priced (Medicare two years on starts at 65).
const NAT = { ...IG, taxable: 100000, tradIraA: 600000, basisRatio: 30, spending: 74000, incomeSources: [stream(43000)] };
const NAT_Y = 1;
// A stay-under of the ACA 400% line that the return breaks in year 3: met in-year (at the hold), over the line once settled.
const BROKEN = { ...IG, taxable: 200000, tradIraA: 700000, basisRatio: 100, spending: 80000, incomeSources: [stream(12000)] };
const BROKEN_Y = 3;
// A fill to the ACA credit floor (100%, Texas) kept and held from year 0: the hold's in-year MAGI priced a larger credit than
// the return's MAGI allows (a balance due).
const FILL = { ...IG, taxable: 100000, tradIraA: 600000, basisRatio: 60, spending: 16000, incomeSources: [stream(10000)] };
// tests/se_health.js's held household (tests/irmaa_appeal.js case 15 variant: single, 66, wages to 68, then a self stream; no
// ACA; IRMAA appeal years 2 and 3 hold) with the cliff plan on: year 2 is held, a choose year with no line in reach.
const HELD = {
  stateTax: 'tx', acaEnabled: false, inflation: 0, medicalInflation: 0, hysaRate: 0, dividendYield: 0, returnRate: 0, bondReturn: 0, bondYears: 0, ...ZERO,
  cashReserve: 0, tenure: 'rent', rent: 0, rentGrowth: 0, maintenance: 0, incomeB: 0, spending: 120000, medicareYearly: 10000, ltcEnabled: false,
  guardrailsEnabled: false, survivorEnabled: false, rothConvEnabled: false, irmaaPriorKnown: false, children: [], loans: [], oneTimeIncome: [],
  extraExpenses: [], lumpExpenses: [], spendingTiers: [], pensionYearlyA: 0, pensionYearlyB: 0, ssMonthlyA: 0, ssMonthlyB: 0, incomeGrowth: 0,
  k401PctA: 0, k401PctB: 0, catchupPctA: 0, catchupPctB: 0, iraPctA: 0, iraPctB: 0, profitSharingPctA: 0, profitSharingPctB: 0, megaBackdoor: false,
  singlePerson: true, ageA: 66, lifeExpectancyA: 80, incomeA: 200000, incomeKindA: 'wages', retireAgeA: 68, cliffGuardEnabled: true,
  incomeSources: [{ amount: 128700, startAge: 60, endAge: 80, followGrowth: false, growth: 0, owner: 'A', kind: 'self', contribute: false, profitSharingPct: 0 }],
};
const HELD_Y = 2;

async function setup(patch) {
  const w = await world();
  await w.setState(patch);
  const { testHooks } = await w.load('us/core/test-hooks.js');
  const P = await usPlan(w);
  // a choose run with its trace, with the settlement on or off (restored after)
  const choose = (noSettle = false) => {
    testHooks.testSeNoSettle = noSettle;
    const r = P.runPlanMode({ planMode: 'choose', planTrace: true });
    testHooks.testSeNoSettle = false;
    return r;
  };
  return { w, P, testHooks, choose };
}
const traceAt = (run, y) => run.trace.find((t) => t.year === y);
const firstSettled = (rows) => rows.findIndex((r) => 'seSettlement' in r);

it('natural record is settled: realized is the recorded MAGI, cliffCost the return premium', async () => {
  const { choose } = await setup(NAT);
  const { rows, trace } = choose();
  const y = NAT_Y;
  expect(firstSettled(rows)).toBe(y);
  expect(rows[y].cliffChoice).toBe(undefined);
  const t = trace.find((x) => x.year === y);
  expect(t.candidates.length > 1).toBe(true);
  const nat = t.candidates[0];
  expect(nat.kind).toBe('none');
  expect(nat.realized).toBe(rows[y].magiProxy);
  // no IRMAA is priced (A is 61): cliffCost = healthcareSettled + 0 (at the 400% jump the return's premium is the full one
  // the year paid; the moved premium is pinned on a kept trial below)
  expect(nat.cliffCost).toBe(rows[y].healthcareSettled + 0);
});

it('trial record is settled: a kept fill held in year 0 carries the return premium in its cliffCost', async () => {
  const { choose } = await setup(FILL);
  const { rows, trace } = choose();
  const y = 0;
  expect(firstSettled(rows)).toBe(y);
  expect(rows[y].cliffChoice).toBe('filled to ACA credit floor (100%)');
  const t = traceAt({ trace }, y);
  const kept = t.candidates.find((c) => c.kind === 'fill' && c.score === t.chosenScore);
  expect(kept.realized).toBe(rows[y].magiProxy);
  // the return's premium is not what the year paid (the hold's MAGI priced a larger credit)
  expect(rows[y].healthcareSettled !== rows[y].healthcare).toBe(true);
  // no IRMAA is priced (A is 60)
  expect(kept.cliffCost).toBe(rows[y].healthcareSettled + 0);
});

it('natural record is settled: the IRMAA part is priced at the settled MAGI', async () => {
  const { w, choose } = await setup(HELD);
  const { rows, trace } = choose();
  const y = HELD_Y;
  expect(firstSettled(rows)).toBe(y);
  const nat = traceAt({ trace }, y).candidates[0];
  expect(nat.realized).toBe(rows[y].magiProxy);
  const { irmaaSurcharge, irmaaMagiOf } = await w.load('us/core/healthcare/irmaa.js');
  const ctx = await w.ctx();
  // single, no Social Security, no inflation (the tiers two years on are this year's): A alone on Medicare in year 4
  const irmaa = irmaaSurcharge(ctx, irmaaMagiOf(rows[y].magiProxy, 0, 'single') / 1, 'single', y);
  expect(irmaa > 0).toBe(true);
  expect(nat.cliffCost).toBe(rows[y].healthcareSettled + irmaa);
});

it('score counts the settlement: the natural score is the unsettled score plus seSettlement', async () => {
  const { choose } = await setup(NAT);
  const on = choose();
  const off = choose(true);
  const y = NAT_Y;
  expect(firstSettled(on.rows)).toBe(y);
  expect(firstSettled(off.rows)).toBe(-1);
  // the years before are the same, so the year starts from the same balances
  expect(on.rows.slice(0, y)).toStrictEqual(off.rows.slice(0, y));
  const s = on.rows[y].seSettlement;
  expect(s !== 0).toBe(true);
  const natOn = traceAt(on, y).candidates[0], natOff = traceAt(off, y).candidates[0];
  expect(natOff.score === null).toBe(false);
  expect(natOn.score).toBe(natOff.score + s);
});

it('broken stay-under is not met: settled over the line, not ok, not chosen', async () => {
  const { choose } = await setup(BROKEN);
  const on = choose();
  const off = choose(true);
  const y = BROKEN_Y;
  const pick = (run) => traceAt(run, y).candidates.find((c) => c.kind === 'under' && c.label === 'ACA 400% line');
  const c = pick(on), co = pick(off);
  // without the settlement the trial meets its line and counts
  expect(co.realized <= co.magi + 1).toBe(true);
  expect(co.ok).toBe(true);
  // its return breaks it
  expect(c.magi).toBe(co.magi);
  expect(c.realized > c.magi + 1).toBe(true);
  expect(c.ok).toBe(false);
  expect(on.rows[y].cliffChoice === c.label).toBe(false);
});

it('lambda reads flowOwn: a carry into a candidate year leaves its lambdaNeed unchanged', async () => {
  const { choose, testHooks } = await setup({ ...ZERO, singlePerson: true, ageA: 64, retireAgeA: 64, acaEnabled: false, inflation: 0, tradIraA: 1500000, spending: 100000, ssMonthlyA: 0, tenure: 'rent', rent: 0, cliffGuardEnabled: true });
  const y = 2;
  const a = choose();
  expect(traceAt(a, y).candidates.length > 1).toBe(true);
  testHooks.testSeCarryAt = { year: y - 1, amount: 5000 };
  const b = choose();
  testHooks.testSeCarryAt = null;
  expect(b.rows[y].seSettlementIn).toBe(5000);
  // the carry moved the year's draws
  expect(b.rows[y].traditionalWithdrawn !== a.rows[y].traditionalWithdrawn).toBe(true);
  expect(traceAt(b, y).lambdaNeed).toBe(traceAt(a, y).lambdaNeed);
});

it("measure: computeCliffPlan's candidate cost sums the return's tax and premium in settled rows", async () => {
  // NAT: no intent survives (the 'none' candidate is the choose run); FILL: intents, so 'none' is the off run and 'all' the
  // choose run. Each candidate's rows have a settled year.
  for (const [patch, fams] of [[NAT, ['none']], [FILL, ['none', 'all']]]) {
    const { w, P } = await setup(patch);
    const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
    const { report } = computeCliffPlan(await w.ctx());
    // the cost written out: inflation is 0, so each year's divisor is 1
    const sum = (rows) => {
      let c = 0;
      for (const r of rows) c += (r.taxSettled !== undefined ? r.taxSettled + r.healthcareSettled : r.tax + r.healthcare) / Math.pow(1 + 0, r.year);
      return c;
    };
    const runs = { none: P.runPlanMode({ planMode: fams.length > 1 ? 'off' : 'choose' }), all: P.runPlanMode({ planMode: 'choose' }) };
    expect(report.candidates.map((c) => c.family)).toStrictEqual(fams);
    for (const c of report.candidates) {
      const rows = runs[c.family].rows;
      expect(rows.some((r) => r.taxSettled !== undefined)).toBe(true);
      expect(c.cost).toBe(sum(rows));
    }
  }
});
