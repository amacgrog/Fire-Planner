// Account ledger under the pooled traditional / Roth balances (US, Batch 3A).
//
// The engine keeps pooled balances; underneath, each pool is split into four accounts (IRA A, 401(k) A, IRA B,
// 401(k) B) as SHARES of the pool. Shares only move on a contribution (owner's account) or a Roth conversion
// (IRAs first, then 401(k)s; lands in the converting partner's Roth IRA). Everything is hand-computed.
// Converted from tests/account_ledger.js (Playwright); the old script executed 927 assert checks (the page-error
// check excluded), this file asserted the same 927; 937 since the cliff plan's per-year conversion sizing ships on (V148, section
// 4 below). NEW_COUNT follows the trace length of the section 4 loops
// (one check per trace year and share) and of the section 5 trace.forEach (2 checks per year), so it moves only if the scenario's life span does. Each it block gets its own
// world, the 2026 tax year and the default state; a run applies its patch to the state and restores it afterwards,
// as the old page did.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 937;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

// Every failing check is reported (expect.soft) and each evaluation counts once.
const check = (ok, msg) => {
  c.tick();
  expect.soft(ok, msg).toBe(true);
};
const close = (a, b, msg, tol = 1e-6) => check(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const closeArr = (a, b, msg) => a.forEach((x, i) => close(x, b[i], `${msg}[${i}]`));
const near2 = (a, e, tol, msg) => check(Math.abs(a - e) <= tol, `${msg}: ${a} vs ${e}`);

async function setup() {
  const w = await world();
  const st = await w.setState();
  w.setTaxYear(2026);
  const e = await engine(w);
  const A = await w.load('us/core/accounts/account-ledger.js');
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  const withPatch = (patch, fn) => {
    const saved = JSON.parse(JSON.stringify(st));
    Object.assign(st, patch);
    try {
      return fn();
    } finally {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, saved);
    }
  };
  const run = (patch, retire) =>
    withPatch(patch, () => ({ trace: e.accountTrace(retire?.[0], retire?.[1]), rows: e.simulate(retire?.[0], retire?.[1]).rows }));
  // Same as run() but through the historical engine along a flat zero-return path.
  const runHist = (patch) =>
    withPatch(patch, () => {
      const flat = (y) => [1970 + y, 0, 0, 0];
      return { trace: e.accountTrace(undefined, undefined, flat), rows: e.simulateHistorical(flat).rows };
    });
  return { w, st, e, A, HIST, withPatch, run, runHist };
}

// Zero returns, zero inflation so every dollar is hand-derivable.
const FLAT = {
  singlePerson: false, ageA: 40, ageB: 40, retireAgeA: 65, retireAgeB: 65, lifeExpectancyA: 70, lifeExpectancyB: 70,
  returnRate: 0, bondReturn: 0, inflation: 0, hysaRate: 0, incomeGrowth: 0, medicalInflation: 0,
  incomeA: 100000, incomeB: 80000, matchA: 4, matchB: 0, k401PctA: 100, k401PctB: 50, iraPctA: 100, iraPctB: 0, catchupPctA: 0, catchupPctB: 0,
  megaBackdoor: false, spending: 40000, healthcare: 0, medicareYearly: 0, healthPremiumA: 0, healthPremiumB: 0,
  tradIraA: 0, tradIraB: 0, trad401kA: 200000, trad401kB: 200000, rothIraA: 50000, rothIraB: 50000, roth401kA: 0, roth401kB: 0, taxable: 500000, cash: 50000, cashReserve: 50000,
  bondYears: 0, ssMonthlyA: 0, ssMonthlyB: 0, tenure: 'rent', rent: 1000, rentGrowth: 0,
};

