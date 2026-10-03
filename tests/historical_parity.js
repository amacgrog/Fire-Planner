// Historical-engine parity with the standard engine (Batch 1 of docs/next-batches-plan.md).
//
// The historical / Monte Carlo run (BUCKET_MODE) is meant to execute the same
// plan as simulate(). The one deliberate difference is the bucket strategy: cash
// and bonds are drawn first in a down year, and the bond reserve is refilled in
// up years. This test removes that difference, so any remaining gap is a missing
// feature:
//   - a constant-return row function that equals the plan's own assumptions
//     (stocks = returnRate, inflation = inflation, bonds = bondReturn, Treasury
//     yield = bondReturn), so there is never a down year;
//   - bondYears = 0, so the bond reserve is never drawn or refilled.
// Every numeric row field the two engines share must then agree year by year
// (to a small relative tolerance: the two engines sum cash flow in a different
// order and bisect from different brackets, see CLAUDE.md "Withdrawals").
//
// Scenarios are grouped by the Batch 1 step that makes them pass:
//   F7 rows       detailed rows / return fields exist on historical runs
//   F1/F2         Roth conversions (US): bracket override keyed by age, MAGI room
//   F3            pre-retirement bond ladder (bondYears > 0, years before retirement only:
//                 the bucket strategy also routes surplus cash into the bond reserve and
//                 refills it after retirement, which is its intended difference, so the
//                 ladder scenarios use a huge cash reserve to absorb every surplus and
//                 compare only the years before retirement)
//   F4-F6         mix modes: applied schedule, live mix, smooth withdrawals
//
// Run: node tests/historical_parity.js

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

const GROUPS = {
  rows: 'F7',
  conversion: 'F1/F2',
  ladder: 'F3',
  mix: 'F4-F6',
};
// Groups that must pass at the current commit. Each Batch 1 step adds its group.
const ENABLED = new Set(['rows', 'conversion', 'ladder']);

