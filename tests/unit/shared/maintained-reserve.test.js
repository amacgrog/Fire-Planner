// The standard projection's maintained bond reserve (Batch 5 step 5b, owner ruling 4 of 2026-10-27), both planners.
//
// After the ladder build the standard mode holds the reserve at the bucket mode's target, (expenses - lump) x bondYears:
// trimBondReserve moves any excess back to stocks of the same kind before the withdrawal, refillBondReserve tops a
// shortfall up after it (at most one year of expenses), and in a surplus year the surplus tops it up first. The bucket mode
// (historical, Monte Carlo) refills and trims in up years only. Part 1 unit-tests trimBondReserve with hand-computed
// values; part 2 runs each engine. The refill's own rules (order, cap, the taxable last resort as a real sale whose gain
// lands in taxableGainGross) are covered by tests/unit/{us,canada}/bond-refill.test.js: the standard mode calls the same
// function with the same cap. The bucket mode trims too, in an up year only (the year it refills), before the withdrawal.
// Part 3 (the Batch 5 step 5b fix): a surplus year refills too, after the surplus, as a reallocation only
// (refillBondReserve's `taxable: false`: traditional, then Roth, never a taxable sale).
import { createRequire } from 'node:module';
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';

const require = createRequire(import.meta.url);
const { legacyToAccounts } = require('../../legacy_balances.js');

const BAL = () => ({
  taxable: 1000, taxableBasis: 600, bondTaxable: 200, bondTaxableBasis: 100,
  traditional: 3000, bondTraditional: 500, roth: 400, bondRoth: 300,
  cash: 50,
});

async function trimmer() {
  const w = await world();
  const { trimBondReserve } = await w.load('shared/core/withdrawals/bond-ladder.js');
  return trimBondReserve;
}

it('trimBondReserve moves the excess back to stocks of the same kind, the same fraction from each bucket', async () => {
  const trim = await trimmer();
  // Reserve 1,000; target 600: 40% of each bucket moves, the taxable bonds' basis with them.
  const bal = BAL();
  trim(bal, 600);
  expect(bal).toStrictEqual({
    taxable: 1080, taxableBasis: 640, bondTaxable: 120, bondTaxableBasis: 60,
    traditional: 3200, bondTraditional: 300, roth: 520, bondRoth: 180,
    cash: 50,
  });
});

it('trimBondReserve leaves a reserve at or below the target alone, and target 0 releases all of it', async () => {
  const trim = await trimmer();
  let bal = BAL();
  trim(bal, 1000);
  expect(bal).toStrictEqual(BAL());
  bal = BAL();
  trim(bal, 5000);
  expect(bal).toStrictEqual(BAL());
  bal = { ...BAL(), bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0 };
  trim(bal, 0);
  expect(bal).toStrictEqual({ ...BAL(), bondTaxable: 0, bondTaxableBasis: 0, bondTraditional: 0, bondRoth: 0 });
  bal = BAL();
  trim(bal, 0);
  expect(bal).toStrictEqual({
    taxable: 1200, taxableBasis: 700, bondTaxable: 0, bondTaxableBasis: 0,
    traditional: 3500, bondTraditional: 0, roth: 700, bondRoth: 0,
    cash: 50,
  });
});

// Part 2: the engines. A single retiree from the first year (the ladder is built in years 0-3 for bondYears 4), bond return
// 0% so the reserve never grows by itself while the target inflates (a shortfall every year), stocks +7%.
async function runner() {
  const w = await world();
  const isUS = w.country === 'us';
  const st = await w.setState();
  const e = await engine(w);
  const baseState = JSON.parse(JSON.stringify(st));
  const load = (patch) => {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, JSON.parse(JSON.stringify(baseState)), isUS ? legacyToAccounts(patch, baseState) : patch);
  };
  const rowsOf = (res) => res.rows.map((r) => ({ age: r.age, bonds: r.bonds, target: (r.expenses - r.lumpExpense) * 4 }));
  const std = (patch) => (load(patch), rowsOf(e.simulateRaw()));
  const hist = (patch, path) => (load(patch), rowsOf(e.simulateHistoricalRaw(path)));
  const household = {
    singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 85,
    taxable: 2000000, traditional: 600000, roth: 300000, cash: 40000,
    spending: 70000, bondYears: 4, stockReturn: 7, bondReturn: 0, inflation: 3,
    ...(isUS ? { stateTax: 'tx' } : { province: 'on' }),
  };
  // Guaranteed income well above expenses (spending 5,000 plus the default housing and healthcare): every year after the
  // build is a surplus year (no withdrawal, no refill call).
  const rich = isUS
    ? { singlePerson: true, ageA: 67, retireAgeA: 67, lifeExpectancyA: 85, ssMonthlyA: 6000, ssClaimAgeA: 67, taxable: 200000, traditional: 300000, roth: 100000, cash: 40000, spending: 5000, bondYears: 4, stockReturn: 7, bondReturn: 0, inflation: 3, stateTax: 'tx' }
    : { singlePerson: true, ageA: 67, retireAgeA: 67, lifeExpectancyA: 85, cppMonthlyA: 4000, oasMonthlyA: 800, taxable: 200000, traditional: 300000, roth: 100000, cash: 40000, spending: 5000, bondYears: 4, stockReturn: 7, bondReturn: 0, inflation: 3, province: 'on' };
  return { isUS, std, hist, household, rich };
}

