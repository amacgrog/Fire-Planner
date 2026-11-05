// The backdoor Roth box (US, IRA deduction PR 3): each year the nondeductible part of a partner's traditional IRA contribution
// is converted to the Roth IRA, taxed pro rata on that partner's whole IRA (Form 8606 lines 6-9, the year's contribution
// included). Engine cases on the owner case at 0% returns, then backdoorMove on hand-built ledgers.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

// The owner case of ira-deduction-engine.test.js (MFJ, both covered by a Roth 401(k), a traditional IRA contribution each,
// fully phased out: 17,200 nondeductible, no draw in the first year), with the returns, inflation and the HYSA rate at 0 and no
// pre-tax money (as FLAT in ira-basis-engine.test.js).
const BASE = {
  filingStatus: 'mfj', ageA: 58, ageB: 56, incomeA: 115000, incomeB: 72000, retireAgeA: 65, retireAgeB: 65,
  k401TypeA: 'roth', k401TypeB: 'roth', k401PctA: 10, k401PctB: 10, catchupPctA: 0, catchupPctB: 0, iraTypeA: 'traditional',
  iraTypeB: 'traditional', iraPctA: 100, iraPctB: 100, taxable: 0, cash: 0, cashReserve: 0, spending: 20000, cliffGuardEnabled: false,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, bondYears: 0, trad401kA: 0, trad401kB: 0, tradIraA: 0, tradIraB: 0,
};

// The rows of a fresh world's uncached run of `patch`.
async function rowsOf(patch) {
  const w = await world();
  await w.setState(patch);
  const e = await engine(w);
  return e.simulateRaw().rows;
}

it('clean backdoor is tax-free', async () => {
  const r = (await rowsOf({ ...BASE, iraBackdoorA: true, iraBackdoorB: true }))[0];
  const off = (await rowsOf(BASE))[0];
  expect(r.iraNondeductible).toBe(17200);
  expect(r.backdoor).toBe(17200);
  expect(r.backdoorTaxable).toBe(0);
  expect(r.iraBasis).toBe(0);
  expect(r.iraBasisRecovered).toBe(17200);
  expect(r.tax).toBe(off.tax);
  expect(r.magiProxy).toBe(off.magiProxy);
  // the unticked run carries no backdoor and keeps the 17,200 as basis
  expect(off.backdoor).toBe(undefined);
  expect(off.backdoorTaxable).toBe(undefined);
  expect(off.iraBasis).toBe(17200);
});

it('a partial phase-out taxes the backdoor pro rata', async () => {
  // 80,000 + 59,000 of wages: a 219(g) MAGI of 139,000, the joint covered range's midpoint (4,300 nondeductible each)
  const P = { ...BASE, incomeA: 80000, incomeB: 59000 };
  const r = (await rowsOf({ ...P, iraBackdoorA: true }))[0];
  const off = (await rowsOf(P))[0];
  expect(r.iraMagi).toBe(139000);
  expect(r.iraNondeductible).toBe(8600);
  // A's contribution is 8,600, its deductible part 4,300: the year-end IRA is 8,600 with 4,300 of basis
  expect(r.backdoor).toBe(4300);
  expect(r.backdoorTaxable).toBe(4300 * (1 - 4300 / 8600));
  expect(r.backdoorTaxable).toBe(2150);
  expect(r.magiProxy).toBe(off.magiProxy + 2150);
  // the 219(g) MAGI leaves the backdoor out (deviation 1): the deduction is unchanged
  expect(r.iraDeducted).toBe(off.iraDeducted);
  // basis: 8,600 nondeductible in, 2,150 recovered by A's backdoor; B's 4,300 stays
  expect(r.iraBasisRecovered).toBe(2150);
  expect(r.iraBasis).toBe(8600 - 2150);
});

it('pre-tax money makes the backdoor taxable', async () => {
  // B contributes nothing: the 219(g) MAGI is still the wages (the contributions are added back), above the range's top (149,000)
  const r = (await rowsOf({ ...BASE, tradIraA: 91400, iraPctB: 0, iraBackdoorA: true }))[0];
  expect(r.iraMagi).toBe(187000);
  expect(r.traditionalWithdrawn).toBe(0);
  expect(r.backdoor).toBe(8600);
  expect(r.backdoorTaxable).toBe(8600 * (1 - 8600 / (91400 + 8600)));
  const bt = r.backdoorTaxable;
  // basis conservation: 0 at the start + 8,600 nondeductible = the end basis + the recovered
  expect(r.iraBasis).toBe(8600 - (8600 - bt));
  expect(r.iraBasisRecovered).toBe(8600 - bt);
});

