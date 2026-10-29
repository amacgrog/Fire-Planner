// A withdrawal mix's shortfall falls through to the other stock accounts (US): takeTaxableCapped (a taxable sale within the MAGI
// room) and the fallthrough in both strategies and releaseMagiCap.
import { it, expect } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { world } from '../helpers/world.js';
import { usOptimizer, usPlan } from '../helpers/us-plan.js';

const PROFILE = { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' };

async function cappedSetup(taxable, basis) {
  const w = await world();
  await w.setState();
  w.setTaxYear(2026);
  const draws = await w.load('us/core/withdrawals/draws.js');
  const shared = await w.load('shared/core/withdrawals/draws.js');
  const ctx = await w.ctx();
  const mk = () => ({
    bal: { taxable, taxableBasis: basis, traditional: 0, roth: 0, cash: 0 },
    profile: { ...PROFILE }, taxableGainGross: 0, traditionalGross: 0, taxableWithdrawn: 0, ctx,
  });
  return { draws, shared, mk };
}

it('takeTaxableCapped: room binds', async () => {
  const { draws, mk } = await cappedSetup(100000, 50000);
  const wd = mk();
  const net = draws.takeTaxableCapped(wd, 'taxable', 60000, 10000);
  expect(wd.taxableGainGross).toBe(10000);
  expect(wd.bal.taxable).toBe(80000);
  expect(wd.bal.taxableBasis).toBe(40000);
  expect(net < 60000).toBe(true);
});

it('takeTaxableCapped: a loose room is takeTaxable to the bit', async () => {
  const { draws, shared, mk } = await cappedSetup(100000, 37000);
  const a = mk(), b = mk();
  const na = draws.takeTaxableCapped(a, 'taxable', 40000, 1e9);
  const nb = shared.takeTaxable(b, 'taxable', 40000);
  expect(na).toBe(nb);
  expect(a.bal).toStrictEqual(b.bal);
  expect(a.taxableGainGross).toBe(b.taxableGainGross);
  expect(a.taxableWithdrawn).toBe(b.taxableWithdrawn);
});

it('takeTaxableCapped: gain ratio 0 with the room used up sells without NaN', async () => {
  const { draws, mk } = await cappedSetup(100000, 100000);
  const wd = mk();
  const net = draws.takeTaxableCapped(wd, 'taxable', 30000, 0);
  expect(net >= 30000).toBe(true);
  for (const k of Object.keys(wd.bal)) expect(Number.isFinite(wd.bal[k])).toBe(true);
});

it('takeTaxableCapped: room 0 with gains sells nothing', async () => {
  const { draws, mk } = await cappedSetup(100000, 50000);
  const wd = mk();
  const before = { ...wd.bal };
  expect(draws.takeTaxableCapped(wd, 'taxable', 30000, 0)).toBe(0);
  expect(wd.bal).toStrictEqual(before);
  expect(wd.taxableWithdrawn).toBe(0);
});

// ---- the engine: a mix's shortfall falls through to the other stock accounts before cash, bonds, inherited money and home equity ----

const ZERO = { taxable: 0, cash: 0, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, hysaRate: 0 };
// A retired single owner with a home (no mortgage), no inflation, no returns drift: spending is met from the portfolio.
const HH = {
  ...ZERO, singlePerson: true, ageA: 62, retireAgeA: 62, lifeExpectancyA: 80, incomeA: 0, incomeKindA: 'wages', stateTax: 'tx', acaEnabled: false,
  inflation: 0, incomeGrowth: 0, medicalInflation: 0, healthcare: 0, ssMonthlyA: 0, tenure: 'own', rent: 0,
  homeValue: 400000, mortgage: 0, mortgagePrincipal: 0, mortgageRate: 0, mortgageYears: 0, mortgageStartAge: 0,
  spending: 60000, rothConvEnabled: false, guardrailsEnabled: false, survivorEnabled: false, cliffGuardEnabled: false,
  children: [], loans: [], oneTimeIncome: [], extraExpenses: [], lumpExpenses: [], spendingTiers: [], incomeSources: [],
};
const mixFor = (mode, from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, mode]));
const strip = (rows) => rows.map((r) => { const c = { ...r }; delete c.mixCandidate; return c; });

async function run(patch, mix, planOpts = { planMode: 'off' }, bucket = false) {
  const w = await world();
  await w.setState({ ...HH, ...patch, appliedMixSchedule: mix });
  const P = await usPlan(w);
  return P.runPlanMode({ ...planOpts, ...(bucket ? { rowFn: P.rowFnFor({ type: 'crashFirst' }) } : null) });
}