// Within a millionth of the target: the trim's per-bucket fractions need not sum back to the target to the last bit.
const atTarget = (r) => Math.abs(r.bonds - r.target) <= 1e-6 * r.target;

it('the standard projection holds the reserve at its target in every year after the build (refill after a shortfall)', async () => {
  const { std, household } = await runner();
  const rows = std(household);
  const after = rows.slice(4);
  expect(after.length > 15).toBe(true);
  // The target grows 3% a year and the bonds earn nothing: without the refill the reserve would fall behind it every year.
  expect(after.filter((r) => !atTarget(r))).toStrictEqual([]);
});

it('the standard projection trims a reserve that outgrows its target', async () => {
  const { std, household } = await runner();
  // Bonds at 12%, above the target's 3% growth: every year after the build the reserve is above the target before the trim.
  const rows = std({ ...household, bondReturn: 12 });
  const after = rows.slice(4);
  expect(after.filter((r) => !atTarget(r))).toStrictEqual([]);
});

it('in a surplus year the surplus tops the reserve up to its target', async () => {
  const { std, rich } = await runner();
  // Every year after the build is a surplus year whose surplus exceeds the gap the 3% target growth opens against bonds earning
  // nothing: only the surplus routing can close it. (A smaller surplus leaves the rest to the surplus-year reallocation of
  // part 3; the bucket mode's up years still refill from the stocks only in a withdrawal year.)
  const rows = std(rich);
  const after = rows.slice(4);
  expect(after.length > 10).toBe(true);
  expect(after.filter((r) => !atTarget(r))).toStrictEqual([]);
});

it('the bucket mode trims a reserve above its target in an up year', async () => {
  const { hist, household } = await runner();
  // Stocks +7%, bonds +12% every year (all up years): every year after the build the reserve is above the target before the
  // trim, and the up-year order draws the stocks first, so the year ends at the target.
  const rows = hist(household, (y) => [2000 + y, 7, 3, 12, 0]);
  const after = rows.slice(4);
  expect(after.length > 15).toBe(true);
  expect(after.filter((r) => !atTarget(r))).toStrictEqual([]);
});

it('the bucket mode never trims in a down year', async () => {
  const { hist, rich } = await runner();
  // Stocks -1% every year (all down years), bonds +12%, and surplus years only (no withdrawal draws the reserve): nothing trims
  // or tops up the reserve, which outgrows its 3%-a-year target.
  const rows = hist(rich, (y) => [2000 + y, -1, 3, 12, 0]);
  const last = rows[rows.length - 1];
  expect(last.bonds > last.target * 1.5).toBe(true);
});

it('the buy year of a future home: the purchase cash is not sized into the reserve', async () => {
  const { std, household } = await runner();
  // A 500k home bought for cash at 66 (Opus review C1): the purchase is in that year's `housing`. Sized on the whole year's
  // expenses the target would jump by four times the house price (the refill selling stocks into bonds for a year). Bonds
  // earn nothing here and the year after the purchase spends the same items grown a year (no rent, the home's own costs), so
  // the buy year's reserve sits just under the next year's, not years of the house price above it.
  const rows = std({ ...household, bondReturn: 0, tenure: 'rentThenBuy', buyAge: 66, homeValue: 500000, buyCash: true });
  const buy = rows.find((r) => r.age === 66),
    after = rows.find((r) => r.age === 67);
  // `target` is the year's whole expenses (less lump) x 4, so the buy year's carries four times the house price.
  expect(buy.target - after.target > 4 * 400000).toBe(true);
  expect(buy.bonds <= after.bonds).toBe(true);
  expect(buy.bonds > after.bonds * 0.9).toBe(true);
});

