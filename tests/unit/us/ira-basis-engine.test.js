// Traditional IRA after-tax basis in the year loop (US, IRA deduction PR 2, Task 5a): the pro-rata recovery on draws, RMDs and
// the year end (Form 8606). Every case sets the returns, inflation and the HYSA rate to 0, so the ratio is the slider exactly.
// Conversions (Task 5b) are the second half of the file.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

// A retired single person with nothing but a traditional IRA (no other money, no Social Security, no housing or healthcare
// costs), all at 0% returns and no bond reserve.
const FLAT = {
  singlePerson: true, filingStatus: 'single', returnRate: 0, bondReturn: 0, inflation: 0, medicalInflation: 0, hysaRate: 0,
  incomeGrowth: 0, dividendYield: 0, bondYears: 0, taxable: 0, cash: 0, cashReserve: 0, trad401kA: 0, rothIraA: 0, roth401kA: 0,
  ssMonthlyA: 0, tenure: 'rent', rent: 0, healthcare: 0, medicareYearly: 0, cliffGuardEnabled: false, stateTax: 'tx',
};

// The rows of a fresh world's uncached run of `patch`; `off`: with ctx.test.iraPhaseoutOff.
async function rowsOf(patch, off = false) {
  const w = await world();
  await w.setState(patch);
  if (off) (await w.load('us/core/test-hooks.js')).assignIraPhaseoutOff(true);
  const e = await engine(w);
  return e.simulateRaw().rows;
}

// The owner case of ira-deduction-engine.test.js: MFJ, both covered by a Roth 401(k), a traditional IRA contribution each,
// fully phased out (17,200 nondeductible), no draw in the first year.
const OWNER = {
  filingStatus: 'mfj', ageA: 58, ageB: 56, incomeA: 115000, incomeB: 72000, retireAgeA: 65, retireAgeB: 65,
  k401TypeA: 'roth', k401TypeB: 'roth', k401PctA: 10, k401PctB: 10, catchupPctA: 0, catchupPctB: 0, iraTypeA: 'traditional',
  iraTypeB: 'traditional', iraPctA: 100, iraPctB: 100, taxable: 0, cash: 0, cashReserve: 0, spending: 20000, cliffGuardEnabled: false,
};

it('basis is recovered on an RMD', async () => {
  const r = (await rowsOf({ ...FLAT, ageA: 75, retireAgeA: 60, spending: 5000, tradIraA: 400000, tradIraBasisPctA: 50 }))[0];
  expect(r.rmd > 0).toBe(true);
  // the RMD is drawn pro rata from an IRA that is half basis
  expect(r.rmdTaxable).toBe(r.rmd * 0.5);
  // a surplus year: the basis recovered is the RMD's tax-free half
  expect(r.traditionalWithdrawn).toBe(r.rmd);
  expect(r.iraBasisRecovered).toBe(0.5 * (400000 - (400000 - r.rmd)));
  expect(r.iraBasis).toBe(200000 - r.iraBasisRecovered);
});

it('penalty on the taxable part only', async () => {
  const r = (await rowsOf({ ...FLAT, ageA: 50, retireAgeA: 45, spending: 30000, tradIraA: 300000, tradIraBasisPctA: 50 }))[0];
  expect(r.traditionalWithdrawn > 30000).toBe(true);
  // one penalized draw: the 10% falls on its taxable half only
  expect(r.earlyPenalty).toBe(r.traditionalWithdrawn * 0.5 * 0.1);
  expect(r.iraBasis).toBe(150000 - r.iraBasisRecovered);
  expect(r.iraBasisRecovered > 0).toBe(true);
});

it('nondeductible contributions become basis', async () => {
  const r = (await rowsOf(OWNER))[0];
  expect(r.traditionalWithdrawn).toBe(0);
  expect(r.iraNondeductible).toBe(17200);
  expect(r.iraBasis).toBe(17200);
  expect(r.iraBasisRecovered).toBe(0);
});

it('basis survives a loss year', async () => {
  const r = (await rowsOf({ ...FLAT, ageA: 60, retireAgeA: 55, spending: 0, returnRate: -20, tradIraA: 100000, tradIraBasisPctA: 100 }))[0];
  expect(r.traditionalWithdrawn).toBe(0);
  expect(r.traditional).toBe(80000);
  // basis above the fallen balance carries forward (Form 8606 line 14): never reset to the ratio times the balance
  expect(r.iraBasis).toBe(100000);
  expect(r.iraBasisRecovered).toBe(0);
});