// Every equivalence case runs with the cliff guard off (planMode 'off'): under a cap the mix and no-mix paths can stop on a
// different bucket (since step 4b both sell taxable capped, through takeStockTaxable), so rows legitimately differ there.
const TAXRICH = { taxable: 400000, basisRatio: 60, tradIraA: 500000, rothIraA: 0 };

it('roth-empty equals no-mix', async () => {
  const a = await run(TAXRICH, mixFor('roth', 62, 80));
  const b = await run(TAXRICH, null);
  expect(a.depletedAge).toBe(b.depletedAge);
  // Not bit-exact after year 0: the taxable bisection's overshoot leaves wd.need slightly negative, and the non-penalty-aware tail
  // of withdrawStandard calls takeRoth with it, which hands 0.00787 back into a Roth of 0 in year 0 in both runs (a pre-existing
  // behaviour, reported as a follow-up, not fixed here: CLAUDE.md Vitest rule 7). The roth mix then draws that dust first every
  // year, so the runs drift apart by cents: measured at most 0.042 (bonds), 0.030 (traditional), 0.029 (investable). Year 0 is
  // exact; later rows agree within a hand-written 5-cent tolerance on numbers, every other field and every homeEquity exactly.
  // One assertion: the list of mismatches is empty.
  expect(a.rows.length).toBe(b.rows.length);
  expect(strip([a.rows[0]])).toStrictEqual(strip([b.rows[0]]));
  const mismatches = [];
  a.rows.forEach((ra, i) => {
    const rb = b.rows[i];
    for (const k of Object.keys(rb)) {
      if (k === 'mixCandidate') continue;
      const ok = typeof rb[k] === 'number' && k !== 'homeEquity' ? Math.abs(ra[k] - rb[k]) <= 0.05 : isDeepStrictEqual(ra[k], rb[k]);
      if (!ok) mismatches.push(i + ':' + k);
    }
  });
  expect(mismatches).toStrictEqual([]);
});

it('taxable equals no-mix (taxable runs dry inside the plan)', async () => {
  const p = { ...TAXRICH, taxable: 150000, rothIraA: 200000 };
  const a = await run(p, mixFor('taxable', 62, 80));
  const b = await run(p, null);
  expect(strip(a.rows)).toStrictEqual(strip(b.rows));
});

it('home untouched: a roth mix whose Roth runs dry draws taxable, not home equity', async () => {
  const p = { ...TAXRICH, rothIraA: 100000 };
  const a = await run(p, mixFor('roth', 62, 80));
  const b = await run(p, null);
  expect(b.depletedAge).toBe(null);
  expect(a.rows.map((r) => r.homeEquity)).toStrictEqual(b.rows.map((r) => r.homeEquity));
  // the Roth is gone after the first years and the taxable account then pays
  expect(a.rows[a.rows.length - 1].taxable < a.rows[0].taxable).toBe(true);
});

it('bucket: roth-empty equals no-mix on the historical engine', async () => {
  const a = await run(TAXRICH, mixFor('roth', 62, 80), { planMode: 'off' }, true);
  const b = await run(TAXRICH, null, { planMode: 'off' }, true);
  expect(strip(a.rows)).toStrictEqual(strip(b.rows));
});

it('penalty-aware: roth-empty equals no-mix, the penalized traditional untouched', async () => {
  const p = { ageA: 52, retireAgeA: 52, lifeExpectancyA: 70, tradIraA: 1000000, taxable: 150000, basisRatio: 60, rothIraA: 0, spending: 50000 };
  const a = await run(p, mixFor('roth', 52, 58));
  const b = await run(p, null);
  expect(strip(a.rows)).toStrictEqual(strip(b.rows));
});

// The cliff plan on: ACA on in Texas, premium 18,000, a Roth that runs dry in year 0 under a `roth` mix. Before the fall-through the
// Roth share's shortfall reached releaseMagiCap (uncapped traditional) and the plan never offered a stay-under; now the shortfall
// sells taxable within the room, so a stay-under is kept. A kept trial always met its line (ok requires met), so "realized <= target"
// would be tautological; the assertions are that a stay-under is offered and kept, and that home equity is never touched.
const CAPPED = {
  ...HH, ageA: 60, retireAgeA: 60, lifeExpectancyA: 75, acaEnabled: true, healthcare: 18000, cliffGuardEnabled: true,
  taxable: 100000, tradIraA: 1300000, basisRatio: 30, spending: 72000, rothIraA: 60000,
};

