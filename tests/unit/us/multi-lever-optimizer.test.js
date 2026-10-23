// The multi-lever withdrawal and conversion optimizer (optimizeMultiLever, src/us/core/optimizer/multi-lever.js): the
// per-year Roth lever, the per-year withdrawal-mix lever (withdrawalMixWeights, WITHDRAWAL_MIX_CANDIDATES) and the
// household-wide smoothed-withdrawals A/B. This file: the mix weights, a forced mix year, the guardrail, the smoothed
// A/B, the Roth-only wrapper and the search windows. Converted from test_multi_lever_optimizer.js (Playwright), which
// executed 31 checks (the page-error checks excluded): multi-lever-optimizer, -mix, -combined and -determinism.test.js
// assert 30 of them, split by run time so Vitest's forks run them in parallel; the wall-clock check ("under 15s") stays
// in the root script test_optimizer_ui.js. Each it block gets its own world (tests/unit/helpers/multi-lever.js), as
// each old block got a fresh page; the hooks re-plan the cliff plan first, as the window hooks do (usOptimizer,
// tests/unit/helpers/us-plan.js).
import { it, expect, afterAll } from 'vitest';
import { makeCounter } from '../helpers/count.js';
import { ACA_CLIFF, checks, entries, optimizerWorld } from '../helpers/multi-lever.js';

const NEW_COUNT = 23;
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
  const opt = h.optimizeMultiLever(selected, { includeMix: true });
  const notWorse = selected.depletedAge ? !opt.depletedAge || opt.depletedAge >= selected.depletedAge : !opt.depletedAge;
  check(notWorse, `selected depletes at ${selected.depletedAge}, optimized at ${opt.depletedAge}`);
}, SLOW);

it('the smoothed-withdrawals A/B tries both settings and picks the cheaper', async () => {
  const { h, st } = await optimizerWorld({ rothConvStartAge: 55, rothConvEndAge: 55 });
  const selected = h.simulate();
  // The old script clicked the checkbox: on, off, then back to where it was.
  const wasOn = st.smoothWithdrawals;
  st.smoothWithdrawals = true;
  const onCost = h.rothScheduleCost(h.simulate());
  st.smoothWithdrawals = false;
  const offCost = h.rothScheduleCost(h.simulate());
  st.smoothWithdrawals = wasOn;
  const opt = h.optimizeMultiLever(selected, { includeSmooth: true });
  const cheaper = Math.min(onCost, offCost);
  const msg = JSON.stringify({ onCost, offCost, optCost: opt.cost, optSmooth: opt.smoothWithdrawals });
  check(Math.abs(opt.cost - cheaper) < 1, 'cost matches the cheaper of on/off: ' + msg);
  check((opt.smoothWithdrawals ? onCost : offCost) <= cheaper + 1, 'picked the setting that is cheaper: ' + msg);
});

it('optimizeRothLadderPerYear matches the general driver with only the Roth lever', async () => {
  const { h } = await optimizerWorld({ rothConvEnabled: true, rothConvStartAge: 60, rothConvEndAge: 63 });
  const selected = h.simulate();
  const viaWrapper = h.optimizeRothLadderPerYear(selected);
  const viaGeneral = h.optimizeMultiLever(selected, { includeRoth: true });
  check(Math.abs(viaWrapper.cost - viaGeneral.cost) < 1, `cost: ${viaWrapper.cost} vs ${viaGeneral.cost}`);
  sameDeep(entries(viaWrapper.schedule), entries(viaGeneral.rothSchedule), 'schedule');
});

it('no levers included: returns cleanly with no active per-year window', async () => {
  const { h } = await optimizerWorld();
  const opt = h.optimizeMultiLever(h.simulate(), {});
  check(opt.activeYears.length === 0, 'activeYears: ' + JSON.stringify(opt.activeYears));
});

it('decoupled windows: Roth searches its configured range, mix the retirement years', async () => {
  const { h } = await optimizerWorld({
    retireAgeA: 60, retireAgeB: 62, lifeExpectancyA: 75, lifeExpectancyB: 75, rothConvStartAge: 60, rothConvEndAge: 62,
  });
  const opt = h.optimizeMultiLever(h.simulate(), { includeRoth: true, includeMix: true });
  sameDeep(opt.rothYears, [60, 61, 62], 'Roth lever searches only its own configured range');
  // mixStartAge = min(60, 62) = 60; mixEndAge = max(75, 75) = 75 -> ages 60..75.
  check(opt.mixYears.length === 16 && opt.mixYears[0] === 60 && opt.mixYears.at(-1) === 75,
    'mix window derived from retireAge/lifeExpectancy: ' + JSON.stringify(opt.mixYears));
});