it('basis off is the feature off', async () => {
  // MFJ, both past their RMD age, with draws from both partners' IRAs and 401(k)s and no conversion, at 0% basis
  const plan = {
    ...FLAT, singlePerson: false, filingStatus: 'mfj', ageA: 74, ageB: 73, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90,
    lifeExpectancyB: 90, spending: 90000, tradIraA: 300000, trad401kA: 200000, tradIraB: 150000, trad401kB: 100000,
    rothIraB: 0, roth401kB: 0, ssMonthlyB: 0, tradIraBasisPctA: 0, tradIraBasisPctB: 0,
  };
  const on = await rowsOf(plan);
  const off = await rowsOf(plan, true);
  expect(on[0].rmd > 0).toBe(true);
  expect(on[0].traditionalWithdrawn > on[0].rmd).toBe(true);
  expect(on.length).toBe(off.length);
  for (let i = 0; i < on.length; i++) {
    expect(on[i].tax).toBe(off[i].tax);
    expect(on[i].traditional).toBe(off[i].traditional);
    expect(on[i].roth).toBe(off[i].roth);
    // no basis: the rows carry none of the basis fields
    expect(on[i].iraBasis).toBe(undefined);
    expect(on[i].rmdTaxable).toBe(undefined);
  }
});

// The estate's basis is capped at each partner's IRA dollars: basis carried above a fallen IRA never shelters 401(k) money.
it('the estate caps basis at the IRA', async () => {
  const w = await world();
  // a two-year run (life expectancy 61 at 60), -20% each year, no draws: the pool falls 200,000 -> 160,000 -> 128,000 and the
  // IRA keeps half of it
  await w.setState({ ...FLAT, ageA: 60, retireAgeA: 55, lifeExpectancyA: 61, spending: 0, returnRate: -20, tradIraA: 100000, tradIraBasisPctA: 100, trad401kA: 100000 });
  const e = await engine(w);
  const sim = e.simulateRaw();
  expect(sim.rows.length).toBe(2);
  const last = sim.rows[1];
  expect(sim.rows[0].traditionalWithdrawn + last.traditionalWithdrawn).toBe(0);
  // the row keeps the basis carried forward (100,000); the estate counts only the IRA's 64,000 (half the 128,000 pool), so the
  // taxed traditional estate is the 401(k)'s 64,000, not 28,000
  expect(last.iraBasis).toBe(100000);
  expect(last.traditional).toBe(128000);
  expect(sim.estate.traditional).toBe(128000);
  expect(sim.estate.traditionalBasis).toBe(64000);
});

it('an uneven ratio: the draw is taxed at 1 - ratio', async () => {
  // single, 60 (penalty-free), an IRA at 25% basis and nothing else: one discretionary draw, taxable fraction 0.75
  const r = (await rowsOf({ ...FLAT, ageA: 60, retireAgeA: 55, spending: 20000, tradIraA: 400000, tradIraBasisPctA: 25 }))[0];
  expect(r.rmd).toBe(0);
  expect(r.traditionalWithdrawn > 20000).toBe(true);
  // no other income: the year's income is the draw's taxable part (code order: fromTrad * tau)
  expect(r.income).toBe(r.traditionalWithdrawn * 0.75);
  // the year end in code order: ratio * (grown IRA - IRA now), the IRA alone in the pool
  expect(r.iraBasisRecovered).toBe(0.25 * (400000 - (400000 - r.traditionalWithdrawn)));
  expect(r.iraBasis).toBe(100000 - r.iraBasisRecovered);
});

// MFJ 74 / 73, an IRA and a 401(k) each: A's IRA 200,000 at 25% basis (ratio 0.25), B's IRA 100,000 at 60% (ratio 0.6), both
// past their RMD age, a surplus year (no discretionary draw), no other income.
const COUPLE = {
  ...FLAT, singlePerson: false, filingStatus: 'mfj', ageA: 74, ageB: 73, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 90,
  lifeExpectancyB: 90, spending: 5000, tradIraA: 200000, trad401kA: 200000, tradIraB: 100000, trad401kB: 300000, rothIraB: 0,
  roth401kB: 0, ssMonthlyB: 0, tradIraBasisPctA: 25, tradIraBasisPctB: 60,
};

