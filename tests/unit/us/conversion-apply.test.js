// `apply` following the plan's conversion targets (Batch 5 step 5b piece 3, spec B6, Task 1): a null `conv`, a 'none' and a
// bracket target, a household line carried and not carried, the exempt ages, the switch, a per-return line and a historical path.
// Each case compares runs in one process; the hand literals are the 2026 single figures (12% top 50,400, standard deduction
// 16,100) and the 400% FPL line (15,650 x 4 = 62,600 at year 0, times the year's tax factor).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { usPlan } from '../helpers/us-plan.js';
import { makeCounter } from '../helpers/count.js';
import { createRequire } from 'node:module';
import { GAP_CASES, legacyToAccounts } from '../helpers/scan-grid.mjs';

const require = createRequire(import.meta.url);

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
const FELL = 'the bracket conversion (target not reachable this year)';

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

it('(f) exempt ages: a bracket map holding the age (the flat-bracket card pinning), or the yardstick amount map, ignores the target', async () => {
  // the optimizer's per-age bracket (optimizerState.rothBracketByAge, read when the context is built)
  {
    const { run, stats } = await setup(TX, { before: async (w) => { (await w.load('us/core/optimizer-state.js')).optimizerState.rothBracketByAge = new Map([[57, 12]]); } });
    const ref = run(null);
    const s0 = stats();
    const rows = run({ 57: UNDER_400 });
    c.expect(rows).toStrictEqual(ref);
    c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
  }
  // the yardstick's amount map (ctx.overrides.rothAmountByAge, test-only: the store's overrides literal never carries it, so it is
  // set on the context's own overrides object, as the yardstick's contexts carry it)
  {
    const { w, makePlan, stats } = await setup(TX);
    const { runProjection } = await w.load('us/core/projection/run-projection.js');
    const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
    const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
    const state = (await w.load('shared/core/store.js')).state;
    const runAmounts = async (conv) => {
      const ctx = await w.ctx({ planMode: 'apply', plan: makePlan({ bracket: 22, bracketFrom: 22, conv }) });
      ctx.overrides.rothAmountByAge = new Map([[57, 1000]]);
      return runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB }).rows;
    };
    const ref = await runAmounts(null);
    const s0 = stats();
    const rows = await runAmounts({ 57: UNDER_400 });
    c.expect(rows).toStrictEqual(ref);
    c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
    c.expect(rows[2].conversionAmount).toBe(1000);
  }
});