it('unit: contribute / convert / draw / clone / restore', async () => {
  const { A } = await setup();
  const out = {};
  // 401(k) A gets 10,000 into a 100,000 pool split 50/50 between the two 401(k)s.
  let sh = [0, 0.5, 0, 0.5];
  A.accountsContribute(sh, 100000, [0, 10000, 0, 0]);
  out.contribute = sh.slice();
  // Convert 24,000 (less than the IRAs' 30,000): IRAs pro rata, 401(k)s untouched.
  let acc = { trad: [0.2, 0.3, 0.1, 0.4], roth: [1, 0, 0, 0] };
  A.accountsConvert(acc, 100000, 50000, 24000);
  out.convSmall = { trad: acc.trad.slice(), roth: acc.roth.slice() };
  // Convert 40,000: all 30,000 of IRAs, then 10,000 pro rata from the 401(k)s (30:40).
  acc = { trad: [0.2, 0.3, 0.1, 0.4], roth: [1, 0, 0, 0] };
  A.accountsConvert(acc, 100000, 50000, 40000);
  out.convBig = { trad: acc.trad.slice(), roth: acc.roth.slice() };
  // Clone is independent of the original; restore puts it back.
  acc = { trad: [0.25, 0.25, 0.25, 0.25], roth: [1, 0, 0, 0] };
  const snap = A.accountsClone(acc);
  A.accountsConvert(acc, 100000, 10000, 50000);
  out.changed = acc.trad.slice();
  A.accountsRestore(acc, snap);
  out.restored = acc.trad.slice();
  // Draw: 100,000 out of A's accounts only (pool 4,000,000, A owns 3,000,000, all 401(k)).
  acc = { trad: [0, 0.75, 0, 0.25], roth: [1, 0, 0, 0] };
  A.accountsDraw(acc.trad, 4000000, [100000, 0]);
  out.drawA = acc.trad.slice();
  // Draw from both partners, split across a partner's IRA and 401(k) pro rata: A holds 600k IRA + 400k 401(k).
  acc = { trad: [0.3, 0.2, 0.25, 0.25], roth: [1, 0, 0, 0] };
  A.accountsDraw(acc.trad, 2000000, [100000, 50000]);
  out.drawBoth = acc.trad.slice();
  // A cannot cover their amount (100,000 left, 300,000 asked): A is emptied and the shares are renormalized.
  acc = { trad: [0, 0.1, 0, 0.9], roth: [1, 0, 0, 0] };
  A.accountsDraw(acc.trad, 1000000, [300000, 0]);
  out.drawShort = acc.trad.slice();
  // Empty pool: shares stay put, nothing divides by zero.
  sh = [0.1, 0.2, 0.3, 0.4];
  A.accountsConvert({ trad: sh, roth: [1, 0, 0, 0] }, 0, 0, 100);
  out.empty = sh.slice();

  closeArr(out.contribute, [0, 60000 / 110000, 0, 50000 / 110000], 'contribute');
  // After a 24,000 conversion: dollars [4000, 30000, 2000, 40000] of 76,000; Roth [66000, 0, 8000, 0] of 74,000.
  closeArr(out.convSmall.trad, [4000 / 76000, 30000 / 76000, 2000 / 76000, 40000 / 76000], 'convert small trad');
  closeArr(out.convSmall.roth, [66000 / 74000, 0, 8000 / 74000, 0], 'convert small roth');
  // After 40,000: IRAs empty; 401(k)s lose 10,000 as 4,285.71 / 5,714.29 -> [25714.29, 34285.71] of 60,000.
  closeArr(out.convBig.trad, [0, 25714.285714 / 60000, 0, 34285.714286 / 60000], 'convert big trad');
  // Roth: A's IRA +20000 (iraA) +4285.71 (k401A), B's IRA +10000 +5714.29: [74285.71, 0, 15714.29, 0] of 90,000... 50,000 + 40,000.
  closeArr(out.convBig.roth, [(50000 + 20000 + 4285.714286) / 90000, 0, (10000 + 5714.285714) / 90000, 0], 'convert big roth');
  closeArr(out.drawA, [0, 2900000 / 3900000, 0, 1000000 / 3900000], 'draw from A only');
  // d = [600k, 400k, 500k, 500k]; A gives 100k pro rata (60k, 40k), B gives 50k (25k, 25k) -> [540k, 360k, 475k, 475k] of 1,850,000.
  closeArr(out.drawBoth, [540000 / 1850000, 360000 / 1850000, 475000 / 1850000, 475000 / 1850000], 'draw from both partners pro rata inside each');
  closeArr(out.drawShort, [0, 0, 0, 1], 'a partner who cannot cover the amount is emptied');
  closeArr(out.restored, [0.25, 0.25, 0.25, 0.25], 'restore');
  c.tick();
  expect.soft(out.changed, 'the conversion must have changed the shares').not.toStrictEqual(out.restored);
  closeArr(out.empty, [0.1, 0.2, 0.3, 0.4], 'empty pool keeps shares');
});