it('the couple RMD: each partner pro rata over their own accounts', async () => {
  const r = (await rowsOf(COUPLE))[0];
  // each partner owns half the 800,000 pool: RMDs of 400,000 / 25.5 (A, 74) and 400,000 / 26.5 (B, 73), each drawn pro rata
  // over the partner's own accounts (A: half IRA, B: a quarter IRA). Written in the engine's expression order.
  const rA = 400000 / 25.5,
    rB = 400000 / 26.5;
  const freeA = 0.25 * ((rA * 200000) / 400000),
    freeB = 0.6 * ((rB * 100000) / 400000);
  expect(r.rmd).toBe(rA + rB);
  expect(r.traditionalWithdrawn).toBe(r.rmd);
  expect(r.rmdTaxable).toBe(rA - freeA + (rB - freeB));
  // the year end from the ledger (accountsDraw, then the pool after the RMD), in code order
  const fA = 1 - rA / 400000,
    fB = 1 - rB / 400000,
    d0 = 200000 * fA,
    d1 = 200000 * fA,
    d2 = 100000 * fB,
    d3 = 300000 * fB,
    tot = d0 + d1 + d2 + d3,
    pool = 800000 - (rA + rB);
  expect(r.iraBasisRecovered).toBe(0.25 * (200000 - (d0 / tot) * pool) + 0.6 * (100000 - (d2 / tot) * pool));
});

it('the survivor RMD comes out of the whole pool pro rata', async () => {
  // A dies at 74, the first year: B's RMD on the whole 800,000 pool at 73, every slot pro rata (IRA basis 50,000 + 60,000)
  const r = (await rowsOf({ ...COUPLE, survivorEnabled: true, survivorPartner: 'A', survivorDeathAge: 74 }))[0];
  const rB = 800000 / 26.5;
  expect(r.rmd).toBe(rB);
  expect(r.rmdTaxable).toBe(rB - rB * ((0.25 * 200000 + 0.6 * 100000) / 800000));
  // no share moves: each IRA keeps its share (0.25, 0.125) of the smaller pool
  const pool = 800000 - rB;
  expect(r.iraBasisRecovered).toBe(0.25 * (200000 - 0.25 * pool) + 0.6 * (100000 - 0.125 * pool));
});

// The draw primitives with basis, driven directly (as free-room.test.js does): A's IRA alone, 100,000, Partner A 60, Texas.
const FREE = { free: true, qualified: true };
const PROFILE = {
  filing: 'single', otherA: 0, otherB: 0, extraA: 0, extraB: 0, wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, ssA: 0, ssB: 0,
  ageA: 60, ageB: 60, singlePerson: false, seOn: false, invOrd: 0, invQual: 0, propertyTax: 0, rent: 0, ownerShareA: 0.5, k401FracA: 0, k401FracB: 0,
  k401DrawFracA: 0, k401DrawFracB: 0, mortgageInterest: 0, medicalExpense: 0, year: 0, dependents: [],
};
async function drawSetup() {
  const w = await world();
  await w.setState({ stateTax: 'tx', inflation: 0, singlePerson: false, filingStatus: 'single', tenure: 'rent' });
  const draws = await w.load('us/core/withdrawals/draws.js');
  const ctx = await w.ctx();
  const mk = (iraRatio) => {
    const wd = draws.newWithdrawal(ctx, {
      bal: { taxable: 0, taxableBasis: 0, bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0, traditional: 100000, roth: 0, cash: 0, home: 0, mortgage: 0 },
      rothAccts: [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] })),
      accts: { trad: [1, 0, 0, 0], roth: [1, 0, 0, 0] },
      seppActive: [false, false, false, false],
      profile: { ...PROFILE },
      conversionAmount: 0,
      rmd: 0,
      iraRatio,
    });
    wd.status = [FREE, FREE, FREE, FREE];
    return wd;
  };
  return { draws, mk };
}