it('capped: a stay-under is offered and kept after the Roth runs dry, and home equity is never drawn', async () => {
  const w = await world();
  await w.setState({ ...CAPPED, appliedMixSchedule: mixFor('roth', 60, 74) });
  const P = await usPlan(w);
  const a = P.runPlanMode({ planMode: 'choose', planTrace: true });
  const off = await run({ ...CAPPED, appliedMixSchedule: null }, null);
  expect(off.depletedAge).toBe(null);
  const kept = a.trace.filter((t) => t.candidates.some((c) => c.kind === 'under' && c.ok === true) && a.rows[t.year].cliffChoice !== undefined);
  expect(kept.length > 0).toBe(true);
  expect(a.rows.map((r) => r.homeEquity)).toStrictEqual(off.rows.map((r) => r.homeEquity));
});

// ---- the mix seam itself (moved here from the retired multi-lever suite, Batch 5 step 5): the weights and a forced year ----

it('withdrawalMixWeights: each fixed candidate, the proportional ones, and every split sums to 1', async () => {
  const w = await world();
  const { withdrawalMixWeights: wt } = await w.load('us/core/withdrawals/mix.js');
  const r = {
    taxable: wt('taxable', 100, 100, 100),
    traditional: wt('traditional', 100, 100, 100),
    roth: wt('roth', 100, 100, 100),
    taxTradHalf: wt('taxTradHalf', 100, 100, 100),
    thirds: wt('thirds', 100, 100, 100),
    balanced: wt('balanced', 300, 600, 100),
    smoothed: wt('smoothed', 300, 600, 100),
    zero: wt(0, 100, 100, 100),
  };
  expect(r.taxable).toStrictEqual([1, 0, 0]);
  expect(r.traditional).toStrictEqual([0, 1, 0]);
  expect(r.roth).toStrictEqual([0, 0, 1]);
  expect(r.zero).toBe(null); // the 0 sentinel: no override
  // balanced: pool = 300+600+100 = 1000 -> [0.3, 0.6, 0.1], 3-way proportional to the live balances
  expect(Math.abs(r.balanced[0] - 0.3) < 1e-9 && Math.abs(r.balanced[1] - 0.6) < 1e-9 && Math.abs(r.balanced[2] - 0.1) < 1e-9).toBe(true);
  // smoothed: pool = 300+600 = 900 (roth excluded) -> [1/3, 2/3, 0], state.smoothWithdrawals' own 2-way formula
  expect(Math.abs(r.smoothed[0] - 1 / 3) < 1e-9 && Math.abs(r.smoothed[1] - 2 / 3) < 1e-9 && r.smoothed[2] === 0).toBe(true);
  for (const [name, v] of Object.entries(r)) {
    if (v) expect(Math.abs(v[0] + v[1] + v[2] - 1) < 1e-9, `${name}'s weights sum to 1: ${v}`).toBe(true);
  }
});

// The ACA-cliff household of the retired suite (retired at 55 with a large idle traditional balance and a large taxable one).
const ACA_CLIFF = {
  stateTax: 'fl', ageA: 45, ageB: 45, retireAgeA: 55, retireAgeB: 55, lifeExpectancyA: 90, lifeExpectancyB: 90,
  taxable: 1500000, basisRatio: 20, trad401kA: 450000, trad401kB: 450000, rothIraA: 100000, rothIraB: 100000,
  cash: 80000, cashReserve: 50000, spending: 75000, ssMonthlyA: 2800, ssMonthlyB: 2200, ssStartAgeA: 67, ssStartAgeB: 67,
  acaEnabled: true, acaEnhanced: false, rothConvStartAge: 55, rothConvEndAge: 66,
};

it('forcing "roth" for one year (the override map) draws mostly from Roth, and the row records the candidate', async () => {
  const w = await world();
  await w.setState(ACA_CLIFF);
  w.setTaxYear(2026);
  const O = await usOptimizer(w);
  O.setWithdrawalMixOverride(new Map([[60, 'roth']]));
  const sim = O.simulate();
  O.setWithdrawalMixOverride(null);
  const row = sim.rows.find((x) => x.age === 60);
  expect(row.rothWithdrawn > row.taxableWithdrawn && row.rothWithdrawn > row.traditionalWithdrawn - row.rmd).toBe(true);
  expect(row.mixCandidate).toBe('roth');
});