it('1. traditional contributions (limits apply at 2026 values)', async () => {
  // A 401(k) 100% of $24,500 + 4% match of 100k = 28,500, A IRA 100% of $7,500, B 401(k) 50% of $24,500 = 12,250.
  // Opening 400,000 split 200k/200k across the 401(k)s.
  const { run } = await setup();
  const { trace } = run({ ...FLAT, k401Type: 'traditional', iraType: 'traditional' });
  const t0 = trace[0];
  closeArr(t0.trad, [7500, 228500, 0, 212250], 'year-0 traditional accounts');
  close(t0.tradPool, 448250, 'year-0 traditional pool');
  closeArr(t0.roth, [100000 / 2, 0, 100000 / 2, 0], 'year-0 Roth accounts (no Roth contributions)');
});

it('2. Roth type: 401(k) money to the Roth 401(k), IRA money to the Roth IRA, match stays traditional', async () => {
  const { run } = await setup();
  const { trace } = run({ ...FLAT, k401Type: 'roth', iraType: 'roth' });
  const t0 = trace[0];
  closeArr(t0.trad, [0, 204000, 0, 200000], 'roth type: traditional only gets the match');
  closeArr(t0.roth, [50000 + 7500, 24500, 50000, 12250], 'roth type: Roth accounts');
});

it('2b. the same contributions in a cash-flow deficit year', async () => {
  // Withdrawals from taxable cover the shortfall; the contributions still land in the owners' accounts, through the
  // other routing branch.
  const { run } = await setup();
  for (const [type, tradExpect, rothExpect] of [
    ['roth', [0, 204000, 0, 200000], [50000 + 7500, 24500, 50000, 12250]],
    ['traditional', [7500, 228500, 0, 212250], [50000, 0, 50000, 0]],
  ]) {
    const { trace, rows } = run({ ...FLAT, k401Type: type, iraType: type, spending: 400000 });
    check(rows[0].taxableWithdrawn > 0, 'year 0 must be a deficit year');
    closeArr(trace[0].trad, tradExpect, `deficit year, ${type}: traditional accounts`);
    closeArr(trace[0].roth, rothExpect, `deficit year, ${type}: Roth accounts`);
  }
});

it('3. mega backdoor lands in the Roth 401(k)', async () => {
  // Room = min(wage, 72,000) - 24,500 deferral - 4,000 match = 43,500 at 100% for A.
  const { run } = await setup();
  const { trace } = run({ ...FLAT, k401Type: 'traditional', iraType: 'traditional', megaBackdoor: true, megaPctA: 100, megaPctB: 0 });
  close(trace[0].roth[1], 43500, 'mega backdoor goes to the Roth 401(k) of A');
});

