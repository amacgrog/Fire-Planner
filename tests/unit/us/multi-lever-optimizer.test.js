// The multi-lever withdrawal and conversion optimizer (optimizeMultiLever, src/us/core/optimizer/multi-lever.js): the
// per-year Roth lever, the per-year withdrawal-mix lever (withdrawalMixWeights, WITHDRAWAL_MIX_CANDIDATES) and the
// household-wide smoothed-withdrawals A/B. This file: the mix weights, a forced mix year, the guardrail, the smoothed
// A/B, the Roth-only wrapper, the search windows, the final pick (pickGuardedRun) and the objective (a required id; the
// result's score, value, gain and breakdown; the same answer in either display mode). The mechanics checks search on
// 'lifetimeCost' (the old cost's choices); the default objective is 'endValue'. Converted from test_multi_lever_optimizer.js (Playwright), which
// executed 31 checks (the page-error checks excluded): multi-lever-optimizer, -mix, -combined and -determinism.test.js
// assert 30 of them, split by run time so Vitest's forks run them in parallel; the wall-clock check ("under 15s") stays
// in the root script test_optimizer_ui.js. Each it block gets its own world (tests/unit/helpers/multi-lever.js), as
// each old block got a fresh page; the hooks re-plan the cliff plan first, as the window hooks do (usOptimizer,
// tests/unit/helpers/us-plan.js).
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { ACA_CLIFF, checks, entries, optimizerWorld } from '../helpers/multi-lever.js';

const NEW_COUNT = 31;
const c = makeCounter();
// A full-budget optimizer run takes tens of seconds, more when every file runs at once: past the 60 s default.
const SLOW = 300000;
const { check, sameDeep } = checks(c);

afterAll(({}, suite) => {
  if (suite.tasks.some((t) => t.mode === 'skip')) return;
  expect(c.total).toBe(NEW_COUNT);
});

it('withdrawalMixWeights: each fixed candidate, the proportional ones, and every split sums to 1', async () => {
  const { w } = await optimizerWorld();
  const { withdrawalMixWeights: wt } = await w.load('us/core/withdrawals/mix.js');
  const r = {
    taxable: wt('taxable', 100, 100, 100),
    traditional: wt('traditional', 100, 100, 100),
    roth: wt('roth', 100, 100, 100),
    taxTradHalf: wt('taxTradHalf', 100, 100, 100),
    thirds: wt('thirds', 100, 100, 100),
    balanced: wt('balanced', 300, 600, 100),
    smoothed: wt('smoothed', 300, 600, 100),
    zero: wt(0, 100, 100, 100),
  };
  sameDeep(r.taxable, [1, 0, 0], 'taxable-only is [1,0,0]');
  sameDeep(r.traditional, [0, 1, 0], 'traditional-only is [0,1,0]');
  sameDeep(r.roth, [0, 0, 1], 'roth-only is [0,0,1]');
  check(r.zero === null, '0 sentinel returns null (no override)');
  // balanced: pool = 300+600+100 = 1000 -> [0.3, 0.6, 0.1]
  check(Math.abs(r.balanced[0] - 0.3) < 1e-9 && Math.abs(r.balanced[1] - 0.6) < 1e-9 && Math.abs(r.balanced[2] - 0.1) < 1e-9,
    'balanced is 3-way proportional to live balances: ' + r.balanced);
  // smoothed: pool = 300+600 = 900 (roth excluded) -> [1/3, 2/3, 0]
  check(Math.abs(r.smoothed[0] - 1 / 3) < 1e-9 && Math.abs(r.smoothed[1] - 2 / 3) < 1e-9 && r.smoothed[2] === 0,
    "smoothed matches state.smoothWithdrawals' own 2-way formula (roth excluded): " + r.smoothed);
  for (const [name, v] of Object.entries(r)) {
    if (v) check(Math.abs(v[0] + v[1] + v[2] - 1) < 1e-9, `${name}'s weights sum to 1: ${v}`);
  }
});

