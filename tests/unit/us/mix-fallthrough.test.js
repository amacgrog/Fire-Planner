// A withdrawal mix's shortfall falls through to the other stock accounts (US): takeTaxableCapped (a taxable sale within the MAGI
// room) and the fallthrough in both strategies and releaseMagiCap.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

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
import { usPlan } from '../helpers/us-plan.js';

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

// Every equivalence case runs with the cliff guard off (planMode 'off'): under a cap the mix path sells taxable capped and the
// no-mix path uncapped (the spec's recorded asymmetry), so rows legitimately differ there.
const TAXRICH = { taxable: 400000, basisRatio: 60, tradIraA: 500000, rothIraA: 0 };

it('roth-empty equals no-mix', async () => {
  const a = await run(TAXRICH, mixFor('roth', 62, 80));
  const b = await run(TAXRICH, null);
  expect(a.depletedAge).toBe(b.depletedAge);
  // Not bit-exact: a bisection overshoot in year 0 hands a fraction of a cent back to the Roth bucket (takeRoth of a slightly negative
  // need), which makes the roth mix's share non-zero (a dust draw) from year 1 on. The rows agree to the cent (hand-written
  // tolerance of 5 cents on every number); every non-number field and every homeEquity is identical.
  expect(a.rows.length).toBe(b.rows.length);
  a.rows.forEach((ra, i) => {
    const rb = b.rows[i];
    for (const k of Object.keys(rb)) {
      if (k === 'mixCandidate') continue;
      if (typeof rb[k] === 'number') expect(Math.abs(ra[k] - rb[k]) <= 0.05).toBe(true);
      else expect(ra[k]).toStrictEqual(rb[k]);
    }
    expect(ra.homeEquity).toBe(rb.homeEquity);
  });
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
