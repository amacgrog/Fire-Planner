// Gradual bond-reserve refill in the historical / Monte Carlo engine (Batch 1, step 6).
//
// Rules (owner decision, docs/next-batches-plan.md "Batch 1 notes"):
//  - Surplus cash refills the reserve as much as needed, uncapped (routeSurplus; it can never
//    trigger the 10% early-withdrawal penalty).
//  - Moving stocks into bonds (refillBondReserve, up years) is capped at one year of that
//    year's expenses (net of lump expenses) per year.
//  - That move comes from traditional first, then Roth (inside each account: a reallocation, so no
//    income, no tax, no 10% penalty, and age does not restrict it), then taxable only when neither
//    has anything left. Taxable is a real sale: the gain is realized (added to the year's gains, so
//    it reaches tax and MAGI), the tax is paid out of the proceeds, and the bonds net the amount
//    moved at full basis. Home equity and cash are never a source.
//
// Part 1 is a unit test of refillBondReserve with hand-computed numbers. Part 2 runs the
// engine on a constant path and checks the cap and the penalty rule year by year.
//
// Part 3 (ladderUnit) covers the pre-retirement ladder, rotateIntoBondLadder: same source order
// (traditional, Roth, taxable last, taxable a real sale with the realized gain returned and the tax
// paid from the proceeds), ramped linearly over the window.
//
// Run: node tests/bond_refill.js

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const assert = require('assert');
const path = require('path');
const { legacyToAccounts } = require('./legacy_balances');

const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);