const US_R = {
  ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50,
  lifeExpectancyA: 95, lifeExpectancyB: 95,
  taxable: 700000, traditional: 900000, roth: 200000, cash: 60000,
  spending: 90000, stateTax: 'tx', bondYears: 0,
};
const CA_R = {
  ageA: 52, ageB: 50, retireAgeA: 52, retireAgeB: 50,
  lifeExpectancyA: 95, lifeExpectancyB: 95,
  taxable: 700000, traditional: 900000, roth: 200000, cash: 60000,
  spending: 80000, province: 'on', bondYears: 0,
};
const mixSchedule = (ages, cycle) => {
  const o = {};
  ages.forEach((a, i) => (o[a] = cycle[i % cycle.length]));
  return o;
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const SCENARIOS = {
  US: [
    { name: 'default (working, then retires)', group: 'rows', patch: { bondYears: 0 } },
    { name: 'early retiree', group: 'rows', patch: US_R },
    { name: 'early retiree single', group: 'rows', patch: { ...US_R, singlePerson: true } },
    { name: 'default with a ladder', group: 'ladder', preRetirement: true, patch: { bondYears: 4, cashReserve: 1e8, incomeA: 300000, incomeB: 300000 } },
    { name: 'early retiree with a ladder', group: 'ladder', preRetirement: true, patch: { ...US_R, ageA: 45, ageB: 44, retireAgeA: 55, retireAgeB: 53, bondYears: 3, cashReserve: 1e8, incomeA: 300000, incomeB: 300000 } },
    { name: 'single, fractional bondYears', group: 'ladder', preRetirement: true, patch: { ...US_R, singlePerson: true, ageA: 40, retireAgeA: 50, bondYears: 2.5, cashReserve: 1e8, incomeA: 300000, incomeB: 300000 } },
    { name: 'roth conversion', group: 'conversion', patch: { ...US_R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 60, rothConvBracket: 22 } },
    { name: 'roth conversion + ACA', group: 'conversion', patch: { ...US_R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 62, rothConvBracket: 24, acaEnabled: true } },
    { name: 'roth conversion applied schedule', group: 'conversion', patch: { ...US_R, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 62, appliedRothSchedule: mixSchedule(range(52, 62), [12, 22, 24, 0]) } },
    { name: 'smooth withdrawals', group: 'mix', patch: { ...US_R, smoothWithdrawals: true } },
    { name: 'live mix', group: 'mix', patch: { ...US_R, withdrawalMixEnabled: true } },
    { name: 'live mix + ACA + conversion', group: 'mix', patch: { ...US_R, withdrawalMixEnabled: true, acaEnabled: true, rothConvEnabled: true, rothConvStartAge: 52, rothConvEndAge: 62, rothConvBracket: 24 } },
    { name: 'applied mix schedule', group: 'mix', patch: { ...US_R, appliedMixSchedule: mixSchedule(range(52, 80), ['taxable', 'traditional', 'roth', 'balanced', 'smoothed', 'taxTradHalf', 'thirds', 0]) } },
  ],
  Canada: [
    { name: 'default (working, then retires)', group: 'rows', patch: { bondYears: 0 } },
    { name: 'early retiree', group: 'rows', patch: CA_R },
    { name: 'early retiree single', group: 'rows', patch: { ...CA_R, singlePerson: true } },
    { name: 'default with a ladder', group: 'ladder', preRetirement: true, patch: { bondYears: 4, cashReserve: 1e8, incomeA: 300000, incomeB: 300000 } },
    { name: 'early retiree with a ladder', group: 'ladder', preRetirement: true, patch: { ...CA_R, ageA: 45, ageB: 44, retireAgeA: 55, retireAgeB: 53, bondYears: 3, cashReserve: 1e8, incomeA: 300000, incomeB: 300000 } },
    { name: 'single, fractional bondYears', group: 'ladder', preRetirement: true, patch: { ...CA_R, singlePerson: true, ageA: 40, retireAgeA: 50, bondYears: 2.5, cashReserve: 1e8, incomeA: 300000, incomeB: 300000 } },
    { name: 'smooth withdrawals', group: 'mix', patch: { ...CA_R, smoothWithdrawals: true } },
  ],
};

// Fields only one engine reports.
const HIST_ONLY = new Set(['cumFactor']);
// ~$2: the documented ~1e-7 bisection-bracket difference compounds over 40+ years.
const REL_TOL = 2e-5, ABS_TOL = 2;

const PAGE = `(() => {
  const state = window.__test_getState();
  const base = JSON.parse(JSON.stringify(state));
  window.__parity = (patch) => {
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(patch)));
    if (window.__test_setRothOverride) window.__test_setRothOverride(null);
    if (window.__test_setWithdrawalMixOverride) window.__test_setWithdrawalMixOverride(null);
    const pct = (v) => v / 100;
    const row = [2000, state.returnRate, state.inflation, state.bondReturn, state.bondReturn];
    const hist = window.__test_simulateHistorical((y) => [2000 + y, row[1], row[2], row[3], row[4]]);
    const std = window.__test_simulate();
    return { std, hist };
  };
  return true;
})()`;

function compare(label, std, hist, problems, preRetirement) {
  let n = Math.min(std.rows.length, hist.rows.length);
  if (preRetirement) n = Math.min(n, std.retirementYear);
  if (std.rows.length !== hist.rows.length) problems.push(`${label}: ${std.rows.length} standard rows vs ${hist.rows.length} historical`);
  for (let i = 0; i < n; i++) {
    const s = std.rows[i], h = hist.rows[i];
    for (const k of Object.keys(s)) {
      if (!(k in h)) { problems.push(`${label}: year ${i} historical row is missing "${k}"`); break; }
    }
    for (const k of Object.keys(h)) {
      if (HIST_ONLY.has(k)) continue;
      if (!(k in s)) { problems.push(`${label}: year ${i} standard row is missing "${k}"`); break; }
    }
    for (const k of Object.keys(s)) {
      const a = s[k], b = h[k];
      if (typeof a === 'number' && typeof b === 'number') {
        if (Math.abs(a - b) > ABS_TOL + REL_TOL * Math.max(Math.abs(a), Math.abs(b)))
          problems.push(`${label}: year ${i} age ${s.age} ${k}: standard ${a} vs historical ${b}`);
      } else if (a !== b && !(a == null && b == null)) {
        problems.push(`${label}: year ${i} age ${s.age} ${k}: standard ${a} vs historical ${b}`);
      }
      if (problems.length > 8) return;
    }
  }
  for (const k of ['depletedAge', 'firstWithdrawal', 'retirementYear', 'currentExpense', 'retirementExpense', 'ladderTarget']) {
    const a = std[k], b = hist[k];
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > ABS_TOL + REL_TOL * Math.max(Math.abs(a), Math.abs(b))) problems.push(`${label}: result ${k}: standard ${a} vs historical ${b}`);
    } else if (a !== b) problems.push(`${label}: result ${k}: standard ${a} vs historical ${b}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  for (const [key, file] of [['US', 'Planner_US.html'], ['Canada', 'Planner_Canada.html']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') });
    await page.goto('file://' + path.resolve(__dirname, '..', file));
    await page.waitForTimeout(300);
    await page.evaluate(PAGE);
    for (const sc of SCENARIOS[key]) {
      if (!ENABLED.has(sc.group)) continue;
      const { std, hist } = await page.evaluate((p) => window.__parity(p), sc.patch);
      const problems = [];
      compare(`${key} ${sc.name}`, std, hist, problems, sc.preRetirement);
      if (sc.preRetirement) {
        // The rotation must actually have happened, or the comparison proves nothing.
        const r = std.rows[std.retirementYear - 1];
        if (!(r && r.bonds > 0)) problems.push(`${key} ${sc.name}: no ladder was built before retirement (scenario is vacuous)`);
      }
      if (problems.length) {
        failed++;
        console.error(`FAIL [${GROUPS[sc.group]}] ${key} ${sc.name}`);
        problems.slice(0, 8).forEach((p) => console.error('  ' + p));
      } else console.log(`ok   [${GROUPS[sc.group]}] ${key} ${sc.name}`);
    }
    assert.deepStrictEqual(errors, [], `${key} page errors`);
    await ctx.close();
  }
  await browser.close();
  if (failed) {
    console.error(`${failed} parity scenario(s) failed`);
    process.exit(1);
  }
  console.log('historical parity test passed');
})().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
