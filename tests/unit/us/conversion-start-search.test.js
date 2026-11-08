// The conversion start-age search (plan 2026-11-08-conversion-start-search.md): with rothConvStartSearch 'quick' or 'thorough',
// computeCliffPlan's sizing block also runs the sizing pass's walk from later start ages inside the window (the proposal a `choose`
// run with rothConvStartAge at that age, 'none' at every sizable age before it), keeping a start only by bracketCandidateBetter
// over the plan the block ends on with 'off'. `H` is household H, a made-up household (tests/unit/helpers/start-search-household.json:
// MFJ, CT, A 36 retiring at 55, B 37 retired at 43, ACA and Medicaid on, guard and mix on, conversions at 22%, the window 48-78),
// where the wide window converts nothing with 'off' (the no-conversion candidate kept). The report (report.sized.starts), Quick's
// and Thorough's order, a kept start's summary, a window with no converting year, the exempt ages, never earlier than 'off' and
// the toggle's guarantee on 6 scan-grid households and H, a market scenario reaching every start (its kept plan priced through
// runSourceFor), and Optimize's one search. Engine outputs are compared between runs in one process.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { world } from '../helpers/world.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

const late = (x) => (x === null ? Infinity : x);
// Household H (tests/unit/helpers/start-search-household.json, also read by test_conversion_start_search.js).
const H = JSON.parse(readFileSync(new URL('../helpers/start-search-household.json', import.meta.url), 'utf8'));
// 6 default-mode scan-grid households with conversions on (every 64th of 384), plus H.
const GRID = scanHouseholds({ conversions: true, mode: 'default' }).filter((_, i) => i % 64 === 0).map((x) => [x.name, x.patch]).concat([['H', H]]);
// Market scenario (tests/unit/shared/run-source.test.js's crash shape): a 75% fall over two years and a full recovery over two.
const crashAt = (age) => ({ kind: 'crash', order: 'bucket', crashes: [{ age, drop: 75, fallYears: 2, recoverPct: 100, recoverYears: 2, inflation: 30, bondReturn: 20 }] });

// A fresh world with `patch` and rothConvStartSearch `mode` set; `before(w)` (when given) runs after the state is set and before the
// context is built (test hooks, optimizerState); `test`: fields over the context's test switches (through newRunContext). `out` is
// computeCliffPlan (search on), `k` its kept candidate, `applied(p)` p's `apply` run through runSourceFor, measured as
// computeCliffPlan measures a candidate (the endValue score is the value), with its rows.
async function planned(patch, mode, { test = null, before = null } = {}) {
  const w = await world();
  await w.setState({ ...patch, rothConvStartSearch: mode });
  if (before) await before(w);
  const { computeCliffPlan, runProjection } = await w.load('us/core/projection/run-projection.js');
  const { newRunContext } = await w.load('shared/core/projection/run-context.js');
  const { runSourceFor, pricingContextFor } = await w.load('shared/core/projection/run-source.js');
  const { US_OBJECTIVES } = await w.load('us/core/optimizer/objectives.js');
  const ctx0 = await w.ctx(),
    ctx = test ? newRunContext({ ...ctx0, test: { ...ctx0.test, ...test } }) : ctx0;
  const out = computeCliffPlan(ctx);
  const applied = (p) => {
    const at = (planMode, pl) => newRunContext({ inputs: ctx.inputs, taxYear: ctx.taxYear, taxFactors: null, plan: pl, planMode, overrides: ctx.overrides, stats: ctx.stats, test: ctx.test });
    const r = runSourceFor(at('apply', p)),
      sim = runProjection(r.ctx, { mode: r.mode, source: r.source, retireAgeA: ctx.inputs.retireAgeA, retireAgeB: ctx.inputs.retireAgeB });
    const value = US_OBJECTIVES.endValue.value(pricingContextFor(at('off', null)), sim);
    return { depletedAge: sim.depletedAge, homeDrawAge: sim.homeDrawAge, value, rows: sim.rows };
  };
  return { w, out, k: out.report.candidates[out.report.keptIndex], s: out.report.sized.starts, applied };
}
// One planning's kept candidate (its ages and value) and starts report, planned once per file and shared between the tests that
// compare the same plannings (each planning still a fresh world; only plain figures are kept, no module). Shuffle-safe: filled on
// first use.
const memo = new Map();
async function keptOf(name, patch, mode) {
  const key = name + '|' + mode + '|' + patch.withdrawalMixEnabled;
  if (!memo.has(key)) {
    const { k, s } = await planned(patch, mode);
    memo.set(key, { k: { depletedAge: k.depletedAge, homeDrawAge: k.homeDrawAge, value: k.value }, s });
  }
  return memo.get(key);
}
// Neither age of `a` earlier than `b`'s; with both equal, `a`'s value no lower.
const noWorse = (a, b, msg) => {
  expect(late(a.depletedAge) >= late(b.depletedAge), msg + ' run-out').toBe(true);
  expect(late(a.homeDrawAge) >= late(b.homeDrawAge), msg + ' home draw').toBe(true);
  if (late(a.depletedAge) === late(b.depletedAge) && late(a.homeDrawAge) === late(b.homeDrawAge)) expect(a.value >= b.value, msg + ' value').toBe(true);
};

