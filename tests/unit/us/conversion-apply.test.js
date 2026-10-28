// `apply` following the plan's conversion targets (Batch 5 step 5b piece 3, spec B6, Task 1): a null `conv`, a 'none' and a
// bracket target, a household line carried and not carried, the exempt ages, the switch, a per-return line and a historical path.
// Each case compares runs in one process; the hand literals are the 2026 single figures (12% top 50,400, standard deduction
// 16,100) and the 400% FPL line (15,650 x 4 = 62,600 at year 0, times the year's tax factor).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { GAP_CASES, legacyToAccounts } from '../helpers/scan-grid.mjs';

const c = makeCounter();
// The gap table's TX early ACA single (55, converting 55-74 at 22%), at a life of 75.
const TX = GAP_CASES.find((g) => g.name === 'early ACA single (TX)').patch(75, 75);
// tests/yardstick.mjs's two-return couple (both 60, two single returns until they marry at A's 63; B's pension 60,000), at 75.
const TWO = {
  singlePerson: false, filingStatus: 'single', marryLater: true, marriageAgeA: 63, children: [],
  ageA: 60, ageB: 60, retireAgeA: 60, retireAgeB: 60, lifeExpectancyA: 75, lifeExpectancyB: 75,
  pensionCoverage: 'b', pensionYearlyA: 0, pensionStartAgeA: 60, pensionYearlyB: 60000, pensionStartAgeB: 60,
  taxable: 300000, cash: 0, spending: 100000, acaEnabled: true, acaEnhanced: false, stateTax: 'tx',
  rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 74, rothConvBracket: 22,
  cliffGuardEnabled: true, withdrawalMixEnabled: false, smoothWithdrawals: false,
  ...legacyToAccounts({ traditional: 1600000, roth: 100000 }, { singlePerson: false }),
};
// The same couple with the pension on Partner A's return, so that B's own MAGI sits under B's 400% line.
const TWO_A = { ...TWO, pensionCoverage: 'a', pensionYearlyA: 60000, pensionYearlyB: 0 };
const UNDER_400 = { id: 'aca400', ret: 'H', side: 'under' };
const FELL = 'your bracket (target not reachable this year)';

// A fresh world with sizing on (unless `sizingOn` is false) and the state set; `run(conv, opts)` is one `apply` run of the 22%
// plan with that `conv`; `stats()` reads the sizing counters.
async function setup(patch, { sizingOn = true, before = null } = {}) {
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = !sizingOn;
  if (before) await before(w);
  await w.setState(patch);
  const { makePlan } = await w.load('us/core/cliff-plan/plan-shape.js');
  const { planStats } = await w.load('us/core/projection/engine-state.js');
  const P = await usPlan(w);
  const run = (conv, opts = {}) => P.runPlanMode({ planMode: 'apply', plan: makePlan({ bracket: 22, bracketFrom: 22, conv }), ...opts }).rows;
  const stats = () => [planStats.convYears, planStats.convApplied, planStats.convFellBack];
  return { w, P, makePlan, run, stats };
}
const since = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
const strip = (rows) => rows.map(({ convChoice, ...r }) => r);
const allAges = (from, to, target) => {
  const m = {};
  for (let a = from; a <= to; a++) m[a] = target;
  return m;
};

it('(a) conv: null is the plan without conv (shape only), and sizes nothing', async () => {
  const { P, makePlan, run, stats } = await setup(TX);
  const s0 = stats();
  const dflt = P.runPlanMode({ planMode: 'apply', plan: makePlan({ bracket: 22, bracketFrom: 22 }) }).rows;
  const explicit = run(null);
  c.expect(explicit).toStrictEqual(dflt);
  c.expect(explicit.some((r) => 'convChoice' in r)).toBe(false);
  c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
});

it("(b) a 'none' target at 57 converts nothing that year; the years before are the unsized run's", async () => {
  const { run } = await setup(TX);
  const unsized = run(null),
    rows = run({ 57: 'none' });
  c.expect(unsized[2].age).toBe(57);
  c.expect(unsized[2].conversionAmount > 0).toBe(true);
  c.expect(rows[2].conversionAmount).toBe(0);
  c.expect(rows[2].convChoice).toBe('no conversion (tax-aware)');
  c.expect(rows.slice(0, 2)).toStrictEqual(unsized.slice(0, 2));
});

it("(c) a 'b12' target with the user at 22%: year 0 fills ordinary income to the 12% top, less than the 22% top", async () => {
  // Renting, so the fill's deduction is the standard deduction (the TX household's default mortgage would itemize).
  const { run } = await setup({ ...TX, tenure: 'rent' });
  const r12 = run({ 55: 'b12' })[0],
    r22 = run({ 55: 'b22' })[0];
  c.expect(r12.convChoice).toBe('the top of the 12% bracket');
  c.expect(r12.conversionAmount > 0).toBe(true);
  c.expect(r12.conversionAmount < r22.conversionAmount).toBe(true);
  // ordinary income (the conversion and the other ordinary income) at most the 12% top (50,400 x factor 1) + 16,100
  c.expect(r12.conversionAmount <= 50400 + 16100).toBe(true);
  // the row's MAGI: that, plus at most the year's taxable draws (the gains and the qualified dividends are within them)
  c.expect(r12.magiProxy <= 50400 + 16100 + r12.taxableWithdrawn).toBe(true);
  c.expect(r22.conversionAmount <= 105700 + 16100).toBe(true);
});