it('the MAGI cap and the fill are taxable rooms', async () => {
  const S = await drawSetup();
  // ratio 0.25: taxable fraction 0.75, so a 6,000 MAGI room is a gross of 6,000 / 0.75 = 8,000
  const wd = S.mk([0.25, 0]);
  wd.magiCap = { limit: 6000, off: false };
  S.draws.takeTraditional(wd, 'traditional', 20000);
  expect(wd.traditionalWithdrawn).toBe(8000);
  expect(wd.traditionalGross).toBe(6000);
  expect(wd.cappableTraditional).toBe(6000);
  const fill = S.mk([0.25, 0]);
  expect(S.draws.fillTraditional(fill, 6000)).toBe(6000);
  expect(fill.traditionalWithdrawn).toBe(8000);
  expect(fill.traditionalGross).toBe(6000);
  expect(fill.bal.traditional).toBe(92000);
});

it('an all-basis IRA: the cap does not bind and the fill draws nothing', async () => {
  const S = await drawSetup();
  // ratio 1: taxable fraction 0
  const wd = S.mk([1, 0]);
  wd.magiCap = { limit: 6000, off: false };
  const net = S.draws.takeTraditional(wd, 'traditional', 20000);
  expect(net >= 20000).toBe(true);
  expect(wd.traditionalWithdrawn > 8000).toBe(true);
  expect(wd.traditionalGross).toBe(0);
  expect(wd.cappableTraditional).toBe(0);
  const fill = S.mk([1, 0]);
  expect(S.draws.fillTraditional(fill, 6000)).toBe(0);
  expect(fill.traditionalWithdrawn).toBe(0);
  expect(fill.bal.traditional).toBe(100000);
});

// Conversions (Task 5b): in a basis year `conversionAmount` is the taxable conversion and `conversionGross` the dollars moved.
// A retired single person, 60, converting from 60 (the fill at 22%, or the yardstick's amount map), nothing to spend unless given.
const CONV = { ...FLAT, ageA: 60, retireAgeA: 55, spending: 0, rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 70, rothConvBracket: 22 };

// The rows of `patch` with the yardstick's amount map (ctx.overrides.rothAmountByAge, test-only) converting `amount` at 60.
async function mapRows(patch, amount) {
  const w = await world();
  await w.setState(patch);
  const { runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const state = (await w.load('shared/core/store.js')).state;
  const ctx = await w.ctx();
  ctx.overrides.rothAmountByAge = new Map([[60, amount]]);
  return runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB }).rows;
}

it('100% basis makes a conversion tax-free', async () => {
  const r = (await mapRows({ ...CONV, tradIraA: 100000, tradIraBasisPctA: 100 }, 40000))[0];
  expect(r.conversionGross).toBe(40000);
  expect(r.conversionAmount).toBe(0);
  expect(r.tax).toBe(0);
  expect(r.roth).toBe(40000);
  expect(r.traditional).toBe(60000);
  // the year end recovers the conversion's tax-free 40,000
  expect(r.iraBasisRecovered).toBe(40000);
  expect(r.iraBasis).toBe(60000);
});

it('pro rata conversion', async () => {
  const r = (await mapRows({ ...CONV, tradIraA: 300000, tradIraBasisPctA: 25 }, 40000))[0];
  expect(r.conversionAmount).toBe(30000);
  expect(r.conversionGross).toBe(40000);
  expect(r.roth).toBe(40000);
  // the conversion's 10,000 tax-free plus the draw that pays its tax (a quarter basis too), in code order
  expect(r.traditionalWithdrawn > 0).toBe(true);
  expect(r.iraBasisRecovered).toBe(0.25 * (300000 - (300000 - r.conversionGross - r.traditionalWithdrawn)));
  expect(r.iraBasis).toBe(75000 - r.iraBasisRecovered);
});

it('the pro-rata identity in a conversion year with a draw', async () => {
  const r = (await mapRows({ ...CONV, spending: 20000, tradIraA: 300000, tradIraBasisPctA: 25 }, 40000))[0];
  expect(r.conversionAmount).toBe(30000);
  expect(r.conversionGross).toBe(40000);
  expect(r.traditionalWithdrawn > 20000).toBe(true);
  // the year's income is the conversion's taxable part plus the draw's (fromTrad * tau, tau 0.75)
  expect(r.income).toBe(30000 + r.traditionalWithdrawn * 0.75);
  // the basis recovered is the conversion's tax-free part plus the draw's: the ratio times the IRA dollars out, in code order
  // (the year end: ratio * (grown IRA - IRA now))
  expect(r.iraBasisRecovered).toBe(0.25 * (300000 - (300000 - r.conversionGross - r.traditionalWithdrawn)));
  expect(r.iraBasis).toBe(75000 - r.iraBasisRecovered);
});