for (const hist of [false, true]) {
  it(`4. invariants over a whole run (${hist ? 'historical' : 'standard'}): shares sum to 1, none negative`, async () => {
    const { w, withPatch, e, HIST } = await setup();
    // The check count follows the user's-bracket plan (when the pools empty): the cliff plan's bracket search off (Batch 5 step 3a).
    // The per-year conversion sizing stays on (Batch 5 step 5b piece 3, spec B0.11): on the standard run its whole-run pass keeps
    // the 10% top at every conversion age (50-62) instead of the 22% fill, so the traditional pool no longer empties at 67 and its
    // shares-sum check runs in 10 more years (927 -> 937); the historical run's pool never empties either way.
    (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = true;
    const patch = { ...FLAT, returnRate: 6, bondReturn: 3, inflation: 3, rothConvEnabled: true, rothConvStartAge: 50, rothConvEndAge: 62, rothConvBracket: 22, bondYears: 3, retireAgeA: 50, retireAgeB: 50 };
    const traces = withPatch(patch, () => {
      const rowFn = hist ? (y) => HIST[(20 + y) % HIST.length] : null;
      return e.accountTrace(undefined, undefined, rowFn);
    });
    traces.forEach((t) => {
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      if (t.tradPool > 1e-6) close(sum(t.tradShares), 1, `year ${t.year} trad shares sum (${hist ? 'hist' : 'std'})`, 1e-9);
      if (t.rothPool > 1e-6) close(sum(t.rothShares), 1, `year ${t.year} Roth shares sum (${hist ? 'hist' : 'std'})`, 1e-9);
      t.tradShares.concat(t.rothShares).forEach((s) => check(s >= -1e-12 && s <= 1 + 1e-12, `share out of range: ${s}`));
      close(sum(t.trad), t.tradPool, 'trad accounts sum to the pool', 1e-9);
      close(sum(t.roth), t.rothPool, 'Roth accounts sum to the pool', 1e-9);
    });
  });
}

it('5. MAGI iteration: the ledger is rewound each pass', async () => {
  // With ACA on and no brokerage account, the discretionary traditional draw differs from the first estimate and the
  // conversion year body re-runs; the ledger must be rewound each pass (a conversion applied once per pass would move
  // the Roth shares each time). A works ten years first (401(k) 100% of limit + match), B has no income, so the
  // traditional shares are lopsided toward A; both retire at 55 with Rule of 55 on, so the 401(k) draws are
  // penalty-free and come before any Roth money; with no IRAs a conversion draws the 401(k)s pro rata, so each
  // partner's Roth IRA receives that partner's share of every converted dollar. Zero returns: exact dollars.
  const { run } = await setup();
  const patch = {
    ...FLAT, ageA: 45, ageB: 45, retireAgeA: 55, retireAgeB: 55, lifeExpectancyA: 66, lifeExpectancyB: 66, ruleOf55A: true, ruleOf55B: true,
    k401Type: 'traditional', iraType: 'traditional', iraPctA: 0, incomeB: 0, k401PctB: 0,
    acaEnabled: true, healthcare: 18000, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 62, rothConvBracket: 22,
    trad401kA: 600000, trad401kB: 600000, rothIraA: 50000, rothIraB: 50000, taxable: 0, cash: 30000, cashReserve: 0, spending: 30000,
    // The cliff plan would draw Roth to stay under an ACA line; this case pins the ledger under the plain order.
    cliffGuardEnabled: false,
  };
  const { trace, rows } = run(patch, [55, 55]);
  // Ten working years add 24,500 + 4,000 match to A's 401(k): 600,000 + 285,000 of 1,485,000.
  close(trace[9].tradShares[1], 885000 / 1485000, 'A holds 742,500 of the 1,342,500 pool when work stops', 1e-9);
  let converted = 0,
    expectA = 50000,
    expectB = 50000;
  trace.forEach((t, i) => {
    c.tick();
    expect.soft(t.conversionAmount, 'trace conversion equals row conversion').toBe(rows[i].conversionAmount);
    check(Math.abs(rows[i].rothWithdrawn) < 0.01, 'Roth money is only touched after traditional runs out');
    if (t.conversionAmount > 0) {
      converted += t.conversionAmount;
      expectA += t.conversionAmount * t.tradShares[1];
      expectB += t.conversionAmount * t.tradShares[3];
    }
  });
  check(converted > 30000, `scenario must convert a meaningful amount (got ${converted})`);
  const last = trace[trace.length - 1];
  close(last.roth[0], expectA, "A's Roth IRA = opening + A's share of each conversion", 1e-6);
  close(last.roth[2], expectB, "B's Roth IRA = opening + B's share of each conversion", 1e-6);
  close(last.roth[1] + last.roth[3], 0, 'no Roth 401(k) money', 1e-9);
});

it("6. RMDs come out of the owner's own accounts, and the shares follow", async () => {
  // A is 76 (RMD at 73+ for this birth year), B is 50. A holds 3,000,000 of a 4,000,000 pool, B 1,000,000; zero
  // returns, no spending, so the only movements are A's RMDs. Divisors (IRS Uniform Lifetime Table): 76 -> 23.7,
  // 77 -> 22.9, 78 -> 22.0.
  const { run, runHist } = await setup();
  const rmdCase = {
    ...FLAT, ageA: 76, retireAgeA: 76, lifeExpectancyA: 80, ageB: 50, retireAgeB: 50, lifeExpectancyB: 80, incomeA: 0, incomeB: 0,
    matchA: 0, spending: 0, tradIraA: 0, tradIraB: 0, trad401kA: 3000000, trad401kB: 1000000, rothIraA: 0, rothIraB: 0, taxable: 5000000, cash: 0, cashReserve: 0,
  };
  for (const hist of [false, true]) {
    const { trace, rows } = hist ? runHist(rmdCase) : run(rmdCase);
    const tag = hist ? 'hist' : 'std';
    const rmd0 = (0.75 * 4000000) / 23.7;
    close(rows[0].rmd, rmd0, `${tag} year-0 RMD is A's opening 75% of the pool over 23.7`, 1e-9);
    // After year 0: A holds 3,000,000 - rmd0, B still 1,000,000.
    closeArr(trace[0].trad, [0, 3000000 - rmd0, 0, 1000000], `${tag} year 0: only A's accounts paid the RMD`);
    const rmd1 = (3000000 - rmd0) / 22.9;
    close(rows[1].rmd, rmd1, `${tag} year-1 RMD uses A's new, smaller share`, 1e-9);
    closeArr(trace[1].trad, [0, 3000000 - rmd0 - rmd1, 0, 1000000], `${tag} year 1`);
    const rmd2 = (3000000 - rmd0 - rmd1) / 22.0;
    close(rows[2].rmd, rmd2, `${tag} year-2 RMD`, 1e-9);
  }
});

it('6b. both partners take RMDs, each from their own accounts', async () => {
  // A is 76 (23.7), B is 74 (25.5), A holds 3,000,000 and B 1,000,000 of the 4,000,000 pool.
  const { run } = await setup();
  const both = {
    ...FLAT, ageA: 76, retireAgeA: 76, lifeExpectancyA: 80, ageB: 74, retireAgeB: 74, lifeExpectancyB: 80, incomeA: 0, incomeB: 0,
    matchA: 0, spending: 0, tradIraA: 0, tradIraB: 0, trad401kA: 3000000, trad401kB: 1000000, rothIraA: 0, rothIraB: 0, taxable: 5000000, cash: 0, cashReserve: 0,
  };
  const { trace, rows } = run(both);
  const rmdA = 3000000 / 23.7,
    rmdB = 1000000 / 25.5;
  close(rows[0].rmd, rmdA + rmdB, 'both partners take an RMD', 1e-9);
  closeArr(trace[0].trad, [0, 3000000 - rmdA, 0, 1000000 - rmdB], "each RMD came out of its owner's own accounts");
});

it('6c. a market drop between the RMD sizing and the draw', async () => {
  // A (100) holds 100,000 of a 1,000,000 pool; a -90% year leaves A 10,000 against a 15,625 RMD (divisor 6.4). A is
  // emptied, the pool falls by the full RMD to 84,375, and the ledger (all B's) still matches it.
  const { withPatch, e } = await setup();
  const crash = {
    ...FLAT, ageA: 100, retireAgeA: 100, lifeExpectancyA: 102, ageB: 50, retireAgeB: 50, lifeExpectancyB: 102, incomeA: 0, incomeB: 0,
    matchA: 0, spending: 0, tradIraA: 0, tradIraB: 0, trad401kA: 100000, trad401kB: 900000, rothIraA: 0, rothIraB: 0, taxable: 2000000, cash: 0, cashReserve: 0,
  };
  const r = withPatch(crash, () => e.accountTrace(undefined, undefined, (y) => [2000 + y, -90, 0, 0]));
  closeArr(r[0].trad, [0, 0, 0, 90000 - (100000 / 6.4 - 10000)], 'a partner short of their RMD is emptied and the ledger still matches the pool');
});

it('7. traditional draws are per account', async () => {
  // A (76) is penalty-free, B (50) is not: a discretionary draw takes A's accounts first, so there is no penalty while
  // A has money, and A's draws move the ledger toward B (B's share grows). Once A is empty the rest comes from B and
  // owes 10%: earlyPenalty = 10% x (the traditional draw beyond A's remaining dollars). traditionalWithdrawn includes
  // the RMD, which also comes out of A.
  const { run, runHist } = await setup();
  const big = {
    ...FLAT, ageA: 76, retireAgeA: 76, lifeExpectancyA: 79, ageB: 50, retireAgeB: 50, lifeExpectancyB: 79, incomeA: 0, incomeB: 0,
    matchA: 0, spending: 400000, tradIraA: 0, tradIraB: 0, trad401kA: 3000000, trad401kB: 1000000, rothIraA: 0, rothIraB: 0, taxable: 0, cash: 0, cashReserve: 0,
  };
  for (const hist of [false, true]) {
    const { trace, rows } = hist ? runHist(big) : run(big);
    const tag = hist ? 'hist' : 'std';
    let prevB = 0.25;
    for (let i = 0; i < 3; i++) {
      const bShare = trace[i].tradShares[2] + trace[i].tradShares[3];
      check(rows[i].traditionalWithdrawn - rows[i].rmd > 1000, `${tag} year ${i}: there is a discretionary traditional draw`);
      near2(rows[i].earlyPenalty, 0, 0.01, `${tag} year ${i}: A's penalty-free accounts cover the draw`);
      check(bShare > prevB + 0.01, `${tag} year ${i}: B's share grows as A's accounts are drawn (${bShare})`);
      prevB = bShare;
    }
  }
  // A runs out in year 1: 600,000 less year 0's draw is left for year 1, the remainder comes from B.
  const small = { ...big, trad401kA: 600000 };
  for (const hist of [false, true]) {
    const { trace, rows } = hist ? runHist(small) : run(small);
    const tag = hist ? 'hist' : 'std';
    near2(rows[0].earlyPenalty, 0, 0.01, `${tag} year 0: still inside A's accounts`);
    const aEnd0 = trace[0].trad[0] + trace[0].trad[1];
    check(aEnd0 > 1000, `${tag}: A has money left after year 0 (${aEnd0})`);
    near2(trace[1].trad[0] + trace[1].trad[1], 0, 0.01, `${tag} year 1: A is empty`);
    near2(rows[1].earlyPenalty, 0.1 * (rows[1].traditionalWithdrawn - aEnd0), 0.01, `${tag} year 1: 10% on the part drawn from B`);
    check(rows[1].earlyPenalty > 1000, `${tag} year 1: the penalty is real`);
  }
});

it('8. Roth draws are per account too', async () => {
  // A (76) is penalty-free and B (50) is not. A's 60,000 is drawn first (no tax or penalty, 40,000 in year 0); in year
  // 1 A's last 20,000 comes first and the rest comes from B's 100,000 (0% basis, all earnings): x - 0.1x = 20,000 ->
  // x = 22,222.22, penalty 2,222.22 (the earnings stay under the standard deduction).
  const { run, runHist } = await setup();
  const rothCase = {
    ...FLAT, ageA: 76, retireAgeA: 76, lifeExpectancyA: 78, ageB: 50, retireAgeB: 50, lifeExpectancyB: 78, incomeA: 0, incomeB: 0,
    matchA: 0, spending: 40000, tradIraA: 0, tradIraB: 0, trad401kA: 0, trad401kB: 0, rothIraA: 0, rothIraB: 0,
    roth401kA: 60000, roth401kB: 100000, roth401kBasisPctA: 0, roth401kBasisPctB: 0, taxable: 0, cash: 0, cashReserve: 0, rent: 0, stateTax: 'tx',
  };
  for (const hist of [false, true]) {
    const tag = hist ? 'hist' : 'std';
    const { rows } = hist ? runHist(rothCase) : run(rothCase);
    near2(rows[0].rothWithdrawn, 40000, 0.01, `${tag} year 0: only A's penalty-free Roth is drawn`);
    near2(rows[0].earlyPenalty, 0, 0.01, `${tag} year 0: no penalty`);
    near2(rows[1].rothWithdrawn, 20000 + 20000 / 0.9, 0.05, `${tag} year 1: A's last 20,000, then B's earnings grossed up`);
    near2(rows[1].earlyPenalty, 2000 / 0.9, 0.05, `${tag} year 1: 10% on B's draw only`);
  }
});