it('(d) under the ACA 400% line at 57 (year 2): carried, the MAGI below the line, counted applied', async () => {
  const { run, stats } = await setup(TX);
  const s0 = stats();
  const rows = run({ 57: UNDER_400 });
  c.expect(since(s0, stats())).toStrictEqual([1, 1, 0]);
  c.expect(rows[2].convChoice).toBe('just under the ACA 400% line');
  // the line: 62,600 x 1.025^2 = 65,769.125
  c.expect(rows[2].magiProxy < 65769.125).toBe(true);
  c.expect(rows[2].conversionAmount > 0).toBe(true);
});

it('(e) the same target at 55, whose MAGI without a conversion is over the line: the unsized conversion, counted fallen back', async () => {
  const { run, stats } = await setup(TX);
  const unsized = run(null);
  const s0 = stats();
  const rows = run({ 55: UNDER_400 });
  c.expect(since(s0, stats())).toStrictEqual([1, 0, 1]);
  c.expect(unsized[0].magiProxy > 62600).toBe(true);
  c.expect(rows[0].convChoice).toBe(FELL);
  c.expect(rows[0].conversionAmount).toBe(unsized[0].conversionAmount);
  c.expect(strip(rows)).toStrictEqual(unsized);
});

it('(f) exempt ages: an optimizer bracket at the age, or an applied schedule holding it, ignores the target', async () => {
  // the optimizer's per-age bracket (optimizerState.rothBracketByAge, read when the context is built)
  {
    const { run, stats } = await setup(TX, { before: async (w) => { (await w.load('us/core/optimizer-state.js')).optimizerState.rothBracketByAge = new Map([[57, 12]]); } });
    const ref = run(null);
    const s0 = stats();
    const rows = run({ 57: UNDER_400 });
    c.expect(rows).toStrictEqual(ref);
    c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
  }
  // the applied schedule
  {
    const { run, stats } = await setup({ ...TX, appliedRothSchedule: { 57: 12 } });
    const ref = run(null);
    const s0 = stats();
    const rows = run({ 57: UNDER_400 });
    c.expect(rows).toStrictEqual(ref);
    c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
  }
});

it('(g) the switch off: a plan with targets is the conv: null run', async () => {
  const { run, stats } = await setup(TX, { sizingOn: false });
  const ref = run(null);
  const s0 = stats();
  const rows = run(allAges(55, 74, UNDER_400));
  c.expect(rows).toStrictEqual(ref);
  c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
});

it("(h) a two-return year's per-return target: B's own MAGI below B's own line; not carried where B is already over it", async () => {
  const UNDER_B = { id: 'aca400', ret: 'B', side: 'under' };
  // the pension on A: B's return is under its line, and the target sizes on B's share
  {
    const { run, stats } = await setup(TWO_A);
    const s0 = stats();
    const rows = run({ 60: UNDER_B });
    c.expect(since(s0, stats())).toStrictEqual([1, 1, 0]);
    c.expect(rows[0].convChoice).toBe("just under the ACA 400% line (Partner B's return)");
    c.expect(rows[0].conversionAmount > 0).toBe(true);
    // B's own line: a household of one, 15,650 x 4 at year 0
    c.expect(rows[0].magiB < 62600).toBe(true);
  }
  // the yardstick couple: B's pension already puts B's return over B's line, so the year converts the user's bracket
  {
    const { run, stats } = await setup(TWO);
    const unsized = run(null);
    const s0 = stats();
    const rows = run({ 60: UNDER_B });
    c.expect(since(s0, stats())).toStrictEqual([1, 0, 1]);
    c.expect(unsized[0].magiB > 62600).toBe(true);
    c.expect(rows[0].convChoice).toBe(FELL);
    // the kept pass converts what the unsized year converts (the year's other doubles may differ in the last digits: its first
    // passes, at lower estimates of B's MAGI, still found B's line and sized to it before the iteration settled over it)
    c.expect(rows[0].conversionAmount).toBe(unsized[0].conversionAmount);
  }
});

it('(i) a historical path (real 1966): the target re-sized on the path; under the line where carried, the bracket where not', async () => {
  const { P, run, stats } = await setup(TX);
  const rowFn = () => P.rowFnFor({ type: 'real', start: 1966 });
  const s0 = stats();
  const rows = run(allAges(55, 74, UNDER_400), { rowFn: rowFn() });
  const d = since(s0, stats());
  let carried = 0,
    fell = 0,
    below = 0;
  for (const r of rows) {
    if (r.convChoice === 'just under the ACA 400% line') {
      carried++;
      // the year's line on the path: 15,650 x 4 at the path's own tax factor (cumFactor)
      if (r.magiProxy < 15650 * r.cumFactor * 4) below++;
    } else if (r.convChoice === FELL) fell++;
  }
  c.expect(carried > 0).toBe(true);
  c.expect(fell > 0).toBe(true);
  c.expect(below).toBe(carried);
  c.expect(carried + fell).toBe(20);
  c.expect(d).toStrictEqual([20, carried, fell]);
  // the years that cannot carry it (62 on, over the line or on Medicare): targets there only are the unsized path, year for year
  const unsized = run(null, { rowFn: rowFn() }),
    late = run(allAges(62, 74, UNDER_400), { rowFn: rowFn() });
  c.expect(late.filter((r) => r.age >= 62 && r.age <= 74).every((r) => r.convChoice === FELL)).toBe(true);
  c.expect(strip(late)).toStrictEqual(unsized);
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(44);
});
