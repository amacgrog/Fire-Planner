// The scenarios and the comparison of the historical-engine parity suites (tests/unit/us/historical-parity.test.js and
// tests/unit/canada/historical-parity.test.js; the old tests/historical_parity.js ran one body against both planners).
// `c` is the calling file's counter; every executed check ticks it once and reports with expect.soft.
//
// The historical / Monte Carlo run (BUCKET_MODE) is meant to execute the same plan as simulate(). The one deliberate
// difference is the bucket strategy: cash and bonds are drawn first in a down year, and the bond reserve is refilled in
// up years. These scenarios remove that difference, so any remaining gap is a missing feature:
//   - a constant-return row function that equals the plan's own assumptions (stocks = returnRate, inflation = inflation,
//     bonds = bondReturn, Treasury yield = bondReturn), so there is never a down year;
//   - bondYears = 0, so the bond reserve is never drawn or refilled.
// Every numeric row field the two engines share must then agree year by year (to a small relative tolerance: the two
// engines sum cash flow in a different order and bisect from different brackets, see CLAUDE.md "Withdrawals").
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect } from 'vitest';
import { world } from './world.js';
import { engine } from './engine.js';

export const GROUPS = {
  rows: 'F7',
  conversion: 'F1/F2',
  ladder: 'F3',
  mix: 'F4-F6',
};

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

export const SCENARIOS = {
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

export function compare(label, std, hist, problems, preRetirement) {
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

// One scenario in a fresh world: the patch over the default state, the constant-return historical run next to
// simulate(), compared year by year (one check), and for a ladder scenario the vacuity check (one more).
// Returns the world's pieces so the US file can run its empty-plan check on the same state.
export async function runParity(isUS, sc, c) {
  const key = isUS ? 'US' : 'Canada';
  const w = await world();
  const st = await w.setState();
  if (isUS) w.setTaxYear(2026);
  const e = await engine(w);
  const base = JSON.parse(JSON.stringify(st));
  const resetTo = (patch) => {
    for (const k of Object.keys(st)) delete st[k];
    Object.assign(st, JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(patch)));
  };
  resetTo(sc.patch);
  const row = [2000, st.returnRate, st.inflation, st.bondReturn, st.bondReturn];
  // The old page returned both results through page.evaluate, i.e. JSON-serialized: the same round trip here.
  const wire = (x) => JSON.parse(JSON.stringify(x));
  const hist = wire(e.simulateHistorical((y) => [2000 + y, row[1], row[2], row[3], row[4]]));
  const std = wire(e.simulate());
  const problems = [];
  compare(`${key} ${sc.name}`, std, hist, problems, sc.preRetirement);
  c.tick();
  expect.soft(problems.slice(0, 8).join('\n'), `[${GROUPS[sc.group]}] ${key} ${sc.name}`).toBe('');
  if (sc.preRetirement) {
    // The rotation must actually have happened, or the comparison proves nothing.
    const r = std.rows[std.retirementYear - 1];
    c.tick();
    expect.soft(!!(r && r.bonds > 0), `${key} ${sc.name}: no ladder was built before retirement (scenario is vacuous)`).toBe(true);
  }
  return { w, st, e, resetTo };
}

// src/us/main.js plus every module under src/us/ and src/shared/, so the checks see code that moved out of main.js.
export function readUsAndSharedSource() {
  const srcRoot = fileURLToPath(new URL('../../../src/', import.meta.url));
  const files = [join(srcRoot, 'us', 'main.js')];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && !files.includes(full)) files.push(full);
    }
  };
  walk(join(srcRoot, 'us'));
  walk(join(srcRoot, 'shared'));
  return files.map((f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).join('\n');
}