it('off reports an empty search', async () => {
  const { s } = await planned(H, 'off');
  expect(s).toStrictEqual({ mode: 'off', ages: [], tried: [], runs: 0, kept: null });
});

it('quick finds a converting plan in the wide window', async () => {
  const off = await keptOf('H', H, 'off');
  const q = await planned(H, 'quick');
  const { s, out, k } = q;
  expect(typeof s.kept).toBe('number');
  expect(s.ages.includes(s.kept)).toBe(true);
  expect(s.mode).toBe('quick');
  for (let a = H.rothConvStartAge; a < s.kept; a++) expect(out.plan.conv[a], `none at ${a}`).toBe('none');
  const rows = q.applied(out.plan).rows;
  expect(rows.some((r) => r.age >= s.kept && r.conversionAmount > 0)).toBe(true);
  expect(late(k.depletedAge) >= late(off.k.depletedAge)).toBe(true);
  expect(late(k.homeDrawAge) >= late(off.k.homeDrawAge)).toBe(true);
  expect(k.value > off.k.value).toBe(true);
});

// The first converting age is a start when the window begins before it (2026-11-08: a window beginning in working years missed the
// plan the same window beginning at retirement found, because the start at the first converting age was skipped as a repeat of the
// pass). H's window begins in its working
// years, before its first converting age F: F is the first start tried, and the wide window ends no worse than the window that
// begins at F with the search off (the plan the wide window could not reach before). With the window beginning at F, F is the
// pass's own start, so it is not a start.
it('the first converting age is a start when the window begins before it', async () => {
  const q = await keptOf('H', H, 'quick');
  // H's wages fill the plan's bracket until Partner A retires, so its first converting age is its first retired year (the old
  // code's first start was the year after)
  const F = q.s.ages[0];
  expect(F).toBe(H.retireAgeA);
  expect(F > H.rothConvStartAge).toBe(true);
  expect(q.s.tried[0]).toBe(F);
  const narrowOff = await keptOf('H@F', { ...H, rothConvStartAge: F }, 'off');
  noWorse(q.k, narrowOff.k, 'wide quick vs narrow off');
  const narrowQ = await keptOf('H@F', { ...H, rothConvStartAge: F }, 'quick');
  expect(narrowQ.s.ages.includes(F)).toBe(false);
});

// A kept start converts, so the report does not say the no-conversion candidate is the plan (H's 'off' planning keeps it) and the
// summary prints the per-age list, not "Conversions: none".
it('a kept start clears noConvKept', async () => {
  const off = await planned(H, 'off');
  expect(off.out.report.sized.noConvKept).toBe(true);
  const q = await planned(H, 'quick');
  expect(typeof q.s.kept).toBe('number');
  expect(q.out.report.sized.noConvKept).toBe(false);
  const { cliffPlanSummary } = await q.w.load('us/core/cliff-plan/planning.js');
  const text = cliffPlanSummary(q.out.plan, q.out.report);
  expect(text.includes('Conversions: none'), text).toBe(false);
  expect(text.includes('none at '), text).toBe(true);
  expect(text.includes('Conversion start ages searched: starting at ' + q.s.kept + ' did best.'), text).toBe(true);
});

it("quick tries every third age, then the best one's neighbours", async () => {
  const { s } = await keptOf('H', H, 'quick');
  const coarse = s.ages.filter((_, i) => i % 3 === 0),
    n = coarse.length;
  expect(n > 0).toBe(true);
  expect(s.tried.slice(0, n)).toStrictEqual(coarse);
  const rest = s.tried.slice(n);
  expect(rest.length <= 2).toBe(true);
  expect(new Set(s.tried).size).toBe(s.tried.length);
  const idx = rest.map((a) => s.ages.indexOf(a));
  for (const i of idx) expect(i >= 0 && i % 3 !== 0).toBe(true);
  // one coarse age (index j, a multiple of 3) has every one of them next to it
  const js = s.ages.map((_, j) => j).filter((j) => j % 3 === 0 && idx.every((i) => i === j - 1 || i === j + 1));
  expect(js.length > 0).toBe(true);
});

it("thorough tries quick's starts first and is no worse", async () => {
  const q = await keptOf('H', H, 'quick');
  const t = await planned(H, 'thorough');
  expect(t.s.mode).toBe('thorough');
  expect(t.s.ages).toStrictEqual(q.s.ages);
  expect(t.s.tried.slice(0, q.s.tried.length)).toStrictEqual(q.s.tried);
  expect(t.s.tried.length <= 16).toBe(true);
  expect(t.s.tried.length > q.s.tried.length).toBe(true);
  noWorse(t.k, q.k, 'thorough against quick');
});