it('forcing "roth" for one year draws mostly from Roth, and the row records the candidate', async () => {
  const { h } = await optimizerWorld(ACA_CLIFF);
  h.setWithdrawalMixOverride(new Map([[60, 'roth']]));
  const sim = h.simulate();
  h.setWithdrawalMixOverride(null);
  const row = sim.rows.find((x) => x.age === 60);
  const r = { mixCandidate: row.mixCandidate, fromTaxable: row.taxableWithdrawn, fromTraditional: row.traditionalWithdrawn - row.rmd, fromRoth: row.rothWithdrawn };
  check(r.fromRoth > r.fromTaxable && r.fromRoth > r.fromTraditional, 'draws primarily from Roth: ' + JSON.stringify(r));
  check(r.mixCandidate === 'roth', 'the row records the candidate used: ' + r.mixCandidate);
});

it('mix-only respects the depletion guardrail under stress', async () => {
  const { h } = await optimizerWorld({
    taxable: 400000, trad401kA: 200000, trad401kB: 200000, rothIraA: 50000, rothIraB: 50000, retireAgeA: 50, retireAgeB: 50,
  });
  const selected = h.simulate();
  const opt = h.optimizeMultiLever(selected, { includeMix: true }, 'lifetimeCost');
  const notWorse = selected.depletedAge ? !opt.depletedAge || opt.depletedAge >= selected.depletedAge : !opt.depletedAge;
  check(notWorse, `selected depletes at ${selected.depletedAge}, optimized at ${opt.depletedAge}`);
}, SLOW);

it('the smoothed-withdrawals A/B tries both settings and picks the cheaper', async () => {
  const { h, st } = await optimizerWorld({ rothConvStartAge: 55, rothConvEndAge: 55 });
  const selected = h.simulate();
  // The old script clicked the checkbox: on, off, then back to where it was.
  const wasOn = st.smoothWithdrawals;
  st.smoothWithdrawals = true;
  const onCost = -h.objectiveScore('lifetimeCost', h.simulate());
  st.smoothWithdrawals = false;
  const offCost = -h.objectiveScore('lifetimeCost', h.simulate());
  st.smoothWithdrawals = wasOn;
  const opt = h.optimizeMultiLever(selected, { includeSmooth: true }, 'lifetimeCost');
  const cheaper = Math.min(onCost, offCost);
  const msg = JSON.stringify({ onCost, offCost, optCost: opt.value, optSmooth: opt.smoothWithdrawals });
  check(Math.abs(opt.value - cheaper) < 1, 'cost matches the cheaper of on/off: ' + msg);
  check((opt.smoothWithdrawals ? onCost : offCost) <= cheaper + 1, 'picked the setting that is cheaper: ' + msg);
});

it('optimizeRothLadderPerYear matches the general driver with only the Roth lever', async () => {
  const { h } = await optimizerWorld({ rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 63 });
  const selected = h.simulate();
  const viaWrapper = h.optimizeRothLadderPerYear(selected, 'lifetimeCost');
  const viaGeneral = h.optimizeMultiLever(selected, { includeRoth: true }, 'lifetimeCost');
  check(Math.abs(viaWrapper.value - viaGeneral.value) < 1, `cost: ${viaWrapper.value} vs ${viaGeneral.value}`);
  sameDeep(entries(viaWrapper.schedule), entries(viaGeneral.rothSchedule), 'schedule');
});

it('no levers included: returns cleanly with no active per-year window', async () => {
  const { h } = await optimizerWorld();
  const opt = h.optimizeMultiLever(h.simulate(), {}, 'lifetimeCost');
  check(opt.activeYears.length === 0, 'activeYears: ' + JSON.stringify(opt.activeYears));
});