it('a Roth IRA partner never backs door', async () => {
  const r = (await rowsOf({ ...BASE, iraTypeA: 'roth', iraBackdoorA: true, iraBackdoorB: true }))[0];
  expect(r.iraNondeductible).toBe(8600);
  expect(r.backdoor).toBe(8600);
  expect(r.backdoorTaxable).toBe(0);
});

it('a deficit year still backs door', async () => {
  // spending above net pay: the year draws from the taxable account
  const r = (await rowsOf({ ...BASE, taxable: 300000, basisRatio: 100, spending: 200000, iraBackdoorA: true }))[0];
  expect(r.taxableWithdrawn > 0).toBe(true);
  expect(r.iraNondeductible).toBe(17200);
  expect(r.backdoor).toBe(8600);
  expect(r.backdoorTaxable).toBe(0);
  expect(r.traditional >= 0).toBe(true);
  // B's 8,600 stays as basis
  expect(r.iraBasis).toBe(8600);
});

it('a 72(t) IRA never converts', async () => {
  // A retired at 56 with a 72(t) plan on the IRA, contributing to it from a part-time W-2 job; B working, covered and well
  // above the not-covered range (242,000-252,000), so A's 8,600 is nondeductible.
  const job = {
    amount: 20000, startAge: 56, endAge: 60, followGrowth: false, growth: 0, owner: 'A', kind: 'wages', contribute: true,
    deferralType: 'traditional', deferralPct: 0, matchPct: 0, afterTaxPct: 0, personalPct: 100, profitSharingPct: 0, healthPremium: 0,
  };
  const P = {
    ...BASE, ageA: 56, ageB: 56, retireAgeA: 56, incomeA: 0, incomeB: 300000, iraPctB: 0, tradIraA: 100000, sepp72tIraA: true,
    sepp72tIraAgeA: 0, incomeSources: [job],
  };
  const r = (await rowsOf({ ...P, iraBackdoorA: true }))[0];
  expect(r.sepp72 > 0).toBe(true);
  expect(r.iraNondeductible).toBe(8600);
  expect(r.backdoor).toBe(undefined);
  expect(r.backdoorTaxable).toBe(undefined);
  expect(r.iraBasis).toBe(8600);
  // the box changes nothing
  const off = (await rowsOf(P))[0];
  expect(r.tax).toBe(off.tax);
  expect(r.traditional).toBe(off.traditional);
});

it('backdoorMove: a clean backdoor', async () => {
  const w = await world();
  const { backdoorMove } = await w.load('us/core/accounts/ira-basis.js');
  // A's IRA holds the 8,600 just contributed (half of a 17,200 pool; the other half is A's 401(k)); B's Roth IRA holds 8,600
  const accts = { trad: [0.5, 0.5, 0, 0], roth: [0, 0, 1, 0] };
  const bal = { traditional: 17200, bondTraditional: 0, roth: 8600, bondRoth: 0 };
  const R = [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));
  const basis = [8600, 0];
  expect(backdoorMove(accts, bal, R, basis, 8600, 0, 0, 0, 3)).toBe(8600);
  expect(R[0].conv).toStrictEqual([{ year: 3, amount: 8600, free: true }]);
  expect(R[2].conv).toStrictEqual([]);
  expect(basis).toStrictEqual([0, 0]);
  // the slot dollars move from trad slot 0 to Roth slot 0
  expect(accts.trad).toStrictEqual([0, 1, 0, 0]);
  expect(accts.roth).toStrictEqual([0.5, 0, 0.5, 0]);
  expect(bal).toStrictEqual({ traditional: 8600, bondTraditional: 0, roth: 17200, bondRoth: 0 });
});

it('backdoorMove: a partial backdoor', async () => {
  const w = await world();
  const { backdoorMove } = await w.load('us/core/accounts/ira-basis.js');
  const accts = { trad: [1, 0, 0, 0], roth: [0, 0, 0, 0] };
  const bal = { traditional: 8600, bondTraditional: 0, roth: 0, bondRoth: 0 };
  const R = [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));
  const basis = [4300, 0];
  // the return is the free part
  expect(backdoorMove(accts, bal, R, basis, 4300, 0, 2150, 0, 5)).toBe(2150);
  expect(R[0].conv).toStrictEqual([{ year: 5, amount: 2150, free: false }, { year: 5, amount: 2150, free: true }]);
  expect(basis).toStrictEqual([2150, 0]);
  expect(accts.trad).toStrictEqual([1, 0, 0, 0]);
  expect(accts.roth).toStrictEqual([1, 0, 0, 0]);
  expect(bal).toStrictEqual({ traditional: 4300, bondTraditional: 0, roth: 4300, bondRoth: 0 });
});