it('bondYears 0: no reserve is ever held', async () => {
  const { std, household } = await runner();
  const rows = std({ ...household, bondYears: 0 });
  expect(rows.filter((r) => r.bonds !== 0)).toStrictEqual([]);
});

// Part 3: the surplus-year refill (Batch 5 step 5b fix). First the option by hand: `taxable: false` moves traditional, then
// Roth, at most min(deficit, maxMove), and never sells taxable (no gain), even when the two run dry.
async function refiller() {
  const w = await world();
  await w.setState();
  const { refillBondReserve } = await w.load('shared/core/withdrawals/bond-ladder.js');
  const ctx = await w.ctx();
  return (over, target, opts) => {
    const bal = { ...BAL(), ...over };
    const profile = w.country === 'us'
      ? { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA: 0, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 70, ageB: 70, singlePerson: true, filing: 'single' }
      : { year: 0, dtcA: 0, dtcB: 0, singlePerson: true, otherA: 0 };
    const wd = { bal, profile, taxableGainGross: 7, traditionalGross: 0, ctx };
    refillBondReserve(wd, target, opts);
    return { ...bal, gain: wd.taxableGainGross };
  };
}

it('refillBondReserve with taxable: false moves traditional first, then Roth, capped at the deficit and at maxMove', async () => {
  const refill = await refiller();
  // Reserve 1,000 (200 + 500 + 300). Target 1,800, cap 500: the deficit is 800, 500 moves, all of it from traditional.
  expect(refill({}, 1800, { maxMove: 500, taxable: false })).toStrictEqual({
    ...BAL(), traditional: 2500, bondTraditional: 1000, gain: 7,
  });
  // Target 1,250, cap 500: the deficit (250) is the limit.
  expect(refill({}, 1250, { maxMove: 500, taxable: false })).toStrictEqual({
    ...BAL(), traditional: 2750, bondTraditional: 750, gain: 7,
  });
  // Traditional holds 100: it moves first, then 350 of Roth (deficit 800, cap 450).
  expect(refill({ traditional: 100 }, 1800, { maxMove: 450, taxable: false })).toStrictEqual({
    ...BAL(), traditional: 0, bondTraditional: 600, roth: 50, bondRoth: 650, gain: 7,
  });
  // A reserve at or above the target moves nothing.
  expect(refill({}, 1000, { maxMove: 500, taxable: false })).toStrictEqual({ ...BAL(), gain: 7 });
  expect(refill({}, 900, { maxMove: 500, taxable: false })).toStrictEqual({ ...BAL(), gain: 7 });
});

it('refillBondReserve with taxable: false never sells taxable, even when traditional and Roth run dry', async () => {
  const refill = await refiller();
  // Deficit 4,000, uncapped: traditional (3,000) and Roth (400) move, the last 600 stays short; taxable, its basis, the
  // taxable bonds and the realized gain are untouched.
  expect(refill({}, 5000, { taxable: false })).toStrictEqual({
    ...BAL(), traditional: 0, bondTraditional: 3500, roth: 0, bondRoth: 700, gain: 7,
  });
  // Nothing in traditional or Roth: nothing moves.
  expect(refill({ traditional: 0, roth: 0 }, 5000, { maxMove: 1000, taxable: false })).toStrictEqual({
    ...BAL(), traditional: 0, roth: 0, gain: 7,
  });
  // The default (taxable: true) still reaches taxable as the last resort: the same call without the option sells some.
  const sold = refill({ traditional: 0, roth: 0 }, 5000, { maxMove: 100 });
  expect(sold.taxable < 1000).toBe(true);
  expect(sold.bondTaxable > 200).toBe(true);
});

// The engines: a single retiree at 70 whose ladder build (years 0-3, bondYears 4) takes all of stock traditional, so in the
// RMD (RRIF) years the required distributions come out of bondTraditional. Guaranteed income covers most of the expenses, so
// every year after the build is a surplus year whose surplus (after the cash top-up) is smaller than what the distribution
// takes out of the reserve. Bonds +2% against a 3% inflating target. Before the fix the reserve decayed below its target in
// those years (US from 76, Canada from 74); now the reallocation moves stock into bonds and holds the target.
const surplusHousehold = (isUS) => ({
  singlePerson: true, ageA: 70, retireAgeA: 70, lifeExpectancyA: 95,
  taxable: 300000, traditional: 250000, roth: 500000, cash: 40000,
  bondYears: 4, stockReturn: 7, bondReturn: 2, inflation: 3,
  ...(isUS
    ? { spending: 40000, ssMonthlyA: 6200, ssClaimAgeA: 70, stateTax: 'tx' }
    : { spending: 28000, cppMonthlyA: 4200, oasMonthlyA: 800, province: 'on' }),
});
async function fullRunner() {
  const w = await world();
  const isUS = w.country === 'us';
  const st = await w.setState();
  const e = await engine(w);
  const baseState = JSON.parse(JSON.stringify(st));
  return {
    isUS,
    std(patch) {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, JSON.parse(JSON.stringify(baseState)), isUS ? legacyToAccounts(patch, baseState) : patch);
      return e.simulateRaw().rows.map((r) => ({
        age: r.age, bonds: r.bonds, target: (r.expenses - r.lumpExpense) * 4, traditional: r.traditional, roth: r.roth,
        taxableWithdrawn: r.taxableWithdrawn, rothWithdrawn: r.rothWithdrawn || 0,
      }));
    },
  };
}
const ages = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

