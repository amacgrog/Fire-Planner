// The order-only floor of the both-levers plan (US, Batch 5 step 4d, Task 8; owner, 2026-10-26): with both levers on
// (PLAN_LEVERS), when some bracket's lever `choose` recorded a split, computeCliffPlan also plans the order lever alone (4c's
// planning, `levers: { order: true, split: false }`) and keeps the joint plan only by leverPlanStands against it; otherwise the
// plan and report are the order-only track's (`plan.levers` the caller's copy, `report.leverTrack` 'order'). The households are
// rows of the scan grid (scan-grid.mjs). The sweep over the grid's two-return households (both modes) runs only with
// FIRE_SPLIT_FLOOR_SWEEP=1 (a full-budget suite).
import { it, expect, afterAll } from 'vitest';
import { world } from '../helpers/world.js';
import { makeCounter } from '../helpers/count.js';
import { scanHouseholds } from '../helpers/scan-grid.mjs';

const NEW_COUNT = 45;
const c = makeCounter();
afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

const BOTH = { order: true, split: true };
const ORDER = { order: true, split: false };
const SWEEP = process.env.FIRE_SPLIT_FLOOR_SWEEP === '1';
// a grid household of one withdrawal mode, toggle on (the withdrawal toggle turns on PLAN_LEVERS)
const grid = (mode, filing, age, trad, taxable, spending, elections, conv) => {
  const h = scanHouseholds({ mode, conversions: conv }).find((x) => x.g.filing === filing && x.g.age === age && x.g.trad === trad && x.g.taxable === taxable && x.g.spending === spending && x.g.elections === elections);
  return { ...h.patch, withdrawalMixEnabled: true };
};
// the toggle-on plan (levers null: PLAN_LEVERS) and the order-only plan of one household, in one world, with the order-only
// track count of the toggle-on call
async function plans(patch) {
  const w = await world();
  await w.setState(patch);
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const { planCandidateBetter } = await w.load('us/core/cliff-plan/solver.js');
  const { planStats } = await w.load('us/core/projection/engine-state.js');
  const ctx = await w.ctx();
  const t0 = planStats.orderTracks;
  const both = computeCliffPlan(ctx);
  const tracks = planStats.orderTracks - t0;
  const ord = computeCliffPlan(ctx, { levers: ORDER });
  return { w, ctx, computeCliffPlan, planCandidateBetter, planStats, both, ord, tracks };
}
// the kept candidate of a report as planCandidateBetter reads it (the endValue objective: the score is the value)
const kept = (r) => {
  const k = r.candidates[r.keptIndex];
  return { depletedAge: k.depletedAge, homeDrawAge: k.homeDrawAge, score: k.value, n: k.intents + k.orders + k.splits };
};

// (i) The order lever alone keeps a better plan than the joint choose's: the toggle-on plan is the order-only plan.
for (const [name, patch] of [
  // Task 7's worst household (-281,578 nominal before the floor): 4c keeps orders at 60-64, the joint plan none
  ['smooth, two returns, 52, 750k+750k, taxable 2M, 130k, SEPP, conversions on', grid('smooth', 'single-couple', 52, 1500000, 2000000, 130000, 'sepp', true)],
  // Fable's p2 / p3 household: 4c keeps nine orders, the joint plan none
  ['smooth, two returns, 62, 750k+750k, taxable 2M, 130k, no elections, conversions off', grid('smooth', 'single-couple', 62, 1500000, 2000000, 130000, 'none', false)],
])
  it(`the order-only track wins: ${name}`, async () => {
    const { both, ord, tracks } = await plans(patch);
    c.expect(tracks).toBe(1);
    c.expect(both.report.leverTrack).toBe('order');
    // the plan is the order-only planning's, with the caller's levers (a copy) and no split
    c.expect(both.plan).toStrictEqual({ ...ord.plan, levers: { ...BOTH } });
    c.expect(both.plan.splits).toBe(null);
    c.expect(both.plan.orders !== null).toBe(true);
    c.expect(both.report).toStrictEqual({ ...ord.report, leverTrack: 'order' });
    c.expect(both.report.keptSplits).toBe(0);
    c.expect('leverTrack' in ord.report).toBe(false);
  });

// (ii) The joint plan beats the order lever alone (Fable: +89,377 nominal, 4 splits): it stands.
it('the joint track wins: default, two returns, 58, 750k+750k, taxable 2M, 130k, Rule of 55, conversions off', async () => {
  const { both, ord, tracks, planCandidateBetter } = await plans(grid('default', 'single-couple', 58, 1500000, 2000000, 130000, 'rule55', false));
  c.expect(tracks).toBe(1);
  c.expect(both.report.leverTrack).toBe('joint');
  c.expect(both.plan.splits !== null).toBe(true);
  c.expect(both.report.keptSplits).toBe(Object.keys(both.plan.splits).length);
  c.expect(both.plan.levers).toStrictEqual(BOTH);
  c.expect(planCandidateBetter(kept(both.report), kept(ord.report))).toBe(true);
  c.expect(kept(both.report).score - kept(ord.report).score > 80000).toBe(true);
});