it('the fill sizes in taxable dollars', async () => {
  const rows = await rowsOf({ ...CONV, tradIraA: 300000, tradIraBasisPctA: 25 });
  const plain = await rowsOf({ ...CONV, tradIraA: 300000, tradIraBasisPctA: 0 });
  const r = rows[0];
  expect(r.conversionAmount > 0).toBe(true);
  // (the fill is sized on the year's taxable draw estimate too, which basis lowers, so the two runs' fills differ)
  // the gross: the taxable dollars over the segment's taxable fraction (conversionGross: taxable / (1 - rho))
  expect(r.conversionGross).toBe(r.conversionAmount / (1 - 0.25));
  expect(plain[0].conversionGross).toBe(undefined);
});

it('an all-basis IRA converts in a fill year', async () => {
  const rows = await rowsOf({ ...CONV, tradIraA: 100000, tradIraBasisPctA: 100 });
  const r = rows[0];
  expect(r.conversionGross).toBe(100000);
  expect(r.conversionAmount).toBe(0);
  expect(r.tax).toBe(0);
  expect(r.roth).toBe(100000);
  expect(r.traditional).toBe(0);
  expect(r.iraBasis).toBe(0);
  expect(r.iraBasisRecovered).toBe(100000);
});

// The Roth ledger with a basis conversion (roth-ledger.js directly): a conversion's taxable part, then its tax-free part.
it('the ledger order', async () => {
  const w = await world();
  const L = await w.load('us/core/accounts/roth-ledger.js');
  const P = await w.load('us/core/accounts/penalty-status.js');
  const R = [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));
  R[0].basis = 5000;
  L.rothAccountsConvert(R, [3000, 0], 0, [1000, 0]);
  expect(R[0].conv).toStrictEqual([{ year: 0, amount: 3000, free: false }, { year: 0, amount: 1000, free: true }]);
  expect(R[2].conv).toStrictEqual([]);
  // the old single entry without the free part
  const R2 = [0, 1, 2, 3].map(() => ({ basis: 0, conv: [] }));
  L.rothAccountsConvert(R2, [3000, 0], 0);
  expect(R2[0].conv).toStrictEqual([{ year: 0, amount: 3000 }]);
  // year 2 (unseasoned), early: 10,000 in the account (5,000 basis, the 4,000 conversion, 1,000 earnings)
  L.rothAccountsSeason(R, 2);
  const early = { free: false, qualified: false };
  // the draw takes the basis, then the 3,000 (penalized), then the 1,000 (free)
  const a = L.rothSlotSplit(R[0], 0, 10000, 7000, early);
  expect(a.fromBasis).toBe(5000);
  expect(a.fromConv).toBe(2000);
  expect(a.penaltyBase).toBe(2000);
  const b = L.rothSlotSplit(R[0], 0, 10000, 9000, early);
  expect(b.fromConv).toBe(4000);
  expect(b.penaltyBase).toBe(3000);
  // an entry without the flag is a taxable one
  const c = L.rothSlotSplit(R2[0], 0, 4000, 3000, early);
  expect(c.penaltyBase).toBe(3000);
  // the penalty-free room: the basis alone while the 3,000 is ahead of the free 1,000
  const wd = { bal: { roth: 10000, bondRoth: 0 }, accts: { roth: [1, 0, 0, 0] }, status: [early, early, early, early], rothAccts: R };
  expect(P.rothFreeCaps(wd)[0]).toBe(5000 + 0);
  // after a draw of 8,000 (the basis and the 3,000) the free 1,000 is next: penalty-free
  L.rothSlotApply(R[0], L.rothSlotSplit(R[0], 0, 10000, 8000, early));
  expect(R[0].conv).toStrictEqual([{ year: 0, amount: 1000, free: true }]);
  wd.bal.roth = 2000;
  expect(P.rothFreeCaps(wd)[0]).toBe(1000);
  // seasoning moves both kinds into the basis
  L.rothAccountsSeason(R, 5);
  expect(R[0].conv).toStrictEqual([]);
  expect(R[0].basis).toBe(1000);
});