it('no converting ages: nothing tried', async () => {
  const opts = { before: async (w) => { (await w.load('us/core/test-hooks.js')).testHooks.testBracketSearchOff = true; } };
  const patch = { ...H, rothConvBracket: 10, rothConvEndAge: H.retireAgeA - 1 };
  const off = await planned(patch, 'off', opts);
  // precondition: the off plan converts 0 at every age of the window (48-54, A's working years: the kept bracket is 10, which
  // fills nothing while working)
  const rows = off.applied(off.out.plan).rows;
  for (let a = H.rothConvStartAge; a <= H.retireAgeA - 1; a++) expect(rows.find((r) => r.age === a).conversionAmount, `age ${a}`).toBe(0);
  const q = await planned(patch, 'quick', opts);
  expect(q.s.ages).toStrictEqual([]);
  expect(q.s.tried).toStrictEqual([]);
  expect(q.s.runs).toBe(1);
  expect(q.s.kept).toBe(null);
  expect(q.out.plan).toStrictEqual(off.out.plan);
});

it('exempt ages are left alone', async () => {
  const { s, out } = await planned(H, 'quick', { before: async (w) => { (await w.load('us/core/optimizer-state.js')).optimizerState.rothBracketByAge = new Map([[59, 12]]); } });
  expect(s.ages.length > 0).toBe(true);
  expect(s.ages.includes(59)).toBe(false);
  expect((out.plan.conv ?? {})[59]).toBe(undefined);
});

it('never earlier than off', async () => {
  for (const [name, patch] of GRID) {
    const off = await keptOf(name, patch, 'off');
    const q = await keptOf(name, patch, 'quick');
    noWorse(q.k, off.k, name);
  }
});

it('the toggle keeps its guarantee', async () => {
  for (const [name, patch] of GRID) {
    const on = await keptOf(name, { ...patch, withdrawalMixEnabled: true }, 'quick');
    const offT = await keptOf(name, { ...patch, withdrawalMixEnabled: false }, 'quick');
    expect(late(on.k.depletedAge) >= late(offT.k.depletedAge), name + ' run-out').toBe(true);
    expect(late(on.k.homeDrawAge) >= late(offT.k.homeDrawAge), name + ' home draw').toBe(true);
  }
});

// The toggle's check (review round 1): ctx.test.startCheck forces its branches on H with the mix on (no household of the grid or
// of 24 variants of the original test household reaches them: there toggle off's pass never runs on its own while a start is kept). 'drop': toggle on's start
// does not stand and its 'off' end stands, so the plan is the 'off' planning's; 'revert': neither stands, so the plan is toggle
// off's searched one (a start kept), never earlier than the 'off' planning on either age.
it("the toggle's check drops toggle on's start first", async () => {
  const off = await planned(H, 'off');
  const d = await planned(H, 'quick', { test: { startCheck: 'drop' } });
  expect(d.s.tried.length > 0).toBe(true);
  expect(d.s.kept).toBe(null);
  expect(d.out.plan).toStrictEqual(off.out.plan);
  expect(d.k).toStrictEqual(off.k);
  const r = await planned(H, 'quick', { test: { startCheck: 'revert' } });
  expect(r.s.kept !== null).toBe(true);
  expect(r.s.ages.includes(r.s.kept)).toBe(true);
  noWorse(r.k, off.k, 'revert against off');
  expect(r.out.report.sized.noConvKept).toBe(false);
  expect(Object.keys(r.out.report.sized)).toStrictEqual(Object.keys(off.out.report.sized));
});

it('a market scenario reaches every start', async () => {
  const q = await planned({ ...H, marketScenario: crashAt(63) }, 'quick');
  expect(q.w.country).toBe('us');
  expect(q.out.plan !== null).toBe(true);
  expect(q.s.kept !== null).toBe(true);
  // the kept candidate is the kept plan's one apply run through runSourceFor, priced under the scenario's context
  const m = q.applied(q.out.plan);
  expect(q.k.value).toBe(m.value);
  expect(q.k.depletedAge).toBe(m.depletedAge);
  expect(q.k.homeDrawAge).toBe(m.homeDrawAge);
});

it('Optimize searches once', async () => {
  const w = await world();
  await w.setState({ ...H, rothConvStartSearch: 'quick' });
  (await w.load('us/core/test-hooks.js')).testHooks.sizedTrials = 1;
  const { planStats } = await w.load('us/core/projection/engine-state.js');
  const { optimizePlan } = await w.load('us/core/optimizer/plan-search.js');
  const before = planStats.startSearches;
  const r = optimizePlan(await w.ctx());
  expect(r.sizedCount).toBe(1);
  expect(planStats.startSearches - before).toBe(1);
});