// (iii) Identity: no split recorded at any bracket (no second track), a one-return household and toggle off.
for (const [name, patch] of [
  ['default, two returns, 52, 250k+250k, taxable 300k, 60k, no elections, conversions off', grid('default', 'single-couple', 52, 500000, 300000, 60000, 'none', false)],
  // conversions on: the bracket search runs, and no bracket's lever choose records a split
  ['default, two returns, 52, 250k+250k, taxable 300k, 60k, no elections, conversions on', grid('default', 'single-couple', 52, 500000, 300000, 60000, 'none', true)],
  ['one return (MFJ), 58, 750k+750k, taxable 2M, 130k, Rule of 55, conversions on', grid('default', 'mfj', 58, 1500000, 2000000, 130000, 'rule55', true)],
])
  it(`no split recorded, no second track: ${name}`, async () => {
    const { both, ord, tracks } = await plans(patch);
    c.expect(tracks).toBe(0);
    c.expect('leverTrack' in both.report).toBe(false);
    c.expect(both.plan).toStrictEqual({ ...ord.plan, levers: { ...BOTH } });
    c.expect(both.report).toStrictEqual(ord.report);
  });

it('toggle off and both levers off: no levers, no second track', async () => {
  const { computeCliffPlan, ctx, planStats } = await plans({ ...grid('default', 'single-couple', 58, 1500000, 2000000, 130000, 'rule55', false), withdrawalMixEnabled: false });
  const t0 = planStats.orderTracks;
  const off = computeCliffPlan(ctx),
    leversOff = computeCliffPlan(ctx, { levers: { order: false, split: false } }),
    split = computeCliffPlan(ctx, { levers: { order: false, split: true } });
  c.expect(planStats.orderTracks - t0).toBe(0);
  c.expect(leversOff).toStrictEqual(off);
  c.expect([off.plan.levers, 'leverTrack' in off.report, 'leverTrack' in split.report]).toStrictEqual([null, false, false]);
});

// The caller's offMemo is shared by both tracks: the second track adds no `off` run to it and reads the very measures.
it('offMemo: the order-only track reuses the joint track entries', async () => {
  const { computeCliffPlan, ctx } = await plans(grid('smooth', 'single-couple', 52, 1500000, 2000000, 130000, 'sepp', true));
  const memo = new Map();
  const withMemo = computeCliffPlan(ctx, { offMemo: memo });
  const without = computeCliffPlan(ctx);
  c.expect(withMemo).toStrictEqual(without);
  c.expect(memo.size).toBe(6);
  const off = withMemo.report.candidates[0];
  c.expect([off.family, off.orders, off.splits]).toStrictEqual(['none', 0, 0]);
});

// D9 amendment (Task 5 review minor 1): a top with splits and no orders gets no "no orders" stage-2 try (it would re-run the
// top's own plan), so no two lever candidates of the kept bracket are the same plan.
it('stage 2: a top with splits and no orders is not re-run as its own no-orders try', async () => {
  // default, two returns, 52, 250k+250k, taxable 2M, 130k, no elections, conversions off: the lever run records a split, no order
  const { both } = await plans(grid('default', 'single-couple', 52, 500000, 2000000, 130000, 'none', false));
  const cands = both.report.candidates;
  const lever = cands.filter((x) => x.splits > 0 || x.orders > 0);
  c.expect(lever.length > 0 && lever.every((x) => x.orders === 0)).toBe(true);
  const key = (x) => JSON.stringify([x.family, x.intents, x.orders, x.splits, x.value, x.cost]);
  c.expect(new Set(lever.map(key)).size).toBe(lever.length);
});

// (iv) The sweep: over the scan grid's two-return households in both withdrawal modes, the toggle-on plan's kept candidate is
// never beaten by the order-only plan's (planCandidateBetter).
it.runIf(SWEEP)('sweep: the order-only plan never beats the toggle-on plan (192 two-return households x 2 modes)', async () => {
  const w = await world();
  const { computeCliffPlan } = await w.load('us/core/projection/run-projection.js');
  const { planCandidateBetter } = await w.load('us/core/cliff-plan/solver.js');
  const below = [];
  let n = 0;
  const t0 = performance.now();
  for (const mode of ['default', 'smooth'])
    for (const h of scanHouseholds({ mode }).filter((x) => x.g.filing === 'single-couple')) {
      await w.setState({ ...h.patch, withdrawalMixEnabled: true });
      const ctx = await w.ctx();
      const memo = new Map();
      const both = computeCliffPlan(ctx, { offMemo: memo }),
        ord = computeCliffPlan(ctx, { levers: ORDER, offMemo: memo });
      n++;
      if (planCandidateBetter(kept(ord.report), kept(both.report))) below.push(`${mode} ${h.name}`);
    }
  console.log(`split-order-floor sweep: ${n} household-modes, ${below.length} below the order-only plan, ${Math.round(performance.now() - t0)} ms`);
  c.expect(n).toBe(384);
  c.expect(below).toStrictEqual([]);
}, 3600000);
