// The standard projection's maintained bond reserve (Batch 5 step 5b, owner ruling 4 of 2026-10-27), both planners.
//
// After the ladder build the standard mode holds the reserve at the bucket mode's target, (expenses - lump) x bondYears:
// trimBondReserve moves any excess back to stocks of the same kind before the withdrawal, refillBondReserve tops a
// shortfall up after it (at most one year of expenses), and in a surplus year the surplus tops it up first. The bucket mode
// (historical, Monte Carlo) refills and trims in up years only. Part 1 unit-tests trimBondReserve with hand-computed
// values; part 2 runs each engine. The refill's own rules (order, cap, the taxable last resort as a real sale whose gain
// lands in taxableGainGross) are covered by tests/unit/{us,canada}/bond-refill.test.js: the standard mode calls the same
// function with the same cap. The bucket mode trims too, in an up year only (the year it refills), before the withdrawal.
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
  // nothing: only the surplus routing can close it. (A surplus smaller than the gap leaves the reserve short that year, as in
  // the bucket mode's up years: the stocks refill it only in a withdrawal year.)
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