it('decoupled windows: Roth searches its configured range, mix the retirement years', async () => {
  const { h } = await optimizerWorld({
    retireAgeA: 60, retireAgeB: 62, lifeExpectancyA: 75, lifeExpectancyB: 75, rothConvStartAge: 60, rothConvEndAge: 62,
  });
  const opt = h.optimizeMultiLever(h.simulate(), { includeRoth: true, includeMix: true }, 'lifetimeCost');
  sameDeep(opt.rothYears, [60, 61, 62], 'Roth lever searches only its own configured range');
  // mixStartAge = min(60, 62) = 60; mixEndAge = max(75, 75) = 75 -> ages 60..75.
  check(opt.mixYears.length === 16 && opt.mixYears[0] === 60 && opt.mixYears.at(-1) === 75,
    'mix window derived from retireAge/lifeExpectancy: ' + JSON.stringify(opt.mixYears));
});

it('pickGuardedRun: the first of the tied best among the passing runs; else the latest depletion, then the best score', async () => {
  const { w } = await optimizerWorld();
  const { pickGuardedRun } = await w.load('us/core/optimizer/multi-lever.js');
  const passing = [{ id: 'a', depletedAge: null, score: 5 }, { id: 'b', depletedAge: null, score: 5 }, { id: 'c', depletedAge: 70, score: 9 }];
  check(pickGuardedRun(passing, (r) => !r.depletedAge).id === 'a', 'the first of the tied maximum among the passing runs');
  const none = [{ id: 'a', depletedAge: 70, score: 9 }, { id: 'b', depletedAge: 75, score: 1 }, { id: 'c', depletedAge: 75, score: 2 }];
  check(pickGuardedRun(none, () => false).id === 'c', 'none passes: the latest depletion, then the best score');
});

it('the objective is required: a missing or unknown id throws', async () => {
  const { w, h } = await optimizerWorld(ACA_CLIFF);
  const { optimizeMultiLever } = await w.load('us/core/optimizer/multi-lever.js');
  const { stateContextFor } = await w.load('shared/ui/results/state-context.js');
  const store = await w.load('shared/core/store.js');
  const selected = h.simulate();
  check((() => {
    try { optimizeMultiLever(selected, store.state, stateContextFor(), { includeRoth: true }, { budget: 50 }); } catch { return true; }
    return false;
  })(), 'no objective throws');
  check((() => {
    try { optimizeMultiLever(selected, store.state, stateContextFor(), { includeRoth: true }, { budget: 50, objective: 'nope' }); } catch { return true; }
    return false;
  })(), 'an unknown objective throws');
});

// The ladder on, as the trials force it, so a replay of the winning schedule reproduces the winning trial.
const ROTH2 = { ...ACA_CLIFF, rothConvEnabled: true, rothConvStartAge: 55, rothConvEndAge: 56 };

it('endValue: the same answer in nominal and in real display mode', async () => {
  const { w, h } = await optimizerWorld(ROTH2);
  const store = await w.load('shared/core/store.js');
  const pick = (o) => ({ schedule: entries(o.schedule), score: o.score, gain: o.gain, breakdown: o.breakdown });
  store.assignMode('nominal');
  const nominal = pick(h.optimizeRothLadderPerYear(h.simulate(), 'endValue'));
  store.assignMode('real');
  const real = pick(h.optimizeRothLadderPerYear(h.simulate(), 'endValue'));
  sameDeep(nominal, real, 'nominal vs real');
});

it('the result: no run and no cost; the gain is the registry gain of the replayed winner over the current plan', async () => {
  const { w, h } = await optimizerWorld(ROTH2);
  const { US_OBJECTIVES, gainInTodaysDollars } = await w.load('us/core/optimizer/objectives.js');
  const selected = h.simulate();
  const opt = h.optimizeRothLadderPerYear(selected, 'endValue');
  check(!('sim' in opt), 'no sim key');
  check(!('cost' in opt), 'no cost key');
  h.setRothOverride(opt.schedule);
  const winnerRun = h.simulate();
  h.setRothOverride(null);
  const ctx = await w.ctx();
  c.expect(opt.gain).toBe(gainInTodaysDollars(US_OBJECTIVES.endValue, ctx, winnerRun, selected));
});