it('backdoorMove: the bond side covers what stocks cannot', async () => {
  const w = await world();
  const { backdoorMove } = await w.load('us/core/accounts/ira-basis.js');
  const accts = { trad: [0, 0, 1, 0], roth: [0, 0, 0, 0] };
  const bal = { traditional: 3000, bondTraditional: 5600, roth: 0, bondRoth: 0 };
  const R = [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));
  const basis = [0, 8600];
  expect(backdoorMove(accts, bal, R, basis, 0, 8600, 0, 0, 1)).toBe(8600);
  expect(R[2].conv).toStrictEqual([{ year: 1, amount: 8600, free: true }]);
  expect(R[0].conv).toStrictEqual([]);
  expect(accts.roth).toStrictEqual([0, 0, 1, 0]);
  expect(bal).toStrictEqual({ traditional: 0, bondTraditional: 0, roth: 3000, bondRoth: 5600 });
});

// The rows and the per-year trace (each year's kept-pass tax profile and its pass count) of `patch`.
async function traced(patch) {
  const w = await world();
  await w.setState(patch);
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const state = (await w.load('shared/core/store.js')).state;
  const ctx = await w.ctx();
  const trace = [];
  const rows = runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, trace }).rows;
  return { rows, trace };
}

it('a multi-pass phase-out year counts the backdoor once', async () => {
  // MFJ at 62, wages 60,000 + 50,000 (Roth 401(k)s: both covered), A contributes 8,600 to a traditional IRA (B nothing) and holds
  // 400,000 of pre-tax 401(k) and 50,000 of pre-tax IRA; no cash or taxable money, so the spending draws traditional dollars
  // and the converged 219(g) MAGI lands inside the joint covered range (129,000-149,000): the passes iterate the draw.
  const P = {
    ...BASE, ageA: 62, ageB: 62, retireAgeA: 66, retireAgeB: 66, incomeA: 60000, incomeB: 50000, incomeGrowth: 0, iraPctB: 0,
    trad401kA: 400000, tradIraA: 50000, spending: 72000, rothIraA: 0, rothIraB: 0, roth401kA: 0, roth401kB: 0, ssMonthlyA: 0,
    ssMonthlyB: 0, acaEnabled: false, stateTax: 'tx',
  };
  const on = await traced({ ...P, iraBackdoorA: true });
  const off = await traced(P);
  const r = on.rows[0], t = on.trace[0], ro = off.rows[0], to = off.trace[0];
  expect(t.passes > 1).toBe(true);
  expect(r.traditionalWithdrawn > 0).toBe(true);
  expect(r.iraMagi > 129000 && r.iraMagi < 149000).toBe(true);
  expect(r.iraNondeductible > 0 && r.iraNondeductible < 8600).toBe(true);
  expect(r.backdoor).toBe(r.iraNondeductible);
  expect(r.backdoorTaxable > 0 && r.backdoorTaxable < r.backdoor).toBe(true);
  // the kept pass's profile carries the taxable part once: the RMD slot (no RMD at 62) is exactly it
  expect(t.profile.rmdA).toBe(r.backdoorTaxable);
  expect(to.profile.rmdA).toBe(0);
  // otherA is the year's otherA0 (the unticked run's less its nondeductible dollars) plus the pass's nondeductible dollars and
  // the taxable part, once (a written-out tolerance: the unticked run's add-back and its removal round)
  const expOtherA = to.profile.otherA - ro.iraNondeductible + r.iraNondeductible + r.backdoorTaxable;
  expect(Math.abs(t.profile.otherA - expOtherA) <= 1e-6).toBe(true);
  // whole-run basis conservation: opening (0) + every year's nondeductible dollars = the end basis + every year's recovery
  let nd = 0, rec = 0, last = 0, years = 0;
  for (const row of on.rows) {
    if (row.iraNondeductible !== undefined) nd += row.iraNondeductible;
    if (row.iraBasisRecovered !== undefined) rec += row.iraBasisRecovered;
    if (row.iraBasis !== undefined) last = row.iraBasis;
    if (row.backdoor !== undefined) years++;
  }
  expect(years > 1).toBe(true);
  expect(nd > 0).toBe(true);
  expect(Math.abs(nd - (last + rec)) <= 1e-6).toBe(true);
});