it('a surplus year refills the reserve by reallocation: the reserve holds its target through the RMD years', async () => {
  const { isUS, std } = await fullRunner();
  const rows = std(surplusHousehold(isUS));
  // The years after the build except the last (the death year's target drops, and the trim follows it).
  const after = rows.slice(4, -1);
  expect(after.map((r) => r.age)).toStrictEqual(ages(74, 94));
  // Surplus years only: no taxable or Roth draw.
  expect(after.filter((r) => r.taxableWithdrawn !== 0 || r.rothWithdrawn !== 0)).toStrictEqual([]);
  // The reserve holds its target in every one of them.
  expect(after.filter((r) => !atTarget(r))).toStrictEqual([]);
  // The years the refill moved Roth stock into bonds: Roth grew by less than its 7% (nothing else touches it here).
  const movedRoth = [];
  for (let i = 4; i < rows.length - 1; i++) {
    if (rows[i - 1].roth * (1 + 0.07) - rows[i].roth > 1) movedRoth.push(rows[i].age);
  }
  // US: stock traditional is empty from 75; from 76 to 93 every year moves Roth (at 94 the surplus alone reaches the target).
  // Canada: from 75 every year moves Roth.
  expect(movedRoth).toStrictEqual(isUS ? ages(76, 93) : ages(75, 94));
  if (!isUS) {
    const r73 = rows.find((r) => r.age === 73),
      r74 = rows.find((r) => r.age === 74);
    // At 74 Canada moves the last stock RRSP money first (traditional before the TFSA): the stock RRSP falls from 18.7k to
    // under 100, and the TFSA grows untouched.
    expect(r73.traditional > 18000).toBe(true);
    expect(r74.traditional < 100).toBe(true);
    expect(r74.roth).toBe(r73.roth * (1 + 0.07));
  }
});

it('a surplus year whose surplus already reached the target moves nothing', async () => {
  const { isUS, std } = await fullRunner();
  // The rich household of part 2 with no traditional: the ladder is built from Roth, there are no RMDs, and every year after
  // the build is a surplus year whose surplus tops the reserve up to the target by itself.
  const rich = isUS
    ? { singlePerson: true, ageA: 67, retireAgeA: 67, lifeExpectancyA: 85, ssMonthlyA: 6000, ssClaimAgeA: 67, taxable: 200000, traditional: 0, roth: 600000, cash: 40000, spending: 5000, bondYears: 4, stockReturn: 7, bondReturn: 0, inflation: 3, stateTax: 'tx' }
    : { singlePerson: true, ageA: 67, retireAgeA: 67, lifeExpectancyA: 85, cppMonthlyA: 4000, oasMonthlyA: 800, taxable: 200000, traditional: 0, roth: 600000, cash: 40000, spending: 5000, bondYears: 4, stockReturn: 7, bondReturn: 0, inflation: 3, province: 'on' };
  const rows = std(rich);
  const after = rows.slice(4);
  expect(after.length > 10).toBe(true);
  expect(after.filter((r) => !atTarget(r))).toStrictEqual([]);
  expect(after.filter((r) => r.taxableWithdrawn !== 0 || r.rothWithdrawn !== 0)).toStrictEqual([]);
  // The refill had nothing to do: Roth grows by exactly its 7% every year, as it would with the call a no-op. (The first
  // year after the build is left out: the ladder built more than that year's target, and the trim hands the excess back to
  // Roth.)
  const notGrown = [];
  for (let i = 5; i < rows.length; i++) if (rows[i].roth !== rows[i - 1].roth * (1 + 0.07)) notGrown.push(rows[i].age);
  expect(notGrown).toStrictEqual([]);
});