it('(j) a line target above preMagi + the convertible balance converts the whole convertible balance (capped, carried)', async () => {
  // The TX single at 63 with 50,000 of traditional: IRMAA tier 5's line (charged at 65) is far above the year's MAGI plus 50,000.
  const SMALL = { ...TX, ageA: 63, retireAgeA: 63, rothConvStartAge: 63, ...legacyToAccounts({ traditional: 50000, roth: 100000 }, { singlePerson: true }) };
  const { run, stats } = await setup(SMALL);
  const s0 = stats();
  const rows = run({ 63: { id: 'irmaa5', ret: 'H', side: 'under' } });
  c.expect(since(s0, stats())).toStrictEqual([1, 1, 0]);
  c.expect(rows[0].convChoice).toBe('just under IRMAA tier 5');
  // the 35% top is also capped at the convertible balance (solveRothConversionTop returns maxAvailable when it is below the top)
  const top = run({ 63: 'b35' });
  c.expect(rows[0].conversionAmount > 0).toBe(true);
  c.expect(rows[0].conversionAmount).toBe(top[0].conversionAmount);
  // everything convertible converted: no traditional left at the year's end
  c.expect(rows[0].traditional).toBe(0);
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

// (k) B0.11.10: tests/snapshot.js's `std R everything` (its patch over the defaults, the legacy balances converted). Its sized
// year at Partner A's 60 did not converge before S1 (the conversion moves against the draw) and ended in the forced pass, whose
// logged passes all tie at an overpay of 0; since S1's secant step it converges, and the boom path's year carries the forced case. The pick is the pass nearest the fixed point, not the seed pass (estimate 0, which converted
// the whole 22% fill on top of the draw): the year's traditional income (draw + conversion) stays within the fill to the 22% top
// with no draw below it, as the engine's own solveRothConversionTop computes it from the year's profile.
it('(k) the forced pick in a sized year (B0.11.10): std R everything at 60 stays within the 22% top', async () => {
  const { scenarios } = require('../../snapshot_scenarios.js');
  const sc = scenarios(true).find((s) => s.name === 'std R everything');
  const w = await world();
  (await w.load('us/core/test-hooks.js')).testHooks.testConvSizingOff = false;
  const base = await w.setState({});
  const state = await w.setState({ ...JSON.parse(JSON.stringify(base)), ...legacyToAccounts(sc.patch, base) });
  const { computeCliffPlan, runProjection } = await w.load('us/core/projection/run-projection.js');
  const { STANDARD_MODE } = await w.load('us/core/projection/year-modes.js');
  const { standardYearSource } = await w.load('shared/core/projection/year-sources.js');
  const { solveRothConversionTop } = await w.load('us/core/withdrawals/roth-conversion.js');
  const { plan } = computeCliffPlan(await w.ctx());
  c.expect(plan.conv).toStrictEqual({ 60: 'b22' });
  const ctx = await w.ctx({ planMode: 'apply', plan });
  const trace = [];
  const sim = runProjection(ctx, { mode: STANDARD_MODE, source: standardYearSource(state), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, trace });
  const i = sim.rows.findIndex((r) => r.age === 60);
  const row = sim.rows[i], t = trace[i];
  c.expect(row.convChoice).toBe('the top of the 22% bracket');
  // S1 secant step (Task 2c option Y): this year now converges (6 passes) instead of ending forced; the forced pick is pinned
  // on the same household's boom path below, where the year is still forced
  c.expect(t.forcedPass).toBe(false);
  c.expect(row.conversionAmount > 0).toBe(true);
  const fill = solveRothConversionTop(ctx, t.profile, 4e6, row.year, 22, 0);
  c.expect(fill > row.conversionAmount).toBe(true);
  // ends at the fill, not beyond it by more than $1,000 (the seed pass overshot it by about 184k)
  c.expect(Math.abs(row.traditionalWithdrawn + row.conversionAmount - fill) <= 1000).toBe(true);
  // The forced pick itself, on tests/snapshot.js's `hist R everything | boom` (the same plan applied on the boom path, as the
  // snapshot runs it): the sized year at 60 does not converge in 8 passes, every logged pass ties at an overpay of 0, and the
  // pick is the smallest-drift pass, not the seed pass.
  const { BUCKET_MODE } = await w.load('us/core/projection/year-modes.js');
  const { historicalYearSource } = await w.load('shared/core/projection/year-sources.js');
  const P = await usPlan(w);
  const hctx = await w.ctx({ planMode: 'apply', plan, taxFactors: [] });
  const htrace = [];
  const hsim = runProjection(hctx, { mode: BUCKET_MODE, source: historicalYearSource(state, P.rowFnFor({ type: 'boom' }), hctx.taxFactors), retireAgeA: state.retireAgeA, retireAgeB: state.retireAgeB, trace: htrace });
  const hi = hsim.rows.findIndex((r) => r.age === 60);
  const hrow = hsim.rows[hi], ht = htrace[hi];
  c.expect(hrow.convChoice).toBe('the top of the 22% bracket');
  c.expect(ht.forcedPass).toBe(true);
  c.expect(hrow.conversionAmount > 0).toBe(true);
  const hfill = solveRothConversionTop(hctx, ht.profile, 4e6, hrow.year, 22, 0);
  c.expect(hfill > hrow.conversionAmount).toBe(true);
  c.expect(Math.abs(hrow.traditionalWithdrawn + hrow.conversionAmount - hfill) <= 1000).toBe(true);
  let best = 0;
  for (let k = 1; k < ht.passLog.length; k++) if (ht.passLog[k].drift < ht.passLog[best].drift) best = k;
  c.expect(ht.picked).toBe(best);
  c.expect(ht.picked > 0).toBe(true);
});

// (l) R5 I-1: a plan's targets are honoured only for the bracket setting it was made for (`bracketFrom`), as its bracket is
// (solveRothConversion): a variant at another setting (the flat-bracket card's trials) runs unsized, the same plan on its own
// setting follows them.
it('(l) a sized plan made for 22% on a variant at 12% sizes nothing; on the 22% setting it follows plan.conv', async () => {
  const targets = allAges(55, 74, UNDER_400);
  {
    const { P, makePlan, run, stats } = await setup({ ...TX, rothConvBracket: 12 });
    const unsized = run(null);
    const s0 = stats();
    const rows = P.runPlanMode({ planMode: 'apply', plan: makePlan({ bracket: 22, bracketFrom: 22, conv: targets }) }).rows;
    c.expect(rows).toStrictEqual(unsized);
    c.expect(since(s0, stats())).toStrictEqual([0, 0, 0]);
    // the 12% run converts (the case is not vacuous)
    c.expect(unsized.some((r) => r.conversionAmount > 0)).toBe(true);
  }
  {
    const { run, stats } = await setup(TX);
    const unsized = run(null);
    const s0 = stats();
    const rows = run(targets);
    c.expect(since(s0, stats())[0]).toBe(20);
    c.expect(rows.some((r) => r.convChoice === 'just under the ACA 400% line')).toBe(true);
    c.expect(strip(rows)).not.toStrictEqual(unsized);
  }
});

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  // 69: the forced pick moved to the boom path in S1 (Task 4) adds 7 checks to (k)
  expect(c.total).toBe(69);
});
