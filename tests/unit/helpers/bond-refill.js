// The cases of the bond-reserve refill suites, shared by tests/unit/us/bond-refill.test.js and
// tests/unit/canada/bond-refill.test.js (the old tests/bond_refill.js ran one body against both planners).
// `c` is the calling file's counter; every executed check ticks it once and reports with expect.soft.
import { createRequire } from 'node:module';
import { expect } from 'vitest';
import { world } from './world.js';
import { engine } from './engine.js';

const require = createRequire(import.meta.url);
const { legacyToAccounts } = require('../../legacy_balances.js');

export function bondRefillCases(isUS, c) {
  const name = isUS ? 'US' : 'Canada';
  const check = (ok, msg) => {
    c.tick();
    expect.soft(ok, msg).toBe(true);
  };
  const same = (a, b, msg) => {
    c.tick();
    expect.soft(a, msg).toBe(b);
  };
  const near = (a, b, msg) => check(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);

  async function setup() {
    const w = await world();
    const st = await w.setState();
    if (isUS) w.setTaxYear(2026);
    const bl = await w.load('shared/core/withdrawals/bond-ladder.js');
    const { taxFor } = await w.load(isUS ? 'us/core/tax/federal-tax.js' : 'canada/core/tax/tax.js');
    return { w, st, bl, taxFor };
  }

  const profileFor = (otherA) =>
    isUS
      ? { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' }
      : { year: 0, dtcA: 0, dtcB: 0, singlePerson: true, otherA };

  async function unit() {
    const { bl, taxFor } = await setup();
    // Fresh balances for every case: taxable 500k (basis 250k), traditional 300k, Roth 100k,
    // no bonds, a home with a mortgage, and some cash that must never be touched.
    // The withdrawal object the engine hands the refill: balances, the year's tax profile and the
    // gains/traditional income realized so far (0 here). `gainGross` is the gain the refill realized.
    const run = (over, target, opts, otherA = 0) => {
      const bal = {
        taxable: 500000, taxableBasis: 250000, bondTaxable: 0, bondTaxableBasis: 0,
        bondTraditional: 0, bondRoth: 0, traditional: 300000, roth: 100000,
        cash: 12345, home: 400000, mortgage: 100000, ...over,
      };
      const profile = profileFor(otherA);
      const wd = { bal, profile, taxableGainGross: 0, traditionalGross: 0 };
      bl.refillBondReserve(wd, target, opts);
      // What the tax code charges for the realized gain, computed independently.
      const taxOnGain = taxFor(profile, wd.taxableGainGross, 0) - taxFor(profile, 0, 0);
      return { ...bal, gainGross: wd.taxableGainGross, taxOnGain };
    };
    const close = (a, b, msg, tol = 0.1) => check(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);
    const untouched = (b, label) => {
      same(b.home, 400000, `${label}: home equity untouched`);
      same(b.mortgage, 100000, `${label}: mortgage untouched`);
      same(b.cash, 12345, `${label}: cash untouched`);
    };

    // 1. Cap: a 300k target with a 100k cap moves 100k a call out of traditional (taxable is last).
    let b = run({}, 300000, { maxMove: 100000 });
    near(b.traditional, 200000, `${name} cap year 1 traditional`);
    near(b.bondTraditional, 100000, `${name} cap year 1 bondTraditional`);
    near(b.taxable, 500000, `${name} cap year 1 taxable untouched`);
    near(b.taxableBasis, 250000, `${name} cap year 1 taxable basis untouched`);
    near(b.bondTaxable, 0, `${name} cap year 1 no taxable bonds`);
    near(b.roth, 100000, `${name} cap year 1 roth untouched`);
    untouched(b, `${name} cap year 1`);
    b = run({ traditional: 200000, bondTraditional: 100000 }, 300000, { maxMove: 100000 });
    near(b.traditional, 100000, `${name} cap year 2 traditional`);
    near(b.bondTraditional, 200000, `${name} cap year 2 bondTraditional`);
    b = run({ traditional: 100000, bondTraditional: 200000 }, 300000, { maxMove: 100000 });
    near(b.traditional, 0, `${name} cap year 3 traditional`);
    near(b.bondTraditional, 300000, `${name} cap year 3 reaches the target`);
    b = run({ traditional: 0, bondTraditional: 300000 }, 300000, { maxMove: 100000 });
    near(b.roth, 100000, `${name} no move once the target is met`);
    near(b.bondRoth, 0, `${name} no move once the target is met (bondRoth)`);

    // 2. A deficit smaller than the cap moves only the deficit; a zero cap moves nothing.
    b = run({}, 50000, { maxMove: 100000 });
    near(b.bondTraditional, 50000, `${name} small deficit`);
    b = run({}, 300000, { maxMove: 0 });
    near(b.bondTraditional + b.bondRoth, 0, `${name} zero cap`);

    // 3. Traditional is short (30k): the rest of the cap spills to Roth. Roth alone can fill it.
    b = run({ traditional: 30000 }, 300000, { maxMove: 100000 });
    near(b.bondTraditional, 30000, `${name} spill: traditional first`);
    near(b.bondRoth, 70000, `${name} spill: then Roth`);
    near(b.roth, 30000, `${name} spill: Roth balance`);
    untouched(b, `${name} spill`);
    b = run({ traditional: 0 }, 300000, { maxMove: 100000 });
    near(b.bondRoth, 100000, `${name} Roth alone can fill the cap`);
    // Taxable is the last resort and a real sale. With no traditional and no Roth, asking for 100k
    // into bonds sells enough stock that 100k is left after the tax on the realized gain: the bonds
    // net 100k at full basis, half the stock sold was gain (basis 50%), the sale is recorded as a
    // realized gain, and the tax paid out of the proceeds equals what taxFor charges for it.
    b = run({ traditional: 0, roth: 0 }, 300000, { maxMove: 100000 });
    close(b.bondTaxable, 100000, `${name} taxable fallback nets the cap`);
    close(b.bondTaxableBasis, b.bondTaxable, `${name} new bonds are bought at market (full basis)`, 1e-9);
    const sold = 500000 - b.taxable;
    close(b.gainGross, sold * 0.5, `${name} half of each dollar sold is gain`, 1e-6);
    close(sold - b.bondTaxable, b.taxOnGain, `${name} tax paid from the proceeds equals the tax on the gain`, 0.02);
    close(250000 - b.taxableBasis, sold * 0.5, `${name} basis sold is the other half`, 1e-6);
    // With other income the gain is taxed, so the stock sold exceeds the amount moved by that tax.
    b = run({ traditional: 0, roth: 0 }, 300000, { maxMove: 100000 }, isUS ? 150000 : 120000);
    check(b.taxOnGain > 100, `${name} with other income the realized gain is taxed (${b.taxOnGain.toFixed(0)})`);
    close(b.bondTaxable, 100000, `${name} still nets the cap after tax`);
    close(500000 - b.taxable - b.bondTaxable, b.taxOnGain, `${name} tax paid from the proceeds`, 0.02);
    // Inside a retirement account nothing is realized.
    b = run({}, 300000, { maxMove: 100000 });
    same(b.gainGross, 0, `${name} a retirement-account swap realizes no gain`);
    // Taxable only fills what traditional and Roth could not: 30k + 20k from them, 50k net from taxable.
    // Canada: 30,000 of other income keeps the groceries benefit flat (past its 2% single-supplement range, short of its
    // phase-out). With no income that supplement phases in as the stock is sold, so the net can exceed the gross by up to
    // 234 and the shared drawTaxable bisection (which starts at the amount needed) sells that much more: a known
    // approximation, not exercised here.
    b = run({ traditional: 30000, roth: 20000 }, 300000, { maxMove: 100000 }, isUS ? 0 : 30000);
    close(b.bondTraditional, 30000, `${name} order: traditional`, 1e-9);
    close(b.bondRoth, 20000, `${name} order: then Roth`, 1e-9);
    close(b.bondTaxable, 50000, `${name} order: then taxable for the rest of the cap`);
    // An unreachable target moves everything it can, in that order, and never touches home/cash.
    b = run({ home: 900000 }, 10000000, { maxMove: 1e9 });
    close(b.bondTraditional, 300000, `${name} unreachable target: all traditional`, 1e-9);
    close(b.bondRoth, 100000, `${name} unreachable target: all Roth`, 1e-9);
    close(b.taxable, 0, `${name} unreachable target: all taxable sold`, 1e-6);
    close(b.bondTaxable, 500000 - b.taxOnGain, `${name} unreachable target: bonds hold the proceeds net of tax`, 0.02);
    same(b.home, 900000, `${name}: home equity untouched`);
    same(b.cash, 12345, `${name}: cash untouched`);

    // 4. No options: uncapped, the previous behavior (still used by nothing but this test).
    b = run({}, 300000, undefined);
    near(b.bondTraditional, 300000, `${name} no options: whole deficit`);
  }

  async function ladderUnit() {
    const { bl, taxFor } = await setup();
    const rot = (over, year, otherA = 0) => {
      const bal = {
        taxable: 500000, taxableBasis: 250000, bondTaxable: 0, bondTaxableBasis: 0,
        bondTraditional: 0, bondRoth: 0, traditional: 300000, roth: 100000, ...over,
      };
      const profile = profileFor(otherA);
      // A 300k ladder over years 0-2 (so 100k, 200k, 300k).
      const gain = bl.rotateIntoBondLadder(bal, { year, ladderTarget: 300000, rotationStartYear: 0, rotationEndYear: 2 }, profile, 0);
      return { ...bal, gain, taxOnGain: taxFor(profile, gain, 0) - taxFor(profile, 0, 0) };
    };
    const close = (a, b, msg, tol = 1e-6) => check(Math.abs(a - b) <= tol, `${name} ladder ${msg}: expected ${b}, got ${a}`);
    // Ramp, from traditional only: 100k, 200k, 300k at the end of years 0, 1, 2; nothing outside the window.
    let b = rot({}, 0);
    close(b.bondTraditional, 100000, 'year 0 ramp'); close(b.traditional, 200000, 'year 0 traditional'); close(b.taxable, 500000, 'year 0 taxable untouched'); close(b.gain, 0, 'year 0 no gain');
    b = rot({ traditional: 200000, bondTraditional: 100000 }, 1);
    close(b.bondTraditional, 200000, 'year 1 ramp'); close(b.traditional, 100000, 'year 1 traditional');
    b = rot({ traditional: 100000, bondTraditional: 200000 }, 2);
    close(b.bondTraditional, 300000, 'year 2 reaches the target'); close(b.traditional, 0, 'year 2 traditional');
    b = rot({}, 3); close(b.bondTraditional, 0, 'after the window nothing moves');
    b = rot({}, -1); close(b.bondTraditional, 0, 'before the window nothing moves');
    // Spill: traditional 30k, then Roth 70k (a retirement-account move: no gain, no tax).
    b = rot({ traditional: 30000 }, 0); // year 0 target is 100k
    close(b.bondTraditional, 30000, 'spill: traditional first'); close(b.bondRoth, 70000, 'spill: then Roth'); close(b.gain, 0, 'spill: no gain'); close(b.taxable, 500000, 'spill: taxable untouched');
    // Last resort: taxable, a real sale. 100k net into bonds, half of what is sold is gain, full basis on the bonds.
    b = rot({ traditional: 0, roth: 0 }, 0);
    close(b.bondTaxable, 100000, 'taxable fallback nets the ramp', 0.1);
    close(b.bondTaxableBasis, b.bondTaxable, 'new bonds are bought at market (full basis)', 1e-9);
    const sold = 500000 - b.taxable;
    close(b.gain, sold * 0.5, 'half of what is sold is gain');
    close(sold - b.bondTaxable, b.taxOnGain, 'tax paid from the proceeds equals the tax on the gain', 0.02);
    close(250000 - b.taxableBasis, sold * 0.5, 'basis sold is the other half');
    b = rot({ traditional: 0, roth: 0 }, 0, isUS ? 150000 : 120000);
    check(b.taxOnGain > 100, `${name} ladder: with other income the realized gain is taxed`);
    // Roth then taxable: 20k Roth, rest from taxable.
    b = rot({ traditional: 0, roth: 20000 }, 0);
    close(b.bondRoth, 20000, 'Roth before taxable'); close(b.bondTaxable, 80000, 'taxable for the rest', 0.1);
  }

  // A constant path: stocks +8%, inflation 3%, bonds 0%. The bond bucket never grows by itself while
  // the target (years of expenses) inflates, so every year has a deficit to refill.
  const PATH = (y) => [2000 + y, 8, 3, 0, 0];
  async function engineCases() {
    const { w, st, } = await setup();
    const e = await engine(w);
    const baseState = JSON.parse(JSON.stringify(st));
    const run = (patch) => {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, JSON.parse(JSON.stringify(baseState)), isUS ? legacyToAccounts(patch, baseState) : patch);
      const res = e.simulateHistorical(PATH);
      return res.rows.map((r) => ({ age: r.age, bonds: r.bonds, expenses: r.expenses, lump: r.lumpExpense, home: r.homeEquity, working: r.working }));
    };
    const base = isUS
      ? { singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 80, taxable: 2000000, traditional: 500000, roth: 200000, cash: 40000, spending: 70000, bondYears: 4, stateTax: 'tx' }
      : { singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 80, taxable: 2000000, traditional: 500000, roth: 200000, cash: 40000, spending: 70000, bondYears: 4, province: 'on' };

    // Cap: after the ladder window, no year grows the bond reserve by more than one year of that
    // year's expenses (net of lump), beyond what the bonds earn (0% here).
    const rows = run(base);
    let refilled = 0;
    for (let i = 5; i < rows.length; i++) {
      const inc = rows[i].bonds - rows[i - 1].bonds;
      check(inc <= rows[i].expenses - rows[i].lump + 1, `${name} cap: year ${i} bonds grew ${inc.toFixed(0)} > one year of expenses ${(rows[i].expenses - rows[i].lump).toFixed(0)}`);
      if (inc > 1) refilled++;
    }
    check(refilled > 0, `${name} control: the scenario must actually refill (otherwise the cap check is vacuous)`);

    // Taxable-only household: brokerage is the fallback, so it still refills, within the same cap.
    const brokerage = run({ ...base, traditional: 0, roth: 0 });
    let bgrew = 0;
    for (let i = 5; i < brokerage.length; i++) {
      const inc = brokerage[i].bonds - brokerage[i - 1].bonds;
      check(inc <= brokerage[i].expenses - brokerage[i].lump + 1, `${name} taxable-only cap: year ${i} bonds grew ${inc.toFixed(0)}`);
      if (inc > 1) bgrew++;
    }
    check(bgrew > 0, `${name} a taxable-only household must refill from brokerage as the last resort`);

    // Surplus years: the reserve is filled from surplus cash, limited only by the surplus and by the
    // bondYears target (bondYears x that year's expenses net of lump), NOT by the one-year cap.
    // A high earner far from retirement has a large surplus: year 0 reaches the full 3-year target.
    const earner = { ...base, ageA: 35, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 1500000, taxable: 100000, traditional: 50000, roth: 20000, cash: 40000, spending: 60000, bondYears: 3 };
    const wr = run(earner);
    const target0 = 3 * (wr[0].expenses - wr[0].lump);
    near(wr[0].bonds, target0, `${name} surplus fills the whole 3-year target in year 0 (more than one year of expenses)`);
    check(wr[0].bonds > 2 * (wr[0].expenses - wr[0].lump), `${name} surplus refill is not held to one year of expenses`);
    for (let i = 1; i < 10; i++) check(wr[i].bonds <= 3 * (wr[i].expenses - wr[i].lump) + 1, `${name} surplus refill never exceeds the bondYears target (year ${i})`);
    // Limited by the surplus: a household with almost no surplus gets a partial reserve.
    const thin = run({ ...earner, incomeA: 65000, spending: 62000 });
    check(thin[0].bonds < 3 * (thin[0].expenses - thin[0].lump) - 1000, `${name} a small surplus cannot fill the target`);
    const none = run({ ...earner, bondYears: 0 });
    near(none[0].bonds, 0, `${name} bondYears 0 builds no reserve`);

    if (!isUS) return;
    // Under 59.5 with no taxable money: the reserve still refills from traditional/Roth (a
    // reallocation owes no penalty), capped at one year of that year's expenses.
    const young = { ...base, ageA: 45, retireAgeA: 45, lifeExpectancyA: 70, taxable: 0, traditional: 1500000, roth: 600000, cash: 20000, spending: 50000, bondYears: 3 };
    const early = run(young);
    let grew = 0;
    for (let i = 4; i < 12; i++) {
      const inc = early[i].bonds - early[i - 1].bonds;
      check(inc <= early[i].expenses - early[i].lump + 1, `${name} early retiree cap: year ${i} bonds grew ${inc.toFixed(0)}`);
      if (inc > 1) grew++;
    }
    check(grew > 0, `${name} an early retiree with no taxable money must refill from traditional/Roth`);
  }

  return { unit, engineCases, ladderUnit };
}
