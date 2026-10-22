// The per-call memos in the tax code ("7D part 2") must never change a number. Each memo is keyed on every
// input it depends on, so nothing is ever cleared; this test is the guard. Compared with Object.is, never a
// tolerance.
//   * taxIndexFactor: the remembered factor against Math.pow, across inflation changes, whole and fractional
//     year indexes, in both orders, and inside a historical run (which has its own factors).
//   * the per-person state inputs (needsPerPerson): every projection with the flags as compiled against the same
//     projection with the per-person inputs built for every row, in every state, for each of a list of one-input
//     changes, so a row that reads a field the flag skipped, or a stale value left in a reused inputs object,
//     shows as a changed double. Also pins which rows have the flag.
// Converted from tests/tax_caches.js (Playwright); the old script counted 5 checks, this file asserts the same 5.
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { engine } from '../helpers/engine.js';
import { withCompiledFlags } from '../helpers/rules.js';
import { makeCounter } from '../helpers/count.js';

const NEW_COUNT = 5;
const c = makeCounter();

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

it('taxIndexFactor is the pow, across inflation changes and a historical run', async () => {
  const w = await world();
  const { taxIndexFactor } = await w.load('shared/core/projection/year-factors.js');
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  const e = await engine(w);
  const st = await w.setState();

  const inflations = [2.5, 3, 0, 7.25, -1, 2.5, 4, 4, 2.5];
  const years = [0, 1, 2, 3, 10, 40, 100, 255, 256, 300, 2.5, 0.5, -1, 7, 7];
  let n = 0, bad = 0;
  const check = (inf, y) => {
    st.inflation = inf;
    const want = Math.pow(1 + (inf || 0) / 100, y);
    n++;
    if (!Object.is(taxIndexFactor(y), want)) bad++;
  };
  for (const inf of inflations) for (const y of years) check(inf, y);
  for (const y of years.slice().reverse()) for (const inf of inflations.slice().reverse()) check(inf, y);
  c.expect(bad, `taxIndexFactor == Math.pow over ${n} calls`).toBe(0);
  expect(n).toBe(270);

  // Changing inflation between two calls for the same year must miss.
  st.inflation = 3; const a = taxIndexFactor(10); st.inflation = 5; const b = taxIndexFactor(10); st.inflation = 3; const cc = taxIndexFactor(10);
  c.expect(!Object.is(a, b) && Object.is(a, cc), 'a changed inflation misses, the old value returns with it').toBe(true);

  // Inside a historical run the path's own factors are used, then the plan's own come back.
  st.inflation = 2.5;
  const before = taxIndexFactor(5);
  e.simulateHistorical((y) => HIST[40 + y]);
  const after = taxIndexFactor(5);
  c.expect(Object.is(before, after) && Object.is(after, Math.pow(1.025, 5)), 'the plan factor is intact after a historical run').toBe(true);
});

it('needsPerPerson: compiled flags equal per-person inputs built for every row', async () => {
  const w = await world();
  const { stateRuleFor } = await w.load('us/core/tax/state-tax.js');
  const { STATE_RULES: R } = await w.load('us/core/tax/state-rules.js');
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  const e = await engine(w);
  const st = await w.setState();
  const base = structuredClone(st);
  const reset = () => { for (const k of Object.keys(st)) delete st[k]; Object.assign(st, structuredClone(base)); };
  const codes = Object.keys(R);
  // Which rows should carry the flag: a per-person retirement kind or the age-and-AGI-tiered Social Security kind.
  const expectFlag = (row) => {
    const hit = (r) => r.retirementExclusion.kind === 'perPerson' || (typeof r.base.socialSecurity === 'object' && r.base.socialSecurity.kind === 'ageAgiTiered');
    return hit(row) || (row.schedule || []).some((v) => (v.retirementExclusion ? v.retirementExclusion.kind === 'perPerson' : false) || (v.base && v.base.socialSecurity && v.base.socialSecurity.kind === 'ageAgiTiered'));
  };
  const flagWrong = codes.filter((code) => !!stateRuleFor(code).needsPerPerson !== expectFlag(R[code]));
  c.expect(flagWrong, 'needsPerPerson is set exactly for per-person retirement and age-tiered Social Security rows').toStrictEqual([]);

  const kids = [{ birthYear: 2012, student: false }, { birthYear: 2020, student: false }];
  const changes = [
    ['base', {}], ['single person', { singlePerson: true }], ['filing single', { filingStatus: 'single' }],
    ['children', { children: kids }], ['retired both', { ageA: 68, ageB: 66, retireAgeA: 60, retireAgeB: 60 }],
    ['income A only', { incomeB: 0 }], ['survivor', { lifeExpectancyA: 72 }], ['survivor B', { lifeExpectancyB: 72 }],
    ['roth conversions', { rothConvEnabled: true }],
  ];
  const flat = (v, out) => {
    if (typeof v === 'number') out.push(v);
    else if (Array.isArray(v)) for (const x of v) flat(x, out);
    else if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) flat(v[k], out);
  };
  const run = (code, patch) => {
    reset();
    Object.assign(st, patch, { stateTax: code });
    const out = [];
    const a = e.simulate(st.retireAgeA, st.retireAgeB); flat(a.rows, out);
    const b = e.simulateHistorical((y) => HIST[5 + y], st.retireAgeA, st.retireAgeB); flat(b.rows, out);
    return out;
  };
  // The same sweep twice: as compiled, then with every row forced to build the per-person inputs.
  const sweep = () => {
    const all = [];
    for (const code of codes) for (const [, patch] of changes) all.push(run(code, patch));
    return all;
  };
  const asCompiled = sweep();
  const compiledRules = codes.map((code) => stateRuleFor(code));
  const forced = withCompiledFlags(compiledRules, 'needsPerPerson', true, sweep);
  reset();
  let bad = 0, first = null;
  asCompiled.forEach((row, i) => {
    for (let k = 0; k < row.length || k < forced[i].length; k++)
      if (!Object.is(row[k], forced[i][k])) { bad++; if (!first) first = { code: codes[Math.floor(i / changes.length)], change: changes[i % changes.length][0], at: k }; break; }
  });
  expect(asCompiled.length).toBe(459);
  expect.soft(first).toBe(null);
  c.expect(bad, `${asCompiled.length} state x change projections: compiled flags == per-person inputs built for every row`).toBe(0);
});