async function unit(page, name, isUS) {
  // Fresh balances for every case: taxable 500k (basis 250k), traditional 300k, Roth 100k,
  // no bonds, a home with a mortgage, and some cash that must never be touched.
  // The withdrawal object the engine hands the refill: balances, the year's tax profile and the
  // gains/traditional income realized so far (0 here). `gainGross` is the gain the refill realized.
  const run = (over, target, opts, otherA = 0) =>
    page.evaluate(
      ({ over, target, opts, otherA, isUS }) => {
        const bal = {
          taxable: 500000, taxableBasis: 250000, bondTaxable: 0, bondTaxableBasis: 0,
          bondTraditional: 0, bondRoth: 0, traditional: 300000, roth: 100000,
          cash: 12345, home: 400000, mortgage: 100000, ...over,
        };
        const profile = isUS
          ? { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' }
          : { year: 0, dtcA: 0, dtcB: 0, singlePerson: true, otherA };
        const wd = { bal, profile, taxableGainGross: 0, traditionalGross: 0 };
        window.__test_refillBondReserve(wd, target, opts);
        const taxFor = window.__test_tax.taxFor;
        // What the tax code charges for the realized gain, computed independently.
        const taxOnGain = taxFor(profile, wd.taxableGainGross, 0) - taxFor(profile, 0, 0);
        return { ...bal, gainGross: wd.taxableGainGross, taxOnGain };
      },
      { over, target, opts, otherA, isUS },
    );
  const close = (a, b, msg, tol = 0.1) => assert(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);
  const untouched = (b, label) => {
    assert.strictEqual(b.home, 400000, `${label}: home equity untouched`);
    assert.strictEqual(b.mortgage, 100000, `${label}: mortgage untouched`);
    assert.strictEqual(b.cash, 12345, `${label}: cash untouched`);
  };

  // 1. Cap: a 300k target with a 100k cap moves 100k a call out of traditional (taxable is last).
  let b = await run({}, 300000, { maxMove: 100000 });
  near(b.traditional, 200000, `${name} cap year 1 traditional`);
  near(b.bondTraditional, 100000, `${name} cap year 1 bondTraditional`);
  near(b.taxable, 500000, `${name} cap year 1 taxable untouched`);
  near(b.taxableBasis, 250000, `${name} cap year 1 taxable basis untouched`);
  near(b.bondTaxable, 0, `${name} cap year 1 no taxable bonds`);
  near(b.roth, 100000, `${name} cap year 1 roth untouched`);
  untouched(b, `${name} cap year 1`);
  b = await run({ traditional: 200000, bondTraditional: 100000 }, 300000, { maxMove: 100000 });
  near(b.traditional, 100000, `${name} cap year 2 traditional`);
  near(b.bondTraditional, 200000, `${name} cap year 2 bondTraditional`);
  b = await run({ traditional: 100000, bondTraditional: 200000 }, 300000, { maxMove: 100000 });
  near(b.traditional, 0, `${name} cap year 3 traditional`);
  near(b.bondTraditional, 300000, `${name} cap year 3 reaches the target`);
  b = await run({ traditional: 0, bondTraditional: 300000 }, 300000, { maxMove: 100000 });
  near(b.roth, 100000, `${name} no move once the target is met`);
  near(b.bondRoth, 0, `${name} no move once the target is met (bondRoth)`);

  // 2. A deficit smaller than the cap moves only the deficit; a zero cap moves nothing.
  b = await run({}, 50000, { maxMove: 100000 });
  near(b.bondTraditional, 50000, `${name} small deficit`);
  b = await run({}, 300000, { maxMove: 0 });
  near(b.bondTraditional + b.bondRoth, 0, `${name} zero cap`);

  // 3. Traditional is short (30k): the rest of the cap spills to Roth. Roth alone can fill it.
  b = await run({ traditional: 30000 }, 300000, { maxMove: 100000 });
  near(b.bondTraditional, 30000, `${name} spill: traditional first`);
  near(b.bondRoth, 70000, `${name} spill: then Roth`);
  near(b.roth, 30000, `${name} spill: Roth balance`);
  untouched(b, `${name} spill`);
  b = await run({ traditional: 0 }, 300000, { maxMove: 100000 });
  near(b.bondRoth, 100000, `${name} Roth alone can fill the cap`);
  // Taxable is the last resort and a real sale. With no traditional and no Roth, asking for 100k
  // into bonds sells enough stock that 100k is left after the tax on the realized gain: the bonds
  // net 100k at full basis, half the stock sold was gain (basis 50%), the sale is recorded as a
  // realized gain, and the tax paid out of the proceeds equals what taxFor charges for it.
  b = await run({ traditional: 0, roth: 0 }, 300000, { maxMove: 100000 });
  close(b.bondTaxable, 100000, `${name} taxable fallback nets the cap`);
  close(b.bondTaxableBasis, b.bondTaxable, `${name} new bonds are bought at market (full basis)`, 1e-9);
  const sold = 500000 - b.taxable;
  close(b.gainGross, sold * 0.5, `${name} half of each dollar sold is gain`, 1e-6);
  close(sold - b.bondTaxable, b.taxOnGain, `${name} tax paid from the proceeds equals the tax on the gain`, 0.02);
  close(250000 - b.taxableBasis, sold * 0.5, `${name} basis sold is the other half`, 1e-6);
  // With other income the gain is taxed, so the stock sold exceeds the amount moved by that tax.
  b = await run({ traditional: 0, roth: 0 }, 300000, { maxMove: 100000 }, isUS ? 150000 : 120000);
  assert(b.taxOnGain > 100, `${name} with other income the realized gain is taxed (${b.taxOnGain.toFixed(0)})`);
  close(b.bondTaxable, 100000, `${name} still nets the cap after tax`);
  close(500000 - b.taxable - b.bondTaxable, b.taxOnGain, `${name} tax paid from the proceeds`, 0.02);
  // Inside a retirement account nothing is realized.
  b = await run({}, 300000, { maxMove: 100000 });
  assert.strictEqual(b.gainGross, 0, `${name} a retirement-account swap realizes no gain`);
  // Taxable only fills what traditional and Roth could not: 30k + 20k from them, 50k net from taxable.
  // Canada: 30,000 of other income keeps the groceries benefit flat (past its 2% single-supplement range, short of its
  // phase-out). With no income that supplement phases in as the stock is sold, so the net can exceed the gross by up to
  // 234 and the shared drawTaxable bisection (which starts at the amount needed) sells that much more: a known
  // approximation, not exercised here.
  b = await run({ traditional: 30000, roth: 20000 }, 300000, { maxMove: 100000 }, isUS ? 0 : 30000);
  close(b.bondTraditional, 30000, `${name} order: traditional`, 1e-9);
  close(b.bondRoth, 20000, `${name} order: then Roth`, 1e-9);
  close(b.bondTaxable, 50000, `${name} order: then taxable for the rest of the cap`);
  // An unreachable target moves everything it can, in that order, and never touches home/cash.
  b = await run({ home: 900000 }, 10000000, { maxMove: 1e9 });
  close(b.bondTraditional, 300000, `${name} unreachable target: all traditional`, 1e-9);
  close(b.bondRoth, 100000, `${name} unreachable target: all Roth`, 1e-9);
  close(b.taxable, 0, `${name} unreachable target: all taxable sold`, 1e-6);
  close(b.bondTaxable, 500000 - b.taxOnGain, `${name} unreachable target: bonds hold the proceeds net of tax`, 0.02);
  assert.strictEqual(b.home, 900000, `${name}: home equity untouched`);
  assert.strictEqual(b.cash, 12345, `${name}: cash untouched`);

  // 4. No options: uncapped, the previous behavior (still used by nothing but this test).
  b = await run({}, 300000, undefined);
  near(b.bondTraditional, 300000, `${name} no options: whole deficit`);
}

async function ladderUnit(page, name, isUS) {
  const rot = (over, year, otherA = 0) =>
    page.evaluate(
      ({ over, year, otherA, isUS }) => {
        const bal = {
          taxable: 500000, taxableBasis: 250000, bondTaxable: 0, bondTaxableBasis: 0,
          bondTraditional: 0, bondRoth: 0, traditional: 300000, roth: 100000, ...over,
        };
        const profile = isUS
          ? { wageA: 0, wageB: 0, pensionA: 0, pensionB: 0, rmdA: 0, rmdB: 0, otherA, otherB: 0, ssA: 0, ssB: 0, invOrd: 0, invQual: 0, year: 0, ageA: 55, ageB: 55, singlePerson: true, filing: 'single' }
          : { year: 0, dtcA: 0, dtcB: 0, singlePerson: true, otherA };
        // A 300k ladder over years 0-2 (so 100k, 200k, 300k).
        const gain = window.__test_rotateIntoBondLadder(bal, { year, ladderTarget: 300000, rotationStartYear: 0, rotationEndYear: 2 }, profile, 0);
        const taxFor = window.__test_tax.taxFor;
        return { ...bal, gain, taxOnGain: taxFor(profile, gain, 0) - taxFor(profile, 0, 0) };
      },
      { over, year, otherA, isUS },
    );
  const close = (a, b, msg, tol = 1e-6) => assert(Math.abs(a - b) <= tol, `${name} ladder ${msg}: expected ${b}, got ${a}`);
  // Ramp, from traditional only: 100k, 200k, 300k at the end of years 0, 1, 2; nothing outside the window.
  let b = await rot({}, 0);
  close(b.bondTraditional, 100000, 'year 0 ramp'); close(b.traditional, 200000, 'year 0 traditional'); close(b.taxable, 500000, 'year 0 taxable untouched'); close(b.gain, 0, 'year 0 no gain');
  b = await rot({ traditional: 200000, bondTraditional: 100000 }, 1);
  close(b.bondTraditional, 200000, 'year 1 ramp'); close(b.traditional, 100000, 'year 1 traditional');
  b = await rot({ traditional: 100000, bondTraditional: 200000 }, 2);
  close(b.bondTraditional, 300000, 'year 2 reaches the target'); close(b.traditional, 0, 'year 2 traditional');
  b = await rot({}, 3); close(b.bondTraditional, 0, 'after the window nothing moves');
  b = await rot({}, -1); close(b.bondTraditional, 0, 'before the window nothing moves');
  // Spill: traditional 30k, then Roth 70k (a retirement-account move: no gain, no tax).
  b = await rot({ traditional: 30000 }, 0); // year 0 target is 100k
  close(b.bondTraditional, 30000, 'spill: traditional first'); close(b.bondRoth, 70000, 'spill: then Roth'); close(b.gain, 0, 'spill: no gain'); close(b.taxable, 500000, 'spill: taxable untouched');
  // Last resort: taxable, a real sale. 100k net into bonds, half of what is sold is gain, full basis on the bonds.
  b = await rot({ traditional: 0, roth: 0 }, 0);
  close(b.bondTaxable, 100000, 'taxable fallback nets the ramp', 0.1);
  close(b.bondTaxableBasis, b.bondTaxable, 'new bonds are bought at market (full basis)', 1e-9);
  const sold = 500000 - b.taxable;
  close(b.gain, sold * 0.5, 'half of what is sold is gain');
  close(sold - b.bondTaxable, b.taxOnGain, 'tax paid from the proceeds equals the tax on the gain', 0.02);
  close(250000 - b.taxableBasis, sold * 0.5, 'basis sold is the other half');
  b = await rot({ traditional: 0, roth: 0 }, 0, isUS ? 150000 : 120000);
  assert(b.taxOnGain > 100, `${name} ladder: with other income the realized gain is taxed`);
  // Roth then taxable: 20k Roth, rest from taxable.
  b = await rot({ traditional: 0, roth: 20000 }, 0);
  close(b.bondRoth, 20000, 'Roth before taxable'); close(b.bondTaxable, 80000, 'taxable for the rest', 0.1);
}

// A constant path: stocks +8%, inflation 3%, bonds 0%. The bond bucket never grows by itself while
// the target (years of expenses) inflates, so every year has a deficit to refill.
const PATH = '(y) => [2000 + y, 8, 3, 0, 0]';
async function engine(page, name, isUS) {
  const run = (patch) =>
    page.evaluate(
      ({ patch, PATH, convert, isUS }) => {
        const state = window.__test_getState();
        if (!window.__refillBase) window.__refillBase = JSON.parse(JSON.stringify(state));
        for (const k of Object.keys(state)) delete state[k];
        const toAccounts = eval('(' + convert + ')');
        Object.assign(state, JSON.parse(JSON.stringify(window.__refillBase)), isUS ? toAccounts(patch, window.__refillBase) : patch);
        const res = window.__test_simulateHistorical(eval(PATH));
        return res.rows.map((r) => ({ age: r.age, bonds: r.bonds, expenses: r.expenses, lump: r.lumpExpense, home: r.homeEquity, working: r.working }));
      },
      { patch, PATH, convert: legacyToAccounts.toString(), isUS },
    );
  const base = isUS
    ? { singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 80, taxable: 2000000, traditional: 500000, roth: 200000, cash: 40000, spending: 70000, bondYears: 4, stateTax: 'tx' }
    : { singlePerson: true, ageA: 61, retireAgeA: 61, lifeExpectancyA: 80, taxable: 2000000, traditional: 500000, roth: 200000, cash: 40000, spending: 70000, bondYears: 4, province: 'on' };

  // Cap: after the ladder window, no year grows the bond reserve by more than one year of that
  // year's expenses (net of lump), beyond what the bonds earn (0% here).
  const rows = await run(base);
  let refilled = 0;
  for (let i = 5; i < rows.length; i++) {
    const inc = rows[i].bonds - rows[i - 1].bonds;
    assert(inc <= rows[i].expenses - rows[i].lump + 1, `${name} cap: year ${i} bonds grew ${inc.toFixed(0)} > one year of expenses ${(rows[i].expenses - rows[i].lump).toFixed(0)}`);
    if (inc > 1) refilled++;
  }
  assert(refilled > 0, `${name} control: the scenario must actually refill (otherwise the cap check is vacuous)`);

  // Taxable-only household: brokerage is the fallback, so it still refills, within the same cap.
  const brokerage = await run({ ...base, traditional: 0, roth: 0 });
  let bgrew = 0;
  for (let i = 5; i < brokerage.length; i++) {
    const inc = brokerage[i].bonds - brokerage[i - 1].bonds;
    assert(inc <= brokerage[i].expenses - brokerage[i].lump + 1, `${name} taxable-only cap: year ${i} bonds grew ${inc.toFixed(0)}`);
    if (inc > 1) bgrew++;
  }
  assert(bgrew > 0, `${name} a taxable-only household must refill from brokerage as the last resort`);

  // Surplus years: the reserve is filled from surplus cash, limited only by the surplus and by the
  // bondYears target (bondYears x that year's expenses net of lump), NOT by the one-year cap.
  // A high earner far from retirement has a large surplus: year 0 reaches the full 3-year target.
  const earner = { ...base, ageA: 35, retireAgeA: 65, lifeExpectancyA: 90, incomeA: 1500000, taxable: 100000, traditional: 50000, roth: 20000, cash: 40000, spending: 60000, bondYears: 3 };
  const w = await run(earner);
  const target0 = 3 * (w[0].expenses - w[0].lump);
  near(w[0].bonds, target0, `${name} surplus fills the whole 3-year target in year 0 (more than one year of expenses)`);
  assert(w[0].bonds > 2 * (w[0].expenses - w[0].lump), `${name} surplus refill is not held to one year of expenses`);
  for (let i = 1; i < 10; i++) assert(w[i].bonds <= 3 * (w[i].expenses - w[i].lump) + 1, `${name} surplus refill never exceeds the bondYears target (year ${i})`);
  // Limited by the surplus: a household with almost no surplus gets a partial reserve.
  const thin = await run({ ...earner, incomeA: 65000, spending: 62000 });
  assert(thin[0].bonds < 3 * (thin[0].expenses - thin[0].lump) - 1000, `${name} a small surplus cannot fill the target`);
  const none = await run({ ...earner, bondYears: 0 });
  near(none[0].bonds, 0, `${name} bondYears 0 builds no reserve`);

  if (!isUS) return;
  // Under 59.5 with no taxable money: the reserve still refills from traditional/Roth (a
  // reallocation owes no penalty), capped at one year of that year's expenses.
  const young = { ...base, ageA: 45, retireAgeA: 45, lifeExpectancyA: 70, taxable: 0, traditional: 1500000, roth: 600000, cash: 20000, spending: 50000, bondYears: 3 };
  const early = await run(young);
  let grew = 0;
  for (let i = 4; i < 12; i++) {
    const inc = early[i].bonds - early[i - 1].bonds;
    assert(inc <= early[i].expenses - early[i].lump + 1, `${name} early retiree cap: year ${i} bonds grew ${inc.toFixed(0)}`);
    if (inc > 1) grew++;
  }
  assert(grew > 0, `${name} an early retiree with no taxable money must refill from traditional/Roth`);
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, file, isUS] of [['US', 'Planner_US.html', true], ['Canada', 'Planner_Canada.html', false]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + plannerPath(file));
    await page.waitForTimeout(300);
    await unit(page, name, isUS);
    await engine(page, name, isUS);
    await ladderUnit(page, name, isUS);
    assert.deepStrictEqual(errors, [], `${name} page errors`);
    console.log(`[${name}] gradual bond refill tests passed`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
